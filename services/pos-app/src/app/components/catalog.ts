// <mocho-catalog>: products, categories, promotions and price lists.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { badge, checkField, empty, formDialog, inputField, selectField, table } from '../ui.ts';
import type { Category, PriceList, Product, Promotion } from '../types.ts';
import { esc, money, plural, stat } from '../util.ts';

const PROMO_TYPES = [
  { value: 'percent_off', label: 'Percent off' },
  { value: 'amount_off', label: 'Amount off' },
  { value: 'buy_x_get_y', label: 'Buy X get Y' },
  { value: 'bundle_price', label: 'Bundle price' },
];

export class MochoCatalog extends MochoElement {
  q = '';
  tab = 'products';

  build(): void {
    this.className = 'block h-full';
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col xl:flex" aria-label="Catalog">
            <div class="flex flex-col gap-3 p-4 xl:p-6 xl:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-semibold tracking-tight">Catalog</h1>
                <span id="cat-action" class="contents"></span>
              </header>
              <div class="flex flex-wrap items-center gap-3">
                <label class="relative w-full sm:w-72">
                  <span class="sr-only">Search products</span>
                  <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">${icon('search', 'size-4')}</span>
                  <input id="cat-q" type="search" class="input pl-9" placeholder="Search SKU, name or category" autocomplete="off" />
                </label>
                <div class="flex gap-2" role="group">
                  ${[['products', 'Products'], ['categories', 'Categories'], ['promotions', 'Promotions'], ['prices', 'Price lists']].map(([v, l]) => `<button data-tab="${v}" class="chip" aria-pressed="${this.tab === v}">${l}</button>`).join('')}
                </div>
              </div>
            </div>
            <div id="body" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 xl:px-6 xl:pb-6"></div>
          </section>
          <aside class="min-h-0 flex-col bg-card xl:flex xl:border-l xl:border-border" aria-label="Details">
            <header class="border-b border-border p-5"><h2 class="text-base font-semibold tracking-tight">Details</h2></header>
            <div id="side" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-5 text-sm"></div>
          </aside>
        </div>`;
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#add')) { store.dispatchEvent(new Event('new-product')); return; }
      if (t.closest('[data-addcat]')) { this.openCategoryDialog(); return; }
      if (t.closest('[data-addpromo]')) { this.openPromotionDialog(); return; }
      if (t.closest('[data-addprice]')) { this.openPriceListDialog(); return; }
      const cat = t.closest('[data-togcat]') as HTMLElement | null;
      if (cat) { store.toggleCategory(cat.dataset.togcat!); return; }
      const promo = t.closest('[data-togpromo]') as HTMLElement | null;
      if (promo) { store.togglePromotion(promo.dataset.togpromo!); return; }
      const tab = t.closest('[data-tab]') as HTMLElement | null;
      if (tab) { this.tab = tab.dataset.tab!; this.update(); return; }
    });
    (this.$('#cat-q') as HTMLInputElement).addEventListener('input', (e) => { this.q = (e.target as HTMLInputElement).value.trim().toLowerCase(); this.update(); });
  }

  openCategoryDialog(): void {
    formDialog('Add category', inputField('Name', 'name', { required: true, attrs: 'maxlength="24"' }), 'Add category', (f) => {
      const name = (f.get('name') as string).trim();
      if (name) { store.addCategory(name); store.toast(`${name} added`); }
    });
  }

  openPromotionDialog(): void {
    const body = `
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${inputField('Name', 'name', { required: true, attrs: 'maxlength="40"' })}</div>
        ${selectField('Type', 'type', PROMO_TYPES, 'percent_off')}
        ${inputField('Value', 'value', { type: 'number', value: 10, required: true, attrs: 'min="0" step="0.01"' })}
        ${inputField('Minimum quantity', 'minQuantity', { type: 'number', value: 1, required: true, attrs: 'min="1" step="1"' })}
      </div>`;
    formDialog('Add promotion', body, 'Add promotion', (f) => {
      const name = (f.get('name') as string).trim();
      if (!name) return;
      store.addPromotion({ name, type: f.get('type') as string, value: Number(f.get('value')) || 0, minQuantity: Math.max(1, Math.floor(Number(f.get('minQuantity')) || 1)) });
      store.toast(`${name} added`);
    });
  }

  openPriceListDialog(): void {
    const body = `
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${inputField('Name', 'name', { required: true, attrs: 'maxlength="40"' })}</div>
        ${inputField('Currency', 'currency', { value: 'USD', required: true, attrs: 'maxlength="3"' })}
        <div class="self-end pb-2">${checkField('Prices include tax', 'pricesIncludeTax', false)}</div>
      </div>`;
    formDialog('Add price list', body, 'Add price list', (f) => {
      const name = (f.get('name') as string).trim();
      if (!name) return;
      store.addPriceList({ name, currency: (f.get('currency') as string).trim().toUpperCase(), pricesIncludeTax: f.get('pricesIncludeTax') === 'on' });
      store.toast(`${name} added`);
    });
  }

  update(): void {
    this.togglePanel('section[aria-label="Catalog"]', 'main');
    this.togglePanel('aside[aria-label="Details"]', 'side');
    this.$$('[data-tab]').forEach((el) => el.setAttribute('aria-pressed', String((el as HTMLElement).dataset.tab === this.tab)));
    this.$('#cat-action')!.innerHTML = this.headerAction();
    const body = this.$('#body') as HTMLElement;
    const side = this.$('#side') as HTMLElement;
    if (this.tab === 'products') { this.renderProducts(body, side); return; }
    if (this.tab === 'categories') { this.renderCategories(body, side); return; }
    if (this.tab === 'promotions') { this.renderPromotions(body, side); return; }
    this.renderPriceLists(body, side);
  }

  private headerAction(): string {
    if (!store.can('catalog.manage')) return '';
    const label = this.tab === 'products' ? 'Add product' : this.tab === 'categories' ? 'Add category' : this.tab === 'promotions' ? 'Add promotion' : 'Add price list';
    const attr = this.tab === 'products' ? 'id="add"' : this.tab === 'categories' ? 'data-addcat' : this.tab === 'promotions' ? 'data-addpromo' : 'data-addprice';
    return `<button ${attr} class="btn btn-primary">${icon('plus', 'size-4')}${label}</button>`;
  }

  private renderProducts(body: HTMLElement, side: HTMLElement): void {
    const list = store.products.filter((p) => p.name.toLowerCase().includes(this.q) || p.sku.toLowerCase().includes(this.q) || p.category.toLowerCase().includes(this.q));
    const cols = [
      { label: 'SKU', cell: (p: Product) => `<span class="font-medium">${esc(p.sku)}</span>` },
      { label: 'Product', cell: (p: Product) => `<div><span class="font-medium">${esc(p.name)}</span><div class="text-xs text-muted-foreground">${esc(p.category)}</div></div>` },
      { label: 'Price', cell: (p: Product) => money(p.price), align: 'right' as const },
      { label: 'Cost', cell: (p: Product) => money(p.cost), align: 'right' as const },
      { label: 'Stock', cell: (p: Product) => plural(p.stock, 'unit'), align: 'right' as const },
      { label: 'Status', cell: (p: Product) => badge(p.active ? 'Active' : 'Inactive', p.active ? 'success' : 'neutral') },
    ];
    body.innerHTML = table(cols, list);
    const p = list[0];
    if (p) {
      side.innerHTML = `<dl class="space-y-2">
        <p class="text-sm font-medium">${esc(p.name)}</p>
        ${stat('SKU', esc(p.sku))}${stat('Category', esc(p.category))}${stat('UOM', esc(p.uomId))}${stat('Tax', `${Math.round(store.taxRateOf(p.id) * 100)}%`)}${stat('Track stock', p.trackStock ? 'Yes' : 'No')}
        <hr class="border-border">
        ${stat('Price', money(p.price))}${stat('Cost', money(p.cost))}${stat('Margin', money(p.price - p.cost))}
        <hr class="border-border">
        ${stat('In stock', p.stock)}${stat('Low stock at', p.lowStock)}${stat('Active', p.active ? 'Yes' : 'No')}
      </dl>`;
    } else side.innerHTML = empty('box', 'No products');
  }

  private renderCategories(body: HTMLElement, side: HTMLElement): void {
    const manage = store.can('catalog.manage');
    const cols = [
      { label: 'Category', cell: (c: Category) => esc(c.name) },
      { label: 'Status', cell: (c: Category) => badge(c.active ? 'Active' : 'Inactive', c.active ? 'success' : 'neutral') },
      { label: 'Products', cell: (c: Category) => String(store.products.filter((p) => p.category === c.name).length), align: 'right' as const },
      { label: '', align: 'right' as const, cell: (c: Category) => manage ? `<button data-togcat="${c.id}" class="icon-btn" aria-label="${c.active ? 'Disable' : 'Enable'} ${esc(c.name)}">${icon(c.active ? 'x' : 'check', 'size-4')}</button>` : '' },
    ];
    body.innerHTML = table(cols, store.dataset.categories);
    side.innerHTML = empty('tag', 'Categories', 'Categories group products for browsing and promotion rules.');
  }

  private renderPromotions(body: HTMLElement, side: HTMLElement): void {
    const manage = store.can('catalog.manage');
    const cols = [
      { label: 'Promotion', cell: (p: Promotion) => esc(p.name) },
      { label: 'Type', cell: (p: Promotion) => esc(PROMO_TYPES.find((t) => t.value === p.type)?.label ?? p.type) },
      { label: 'Value', cell: (p: Promotion) => String(p.value), align: 'right' as const },
      { label: 'Min qty', cell: (p: Promotion) => String(p.minQuantity), align: 'right' as const },
      { label: 'Status', cell: (p: Promotion) => badge(p.active ? 'Active' : 'Inactive', p.active ? 'success' : 'neutral') },
      { label: '', align: 'right' as const, cell: (p: Promotion) => manage ? `<button data-togpromo="${p.id}" class="icon-btn" aria-label="${p.active ? 'Disable' : 'Enable'} ${esc(p.name)}">${icon(p.active ? 'x' : 'check', 'size-4')}</button>` : '' },
    ];
    body.innerHTML = table(cols, store.dataset.promotions);
    const pr = store.dataset.promotions[0];
    side.innerHTML = pr
      ? `<dl class="space-y-2">${stat('Name', esc(pr.name))}${stat('Type', esc(pr.type))}${stat('Value', pr.value)}${stat('Min qty', pr.minQuantity)}${stat('Active', pr.active ? 'Yes' : 'No')}</dl>`
      : empty('tag', 'No promotions');
  }

  private renderPriceLists(body: HTMLElement, side: HTMLElement): void {
    const cols = [
      { label: 'Price list', cell: (r: PriceList) => esc(r.name) },
      { label: 'Currency', cell: (r: PriceList) => esc(r.currency) },
      { label: 'Tax', cell: (r: PriceList) => (r.pricesIncludeTax ? 'Included' : 'Excluded') },
      { label: 'Status', cell: (r: PriceList) => badge(r.active ? 'Active' : 'Inactive', r.active ? 'success' : 'neutral') },
    ];
    body.innerHTML = table(cols, store.dataset.priceLists);
    side.innerHTML = empty('scale', 'Price lists', 'Price lists let a store override default pricing per channel or customer group.');
  }
}
