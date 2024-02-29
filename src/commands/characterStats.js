const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { bold } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("character-stats")
  .setDescription("Get stats for a character")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the character")
      .setRequired(true)
  );

async function execute(interaction) {
  const name = interaction.options.getString("name");
  const apiUrl = `${process.env.API_URL}/characters/stats/${name}`;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        "x-api-key": process.env.API_KEY,
      },
    });
    const stats = response.data;

    const embed = new EmbedBuilder()
      .setColor("#6366f1")
      .setTitle(`Stats for ${bold(stats.characterName)}`)
      .setDescription(
        `${bold(stats.className || "N/A")}\n` +
          `${bold(stats.formattedRank || "N/A")}\n\n` +
          `${bold("Total Stats:")}\n` +
          `Solo Kills: ${stats.totalSoloKills?.toLocaleString() || "N/A"}\n` +
          `Deaths: ${stats.totalDeaths?.toLocaleString() || "N/A"}\n\n` +
          `${bold("Last Week Stats:")}\n` +
          `Solo Kills: ${
            stats.soloKillsLastWeek?.toLocaleString() || "N/A"
          }\n` +
          `Deaths: ${stats.deathsLastWeek?.toLocaleString() || "N/A"}\n` +
          `Realm Points: ${
            stats.realmPointsLastWeek?.toLocaleString() || "N/A"
          }`
      );

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: `Character ${name} not found`,
      ephemeral: true,
    });
  }
}

module.exports = { data, execute };
