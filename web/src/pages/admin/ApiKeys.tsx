import { useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatTimeAgo } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { ApiKey } from '@/api/iam'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useIam'
import { useRoles } from '@/hooks/useIam'

/** Wired to the live backend. The secret is generated server-side, shown once,
 * and stored only as a SHA-256 hash. A key's permissions are those of its role.
 * (IP allowlists / rate limits / key-based request auth are future enhancements —
 * the key management itself is real.) */

const statusTone = (s: string): 'success' | 'neutral' | 'danger' =>
  s === 'ACTIVE' ? 'success' : s === 'REVOKED' ? 'danger' : 'neutral'

export function ApiKeysPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useApiKeys()
  const revoke = useRevokeApiKey()
  const keys = data ?? []
  const [open, setOpen] = useState(false)

  function revokeKey(k: ApiKey) {
    revoke.mutate(k.uid, {
      onSuccess: () => toast.success('Key revoked', `${k.name} stops working immediately.`),
      onError: (e) => toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Could not revoke.'),
    })
  }

  const columns: Column<ApiKey>[] = [
    { key: 'name', header: 'Integration', sortable: true, render: (k) => <span className="font-medium text-fg">{k.name}</span> },
    { key: 'prefix', header: 'Key', width: '170px', render: (k) => <span className="font-mono text-[11px] text-fg-muted">{k.prefix}…</span> },
    { key: 'role_code', header: 'Permission set', width: '150px', render: (k) => k.role_code ? <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{k.role_code}</span> : <span className="text-2xs text-warning">no role</span> },
    { key: 'last_used_at', header: 'Last used', sortable: true, width: '120px', render: (k) => (k.last_used_at ? formatTimeAgo(k.last_used_at) : '—') },
    { key: 'expires_at', header: 'Expires', sortable: true, width: '130px', render: (k) => (k.expires_at ? formatDate(k.expires_at) : <span className="text-xs text-fg-subtle">Never</span>) },
    { key: 'status', header: 'Status', width: '110px', accessor: (k) => k.status, render: (k) => <Badge tone={statusTone(k.status)} size="sm">{k.status.toLowerCase()}</Badge> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'api-keys', 'API keys', columnsFromTable(columns), keys)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="API keys"
        description="Machine credentials for integrations. External systems authenticate with scoped API keys, never with user credentials."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'API keys' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Create key</Button>}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load API keys">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <DataTable
        rows={keys}
        columns={columns}
        rowKey={(k) => k.uid}
        loading={isLoading}
        searchPlaceholder="Integration name or key prefix…"
        onExport={doExport}
        emptyTitle="No API keys yet"
        emptyDescription="Create a key to let an external system call the API with a scoped credential."
        emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Create key</Button>}
        rowActions={(k) => (
          <MenuItem label="Revoke" icon={<Trash2 />} danger disabled={k.status !== 'ACTIVE'} onClick={() => revokeKey(k)} />
        )}
      />

      <CreateKeyModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/* ─────────────────────────── Create modal ─────────────────────────── */
function CreateKeyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const createKey = useCreateApiKey()
  const rolesQ = useRoles()
  const allRoles = rolesQ.data ?? []
  const [name, setName] = useState('')
  const [roleUid, setRoleUid] = useState('')
  const [expires, setExpires] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setName(''); setRoleUid(''); setExpires(''); setSecret(null); setErrors({})
  }
  function close() { reset(); onClose() }

  function submit() {
    setErrors({})
    createKey.mutate(
      { name: name.trim(), role_uid: roleUid || null, expires_at: expires || null },
      {
        onSuccess: (k) => { setSecret(k.secret); toast.success('API key created', 'Copy the secret now — it is shown once.') },
        onError: (e) => {
          if (e instanceof ProblemError) {
            const fe: Record<string, string> = {}
            for (const x of e.problem.errors ?? []) fe[x.field] = x.message
            setErrors(fe)
            toast.error(e.problem.title || 'Create failed', e.problem.detail)
          } else toast.error('Create failed', 'Unknown error.')
        },
      },
    )
  }

  if (!open) return null

  return (
    <Modal
      open
      onClose={close}
      title={secret ? 'API key created' : 'Create API key'}
      description={secret ? 'Copy the secret now — it is never shown again.' : 'The secret is displayed once and stored only as a hash.'}
      footer={
        secret ? (
          <Button variant="primary" onClick={close}>Done — I have copied it</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={createKey.isPending} disabled={!name.trim()}>Create key</Button>
          </>
        )
      }
    >
      {secret ? (
        <div className="space-y-3">
          <Alert tone="danger" title="This secret will never be shown again">
            Store it in your secret manager now. If it is lost, revoke this key and create a new one.
          </Alert>
          <div className="flex items-center gap-2 rounded border border-border bg-surface-2 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{secret}</code>
            <Button size="sm" variant="outline" icon={<Copy className="h-3.5 w-3.5" />}
              onClick={() => { navigator.clipboard?.writeText(secret); toast.success('Copied to clipboard') }}>Copy</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          <Input label="Integration name" required value={name} error={errors.name} maxLength={150}
            placeholder="Warehouse robot controller" onChange={(e) => setName(e.target.value)} />
          <Select label="Permission set (role)" value={roleUid} error={errors.role_uid}
            hint="The key can do exactly what this role can do — nothing more."
            onChange={(e) => setRoleUid(e.target.value)}
            options={[{ value: '', label: '— no role (no permissions) —' }, ...allRoles.map((r) => ({ value: r.uid, label: `${r.name} (${r.permission_count} permissions)` }))]} />
          <Input label="Expires on" type="date" value={expires} hint="Blank = never expires"
            onChange={(e) => setExpires(e.target.value)} />
          <Alert tone="info">The secret is generated on the server and stored only as a SHA-256 hash — nobody can retrieve it later.</Alert>
        </div>
      )}
    </Modal>
  )
}
