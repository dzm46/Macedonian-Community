import { Mutex } from '../utils/mutex.js';
import guessGameConfig from '../config/guessGame.js';

const SETTINGS_PREFIX = 'guessGame:settings:';
const RUNTIME_PREFIX = 'guessGame:runtime:';
const SCORES_PREFIX = 'guessGame:scores:';

function settingsKey(guildId) {
  return `${SETTINGS_PREFIX}${guildId}`;
}

function runtimeKey(guildId) {
  return `${RUNTIME_PREFIX}${guildId}`;
}

function scoresKey(guildId) {
  return `${SCORES_PREFIX}${guildId}`;
}

async function getSettings(client, guildId) {
  return (await client.db.get(settingsKey(guildId), null)) || null;
}

async function saveSettings(client, guildId, settings) {
  await client.db.set(settingsKey(guildId), settings);
  return settings;
}

async function getRuntime(client, guildId) {
  const runtime = await client.db.get(runtimeKey(guildId), null);
  if (!runtime) {
    return { round: null, attempts: {} };
  }
  return {
    round: runtime.round ?? null,
    attempts: runtime.attempts && typeof runtime.attempts === 'object' ? { ...runtime.attempts } : {},
  };
}

async function saveRuntime(client, guildId, runtime) {
  await client.db.set(runtimeKey(guildId), {
    round: runtime.round ?? null,
    attempts: runtime.attempts ?? {},
  });
}

async function getScoresMap(client, guildId) {
  const scores = await client.db.get(scoresKey(guildId), null);
  return scores && typeof scores === 'object' ? { ...scores } : {};
}

async function saveScoresMap(client, guildId, scores) {
  await client.db.set(scoresKey(guildId), scores);
}

export async function getGuildSettings(client, guildId) {
  return getSettings(client, guildId);
}

export function isGameEnabled(settings) {
  if (!settings) return true;
  return Number(settings.enabled) === 1;
}

export function resolveRoundDurationSeconds(settings) {
  const value = Number(settings?.round_duration_seconds);
  const minSeconds = guessGameConfig.minRoundDurationMinutes * 60;
  const maxSeconds = guessGameConfig.maxRoundDurationMinutes * 60;
  if (Number.isInteger(value) && value >= minSeconds && value <= maxSeconds) {
    return value;
  }
  return guessGameConfig.defaultRoundDurationSeconds;
}

export async function getRoundDurationMs(client, guildId) {
  const settings = await getGuildSettings(client, guildId);
  return resolveRoundDurationSeconds(settings) * 1000;
}

export async function upsertGuildSettings(client, guildId, patch) {
  const existing = (await getSettings(client, guildId)) || {};
  const next = {
    guild_id: guildId,
    game_channel_id: existing.game_channel_id ?? null,
    interval_minutes: existing.interval_minutes ?? 30,
    round_duration_seconds:
      existing.round_duration_seconds ?? guessGameConfig.defaultRoundDurationSeconds,
    enabled: existing.enabled ?? 1,
    last_round_ended_at: existing.last_round_ended_at ?? null,
    ...patch,
  };
  return saveSettings(client, guildId, next);
}

export async function setGuildChannel(
  client,
  guildId,
  channelId,
  intervalMinutes,
  config,
  roundDurationSeconds,
) {
  const existing = await getSettings(client, guildId);
  const interval =
    intervalMinutes ??
    existing?.interval_minutes ??
    config.defaultIntervalMinutes;
  const duration =
    roundDurationSeconds ??
    existing?.round_duration_seconds ??
    config.defaultRoundDurationSeconds;
  const enabled = existing != null ? Number(existing.enabled) === 1 : 1;

  return upsertGuildSettings(client, guildId, {
    game_channel_id: channelId,
    interval_minutes: interval,
    round_duration_seconds: duration,
    enabled: enabled ? 1 : 0,
    last_round_ended_at: existing?.last_round_ended_at ?? null,
  });
}

export async function setGuildInterval(client, guildId, intervalMinutes) {
  const existing = await getSettings(client, guildId);
  if (!existing) {
    return upsertGuildSettings(client, guildId, {
      game_channel_id: null,
      interval_minutes: intervalMinutes,
      round_duration_seconds: guessGameConfig.defaultRoundDurationSeconds,
      enabled: 0,
      last_round_ended_at: null,
    });
  }

  return upsertGuildSettings(client, guildId, {
    game_channel_id: existing.game_channel_id,
    interval_minutes: intervalMinutes,
    round_duration_seconds: existing.round_duration_seconds,
    enabled: existing.enabled,
    last_round_ended_at: existing.last_round_ended_at,
  });
}

