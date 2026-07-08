import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import {
  Account,
  createAccount,
  findAccountByDiscordId,
  findAccountById,
  findAccountByUsername,
  updateAccountStatus
} from "./db.js";
import { env } from "./env.js";
import { generateInitialPassword, hashPassword } from "./password.js";

const ACCOUNT_SETUP_MODAL_ID = "account_setup_modal";
const INPUT_DISPLAY_NAME = "display_name";
const INPUT_USERNAME = "username";

const ACCOUNT_APPROVE_PREFIX = "account_approve:";
const ACCOUNT_REJECT_PREFIX = "account_reject:";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") {
        await handleSetupCommand(interaction);
        return;
      }

      if (interaction.commandName === "profile") {
        await handleProfileCommand(interaction);
        return;
      }

      if (interaction.commandName === "market") {
        await interaction.reply({
          content: env.webappUrl,
          ephemeral: true
        });
        return;
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === ACCOUNT_SETUP_MODAL_ID) {
      await handleAccountSetupModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith(ACCOUNT_APPROVE_PREFIX)) {
        await handleApproveButton(interaction);
        return;
      }

      if (interaction.customId.startsWith(ACCOUNT_REJECT_PREFIX)) {
        await handleRejectButton(interaction);
        return;
      }
    }
  } catch (error) {
    console.error(error);
    await replyWithError(interaction);
  }
});

async function handleSetupCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "このコマンドはサーバー内で実行してください。",
      ephemeral: true
    });
    return;
  }

  const existing = await findAccountByDiscordId(interaction.user.id);

  if (existing) {
    await interaction.reply({
      content:
        `すでに登録されています。\n` +
        `username: \`${existing.username}\`\n` +
        `status: \`${existing.access_status}\``,
      ephemeral: true
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(ACCOUNT_SETUP_MODAL_ID)
    .setTitle("Marketplace Account Setup");

  const displayNameInput = new TextInputBuilder()
    .setCustomId(INPUT_DISPLAY_NAME)
    .setLabel("Display name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32)
    .setPlaceholder("Riyo");

  const usernameInput = new TextInputBuilder()
    .setCustomId(INPUT_USERNAME)
    .setLabel("Username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(24)
    .setPlaceholder("riyo");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(displayNameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput)
  );

  await interaction.showModal(modal);
}

async function handleProfileCommand(interaction: ChatInputCommandInteraction) {
  const account = await findAccountByDiscordId(interaction.user.id);

  if (!account) {
    await interaction.reply({
      content: "まだ登録されていません。`/setup` を実行してください。",
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content:
      `Marketplace account\n` +
      `username: \`${account.username}\`\n` +
      `display name: \`${account.display_name}\`\n` +
      `status: \`${account.access_status}\`\n` +
      `role: \`${account.role}\``,
    ephemeral: true
  });
}

async function handleAccountSetupModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.inGuild()) {
    await interaction.editReply("この操作はサーバー内で実行してください。");
    return;
  }

  const discordId = interaction.user.id;
  const discordUsername = interaction.user.username;

  const displayName = interaction.fields
    .getTextInputValue(INPUT_DISPLAY_NAME)
    .trim();

  const username = normalizeUsername(
    interaction.fields.getTextInputValue(INPUT_USERNAME)
  );

  if (!displayName) {
    await interaction.editReply("Display name を入力してください。");
    return;
  }

  if (!isValidUsername(username)) {
    await interaction.editReply(
      "username は 3〜24文字の英数字・アンダースコア・ハイフンのみ使えます。"
    );
    return;
  }

  const existingDiscordAccount = await findAccountByDiscordId(discordId);

  if (existingDiscordAccount) {
    await interaction.editReply("すでに登録されています。");
    return;
  }

  const existingUsername = await findAccountByUsername(username);

  if (existingUsername) {
    await interaction.editReply(
      "その username はすでに使われています。別の名前で登録してください。"
    );
    return;
  }

  const initialPassword = generateInitialPassword();
  const passwordHash = hashPassword(initialPassword);

  const account = await createAccount({
    discordId,
    discordUsername,
    username,
    displayName,
    passwordHash
  });

  await addRole(interaction.guildId, discordId, env.marketPendingRoleId);
  const dmSent = await sendPasswordDm(interaction, username, initialPassword);
  await notifyAdminChannel(account);

  await interaction.editReply(
    `アカウント作成申請を受け付けました。\n` +
    `status: \`pending\`\n` +
    (dmSent
      ? "初期パスワードをDMに送信しました。\n"
      : "DMを送信できませんでした。管理者に連絡してください。\n") +
    "管理者の承認後、WebAppにログインできます。"
  );
}

async function handleApproveButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  if (!canApproveOrReject(interaction)) {
    await interaction.editReply("この操作を実行する権限がありません。");
    return;
  }

  const accountId = interaction.customId.slice(ACCOUNT_APPROVE_PREFIX.length);
  const account = await findAccountById(accountId);

  if (!account) {
    await interaction.editReply("対象のアカウントが見つかりません。");
    return;
  }

  const updated = await updateAccountStatus(account.id, "approved");

  if (interaction.guildId) {
    await removeRole(interaction.guildId, updated.discord_id, env.marketPendingRoleId);
    await addRole(interaction.guildId, updated.discord_id, env.marketUserRoleId);
  }

  await sendUserDm(
    updated.discord_id,
    `Marketplace account approved.\n\n` +
      `Username: ${updated.username}\n` +
      `WebApp: ${env.webappUrl}`
  );

  await interaction.editReply(`@${updated.username} を承認しました。`);
  await updateAdminMessage(interaction, updated, true);
}

async function handleRejectButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  if (!canApproveOrReject(interaction)) {
    await interaction.editReply("この操作を実行する権限がありません。");
    return;
  }

  const accountId = interaction.customId.slice(ACCOUNT_REJECT_PREFIX.length);
  const account = await findAccountById(accountId);

  if (!account) {
    await interaction.editReply("対象のアカウントが見つかりません。");
    return;
  }

  const updated = await updateAccountStatus(account.id, "rejected");

  if (interaction.guildId) {
    await removeRole(interaction.guildId, updated.discord_id, env.marketPendingRoleId);
  }

  await sendUserDm(
    updated.discord_id,
    `Marketplace account request rejected.\n\n` +
      `Username: ${updated.username}`
  );

  await interaction.editReply(`@${updated.username} を拒否しました。`);
  await updateAdminMessage(interaction, updated, true);
}

