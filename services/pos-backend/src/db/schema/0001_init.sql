-- 0001_init.sql
--
-- The full Mocho store schema, transcribed from docs/product.md.
--
-- Conventions (see "Column conventions" in the spec):
--   * ids are TEXT ULIDs
--   * money is INTEGER cents; rates are INTEGER basis points
--   * times are INTEGER milliseconds since 1970 (UTC); business_date is TEXT YYYY-MM-DD
--   * a column marked "may be empty" is nullable; every other column is NOT NULL
--   * store-scoped tables carry store_id; company-scoped tables do not
--   * append-only tables are never edited in place; a correction is a new row
--
-- The engine sets `PRAGMA foreign_keys = ON` and WAL mode per connection; those
-- are connection settings, not part of this script.

-- ---------------------------------------------------------------------------
-- Sync, administration and operations (module 9): the core tables.
-- ---------------------------------------------------------------------------

CREATE TABLE stores (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('flagship', 'branch')),
  price_list_id TEXT REFERENCES price_lists(id),
  timezone      TEXT NOT NULL,
  currency      TEXT NOT NULL,
  active        INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at    INTEGER NOT NULL
);

CREATE TABLE settings (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id),
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('local', 'head_office')),
  updated_at INTEGER NOT NULL,
  UNIQUE (store_id, key)
);

-- ---------------------------------------------------------------------------
-- Staff, access and shifts (module 7): company tables.
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rank INTEGER NOT NULL
);

CREATE TABLE permissions (
  id             TEXT PRIMARY KEY,
  role_id        TEXT NOT NULL REFERENCES roles(id),
  action         TEXT NOT NULL,
  allowed        INTEGER NOT NULL CHECK (allowed IN (0, 1)),
  needs_approval INTEGER NOT NULL CHECK (needs_approval IN (0, 1)),
  max_amount     INTEGER,
  UNIQUE (role_id, action)
);

-- ---------------------------------------------------------------------------
-- Catalog and pricing (module 4): company tables.
-- ---------------------------------------------------------------------------

CREATE TABLE units_of_measure (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  allows_decimal INTEGER NOT NULL CHECK (allows_decimal IN (0, 1))
);

CREATE TABLE tax_rates (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  rate_bp INTEGER NOT NULL,
  active  INTEGER NOT NULL CHECK (active IN (0, 1))
);

CREATE TABLE categories (
  id        TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id),
  name      TEXT NOT NULL,
  active    INTEGER NOT NULL CHECK (active IN (0, 1)),
  UNIQUE (parent_id, name)
);

CREATE TABLE price_lists (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  currency           TEXT NOT NULL,
  prices_include_tax INTEGER NOT NULL CHECK (prices_include_tax IN (0, 1)),
  active             INTEGER NOT NULL CHECK (active IN (0, 1))
);

CREATE TABLE products (
  id             TEXT PRIMARY KEY,
  sku            TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  category_id    TEXT REFERENCES categories(id),
  parent_id      TEXT REFERENCES products(id),
  variant_label  TEXT,
  uom_id         TEXT NOT NULL REFERENCES units_of_measure(id),
  tax_rate_id    TEXT NOT NULL REFERENCES tax_rates(id),
  is_bundle      INTEGER NOT NULL CHECK (is_bundle IN (0, 1)),
  sold_by_weight INTEGER NOT NULL CHECK (sold_by_weight IN (0, 1)),
  track_stock    INTEGER NOT NULL CHECK (track_stock IN (0, 1)),
  track_batches  INTEGER NOT NULL CHECK (track_batches IN (0, 1)),
  cost           INTEGER NOT NULL,
  active         INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE barcodes (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  code          TEXT NOT NULL UNIQUE,
  pack_quantity REAL NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE prices (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  price_list_id TEXT NOT NULL REFERENCES price_lists(id),
  store_id      TEXT REFERENCES stores(id),
  amount        INTEGER NOT NULL,
  valid_from    INTEGER NOT NULL,
  valid_to      INTEGER
);

CREATE TABLE promotions (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('percent_off', 'amount_off', 'buy_x_get_y', 'bundle_price')),
  value        INTEGER NOT NULL,
  min_quantity REAL NOT NULL,
  store_id     TEXT REFERENCES stores(id),
  starts_at    INTEGER NOT NULL,
  ends_at      INTEGER NOT NULL,
  active       INTEGER NOT NULL CHECK (active IN (0, 1))
);

CREATE TABLE promotion_items (
  id           TEXT PRIMARY KEY,
  promotion_id TEXT NOT NULL REFERENCES promotions(id),
  product_id   TEXT REFERENCES products(id),
  category_id  TEXT REFERENCES categories(id),
  role         TEXT NOT NULL CHECK (role IN ('eligible', 'buy', 'get')),
  quantity     REAL NOT NULL,
  CHECK (product_id IS NOT NULL OR category_id IS NOT NULL)
);

CREATE TABLE bundle_items (
  id                   TEXT PRIMARY KEY,
  bundle_product_id    TEXT NOT NULL REFERENCES products(id),
  component_product_id TEXT NOT NULL REFERENCES products(id),
  quantity             REAL NOT NULL,
  UNIQUE (bundle_product_id, component_product_id)
);

-- ---------------------------------------------------------------------------
-- Inventory and purchasing (module 5): company suppliers.
-- ---------------------------------------------------------------------------

CREATE TABLE suppliers (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  phone              TEXT,
  email              TEXT,
  payment_terms_days INTEGER NOT NULL,
  active             INTEGER NOT NULL CHECK (active IN (0, 1))
);

-- ---------------------------------------------------------------------------
-- Customers and messaging (module 6): company templates.
-- ---------------------------------------------------------------------------

CREATE TABLE sms_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('receipt', 'promotion', 'reminder', 'alert', 'other')),
  body       TEXT NOT NULL,
  language   TEXT NOT NULL,
  active     INTEGER NOT NULL CHECK (active IN (0, 1)),
  updated_at INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Operations: app releases pushed to phones.
