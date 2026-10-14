import type { Migration } from "./migrate.ts";
import init from "./schema/0001_init.sql";

// Applied in version order by runMigrations. Add a new entry, with a new
// numbered file under ./schema, for every schema change.
export const migrations: Migration[] = [
  { version: 1, name: "init", sql: init },
];
