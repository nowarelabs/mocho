// Store: all app state lives here. The dataset is scoped to the signed-in
// store, so switching employee/store swaps the products, sales, customers and
// so on. Every mutation is gated by an action id so the UI and the state agree
// on what the signed-in employee may do. Replace these methods with backend
// calls later.

import { auth, STORES } from './auth.ts';
import { seedDataset, type Dataset } from './data.ts';
import { permissionFor } from './permissions.ts';
import type {
  Approval, BackupRun, CashMovement, Counter, Customer, DayClose, Device, Endpoint, LineItem,
  Method, MpesaReceipt, Order, Payment, Product, PurchaseOrder, ReconciliationItem, Setting,
  Shift, SmsCampaign, SmsMessage, StockReason, Supplier, Totals,
} from './types.ts';
import { round2 } from './util.ts';

export type { Order, LineItem, Totals, Product, Method, SaleStatus, Customer } from './types.ts';

export const TAX_RATE = 0.08;
export const LOW_STOCK = 5;

export interface CheckoutPayment { method: Method; amount: number }

export interface PaymentRow extends Payment { order: Order }

let nid = 0;
const newId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}${(nid++).toString(36)}`;

const SOURCE_LOCAL = { source: 'local' } as const;

export class Store extends EventTarget {
  view = 'sell';
  panel = 'main';
  counterId: string | null = null;
  cart = new Map<string, number>();
  discount = 0;
  customerId: string | null = null;
  lastOrder: Order | null = null;
  private datasets = new Map<string, Dataset>();

  // --- store-scoped dataset -------------------------------------------------

  get storeId(): string { return auth.session?.storeId ?? STORES[0].id; }

  get dataset(): Dataset {
    const sid = this.storeId;
    if (!this.datasets.has(sid)) {
      this.datasets.set(sid, seedDataset(STORES.find((s) => s.id === sid)!, auth.usersAt(sid)));
    }
    return this.datasets.get(sid)!;
  }

  emit(): void { this.dispatchEvent(new Event('change')); }
  toast(message: string): void { this.dispatchEvent(new CustomEvent('toast', { detail: message })); }
  nextId(prefix: string): string { return newId(prefix); }

  /** Drop per-store transient state when the session changes. */
  reset(): void {
    this.cart.clear();
    this.discount = 0;
    this.customerId = null;
    this.counterId = null;
    this.lastOrder = null;
    this.panel = 'main';
    this.emit();
  }

  // --- authorization --------------------------------------------------------

  /** True when the signed-in employee may take an action; otherwise toasts. */
  guard(action: string, message = 'You do not have permission to do that.'): boolean {
    if (auth.can(action)) return true;
    this.toast(message);
    return false;
  }

  can(action: string): boolean { return auth.can(action); }
  permission(action: string) { return permissionFor(auth.role.id, action); }

  // --- lookups --------------------------------------------------------------

  get products(): Product[] { return this.dataset.products; }
  get orders(): Order[] { return this.dataset.orders; }
  get customers(): Customer[] { return this.dataset.customers; }
  product(id: string): Product | undefined { return this.products.find((p) => p.id === id); }
  customer(id: string | null): Customer | undefined { return id ? this.customers.find((c) => c.id === id) : undefined; }
  supplier(id: string): Supplier | undefined { return this.dataset.suppliers.find((s) => s.id === id); }
  device(id: string): Device | undefined { return this.dataset.devices.find((d) => d.id === id); }
  cashier(id: string): string { return auth.usersAt(this.storeId).find((u) => u.id === id)?.name ?? id; }
  counter(id: string): string { return this.dataset.counters.find((c) => c.id === id)?.name ?? id; }
  categories(): string[] {
    const fromProducts = this.products.map((p) => p.category);
    const fromRows = this.dataset.categories.map((c) => c.name);
    return [...new Set([...fromRows, ...fromProducts])].sort((a, b) => a.localeCompare(b));
  }

  taxRateOf(productId: string): number {
    const p = this.product(productId);
    const rate = this.dataset.taxRates.find((t) => t.id === p?.taxRateId);
    return rate ? rate.rateBp / 10000 : TAX_RATE;
  }

  // --- navigation -----------------------------------------------------------

  setView(v: string): void { this.view = v; this.panel = 'main'; this.emit(); }
  setPanel(p: string): void { this.panel = p; this.emit(); }

  // --- cart -----------------------------------------------------------------

  qtyInCart(id: string): number { return this.cart.get(id) || 0; }

  add(id: string): void {
    if (!this.guard('sell.create', 'You cannot ring up sales.')) return;
    const p = this.product(id);
    const q = this.qtyInCart(id);
    if (!p || q >= p.stock) return this.toast(`No more ${p?.name ?? 'stock'} available`);
    this.cart.set(id, q + 1);
    this.emit();
  }
  step(id: string, d: number): void {
    if (!this.guard('sell.create', 'You cannot change a sale.')) return;
    const p = this.product(id);
    const q = this.qtyInCart(id) + d;
    if (q <= 0) this.cart.delete(id);
    else if (q > p!.stock) return this.toast(`Only ${p!.stock} ${p!.name} in stock`);
    else this.cart.set(id, q);
    this.emit();
  }
  clear(): void { this.cart.clear(); this.discount = 0; this.customerId = null; this.emit(); }
  setDiscount(v: string | number): void {
    const next = Number(v) || 0;
    if (next > 0 && !this.guard('sell.discount', 'You cannot apply a discount.')) return;
    this.discount = next;
    this.emit();
  }
  setCustomer(id: string | null): void { this.customerId = id || null; this.emit(); }
  lines(): LineItem[] {
    return [...this.cart].map(([id, qty]) => {
      const p = this.product(id)!;
      return { id, name: p.name, price: p.price, qty, discount: 0 };
    });
  }
  totals(): Totals { return this.totalsOf(this.lines(), this.discount); }
  totalsOf(lines: LineItem[], pct = 0): Totals {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const gross = l.price * l.qty;
      subtotal += gross;
      tax += gross * (1 - pct / 100) * this.taxRateOf(l.id);
    }
    subtotal = round2(subtotal);
    const discount = round2((subtotal * pct) / 100);
    tax = round2(tax);
    return { subtotal, discount, tax, total: round2(subtotal - discount + tax) };
  }

  // --- shifts ---------------------------------------------------------------

  currentCounter(): string {
    const counters = this.dataset.counters.filter((c) => c.enabled);
    return this.counterId ?? counters[0]?.id ?? '';
  }
  currentShift(): Shift | undefined {
    return this.dataset.shifts.find((s) => s.status === 'open' && s.userId === auth.user.id);
  }
  openShift(openingCash: number): Shift | null {
    if (!this.guard('shift.open', 'You cannot open a shift.')) return null;
    if (this.currentShift()) return this.currentShift()!;
    const shift: Shift = {
      id: newId('shf'), counterId: this.currentCounter(), userId: auth.user.id, status: 'open',
      openingCash: round2(openingCash), expectedCash: null, countedCash: null, variance: null,
      openedAt: Date.now(), closedAt: null,
    };
    this.dataset.shifts.unshift(shift);
    this.audit('shift.open', 'shift', shift.id, `Opening float ${openingCash}`);
    this.emit();
    return shift;
  }
  closeShift(countedCash: number): Shift | undefined {
    if (!this.guard('shift.close', 'You cannot close a shift.')) return;
    const shift = this.currentShift();
    if (!shift) return;
    shift.status = 'closed';
    shift.countedCash = round2(countedCash);
    shift.expectedCash = round2(shift.openingCash + this.cashSince(shift.openedAt) + this.cashMovesFor(shift.id));
    shift.variance = round2(shift.countedCash - shift.expectedCash);
    shift.closedAt = Date.now();
    this.audit('shift.close', 'shift', shift.id, `Counted ${countedCash}, variance ${shift.variance}`);
    this.emit();
    return shift;
  }
  cashSince(ts: number): number {
    return this.orders
      .filter((o) => o.status === 'paid' && o.at >= ts)
      .reduce((a, o) => a + o.payments.filter((p) => p.method === 'cash').reduce((x, p) => x + p.amount, 0), 0);
  }
  cashMovesFor(shiftId: string): number {
    return this.dataset.cashMovements
      .filter((m) => m.shiftId === shiftId)
      .reduce((a, m) => a + (m.type === 'payin' || m.type === 'float' ? m.amount : -m.amount), 0);
  }
  addCashMovement(type: CashMovement['type'], amount: number, note: string): void {
    if (!this.guard('cash.move', 'You cannot record cash movements.')) return;
    const shift = this.currentShift();
    if (!shift) return this.toast('Open a shift before recording cash');
    this.dataset.cashMovements.unshift({ id: newId('csh'), shiftId: shift.id, type, amount: round2(amount), userId: auth.user.id, note, at: Date.now() });
    this.audit('cash.move', 'shift', shift.id, `${type} ${amount}`);
    this.emit();
  }

  // --- checkout -------------------------------------------------------------

  private buildPayments(payments: CheckoutPayment[]): Payment[] {
    const endpoint = this.dataset.endpoints.find((e) => e.enabled)?.id ?? null;
    return payments.map((p) => ({
      id: newId('pay'), method: p.method, amount: round2(p.amount), status: p.method === 'mpesa' ? 'pending' : 'confirmed',
      endpointId: p.method === 'mpesa' ? endpoint : null,
    }));
  }

  checkout(payments: CheckoutPayment[], customerId: string | null = this.customerId): Order | null {
    if (!this.guard('payment.take', 'You cannot take payment.')) return null;
    const items = this.lines();
    const t = this.totals();
    const change = round2(Math.max(0, payments.reduce((a, p) => a + p.amount, 0) - t.total));
    const methods = [...new Set(payments.map((p) => p.method))];
    const seq = this.dataset.nextOrder;
    const order: Order = {
      id: seq,
      receiptNo: `${this.dataset.counters.find((c) => c.id === this.currentCounter())?.receiptPrefix ?? 'R-'}${String(seq).padStart(4, '0')}`,
      at: Date.now(), items, ...t, discountPct: this.discount, customerId: customerId || null,
      counterId: this.currentCounter(), cashierId: auth.user.id, payments: this.buildPayments(payments),
      method: methods.length === 1 ? methods[0] : 'split',
      tendered: round2(payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0)),
      change, status: 'paid',
    };
    items.forEach((l) => {
      const p = this.product(l.id);
      if (p) { p.stock = round2(p.stock - l.qty); this.recordMovement(l.id, -l.qty, 'sale', 'sale', String(order.id), `Receipt ${order.receiptNo}`); }
    });
    if (order.customerId) {
      const c = this.customer(order.customerId);
      if (c && c.smsOptIn) {
        this.dataset.smsOutbox.unshift({
          id: newId('msg'), customerId: c.id, phone: c.phone, purpose: 'receipt',
          body: `Thanks ${c.name}! Receipt ${order.receiptNo} totals ${t.total}.`, status: 'queued', attempts: 0, at: Date.now(),
        });
      }
      if (c) c.loyaltyPoints += Math.floor(t.total / 10);
    }
    this.dataset.orders.push(order);
    this.dataset.nextOrder += 1;
    this.lastOrder = order;
    this.audit('sale.paid', 'sale', String(order.id), `Receipt ${order.receiptNo}, ${order.method}`);
    this.cart.clear();
    this.discount = 0;
    this.customerId = null;
    this.emit();
    return order;
  }

  hold(): void {
    if (!this.guard('sell.hold', 'You cannot hold a sale.')) return;
    if (!this.cart.size) return;
    const items = this.lines();
    const t = this.totals();
    const seq = this.dataset.nextOrder++;
    const order: Order = {
      id: seq, receiptNo: `${storeCounterPrefix(this)}${seq}`, at: Date.now(),
      items, ...t, discountPct: this.discount, customerId: this.customerId, counterId: this.currentCounter(),
      cashierId: auth.user.id, payments: [], method: 'cash', tendered: 0, change: 0, status: 'held',
    };
    this.dataset.orders.push(order);
    this.audit('sale.hold', 'sale', String(order.id), `${items.length} lines held`);
    const holder = this.customer(order.customerId)?.name ?? 'walk-in';
    this.cart.clear();
    this.discount = 0;
    this.customerId = null;
    this.emit();
    this.toast(`Sale held for ${holder}`);
  }

  held(): Order[] { return this.orders.filter((o) => o.status === 'held'); }

  resume(id: number): void {
    if (!this.guard('sell.hold', 'You cannot resume a sale.')) return;
    const o = this.orders.find((x) => x.id === id && x.status === 'held');
    if (!o) return;
    this.cart.clear();
    o.items.forEach((l) => this.cart.set(l.id, l.qty));
    this.discount = o.discountPct;
    this.customerId = o.customerId;
    this.dataset.orders = this.orders.filter((x) => x !== o);
    this.emit();
    this.toast(`Resumed order #${id}`);
  }

  voidOrder(id: number): void {
    const o = this.orders.find((x) => x.id === id);
    if (!o || (o.status !== 'held' && o.status !== 'paid')) return;
    if (o.status === 'paid' && !this.guard('sell.void', 'You cannot void a paid sale.')) return;
    if (o.status === 'held' && !this.guard('sell.hold', 'You cannot void a held sale.')) return;
    if (o.status === 'paid') {
      o.items.forEach((l) => { const p = this.product(l.id); if (p) p.stock = round2(p.stock + l.qty); });
    }
    o.status = 'voided';
    this.audit('sale.void', 'sale', String(id), 'Voided');
    this.emit();
  }

  refund(id: number): void {
    if (!this.guard('sale.refund', 'You cannot refund a sale.')) return;
    const o = this.orders.find((x) => x.id === id);
    if (!o || o.status !== 'paid') return;
    o.status = 'refunded';
    o.payments.forEach((p) => (p.status = 'failed'));
    o.items.forEach((l) => { const p = this.product(l.id); if (p) p.stock = round2(p.stock + l.qty); });
    this.audit('sale.refund', 'sale', String(id), `Refund ${o.total}`);
    this.emit();
    this.toast(`Order #${id} refunded`);
  }

  // --- payments -------------------------------------------------------------

  get receipts(): MpesaReceipt[] { return this.dataset.mpesaReceipts; }
  unmatchedReceipts(): MpesaReceipt[] { return this.receipts.filter((r) => r.status === 'unmatched'); }
  payments(): PaymentRow[] {
    return this.orders
      .flatMap((order) => order.payments.map((payment) => ({ ...payment, order })))
      .sort((a, b) => b.order.at - a.order.at);
  }
  pendingPayments(): PaymentRow[] { return this.payments().filter((p) => p.status === 'pending'); }

  /** Match an M-Pesa receipt to the oldest pending M-Pesa payment it fits. */
  matchReceipt(receiptId: string, orderId?: number): boolean {
    if (!this.guard('payment.match', 'You cannot match M-Pesa receipts.')) return false;
    const receipt = this.receipts.find((r) => r.id === receiptId);
    if (!receipt || receipt.status === 'matched') return false;
    const candidates = this.orders
      .filter((o) => (orderId ? o.id === orderId : true))
      .flatMap((order) => order.payments.filter((p) => p.method === 'mpesa' && p.status === 'pending').map((p) => ({ order, p })))
      .filter(({ p }) => Math.abs(p.amount - receipt.amount) < 0.01);
    const fit = candidates[0];
    if (fit) {
      fit.p.status = 'confirmed';
      receipt.status = 'matched';
      receipt.paymentId = fit.p.id;
      const order = fit.order;
      const covered = order.payments.every((p) => p.status !== 'failed') && order.payments.reduce((a, p) => a + p.amount, 0) >= order.total;
      if (covered) { order.status = 'paid'; order.closedAt = Date.now(); }
      this.audit('payment.match', 'payment', fit.p.id, `Receipt ${receipt.code} matched to order #${order.id}`);
      this.emit();
      this.toast(`Receipt ${receipt.code} matched to order #${order.id}`);
      return true;
    }
    receipt.status = 'matched';
    this.audit('payment.match', 'mpesa_receipt', receipt.id, `Receipt ${receipt.code} reviewed with no open payment`);
    this.emit();
    this.toast(`Receipt ${receipt.code} marked matched`);
    return true;
  }

  // --- inventory ------------------------------------------------------------

  recordMovement(productId: string, change: number, reason: StockReason, referenceType: string | null, referenceId: string | null, note: string): void {
    this.dataset.stockMovements.unshift({
      id: newId('smv'), productId, change: round2(change), reason, referenceType, referenceId, userId: auth.user.id, note, at: Date.now(),
    });
  }
  setStock(id: string, n: string | number): void {
    if (!this.guard('inventory.manage', 'You cannot adjust stock.')) return;
    const p = this.product(id);
    if (!p) return;
    const next = Math.max(0, Math.floor(Number(n) || 0));
    const delta = round2(next - p.stock);
    if (!delta) return;
    p.stock = next;
    this.recordMovement(id, delta, 'count_adjustment', 'stock_count', null, 'Stock count');
    this.audit('stock.adjust', 'product', id, `${delta > 0 ? '+' : ''}${delta} to ${next}`);
    this.emit();
  }
  adjustStock(id: string, delta: number): void {
    if (delta === 0) return;
    this.setStock(id, (this.product(id)?.stock ?? 0) + delta);
  }
  addProduct(fields: Partial<Product> & { name: string; category: string; price: number; cost?: number; stock?: number; lowStock?: number; sku?: string }): Product | null {
    if (!this.guard('catalog.manage', 'You cannot add products.')) return null;
    const p: Product = {
      id: newId('prd'), sku: fields.sku || `NEW-${this.products.length + 1}`, name: fields.name, category: fields.category,
      uomId: fields.uomId || 'uom_each', taxRateId: fields.taxRateId || 'tax_std', isBundle: false, soldByWeight: false,
      trackStock: fields.trackStock ?? true, cost: fields.cost ?? 0, price: fields.price, stock: fields.stock ?? 0,
      lowStock: fields.lowStock ?? LOW_STOCK, active: true,
    };
    this.products.push(p);
    if (p.stock) this.recordMovement(p.id, p.stock, 'correction', 'manual', null, 'Opening stock');
    this.audit('product.create', 'product', p.id, p.name);
    this.emit();
    return p;
  }
  updateProduct(id: string, patch: Partial<Product>): void {
    if (!this.guard('catalog.manage', 'You cannot edit products.')) return;
    const p = this.product(id);
    if (!p) return;
    Object.assign(p, patch);
    this.audit('product.update', 'product', id, Object.keys(patch).join(', '));
    this.emit();
  }
  addCategory(name: string): void {
    if (!this.guard('catalog.manage', 'You cannot add categories.')) return;
    const clean = name.trim();
    if (!clean || this.dataset.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return;
    this.dataset.categories.push({ id: newId('cat'), name: clean, parentId: null, active: true });
    this.audit('category.create', 'category', clean, clean);
    this.emit();
  }
  toggleCategory(id: string): void {
    if (!this.guard('catalog.manage', 'You cannot edit categories.')) return;
    const c = this.dataset.categories.find((x) => x.id === id);
    if (c) { c.active = !c.active; this.emit(); }
  }
  addPromotion(fields: { name: string; type: string; value: number; minQuantity: number }): void {
    if (!this.guard('catalog.manage', 'You cannot add promotions.')) return;
    const name = fields.name.trim();
    if (!name) return;
    const now = Date.now();
    this.dataset.promotions.unshift({
      id: newId('promo'), name, type: fields.type as never, value: fields.value,
      minQuantity: fields.minQuantity, startsAt: now, endsAt: now + 30 * 864e5, active: true,
    });
    this.audit('promotion.create', 'promotion', name, name);
    this.emit();
  }
  togglePromotion(id: string): void {
    if (!this.guard('catalog.manage', 'You cannot edit promotions.')) return;
    const p = this.dataset.promotions.find((x) => x.id === id);
    if (p) { p.active = !p.active; this.emit(); }
  }
  addPriceList(fields: { name: string; currency: string; pricesIncludeTax: boolean }): void {
    if (!this.guard('catalog.manage', 'You cannot add price lists.')) return;
    const name = fields.name.trim();
    if (!name) return;
    this.dataset.priceLists.push({ id: newId('pl'), name, currency: fields.currency || 'USD', pricesIncludeTax: fields.pricesIncludeTax, active: true });
    this.audit('price_list.create', 'price_list', name, name);
    this.emit();
  }

  // --- purchasing -----------------------------------------------------------

  addSupplier(fields: { name: string; phone?: string; email?: string; paymentTermsDays?: number }): Supplier | null {
    if (!this.guard('purchase.manage', 'You cannot manage suppliers.')) return null;
    const name = fields.name.trim();
    if (!name) return null;
    const supplier: Supplier = { id: newId('sup'), name, phone: fields.phone?.trim() ?? '', email: fields.email?.trim() ?? '', paymentTermsDays: fields.paymentTermsDays ?? 0, active: true };
    this.dataset.suppliers.push(supplier);
    this.audit('supplier.create', 'supplier', supplier.id, name);
    this.emit();
    return supplier;
  }
  addPurchaseOrder(fields: { supplierId: string; total: number; expectedAt?: number | null }): PurchaseOrder | null {
    if (!this.guard('purchase.manage', 'You cannot create purchase orders.')) return null;
    if (!fields.supplierId) return null;
    const poNo = `PO-${String(this.dataset.purchaseOrders.length + 1001).padStart(4, '0')}`;
    const po: PurchaseOrder = {
      id: newId('po'), poNo, supplierId: fields.supplierId, status: 'draft', total: round2(fields.total),
      expectedAt: fields.expectedAt ?? null, createdAt: Date.now(),
    };
    this.dataset.purchaseOrders.unshift(po);
    this.audit('po.create', 'purchase_order', po.id, poNo);
    this.emit();
    return po;
  }
  receivePurchaseOrder(id: string): void {
    if (!this.guard('purchase.manage', 'You cannot receive purchase orders.')) return;
    const po = this.dataset.purchaseOrders.find((p) => p.id === id);
    if (!po) return;
    po.status = 'received';
    this.audit('po.receive', 'purchase_order', id, po.poNo);
    this.emit();
    this.toast(`Received ${po.poNo}`);
  }

  // --- customers ------------------------------------------------------------

  addCustomer(fields: { name: string; phone: string; email?: string; creditLimit?: number; smsOptIn?: boolean }): Customer | null {
    if (!this.guard('customers.manage', 'You cannot add customers.')) return null;
    const c: Customer = {
      id: newId('cus'), name: fields.name.trim(), phone: fields.phone.trim(), email: fields.email?.trim() ?? '',
      loyaltyPoints: 0, creditLimit: round2(fields.creditLimit ?? 0), creditBalance: 0,
      smsOptIn: fields.smsOptIn ?? true, createdAt: Date.now(),
    };
    this.customers.push(c);
    this.audit('customer.create', 'customer', c.id, c.name);
    this.emit();
    return c;
  }
  updateCustomer(id: string, patch: Partial<Customer>): void {
    if (!this.guard('customers.manage', 'You cannot edit customers.')) return;
    const c = this.customer(id);
    if (!c) return;
    Object.assign(c, patch);
    this.emit();
  }
  adjustPoints(id: string, delta: number): void {
    if (!this.guard('customers.manage', 'You cannot adjust loyalty points.')) return;
    const c = this.customer(id);
    if (!c) return;
    c.loyaltyPoints = Math.max(0, c.loyaltyPoints + delta);
    this.audit('loyalty.adjust', 'customer', id, `${delta > 0 ? '+' : ''}${delta} points`);
    this.emit();
  }
  repayCredit(id: string, amount: number): void {
    if (!this.guard('customers.manage', 'You cannot record credit repayments.')) return;
    const c = this.customer(id);
    if (!c) return;
    c.creditBalance = round2(Math.max(0, c.creditBalance - amount));
    this.audit('credit.repay', 'customer', id, `Repaid ${amount}`);
    this.emit();
  }

  // --- messaging ------------------------------------------------------------

  queueSms(customerId: string | null, phone: string, purpose: SmsMessage['purpose'], body: string): void {
    if (!this.guard('messaging.manage', 'You cannot send messages.')) return;
    this.dataset.smsOutbox.unshift({ id: newId('msg'), customerId, phone, purpose, body, status: 'queued', attempts: 0, at: Date.now() });
    this.audit('sms.queue', 'sms', customerId ?? phone, purpose);
    this.emit();
  }
  toggleTemplate(id: string): void {
    if (!this.guard('messaging.manage', 'You cannot edit message templates.')) return;
    const t = this.dataset.smsTemplates.find((x) => x.id === id);
    if (t) { t.active = !t.active; this.emit(); }
  }
  createCampaign(fields: { name: string; templateId: string; pacePerMinute: number }): SmsCampaign | null {
    if (!this.guard('messaging.manage', 'You cannot create campaigns.')) return null;
    const name = fields.name.trim();
    if (!name || !fields.templateId) return null;
    const campaign: SmsCampaign = { id: newId('cmp'), name, templateId: fields.templateId, status: 'draft', pacePerMinute: fields.pacePerMinute || 30, createdAt: Date.now() };
    this.dataset.smsCampaigns.unshift(campaign);
    this.audit('campaign.create', 'sms_campaign', campaign.id, name);
    this.emit();
    return campaign;
  }
  toggleCampaign(id: string): void {
    if (!this.guard('messaging.manage', 'You cannot edit campaigns.')) return;
    const c = this.dataset.smsCampaigns.find((x) => x.id === id);
    if (!c) return;
    c.status = c.status === 'running' ? 'paused' : c.status === 'paused' ? 'running' : c.status;
    this.emit();
  }

  // --- devices and tills ----------------------------------------------------

  toggleDevice(id: string): void {
    if (!this.guard('devices.manage', 'You cannot manage devices.')) return;
    const d = this.device(id);
    if (d) { d.enabled = !d.enabled; this.audit('device.toggle', 'device', id, d.enabled ? 'enabled' : 'disabled'); this.emit(); }
  }
  toggleEndpoint(id: string): void {
    if (!this.guard('devices.manage', 'You cannot manage endpoints.')) return;
    const e = this.dataset.endpoints.find((x) => x.id === id);
    if (e) { e.enabled = !e.enabled; this.emit(); }
  }
  toggleCounter(id: string): void {
    if (!this.guard('devices.manage', 'You cannot manage counters.')) return;
    const c = this.dataset.counters.find((x) => x.id === id);
    if (c) { c.enabled = !c.enabled; this.emit(); }
  }
  addCounter(fields: { name: string; receiptPrefix: string }): Counter | null {
    if (!this.guard('devices.manage', 'You cannot add counters.')) return null;
    const name = fields.name.trim();
    if (!name) return null;
    const number = Math.max(0, ...this.dataset.counters.map((c) => c.number)) + 1;
    const counter: Counter = { id: newId('ctr'), number, name, receiptPrefix: fields.receiptPrefix.trim() || `T${number}-`, enabled: true };
    this.dataset.counters.push(counter);
    this.audit('counter.create', 'counter', counter.id, name);
    this.emit();
    return counter;
  }

  // --- operations -----------------------------------------------------------

  syncNow(): void {
    if (!this.guard('sync.manage', 'You cannot run sync.')) return;
    const peer = this.dataset.syncPeers[0];
    if (peer) {
      peer.lastSeqSent += 3;
      peer.lastSuccessAt = Date.now();
      peer.lastError = null;
    }
    this.audit('sync.push', 'store', this.storeId, 'Manual sync to head office');
    this.emit();
    this.toast('Sync pushed to head office');
  }
  runBackup(kind: BackupRun['kind'] = 'snapshot'): void {
    if (!this.guard('backup.manage', 'You cannot run backups.')) return;
    this.dataset.backupRuns.unshift({
      id: newId('bak'), kind, status: 'ok', location: 'r2://mocho-backups',
      sizeBytes: 18_000_000 + Math.floor(Math.random() * 800_000), startedAt: Date.now(),
    });
    this.audit('backup.run', 'store', this.storeId, kind);
    this.emit();
    this.toast(`${kind === 'restore_test' ? 'Restore test' : 'Snapshot'} complete`);
  }

  // --- reconciliation and day close ----------------------------------------

  resolveReconciliation(id: string, note: string): void {
    if (!this.guard('reconcile.manage', 'You cannot resolve reconciliation items.')) return;
    const item = this.dataset.reconciliationItems.find((r) => r.id === id);
    if (!item) return;
    item.status = 'resolved';
    item.note = note.trim();
    item.resolvedBy = auth.user.id;
    item.resolvedAt = Date.now();
    this.audit('reconcile.resolve', 'reconciliation', id, note);
    this.emit();
  }
  dayClose(businessDate: string): DayClose | undefined {
    return this.dataset.dayCloses.find((d) => d.businessDate === businessDate);
  }
  closeDay(businessDate: string): DayClose | null {
    if (!this.guard('dayclose.run', 'You cannot close the trading day.')) return null;
    if (this.dayClose(businessDate)) { this.toast('That day is already closed'); return null; }
    const paid = this.orders.filter((o) => o.status === 'paid' && this.businessDateOf(o.at) === businessDate);
    const sum = (method: Method): number => round2(paid.reduce((a, o) => a + o.payments.filter((p) => p.method === method).reduce((x, p) => x + p.amount, 0), 0));
    const closes: DayClose = {
      id: newId('day'),
      businessDate,
      salesTotal: round2(paid.reduce((a, o) => a + o.total, 0)),
      cashTotal: sum('cash'),
      mpesaTotal: sum('mpesa'),
      cardTotal: sum('card'),
      shiftVarianceTotal: round2(this.dataset.shifts.filter((s) => s.closedAt && this.businessDateOf(s.closedAt) === businessDate).reduce((a, s) => a + (s.variance ?? 0), 0)),
      unmatchedReceipts: this.unmatchedReceipts().length,
      closedBy: auth.user.id,
      closedAt: Date.now(),
    };
    this.dataset.dayCloses.unshift(closes);
    this.audit('day.close', 'store', this.storeId, businessDate);
    this.emit();
    this.toast(`Trading day ${businessDate} closed`);
    return closes;
  }
  businessDateOf(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // --- approvals ------------------------------------------------------------

  requestApproval(action: string, referenceType: Approval['referenceType'], referenceId: string, reason: string): Approval {
    const approval: Approval = {
      id: newId('apr'), action, referenceType, referenceId, requestedBy: auth.user.id, approvedBy: null,
      status: 'pending', reason, requestedAt: Date.now(), decidedAt: null,
    };
    this.dataset.approvals.unshift(approval);
    this.emit();
    return approval;
  }
  decideApproval(id: string, approved: boolean, approverId: string | null = auth.user.id): void {
    if (!this.guard('approval.decide', 'You cannot decide approvals.')) return;
    const a = this.dataset.approvals.find((x) => x.id === id);
    if (!a) return;
    a.status = approved ? 'approved' : 'rejected';
    a.approvedBy = approved ? approverId : null;
    a.decidedAt = Date.now();
    this.audit('approval.decide', 'approval', id, approved ? 'approved' : 'rejected');
    this.emit();
  }

  // --- settings -------------------------------------------------------------

  setSetting(key: string, value: string): void {
    if (!this.guard('settings.manage', 'You cannot change settings.')) return;
    const s: Setting = { key, value, ...SOURCE_LOCAL };
    const existing = this.dataset.settings.find((x) => x.key === key);
    if (existing) existing.value = value;
    else this.dataset.settings.push(s);
    this.audit('setting.update', 'setting', key, value);
    this.emit();
  }

  // --- audit ----------------------------------------------------------------

  audit(action: string, entityType: string, entityId: string | null, detail: string): void {
    this.dataset.auditLog.unshift({ id: newId('aud'), userId: auth.session?.userId ?? null, action, entityType, entityId, detail, at: Date.now() });
  }
}

function storeCounterPrefix(s: Store): string {
  return s.dataset.counters.find((c) => c.id === s.currentCounter())?.receiptPrefix ?? 'R-';
}

export const store = new Store();
