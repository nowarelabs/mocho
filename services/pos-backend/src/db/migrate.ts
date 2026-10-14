// Migration runner.
//
// Migrations are plain SQL scripts applied in ascending version order. Each one
// is run inside a transaction and recorded in schema_migrations together with a
// checksum of its text, so a change to an already-applied migration is caught
// rather than silently ignored (docs/product.md, table schema_migrations).

import type { SqlDatabase } from "./sql.ts";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  applied_at: number;
}

const SCHEMA_MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )
`;

/** FNV-1a, 32-bit, hex. Detects a migration that changed after it was applied. */
export function checksum(sql: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sql.length; i++) {
    hash ^= sql.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Apply every pending migration and return the full applied set. Idempotent:
 * calling it twice applies nothing the second time.
 */
export function runMigrations(
  db: SqlDatabase,
  migrations: Migration[],
  now: number = Date.now(),
): AppliedMigration[] {
  db.exec(SCHEMA_MIGRATIONS);

  const applied = db.all<AppliedMigration>(
    "SELECT version, name, checksum, applied_at FROM schema_migrations",
  );
  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));

  const pending = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    const existing = appliedByVersion.get(migration.version);
    const sum = checksum(migration.sql);

    if (existing) {
      if (existing.checksum !== sum) {
        throw new Error(
          `migration ${migration.version} (${migration.name}) changed after it was applied`,
        );
      }
      continue;
    }

    db.transaction(() => {
      db.exec(migration.sql);
      db.run(
        "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
        [migration.version, migration.name, sum, now],
      );
    });
  }

  return db.all<AppliedMigration>(
    "SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version",
  );
}
