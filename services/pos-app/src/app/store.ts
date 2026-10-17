// Store: all app state lives here. Replace these methods with backend calls later.

import { round2 } from './util.ts';

export const TAX_RATE = 0.08;
export const LOW_STOCK = 5;

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
}

export interface LineItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface Order extends Totals {
  id: number;
  at: number;
  items: LineItem[];
  discountPct: number;
  method: string;
  tendered: number;
  change: number;
  status: 'paid' | 'refunded';
}

const calc = (lines: LineItem[], pct = 0): Totals => {
  const subtotal = round2(lines.reduce((a, l) => a + l.price * l.qty, 0));
  const discount = round2((subtotal * pct) / 100);
  const tax = round2((subtotal - discount) * TAX_RATE);
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax) };
};

function seedProducts(): Product[] {
  const p = (id: string, name: string, category: string, price: number, stock: number): Product => ({ id, name, category, price, stock });
  return [
    p('espresso', 'Espresso', 'Coffee', 3.0, 80),
    p('americano', 'Americano', 'Coffee', 3.5, 80),
    p('cappuccino', 'Cappuccino', 'Coffee', 4.5, 60),
    p('latte', 'Latte', 'Coffee', 4.75, 60),
    p('flat-white', 'Flat white', 'Coffee', 4.5, 50),
    p('mocha', 'Mocha', 'Coffee', 5.25, 40),
    p('cold-brew', 'Cold brew', 'Coffee', 4.75, 24),
    p('chai', 'Chai latte', 'Tea', 4.75, 30),
    p('matcha', 'Matcha latte', 'Tea', 5.25, 4),
    p('earl-grey', 'Earl Grey', 'Tea', 3.25, 40),
    p('croissant', 'Butter croissant', 'Bakery', 3.75, 18),
    p('pain-choc', 'Pain au chocolat', 'Bakery', 4.25, 12),
    p('muffin', 'Blueberry muffin', 'Bakery', 3.5, 3),
    p('banana-bread', 'Banana bread', 'Bakery', 3.95, 10),
    p('avo-toast', 'Avocado toast', 'Food', 9.5, 14),
    p('breakfast-sandwich', 'Breakfast sandwich', 'Food', 8.25, 0),
    p('granola', 'Granola bowl', 'Food', 7.5, 9),
    p('house-blend', 'House blend, 250g', 'Beans', 14.0, 22),
    p('single-origin', 'Single origin, 250g', 'Beans', 17.5, 15),
  ];
}

function seedOrders(products: Product[]): Order[] {
  let s = 42;
  const rnd = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  const weights = [3, 5, 3, 2, 4, 5, 3, 2, 2, 3, 2, 1]; // 7am to 6pm
  const now = new Date();
  const out: Order[] = [];
  for (let d = 6; d >= 0; d--) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    for (let h = 7; h <= 18; h++) {
      if (d === 0 && h > now.getHours()) break;
      const n = Math.round(weights[h - 7] * (0.6 + rnd() * 0.8));
      for (let i = 0; i < n; i++) {
        const at = new Date(base).setHours(h, Math.floor(rnd() * 60));
        if (at > Date.now()) continue;
        const items: LineItem[] = [];
        const k = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < k; j++) {
          const p = products[Math.floor(rnd() * rnd() * products.length)];
          const ex = items.find((x) => x.id === p.id);
          if (ex) ex.qty++;
          else items.push({ id: p.id, name: p.name, price: p.price, qty: rnd() < 0.2 ? 2 : 1 });
        }
        const t = calc(items, 0);
        const method = rnd() < 0.62 ? 'card' : 'cash';
        const tendered = method === 'cash' ? Math.ceil(t.total / 5) * 5 : t.total;
        out.push({ id: 0, at, items, ...t, discountPct: 0, method, tendered, change: round2(tendered - t.total), status: rnd() < 0.03 ? 'refunded' : 'paid' });
      }
    }
  }
  out.sort((a, b) => a.at - b.at).forEach((o, i) => (o.id = 1001 + i));
  return out;
}

export class Store extends EventTarget {
  view: string;
  panel: string;
  products: Product[];
  orders: Order[];
  nextOrder: number;
  cart: Map<string, number>;
  discount: number;

  constructor() {
    super();
    this.view = 'register';
    this.panel = 'main';
    this.products = seedProducts();
    this.orders = seedOrders(this.products);
    this.nextOrder = this.orders.length ? this.orders[this.orders.length - 1].id + 1 : 1001;
    this.cart = new Map();
    this.discount = 0;
  }
  emit(): void { this.dispatchEvent(new Event('change')); }
  toast(message: string): void { this.dispatchEvent(new CustomEvent('toast', { detail: message })); }
  product(id: string): Product | undefined { return this.products.find((p) => p.id === id); }
  qtyInCart(id: string): number { return this.cart.get(id) || 0; }
  categories(): string[] { return [...new Set(this.products.map((p) => p.category))]; }

  setView(v: string): void { this.view = v; this.panel = 'main'; this.emit(); }
  setPanel(p: string): void { this.panel = p; this.emit(); }

  add(id: string): void {
    const p = this.product(id);
    const q = this.qtyInCart(id);
    if (!p || q >= p.stock) return this.toast(`No more ${p?.name ?? 'stock'} available`);
    this.cart.set(id, q + 1);
    this.emit();
  }
  step(id: string, d: number): void {
    const p = this.product(id);
    const q = this.qtyInCart(id) + d;
    if (q <= 0) this.cart.delete(id);
    else if (q > p!.stock) return this.toast(`Only ${p!.stock} ${p!.name} in stock`);
    else this.cart.set(id, q);
    this.emit();
  }
  clear(): void { this.cart.clear(); this.discount = 0; this.emit(); }
  setDiscount(v: string | number): void { this.discount = Number(v) || 0; this.emit(); }
  lines(): LineItem[] {
    return [...this.cart].map(([id, qty]) => {
      const p = this.product(id)!;
      return { id, name: p.name, price: p.price, qty };
    });
  }
  totals(): Totals { return calc(this.lines(), this.discount); }

  checkout(method: string, tendered: number): Order {
    const items = this.lines();
    const t = calc(items, this.discount);
    items.forEach((l) => (this.product(l.id)!.stock -= l.qty));
    const order: Order = {
      id: this.nextOrder++, at: Date.now(), items, ...t, discountPct: this.discount, method,
      tendered: method === 'cash' ? tendered : t.total,
      change: method === 'cash' ? round2(tendered - t.total) : 0,
      status: 'paid',
    };
    this.orders.push(order);
    this.cart.clear();
    this.discount = 0;
    this.emit();
    return order;
  }
  refund(id: number): void {
    const o = this.orders.find((x) => x.id === id);
    if (!o || o.status !== 'paid') return;
    o.status = 'refunded';
    o.items.forEach((i) => { const p = this.product(i.id); if (p) p.stock += i.qty; });
    this.emit();
    this.toast(`Order #${id} refunded`);
  }
  setStock(id: string, n: string | number): void { const p = this.product(id)!; p.stock = Math.max(0, Math.floor(Number(n) || 0)); this.emit(); }
  addProduct({ name, category, price, stock }: { name: string; category: string; price: number; stock: number }): void {
    this.products.push({ id: 'p' + Date.now(), name, category, price, stock });
    this.emit();
  }
}

export const store = new Store();
