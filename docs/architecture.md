# Mocho architecture and decisions

Status: accepted · Last updated: 2026-10-14

This is the decision record for how Mocho is built and deployed. It sits
alongside `docs/product.md` (what the system does) and `docs/project.mermaid`
(the topology). Where the three disagree, this document and the mermaid win over
older prose in `product.md`.

## 1. Overview

Mocho is offline-first. Each store runs its own server that keeps selling with no
internet; head office (the flagship) collects events from every store. A store's
server holds all logic and records; an Android phone is only an SMS gateway.

Two node roles, both NixOS + systemd, both built and deployed from one flake:

- **Store server** — the point of sale, the SMS gateway endpoint, and the local
  system of record.
- **Flagship server** — the NATS hub, company-wide reports, and the source of
  configuration pushed down to stores.

Each node is shipped as **one Nix closure** and run as **one `process-compose`
unit** that supervises its components.

## 2. Node roles

### Store server
| Component | Runs as | Role |
| --- | --- | --- |
| `pos-app` | workerd | Serves the browser POS UI and its client bundle. |
| `pos-backend` | workerd | The Bridge and the store Durable Object: HTTP edge, NATS client, parse/match/save, DO SQLite. |
| Store NATS leaf | `nats-server` | Local JetStream + leaf node to the flagship hub. |
| Snapshot export | script/timer | Dumps the store DB to backup storage; restore-test. |

### Flagship server
| Component | Runs as | Role |
| --- | --- | --- |
| NATS hub | `nats-server` | JetStream hub: SMS, store events, config pushdown. |
| Reports workerd | workerd | Consumes store events, computes company totals, publishes config. |
| Hub DO SQLite | (inside reports workerd) | Company-wide totals. |
| Snapshot export | script/timer | Dumps the hub DB to backup storage. |

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
**Context.** `project.mermaid` drew a Bridge between NATS and workerd.
**Decision.** There is no separate Bridge process. `pos-backend` (workerd) is the
Bridge: it accepts the phone's HTTP, talks to NATS, and runs the store logic.
**Consequences.** The diagram's "Bridge" and "workerd" boxes are the same
service. One fewer process to package and supervise.

### D3 — The phone speaks HTTP; NATS is internal
**Context.** An Android NATS client is awkward and gives poor battery/retry
behaviour.
**Decision.** The phone talks **HTTP to `pos-backend`**. `pos-backend` is the
only thing that speaks NATS at the store edge.
**Consequences.** The phone needs nothing but HTTPS. The diagram's phone↔NATS
arrow becomes phone → HTTP → `pos-backend` → NATS.

### D4 — Backups are snapshots + PITR, not continuous Litestream
**Context.** With D1 there is no live WAL file for Litestream to replicate.
**Decision.** Back up by **periodic full snapshots** to disk/SFTP/S3 recorded in
`backup_runs` (`kind = 'snapshot'`), plus **DO SQLite point-in-time recovery**
(30 days) for recent restores. Continuous Litestream is dropped from the critical
path.
**Consequences.** Simple and robust; the recovery point is bounded by the
snapshot interval (plus PITR window). Litestream may return later only if we add
a file-owning mirror.

### D5 — NATS JetStream carries everything async
**Decision.** NATS with **JetStream everywhere** (durable streams on the store
leaf and the flagship hub). It carries: inbound SMS, outbound SMS, device
heartbeats/health, the full transactional `outbound_events` stream upward, and
settings/price/config **pushdown** from head office.
**Consequences.** Stores that were offline catch up on reconnect; at-least-once
delivery pairs with the existing dedupe (`mpesa_receipts.code` unique,
`inbound_events_seen`).

### D6 — Cap'n Web is the request/response plane
**Decision.** Cap'n Web stays for synchronous RPC: **browser POS ↔ workerd**, and
internal command-style calls. Async/durable work goes over NATS.
**Consequences.** Two transports with clear jobs: Cap'n Web for "do this now",
NATS for "this must not be lost".

### D7 — The POS UI is a browser on the store server
**Decision.** Cashiers use the **browser POS served by `pos-app`** on the store
LAN. The phone is the SMS gateway only.
**Consequences.** `pos-app` remains part of the store closure.

