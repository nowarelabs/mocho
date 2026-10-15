# Mocho architecture and decisions

Status: accepted · Last updated: 2026-10-15

This is the decision record for how Mocho is built and deployed. It sits
alongside `docs/product.md` (what the system does) and `docs/project.mermaid`
(the topology). Where the three disagree, this document and the mermaid win over
older prose in `product.md`.

## 1. Overview

Mocho is offline-first. Each store runs its own server that keeps selling with no
internet; head office (the flagship) collects events from every store. A store's
server holds all logic and records; an Android phone is only an SMS gateway.

There is **no message broker**. Durable async work rides a **SQLite transactional
outbox** and is moved between nodes with plain HTTPS. See D5/§4.

Two node roles, both NixOS + systemd, both built and deployed from one flake:

- **Store server** — the point of sale, the SMS gateway endpoint, and the local
  system of record.
- **Flagship server** — company-wide aggregation, reporting, and the source of
  configuration pushed down to stores.

Each node is shipped as **one Nix closure** and run as **one `process-compose`
unit** that supervises its components.

## 2. Node roles

### Store server
| Component | Runs as | Role |
| --- | --- | --- |
| `pos-app` | workerd | Serves the browser POS UI and its client bundle. |
| `pos-backend` | workerd | HTTP edge, phone ingest, sync client, parse/match/save, store Durable Object (DO SQLite). |
| Snapshot export | script/timer | Dumps the store DO to backup storage; restore-test. |

### Flagship server
| Component | Runs as | Role |
| --- | --- | --- |
| Reports workerd | workerd | Receives store events, computes company totals, builds per-store config. |
| Hub DO SQLite | (inside reports workerd) | Company-wide totals and per-store inboxes. |
| Snapshot export | script/timer | Dumps the hub DO to backup storage. |

## 3. Decisions

### D1 — The live store is DO SQLite inside `pos-backend`
**Context.** `product.md` calls for a local SQLite file in WAL mode. workerd
cannot open a `.sqlite` file; its only SQLite is the managed Durable Object
engine. Something must give.
**Decision.** The system of record is a **SQLite-backed Durable Object** in
`pos-backend`. There is no external `.sqlite` file on the hot path.
**Consequences.** Strong transactions and per-object isolation for free; no WAL
file, so Litestream cannot tail it (see D4); restore is not a file copy (see §7).

### D2 — The Bridge is `pos-backend`
**Context.** `project.mermaid` drew a Bridge between a broker and workerd.
**Decision.** There is no separate Bridge process. `pos-backend` (workerd) is the
Bridge: it accepts the phone's HTTP, talks to the store phone and the flagship
over HTTP, and runs the store logic.
**Consequences.** The diagram's "Bridge" and "workerd" boxes are the same
service. One fewer process to package and supervise.

### D3 — The phone speaks HTTP to `pos-backend`
**Context.** A background NATS/streaming client on an Android phone is awkward
and gives poor battery/retry behaviour.
**Decision.** The phone uses **HTTP against `pos-backend` only**: it POSTs
received SMS and GETs queued outgoing SMS. It holds no broker connection and
needs no inbound port.
**Consequences.** The phone needs nothing but HTTPS (or plain HTTP on the store
LAN). All messaging logic lives in `pos-backend`.

### D4 — Backups are snapshots + PITR, not continuous Litestream
**Context.** With D1 there is no live WAL file for Litestream to replicate.
**Decision.** Back up by **periodic full snapshots** to disk/SFTP/S3 recorded in
`backup_runs` (`kind = 'snapshot'`), plus **DO SQLite point-in-time recovery**
(30 days) for recent restores. Continuous Litestream is dropped from the critical
path.
**Consequences.** Simple and robust; the recovery point is bounded by the
snapshot interval (plus PITR window). Litestream may return later only if we add
a file-owning mirror.

