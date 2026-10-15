import { handleGuessConfigModalSubmit } from '../../../guessGame/handlers/guessConfigModal.js';
import { logger } from '../../../utils/logger.js';
import { createNoticeContainer } from '../../../guessGame/utils/components.js';
import { replyEphemeral } from '../../../guessGame/utils/replies.js';

export default {
  name: 'guess_config_modal',
  async execute(interaction, client) {
    try {
      await handleGuessConfigModalSubmit(interaction, client);
    } catch (error) {
      logger.error('Guess config modal error:', error);
      try {
        await replyEphemeral(
          interaction,
          createNoticeContainer('Error', 'Could not save those settings.'),
        );
      } catch {
        // interaction may have expired
      }
    }
  },
};
