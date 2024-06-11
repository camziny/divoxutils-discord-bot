const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const dotenv = require("dotenv");
dotenv.config();

const compareChars = require("../commands/compareCharacters.js");

const commands = [compareChars.data.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

console.log(
  `DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? "loaded" : "missing"}`
);
console.log(`DISCORD_CLIENT_ID: ${process.env.DISCORD_CLIENT_ID}`);
console.log(`API_URL: ${process.env.API_URL}`);
console.log(`API_KEY: ${process.env.API_KEY}`);

(async () => {
  try {
    console.log("Started refreshing compare-chars command.");

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
      body: commands,
    });

    console.log("Successfully reloaded compare-chars command.");
  } catch (error) {
    console.error("Error registering command:", error);
  }
})();
