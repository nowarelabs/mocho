// Deterministic dummy datasets, one per store, standing in for the SQLite
// tables the backend will own. The same store always seeds identical figures so
// the UI and its tests are reproducible.

import type {
  AppRelease, Approval, AuditEntry, BackupRun, CashMovement, Category, Counter, Customer,
  DayClose, Device, Endpoint, ErrorLog, MpesaReceipt, Order, Payment, PriceList, Product,
  Promotion, PurchaseOrder, ReconciliationItem, Setting, Shift, SmsCampaign, SmsMessage,
  SmsTemplate, StockMovement, StoreRow, Supplier, SyncPeer, TaxRate, Uom, User, Method,
} from './types.ts';
import { dateValue, round2 } from './util.ts';

export interface Dataset {
  storeId: string;
  products: Product[];
  orders: Order[];
  mpesaReceipts: MpesaReceipt[];
  reconciliationItems: ReconciliationItem[];
  dayCloses: DayClose[];
  nextOrder: number;
  uoms: Uom[];
  taxRates: TaxRate[];
  categories: Category[];
  priceLists: PriceList[];
  promotions: Promotion[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  stockMovements: StockMovement[];
  customers: Customer[];
  smsTemplates: SmsTemplate[];
  smsCampaigns: SmsCampaign[];
  smsOutbox: SmsMessage[];
  counters: Counter[];
  devices: Device[];
  endpoints: Endpoint[];
  shifts: Shift[];
  cashMovements: CashMovement[];
  approvals: Approval[];
  auditLog: AuditEntry[];
  settings: Setting[];
  appReleases: AppRelease[];
  syncPeers: SyncPeer[];
  backupRuns: BackupRun[];
  errorLogs: ErrorLog[];
}

const rngFactory = (seed: number): (() => number) => {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

const seedFor = (code: string): number => [...code].reduce((a, c) => a + c.charCodeAt(0), 7);

interface Seed { sku: string; name: string; category: string; price: number; cost: number; stock: number; low: number }

const CATALOG: Seed[] = [
  { sku: 'COF-ESP', name: 'Espresso', category: 'Coffee', price: 3.0, cost: 0.7, stock: 80, low: 12 },
  { sku: 'COF-AME', name: 'Americano', category: 'Coffee', price: 3.5, cost: 0.75, stock: 80, low: 12 },
  { sku: 'COF-CAP', name: 'Cappuccino', category: 'Coffee', price: 4.5, cost: 1.1, stock: 60, low: 12 },
  { sku: 'COF-LAT', name: 'Latte', category: 'Coffee', price: 4.75, cost: 1.15, stock: 60, low: 12 },
  { sku: 'COF-FLW', name: 'Flat white', category: 'Coffee', price: 4.5, cost: 1.1, stock: 50, low: 12 },
  { sku: 'COF-MOC', name: 'Mocha', category: 'Coffee', price: 5.25, cost: 1.35, stock: 40, low: 10 },
  { sku: 'COF-CBR', name: 'Cold brew', category: 'Coffee', price: 4.75, cost: 1.2, stock: 24, low: 8 },
  { sku: 'TEA-CHA', name: 'Chai latte', category: 'Tea', price: 4.75, cost: 1.05, stock: 30, low: 8 },
  { sku: 'TEA-MAT', name: 'Matcha latte', category: 'Tea', price: 5.25, cost: 1.6, stock: 4, low: 8 },
  { sku: 'TEA-EGR', name: 'Earl Grey', category: 'Tea', price: 3.25, cost: 0.6, stock: 40, low: 8 },
  { sku: 'BAK-CRO', name: 'Butter croissant', category: 'Bakery', price: 3.75, cost: 1.5, stock: 18, low: 6 },
  { sku: 'BAK-PNC', name: 'Pain au chocolat', category: 'Bakery', price: 4.25, cost: 1.7, stock: 12, low: 6 },
  { sku: 'BAK-MUF', name: 'Blueberry muffin', category: 'Bakery', price: 3.5, cost: 1.3, stock: 3, low: 6 },
  { sku: 'BAK-BNB', name: 'Banana bread', category: 'Bakery', price: 3.95, cost: 1.4, stock: 10, low: 6 },
  { sku: 'FOD-AVO', name: 'Avocado toast', category: 'Food', price: 9.5, cost: 3.2, stock: 14, low: 5 },
  { sku: 'FOD-BRK', name: 'Breakfast sandwich', category: 'Food', price: 8.25, cost: 3.0, stock: 0, low: 5 },
  { sku: 'FOD-GRN', name: 'Granola bowl', category: 'Food', price: 7.5, cost: 2.4, stock: 9, low: 5 },
  { sku: 'BEA-HSE', name: 'House blend, 250g', category: 'Beans', price: 14.0, cost: 6.5, stock: 22, low: 6 },
  { sku: 'BEA-SNG', name: 'Single origin, 250g', category: 'Beans', price: 17.5, cost: 8.2, stock: 15, low: 6 },
];

const CATEGORY_NAMES = ['Coffee', 'Tea', 'Bakery', 'Food', 'Beans', 'Retail'];

export function seedDataset(store: StoreRow, staff: User[]): Dataset {
  const rnd = rngFactory(seedFor(store.code));
  const factor = store.type === 'flagship' ? 1 : 0.62;
  const low = store.type === 'flagship' ? 1 : 1.35;
  const id = (prefix: string, n: number): string => `${prefix}_${store.code.toLowerCase()}_${n}`;
  const now = Date.now();
  const days = (n: number): number => now - n * 864e5;

  const uoms: Uom[] = [
    { id: 'uom_each', code: 'EA', name: 'Each', allowsDecimal: false },
    { id: 'uom_kg', code: 'KG', name: 'Kilogram', allowsDecimal: true },
    { id: 'uom_pack', code: 'PK', name: 'Pack', allowsDecimal: false },
  ];
  const taxRates: TaxRate[] = [
    { id: 'tax_std', name: 'Standard', rateBp: 800, active: true },
    { id: 'tax_zero', name: 'Zero-rated', rateBp: 0, active: true },
  ];

  const categories: Category[] = CATEGORY_NAMES.map((name, i) => ({ id: id('cat', i + 1), name, parentId: null, active: true }));

  const products: Product[] = CATALOG.map((s, i) => ({
    id: s.sku.toLowerCase(),
    sku: s.sku,
    name: s.name,
    category: s.category,
    uomId: 'uom_each',
    taxRateId: 'tax_std',
    isBundle: false,
    soldByWeight: false,
    trackStock: true,
    cost: s.cost,
    price: s.price,
    stock: Math.round(s.stock * factor),
    lowStock: Math.max(2, Math.round(s.low * low)),
    active: true,
  }));

  const priceLists: PriceList[] = [
    { id: 'pl_retail', name: 'Retail', currency: store.currency, pricesIncludeTax: true, active: true },
    { id: 'pl_wholesale', name: 'Wholesale', currency: store.currency, pricesIncludeTax: false, active: true },
  ];

  const promotions: Promotion[] = [
    { id: id('promo', 1), name: 'Morning coffee 10%', type: 'percent_off', value: 1000, minQuantity: 1, startsAt: days(14), endsAt: now + 14 * 864e5, active: true },
    { id: id('promo', 2), name: 'Buy 2 pastries', type: 'buy_x_get_y', value: 1, minQuantity: 2, startsAt: days(7), endsAt: now + 21 * 864e5, active: true },
    { id: id('promo', 3), name: 'Beans bundle', type: 'bundle_price', value: 2500, minQuantity: 2, startsAt: days(30), endsAt: days(2), active: false },
  ];

  const suppliers: Supplier[] = [
    { id: id('sup', 1), name: 'Kenya Coffee Traders', phone: '+254711100001', email: 'orders@kct.example', paymentTermsDays: 14, active: true },
    { id: id('sup', 2), name: 'Nairobi Bakery Supply', phone: '+254711100002', email: 'sales@nbs.example', paymentTermsDays: 7, active: true },
    { id: id('sup', 3), name: 'Fresh Foods Ltd', phone: '+254711100003', email: 'hello@freshfoods.example', paymentTermsDays: 30, active: true },
  ];

  const counters: Counter[] = [
    { id: id('ctr', 1), number: 1, name: 'Front till', receiptPrefix: `${store.code}-1-`, enabled: true },
    { id: id('ctr', 2), number: 2, name: 'Bar till', receiptPrefix: `${store.code}-2-`, enabled: true },
  ];

  const devices: Device[] = [
    { id: id('dev', 1), label: 'Gateway phone A', appVersion: '1.4.0', batteryPct: 82, queueSize: 0, signalLevel: 4, lastSeenAt: now - 45_000, enabled: true },
    { id: id('dev', 2), label: 'Gateway phone B', appVersion: '1.3.2', batteryPct: 37, queueSize: 3, signalLevel: 2, lastSeenAt: now - 9 * 60_000, enabled: true },
  ];

  const endpoints: Endpoint[] = [
    { id: id('end', 1), type: 'till', number: '400201', counterId: counters[0].id, userId: null, deviceId: devices[0].id, enabled: true },
    { id: id('end', 2), type: 'paybill', number: '247247', counterId: null, userId: null, deviceId: devices[0].id, enabled: true },
    { id: id('end', 3), type: 'phone', number: '+254700000002', counterId: null, userId: staff.find((u) => u.roleId === 'manager')?.id ?? null, deviceId: devices[1].id, enabled: true },
  ];

  const customers: Customer[] = Array.from({ length: 8 }, (_, i) => {
    const names = ['Wanjiku Mwangi', 'Tobias Ochieng', 'Neema Achieng', 'Kevin Kimani', 'Lydia Wambui', 'Samuel Kiptoo', 'Halima Noor', 'Daniel Murerwa'];
    return {
      id: id('cus', i + 1),
      name: names[i],
      phone: `+2547${String(20000000 + i * 111111).slice(0, 8)}`,
      email: `${names[i].split(' ')[0].toLowerCase()}@example.com`,
      loyaltyPoints: Math.floor(rnd() * 900),
      creditLimit: i % 3 === 0 ? 5000 : 0,
      creditBalance: i % 3 === 0 ? round2(rnd() * 1200) : 0,
      smsOptIn: i % 4 !== 0,
      createdAt: days(120 - i * 9),
    };
  });

  const sellers = staff.filter((u) => u.roleId !== 'stockkeeper');
  const methods: Method[] = ['card', 'cash', 'cash', 'mpesa', 'card'];
  const weights = [3, 5, 3, 2, 4, 5, 3, 2, 2, 3, 2, 1];
  const orders: Order[] = [];
  let seq = 1;
  const countersFor = (): Counter => counters[rnd() < 0.65 ? 0 : 1];
  for (let d = 6; d >= 0; d--) {
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    const dayStart = base.getTime() - d * 864e5;
    for (let h = 7; h <= 18; h++) {
      if (d === 0 && h > new Date(now).getHours()) break;
      const n = Math.round(weights[h - 7] * (0.6 + rnd() * 0.8) * (store.type === 'flagship' ? 1 : 0.7));
      for (let i = 0; i < n; i++) {
        const at = new Date(dayStart).setHours(h, Math.floor(rnd() * 60));
        if (at > now) continue;
        const items: any[] = [];
        const k = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < k; j++) {
          const p = products[Math.floor(rnd() * rnd() * products.length)];
          const ex = items.find((x) => x.id === p.id);
          if (ex) ex.qty++;
          else items.push({ id: p.id, name: p.name, price: p.price, qty: rnd() < 0.2 ? 2 : 1, discount: 0 });
        }
        const subtotal = round2(items.reduce((a, l) => a + l.price * l.qty, 0));
        const tax = round2(subtotal * 0.08);
        const method = methods[Math.floor(rnd() * methods.length)];
        const tendered = method === 'cash' ? Math.ceil((subtotal + tax) / 5) * 5 : round2(subtotal + tax);
        const counter = countersFor();
        const seller = sellers.length ? sellers[Math.floor(rnd() * sellers.length)] : staff[0];
        const payments: Payment[] = [{ id: id('pay', seq), method, amount: round2(subtotal + tax), status: 'confirmed', endpointId: null }];
        orders.push({
          id: 0,
          receiptNo: `${counter.receiptPrefix}${String(seq).padStart(4, '0')}`,
          at,
          items,
          subtotal,
          discount: 0,
          tax,
          total: round2(subtotal + tax),
          discountPct: 0,
          customerId: rnd() < 0.25 ? customers[Math.floor(rnd() * customers.length)].id : null,
          counterId: counter.id,
          cashierId: seller.id,
          payments,
          method,
          tendered,
          change: method === 'cash' ? round2(tendered - (subtotal + tax)) : 0,
          status: rnd() < 0.03 ? 'refunded' : 'paid',
        });
        seq++;
      }
    }
  }
  // A live, unpaid M-Pesa sale so the "match receipt" flow has something to
  // reconcile against, exactly like the store open on a trading day.
  const pendingItems = [
    { id: products[0].id, name: products[0].name, price: products[0].price, qty: 2, discount: 0 },
    { id: products[10].id, name: products[10].name, price: products[10].price, qty: 1, discount: 0 },
  ];
  const pendingSubtotal = round2(pendingItems.reduce((a, l) => a + l.price * l.qty, 0));
  const pendingTax = round2(pendingSubtotal * 0.08);
  const pendingTotal = round2(pendingSubtotal + pendingTax);
  orders.push({
    id: 0,
    receiptNo: `${counters[0].receiptPrefix}${String(seq).padStart(4, '0')}`,
    at: now - 4 * 60_000,
    items: pendingItems,
    subtotal: pendingSubtotal,
    discount: 0,
    tax: pendingTax,
    total: pendingTotal,
    discountPct: 0,
    customerId: customers[0].id,
    counterId: counters[0].id,
    cashierId: sellers[0]?.id ?? staff[0].id,
    payments: [{ id: id('pay', seq), method: 'mpesa', amount: pendingTotal, status: 'pending', endpointId: endpoints[0].id }],
    method: 'mpesa',
    tendered: pendingTotal,
    change: 0,
    status: 'open',
  });
  seq++;

  orders.sort((a, b) => a.at - b.at).forEach((o, i) => (o.id = 1001 + i));

  const matchedOrder = orders.find((o) => o.method === 'mpesa' && o.status === 'paid');
  const mpesaReceipts: MpesaReceipt[] = [
    {
      id: id('mps', 1), code: 'QGR7XK21PA', amount: pendingTotal, payerName: customers[0].name,
      payerPhone: customers[0].phone, rawText: `QGR7XK21PA Confirmed. Ksh${pendingTotal.toFixed(2)} sent from ${customers[0].phone}.`,
      endpointId: endpoints[0].id, at: now - 3 * 60_000, status: 'unmatched', paymentId: null,
    },
    {
      id: id('mps', 2), code: 'QGR3LM88TZ', amount: matchedOrder?.total ?? 0, payerName: 'Walk-in payer',
      payerPhone: '+254722000111', rawText: `QGR3LM88TZ Confirmed. Ksh${(matchedOrder?.total ?? 0).toFixed(2)} received.`,
      endpointId: endpoints[0].id, at: now - 2 * 3600_000, status: 'matched', paymentId: matchedOrder?.payments[0]?.id ?? null,
    },
    {
      id: id('mps', 3), code: 'QGR1AB45CD', amount: 8.0, payerName: 'Brian Otieno',
      payerPhone: '+254722333444', rawText: 'QGR1AB45CD Confirmed. Ksh8.00 received.',
      endpointId: endpoints[1].id, at: days(1), status: 'unmatched', paymentId: null,
    },
  ];

  const yesterday = dateValue(now - 864e5);
  const today = dateValue(now);
  const reconciliationItems: ReconciliationItem[] = [
    {
      id: id('rec', 1), businessDate: today, receiptCode: 'QGR3LM88TZ', statementCode: 'QGR3LM88TZ',
      status: 'matched', difference: 0, note: '', resolvedBy: null, resolvedAt: null,
    },
    {
      id: id('rec', 2), businessDate: today, receiptCode: 'QGR7XK21PA', statementCode: null,
      status: 'missing_from_statement', difference: pendingTotal, note: 'Confirm with Safaricom statement', resolvedBy: null, resolvedAt: null,
    },
    {
      id: id('rec', 3), businessDate: yesterday, receiptCode: null, statementCode: 'QGR9ZZ10QQ',
      status: 'missing_from_receipts', difference: 12.0, note: 'Statement shows a payment with no receipt', resolvedBy: null, resolvedAt: null,
    },
    {
      id: id('rec', 4), businessDate: yesterday, receiptCode: 'QGR2PQ77RS', statementCode: 'QGR2PQ77RS',
      status: 'amount_mismatch', difference: 1.5, note: 'Receipt and statement differ by 1.50', resolvedBy: null, resolvedAt: null,
    },
  ];

  const dayCloses: DayClose[] = [
    {
      id: id('day', 1), businessDate: yesterday, salesTotal: 812.4, cashTotal: 233.4, mpesaTotal: 412.0,
      cardTotal: 167.0, shiftVarianceTotal: -2.0, unmatchedReceipts: 1,
      closedBy: staff.find((u) => u.roleId === 'manager')?.id ?? staff[0].id, closedAt: days(1) + 9 * 3600_000,
    },
  ];
  const stockMovements: StockMovement[] = [];
  products.slice(0, 8).forEach((p, i) => {
    stockMovements.push({
      id: id('smv', i + 1), productId: p.id, change: Math.max(4, Math.round(p.stock * 0.4)), reason: 'delivery',
      referenceType: 'grn', referenceId: id('grn', i + 1), userId: staff.find((u) => u.roleId === 'stockkeeper')?.id ?? null,
      note: 'Weekly delivery', at: days(3),
    });
  });

  const purchaseOrders: PurchaseOrder[] = [
    { id: id('po', 1), poNo: `${store.code}-PO-1001`, supplierId: suppliers[0].id, status: 'sent', total: 420.5, expectedAt: now + 2 * 864e5, createdAt: days(1) },
    { id: id('po', 2), poNo: `${store.code}-PO-1002`, supplierId: suppliers[1].id, status: 'draft', total: 180.0, expectedAt: now + 4 * 864e5, createdAt: now - 3600_000 },
    { id: id('po', 3), poNo: `${store.code}-PO-1000`, supplierId: suppliers[2].id, status: 'received', total: 610.25, expectedAt: days(2), createdAt: days(6) },
  ];

  const shifts: Shift[] = [
    { id: id('shf', 1), counterId: counters[0].id, userId: sellers[0]?.id ?? staff[0].id, status: 'closed', openingCash: 100, expectedCash: 486.5, countedCash: 484.5, variance: -2, openedAt: days(1), closedAt: days(1) + 9 * 3600_000 },
  ];

  const cashMovements: CashMovement[] = [
    { id: id('csh', 1), shiftId: shifts[0].id, type: 'float', amount: 100, userId: sellers[0]?.id ?? staff[0].id, note: 'Opening float', at: days(1) },
    { id: id('csh', 2), shiftId: shifts[0].id, type: 'drop', amount: 200, userId: sellers[0]?.id ?? staff[0].id, note: 'Midday drop', at: days(1) + 4 * 3600_000 },
  ];

  const approvals: Approval[] = [
    {
      id: id('apr', 1), action: 'sell.discount', referenceType: 'sale', referenceId: '1032', requestedBy: sellers[1]?.id ?? staff[0].id,
      approvedBy: null, status: 'pending', reason: 'Regular customer, 20% off a large order', requestedAt: now - 12 * 60_000, decidedAt: null,
    },
    {
      id: id('apr', 2), action: 'sale.refund', referenceType: 'sale', referenceId: '1019', requestedBy: sellers[0]?.id ?? staff[0].id,
      approvedBy: staff.find((u) => u.roleId === 'manager')?.id ?? null, status: 'approved', reason: 'Cold drink returned', requestedAt: days(1), decidedAt: days(1) + 600_000,
    },
  ];

  const auditLog: AuditEntry[] = [
    { id: id('aud', 1), userId: staff.find((u) => u.roleId === 'manager')?.id ?? null, action: 'price.update', entityType: 'product', entityId: products[3].id, detail: 'Latte 4.50 → 4.75', at: days(2) },
    { id: id('aud', 2), userId: staff[0].id, action: 'stock.adjust', entityType: 'product', entityId: products[8].id, detail: 'Matcha +6 via count', at: days(1) },
    { id: id('aud', 3), userId: null, action: 'sync.push', entityType: 'store', entityId: store.id, detail: '142 events to head office', at: now - 3600_000 },
  ];

  const settings: Setting[] = [
    { key: 'store.name', value: store.name, source: 'local' },
    { key: 'receipt.footer', value: 'Asante for shopping with Mocho!', source: 'head_office' },
    { key: 'loyalty.earn_rate', value: '1 point per 10 spent', source: 'head_office' },
    { key: 'low_stock_threshold', value: 'global fallback', source: 'head_office' },
    { key: 'day.business_open', value: '07:00', source: 'local' },
  ];

  const smsTemplates: SmsTemplate[] = [
    { id: 'tpl_receipt', name: 'Receipt', purpose: 'receipt', body: 'Thanks {name}! Your {store} receipt {receipt} totals {total}.', language: 'en', active: true },
    { id: 'tpl_promo', name: 'Weekend promo', purpose: 'promotion', body: '{name}, enjoy 10% off coffee this weekend at {store}.', language: 'en', active: true },
    { id: 'tpl_reminder', name: 'Credit reminder', purpose: 'reminder', body: 'Hi {name}, your balance of {balance} is due at {store}.', language: 'en', active: true },
  ];

  const smsCampaigns: SmsCampaign[] = [
    { id: id('cmp', 1), name: 'Weekend regulars', templateId: 'tpl_promo', status: 'done', pacePerMinute: 30, createdAt: days(5) },
    { id: id('cmp', 2), name: 'Credit reminders', templateId: 'tpl_reminder', status: 'running', pacePerMinute: 15, createdAt: days(1) },
  ];

  const smsOutbox: SmsMessage[] = customers.slice(0, 4).map((c, i) => ({
    id: id('msg', i + 1), customerId: c.id, phone: c.phone, purpose: i === 0 ? 'receipt' : 'promotion',
    body: i === 0 ? `Thanks ${c.name}! Receipt ${store.code}-1-1042 totals $12.50.` : `${c.name}, enjoy 10% off coffee this weekend.`,
    status: i < 3 ? 'delivered' : 'queued', attempts: i < 3 ? 1 : 0, at: now - i * 900_000,
  }));

  const appReleases: AppRelease[] = [
    { id: 'rel_1', version: '1.4.0', minSupported: true, notes: 'Faster SMS acknowledgement', releasedAt: days(20) },
    { id: 'rel_2', version: '1.3.2', minSupported: false, notes: 'Battery fixes', releasedAt: days(48) },
  ];

  const syncPeers: SyncPeer[] = [
    { peer: 'head-office', lastSeqSent: 4821 + Math.floor(rnd() * 200), lastSuccessAt: now - 4 * 60_000, lastError: null },
  ];

  const backupRuns: BackupRun[] = [
    { id: id('bak', 1), kind: 'litestream', status: 'ok', location: 'r2://mocho-backups', sizeBytes: 18_400_000, startedAt: now - 3600_000 },
    { id: id('bak', 2), kind: 'restore_test', status: 'ok', location: 'r2://mocho-backups', sizeBytes: 18_100_000, startedAt: days(1) },
    { id: id('bak', 3), kind: 'snapshot', status: 'ok', location: 'r2://mocho-backups', sizeBytes: 18_050_000, startedAt: days(2) },
  ];

  const errorLogs: ErrorLog[] = [
    { id: id('err', 1), source: 'device', level: 'warning', message: 'Gateway phone B battery below 40%', at: now - 9 * 60_000 },
    { id: id('err', 2), source: 'server', level: 'error', message: 'M-Pesa receipt 4A2B did not match a pending sale', at: now - 2 * 3600_000 },
  ];

  return {
    storeId: store.id,
    products, orders, nextOrder: orders.length ? orders[orders.length - 1].id + 1 : 1001,
    mpesaReceipts, reconciliationItems, dayCloses,
    uoms, taxRates, categories, priceLists, promotions, suppliers, purchaseOrders, stockMovements,
    customers, smsTemplates, smsCampaigns, smsOutbox, counters, devices, endpoints, shifts,
    cashMovements, approvals, auditLog, settings, appReleases, syncPeers, backupRuns, errorLogs,
  };
}

export const businessDate = (ts: number): string => dateValue(ts);
