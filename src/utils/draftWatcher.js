const { EmbedBuilder } = require("discord.js");
const axios = require("axios");

const CONVEX_URL = process.env.CONVEX_URL;
const APP_URL = process.env.APP_URL || "https://divoxutils.com";
const activePolls = new Set();

function watchDraft(client, shortId) {
  if (activePolls.has(shortId)) return;
  activePolls.add(shortId);

  const interval = setInterval(async () => {
    try {
      const { data } = await axios.get(
        `${CONVEX_URL}/getDraftStatus?shortId=${shortId}`
      );

      if (data.status !== "setup" && !data.botPostedLink && data.discordTextChannelId) {
        await postPublicLink(client, shortId, data.discordTextChannelId);
        await axios.post(`${CONVEX_URL}/markBotPostedLink`, { shortId });
      }

      if (
        data.status !== "setup" &&
        !data.botNotifiedCaptains &&
        data.team1CaptainId &&
        data.team2CaptainId
      ) {
        await dmCaptains(client, shortId, data);
        await axios.post(`${CONVEX_URL}/markBotNotifiedCaptains`, { shortId });
      }

      if (data.gameStarted && data.status === "complete") {
        clearInterval(interval);
        activePolls.delete(shortId);
        await movePlayersToChannels(client, data, data.discordGuildId);
      }
    } catch (error) {
      console.error(`Error polling draft ${shortId}:`, error.message);
    }
  }, 5000);
}

async function rehydrate(client) {
  try {
    const { data: drafts } = await axios.get(`${CONVEX_URL}/activeDrafts`);
    for (const draft of drafts) {
      console.log(`Re-hydrating watcher for draft ${draft.shortId} (status: ${draft.status})`);
      watchDraft(client, draft.shortId);
    }
    console.log(`Re-hydrated ${drafts.length} active draft watcher(s).`);
  } catch (error) {
    console.error("Error re-hydrating draft watchers:", error.message);
  }
}

async function postPublicLink(client, shortId, textChannelId) {
  try {
    const channel = await client.channels.fetch(textChannelId);
    if (!channel) return;

    const draftUrl = `${APP_URL}/draft/${shortId}`;

    const embed = new EmbedBuilder()
      .setColor("#6366f1")
      .setTitle("Draft is Live")
      .setDescription(`Watch the draft:\n${draftUrl}`);

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Error posting public link for ${shortId}:`, error.message);
  }
}

async function dmCaptains(client, shortId, draftData) {
  const draftUrl = `${APP_URL}/draft/${shortId}`;
  const captainIds = [draftData.team1CaptainId, draftData.team2CaptainId].filter(Boolean);

  for (const captainId of captainIds) {
    const tokenEntry = (draftData.tokens || []).find(
      (t) => t.discordUserId === captainId
    );
    if (!tokenEntry) continue;

    try {
      const user = await client.users.fetch(captainId);
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#6366f1")
            .setTitle("You're a Captain")
            .setDescription(
              `You've been selected as a captain.\n\n[Open Draft](${draftUrl}?token=${tokenEntry.token})`
            )
            .setFooter({
              text: "Do not share this link.",
            }),
        ],
      });
    } catch (error) {
      console.error(`Could not DM captain ${captainId}:`, error.message);
    }
  }
}

async function movePlayersToChannels(client, draftData, guildId) {
  try {
    const { data: settings } = await axios.get(
      `${CONVEX_URL}/guildSettings?guildId=${guildId}`
    );

    if (!settings || !settings.team1ChannelId || !settings.team2ChannelId) {
      console.log(
        `No channel settings for guild ${guildId}, skipping moves.`
      );
      return;
    }

    const guild = await client.guilds.fetch(guildId);

    for (const player of draftData.players) {
      if (!player.team) continue;

      const channelId =
        player.team === 1 ? settings.team1ChannelId : settings.team2ChannelId;

      try {
        const member = await guild.members.fetch(player.discordUserId);
        if (member.voice?.channelId) {
          await member.voice.setChannel(channelId);
        }
      } catch (err) {
        console.error(
          `Could not move ${player.displayName}: ${err.message}`
        );
      }
    }

    console.log(`Moved players for draft in guild ${guildId}`);
  } catch (error) {
    if (error?.response?.status === 404) {
      console.log(
        `No channel settings for guild ${guildId}, skipping moves.`
      );
    } else {
      console.error("Error moving players:", error.message);
    }
  }
}

module.exports = { watchDraft, rehydrate };
