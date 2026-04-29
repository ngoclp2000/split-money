-- Migration: Thêm bảng planned_expenses
-- Chạy script này trong Supabase SQL Editor

create table if not exists planned_expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  title       text not null,
  quantity    numeric not null default 1,       -- số lượng (cho phép số lẻ)
  unit        text,                             -- đơn vị tính (vd: cái, kg, hộp...)
  estimated_amount_minor bigint,                -- null = chưa ước tính (đơn giá)
  currency    text not null default 'VND',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index để list nhanh theo group
create index if not exists planned_expenses_group_id_idx
  on planned_expenses (group_id, created_at desc);

-- RLS: bật row-level security
alter table planned_expenses enable row level security;

-- Policy: cho phép tất cả (service role key bypass RLS)
-- Nếu dùng anon key thì cần thêm policy phù hợp
create policy "Allow all for service role"
  on planned_expenses
  for all
  using (true)
  with check (true);
