// <mocho-product-form>: add a new product.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { esc, round2 } from '../util.ts';

export class MochoProductForm extends MochoElement {
  live = false;
  build(): void {
    store.addEventListener('new-product', () => this.open());
  }
  open(): void {
    this.innerHTML = `
        <dialog class="dlg">
          <form class="w-[min(26rem,calc(100vw-2rem))] space-y-4 p-6" method="dialog">
            <div class="flex items-start justify-between">
              <h2 class="text-lg font-semibold tracking-tight">Add product</h2>
              <button type="button" data-close class="icon-btn" aria-label="Close">${icon('x','size-4')}</button>
            </div>
            <label class="block space-y-1.5 text-sm font-medium">Name<input name="name" class="input" required maxlength="40" autofocus></label>
            <label class="block space-y-1.5 text-sm font-medium">SKU<input name="sku" class="input" required maxlength="12"></label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block space-y-1.5 text-sm font-medium">Category<input name="category" class="input" list="cat-list" required maxlength="24" placeholder="Coffee, Bakery, Beans">
                <datalist id="cat-list">${store.categories().map((c)=>`<option value="${esc(c)}"></option>`).join('')}</datalist>
              </label>
              <label class="block space-y-1.5 text-sm font-medium">Price
                <span class="relative block"><span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span><input name="price" class="input pl-7 tabular-nums" type="number" min="0" step="0.01" required placeholder="0.00"></span>
              </label>
              <label class="block space-y-1.5 text-sm font-medium">Cost
                <span class="relative block"><span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span><input name="cost" class="input pl-7 tabular-nums" type="number" min="0" step="0.01" required placeholder="0.00"></span>
              </label>
              <label class="block space-y-1.5 text-sm font-medium">Starting stock<input name="stock" class="input tabular-nums" type="number" min="0" step="1" value="0" required></label>
              <label class="block space-y-1.5 text-sm font-medium">Low stock at<input name="low" class="input tabular-nums" type="number" min="0" step="1" value="${store.dataset.products[0]?.lowStock??5}" required></label>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" data-close class="btn btn-outline">Cancel</button>
              <button class="btn btn-primary" value="save">Save product</button>
            </div>
          </form>
        </dialog>`;
    const dlg = this.$('dialog') as HTMLDialogElement;
    dlg.addEventListener('click', (e) => { if (e.target === dlg || (e.target as HTMLElement).closest('[data-close]')) dlg.close(); });
    dlg.querySelector('form')!.addEventListener('submit', (e) => {
      const f = new FormData(e.target as HTMLFormElement);
      const name = (f.get('name') as string).trim();
      store.addProduct({ name, sku: (f.get('sku') as string).trim().toUpperCase(), category: (f.get('category') as string).trim(), price: round2(Number(f.get('price'))), cost: round2(Number(f.get('cost'))), stock: Math.floor(Number(f.get('stock'))), lowStock: Math.floor(Number(f.get('low'))) });
      store.toast(`${name} added`);
    });
    dlg.showModal();
  }
}
