// Thin model wrapper for the settings table (docs/product.md, module 9).
// A head office value replaces a local one when pushed down; `source` records
// which it is.

import type { SqlDatabase } from "../db/sql.ts";
import { ulid } from "../db/ulid.ts";

export type SettingSource = "local" | "head_office";

export interface Setting {
  id: string;
  store_id: string;
  key: string;
  value: string;
  source: SettingSource;
  updated_at: number;
}

export class SettingRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  /** Insert or update a setting, keeping the original row id. */
  set(
    storeId: string,
    key: string,
    value: string,
    source: SettingSource = "local",
    now: number = Date.now(),
  ): Setting {
    this.db.run(
      `INSERT INTO settings (id, store_id, key, value, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (store_id, key) DO UPDATE SET
         value = excluded.value,
         source = excluded.source,
         updated_at = excluded.updated_at`,
      [ulid(now), storeId, key, value, source, now],
    );
    const saved = this.get(storeId, key);
    if (!saved) {
      throw new Error(`setting ${key} vanished after write`);
    }
    return saved;
  }

  get(storeId: string, key: string): Setting | null {
    return (
      this.db.all<Setting>("SELECT * FROM settings WHERE store_id = ? AND key = ?", [
        storeId,
        key,
      ])[0] ?? null
    );
  }

  list(storeId: string): Setting[] {
    return this.db.all<Setting>("SELECT * FROM settings WHERE store_id = ? ORDER BY key", [
      storeId,
    ]);
  }
}
