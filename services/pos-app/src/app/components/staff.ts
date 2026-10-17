// <mocho-staff>: users, roles, permissions, shifts, cash movements, approvals.

import { auth, ROLES } from '../auth.ts';
import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { ACTIONS, ACTION_GROUPS, ACTION_LABEL, permissionsFor } from '../permissions.ts';
import { store } from '../store.ts';
import { badge, checkField, empty, formDialog, inputField, selectField, table, toneForStatus } from '../ui.ts';
import type { RoleId, User } from '../types.ts';
import { esc, fmtDate, fmtTime, money, relative, stat } from '../util.ts';

const roleName = (id: RoleId): string => ROLES.find((r) => r.id === id)?.name ?? id;
const rankOf = (id: RoleId): number => ROLES.find((r) => r.id === id)?.rank ?? 0;

export class MochoStaff extends MochoElement {
  tab = 'team';
  shiftCash = '100.00';
  closeCash = '';
  cashType = 'float';
  cashAmt = '0.00';
  cashNote = '';

  build(): void {
    this.className = 'block h-full';
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col xl:flex" aria-label="Staff">
            <div class="flex flex-col gap-3 p-4 xl:p-6 xl:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-semibold tracking-tight">Staff</h1>
                ${store.can('staff.manage') ? `<button data-addstaff class="btn btn-primary">${icon('plus', 'size-4')}Add employee</button>` : ''}
              </header>
              <div class="flex flex-wrap gap-2">
                ${[['team', 'Team'], ['roles', 'Roles'], ['shifts', 'Shifts'], ['cash', 'Cash movements'], ['approvals', 'Approvals']].map(([v, l]) => `<button data-tab="${v}" class="chip" aria-pressed="${this.tab === v}">${l}</button>`).join('')}
              </div>
            </div>
            <div id="sbody" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 xl:px-6 xl:pb-6"></div>
          </section>
          <aside class="min-h-0 flex-col bg-card xl:flex xl:border-l xl:border-border" aria-label="Summary">
            <header class="border-b border-border p-5"><h2 class="text-base font-semibold tracking-tight">Summary</h2></header>
            <div id="sside" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-5 text-sm"></div>
          </aside>
        </div>`;
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest('[data-tab]') as HTMLElement | null;
      if (tab) { this.tab = tab.dataset.tab!; this.update(); return; }
      if (t.closest('[data-addstaff]')) { this.openEmployeeDialog(null); return; }
      const edit = t.closest('[data-editstaff]') as HTMLElement | null;
      if (edit) { this.openEmployeeDialog(edit.dataset.editstaff!); return; }
      const toggle = t.closest('[data-togglestaff]') as HTMLElement | null;
      if (toggle) {
        const user = auth.staffAt(auth.store.id).find((u) => u.id === toggle.dataset.togglestaff);
        if (user) auth.updateEmployee(user.id, { active: !user.active });
        return;
      }
      if (t.closest('[data-openshift]')) { this.openShift(); return; }
      if (t.closest('[data-closeshift]')) { this.closeShift(); return; }
      if (t.closest('[data-addcash]')) { this.addCash(); return; }
      const app = t.closest('[data-app]') as HTMLElement | null;
      if (app) { store.decideApproval(app.dataset.app!, app.dataset.act === 'approve'); return; }
    });
    this.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'shift-cash') this.shiftCash = t.value;
      if (t.id === 'close-cash') this.closeCash = t.value;
      if (t.id === 'cash-amt') this.cashAmt = t.value;
      if (t.id === 'cash-note') this.cashNote = t.value;
    });
    this.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'cash-type') this.cashType = t.value;
    });
  }

  openShift(): void {
    const cash = Math.max(0, parseFloat(this.shiftCash) || 0);
    store.openShift(cash);
    this.shiftCash = '100.00';
    this.update();
  }

  closeShift(): void {
    const shift = store.currentShift();
    if (!shift) return;
    const expected = shift.openingCash + store.cashSince(shift.openedAt) + store.cashMovesFor(shift.id);
    const raw = this.$('#close-cash') as HTMLInputElement | null;
    const counted = parseFloat(raw?.value ?? this.closeCash) || 0;
    void expected;
    store.closeShift(counted);
    this.closeCash = '';
    this.update();
  }

  addCash(): void {
    const amount = parseFloat(this.cashAmt) || 0;
    if (amount <= 0) return store.toast('Enter an amount above zero');
    store.addCashMovement(this.cashType as 'float', amount, this.cashNote);
    this.cashAmt = '0.00';
    this.cashNote = '';
    this.update();
  }

  openEmployeeDialog(userId: string | null): void {
    const user = userId ? auth.staffAt(auth.store.id).find((u) => u.id === userId) ?? null : null;
    const roles = ROLES.map((r) => ({ value: r.id, label: r.name }));
    const body = `
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${inputField('Name', 'name', { value: user?.name, required: true, attrs: 'maxlength="40"' })}</div>
        ${inputField('Phone', 'phone', { value: user?.phone, attrs: 'inputmode="tel"' })}
        ${selectField('Role', 'role', roles, user?.roleId ?? 'cashier')}
        ${inputField('PIN (4 digits)', 'pin', { value: user?.pin, attrs: 'inputmode="numeric" maxlength="4"' })}
        <div class="self-end pb-2">${checkField('Active', 'active', user?.active !== false)}</div>
      </div>`;
    formDialog(user ? 'Edit employee' : 'Add employee', body, user ? 'Save' : 'Add employee', (f) => {
      const name = (f.get('name') as string).trim();
      const fields = {
        name,
        phone: (f.get('phone') as string).trim(),
        roleId: f.get('role') as RoleId,
        pin: (f.get('pin') as string).trim(),
      };
      if (user) auth.updateEmployee(user.id, { ...fields, pin: fields.pin || user.pin, active: f.get('active') === 'on' });
      else auth.addEmployee(fields);
      store.toast(user ? `${name} updated` : `${name} added`);
    });
  }

  update(): void {
    this.togglePanel('section[aria-label="Staff"]', 'main');
    this.togglePanel('aside[aria-label="Summary"]', 'side');
    this.$$('[data-tab]').forEach((el) => el.setAttribute('aria-pressed', String((el as HTMLElement).dataset.tab === this.tab)));
    const body = this.$('#sbody') as HTMLElement;
    const side = this.$('#sside') as HTMLElement;
    if (this.tab === 'team') { this.renderTeam(body, side); return; }
    if (this.tab === 'roles') { this.renderRoles(body, side); return; }
    if (this.tab === 'shifts') { this.renderShifts(body, side); return; }
    if (this.tab === 'cash') { this.renderCash(body, side); return; }
    this.renderApprovals(body, side);
  }

  private renderTeam(body: HTMLElement, side: HTMLElement): void {
    const manage = store.can('staff.manage');
    const staff = auth.staffAt(auth.store.id)
      .slice()
      .sort((a, b) => rankOf(b.roleId) - rankOf(a.roleId) || a.name.localeCompare(b.name));
    const cols = [
      { label: 'Name', cell: (u: User) => `<div class="font-medium">${esc(u.name)}</div><div class="text-xs text-muted-foreground">${esc(u.phone || '—')}</div>` },
      { label: 'Role', cell: (u: User) => roleName(u.roleId) },
      { label: 'Status', cell: (u: User) => badge(u.active ? 'Active' : 'Inactive', u.active ? 'success' : 'neutral') },
      { label: 'PIN', cell: () => '••••' },
      {
        label: '',
        align: 'right' as const,
        cell: (u: User) => manage ? `<div class="flex justify-end gap-1"><button class="icon-btn" data-editstaff="${u.id}" aria-label="Edit ${esc(u.name)}">${icon('edit', 'size-4')}</button><button class="icon-btn" data-togglestaff="${u.id}" aria-label="${u.active ? 'Disable' : 'Enable'} ${esc(u.name)}">${icon(u.active ? 'x' : 'check', 'size-4')}</button></div>` : '',
      },
    ];
    body.innerHTML = table(cols, staff);
    side.innerHTML = `<dl class="space-y-2">${stat('Team', staff.length)}${stat('Active', staff.filter((s) => s.active).length)}${stat('Signed in', auth.user.name)}</dl>`;
  }

  private renderRoles(body: HTMLElement, side: HTMLElement): void {
    const roles = ROLES.slice().sort((a, b) => b.rank - a.rank);
    body.innerHTML = roles.map((role) => {
      const perms = permissionsFor(role.id);
      const groups = ACTION_GROUPS.map((group) => {
        const items = perms.filter((p) => ACTIONS.find((a) => a.id === p.action)?.group === group);
        if (!items.length) return '';
        return `<div class="rounded-md border border-border p-3">
          <p class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">${esc(group)}</p>
          <ul class="space-y-1.5">${items.map((p) => `
            <li class="flex items-center justify-between gap-3">
              <span class="text-sm">${esc(ACTION_LABEL(p.action))}</span>
              ${badge(p.allowed ? 'Allowed' : 'Denied', p.allowed ? 'success' : 'danger')}
            </li>`).join('')}</ul>
        </div>`;
      }).join('');
      return `<section class="mb-4 rounded-xl border border-border bg-card p-4">
        <div class="flex items-center justify-between">
          <h3 class="font-medium">${esc(role.name)}</h3>
          <span class="text-xs text-muted-foreground">rank ${role.rank} · ${perms.filter((p) => p.allowed).length} allowed</span>
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">${groups}</div>
      </section>`;
    }).join('');
    side.innerHTML = empty('shield', 'Role permissions', 'Roles are ranked; a higher rank can approve a lower rank&rsquo;s requests.');
  }

  private renderShifts(body: HTMLElement, side: HTMLElement): void {
    const shift = store.currentShift();
    const expected = shift ? shift.openingCash + store.cashSince(shift.openedAt) + store.cashMovesFor(shift.id) : 0;
    const openForm = !shift && store.can('shift.open') ? `
      <div class="mb-4 space-y-3 rounded-xl border border-border bg-card p-4">
        <p class="text-sm font-medium">Open a shift</p>
        <label class="block space-y-1.5 text-sm font-medium">Opening cash<input id="shift-cash" class="input tabular-nums" inputmode="decimal" value="${esc(this.shiftCash)}"></label>
        <button data-openshift class="btn btn-primary h-9">${icon('clock', 'size-4')}Open shift</button>
      </div>` : '';
    const closeForm = shift ? `
      <div class="mb-4 space-y-3 rounded-xl border border-border bg-card p-4">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">Current shift — ${esc(store.counter(shift.counterId))}</p>
          ${badge('open', 'warn')}
        </div>
        <dl class="grid gap-2 text-sm sm:grid-cols-2">
          ${stat('Opened by', esc(store.cashier(shift.userId)))}
          ${stat('Opened', `${fmtDate(shift.openedAt)} ${fmtTime(shift.openedAt)}`)}
          ${stat('Opening cash', money(shift.openingCash))}
          ${stat('Cash since open', money(store.cashSince(shift.openedAt)))}
          ${stat('Expected in drawer', money(expected))}
        </dl>
        ${store.can('shift.close') ? `
          <label class="block space-y-1.5 text-sm font-medium">Counted cash<input id="close-cash" class="input tabular-nums" inputmode="decimal" placeholder="${money(expected)}" value="${esc(this.closeCash)}"></label>
          <button data-closeshift class="btn btn-primary h-9">${icon('lock', 'size-4')}Cash up &amp; close</button>` : ''}
      </div>` : '';
    const cols = [
      { label: 'User', cell: (s: { userId: string }) => esc(store.cashier(s.userId)) },
      { label: 'Counter', cell: (s: { counterId: string }) => esc(store.counter(s.counterId)) },
      { label: 'Status', cell: (s: { status: string }) => badge(s.status, toneForStatus(s.status)) },
      { label: 'Opened', cell: (s: { openedAt: number }) => `${fmtDate(s.openedAt)} ${fmtTime(s.openedAt)}` },
      { label: 'Variance', align: 'right' as const, cell: (s: { variance: number | null }) => s.variance == null ? '—' : money(s.variance) },
    ];
    body.innerHTML = openForm + closeForm + table(cols, store.dataset.shifts);
    side.innerHTML = `<dl class="space-y-2">${stat('Shifts', store.dataset.shifts.length)}${stat('Open', store.dataset.shifts.filter((x) => x.status === 'open').length)}${stat('Expected now', shift ? money(expected) : '—')}</dl>`;
  }

  private renderCash(body: HTMLElement, side: HTMLElement): void {
    const form = store.can('cash.move') ? `
      <div class="mb-4 space-y-3 rounded-xl border border-border bg-card p-4">
        <p class="text-sm font-medium">Record a cash movement</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="space-y-1 text-sm">Type
            <select id="cash-type" class="select">
              <option value="float" ${this.cashType === 'float' ? 'selected' : ''}>Float</option>
              <option value="drop" ${this.cashType === 'drop' ? 'selected' : ''}>Drop</option>
              <option value="payout" ${this.cashType === 'payout' ? 'selected' : ''}>Payout</option>
              <option value="payin" ${this.cashType === 'payin' ? 'selected' : ''}>Pay in</option>
            </select>
          </label>
          <label class="space-y-1 text-sm">Amount<input id="cash-amt" class="input tabular-nums" inputmode="decimal" value="${esc(this.cashAmt)}"></label>
          <label class="space-y-1 text-sm sm:col-span-1">Note<input id="cash-note" class="input" placeholder="e.g. Till float adjustment" value="${esc(this.cashNote)}"></label>
        </div>
        <button data-addcash class="btn btn-primary h-9">${icon('plus', 'size-4')}Record</button>
      </div>` : '';
    const cols = [
      { label: 'At', cell: (m: { at: number }) => `${fmtDate(m.at)} ${fmtTime(m.at)}` },
      { label: 'Type', cell: (m: { type: string }) => m.type },
      { label: 'Amount', align: 'right' as const, cell: (m: { amount: number }) => money(m.amount) },
      { label: 'User', cell: (m: { userId: string }) => esc(store.cashier(m.userId)) },
      { label: 'Note', cell: (m: { note: string }) => esc(m.note || '—') },
    ];
    body.innerHTML = form + table(cols, store.dataset.cashMovements);
    const total = store.dataset.cashMovements.reduce((a, m) => a + (m.type === 'payin' || m.type === 'float' ? m.amount : -m.amount), 0);
    side.innerHTML = `<dl class="space-y-2">${stat('Movements', store.dataset.cashMovements.length)}${stat('Net effect', money(total))}</dl>`;
  }

  private renderApprovals(body: HTMLElement, side: HTMLElement): void {
    const canDecide = store.can('approval.decide');
    const cols = [
      { label: 'Action', cell: (a: { action: string }) => esc(ACTION_LABEL(a.action)) },
      { label: 'Reference', cell: (a: { referenceType: string; referenceId: string }) => `${esc(a.referenceType)} ${esc(a.referenceId)}` },
      { label: 'Reason', cell: (a: { reason: string }) => esc(a.reason || '—') },
      { label: 'Requested', cell: (a: { requestedAt: number }) => relative(a.requestedAt) },
      { label: 'Status', cell: (a: { status: string }) => badge(a.status, toneForStatus(a.status)) },
      {
        label: '',
        align: 'right' as const,
        cell: (a: { id: string; status: string }) => a.status === 'pending' && canDecide
          ? `<div class="flex justify-end gap-1"><button data-app="${a.id}" data-act="approve" class="btn btn-outline h-8">Approve</button><button data-app="${a.id}" data-act="reject" class="btn btn-danger h-8">Reject</button></div>`
          : '',
      },
    ];
    body.innerHTML = table(cols, store.dataset.approvals);
    const pending = store.dataset.approvals.filter((a) => a.status === 'pending').length;
    side.innerHTML = `<dl class="space-y-2">${stat('Requests', store.dataset.approvals.length)}${stat('Pending', pending)}${stat('Can decide', canDecide ? 'Yes' : 'No')}</dl>`;
  }
}
