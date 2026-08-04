import { useState } from 'react'
import { Copy, KeyRound, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatTimeAgo } from '@/lib/format'
import { apiKeys, roles } from '@/mock/data'
import type { ApiKey } from '@/types'

export function ApiKeysPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'api-keys', 'API keys', columnsFromTable(columns), apiKeys)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<string | null>(null)

  const daysToExpiry = (k: ApiKey) =>
    k.expiresAt ? Math.ceil((new Date(k.expiresAt).getTime() - Date.now()) / 86_400_000) : null

  const columns: Column<ApiKey>[] = [
    { key: 'name', header: 'Integration', sortable: true, render: (k) => <span className="font-medium text-fg">{k.name}</span> },
    { key: 'keyPrefix', header: 'Key', width: '150px', render: (k) => <span className="font-mono text-[11px] text-fg-muted">{k.keyPrefix}••••••••</span> },
    { key: 'roleCode', header: 'Permission set', width: '140px', render: (k) => <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{k.roleCode}</span> },
    {
      key: 'ipAllowlist',
      header: 'IP allowlist',
      accessor: (k) => k.ipAllowlist.join(','),
      render: (k) =>
        k.ipAllowlist.length === 0 ? (
          <span className="text-xs text-warning">Unrestricted</span>
        ) : (
          <span className="font-mono text-[10px] text-fg-muted">{k.ipAllowlist.join(', ')}</span>
        ),
    },
    { key: 'rateLimitPerMin', header: 'Rate limit', align: 'right', width: '90px', render: (k) => <span className="tabular">{k.rateLimitPerMin}/min</span> },
    { key: 'callCount', header: 'Calls', align: 'right', sortable: true, width: '90px', render: (k) => <span className="tabular">{k.callCount.toLocaleString('en-IN')}</span> },
    { key: 'lastUsedAt', header: 'Last used', sortable: true, width: '110px', render: (k) => (k.lastUsedAt ? formatTimeAgo(k.lastUsedAt) : '—') },
    {
      key: 'expiresAt',
      header: 'Expires',
      sortable: true,
      width: '130px',
      render: (k) => {
        const d = daysToExpiry(k)
        if (d === null) return <span className="text-xs text-fg-subtle">Never</span>
        return (
          <span className={d <= 30 && d > 0 ? 'text-xs font-medium text-warning' : d <= 0 ? 'text-xs text-danger' : 'text-xs text-fg-muted'}>
            {formatDate(k.expiresAt)}
            {d > 0 && d <= 30 && ` · ${d}d`}
          </span>
        )
      },
    },
    { key: 'status', header: 'Status', width: '100px', render: (k) => <StatusBadge status={k.status} size="sm" /> },
  ]

  const expiringSoon = apiKeys.filter((k) => {
    const d = daysToExpiry(k)
    return k.status === 'ACTIVE' && d !== null && d <= 30
  })

  return (
    <div>
      <PageHeader
        title="API keys"
        description="Machine credentials for integrations. External systems authenticate with scoped API keys, never with user credentials."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'API keys' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Create key</Button>}
      />

      {expiringSoon.length > 0 && (
        <Alert tone="warning" className="mb-4" title={`${expiringSoon.length} key expiring within 30 days`}>
          {expiringSoon.map((k) => k.name).join(', ')} — the owner and system administrators have been
          notified.
        </Alert>
      )}

      <DataTable
        rows={apiKeys}
        columns={columns}
        rowKey={(k) => k.uid}
        searchPlaceholder="Integration name or key prefix…"
        onExport={doExport}
        rowActions={(k) => (
          <>
            <MenuItem label="View usage" onClick={() => toast.info('Usage', `${k.name} has made ${k.callCount.toLocaleString('en-IN')} calls. Per-endpoint usage is not wired in the prototype.`)} />
            <MenuItem label="Edit IP allowlist" onClick={() => toast.info('Edit IP allowlist', k.ipAllowlist.length ? `Currently: ${k.ipAllowlist.join(', ')}.` : 'Currently unrestricted — add CIDRs to restrict this key.')} />
            <MenuItem label="Rotate key" icon={<KeyRound />} onClick={() => toast.warning('Key rotated', 'The new secret is shown once. Update the integration now.')} />
            <MenuItem label="Revoke" icon={<Trash2 />} danger disabled={k.status !== 'ACTIVE'}
              onClick={() => toast.success('Key revoked', 'It stops working immediately.')} />
          </>
        )}
      />

      <Modal
        open={open}
        onClose={() => { setOpen(false); setCreated(null) }}
        title={created ? 'API key created' : 'Create API key'}
        description={created ? 'Copy the secret now — it is never shown again.' : 'The secret is displayed once and stored only as a hash.'}
        footer={
          created ? (
            <Button variant="primary" onClick={() => { setOpen(false); setCreated(null) }}>Done — I have copied it</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setCreated('ssb_live_f3a_9K2mP7qR4tX8vY1zB6nC0dE5gH')}>Create key</Button>
            </>
          )
        }
      >
        {created ? (
          <div className="space-y-3">
            <Alert tone="danger" title="This secret will never be shown again">
              Store it in your secret manager now. If it is lost, the key must be rotated.
            </Alert>
            <div className="flex items-center gap-2 rounded border border-border bg-surface-2 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{created}</code>
              <Button size="sm" variant="outline" icon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => { navigator.clipboard?.writeText(created); toast.success('Copied to clipboard') }}>
                Copy
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <Input label="Integration name" required placeholder="Warehouse robot controller" />
            <Select label="Permission set (role)" required
              options={roles.map((r) => ({ value: r.code, label: `${r.name} (${r.permissions.length} permissions)` }))}
              hint="The key can do exactly what this role can do — nothing more." />
            <Textarea label="IP allowlist" placeholder="10.2.0.0/16&#10;52.66.14.0/24" hint="One CIDR or address per line. Leave blank for unrestricted (not recommended)." />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Rate limit (calls/min)" type="number" defaultValue={200} />
              <Input label="Expires on" type="date" hint="Blank = never expires" />
            </div>
            <Alert tone="info">Every call made with this key is audited under the key identity.</Alert>
          </div>
        )}
      </Modal>
    </div>
  )
}
