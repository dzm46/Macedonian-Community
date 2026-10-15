import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import guessGameConfig, {
  roundDurationMinutesToSeconds,
  roundDurationSecondsToMinutes,
} from '../../config/guessGame.js';
import { resolveRoundDurationSeconds } from '../../guessGame/guessGameStore.js';
import { replyEphemeral, deferEphemeralV2, replyPublicV2 } from '../../guessGame/utils/replies.js';
import {
  createNoticeContainer,
  createSetupSummaryContainer,
  createLeaderboardContainer,
  createProfileContainer,
  LEADERBOARD_PAGE_SIZE,
} from '../../guessGame/utils/components.js';
import {
  getGuildSettings,
  setGuildChannel,
  setGuildEnabled,
  getLeaderboardCount,
  getLeaderboardPage,
  getUserStats,
  getUserRank,
} from '../../guessGame/guessGameStore.js';
import { scheduleNextRound } from '../../guessGame/services/guessScheduler.js';
import { buildGuessConfigModal } from '../../guessGame/handlers/guessConfigModal.js';
import { adminForceStartRound } from '../../guessGame/services/guessGameControl.js';

const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

function resolveMemberDisplay(member, user, userId, interaction) {
  if (member?.displayName) {
    return { avatarUrl: member.displayAvatarURL({ size: 256 }) || DEFAULT_AVATAR };
  }
  if (user) {
    return { avatarUrl: user.displayAvatarURL({ size: 256 }) || DEFAULT_AVATAR };
  }
  if (userId === interaction.user.id) {
    return { avatarUrl: interaction.user.displayAvatarURL({ size: 256 }) || DEFAULT_AVATAR };
  }
  return { avatarUrl: DEFAULT_AVATAR };
}

