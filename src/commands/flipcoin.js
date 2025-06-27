const { SlashCommandBuilder } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("flipcoin")
  .setDescription("Flip a coin to get heads or tails");

async function execute(interaction) {
  console.log("Flipcoin command executed!");
  const result = Math.random() < 0.5 ? "heads" : "tails";
  const userName = interaction.member?.displayName || interaction.user.username;
  
  await interaction.reply(`**${userName}** flipped **${result}**`);
}

module.exports = { data, execute }; 