export async function setGuildEnabled(client, guildId, enabled) {
  const existing = await getSettings(client, guildId);
  if (!existing) return;

  return upsertGuildSettings(client, guildId, {
    game_channel_id: existing.game_channel_id,
    interval_minutes: existing.interval_minutes,
    round_duration_seconds: existing.round_duration_seconds,
    enabled: enabled ? 1 : 0,
    last_round_ended_at: existing.last_round_ended_at,
  });
}

export async function markRoundEnded(client, guildId, timestamp = Date.now()) {
  const existing = await getSettings(client, guildId);
  if (!existing) return;

  return upsertGuildSettings(client, guildId, {
    game_channel_id: existing.game_channel_id,
    interval_minutes: existing.interval_minutes,
    round_duration_seconds: existing.round_duration_seconds,
    enabled: existing.enabled,
    last_round_ended_at: timestamp,
  });
}

export async function listScheduledGuilds(client) {
  const keys = (await client.db.list(SETTINGS_PREFIX)) || [];
  const guilds = [];

  for (const key of keys) {
    const guildId = key.slice(SETTINGS_PREFIX.length);
    const settings = await getSettings(client, guildId);
    if (settings?.game_channel_id && Number(settings.enabled) === 1) {
      guilds.push({ ...settings, guild_id: settings.guild_id || guildId });
    }
  }

  return guilds;
}

export async function getActiveRound(client, guildId) {
  const runtime = await getRuntime(client, guildId);
  return runtime.round;
}

export async function hasActiveRound(client, guildId) {
  return Boolean(await getActiveRound(client, guildId));
}

export async function insertRound(client, guildId, round) {
  const runtime = await getRuntime(client, guildId);
  runtime.round = round;
  runtime.attempts = {};
  await saveRuntime(client, guildId, runtime);
}

export async function deleteRound(client, guildId) {
  const runtime = await getRuntime(client, guildId);
  runtime.round = null;
  await saveRuntime(client, guildId, runtime);
}

export async function clearAttempts(client, guildId) {
  const runtime = await getRuntime(client, guildId);
  runtime.attempts = {};
  await saveRuntime(client, guildId, runtime);
}

export async function incrementAttempts(client, guildId, userId) {
  const runtime = await getRuntime(client, guildId);
  const next = (runtime.attempts[userId] || 0) + 1;
  runtime.attempts[userId] = next;
  await saveRuntime(client, guildId, runtime);
  return next;
}

export async function getUserStats(client, guildId, userId) {
  const scores = await getScoresMap(client, guildId);
  const row = scores[userId];
  return {
    points: row?.points ?? 0,
    wins: row?.wins ?? 0,
    rounds_played: row?.rounds_played ?? 0,
    total_guesses: row?.total_guesses ?? 0,
  };
}

function defaultScoreRow() {
  return { points: 0, wins: 0, rounds_played: 0, total_guesses: 0, left_at: null };
}

export async function recordGuessStats(client, guildId, userId, attemptsInRound) {
  await markScoreMemberActive(client, guildId, userId);
  const scores = await getScoresMap(client, guildId);
  const row = { ...defaultScoreRow(), ...(scores[userId] || {}) };
  row.total_guesses += 1;
  if (attemptsInRound === 1) {
    row.rounds_played += 1;
  }
  scores[userId] = row;
  await saveScoresMap(client, guildId, scores);
}

export async function awardWinScore(client, guildId, userId, points) {
  const scores = await getScoresMap(client, guildId);
  const row = { ...defaultScoreRow(), ...(scores[userId] || {}) };
  row.points += points;
  row.wins += 1;
  row.left_at = null;
  scores[userId] = row;
  await saveScoresMap(client, guildId, scores);
}

export async function markScoreMemberLeft(client, guildId, userId, timestamp = Date.now()) {
  const scores = await getScoresMap(client, guildId);
  if (!scores[userId]) return;
  scores[userId] = { ...scores[userId], left_at: timestamp };
  await saveScoresMap(client, guildId, scores);
}

