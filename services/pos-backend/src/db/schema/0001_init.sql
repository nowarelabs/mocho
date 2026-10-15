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
--   * every table is STRICT, so a value of the wrong type is rejected
--   * customers are store-scoped: phone is unique together with store_id
--
-- The engine sets `PRAGMA foreign_keys = ON` and WAL mode per connection; those
-- are connection settings, not part of this script. Indexes and the append-only
-- triggers are defined at the end of this file, after the tables.

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
) STRICT;

CREATE TABLE settings (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id),
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('local', 'head_office')),
  updated_at INTEGER NOT NULL,
  UNIQUE (store_id, key)
) STRICT;

-- ---------------------------------------------------------------------------
-- Staff, access and shifts (module 7): company tables.
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rank INTEGER NOT NULL
) STRICT;

CREATE TABLE permissions (
  id             TEXT PRIMARY KEY,
  role_id        TEXT NOT NULL REFERENCES roles(id),
  action         TEXT NOT NULL,
  allowed        INTEGER NOT NULL CHECK (allowed IN (0, 1)),
  needs_approval INTEGER NOT NULL CHECK (needs_approval IN (0, 1)),
  max_amount     INTEGER,
  UNIQUE (role_id, action)
) STRICT;

-- ---------------------------------------------------------------------------
-- Catalog and pricing (module 4): company tables.
-- ---------------------------------------------------------------------------

CREATE TABLE units_of_measure (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  allows_decimal INTEGER NOT NULL CHECK (allows_decimal IN (0, 1))
) STRICT;

CREATE TABLE tax_rates (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  rate_bp INTEGER NOT NULL,
  active  INTEGER NOT NULL CHECK (active IN (0, 1))
) STRICT;

CREATE TABLE categories (
  id        TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id),
  name      TEXT NOT NULL,
  active    INTEGER NOT NULL CHECK (active IN (0, 1)),
  UNIQUE (parent_id, name)
) STRICT;

CREATE TABLE price_lists (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  currency           TEXT NOT NULL,
  prices_include_tax INTEGER NOT NULL CHECK (prices_include_tax IN (0, 1)),
  active             INTEGER NOT NULL CHECK (active IN (0, 1))
) STRICT;

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
) STRICT;

CREATE TABLE barcodes (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  code          TEXT NOT NULL UNIQUE,
  pack_quantity REAL NOT NULL,
  created_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE prices (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  price_list_id TEXT NOT NULL REFERENCES price_lists(id),
  store_id      TEXT REFERENCES stores(id),
  amount        INTEGER NOT NULL,
  valid_from    INTEGER NOT NULL,
  valid_to      INTEGER
) STRICT;

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
) STRICT;

CREATE TABLE promotion_items (
  id           TEXT PRIMARY KEY,
  promotion_id TEXT NOT NULL REFERENCES promotions(id),
  product_id   TEXT REFERENCES products(id),
  category_id  TEXT REFERENCES categories(id),
  role         TEXT NOT NULL CHECK (role IN ('eligible', 'buy', 'get')),
  quantity     REAL NOT NULL,
  CHECK (product_id IS NOT NULL OR category_id IS NOT NULL)
) STRICT;

CREATE TABLE bundle_items (
  id                   TEXT PRIMARY KEY,
  bundle_product_id    TEXT NOT NULL REFERENCES products(id),
  component_product_id TEXT NOT NULL REFERENCES products(id),
  quantity             REAL NOT NULL,
  UNIQUE (bundle_product_id, component_product_id)
) STRICT;

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
) STRICT;

-- ---------------------------------------------------------------------------
-- Customers and messaging (module 6): company templates.
-- ---------------------------------------------------------------------------

CREATE TABLE sms_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('receipt', 'payment_prompt', 'promotion', 'reminder', 'alert', 'other')),
  body       TEXT NOT NULL,
  language   TEXT NOT NULL,
  active     INTEGER NOT NULL CHECK (active IN (0, 1)),
  updated_at INTEGER NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- Operations: app releases pushed to phones.
