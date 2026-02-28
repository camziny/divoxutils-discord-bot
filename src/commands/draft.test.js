const { ChannelType } = require("discord.js");
const axios = require("axios");
const { watchDraft } = require("../utils/draftWatcher");
const draftCommand = require("./draft");

jest.mock("axios");
jest.mock("../utils/draftWatcher", () => ({
  watchDraft: jest.fn(),
}));

function createVoiceChannelMembers(count = 4) {
  const members = Array.from({ length: count }, (_, index) => ({
    nickname: `Nick ${index + 1}`,
    user: {
      id: `player-${index + 1}`,
      bot: false,
      displayName: `Display ${index + 1}`,
      username: `username-${index + 1}`,
      displayAvatarURL: jest.fn(() => `https://avatar/${index + 1}.png`),
    },
  }));

  return {
    filter: (predicate) => {
      const filtered = members.filter(predicate);
      return {
        size: filtered.length,
        map: (mapper) => filtered.map(mapper),
      };
    },
  };
}

function createInteraction(overrides = {}) {
  const voiceChannel = overrides.voiceChannel || {
    id: "voice-1",
    type: ChannelType.GuildVoice,
    members: createVoiceChannelMembers(4),
  };

  return {
    id: "interaction-1",
    guildId: "guild-1",
    guild: { name: "Guild Name" },
    channelId: "text-1",
    member: {
      displayName: "Creator Display",
      voice: { channel: voiceChannel },
    },
    user: {
      id: "user-1",
      globalName: "Creator Global",
      username: "creator-username",
      send: jest.fn().mockResolvedValue(undefined),
    },
    client: {
      channels: {
        fetch: jest.fn(),
      },
      guilds: {
        cache: {
          get: jest.fn(() => null),
        },
        fetch: jest.fn(),
      },
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("draft command resolvers", () => {
  const {
    resolveGuildName,
    resolveCreatedByDisplayName,
    toNonEmptyString,
  } = draftCommand.__testables;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("guild name resolves from interaction.guild.name", async () => {
    const interaction = createInteraction({
      guild: { name: "  My Guild  " },
    });

    const guildName = await resolveGuildName(interaction);

    expect(guildName).toBe("My Guild");
  });

  test("guild name resolves from guild cache fallback", async () => {
    const interaction = createInteraction({
      guild: { name: "   " },
      client: {
        guilds: {
          cache: {
            get: jest.fn(() => ({ name: " Cached Guild " })),
          },
          fetch: jest.fn(),
        },
      },
    });

    const guildName = await resolveGuildName(interaction);

    expect(guildName).toBe("Cached Guild");
  });

  test("guild unresolved path logs warning", async () => {
    const interaction = createInteraction({
      guild: { name: " " },
      client: {
        guilds: {
          cache: { get: jest.fn(() => ({ name: "  " })) },
          fetch: jest.fn().mockResolvedValue({ name: " " }),
        },
      },
    });

    const guildName = await resolveGuildName(interaction);

    expect(guildName).toBe("");
    expect(console.warn).toHaveBeenCalledWith(
      "[draft.execute] Unable to resolve guildName",
      expect.objectContaining({
        guildId: "guild-1",
        handlerName: "draft.execute",
        interactionId: "interaction-1",
      })
    );
  });

  test("creator name resolves from member display name", () => {
    const interaction = createInteraction({
      member: { displayName: "  Captain Name  " },
      user: { id: "user-1", globalName: "Global", username: "username" },
    });

    const displayName = resolveCreatedByDisplayName(interaction);

    expect(displayName).toBe("Captain Name");
  });

  test("creator name falls back to globalName then username", () => {
    const globalNameInteraction = createInteraction({
      member: { displayName: " " },
      user: { id: "user-1", globalName: "  Global Name  ", username: "username" },
    });
    const usernameInteraction = createInteraction({
      member: { displayName: " " },
      user: { id: "user-1", globalName: " ", username: "  Username Fallback " },
    });

    const globalResolved = resolveCreatedByDisplayName(globalNameInteraction);
    const usernameResolved = resolveCreatedByDisplayName(usernameInteraction);

    expect(globalResolved).toBe("Global Name");
    expect(usernameResolved).toBe("Username Fallback");
  });

  test("creator final fallback path logs warning", () => {
    const interaction = createInteraction({
      guildId: "guild-42",
      member: { displayName: " " },
      user: { id: "user-42", globalName: " ", username: " " },
    });

    const displayName = resolveCreatedByDisplayName(interaction);

    expect(displayName).toBe("user-42");
    expect(console.warn).toHaveBeenCalledWith(
      "[draft.execute] Using userId fallback for createdByDisplayName",
      expect.objectContaining({
        userId: "user-42",
        guildId: "guild-42",
        handlerName: "draft.execute",
        interactionId: "interaction-1",
      })
    );
  });

  test("toNonEmptyString trims and removes blank values", () => {
    expect(toNonEmptyString("  value  ")).toBe("value");
    expect(toNonEmptyString("   ")).toBe("");
    expect(toNonEmptyString(null)).toBe("");
  });
});

describe("draft command payload contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("payload includes guildId, guildName, createdByDisplayName and preserves existing fields", async () => {
    const interaction = createInteraction();

    axios.get.mockResolvedValueOnce({ data: {} });
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        shortId: "short-1",
        playerTokens: [{ discordUserId: "user-1", token: "creator-token" }],
      },
    });

    await draftCommand.execute(interaction);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const payload = axios.post.mock.calls[0][1];

    expect(payload).toEqual(
      expect.objectContaining({
        guildId: "guild-1",
        guildName: "Guild Name",
        channelId: "voice-1",
        textChannelId: "text-1",
        createdBy: "user-1",
        createdByDisplayName: "Creator Display",
      })
    );
    expect(Array.isArray(payload.players)).toBe(true);
    expect(payload.players).toHaveLength(4);
    expect(watchDraft).toHaveBeenCalledWith(interaction.client, "short-1");
  });
});
