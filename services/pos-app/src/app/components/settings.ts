// <mocho-settings>: store, devices, endpoints, SMS, sync, backups, audit.

import { MochoElement } from '../element.ts';
import { icon } from '../icons.ts';
import { store } from '../store.ts';
import { badge, formDialog, inputField, selectField, table, toneForStatus } from '../ui.ts';
import type { BackupRun, Counter, Device, Endpoint, Setting, SmsCampaign, SmsTemplate } from '../types.ts';
import { esc, fmtDate, fmtTime, relative, stat } from '../util.ts';

export class MochoSettings extends MochoElement {
  tab = 'store';

  build(): void {
    this.className = 'block h-full';
    this.innerHTML = `
        <div class="grid h-full grid-cols-1 grid-rows-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section class="min-h-0 flex-col xl:flex" aria-label="Settings">
            <div class="flex flex-col gap-3 p-4 xl:p-6 xl:pb-4">
              <header class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
                <span id="set-action" class="contents"></span>
              </header>
              <div class="flex flex-wrap gap-2">
                ${[['store', 'Store'], ['devices', 'Devices'], ['sms', 'SMS'], ['sync', 'Sync'], ['backups', 'Backups'], ['audit', 'Audit']].map(([v, l]) => `<button data-stab="${v}" class="chip" aria-pressed="${this.tab === v}">${l}</button>`).join('')}
              </div>
            </div>
            <div id="setbody" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 xl:px-6 xl:pb-6"></div>
          </section>
          <aside class="min-h-0 flex-col bg-card xl:flex xl:border-l xl:border-border" aria-label="Operations">
            <header class="border-b border-border p-5"><h2 class="text-base font-semibold tracking-tight">Operations</h2></header>
            <div id="setside" class="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-5 text-sm"></div>
          </aside>
        </div>`;
    this.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest('[data-stab]') as HTMLElement | null;
      if (tab) { this.tab = tab.dataset.stab!; this.update(); return; }
      if (t.closest('[data-addset]')) { this.openSettingDialog(); return; }
      const dev = t.closest('[data-toggledevice]') as HTMLElement | null;
      if (dev) { store.toggleDevice(dev.dataset.toggledevice!); return; }
      const end = t.closest('[data-toggleendpoint]') as HTMLElement | null;
      if (end) { store.toggleEndpoint(end.dataset.toggleendpoint!); return; }
      const ctr = t.closest('[data-togglecounter]') as HTMLElement | null;
      if (ctr) { store.toggleCounter(ctr.dataset.togglecounter!); return; }
      if (t.closest('[data-addcounter]')) { this.openCounterDialog(); return; }
      const tpl = t.closest('[data-toggletpl]') as HTMLElement | null;
      if (tpl) { store.toggleTemplate(tpl.dataset.toggletpl!); return; }
      if (t.closest('[data-addcmp]')) { this.openCampaignDialog(); return; }
      const cmp = t.closest('[data-togglcmp]') as HTMLElement | null;
      if (cmp) { store.toggleCampaign(cmp.dataset.togglcmp!); return; }
      if (t.closest('[data-sync]')) { store.syncNow(); return; }
      if (t.closest('[data-backup]')) { store.runBackup('snapshot'); return; }
      if (t.closest('[data-restore-test]')) { store.runBackup('restore_test'); return; }
    });
  }

  private headerAction(): string {
    if (this.tab === 'store' && store.can('settings.manage')) return `<button data-addset class="btn btn-primary">${icon('plus', 'size-4')}Add setting</button>`;
    if (this.tab === 'devices' && store.can('devices.manage')) return `<button data-addcounter class="btn btn-primary">${icon('plus', 'size-4')}Add counter</button>`;
    if (this.tab === 'sms' && store.can('messaging.manage')) return `<button data-addcmp class="btn btn-primary">${icon('plus', 'size-4')}New campaign</button>`;
    if (this.tab === 'sync' && store.can('sync.manage')) return `<button data-sync class="btn btn-primary">${icon('refresh', 'size-4')}Sync now</button>`;
    if (this.tab === 'backups' && store.can('backup.manage')) return `<div class="flex gap-2"><button data-restore-test class="btn btn-outline">${icon('shield', 'size-4')}Test restore</button><button data-backup class="btn btn-primary">${icon('download', 'size-4')}Snapshot</button></div>`;
    return '';
  }

  openSettingDialog(): void {
    const body = `<div class="grid grid-cols-2 gap-3">
      <div class="col-span-2">${inputField('Key', 'key', { required: true, attrs: 'maxlength="60"' })}</div>
      <div class="col-span-2">${inputField('Value', 'value', { required: true, attrs: 'maxlength="120"' })}</div>
    </div>`;
    formDialog('Add setting', body, 'Save setting', (f) => {
      const key = (f.get('key') as string).trim();
      if (key) store.setSetting(key, (f.get('value') as string).trim());
    });
  }

  openCounterDialog(): void {
    const body = `<div class="grid grid-cols-2 gap-3">
      <div class="col-span-2">${inputField('Name', 'name', { required: true, attrs: 'maxlength="30"' })}</div>
      ${inputField('Receipt prefix', 'prefix', { attrs: 'maxlength="8"' })}
    </div>`;
    formDialog('Add counter', body, 'Add counter', (f) => {
      const name = (f.get('name') as string).trim();
      if (name) { store.addCounter({ name, receiptPrefix: (f.get('prefix') as string).trim() }); store.toast(`${name} added`); }
    });
  }

  openCampaignDialog(): void {
    const templates = store.dataset.smsTemplates.map((t) => ({ value: t.id, label: t.name }));
    if (!templates.length) return store.toast('No message templates available');
    const body = `<div class="grid grid-cols-2 gap-3">
      <div class="col-span-2">${inputField('Name', 'name', { required: true, attrs: 'maxlength="40"' })}</div>
      <div class="col-span-2">${selectField('Template', 'templateId', templates, templates[0].value)}</div>
      ${inputField('Pace per minute', 'pace', { type: 'number', value: 30, attrs: 'min="1" step="1"' })}
    </div>`;
    formDialog('New SMS campaign', body, 'Create campaign', (f) => {
      const name = (f.get('name') as string).trim();
      const templateId = (f.get('templateId') as string).trim();
      if (name && templateId) { store.createCampaign({ name, templateId, pacePerMinute: Math.max(1, Math.floor(Number(f.get('pace')) || 30)) }); store.toast(`${name} created`); }
    });
  }

  update(): void {
    this.togglePanel('section[aria-label="Settings"]', 'main');
    this.togglePanel('aside[aria-label="Operations"]', 'side');
    this.$$('[data-stab]').forEach((el) => el.setAttribute('aria-pressed', String((el as HTMLElement).dataset.stab === this.tab)));
    this.$('#set-action')!.innerHTML = this.headerAction();
    const body = this.$('#setbody') as HTMLElement;
    const side = this.$('#setside') as HTMLElement;
    if (this.tab === 'store') { this.renderStore(body, side); return; }
    if (this.tab === 'devices') { this.renderDevices(body, side); return; }
    if (this.tab === 'sms') { this.renderSms(body, side); return; }
    if (this.tab === 'sync') { this.renderSync(body, side); return; }
    if (this.tab === 'backups') { this.renderBackups(body, side); return; }
    this.renderAudit(body, side);
  }

  private renderStore(body: HTMLElement, side: HTMLElement): void {
    const cols = [
      { label: 'Key', cell: (s: Setting) => `<span class="font-medium">${esc(s.key)}</span>` },
      { label: 'Value', cell: (s: Setting) => esc(s.value) },
      { label: 'Source', cell: (s: Setting) => badge(s.source === 'head_office' ? 'Head office' : 'Local', s.source === 'head_office' ? 'info' : 'neutral') },
    ];
    body.innerHTML = table(cols, store.dataset.settings);
    side.innerHTML = `<dl class="space-y-2">${stat('Store', esc(store.storeId))}${stat('Settings', store.dataset.settings.length)}${stat('Locale', esc(store.dataset.settings.find((s) => s.key === 'locale')?.value ?? '—'))}</dl>`;
  }

  private renderDevices(body: HTMLElement, side: HTMLElement): void {
    const can = store.can('devices.manage');
    const dcols = [
      { label: 'Device', cell: (d: Device) => `<span class="font-medium">${esc(d.label)}</span><div class="text-xs text-muted-foreground">v${esc(d.appVersion)}</div>` },
      { label: 'Battery', cell: (d: Device) => `${d.batteryPct}%`, align: 'right' as const },
      { label: 'Signal', cell: (d: Device) => String(d.signalLevel), align: 'right' as const },
      { label: 'Last seen', cell: (d: Device) => relative(d.lastSeenAt) },
      { label: 'Status', cell: (d: Device) => badge(d.enabled ? 'Enabled' : 'Disabled', d.enabled ? 'success' : 'neutral') },
      { label: '', align: 'right' as const, cell: (d: Device) => can ? `<button data-toggledevice="${d.id}" class="icon-btn" aria-label="${d.enabled ? 'Disable' : 'Enable'} ${esc(d.label)}">${icon(d.enabled ? 'x' : 'check', 'size-4')}</button>` : '' },
    ];
    body.innerHTML = table(dcols, store.dataset.devices);
    const ecols = [
      { label: 'Type', cell: (e: Endpoint) => esc(e.type) },
      { label: 'Number', cell: (e: Endpoint) => esc(e.number) },
      { label: 'Device', cell: (e: Endpoint) => esc(store.device(e.deviceId)?.label ?? e.deviceId) },
      { label: 'Status', cell: (e: Endpoint) => badge(e.enabled ? 'Enabled' : 'Disabled', e.enabled ? 'success' : 'neutral') },
      { label: '', align: 'right' as const, cell: (e: Endpoint) => can ? `<button data-toggleendpoint="${e.id}" class="icon-btn" aria-label="${e.enabled ? 'Disable' : 'Enable'} endpoint">${icon(e.enabled ? 'x' : 'check', 'size-4')}</button>` : '' },
    ];
    const ccols = [
      { label: 'Counter', cell: (c: Counter) => `${esc(c.name)} <span class="text-xs text-muted-foreground">#${c.number}</span>` },
      { label: 'Prefix', cell: (c: Counter) => esc(c.receiptPrefix) },
      { label: 'Status', cell: (c: Counter) => badge(c.enabled ? 'Enabled' : 'Disabled', c.enabled ? 'success' : 'neutral') },
      { label: '', align: 'right' as const, cell: (c: Counter) => can ? `<button data-togglecounter="${c.id}" class="icon-btn" aria-label="${c.enabled ? 'Disable' : 'Enable'} ${esc(c.name)}">${icon(c.enabled ? 'x' : 'check', 'size-4')}</button>` : '' },
    ];
    side.innerHTML = `
      <h3 class="mb-2 text-xs font-semibold uppercase text-muted-foreground">Endpoints</h3>${table(ecols, store.dataset.endpoints)}
      <h3 class="mt-4 mb-2 text-xs font-semibold uppercase text-muted-foreground">Counters</h3>${table(ccols, store.dataset.counters)}`;
  }

  private renderSms(body: HTMLElement, side: HTMLElement): void {
    const can = store.can('messaging.manage');
    const tcols = [
      { label: 'Template', cell: (t: SmsTemplate) => esc(t.name) },
      { label: 'Purpose', cell: (t: SmsTemplate) => esc(t.purpose) },
      { label: 'Active', cell: (t: SmsTemplate) => badge(t.active ? 'Yes' : 'No', t.active ? 'success' : 'neutral') },
      { label: '', align: 'right' as const, cell: (t: SmsTemplate) => can ? `<button data-toggletpl="${t.id}" class="icon-btn" aria-label="${t.active ? 'Disable' : 'Enable'} ${esc(t.name)}">${icon(t.active ? 'x' : 'check', 'size-4')}</button>` : '' },
    ];
    const ccols = [
      { label: 'Campaign', cell: (c: SmsCampaign) => esc(c.name) },
      { label: 'Status', cell: (c: SmsCampaign) => badge(c.status, toneForStatus(c.status)) },
      { label: 'Pace', cell: (c: SmsCampaign) => `${c.pacePerMinute}/min`, align: 'right' as const },
      { label: '', align: 'right' as const, cell: (c: SmsCampaign) => can && (c.status === 'running' || c.status === 'paused') ? `<button data-togglcmp="${c.id}" class="btn btn-outline h-8">${c.status === 'running' ? 'Pause' : 'Resume'}</button>` : '' },
    ];
    const mcols = [
      { label: 'To', cell: (m: { phone: string }) => esc(m.phone) },
      { label: 'Purpose', cell: (m: { purpose: string }) => esc(m.purpose) },
      { label: 'Status', cell: (m: { status: string }) => badge(m.status, toneForStatus(m.status)) },
      { label: 'At', cell: (m: { at: number }) => relative(m.at) },
    ];
    body.innerHTML = `
      <h3 class="mb-2 text-sm font-medium">Templates</h3>${table(tcols, store.dataset.smsTemplates)}
      <h3 class="mt-4 mb-2 text-sm font-medium">Campaigns</h3>${table(ccols, store.dataset.smsCampaigns)}
      <h3 class="mt-4 mb-2 text-sm font-medium">Outbox</h3>${table(mcols, store.dataset.smsOutbox)}`;
    side.innerHTML = `<dl class="space-y-2">${stat('Templates', store.dataset.smsTemplates.length)}${stat('Queued', store.dataset.smsOutbox.filter((m) => m.status === 'queued').length)}${stat('Sent', store.dataset.smsOutbox.filter((m) => m.status === 'sent' || m.status === 'delivered').length)}</dl>`;
  }

  private renderSync(body: HTMLElement, side: HTMLElement): void {
    const cols = [
      { label: 'Peer', cell: (p: { peer: string }) => esc(p.peer) },
      { label: 'Last seq', cell: (p: { lastSeqSent: number }) => String(p.lastSeqSent), align: 'right' as const },
      { label: 'Last success', cell: (p: { lastSuccessAt: number | null }) => (p.lastSuccessAt ? relative(p.lastSuccessAt) : '—') },
      { label: 'Error', cell: (p: { lastError: string | null }) => (p.lastError ? `<span class="text-destructive">${esc(p.lastError)}</span>` : '—') },
    ];
    body.innerHTML = table(cols, store.dataset.syncPeers);
    side.innerHTML = `<dl class="space-y-2">${stat('Peers', store.dataset.syncPeers.length)}${stat('Can sync', store.can('sync.manage') ? 'Yes' : 'No')}</dl>`;
  }

  private renderBackups(body: HTMLElement, side: HTMLElement): void {
    const cols = [
      { label: 'Kind', cell: (b: BackupRun) => esc(b.kind) },
      { label: 'Status', cell: (b: BackupRun) => badge(b.status, toneForStatus(b.status)) },
      { label: 'Location', cell: (b: BackupRun) => esc(b.location) },
      { label: 'Size (MB)', cell: (b: BackupRun) => (b.sizeBytes / 1e6).toFixed(1), align: 'right' as const },
      { label: 'Started', cell: (b: BackupRun) => `${fmtDate(b.startedAt)} ${fmtTime(b.startedAt)}` },
    ];
    body.innerHTML = table(cols, store.dataset.backupRuns);
    const last = store.dataset.backupRuns[0];
    side.innerHTML = `<dl class="space-y-2">${stat('Runs', store.dataset.backupRuns.length)}${stat('Last run', last ? relative(last.startedAt) : '—')}${stat('Last status', last ? last.status : '—')}</dl>`;
  }

  private renderAudit(body: HTMLElement, side: HTMLElement): void {
    const cols = [
      { label: 'When', cell: (a: { at: number }) => relative(a.at) },
      { label: 'Action', cell: (a: { action: string }) => esc(a.action) },
      { label: 'Entity', cell: (a: { entityType: string; entityId: string | null }) => esc(a.entityType + (a.entityId ? ` ${a.entityId}` : '')) },
      { label: 'User', cell: (a: { userId: string | null }) => esc(a.userId ?? '—') },
      { label: 'Detail', cell: (a: { detail: string }) => esc(a.detail) },
    ];
    body.innerHTML = table(cols, store.dataset.auditLog);
    side.innerHTML = `<dl class="space-y-2">${stat('Entries', store.dataset.auditLog.length)}</dl>`;
  }
}
