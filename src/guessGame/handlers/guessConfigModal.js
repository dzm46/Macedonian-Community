import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  RadioGroupBuilder,
  RadioGroupOptionBuilder,
} from 'discord.js';
import guessGameConfig from '../../config/guessGame.js';
import {
  getGuildSettings,
  isGameEnabled,
  setGuildChannel,
  setGuildEnabled,
} from '../guessGameStore.js';
import { scheduleNextRound } from '../services/guessScheduler.js';
import { disableGuessGame } from '../services/guessGameControl.js';
import { createNoticeContainer, createSetupSummaryContainer } from '../utils/components.js';
import { replyEphemeral } from '../utils/replies.js';

export const GUESS_CONFIG_MODAL_ID = 'guess_config_modal';
export const FIELD_CHANNEL = 'guess_config_channel';
export const FIELD_ENABLED = 'guess_config_enabled';
export const FIELD_INTERVAL = 'guess_config_interval';

const ENABLED_VALUE = 'enabled';
const DISABLED_VALUE = 'disabled';

export function buildGuessConfigModal(settings) {
  const { minIntervalMinutes, maxIntervalMinutes } = guessGameConfig;
  const interval = settings?.interval_minutes ?? guessGameConfig.defaultIntervalMinutes;
  const enabledSelected = isGameEnabled(settings);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(FIELD_CHANNEL)
    .setPlaceholder('Choose a text channel')
    .setRequired(true)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  if (settings?.game_channel_id) {
    channelSelect.setDefaultChannels(settings.game_channel_id);
  }

  const channelLabel = new LabelBuilder()
    .setLabel('Game channel')
    .setDescription('Rounds are posted in this channel.')
    .setChannelSelectMenuComponent(channelSelect);

  const enabledRadio = new RadioGroupBuilder()
    .setCustomId(FIELD_ENABLED)
    .setRequired(true)
    .addOptions(
      new RadioGroupOptionBuilder()
        .setLabel('Enabled')
        .setDescription('Scheduled guess rounds run in the game channel.')
        .setValue(ENABLED_VALUE)
        .setDefault(enabledSelected),
      new RadioGroupOptionBuilder()
        .setLabel('Disabled')
        .setDescription('Stops the current round and schedule. Use /guess gamestart to run a round and turn the game back on.')
        .setValue(DISABLED_VALUE)
        .setDefault(!enabledSelected),
    );

  const enabledLabel = new LabelBuilder()
    .setLabel('Game status')
    .setDescription('Pick one: the game is either on or off.')
    .setRadioGroupComponent(enabledRadio);

  const intervalInput = new TextInputBuilder()
    .setCustomId(FIELD_INTERVAL)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(String(interval));

  const intervalLabel = new LabelBuilder()
    .setLabel(`Round interval (${minIntervalMinutes} to ${maxIntervalMinutes})`)
    .setDescription('Enter a whole number in minutes only.')
    .setTextInputComponent(intervalInput);

  return new ModalBuilder()
    .setCustomId(GUESS_CONFIG_MODAL_ID)
    .setTitle('Guess game settings')
    .addLabelComponents(channelLabel, intervalLabel, enabledLabel);
}

export async function handleGuessConfigModalSubmit(interaction, client) {
  const existing = await getGuildSettings(client, interaction.guild.id);
  if (!existing?.game_channel_id) {
    await replyEphemeral(
      interaction,
      createNoticeContainer(
        'Setup required',
        'The guess game has not been set up yet.\nRun **`/guess setup`** first with a channel and interval.',
      ),
    );
    return;
  }

  const channelId = interaction.fields.getSelectedChannels(FIELD_CHANNEL).first()?.id;
  if (!channelId) {
    await replyEphemeral(
      interaction,
      createNoticeContainer('Channel required', 'Choose a text channel for the game.'),
    );
    return;
  }

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    await replyEphemeral(
      interaction,
      createNoticeContainer('Invalid channel', 'That channel cannot be used for the game.'),
    );
    return;
  }

  const me = interaction.guild.members.me;
  const perms = channel.permissionsFor(me);
  const needed = ['ViewChannel', 'SendMessages', 'AddReactions'];
  const missing = needed.filter((p) => !perms?.has(p));
  if (missing.length) {
    await replyEphemeral(
      interaction,
      createNoticeContainer(
        'Missing permissions',
        `I need **${missing.join(', ')}** in ${channel}.`,
      ),
    );
    return;
  }

  const enabledChoice = interaction.fields.getRadioGroup(FIELD_ENABLED);
  const enabled = enabledChoice === ENABLED_VALUE;

  const intervalRaw = interaction.fields.getTextInputValue(FIELD_INTERVAL).trim();
  const interval = Number(intervalRaw);
  if (
    !Number.isInteger(interval)
    || interval < guessGameConfig.minIntervalMinutes
    || interval > guessGameConfig.maxIntervalMinutes
  ) {
    await replyEphemeral(
      interaction,
      createNoticeContainer(
        'Invalid interval',
        `Use a whole number of **minutes** between **${guessGameConfig.minIntervalMinutes}** and **${guessGameConfig.maxIntervalMinutes}**.`,
      ),
    );
    return;
  }

  await setGuildChannel(client, interaction.guild.id, channelId, interval, guessGameConfig);

  if (enabled) {
    await setGuildEnabled(client, interaction.guild.id, true);
    await scheduleNextRound(client, interaction.guild.id);
  } else {
    await disableGuessGame(client, interaction.guild.id);
  }

  const updated = await getGuildSettings(client, interaction.guild.id);

  await replyEphemeral(
    interaction,
    createSetupSummaryContainer({
      status: updated.enabled ? 'on' : 'off',
      channelMention: `${channel}`,
      intervalMinutes: updated.interval_minutes,
    }),
  );
}
