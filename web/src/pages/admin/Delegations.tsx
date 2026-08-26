import { useState } from 'react'
import { ArrowRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { Delegation } from '@/api/iam'
import { useDelegations, useCreateDelegation, useRevokeDelegation, useUsers } from '@/hooks/useIam'

/** Wired to the backend (sys_delegation). A delegation recorded here is now
 * LIVE-enforced by the Workflow approval engine: when a task is assigned to a
 * user with an active delegation covering that date, it routes to the delegate
 * instead, recorded "on behalf of" (V1-WFL-FR-016). */

const statusTone = (s: string): 'success' | 'warning' | 'neutral' =>
  s === 'ACTIVE' ? 'success' : s === 'SCHEDULED' ? 'warning' : 'neutral'

export function DelegationsPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useDelegations()
  const revoke = useRevokeDelegation()
  const rows = data ?? []
  const [open, setOpen] = useState(false)

  function revokeDelegation(d: Delegation) {
    revoke.mutate({ uid: d.uid, version: d.version }, {
      onSuccess: () => toast.success('Delegation revoked', `${d.from_name} → ${d.to_name} ended.`),
      onError: (e) => toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
    })
  }

  const columns: Column<Delegation>[] = [
    { key: 'from_name', header: 'Delegated by', sortable: true, render: (d) => <span className="flex items-center gap-2"><Avatar name={d.from_name} size="sm" /><span className="text-sm text-fg">{d.from_name}</span></span> },
    { key: 'arrow', header: '', width: '32px', render: () => <ArrowRight className="h-3.5 w-3.5 text-fg-subtle" /> },
    { key: 'to_name', header: 'Delegated to', sortable: true, render: (d) => <span className="flex items-center gap-2"><Avatar name={d.to_name} size="sm" /><span className="text-sm text-fg">{d.to_name}</span></span> },
    { key: 'valid_from', header: 'From', sortable: true, width: '120px', render: (d) => formatDate(d.valid_from) },
    { key: 'valid_to', header: 'To', sortable: true, width: '120px', render: (d) => formatDate(d.valid_to) },
    { key: 'reason', header: 'Reason', render: (d) => <span className="text-xs text-fg-muted">{d.reason ?? '—'}</span> },
    { key: 'status', header: 'Status', width: '110px', accessor: (d) => d.status, render: (d) => <Badge tone={statusTone(d.status)} size="sm">{d.status.toLowerCase()}</Badge> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'delegations', 'Delegations', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Delegation of authority"
        description="A delegation transfers approval authority from one user to another for a defined period."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Delegations' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New delegation</Button>}
      />

      <Alert tone="info" className="mb-4" title="Live — enforced by the approval engine">
        Delegations are stored and audited here, and the Workflow approval engine now applies them
        automatically: while a delegation is active, approval tasks that would go to the delegator are
        routed to the delegate instead, recorded as “on behalf of”.
      </Alert>

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load delegations">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(d) => d.uid}
        loading={isLoading}
        searchPlaceholder="Person or reason…"
        onExport={doExport}
        emptyTitle="No delegations yet"
        emptyDescription="Record a delegation of approval authority between two users."
        emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New delegation</Button>}
        rowActions={(d) => (
          <MenuItem label="Revoke" icon={<X />} danger disabled={!d.is_active} onClick={() => revokeDelegation(d)} />
        )}
      />

      <CreateDelegationModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/* ─────────────────────────── Create modal ─────────────────────────── */
function CreateDelegationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const createDel = useCreateDelegation()
  const usersQ = useUsers()
  const users = (usersQ.data ?? []).filter((u) => u.status === 'ACTIVE')
  const [fromUid, setFromUid] = useState('')
  const [toUid, setToUid] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function submit() {
    setErrors({})
    createDel.mutate(
      { from_user_uid: fromUid, to_user_uid: toUid, valid_from: from, valid_to: to, reason: reason.trim() || null },
      {
        onSuccess: () => { toast.success('Delegation created', 'Recorded and audited.'); setFromUid(''); setToUid(''); setFrom(''); setTo(''); setReason(''); onClose() },
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
  const opts = users.map((u) => ({ value: u.uid, label: `${u.full_name} — ${u.login_id}` }))
  const canSubmit = fromUid && toUid && from && to

  return (
    <Modal
      open
      onClose={onClose}
      title="New delegation"
      description="Transfer approval authority for a defined period."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={createDel.isPending} disabled={!canSubmit}>Create delegation</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {users.length < 2 && (
          <Alert tone="warning">A delegation needs two different users — add another user on the Users page first.</Alert>
        )}
        <Select label="Delegate from" required value={fromUid} error={errors.from_user_uid} onChange={(e) => setFromUid(e.target.value)} options={[{ value: '', label: 'Select a user…' }, ...opts]} />
        <Select label="Delegate to" required value={toUid} error={errors.to_user_uid} onChange={(e) => setToUid(e.target.value)} options={[{ value: '', label: 'Select a user…' }, ...opts]} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Valid from" type="date" required value={from} error={errors.valid_from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Valid to" type="date" required value={to} error={errors.valid_to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Textarea label="Reason" value={reason} maxLength={500} placeholder="Annual leave, travel, medical…" onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  )
}
