const axios = require("axios");

const userModel = require("../api/auth/models");
const {
  sendErrorToLogChannel,
  wait,
  sendInfoMessageToUser,
} = require("../utils");

const checkIfEligibleForRoles = (bot) => {
    checkForAllUsers(bot);
};

const checkForAllUsers = async (bot) => {
  const guild = await bot.guilds?.fetch(process.env.DISCORD_BOT_GUILD_ID);
  const maniacRole = guild.roles?.cache?.find(
    (r) => r.id === `${process.env.DISCORD_BOT_MANIAC_ROLE_ID}`
  );
  const maniaxRole = guild.roles?.cache?.find(
    (r) => r.id === `${process.env.DISCORD_BOT_MANIAX_ROLE_ID}`
  );
  const rarexRole = guild.roles?.cache?.find(
    (r) => r.id === `${process.env.DISCORD_BOT_RAREX_ROLE_ID}`
  );

  const users = await userModel.find({
    discordId: { $exists: true },
    twitterId: { $exists: true },
    isFollowingFromTwitter: true,
    walletAddress: { $exists: true },
  });
  for (let user of users) {
    const { walletAddress, discordId } = user;
    const guildMember = guild.members.cache.get(discordId);

    let teamMember = guildMember.roles.cache.has(
      (roleId) => roleId === process.env.DISCORD_BOT_TEAM_ROLE_ID
    );
    let verified = guildMember.roles.cache.has(
      (roleId) => roleId === process.env.DISCORD_BOT_VERIFIED_ROLE_ID
    );

    if (teamMember || !verified) {
      return;
    }

    try {
      const res = await axios.get(
        `${process.env.MORALIS_API_URL}/${walletAddress}/nft/${process.env.NFT_CONTRACT_ADDRESS}/?chain=${process.env.NFT_CHAIN}&format=decimal`,
        {
          headers: {
            "x-api-key": process.env.MORALIS_WEB3_API_KEY,
          },
        }
      );
      wait(1000);
      const result = res.data?.result;
      if (result) {
        await userModel.findOneAndUpdate(
          { walletAddress },
          { ownedNFTCount: result.length }
        );
      }
      const hasRare = await checkIfRareX({
        bot,
        result,
        guildMember,
        rarexRole,
      });
      await userModel.findOneAndUpdate({ walletAddress }, { hasRare });
      checkIfManiac({ bot, result, guildMember, maniacRole });
      checkIfManiax({ bot, result, guildMember, maniaxRole });
    } catch (e) {
      sendErrorToLogChannel(bot, e.response?.data?.message, e);
    }
  }
};

const checkIfManiac = ({ bot, result, guildMember, maniacRole }) => {
  let isManiac = guildMember?.roles.cache.has(
    (roleId) => roleId === process.env.DISCORD_BOT_MANIAC_ROLE_ID
  );
  const guildMemberId = guildMember.user.id;
  if (result.length === 0 && isManiac) {
    guildMember.roles.remove(maniacRole);
    sendInfoMessageToUser({
      bot,
      message: `<@${guildMemberId}> Your <@&${maniacRole.id}> role has been withdrawn since we cannot find a Maniax NFT in your wallet.`,
    });
  }
  if (result.length >= 1 && !isManiac) {
    guildMember.roles.add(maniacRole);
    sendInfoMessageToUser({
      bot,
      message: `<@${guildMemberId}> You have been promoted with <@&${maniacRole.id}> Role !`,
    });
  }
};

const checkIfManiax = ({ bot, result, guildMember, maniaxRole }) => {
  let isManiax = guildMember?.roles.cache.has(
    (roleId) => roleId === process.env.DISCORD_BOT_MANIAX_ROLE_ID
  );
  const guildMemberId = guildMember.user.id;
  if (result.length < 5 && isManiax) {
    guildMember.roles.remove(maniaxRole);
    sendInfoMessageToUser({
      bot,
      message: `<@${guildMemberId}> Your <@&${maniaxRole.id}> role has been withdrawn since you have less than 5 Maniax NFT`,
    });
  }
  if (result.length >= 5 && !isManiax) {
    guildMember.roles.add(maniaxRole);
    sendInfoMessageToUser({
      bot,
      message: `<@${guildMemberId}> You have been promoted with <@&${maniaxRole.id}> Role!`,
    });
  }
};

const checkIfRareX = async ({ bot, result, guildMember, rarexRole }) => {
  let isRareX = guildMember?.roles.cache.has(
    (roleId) => roleId === process.env.DISCORD_BOT_RAREX_ROLE_ID
  );
  const guildMemberId = guildMember.user.id;
  if (result.length === 0) {
    guildMember.roles.remove(rarexRole);
    return;
  }
  const tokenIds = result.map((res) => res.token_id);
  let hasRare = false;
  for (let tokenId of tokenIds) {
    const metadata = await axios.get(
      `${process.env.MORALIS_NFT_URL}/${process.env.NFT_CONTRACT_ADDRESS}/${tokenId}?chain=${process.env.NFT_CHAIN}&format=decimal&limit=500`,
      {
        headers: {
          "x-api-key": process.env.MORALIS_WEB3_API_KEY,
        },
      }
    );
    const meta = JSON.parse(metadata?.data?.metadata);
    const rarity = meta?.attributes
      ? meta.attributes[meta.attributes.length - 1]?.value
      : undefined;
    if (rarity === "Rare") {
      hasRare = true;
      break;
    }
  }
  if (hasRare && !isRareX) {
    guildMember.roles.add(rarexRole);
    sendInfoMessageToUser({
      bot,
      message: `<@${guildMemberId}> You have been promoted with <@&${rarexRole.id}> Role !`,
    });
  }
  if (!hasRare && isRareX) {
    guildMember.roles.remove(rarexRole);
    sendInfoMessageToUser({
      bot,
      message: `<@${guildMemberId}> Your <@&${rarexRole.id}> role has been withdrawn since we cannot find a Rare NFT in your wallet.`,
    });
  }
  return hasRare;
};

module.exports = checkIfEligibleForRoles;
