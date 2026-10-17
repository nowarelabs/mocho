// Shared formatting and date helpers for the POS UI.

export const money = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export const round2 = (n: number): number => Math.round(n * 100) / 100;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string): string => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const DAY = 864e5;

export const fmtTime = (ts: number): string => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const dayLabel = (ts: number): string => {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

export const hourLabel = (h: number): string => (h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`);

export const parseDay = (s: string): number => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

export const dateValue = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const stat = (label: string, value: string | number, sub = ''): string =>
  `<div class="flex items-baseline justify-between gap-3"><dt class="text-sm text-muted-foreground">${label}</dt><dd class="text-right font-semibold tabular-nums">${value}${sub ? `<span class="mt-0.5 block text-xs font-normal text-muted-foreground">${sub}</span>` : ''}</dd></div>`;
