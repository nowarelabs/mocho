// <mocho-customers>: customer list, loyalty, credit and messaging context.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { badge, checkField, empty, formDialog, inputField, table } from '../ui.ts';
import type { Customer } from '../types.ts';
import { esc, money, stat } from '../util.ts';

export class MochoCustomers extends MochoElement {
  q = '';
  selected: string | null = null;

  build(): void {
    this.className = 'block h-full';
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col xl:flex" aria-label="Customers">
            <div class="flex flex-col gap-3 p-4 xl:p-6 xl:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-semibold tracking-tight">Customers</h1>
                ${store.can('customers.manage') ? `<button id="addc" class="btn btn-primary">${icon('plus', 'size-4')}New customer</button>` : ''}
              </header>
              <label class="relative w-full sm:w-72">
                <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">${icon('search', 'size-4')}</span>
                <input id="cus-q" type="search" class="input pl-9" placeholder="Search name or phone" autocomplete="off" />
              </label>
            </div>
            <div id="cbody" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 xl:px-6 xl:pb-6"></div>
          </section>
          <aside class="min-h-0 flex-col bg-card xl:flex xl:border-l xl:border-border" aria-label="Profile">
            <header class="border-b border-border p-5"><h2 class="text-base font-semibold tracking-tight">Profile</h2></header>
            <div id="cside" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-5 text-sm"></div>
          </aside>
        </div>`;
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#addc')) { this.openCustomerDialog(null); return; }
      const edit = t.closest('[data-editc]') as HTMLElement | null;
      if (edit) { this.openCustomerDialog(edit.dataset.editc!); return; }
      const row = t.closest('[data-cid]') as HTMLElement | null;
      if (row) { this.selected = row.dataset.cid!; this.update(); return; }
      if (t.closest('[data-award]')) { this.openPointsDialog(); return; }
      if (t.closest('[data-repay]')) { this.openRepayDialog(); return; }
    });
    (this.$('#cus-q') as HTMLInputElement).addEventListener('input', (e) => {
      this.q = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.update();
    });
  }

  openCustomerDialog(id: string | null): void {
    const c = id ? store.customer(id) : null;
    const body = `
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${inputField('Name', 'name', { value: c?.name, required: true, attrs: 'maxlength="40"' })}</div>
        ${inputField('Phone', 'phone', { value: c?.phone, required: true, attrs: 'inputmode="tel"' })}
        ${inputField('Email', 'email', { value: c?.email, type: 'email' })}
        ${inputField('Credit limit', 'creditLimit', { value: c?.creditLimit ?? 0, type: 'number', attrs: 'min="0" step="0.01"' })}
        <div class="self-end pb-2">${checkField('SMS opt-in', 'smsOptIn', c?.smsOptIn !== false)}</div>
      </div>`;
    formDialog(c ? 'Edit customer' : 'New customer', body, c ? 'Save' : 'Add customer', (f) => {
      const fields = {
        name: (f.get('name') as string).trim(),
        phone: (f.get('phone') as string).trim(),
        email: (f.get('email') as string).trim(),
        creditLimit: Number(f.get('creditLimit')) || 0,
        smsOptIn: f.get('smsOptIn') === 'on',
      };
      if (c) { store.updateCustomer(c.id, fields); store.toast(`${fields.name} updated`); }
      else { const made = store.addCustomer(fields); if (made) this.selected = made.id; store.toast(`${fields.name} added`); }
    });
  }

  openPointsDialog(): void {
    const c = store.customer(this.selected);
    if (!c) return;
    formDialog('Adjust loyalty points', inputField(`Points for ${c.name}`, 'points', { type: 'number', value: 0, required: true, attrs: 'step="1"' }), 'Apply', (f) => {
      const delta = Math.trunc(Number(f.get('points')) || 0);
      if (delta) store.adjustPoints(c.id, delta);
    });
  }

  openRepayDialog(): void {
    const c = store.customer(this.selected);
    if (!c) return;
    formDialog('Repay credit', inputField(`Amount for ${c.name}`, 'amount', { type: 'number', value: c.creditBalance, required: true, attrs: 'min="0" step="0.01"' }), 'Record repayment', (f) => {
      const amount = Number(f.get('amount')) || 0;
      if (amount > 0) store.repayCredit(c.id, amount);
    });
  }

  update(): void {
    this.togglePanel('section[aria-label="Customers"]', 'main');
    this.togglePanel('aside[aria-label="Profile"]', 'side');
    const list = store.customers
      .filter((c) => c.name.toLowerCase().includes(this.q) || c.phone.includes(this.q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const cols = [
      { label: 'Name', cell: (c: Customer) => `<button data-cid="${c.id}" class="text-left font-medium hover:underline">${esc(c.name)}</button>` },
      { label: 'Phone', cell: (c: Customer) => esc(c.phone) },
      { label: 'Loyalty', cell: (c: Customer) => String(c.loyaltyPoints), align: 'right' as const },
      { label: 'Credit', cell: (c: Customer) => money(c.creditBalance), align: 'right' as const },
      { label: 'SMS', cell: (c: Customer) => badge(c.smsOptIn ? 'Opt-in' : 'Opt-out', c.smsOptIn ? 'success' : 'neutral') },
    ];
    this.$('#cbody')!.innerHTML = table(cols, list);
    if (!store.customer(this.selected) && list[0]) this.selected = list[0].id;
    const c = store.customer(this.selected);
    if (c) {
      const actions = store.can('customers.manage')
        ? `<div class="flex flex-wrap gap-2">
            <button data-editc="${c.id}" class="btn btn-outline h-8">${icon('edit', 'size-4')}Edit</button>
            <button data-award class="btn btn-outline h-8">Adjust loyalty</button>
            <button data-repay class="btn btn-outline h-8">Repay credit</button>
          </div>`
        : '';
      this.$('#cside')!.innerHTML = `
        <div class="space-y-3">
          <div><p class="text-base font-medium">${esc(c.name)}</p><p class="text-xs text-muted-foreground">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</p></div>
          <dl class="space-y-2">${stat('Loyalty points', c.loyaltyPoints)}${stat('Credit balance', money(c.creditBalance))}${stat('Credit limit', money(c.creditLimit))}${stat('SMS opt-in', c.smsOptIn ? 'Yes' : 'No')}</dl>
          ${actions}
          <p class="text-xs text-muted-foreground">Loyalty awarded 1 point per $10 spent.</p>
        </div>`;
    } else this.$('#cside')!.innerHTML = empty('users', 'No customers');
  }
}