-- ---------------------------------------------------------------------------

CREATE TABLE app_releases (
  id            TEXT PRIMARY KEY,
  version       TEXT NOT NULL UNIQUE,
  min_supported INTEGER NOT NULL CHECK (min_supported IN (0, 1)),
  notes         TEXT,
  released_at   INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Payment endpoints and devices (module 3).
-- ---------------------------------------------------------------------------

CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  label        TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  app_version  TEXT NOT NULL,
  signal_level INTEGER,
  last_seen_at INTEGER NOT NULL,
  battery_pct  INTEGER NOT NULL,
  queue_size   INTEGER NOT NULL,
  enabled      INTEGER NOT NULL CHECK (enabled IN (0, 1))
);

CREATE TABLE counters (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  number         INTEGER NOT NULL,
  name           TEXT NOT NULL,
  receipt_prefix TEXT NOT NULL,
  enabled        INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  UNIQUE (store_id, number)
);

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  name            TEXT NOT NULL,
  phone           TEXT,
  role_id         TEXT NOT NULL REFERENCES roles(id),
  pin_hash        TEXT NOT NULL,
  card_hash       TEXT UNIQUE,
  failed_attempts INTEGER NOT NULL,
  locked_until    INTEGER,
  active          INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at      INTEGER NOT NULL
);

CREATE TABLE endpoints (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  type        TEXT NOT NULL CHECK (type IN ('till', 'paybill', 'phone')),
  number      TEXT NOT NULL,
  counter_id  TEXT REFERENCES counters(id),
  user_id     TEXT REFERENCES users(id),
  device_id   TEXT NOT NULL REFERENCES devices(id),
  enabled     INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  UNIQUE (type, number)
);

-- ---------------------------------------------------------------------------
-- Sales and checkout (module 1).
-- ---------------------------------------------------------------------------

CREATE TABLE sales (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  counter_id     TEXT NOT NULL REFERENCES counters(id),
  cashier_id     TEXT NOT NULL REFERENCES users(id),
  customer_id    TEXT REFERENCES customers(id),
  receipt_no     TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('open', 'held', 'paid', 'voided', 'refunded')),
  subtotal       INTEGER NOT NULL,
  tax_total      INTEGER NOT NULL,
  discount_total INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  closed_at      INTEGER,
  UNIQUE (counter_id, receipt_no)
);

CREATE TABLE sale_lines (
  id           TEXT PRIMARY KEY,
  sale_id      TEXT NOT NULL REFERENCES sales(id),
  product_id   TEXT NOT NULL REFERENCES products(id),
  quantity     REAL NOT NULL,
  unit_price   INTEGER NOT NULL,
  tax          INTEGER NOT NULL,
  discount     INTEGER NOT NULL,
  line_total   INTEGER NOT NULL,
  promotion_id TEXT REFERENCES promotions(id)
);

