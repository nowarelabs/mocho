// Thin model wrapper for the stores table (docs/product.md, module 9).
//
// Models are the only place that knows SQL. The rest of pos-backend talks to
// them, never to a driver directly, so the storage engine stays swappable.

import type { SqlDatabase } from "../db/sql.ts";
import { ulid } from "../db/ulid.ts";

export type StoreType = "flagship" | "branch";

export interface Store {
  id: string;
  code: string;
  name: string;
  type: StoreType;
  price_list_id: string | null;
  timezone: string;
  currency: string;
  active: number;
  created_at: number;
}

export interface NewStore {
  code: string;
  name: string;
  type: StoreType;
  price_list_id?: string | null;
  timezone: string;
  currency: string;
  active?: number;
}

export class StoreRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  create(input: NewStore, now: number = Date.now()): Store {
    const store: Store = {
      id: ulid(now),
      code: input.code,
      name: input.name,
      type: input.type,
      price_list_id: input.price_list_id ?? null,
      timezone: input.timezone,
      currency: input.currency,
      active: input.active ?? 1,
      created_at: now,
    };

    this.db.run(
      `INSERT INTO stores
         (id, code, name, type, price_list_id, timezone, currency, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        store.id,
        store.code,
        store.name,
        store.type,
        store.price_list_id,
        store.timezone,
        store.currency,
        store.active,
        store.created_at,
      ],
    );

    return store;
  }

  byId(id: string): Store | null {
    return this.db.all<Store>("SELECT * FROM stores WHERE id = ?", [id])[0] ?? null;
  }

  byCode(code: string): Store | null {
    return this.db.all<Store>("SELECT * FROM stores WHERE code = ?", [code])[0] ?? null;
  }

  list(): Store[] {
    return this.db.all<Store>("SELECT * FROM stores ORDER BY code");
  }
}
