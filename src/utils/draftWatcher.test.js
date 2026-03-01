const axios = require("axios");
const { watchDraft, __testables } = require("./draftWatcher");

jest.mock("axios");

describe("draftWatcher move operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    __testables.resetWatcherInternals();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __testables.resetWatcherInternals();
    jest.useRealTimers();
  });

  test("runMoveOperation enforces concurrency and retries transient failures", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const attemptsByUser = new Map();
    const members = new Map();

    for (let i = 1; i <= 16; i += 1) {
      const userId = `user-${i}`;
      members.set(userId, {
        voice: {
          channelId: "source",
          setChannel: jest.fn(async () => {
            const currentAttempts = attemptsByUser.get(userId) || 0;
            attemptsByUser.set(userId, currentAttempts + 1);

            if (userId === "user-3" && currentAttempts < 2) {
              const transientError = new Error("temporary failure");
              transientError.status = 500;
              throw transientError;
            }

            inFlight += 1;
            if (inFlight > maxInFlight) {
              maxInFlight = inFlight;
            }
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight -= 1;
          }),
        },
      });
    }

    const guild = {
      members: {
        fetch: jest.fn(async (userId) => members.get(userId)),
      },
    };

    const tasks = Array.from({ length: 16 }, (_, index) => ({
      userId: `user-${index + 1}`,
      targetChannelId: "target",
    }));

    const summary = await __testables.runMoveOperation({
      guild,
      tasks,
      draftShortId: "short-1",
      phase: "teams",
      maxConcurrency: 5,
      retryDelaysMs: [1, 1],
    });

    expect(summary.attempted).toBe(16);
    expect(summary.moved).toBe(16);
    expect(summary.failed).toBe(0);
    expect(summary.retryableFailures).toBe(0);
    expect(summary.alreadyInPlace).toBe(0);
    expect(summary.retriesTotal).toBe(2);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  test("runMoveOperation is idempotent for lobby moves", async () => {
    const members = new Map([
      [
        "user-a",
        {
          voice: {
            channelId: "lobby",
            setChannel: jest.fn(),
          },
        },
      ],
      [
        "user-b",
        {
          voice: {
            channelId: "team-1",
            setChannel: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
      [
        "user-c",
        {
          voice: {
            channelId: "other",
            setChannel: jest.fn(),
          },
        },
      ],
      [
        "user-d",
        {
          voice: {
            channelId: null,
            setChannel: jest.fn(),
          },
        },
      ],
    ]);

    const guild = {
      members: {
        fetch: jest.fn(async (userId) => members.get(userId)),
      },
    };

    const summary = await __testables.runMoveOperation({
      guild,
      tasks: [
        { userId: "user-a", targetChannelId: "lobby" },
        { userId: "user-b", targetChannelId: "lobby" },
        { userId: "user-c", targetChannelId: "lobby" },
        { userId: "user-d", targetChannelId: "lobby" },
      ],
      draftShortId: "short-2",
      phase: "lobby",
      allowedSourceChannelIds: ["team-1", "team-2"],
      maxConcurrency: 5,
      retryDelaysMs: [1, 1],
    });

    expect(summary.attempted).toBe(1);
    expect(summary.moved).toBe(1);
    expect(summary.alreadyInPlace).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.retryableFailures).toBe(0);
  });

  test("runMoveOperation marks retryable failures separately", async () => {
    const guild = {
      members: {
        fetch: jest.fn(async () => ({
          voice: {
            channelId: "source",
            setChannel: jest.fn(async () => {
              const err = new Error("temporary");
              err.status = 503;
              throw err;
            }),
          },
        })),
      },
    };

    const summary = await __testables.runMoveOperation({
      guild,
      tasks: [{ userId: "user-z", targetChannelId: "target" }],
      draftShortId: "short-3",
      phase: "teams",
      maxConcurrency: 1,
      retryDelaysMs: [1, 1],
    });

    expect(summary.attempted).toBe(1);
    expect(summary.moved).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.retryableFailures).toBe(1);
  });
});

