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

  console.log("indexes");
  const indexCount = Number(
    (
      db.all<{ n: number }>(
        "SELECT count(*) AS n FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
      )[0] ?? { n: 0 }
    ).n,
  );
  check("foreign-key / hot-path indexes exist", indexCount >= 100, `got ${indexCount}`);
  check(
    "index on sale_lines.sale_id exists",
    db.all("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_sale_lines_sale_id'").length === 1,
  );

  console.log("append-only guards");
  db.run(
    `INSERT INTO audit_log (id, store_id, user_id, device_id, action, entity_type, entity_id, detail, created_at)
     VALUES (?, ?, NULL, NULL, ?, ?, NULL, NULL, ?)`,
    [ulid(now), flagship.id, "login", "users", now],
  );

  let updateBlocked = false;
  try {
    db.run("UPDATE audit_log SET action = 'tampered' WHERE store_id = ?", [flagship.id]);
  } catch {
    updateBlocked = true;
  }
  check("append-only table rejects UPDATE", updateBlocked);

  let deleteBlocked = false;
  try {
    db.run("DELETE FROM audit_log WHERE store_id = ?", [flagship.id]);
  } catch {
    deleteBlocked = true;
  }
  check("append-only table rejects DELETE", deleteBlocked);

  const auditRows = db.all<{ n: number }>("SELECT count(*) AS n FROM audit_log")[0];
  check("append-only row survived the blocked edits", Number(auditRows?.n) === 1);

  console.log("strict types");
  const strictFlag = db.all<{ strict: number }>(
    "SELECT strict FROM pragma_table_list WHERE name = 'customers'",
  )[0];
  check("tables are STRICT", Number(strictFlag?.strict) === 1);

  let strictRejected = false;
  try {
    db.run(
      `INSERT INTO customers
         (id, store_id, name, phone, email, loyalty_points, credit_limit, credit_balance, sms_opt_in, opted_out_at, created_at, updated_at)
       VALUES (?, ?, 'Strict Test', '+254700000000', NULL, ?, 0, 0, 1, NULL, ?, ?)`,
      [ulid(now), flagship.id, "not-a-number", now, now],
    );
  } catch {
    strictRejected = true;
  }
  check("STRICT rejects text in an INTEGER column", strictRejected);

  console.log("customer scope");
  function insertCustomer(storeId: string, phone: string, ts: number): void {
    db.run(
      `INSERT INTO customers
         (id, store_id, name, phone, email, loyalty_points, credit_limit, credit_balance, sms_opt_in, opted_out_at, created_at, updated_at)
       VALUES (?, ?, 'Customer', ?, NULL, 0, 0, 0, 1, NULL, ?, ?)`,
      [ulid(ts), storeId, phone, ts, ts],
    );
  }

  let crossStoreOk = true;
  try {
    insertCustomer(flagship.id, "+254711111111", now + 2);
    insertCustomer(branch.id, "+254711111111", now + 3);
  } catch {
    crossStoreOk = false;
  }
  check("same phone allowed in two different stores", crossStoreOk);

  let sameStoreRejected = false;
  try {
    insertCustomer(flagship.id, "+254711111111", now + 4);
  } catch {
    sameStoreRejected = true;
  }
  check("same phone rejected within one store", sameStoreRejected);

  console.log("message purposes");
  let promptOk = true;
  try {
    db.run(
      `INSERT INTO sms_outbox
         (id, store_id, customer_id, recipient_phone, template_id, campaign_id, sale_id, purpose, body, status, attempts, last_error, device_id, not_before, queued_at, sent_at)
       VALUES (?, ?, NULL, ?, NULL, NULL, NULL, 'payment_prompt', ?, 'queued', 0, NULL, NULL, NULL, ?, NULL)`,
      [ulid(now + 5), flagship.id, "+254711111111", "Pay 100.00 to till 12345 to complete purchase", now + 5],
    );
  } catch {
    promptOk = false;
  }
  check("sms_outbox accepts purpose 'payment_prompt'", promptOk);

  let badPurposeRejected = false;
  try {
    db.run(
      `INSERT INTO sms_outbox
         (id, store_id, customer_id, recipient_phone, template_id, campaign_id, sale_id, purpose, body, status, attempts, last_error, device_id, not_before, queued_at, sent_at)
       VALUES (?, ?, NULL, ?, NULL, NULL, NULL, 'nonsense', ?, 'queued', 0, NULL, NULL, NULL, ?, NULL)`,
      [ulid(now + 6), flagship.id, "+254711111112", "x", now + 6],
    );
  } catch {
    badPurposeRejected = true;
  }
  check("sms_outbox rejects an unknown purpose", badPurposeRejected);
} finally {
  raw.close();
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nschema verified");
