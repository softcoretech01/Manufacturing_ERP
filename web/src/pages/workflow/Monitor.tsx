import { useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, Avatar, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useUsers } from '@/hooks/useIam'
import { useInstances, useInstanceDetail, useAdminReassign } from '@/hooks/useWorkflow'
import type { Instance } from '@/api/workflow'

/**
 * Workflow monitor (SRS S-WFL-07). Wired to `core_workflow_instance`.
 * Administrators can reassign or view; approving is still the approver's job.
 */
const STATUS_TABS = [
  { id: 'IN_PROGRESS', label: 'In flight' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'RETURNED', label: 'Returned' },
]

export function WorkflowMonitorPage() {
  const toast = useToast()
  const [tab, setTab] = useState('IN_PROGRESS')
  const [detailUid, setDetailUid] = useState<string | null>(null)
  const [reassign, setReassign] = useState<Instance | null>(null)

  const { data, isLoading, error, refetch } = useInstances(tab)
  const rows = data ?? []
  const overdue = rows.filter((r) => r.overdue)

  function doExport(format: ExportFormat) {
    const n = exportRows(format, 'workflow-monitor', 'Workflow monitor', columnsFromTable(columns), rows)
    toast.success('Export ready', `${n} rows written.`)
  }

  const columns: Column<Instance>[] = [
    {
      key: 'document_no', header: 'Document', sortable: true, width: '190px', sticky: true,
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium text-fg">{t.document_no}</p>
          <p className="truncate text-2xs text-fg-subtle">{t.document_label}</p>
        </div>
      ),
    },
    { key: 'subject', header: 'Subject', render: (t) => <span className="truncate text-xs">{t.subject}</span> },
    { key: 'amount', header: 'Value', align: 'right', sortable: true, width: '120px', accessor: (t) => t.amount ?? 0, render: (t) => (t.amount == null ? <span className="text-fg-subtle">—</span> : formatCurrency(t.amount)) },
    {
      key: 'level', header: 'Stage', width: '170px', accessor: (t) => t.current_level ?? 0,
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{t.current_level_name ?? (t.status !== 'IN_PROGRESS' ? '—' : '')}</p>
          <ProgressBar value={t.current_level ? (t.current_level - 1) / t.total_levels : 1} max={1} height="h-1" className="mt-1" tone="brand" />
          <p className="mt-0.5 text-2xs text-fg-subtle">{t.current_level ? `level ${t.current_level} of ${t.total_levels}` : `${t.total_levels} levels`}</p>
        </div>
      ),
    },
    { key: 'requester', header: 'Raised by', width: '150px', render: (t) => (
      <span className="flex items-center gap-1.5"><Avatar name={t.requester ?? '?'} size="xs" /><span className="truncate text-xs">{t.requester}</span></span>
    ) },
    { key: 'sla', header: 'SLA', width: '110px', accessor: (t) => (t.overdue ? 0 : 1), render: (t) => (
      t.status !== 'IN_PROGRESS' ? <span className="text-2xs text-fg-subtle">—</span> :
      <Badge tone={t.overdue ? 'danger' : 'success'} size="sm">{t.overdue ? 'Breached' : 'On track'}</Badge>
    ) },
    { key: 'status', header: 'Status', width: '140px', render: (t) => <StatusBadge status={t.status === 'IN_PROGRESS' ? 'PENDING_APPROVAL' : t.status} size="sm" /> },
    { key: 'warn', header: '', width: '40px', align: 'center', accessor: (t) => (t.overdue ? 1 : 0), render: (t) => (t.overdue ? <span className="inline-flex text-danger"><AlertTriangle className="h-3.5 w-3.5" /></span> : null) },
  ]

  return (
    <div>
      <PageHeader
        title="Workflow monitor"
        description="Every approval currently in flight across the company. Administrators can see and reassign work that is stuck — approving it is still the approver's job."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Workflow' }, { label: 'Monitor' }]}
        actions={<Button variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>Refresh</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={STATUS_TABS.map((s) => ({ id: s.id, label: s.label, count: s.id === tab ? rows.length : undefined }))} />}
      />

      {error && <Alert tone="danger" title="Could not load instances">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}
      {tab === 'IN_PROGRESS' && overdue.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${overdue.length} approval${overdue.length > 1 ? 's have' : ' has'} breached its SLA`}>
          Escalation follows the path configured on the approval rule — nothing is ever approved by the passage of time.
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.uid}
        loading={isLoading}
        searchPlaceholder="Document no, subject or requester…"
        onRowClick={(t) => setDetailUid(t.uid)}
        onExport={doExport}
        rowClassName={(t) => (t.overdue ? 'bg-danger/[0.03]' : undefined)}
        rowActions={(t) => (
          <>
            <MenuItem label="Open" onClick={() => setDetailUid(t.uid)} />
            {t.status === 'IN_PROGRESS' && t.current_task_uid && (
              <MenuItem label="Reassign approver" icon={<UserCog className="h-3.5 w-3.5" />} onClick={() => setReassign(t)} />
            )}
          </>
        )}
        emptyTitle="Nothing here"
        emptyDescription={tab === 'IN_PROGRESS' ? 'No approvals in flight. They appear once a document is submitted for approval.' : 'No instances in this state.'}
      />

      <InstanceDrawer uid={detailUid} onClose={() => setDetailUid(null)} onReassign={(inst) => { setReassign(inst); setDetailUid(null) }} />
      <ReassignModal instance={reassign} onClose={() => setReassign(null)} />

      <p className="mt-4 text-2xs text-fg-subtle">Instances refresh every 30 seconds.</p>
    </div>
  )
}

function InstanceDrawer({ uid, onClose, onReassign }: { uid: string | null; onClose: () => void; onReassign: (i: Instance) => void }) {
  const { data, isLoading } = useInstanceDetail(uid ?? undefined)
  const inst = data?.instance
  return (
    <Drawer open={!!uid} onClose={onClose} title={inst?.document_no ?? undefined} description={inst?.subject ?? undefined} width="max-w-xl"
      footer={inst && inst.status === 'IN_PROGRESS' && inst.current_task_uid ? (
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-2xs text-fg-subtle">Administrators may route work, not decide it.</span>
          <Button variant="outline" size="sm" onClick={() => onReassign(inst)}>Reassign</Button>
        </div>
      ) : undefined}
    >
      {isLoading && <p className="text-sm text-fg-muted">Loading…</p>}
      {data && inst && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={inst.status === 'IN_PROGRESS' ? 'PENDING_APPROVAL' : inst.status} />
            {inst.overdue && <Badge tone="danger">SLA breached</Badge>}
            {inst.amount != null && <span className="text-xs text-fg-muted">{formatCurrency(inst.amount)}</span>}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-fg">Levels</p>
            <ol className="space-y-1.5">
              {data.tasks.map((t) => (
                <li key={t.uid} className="flex items-center gap-3 rounded border border-border bg-surface-2 p-2">
                  <span className="text-2xs font-semibold text-fg-subtle">L{t.level_no}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-fg">{t.level_name} · {t.assignee}{t.on_behalf_of && <span className="text-fg-subtle"> (for {t.on_behalf_of})</span>}</p>
                    {t.comments && <p className="truncate text-2xs text-fg-muted">{t.comments}</p>}
                  </div>
                  <Badge tone={t.status === 'APPROVED' ? 'success' : t.status === 'REJECTED' ? 'danger' : t.status === 'PENDING' ? 'pending' : 'neutral'} size="sm">{t.status.toLowerCase()}</Badge>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-fg">History</p>
            <ol className="space-y-0">
              {data.history.map((h) => (
                <li key={h.sequence_no} className="relative flex gap-3 pb-3 last:pb-0">
                  <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-border-strong ring-2 ring-surface" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-fg">{h.event_type.replace(/_/g, ' ').toLowerCase()}{h.level_no ? ` · L${h.level_no}` : ''}</p>
                    <p className="text-2xs text-fg-muted">{h.user_name}{h.created_at && ` · ${formatDateTime(h.created_at)}`}</p>
                    {h.comments && <p className="mt-0.5 rounded bg-surface-2 px-2 py-1 text-2xs text-fg-muted">{h.comments}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Drawer>
  )
}

function ReassignModal({ instance, onClose }: { instance: Instance | null; onClose: () => void }) {
  const toast = useToast()
  const usersQ = useUsers()
  const reassign = useAdminReassign()
  const [toUid, setToUid] = useState('')
  const [reason, setReason] = useState('')

  const users = useMemo(() => (usersQ.data ?? []).filter((u) => u.status === 'ACTIVE'), [usersQ.data])
  if (!instance) return null

  function submit() {
    if (!instance!.current_task_uid) return
    if (!toUid || !reason.trim()) { toast.error('Both fields required', 'Pick an approver and give a reason.'); return }
    reassign.mutate(
      { uid: instance!.uid, body: { task_uid: instance!.current_task_uid, to_user_uid: toUid, reason: reason.trim() } },
      {
        onSuccess: () => { toast.success('Reassigned', 'The new approver has been notified and the trail records who reassigned it.'); setToUid(''); setReason(''); onClose() },
        onError: (e) => toast.error('Reassign failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
      },
    )
  }

  return (
    <Modal open onClose={onClose} title="Reassign approver" description={`${instance.document_no} · ${instance.current_level_name ?? ''}`} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="primary" loading={reassign.isPending} onClick={submit}>Reassign</Button></>}>
      <div className="space-y-3.5">
        <Select label="New approver" required value={toUid} onChange={(e) => setToUid(e.target.value)}
          options={[{ value: '', label: 'Select a user…' }, ...users.map((u) => ({ value: u.uid, label: `${u.full_name} — ${u.login_id}` }))]} />
        <Textarea label="Justification" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded on the audit trail against your name." />
        <Alert tone="warning">Reassignment is an administrative override. It is written to the audit log with your user id, the original approver and this justification.</Alert>
      </div>
    </Modal>
  )
}
