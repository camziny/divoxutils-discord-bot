"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
require("dotenv/config");
const rest_1 = require("@discordjs/rest");
const v10_1 = require("discord-api-types/v10");
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds],
});
const commands = new discord_js_1.Collection();
const commandsPath = path_1.default.join(__dirname, "commands");
const commandFiles = fs_1.default
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts"));
for (const file of commandFiles) {
    const filePath = path_1.default.join(commandsPath, file);
    const command = await Promise.resolve(`${filePath}`).then(s => __importStar(require(s)));
    commands.set(command.data.name, command);
}
client.once("ready", async () => {
    console.log("Bot is online!");
    const rest = new rest_1.REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log("Started refreshing application (/) commands.");
        await rest.put(v10_1.Routes.applicationCommands(client.user.id), {
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
//# sourceMappingURL=index.js.map