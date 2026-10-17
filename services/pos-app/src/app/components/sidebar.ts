// <mocho-sidebar>: primary view navigation, filtered by permission.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { visibleViews } from '../nav.ts';
import { store } from '../store.ts';

export class MochoSidebar extends MochoElement {
  build(): void {
    this.className = 'shrink-0 border-t border-sidebar-border bg-sidebar xl:w-60 xl:border-t-0 xl:border-r';
    this.addEventListener('click', (e) => {
      const nav = (e.target as HTMLElement).closest('[data-view]') as HTMLElement | null;
      if (nav) { location.hash = nav.dataset.view!; store.setView(nav.dataset.view!); }
    });
  }
  update(): void {
    const item = 'flex flex-1 xl:flex-none cursor-pointer flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-2 xl:flex-row xl:gap-3 xl:px-3 xl:py-2.5 xl:text-sm aria-[current=page]:bg-accent aria-[current=page]:text-foreground';
    this.innerHTML = `
        <nav class="hide-scrollbar flex h-full w-full gap-1 overflow-x-auto overflow-y-hidden p-2 xl:flex-col xl:overflow-visible xl:p-4" aria-label="Main">
          ${visibleViews().map((v) => `
            <button data-view="${v.id}" class="${item}" ${store.view === v.id ? 'aria-current="page"' : ''}>
              ${icon(v.icon)}<span>${v.label}</span>
            </button>`).join('')}
        </nav>`;
  }
}
