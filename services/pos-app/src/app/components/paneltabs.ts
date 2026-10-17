// <mocho-paneltabs>: mobile switch between the center and right panels.

import { MochoElement } from '../element.ts';
import { panelsFor } from '../nav.ts';
import { store } from '../store.ts';

export class MochoPanelTabs extends MochoElement {
  build(): void {
    this.className = 'shrink-0 border-t border-sidebar-border bg-sidebar xl:hidden';
    this.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-panel]');
      if (t) store.setPanel((t as HTMLElement).dataset.panel!);
    });
  }
  update(): void {
    const tabs = panelsFor(store.view);
    const n = store.lines().reduce((a, l) => a + l.qty, 0);
    const item = 'flex flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors aria-pressed:bg-accent aria-pressed:text-foreground';
    this.innerHTML = `
        <div class="flex gap-1 p-2" role="tablist" aria-label="Panels">
          ${tabs.map((t) => {
      const badge = t.id === 'side' && store.view === 'sell' && n
        ? ` <span class="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">${n}</span>` : '';
      return `<button data-panel="${t.id}" role="tab" class="${item}" aria-pressed="${store.panel === t.id}">${t.label}${badge}</button>`;
    }).join('')}
        </div>`;
  }
}
