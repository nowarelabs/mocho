// <mocho-checkout>: payment dialog.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store, type LineItem, type Order, type Totals } from '../store.ts';
import { esc, fmtTime, money, round2 } from '../util.ts';

interface Snapshot extends Totals {
  lines: LineItem[];
  pct: number;
}

interface CheckoutState {
  step: 'pay' | 'done';
  method: string;
  tendered: string;
  snap: Snapshot | null;
  order: Order | null;
}

export class MochoCheckout extends MochoElement {
  live = false;
  state: CheckoutState = { step: 'pay', method: 'cash', tendered: '', snap: null, order: null };
  dlg!: HTMLDialogElement;
  build(): void {
    this.innerHTML = '<dialog class="dlg"></dialog>';
    this.dlg = this.$('dialog') as HTMLDialogElement;
    store.addEventListener('checkout', () => this.open());
    this.dlg.addEventListener('click', (e) => {
      if (e.target === this.dlg || (e.target as HTMLElement).closest('[data-close]')) this.dlg.close();
      const m = (e.target as HTMLElement).closest('[data-method]') as HTMLElement | null;
      if (m) { this.state.method = m.dataset.method!; this.render(); }
      const q = (e.target as HTMLElement).closest('[data-tender]') as HTMLElement | null;
      if (q) { this.state.tendered = q.dataset.tender!; this.render(); }
      if ((e.target as HTMLElement).closest('[data-pay]')) this.pay();
      if ((e.target as HTMLElement).closest('[data-print]')) window.print();
    });
    this.dlg.addEventListener('input', (e) => {
      if ((e.target as HTMLElement).id === 'tender') { this.state.tendered = (e.target as HTMLInputElement).value; this.refreshCash(); }
    });
  }
  open(): void {
    const lines = store.lines();
    if (!lines.length) return;
    this.state = { step: 'pay', method: 'cash', tendered: '', snap: { lines, ...store.totals(), pct: store.discount }, order: null };
    this.render();
    this.dlg.showModal();
  }
  get due(): number { return this.state.snap!.total; }
  get tendered(): number { return parseFloat(this.state.tendered) || 0; }
  canPay(): boolean { return this.state.method === 'card' || this.tendered >= this.due; }
  quickAmounts(): number[] {
    const t = this.due;
    const set = new Set<number>();
    [5, 10, 20, 50].forEach((s) => { const v = Math.ceil(t / s) * s; if (v > t) set.add(v); });
    return [...set].slice(0, 3);
  }
  refreshCash(): void {
    const change = this.$('#change');
    if (!change) return;
    change.textContent = money(Math.max(0, round2(this.tendered - this.due)));
    (this.$('[data-pay]') as HTMLButtonElement).disabled = !this.canPay();
  }
  pay(): void {
    if (!this.canPay()) return;
    this.state.order = store.checkout(this.state.method, this.tendered);
    this.state.step = 'done';
    this.render();
    store.toast(`Order #${this.state.order.id} paid`);
  }
  render(): void {
    const s = this.state;
    const wrap = 'w-[min(28rem,calc(100vw-2rem))] p-6';
    if (s.step === 'done') {
      const o = s.order!;
      this.dlg.innerHTML = `
          <div class="${wrap} space-y-5">
            <div class="text-center">
              <div class="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-chart-3/15 text-chart-3">${icon('check', 'size-6')}</div>
              <h2 class="text-xl font-semibold tracking-tight">Payment complete</h2>
              <p class="text-sm text-muted-foreground">Order #${o.id}, ${fmtTime(o.at)}</p>
            </div>
            <div class="space-y-1.5 rounded-md bg-muted p-4 text-sm">
              ${o.items.map((i) => `<div class="flex justify-between gap-3"><span>${i.qty} × ${esc(i.name)}</span><span class="tabular-nums">${money(i.price * i.qty)}</span></div>`).join('')}
              <div class="my-2 border-t border-border"></div>
              <div class="flex justify-between text-muted-foreground"><span>Subtotal</span><span class="tabular-nums">${money(o.subtotal)}</span></div>
              ${o.discount ? `<div class="flex justify-between text-muted-foreground"><span>Discount</span><span class="tabular-nums">−${money(o.discount)}</span></div>` : ''}
              <div class="flex justify-between text-muted-foreground"><span>Tax</span><span class="tabular-nums">${money(o.tax)}</span></div>
              <div class="flex justify-between font-semibold"><span>Total, ${o.method}</span><span class="tabular-nums">${money(o.total)}</span></div>
              ${o.method === 'cash' ? `<div class="flex justify-between"><span>Change given</span><span class="font-medium tabular-nums">${money(o.change)}</span></div>` : ''}
            </div>
            <div class="flex gap-2" data-noprint>
              <button data-print class="btn btn-outline flex-1">${icon('printer', 'size-4')}Print receipt</button>
              <button data-close class="btn btn-primary flex-1" autofocus>New sale</button>
            </div>
          </div>`;
      return;
    }
    const n = s.snap!.lines.reduce((a, l) => a + l.qty, 0);
    const seg = (id: string, label: string, ic: string): string => `
        <button data-method="${id}" aria-pressed="${s.method === id}"
          class="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm">${icon(ic, 'size-4')}${label}</button>`;
    this.dlg.innerHTML = `
        <div class="${wrap} space-y-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold tracking-tight">Take payment</h2>
              <p class="text-sm text-muted-foreground">Order #${store.nextOrder}, ${n} ${n === 1 ? 'item' : 'items'}</p>
            </div>
            <button data-close class="icon-btn" aria-label="Close">${icon('x', 'size-4')}</button>
          </div>
          <p class="text-4xl font-semibold tracking-tight tabular-nums">${money(this.due)}</p>
          <div class="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">${seg('cash', 'Cash', 'cash')}${seg('card', 'Card', 'card')}</div>
          ${s.method === 'cash' ? `
            <div class="space-y-3">
              <label class="block space-y-1.5 text-sm font-medium">Cash received
                <input id="tender" name="cash-received" class="input h-12 text-lg tabular-nums" inputmode="decimal" placeholder="0.00" value="${esc(s.tendered)}" autocomplete="off" autofocus />
              </label>
              <div class="flex gap-2">
                <button data-tender="${this.due}" class="btn btn-outline h-9 flex-1 px-2">Exact</button>
                ${this.quickAmounts().map((v) => `<button data-tender="${v}" class="btn btn-outline h-9 flex-1 px-2 tabular-nums">${money(v).replace('.00', '')}</button>`).join('')}
              </div>
              <div class="flex items-center justify-between rounded-md bg-muted p-4">
                <span class="text-sm text-muted-foreground">Change due</span>
                <span id="change" class="text-xl font-semibold tabular-nums">${money(Math.max(0, round2(this.tendered - this.due)))}</span>
              </div>
            </div>` : `
            <div class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Ask the customer to tap, insert, or swipe their card on the terminal, then confirm below.
            </div>`}
          <button data-pay class="btn btn-primary h-12 w-full text-base" ${this.canPay() ? '' : 'disabled'}>${s.method === 'card' ? 'Card approved, complete sale' : 'Complete sale'}</button>
        </div>`;
    (this.$('#tender') as HTMLInputElement | null)?.focus();
  }
}
