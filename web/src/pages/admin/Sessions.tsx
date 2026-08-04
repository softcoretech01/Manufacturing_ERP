import { useState } from 'react'
import { LogOut, Monitor, Plus, ScanLine, Smartphone, Tablet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { MenuItem } from '@/components/ui/Menu'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { plants, sessions } from '@/mock/data'
import type { Session } from '@/types'

const DEVICES = [
  { uid: 'dev-01', code: 'HH-014', name: 'Line A handheld', type: 'HANDHELD', plant: 'Plant 1 — Sriperumbudur', platform: 'Zebra TC26 / Android 13', pinLogin: true, lastSeen: 'now', registered: true },
  { uid: 'dev-02', code: 'HH-015', name: 'Line B handheld', type: 'HANDHELD', plant: 'Plant 1 — Sriperumbudur', platform: 'Zebra TC26 / Android 13', pinLogin: true, lastSeen: '12m ago', registered: true },
  { uid: 'dev-03', code: 'KSK-01', name: 'Press shop kiosk', type: 'KIOSK', plant: 'Plant 1 — Sriperumbudur', platform: 'Android 12 tablet', pinLogin: true, lastSeen: '3m ago', registered: true },
  { uid: 'dev-04', code: 'KSK-02', name: 'Coating shop kiosk', type: 'KIOSK', plant: 'Plant 1 — Sriperumbudur', platform: 'Android 12 tablet', pinLogin: true, lastSeen: '2h ago', registered: true },
  { uid: 'dev-05', code: 'TB-QC-01', name: 'QC inspection tablet', type: 'TABLET', plant: 'Plant 1 — Sriperumbudur', platform: 'iPad / iPadOS 18', pinLogin: false, lastSeen: '41m ago', registered: true },
  { uid: 'dev-06', code: 'HH-021', name: 'FG store handheld', type: 'HANDHELD', plant: 'Plant 1 — Sriperumbudur', platform: 'TSC Alpha-30R / Android 11', pinLogin: true, lastSeen: '6h ago', registered: true },
  { uid: 'dev-07', code: 'HH-030', name: 'Hosur store handheld', type: 'HANDHELD', plant: 'Plant 2 — Hosur', platform: 'Zebra TC22 / Android 13', pinLogin: true, lastSeen: '1d ago', registered: true },
  { uid: 'dev-08', code: 'HH-031', name: 'Unassigned spare', type: 'HANDHELD', plant: '—', platform: 'Zebra TC22 / Android 13', pinLogin: false, lastSeen: 'never', registered: false },
]

export function SessionsPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'sessions-devices', 'Sessions & devices', columnsFromTable(columns), sessions)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('sessions')
  const [regOpen, setRegOpen] = useState(false)
  const [shopUnlimited, setShopUnlimited] = useState(true)
  const [notifyNewDevice, setNotifyNewDevice] = useState(true)
  const [invalidateFamily, setInvalidateFamily] = useState(true)
  const [regPinLogin, setRegPinLogin] = useState(true)

  const columns: Column<Session>[] = [
    {
      key: 'userName',
      header: 'User',
      sortable: true,
      render: (s) => (
        <span className="flex items-center gap-2">
          <Avatar name={s.userName} size="sm" />
          <span className="text-sm text-fg">{s.userName}</span>
        </span>
      ),
    },
    {
      key: 'device',
      header: 'Device',
      sortable: true,
      render: (s) => (
        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
          {s.channel === 'MOBILE' ? <Smartphone className="h-3.5 w-3.5" /> : s.channel === 'KIOSK' ? <Tablet className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
          {s.device}
        </span>
      ),
    },
    { key: 'channel', header: 'Channel', sortable: true, width: '90px', render: (s) => <Badge tone={s.channel === 'PORTAL' ? 'warning' : 'neutral'} size="sm" dot={false}>{s.channel}</Badge> },
    { key: 'ipAddress', header: 'IP address', width: '120px', render: (s) => <span className="font-mono text-[11px]">{s.ipAddress}</span> },
    { key: 'location', header: 'Location', width: '130px' },
    { key: 'startedAt', header: 'Started', sortable: true, width: '140px', render: (s) => formatDateTime(s.startedAt) },
    {
      key: 'lastActivityAt',
      header: 'Last active',
      sortable: true,
      width: '110px',
      render: (s) => (s.isCurrent ? <Badge tone="success" size="sm">This session</Badge> : <span className="text-xs text-fg-muted">{formatTimeAgo(s.lastActivityAt)}</span>),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Sessions & devices"
        description="Live sessions across web, mobile, kiosk and portal — and the registry of shop-floor devices permitted to accept PIN or badge login."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Sessions & devices' }]}
        actions={
          tab === 'devices' ? (
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRegOpen(true)}>Register device</Button>
          ) : (
            <Button variant="danger" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => toast.warning('All sessions terminated', 'Every user except you must sign in again.')}>
              Terminate all
            </Button>
          )
        }
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'sessions', label: 'Active sessions', count: sessions.length },
            { id: 'devices', label: 'Device registry', count: DEVICES.length },
            { id: 'policy', label: 'Session policy' },
          ]} />
        }
      />

      {tab === 'sessions' && (
        <>
          <DataTable
            rows={sessions}
            columns={columns}
            rowKey={(s) => s.uid}
            searchPlaceholder="User, device or IP…"
            onExport={doExport}
            rowActions={(s) => (
              <>
                <MenuItem label="View user" onClick={() => toast.info('View user', `Open the profile for ${s.userName}.`)} />
                <MenuItem label="Sign out this session" icon={<LogOut />} danger disabled={s.isCurrent}
                  onClick={() => toast.success('Session terminated', `${s.userName} was signed out of ${s.device}.`)} />
              </>
            )}
          />
        </>
      )}

      {tab === 'devices' && (
        <>
          <Alert tone="info" className="mb-4" title="Why devices are registered">
            Shop-floor PIN and badge login only works on a device registered to that plant. This keeps
            a low-friction credential bound to a physical location, while every transaction is still
            attributed to the individual operator — never to a shared account.
          </Alert>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {DEVICES.map((d) => (
              <Card key={d.uid}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-fg">{d.code}</span>
                        <Badge tone={d.registered ? 'success' : 'warning'} size="sm">
                          {d.registered ? 'Registered' : 'Unregistered'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-fg-muted">{d.name}</p>
                    </div>
                    <span className="shrink-0 rounded bg-surface-3 p-1.5 text-fg-subtle">
                      {d.type === 'KIOSK' ? <Tablet className="h-4 w-4" /> : d.type === 'TABLET' ? <Tablet className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1 text-2xs">
                    <div className="flex justify-between"><dt className="text-fg-subtle">Plant</dt><dd className="text-fg-muted">{d.plant}</dd></div>
                    <div className="flex justify-between"><dt className="text-fg-subtle">Platform</dt><dd className="text-fg-muted">{d.platform}</dd></div>
                    <div className="flex justify-between"><dt className="text-fg-subtle">PIN login</dt><dd className={d.pinLogin ? 'text-success' : 'text-fg-subtle'}>{d.pinLogin ? 'Enabled' : 'Disabled'}</dd></div>
                    <div className="flex justify-between"><dt className="text-fg-subtle">Last seen</dt><dd className="text-fg-muted">{d.lastSeen}</dd></div>
                  </dl>
                  <div className="mt-3 flex gap-1.5">
                    <Button size="xs" variant="outline" className="flex-1" onClick={() => toast.info('Edit device', `${d.code} — ${d.name}. Device configuration.`)}>Edit</Button>
                    <Button size="xs" variant="ghost" className="flex-1" onClick={() => toast.success('Label queued', 'ZPL sent to the RM Store printer.')}>Print label</Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'policy' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Session lifetime" />
            <CardBody className="space-y-3.5">
              <Input label="Idle timeout (minutes)" type="number" defaultValue={30} hint="A warning appears 2 minutes before expiry with an extend option." />
              <Input label="Absolute session lifetime (hours)" type="number" defaultValue={12} />
              <Input label="Mobile re-authentication (hours)" type="number" defaultValue={12} hint="Biometric unlock is permitted in the interim." />
              <Input label="Shop-floor kiosk auto-lock (minutes)" type="number" defaultValue={5} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Concurrency" />
            <CardBody className="space-y-3.5">
              <Input label="Max concurrent sessions — internal user" type="number" defaultValue={3} />
              <Input label="Max concurrent sessions — portal user" type="number" defaultValue={1} />
              <Select label="When the limit is exceeded" defaultValue="evict"
                options={[{ value: 'evict', label: 'Evict the oldest session' }, { value: 'block', label: 'Block the new login' }]} />
              <Switch checked={shopUnlimited} onChange={setShopUnlimited} label="Shop-floor devices: unlimited concurrent sessions" />
              <Switch checked={notifyNewDevice} onChange={setNotifyNewDevice} label="Notify the user by email on login from a new device" />
              <Switch checked={invalidateFamily} onChange={setInvalidateFamily} label="Invalidate the whole session family if a refresh token is reused" />
              <Alert tone="warning" className="mt-2">
                Refresh-token reuse means the token was stolen. Invalidating the family and raising a
                security alert is the correct response — do not disable this.
              </Alert>
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={regOpen}
        onClose={() => setRegOpen(false)}
        size="sm"
        title="Register a device"
        description="Only registered devices may accept PIN or badge login."
        footer={
          <>
            <Button variant="outline" onClick={() => setRegOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Device registered'); setRegOpen(false) }}>Register</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input label="Device code" required placeholder="HH-032" hint="Printed on the physical device label." />
          <Input label="Device name" required placeholder="Line C handheld" />
          <Select label="Device type" required options={[{ value: 'HANDHELD', label: 'Handheld scanner' }, { value: 'TABLET', label: 'Tablet' }, { value: 'KIOSK', label: 'Fixed kiosk' }, { value: 'PHONE', label: 'Phone' }]} />
          <Select label="Plant" required options={plants.map((p) => ({ value: p.uid, label: p.name }))} />
          <Switch checked={regPinLogin} onChange={setRegPinLogin} label="Allow PIN / badge login on this device" />
        </div>
      </Modal>
    </div>
  )
}