CREATE TABLE sale_events (
  id          TEXT PRIMARY KEY,
  sale_id     TEXT NOT NULL REFERENCES sales(id),
  type        TEXT NOT NULL CHECK (type IN ('hold', 'resume', 'void_line', 'void_sale', 'refund')),
  user_id     TEXT NOT NULL REFERENCES users(id),
  approval_id TEXT REFERENCES approvals(id),
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Payments (module 2).
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  sale_id      TEXT NOT NULL REFERENCES sales(id),
  method       TEXT NOT NULL CHECK (method IN ('cash', 'mpesa', 'card')),
  amount       INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'reversed')),
  endpoint_id  TEXT REFERENCES endpoints(id),
  created_at   INTEGER NOT NULL,
  confirmed_at INTEGER
);

CREATE TABLE mpesa_receipts (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  code        TEXT NOT NULL UNIQUE,
  amount      INTEGER NOT NULL,
  payer_name  TEXT NOT NULL,
  payer_phone TEXT NOT NULL,
  raw_text    TEXT NOT NULL,
  device_id   TEXT NOT NULL REFERENCES devices(id),
  sim_slot    INTEGER,
  endpoint_id TEXT REFERENCES endpoints(id),
  received_at INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('matched', 'unmatched', 'reversed')),
  payment_id  TEXT UNIQUE REFERENCES payments(id)
);