-- ---------------------------------------------------------------------------

CREATE TABLE app_releases (
  id            TEXT PRIMARY KEY,
  version       TEXT NOT NULL UNIQUE,
  min_supported INTEGER NOT NULL CHECK (min_supported IN (0, 1)),
  notes         TEXT,
  released_at   INTEGER NOT NULL
) STRICT;

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
) STRICT;

CREATE TABLE counters (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  number         INTEGER NOT NULL,
  name           TEXT NOT NULL,
  receipt_prefix TEXT NOT NULL,
  enabled        INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  UNIQUE (store_id, number)
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

CREATE TABLE sale_events (
  id          TEXT PRIMARY KEY,
  sale_id     TEXT NOT NULL REFERENCES sales(id),
  type        TEXT NOT NULL CHECK (type IN ('hold', 'resume', 'void_line', 'void_sale', 'refund')),
  user_id     TEXT NOT NULL REFERENCES users(id),
  approval_id TEXT REFERENCES approvals(id),
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
) STRICT;

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
) STRICT;

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
) STRICT;

-- ---------------------------------------------------------------------------
-- Customers and messaging (module 6).
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT,
  loyalty_points INTEGER NOT NULL,
  credit_limit   INTEGER NOT NULL,
  credit_balance INTEGER NOT NULL,
  sms_opt_in     INTEGER NOT NULL CHECK (sms_opt_in IN (0, 1)),
  opted_out_at   INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (store_id, phone)
) STRICT;

CREATE TABLE loyalty_ledger (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  points      INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('earned', 'redeemed', 'expired', 'adjustment')),
  sale_id     TEXT REFERENCES sales(id),
  created_at  INTEGER NOT NULL
) STRICT;

CREATE TABLE credit_ledger (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('sale', 'repayment', 'adjustment')),
  sale_id     TEXT REFERENCES sales(id),
  payment_id  TEXT REFERENCES payments(id),
  created_at  INTEGER NOT NULL
) STRICT;

CREATE TABLE sms_campaigns (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  name            TEXT NOT NULL,
  template_id     TEXT NOT NULL REFERENCES sms_templates(id),
  status          TEXT NOT NULL CHECK (status IN ('draft', 'running', 'paused', 'done')),
  pace_per_minute INTEGER NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL
) STRICT;

CREATE TABLE sms_outbox (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  customer_id     TEXT REFERENCES customers(id),
  recipient_phone TEXT NOT NULL,
  template_id     TEXT REFERENCES sms_templates(id),
  campaign_id     TEXT REFERENCES sms_campaigns(id),
  sale_id         TEXT REFERENCES sales(id),
  purpose         TEXT NOT NULL CHECK (purpose IN ('receipt', 'payment_prompt', 'promotion', 'reminder', 'alert', 'other')),
  body            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled')),
  attempts        INTEGER NOT NULL,
  last_error      TEXT,
  device_id       TEXT REFERENCES devices(id),
  not_before      INTEGER,
  queued_at       INTEGER NOT NULL,
  sent_at         INTEGER
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

CREATE TABLE staff_phone_consents (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  device_id       TEXT NOT NULL REFERENCES devices(id),
  consent_version TEXT NOT NULL,
  consented_at    INTEGER NOT NULL,
  revoked_at      INTEGER
) STRICT;

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
) STRICT;

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
) STRICT;

CREATE TABLE stock_levels (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES stores(id),
  product_id       TEXT NOT NULL REFERENCES products(id),
  quantity         REAL NOT NULL,
  reorder_point    REAL,
  reorder_quantity REAL,
  updated_at       INTEGER NOT NULL,
  UNIQUE (store_id, product_id)
) STRICT;

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
) STRICT;

CREATE TABLE po_lines (
  id                TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  product_id        TEXT NOT NULL REFERENCES products(id),
  quantity_ordered  REAL NOT NULL,
  quantity_received REAL NOT NULL,
  unit_cost         INTEGER NOT NULL
) STRICT;

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
) STRICT;

