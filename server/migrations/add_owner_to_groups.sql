-- Migration: Thêm owner_id vào bảng groups và gán data hiện tại
-- Chạy trong Supabase SQL Editor

-- 1. Thêm cột owner_id
ALTER TABLE groups ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Gán tất cả groups hiện tại cho userId cụ thể
UPDATE groups SET owner_id = '0e6ae1d6-eccf-4916-a421-21e99acffc33' WHERE owner_id IS NULL;

-- 3. Index để query nhanh theo owner
CREATE INDEX IF NOT EXISTS groups_owner_id_idx ON groups (owner_id, created_at DESC);
