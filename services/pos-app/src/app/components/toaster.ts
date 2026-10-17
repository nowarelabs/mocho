// <mocho-toaster>: transient toast notifications.

import { MochoElement } from '../element.ts';
import { store } from '../store.ts';

export class MochoToaster extends MochoElement {
  live = false;
  build(): void {
    this.className = 'pointer-events-none fixed right-4 bottom-32 z-50 flex flex-col items-end gap-2 xl:right-6 xl:bottom-6';
    this.setAttribute('aria-live', 'polite');
    store.addEventListener('toast', (e) => {
      const t = document.createElement('div');
      t.className = 'toast rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg';
      t.style.animation = 'pop 0.15s ease-out';
      t.textContent = (e as CustomEvent).detail;
      this.append(t);
      setTimeout(() => t.remove(), 2800);
    });
  }
}