-- ---------------------------------------------------------------------------
-- Customers and messaging (module 6).
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL UNIQUE,
  email          TEXT,
  loyalty_points INTEGER NOT NULL,
  credit_limit   INTEGER NOT NULL,
  credit_balance INTEGER NOT NULL,
  sms_opt_in     INTEGER NOT NULL CHECK (sms_opt_in IN (0, 1)),
  opted_out_at   INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE loyalty_ledger (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  points      INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('earned', 'redeemed', 'expired', 'adjustment')),
  sale_id     TEXT REFERENCES sales(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE credit_ledger (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('sale', 'repayment', 'adjustment')),
  sale_id     TEXT REFERENCES sales(id),
  payment_id  TEXT REFERENCES payments(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE sms_campaigns (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  name            TEXT NOT NULL,
  template_id     TEXT NOT NULL REFERENCES sms_templates(id),
  status          TEXT NOT NULL CHECK (status IN ('draft', 'running', 'paused', 'done')),
  pace_per_minute INTEGER NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL
);

CREATE TABLE sms_outbox (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  customer_id     TEXT REFERENCES customers(id),
  recipient_phone TEXT NOT NULL,
  template_id     TEXT REFERENCES sms_templates(id),
  campaign_id     TEXT REFERENCES sms_campaigns(id),
  sale_id         TEXT REFERENCES sales(id),
  purpose         TEXT NOT NULL CHECK (purpose IN ('receipt', 'promotion', 'reminder', 'alert', 'other')),
  body            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled')),
  attempts        INTEGER NOT NULL,
  last_error      TEXT,
  device_id       TEXT REFERENCES devices(id),
  not_before      INTEGER,
  queued_at       INTEGER NOT NULL,
  sent_at         INTEGER
);

CREATE TABLE sms_inbox (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  device_id    TEXT NOT NULL REFERENCES devices(id),
  sender_phone TEXT NOT NULL,
  body         TEXT NOT NULL,
  customer_id  TEXT REFERENCES customers(id),
  kind         TEXT NOT NULL CHECK (kind IN ('stop', 'reply', 'other')),
  handled      INTEGER NOT NULL CHECK (handled IN (0, 1)),
  received_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Staff, access and shifts (module 7): store tables.
-- ---------------------------------------------------------------------------

CREATE TABLE shifts (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id),
  counter_id    TEXT NOT NULL REFERENCES counters(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  opening_cash  INTEGER NOT NULL,
  expected_cash INTEGER,
  counted_cash  INTEGER,
  variance      INTEGER,
  approved_by   TEXT REFERENCES users(id),
  opened_at     INTEGER NOT NULL,
  closed_at     INTEGER
);

CREATE TABLE cash_movements (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  shift_id    TEXT NOT NULL REFERENCES shifts(id),
  type        TEXT NOT NULL CHECK (type IN ('float', 'drop', 'payout', 'payin')),
  amount      INTEGER NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id),
  approval_id TEXT REFERENCES approvals(id),
  note        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE approvals (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  action         TEXT NOT NULL,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('sale', 'sale_line', 'payment', 'shift', 'other')),
  reference_id   TEXT NOT NULL,
  requested_by   TEXT NOT NULL REFERENCES users(id),
  approved_by    TEXT REFERENCES users(id),
  status         TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reason         TEXT,
  requested_at   INTEGER NOT NULL,
  decided_at     INTEGER
);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  user_id     TEXT REFERENCES users(id),
  device_id   TEXT REFERENCES devices(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE staff_phone_consents (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  device_id       TEXT NOT NULL REFERENCES devices(id),
  consent_version TEXT NOT NULL,
  consented_at    INTEGER NOT NULL,
  revoked_at      INTEGER
);

-- ---------------------------------------------------------------------------
-- Inventory and purchasing (module 5): store tables.
-- ---------------------------------------------------------------------------

CREATE TABLE batches (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  product_id  TEXT NOT NULL REFERENCES products(id),
  batch_code  TEXT NOT NULL,
  expiry_at   INTEGER,
  received_at INTEGER NOT NULL,
  UNIQUE (store_id, product_id, batch_code)
);

CREATE TABLE stock_movements (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  product_id     TEXT NOT NULL REFERENCES products(id),
  batch_id       TEXT REFERENCES batches(id),
  change         REAL NOT NULL,
  reason         TEXT NOT NULL CHECK (reason IN ('sale', 'return', 'delivery', 'transfer_out', 'transfer_in', 'count_adjustment', 'damage', 'expiry', 'correction')),
  reference_type TEXT CHECK (reference_type IN ('sale', 'grn', 'transfer', 'stock_count', 'manual')),
  reference_id   TEXT,
  user_id        TEXT REFERENCES users(id),
  note           TEXT,
  created_at     INTEGER NOT NULL
);

CREATE TABLE stock_levels (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES stores(id),
  product_id       TEXT NOT NULL REFERENCES products(id),
  quantity         REAL NOT NULL,
  reorder_point    REAL,
  reorder_quantity REAL,
  updated_at       INTEGER NOT NULL,
  UNIQUE (store_id, product_id)
);

CREATE TABLE purchase_orders (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  po_no       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  total       INTEGER NOT NULL,
  expected_at INTEGER,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  sent_at     INTEGER,
  UNIQUE (store_id, po_no)
);

CREATE TABLE po_lines (
  id                TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  product_id        TEXT NOT NULL REFERENCES products(id),
  quantity_ordered  REAL NOT NULL,
  quantity_received REAL NOT NULL,
  unit_cost         INTEGER NOT NULL
);

CREATE TABLE goods_received_notes (
  id                TEXT PRIMARY KEY,
  store_id          TEXT NOT NULL REFERENCES stores(id),
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  supplier_id       TEXT NOT NULL REFERENCES suppliers(id),
  grn_no            TEXT NOT NULL,
  supplier_ref      TEXT,
  received_by       TEXT NOT NULL REFERENCES users(id),
  received_at       INTEGER NOT NULL,
  UNIQUE (store_id, grn_no)
);

CREATE TABLE grn_lines (
  id         TEXT PRIMARY KEY,
  grn_id     TEXT NOT NULL REFERENCES goods_received_notes(id),
  po_line_id TEXT REFERENCES po_lines(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  batch_id   TEXT REFERENCES batches(id),
  quantity   REAL NOT NULL,
  unit_cost  INTEGER NOT NULL
);

CREATE TABLE stock_transfers (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  to_store_id  TEXT NOT NULL REFERENCES stores(id),
  status       TEXT NOT NULL CHECK (status IN ('requested', 'in_transit', 'received', 'cancelled')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  sent_at      INTEGER,
  received_at  INTEGER
);

CREATE TABLE transfer_lines (
  id                TEXT PRIMARY KEY,
  transfer_id       TEXT NOT NULL REFERENCES stock_transfers(id),
  product_id        TEXT NOT NULL REFERENCES products(id),
  batch_id          TEXT REFERENCES batches(id),
  quantity_sent     REAL NOT NULL,
  quantity_received REAL
);

CREATE TABLE stock_counts (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id),
  status     TEXT NOT NULL CHECK (status IN ('open', 'posted', 'cancelled')),
  started_by TEXT NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  posted_at  INTEGER
);

CREATE TABLE stock_count_lines (
  id                TEXT PRIMARY KEY,
  stock_count_id    TEXT NOT NULL REFERENCES stock_counts(id),
  product_id        TEXT NOT NULL REFERENCES products(id),
  batch_id          TEXT REFERENCES batches(id),
  expected_quantity REAL NOT NULL,
  counted_quantity  REAL
);

CREATE TABLE label_print_jobs (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  product_id   TEXT NOT NULL REFERENCES products(id),
  kind         TEXT NOT NULL CHECK (kind IN ('barcode', 'shelf_label')),
  copies       INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('queued', 'printed', 'failed')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Reconciliation and reports (module 8).
-- ---------------------------------------------------------------------------

CREATE TABLE statement_imports (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  endpoint_id  TEXT NOT NULL REFERENCES endpoints(id),
  file_name    TEXT NOT NULL,
  file_hash    TEXT NOT NULL UNIQUE,
  period_start INTEGER NOT NULL,
  period_end   INTEGER NOT NULL,
  row_count    INTEGER NOT NULL,
  imported_by  TEXT NOT NULL REFERENCES users(id),
  imported_at  INTEGER NOT NULL
);

CREATE TABLE statement_lines (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id),
  import_id     TEXT NOT NULL REFERENCES statement_imports(id),
  code          TEXT NOT NULL UNIQUE,
  amount        INTEGER NOT NULL,
  payer_name    TEXT,
  payer_phone   TEXT,
  transacted_at INTEGER NOT NULL,
  raw_row       TEXT NOT NULL
);

CREATE TABLE reconciliation_items (
  id                TEXT PRIMARY KEY,
  store_id          TEXT NOT NULL REFERENCES stores(id),
  business_date     TEXT NOT NULL,
  receipt_id        TEXT REFERENCES mpesa_receipts(id),
  statement_line_id TEXT REFERENCES statement_lines(id),
  status            TEXT NOT NULL CHECK (status IN ('matched', 'amount_mismatch', 'missing_from_statement', 'missing_from_receipts', 'resolved')),
  difference        INTEGER NOT NULL,
  note              TEXT,
  resolved_by       TEXT REFERENCES users(id),
  resolved_at       INTEGER,
  created_at        INTEGER NOT NULL
);

CREATE TABLE day_closes (
  id                    TEXT PRIMARY KEY,
  store_id              TEXT NOT NULL REFERENCES stores(id),
  business_date         TEXT NOT NULL,
  sales_total           INTEGER NOT NULL,
  cash_total            INTEGER NOT NULL,
  mpesa_total           INTEGER NOT NULL,
  card_total            INTEGER NOT NULL,
  shift_variance_total  INTEGER NOT NULL,
  unmatched_receipts    INTEGER NOT NULL,
  closed_by             TEXT NOT NULL REFERENCES users(id),
  closed_at             INTEGER NOT NULL,
  UNIQUE (store_id, business_date)
);

CREATE TABLE sales_summary (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id),
  business_date TEXT NOT NULL,
  hour          INTEGER NOT NULL,
  counter_id    TEXT NOT NULL REFERENCES counters(id),
  cashier_id    TEXT NOT NULL REFERENCES users(id),
  category_id   TEXT REFERENCES categories(id),
  quantity      REAL NOT NULL,
  gross         INTEGER NOT NULL,
  discount      INTEGER NOT NULL,
  tax           INTEGER NOT NULL,
  cost          INTEGER NOT NULL,
  refreshed_at  INTEGER NOT NULL,
  UNIQUE (store_id, business_date, hour, counter_id, cashier_id, category_id)
);

CREATE TABLE device_health_reports (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  device_id      TEXT NOT NULL REFERENCES devices(id),
  received_count INTEGER NOT NULL,
  unacked_count  INTEGER NOT NULL,
  last_sms_at    INTEGER,
  period_start   INTEGER NOT NULL,
  period_end     INTEGER NOT NULL,
  reported_at    INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Sync, administration and operations (module 9).
-- ---------------------------------------------------------------------------

CREATE TABLE outbound_events (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  seq         INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('insert', 'update')),
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (store_id, seq)
);

CREATE TABLE sync_cursor (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  peer            TEXT NOT NULL,
  last_seq_sent   INTEGER NOT NULL,
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  last_error      TEXT,
  UNIQUE (store_id, peer)
);

CREATE TABLE inbound_events_seen (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  origin_store_id TEXT NOT NULL REFERENCES stores(id),
  applied_at      INTEGER NOT NULL
);

CREATE TABLE device_configs (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id),
  device_id  TEXT REFERENCES devices(id),
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE backup_runs (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  kind        TEXT NOT NULL CHECK (kind IN ('litestream', 'snapshot', 'restore_test')),
  status      TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
  location    TEXT NOT NULL,
  size_bytes  INTEGER,
  error       TEXT,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE error_logs (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id),
  source     TEXT NOT NULL CHECK (source IN ('server', 'device')),
  device_id  TEXT REFERENCES devices(id),
  level      TEXT NOT NULL CHECK (level IN ('warning', 'error', 'fatal')),
  message    TEXT NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
);
