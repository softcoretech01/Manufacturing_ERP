import { useState } from 'react'
import { BadgeCheck, Building2, Factory, KeyRound, Package, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Input, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { licenseInfo } from '@/mock/data2'

function UsageBar({
  label,
  used,
  limit,
  icon,
}: {
  label: string
  used: number
  limit: number
  icon: React.ReactNode
}) {
  const pct = limit ? (used / limit) * 100 : 0
  return (
    <div className="card p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium text-fg">
          <span className="text-fg-subtle [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
          {label}
        </span>
        <span className="text-xs text-fg-muted tabular">
          {used} / {limit}
        </span>
      </div>
      <ProgressBar value={pct} tone={pct >= 95 ? 'danger' : pct >= 80 ? 'warning' : 'success'} showLabel />
      {pct >= 80 && (
        <p className="mt-1.5 text-2xs text-warning">
          {pct >= 100 ? 'Limit reached — new records are blocked.' : `${limit - used} remaining.`}
        </p>
      )}
    </div>
  )
}

export function LicensePage() {
  const toast = useToast()
  const [activateOpen, setActivateOpen] = useState(false)
  const [validateOnline, setValidateOnline] = useState(true)
  const L = licenseInfo

  const daysLeft = Math.round((new Date(L.validTo).getTime() - Date.now()) / 86_400_000)
  const enabledModules = L.modules.filter((m) => m.enabled)

  return (
    <div>
      <PageHeader
        title="Licence"
        description="What this installation is entitled to run, and how much of it is actually in use."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & ops' }, { label: 'Licence' }]}
        badge={
          <Badge tone={L.status === 'ACTIVE' ? 'success' : L.status === 'EXPIRING' ? 'warning' : 'danger'}>
            {L.status.toLowerCase()}
          </Badge>
        }
        actions={
          <Button variant="outline" size="sm" icon={<KeyRound className="h-4 w-4" />} onClick={() => setActivateOpen(true)}>
            Apply new key
          </Button>
        }
      />

      {daysLeft <= 60 && daysLeft > 0 && (
        <Alert tone="warning" className="mb-4" title={`Licence expires in ${daysLeft} days`}>
          On expiry the system enters read-only mode: existing data stays fully accessible and
          exportable, but no new documents can be created. Renew before {formatDate(L.validTo)}.
        </Alert>
      )}
      {daysLeft <= 0 && (
        <Alert tone="danger" className="mb-4" title="Licence has expired">
          The system is in read-only mode. Your data is intact and can still be exported in full.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Entitlement usage" description="Limits are enforced on creation, never by deleting existing records" />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <UsageBar label="Named users" used={L.usedUsers} limit={L.namedUsers} icon={<Users />} />
            <UsageBar label="Companies" used={L.usedCompanies} limit={L.companies} icon={<Building2 />} />
            <UsageBar label="Plants" used={L.usedPlants} limit={L.plants} icon={<Factory />} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Licence details" />
          <CardBody>
            <DataGrid
              columns={1}
              items={[
                { label: 'Licensed to', value: L.licensedTo },
                { label: 'Edition', value: L.edition },
                { label: 'Key', value: L.licenseKey, mono: true },
                { label: 'Valid from', value: formatDate(L.validFrom) },
                { label: 'Valid to', value: formatDate(L.validTo) },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Modules"
            description="A disabled module is hidden from navigation and its API endpoints return 403 — it is not merely hidden in the UI."
          />
          <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {L.modules.map((m) => (
              <div
                key={m.code}
                className={
                  m.enabled
                    ? 'flex items-center justify-between gap-2 rounded border border-border p-2.5'
                    : 'flex items-center justify-between gap-2 rounded border border-dashed border-border p-2.5 opacity-60'
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-fg">{m.name}</p>
                  <p className="truncate font-mono text-2xs text-fg-subtle">{m.code}</p>
                </div>
                <Badge tone={m.enabled ? 'success' : 'neutral'} size="sm">
                  {m.enabled ? 'Enabled' : 'Not licensed'}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      

      <Modal
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        title="Apply licence key"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setActivateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Licence applied', 'Entitlements take effect immediately.'); setActivateOpen(false) }}>
              Apply key
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input label="Licence key" required placeholder="SSBERP-XXXX-XXXX-XXXX-XXXX" className="font-mono" />
          <Switch checked={validateOnline} onChange={setValidateOnline} label="Validate against the licensing server" />
          <Alert tone="info">
            Keys are signed offline, so an installation with no internet access can still be
            licensed. Online validation only adds tamper detection and renewal reminders.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