CREATE TABLE grn_lines (
  id         TEXT PRIMARY KEY,
  grn_id     TEXT NOT NULL REFERENCES goods_received_notes(id),
  po_line_id TEXT REFERENCES po_lines(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  batch_id   TEXT REFERENCES batches(id),
  quantity   REAL NOT NULL,
  unit_cost  INTEGER NOT NULL
) STRICT;

CREATE TABLE stock_transfers (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  to_store_id  TEXT NOT NULL REFERENCES stores(id),
  status       TEXT NOT NULL CHECK (status IN ('requested', 'in_transit', 'received', 'cancelled')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  sent_at      INTEGER,
  received_at  INTEGER
) STRICT;

CREATE TABLE transfer_lines (
  id                TEXT PRIMARY KEY,
  transfer_id       TEXT NOT NULL REFERENCES stock_transfers(id),
  product_id        TEXT NOT NULL REFERENCES products(id),
  batch_id          TEXT REFERENCES batches(id),
  quantity_sent     REAL NOT NULL,
  quantity_received REAL
) STRICT;

CREATE TABLE stock_counts (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id),
  status     TEXT NOT NULL CHECK (status IN ('open', 'posted', 'cancelled')),
  started_by TEXT NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  posted_at  INTEGER
) STRICT;

CREATE TABLE stock_count_lines (
  id                TEXT PRIMARY KEY,
  stock_count_id    TEXT NOT NULL REFERENCES stock_counts(id),
  product_id        TEXT NOT NULL REFERENCES products(id),
  batch_id          TEXT REFERENCES batches(id),
  expected_quantity REAL NOT NULL,
  counted_quantity  REAL
) STRICT;

CREATE TABLE label_print_jobs (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  product_id   TEXT NOT NULL REFERENCES products(id),
  kind         TEXT NOT NULL CHECK (kind IN ('barcode', 'shelf_label')),
  copies       INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('queued', 'printed', 'failed')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

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
) STRICT;

CREATE TABLE sync_cursor (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  peer            TEXT NOT NULL,
  last_seq_sent   INTEGER NOT NULL,
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  last_error      TEXT,
  UNIQUE (store_id, peer)
) STRICT;

CREATE TABLE inbound_events_seen (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  origin_store_id TEXT NOT NULL REFERENCES stores(id),
  applied_at      INTEGER NOT NULL
) STRICT;

CREATE TABLE device_configs (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id),
  device_id  TEXT REFERENCES devices(id),
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

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
) STRICT;

CREATE TABLE error_logs (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id),
  source     TEXT NOT NULL CHECK (source IN ('server', 'device')),
  device_id  TEXT REFERENCES devices(id),
  level      TEXT NOT NULL CHECK (level IN ('warning', 'error', 'fatal')),
  message    TEXT NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- Indexes and append-only guards
--
-- SQLite indexes PRIMARY KEY and UNIQUE columns by itself but never foreign-key
-- child columns, so every join and FK check would scan. An index is added for
-- every foreign-key column plus the queue and time columns used by lookups and
-- reports. Tables marked "(append-only)" must never be edited in place; the
-- triggers below reject UPDATE and DELETE on them, so a correction is a new row.
-- ---------------------------------------------------------------------------

CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_parent_id ON products(parent_id);
CREATE INDEX idx_products_uom_id ON products(uom_id);
CREATE INDEX idx_products_tax_rate_id ON products(tax_rate_id);
CREATE INDEX idx_barcodes_product_id ON barcodes(product_id);
CREATE INDEX idx_prices_product_id ON prices(product_id);
CREATE INDEX idx_prices_price_list_id ON prices(price_list_id);
CREATE INDEX idx_prices_store_id ON prices(store_id);
CREATE INDEX idx_promotions_store_id ON promotions(store_id);
CREATE INDEX idx_promotion_items_promotion_id ON promotion_items(promotion_id);
CREATE INDEX idx_promotion_items_product_id ON promotion_items(product_id);
CREATE INDEX idx_promotion_items_category_id ON promotion_items(category_id);
CREATE INDEX idx_bundle_items_component_product_id ON bundle_items(component_product_id);

