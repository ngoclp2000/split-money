alter table groups add column if not exists share_token text unique;
alter table groups add column if not exists public_enabled boolean not null default false;
alter table groups add column if not exists start_date date;
alter table groups add column if not exists end_date date;
alter table groups add column if not exists updated_at timestamptz not null default now();
alter table group_members add column if not exists updated_at timestamptz not null default now();
alter table expenses add column if not exists updated_at timestamptz not null default now();
alter table payments add column if not exists updated_at timestamptz not null default now();

update groups
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token is null;

update groups set updated_at = created_at where updated_at is null;
update group_members set updated_at = joined_at where updated_at is null;
update expenses set updated_at = created_at where updated_at is null;
update payments set updated_at = created_at where updated_at is null;
