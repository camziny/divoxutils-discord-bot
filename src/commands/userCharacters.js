const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");

const data = new SlashCommandBuilder()
  .setName("getcharacters")
  .setDescription("Get characters for a user")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the user")
      .setRequired(true)
  );

async function execute(interaction) {
  const name = interaction.options.getString("name");
  try {
    const apiUrl = `${process.env.API_URL}/users/characters/${name}`;
    console.log(`API URL: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: {
        "x-api-key": process.env.API_KEY,
      },
    });
    const characters = response.data;
    if (characters.length > 0) {
      let reply = `Characters for ${name}:\n`;
      characters.forEach((char) => {
        reply += ` - ${char.characterName} (${char.className}): ${char.formattedRank}\n`;
      });
      await interaction.reply(reply);
    } else {
      await interaction.reply(`No characters found for ${name}.`);
    }
  } catch (error) {
    console.error(error);
    await interaction.reply("An error occurred while fetching characters.");
  }
}

module.exports = { data, execute };