export default {
  data: new SlashCommandBuilder()
    .setName('guess')
    .setDescription('Guess-the-number community game')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('One-time setup for the guess-the-number game')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Text channel where rounds are posted')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('interval_minutes')
            .setDescription('Minutes between rounds (5 to 120)')
            .setMinValue(guessGameConfig.minIntervalMinutes)
            .setMaxValue(guessGameConfig.maxIntervalMinutes)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('round_minutes')
            .setDescription('How long each round lasts (1 to 15 minutes, default 3)')
            .setMinValue(guessGameConfig.minRoundDurationMinutes)
            .setMaxValue(guessGameConfig.maxRoundDurationMinutes)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Edit guess game settings (channel, on/off, interval)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('gamestart')
        .setDescription('Start a guess round now (re-enables the game if disabled)'),
    )
    .addSubcommand((sub) =>
      sub.setName('leaderboard').setDescription('Top guess-the-number scores in this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('profile')
        .setDescription('View guess-game stats for yourself or another member')
        .addUserOption((option) =>
          option
            .setName('member')
            .setDescription('Member to view (leave blank for yourself)')
            .setRequired(false),
        ),
    ),
  category: 'Fun',

  async execute(interaction, _guildConfig, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await replyEphemeral(
          interaction,
          createNoticeContainer('Not allowed', 'You need **Manage Server** to run setup.'),
        );
        return;
      }

      const existing = await getGuildSettings(client, interaction.guild.id);
      if (existing?.game_channel_id) {
        await replyEphemeral(
          interaction,
          createNoticeContainer(
            'Setup already done',
            'The guess game is already configured.\nUse **`/guess config`** to change settings.',
          ),
        );
        return;
      }

      const channel = interaction.options.getChannel('channel');
      const interval = interaction.options.getInteger('interval_minutes');
      const roundMinutes =
        interaction.options.getInteger('round_minutes')
        ?? roundDurationSecondsToMinutes(guessGameConfig.defaultRoundDurationSeconds);
      const me = interaction.guild.members.me;
      const perms = channel.permissionsFor(me);
      const needed = ['ViewChannel', 'SendMessages', 'AddReactions'];
      const missing = needed.filter((p) => !perms?.has(p));

      if (missing.length) {
        await replyEphemeral(
          interaction,
          createNoticeContainer(
            'Missing permissions',
            `I need these permissions in ${channel}: **${missing.join(', ')}**.`,
          ),
        );
        return;
      }

      await setGuildChannel(
        client,
        interaction.guild.id,
        channel.id,
        interval,
        guessGameConfig,
        roundDurationMinutesToSeconds(roundMinutes),
      );
      await setGuildEnabled(client, interaction.guild.id, true);
      await scheduleNextRound(client, interaction.guild.id);

      const updated = await getGuildSettings(client, interaction.guild.id);
      await replyEphemeral(
        interaction,
        createSetupSummaryContainer({
          status: 'on',
          channelMention: `${channel}`,
          intervalMinutes: updated.interval_minutes,
          roundMinutes: roundDurationSecondsToMinutes(resolveRoundDurationSeconds(updated)),
        }),
      );
      return;
    }

    if (sub === 'config') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await replyEphemeral(
          interaction,
          createNoticeContainer('Not allowed', 'You need **Manage Server** to change settings.'),
        );
        return;
      }

      const settings = await getGuildSettings(client, interaction.guild.id);
      if (!settings?.game_channel_id) {
        await replyEphemeral(
          interaction,
          createNoticeContainer(
            'Setup required',
            'Run **`/guess setup`** first with a channel and interval.',
          ),
        );
        return;
      }

      await interaction.showModal(buildGuessConfigModal(settings));
      return;
    }

    if (sub === 'gamestart') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await replyEphemeral(
          interaction,
          createNoticeContainer(
            'Not allowed',
            'You need the **Administrator** permission to use this command.',
          ),
        );
        return;
      }

      const settings = await getGuildSettings(client, interaction.guild.id);
      if (!settings?.game_channel_id) {
        await replyEphemeral(
          interaction,
          createNoticeContainer(
            'Setup required',
            'Run **`/guess setup`** first with a channel and interval.',
          ),
        );
        return;
      }

      const wasDisabled = settings.enabled !== 1;
      const result = await adminForceStartRound(client, interaction.guild.id);

      if (!result.ok) {
        const reason =
          result.reason === 'permissions'
            ? 'I need **View Channel**, **Send Messages**, and **Add Reactions** in the game channel.'
            : result.reason === 'active'
              ? 'A round is already in progress.'
              : 'Could not start a round right now.';
        await replyEphemeral(interaction, createNoticeContainer('Failed', reason));
        return;
      }

      const channel = await interaction.guild.channels
        .fetch(settings.game_channel_id)
        .catch(() => null);

      await replyEphemeral(
        interaction,
        createNoticeContainer(
          'Round started',
          (wasDisabled
            ? 'The game was **re-enabled** and a new round was posted'
            : 'A new round was posted')
            + (channel ? ` in ${channel}.` : '.')
            + '\n\nThe usual interval applies after this round ends.',
        ),
      );
      return;
    }

    if (sub === 'leaderboard') {
      const guildId = interaction.guild.id;
      const totalCount = await getLeaderboardCount(client, guildId);
      const rows = await getLeaderboardPage(client, guildId, 1, LEADERBOARD_PAGE_SIZE);

      await replyPublicV2(
        interaction,
        createLeaderboardContainer(rows, { guildId, page: 1, totalCount }),
      );
      return;
    }

    if (sub === 'profile') {
      await deferEphemeralV2(interaction);

      const selectedUser = interaction.options.getUser('member');
      const userId = selectedUser?.id ?? interaction.user.id;

      if (selectedUser?.bot) {
        await replyEphemeral(
          interaction,
          createNoticeContainer('Invalid member', "Bots don't have guess-game stats."),
        );
        return;
      }

      let member = interaction.guild.members.cache.get(userId);
      if (!member) {
        member = await interaction.guild.members.fetch(userId).catch(() => null);
      }

      const user = selectedUser ?? interaction.user;
      const { avatarUrl } = resolveMemberDisplay(member, user, userId, interaction);
      const stats = await getUserStats(client, interaction.guild.id, userId);
      const rank = await getUserRank(client, interaction.guild.id, userId);

      await replyEphemeral(
        interaction,
        createProfileContainer({
          userId,
          avatarUrl,
          stats,
          rank,
          isSelf: userId === interaction.user.id,
        }),
      );
    }
  },
};
