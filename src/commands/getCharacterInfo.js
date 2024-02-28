const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const {
  formatRealmRankWithLevel,
  getRealmRankForPoints,
} = require("../utils/realmRank");
const {
  bold,
  italic,
  strikethrough,
  underscore,
  spoiler,
  quote,
  blockQuote,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription(
      "Get basic character info. Name must match exactly as in-game."
    )

    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name of the character")
        .setRequired(true)
    ),
  async execute(interaction) {
    const name = interaction.options.getString("name");
    const url = `https://api.camelotherald.com/character/search?name=${name}&cluster=ywain`;

    try {
      const response = await axios.get(url);
      const data = await response.json();

      if (data.results.length > 0) {
        const character = data.results[0];
        const realmRank = getRealmRankForPoints(character.realm_points);
        const formattedRealmRank = formatRealmRankWithLevel(realmRank);
        const reply = `Name: ${character.name}\nClass: ${character.class_name}\nRealm Rank: ${formattedRealmRank}\nServer: ${character.server_name}`;
        const embed = new EmbedBuilder()
          .setColor("#6366f1")
          .addFields(
            { name: bold("Name"), value: character.name },
            { name: bold("Class"), value: character.class_name },
            { name: bold("Realm Rank"), value: formattedRealmRank },
            { name: bold("Server"), value: character.server_name }
          );

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply("Character not found.");
      }
    } catch (error) {
      console.error(error);
      await interaction.reply(
        "An error occurred while fetching character information."
      );
    }
  },
};
