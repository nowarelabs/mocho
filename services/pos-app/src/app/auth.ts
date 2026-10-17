// Front-end-only authentication and session state.
//
// Everything here is dummy data standing in for the backend directory that will
// eventually expose the stores, roles, permissions and users tables. The
// session is held in memory and mirrored to localStorage so a reload keeps the
// signed-in employee. No secrets are involved: PINs below are demo values.

import { permissionFor } from './permissions.ts';
import type { Role, RoleId, StoreRow, User } from './types.ts';
import { setCurrency } from './util.ts';

export const STORES: StoreRow[] = [
  { id: 'sto_central', code: 'CENTRAL', name: 'Mocho Central', type: 'flagship', timezone: 'Africa/Nairobi', currency: 'USD', active: true },
  { id: 'sto_west', code: 'WEST', name: 'Mocho Westlands', type: 'branch', timezone: 'Africa/Nairobi', currency: 'USD', active: true },
];

export const ROLES: Role[] = [
  { id: 'owner', name: 'Owner', rank: 40 },
  { id: 'manager', name: 'Manager', rank: 30 },
  { id: 'cashier', name: 'Cashier', rank: 20 },
  { id: 'stockkeeper', name: 'Stock keeper', rank: 20 },
];

export const USERS: User[] = [
  { id: 'usr_grace', storeId: 'sto_central', name: 'Grace Wanjiru', phone: '+254700000001', roleId: 'owner', pin: '1234', active: true },
  { id: 'usr_brian', storeId: 'sto_central', name: 'Brian Otieno', phone: '+254700000002', roleId: 'manager', pin: '2345', active: true },
  { id: 'usr_amina', storeId: 'sto_central', name: 'Amina Yusuf', phone: '+254700000003', roleId: 'cashier', pin: '3456', active: true },
  { id: 'usr_peter', storeId: 'sto_central', name: 'Peter Kamau', phone: '+254700000004', roleId: 'cashier', pin: '3456', active: true },
  { id: 'usr_mary', storeId: 'sto_central', name: 'Mary Njeri', phone: '+254700000005', roleId: 'stockkeeper', pin: '4567', active: true },
  { id: 'usr_david', storeId: 'sto_west', name: 'David Mwangi', phone: '+254700000006', roleId: 'manager', pin: '2345', active: true },
  { id: 'usr_faith', storeId: 'sto_west', name: 'Faith Chebet', phone: '+254700000007', roleId: 'cashier', pin: '3456', active: true },
  { id: 'usr_john', storeId: 'sto_west', name: 'John Odhiambo', phone: '+254700000008', roleId: 'stockkeeper', pin: '4567', active: true },
];

export interface Session {
  userId: string;
  storeId: string;
  signedInAt: number;
}

const KEY = 'mocho-session';

const read = (): Session | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return USERS.some((u) => u.id === s.userId && u.active) ? s : null;
  } catch { return null; }
};

const write = (s: Session | null): void => {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { }
};

export class Auth extends EventTarget {
  session: Session | null = null;
  private attempts = new Map<string, number>();
  private seq = 0;

  constructor() {
    super();
    this.session = read();
    if (this.session) setCurrency(this.store.currency);
  }

  emit(): void { this.dispatchEvent(new Event('change')); }

  get signedIn(): boolean { return this.session != null; }
  get user(): User { return USERS.find((u) => u.id === this.session!.userId)!; }
  get store(): StoreRow { return STORES.find((s) => s.id === this.session!.storeId)!; }
  get role(): Role { return ROLES.find((r) => r.id === this.user.roleId)!; }

  /** Active employees who may sign in at a store. */
  usersAt(storeId: string): User[] { return USERS.filter((u) => u.storeId === storeId && u.active); }

  /** Every employee of a store, active or not, for the staff screen. */
  staffAt(storeId: string): User[] { return USERS.filter((u) => u.storeId === storeId); }

  /** Add an employee to the signed-in store. */
  addEmployee(fields: { name: string; phone?: string; roleId: RoleId; pin: string }): User | null {
    if (!this.can('staff.manage')) return null;
    const name = fields.name.trim();
    if (!name) return null;
    const user: User = {
      id: `usr_${Date.now().toString(36)}${(this.seq++).toString(36)}`,
      storeId: this.store.id, name, phone: fields.phone?.trim() ?? '', roleId: fields.roleId,
      pin: fields.pin.trim() || '0000', active: true,
    };
    USERS.push(user);
    this.emit();
    return user;
  }

  /** Change an employee's name, phone, role, PIN or active flag. */
  updateEmployee(id: string, patch: Partial<Pick<User, 'name' | 'phone' | 'roleId' | 'pin' | 'active'>>): void {
    if (!this.can('staff.manage')) return;
    const user = USERS.find((u) => u.id === id && u.storeId === this.store.id);
    if (!user) return;
    Object.assign(user, patch);
    this.emit();
  }

  /** Employees senior to the signed-in user who may sign off on requests. */
  approvers(): User[] {
    if (!this.session) return [];
    const mine = this.role.rank;
    return USERS.filter((u) => u.storeId === this.store.id && u.active && ROLES.find((r) => r.id === u.roleId)!.rank > mine);
  }

  can(action: string): boolean { return this.session ? permissionFor(this.role.id, action).allowed : false; }

  /** Sign in an employee. Returns an error message, or null on success. */
  signIn(storeId: string, userId: string, pin: string): string | null {
    const user = USERS.find((u) => u.id === userId && u.storeId === storeId);
    if (!user || !user.active) return 'That employee is not active at this store.';
    if (user.pin !== pin.trim()) {
      const fails = (this.attempts.get(user.id) ?? 0) + 1;
      this.attempts.set(user.id, fails);
      return fails >= 3
        ? `Incorrect PIN. ${fails} failed attempts on this device.`
        : 'Incorrect PIN. Please try again.';
    }
    this.attempts.delete(user.id);
    const label = user.name;
    this.session = { userId, storeId, signedInAt: Date.now() };
    setCurrency((STORES.find((s) => s.id === storeId) as StoreRow).currency);
    write(this.session);
    this.emit();
    this.dispatchEvent(new CustomEvent('signin', { detail: label }));
    return null;
  }

  signOut(): void {
    this.session = null;
    write(null);
    this.emit();
  }
}

export const auth = new Auth();
