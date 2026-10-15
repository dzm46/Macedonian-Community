import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import {
  getGuildSettings,
  getActiveRound,
  hasActiveRound,
  insertRound,
  deleteRound,
  clearAttempts,
  incrementAttempts,
  recordGuessStats,
  getUserStats,
  getUserRank,
  getLeaderboardCount,
  getLeaderboardPage,
  markScoreMemberLeft,
  markScoreMemberActive,
  listScoreUserIds,
  tryWinRound,
  tryExpireRound,
  markRoundEnded,
  computeGuessPoints,
} from '../guessGameStore.js';
import { createGuessPromptContainer, createGuessPromptClosedContainer } from '../utils/components.js';
import { sendComponentsV2, componentsV2Payload } from '../utils/replies.js';

export {
  getUserStats,
  getUserRank,
  getLeaderboardCount,
  getLeaderboardPage,
  markScoreMemberLeft,
  markScoreMemberActive,
  computeGuessPoints,
};

export async function closeRoundPromptMessage(channel, promptMessageId, reason) {
  if (!promptMessageId || !channel?.isTextBased()) return;

  try {
    const promptMessage = await channel.messages.fetch(promptMessageId);
    await promptMessage.edit(
      componentsV2Payload(createGuessPromptClosedContainer({ reason })),
    );
  } catch (err) {
    logger.warn(`Could not update guess round prompt ${promptMessageId}: ${err.message}`);
  }
}

function pickSecret() {
  return crypto.randomInt(1, 101);
}

export function parseGuess(content) {
  const trimmed = content.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || value > 100) return null;
  return value;
}

export async function startRound(client, guildId, channel) {
  if (await hasActiveRound(client, guildId)) {
    return { ok: false, reason: 'active' };
  }

  const me = channel.guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms?.has(['SendMessages', 'AddReactions', 'ViewChannel'])) {
    return { ok: false, reason: 'permissions' };
  }

  const { scheduleRoundExpiry } = await import('./guessRoundTimer.js');
  const { getRoundDurationMs } = await import('../guessGameStore.js');

  const secret = pickSecret();
  const startedAt = Date.now();
  const expiresAt = startedAt + (await getRoundDurationMs(client, guildId));
  const expiresUnix = Math.floor(expiresAt / 1000);

  const prompt = await sendComponentsV2(
    channel,
    createGuessPromptContainer({ expiresUnix }),
  );

  await insertRound(client, guildId, {
    secret_number: secret,
    prompt_message_id: prompt.id,
    started_at: startedAt,
    expires_at: expiresAt,
  });
  await clearAttempts(client, guildId);
  scheduleRoundExpiry(client, guildId, expiresAt);

  if (
    process.env.GUESS_TEST_REVEAL_SECRET === '1'
    || process.env.GUESS_TEST_REVEAL_SECRET === 'true'
  ) {
    logger.info(`TEST guess round started — secret: ${secret} (guild ${guildId})`);
  }

  return { ok: true, secret, messageId: prompt.id };
}

export async function endRound(client, guildId) {
  const { clearRoundExpiry } = await import('./guessRoundTimer.js');
  clearRoundExpiry(guildId);
  await deleteRound(client, guildId);
  await clearAttempts(client, guildId);
  await markRoundEnded(client, guildId);
}

export async function abortActiveRound(client, guildId, options = {}) {
  const { closeReason = 'ended', markEnded = false } = options;
  const { clearRoundExpiry } = await import('./guessRoundTimer.js');

  const round = await getActiveRound(client, guildId);
  clearRoundExpiry(guildId);

  if (!round) {
    return false;
  }

  const settings = await getGuildSettings(client, guildId);
  if (settings?.game_channel_id) {
    const channel = await client.channels.fetch(settings.game_channel_id).catch(() => null);
    if (channel?.isTextBased()) {
      await closeRoundPromptMessage(channel, round.prompt_message_id, closeReason);
    }
  }

  await deleteRound(client, guildId);
  await clearAttempts(client, guildId);
  if (markEnded) {
    await markRoundEnded(client, guildId);
  }

  return true;
}

function isRoundExpired(round) {
  if (!round?.expires_at) return false;
  return Date.now() > round.expires_at;
}

export async function reconcileScoreMembership(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const rows = await listScoreUserIds(client, guildId);
  for (const row of rows) {
    const member = await guild.members.fetch(row.user_id).catch(() => null);
    if (member) {
      await markScoreMemberActive(client, guildId, row.user_id);
    } else {
      await markScoreMemberLeft(client, guildId, row.user_id);
    }
  }
}

async function sendHint(message, text) {
  try {
    await message.channel.send(text);
  } catch (err) {
    logger.warn(`Could not send guess hint in ${message.channel.id}: ${err.message}`);
  }
}

async function handleStaleRound(client, message, round) {
  await sendHint(message, '⏱️ This round has already ended.');
  const { handleRoundExpired } = await import('./guessRoundTimer.js');
  handleRoundExpired(client, message.guild.id).catch((err) => {
    logger.warn(`Expire round after stale guess failed: ${err.message}`);
  });
  return { outcome: 'stale' };
}

export async function handleGuess(client, message) {
  if (message.author.bot || !message.guild) return null;

  const settings = await getGuildSettings(client, message.guild.id);
  if (!settings?.game_channel_id || settings.enabled !== 1) return null;
  if (message.channel.id !== settings.game_channel_id) return null;

  const guess = parseGuess(message.content);
  if (guess === null) return null;

  const guildId = message.guild.id;
  let round = await getActiveRound(client, guildId);
  if (!round) return null;

  if (isRoundExpired(round)) {
    return handleStaleRound(client, message, round);
  }

  const userId = message.author.id;
  const attempts = await incrementAttempts(client, guildId, userId);
  await recordGuessStats(client, guildId, userId, attempts);

  async function sendGuessHint(text) {
    await sendHint(message, text);
    if (guess === 67) {
      await sendHint(message, '😂');
    }
  }

  if (guess > round.secret_number) {
    round = await getActiveRound(client, guildId);
    if (!round || isRoundExpired(round)) {
      return handleStaleRound(client, message, round);
    }
    await sendGuessHint('⬇️ Too high!');
    return { outcome: 'high', attempts };
  }

  if (guess < round.secret_number) {
    round = await getActiveRound(client, guildId);
    if (!round || isRoundExpired(round)) {
      return handleStaleRound(client, message, round);
    }
    await sendGuessHint('⬆️ Too low!');
    return { outcome: 'low', attempts };
  }

  const now = Date.now();
  const claim = await tryWinRound(client, guildId, userId, attempts, now);

  if (!claim.ok) {
    if (claim.reason === 'expired') {
      return handleStaleRound(client, message, round);
    }
    if (claim.reason === 'no_round') {
      await sendHint(message, '⏱️ This round has already ended.');
      return { outcome: 'lost_race' };
    }
    return null;
  }

  const { clearRoundExpiry } = await import('./guessRoundTimer.js');
  clearRoundExpiry(guildId);

  await sendGuessHint('🎉 Correct!');
  await closeRoundPromptMessage(message.channel, claim.round.prompt_message_id, 'won');

  return {
    outcome: 'win',
    attempts,
    points: claim.points,
    secret: claim.round.secret_number,
    userId,
    username: message.author.displayName || message.author.username,
  };
}
