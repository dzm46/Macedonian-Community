const guessGameConfig = {
  defaultIntervalMinutes: Number(process.env.GUESS_INTERVAL_MINUTES || 30),
  minIntervalMinutes: 5,
  maxIntervalMinutes: 120,
  pointsBase: 10,
  pointsBonusMax: 7,
  /** How long each active round lasts before timing out (global default for new setups). */
  defaultRoundDurationSeconds: Number(process.env.GUESS_ROUND_SECONDS || 180),
  minRoundDurationMinutes: 1,
  maxRoundDurationMinutes: 15,
  firstRoundDelayMs: Number(process.env.GUESS_FIRST_ROUND_DELAY_MS || 0),
};

export function roundDurationSecondsToMinutes(seconds) {
  const mins = Math.round(Number(seconds) / 60);
  return Number.isFinite(mins) && mins > 0 ? mins : Math.round(guessGameConfig.defaultRoundDurationSeconds / 60);
}

export function roundDurationMinutesToSeconds(minutes) {
  return minutes * 60;
}

export default guessGameConfig;
