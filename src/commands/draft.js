const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");
const axios = require("axios");

const { watchDraft } = require("../utils/draftWatcher");

const CONVEX_URL = process.env.CONVEX_URL;
const APP_URL = process.env.APP_URL || "https://divoxutils.com";
const BOT_HEADERS = { headers: { "x-bot-api-key": process.env.BOT_API_KEY } };

const data = new SlashCommandBuilder()
  .setName("draft")
  .setDescription("Start a new draft from the current voice channel");

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.member;

  let guildSettings = null;
  try {
    const settingsRes = await axios.get(
      `${CONVEX_URL}/guildSettings?guildId=${interaction.guildId}`,
      BOT_HEADERS
    );
    guildSettings = settingsRes.data;
  } catch (err) {
    if (err?.response?.status === 404) {
      await interaction.editReply({
        content:
          "Draft has not been set up on this server yet. An admin needs to run `/draft-setup` first to configure team channels.",
      });
      return;
    }
  }

  const lobbyChannelId = guildSettings?.lobbyChannelId || null;

  let voiceChannel;

  if (lobbyChannelId) {
    try {
      voiceChannel = await interaction.client.channels.fetch(lobbyChannelId);
    } catch {
      await interaction.editReply({
        content:
          "The configured lobby channel could not be found. Run `/draft-setup` to update it.",
      });
      return;
    }
  } else {
    voiceChannel = member?.voice?.channel;
  }

  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    await interaction.editReply({
      content: lobbyChannelId
        ? "The configured lobby channel is not a voice channel. Run `/draft-setup` to fix it."
        : "You must be in a voice channel to start a draft (or set a lobby channel with `/draft-setup`).",
    });
    return;
  }

  const members = voiceChannel.members.filter((m) => !m.user.bot);

  if (members.size < 4) {
    await interaction.editReply({
      content: `Need at least 4 players in <#${voiceChannel.id}> to start a draft (minimum 2v2).`,
    });
    return;
  }

  const players = members.map((m) => ({
    discordUserId: m.user.id,
    displayName: m.nickname || m.user.displayName || m.user.username,
    avatarUrl: m.user.displayAvatarURL({ size: 64, extension: "png" }),
  }));

  try {
    const response = await axios.post(`${CONVEX_URL}/createDraft`, {
      guildId: interaction.guildId,
      channelId: voiceChannel.id,
      textChannelId: interaction.channelId,
      createdBy: interaction.user.id,
      players,
    }, BOT_HEADERS);

    const { shortId, playerTokens } = response.data;
    const draftUrl = `${APP_URL}/draft/${shortId}`;

    const creatorToken = playerTokens.find(
      (t) => t.discordUserId === interaction.user.id
    );

    const creatorLink = creatorToken
      ? `${draftUrl}?token=${creatorToken.token}`
      : draftUrl;

    try {
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#6366f1")
            .setTitle("Draft Created")
            .setDescription(
              `**${players.length} players** from <#${voiceChannel.id}>\n\n` +
                `[Open Draft](${creatorLink})`
            )
            .setFooter({
              text: "Do not share this link.",
            }),
        ],
      });
    } catch {
      await interaction.editReply({
        content: `Draft created but could not DM you. Here is your link:\n${creatorLink}`,
      });
      watchDraft(interaction.client, shortId);
      return;
    }

    await interaction.editReply({
      content:
        "Draft created. Check your DMs for the link. A public link will be posted here once you start.",
    });

    watchDraft(interaction.client, shortId);
  } catch (error) {
    console.error("Error creating draft:", error?.response?.data || error);
    await interaction.editReply({
      content: "Failed to create draft. Please try again.",
    });
  }
}

module.exports = { data, execute };
