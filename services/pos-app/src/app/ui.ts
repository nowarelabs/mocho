// Small render helpers shared by the module views. Every helper returns an
// HTML string; the calling component decides where to put it.

import { icon } from './icons.ts';
import { esc } from './util.ts';

export type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-chart-3/15 text-chart-3',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-chart-2/20 text-foreground',
};

export const badge = (text: string, tone: Tone = 'neutral'): string =>
  `<span class="badge ${TONES[tone]}">${esc(text)}</span>`;

export const toneForStatus = (status: string): Tone => {
  switch (status) {
    case 'paid': case 'done': case 'confirmed': case 'received': case 'closed': case 'delivered': case 'sent':
    case 'approved': case 'ok': case 'posted': case 'active':
      return 'success';
    case 'held': case 'pending': case 'draft': case 'partial': case 'requested': case 'queued': case 'running':
    case 'in_transit': case 'open': case 'low':
      return 'warn';
    case 'voided': case 'refunded': case 'cancelled': case 'failed': case 'rejected': case 'reversed':
    case 'fatal': case 'error': case 'unmatched': case 'amount_mismatch':
      return 'danger';
    default:
      return 'neutral';
  }
};

export const kpi = (label: string, value: string | number, sub = ''): string =>
  `<div class="p-5"><p class="text-sm text-muted-foreground">${esc(label)}</p><p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums">${value}</p>${sub ? `<p class="mt-0.5 text-xs text-muted-foreground">${esc(sub)}</p>` : ''}</div>`;

export const kpiGrid = (cells: string[], cols = 4): string => {
  const cls = cols === 4
    ? 'grid grid-cols-2 divide-border rounded-xl border border-border bg-card xl:grid-cols-4 xl:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-border xl:[&>*]:border-b-0 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-border xl:[&>*:nth-child(odd)]:border-r-0'
    : 'grid grid-cols-2 divide-border rounded-xl border border-border bg-card sm:grid-cols-3 xl:grid-cols-6 xl:divide-x';
  return `<div class="${cls}">${cells.join('')}</div>`;
};

export const panel = (title: string, body: string, action = ''): string =>
  `<section class="rounded-xl border border-border bg-card p-5">
    <div class="flex items-center justify-between gap-3">
      <h2 class="font-semibold">${esc(title)}</h2>${action}
    </div>
    <div class="mt-4">${body}</div>
  </section>`;

export const empty = (iconName: string, title: string, sub = ''): string =>
  `<div class="grid place-items-center py-16 text-center">
    <div>
      <div class="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">${icon(iconName)}</div>
      <p class="font-medium">${esc(title)}</p>
      ${sub ? `<p class="mt-1 text-sm text-muted-foreground">${sub}</p>` : ''}
    </div>
  </div>`;

export interface Column<T> {
  label: string;
  align?: 'left' | 'right';
  hide?: string;
  cell: (row: T) => string;
}

export const table = <T>(columns: Column<T>[], rows: T[], emptyRow?: string): string => `
  <div class="w-max min-w-full overflow-clip rounded-xl border border-border bg-card">
    <table class="w-full text-sm">
      <thead class="text-left text-muted-foreground">
        <tr>${columns.map((c) => `
          <th class="sticky top-0 z-10 border-b border-border bg-card px-4 py-3 font-medium whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''} ${c.hide ?? ''}">${esc(c.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map((r) => `<tr class="border-b border-border last:border-b-0">${columns.map((c) => `
          <td class="px-4 py-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.hide ?? ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}">${emptyRow ?? empty('clipboard', 'Nothing to show')}</td></tr>`}
      </tbody>
    </table>
  </div>`;

export const field = (label: string, input: string): string =>
  `<label class="block space-y-1.5 text-sm font-medium">${esc(label)}${input}</label>`;

export const select = (name: string, options: { value: string; label: string }[], value: string, cls = 'select'): string =>
  `<span class="relative block"><select name="${name}" class="${cls}">${options
    .map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
    <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">${icon('chevron', 'size-4')}</span></span>`;

export const money2 = (n: number): string => n.toFixed(2);

// --- modal forms -----------------------------------------------------------

export interface FieldOpts {
  type?: string;
  value?: string | number;
  required?: boolean;
  placeholder?: string;
  attrs?: string;
}

export const inputField = (label: string, name: string, opts: FieldOpts = {}): string =>
  `<label class="block space-y-1.5 text-sm font-medium">${esc(label)}<input name="${esc(name)}" type="${esc(opts.type ?? 'text')}" class="input"${opts.value != null ? ` value="${esc(String(opts.value))}"` : ''}${opts.required ? ' required' : ''}${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ''}${opts.attrs ? ` ${opts.attrs}` : ''}></label>`;

export const selectField = (label: string, name: string, options: { value: string; label: string }[], value = ''): string =>
  `<label class="block space-y-1.5 text-sm font-medium">${esc(label)}${select(name, options, value)}</label>`;

export const checkField = (label: string, name: string, checked: boolean): string =>
  `<label class="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="${esc(name)}" class="size-4"${checked ? ' checked' : ''}> ${esc(label)}</label>`;

/** Open a modal form; onSubmit runs before the dialog closes itself. */
export const formDialog = (title: string, body: string, submitLabel: string, onSubmit: (f: FormData) => void): void => {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `
    <form class="w-[min(28rem,calc(100vw-2rem))] space-y-4 p-6" method="dialog">
      <div class="flex items-start justify-between">
        <h2 class="text-lg font-semibold tracking-tight">${esc(title)}</h2>
        <button type="button" data-close class="icon-btn" aria-label="Close">${icon('x', 'size-4')}</button>
      </div>
      ${body}
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" data-close class="btn btn-outline">Cancel</button>
        <button class="btn btn-primary" value="save">${esc(submitLabel)}</button>
      </div>
    </form>`;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || (e.target as HTMLElement).closest('[data-close]')) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('form')!.addEventListener('submit', (e) => onSubmit(new FormData(e.target as HTMLFormElement)));
  dlg.showModal();
  (dlg.querySelector('input,select,textarea') as HTMLElement | null)?.focus();
};
