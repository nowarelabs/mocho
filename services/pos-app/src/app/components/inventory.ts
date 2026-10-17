// <mocho-inventory>: stock, movements, suppliers, purchase orders.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { badge, empty, formDialog, inputField, selectField, table, toneForStatus } from '../ui.ts';
import type { PurchaseOrder, Supplier } from '../types.ts';
import { esc, fmtDate, fmtTime, money, stat } from '../util.ts';

export class MochoInventory extends MochoElement {
  q = '';
  lowOnly = false;
  tab = 'stock';

  build(): void {
    this.className = 'block h-full';
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col xl:flex" aria-label="Inventory">
            <div class="flex flex-col gap-3 p-4 xl:p-6 xl:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-semibold tracking-tight">Inventory</h1>
                <span id="inv-action" class="contents"></span>
              </header>
              <div class="flex flex-wrap items-center gap-3">
                <label class="relative w-full sm:w-72">
                  <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">${icon('search','size-4')}</span>
                  <input id="inv-q" type="search" class="input pl-9" placeholder="Search inventory" autocomplete="off" />
                </label>
                <button id="low" class="chip" aria-pressed="false">Low or out (${store.products.filter(p=>p.stock<=p.lowStock).length})</button>
                <div class="flex gap-2">
                  ${[['stock','Stock'],['movements','Movements'],['suppliers','Suppliers'],['po','Purchase orders']].map(([v,l]) => `<button data-itab="${v}" class="chip" aria-pressed="${this.tab===v}">${l}</button>`).join('')}
                </div>
              </div>
            </div>
            <div id="ibody" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 xl:px-6 xl:pb-6"></div>
          </section>
          <aside class="min-h-0 flex-col bg-card xl:flex xl:border-l xl:border-border" aria-label="Overview">
            <header class="border-b border-border p-5"><h2 class="text-base font-semibold tracking-tight">Overview</h2></header>
            <div id="iside" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-5 text-sm"></div>
          </aside>
        </div>`;
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#inv-add')) { store.dispatchEvent(new Event('new-product')); return; }
      if (t.closest('[data-addsup]')) { this.openSupplierDialog(); return; }
      if (t.closest('[data-addpo]')) { this.openPurchaseOrderDialog(); return; }
      const recv = t.closest('[data-receive]') as HTMLElement | null;
      if (recv) { store.receivePurchaseOrder(recv.dataset.receive!); return; }
      if (t.closest('#low')) { this.lowOnly = !this.lowOnly; this.update(); return; }
      const tab = t.closest('[data-itab]') as HTMLElement | null;
      if (tab) { this.tab = tab.dataset.itab!; this.update(); return; }
      const adj = t.closest('[data-adj]') as HTMLElement | null;
      if (adj) store.adjustStock(adj.dataset.id!, Number(adj.dataset.adj));
    });
    this.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches('[data-stock]')) store.setStock(t.dataset.stock!, t.value);
    });
    (this.$('#inv-q') as HTMLInputElement).addEventListener('input', (e) => { this.q = (e.target as HTMLInputElement).value.trim().toLowerCase(); this.update(); });
  }

  private headerAction(): string {
    if (this.tab === 'stock') return store.can('catalog.manage') ? `<button id="inv-add" class="btn btn-primary">${icon('plus', 'size-4')}Add product</button>` : '';
    if (this.tab === 'suppliers') return store.can('purchase.manage') ? `<button data-addsup class="btn btn-primary">${icon('plus', 'size-4')}Add supplier</button>` : '';
    if (this.tab === 'po') return store.can('purchase.manage') ? `<button data-addpo class="btn btn-primary">${icon('plus', 'size-4')}New order</button>` : '';
    return '';
  }

  openSupplierDialog(): void {
    const body = `
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${inputField('Name', 'name', { required: true, attrs: 'maxlength="40"' })}</div>
        ${inputField('Phone', 'phone', { attrs: 'inputmode="tel"' })}
        ${inputField('Email', 'email', { type: 'email' })}
        <div class="col-span-2">${inputField('Payment terms (days)', 'terms', { type: 'number', value: 30, attrs: 'min="0" step="1"' })}</div>
      </div>`;
    formDialog('Add supplier', body, 'Add supplier', (f) => {
      const name = (f.get('name') as string).trim();
      if (!name) return;
      store.addSupplier({ name, phone: f.get('phone') as string, email: f.get('email') as string, paymentTermsDays: Math.max(0, Math.floor(Number(f.get('terms')) || 0)) });
      store.toast(`${name} added`);
    });
  }

  openPurchaseOrderDialog(): void {
    const suppliers = store.dataset.suppliers.map((s) => ({ value: s.id, label: s.name }));
    if (!suppliers.length) return store.toast('Add a supplier first');
    const body = `
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${selectField('Supplier', 'supplierId', suppliers, suppliers[0].value)}</div>
        ${inputField('Total', 'total', { type: 'number', value: 0, required: true, attrs: 'min="0" step="0.01"' })}
        ${inputField('Expected', 'expectedAt', { type: 'date' })}
      </div>`;
    formDialog('New purchase order', body, 'Create order', (f) => {
      const expected = f.get('expectedAt') as string;
      store.addPurchaseOrder({
        supplierId: f.get('supplierId') as string,
        total: Number(f.get('total')) || 0,
        expectedAt: expected ? new Date(`${expected}T00:00:00`).getTime() : null,
      });
      store.toast('Purchase order created');
    });
  }

  update(): void {
    this.togglePanel('section[aria-label="Inventory"]', 'main');
    this.togglePanel('aside[aria-label="Overview"]', 'side');
    (this.querySelectorAll('[data-itab]')).forEach((el) => el.setAttribute('aria-pressed', String((el as HTMLElement).dataset.itab===this.tab)));
    this.$('#inv-action')!.innerHTML = this.headerAction();
    const lowBtn = this.$('#low') as HTMLElement;
    lowBtn.setAttribute('aria-pressed', String(this.lowOnly));
    const ibody = this.$('#ibody') as HTMLElement;
    const iside = this.$('#iside') as HTMLElement;
    if (this.tab === 'stock') {
      const list = store.products.filter((p) => (this.q ? (p.name.toLowerCase().includes(this.q) || p.sku.toLowerCase().includes(this.q)) : true) && (!this.lowOnly || p.stock <= p.lowStock));
      const cols = [
        { label: 'Product', cell: (p:any) => `<div class="font-medium">${esc(p.name)}</div><div class="text-xs text-muted-foreground">${p.sku} · ${p.category}</div>` },
        { label: 'In stock', cell: (p:any) => `<div class="tabular-nums">${p.stock}</div>`, align: 'right' as const },
        { label: 'Low at', cell: (p:any) => `<div class="tabular-nums">${p.lowStock}</div>`, align: 'right' as const },
        { label: 'Status', cell: (p:any) => badge(p.stock<=0?'Out':p.stock<=p.lowStock?'Low':'OK', p.stock<=0?'danger':p.stock<=p.lowStock?'warn':'success') },
        { label: 'Adjust', cell: (p:any) => store.can('inventory.manage') ? `<div class="flex justify-end gap-1"><button class="icon-btn" data-adj="-1" data-id="${p.id}">${icon('minus','size-4')}</button><button class="icon-btn" data-adj="1" data-id="${p.id}">${icon('plus','size-4')}</button></div>` : '' },
      ];
      ibody.innerHTML = table(cols as any, list);
      const units = list.reduce((a,p)=>a+p.stock,0);
      const retail = list.reduce((a,p)=>a+p.stock*p.price,0);
      iside.innerHTML = `<dl class="space-y-2">${stat('Products', list.length)}${stat('Units', units)}${stat('Retail value', money(retail))}</dl>`;
      return;
    }
    if (this.tab === 'movements') {
      const cols = [
        { label: 'At', cell: (m:any) => `${fmtDate(m.at)} ${fmtTime(m.at)}` },
        { label: 'Product', cell: (m:any) => store.product(m.productId)?.name || m.productId },
        { label: 'Change', cell: (m:any) => `<span class="tabular-nums ${m.change>=0?'text-chart-3':'text-destructive'}">${m.change>=0?'+':''}${m.change}</span>`, align: 'right' as const },
        { label: 'Reason', cell: (m:any) => m.reason },
        { label: 'Ref', cell: (m:any) => m.referenceId || '—' },
      ];
      ibody.innerHTML = table(cols as any, store.dataset.stockMovements);
      iside.innerHTML = empty('refresh','Stock ledger');
      return;
    }
    if (this.tab === 'suppliers') {
      const cols = [
        { label: 'Name', cell: (s: Supplier) => esc(s.name) },
        { label: 'Phone', cell: (s: Supplier) => esc(s.phone || '—') },
        { label: 'Terms (days)', cell: (s: Supplier) => String(s.paymentTermsDays), align: 'right' as const },
        { label: 'Status', cell: (s: Supplier) => badge(s.active ? 'Active' : 'Inactive', s.active ? 'success' : 'neutral') },
      ];
      ibody.innerHTML = table(cols, store.dataset.suppliers);
      iside.innerHTML = `<dl class="space-y-2">${stat('Suppliers', store.dataset.suppliers.length)}${stat('Open orders', store.dataset.purchaseOrders.filter((p) => p.status !== 'received' && p.status !== 'cancelled').length)}</dl>`;
      return;
    }
    if (this.tab === 'po') {
      const can = store.can('purchase.manage');
      const cols = [
        { label: 'PO', cell: (p: PurchaseOrder) => `<span class="font-medium">${esc(p.poNo)}</span>` },
        { label: 'Supplier', cell: (p: PurchaseOrder) => esc(store.supplier(p.supplierId)?.name ?? p.supplierId) },
        { label: 'Total', cell: (p: PurchaseOrder) => money(p.total), align: 'right' as const },
        { label: 'Status', cell: (p: PurchaseOrder) => badge(p.status, toneForStatus(p.status)) },
        { label: 'Expected', cell: (p: PurchaseOrder) => (p.expectedAt ? fmtDate(p.expectedAt) : '—') },
        {
          label: '',
          align: 'right' as const,
          cell: (p: PurchaseOrder) => can && p.status !== 'received' && p.status !== 'cancelled' ? `<button data-receive="${p.id}" class="btn btn-outline h-8">Receive</button>` : '',
        },
      ];
      ibody.innerHTML = table(cols, store.dataset.purchaseOrders);
      iside.innerHTML = empty('clipboard', 'Purchase orders', 'Receiving an order marks it received; stock levels are not changed in this demo.');
      return;
    }
  }
}