-- Devices, endpoints, staff
CREATE INDEX idx_devices_store_id ON devices(store_id);
CREATE INDEX idx_users_store_id ON users(store_id);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_endpoints_store_id ON endpoints(store_id);
CREATE INDEX idx_endpoints_counter_id ON endpoints(counter_id);
CREATE INDEX idx_endpoints_user_id ON endpoints(user_id);
CREATE INDEX idx_endpoints_device_id ON endpoints(device_id);

-- Sales
CREATE INDEX idx_sales_store_id ON sales(store_id);
CREATE INDEX idx_sales_cashier_id ON sales(cashier_id);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sale_lines_sale_id ON sale_lines(sale_id);
CREATE INDEX idx_sale_lines_product_id ON sale_lines(product_id);
CREATE INDEX idx_sale_lines_promotion_id ON sale_lines(promotion_id);
CREATE INDEX idx_sale_events_sale_id ON sale_events(sale_id);
CREATE INDEX idx_sale_events_user_id ON sale_events(user_id);
CREATE INDEX idx_sale_events_approval_id ON sale_events(approval_id);

-- Payments
CREATE INDEX idx_payments_store_id ON payments(store_id);
CREATE INDEX idx_payments_sale_id ON payments(sale_id);
CREATE INDEX idx_payments_endpoint_id ON payments(endpoint_id);
CREATE INDEX idx_mpesa_receipts_store_id ON mpesa_receipts(store_id);
CREATE INDEX idx_mpesa_receipts_device_id ON mpesa_receipts(device_id);
CREATE INDEX idx_mpesa_receipts_endpoint_id ON mpesa_receipts(endpoint_id);

-- Customers and messaging (customers.store_id is covered by UNIQUE(store_id, phone))
CREATE INDEX idx_loyalty_ledger_store_id ON loyalty_ledger(store_id);
CREATE INDEX idx_loyalty_ledger_customer_id ON loyalty_ledger(customer_id);
CREATE INDEX idx_loyalty_ledger_sale_id ON loyalty_ledger(sale_id);
CREATE INDEX idx_credit_ledger_store_id ON credit_ledger(store_id);
CREATE INDEX idx_credit_ledger_customer_id ON credit_ledger(customer_id);
CREATE INDEX idx_credit_ledger_sale_id ON credit_ledger(sale_id);
CREATE INDEX idx_credit_ledger_payment_id ON credit_ledger(payment_id);
CREATE INDEX idx_sms_campaigns_store_id ON sms_campaigns(store_id);
CREATE INDEX idx_sms_campaigns_template_id ON sms_campaigns(template_id);
CREATE INDEX idx_sms_campaigns_created_by ON sms_campaigns(created_by);
CREATE INDEX idx_sms_outbox_store_id ON sms_outbox(store_id);
CREATE INDEX idx_sms_outbox_customer_id ON sms_outbox(customer_id);
CREATE INDEX idx_sms_outbox_template_id ON sms_outbox(template_id);
CREATE INDEX idx_sms_outbox_campaign_id ON sms_outbox(campaign_id);
CREATE INDEX idx_sms_outbox_sale_id ON sms_outbox(sale_id);
CREATE INDEX idx_sms_outbox_device_id ON sms_outbox(device_id);
CREATE INDEX idx_sms_outbox_status_not_before ON sms_outbox(status, not_before);
CREATE INDEX idx_sms_inbox_store_id ON sms_inbox(store_id);
CREATE INDEX idx_sms_inbox_device_id ON sms_inbox(device_id);
CREATE INDEX idx_sms_inbox_customer_id ON sms_inbox(customer_id);

