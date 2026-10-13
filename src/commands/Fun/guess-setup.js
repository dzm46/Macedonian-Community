import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import config from '../../config/bot.js';
import { replyEphemeral } from '../../utils/replies.js';
import { createNoticeContainer, createSetupSummaryContainer } from '../../utils/components.js';
import {
  getGuildSettings,
  setGuildChannel,
  setGuildEnabled,
} from '../../services/guildSettings.js';
import { scheduleNextRound } from '../../services/guessScheduler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('guess-setup')
    .setDescription('One-time setup for the guess-the-number game')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Text channel where rounds are posted')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('interval_minutes')
        .setDescription('Minutes between rounds (5 to 120)')
        .setMinValue(config.guessGame.minIntervalMinutes)
        .setMaxValue(config.guessGame.maxIntervalMinutes)
        .setRequired(true)
    ),
  category: 'Fun',

  // The repo's interaction handler calls execute(interaction, guildConfig, client).
  async execute(interaction, guildConfig, client) {
    const existing = getGuildSettings(interaction.guild.id);
    if (existing?.game_channel_id) {
      await replyEphemeral(
        interaction,
        createNoticeContainer(
          'Setup already done',
          'Use **`/guess-config`** to change the settings.'
        )
      );
      return;
    }

    const channel = interaction.options.getChannel('channel');
    const interval = interaction.options.getInteger('interval_minutes');

    const me = interaction.guild.members.me;
    const perms = channel.permissionsFor(me);
    const needed = ['ViewChannel', 'SendMessages', 'AddReactions'];
    const missing = needed.filter((p) => !perms?.has(p));
    if (missing.length) {
      await replyEphemeral(
        interaction,
        createNoticeContainer(
          'Missing permissions',
          `I need these permissions in ${channel}: **${missing.join(', ')}**.`
        )
      );
      return;
    }

    setGuildChannel(interaction.guild.id, channel.id, interval);
    setGuildEnabled(interaction.guild.id, true);
    scheduleNextRound(client, interaction.guild.id);

    const updated = getGuildSettings(interaction.guild.id);
    await replyEphemeral(
      interaction,
      createSetupSummaryContainer({
        status: 'on',
        channelMention: `${channel}`,
        intervalMinutes: updated.interval_minutes,
      })
    );
  },
};