export async function markScoreMemberActive(client, guildId, userId) {
  const scores = await getScoresMap(client, guildId);
  if (!scores[userId]) return;
  scores[userId] = { ...scores[userId], left_at: null };
  await saveScoresMap(client, guildId, scores);
}

function scoreSortKey(row) {
  return `${row.points}\0${row.wins}\0${row.total_guesses}`;
}

function assignCompetitionRanks(rows) {
  let rank = 0;
  let index = 0;
  let prevKey = null;

  return rows.map((row) => {
    index += 1;
    const key = scoreSortKey(row);
    if (key !== prevKey) {
      rank = index;
      prevKey = key;
    }
    return { ...row, rank };
  });
}

export async function getLeaderboardCount(client, guildId) {
  const scores = await getScoresMap(client, guildId);
  return Object.values(scores).filter((row) => row.left_at == null).length;
}

export async function getLeaderboardPage(client, guildId, page, pageSize = 10) {
  const scores = await getScoresMap(client, guildId);
  const rows = Object.entries(scores)
    .filter(([, row]) => row.left_at == null)
    .map(([user_id, row]) => ({
      user_id,
      points: row.points ?? 0,
      wins: row.wins ?? 0,
      total_guesses: row.total_guesses ?? 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.total_guesses - a.total_guesses;
    });

  const ranked = assignCompetitionRanks(rows);
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * pageSize;
  return ranked.slice(offset, offset + pageSize);
}

export async function getUserRank(client, guildId, userId) {
  const stats = await getUserStats(client, guildId, userId);
  if (stats.points === 0 && stats.wins === 0 && stats.total_guesses === 0) {
    return null;
  }

  const scores = await getScoresMap(client, guildId);
  const row = scores[userId];
  if (row?.left_at != null) {
    return null;
  }

  const ranked = assignCompetitionRanks(
    Object.entries(scores)
      .filter(([, entry]) => entry.left_at == null)
      .map(([id, entry]) => ({
        user_id: id,
        points: entry.points ?? 0,
        wins: entry.wins ?? 0,
        total_guesses: entry.total_guesses ?? 0,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.total_guesses - a.total_guesses;
      }),
  );

  const match = ranked.find((entry) => entry.user_id === userId);
  return match?.rank ?? null;
}

export async function listActiveRounds(client) {
  const keys = (await client.db.list(RUNTIME_PREFIX)) || [];
  const rounds = [];

  for (const key of keys) {
    const guildId = key.slice(RUNTIME_PREFIX.length);
    const runtime = await getRuntime(client, guildId);
    if (runtime.round) {
      rounds.push({ guild_id: guildId, ...runtime.round });
    }
  }

  return rounds;
}

export async function listScoreUserIds(client, guildId) {
  const scores = await getScoresMap(client, guildId);
  return Object.keys(scores).map((user_id) => ({ user_id }));
}

export async function tryWinRound(client, guildId, userId, attempts, now) {
  return Mutex.runExclusive(`guessGame:round:${guildId}`, async () => {
    const runtime = await getRuntime(client, guildId);
    const round = runtime.round;
    if (!round) {
      return { ok: false, reason: 'no_round' };
    }
    if (now > round.expires_at) {
      return { ok: false, reason: 'expired' };
    }

    runtime.round = null;
    runtime.attempts = {};
    await saveRuntime(client, guildId, runtime);
    await markRoundEnded(client, guildId, now);

    const points = computeGuessPoints(attempts);
    await awardWinScore(client, guildId, userId, points);

    return { ok: true, round, points };
  });
}

export async function tryExpireRound(client, guildId, now) {
  return Mutex.runExclusive(`guessGame:round:${guildId}`, async () => {
    const runtime = await getRuntime(client, guildId);
    const round = runtime.round;
    if (!round) {
      return { ok: false, reason: 'no_round' };
    }
    if (now < round.expires_at) {
      return { ok: false, reason: 'not_yet', expiresAt: round.expires_at };
    }

    runtime.round = null;
    runtime.attempts = {};
    await saveRuntime(client, guildId, runtime);
    await markRoundEnded(client, guildId, now);

    return { ok: true, round };
  });
}

export function computeGuessPoints(attempts) {
  const { pointsBase, pointsBonusMax } = guessGameConfig;
  const bonus = Math.max(0, pointsBonusMax - (attempts - 1));
  return pointsBase + bonus;
}
