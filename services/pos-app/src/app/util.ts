// Shared formatting and date helpers for the POS UI.

let CURRENCY = 'USD';

export const setCurrency = (code: string): void => { CURRENCY = code || 'USD'; };

export const currency = (): string => CURRENCY;

export const money = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY }).format(n);

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string): string => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const DAY = 864e5;

export const fmtTime = (ts: number): string => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const fmtDate = (ts: number): string => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

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

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export const relative = (ts: number, now = Date.now()): string => {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export const initials = (name: string): string =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

export const stat = (label: string, value: string | number, sub = ''): string =>
  `<div class="flex items-baseline justify-between gap-3"><dt class="text-sm text-muted-foreground">${label}</dt><dd class="text-right font-semibold tabular-nums">${value}${sub ? `<span class="mt-0.5 block text-xs font-normal text-muted-foreground">${sub}</span>` : ''}</dd></div>`;
