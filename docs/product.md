# **POS and SMS gateway: functional specification**

Oct 13, 2026 · Sylvance Kerandi Mbaka

## **Purpose and scope**

This POS runs sales, payments and stock for one or many stores, and keeps working when the internet is down. A store server holds all logic and records in SQLite; an Android phone acts only as the SMS gateway.

The phone receives M-Pesa confirmation messages and sends text messages. It decides nothing about sales. It cannot send a PIN prompt to a customer's phone: that needs Safaricom's Daraja API, which is out of scope here and listed as an open question at the end.

Each store keeps its own SQLite file. A flagship server collects events from every store for company-wide reports.

## **Modules at a glance**

The POS has nine modules. Modules 2, 3 and 6 depend on the mobile app; the others use it lightly or not at all.

| **#** | **Module**                          | **Purpose**                                                    | **Needs mobile app** |
| ----- | ----------------------------------- | -------------------------------------------------------------- | -------------------- |
| 1     | Sales and checkout                  | Build, hold, void and refund sales                             | Receipt SMS only     |
| ---   | ---                                 | ---                                                            | ---                  |
| 2     | Payments                            | Take cash, M-Pesa and card, and match M-Pesa receipts to sales | Yes                  |
| ---   | ---                                 | ---                                                            | ---                  |
| 3     | Payment endpoints and devices       | Register tills, paybills and staff phones                      | Yes                  |
| ---   | ---                                 | ---                                                            | ---                  |
| 4     | Catalog and pricing                 | Products, barcodes, prices, promotions                         | No                   |
| ---   | ---                                 | ---                                                            | ---                  |
| 5     | Inventory and purchasing            | Stock ledger, transfers, purchase orders                       | Alerts only          |
| ---   | ---                                 | ---                                                            | ---                  |
| 6     | Customers and messaging             | Customer records, loyalty, template SMS                        | Yes                  |
| ---   | ---                                 | ---                                                            | ---                  |
| 7     | Staff, access and shifts            | Logins, roles, approvals, cash-up                              | Consent filter       |
| ---   | ---                                 | ---                                                            | ---                  |
| 8     | Reconciliation and reports          | Check M-Pesa against statements, run reports                   | Health report        |
| ---   | ---                                 | ---                                                            | ---                  |
| 9     | Sync, administration and operations | Store to head office sync, settings, backups                   | Config and updates   |
| ---   | ---                                 | ---                                                            | ---                  |

## **Column conventions (apply to every table)**

