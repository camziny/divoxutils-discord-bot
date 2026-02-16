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
  .setDescription("Configure voice channels for post-draft team moves")
  .addChannelOption((option) =>
    option
      .setName("team1-channel")
      .setDescription("Voice channel for Team 1")
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)
  )
  .addChannelOption((option) =>
    option
      .setName("team2-channel")
      .setDescription("Voice channel for Team 2")
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const team1Channel = interaction.options.getChannel("team1-channel");
  const team2Channel = interaction.options.getChannel("team2-channel");

  if (team1Channel.id === team2Channel.id) {
    await interaction.editReply({
      content: "Team 1 and Team 2 channels must be different.",
    });
    return;
  }

  try {
    await axios.post(`${CONVEX_URL}/guildSettings`, {
      guildId: interaction.guildId,
      team1ChannelId: team1Channel.id,
      team2ChannelId: team2Channel.id,
    });

    const embed = new EmbedBuilder()
      .setColor("#6366f1")
      .setTitle("Draft Channels Configured")
      .setDescription(
        `After a draft is completed, players will be moved to:\n\n` +
          `**Team 1** → <#${team1Channel.id}>\n` +
          `**Team 2** → <#${team2Channel.id}>`
      )
      .setFooter({
        text: "Run this command again to update the channels.",
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
