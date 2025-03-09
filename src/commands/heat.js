const { SlashCommandBuilder } = require("discord.js");
const { heatQuotes } = require("../utils/heatItems");

let lastQuoteIndex = -1;

const data = new SlashCommandBuilder()
  .setName("heat")
  .setDescription("random heat 🔥");

async function execute(interaction) {
  let randomIndex;
  
  if (heatQuotes.length === 1) {
    randomIndex = 0;
  } else {
    do {
      randomIndex = Math.floor(Math.random() * heatQuotes.length);
    } while (randomIndex === lastQuoteIndex);
  }
  
  lastQuoteIndex = randomIndex;
  
  const randomHeatQuote = heatQuotes[randomIndex];
  
  await interaction.reply(`${randomHeatQuote}`);
}

module.exports = { data, execute }; 