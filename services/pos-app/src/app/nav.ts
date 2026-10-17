// View and panel layout metadata shared by the shell, sidebar and panel tabs.
// Each view declares the action an employee needs to see it.

import { auth } from './auth.ts';
import { store } from './store.ts';

export interface View {
  id: string;
  label: string;
  icon: string;
  action: string;
}

export interface Panel {
  id: string;
  label: string;
}

export const VIEWS: View[] = [
  { id: 'sell', label: 'Sell', icon: 'cart', action: 'sell.create' },
  { id: 'sales', label: 'Sales', icon: 'receipt', action: 'sales.view' },
  { id: 'catalog', label: 'Catalog', icon: 'tag', action: 'catalog.view' },
  { id: 'inventory', label: 'Inventory', icon: 'box', action: 'inventory.view' },
  { id: 'customers', label: 'Customers', icon: 'users', action: 'customers.view' },
  { id: 'staff', label: 'Staff', icon: 'idcard', action: 'staff.view' },
  { id: 'reports', label: 'Reports', icon: 'chart', action: 'reports.view' },
  { id: 'settings', label: 'Settings', icon: 'settings', action: 'settings.manage' },
];

/** The views the signed-in employee is allowed to open, in menu order. */
export const visibleViews = (): View[] => VIEWS.filter((v) => auth.can(v.action));

export const PANELS: Record<string, Panel[]> = {
  sell: [{ id: 'main', label: 'Products' }, { id: 'side', label: 'Sale' }],
  sales: [{ id: 'main', label: 'Sales' }, { id: 'side', label: 'Summary' }],
  catalog: [{ id: 'main', label: 'Products' }, { id: 'side', label: 'Details' }],
  inventory: [{ id: 'main', label: 'Stock' }, { id: 'side', label: 'Overview' }],
  customers: [{ id: 'main', label: 'Customers' }, { id: 'side', label: 'Profile' }],
  staff: [{ id: 'main', label: 'Team' }, { id: 'side', label: 'Summary' }],
  reports: [{ id: 'main', label: 'Report' }, { id: 'side', label: 'Summary' }],
  settings: [{ id: 'main', label: 'Settings' }, { id: 'side', label: 'Operations' }],
};

export const panelsFor = (view: string): Panel[] => PANELS[view] ?? PANELS.sell;

export const panelClass = (id: string): string => `${store.panel === id ? 'flex' : 'hidden xl:flex'} min-h-0 flex-col`;
