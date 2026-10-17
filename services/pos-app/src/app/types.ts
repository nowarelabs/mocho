// Domain types mirroring the store schema in services/pos-backend/src/db/schema.
// The UI holds money as decimal currency units; the schema stores the same
// amounts as integer cents, a conversion the backend will own.

export type RoleId = 'owner' | 'manager' | 'cashier' | 'stockkeeper';

export interface Role {
  id: RoleId;
  name: string;
  rank: number;
}

export interface Permission {
  roleId: RoleId;
  action: string;
  allowed: boolean;
  needsApproval: boolean;
  maxAmount: number | null;
}

export interface StoreRow {
  id: string;
  code: string;
  name: string;
  type: 'flagship' | 'branch';
  timezone: string;
  currency: string;
  active: boolean;
}

export interface User {
  id: string;
  storeId: string;
  name: string;
  phone: string;
  roleId: RoleId;
  pin: string;
  active: boolean;
}

export interface Uom { id: string; code: string; name: string; allowsDecimal: boolean; }

export interface TaxRate { id: string; name: string; rateBp: number; active: boolean; }

export interface Category { id: string; name: string; parentId: string | null; active: boolean; }

export interface PriceList { id: string; name: string; currency: string; pricesIncludeTax: boolean; active: boolean; }

export interface Promotion {
  id: string;
  name: string;
  type: 'percent_off' | 'amount_off' | 'buy_x_get_y' | 'bundle_price';
  value: number;
  minQuantity: number;
  startsAt: number;
  endsAt: number;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  uomId: string;
  taxRateId: string;
  isBundle: boolean;
  soldByWeight: boolean;
  trackStock: boolean;
  cost: number;
  price: number;
  stock: number;
  lowStock: number;
  active: boolean;
}

export interface LineItem { id: string; name: string; price: number; qty: number; discount: number; }

export interface Totals { subtotal: number; discount: number; tax: number; total: number; }

export type Method = 'cash' | 'mpesa' | 'card';

export type SaleStatus = 'open' | 'held' | 'paid' | 'voided' | 'refunded';

export interface Payment {
  id: string;
  method: Method;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  endpointId: string | null;
}

export interface Order extends Totals {
  id: number;
  receiptNo: string;
  at: number;
  items: LineItem[];
  discountPct: number;
  customerId: string | null;
  counterId: string;
  cashierId: string;
  payments: Payment[];
  method: Method | 'split';
  tendered: number;
  change: number;
  status: SaleStatus;
  closedAt?: number | null;
}

export interface Counter { id: string; number: number; name: string; receiptPrefix: string; enabled: boolean; }

export interface Device {
  id: string;
  label: string;
  appVersion: string;
  batteryPct: number;
  queueSize: number;
  signalLevel: number;
  lastSeenAt: number;
  enabled: boolean;
}

export interface Endpoint {
  id: string;
  type: 'till' | 'paybill' | 'phone';
  number: string;
  counterId: string | null;
  userId: string | null;
  deviceId: string;
  enabled: boolean;
}

export interface Supplier { id: string; name: string; phone: string; email: string; paymentTermsDays: number; active: boolean; }

export interface PurchaseOrder {
  id: string;
  poNo: string;
  supplierId: string;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  total: number;
  expectedAt: number | null;
  createdAt: number;
}

export type StockReason =
  | 'sale' | 'return' | 'delivery' | 'transfer_out' | 'transfer_in'
  | 'count_adjustment' | 'damage' | 'expiry' | 'correction';

export interface StockMovement {
  id: string;
  productId: string;
  change: number;
  reason: StockReason;
  referenceType: string | null;
  referenceId: string | null;
  userId: string | null;
  note: string;
  at: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  creditLimit: number;
  creditBalance: number;
  smsOptIn: boolean;
  createdAt: number;
}

export interface MpesaReceipt {
  id: string;
  code: string;
  amount: number;
  payerName: string;
  payerPhone: string;
  rawText: string;
  endpointId: string | null;
  at: number;
  status: 'matched' | 'unmatched' | 'reversed';
  paymentId: string | null;
}

export interface ReconciliationItem {
  id: string;
  businessDate: string;
  receiptCode: string | null;
  statementCode: string | null;
  status: 'matched' | 'amount_mismatch' | 'missing_from_statement' | 'missing_from_receipts' | 'resolved';
  difference: number;
  note: string;
  resolvedBy: string | null;
  resolvedAt: number | null;
}

export interface DayClose {
  id: string;
  businessDate: string;
  salesTotal: number;
  cashTotal: number;
  mpesaTotal: number;
  cardTotal: number;
  shiftVarianceTotal: number;
  unmatchedReceipts: number;
  closedBy: string;
  closedAt: number;
}

export interface SmsTemplate { id: string; name: string; purpose: string; body: string; language: string; active: boolean; }

export interface SmsCampaign {
  id: string;
  name: string;
  templateId: string;
  status: 'draft' | 'running' | 'paused' | 'done';
  pacePerMinute: number;
  createdAt: number;
}

export interface SmsMessage {
  id: string;
  customerId: string | null;
  phone: string;
  purpose: string;
  body: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  attempts: number;
  at: number;
}

export interface Shift {
  id: string;
  counterId: string;
  userId: string;
  status: 'open' | 'closed';
  openingCash: number;
  expectedCash: number | null;
  countedCash: number | null;
  variance: number | null;
  openedAt: number;
  closedAt: number | null;
}

export interface CashMovement {
  id: string;
  shiftId: string;
  type: 'float' | 'drop' | 'payout' | 'payin';
  amount: number;
  userId: string;
  note: string;
  at: number;
}

export interface Approval {
  id: string;
  action: string;
  referenceType: 'sale' | 'sale_line' | 'payment' | 'shift' | 'other';
  referenceId: string;
  requestedBy: string;
  approvedBy: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  requestedAt: number;
  decidedAt: number | null;
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string;
  at: number;
}

export interface Setting { key: string; value: string; source: 'local' | 'head_office'; }

export interface AppRelease { id: string; version: string; minSupported: boolean; notes: string; releasedAt: number; }

export interface SyncPeer { peer: string; lastSeqSent: number; lastSuccessAt: number | null; lastError: string | null; }

export interface BackupRun {
  id: string;
  kind: 'litestream' | 'snapshot' | 'restore_test';
  status: 'running' | 'ok' | 'failed';
  location: string;
  sizeBytes: number;
  startedAt: number;
}

export interface ErrorLog {
  id: string;
  source: 'server' | 'device';
  level: 'warning' | 'error' | 'fatal';
  message: string;
  at: number;
}
