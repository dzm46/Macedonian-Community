import { MessageFlags } from 'discord.js';
import { createNoticeContainer } from './components.js';

export function componentsV2Payload(container, { ephemeral = false } = {}) {
  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) {
    flags |= MessageFlags.Ephemeral;
  }
  return {
    components: [container],
    flags,
  };
}

export async function sendComponentsV2(target, container) {
  return target.send(componentsV2Payload(container));
}

export async function replyEphemeral(interaction, containerOrText) {
  const container =
    typeof containerOrText === 'string'
      ? createNoticeContainer('Guess game', containerOrText)
      : containerOrText;

  const payload = componentsV2Payload(container, { ephemeral: true });

  if (interaction.deferred) {
    return interaction.editReply(payload);
  }
  if (interaction.replied) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

export async function deferEphemeralV2(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}

export async function replyPublicV2(interaction, container) {
  const payload = componentsV2Payload(container, { ephemeral: false });

  if (interaction.deferred) {
    return interaction.editReply(payload);
  }
  if (interaction.replied) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}
