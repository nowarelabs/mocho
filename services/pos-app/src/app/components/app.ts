// <mocho-app>: layout shell and view switching.

import { MochoElement } from '../element.ts';
import { VIEWS } from '../nav.ts';
import { store } from '../store.ts';

export class MochoApp extends MochoElement {
  build(): void {
    this.className = 'flex h-dvh w-full flex-col';
    this.innerHTML = `
        <mocho-appbar></mocho-appbar>
        <div class="flex min-h-0 flex-1 flex-col-reverse xl:flex-row">
          <mocho-sidebar></mocho-sidebar>
          <mocho-paneltabs></mocho-paneltabs>
          <main class="hide-scrollbar min-h-0 min-w-0 flex-1 overflow-hidden bg-muted dark:bg-background">
            <mocho-register hidden></mocho-register>
            <mocho-orders hidden></mocho-orders>
            <mocho-inventory hidden></mocho-inventory>
            <mocho-reports hidden></mocho-reports>
          </main>
        </div>`;
    const fromHash = (): void => {
      const v = location.hash.slice(1);
      if (VIEWS.some((x) => x.id === v)) store.setView(v);
    };
    addEventListener('hashchange', fromHash);
    fromHash();
  }
  update(): void {
    VIEWS.forEach((v) => { (this.$(`mocho-${v.id}`) as HTMLElement).hidden = store.view !== v.id; });
  }
}
