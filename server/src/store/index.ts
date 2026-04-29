import { MemoryStore } from "./memory-store.js";
import { SupabaseStore } from "./supabase-store.js";
import type { AppStore } from "./store.js";

export function createStore(): AppStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (url && key) {
    return new SupabaseStore(url, key);
  }

  return new MemoryStore();
}
