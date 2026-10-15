import { handleGuess } from '../services/guessGame.js';
import { scheduleNextRound } from '../services/guessScheduler.js';
import { createGuessWinContainer } from '../utils/components.js';
import { sendComponentsV2 } from '../utils/replies.js';
import { logger } from '../../utils/logger.js';

const HINT_VISIBLE_MS = 3000;
const WIN_VISIBLE_MS = 5000;

function deleteLater(msg, ms) {
  if (!msg) return;
  setTimeout(() => {
    msg.delete().catch((err) => logger.warn(`Could not delete message ${msg.id}: ${err.message}`));
  }, ms);
}

export async function handleGuessMessage(client, message) {
  const result = await handleGuess(client, message);
  if (!result) return false;

  const hintMessages = result.hintMessages ?? [];

  if (result.outcome === 'win') {
    const channel = message.channel;
    let winMessage = null;

    try {
      winMessage = await sendComponentsV2(
        channel,
        createGuessWinContainer({
          userId: result.userId,
          secret: result.secret,
          attempts: result.attempts,
          points: result.points,
        }),
      );
    } catch (err) {
      logger.warn(`Could not send guess win message in ${channel.id}: ${err.message}`);
    }

    // Schedule cleanup of only the game's own messages; timers do not block the game.
    deleteLater(message, WIN_VISIBLE_MS);
    for (const hint of hintMessages) deleteLater(hint, WIN_VISIBLE_MS);
    deleteLater(winMessage, WIN_VISIBLE_MS);

    await scheduleNextRound(client, message.guild.id);
    return true;
  }

  // high, low, stale, lost_race: show the hint briefly, then clean up.
  deleteLater(message, HINT_VISIBLE_MS);
  for (const hint of hintMessages) deleteLater(hint, HINT_VISIBLE_MS);

  return true;
}
