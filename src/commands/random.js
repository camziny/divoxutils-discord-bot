const { SlashCommandBuilder } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("random")
  .setDescription("Generate a random number between 1 and your specified maximum")
  .addIntegerOption((option) =>
    option
      .setName("max")
      .setDescription("The maximum number (inclusive)")
      .setRequired(true)
      .setMinValue(1)
  );

async function execute(interaction) {
  const max = interaction.options.getInteger("max");
  
  const randomNumber = Math.floor(Math.random() * max) + 1;
  
  await interaction.reply(`🎲 Your random number is: **${randomNumber}**`);
}

module.exports = { data, execute }; 