// <mocho-orders>: order history, filters and refunds.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { dayLabel, esc, fmtTime, hourLabel, money, parseDay, round2, startOfDay, stat } from '../util.ts';

export class MochoOrders extends MochoElement {
  filter = 'all';
  q = '';
  open: number | null = null;
  confirming: number | null = null;
  resetScroll = false;
  dateFrom = '';
  dateTo = '';
  hourFrom = '';
  hourTo = '';
  advOpen = false;
  build(): void {
    this.className = 'block h-full';
    const hourOpts = ['<option value="">Any</option>', ...Array.from({ length: 24 }, (_, h) => `<option value="${h}">${hourLabel(h)}</option>`)].join('');
    const dateCls = 'h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2';
    const hourCls = 'h-9 w-24 cursor-pointer appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm focus-visible:outline-2';
    const fieldLabel = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col lg:flex" aria-label="Orders">
            <div class="flex flex-col gap-3 p-4 md:p-6 lg:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-semibold tracking-tight">Orders</h1>
                <div id="filters" class="flex gap-2" role="group" aria-label="Filter orders by status"></div>
              </header>
              <div class="flex flex-wrap items-center gap-3">
                <label class="relative w-full sm:w-72">
                  <span class="sr-only">Search orders</span>
                  <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">${icon('search', 'size-4')}</span>
                  <input id="ord-q" name="order-search" type="search" class="input pl-9" placeholder="Search #, item or method" autocomplete="off" />
                </label>
                <button id="adv-toggle" class="chip inline-flex items-center gap-1.5" aria-expanded="false" aria-controls="adv-filters" aria-pressed="false">
                  ${icon('filter', 'size-4')}Filters<span id="adv-count"></span>
                  <span id="adv-chevron" class="transition-transform">${icon('chevron', 'size-4')}</span>
                </button>
              </div>
              <div id="adv-filters" class="hidden flex-col gap-3 rounded-xl border border-border bg-card p-4" role="group" aria-label="Advanced filters">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label class="${fieldLabel}">From date
                    <input id="date-from" name="date-from" type="date" class="${dateCls}" />
                  </label>
                  <label class="${fieldLabel}">To date
                    <input id="date-to" name="date-to" type="date" class="${dateCls}" />
                  </label>
                  <label class="${fieldLabel}">From hour
                    <span class="relative">
                      <select id="hour-from" name="hour-from" class="${hourCls}">${hourOpts}</select>
                      <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">${icon('chevron', 'size-4')}</span>
                    </span>
                  </label>
                  <label class="${fieldLabel}">To hour
                    <span class="relative">
                      <select id="hour-to" name="hour-to" class="${hourCls}">${hourOpts}</select>
                      <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">${icon('chevron', 'size-4')}</span>
                    </span>
                  </label>
                </div>
                <div class="flex justify-end">
                  <button id="clear-range" class="btn btn-outline h-9 hidden">Clear filters</button>
                </div>
              </div>
            </div>
            <div id="list" class="hide-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 md:px-6 md:pb-6"></div>
          </section>
          <aside class="min-h-0 flex-col bg-card lg:flex lg:border-l lg:border-border" aria-label="Summary">
            <header class="border-b border-border p-5">
              <h2 class="text-base font-semibold tracking-tight">Summary</h2>
              <p id="sum-scope" class="mt-0.5 text-xs text-muted-foreground"></p>
            </header>
            <div id="sum" class="hide-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5"></div>
          </aside>
        </div>`;
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#clear-range')) return this.clearRange();
      if (t.closest('#adv-toggle')) return this.toggleAdv();
      const f = t.closest('[data-filter]') as HTMLElement | null;
      if (f) { this.filter = f.dataset.filter!; this.resetScroll = true; return this.update(); }
      const row = t.closest('[data-row]') as HTMLElement | null;
      if (row) { const id = Number(row.dataset.row); this.open = this.open === id ? null : id; this.confirming = null; return this.update(); }
      const r = t.closest('[data-refund]') as HTMLElement | null;
      if (r) { this.confirming = Number(r.dataset.refund); return this.update(); }
      if (t.closest('[data-cancel]')) { this.confirming = null; return this.update(); }
      const ok = t.closest('[data-confirm]') as HTMLElement | null;
      if (ok) { this.confirming = null; store.refund(Number(ok.dataset.confirm)); }
    });
    this.addEventListener('change', (e) => { if ((e.target as HTMLElement).matches('#date-from, #date-to, #hour-from, #hour-to')) this.readRange(); });
    this.addEventListener('input', (e) => {
      const t = e.target as HTMLElement;
      if (t.matches('input[type="date"]')) return this.readRange();
      if (t.matches('#ord-q')) { this.q = (e.target as HTMLInputElement).value.trim().toLowerCase(); this.resetScroll = true; this.update(); }
    });
  }
  toggleAdv(): void {
    this.advOpen = !this.advOpen;
    const panel = this.$('#adv-filters')!;
    panel.classList.toggle('hidden', !this.advOpen);
    panel.classList.toggle('flex', this.advOpen);
    this.$('#adv-toggle')!.setAttribute('aria-expanded', String(this.advOpen));
    this.$('#adv-chevron')!.classList.toggle('rotate-180', this.advOpen);
  }
  readRange(): void {
    this.dateFrom = (this.$('#date-from') as HTMLInputElement | null)?.value ?? '';
    this.dateTo = (this.$('#date-to') as HTMLInputElement | null)?.value ?? '';
    this.hourFrom = (this.$('#hour-from') as HTMLSelectElement | null)?.value ?? '';
    this.hourTo = (this.$('#hour-to') as HTMLSelectElement | null)?.value ?? '';
    this.resetScroll = true;
    this.update();
  }
  clearRange(): void {
    this.dateFrom = this.dateTo = this.hourFrom = this.hourTo = '';
    ['#date-from', '#date-to', '#hour-from', '#hour-to'].forEach((id) => { const el = this.$(id) as HTMLInputElement | null; if (el) el.value = ''; });
    this.resetScroll = true;
    this.update();
  }
  update(): void {
    this.togglePanel('section[aria-label="Orders"]', 'main');
    this.togglePanel('aside[aria-label="Summary"]', 'side');
    this.$('#filters')!.innerHTML = [['all', 'All'], ['paid', 'Paid'], ['refunded', 'Refunded']]
      .map(([v, l]) => `<button class="chip" data-filter="${v}" aria-pressed="${this.filter === v}">${l}</button>`).join('');
    const rangeActive = !!(this.dateFrom || this.dateTo || this.hourFrom || this.hourTo);
    this.$('#clear-range')!.classList.toggle('hidden', !rangeActive);
    const advCount = (this.dateFrom ? 1 : 0) + (this.dateTo ? 1 : 0) + (this.hourFrom !== '' ? 1 : 0) + (this.hourTo !== '' ? 1 : 0);
    this.$('#adv-count')!.textContent = advCount ? ` (${advCount})` : '';
    this.$('#adv-toggle')!.setAttribute('aria-pressed', String(advCount > 0));

    let fromTs = this.dateFrom ? parseDay(this.dateFrom) : null;
    let toTs = this.dateTo ? parseDay(this.dateTo) : null;
    let hFrom = this.hourFrom !== '' ? Number(this.hourFrom) : null;
    let hTo = this.hourTo !== '' ? Number(this.hourTo) : null;
    if (fromTs != null && toTs != null && fromTs > toTs) [fromTs, toTs] = [toTs, fromTs];
    if (hFrom != null && hTo != null && hFrom > hTo) [hFrom, hTo] = [hTo, hFrom];

    const all = [...store.orders].reverse();
    const filtered = all.filter((o) => {
      if (this.filter !== 'all' && o.status !== this.filter) return false;
      if (this.q && !`#${o.id} ${o.method} ${o.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(this.q)) return false;
      const d = startOfDay(new Date(o.at));
      if (fromTs != null && d < fromTs) return false;
      if (toTs != null && d > toTs) return false;
      const h = new Date(o.at).getHours();
      if (hFrom != null && h < hFrom) return false;
      if (hTo != null && h > hTo) return false;
      return true;
    });
    const list = filtered.slice(0, 60);
    let lastDay = '';
    const scroller = this.$('#list') as HTMLElement;
    const top = this.resetScroll ? 0 : scroller.scrollTop;
    this.resetScroll = false;
    scroller.innerHTML = list.length ? list.map((o) => {
      const day = dayLabel(o.at);
      const heading = day !== lastDay ? `<h2 class="pt-3 text-sm font-medium text-muted-foreground">${day}</h2>` : '';
      lastDay = day;
      const n = o.items.reduce((a, i) => a + i.qty, 0);
      const expanded = this.open === o.id;
      return `${heading}
              <article class="overflow-hidden rounded-xl border border-border bg-card">
                <button data-row="${o.id}" aria-expanded="${expanded}" class="flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:bg-accent focus-visible:outline-2">
                  <span class="w-16 font-semibold tabular-nums">#${o.id}</span>
                  <span class="min-w-0 flex-1 text-sm text-muted-foreground"><span class="text-foreground">${fmtTime(o.at)}</span><span class="hidden sm:inline">, ${n} ${n === 1 ? 'item' : 'items'}, ${o.method}</span></span>
                  <span class="badge ${o.status === 'refunded' ? 'bg-destructive/10 text-destructive' : ''}">${o.status === 'refunded' ? 'Refunded' : 'Paid'}</span>
                  <span class="w-20 text-right font-medium tabular-nums ${o.status === 'refunded' ? 'text-muted-foreground line-through' : ''}">${money(o.total)}</span>
                  <span class="text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}">${icon('chevron', 'size-4')}</span>
                </button>
                ${expanded ? `
                  <div class="space-y-3 border-t border-border bg-muted/50 p-4 text-sm">
                    <ul class="space-y-1">
                      ${o.items.map((i) => `<li class="flex justify-between gap-3"><span>${i.qty} × ${esc(i.name)}</span><span class="tabular-nums">${money(i.price * i.qty)}</span></li>`).join('')}
                    </ul>
                    <div class="space-y-1 border-t border-border pt-3 text-muted-foreground">
                      <div class="flex justify-between"><span>Subtotal</span><span class="tabular-nums">${money(o.subtotal)}</span></div>
                      ${o.discount ? `<div class="flex justify-between"><span>Discount</span><span class="tabular-nums">−${money(o.discount)}</span></div>` : ''}
                      <div class="flex justify-between"><span>Tax</span><span class="tabular-nums">${money(o.tax)}</span></div>
                      <div class="flex justify-between font-medium text-foreground"><span>Total, ${o.method}</span><span class="tabular-nums">${money(o.total)}</span></div>
                    </div>
                    ${o.status === 'paid' ? `
                      <div class="flex justify-end gap-2">
                        ${this.confirming === o.id
          ? `<button data-cancel class="btn btn-outline h-9">Keep order</button><button data-confirm="${o.id}" class="btn btn-danger h-9">Refund ${money(o.total)}</button>`
          : `<button data-refund="${o.id}" class="btn btn-outline h-9">Refund order</button>`}
                      </div>` : ''}
                  </div>` : ''}
              </article>`;
    }).join('') : `<div class="grid place-items-center py-16 text-center">
              <div>
                <div class="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">${icon('receipt')}</div>
                <p class="font-medium">No orders found</p>
                <p class="mt-1 text-sm text-muted-foreground">${this.q ? `Nothing matches “${esc(this.q)}”. Try a different search.` : 'No orders match this filter.'}</p>
              </div>
            </div>`;
    scroller.scrollTop = top;

    const totalOrders = store.orders.length;
    const gross = round2(store.orders.reduce((a, o) => a + o.total, 0));
    const paid = store.orders.filter((o) => o.status === 'paid');
    const refunded = store.orders.filter((o) => o.status === 'refunded');
    const average = totalOrders ? gross / totalOrders : 0;
    const today = startOfDay(new Date());
    const paidToday = paid.filter((o) => o.at >= today);
    const netToday = round2(paidToday.reduce((a, o) => a + o.total, 0));
    const sum = this.$('#sum') as HTMLElement;
    const sumTop = sum.scrollTop;
    this.$('#sum-scope')!.textContent = (this.filter !== 'all' || this.q || rangeActive)
      ? `${filtered.length} of ${totalOrders} orders`
      : `${totalOrders} ${totalOrders === 1 ? 'order' : 'orders'} on record`;
    sum.innerHTML = `
        <section class="space-y-3">
          <h3 class="rail-heading">Sales</h3>
          <dl class="space-y-3">
            ${stat('Gross sales', money(gross))}
            ${stat('Average order', money(average))}
            ${stat('Paid', paid.length)}
            ${stat('Refunded', refunded.length)}
          </dl>
        </section>
        <section class="space-y-3 border-t border-border pt-5">
          <h3 class="rail-heading">Today</h3>
          <dl class="space-y-3">
            ${stat('Net sales', money(netToday))}
            ${stat('Paid orders', paidToday.length)}
          </dl>
        </section>`;
    sum.scrollTop = sumTop;
  }
}