- Types are SQLite storage classes: TEXT, INTEGER, REAL.
- Ids are TEXT (ULID).
- Times are INTEGER, milliseconds since 1970 (UTC). The only exception is business_date (TEXT, YYYY-MM-DD in the store's local time), used to group a trading day.
- Money is INTEGER cents, never decimals. Rates are INTEGER basis points (1600 = 16.00%).
- In the last column, PK is the primary key, FK is a link to another table's column, and UQ means the value must be unique. 'UQ together with' means the combination of columns must be unique. 'May be empty' means the column allows NULL; every other column is NOT NULL.
- Every table that belongs to one store also carries a store_id that links to stores.id (see module 9). Company-wide tables (marked 'Scope: company') are created at head office and copied down to stores, so they have no store_id.
- Tables marked append-only never have rows updated or deleted; a correction is a new row.

## **1\. Sales and checkout**

A cashier builds a cart, takes payment, and gets a numbered receipt, with every step recorded.

- Cart built by barcode scan or product search, with quantity changes, discounts and notes
- Hold and resume a sale; void a line; refund or return against an earlier sale
- Receipt numbering per counter, printed or sent by SMS
- VAT calculated per item

Mobile app: none, apart from sending the SMS receipt (module 6).

SQLite:

<div class="joplin-table-wrapper"><table><thead><tr><th><p><strong>Table</strong></p></th><th><p><strong>Holds</strong></p></th></tr><tr><th><pre><code>sales</code></pre></th><th><p>Sale id, store, counter, cashier, status, totals, created time</p></th></tr><tr><th><pre><code>sale_lines</code></pre></th><th><p>Sale, product, quantity, unit price, tax, discount</p></th></tr><tr><th><pre><code>sale_events</code></pre></th><th><p>Append-only log of hold, resume, void and refund</p></th></tr></thead></table></div>

All money is stored as whole integers (cents), never decimals.

**Table sales**

<div class="joplin-table-wrapper"><table><thead><tr><th><p><strong>Column</strong></p></th><th><p><strong>Type</strong></p></th><th><p><strong>Key or link</strong></p></th></tr><tr><th><pre><code>id</code></pre></th><th><p>TEXT</p></th><th><p><strong>PK</strong></p></th></tr><tr><th><pre><code>store_id</code></pre></th><th><p>TEXT</p></th><th><p>FK stores.id</p></th></tr><tr><th><pre><code>counter_id</code></pre></th><th><p>TEXT</p></th><th><p>FK counters.id</p></th></tr><tr><th><pre><code>cashier_id</code></pre></th><th><p>TEXT</p></th><th><p>FK users.id</p></th></tr><tr><th><pre><code>customer_id</code></pre></th><th><p>TEXT, may be empty</p></th><th><p>FK customers.id</p></th></tr><tr><th><pre><code>receipt_no</code></pre></th><th><p>TEXT</p></th><th><p>UQ together with counter_id</p></th></tr><tr><th><pre><code>status</code></pre></th><th><p>TEXT</p></th><th><p>open, held, paid, voided or refunded</p></th></tr><tr><th><pre><code>subtotal</code></pre></th><th><p>INTEGER</p></th><th><p>cents</p></th></tr><tr><th><pre><code>tax_total</code></pre></th><th><p>INTEGER</p></th><th><p>cents</p></th></tr><tr><th><pre><code>discount_total</code></pre></th><th><p>INTEGER</p></th><th><p>cents</p></th></tr><tr><th><pre><code>total</code></pre></th><th><p>INTEGER</p></th><th><p>cents</p></th></tr><tr><th><pre><code>created_at</code></pre></th><th><p>INTEGER</p></th><th><p>time</p></th></tr><tr><th><pre><code>closed_at</code></pre></th><th><p>INTEGER, may be empty</p></th><th><p>time</p></th></tr></thead></table></div>

**Table sale_lines**

| **Column**   | **Type**           | **Key or link**                              |
| ------------ | ------------------ | -------------------------------------------- |
| id           | TEXT               | PK                                           |
| ---          | ---                | ---                                          |
| sale_id      | TEXT               | FK sales.id                                  |
| ---          | ---                | ---                                          |
| product_id   | TEXT               | FK products.id                               |
| ---          | ---                | ---                                          |
| quantity     | REAL               | decimal, for weighed goods                   |
| ---          | ---                | ---                                          |
| unit_price   | INTEGER            | cents, copied from the price at time of sale |
| ---          | ---                | ---                                          |
| tax          | INTEGER            | cents                                        |
| ---          | ---                | ---                                          |
| discount     | INTEGER            | cents                                        |
| ---          | ---                | ---                                          |
| line_total   | INTEGER            | cents                                        |
| ---          | ---                | ---                                          |
| promotion_id | TEXT, may be empty | FK promotions.id                             |
| ---          | ---                | ---                                          |

**Table sale_events** (append-only)

| **Column**  | **Type**           | **Key or link**                              |
| ----------- | ------------------ | -------------------------------------------- |
| id          | TEXT               | PK                                           |
| ---         | ---                | ---                                          |
| sale_id     | TEXT               | FK sales.id                                  |
| ---         | ---                | ---                                          |
| type        | TEXT               | hold, resume, void_line, void_sale or refund |
| ---         | ---                | ---                                          |
| user_id     | TEXT               | FK users.id                                  |
| ---         | ---                | ---                                          |
| approval_id | TEXT, may be empty | FK approvals.id                              |
| ---         | ---                | ---                                          |
| data        | TEXT               | JSON detail of the change                    |
| ---         | ---                | ---                                          |
| created_at  | INTEGER            | time; rows are never edited                  |
| ---         | ---                | ---                                          |

## **2\. Payments**

A sale is paid when its payments cover the total; an M-Pesa payment stays pending until the matching confirmation SMS arrives.

- Cash, M-Pesa and card, including split payments on one sale
- Automatic match of each M-Pesa receipt to the pending sale on the same endpoint
- Manual match screen when the cashier types in an M-Pesa code
- Partial payment, overpayment and change due for cash

Mobile app: receive each M-Pesa confirmation SMS, keep only messages from the official sender, upload them with the device id and the receiving SIM, and retry until the server acknowledges.

SQLite:

| **Table**      | **Holds**                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| payments       | Sale, method, amount, status                                                                                     |
| ---            | ---                                                                                                              |
| mpesa_receipts | Unique M-Pesa code, amount, payer name and phone, raw SMS text, device, endpoint, received time, matched payment |
| ---            | ---                                                                                                              |

The unique constraint on the M-Pesa code stops double counting when a phone resends. Receipts with no match stay in the table as unmatched and appear on a review screen.

**Table payments**

| **Column**   | **Type**              | **Key or link**                        |
| ------------ | --------------------- | -------------------------------------- |
| id           | TEXT                  | PK                                     |
| ---          | ---                   | ---                                    |
| store_id     | TEXT                  | FK stores.id                           |
| ---          | ---                   | ---                                    |
| sale_id      | TEXT                  | FK sales.id                            |
| ---          | ---                   | ---                                    |
| method       | TEXT                  | cash, mpesa or card                    |
| ---          | ---                   | ---                                    |
| amount       | INTEGER               | cents                                  |
| ---          | ---                   | ---                                    |
| status       | TEXT                  | pending, confirmed, failed or reversed |
| ---          | ---                   | ---                                    |
| endpoint_id  | TEXT, may be empty    | FK endpoints.id, set for M-Pesa        |
| ---          | ---                   | ---                                    |
| created_at   | INTEGER               | time                                   |
| ---          | ---                   | ---                                    |
| confirmed_at | INTEGER, may be empty | time                                   |
| ---          | ---                   | ---                                    |

**Table mpesa_receipts**

| **Column**  | **Type**              | **Key or link**                           |
| ----------- | --------------------- | ----------------------------------------- |
| id          | TEXT                  | PK                                        |
| ---         | ---                   | ---                                       |
| store_id    | TEXT                  | FK stores.id                              |
| ---         | ---                   | ---                                       |
| code        | TEXT                  | UQ, the M-Pesa transaction code           |
| ---         | ---                   | ---                                       |
| amount      | INTEGER               | cents                                     |
| ---         | ---                   | ---                                       |
| payer_name  | TEXT                  | from the SMS                              |
| ---         | ---                   | ---                                       |
| payer_phone | TEXT                  | from the SMS                              |
| ---         | ---                   | ---                                       |
| raw_text    | TEXT                  | the full SMS, kept as evidence            |
| ---         | ---                   | ---                                       |
| device_id   | TEXT                  | FK devices.id, the phone that received it |
| ---         | ---                   | ---                                       |
| sim_slot    | INTEGER, may be empty | the SIM slot (1 or 2) that received it    |
| ---         | ---                   | ---                                       |
| endpoint_id | TEXT, may be empty    | FK endpoints.id, found from the device    |
| ---         | ---                   | ---                                       |
| received_at | INTEGER               | time                                      |
| ---         | ---                   | ---                                       |
| status      | TEXT                  | matched, unmatched or reversed            |
| ---         | ---                   | ---                                       |
| payment_id  | TEXT, may be empty    | FK payments.id, set when matched; UQ      |
| ---         | ---                   | ---                                       |

## **3\. Payment endpoints and devices**

A store can have many places where money arrives, so each one is registered and tied to the phone that collects its messages.

- Registry of every till, paybill and employee phone number
- Each endpoint assigned to a counter or a person, and to one collecting phone
- Enable or disable an endpoint, with a last-seen time for each device
- Payment matching uses the receiving phone to find the endpoint, so a payment on Till 2's phone is only compared with Counter 2's pending sales

Mobile app: register with a per-device token, declare the endpoints it covers, send a regular heartbeat (battery, signal, queue size), and warn on screen if it stops running.

SQLite:

| **Table** | **Holds**                                                                                |
| --------- | ---------------------------------------------------------------------------------------- |
| devices   | Device id, token hash, label, last seen, battery                                         |
| ---       | ---                                                                                      |
| endpoints | Type (till, paybill or phone), number, store, counter or staff member, collecting device |
| ---       | ---                                                                                      |
| counters  | The checkout counters (tills) of a store                                                 |
| ---       | ---                                                                                      |

**Table devices**

| **Column**   | **Type**              | **Key or link**                                            |
| ------------ | --------------------- | ---------------------------------------------------------- |
| id           | TEXT                  | PK                                                         |
| ---          | ---                   | ---                                                        |
| store_id     | TEXT                  | FK stores.id                                               |
| ---          | ---                   | ---                                                        |
| label        | TEXT                  | for example, Till 2 phone                                  |
| ---          | ---                   | ---                                                        |
| token_hash   | TEXT                  | hash of the device token; the token itself is never stored |
| ---          | ---                   | ---                                                        |
| app_version  | TEXT                  |                                                            |
| ---          | ---                   | ---                                                        |
| signal_level | INTEGER, may be empty | 0 to 4, from the latest heartbeat                          |
| ---          | ---                   | ---                                                        |
| last_seen_at | INTEGER               | time of last heartbeat                                     |
| ---          | ---                   | ---                                                        |
| battery_pct  | INTEGER               | 0 to 100                                                   |
| ---          | ---                   | ---                                                        |
| queue_size   | INTEGER               | messages waiting on the phone                              |
| ---          | ---                   | ---                                                        |
| enabled      | INTEGER               | 1 or 0                                                     |
| ---          | ---                   | ---                                                        |

**Table endpoints**

| **Column** | **Type**           | **Key or link**                                     |
| ---------- | ------------------ | --------------------------------------------------- |
| id         | TEXT               | PK                                                  |
| ---        | ---                | ---                                                 |
| store_id   | TEXT               | FK stores.id                                        |
| ---        | ---                | ---                                                 |
| type       | TEXT               | till, paybill or phone                              |
| ---        | ---                | ---                                                 |
| number     | TEXT               | UQ together with type                               |
| ---        | ---                | ---                                                 |
| counter_id | TEXT, may be empty | FK counters.id                                      |
| ---        | ---                | ---                                                 |
| user_id    | TEXT, may be empty | FK users.id, for a staff phone                      |
| ---        | ---                | ---                                                 |
| device_id  | TEXT               | FK devices.id, the phone that collects its messages |
| ---        | ---                | ---                                                 |
| enabled    | INTEGER            | 1 or 0                                              |
| ---        | ---                | ---                                                 |

**Table counters**

| **Column**     | **Type** | **Key or link**                                     |
| -------------- | -------- | --------------------------------------------------- |
| id             | TEXT     | PK                                                  |
| ---            | ---      | ---                                                 |
| store_id       | TEXT     | FK stores.id                                        |
| ---            | ---      | ---                                                 |
| number         | INTEGER  | UQ together with store_id                           |
| ---            | ---      | ---                                                 |
| name           | TEXT     | for example, Counter 2                              |
| ---            | ---      | ---                                                 |
| receipt_prefix | TEXT     | prefix used when numbering receipts on this counter |
| ---            | ---      | ---                                                 |
| enabled        | INTEGER  | 1 or 0                                              |
| ---            | ---      | ---                                                 |

## **4\. Catalog and pricing**

The catalog says what can be sold and at what price in each store.

- Products with barcodes, categories, variants (size, colour) and units of measure
- Price lists per store, promotions with start and end dates, and bundles
- Barcode and shelf-label printing

Mobile app: none.

SQLite:

| **Table**        | **Holds**                                               | **Scope** |
| ---------------- | ------------------------------------------------------- | --------- |
| products         | What can be sold, including variants and bundles        | company   |
| ---              | ---                                                     | ---       |
| barcodes         | One or more scan codes per product                      | company   |
| ---              | ---                                                     | ---       |
| categories       | Product tree used for reports and promotions            | company   |
| ---              | ---                                                     | ---       |
| units_of_measure | Piece, kg, litre and so on                              | company   |
| ---              | ---                                                     | ---       |
| tax_rates        | VAT rates                                               | company   |
| ---              | ---                                                     | ---       |
| price_lists      | Named sets of prices                                    | company   |
| ---              | ---                                                     | ---       |
| prices           | Amount per product, list and store, with validity dates | company   |
| ---              | ---                                                     | ---       |
| promotions       | Discount rules with start and end dates                 | company   |
| ---              | ---                                                     | ---       |
| promotion_items  | Which products or categories a promotion covers         | company   |
| ---              | ---                                                     | ---       |
| bundle_items     | Components of a bundle product                          | company   |
| ---              | ---                                                     | ---       |
| label_print_jobs | Barcode and shelf-label print requests                  | store     |
| ---              | ---                                                     | ---       |

**Table products** (Scope: company)

| **Column**     | **Type**           | **Key or link**                                               |
| -------------- | ------------------ | ------------------------------------------------------------- |
| id             | TEXT               | PK                                                            |
| ---            | ---                | ---                                                           |
| sku            | TEXT               | UQ                                                            |
| ---            | ---                | ---                                                           |
| name           | TEXT               |                                                               |
| ---            | ---                | ---                                                           |
| category_id    | TEXT, may be empty | FK categories.id                                              |
| ---            | ---                | ---                                                           |
| parent_id      | TEXT, may be empty | FK products.id, set on a variant to point at its main product |
| ---            | ---                | ---                                                           |
| variant_label  | TEXT, may be empty | for example, Large / Red                                      |
| ---            | ---                | ---                                                           |
| uom_id         | TEXT               | FK units_of_measure.id                                        |
| ---            | ---                | ---                                                           |
| tax_rate_id    | TEXT               | FK tax_rates.id                                               |
| ---            | ---                | ---                                                           |
| is_bundle      | INTEGER            | 1 or 0; components are in bundle_items                        |
| ---            | ---                | ---                                                           |
| sold_by_weight | INTEGER            | 1 or 0                                                        |
| ---            | ---                | ---                                                           |
| track_stock    | INTEGER            | 1 or 0                                                        |
| ---            | ---                | ---                                                           |
| track_batches  | INTEGER            | 1 or 0, for batch and expiry tracking                         |
| ---            | ---                | ---                                                           |
| cost           | INTEGER            | cents, default unit cost                                      |
| ---            | ---                | ---                                                           |
| active         | INTEGER            | 1 or 0                                                        |
| ---            | ---                | ---                                                           |
| created_at     | INTEGER            | time                                                          |
| ---            | ---                | ---                                                           |
| updated_at     | INTEGER            | time                                                          |
| ---            | ---                | ---                                                           |

**Table barcodes** (Scope: company)

<div class="joplin-table-wrapper"><table><thead><tr><th><p><strong>Column</strong></p></th><th><p><strong>Type</strong></p></th><th><p><strong>Key or link</strong></p></th></tr><tr><th><pre><code>id</code></pre></th><th><p>TEXT</p></th><th><p><strong>PK</strong></p></th></tr><tr><th><pre><code>product_id</code></pre></th><th><p>TEXT</p></th><th><p>FK products.id</p></th></tr><tr><th><pre><code>code</code></pre></th><th><p>TEXT</p></th><th><p>UQ</p></th></tr><tr><th><pre><code>pack_quantity</code></pre></th><th><p>REAL</p></th><th><p>units sold per scan, normally 1</p></th></tr><tr><th><pre><code>created_at</code></pre></th><th><p>INTEGER</p></th><th><p>time</p></th></tr></thead></table></div>

**Table categories** (Scope: company)

| **Column** | **Type**           | **Key or link**            |
| ---------- | ------------------ | -------------------------- |
| id         | TEXT               | PK                         |
| ---        | ---                | ---                        |
| parent_id  | TEXT, may be empty | FK categories.id           |
| ---        | ---                | ---                        |
| name       | TEXT               | UQ together with parent_id |
| ---        | ---                | ---                        |
| active     | INTEGER            | 1 or 0                     |
| ---        | ---                | ---                        |

**Table units_of_measure** (Scope: company)

| **Column**     | **Type** | **Key or link**           |
| -------------- | -------- | ------------------------- |
| id             | TEXT     | PK                        |
| ---            | ---      | ---                       |
| code           | TEXT     | UQ, for example pc, kg, l |
| ---            | ---      | ---                       |
| name           | TEXT     |                           |
| ---            | ---      | ---                       |
| allows_decimal | INTEGER  | 1 or 0                    |
| ---            | ---      | ---                       |

**Table tax_rates** (Scope: company)

| **Column** | **Type** | **Key or link**                   |
| ---------- | -------- | --------------------------------- |
| id         | TEXT     | PK                                |
| ---        | ---      | ---                               |
| name       | TEXT     | UQ, for example VAT 16% or Exempt |
| ---        | ---      | ---                               |
| rate_bp    | INTEGER  | basis points                      |
| ---        | ---      | ---                               |
| active     | INTEGER  | 1 or 0                            |
| ---        | ---      | ---                               |

**Table price_lists** (Scope: company)

| **Column**         | **Type** | **Key or link** |
| ------------------ | -------- | --------------- |
| id                 | TEXT     | PK              |
| ---                | ---      | ---             |
| name               | TEXT     | UQ              |
| ---                | ---      | ---             |
| currency           | TEXT     | for example KES |
| ---                | ---      | ---             |
| prices_include_tax | INTEGER  | 1 or 0          |
| ---                | ---      | ---             |
| active             | INTEGER  | 1 or 0          |
| ---                | ---      | ---             |

A store chooses its default list through stores.price_list_id.

**Table prices** (Scope: company)

| **Column**    | **Type**              | **Key or link**                                              |
| ------------- | --------------------- | ------------------------------------------------------------ |
| id            | TEXT                  | PK                                                           |
| ---           | ---                   | ---                                                          |
| product_id    | TEXT                  | FK products.id                                               |
| ---           | ---                   | ---                                                          |
| price_list_id | TEXT                  | FK price_lists.id                                            |
| ---           | ---                   | ---                                                          |
| store_id      | TEXT, may be empty    | FK stores.id; set for a price that applies to one store only |
| ---           | ---                   | ---                                                          |
| amount        | INTEGER               | cents                                                        |
| ---           | ---                   | ---                                                          |
| valid_from    | INTEGER               | time                                                         |
| ---           | ---                   | ---                                                          |
| valid_to      | INTEGER, may be empty | time; empty means open-ended                                 |
| ---           | ---                   | ---                                                          |

The price in force is the row with the latest valid_from that has started and not ended, preferring a row for the store over one for the whole list. Prices are never edited; a change is a new row.

**Table promotions** (Scope: company)

| **Column**   | **Type**           | **Key or link**                                      |
| ------------ | ------------------ | ---------------------------------------------------- |
| id           | TEXT               | PK                                                   |
| ---          | ---                | ---                                                  |
| name         | TEXT               |                                                      |
| ---          | ---                | ---                                                  |
| type         | TEXT               | percent_off, amount_off, buy_x_get_y or bundle_price |
| ---          | ---                | ---                                                  |
| value        | INTEGER            | basis points for percent_off, cents for the others   |
| ---          | ---                | ---                                                  |
| min_quantity | REAL               | quantity needed to trigger it                        |
| ---          | ---                | ---                                                  |
| store_id     | TEXT, may be empty | FK stores.id; empty means every store                |
| ---          | ---                | ---                                                  |
| starts_at    | INTEGER            | time                                                 |
| ---          | ---                | ---                                                  |
| ends_at      | INTEGER            | time                                                 |
| ---          | ---                | ---                                                  |
| active       | INTEGER            | 1 or 0                                               |
| ---          | ---                | ---                                                  |

**Table promotion_items** (Scope: company)

| **Column**   | **Type**           | **Key or link**                                           |
| ------------ | ------------------ | --------------------------------------------------------- |
| id           | TEXT               | PK                                                        |
| ---          | ---                | ---                                                       |
| promotion_id | TEXT               | FK promotions.id                                          |
| ---          | ---                | ---                                                       |
| product_id   | TEXT, may be empty | FK products.id                                            |
| ---          | ---                | ---                                                       |
| category_id  | TEXT, may be empty | FK categories.id; one of product_id or category_id is set |
| ---          | ---                | ---                                                       |
| role         | TEXT               | eligible, buy or get                                      |
| ---          | ---                | ---                                                       |
| quantity     | REAL               | quantity for the buy or get role                          |
| ---          | ---                | ---                                                       |

**Table bundle_items** (Scope: company)

| **Column**           | **Type** | **Key or link**                                    |
| -------------------- | -------- | -------------------------------------------------- |
| id                   | TEXT     | PK                                                 |
| ---                  | ---      | ---                                                |
| bundle_product_id    | TEXT     | FK products.id, a product with is_bundle = 1       |
| ---                  | ---      | ---                                                |
| component_product_id | TEXT     | FK products.id; UQ together with bundle_product_id |
| ---                  | ---      | ---                                                |
| quantity             | REAL     |                                                    |
| ---                  | ---      | ---                                                |

**Table label_print_jobs**

| **Column**   | **Type** | **Key or link**           |
| ------------ | -------- | ------------------------- |
| id           | TEXT     | PK                        |
| ---          | ---      | ---                       |
| store_id     | TEXT     | FK stores.id              |
| ---          | ---      | ---                       |
| product_id   | TEXT     | FK products.id            |
| ---          | ---      | ---                       |
| kind         | TEXT     | barcode or shelf_label    |
| ---          | ---      | ---                       |
| copies       | INTEGER  |                           |
| ---          | ---      | ---                       |
| status       | TEXT     | queued, printed or failed |
| ---          | ---      | ---                       |
| requested_by | TEXT     | FK users.id               |
| ---          | ---      | ---                       |
| created_at   | INTEGER  | time                      |
| ---          | ---      | ---                       |

## **5\. Inventory and purchasing**

Stock is a ledger of movements, and the current level is derived from it, so every discrepancy can be traced.

- Stock per store, changed by sales, returns, deliveries, transfers between stores and stock counts
- Low-stock alerts and reorder suggestions
- Purchase orders to suppliers and goods-received notes
- Batch and expiry tracking for perishable goods

Mobile app: optional. It can send a low-stock SMS to a manager or an order SMS to a supplier.

SQLite:

<div class="joplin-table-wrapper"><table><thead><tr><th><p><strong>Table</strong></p></th><th><p><strong>Holds</strong></p></th><th><p><strong>Scope</strong></p></th></tr><tr><th><pre><code>stock_movements</code></pre></th><th><p>Append-only ledger of every change in stock</p></th><th><p>store</p></th></tr><tr><th><pre><code>stock_levels</code></pre></th><th><p>Running total per product and store, with reorder settings</p></th><th><p>store</p></th></tr><tr><th><pre><code>batches</code></pre></th><th><p>Batch codes and expiry dates</p></th><th><p>store</p></th></tr><tr><th><pre><code>suppliers</code></pre></th><th><p>Supplier records</p></th><th><p>company</p></th></tr><tr><th><pre><code>purchase_orders, po_lines</code></pre></th><th><p>Orders to suppliers</p></th><th><p>store</p></th></tr><tr><th><pre><code>goods_received_notes, grn_lines</code></pre></th><th><p>Deliveries received</p></th><th><p>store</p></th></tr><tr><th><pre><code>stock_transfers, transfer_lines</code></pre></th><th><p>Moves between stores</p></th><th><p>store</p></th></tr><tr><th><pre><code>stock_counts, stock_count_lines</code></pre></th><th><p>Physical counts and their variances</p></th><th><p>store</p></th></tr></thead></table></div>

**Table stock_movements** (append-only)

| **Column**     | **Type**           | **Key or link**                                                                                   |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| id             | TEXT               | PK                                                                                                |
| ---            | ---                | ---                                                                                               |
| store_id       | TEXT               | FK stores.id                                                                                      |
| ---            | ---                | ---                                                                                               |
| product_id     | TEXT               | FK products.id                                                                                    |
| ---            | ---                | ---                                                                                               |
| batch_id       | TEXT, may be empty | FK batches.id                                                                                     |
| ---            | ---                | ---                                                                                               |
| change         | REAL               | positive for stock in, negative for stock out                                                     |
| ---            | ---                | ---                                                                                               |
| reason         | TEXT               | sale, return, delivery, transfer_out, transfer_in, count_adjustment, damage, expiry or correction |
| ---            | ---                | ---                                                                                               |
| reference_type | TEXT, may be empty | sale, grn, transfer, stock_count or manual                                                        |
| ---            | ---                | ---                                                                                               |
| reference_id   | TEXT, may be empty | id of the row named by reference_type                                                             |
| ---            | ---                | ---                                                                                               |
| user_id        | TEXT, may be empty | FK users.id                                                                                       |
| ---            | ---                | ---                                                                                               |
| note           | TEXT, may be empty |                                                                                                   |
| ---            | ---                | ---                                                                                               |
| created_at     | INTEGER            | time; rows are never edited                                                                       |
| ---            | ---                | ---                                                                                               |

**Table stock_levels**

| **Column**       | **Type**           | **Key or link**                                                                                      |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| id               | TEXT               | PK                                                                                                   |
| ---              | ---                | ---                                                                                                  |
| store_id         | TEXT               | FK stores.id; UQ together with product_id                                                            |
| ---              | ---                | ---                                                                                                  |
| product_id       | TEXT               | FK products.id                                                                                       |
| ---              | ---                | ---                                                                                                  |
| quantity         | REAL               | running total, updated in the same transaction as each movement; can be rebuilt from stock_movements |
| ---              | ---                | ---                                                                                                  |
| reorder_point    | REAL, may be empty | a low-stock alert fires when quantity falls to this                                                  |
| ---              | ---                | ---                                                                                                  |
| reorder_quantity | REAL, may be empty | suggested order size                                                                                 |
| ---              | ---                | ---                                                                                                  |
| updated_at       | INTEGER            | time                                                                                                 |
| ---              | ---                | ---                                                                                                  |

**Table batches**

| **Column**  | **Type**              | **Key or link**                          |
| ----------- | --------------------- | ---------------------------------------- |
| id          | TEXT                  | PK                                       |
| ---         | ---                   | ---                                      |
| store_id    | TEXT                  | FK stores.id                             |
| ---         | ---                   | ---                                      |
| product_id  | TEXT                  | FK products.id                           |
| ---         | ---                   | ---                                      |
| batch_code  | TEXT                  | UQ together with store_id and product_id |
| ---         | ---                   | ---                                      |
| expiry_at   | INTEGER, may be empty | time                                     |
| ---         | ---                   | ---                                      |
| received_at | INTEGER               | time                                     |
| ---         | ---                   | ---                                      |

The quantity left in a batch is the sum of stock_movements with that batch_id.

**Table suppliers** (Scope: company)

| **Column**         | **Type**           | **Key or link**    |
| ------------------ | ------------------ | ------------------ |
| id                 | TEXT               | PK                 |
| ---                | ---                | ---                |
| name               | TEXT               |                    |
| ---                | ---                | ---                |
| phone              | TEXT, may be empty | used for order SMS |
| ---                | ---                | ---                |
| email              | TEXT, may be empty |                    |
| ---                | ---                | ---                |
| payment_terms_days | INTEGER            |                    |
| ---                | ---                | ---                |
| active             | INTEGER            | 1 or 0             |
| ---                | ---                | ---                |

**Table purchase_orders**

| **Column**  | **Type**              | **Key or link**                             |
| ----------- | --------------------- | ------------------------------------------- |
| id          | TEXT                  | PK                                          |
| ---         | ---                   | ---                                         |
| store_id    | TEXT                  | FK stores.id                                |
| ---         | ---                   | ---                                         |
| supplier_id | TEXT                  | FK suppliers.id                             |
| ---         | ---                   | ---                                         |
| po_no       | TEXT                  | UQ together with store_id                   |
| ---         | ---                   | ---                                         |
| status      | TEXT                  | draft, sent, partial, received or cancelled |
| ---         | ---                   | ---                                         |
| total       | INTEGER               | cents                                       |
| ---         | ---                   | ---                                         |
| expected_at | INTEGER, may be empty | time                                        |
| ---         | ---                   | ---                                         |
| created_by  | TEXT                  | FK users.id                                 |
| ---         | ---                   | ---                                         |
| created_at  | INTEGER               | time                                        |
| ---         | ---                   | ---                                         |
| sent_at     | INTEGER, may be empty | time                                        |
| ---         | ---                   | ---                                         |

**Table po_lines**

| **Column**        | **Type** | **Key or link**              |
| ----------------- | -------- | ---------------------------- |
| id                | TEXT     | PK                           |
| ---               | ---      | ---                          |
| purchase_order_id | TEXT     | FK purchase_orders.id        |
| ---               | ---      | ---                          |
| product_id        | TEXT     | FK products.id               |
| ---               | ---      | ---                          |
| quantity_ordered  | REAL     |                              |
| ---               | ---      | ---                          |
| quantity_received | REAL     | running total from grn_lines |
| ---               | ---      | ---                          |
| unit_cost         | INTEGER  | cents                        |
| ---               | ---      | ---                          |

**Table goods_received_notes**

| **Column**        | **Type**           | **Key or link**                                           |
| ----------------- | ------------------ | --------------------------------------------------------- |
| id                | TEXT               | PK                                                        |
| ---               | ---                | ---                                                       |
| store_id          | TEXT               | FK stores.id                                              |
| ---               | ---                | ---                                                       |
| purchase_order_id | TEXT, may be empty | FK purchase_orders.id; empty for a delivery with no order |
| ---               | ---                | ---                                                       |
| supplier_id       | TEXT               | FK suppliers.id                                           |
| ---               | ---                | ---                                                       |
| grn_no            | TEXT               | UQ together with store_id                                 |
| ---               | ---                | ---                                                       |
| supplier_ref      | TEXT, may be empty | the supplier's delivery note number                       |
| ---               | ---                | ---                                                       |
| received_by       | TEXT               | FK users.id                                               |
| ---               | ---                | ---                                                       |
| received_at       | INTEGER            | time                                                      |
| ---               | ---                | ---                                                       |

**Table grn_lines**

| **Column** | **Type**           | **Key or link**            |
| ---------- | ------------------ | -------------------------- |
| id         | TEXT               | PK                         |
| ---        | ---                | ---                        |
| grn_id     | TEXT               | FK goods_received_notes.id |
| ---        | ---                | ---                        |
| po_line_id | TEXT, may be empty | FK po_lines.id             |
| ---        | ---                | ---                        |
| product_id | TEXT               | FK products.id             |
| ---        | ---                | ---                        |
| batch_id   | TEXT, may be empty | FK batches.id              |
| ---        | ---                | ---                        |
| quantity   | REAL               |                            |
| ---        | ---                | ---                        |
| unit_cost  | INTEGER            | cents                      |
| ---        | ---                | ---                        |

**Table stock_transfers**

| **Column**   | **Type**              | **Key or link**                                        |
| ------------ | --------------------- | ------------------------------------------------------ |
| id           | TEXT                  | PK                                                     |
| ---          | ---                   | ---                                                    |
| store_id     | TEXT                  | FK stores.id, the sending store, which owns the record |
| ---          | ---                   | ---                                                    |
| to_store_id  | TEXT                  | FK stores.id, the receiving store                      |
| ---          | ---                   | ---                                                    |
| status       | TEXT                  | requested, in_transit, received or cancelled           |
| ---          | ---                   | ---                                                    |
| requested_by | TEXT                  | FK users.id                                            |
| ---          | ---                   | ---                                                    |
| created_at   | INTEGER               | time                                                   |
| ---          | ---                   | ---                                                    |
| sent_at      | INTEGER, may be empty | time                                                   |
| ---          | ---                   | ---                                                    |
| received_at  | INTEGER, may be empty | time                                                   |
| ---          | ---                   | ---                                                    |

**Table transfer_lines**

| **Column**        | **Type**           | **Key or link**                                                             |
| ----------------- | ------------------ | --------------------------------------------------------------------------- |
| id                | TEXT               | PK                                                                          |
| ---               | ---                | ---                                                                         |
| transfer_id       | TEXT               | FK stock_transfers.id                                                       |
| ---               | ---                | ---                                                                         |
| product_id        | TEXT               | FK products.id                                                              |
| ---               | ---                | ---                                                                         |
| batch_id          | TEXT, may be empty | FK batches.id                                                               |
| ---               | ---                | ---                                                                         |
| quantity_sent     | REAL               |                                                                             |
| ---               | ---                | ---                                                                         |
| quantity_received | REAL, may be empty | set on arrival; a difference is posted as a movement with reason correction |
| ---               | ---                | ---                                                                         |

**Table stock_counts**

| **Column** | **Type**              | **Key or link**                                 |
| ---------- | --------------------- | ----------------------------------------------- |
| id         | TEXT                  | PK                                              |
| ---        | ---                   | ---                                             |
| store_id   | TEXT                  | FK stores.id                                    |
| ---        | ---                   | ---                                             |
| status     | TEXT                  | open, posted or cancelled                       |
| ---        | ---                   | ---                                             |
| started_by | TEXT                  | FK users.id                                     |
| ---        | ---                   | ---                                             |
| started_at | INTEGER               | time                                            |
| ---        | ---                   | ---                                             |
| posted_at  | INTEGER, may be empty | time; posting writes count_adjustment movements |
| ---        | ---                   | ---                                             |

**Table stock_count_lines**

| **Column**        | **Type**           | **Key or link**                               |
| ----------------- | ------------------ | --------------------------------------------- |
| id                | TEXT               | PK                                            |
| ---               | ---                | ---                                           |
| stock_count_id    | TEXT               | FK stock_counts.id                            |
| ---               | ---                | ---                                           |
| product_id        | TEXT               | FK products.id                                |
| ---               | ---                | ---                                           |
| batch_id          | TEXT, may be empty | FK batches.id                                 |
| ---               | ---                | ---                                           |
| expected_quantity | REAL               | taken from stock_levels when the count starts |
| ---               | ---                | ---                                           |
| counted_quantity  | REAL, may be empty |                                               |
| ---               | ---                | ---                                           |

## **6\. Customers and messaging**

The server queues every outgoing text from a template, and the phone sends it and reports back.

- Customer records, loyalty points and credit accounts
- SMS receipts, payment prompts, promotions and payment reminders from templates with variables such as {{name}} and {{amount}}
- Bulk sends with pacing, delivery status and opt-out handling

Mobile app: fetch queued messages, send them (splitting long texts), report sent or failed for each, and keep to a send rate so Android does not block the app. Optionally receive replies such as STOP.

SQLite:

| **Table**      | **Holds**                                               | **Scope** |
| -------------- | ------------------------------------------------------- | --------- |
| customers      | Customer records with current loyalty and credit totals | store     |
| ---            | ---                                                     | ---       |
| loyalty_ledger | Append-only record of points earned and spent           | store     |
| ---            | ---                                                     | ---       |
| credit_ledger  | Append-only record of credit sales and repayments       | store     |
| ---            | ---                                                     | ---       |
| sms_templates  | Message texts with variables                            | company   |
| ---            | ---                                                     | ---       |
| sms_campaigns  | Bulk sends and their pacing                             | store     |
| ---            | ---                                                     | ---       |
| sms_outbox     | Every outgoing message and its status                   | store     |
| ---            | ---                                                     | ---       |
| sms_inbox      | Replies that are not payments                           | store     |
| ---            | ---                                                     | ---       |

**Table customers**

| **Column**     | **Type**              | **Key or link**                                           |
| -------------- | --------------------- | --------------------------------------------------------- |
| id             | TEXT                  | PK                                                        |
| ---            | ---                   | ---                                                       |
| store_id       | TEXT                  | FK stores.id, the store where the customer was registered |
| ---            | ---                   | ---                                                       |
| name           | TEXT                  |                                                           |
| ---            | ---                   | ---                                                       |
| phone          | TEXT                  | UQ together with store_id, stored in international format (+2547...) |
| ---            | ---                   | ---                                                       |
| email          | TEXT, may be empty    |                                                           |
| ---            | ---                   | ---                                                       |
| loyalty_points | INTEGER               | running total; can be rebuilt from loyalty_ledger         |
| ---            | ---                   | ---                                                       |
| credit_limit   | INTEGER               | cents; 0 means no credit account                          |
| ---            | ---                   | ---                                                       |
| credit_balance | INTEGER               | cents owed; can be rebuilt from credit_ledger             |
| ---            | ---                   | ---                                                       |
| sms_opt_in     | INTEGER               | 1 or 0; set to 0 when a STOP reply arrives                |
| ---            | ---                   | ---                                                       |
| opted_out_at   | INTEGER, may be empty | time                                                      |
| ---            | ---                   | ---                                                       |
| created_at     | INTEGER               | time                                                      |
| ---            | ---                   | ---                                                       |
| updated_at     | INTEGER               | time                                                      |
| ---            | ---                   | ---                                                       |

**Table loyalty_ledger** (append-only)

| **Column**  | **Type**           | **Key or link**                                         |
| ----------- | ------------------ | ------------------------------------------------------- |
| id          | TEXT               | PK                                                      |
| ---         | ---                | ---                                                     |
| store_id    | TEXT               | FK stores.id                                            |
| ---         | ---                | ---                                                     |
| customer_id | TEXT               | FK customers.id                                         |
| ---         | ---                | ---                                                     |
| points      | INTEGER            | positive when earned, negative when redeemed or expired |
| ---         | ---                | ---                                                     |
| reason      | TEXT               | earned, redeemed, expired or adjustment                 |
| ---         | ---                | ---                                                     |
| sale_id     | TEXT, may be empty | FK sales.id                                             |
| ---         | ---                | ---                                                     |
| created_at  | INTEGER            | time                                                    |
| ---         | ---                | ---                                                     |

**Table credit_ledger** (append-only)

| **Column**  | **Type**           | **Key or link**                                                    |
| ----------- | ------------------ | ------------------------------------------------------------------ |
| id          | TEXT               | PK                                                                 |
| ---         | ---                | ---                                                                |
| store_id    | TEXT               | FK stores.id                                                       |
| ---         | ---                | ---                                                                |
| customer_id | TEXT               | FK customers.id                                                    |
| ---         | ---                | ---                                                                |
| amount      | INTEGER            | cents; positive when the customer owes more, negative on repayment |
| ---         | ---                | ---                                                                |
| reason      | TEXT               | sale, repayment or adjustment                                      |
| ---         | ---                | ---                                                                |
| sale_id     | TEXT, may be empty | FK sales.id                                                        |
| ---         | ---                | ---                                                                |
| payment_id  | TEXT, may be empty | FK payments.id, for a repayment                                    |
| ---         | ---                | ---                                                                |
| created_at  | INTEGER            | time                                                               |
| ---         | ---                | ---                                                                |

**Table sms_templates** (Scope: company)

| **Column** | **Type** | **Key or link**                                     |
| ---------- | -------- | --------------------------------------------------- |
| id         | TEXT     | PK                                                  |
| ---        | ---      | ---                                                 |
| name       | TEXT     | UQ                                                  |
| ---        | ---      | ---                                                 |
| purpose    | TEXT     | receipt, payment prompt, promotion, reminder, alert or other |
| ---        | ---      | ---                                                 |
| body       | TEXT     | text with variables such as {{name}} and {{amount}} |
| ---        | ---      | ---                                                 |
| language   | TEXT     | for example en or sw                                |
| ---        | ---      | ---                                                 |
| active     | INTEGER  | 1 or 0                                              |
| ---        | ---      | ---                                                 |
| updated_at | INTEGER  | time                                                |
| ---        | ---      | ---                                                 |

**Table sms_campaigns**

| **Column**      | **Type** | **Key or link**                   |
| --------------- | -------- | --------------------------------- |
| id              | TEXT     | PK                                |
| ---             | ---      | ---                               |
| store_id        | TEXT     | FK stores.id                      |
| ---             | ---      | ---                               |
| name            | TEXT     |                                   |
| ---             | ---      | ---                               |
| template_id     | TEXT     | FK sms_templates.id               |
| ---             | ---      | ---                               |
| status          | TEXT     | draft, running, paused or done    |
| ---             | ---      | ---                               |
| pace_per_minute | INTEGER  | the send rate handed to the phone |
| ---             | ---      | ---                               |
| created_by      | TEXT     | FK users.id                       |
| ---             | ---      | ---                               |
| created_at      | INTEGER  | time                              |
| ---             | ---      | ---                               |

**Table sms_outbox**

| **Column**      | **Type**              | **Key or link**                                       |
| --------------- | --------------------- | ----------------------------------------------------- |
| id              | TEXT                  | PK                                                    |
| ---             | ---                   | ---                                                   |
| store_id        | TEXT                  | FK stores.id                                          |
| ---             | ---                   | ---                                                   |
| customer_id     | TEXT, may be empty    | FK customers.id                                       |
| ---             | ---                   | ---                                                   |
| recipient_phone | TEXT                  |                                                       |
| ---             | ---                   | ---                                                   |
| template_id     | TEXT, may be empty    | FK sms_templates.id                                   |
| ---             | ---                   | ---                                                   |
| campaign_id     | TEXT, may be empty    | FK sms_campaigns.id                                   |
| ---             | ---                   | ---                                                   |
| sale_id         | TEXT, may be empty    | FK sales.id, set for a receipt SMS                    |
| ---             | ---                   | ---                                                   |
| purpose         | TEXT                  | receipt, payment prompt, promotion, reminder, alert or other |
| ---             | ---                   | ---                                                   |
| body            | TEXT                  | the final text after variables are filled in          |
| ---             | ---                   | ---                                                   |
| status          | TEXT                  | queued, sending, sent, delivered, failed or cancelled |
| ---             | ---                   | ---                                                   |
| attempts        | INTEGER               |                                                       |
| ---             | ---                   | ---                                                   |
| last_error      | TEXT, may be empty    |                                                       |
| ---             | ---                   | ---                                                   |
| device_id       | TEXT, may be empty    | FK devices.id, the phone that took the message        |
| ---             | ---                   | ---                                                   |
| not_before      | INTEGER, may be empty | time; the phone does not send it earlier (pacing)     |
| ---             | ---                   | ---                                                   |
| queued_at       | INTEGER               | time                                                  |
| ---             | ---                   | ---                                                   |
| sent_at         | INTEGER, may be empty | time                                                  |
| ---             | ---                   | ---                                                   |

**Table sms_inbox**

| **Column**   | **Type**           | **Key or link**                                |
| ------------ | ------------------ | ---------------------------------------------- |
| id           | TEXT               | PK                                             |
| ---          | ---                | ---                                            |
| store_id     | TEXT               | FK stores.id                                   |
| ---          | ---                | ---                                            |
| device_id    | TEXT               | FK devices.id                                  |
| ---          | ---                | ---                                            |
| sender_phone | TEXT               |                                                |
| ---          | ---                | ---                                            |
| body         | TEXT               |                                                |
| ---          | ---                | ---                                            |
| customer_id  | TEXT, may be empty | FK customers.id, found from the sender's phone |
| ---          | ---                | ---                                            |
| kind         | TEXT               | stop, reply or other                           |
| ---          | ---                | ---                                            |
| handled      | INTEGER            | 1 or 0                                         |
| ---          | ---                | ---                                            |
| received_at  | INTEGER            | time                                           |
| ---          | ---                | ---                                            |

## **7\. Staff, access and shifts**

Every action is tied to a person, and sensitive actions need a supervisor.

- Logins by PIN or card, with roles: cashier, supervisor, manager, owner
- Approvals for voids, refunds and price overrides
- Shifts with an opening float, cash drops, and a closing count compared with the expected total

Mobile app: for staff who collect payments on their own phones, a consent screen and a filter that discards every message except M-Pesa confirmations. A company-owned phone or SIM avoids the privacy risk.

SQLite:

| **Table**            | **Holds**                                          | **Scope** |
| -------------------- | -------------------------------------------------- | --------- |
| users                | Staff accounts and logins                          | store     |
| ---                  | ---                                                | ---       |
| roles                | Cashier, supervisor, manager, owner                | company   |
| ---                  | ---                                                | ---       |
| permissions          | What each role may do, with limits                 | company   |
| ---                  | ---                                                | ---       |
| shifts               | Opening and closing cash, variance                 | store     |
| ---                  | ---                                                | ---       |
| cash_movements       | Float, drops and payouts inside a shift            | store     |
| ---                  | ---                                                | ---       |
| approvals            | Supervisor sign-offs                               | store     |
| ---                  | ---                                                | ---       |
| audit_log            | Append-only record of who did what and when        | store     |
| ---                  | ---                                                | ---       |
| staff_phone_consents | Consent for staff phones used as collection points | store     |
| ---                  | ---                                                | ---       |

**Table users**

| **Column**      | **Type**              | **Key or link**                                 |
| --------------- | --------------------- | ----------------------------------------------- |
| id              | TEXT                  | PK                                              |
| ---             | ---                   | ---                                             |
| store_id        | TEXT                  | FK stores.id, the home store                    |
| ---             | ---                   | ---                                             |
| name            | TEXT                  |                                                 |
| ---             | ---                   | ---                                             |
| phone           | TEXT, may be empty    |                                                 |
| ---             | ---                   | ---                                             |
| role_id         | TEXT                  | FK roles.id                                     |
| ---             | ---                   | ---                                             |
| pin_hash        | TEXT                  | hash of the PIN; the PIN itself is never stored |
| ---             | ---                   | ---                                             |
| card_hash       | TEXT, may be empty    | UQ, hash of the card number                     |
| ---             | ---                   | ---                                             |
| failed_attempts | INTEGER               | resets after a good login                       |
| ---             | ---                   | ---                                             |
| locked_until    | INTEGER, may be empty | time                                            |
| ---             | ---                   | ---                                             |
| active          | INTEGER               | 1 or 0; a user is deactivated, never deleted    |
| ---             | ---                   | ---                                             |
| created_at      | INTEGER               | time                                            |
| ---             | ---                   | ---                                             |

**Table roles** (Scope: company)

| **Column** | **Type** | **Key or link**                           |
| ---------- | -------- | ----------------------------------------- |
| id         | TEXT     | PK                                        |
| ---        | ---      | ---                                       |
| name       | TEXT     | UQ: cashier, supervisor, manager or owner |
| ---        | ---      | ---                                       |
| rank       | INTEGER  | higher rank can approve lower rank        |
| ---        | ---      | ---                                       |

**Table permissions** (Scope: company)

| **Column**     | **Type**              | **Key or link**                                                              |
| -------------- | --------------------- | ---------------------------------------------------------------------------- |
| id             | TEXT                  | PK                                                                           |
| ---            | ---                   | ---                                                                          |
| role_id        | TEXT                  | FK roles.id                                                                  |
| ---            | ---                   | ---                                                                          |
| action         | TEXT                  | UQ together with role_id, for example sale.void, sale.refund, price.override |
| ---            | ---                   | ---                                                                          |
| allowed        | INTEGER               | 1 or 0                                                                       |
| ---            | ---                   | ---                                                                          |
| needs_approval | INTEGER               | 1 if the role must get an approval first                                     |
| ---            | ---                   | ---                                                                          |
| max_amount     | INTEGER, may be empty | cents; the largest value the role may handle alone                           |
| ---            | ---                   | ---                                                                          |

**Table shifts**

| **Column**    | **Type**              | **Key or link**                                                  |
| ------------- | --------------------- | ---------------------------------------------------------------- |
| id            | TEXT                  | PK                                                               |
| ---           | ---                   | ---                                                              |
| store_id      | TEXT                  | FK stores.id                                                     |
| ---           | ---                   | ---                                                              |
| counter_id    | TEXT                  | FK counters.id                                                   |
| ---           | ---                   | ---                                                              |
| user_id       | TEXT                  | FK users.id, the cashier                                         |
| ---           | ---                   | ---                                                              |
| status        | TEXT                  | open or closed                                                   |
| ---           | ---                   | ---                                                              |
| opening_cash  | INTEGER               | cents, the opening float                                         |
| ---           | ---                   | ---                                                              |
| expected_cash | INTEGER, may be empty | cents; opening float plus cash sales and movements, set at close |
| ---           | ---                   | ---                                                              |
| counted_cash  | INTEGER, may be empty | cents, the closing count                                         |
| ---           | ---                   | ---                                                              |
| variance      | INTEGER, may be empty | cents; counted_cash minus expected_cash                          |
| ---           | ---                   | ---                                                              |
| approved_by   | TEXT, may be empty    | FK users.id, the supervisor who signed off the close             |
| ---           | ---                   | ---                                                              |
| opened_at     | INTEGER               | time                                                             |
| ---           | ---                   | ---                                                              |
| closed_at     | INTEGER, may be empty | time                                                             |
| ---           | ---                   | ---                                                              |

**Table cash_movements** (append-only)

| **Column**  | **Type**           | **Key or link**              |
| ----------- | ------------------ | ---------------------------- |
| id          | TEXT               | PK                           |
| ---         | ---                | ---                          |
| store_id    | TEXT               | FK stores.id                 |
| ---         | ---                | ---                          |
| shift_id    | TEXT               | FK shifts.id                 |
| ---         | ---                | ---                          |
| type        | TEXT               | float, drop, payout or payin |
| ---         | ---                | ---                          |
| amount      | INTEGER            | cents                        |
| ---         | ---                | ---                          |
| user_id     | TEXT               | FK users.id                  |
| ---         | ---                | ---                          |
| approval_id | TEXT, may be empty | FK approvals.id              |
| ---         | ---                | ---                          |
| note        | TEXT, may be empty |                              |
| ---         | ---                | ---                          |
| created_at  | INTEGER            | time                         |
| ---         | ---                | ---                          |

**Table approvals**

| **Column**     | **Type**              | **Key or link**                                    |
| -------------- | --------------------- | -------------------------------------------------- |
| id             | TEXT                  | PK                                                 |
| ---            | ---                   | ---                                                |
| store_id       | TEXT                  | FK stores.id                                       |
| ---            | ---                   | ---                                                |
| action         | TEXT                  | for example sale.void, sale.refund, price.override |
| ---            | ---                   | ---                                                |
| reference_type | TEXT                  | sale, sale_line, payment, shift or other           |
| ---            | ---                   | ---                                                |
| reference_id   | TEXT                  | id of the row named by reference_type              |
| ---            | ---                   | ---                                                |
| requested_by   | TEXT                  | FK users.id                                        |
| ---            | ---                   | ---                                                |
| approved_by    | TEXT, may be empty    | FK users.id, a user with a higher role             |
| ---            | ---                   | ---                                                |
| status         | TEXT                  | pending, approved or rejected                      |
| ---            | ---                   | ---                                                |
| reason         | TEXT, may be empty    |                                                    |
| ---            | ---                   | ---                                                |
| requested_at   | INTEGER               | time                                               |
| ---            | ---                   | ---                                                |
| decided_at     | INTEGER, may be empty | time                                               |
| ---            | ---                   | ---                                                |

**Table audit_log** (append-only)

| **Column**  | **Type**           | **Key or link**                            |
| ----------- | ------------------ | ------------------------------------------ |
| id          | TEXT               | PK                                         |
| ---         | ---                | ---                                        |
| store_id    | TEXT               | FK stores.id                               |
| ---         | ---                | ---                                        |
| user_id     | TEXT, may be empty | FK users.id; empty for system actions      |
| ---         | ---                | ---                                        |
| device_id   | TEXT, may be empty | FK devices.id                              |
| ---         | ---                | ---                                        |
| action      | TEXT               | for example login, sale.void, price.change |
| ---         | ---                | ---                                        |
| entity_type | TEXT               | the table acted on                         |
| ---         | ---                | ---                                        |
| entity_id   | TEXT, may be empty | id of the row acted on                     |
| ---         | ---                | ---                                        |
| detail      | TEXT, may be empty | JSON before and after values               |
| ---         | ---                | ---                                        |
| created_at  | INTEGER            | time; rows are never edited                |
| ---         | ---                | ---                                        |

**Table staff_phone_consents**

| **Column**      | **Type**              | **Key or link**                                    |
| --------------- | --------------------- | -------------------------------------------------- |
| id              | TEXT                  | PK                                                 |
| ---             | ---                   | ---                                                |
| store_id        | TEXT                  | FK stores.id                                       |
| ---             | ---                   | ---                                                |
| user_id         | TEXT                  | FK users.id, the staff member who owns the phone   |
| ---             | ---                   | ---                                                |
| device_id       | TEXT                  | FK devices.id                                      |
| ---             | ---                   | ---                                                |
| consent_version | TEXT                  | version of the consent text that was shown         |
| ---             | ---                   | ---                                                |
| consented_at    | INTEGER               | time                                               |
| ---             | ---                   | ---                                                |
| revoked_at      | INTEGER, may be empty | time; the device stops collecting once this is set |
| ---             | ---                   | ---                                                |

## **8\. Reconciliation and reports**

Each day, the recorded M-Pesa receipts are checked against the statement from the Safaricom business portal, so a forged or missed SMS is caught.

- Daily reconciliation of receipts against the imported statement
- Reports: sales by hour, product, counter, cashier and store; margin; stock value; variances
- End-of-day close that locks the day's figures

Mobile app: none, but it should report its own health: messages received and not yet acknowledged, so gaps are visible.

SQLite:

| **Table**             | **Holds**                                           | **Scope** |
| --------------------- | --------------------------------------------------- | --------- |
| statement_imports     | One row per imported statement file                 | store     |
| ---                   | ---                                                 | ---       |
| statement_lines       | The lines of each statement                         | store     |
| ---                   | ---                                                 | ---       |
| reconciliation_items  | The result of comparing receipts to statement lines | store     |
| ---                   | ---                                                 | ---       |
| day_closes            | The locked figures for each trading day             | store     |
| ---                   | ---                                                 | ---       |
| sales_summary         | Nightly totals used by reports                      | store     |
| ---                   | ---                                                 | ---       |
| device_health_reports | Phone health reports                                | store     |
| ---                   | ---                                                 | ---       |

Reports are computed from the tables above or from sales_summary, refreshed nightly.

**Table statement_imports**

| **Column**   | **Type** | **Key or link**                                           |
| ------------ | -------- | --------------------------------------------------------- |
| id           | TEXT     | PK                                                        |
| ---          | ---      | ---                                                       |
| store_id     | TEXT     | FK stores.id                                              |
| ---          | ---      | ---                                                       |
| endpoint_id  | TEXT     | FK endpoints.id, the till or paybill the statement covers |
| ---          | ---      | ---                                                       |
| file_name    | TEXT     |                                                           |
| ---          | ---      | ---                                                       |
| file_hash    | TEXT     | UQ, stops the same file being imported twice              |
| ---          | ---      | ---                                                       |
| period_start | INTEGER  | time                                                      |
| ---          | ---      | ---                                                       |
| period_end   | INTEGER  | time                                                      |
| ---          | ---      | ---                                                       |
| row_count    | INTEGER  |                                                           |
| ---          | ---      | ---                                                       |
| imported_by  | TEXT     | FK users.id                                               |
| ---          | ---      | ---                                                       |
| imported_at  | INTEGER  | time                                                      |
| ---          | ---      | ---                                                       |

**Table statement_lines**

| **Column**    | **Type**           | **Key or link**                                  |
| ------------- | ------------------ | ------------------------------------------------ |
| id            | TEXT               | PK                                               |
| ---           | ---                | ---                                              |
| store_id      | TEXT               | FK stores.id                                     |
| ---           | ---                | ---                                              |
| import_id     | TEXT               | FK statement_imports.id                          |
| ---           | ---                | ---                                              |
| code          | TEXT               | UQ, the M-Pesa transaction code on the statement |
| ---           | ---                | ---                                              |
| amount        | INTEGER            | cents                                            |
| ---           | ---                | ---                                              |
| payer_name    | TEXT, may be empty |                                                  |
| ---           | ---                | ---                                              |
| payer_phone   | TEXT, may be empty |                                                  |
| ---           | ---                | ---                                              |
| transacted_at | INTEGER            | time                                             |
| ---           | ---                | ---                                              |
| raw_row       | TEXT               | the statement row as imported, kept as evidence  |
| ---           | ---                | ---                                              |

**Table reconciliation_items**

| **Column**        | **Type**              | **Key or link**                                                                           |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| id                | TEXT                  | PK                                                                                        |
| ---               | ---                   | ---                                                                                       |
| store_id          | TEXT                  | FK stores.id                                                                              |
| ---               | ---                   | ---                                                                                       |
| business_date     | TEXT                  | the trading day checked                                                                   |
| ---               | ---                   | ---                                                                                       |
| receipt_id        | TEXT, may be empty    | FK mpesa_receipts.id; empty when the statement has a line the phones never received       |
| ---               | ---                   | ---                                                                                       |
| statement_line_id | TEXT, may be empty    | FK statement_lines.id; empty when a receipt is not on the statement (possible forged SMS) |
| ---               | ---                   | ---                                                                                       |
| status            | TEXT                  | matched, amount_mismatch, missing_from_statement, missing_from_receipts or resolved       |
| ---               | ---                   | ---                                                                                       |
| difference        | INTEGER               | cents; statement amount minus receipt amount                                              |
| ---               | ---                   | ---                                                                                       |
| note              | TEXT, may be empty    |                                                                                           |
| ---               | ---                   | ---                                                                                       |
| resolved_by       | TEXT, may be empty    | FK users.id                                                                               |
| ---               | ---                   | ---                                                                                       |
| resolved_at       | INTEGER, may be empty | time                                                                                      |
| ---               | ---                   | ---                                                                                       |
| created_at        | INTEGER               | time                                                                                      |
| ---               | ---                   | ---                                                                                       |

**Table day_closes**

| **Column**           | **Type** | **Key or link**                                                                                  |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| id                   | TEXT     | PK                                                                                               |
| ---                  | ---      | ---                                                                                              |
| store_id             | TEXT     | FK stores.id                                                                                     |
| ---                  | ---      | ---                                                                                              |
| business_date        | TEXT     | UQ together with store_id                                                                        |
| ---                  | ---      | ---                                                                                              |
| sales_total          | INTEGER  | cents                                                                                            |
| ---                  | ---      | ---                                                                                              |
| cash_total           | INTEGER  | cents                                                                                            |
| ---                  | ---      | ---                                                                                              |
| mpesa_total          | INTEGER  | cents                                                                                            |
| ---                  | ---      | ---                                                                                              |
| card_total           | INTEGER  | cents                                                                                            |
| ---                  | ---      | ---                                                                                              |
| shift_variance_total | INTEGER  | cents, the sum of all shift variances                                                            |
| ---                  | ---      | ---                                                                                              |
| unmatched_receipts   | INTEGER  | count still unmatched at close                                                                   |
| ---                  | ---      | ---                                                                                              |
| closed_by            | TEXT     | FK users.id                                                                                      |
| ---                  | ---      | ---                                                                                              |
| closed_at            | INTEGER  | time; after this, figures for the day are locked and a correction is posted on the next open day |
| ---                  | ---      | ---                                                                                              |

**Table sales_summary**

| **Column**    | **Type**           | **Key or link**                                                                            |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| id            | TEXT               | PK                                                                                         |
| ---           | ---                | ---                                                                                        |
| store_id      | TEXT               | FK stores.id; UQ together with business_date, hour, counter_id, cashier_id and category_id |
| ---           | ---                | ---                                                                                        |
| business_date | TEXT               |                                                                                            |
| ---           | ---                | ---                                                                                        |
| hour          | INTEGER            | 0 to 23                                                                                    |
| ---           | ---                | ---                                                                                        |
| counter_id    | TEXT               | FK counters.id                                                                             |
| ---           | ---                | ---                                                                                        |
| cashier_id    | TEXT               | FK users.id                                                                                |
| ---           | ---                | ---                                                                                        |
| category_id   | TEXT, may be empty | FK categories.id                                                                           |
| ---           | ---                | ---                                                                                        |
| quantity      | REAL               |                                                                                            |
| ---           | ---                | ---                                                                                        |
| gross         | INTEGER            | cents                                                                                      |
| ---           | ---                | ---                                                                                        |
| discount      | INTEGER            | cents                                                                                      |
| ---           | ---                | ---                                                                                        |
| tax           | INTEGER            | cents                                                                                      |
| ---           | ---                | ---                                                                                        |
| cost          | INTEGER            | cents, for margin                                                                          |
| ---           | ---                | ---                                                                                        |
| refreshed_at  | INTEGER            | time                                                                                       |
| ---           | ---                | ---                                                                                        |

**Table device_health_reports**

| **Column**     | **Type**              | **Key or link**                                          |
| -------------- | --------------------- | -------------------------------------------------------- |
| id             | TEXT                  | PK                                                       |
| ---            | ---                   | ---                                                      |
| store_id       | TEXT                  | FK stores.id                                             |
| ---            | ---                   | ---                                                      |
| device_id      | TEXT                  | FK devices.id                                            |
| ---            | ---                   | ---                                                      |
| received_count | INTEGER               | M-Pesa messages the phone has seen in the period         |
| ---            | ---                   | ---                                                      |
| unacked_count  | INTEGER               | messages uploaded but not yet acknowledged by the server |
| ---            | ---                   | ---                                                      |
| last_sms_at    | INTEGER, may be empty | time                                                     |
| ---            | ---                   | ---                                                      |
| period_start   | INTEGER               | time                                                     |
| ---            | ---                   | ---                                                      |
| period_end     | INTEGER               | time                                                     |
| ---            | ---                   | ---                                                      |
| reported_at    | INTEGER               | time                                                     |
| ---            | ---                   | ---                                                      |

## **9\. Sync, administration and operations**

Stores keep selling offline and catch up with head office when the link returns.

- Store-to-flagship event sync, so head office sees every store
- Settings, templates and prices pushed down from head office
- Backups and restore, update tracking and error logs

Mobile app: check for updates, pull remote configuration (server address, filters), and keep a local queue that survives reboots.

SQLite:

| **Table**           | **Holds**                                                         |
| ------------------- | ----------------------------------------------------------------- |
| stores              | Every store, including the flagship                               |
| ---                 | ---                                                               |
| settings            | Store configuration                                               |
| ---                 | ---                                                               |
| outbound_events     | Transactional outbox, written in the same transaction as the sale |
| ---                 | ---                                                               |
| sync_cursor         | What has already been sent upward                                 |
| ---                 | ---                                                               |
| inbound_events_seen | Event ids already processed, for deduplication                    |
| ---                 | ---                                                               |
| schema_migrations   | Applied database changes                                          |
| ---                 | ---                                                               |
| device_configs      | Remote configuration pulled by phones                             |
| ---                 | ---                                                               |
| app_releases        | Phone app versions, for update tracking                           |
| ---                 | ---                                                               |
| backup_runs         | Backup and restore history                                        |
| ---                 | ---                                                               |
| error_logs          | Errors from the server and the phones                             |
| ---                 | ---                                                               |

**Table stores** (Scope: company)

| **Column**    | **Type** | **Key or link**                                   |
| ------------- | -------- | ------------------------------------------------- |
| id            | TEXT     | PK                                                |
| ---           | ---      | ---                                               |
| code          | TEXT     | UQ, short code such as NBO01                      |
| ---           | ---      | ---                                               |
| name          | TEXT     |                                                   |
| ---           | ---      | ---                                               |
| type          | TEXT     | flagship or branch                                |
| ---           | ---      | ---                                               |
| price_list_id | TEXT     | FK price_lists.id, the store's default price list |
| ---           | ---      | ---                                               |
| timezone      | TEXT     | for example Africa/Nairobi                        |
| ---           | ---      | ---                                               |
| currency      | TEXT     | for example KES                                   |
| ---           | ---      | ---                                               |
| active        | INTEGER  | 1 or 0                                            |
| ---           | ---      | ---                                               |
| created_at    | INTEGER  | time                                              |
| ---           | ---      | ---                                               |

**Table settings**

| **Column** | **Type** | **Key or link**                                                                 |
| ---------- | -------- | ------------------------------------------------------------------------------- |
| id         | TEXT     | PK                                                                              |
| ---        | ---      | ---                                                                             |
| store_id   | TEXT     | FK stores.id; UQ together with key                                              |
| ---        | ---      | ---                                                                             |
| key        | TEXT     | for example receipt.footer, vat.default                                         |
| ---        | ---      | ---                                                                             |
| value      | TEXT     |                                                                                 |
| ---        | ---      | ---                                                                             |
| source     | TEXT     | local or head_office; a head office value replaces a local one when pushed down |
| ---        | ---      | ---                                                                             |
| updated_at | INTEGER  | time                                                                            |
| ---        | ---      | ---                                                                             |

**Table outbound_events** (append-only)

| **Column**  | **Type** | **Key or link**                                                      |
| ----------- | -------- | -------------------------------------------------------------------- |
| id          | TEXT     | PK, the event id used for deduplication at head office               |
| ---         | ---      | ---                                                                  |
| store_id    | TEXT     | FK stores.id                                                         |
| ---         | ---      | ---                                                                  |
| seq         | INTEGER  | UQ together with store_id; counts up in the order events are written |
| ---         | ---      | ---                                                                  |
| entity_type | TEXT     | the table the event is about, for example sales                      |
| ---         | ---      | ---                                                                  |
| entity_id   | TEXT     | id of the row the event is about                                     |
| ---         | ---      | ---                                                                  |
| op          | TEXT     | insert or update                                                     |
| ---         | ---      | ---                                                                  |
| payload     | TEXT     | JSON copy of the row                                                 |
| ---         | ---      | ---                                                                  |
| created_at  | INTEGER  | time; written in the same transaction as the change itself           |
| ---         | ---      | ---                                                                  |

**Table sync_cursor**

| **Column**      | **Type**              | **Key or link**                                           |
| --------------- | --------------------- | --------------------------------------------------------- |
| id              | TEXT                  | PK                                                        |
| ---             | ---                   | ---                                                       |
| store_id        | TEXT                  | FK stores.id; UQ together with peer                       |
| ---             | ---                   | ---                                                       |
| peer            | TEXT                  | what it syncs with, for example flagship                  |
| ---             | ---                   | ---                                                       |
| last_seq_sent   | INTEGER               | the highest outbound_events.seq the peer has acknowledged |
| ---             | ---                   | ---                                                       |
| last_attempt_at | INTEGER, may be empty | time                                                      |
| ---             | ---                   | ---                                                       |
| last_success_at | INTEGER, may be empty | time                                                      |
| ---             | ---                   | ---                                                       |
| last_error      | TEXT, may be empty    |                                                           |
| ---             | ---                   | ---                                                       |

**Table inbound_events_seen**

| **Column**      | **Type** | **Key or link**                          |
| --------------- | -------- | ---------------------------------------- |
| id              | TEXT     | PK, the id of the event that was applied |
| ---             | ---      | ---                                      |
| store_id        | TEXT     | FK stores.id, the store that received it |
| ---             | ---      | ---                                      |
| origin_store_id | TEXT     | FK stores.id, the store that sent it     |
| ---             | ---      | ---                                      |
| applied_at      | INTEGER  | time                                     |
| ---             | ---      | ---                                      |

**Table schema_migrations**

| **Column** | **Type** | **Key or link**                                        |
| ---------- | -------- | ------------------------------------------------------ |
| version    | INTEGER  | PK                                                     |
| ---        | ---      | ---                                                    |
| name       | TEXT     |                                                        |
| ---        | ---      | ---                                                    |
| checksum   | TEXT     | detects a migration file that was changed after it ran |
| ---        | ---      | ---                                                    |
| applied_at | INTEGER  | time                                                   |
| ---        | ---      | ---                                                    |

**Table device_configs**

| **Column** | **Type**           | **Key or link**                                     |
| ---------- | ------------------ | --------------------------------------------------- |
| id         | TEXT               | PK                                                  |
| ---        | ---                | ---                                                 |
| store_id   | TEXT               | FK stores.id                                        |
| ---        | ---                | ---                                                 |
| device_id  | TEXT, may be empty | FK devices.id; empty means every phone in the store |
| ---        | ---                | ---                                                 |
| key        | TEXT               | for example server_url, sender_filter, send_rate    |
| ---        | ---                | ---                                                 |
| value      | TEXT               |                                                     |
| ---        | ---                | ---                                                 |
| updated_at | INTEGER            | time                                                |
| ---        | ---                | ---                                                 |

**Table app_releases** (Scope: company)

| **Column**    | **Type**           | **Key or link**                 |
| ------------- | ------------------ | ------------------------------- |
| id            | TEXT               | PK                              |
| ---           | ---                | ---                             |
| version       | TEXT               | UQ                              |
| ---           | ---                | ---                             |
| min_supported | INTEGER            | 1 if older versions must update |
| ---           | ---                | ---                             |
| notes         | TEXT, may be empty |                                 |
| ---           | ---                | ---                             |
| released_at   | INTEGER            | time                            |
| ---           | ---                | ---                             |

A phone's installed version is devices.app_version; comparing it with the latest app_releases row shows which phones need an update.

**Table backup_runs**

| **Column**  | **Type**              | **Key or link**                      |
| ----------- | --------------------- | ------------------------------------ |
| id          | TEXT                  | PK                                   |
| ---         | ---                   | ---                                  |
| store_id    | TEXT                  | FK stores.id                         |
| ---         | ---                   | ---                                  |
| kind        | TEXT                  | litestream, snapshot or restore_test |
| ---         | ---                   | ---                                  |
| status      | TEXT                  | running, ok or failed                |
| ---         | ---                   | ---                                  |
| location    | TEXT                  | where the copy was written           |
| ---         | ---                   | ---                                  |
| size_bytes  | INTEGER, may be empty |                                      |
| ---         | ---                   | ---                                  |
| error       | TEXT, may be empty    |                                      |
| ---         | ---                   | ---                                  |
| started_at  | INTEGER               | time                                 |
| ---         | ---                   | ---                                  |
| finished_at | INTEGER, may be empty | time                                 |
| ---         | ---                   | ---                                  |

**Table error_logs**

| **Column** | **Type**           | **Key or link**                               |
| ---------- | ------------------ | --------------------------------------------- |
| id         | TEXT               | PK                                            |
| ---        | ---                | ---                                           |
| store_id   | TEXT               | FK stores.id                                  |
| ---        | ---                | ---                                           |
| source     | TEXT               | server or device                              |
| ---        | ---                | ---                                           |
| device_id  | TEXT, may be empty | FK devices.id, set when the source is a phone |
| ---        | ---                | ---                                           |
| level      | TEXT               | warning, error or fatal                       |
| ---        | ---                | ---                                           |
| message    | TEXT               |                                               |
| ---        | ---                | ---                                           |
| detail     | TEXT, may be empty | stack trace or JSON context                   |
| ---        | ---                | ---                                           |
| created_at | INTEGER            | time                                          |
| ---        | ---                | ---                                           |

## **Mobile app requirements**

The app is a gateway with its own small queue, and it must do these seven things:

1. Run as a foreground service, with battery restrictions turned off for it.
2. Receive SMS, filter by sender, and upload each message with a unique id until the server acknowledges it.
3. Send SMS from the server's queue, with pacing and a result report for each message.
4. Register with a per-device token and declare which endpoints it covers.
5. Send heartbeats, and alert the cashier on screen if it stops.
6. Keep a local queue (Room) so nothing is lost while offline or after a reboot.
7. Optionally run USSD for balance checks on its own SIM.

It cannot send a PIN prompt (STK push) to a customer. Only Safaricom's servers can, through the Daraja API.

## **SQLite design rules**

These rules apply to every table above.

- WAL mode on, with one writer per store.
- Every row carries a store_id and a globally unique id (UUID or ULID), so stores can be merged at head office. Company-wide tables are the exception: they have no store_id and are copied down from head office.
- A sale and its outbound event are written in one transaction.
- Corrections are new rows (refunds, stock adjustments), never edits to old ones.
- Unique constraints on the M-Pesa code and on event ids.
- Foreign keys are switched on (PRAGMA foreign_keys = ON) for every connection.
- Litestream ships changes to off-site storage, and a restore step runs before the service starts on a new machine.
