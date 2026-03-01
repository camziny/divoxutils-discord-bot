const { EmbedBuilder } = require("discord.js");
const axios = require("axios");

const CONVEX_URL = process.env.CONVEX_URL;
const APP_URL = process.env.APP_URL || "https://divoxutils.com";
const BOT_HEADERS = { headers: { "x-bot-api-key": process.env.BOT_API_KEY } };
const POLL_INTERVAL_MS = 2000;
const MOVE_CONCURRENCY = 5;
const RETRY_DELAYS_MS = [250, 750];
const PHASE_RETRY_COOLDOWN_MS = 10000;
const CONFIG_RETRY_COOLDOWN_MS = 60000;
const activePolls = new Set();
const pollIntervals = new Map();
const pollInFlight = new Set();
const draftStateCache = new Map();

function createInitialDraftState() {
  return {
    lastStatus: null,
    lastGameStarted: null,
    lastWinnerTeam: null,
    lastMovePhase: "none",
    nextTeamMoveAttemptAt: null,
    nextLobbyMoveAttemptAt: null,
  };
}

function getDraftState(shortId) {
  if (!draftStateCache.has(shortId)) {
    draftStateCache.set(shortId, createInitialDraftState());
  }

  return draftStateCache.get(shortId);
}

function isWinnerSet(value) {
  return value !== undefined && value !== null && value !== "";
}

function isTeamMoveConditionMet(data) {
  return data.status === "complete" && data.gameStarted === true && !isWinnerSet(data.winnerTeam);
}

function shouldTriggerTeamMove(prevState, data) {
  if (!isTeamMoveConditionMet(data)) return false;
  return prevState.lastMovePhase !== "moved_to_teams" && prevState.lastMovePhase !== "moved_to_lobby";
}

function shouldTriggerLobbyMove(prevState, data) {
  const winnerNowSet = isWinnerSet(data.winnerTeam);
  return winnerNowSet && prevState.lastMovePhase !== "moved_to_lobby";
}

function updateDraftState(shortId, data, movePhase) {
  const currentState = getDraftState(shortId);
  draftStateCache.set(shortId, {
    ...currentState,
    lastStatus: data.status ?? null,
    lastGameStarted: data.gameStarted ?? null,
    lastWinnerTeam: data.winnerTeam ?? null,
    lastMovePhase: movePhase || "none",
  });
}

function canAttemptMovePhase(state, phase, nowMs = Date.now()) {
  const nextAttemptAt =
    phase === "teams" ? state.nextTeamMoveAttemptAt : state.nextLobbyMoveAttemptAt;

  return nextAttemptAt === null || nowMs >= nextAttemptAt;
}

function setNextAttemptAt(state, phase, nextAttemptAt) {
  if (phase === "teams") {
    return { ...state, nextTeamMoveAttemptAt: nextAttemptAt };
  }

  return { ...state, nextLobbyMoveAttemptAt: nextAttemptAt };
}

function resolvePhaseCooldownMs(operationResult) {
  if (!operationResult) return null;
  if (operationResult.terminalConfigError) return CONFIG_RETRY_COOLDOWN_MS;
  if (operationResult.retryableFailures > 0 || operationResult.retryableError) {
    return PHASE_RETRY_COOLDOWN_MS;
  }
  return null;
}

function stopWatchingDraft(shortId) {
  const interval = pollIntervals.get(shortId);
  if (interval) {
    clearInterval(interval);
  }

  pollIntervals.delete(shortId);
  pollInFlight.delete(shortId);
  draftStateCache.delete(shortId);
  activePolls.delete(shortId);
}

function resetWatcherInternals() {
  for (const [, interval] of pollIntervals.entries()) {
    clearInterval(interval);
  }

  pollIntervals.clear();
  pollInFlight.clear();
  draftStateCache.clear();
  activePolls.clear();
}

function toErrorCode(error) {
  return (
    error?.code ??
    error?.rawError?.code ??
    error?.response?.status ??
    error?.status ??
    "unknown"
  );
}

function toErrorMessage(error) {
  if (error?.response?.data?.message) return String(error.response.data.message);
  if (error?.message) return String(error.message);
  return "unknown error";
}

