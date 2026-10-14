// Schema verification (run with: node --no-warnings test/verify-schema.ts).
//
// Applies the real migrations through the real runner using node:sqlite, then
// checks the schema and exercises the model wrapper. This catches SQL errors in
// the migrations and type drift between the schema and the models.

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SqlDatabase, SqlRow, SqlValue } from "../src/db/sql.ts";
import { checksum, runMigrations, type Migration } from "../src/db/migrate.ts";
import { ulid } from "../src/db/ulid.ts";
import { Models } from "../src/models/index.ts";

const EXPECTED_TABLES = 62;
const SCHEMA_DIR = new URL("../src/db/schema/", import.meta.url);

class NodeSqlDatabase implements SqlDatabase {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  all<T = SqlRow>(sql: string, params: SqlValue[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  run(sql: string, params: SqlValue[] = []): { changes: number } {
    const info = this.db.prepare(sql).run(...params);
    return { changes: Number(info.changes) };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function loadMigrations(): Migration[] {
  return readdirSync(SCHEMA_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      version: Number.parseInt(file.slice(0, 4), 10),
      name: file.replace(/\.sql$/, ""),
      sql: readFileSync(new URL(file, SCHEMA_DIR), "utf8"),
    }));
}

let failures = 0;
function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const dir = mkdtempSync(join(tmpdir(), "mocho-schema-"));
const raw = new DatabaseSync(join(dir, "store.sqlite"));
const db = new NodeSqlDatabase(raw);

try {
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec("PRAGMA journal_mode = WAL");

  const migrations = loadMigrations();
  const applied = runMigrations(db, migrations, 1_700_000_000_000);

  console.log("migrations");
  check("all migrations applied", applied.length === migrations.length);
  check("schema_migrations tracks version 1", applied[0]?.version === 1);
  check("checksum is recorded", applied[0]?.checksum === checksum(migrations[0].sql));

  const reApplied = runMigrations(db, migrations, 1_700_000_000_000);
  check("re-running applies nothing new", reApplied.length === applied.length);

  console.log("schema");
  const tableCount = Number(
    (
      db.all<{ n: number }>(
        "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )[0] ?? { n: 0 }
    ).n,
  );
  check(`table count is ${EXPECTED_TABLES}`, tableCount === EXPECTED_TABLES, `got ${tableCount}`);

  const fkViolations = db.all("PRAGMA foreign_key_check");
  check("no foreign key violations", fkViolations.length === 0);

  const fk = db.all<{ foreign_keys: number }>("PRAGMA foreign_keys")[0];
  check("foreign_keys pragma is on", Number(fk?.foreign_keys) === 1);

  const journal = db.all<{ journal_mode: string }>("PRAGMA journal_mode")[0];
  check("journal_mode is wal", String(journal?.journal_mode).toLowerCase() === "wal");

  console.log("models");
  const models = new Models(db);
  const now = 1_700_000_000_000;
  const flagship = models.stores.create(
    { code: "NBO01", name: "Flagship", type: "flagship", timezone: "Africa/Nairobi", currency: "KES" },
    now,
  );
  const branch = models.stores.create(
    { code: "NBO02", name: "Branch", type: "branch", timezone: "Africa/Nairobi", currency: "KES" },
    now + 1,
  );
  check("created store has a 26-char ULID", flagship.id.length === 26);
  check("stores list returns both", models.stores.list().length === 2);
  check("lookup by code", models.stores.byCode("NBO02")?.id === branch.id);

  const first = models.settings.set(flagship.id, "receipt.footer", "Asante!", "local", now);
  const updated = models.settings.set(flagship.id, "receipt.footer", "Karibu tena", "head_office", now + 5);
  check("setting upsert keeps the row id", first.id === updated.id);
  check("setting value updated", models.settings.get(flagship.id, "receipt.footer")?.value === "Karibu tena");
  check("setting source updated", updated.source === "head_office");

  console.log("constraints");
  let rejected = false;
  try {
    db.run("INSERT INTO stores (id, code, name, type, timezone, currency, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      ulid(now),
      "BAD01",
      "Bad",
      "kiosk",
      "Africa/Nairobi",
      "KES",
      1,
      now,
    ]);
  } catch {
    rejected = true;
  }
  check("CHECK constraint rejects a bad store type", rejected);

  let fkRejected = false;
  try {
    db.run("INSERT INTO counters (id, store_id, number, name, receipt_prefix, enabled) VALUES (?, ?, ?, ?, ?, ?)", [
      ulid(now),
      "no-such-store",
      1,
      "Counter 1",
      "C1",
      1,
    ]);
  } catch {
    fkRejected = true;
  }
  check("foreign key rejects an unknown store", fkRejected);
} finally {
  raw.close();
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nschema verified");
