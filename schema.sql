create extension if not exists pgcrypto;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),

  discord_id text unique not null,
  discord_username text not null,

  username text unique not null,
  display_name text not null,

  password_hash text not null,

  access_status text not null default 'pending'
    check (access_status in ('pending', 'approved', 'rejected', 'banned')),

  role text not null default 'user'
    check (role in ('user', 'seller', 'admin')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_discord_id_idx
on accounts(discord_id);

create index if not exists accounts_username_idx
on accounts(username);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists accounts_set_updated_at on accounts;

create trigger accounts_set_updated_at
before update on accounts
for each row
execute procedure set_updated_at();
