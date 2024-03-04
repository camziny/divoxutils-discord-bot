const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const {
  bold,
  italic,
  strikethrough,
  underscore,
  spoiler,
  quote,
  blockQuote,
} = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("user-characters")
  .setDescription("Get characters for a user")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the user")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("realm")
      .setDescription("The realm of the characters")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("classtype")
      .setDescription("The class type of the characters")
      .setRequired(false)
  );

const classTypeMapping = {
  tanks: "tank",
  casters: "caster",
  supports: "support",
  stealthers: "stealth",
};

function toSingularClassType(classType) {
  return classType
    ? classTypeMapping[classType.toLowerCase()] || classType
    : "";
}

async function execute(interaction) {
  const name = interaction.options.getString("name");
  const realm = interaction.options.getString("realm");
  const classType = toSingularClassType(
    interaction.options.getString("classtype")
  );
  let queryParams = [];
  if (realm) queryParams.push(`realm=${realm}`);
  if (classType) queryParams.push(`classType=${classType}`);
  const queryString = queryParams.join("&");

  const apiUrl = `${process.env.API_URL}/users/characters/${name}${
    queryString ? `?${queryString}` : ""
  }`;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        "x-api-key": process.env.API_KEY,
      },
    });
    const data = response.data;

    if (data.characters.length > 0) {
      const embed = new EmbedBuilder().setColor("#6366f1").addFields(
        {
          name: "Results for:",
          value: bold(
            `${data.user} ${realm || ""} ${
              classType.charAt(0).toUpperCase() + classType.slice(1)
            }`
          ),
        },
        ...data.characters.map((char) => ({
          name: char.characterName,
          value: `${char.className}\n ${char.formattedRank}`,
        }))
      );

      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply(
        `No characters found for ${name} in realm ${
          realm || "any"
        } with class type ${classType || "any"}.`
      );
    }
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "Error: Please check your inputs and try again.",
      ephemeral: true,
    });
  }
}

module.exports = { data, execute };
