import guessGameConfig from '../../config/guessGame.js';
import { logger } from '../../utils/logger.js';
import { listScheduledGuilds, getGuildSettings } from '../guessGameStore.js';
import { hasActiveRound } from '../guessGameStore.js';
import { startRound } from './guessGame.js';

const defaultIntervalMinutes = guessGameConfig.defaultIntervalMinutes;

/** @type {Map<string, NodeJS.Timeout>} */
const guildTimers = new Map();

function msUntilNextRun(settings) {
  const intervalMs = (settings.interval_minutes || defaultIntervalMinutes) * 60 * 1000;
  const lastEnded = settings.last_round_ended_at;
  if (!lastEnded) return 0;
  const elapsed = Date.now() - lastEnded;
  return Math.max(0, intervalMs - elapsed);
}

function clearGuildTimer(guildId) {
  const existing = guildTimers.get(guildId);
  if (existing) {
    clearTimeout(existing);
    guildTimers.delete(guildId);
  }
}

async function runScheduledRound(client, guildId) {
  clearGuildTimer(guildId);

  const settings = await getGuildSettings(client, guildId);
  if (!settings?.game_channel_id || settings.enabled !== 1) return;

  if (await hasActiveRound(client, guildId)) {
    scheduleNextRound(client, guildId, { delayMs: 5 * 60 * 1000 });
    return;
  }

  const channel = await client.channels.fetch(settings.game_channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logger.warn(`Guess game channel missing for guild ${guildId}`);
    return;
  }

  const result = await startRound(client, guildId, channel);
  if (!result.ok) {
    if (result.reason === 'permissions') {
      logger.warn(`Missing permissions in guess game channel for guild ${guildId}`);
    }
    scheduleNextRound(client, guildId, { delayMs: 10 * 60 * 1000 });
    return;
  }

  logger.info(`Started guess round in guild ${guildId}`);
}

function computeScheduleDelayMs(settings, options = {}) {
  if (options.delayMs !== undefined) {
    return options.delayMs;
  }

  if (settings.last_round_ended_at == null) {
    return guessGameConfig.firstRoundDelayMs ?? 0;
  }

  const until = msUntilNextRun(settings);
  if (until > 0) {
    return until;
  }

  return (settings.interval_minutes || defaultIntervalMinutes) * 60 * 1000;
}

export function cancelGuildSchedule(guildId) {
  clearGuildTimer(guildId);
}

export async function scheduleNextRound(client, guildId, options = {}) {
  clearGuildTimer(guildId);

  const settings = await getGuildSettings(client, guildId);
  if (!settings?.game_channel_id || settings.enabled !== 1) return;

  const delayMs = computeScheduleDelayMs(settings, options);

  const timer = setTimeout(() => {
    runScheduledRound(client, guildId).catch((err) => {
      logger.error(`Scheduled guess round failed for ${guildId}: ${err.message}`);
    });
  }, delayMs);

  guildTimers.set(guildId, timer);
}

export async function startGuessScheduler(client) {
  for (const settings of await listScheduledGuilds(client)) {
    const delay = msUntilNextRun(settings);
    await scheduleNextRound(client, settings.guild_id, { delayMs: delay });
    logger.info(
      `Scheduled guess game for guild ${settings.guild_id} in ${Math.round(delay / 60000)} min`,
    );
  }
}

export function stopGuessScheduler() {
  for (const guildId of guildTimers.keys()) {
    clearGuildTimer(guildId);
  }
}
