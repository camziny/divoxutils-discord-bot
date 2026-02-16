const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const axios = require("axios");

const CONVEX_URL = process.env.CONVEX_URL;

const data = new SlashCommandBuilder()
  .setName("draft-setup")
  .setDescription("Configure voice channels for the draft bot")
  .addChannelOption((option) =>
    option
      .setName("lobby-channel")
      .setDescription("Voice channel to pull players from when /draft is run")
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)
  )
  .addChannelOption((option) =>
    option
      .setName("team1-channel")
      .setDescription("Voice channel to move Team 1 into after draft")
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)
  )
  .addChannelOption((option) =>
    option
      .setName("team2-channel")
      .setDescription("Voice channel to move Team 2 into after draft")
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const lobbyChannel = interaction.options.getChannel("lobby-channel");
  const team1Channel = interaction.options.getChannel("team1-channel");
  const team2Channel = interaction.options.getChannel("team2-channel");

  if (!lobbyChannel || !team1Channel || !team2Channel) {
    await interaction.editReply({
      content: "All three channels are required and must be voice channels.",
    });
    return;
  }

  const allVoice = [lobbyChannel, team1Channel, team2Channel].every(
    (ch) => ch.type === ChannelType.GuildVoice
  );
  if (!allVoice) {
    await interaction.editReply({
      content: "All three channels must be voice channels, not text channels.",
    });
    return;
  }

  const channelIds = [lobbyChannel.id, team1Channel.id, team2Channel.id];
  const unique = new Set(channelIds);
  if (unique.size !== channelIds.length) {
    await interaction.editReply({
      content: "All three channels must be different.",
    });
    return;
  }

  try {
    await axios.post(`${CONVEX_URL}/guildSettings`, {
      guildId: interaction.guildId,
      team1ChannelId: team1Channel.id,
      team2ChannelId: team2Channel.id,
      lobbyChannelId: lobbyChannel.id,
    });

    const embed = new EmbedBuilder()
      .setColor("#6366f1")
      .setTitle("Draft Channels Configured")
      .setDescription(
        `**Lobby** → <#${lobbyChannel.id}>\n` +
          `**Team 1** → <#${team1Channel.id}>\n` +
          `**Team 2** → <#${team2Channel.id}>\n\n` +
          `When \`/draft\` is run, players will be pulled from the lobby channel.`
      )
      .setFooter({
        text: "Run this command again to reconfigure.",
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(
      "Error saving guild settings:",
      error?.response?.data || error
    );
    await interaction.editReply({
      content: "Failed to save channel settings. Please try again.",
    });
  }
}

module.exports = { data, execute };