function isTransientMoveError(error) {
  const status = error?.response?.status ?? error?.status ?? null;
  const code = String(error?.code ?? "");

  if ([429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  return ["ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "EAI_AGAIN"].includes(code);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWithConcurrency(items, limit, worker) {
  if (!items.length) return;

  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const nextIndex = index;
      index += 1;
      if (nextIndex >= items.length) break;
      await worker(items[nextIndex]);
    }
  });

  await Promise.all(workers);
}

function buildTeamMoveTasks(players, settings) {
  return (players || [])
    .filter((player) => Number(player.team) === 1 || Number(player.team) === 2)
    .map((player) => ({
      userId: player.discordUserId,
      displayName: player.displayName,
      targetChannelId:
        Number(player.team) === 1 ? settings.team1ChannelId : settings.team2ChannelId,
    }));
}

function buildLobbyMoveTasks(players, settings) {
  const rosteredIds = new Set((players || []).map((player) => player.discordUserId).filter(Boolean));
  return Array.from(rosteredIds).map((userId) => ({
    userId,
    targetChannelId: settings.lobbyChannelId,
  }));
}

async function fetchGuildSettings(guildId) {
  try {
    const { data } = await axios.get(
      `${CONVEX_URL}/guildSettings?discordGuildId=${guildId}`,
      BOT_HEADERS
    );
    return data;
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error;
    }
  }

  try {
    const { data } = await axios.get(`${CONVEX_URL}/guildSettings?guildId=${guildId}`, BOT_HEADERS);
    return data;
  } catch (error) {
    if (error?.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function runMoveOperation({
  guild,
  tasks,
  draftShortId,
  phase,
  allowedSourceChannelIds = null,
  maxConcurrency = MOVE_CONCURRENCY,
  retryDelaysMs = RETRY_DELAYS_MS,
}) {
  const startedAt = Date.now();
  const summary = {
    attempted: 0,
    moved: 0,
    alreadyInPlace: 0,
    failed: 0,
    retryableFailures: 0,
    durationMs: 0,
    retriesTotal: 0,
  };
  const failedMembers = [];
  const allowedSources = allowedSourceChannelIds ? new Set(allowedSourceChannelIds) : null;

  await runWithConcurrency(tasks, maxConcurrency, async (task) => {
    let member;
    try {
      member = await guild.members.fetch(task.userId);
    } catch (error) {
      const retryable = isTransientMoveError(error);
      summary.failed += 1;
      if (retryable) {
        summary.retryableFailures += 1;
      }
      failedMembers.push({
        userId: task.userId,
        code: toErrorCode(error),
        message: toErrorMessage(error),
      });
      return;
    }

    const currentChannelId = member.voice?.channelId || null;
    if (!currentChannelId) return;
    if (currentChannelId === task.targetChannelId) {
      summary.alreadyInPlace += 1;
      return;
    }
    if (allowedSources && !allowedSources.has(currentChannelId)) return;

    summary.attempted += 1;
    let retriesForMember = 0;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try {
        await member.voice.setChannel(task.targetChannelId);
        summary.moved += 1;
        summary.retriesTotal += retriesForMember;
        return;
      } catch (error) {
        const shouldRetry =
          isTransientMoveError(error) && attempt < retryDelaysMs.length;

        if (shouldRetry) {
          retriesForMember += 1;
          await sleep(retryDelaysMs[attempt]);
          continue;
        }

        summary.failed += 1;
        if (isTransientMoveError(error)) {
          summary.retryableFailures += 1;
        }
        summary.retriesTotal += retriesForMember;
        failedMembers.push({
          userId: task.userId,
          code: toErrorCode(error),
          message: toErrorMessage(error),
        });
        return;
      }
    }
  });

  summary.durationMs = Date.now() - startedAt;
  const durationMetricName =
    phase === "teams"
      ? "draft_voice_move_team_duration_ms"
      : "draft_voice_move_lobby_duration_ms";

  console.log(`[draft_voice_move] ${phase} summary`, {
    shortId: draftShortId,
    ...summary,
  });
  console.log(`[metric] ${durationMetricName}`, summary.durationMs);
  console.log("[metric] draft_voice_move_members_attempted", summary.attempted);
  console.log("[metric] draft_voice_move_members_failed", summary.failed);
  console.log("[metric] draft_voice_move_retries_total", summary.retriesTotal);

  if (failedMembers.length > 0) {
    console.error(`[draft_voice_move] ${phase} failed_members`, {
      shortId: draftShortId,
      failedMembers,
    });
  }

  return summary;
}

function watchDraft(client, shortId) {
  if (activePolls.has(shortId)) return;
  activePolls.add(shortId);
  getDraftState(shortId);

  const interval = setInterval(async () => {
    if (pollInFlight.has(shortId)) return;
    pollInFlight.add(shortId);

    try {
      const { data } = await axios.get(
        `${CONVEX_URL}/getDraftStatus?shortId=${shortId}`,
        BOT_HEADERS
      );

      if (data.status !== "setup" && !data.botPostedLink && data.discordTextChannelId) {
        await postPublicLink(client, shortId, data.discordTextChannelId);
        await axios.post(`${CONVEX_URL}/markBotPostedLink`, { shortId }, BOT_HEADERS);
      }

      if (
        data.status !== "setup" &&
        !data.botNotifiedCaptains &&
        data.team1CaptainId &&
        data.team2CaptainId
      ) {
        const { data: tokens } = await axios.get(
          `${CONVEX_URL}/getDraftTokens?shortId=${shortId}`,
          BOT_HEADERS
        );
        await dmCaptains(client, shortId, data, tokens);
        await axios.post(`${CONVEX_URL}/markBotNotifiedCaptains`, { shortId }, BOT_HEADERS);
      }

      const currentState = getDraftState(shortId);
      let nextMovePhase = currentState.lastMovePhase;
      let nextState = { ...currentState };
      const nowMs = Date.now();

      if (shouldTriggerTeamMove(currentState, data) && canAttemptMovePhase(currentState, "teams", nowMs)) {
        const teamMoveResult = await movePlayersToTeamChannels(client, shortId, data);
        if (teamMoveResult.completed) {
          nextMovePhase = "moved_to_teams";
          nextState = setNextAttemptAt(nextState, "teams", null);
        } else {
          const cooldownMs = resolvePhaseCooldownMs(teamMoveResult);
          if (cooldownMs !== null) {
            nextState = setNextAttemptAt(nextState, "teams", nowMs + cooldownMs);
          }
        }
      }

      if (shouldTriggerLobbyMove(currentState, data) && canAttemptMovePhase(currentState, "lobby", nowMs)) {
        const lobbyMoveResult = await movePlayersToLobby(client, shortId, data);
        if (lobbyMoveResult.completed) {
          nextMovePhase = "moved_to_lobby";
          updateDraftState(shortId, data, nextMovePhase);
          stopWatchingDraft(shortId);
          return;
        } else {
          const cooldownMs = resolvePhaseCooldownMs(lobbyMoveResult);
          if (cooldownMs !== null) {
            nextState = setNextAttemptAt(nextState, "lobby", nowMs + cooldownMs);
          }
        }
      }

      updateDraftState(shortId, data, nextMovePhase);
      draftStateCache.set(shortId, {
        ...draftStateCache.get(shortId),
        nextTeamMoveAttemptAt: nextState.nextTeamMoveAttemptAt,
        nextLobbyMoveAttemptAt: nextState.nextLobbyMoveAttemptAt,
      });
    } catch (error) {
      console.error(`Error polling draft ${shortId}:`, error.message);
    } finally {
      pollInFlight.delete(shortId);
    }
  }, POLL_INTERVAL_MS);

  pollIntervals.set(shortId, interval);
}

async function rehydrate(client) {
  try {
    const { data: drafts } = await axios.get(`${CONVEX_URL}/activeDrafts`, BOT_HEADERS);
    for (const draft of drafts) {
      console.log(`Re-hydrating watcher for draft ${draft.shortId} (status: ${draft.status})`);
      watchDraft(client, draft.shortId);
    }
    console.log(`Re-hydrated ${drafts.length} active draft watcher(s).`);
  } catch (error) {
    console.error("Error re-hydrating draft watchers:", error.message);
  }
}

async function postPublicLink(client, shortId, textChannelId) {
  try {
    const channel = await client.channels.fetch(textChannelId);
    if (!channel) return;

    const draftUrl = `${APP_URL}/draft/${shortId}`;

    const embed = new EmbedBuilder()
      .setColor("#6366f1")
      .setTitle("Draft is Live")
      .setDescription(`Watch the draft:\n${draftUrl}`);

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Error posting public link for ${shortId}:`, error.message);
  }
}

async function dmCaptains(client, shortId, draftData, tokens) {
  const draftUrl = `${APP_URL}/draft/${shortId}`;
  const captainIds = [draftData.team1CaptainId, draftData.team2CaptainId].filter(Boolean);

  for (const captainId of captainIds) {
    const tokenEntry = (tokens || []).find(
      (t) => t.discordUserId === captainId
    );
    if (!tokenEntry) continue;

    try {
      const user = await client.users.fetch(captainId);
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#6366f1")
            .setTitle("You're a Captain")
            .setDescription(
              `You've been selected as a captain.\n\n[Open Draft](${draftUrl}?token=${tokenEntry.token})`
            )
            .setFooter({
              text: "Do not share this link.",
            }),
        ],
      });
    } catch (error) {
      console.error(`Could not DM captain ${captainId}:`, error.message);
    }
  }
}

