import guessGameConfig from '../../config/guessGame.js';
import { logger } from '../../utils/logger.js';
import { getGuildSettings, listActiveRounds, tryExpireRound } from '../guessGameStore.js';
import { closeRoundPromptMessage } from './guessGame.js';
import { createGuessTimeoutContainer } from '../utils/components.js';
import { sendComponentsV2 } from '../utils/replies.js';

/** @type {Map<string, NodeJS.Timeout>} */
const roundExpiryTimers = new Map();

export function getRoundDurationMs() {
  return (guessGameConfig.roundDurationSeconds || 60) * 1000;
}

export function clearRoundExpiry(guildId) {
  const timer = roundExpiryTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    roundExpiryTimers.delete(guildId);
  }
}

export async function handleRoundExpired(client, guildId) {
  roundExpiryTimers.delete(guildId);

  const now = Date.now();
  const claim = await tryExpireRound(client, guildId, now);

  if (!claim.ok) {
    if (claim.reason === 'not_yet' && claim.expiresAt) {
      scheduleRoundExpiry(client, guildId, claim.expiresAt);
    }
    return;
  }

  const secret = claim.round.secret_number;
  const promptMessageId = claim.round.prompt_message_id;

  const settings = await getGuildSettings(client, guildId);
  if (!settings?.game_channel_id) {
    return;
  }

  const channel = await client.channels.fetch(settings.game_channel_id).catch(() => null);

  if (channel?.isTextBased()) {
    await closeRoundPromptMessage(channel, promptMessageId, 'expired');
  }

  if (settings.enabled === 1 && channel?.isTextBased()) {
    try {
      await sendComponentsV2(channel, createGuessTimeoutContainer({ secret }));
    } catch (err) {
      logger.warn(`Could not send guess timeout message in ${channel.id}: ${err.message}`);
    }
  }

  if (settings.enabled === 1) {
    const { scheduleNextRound } = await import('./guessScheduler.js');
    await scheduleNextRound(client, guildId);
  }

  logger.info(`Guess round timed out in guild ${guildId} (answer: ${secret})`);
}

export function scheduleRoundExpiry(client, guildId, expiresAt) {
  clearRoundExpiry(guildId);

  const delayMs = Math.max(0, expiresAt - Date.now());
  const timer = setTimeout(() => {
    handleRoundExpired(client, guildId).catch((err) => {
      logger.error(`Guess round expiry failed for ${guildId}: ${err.message}`);
    });
  }, delayMs);

  roundExpiryTimers.set(guildId, timer);
}

export async function restoreRoundTimers(client) {
  for (const row of await listActiveRounds(client)) {
    const expiresAt =
      row.expires_at ?? row.started_at + getRoundDurationMs();
    scheduleRoundExpiry(client, row.guild_id, expiresAt);
  }
}
