create table if not exists groups (
  id uuid primary key,
  name text not null,
  currency text not null,
  start_date date,
  end_date date,
  share_token text unique,
  public_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table groups add column if not exists share_token text unique;
alter table groups add column if not exists public_enabled boolean not null default false;
alter table groups add column if not exists start_date date;
alter table groups add column if not exists end_date date;
alter table groups add column if not exists updated_at timestamptz not null default now();

create table if not exists group_members (
  id uuid primary key,
  group_id uuid not null references groups(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table group_members add column if not exists updated_at timestamptz not null default now();

create table if not exists expenses (
  id uuid primary key,
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  amount_minor bigint not null,
  currency text not null,
  paid_by_member_id uuid not null references group_members(id),
  split_method text not null,
  expense_date timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table expenses add column if not exists updated_at timestamptz not null default now();

create table if not exists expense_participants (
  id uuid primary key,
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id uuid not null references group_members(id),
  share_value numeric,
  computed_amount_minor bigint not null
);

create table if not exists payments (
  id uuid primary key,
  group_id uuid not null references groups(id) on delete cascade,
  from_member_id uuid not null references group_members(id),
  to_member_id uuid not null references group_members(id),
  amount_minor bigint not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payments add column if not exists updated_at timestamptz not null default now();
