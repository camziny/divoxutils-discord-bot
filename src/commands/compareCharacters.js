const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { bold } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("compare-chars")
  .setDescription("Compare stats for two characters")
  .addStringOption((option) =>
    option
      .setName("name1")
      .setDescription("The name of the first character")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("name2")
      .setDescription("The name of the second character")
      .setRequired(true)
  );

async function execute(interaction) {
  console.log("Executing compare-chars command");
  const name1 = interaction.options.getString("name1");
  const name2 = interaction.options.getString("name2");

  const apiUrl1 = `${process.env.API_URL}/characters/stats/${name1}`;
  const apiUrl2 = `${process.env.API_URL}/characters/stats/${name2}`;

  try {
    const [response1, response2] = await Promise.all([
      axios.get(apiUrl1, {
        headers: {
          "x-api-key": process.env.API_KEY,
        },
      }),
      axios.get(apiUrl2, {
        headers: {
          "x-api-key": process.env.API_KEY,
        },
      }),
    ]);

    const stats1 = response1.data;
    const stats2 = response2.data;
    console.log("Data fetched successfully");

    const embed1 = new EmbedBuilder()
      .setColor("#6366f1")
      .setTitle(`Stats for ${bold(stats1.characterName)}`)
      .addFields(
        { name: "Class", value: stats1.className || "N/A", inline: true },
        { name: "Rank", value: stats1.formattedRank || "N/A", inline: true },
        { name: "\u200B", value: "\u200B", inline: true },
        {
          name: bold("Total Stats"),
          value: `Solo Kills: ${
            stats1.totalSoloKills?.toLocaleString() || "N/A"
          }\nDeaths: ${stats1.totalDeaths?.toLocaleString() || "N/A"}\nIRS: ${
            stats1.irs?.toLocaleString() || "N/A"
          }`,
          inline: false,
        },
        {
          name: bold("Last Week Stats"),
          value: `Solo Kills: ${
            stats1.soloKillsLastWeek?.toLocaleString() || "N/A"
          }\nDeaths: ${
            stats1.deathsLastWeek?.toLocaleString() || "N/A"
          }\nRealm Points: ${
            stats1.realmPointsLastWeek?.toLocaleString() || "N/A"
          }\nIRS: ${stats1.irsLastWeek?.toLocaleString() || "N/A"}`,
          inline: false,
        }
      );

    const embed2 = new EmbedBuilder()
      .setColor("#a5b4fc")
      .setTitle(`Stats for ${bold(stats2.characterName)}`)
      .addFields(
        { name: "Class", value: stats2.className || "N/A", inline: true },
        { name: "Rank", value: stats2.formattedRank || "N/A", inline: true },
        { name: "\u200B", value: "\u200B", inline: true },
        {
          name: bold("Total Stats"),
          value: `Solo Kills: ${
            stats2.totalSoloKills?.toLocaleString() || "N/A"
          }\nDeaths: ${stats2.totalDeaths?.toLocaleString() || "N/A"}\nIRS: ${
            stats2.irs?.toLocaleString() || "N/A"
          }`,
          inline: false,
        },
        {
          name: bold("Last Week Stats"),
          value: `Solo Kills: ${
            stats2.soloKillsLastWeek?.toLocaleString() || "N/A"
          }\nDeaths: ${
            stats2.deathsLastWeek?.toLocaleString() || "N/A"
          }\nRealm Points: ${
            stats2.realmPointsLastWeek?.toLocaleString() || "N/A"
          }\nIRS: ${stats2.irsLastWeek?.toLocaleString() || "N/A"}`,
          inline: false,
        }
      );

    await interaction.reply({ embeds: [embed1, embed2] });
  } catch (error) {
    console.error("Error fetching character stats:", error);
    await interaction.reply({
      content: `Error fetching character stats. Make sure both characters exist.`,
      ephemeral: true,
    });
  }
}

module.exports = { data, execute };
