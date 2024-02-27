import { Client, Collection, GatewayIntentBits } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { dirname } from "path";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});
const commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts"));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(filePath);
    commands.set(command.data.name, command);
}
client.once("ready", async () => {
    console.log("Bot is online!");
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log("Started refreshing application (/) commands.");
        await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands.map((command) => command.data.toJSON()),
        });
        console.log("Successfully reloaded application (/) commands.");
    }
    catch (error) {
        console.error(error);
    }
});
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand())
        return;
    const command = commands.get(interaction.commandName);
    if (!command)
        return;
    try {
        await command.execute(interaction);
    }
    catch (error) {
        console.error(error);
        await interaction.reply({
            content: "There was an error while executing this command!",
            ephemeral: true,
        });
    }
});
client.login(process.env.DISCORD_TOKEN);
