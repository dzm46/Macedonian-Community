const guessGameConfig = {
  defaultIntervalMinutes: Number(process.env.GUESS_INTERVAL_MINUTES || 30),
  minIntervalMinutes: 5,
  maxIntervalMinutes: 120,
  pointsBase: 10,
  pointsBonusMax: 7,
  roundDurationSeconds: Number(process.env.GUESS_ROUND_SECONDS || 60),
  firstRoundDelayMs: Number(process.env.GUESS_FIRST_ROUND_DELAY_MS || 0),
};

export default guessGameConfig;
