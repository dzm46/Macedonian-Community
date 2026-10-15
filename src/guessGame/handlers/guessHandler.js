import { handleGuess } from '../services/guessGame.js';
import { scheduleNextRound } from '../services/guessScheduler.js';
import { createGuessWinContainer } from '../utils/components.js';
import { sendComponentsV2 } from '../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleGuessMessage(client, message) {
  const result = await handleGuess(client, message);
  if (!result) return false;

  if (result.outcome === 'win') {
    const channel = message.channel;

    try {
      await sendComponentsV2(
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

    await scheduleNextRound(client, message.guild.id);
  }

  // Only the user's guess message is deleted; bot messages are never touched.
  await message.delete().catch((err) => {
    logger.warn(`Could not delete guess message ${message.id}: ${err.message}`);
  });

  return true;
}
