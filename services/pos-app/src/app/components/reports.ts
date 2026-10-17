// <mocho-reports>: sales report, M-Pesa reconciliation and day close.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { panelClass } from '../nav.ts';
import { store, type Order } from '../store.ts';
import { badge, empty, formDialog, inputField, table, toneForStatus } from '../ui.ts';
import type { DayClose, ReconciliationItem } from '../types.ts';
import { DAY, esc, fmtDate, hourLabel, money, round2, startOfDay, stat } from '../util.ts';

interface Bucket {
  label: string;
  full: string;
  value: number;
  test: (o: Order) => boolean;
}

export class MochoReports extends MochoElement {
  range = 'today';
  tab = 'sales';
  businessDate = store.businessDateOf(Date.now());

  build(): void {
    this.className = 'block h-full';
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest('[data-rtab]') as HTMLElement | null;
      if (tab) { this.tab = tab.dataset.rtab!; this.update(); return; }
      const r = t.closest('[data-range]') as HTMLElement | null;
      if (r) { this.range = r.dataset.range!; this.update(); return; }
      const res = t.closest('[data-resolve]') as HTMLElement | null;
      if (res) { this.openResolveDialog(res.dataset.resolve!); return; }
      if (t.closest('[data-closeday]')) { store.closeDay(this.businessDate); return; }
    });
    this.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'biz-date') { this.businessDate = t.value; this.update(); }
    });
  }

  private openResolveDialog(id: string): void {
    formDialog('Resolve reconciliation item', inputField('Note', 'note', { required: true, attrs: 'maxlength="120"' }), 'Resolve', (f) => {
      const note = (f.get('note') as string).trim();
      if (note) store.resolveReconciliation(id, note);
    });
  }

  update(): void {
    const isSales = this.tab === 'sales';
    const title = isSales ? 'Reports' : this.tab === 'reconcile' ? 'M-Pesa reconciliation' : 'Day close';
    const subtitle = isSales ? (this.range === 'today' ? 'Today' : 'Last 7 days') : this.tab === 'reconcile' ? 'Receipts versus statement' : this.businessDate;
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="${panelClass('main')}" aria-label="Reports">
            <div class="flex flex-col gap-3 p-4 xl:p-6 xl:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 class="text-2xl font-semibold tracking-tight">${title}</h1>
                  <p class="mt-0.5 text-xs text-muted-foreground">${esc(subtitle)}</p>
                </div>
                <div class="flex gap-2" role="group" aria-label="Report">
                  ${[['sales', 'Sales'], ['reconcile', 'Reconciliation'], ['dayclose', 'Day close']].map(([v, l]) => `<button class="chip" data-rtab="${v}" aria-pressed="${this.tab === v}">${l}</button>`).join('')}
                </div>
              </header>
              ${this.tabbar()}
            </div>
            <div class="hide-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4 xl:px-6 xl:pb-6">
              ${this.tab === 'sales' ? this.salesBody() : this.tab === 'reconcile' ? this.reconcileBody() : this.dayCloseBody()}
            </div>
          </section>
          <aside class="${panelClass('side')} bg-card xl:border-l xl:border-border" aria-label="Summary">
            <header class="border-b border-border p-5">
              <h2 class="text-base font-semibold tracking-tight">Summary</h2>
              <p class="mt-0.5 text-xs text-muted-foreground">${esc(subtitle)}</p>
            </header>
            <div class="hide-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              ${this.tab === 'sales' ? this.salesSide() : this.tab === 'reconcile' ? this.reconcileSide() : this.dayCloseSide()}
            </div>
          </aside>
        </div>`;
  }

  private tabbar(): string {
    if (this.tab === 'sales') {
      const isToday = this.range === 'today';
      return `<div class="flex gap-2" role="group" aria-label="Date range">
        <button class="chip" data-range="today" aria-pressed="${isToday}">Today</button>
        <button class="chip" data-range="week" aria-pressed="${!isToday}">Last 7 days</button>
      </div>`;
    }
    if (this.tab === 'dayclose') {
      return `<label class="flex items-center gap-2 text-sm font-medium">Business date
        <input id="biz-date" type="date" class="h-9 rounded-md border border-input bg-background px-3 text-sm" value="${esc(this.businessDate)}"></label>`;
    }
    return '';
  }

  // --- sales ---------------------------------------------------------------

  private salesData(): { buckets: Bucket[]; paid: Order[]; sales: number; items: number; avg: number; max: number; top: [string, { qty: number; revenue: number }][]; topMax: number; cash: number; card: number; cardPct: number; isToday: boolean } {
    const today = startOfDay(new Date());
    const isToday = this.range === 'today';
    const from = isToday ? today : today - 6 * DAY;
    const paid = store.orders.filter((o) => o.status === 'paid' && o.at >= from);
    const sales = round2(paid.reduce((a, o) => a + o.total, 0));
    const items = paid.reduce((a, o) => a + o.items.reduce((x, i) => x + i.qty, 0), 0);
    const avg = paid.length ? sales / paid.length : 0;
    const buckets: Bucket[] = isToday
      ? Array.from({ length: 24 }, (_, h) => ({ label: h % 3 === 0 ? hourLabel(h) : '', full: hourLabel(h), value: 0, test: (o: Order) => new Date(o.at).getHours() === h }))
      : Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today - (6 - i) * DAY);
        return { label: d.toLocaleDateString([], { weekday: 'short' }), full: d.toLocaleDateString([], { weekday: 'long' }), value: 0, test: (o: Order) => startOfDay(new Date(o.at)) === d.getTime() };
      });
    paid.forEach((o) => { const b = buckets.find((x) => x.test(o)); if (b) b.value += o.total; });
    const max = Math.max(...buckets.map((b) => b.value), 1);
    const prod: Record<string, { qty: number; revenue: number }> = {};
    paid.forEach((o) => o.items.forEach((i) => { prod[i.name] ??= { qty: 0, revenue: 0 }; prod[i.name].qty += i.qty; prod[i.name].revenue += i.qty * i.price; }));
    const top = Object.entries(prod).sort((a, b) => b[1].qty - a[1].qty).slice(0, 6) as [string, { qty: number; revenue: number }][];
    const byMethod = (m: string): number => round2(paid.filter((o) => o.method === m).reduce((a, o) => a + o.total, 0));
    const cash = byMethod('cash');
    const card = byMethod('card');
    const cardPct = sales ? Math.round((card / sales) * 100) : 0;
    return { buckets, paid, sales, items, avg, max, top, topMax: top[0]?.[1].qty || 1, cash, card, cardPct, isToday };
  }

  private salesBody(): string {
    const d = this.salesData();
    const k = (label: string, value: string | number): string => `<div class="p-5"><p class="text-sm text-muted-foreground">${esc(label)}</p><p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums">${value}</p></div>`;
    return `
      <div class="grid grid-cols-2 divide-border rounded-xl border border-border bg-card xl:grid-cols-4 xl:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-border xl:[&>*]:border-b-0 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-border xl:[&>*:nth-child(odd)]:border-r-0">
        ${k('Net sales', money(d.sales))}${k('Orders', d.paid.length)}${k('Average order', money(d.avg))}${k('Items sold', d.items)}
      </div>
      <section class="rounded-xl border border-border bg-card p-5">
        <h2 class="font-semibold">${d.isToday ? 'Sales by hour' : 'Sales by day'}</h2>
        <div class="mt-5 flex h-56 items-stretch ${d.isToday ? 'gap-1' : 'gap-1.5 sm:gap-2'}" role="img" aria-label="Bar chart of ${d.isToday ? 'hourly' : 'daily'} sales">
          ${d.buckets.map((b) => `
            <div class="flex min-w-0 flex-1 flex-col items-center gap-2" title="${esc(b.full)}: ${money(b.value)}">
              <div class="flex w-full flex-1 items-end"><div class="w-full rounded-sm ${b.value === d.max && b.value > 0 ? 'bg-primary' : 'bg-chart-2'}" style="height:${b.value ? Math.max(2, (b.value / d.max) * 100) : 0}%"></div></div>
              <span class="text-xs text-muted-foreground">${esc(b.label)}</span>
            </div>`).join('')}
        </div>
      </section>
      <section class="rounded-xl border border-border bg-card p-5">
        <h2 class="font-semibold">Top products</h2>
        ${d.top.length ? `<ol class="mt-4 space-y-4">${d.top.map(([name, v]) => `
          <li>
            <div class="flex justify-between gap-3 text-sm"><span class="font-medium">${esc(name)}</span><span class="text-muted-foreground tabular-nums">${v.qty} sold, ${money(v.revenue)}</span></div>
            <div class="mt-1.5 h-2 rounded-full bg-muted"><div class="h-2 rounded-full bg-chart-2" style="width:${(v.qty / d.topMax) * 100}%"></div></div>
          </li>`).join('')}</ol>` : '<p class="mt-4 text-sm text-muted-foreground">No sales yet. Completed orders will show up here.</p>'}
      </section>`;
  }

  private salesSide(): string {
    const d = this.salesData();
    const best = d.buckets.reduce((a, b) => (b.value > a.value ? b : a), d.buckets[0]);
    return `
      <section class="space-y-3">
        <h3 class="rail-heading">Highlights</h3>
        <dl class="space-y-3">
          ${stat(d.isToday ? 'Best hour' : 'Best day', best.value > 0 ? esc(best.full) : '—', best.value > 0 ? money(best.value) : '')}
          ${stat('Items / order', d.paid.length ? (d.items / d.paid.length).toFixed(1) : '0')}
          ${stat('Top product', d.top.length ? esc(d.top[0][0]) : '—')}
        </dl>
      </section>
      <section class="space-y-3 border-t border-border pt-5">
        <h3 class="rail-heading">Payment methods</h3>
        <div class="flex h-3 overflow-hidden rounded-full bg-muted"><div class="bg-chart-2" style="width:${d.cardPct}%"></div><div class="bg-primary" style="width:${d.sales ? 100 - d.cardPct : 0}%"></div></div>
        <dl class="space-y-3 text-sm">
          <div class="flex items-center justify-between"><dt class="flex items-center gap-2"><span class="size-2.5 rounded-full bg-chart-2"></span>Card</dt><dd class="font-medium tabular-nums">${money(d.card)}</dd></div>
          <div class="flex items-center justify-between"><dt class="flex items-center gap-2"><span class="size-2.5 rounded-full bg-primary"></span>Cash</dt><dd class="font-medium tabular-nums">${money(d.cash)}</dd></div>
        </dl>
      </section>`;
  }

  // --- reconciliation ------------------------------------------------------

  private reconcileBody(): string {
    const can = store.can('reconcile.manage');
    const cols = [
      { label: 'Date', cell: (r: ReconciliationItem) => esc(r.businessDate) },
      { label: 'Receipt', cell: (r: ReconciliationItem) => esc(r.receiptCode ?? '—') },
      { label: 'Statement', cell: (r: ReconciliationItem) => esc(r.statementCode ?? '—') },
      { label: 'Difference', cell: (r: ReconciliationItem) => money(r.difference), align: 'right' as const },
      { label: 'Status', cell: (r: ReconciliationItem) => badge(r.status.replace(/_/g, ' '), toneForStatus(r.status)) },
      { label: '', align: 'right' as const, cell: (r: ReconciliationItem) => can && r.status !== 'resolved' ? `<button data-resolve="${r.id}" class="btn btn-outline h-8">Resolve</button>` : (r.status === 'resolved' ? `<span class="text-xs text-muted-foreground">${esc(r.note || 'resolved')}</span>` : '') },
    ];
    return table(cols, store.dataset.reconciliationItems);
  }

  private reconcileSide(): string {
    const items = store.dataset.reconciliationItems;
    const open = items.filter((i) => i.status !== 'resolved');
    const netDiff = round2(open.reduce((a, i) => a + i.difference, 0));
    return `<section class="space-y-3">
      <h3 class="rail-heading">Reconciliation</h3>
      <dl class="space-y-3">${stat('Items', items.length)}${stat('Open', open.length)}${stat('Net difference', money(netDiff))}</dl>
    </section>
    <p class="text-xs text-muted-foreground">Differences compare M-Pesa receipts against the monthly statement.</p>`;
  }

  // --- day close -----------------------------------------------------------

  private dayCloseBody(): string {
    const existing = store.dayClose(this.businessDate);
    const runBtn = store.can('dayclose.run')
      ? `<button data-closeday class="btn btn-primary h-9" ${existing ? 'disabled' : ''}>${icon('lock', 'size-4')}${existing ? 'Day closed' : 'Close trading day'}</button>`
      : '';
    const summary = this.businessSummary(this.businessDate);
    const cols = [
      { label: 'Date', cell: (d: DayClose) => esc(d.businessDate) },
      { label: 'Sales', cell: (d: DayClose) => money(d.salesTotal), align: 'right' as const },
      { label: 'Cash', cell: (d: DayClose) => money(d.cashTotal), align: 'right' as const },
      { label: 'M-Pesa', cell: (d: DayClose) => money(d.mpesaTotal), align: 'right' as const },
      { label: 'Card', cell: (d: DayClose) => money(d.cardTotal), align: 'right' as const },
      { label: 'Variance', cell: (d: DayClose) => money(d.shiftVarianceTotal), align: 'right' as const },
      { label: 'Unmatched', cell: (d: DayClose) => String(d.unmatchedReceipts), align: 'right' as const },
    ];
    return `
      <section class="rounded-xl border border-border bg-card p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-semibold">${esc(this.businessDate)}</h2>
          ${runBtn}
        </div>
        <dl class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          ${stat('Sales', money(summary.salesTotal))}${stat('Cash', money(summary.cashTotal))}${stat('M-Pesa', money(summary.mpesaTotal))}${stat('Card', money(summary.cardTotal))}
          ${stat('Paid orders', summary.orders)}${stat('Shift variance', money(summary.variance))}${stat('Unmatched receipts', summary.unmatched)}${stat('Status', existing ? 'Closed' : 'Open')}
        </dl>
      </section>
      <section class="space-y-3">
        <h2 class="font-semibold">Closed days</h2>
        ${store.dataset.dayCloses.length ? table(cols, store.dataset.dayCloses) : empty('clipboard', 'No days closed yet')}
      </section>`;
  }

  private businessSummary(date: string): { salesTotal: number; cashTotal: number; mpesaTotal: number; cardTotal: number; orders: number; variance: number; unmatched: number } {
    const paid = store.orders.filter((o) => o.status === 'paid' && store.businessDateOf(o.at) === date);
    const sum = (m: string): number => round2(paid.reduce((a, o) => a + o.payments.filter((p) => p.method === m).reduce((x, p) => x + p.amount, 0), 0));
    const variance = round2(store.dataset.shifts.filter((s) => s.closedAt && store.businessDateOf(s.closedAt) === date).reduce((a, s) => a + (s.variance ?? 0), 0));
    return {
      salesTotal: round2(paid.reduce((a, o) => a + o.total, 0)),
      cashTotal: sum('cash'), mpesaTotal: sum('mpesa'), cardTotal: sum('card'),
      orders: paid.length, variance, unmatched: store.unmatchedReceipts().length,
    };
  }

  private dayCloseSide(): string {
    const s = this.businessSummary(this.businessDate);
    const closed = store.dataset.dayCloses.length;
    return `<section class="space-y-3">
      <h3 class="rail-heading">Day close</h3>
      <dl class="space-y-3">${stat('Business date', esc(this.businessDate))}${stat('Sales', money(s.salesTotal))}${stat('Days closed', closed)}</dl>
    </section>
    <p class="text-xs text-muted-foreground">Closing a day records the totals above and locks it from further edits in a real back office.</p>`;
  }
}
