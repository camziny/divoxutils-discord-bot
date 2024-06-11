const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const dotenv = require("dotenv");
dotenv.config();

const compareUsers = require("../commands/compareUsers.js");

const commands = [compareUsers.data.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Started refreshing compare-users command.");

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
      body: commands,
    });

    console.log("Successfully reloaded compare-users command.");
  } catch (error) {
    console.error("Error registering command:", error);
  }
})();
