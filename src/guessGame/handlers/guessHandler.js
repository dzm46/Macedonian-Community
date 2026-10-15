import {
  handleGuess,
  deleteLater,
  HINT_DELETE_DELAY_MS,
  WIN_DELETE_DELAY_MS,
} from '../services/guessGame.js';
import { scheduleNextRound } from '../services/guessScheduler.js';
import { createGuessWinContainer } from '../utils/components.js';
import { sendComponentsV2 } from '../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleGuessMessage(client, message) {
  const result = await handleGuess(client, message);
  if (!result) return false;

  const hintMessages = result.hintMessages || [];

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

    // Keep the win message and "Correct!" hint visible for 5s, then clean up
    // together with the user's guess. Not awaited so the game flow continues.
    deleteLater([message, winMessage, ...hintMessages], WIN_DELETE_DELAY_MS);

    await scheduleNextRound(client, message.guild.id);
    return true;
  }

  // Hints and the user's guess are removed 3s after the hint was sent.
  deleteLater([message, ...hintMessages], HINT_DELETE_DELAY_MS);

  return true;
}
