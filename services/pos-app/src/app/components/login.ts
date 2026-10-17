// <mocho-login>: store + employee + PIN sign-in against the dummy directory.

import { auth, STORES, ROLES } from '../auth.ts';
import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { esc, initials } from '../util.ts';

export class MochoLogin extends MochoElement {
  live = false;
  storeId = STORES[0].id;
  userId: string | null = null;
  pin = '';
  error = '';

  build(): void {
    this.className = 'block min-h-dvh w-full';
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const pickStore = t.closest('[data-store]') as HTMLElement | null;
      if (pickStore) { this.storeId = pickStore.dataset.store!; this.userId = null; this.pin = ''; this.error = ''; return this.render(); }
      const pickUser = t.closest('[data-user]') as HTMLElement | null;
      if (pickUser) { this.userId = pickUser.dataset.user!; this.pin = ''; this.error = ''; return this.render(); }
      const key = t.closest('[data-key]') as HTMLElement | null;
      if (key) {
        const k = key.dataset.key!;
        if (k === 'back') this.pin = this.pin.slice(0, -1);
        else if (k === 'clear') this.pin = '';
        else if (this.pin.length < 4) this.pin += k;
        this.error = '';
        return this.render();
      }
      if (t.closest('[data-signin]')) this.submit();
    });
    this.render();
  }

  users() { return auth.usersAt(this.storeId); }

  submit(): void {
    if (!this.userId) { this.error = 'Choose the employee signing in.'; return this.render(); }
    if (this.pin.length < 4) { this.error = 'Enter the four-digit PIN.'; return this.render(); }
    const err = auth.signIn(this.storeId, this.userId, this.pin);
    if (err) { this.error = err; this.pin = ''; this.render(); }
  }

  render(): void {
    const users = this.users();
    const selected = users.find((u) => u.id === this.userId);
    const storeOpts = STORES.filter((s) => s.active).map((s) => `
      <button data-store="${s.id}" class="flex-1 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors ${s.id === this.storeId ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}" aria-pressed="${s.id === this.storeId}">${esc(s.name)}</button>`).join('');
    const userRows = users.map((u) => {
      const role = ROLES.find((r) => r.id === u.roleId)!.name;
      const on = u.id === this.userId;
      return `
        <button data-user="${u.id}" class="flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors ${on ? 'border-foreground bg-accent' : 'border-border hover:bg-accent'}" aria-pressed="${on}">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">${esc(initials(u.name))}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">${esc(u.name)}</span>
            <span class="block text-xs text-muted-foreground">${esc(role)}</span>
          </span>
          ${on ? `<span class="text-foreground">${icon('check', 'size-4')}</span>` : ''}
        </button>`;
    }).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'clear'].map((k) => {
      if (k === 'back') return `<button data-key="back" class="btn btn-outline h-14 text-base" aria-label="Backspace">${icon('minus', 'size-5')}</button>`;
      if (k === 'clear') return `<button data-key="clear" class="btn btn-outline h-14 text-base" aria-label="Clear">Clear</button>`;
      return `<button data-key="${k}" class="btn btn-outline h-14 text-lg tabular-nums">${k}</button>`;
    }).join('');
    const dots = Array.from({ length: 4 }, (_, i) => `<span class="size-3 rounded-full ${i < this.pin.length ? 'bg-primary' : 'bg-border'}"></span>`).join('');

    this.innerHTML = `
      <div class="grid min-h-dvh place-items-center bg-muted p-4 dark:bg-background">
        <div class="w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div class="grid xl:grid-cols-2">
            <div class="border-b border-border p-6 xl:border-r xl:border-b-0 xl:p-8">
              <div class="flex items-center gap-2.5">
                <span class="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">M</span>
                <div>
                  <p class="text-lg font-semibold tracking-tight">Mocho</p>
                  <p class="text-xs text-muted-foreground">Point of sale</p>
                </div>
              </div>
              <div class="mt-6 space-y-4">
                <div>
                  <p class="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">Store</p>
                  <div class="flex gap-1 rounded-md bg-muted p-1" role="group" aria-label="Choose store">${storeOpts}</div>
                </div>
                <div>
                  <p class="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">Who is signing in?</p>
                  <div class="space-y-2">${userRows}</div>
                </div>
              </div>
            </div>
            <div class="flex flex-col p-6 xl:p-8">
              <p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">Enter PIN</p>
              <p class="mt-1 text-sm text-muted-foreground">${selected ? `${esc(selected.name)} · ${esc(ROLES.find((r) => r.id === selected.roleId)!.name)}` : 'Select an employee first'}</p>
              <div class="mt-4 flex items-center justify-center gap-3" aria-label="PIN entry">${dots}</div>
              ${this.error ? `<p class="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">${esc(this.error)}</p>` : ''}
              <div class="mt-5 grid grid-cols-3 gap-2">${keys}</div>
              <button data-signin class="btn btn-primary mt-5 h-12 w-full text-base" ${selected && this.pin.length === 4 ? '' : 'disabled'}>${icon('lock', 'size-4')}Sign in</button>
              <p class="mt-4 text-center text-xs text-muted-foreground">Demo directory. ${selected ? `PIN for ${esc(selected.name.split(' ')[0])} is ${esc(selected.pin)}.` : 'Pick an employee to see their demo PIN.'}</p>
            </div>
          </div>
        </div>
      </div>`;
  }
}
