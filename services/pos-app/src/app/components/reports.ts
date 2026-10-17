// <mocho-reports>: sales report and summary.

import { MochoElement } from '../element.ts';
import { panelClass } from '../nav.ts';
import { store, type Order } from '../store.ts';
import { DAY, esc, hourLabel, money, round2, startOfDay, stat } from '../util.ts';

interface Bucket {
  label: string;
  full: string;
  value: number;
  test: (o: Order) => boolean;
}

export class MochoReports extends MochoElement {
  range = 'today';
  build(): void {
    this.className = 'block h-full';
    this.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest('[data-range]') as HTMLElement | null;
      if (r) { this.range = r.dataset.range!; this.update(); }
    });
  }
  update(): void {
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
    const top = Object.entries(prod).sort((a, b) => b[1].qty - a[1].qty).slice(0, 6);
    const topMax = top[0]?.[1].qty || 1;
    const byMethod = (m: string): number => round2(paid.filter((o) => o.method === m).reduce((a, o) => a + o.total, 0));
    const cash = byMethod('cash'), card = byMethod('card');
    const cardPct = sales ? Math.round((card / sales) * 100) : 0;

    const kpi = (label: string, value: string | number): string => `<div class="p-5"><p class="text-sm text-muted-foreground">${label}</p><p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums">${value}</p></div>`;
    const best = buckets.reduce((a, b) => (b.value > a.value ? b : a), buckets[0]);
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="${panelClass('main')}" aria-label="Reports">
            <div class="flex flex-col gap-4 p-4 md:p-6 lg:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-semibold tracking-tight">Reports</h1>
                <div class="flex gap-2" role="group" aria-label="Date range">
                  <button class="chip" data-range="today" aria-pressed="${isToday}">Today</button>
                  <button class="chip" data-range="week" aria-pressed="${!isToday}">Last 7 days</button>
                </div>
              </header>
            </div>
            <div class="hide-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4 md:px-6 md:pb-6">
              <div class="grid grid-cols-2 divide-border rounded-xl border border-border bg-card md:grid-cols-4 md:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-border md:[&>*]:border-b-0 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-border md:[&>*:nth-child(odd)]:border-r-0">
                ${kpi('Net sales', money(sales))}${kpi('Orders', paid.length)}${kpi('Average order', money(avg))}${kpi('Items sold', items)}
              </div>
              <section class="rounded-xl border border-border bg-card p-5">
                <h2 class="font-semibold">${isToday ? 'Sales by hour' : 'Sales by day'}</h2>
                <div class="mt-5 flex h-56 items-stretch ${isToday ? 'gap-1' : 'gap-1.5 sm:gap-2'}" role="img" aria-label="Bar chart of ${isToday ? 'hourly' : 'daily'} sales">
                  ${buckets.map((b) => `
                    <div class="flex min-w-0 flex-1 flex-col items-center gap-2" title="${b.full}: ${money(b.value)}">
                      <div class="flex w-full flex-1 items-end"><div class="w-full rounded-sm ${b.value === max && b.value > 0 ? 'bg-primary' : 'bg-chart-2'}" style="height:${b.value ? Math.max(2, (b.value / max) * 100) : 0}%"></div></div>
                      <span class="text-xs text-muted-foreground">${b.label}</span>
                    </div>`).join('')}
                </div>
              </section>
              <section class="rounded-xl border border-border bg-card p-5">
                <h2 class="font-semibold">Top products</h2>
                ${top.length ? `<ol class="mt-4 space-y-4">${top.map(([name, v]) => `
                  <li>
                    <div class="flex justify-between gap-3 text-sm"><span class="font-medium">${esc(name)}</span><span class="text-muted-foreground tabular-nums">${v.qty} sold, ${money(v.revenue)}</span></div>
                    <div class="mt-1.5 h-2 rounded-full bg-muted"><div class="h-2 rounded-full bg-chart-2" style="width:${(v.qty / topMax) * 100}%"></div></div>
                  </li>`).join('')}</ol>` : '<p class="mt-4 text-sm text-muted-foreground">No sales yet. Completed orders will show up here.</p>'}
              </section>
            </div>
          </section>
          <aside class="${panelClass('side')} bg-card lg:border-l lg:border-border" aria-label="Summary">
            <header class="border-b border-border p-5">
              <h2 class="text-base font-semibold tracking-tight">Summary</h2>
              <p class="mt-0.5 text-xs text-muted-foreground">${isToday ? 'Today' : 'Last 7 days'}</p>
            </header>
            <div class="hide-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section class="space-y-3">
                <h3 class="rail-heading">Highlights</h3>
                <dl class="space-y-3">
                  ${stat(isToday ? 'Best hour' : 'Best day', best.value > 0 ? esc(best.full) : '—', best.value > 0 ? money(best.value) : '')}
                  ${stat('Items / order', paid.length ? (items / paid.length).toFixed(1) : '0')}
                  ${stat('Top product', top.length ? esc(top[0][0]) : '—')}
                </dl>
              </section>
              <section class="space-y-3 border-t border-border pt-5">
                <h3 class="rail-heading">Payment methods</h3>
                <div class="flex h-3 overflow-hidden rounded-full bg-muted"><div class="bg-chart-2" style="width:${cardPct}%"></div><div class="bg-primary" style="width:${sales ? 100 - cardPct : 0}%"></div></div>
                <dl class="space-y-3 text-sm">
                  <div class="flex items-center justify-between"><dt class="flex items-center gap-2"><span class="size-2.5 rounded-full bg-chart-2"></span>Card</dt><dd class="font-medium tabular-nums">${money(card)}</dd></div>
                  <div class="flex items-center justify-between"><dt class="flex items-center gap-2"><span class="size-2.5 rounded-full bg-primary"></span>Cash</dt><dd class="font-medium tabular-nums">${money(cash)}</dd></div>
                </dl>
              </section>
            </div>
          </aside>
        </div>`;
  }
}
