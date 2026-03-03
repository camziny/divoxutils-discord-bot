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
    expect(summary.concurrencyUsed).toBe(5);
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

  test("runMoveOperation uses cached guild members when available", async () => {
    const cachedMember = {
      voice: {
        channelId: "source",
        setChannel: jest.fn().mockResolvedValue(undefined),
      },
    };
    const fetch = jest.fn(async () => {
      throw new Error("should not fetch when member exists in cache");
    });
    const guild = {
      members: {
        cache: new Map([["cached-user", cachedMember]]),
        fetch,
      },
    };

    const summary = await __testables.runMoveOperation({
      guild,
      tasks: [{ userId: "cached-user", targetChannelId: "target" }],
      draftShortId: "short-cache",
      phase: "teams",
      retryDelaysMs: [1, 1],
    });

    expect(summary.moved).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
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
    expect(__testables.resolvePhaseCooldownMs({ retryableFailures: 1 })).toBe(2_000);
    expect(__testables.resolvePhaseCooldownMs({ executed: false, retryableError: false })).toBe(60_000);
  });

  test("resolveRetryDelayMs prefers rate-limit retry_after values", () => {
    const shortDelay = __testables.resolveRetryDelayMs(
      { status: 429, rawError: { retry_after: 0.8 } },
      0,
      [300, 800, 1500]
    );
    const longDelay = __testables.resolveRetryDelayMs(
      { status: 429, rawError: { retry_after: 25_000 } },
      1,
      [300, 800, 1500]
    );

    expect(shortDelay).toBe(800);
    expect(longDelay).toBe(3000);
  });

  test("toRetryAfterMs treats larger retry_after as seconds when needed", () => {
    expect(__testables.toRetryAfterMs({ rawError: { retry_after: 45 } })).toBe(45_000);
    expect(__testables.toRetryAfterMs({ rawError: { retry_after: 1200 } })).toBe(1200);
  });

  test("resolveMoveConcurrency scales for larger rosters", () => {
    expect(__testables.resolveMoveConcurrency(2)).toBe(2);
    expect(__testables.resolveMoveConcurrency(8)).toBe(6);
    expect(__testables.resolveMoveConcurrency(16)).toBe(8);
    expect(__testables.resolveMoveConcurrency(16, 12)).toBe(10);
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

  test("fetchGuildSettings falls back to guildId endpoint on 400", async () => {
    axios.get
      .mockRejectedValueOnce({ response: { status: 400 } })
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

  test("retryable failures re-attempt before a full 10s stall", async () => {
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
    await jest.advanceTimersByTimeAsync(5000);
    expect(setChannel).toHaveBeenCalledTimes(4);

    await jest.advanceTimersByTimeAsync(3500);
    expect(setChannel.mock.calls.length).toBeGreaterThan(4);

    __testables.stopWatchingDraft("short-backoff");
  });

  test("lobby retries also re-attempt quickly for winner-triggered return", async () => {
    const setChannel = jest.fn(async () => {
      const error = new Error("temporary");
      error.status = 503;
      throw error;
    });

    const client = {
      guilds: {
        fetch: jest.fn(async () => ({
          members: {
            cache: new Map([
              [
                "user-1",
                {
                  voice: {
                    channelId: "team-1",
                    setChannel,
                  },
                },
              ],
            ]),
            fetch: jest.fn(async () => ({
              voice: {
                channelId: "team-1",
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
      if (url.includes("/getDraftStatus?shortId=short-lobby-backoff")) {
        return {
          data: {
            shortId: "short-lobby-backoff",
            status: "complete",
            gameStarted: true,
            winnerTeam: 1,
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

    watchDraft(client, "short-lobby-backoff");
    await jest.advanceTimersByTimeAsync(5000);
    expect(setChannel).toHaveBeenCalledTimes(4);

    await jest.advanceTimersByTimeAsync(3500);
    expect(setChannel.mock.calls.length).toBeGreaterThan(4);

    __testables.stopWatchingDraft("short-lobby-backoff");
  });

  test("terminal cancelled status stops polling quickly", async () => {
    const client = {
      guilds: { fetch: jest.fn() },
      channels: { fetch: jest.fn() },
      users: { fetch: jest.fn() },
    };

    axios.get.mockImplementation(async (url) => {
      if (url.includes("/getDraftStatus?shortId=short-cancelled")) {
        return {
          data: {
            shortId: "short-cancelled",
            status: "cancelled",
          },
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    watchDraft(client, "short-cancelled");
    await jest.advanceTimersByTimeAsync(2200);
    expect(
      axios.get.mock.calls.filter(([url]) => url.includes("/getDraftStatus?shortId=short-cancelled"))
        .length
    ).toBe(1);

    await jest.advanceTimersByTimeAsync(6000);
    expect(
      axios.get.mock.calls.filter(([url]) => url.includes("/getDraftStatus?shortId=short-cancelled"))
        .length
    ).toBe(1);
  });

  test("404 not found from getDraftStatus stops polling", async () => {
    const client = {
      guilds: { fetch: jest.fn() },
      channels: { fetch: jest.fn() },
      users: { fetch: jest.fn() },
    };

    axios.get.mockImplementation(async (url) => {
      if (url.includes("/getDraftStatus?shortId=short-missing")) {
        const error = new Error("not found");
        error.response = { status: 404 };
        throw error;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    watchDraft(client, "short-missing");
    await jest.advanceTimersByTimeAsync(2200);
    expect(
      axios.get.mock.calls.filter(([url]) => url.includes("/getDraftStatus?shortId=short-missing"))
        .length
    ).toBe(1);

    await jest.advanceTimersByTimeAsync(6000);
    expect(
      axios.get.mock.calls.filter(([url]) => url.includes("/getDraftStatus?shortId=short-missing"))
        .length
    ).toBe(1);
  });

  test("public draft link is not reposted when markBotPostedLink fails", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const client = {
      guilds: { fetch: jest.fn() },
      channels: {
        fetch: jest.fn(async () => ({
          send,
        })),
      },
      users: { fetch: jest.fn() },
    };

    axios.get.mockImplementation(async (url) => {
      if (url.includes("/getDraftStatus?shortId=short-mark-fail")) {
        return {
          data: {
            shortId: "short-mark-fail",
            status: "complete",
            botPostedLink: false,
            botNotifiedCaptains: true,
            discordTextChannelId: "channel-1",
            gameStarted: false,
            winnerTeam: null,
          },
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    axios.post.mockImplementation(async (url) => {
      if (url.includes("/markBotPostedLink")) {
        throw new Error("mark failed");
      }
      return { data: {} };
    });

    watchDraft(client, "short-mark-fail");
    await jest.advanceTimersByTimeAsync(6500);

    expect(send).toHaveBeenCalledTimes(1);
    __testables.stopWatchingDraft("short-mark-fail");
  });
});
