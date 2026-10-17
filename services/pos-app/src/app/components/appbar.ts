// <mocho-appbar>: brand, store, shift status, employee menu and theme toggle.

import { auth, ROLES } from '../auth.ts';
import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { esc, initials, money } from '../util.ts';

export class MochoAppbar extends MochoElement {
  menuOpen = false;

  build(): void {
    this.className = 'flex shrink-0 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 py-2.5 xl:px-6';
    let saved: string | null = null;
    try { saved = localStorage.getItem('mocho-theme'); } catch { }
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-theme]')) {
        const isDark = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('mocho-theme', isDark ? 'dark' : 'light'); } catch { }
        return this.update();
      }
      if (t.closest('[data-menu-toggle]')) { this.menuOpen = !this.menuOpen; return this.update(); }
      if (t.closest('[data-signout]')) { this.menuOpen = false; return auth.signOut(); }
      if (t.closest('[data-shift]')) { this.menuOpen = false; return void (location.hash = '#staff'); }
      this.menuOpen = false;
    });
  }

  update(): void {
    const dark = document.documentElement.classList.contains('dark');
    const { user, store: row } = auth;
    const role = ROLES.find((r) => r.id === user.roleId)!.name;
    const shift = store.currentShift();
    const shiftChip = shift
      ? `<button data-shift class="badge bg-chart-3/15 text-chart-3" title="Cash in drawer">${icon('clock', 'size-3.5')} Shift open</button>`
      : `<button data-shift class="badge bg-amber-500/15 text-amber-700 dark:text-amber-400">${icon('clock', 'size-3.5')} No shift</button>`;
    this.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">M</span>
        <div class="leading-tight">
          <span class="text-base font-semibold tracking-tight">Mocho</span>
          <span class="hidden text-xs text-muted-foreground sm:block">${esc(row.name)} · ${esc(row.type === 'flagship' ? 'Flagship' : 'Branch')}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="hidden sm:inline-flex">${shiftChip}</span>
        <button data-theme class="icon-btn" aria-label="Switch to ${dark ? 'light' : 'dark'} mode">${icon(dark ? 'sun' : 'moon', 'size-4')}</button>
        <div class="relative">
          <button data-menu-toggle class="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background py-1 pr-2 pl-1 transition-colors hover:bg-accent" aria-haspopup="menu" aria-expanded="${this.menuOpen}">
            <span class="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">${esc(initials(user.name))}</span>
            <span class="hidden text-left leading-tight sm:block">
              <span class="block text-sm font-medium">${esc(user.name)}</span>
              <span class="block text-xs text-muted-foreground">${esc(role)}</span>
            </span>
            <span class="text-muted-foreground">${icon('chevron', 'size-4')}</span>
          </button>
          ${this.menuOpen ? `
            <div class="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg" role="menu">
              <div class="border-b border-border p-3">
                <p class="text-sm font-medium">${esc(user.name)}</p>
                <p class="text-xs text-muted-foreground">${esc(role)} · ${esc(user.phone)}</p>
              </div>
              <dl class="space-y-1 p-3 text-sm">
                <div class="flex justify-between"><dt class="text-muted-foreground">Store</dt><dd>${esc(row.name)}</dd></div>
                <div class="flex justify-between"><dt class="text-muted-foreground">Shift</dt><dd>${shift ? esc(money(shift.openingCash)) + ' float' : 'Closed'}</dd></div>
              </dl>
              <button data-signout class="flex w-full cursor-pointer items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm font-medium text-destructive hover:bg-destructive/10" role="menuitem">${icon('logout', 'size-4')}Sign out</button>
            </div>` : ''}
        </div>
      </div>`;
  }
}
