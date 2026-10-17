// <mocho-cart>: current sale, discount and totals.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store, TAX_RATE } from '../store.ts';
import { esc, money } from '../util.ts';

export class MochoCart extends MochoElement {
  build(): void {
    this.addEventListener('click', (e) => {
      const step = (e.target as HTMLElement).closest('[data-step]') as HTMLElement | null;
      if (step) store.step(step.dataset.id!, Number(step.dataset.step));
      if ((e.target as HTMLElement).closest('[data-clear]')) store.clear();
      if ((e.target as HTMLElement).closest('[data-charge]')) store.dispatchEvent(new Event('checkout'));
    });
    this.addEventListener('change', (e) => { if ((e.target as HTMLElement).matches('[data-discount]')) store.setDiscount((e.target as HTMLInputElement).value); });
  }
  update(): void {
    const lines = store.lines();
    const t = store.totals();
    const row = (label: string, value: string, cls = ''): string => `<div class="flex justify-between text-sm ${cls}"><span>${label}</span><span class="tabular-nums">${value}</span></div>`;
    const listTop = (this.$('ul') as HTMLElement | null)?.scrollTop || 0;
    this.innerHTML = `
        <div class="flex h-full flex-col">
          <header class="flex items-start justify-between gap-2 px-5 pt-5 pb-3">
            <div>
              <h2 class="text-base font-semibold tracking-tight">Current sale</h2>
              <p class="mt-0.5 text-xs text-muted-foreground">Order #${store.nextOrder}</p>
            </div>
            <button data-clear class="btn btn-outline h-9 px-3" ${lines.length ? '' : 'disabled'}>${icon('trash', 'size-4')}Clear</button>
          </header>
          ${lines.length ? `
            <ul class="hide-scrollbar flex-1 divide-y divide-border overflow-y-auto px-5">
              ${lines.map((l) => `
                <li class="flex gap-3 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">${esc(l.name)}</p>
                    <p class="text-sm text-muted-foreground tabular-nums">${money(l.price)} each</p>
                  </div>
                  <div class="flex flex-col items-end gap-2">
                    <span class="font-medium tabular-nums">${money(l.price * l.qty)}</span>
                    <div class="flex items-center gap-1.5">
                      <button class="icon-btn" data-step="-1" data-id="${l.id}" aria-label="${l.qty === 1 ? 'Remove' : 'Decrease'} ${esc(l.name)}">${icon(l.qty === 1 ? 'trash' : 'minus', 'size-4')}</button>
                      <span class="w-6 text-center text-sm font-medium tabular-nums" aria-label="Quantity">${l.qty}</span>
                      <button class="icon-btn" data-step="1" data-id="${l.id}" aria-label="Increase ${esc(l.name)}">${icon('plus', 'size-4')}</button>
                    </div>
                  </div>
                </li>`).join('')}
            </ul>` : `
            <div class="grid flex-1 place-items-center px-8 py-10 text-center">
              <div>
                <div class="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">${icon('cart')}</div>
                <p class="font-medium">No items yet</p>
                <p class="mt-1 text-sm text-muted-foreground">Tap a product to add it to this sale.</p>
              </div>
            </div>`}
          <footer class="space-y-3 border-t border-border p-5">
            <label class="flex items-center justify-between gap-3 text-sm">
              <span>Discount</span>
              <span class="relative">
                <select data-discount id="cart-discount" name="discount" class="select w-40" ${lines.length ? '' : 'disabled'}>
                  ${[0, 5, 10, 15, 20].map((v) => `<option value="${v}" ${store.discount === v ? 'selected' : ''}>${v ? v + '% off' : 'None'}</option>`).join('')}
                </select>
                <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">${icon('chevron', 'size-4')}</span>
              </span>
            </label>
            <div class="space-y-1.5">
              ${row('Subtotal', money(t.subtotal), 'text-muted-foreground')}
              ${t.discount ? row(`Discount (${store.discount}%)`, '−' + money(t.discount), 'text-muted-foreground') : ''}
              ${row(`Tax (${(TAX_RATE * 100).toFixed(0)}%)`, money(t.tax), 'text-muted-foreground')}
              ${row('Total', money(t.total), 'pt-1 text-lg font-semibold')}
            </div>
            <button data-charge class="btn btn-primary h-14 w-full text-base" ${lines.length ? '' : 'disabled'}>
              ${lines.length ? `Charge ${money(t.total)}` : 'Charge'}
            </button>
          </footer>
        </div>`;
    const ul = this.$('ul') as HTMLElement | null;
    if (ul) ul.scrollTop = listTop;
  }
}
