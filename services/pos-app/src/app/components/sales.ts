// <mocho-sales>: sales history, filters, held orders and refunds.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { badge, toneForStatus } from '../ui.ts';
import { dayLabel, esc, fmtTime, hourLabel, money, parseDay, round2, startOfDay, stat } from '../util.ts';

export class MochoSales extends MochoElement {
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
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col xl:flex" aria-label="Sales">
            <div class="flex flex-col gap-3 p-4 xl:p-6 xl:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 class="text-2xl font-semibold tracking-tight">Sales</h1>
                  <p id="held-count" class="mt-0.5 text-xs text-muted-foreground"></p>
                </div>
                <div id="filters" class="flex gap-2" role="group" aria-label="Filter by status"></div>
              </header>
              <div class="flex flex-wrap items-center gap-3">
                <label class="relative w-full sm:w-72">
                  <span class="sr-only">Search sales</span>
                  <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">${icon('search', 'size-4')}</span>
                  <input id="ord-q" type="search" class="input pl-9" placeholder="Search receipt, customer or item" autocomplete="off" />
                </label>
                <button id="adv-toggle" class="chip inline-flex items-center gap-1.5" aria-expanded="false" aria-controls="adv-filters" aria-pressed="false">
                  ${icon('filter', 'size-4')}Filters<span id="adv-count"></span>
                  <span id="adv-chevron" class="transition-transform">${icon('chevron', 'size-4')}</span>
                </button>
              </div>
              <div id="adv-filters" class="hidden flex-col gap-3 rounded-xl border border-border bg-card p-4" role="group" aria-label="Advanced filters">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">From date<input id="date-from" type="date" class="h-9 rounded-md border border-input bg-background px-3 text-sm"></label>
                  <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">To date<input id="date-to" type="date" class="h-9 rounded-md border border-input bg-background px-3 text-sm"></label>
                  <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">From hour
                    <span class="relative"><select id="hour-from" class="h-9 w-24 cursor-pointer appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm">${hourOpts}</select><span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">${icon('chevron','size-4')}</span></span>
                  </label>
                  <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">To hour
                    <span class="relative"><select id="hour-to" class="h-9 w-24 cursor-pointer appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm">${hourOpts}</select><span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">${icon('chevron','size-4')}</span></span>
                  </label>
                </div>
                <div class="flex justify-end"><button id="clear-range" class="btn btn-outline h-9 hidden">Clear filters</button></div>
              </div>
            </div>
            <div id="list" class="hide-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 xl:px-6 xl:pb-6"></div>
          </section>
          <aside class="min-h-0 flex-col bg-card xl:flex xl:border-l xl:border-border" aria-label="Summary">
            <header class="border-b border-border p-5">
              <h2 class="text-base font-semibold tracking-tight">Summary</h2>
              <p id="sum-scope" class="mt-0.5 text-xs text-muted-foreground"></p>
            </header>
            <div id="sum" class="hide-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5"></div>
          </aside>
        </div>`;
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#clear-range')) { this.clearRange(); return; }
      if (t.closest('#adv-toggle')) { this.toggleAdv(); return; }
      const f = t.closest('[data-filter]') as HTMLElement | null;
      if (f) { this.filter = f.dataset.filter!; this.resetScroll = true; this.update(); return; }
      const row = t.closest('[data-row]') as HTMLElement | null;
      if (row) { const id = Number(row.dataset.row); this.open = this.open === id ? null : id; this.confirming = null; this.update(); return; }
      const r = t.closest('[data-refund]') as HTMLElement | null;
      if (r) { this.confirming = Number(r.dataset.refund); this.update(); return; }
      if (t.closest('[data-cancel]')) { this.confirming = null; this.update(); return; }
      const ok = t.closest('[data-confirm]') as HTMLElement | null;
      if (ok) { this.confirming = null; store.refund(Number(ok.dataset.confirm)); this.update(); return; }
      const res = t.closest('[data-resume]') as HTMLElement | null;
      if (res) { store.resume(Number(res.dataset.resume)); location.hash = '#sell'; store.setView('sell'); return; }
      const vo = t.closest('[data-void]') as HTMLElement | null;
      if (vo) { store.voidOrder(Number(vo.dataset.void)); this.update(); return; }
      const match = t.closest('[data-match]') as HTMLElement | null;
      if (match) { store.matchReceipt(match.dataset.match!); return; }
    });
    this.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'ord-q') { this.q = t.value.trim().toLowerCase(); this.resetScroll = true; this.update(); return; }
      if (t.matches('#date-from') || t.matches('#date-to')) { this.readRange(); return; }
    });
    (this.$('#hour-from') as HTMLSelectElement).addEventListener('change', () => this.readRange());
    (this.$('#hour-to') as HTMLSelectElement).addEventListener('change', () => this.readRange());
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
    this.dateFrom = (this.$('#date-from') as HTMLInputElement).value;
    this.dateTo = (this.$('#date-to') as HTMLInputElement).value;
    this.hourFrom = (this.$('#hour-from') as HTMLSelectElement).value;
    this.hourTo = (this.$('#hour-to') as HTMLSelectElement).value;
    this.resetScroll = true;
    this.update();
  }
  clearRange(): void {
    this.dateFrom = this.dateTo = this.hourFrom = this.hourTo = '';
    (this.$('#date-from') as HTMLInputElement).value = '';
    (this.$('#date-to') as HTMLInputElement).value = '';
    (this.$('#hour-from') as HTMLSelectElement).value = '';
    (this.$('#hour-to') as HTMLSelectElement).value = '';
    this.resetScroll = true;
    this.update();
  }

  update(): void {
    this.togglePanel('section[aria-label="Sales"]', 'main');
    this.togglePanel('aside[aria-label="Summary"]', 'side');
    const held = store.held();
    this.$('#held-count')!.textContent = held.length ? `${held.length} held sales` : 'No held sales';
    this.$('#filters')!.innerHTML = [['all','All'],['paid','Paid'],['held','Held'],['refunded','Refunded'],['voided','Voided']].map(([v,l]) => `<button class="chip" data-filter="${v}" aria-pressed="${this.filter===v}">${l}</button>`).join('');
    const rangeActive = !!(this.dateFrom || this.dateTo || this.hourFrom || this.hourTo);
    this.$('#clear-range')!.classList.toggle('hidden', !rangeActive);
    const advCount = (this.dateFrom?1:0)+(this.dateTo?1:0)+(this.hourFrom!==''?1:0)+(this.hourTo!==''?1:0);
    this.$('#adv-count')!.textContent = advCount ? ` (${advCount})` : '';
    this.$('#adv-toggle')!.setAttribute('aria-pressed', String(advCount>0));
    let fromTs = this.dateFrom ? parseDay(this.dateFrom) : null;
    let toTs = this.dateTo ? parseDay(this.dateTo) : null;
    let hFrom = this.hourFrom!==''?Number(this.hourFrom):null;
    let hTo = this.hourTo!==''?Number(this.hourTo):null;
    if (fromTs!=null && toTs!=null && fromTs>toTs) [fromTs,toTs] = [toTs,fromTs];
    if (hFrom!=null && hTo!=null && hFrom>hTo) [hFrom,hTo] = [hTo,hFrom];
    const all = [...store.orders].reverse();
    const filtered = all.filter((o) => {
      if (this.filter!=='all' && o.status!==this.filter) return false;
      const hay = `${o.receiptNo} ${store.customer(o.customerId)?.name || ''} ${o.method} ${o.items.map((i)=>i.name).join(' ')}`.toLowerCase();
      if (this.q && !hay.includes(this.q)) return false;
      const d = startOfDay(new Date(o.at));
      if (fromTs!=null && d<fromTs) return false;
      if (toTs!=null && d>toTs) return false;
      const h = new Date(o.at).getHours();
      if (hFrom!=null && h<hFrom) return false;
      if (hTo!=null && h>hTo) return false;
      return true;
    });
    const list = filtered.slice(0, 80);
    let lastDay='';
    const sc = this.$('#list') as HTMLElement;
    const top = this.resetScroll?0:sc.scrollTop;
    this.resetScroll=false;
    sc.innerHTML = list.length ? list.map((o) => {
      const day = dayLabel(o.at);
      const hd = day!==lastDay ? `<h2 class="pt-3 text-sm font-medium text-muted-foreground">${day}</h2>` : '';
      lastDay=day;
      const n = o.items.reduce((a,i)=>a+i.qty,0);
      const exp = this.open===o.id;
      const cus = o.customerId ? store.customer(o.customerId) : null;
      return `${hd}
        <article class="overflow-hidden rounded-xl border border-border bg-card">
          <button data-row="${o.id}" aria-expanded="${exp}" class="flex w-full cursor-pointer items-center gap-3 p-4 text-left hover:bg-accent">
            <span class="w-28 font-semibold tabular-nums">${o.receiptNo}</span>
            <span class="min-w-0 flex-1 text-sm text-muted-foreground">
              <span class="text-foreground">${fmtTime(o.at)}</span>
              <span class="hidden sm:inline">, ${n} ${n===1?'item':'items'} ${cus? `· ${cus.name}` : '· Walk-in'}</span>
            </span>
            ${badge(o.status, toneForStatus(o.status))}
            <span class="w-20 text-right font-medium tabular-nums ${o.status==='refunded'||o.status==='voided'?'text-muted-foreground line-through':''}">${money(o.total)}</span>
            <span class="text-muted-foreground transition-transform ${exp?'rotate-180':''}">${icon('chevron','size-4')}</span>
          </button>
          ${exp ? `
            <div class="space-y-3 border-t border-border bg-muted/50 p-4 text-sm">
              <ul class="space-y-1">
                ${o.items.map((i)=>`<li class="flex justify-between gap-3"><span>${i.qty} × ${esc(i.name)}</span><span class="tabular-nums">${money(i.price*i.qty)}</span></li>`).join('')}
              </ul>
              <div class="space-y-1 border-t border-border pt-3 text-muted-foreground">
                <div class="flex justify-between"><span>Subtotal</span><span class="tabular-nums">${money(o.subtotal)}</span></div>
                ${o.discount?`<div class="flex justify-between"><span>Discount</span><span class="tabular-nums">−${money(o.discount)}</span></div>`:''}
                <div class="flex justify-between"><span>Tax</span><span class="tabular-nums">${money(o.tax)}</span></div>
                <div class="flex justify-between font-medium text-foreground"><span>Total, ${o.method}</span><span class="tabular-nums">${money(o.total)}</span></div>
              </div>
              <div class="flex flex-wrap gap-2 justify-end">
                ${o.status==='held' ? `<button data-resume="${o.id}" class="btn btn-primary h-9">Resume</button><button data-void="${o.id}" class="btn btn-outline h-9">Void</button>` : ''}
                ${o.status==='paid' && store.can('sale.refund') ? (this.confirming===o.id ? `<button data-cancel class="btn btn-outline h-9">Keep order</button><button data-confirm="${o.id}" class="btn btn-danger h-9">Refund ${money(o.total)}</button>` : `<button data-refund="${o.id}" class="btn btn-outline h-9">Refund order</button>`) : ''}
                ${o.status==='paid' && !store.can('sale.refund') ? '' : ''}
              </div>
            </div>` : ''}
        </article>`;
    }).join('') : `<div class="grid place-items-center py-16">${icon('receipt','size-10')}<p class="mt-3 font-medium">No sales found</p></div>`;
    sc.scrollTop = top;
    const total = store.orders.length;
    const gross = round2(store.orders.reduce((a,o)=>a+o.total,0));
    const paid = store.orders.filter((o)=>o.status==='paid');
    const refunded = store.orders.filter((o)=>o.status==='refunded');
    const avg = total ? gross/total : 0;
    const today = startOfDay(new Date());
    const paidToday = paid.filter((o)=>o.at>=today);
    const netToday = round2(paidToday.reduce((a,o)=>a+o.total,0));
    const sum = this.$('#sum') as HTMLElement;
    const sumTop = sum.scrollTop;
    this.$('#sum-scope')!.textContent = (this.filter!=='all'||this.q||rangeActive) ? `${filtered.length} of ${total} orders` : `${total} orders`;
    const receipts = store.unmatchedReceipts();
    const receiptRows = receipts.map((r) => `
      <li class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate font-medium">${esc(r.code)}</p>
          <p class="text-xs text-muted-foreground">${money(r.amount)} · ${esc(r.payerName)}</p>
        </div>
        ${store.can('payment.match') ? `<button data-match="${r.id}" class="btn btn-outline h-8">Match</button>` : ''}
      </li>`).join('');
    sum.innerHTML = `
      <section class="space-y-3"><h3 class="rail-heading">Sales</h3><dl class="space-y-3">${stat('Gross sales', money(gross))}${stat('Average order', money(avg))}${stat('Paid', paid.length)}${stat('Held', held.length)}${stat('Refunded', refunded.length)}${stat('Voided', store.orders.filter((o)=>o.status==='voided').length)}</dl></section>
      <section class="space-y-3 border-t border-border pt-5"><h3 class="rail-heading">Today</h3><dl class="space-y-3">${stat('Net sales', money(netToday))}${stat('Paid orders', paidToday.length)}</dl></section>
      <section class="space-y-3 border-t border-border pt-5"><h3 class="rail-heading">M-Pesa receipts</h3>${receipts.length ? `<ul class="space-y-3">${receiptRows}</ul>` : '<p class="text-xs text-muted-foreground">No unmatched receipts.</p>'}</section>`;
    sum.scrollTop = sumTop;
  }
}
