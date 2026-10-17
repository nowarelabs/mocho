// <mocho-inventory>: stock table and overview.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { LOW_STOCK, store } from '../store.ts';
import { esc, money, round2, stat } from '../util.ts';

export class MochoInventory extends MochoElement {
  q = '';
  lowOnly = false;
  build(): void {
    this.className = 'block h-full';
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col lg:flex" aria-label="Inventory">
            <div class="flex flex-col gap-4 p-4 md:p-6 lg:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-semibold tracking-tight">Inventory</h1>
                <button id="add" class="btn btn-primary">${icon('plus', 'size-4')}Add product</button>
              </header>
              <div class="flex flex-wrap items-center gap-3">
                <label class="relative w-full sm:w-72">
                  <span class="sr-only">Search inventory</span>
                  <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">${icon('search', 'size-4')}</span>
                  <input id="inv-q" name="inventory-search" type="search" class="input pl-9" placeholder="Search inventory" autocomplete="off" />
                </label>
                <button id="low" class="chip" aria-pressed="false"></button>
              </div>
            </div>
            <div class="min-h-0 flex-1 px-4 pb-4 md:px-6 md:pb-6">
              <div class="hide-scrollbar h-full overflow-auto rounded-xl border border-border bg-card">
                <table class="w-full text-sm">
                  <thead class="text-left text-muted-foreground">
                    <tr>
                      <th class="sticky top-0 z-10 border-b border-border bg-card px-4 py-3 font-medium">Product</th>
                      <th class="sticky top-0 z-10 hidden border-b border-border bg-card px-4 py-3 font-medium sm:table-cell">Category</th>
                      <th class="sticky top-0 z-10 hidden border-b border-border bg-card px-4 py-3 text-right font-medium sm:table-cell">Price</th>
                      <th class="sticky top-0 z-10 border-b border-border bg-card px-4 py-3 text-right font-medium">In stock</th>
                    </tr>
                  </thead>
                  <tbody id="rows"></tbody>
                </table>
              </div>
            </div>
          </section>
          <aside class="min-h-0 flex-col bg-card lg:flex lg:border-l lg:border-border" aria-label="Overview">
            <header class="border-b border-border p-5">
              <h2 class="text-base font-semibold tracking-tight">Overview</h2>
              <p id="inv-scope" class="mt-0.5 text-xs text-muted-foreground"></p>
            </header>
            <div class="hide-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section class="space-y-3">
                <h3 class="rail-heading">Stock</h3>
                <dl id="sum-stats" class="space-y-3"></dl>
              </section>
              <section class="space-y-3 border-t border-border pt-5">
                <h3 class="rail-heading">By category</h3>
                <dl id="sum-cats" class="space-y-3"></dl>
              </section>
            </div>
          </aside>
        </div>`;
    (this.$('#inv-q') as HTMLInputElement).addEventListener('input', (e) => { this.q = (e.target as HTMLInputElement).value.trim().toLowerCase(); this.update(); });
    this.$('#add')!.addEventListener('click', () => store.dispatchEvent(new Event('new-product')));
    this.$('#low')!.addEventListener('click', () => { this.lowOnly = !this.lowOnly; this.update(); });
    this.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-adjust]') as HTMLElement | null;
      if (b) store.setStock(b.dataset.id!, store.product(b.dataset.id!)!.stock + Number(b.dataset.adjust));
    });
    this.addEventListener('change', (e) => { if ((e.target as HTMLElement).matches('[data-stock]')) store.setStock((e.target as HTMLElement).dataset.stock!, (e.target as HTMLInputElement).value); });
  }
  update(): void {
    this.togglePanel('section[aria-label="Inventory"]', 'main');
    this.togglePanel('aside[aria-label="Overview"]', 'side');
    const lowCount = store.products.filter((p) => p.stock <= LOW_STOCK).length;
    const low = this.$('#low')!;
    low.setAttribute('aria-pressed', String(this.lowOnly));
    low.textContent = `Low or out of stock (${lowCount})`;
    const list = store.products.filter((p) => p.name.toLowerCase().includes(this.q) && (!this.lowOnly || p.stock <= LOW_STOCK));
    this.$('#rows')!.innerHTML = list.length
      ? list.map((p) => {
        const status = p.stock <= 0 ? '<span class="badge bg-destructive/10 text-destructive">Out</span>' : p.stock <= LOW_STOCK ? '<span class="badge bg-amber-500/15 text-amber-700 dark:text-amber-400">Low</span>' : '';
        return `
              <tr class="border-b border-border last:border-b-0">
                <td class="px-4 py-3"><div class="flex flex-wrap items-center gap-2"><span class="font-medium">${esc(p.name)}</span>${status}</div><div class="text-xs text-muted-foreground sm:hidden">${esc(p.category)}, ${money(p.price)}</div></td>
                <td class="hidden px-4 py-3 text-muted-foreground sm:table-cell">${esc(p.category)}</td>
                <td class="hidden px-4 py-3 text-right tabular-nums sm:table-cell">${money(p.price)}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1.5">
                    <button class="icon-btn" data-adjust="-1" data-id="${p.id}" aria-label="Decrease ${esc(p.name)} stock" ${p.stock <= 0 ? 'disabled' : ''}>${icon('minus', 'size-4')}</button>
                    <input data-stock="${p.id}" id="stock-${p.id}" name="stock-${p.id}" type="number" min="0" value="${p.stock}" aria-label="${esc(p.name)} stock" class="input h-8 w-16 px-2 text-center tabular-nums" />
                    <button class="icon-btn" data-adjust="1" data-id="${p.id}" aria-label="Increase ${esc(p.name)} stock">${icon('plus', 'size-4')}</button>
                  </div>
                </td>
              </tr>`;
      }).join('')
      : `<tr><td colspan="4" class="px-4 py-16">
              <div class="grid place-items-center text-center">
                <div>
                  <div class="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">${icon('box')}</div>
                  <p class="font-medium">No products found</p>
                  <p class="mt-1 text-sm text-muted-foreground">${this.q ? `Nothing matches “${esc(this.q)}”. Try a different search.` : 'No products match this filter.'}</p>
                </div>
              </div>
            </td></tr>`;
    const units = list.reduce((a, p) => a + p.stock, 0);
    const retail = round2(list.reduce((a, p) => a + p.stock * p.price, 0));
    const lowN = list.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK).length;
    const outN = list.filter((p) => p.stock <= 0).length;
    this.$('#inv-scope')!.textContent = this.lowOnly ? 'Low or out of stock' : this.q ? 'Search results' : 'All products';
    this.$('#sum-stats')!.innerHTML = [
      stat('Products', list.length),
      stat('Units in stock', units),
      stat('Retail value', money(retail)),
      stat('Low stock', lowN),
      stat('Out of stock', outN),
    ].join('');
    const cats: Record<string, { count: number; units: number }> = {};
    list.forEach((p) => { (cats[p.category] ??= { count: 0, units: 0 }).count++; cats[p.category].units += p.stock; });
    const entries = Object.entries(cats).sort((a, b) => b[1].units - a[1].units);
    this.$('#sum-cats')!.innerHTML = entries.length
      ? entries.map(([name, v]) => stat(esc(name), v.units, `${v.count} ${v.count === 1 ? 'product' : 'products'}`)).join('')
      : '<p class="text-sm text-muted-foreground">Nothing to show.</p>';
  }
}