describe("draftWatcher transition and settings helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("team and lobby transitions use phase completion to gate repeat runs", () => {
    const initial = __testables.createInitialDraftState();

    expect(
      __testables.shouldTriggerTeamMove(initial, {
        status: "complete",
        gameStarted: true,
        winnerTeam: null,
      })
    ).toBe(true);

    expect(
      __testables.shouldTriggerTeamMove(
        {
          lastStatus: "complete",
          lastGameStarted: true,
          lastWinnerTeam: null,
          lastMovePhase: "moved_to_teams",
        },
        {
          status: "complete",
          gameStarted: true,
          winnerTeam: null,
        }
      )
    ).toBe(false);

    expect(
      __testables.shouldTriggerLobbyMove(
        {
          lastStatus: "complete",
          lastGameStarted: true,
          lastWinnerTeam: null,
          lastMovePhase: "moved_to_teams",
        },
        {
          status: "complete",
          gameStarted: true,
          winnerTeam: 2,
        }
      )
    ).toBe(true);

    expect(
      __testables.shouldTriggerLobbyMove(
        {
          lastStatus: "complete",
          lastGameStarted: true,
          lastWinnerTeam: 2,
          lastMovePhase: "moved_to_teams",
        },
        {
          status: "complete",
          gameStarted: true,
          winnerTeam: 2,
        }
      )
    ).toBe(true);

    expect(
      __testables.shouldTriggerLobbyMove(
        {
          lastStatus: "complete",
          lastGameStarted: true,
          lastWinnerTeam: 2,
          lastMovePhase: "moved_to_lobby",
        },
        {
          status: "complete",
          gameStarted: true,
          winnerTeam: 2,
        }
      )
    ).toBe(false);
  });

  test("phase cooldown helpers gate repeated attempts", () => {
    const state = __testables.createInitialDraftState();
    const updated = __testables.setNextAttemptAt(state, "teams", 10_000);

    expect(__testables.canAttemptMovePhase(updated, "teams", 9_999)).toBe(false);
    expect(__testables.canAttemptMovePhase(updated, "teams", 10_000)).toBe(true);
    expect(__testables.resolvePhaseCooldownMs({ terminalConfigError: true })).toBe(60_000);
    expect(__testables.resolvePhaseCooldownMs({ retryableFailures: 1 })).toBe(10_000);
  });

  test("fetchGuildSettings falls back to guildId endpoint", async () => {
    axios.get
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ data: { team1ChannelId: "a", team2ChannelId: "b" } });

    const result = await __testables.fetchGuildSettings("guild-1");

    expect(result).toEqual({ team1ChannelId: "a", team2ChannelId: "b" });
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get.mock.calls[0][0]).toContain("discordGuildId=guild-1");
    expect(axios.get.mock.calls[1][0]).toContain("guildId=guild-1");
  });
});

describe("draftWatcher poll hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    __testables.resetWatcherInternals();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __testables.resetWatcherInternals();
    jest.useRealTimers();
  });

  test("retryable failures back off phase retries instead of retrying every poll", async () => {
    const setChannel = jest.fn(async () => {
      const error = new Error("temporary");
      error.status = 503;
      throw error;
    });

    const client = {
      guilds: {
        fetch: jest.fn(async () => ({
          members: {
            fetch: jest.fn(async () => ({
              voice: {
                channelId: "source-voice",
                setChannel,
              },
            })),
          },
        })),
      },
      channels: {
        fetch: jest.fn(),
      },
      users: {
        fetch: jest.fn(),
      },
    };

    axios.get.mockImplementation(async (url) => {
      if (url.includes("/getDraftStatus?shortId=short-backoff")) {
        return {
          data: {
            shortId: "short-backoff",
            status: "complete",
            gameStarted: true,
            winnerTeam: null,
            discordGuildId: "guild-1",
            players: [{ discordUserId: "user-1", team: 1 }],
          },
        };
      }

      if (url.includes("/guildSettings?discordGuildId=guild-1")) {
        return {
          data: {
            team1ChannelId: "team-1",
            team2ChannelId: "team-2",
            lobbyChannelId: "lobby",
          },
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    watchDraft(client, "short-backoff");
    await jest.advanceTimersByTimeAsync(3500);
    expect(setChannel).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(8000);
    expect(setChannel).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(3000);
    expect(setChannel).toHaveBeenCalledTimes(6);

    __testables.stopWatchingDraft("short-backoff");
  });
});
