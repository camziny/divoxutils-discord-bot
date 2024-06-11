const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { bold } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("compare-users")
  .setDescription("Compare stats for two users")
  .addStringOption((option) =>
    option
      .setName("name1")
      .setDescription("The name of the first user")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("name2")
      .setDescription("The name of the second user")
      .setRequired(true)
  );

async function execute(interaction) {
  console.log("Executing compare-users command");
  const name1 = interaction.options.getString("name1");
  const name2 = interaction.options.getString("name2");
  console.log(`Comparing ${name1} and ${name2}`);

  const apiUrl1 = `${process.env.API_URL}/users/stats/${name1}`;
  const apiUrl2 = `${process.env.API_URL}/users/stats/${name2}`;
  console.log(`API URLs: ${apiUrl1}, ${apiUrl2}`);

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
      .setTitle(`Stats for ${bold(stats1.userName)}`)
      .addFields(
        {
          name: bold("Total Stats"),
          value: `Realm Points: ${stats1.totalRealmPoints.toLocaleString()}\nSolo Kills: ${stats1.totalSoloKills.toLocaleString()}\nDeaths: ${stats1.totalDeaths.toLocaleString()}\nIRS: ${stats1.irs.toLocaleString()}`,
          inline: false,
        },
        {
          name: bold("Last Week Stats"),
          value: `Realm Points: ${stats1.realmPointsLastWeek.toLocaleString()}\nSolo Kills: ${stats1.soloKillsLastWeek.toLocaleString()}\nDeaths: ${stats1.deathsLastWeek.toLocaleString()}\nIRS: ${stats1.irsLastWeek.toLocaleString()}`,
          inline: false,
        }
      );

    const embed2 = new EmbedBuilder()
      .setColor("#a5b4fc")
      .setTitle(`Stats for ${bold(stats2.userName)}`)
      .addFields(
        {
          name: bold("Total Stats"),
          value: `Realm Points: ${stats2.totalRealmPoints.toLocaleString()}\nSolo Kills: ${stats2.totalSoloKills.toLocaleString()}\nDeaths: ${stats2.totalDeaths.toLocaleString()}\nIRS: ${stats2.irs.toLocaleString()}`,
          inline: false,
        },
        {
          name: bold("Last Week Stats"),
          value: `Realm Points: ${stats2.realmPointsLastWeek.toLocaleString()}\nSolo Kills: ${stats2.soloKillsLastWeek.toLocaleString()}\nDeaths: ${stats2.deathsLastWeek.toLocaleString()}\nIRS: ${stats2.irsLastWeek.toLocaleString()}`,
          inline: false,
        }
      );

    await interaction.reply({ embeds: [embed1, embed2] });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    await interaction.reply({
      content: `Error fetching user stats. Make sure both users exist.`,
      ephemeral: true,
    });
  }
}

module.exports = { data, execute };
