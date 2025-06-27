const { SlashCommandBuilder } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("flipcoin")
  .setDescription("Flip a coin to get heads or tails");

async function execute(interaction) {
  const result = Math.random() < 0.5 ? "heads" : "tails";
  
  await interaction.reply(`The coin landed on: **${result}**`);
}

module.exports = { data, execute }; 