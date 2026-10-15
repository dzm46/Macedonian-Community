import { getLeaderboardCount, getLeaderboardPage } from '../guessGameStore.js';
import { createLeaderboardContainer, LEADERBOARD_PAGE_SIZE } from '../utils/components.js';
import { componentsV2Payload } from '../utils/replies.js';

export const LEADERBOARD_BUTTON_PREFIX = 'guess_lb';

export function parseLeaderboardButtonId(customId) {
  if (!customId.startsWith(`${LEADERBOARD_BUTTON_PREFIX}:`)) return null;

  const parts = customId.split(':');
  if (parts.length !== 3) return null;

  const guildId = parts[1];
  const page = Number(parts[2]);
  if (!guildId || !Number.isInteger(page) || page < 1) return null;

  return { guildId, page };
}

export async function handleLeaderboardButton(interaction, client) {
  const parsed = parseLeaderboardButtonId(interaction.customId);
  if (!parsed || parsed.guildId !== interaction.guild?.id) {
    return false;
  }

  const totalCount = await getLeaderboardCount(client, interaction.guild.id);
  const totalPages = Math.max(1, Math.ceil(totalCount / LEADERBOARD_PAGE_SIZE));
  const page = Math.min(parsed.page, totalPages);

  const rows = await getLeaderboardPage(client, interaction.guild.id, page, LEADERBOARD_PAGE_SIZE);
  const container = createLeaderboardContainer(rows, {
    guildId: interaction.guild.id,
    page,
    totalCount,
  });

  await interaction.update(componentsV2Payload(container));
  return true;
}

export function isLeaderboardButton(customId) {
  return customId?.startsWith(`${LEADERBOARD_BUTTON_PREFIX}:`);
}
