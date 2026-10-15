import { handleLeaderboardButton } from '../../../guessGame/handlers/guessLeaderboardHandler.js';

export default {
  name: 'guess_lb',
  async execute(interaction, client) {
    await handleLeaderboardButton(interaction, client);
  },
};