-- Shifts and access
CREATE INDEX idx_shifts_store_id ON shifts(store_id);
CREATE INDEX idx_shifts_counter_id ON shifts(counter_id);
CREATE INDEX idx_shifts_user_id ON shifts(user_id);
CREATE INDEX idx_shifts_approved_by ON shifts(approved_by);
CREATE INDEX idx_cash_movements_store_id ON cash_movements(store_id);
CREATE INDEX idx_cash_movements_shift_id ON cash_movements(shift_id);
CREATE INDEX idx_cash_movements_user_id ON cash_movements(user_id);
CREATE INDEX idx_cash_movements_approval_id ON cash_movements(approval_id);
CREATE INDEX idx_approvals_store_id ON approvals(store_id);
CREATE INDEX idx_approvals_requested_by ON approvals(requested_by);
CREATE INDEX idx_approvals_approved_by ON approvals(approved_by);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_audit_log_store_id ON audit_log(store_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_device_id ON audit_log(device_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_staff_phone_consents_store_id ON staff_phone_consents(store_id);
CREATE INDEX idx_staff_phone_consents_user_id ON staff_phone_consents(user_id);
CREATE INDEX idx_staff_phone_consents_device_id ON staff_phone_consents(device_id);

-- Inventory and purchasing
CREATE INDEX idx_batches_product_id ON batches(product_id);
CREATE INDEX idx_stock_movements_store_id ON stock_movements(store_id);
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_batch_id ON stock_movements(batch_id);
CREATE INDEX idx_stock_movements_user_id ON stock_movements(user_id);
CREATE INDEX idx_stock_movements_store_product ON stock_movements(store_id, product_id);
CREATE INDEX idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_created_by ON purchase_orders(created_by);
CREATE INDEX idx_po_lines_purchase_order_id ON po_lines(purchase_order_id);
CREATE INDEX idx_po_lines_product_id ON po_lines(product_id);
CREATE INDEX idx_goods_received_notes_purchase_order_id ON goods_received_notes(purchase_order_id);
CREATE INDEX idx_goods_received_notes_supplier_id ON goods_received_notes(supplier_id);
CREATE INDEX idx_goods_received_notes_received_by ON goods_received_notes(received_by);
CREATE INDEX idx_grn_lines_grn_id ON grn_lines(grn_id);
CREATE INDEX idx_grn_lines_po_line_id ON grn_lines(po_line_id);
CREATE INDEX idx_grn_lines_product_id ON grn_lines(product_id);
CREATE INDEX idx_grn_lines_batch_id ON grn_lines(batch_id);
CREATE INDEX idx_stock_transfers_store_id ON stock_transfers(store_id);
CREATE INDEX idx_stock_transfers_to_store_id ON stock_transfers(to_store_id);
CREATE INDEX idx_stock_transfers_requested_by ON stock_transfers(requested_by);
CREATE INDEX idx_transfer_lines_transfer_id ON transfer_lines(transfer_id);
CREATE INDEX idx_transfer_lines_product_id ON transfer_lines(product_id);
CREATE INDEX idx_transfer_lines_batch_id ON transfer_lines(batch_id);
CREATE INDEX idx_stock_counts_store_id ON stock_counts(store_id);
CREATE INDEX idx_stock_counts_started_by ON stock_counts(started_by);
CREATE INDEX idx_stock_count_lines_stock_count_id ON stock_count_lines(stock_count_id);
CREATE INDEX idx_stock_count_lines_product_id ON stock_count_lines(product_id);
CREATE INDEX idx_stock_count_lines_batch_id ON stock_count_lines(batch_id);
CREATE INDEX idx_label_print_jobs_store_id ON label_print_jobs(store_id);
CREATE INDEX idx_label_print_jobs_product_id ON label_print_jobs(product_id);
CREATE INDEX idx_label_print_jobs_requested_by ON label_print_jobs(requested_by);
CREATE INDEX idx_label_print_jobs_status ON label_print_jobs(status);

-- Reconciliation and reports
CREATE INDEX idx_statement_imports_store_id ON statement_imports(store_id);
CREATE INDEX idx_statement_imports_endpoint_id ON statement_imports(endpoint_id);
CREATE INDEX idx_statement_imports_imported_by ON statement_imports(imported_by);
CREATE INDEX idx_statement_lines_store_id ON statement_lines(store_id);
CREATE INDEX idx_statement_lines_import_id ON statement_lines(import_id);
CREATE INDEX idx_reconciliation_items_store_id ON reconciliation_items(store_id);
CREATE INDEX idx_reconciliation_items_receipt_id ON reconciliation_items(receipt_id);
CREATE INDEX idx_reconciliation_items_statement_line_id ON reconciliation_items(statement_line_id);
CREATE INDEX idx_reconciliation_items_resolved_by ON reconciliation_items(resolved_by);
CREATE INDEX idx_reconciliation_items_business_date ON reconciliation_items(business_date);
CREATE INDEX idx_sales_summary_counter_id ON sales_summary(counter_id);
CREATE INDEX idx_sales_summary_cashier_id ON sales_summary(cashier_id);
CREATE INDEX idx_sales_summary_category_id ON sales_summary(category_id);
CREATE INDEX idx_device_health_reports_store_id ON device_health_reports(store_id);
CREATE INDEX idx_device_health_reports_device_id ON device_health_reports(device_id);

-- Sync and operations
CREATE INDEX idx_outbound_events_entity ON outbound_events(entity_type, entity_id);
CREATE INDEX idx_inbound_events_seen_store_id ON inbound_events_seen(store_id);
CREATE INDEX idx_inbound_events_seen_origin_store_id ON inbound_events_seen(origin_store_id);
CREATE INDEX idx_device_configs_store_id ON device_configs(store_id);
CREATE INDEX idx_device_configs_device_id ON device_configs(device_id);
CREATE INDEX idx_backup_runs_store_id ON backup_runs(store_id);
CREATE INDEX idx_backup_runs_started_at ON backup_runs(started_at);
CREATE INDEX idx_error_logs_store_id ON error_logs(store_id);
CREATE INDEX idx_error_logs_device_id ON error_logs(device_id);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at);

-- ---------------------------------------------------------------------------
-- Append-only guards (a correction is a new row, never an edit)
-- ---------------------------------------------------------------------------

CREATE TRIGGER sale_events_no_update BEFORE UPDATE ON sale_events
BEGIN SELECT RAISE(ABORT, 'sale_events is append-only'); END;
CREATE TRIGGER sale_events_no_delete BEFORE DELETE ON sale_events
BEGIN SELECT RAISE(ABORT, 'sale_events is append-only'); END;

CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
CREATE TRIGGER stock_movements_no_delete BEFORE DELETE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;

CREATE TRIGGER loyalty_ledger_no_update BEFORE UPDATE ON loyalty_ledger
BEGIN SELECT RAISE(ABORT, 'loyalty_ledger is append-only'); END;
CREATE TRIGGER loyalty_ledger_no_delete BEFORE DELETE ON loyalty_ledger
BEGIN SELECT RAISE(ABORT, 'loyalty_ledger is append-only'); END;

CREATE TRIGGER credit_ledger_no_update BEFORE UPDATE ON credit_ledger
BEGIN SELECT RAISE(ABORT, 'credit_ledger is append-only'); END;
CREATE TRIGGER credit_ledger_no_delete BEFORE DELETE ON credit_ledger
BEGIN SELECT RAISE(ABORT, 'credit_ledger is append-only'); END;

CREATE TRIGGER cash_movements_no_update BEFORE UPDATE ON cash_movements
BEGIN SELECT RAISE(ABORT, 'cash_movements is append-only'); END;
CREATE TRIGGER cash_movements_no_delete BEFORE DELETE ON cash_movements
BEGIN SELECT RAISE(ABORT, 'cash_movements is append-only'); END;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TRIGGER outbound_events_no_update BEFORE UPDATE ON outbound_events
BEGIN SELECT RAISE(ABORT, 'outbound_events is append-only'); END;
CREATE TRIGGER outbound_events_no_delete BEFORE DELETE ON outbound_events
BEGIN SELECT RAISE(ABORT, 'outbound_events is append-only'); END;