### D5 — SQLite transactional outbox + HTTPS sync (no broker)
**Context.** Async work must survive restarts, offline stores and lost links. A
broker (NATS JetStream) can carry it, but even with a broker a transactional
outbox is required — a DB commit and a broker publish cannot be made atomic. That
makes the outbox, not the broker, the source of truth.
**Decision.** Durable async work goes through the **SQLite transactional
outbox**: `outbound_events` (append-only, per-store `seq`) drained to peers using
`sync_cursor` (per-peer `last_seq_sent`) and applied idempotently via
`inbound_events_seen` (and unique `mpesa_receipts.code`). The transport is
**HTTPS**: a store dials the flagship and pushes/pulls batches; the flagship can
only ever reply to a store that dialled in. **There is no NATS, no broker, no
extra state store.**
**Consequences.** One fewer process, package and secret to operate; delivery
semantics are ours to keep correct (at-least-once + idempotent apply, ordered by
`seq`, retried with backoff). See §4 for the channels.

### D6 — Cap'n Web is the request/response plane
**Decision.** Cap'n Web stays for synchronous RPC: **browser POS ↔ workerd**, and
internal command-style calls. Durable async work goes through the SQLite outbox
(D5).
**Consequences.** Two transports with clear jobs: Cap'n Web for "do this now",
the outbox for "this must not be lost".

### D7 — The POS UI is a browser on the store server
**Decision.** Cashiers use the **browser POS served by `pos-app`** on the store
LAN. The phone is the SMS gateway only.
**Consequences.** `pos-app` remains part of the store closure.

### D8 — Packaging: one closure, one launcher
**Decision.** Each role is **one Nix closure** containing `workerd`, the
exported/compiled services, and any helper tools, launched by a single
`mocho-store` / `mocho-flagship` wrapper that runs **`process-compose`** with that
role's config.
**Consequences.** "One executable on the machine" is the launcher; the same
launcher is the dev entrypoint (it supersedes the ad-hoc `mesh`). Fully merging
Go/workerd binaries into one file is not attempted — the closure plus launcher
is the honest equivalent.

### D9 — Deployment is a NixOS module
**Decision.** The flake exposes `nixosModules.mocho`, which installs the role
closure as a single `mocho.service`. Push with **`nixos-rebuild switch
--target-host`** for one host, or **`deploy-rs`** across the fleet.
**Consequences.** Atomic activate/rollback; the system closure is the unit of
deployment; NixOS + systemd matches `project.mermaid`.

### D10 — Secrets via sops-nix
**Decision.** Secrets are age-encrypted in the Git repo and decrypted by
**sops-nix** in the NixOS module (store/fleet tokens, TLS keys, backup targets).
**Consequences.** No plaintext secrets in Git; secrets are injected as files/env
into the `process-compose` unit.

### D11 — Schema is STRICT, indexed, and append-only-enforced
**Decision.** All 61 tables are declared `STRICT` (type enforcement); the initial
schema adds an index for every foreign-key column and the queue/time hot paths,
and triggers that make the seven "(append-only)" tables reject
`UPDATE`/`DELETE`. Customers are **store-scoped**: `UNIQUE(store_id, phone)`,
so the same phone may exist per store and head office de-dupes by phone.
**Consequences.** Corrections to append-only data must be new rows. Denormalized
totals (`customers.loyalty_points`, `credit_balance`, `stock_levels.quantity`)
are updated in the same transaction as their ledger and reconciled nightly.
`STRICT` must be confirmed supported by workerd's DO SQLite (spike 4).

## 4. Sync topology

All durable async movement is **store-local first** (a row in the store DB) and
then **pushed/pulled over HTTPS**. Nothing depends on a third process.

| Channel | Mechanism | Direction | Carries |
| --- | --- | --- | --- |
| Phone inbound | `sms_inbox` via HTTP POST | phone → `pos-backend` | M-Pesa confirmation SMS, replies, `STOP`. |
| Phone outbound | `sms_outbox` via HTTP GET/report | `pos-backend` → phone | Receipts, payment prompts, promos, reminders, alerts (`sms_outbox.purpose`). |
| Store → HQ | `outbound_events` push, `sync_cursor` | store → flagship | Sales, payments, stock, shifts, telemetry (`entity_type`). |
| HQ → Store | per-store inbox pull | flagship → store | Settings, prices, promotions, templates, staff/roles. |

Rules:
- Ordering is per-store `outbound_events.seq`; a peer may not advance
  `sync_cursor.last_seq_sent` past what it has durably applied.
- Delivery is **at-least-once**; the receiver is **idempotent**
  (`inbound_events_seen`, unique `mpesa_receipts.code`).
