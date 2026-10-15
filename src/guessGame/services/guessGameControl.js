import {
  getGuildSettings,
  setGuildEnabled,
  isGameEnabled,
} from '../guessGameStore.js';
import { cancelGuildSchedule } from './guessScheduler.js';
import { hasActiveRound } from '../guessGameStore.js';
import { abortActiveRound, startRound } from './guessGame.js';

export async function disableGuessGame(client, guildId) {
  cancelGuildSchedule(guildId);
  await abortActiveRound(client, guildId, { closeReason: 'ended', markEnded: false });
  await setGuildEnabled(client, guildId, false);
}

export async function adminForceStartRound(client, guildId) {
  const settings = await getGuildSettings(client, guildId);
  if (!settings?.game_channel_id) {
    return { ok: false, reason: 'not_setup' };
  }

  if (!isGameEnabled(settings)) {
    await setGuildEnabled(client, guildId, true);
  }

  cancelGuildSchedule(guildId);

  if (await hasActiveRound(client, guildId)) {
    await abortActiveRound(client, guildId, { closeReason: 'ended', markEnded: false });
  }

  const channel = await client.channels.fetch(settings.game_channel_id).catch(() => null);
  if (!channel?.isTextBased()) {
    return { ok: false, reason: 'channel' };
  }

  return startRound(client, guildId, channel);
}
