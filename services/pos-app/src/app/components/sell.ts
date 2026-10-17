// <mocho-sell>: product grid and the point of sale. Named "Sell" to avoid
// confusion with account registration.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { esc, money } from '../util.ts';

export class MochoSell extends MochoElement {
  q = '';
  cat = 'All';

  build(): void {
    this.className = 'block h-full';
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col xl:flex" aria-label="Products">
            <div class="flex flex-col gap-4 p-4 xl:p-6 xl:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 class="text-2xl font-semibold tracking-tight">Sell</h1>
                  <p id="sale-with" class="mt-0.5 text-xs text-muted-foreground"></p>
                </div>
                <div class="flex w-full items-center gap-2 sm:w-auto">
                  <button id="held" class="chip" hidden></button>
                  <label class="relative flex-1 sm:w-72 sm:flex-none">
                    <span class="sr-only">Search products</span>
                    <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">${icon('search', 'size-4')}</span>
                    <input id="q" name="product-search" type="search" class="input pl-9" placeholder="Search or scan a barcode" autocomplete="off" />
                  </label>
                </div>
              </header>
              <div id="cats" class="hide-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Categories"></div>
            </div>
            <div class="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 xl:px-6 xl:pb-6">
              <div id="grid" class="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 xl:grid-cols-4"></div>
            </div>
          </section>
          <mocho-cart id="cart" class="min-h-0 flex-col bg-card xl:flex xl:border-l xl:border-border"></mocho-cart>
        </div>`;
    (this.$('#q') as HTMLInputElement).addEventListener('input', (e) => { this.q = (e.target as HTMLInputElement).value.trim().toLowerCase(); this.renderGrid(); });
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const add = t.closest('[data-add]') as HTMLElement | null;
      if (add) store.add(add.dataset.add!);
      const cat = t.closest('[data-cat]') as HTMLElement | null;
      if (cat) { this.cat = cat.dataset.cat!; this.update(); }
      if (t.closest('#held')) { location.hash = '#sales'; store.setView('sales'); }
    });
  }

  update(): void {
    this.togglePanel('section[aria-label="Products"]', 'main');
    this.togglePanel('#cart', 'side');
    const c = store.customer(store.customerId);
    this.$('#sale-with')!.textContent = c ? `Selling to ${c.name}` : 'Walk-in customer';
    const held = store.held();
    const heldBtn = this.$('#held') as HTMLElement;
    heldBtn.hidden = held.length === 0;
    heldBtn.textContent = `Held (${held.length})`;
    this.$('#cats')!.innerHTML = ['All', ...store.categories()]
      .map((cat) => `<button class="chip" data-cat="${esc(cat)}" aria-pressed="${this.cat === cat}">${esc(cat)}</button>`).join('');
    this.renderGrid();
  }

  renderGrid(): void {
    const list = store.products.filter((p) =>
      p.active && (this.cat === 'All' || p.category === this.cat) && p.name.toLowerCase().includes(this.q));
    this.$('#grid')!.innerHTML = list.length
      ? list.map((p) => {
        const inCart = store.qtyInCart(p.id);
        const left = p.stock - inCart;
        const note = !p.trackStock ? '' : p.stock <= 0 ? 'Sold out' : left <= p.lowStock ? `${left} left` : '';
        return `
              <button data-add="${p.id}" ${p.trackStock && p.stock <= 0 ? 'disabled' : ''}
                class="flex min-h-28 cursor-pointer flex-col justify-between gap-4 rounded-xl border bg-card p-4 text-left transition active:scale-[.98] hover:border-foreground/40 focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50 ${inCart ? 'border-foreground' : 'border-border'}">
                <span class="flex w-full items-start justify-between gap-2">
                  <span class="leading-snug font-medium">${esc(p.name)}</span>
                  ${inCart ? `<span class="grid h-6 min-w-6 place-items-center rounded-full bg-chart-2 px-1.5 text-xs font-semibold text-neutral-950">${inCart}</span>` : ''}
                </span>
                <span class="flex w-full items-end justify-between gap-2">
                  <span class="font-semibold tabular-nums">${money(p.price)}</span>
                  <span class="text-xs ${p.stock <= 0 ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}">${note}</span>
                </span>
              </button>`;
      }).join('')
      : `<p class="col-span-full py-12 text-center text-sm text-muted-foreground">No products match "${esc(this.q)}". Try a different search or category.</p>`;
  }
}