- A store dials out, so stores need no inbound port; the flagship needs a public
  HTTPS endpoint. A store offline for days catches up from its own backlog.
- The phone is a `devices` row (token, `last_seen_at`, `queue_size`); the phone
  number ↔ till binding is an `endpoints` row (`type = 'phone'`, `device_id`).

### Payment flow (customer phone ↔ store phone ↔ `pos-backend`)

1. The cashier completes the basket; `pos-backend` queues a **`payment_prompt`**
   SMS — "Pay <amount> to till <number> to complete purchase".
2. The store phone GETs it from `sms_outbox`, sends it from the store SIM, and
   reports `sent`.
3. The customer pays the till/paybill from their own phone (USSD or M-Pesa menu).
4. M-Pesa sends a **confirmation SMS to the store phone**.
5. The store phone POSTs the raw SMS to `pos-backend`; it lands in
   `sms_inbox` / `mpesa_receipts` and is matched to the open sale.
6. On match the sale is marked `paid` and a **receipt** SMS is queued and sent
   the same way as step 2.

The store phone decides nothing; it is a two-way pipe for SMS between the carrier
and `pos-backend`. The prompt is a plain SMS, not an STK/PIN push — the spec keeps
Daraja/STK out of scope. The customer phone is external; in future it gains a
sister app.

Message purposes (shared by `sms_outbox.purpose` and `sms_templates.purpose`):
`receipt`, `payment_prompt`, `promotion`, `reminder`, `alert`, `other`.

## 5. Data layer

Already in place (see `services/pos-backend/src`):

- `db/sql.ts` — engine-agnostic `SqlDatabase` (`all`/`run`/`exec`/`transaction`).
- `db/migrate.ts` + `db/schema/0001_init.sql` — migrations and `schema_migrations`
  with checksums; all 62 tables from `product.md` plus indexes and the
  append-only triggers (D11).
- `models/*` — the thin model wrapper; the only layer that knows SQL. The DO
  will construct `Models` over a `SqlDatabase` backed by `ctx.storage.sql`.

The DO applies pending migrations on first use.

## 6. Packaging and deployment

```
flake.nix
├── packages.mocho-store      # closure: workerd + pos-app/pos-backend + sync + export
├── packages.mocho-flagship   # closure: workerd + reports + sync + export
├── nixosModules.mocho        # one mocho.service per host, wired to sops-nix
└── devShells.default         # dev launcher (supersedes mesh)
```

Each closure ships a `process-compose.yaml` describing its processes, health
checks and start order (workerd → sync → export timer). `systemd` starts the one
`mocho` launcher for the node; `process-compose` handles the rest.

## 7. Backups, restore, redundancy

- **Per-store durability:** scheduled snapshot export of the store DO to
  disk/SFTP/S3 (`backup_runs.kind='snapshot'`) + DO SQLite PITR.
- **Restore:** there is no file to copy. Restore replays a snapshot into a fresh
  DO (a boot-time job), then resumes. A periodic `restore_test` run proves the
  snapshot is usable.
- **Cross-store redundancy:** the flagship holds every store's event history
  (`outbound_events` push) and SMS, so company data survives a lost store node.

## 8. Deferred spikes / open questions

1. **HTTPS sync protocol.** Framing, auth (store/fleet tokens), ordering, retry
   with backoff, and catch-up sizing for a store offline for days. Gates D5/§4.
2. **DO SQLite export/restore.** Define the snapshot format (SQL dump vs image)
   and the replay-into-fresh-DO restore path. Gates D4/§7.
3. **Config conflict rules.** How `settings.source = 'head_office'` overrides a
   local value on pushdown, and the reverse on divergence.
4. **STRICT support in DO SQLite.** Confirm workerd's Durable Object SQLite engine
   accepts `STRICT` tables (and its SQLite version). Gates D11.
5. **Phone ↔ backend HTTP contract.** Poll vs long-poll, batching, and battery /
   retry behaviour on the Android side.
6. **Device handshake.** How a phone proves it belongs to a till and is issued a
   `devices` token / `endpoints(type='phone')` binding.

## 9. References

- `docs/product.md` — functional specification (tables are set in stone).
- `docs/project.mermaid` — corrected topology.
- `services/pos-backend/src/db`, `services/pos-backend/src/models` — data layer.