async function movePlayersToTeamChannels(client, shortId, draftData) {
  const guildId = draftData.discordGuildId || draftData.guildId;

  if (!guildId) {
    console.log(`[draft_voice_move] teams missing guildId for ${shortId}, skipping.`);
    return { executed: false, completed: false, terminalConfigError: true };
  }

  try {
    const settings = await fetchGuildSettings(guildId);

    if (!settings || !settings.team1ChannelId || !settings.team2ChannelId) {
      console.log(
        `No channel settings for guild ${guildId}, skipping team moves.`
      );
      return { executed: false, completed: false, terminalConfigError: true };
    }

    const guild = await client.guilds.fetch(guildId);
    const tasks = buildTeamMoveTasks(draftData.players, settings);
    const summary = await runMoveOperation({
      guild,
      tasks,
      draftShortId: shortId,
      phase: "teams",
    });

    return {
      executed: true,
      completed: summary.retryableFailures === 0,
      retryableFailures: summary.retryableFailures,
    };
  } catch (error) {
    console.error("Error moving players to team channels:", error.message);
    return {
      executed: false,
      completed: false,
      retryableError: isTransientMoveError(error),
      error,
    };
  }
}

async function movePlayersToLobby(client, shortId, draftData) {
  const guildId = draftData.discordGuildId || draftData.guildId;

  if (!guildId) {
    console.log(`[draft_voice_move] lobby missing guildId for ${shortId}, skipping.`);
    return { executed: false, completed: false, terminalConfigError: true };
  }

  try {
    const settings = await fetchGuildSettings(guildId);

    if (
      !settings ||
      !settings.team1ChannelId ||
      !settings.team2ChannelId ||
      !settings.lobbyChannelId
    ) {
      console.log(
        `No channel settings for guild ${guildId}, skipping lobby moves.`
      );
      return { executed: false, completed: false, terminalConfigError: true };
    }

    const guild = await client.guilds.fetch(guildId);
    const tasks = buildLobbyMoveTasks(draftData.players, settings);
    const summary = await runMoveOperation({
      guild,
      tasks,
      draftShortId: shortId,
      phase: "lobby",
      allowedSourceChannelIds: [settings.team1ChannelId, settings.team2ChannelId],
    });

    return {
      executed: true,
      completed: summary.retryableFailures === 0,
      retryableFailures: summary.retryableFailures,
    };
  } catch (error) {
    console.error("Error moving players to lobby:", error.message);
    return {
      executed: false,
      completed: false,
      retryableError: isTransientMoveError(error),
      error,
    };
  }
}

module.exports = {
  watchDraft,
  rehydrate,
  __testables: {
    buildTeamMoveTasks,
    buildLobbyMoveTasks,
    runMoveOperation,
    shouldTriggerTeamMove,
    shouldTriggerLobbyMove,
    createInitialDraftState,
    updateDraftState,
    canAttemptMovePhase,
    resolvePhaseCooldownMs,
    setNextAttemptAt,
    resetWatcherInternals,
    stopWatchingDraft,
    isTransientMoveError,
    fetchGuildSettings,
  },
};
