// Action catalogue and the role/permission matrix (schema: roles, permissions).
//
// Every UI affordance is gated by an action id. Roles are ranked; the matrix
// below is the single source of truth for what a signed-in employee may do, and
// which actions need a second pair of eyes (approvals).

import type { Permission, RoleId } from './types.ts';

export interface ActionMeta {
  id: string;
  label: string;
  group: string;
}

export const ACTIONS: ActionMeta[] = [
  { id: 'sell.create', label: 'Ring up sales', group: 'Selling' },
  { id: 'sell.discount', label: 'Apply a discount', group: 'Selling' },
  { id: 'sell.hold', label: 'Hold and resume a sale', group: 'Selling' },
  { id: 'sell.void', label: 'Void a line or sale', group: 'Selling' },
  { id: 'sale.refund', label: 'Refund a sale', group: 'Selling' },
  { id: 'sales.view', label: 'View sales history', group: 'Selling' },
  { id: 'payment.take', label: 'Take payment', group: 'Payments' },
  { id: 'payment.match', label: 'Match M-Pesa receipts', group: 'Payments' },
  { id: 'catalog.view', label: 'View catalog', group: 'Catalog' },
  { id: 'catalog.manage', label: 'Manage catalog and prices', group: 'Catalog' },
  { id: 'inventory.view', label: 'View inventory', group: 'Inventory' },
  { id: 'inventory.manage', label: 'Adjust stock and counts', group: 'Inventory' },
  { id: 'purchase.manage', label: 'Manage suppliers and orders', group: 'Inventory' },
  { id: 'customers.view', label: 'View customers', group: 'Customers' },
  { id: 'customers.manage', label: 'Manage customers and loyalty', group: 'Customers' },
  { id: 'messaging.manage', label: 'Send campaign messages', group: 'Customers' },
  { id: 'staff.view', label: 'View staff and shifts', group: 'Staff' },
  { id: 'staff.manage', label: 'Manage staff and roles', group: 'Staff' },
  { id: 'shift.open', label: 'Open a shift', group: 'Staff' },
  { id: 'shift.close', label: 'Close a shift and cash up', group: 'Staff' },
  { id: 'cash.move', label: 'Record cash movements', group: 'Staff' },
  { id: 'approval.decide', label: 'Approve or reject requests', group: 'Staff' },
  { id: 'reports.view', label: 'View reports', group: 'Reports' },
  { id: 'reconcile.manage', label: 'Reconcile statements', group: 'Reports' },
  { id: 'dayclose.run', label: 'Close the trading day', group: 'Reports' },
  { id: 'settings.manage', label: 'Change store settings', group: 'Settings' },
  { id: 'devices.manage', label: 'Manage devices and tills', group: 'Settings' },
  { id: 'sync.manage', label: 'Run store sync', group: 'Settings' },
  { id: 'backup.manage', label: 'Run and test backups', group: 'Settings' },
  { id: 'audit.view', label: 'Read the audit log', group: 'Settings' },
];

export const ACTION_GROUPS = [...new Set(ACTIONS.map((a) => a.group))];

const SELLING = ['sell.create', 'sell.discount', 'sell.hold', 'payment.take', 'sales.view', 'catalog.view', 'customers.view'];
const STOCK = ['catalog.view', 'inventory.view', 'inventory.manage', 'purchase.manage', 'customers.view'];
const MANAGER = ACTIONS.map((a) => a.id).filter((a) => a !== 'sync.manage' && a !== 'backup.manage');

const ALLOWED: Record<RoleId, string[]> = {
  owner: ACTIONS.map((a) => a.id),
  manager: MANAGER,
  cashier: SELLING,
  stockkeeper: STOCK,
};

interface Limit { needsApproval: boolean; maxAmount: number | null }

const permissive: Limit = { needsApproval: false, maxAmount: null };

// Actions that a role may take only with sign-off, and the ceiling below which
// no approval is required (money limits are in currency units).
const LIMITS: Record<string, Partial<Record<RoleId, Limit>>> = {
  'sell.discount': { cashier: { needsApproval: true, maxAmount: 5 } },
  'sell.void': { cashier: { needsApproval: true, maxAmount: null } },
  'cash.move': { cashier: { needsApproval: true, maxAmount: 20 } },
};

export const permissionsFor = (roleId: RoleId): Permission[] =>
  ACTIONS.map((a) => {
    const allowed = ALLOWED[roleId].includes(a.id);
    const limit = LIMITS[a.id]?.[roleId] ?? permissive;
    return {
      roleId,
      action: a.id,
      allowed,
      needsApproval: allowed ? limit.needsApproval : false,
      maxAmount: allowed ? limit.maxAmount : null,
    };
  });

export const permissionFor = (roleId: RoleId, action: string): Permission =>
  permissionsFor(roleId).find((p) => p.action === action) ?? {
    roleId,
    action,
    allowed: false,
    needsApproval: false,
    maxAmount: null,
  };

// Whether an action, at some amount, would need a manager's sign-off for a role.
export const needsApproval = (roleId: RoleId, action: string, amount = 0): boolean => {
  const p = permissionFor(roleId, action);
  if (!p.allowed) return true;
  if (!p.needsApproval) return false;
  return p.maxAmount == null || amount > p.maxAmount;
};

export const ACTION_LABEL = (id: string): string => ACTIONS.find((a) => a.id === id)?.label ?? id;
