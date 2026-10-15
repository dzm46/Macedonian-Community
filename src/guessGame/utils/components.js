import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

export const LEADERBOARD_PAGE_SIZE = 10;
export const LEADERBOARD_BUTTON_PREFIX = 'guess_lb';

export function createGuessPromptContainer({ expiresUnix }) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## 🎲 Guess the number'),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "I'm thinking of a number **from 1 to 100**.\n"
        + 'Reply in this channel with your guess.\n\n'
        + `⏱️ Time left: **<t:${expiresUnix}:R>**\n\n`
        + '⬆️ too low · ⬇️ too high · 🎉 correct',
    ),
  );
  return container;
}

export function createGuessPromptClosedContainer({ reason = 'ended' }) {
  const statusLine =
    reason === 'won'
      ? 'Round ended: **someone got it!** 🎉'
      : reason === 'expired'
        ? 'Round ended: **time ran out.**'
        : '**This round has ended.**';

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## 🎲 Guess the number'),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLine));
  return container;
}

export function createGuessTimeoutContainer({ secret }) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## ⏱️ Time's up!"),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      'Nobody guessed the number in time.\n\n' + `The answer was **${secret}**.`,
    ),
  );
  return container;
}

export function createGuessWinContainer({ userId, secret, attempts, points }) {
  const tries = attempts === 1 ? '**1** try' : `**${attempts}** tries`;
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## 🎉 Winner!'),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `<@${userId}> guessed **${secret}** in ${tries}.\n`
        + `+**${points}** points added to the leaderboard.`,
    ),
  );
  return container;
}

function formatLeaderboardRank(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}.`;
}

function addLeaderboardPaginationButtons(container, guildId, page, totalPages) {
  if (totalPages <= 1) return container;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${LEADERBOARD_BUTTON_PREFIX}:${guildId}:1`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏮️')
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${LEADERBOARD_BUTTON_PREFIX}:${guildId}:${page - 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${LEADERBOARD_BUTTON_PREFIX}:${guildId}:${page + 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('▶️')
      .setDisabled(page >= totalPages),
  );

  container.addActionRowComponents(row);
  return container;
}

export function createLeaderboardContainer(rows, { guildId, page = 1, totalCount = rows.length } = {}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / LEADERBOARD_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Guess game leaderboard'),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (!rows.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('No scores yet: win a round to appear here!'),
    );
    return container;
  }

  const lines = rows.map((row) => {
    const rank = row.rank ?? 0;
    const prefix = formatLeaderboardRank(rank);
    return `${prefix} <@${row.user_id}>: **${row.points}** pts · ${row.wins} win${row.wins === 1 ? '' : 's'}`;
  });

  const footer = totalPages > 1 ? `\n\nPage **${safePage}** of **${totalPages}**` : '';

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(lines.join('\n') + footer),
  );

  if (guildId) {
    addLeaderboardPaginationButtons(container, guildId, safePage, totalPages);
  }

  return container;
}

export function createSetupSummaryContainer({ status, channelMention, intervalMinutes }) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## ⚙️ Guess game configured'),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `Status: **${status}**\n`
        + `Channel: ${channelMention}\n`
        + `Interval: **${intervalMinutes}** minutes\n\n`
        + 'Members send a number **1 to 100**; reactions show if they\'re close.',
    ),
  );
  return container;
}

export function createNoticeContainer(title, body) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return container;
}

export function createProfileContainer({ userId, avatarUrl, stats, rank, isSelf }) {
  const thumbUrl =
    avatarUrl && avatarUrl.startsWith('http')
      ? avatarUrl
      : 'https://cdn.discordapp.com/embed/avatars/0.png';
  let rankLine = 'Leaderboard rank: **n/a**';
  if (rank === 1) {
    rankLine = 'Leaderboard rank: 🥇 **#1**';
  } else if (rank === 2) {
    rankLine = 'Leaderboard rank: 🥈 **#2**';
  } else if (rank === 3) {
    rankLine = 'Leaderboard rank: 🥉 **#3**';
  } else if (rank) {
    rankLine = `Leaderboard rank: **#${rank}**`;
  }

  const profileIntro = isSelf ? '' : `Showing profile for <@${userId}>\n\n`;

  const profileBody =
    `${profileIntro}${rankLine}\n`
    + `Total points: **${stats.points}**\n\n`
    + '**Stats**\n'
    + `Rounds won: **${stats.wins}**\n`
    + `Rounds played: **${stats.rounds_played}**\n`
    + `Total guesses: **${stats.total_guesses}**`;

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Guess Profile'),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(profileBody))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl)),
  );
  return container;
}
