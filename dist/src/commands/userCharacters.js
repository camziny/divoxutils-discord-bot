"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = exports.data = void 0;
const discord_js_1 = require("discord.js");
const axios_1 = __importDefault(require("axios"));
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("getcharacters")
    .setDescription("Get characters for a user")
    .addStringOption((option) => option
    .setName("name")
    .setDescription("The name of the user")
    .setRequired(true));
async function execute(interaction) {
    const name = interaction.options.getString("name");
    try {
        const response = await axios_1.default.get(`${process.env.API_URL}/users/characters/${name}`, {
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
        }
        else {
            await interaction.reply(`No characters found for ${name}.`);
        }
    }
    catch (error) {
        console.error(error);
        await interaction.reply("An error occurred while fetching characters.");
    }
}
exports.execute = execute;
//# sourceMappingURL=userCharacters.js.map