### D8 — Packaging: one closure, one launcher
**Decision.** Each role is **one Nix closure** containing `nats-server`,
`workerd`, the exported/compiled services, and any helper tools, launched by a
single `mocho-store` / `mocho-flagship` wrapper that runs **`process-compose`**
with that role's config.
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
**sops-nix** in the NixOS module (NATS credentials, TLS keys, backup targets).
**Consequences.** No plaintext secrets in Git; secrets are injected as files/env
into the `process-compose` unit.

## 4. Messaging topology

Store NATS instances are **leaf nodes** connected to the flagship hub. A store
keeps working when the leaf link is down; JetStream buffers both directions.

Streams (subject layout is a first proposal, to be refined in a spike):

| Stream | Subjects | Direction | Carries |
| --- | --- | --- | --- |
| `SMS_IN` | `mocho.<store>.sms.in` | store → hub | M-Pesa confirmation SMS received by a phone. |
| `SMS_OUT` | `mocho.<store>.sms.out` | local | Queued outbound SMS for the phone to send. |
| `TELEMETRY` | `mocho.<store>.telemetry.>` | store → hub | Device heartbeats and health reports. |
| `EVENTS` | `mocho.<store>.events.>` | store → hub | The transactional outbox (`outbound_events`). |
| `CONFIG` | `mocho.hq.config.>` | hub → store | Settings, prices, promotions, templates, staff/roles. |

Delivery is at-least-once; consumers are idempotent (unique M-Pesa code,
`inbound_events_seen`).

## 5. Data layer

Already in place (see `services/pos-backend/src`):

- `db/sql.ts` — engine-agnostic `SqlDatabase` (`all`/`run`/`exec`/`transaction`).
- `db/migrate.ts` + `db/schema/0001_init.sql` — migrations and `schema_migrations`
  with checksums; all 62 tables from `product.md`.
- `models/*` — the thin model wrapper; the only layer that knows SQL. The DO
  will construct `Models` over a `SqlDatabase` backed by `ctx.storage.sql`.

The DO applies pending migrations on first use.

## 6. Packaging and deployment

```
flake.nix
├── packages.mocho-store      # closure: nats-server + workerd + pos-app/pos-backend + export
├── packages.mocho-flagship   # closure: nats-server + workerd + reports + export
├── nixosModules.mocho        # one mocho.service per host, wired to sops-nix
└── devShells.default         # dev launcher (supersedes mesh)
```

Each closure ships a `process-compose.yaml` describing its processes, health
checks and start order (NATS → workerd → export timer). `systemd` starts the one
`mocho` launcher for the node; `process-compose` handles the rest.

## 7. Backups, restore, redundancy

- **Per-store durability:** scheduled snapshot export of the store DO to
  disk/SFTP/S3 (`backup_runs.kind='snapshot'`) + DO SQLite PITR.
- **Restore:** there is no file to copy. Restore replays a snapshot into a fresh
  DO (a boot-time job), then resumes. A periodic `restore_test` run proves the
  snapshot is usable.
- **Cross-store redundancy:** the flagship holds every store's event history
  (`EVENTS`/`SMS_IN`), so company data survives a lost store node.

## 8. Deferred spikes / open questions

1. **workerd ↔ NATS connectivity.** Can a Durable Object hold a persistent NATS
   connection (TCP `connect()` or NATS-over-WebSocket) on OSS workerd? This gates
   D2/D5.
2. **DO SQLite export/restore.** Define the snapshot format (SQL dump vs image)
   and the replay-into-fresh-DO restore path. Gates D4/§7.
3. **JetStream leaf config.** Stream replicas, retention, consumer acks, and
   offline catch-up sizing.
4. **Subject taxonomy.** Confirm the layout in §4 and stream names.
5. **Config conflict rules.** How `settings.source = 'head_office'` overrides a
   local value on pushdown, and the reverse on divergence.

## 9. References

- `docs/product.md` — functional specification (tables are set in stone).
- `docs/project.mermaid` — corrected topology.
- `services/pos-backend/src/db`, `services/pos-backend/src/models` — data layer.
