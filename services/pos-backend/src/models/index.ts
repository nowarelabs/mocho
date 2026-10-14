// The thin model wrapper (the "models" facade). pos-backend constructs one of
// these over a SqlDatabase and does all data access through it. The storage
// engine is chosen behind SqlDatabase; the models never see it.

import type { SqlDatabase } from "../db/sql.ts";
import { SettingRepository } from "./settings.ts";
import { StoreRepository } from "./store.ts";

export class Models {
  readonly stores: StoreRepository;
  readonly settings: SettingRepository;

  constructor(db: SqlDatabase) {
    this.stores = new StoreRepository(db);
    this.settings = new SettingRepository(db);
  }
}

export type { Store, NewStore, StoreType } from "./store.ts";
export type { Setting, SettingSource } from "./settings.ts";
