// Engine-agnostic SQL surface.
//
// Every database read and write in pos-backend goes through this interface, so
// the storage engine is an implementation detail that sits behind the model
// wrapper (src/models). A Durable Object's SQLite storage, a local file opened
// with node:sqlite, or any other SQLite driver can satisfy it.
//
// Ids are stored as ULID TEXT (see ./ulid.ts), money as INTEGER cents, rates as
// INTEGER basis points, and times as INTEGER milliseconds since 1970 (UTC).

export type SqlValue = string | number | bigint | null | Uint8Array;

export type SqlRow = Record<string, SqlValue>;

export interface SqlRunResult {
  changes: number;
}

export interface SqlDatabase {
  /** Run a statement that returns rows (SELECT). */
  all<T = SqlRow>(sql: string, params?: SqlValue[]): T[];

  /** Run a statement that changes rows (INSERT, UPDATE, DELETE). */
  run(sql: string, params?: SqlValue[]): SqlRunResult;

  /** Run one or more statements with no bindings (DDL, pragmas). */
  exec(sql: string): void;

  /** Run fn inside a transaction, rolling back if it throws. */
  transaction<T>(fn: () => T): T;
}
