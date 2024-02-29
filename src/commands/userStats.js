const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { bold } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("user-stats")
  .setDescription("Get stats for a user")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the user")
      .setRequired(true)
  );

async function execute(interaction) {
  const name = interaction.options.getString("name");
  const apiUrl = `${process.env.API_URL}/users/stats/${name}`;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        "x-api-key": process.env.API_KEY,
      },
    });
    const stats = response.data;

    const embed = new EmbedBuilder()
      .setColor("#6366f1")
      .setTitle(`Stats for ${bold(stats.userName)}`)
      .setDescription(
        `${bold("Total Stats")}\n` +
          `Realm Points: ${stats.totalRealmPoints.toLocaleString()}\n` +
          `Solo Kills: ${stats.totalSoloKills.toLocaleString()}\n` +
          `Deaths: ${stats.totalDeaths.toLocaleString()}\n` +
          `IRS: ${stats.irs.toLocaleString()}\n\n` +
          `${bold("Last Week Stats")}\n` +
          `Realm Points: ${stats.realmPointsLastWeek.toLocaleString()}\n` +
          `Solo Kills: ${stats.soloKillsLastWeek.toLocaleString()}\n` +
          `Deaths: ${stats.deathsLastWeek.toLocaleString()}\n` +
          `IRS: ${stats.irsLastWeek.toLocaleString()}`
      );

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: `User ${name} not found`,
      ephemeral: true,
    });
  }
}

module.exports = { data, execute };