async function sendPasswordDm(
  interaction: ModalSubmitInteraction,
  username: string,
  password: string
): Promise<boolean> {
  try {
    await interaction.user.send(
      `Marketplace account created.\n\n` +
      `Username: ${username}\n` +
      `Initial password: ${password}\n\n` +
      `WebApp: ${env.webappUrl}\n\n` +
      `このパスワードはWebAppログインに使います。` +
      `他人に共有しないでください。`
    );

    return true;
  } catch {
    return false;
  }
}

async function sendUserDm(discordId: string, message: string): Promise<boolean> {
  try {
    const user = await client.users.fetch(discordId);
    await user.send(message);
    return true;
  } catch {
    return false;
  }
}

async function notifyAdminChannel(account: Account) {
  const channel = await client.channels.fetch(env.adminChannelId);

  if (!channel || channel.type !== ChannelType.GuildText) {
    return;
  }

  await channel.send({
    content: buildAdminMessage(account),
    components: buildAdminComponents(account.id)
  });
}

function buildAdminMessage(account: Account): string {
  return (
    `👤 New marketplace account request\n\n` +
    `Display name: ${account.display_name}\n` +
    `Username: @${account.username}\n` +
    `Discord: ${account.discord_username}\n` +
    `Discord ID: ${account.discord_id}\n` +
    `Status: ${account.access_status}\n` +
    `Role: ${account.role}`
  );
}

function buildAdminComponents(accountId: string, disabled = false) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ACCOUNT_APPROVE_PREFIX}${accountId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`${ACCOUNT_REJECT_PREFIX}${accountId}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  return [row];
}

async function updateAdminMessage(
  interaction: ButtonInteraction,
  account: Account,
  disabled: boolean
) {
  try {
    await interaction.message.edit({
      content: buildAdminMessage(account),
      components: buildAdminComponents(account.id, disabled)
    });
  } catch (error) {
    console.warn("Failed to update admin message", error);
  }
}

function canApproveOrReject(interaction: ButtonInteraction): boolean {
  if (!interaction.inCachedGuild()) {
    return false;
  }

  if (env.adminRoleId && interaction.member.roles.cache.has(env.adminRoleId)) {
    return true;
  }

  return interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function addRole(
  guildId: string | null,
  userId: string,
  roleId: string | undefined
) {
  if (!guildId || !roleId) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.add(roleId);
  } catch (error) {
    console.warn(`Failed to add role ${roleId} to ${userId}`, error);
  }
}

async function removeRole(
  guildId: string | null,
  userId: string,
  roleId: string | undefined
) {
  if (!guildId || !roleId) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.remove(roleId);
  } catch (error) {
    console.warn(`Failed to remove role ${roleId} from ${userId}`, error);
  }
}

async function replyWithError(interaction: unknown) {
  const message = "エラーが発生しました。時間をおいてもう一度試してください。";

  if (!interaction || typeof interaction !== "object" || !("isRepliable" in interaction)) {
    return;
  }

  const repliable = interaction as {
    isRepliable: () => boolean;
    replied?: boolean;
    deferred?: boolean;
    followUp: (options: { content: string; ephemeral: boolean }) => Promise<unknown>;
    reply: (options: { content: string; ephemeral: boolean }) => Promise<unknown>;
  };

  if (!repliable.isRepliable()) {
    return;
  }

  if (repliable.replied || repliable.deferred) {
    await repliable.followUp({ content: message, ephemeral: true });
  } else {
    await repliable.reply({ content: message, ephemeral: true });
  }
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function isValidUsername(value: string): boolean {
  return /^[a-z0-9_-]{3,24}$/.test(value);
}

await client.login(env.discordToken);
