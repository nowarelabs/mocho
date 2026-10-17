// <mocho-app>: auth gate, layout shell and view switching.

import { auth } from '../auth.ts';
import { MochoElement } from '../element.ts';
import { visibleViews } from '../nav.ts';
import { store } from '../store.ts';

export class MochoApp extends MochoElement {
  private wired = false;
  private wasSignedIn = false;

  build(): void {
    this.className = 'flex h-dvh w-full flex-col';
    this.wired = true;
    auth.addEventListener('change', () => this.render());
    const fromHash = (): void => {
      const v = location.hash.slice(1);
      if (visibleViews().some((x) => x.id === v)) store.setView(v);
    };
    addEventListener('hashchange', fromHash);
    fromHash();
    this.render();
  }

  render(): void {
    if (!this.wired) return;
    if (!auth.signedIn) {
      if (this.wasSignedIn) store.reset();
      this.wasSignedIn = false;
      this.innerHTML = '<mocho-login></mocho-login>';
      return;
    }
    this.wasSignedIn = true;
    const views = visibleViews();
    if (!views.some((v) => v.id === store.view)) store.view = views[0]?.id ?? 'sell';
    this.innerHTML = `
      <mocho-appbar></mocho-appbar>
      <div class="flex min-h-0 flex-1 flex-col-reverse xl:flex-row">
        <mocho-sidebar></mocho-sidebar>
        <mocho-paneltabs></mocho-paneltabs>
        <main class="hide-scrollbar min-h-0 min-w-0 flex-1 overflow-hidden bg-muted dark:bg-background">
          ${views.map((v) => `<mocho-${v.id} hidden></mocho-${v.id}>`).join('')}
        </main>
      </div>`;
    this.update();
  }

  update(): void {
    visibleViews().forEach((v) => {
      const el = this.$(`mocho-${v.id}`) as HTMLElement | null;
      if (el) el.hidden = store.view !== v.id;
    });
  }
}
