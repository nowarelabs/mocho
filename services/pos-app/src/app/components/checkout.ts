// <mocho-checkout>: split payments, approval and receipt.

import { auth } from '../auth.ts';
import { needsApproval } from '../permissions.ts';
import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store, type Order, type Totals, type LineItem } from '../store.ts';
import { badge, toneForStatus } from '../ui.ts';
import { esc, fmtTime, money, round2 } from '../util.ts';

interface Snapshot extends Totals { lines: LineItem[]; pct: number; customerId: string | null }

type Step = 'pay' | 'approve' | 'done';

interface State {
  step: Step;
  payments: { method: 'cash' | 'mpesa' | 'card'; amount: number }[];
  method: 'cash' | 'mpesa' | 'card';
  amount: string;
  snap: Snapshot | null;
  order: Order | null;
  approverId: string | null;
  approverPin: string;
  approvalError: string;
  approvalReason: string;
}

export class MochoCheckout extends MochoElement {
  live = false;
  state: State = {
    step: 'pay', payments: [], method: 'cash', amount: '',
    snap: null, order: null, approverId: null, approverPin: '', approvalError: '', approvalReason: '',
  };
  dlg!: HTMLDialogElement;

  build(): void {
    this.innerHTML = '<dialog class="dlg"></dialog>';
    this.dlg = this.$('dialog') as HTMLDialogElement;
    store.addEventListener('checkout', () => this.open());
    this.dlg.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (e.target === this.dlg || t.closest('[data-close]')) this.dlg.close();
      const m = t.closest('[data-method]') as HTMLElement | null;
      if (m) { this.state.method = m.dataset.method! as State['method']; this.state.amount = String(this.remaining()); this.render(); }
      const rm = t.closest('[data-rm]') as HTMLElement | null;
      if (rm) this.removePayment(Number(rm.dataset.rm));
      const quick = t.closest('[data-quick]') as HTMLElement | null;
      if (quick) { this.state.amount = quick.dataset.quick!; this.render(); }
      if (t.closest('[data-add]')) this.addPayment();
      if (t.closest('[data-complete]')) this.complete();
      if (t.closest('[data-approve]')) this.startApproval();
      const approver = t.closest('[data-approver]') as HTMLElement | null;
      if (approver) { this.state.approverId = approver.dataset.approver!; this.state.approverPin = ''; this.render(); }
      const key = t.closest('[data-key]') as HTMLElement | null;
      if (key) this.keypad(key.dataset.key!);
      if (t.closest('[data-doapprove]')) this.doApprove();
      if (t.closest('[data-print]')) window.print();
    });
    this.dlg.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'amt') this.state.amount = t.value;
      if (t.id === 'ap-pin') this.state.approverPin = t.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  open(): void {
    if (!store.can('payment.take')) return store.toast('You cannot take payment.');
    const lines = store.lines();
    if (!lines.length) return;
    const t = store.totals();
    this.state = {
      step: 'pay', payments: [], method: 'cash',
      amount: String(Math.max(0, round2(t.total))),
      snap: { lines, ...t, pct: store.discount, customerId: store.customerId },
      order: null, approverId: null, approverPin: '', approvalError: '', approvalReason: '',
    };
    this.render();
    this.dlg.showModal();
  }

  sum(): number { return round2(this.state.payments.reduce((a, p) => a + p.amount, 0)); }
  due(): number { return this.state.snap!.total; }
  remaining(): number { return Math.max(0, round2(this.due() - this.sum())); }
  canAdd(): boolean { const a = parseFloat(this.state.amount) || 0; return a >= 0 && (this.sum() + a) >= 0; }

  addPayment(): void {
    let a = parseFloat(this.state.amount) || 0;
    if (a <= 0) a = this.remaining();
    this.state.payments.push({ method: this.state.method, amount: round2(a) });
    this.state.amount = String(this.remaining());
    this.render();
  }
  removePayment(i: number): void { this.state.payments.splice(i, 1); this.state.amount = String(this.remaining()); this.render(); }

  needsApprovalStep(): boolean {
    if (!this.state.snap) return false;
    const d = this.state.snap.discount;
    return needsApproval(auth.role.id, 'sell.discount', d);
  }
  complete(): void {
    if (this.sum() < this.due()) return;
    if (this.needsApprovalStep()) { this.state.step = 'approve'; this.render(); return; }
    this.finalize();
  }
  finalize(): void {
    const order = store.checkout(this.state.payments, this.state.snap!.customerId);
    if (!order) { this.dlg.close(); return; }
    this.state.order = order;
    this.state.step = 'done';
    this.render();
    store.toast(`Receipt ${order.receiptNo} · ${order.method}`);
  }

  startApproval(): void {
    this.state.approverId = auth.approvers()[0]?.id ?? null;
    this.state.approverPin = '';
    this.state.approvalError = '';
    this.state.approvalReason = `Discount ${this.state.snap!.pct}% needs approval`;
    this.render();
  }
  keypad(k: string): void {
    if (k === 'back') this.state.approverPin = this.state.approverPin.slice(0, -1);
    else if (k === 'clear') this.state.approverPin = '';
    else if (this.state.approverPin.length < 4) this.state.approverPin += k;
    this.render();
  }
  doApprove(): void {
    if (!this.state.approverId) { this.state.approvalError = 'Choose an approver'; return this.render(); }
    if (this.state.approverPin.length !== 4) { this.state.approvalError = 'Enter 4-digit PIN'; return this.render(); }
    const ap = auth.usersAt(auth.store.id).find((u) => u.id === this.state.approverId);
    if (!ap) { this.state.approvalError = 'Approver not found'; return this.render(); }
    if (ap.pin !== this.state.approverPin) { this.state.approvalError = 'Incorrect PIN'; this.state.approverPin = ''; return this.render(); }
    const approval = store.requestApproval('sell.discount', 'sale', `cart-${Date.now()}`, this.state.approvalReason);
    store.decideApproval(approval.id, true, ap.id);
    this.finalize();
  }

  render(): void {
    const s = this.state;
    const wrap = 'w-[min(30rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto p-5';
    const dlg = this.dlg;
    if (s.step === 'done' && s.order) {
      const o = s.order;
      dlg.innerHTML = `
        <div class="${wrap} space-y-5">
          <div class="text-center">
            <div class="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-chart-3/15 text-chart-3">${icon('check', 'size-6')}</div>
            <h2 class="text-xl font-semibold tracking-tight">Payment complete</h2>
            <p class="text-sm text-muted-foreground">Receipt ${o.receiptNo}, ${fmtTime(o.at)}</p>
            ${o.customerId ? `<p class="text-xs text-muted-foreground mt-1">${esc(store.customer(o.customerId)?.name ?? '')}</p>` : ''}
          </div>
          <div class="space-y-1.5 rounded-md bg-muted p-4 text-sm">
            ${o.items.map((i) => `<div class="flex justify-between gap-3"><span>${i.qty} × ${esc(i.name)}</span><span class="tabular-nums">${money(i.price * i.qty)}</span></div>`).join('')}
            <div class="my-2 border-t border-border"></div>
            <div class="flex justify-between text-muted-foreground"><span>Subtotal</span><span class="tabular-nums">${money(o.subtotal)}</span></div>
            ${o.discount ? `<div class="flex justify-between text-muted-foreground"><span>Discount</span><span class="tabular-nums">−${money(o.discount)}</span></div>` : ''}
            <div class="flex justify-between text-muted-foreground"><span>Tax</span><span class="tabular-nums">${money(o.tax)}</span></div>
            <div class="flex justify-between font-semibold"><span>Total, ${o.method}</span><span class="tabular-nums">${money(o.total)}</span></div>
            ${o.payments.map((p, i) => `<div class="flex justify-between"><span>Payment ${i + 1} ${p.method}</span><span class="tabular-nums">${money(p.amount)}</span></div>`).join('')}
            ${o.change ? `<div class="flex justify-between"><span>Change given</span><span class="font-medium tabular-nums">${money(o.change)}</span></div>` : ''}
            ${o.status !== 'paid' ? badge(o.status, toneForStatus(o.status)) : ''}
          </div>
          <div class="flex gap-2" data-noprint>
            <button data-print class="btn btn-outline flex-1">${icon('printer', 'size-4')}Print receipt</button>
            <button data-close class="btn btn-primary flex-1">New sale</button>
          </div>
        </div>`;
      return;
    }
    if (s.step === 'approve') {
      const aps = auth.approvers();
      dlg.innerHTML = `
        <div class="${wrap} space-y-4">
          <div class="flex items-start justify-between">
            <div>
              <h2 class="text-lg font-semibold tracking-tight">Approval required</h2>
              <p class="text-sm text-muted-foreground">${s.approvalReason}</p>
            </div>
            <button data-close class="icon-btn" aria-label="Close">${icon('x', 'size-4')}</button>
          </div>
          ${s.approvalError ? `<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">${esc(s.approvalError)}</p>` : ''}
          <div class="space-y-2">
            <p class="text-sm font-medium">Choose an approver (manager or owner)</p>
            ${aps.length ? aps.map((u) => `
              <button data-approver="${u.id}" class="flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left ${s.approverId === u.id ? 'border-foreground bg-accent' : 'border-border hover:bg-accent'}">
                <span class="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">${u.name.split(' ').slice(0,2).map(x=>x[0]).join('')}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium">${esc(u.name)}</span>
                  <span class="block text-xs text-muted-foreground">${esc(u.roleId)}</span>
                </span>
              </button>`).join('') : `<p class="text-sm text-muted-foreground">No managers available to approve.</p>`}
          </div>
          ${s.approverId ? `
            <label class="block space-y-1.5 text-sm font-medium">Approver PIN (4 digits)
              <input id="ap-pin" class="input h-11 text-lg tabular-nums tracking-[0.5em]" inputmode="numeric" maxlength="4" autocomplete="off" value="${esc(s.approverPin)}">
            </label>
            <div class="grid grid-cols-3 gap-2">
              ${['1','2','3','4','5','6','7','8','9','back','0','clear'].map((k) => k==='back' ? `<button data-key="back" class="btn btn-outline h-11">${icon('minus','size-4')}</button>` : k==='clear' ? `<button data-key="clear" class="btn btn-outline h-11">Clear</button>` : `<button data-key="${k}" class="btn btn-outline h-11 tabular-nums">${k}</button>`).join('')}
            </div>
            <button data-doapprove class="btn btn-primary h-11 w-full" ${s.approverPin.length===4 ? '' : 'disabled'}>Approve and complete sale</button>` : ''}
        </div>`;
      const pin = dlg.querySelector('#ap-pin') as HTMLInputElement | null;
      if (pin) pin.focus();
      return;
    }
    // pay step
    const due = this.due();
    const sumv = this.sum();
    const rem = this.remaining();
    const items = s.snap!.lines;
    dlg.innerHTML = `
      <div class="${wrap} space-y-4">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-lg font-semibold tracking-tight">Take payment</h2>
            <p class="text-sm text-muted-foreground">${items.length} ${items.length===1?'item':'items'}</p>
          </div>
          <button data-close class="icon-btn" aria-label="Close">${icon('x', 'size-4')}</button>
        </div>
        <p class="text-4xl font-semibold tracking-tight tabular-nums">${money(due)}</p>
        ${s.snap!.discount ? `<p class="text-xs text-muted-foreground">Discount applied</p>` : ''}
        <div class="space-y-2 text-sm">
          <div class="flex justify-between text-muted-foreground"><span>Paid</span><span class="tabular-nums">${money(sumv)}</span></div>
          <div class="flex justify-between"><span>Remaining</span><span class="tabular-nums">${money(rem)}</span></div>
          ${s.payments.length ? `
            <div class="rounded-md border border-border p-2">
              ${s.payments.map((p, i) => `
                <div class="flex items-center justify-between gap-2 py-1 text-sm">
                  <span>${i+1}. ${p.method.toUpperCase()} ${money(p.amount)}</span>
                  <button data-rm="${i}" class="icon-btn" aria-label="Remove payment">${icon('x','size-4')}</button>
                </div>`).join('')}
            </div>` : ''}
        </div>
        <div class="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          ${(['cash','mpesa','card'] as const).map((m) => `
            <button data-method="${m}" aria-pressed="${s.method===m}" class="flex h-10 items-center justify-center gap-2 text-sm rounded-sm ${s.method===m ? 'bg-background shadow-sm' : 'text-muted-foreground'}">
              ${m==='cash' ? icon('cash','size-4') : m==='mpesa' ? icon('wallet','size-4') : icon('card','size-4')} ${m.toUpperCase()}
            </button>`).join('')}
        </div>
        <label class="block space-y-1.5 text-sm font-medium">Amount
          <input id="amt" class="input h-11 text-lg tabular-nums" inputmode="decimal" value="${esc(s.amount)}">
        </label>
        ${s.method==='cash' ? `<div class="flex flex-wrap gap-2">${[due, sumv>0?rem:due, Math.ceil(due/5)*5].filter((v,i,a)=>a.indexOf(v)===i && v>=0).map((v) => `<button data-quick="${Math.max(v,0)}" class="btn btn-outline h-9 tabular-nums">${money(v)}</button>`).join('')}</div>` : ''}
        <div class="flex gap-2">
          <button data-add class="btn btn-outline flex-1" ${parseFloat(s.amount)>0 || rem>=0 ? '' : 'disabled'}>Add payment</button>
          <button data-complete class="btn btn-primary flex-1" ${sumv>=due ? '' : 'disabled'}>Complete</button>
        </div>
      </div>`;
    (dlg.querySelector('#amt') as HTMLInputElement | null)?.focus();
  }
}
