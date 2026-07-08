import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  discordGuildId: required("DISCORD_GUILD_ID"),
  databaseUrl: required("DATABASE_URL"),
  adminChannelId: required("ADMIN_CHANNEL_ID"),
  adminRoleId: optional("ADMIN_ROLE_ID"),
  marketPendingRoleId: optional("MARKET_PENDING_ROLE_ID"),
  marketUserRoleId: optional("MARKET_USER_ROLE_ID"),
  webappUrl: optional("WEBAPP_URL") ?? "http://localhost:3000"
} as const;
