// View and panel layout metadata shared by the shell, sidebar and panel tabs.

import { store } from './store.ts';

export interface View {
  id: string;
  label: string;
  icon: string;
}

export interface Panel {
  id: string;
  label: string;
}

export const VIEWS: View[] = [
  { id: 'register', label: 'Register', icon: 'cart' },
  { id: 'orders', label: 'Orders', icon: 'receipt' },
  { id: 'inventory', label: 'Inventory', icon: 'box' },
  { id: 'reports', label: 'Reports', icon: 'chart' },
];

export const PANELS: Record<string, Panel[]> = {
  register: [{ id: 'main', label: 'Products' }, { id: 'side', label: 'Sale' }],
  orders: [{ id: 'main', label: 'Orders' }, { id: 'side', label: 'Summary' }],
  inventory: [{ id: 'main', label: 'Products' }, { id: 'side', label: 'Overview' }],
  reports: [{ id: 'main', label: 'Report' }, { id: 'side', label: 'Summary' }],
};

export const panelClass = (id: string): string => `${store.panel === id ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col`;
