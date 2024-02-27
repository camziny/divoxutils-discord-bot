"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rest_1 = require("@discordjs/rest");
const v10_1 = require("discord-api-types/v10");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const clientId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_TOKEN;
const commands = [];
const commandsPath = path_1.default.join(__dirname, "commands");
const commandFiles = fs_1.default
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts"));
for (const file of commandFiles) {
    const filePath = path_1.default.join(commandsPath, file);
    const command = require(filePath);
    commands.push(command.data.toJSON());
}
const rest = new rest_1.REST({ version: "10" }).setToken(token);
(async () => {
    try {
        console.log("Started refreshing application (/) commands.");
        await rest.put(v10_1.Routes.applicationCommands(clientId), { body: commands });
        console.log("Successfully reloaded application (/) commands.");
    }
    catch (error) {
        console.error(error);
    }
})();
//# sourceMappingURL=deploy-commands.js.map