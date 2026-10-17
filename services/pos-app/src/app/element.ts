// Base element: light DOM so Tailwind utilities and design tokens apply everywhere.
// Subclasses implement build() once and update() on every store change.

import { store } from './store.ts';

export class MochoElement extends HTMLElement {
  live = true;
  private _ready = false;
  private _h?: () => void;

  connectedCallback(): void {
    if (!this._ready) { this._ready = true; this.build?.(); }
    this.update?.();
    if (this.live) {
      this._h = () => this.update?.();
      store.addEventListener('change', this._h);
    }
  }
  disconnectedCallback(): void { if (this._h) store.removeEventListener('change', this._h); }
  build?(): void;
  update?(): void;
  $(sel: string): Element | null { return this.querySelector(sel); }
  togglePanel(sel: string, id: string): void {
    const el = this.$(sel);
    if (!el) return;
    el.classList.toggle('hidden', store.panel !== id);
    el.classList.toggle('flex', store.panel === id);
  }
}
