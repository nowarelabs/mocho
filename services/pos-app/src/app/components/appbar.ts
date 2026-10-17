// <mocho-appbar>: brand header + theme toggle.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';

export class MochoAppbar extends MochoElement {
  live = false;
  build(): void {
    this.className = 'flex shrink-0 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 md:px-6';
    this.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-theme]')) {
        const dark = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('mocho-theme', dark ? 'dark' : 'light'); } catch { }
        this.update();
      }
    });
    let saved: string | null = null;
    try { saved = localStorage.getItem('mocho-theme'); } catch { }
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  }
  update(): void {
    const dark = document.documentElement.classList.contains('dark');
    this.innerHTML = `
        <div class="flex items-center gap-2.5">
          <span class="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">M</span>
          <span class="text-lg font-semibold tracking-tight">Mocho</span>
        </div>
        <button data-theme class="icon-btn" aria-label="Switch to ${dark ? 'light' : 'dark'} mode">${icon(dark ? 'sun' : 'moon', 'size-4')}</button>`;
  }
}
