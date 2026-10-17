// <mocho-sidebar>: primary view navigation.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { VIEWS } from '../nav.ts';
import { store } from '../store.ts';

export class MochoSidebar extends MochoElement {
  build(): void {
    this.className = 'shrink-0 border-t border-sidebar-border bg-sidebar md:w-60 md:border-t-0 md:border-r';
    this.addEventListener('click', (e) => {
      const nav = (e.target as HTMLElement).closest('[data-view]') as HTMLElement | null;
      if (nav) { location.hash = nav.dataset.view!; store.setView(nav.dataset.view!); }
    });
  }
  update(): void {
    const item = 'flex flex-1 md:flex-none cursor-pointer flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-2 md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-sm aria-[current=page]:bg-accent aria-[current=page]:text-foreground';
    this.innerHTML = `
        <nav class="flex h-full gap-1 p-2 md:flex-col md:p-4" aria-label="Main">
          ${VIEWS.map((v) => `
            <button data-view="${v.id}" class="${item}" ${store.view === v.id ? 'aria-current="page"' : ''}>
              ${icon(v.icon)}<span>${v.label}</span>
            </button>`).join('')}
        </nav>`;
  }
}
