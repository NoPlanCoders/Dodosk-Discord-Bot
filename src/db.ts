import { Pool } from "pg";
import { env } from "./env.js";

export type AccessStatus = "pending" | "approved" | "rejected" | "banned";
export type AccountRole = "user" | "seller" | "admin";

export type Account = {
  id: string;
  discord_id: string;
  discord_username: string;
  username: string;
  display_name: string;
  password_hash: string;
  access_status: AccessStatus;
  role: AccountRole;
  created_at: Date;
  updated_at: Date;
};

export type CreateAccountInput = {
  discordId: string;
  discordUsername: string;
  username: string;
  displayName: string;
  passwordHash: string;
};

export const db = new Pool({
  connectionString: env.databaseUrl
});

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const result = await db.query<Account>(
    `
    insert into accounts (
      discord_id,
      discord_username,
      username,
      display_name,
      password_hash
    )
    values ($1, $2, $3, $4, $5)
    returning *
    `,
    [
      input.discordId,
      input.discordUsername,
      input.username,
      input.displayName,
      input.passwordHash
    ]
  );

  const account = result.rows[0];

  if (!account) {
    throw new Error("Failed to create account");
  }

  return account;
}

export async function findAccountByDiscordId(discordId: string): Promise<Account | null> {
  const result = await db.query<Account>(
    `select * from accounts where discord_id = $1 limit 1`,
    [discordId]
  );

  return result.rows[0] ?? null;
}

export async function findAccountByUsername(username: string): Promise<Account | null> {
  const result = await db.query<Account>(
    `select * from accounts where username = $1 limit 1`,
    [username]
  );

  return result.rows[0] ?? null;
}

export async function findAccountById(id: string): Promise<Account | null> {
  const result = await db.query<Account>(
    `select * from accounts where id = $1 limit 1`,
    [id]
  );

  return result.rows[0] ?? null;
}

export async function updateAccountStatus(
  id: string,
  accessStatus: AccessStatus
): Promise<Account> {
  const result = await db.query<Account>(
    `
    update accounts
    set access_status = $2
    where id = $1
    returning *
    `,
    [id, accessStatus]
  );

  const account = result.rows[0];

  if (!account) {
    throw new Error("Account not found");
  }

  return account;
}
