import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { DataGrid } from '@/components/ui/Card'
import { Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useInbox, useDecide, useReasonCodes } from '@/hooks/useWorkflow'
import type { InboxTask } from '@/api/workflow'

/**
 * Approval queue (SRS S-WFL-03). Wired to the real engine: the list is this
 * user's `core_workflow_task` rows. Approve advances the workflow to the next
 * level automatically; reject/return need a reason code (V1-WFL-BR-005).
 */
export function ApprovalInboxPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const reasonsQ = useReasonCodes()
  const reasons = reasonsQ.data ?? []
  const { data, isLoading, error, refetch } = useInbox(true) // include done for the "Decided" tab
  const decide = useDecide()
  const rows = data ?? []

  const [tab, setTab] = useState('pending')
  const [detail, setDetail] = useState<InboxTask | null>(null)
  const [approving, setApproving] = useState<InboxTask | null>(null)
  const [rejecting, setRejecting] = useState<InboxTask | null>(null)
  const [reasonCode, setReasonCode] = useState('')
  const [note, setNote] = useState('')

  const pending = rows.filter((t) => t.status === 'PENDING')
  const counts = {
    pending: pending.length,
    overdue: pending.filter((t) => t.overdue).length,
    done: rows.filter((t) => t.status !== 'PENDING').length,
  }
  const visible = rows.filter((t) => {
    if (tab === 'overdue') return t.status === 'PENDING' && t.overdue
    if (tab === 'done') return t.status !== 'PENDING'
    return t.status === 'PENDING'
  })

  function approve(t: InboxTask) {
    decide.mutate(
      { taskUid: t.task_uid, body: { action: 'APPROVE', comments: note.trim() || null } },
      {
        onSuccess: (inst) => {
          const done = inst.status === 'APPROVED'
          toast.success(
            done ? 'Approved' : `Approved — level ${t.level_no} of ${t.total_levels}`,
            done ? `${t.document_no} is fully approved.` : `${t.document_no} moves to level ${(inst.current_level ?? t.level_no)} automatically.`,
          )
          setApproving(null); setDetail(null); setNote('')
        },
        onError: (e) => toast.error('Approve failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
      },
    )
  }

  function reject(t: InboxTask) {
    if (!reasonCode) { toast.error('Reason required', 'Choose a reason code.'); return }
    decide.mutate(
      { taskUid: t.task_uid, body: { action: 'REJECT', reason_code: reasonCode, comments: note.trim() || null } },
      {
        onSuccess: () => {
          toast.success('Rejected', `${t.document_no} sent back to ${t.requester ?? 'the requester'}.`)
          setRejecting(null); setDetail(null); setNote(''); setReasonCode('')
        },
        onError: (e) => toast.error('Reject failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
      },
    )
  }

  const columns: Column<InboxTask>[] = [
    { key: 'document_no', header: 'Document', sortable: true, width: '13rem', render: (t) => <span className="font-mono text-xs font-medium text-brand-600">{t.document_no}</span> },
    { key: 'assigned_at', header: 'Assigned', sortable: true, width: '8rem', accessor: (t) => t.assigned_at, render: (t) => formatDate(t.assigned_at) },
    { key: 'level', header: 'Stage', width: '10rem', render: (t) => <span className="text-xs text-fg-muted">{t.level_name} · L{t.level_no}/{t.total_levels}</span> },
    { key: 'requester', header: 'Requested by', sortable: true, width: '11rem', accessor: (t) => t.requester ?? '', render: (t) => t.requester ?? '—' },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true, width: '10rem', accessor: (t) => t.amount ?? 0, render: (t) => (t.amount == null ? <span className="text-2xs text-fg-subtle">—</span> : formatCurrency(t.amount)) },
    {
      key: 'status', header: 'Status', width: '8rem',
      render: (t) =>
        t.status === 'PENDING' ? (
          <Badge tone={t.overdue ? 'danger' : 'pending'} size="sm">{t.overdue ? 'Overdue' : 'Pending'}</Badge>
        ) : (
          <Badge tone={t.status === 'APPROVED' ? 'success' : t.status === 'REJECTED' ? 'danger' : 'neutral'} size="sm">{t.status.toLowerCase()}</Badge>
        ),
    },
    {
      key: 'action', header: 'Action', align: 'right', width: '11rem',
      render: (t) =>
        t.status !== 'PENDING' ? (
          <span className="text-2xs text-fg-subtle">Decided</span>
        ) : (
          <div className="flex justify-end gap-1.5">
            <Button size="xs" variant="success" icon={<Check className="h-3 w-3" />} onClick={(e) => { e.stopPropagation(); setNote(''); setApproving(t) }}>Approve</Button>
            <Button size="xs" variant="danger" icon={<X className="h-3 w-3" />} onClick={(e) => { e.stopPropagation(); setReasonCode(''); setNote(''); setRejecting(t) }}>Reject</Button>
          </div>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Approvals"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Approvals' }]}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'pending', label: 'Pending', count: counts.pending },
          { id: 'overdue', label: 'Overdue', count: counts.overdue },
          { id: 'done', label: 'Decided', count: counts.done },
        ]} />}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load approvals">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}
      {counts.overdue > 0 && tab === 'pending' && (
        <Alert tone="warning" className="mb-4">{counts.overdue} of these are past their due date.</Alert>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(t) => t.task_uid}
        loading={isLoading}
        searchPlaceholder="Search document, requester…"
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'approvals', 'Approval queue', columnsFromTable(columns), visible); toast.success('Export ready', `${n} rows written.`) }}
        onRowClick={setDetail}
        emptyTitle={tab === 'pending' ? 'Nothing waiting on you' : 'Nothing here'}
        emptyDescription={tab === 'pending' ? 'Approvals assigned to you appear in this queue once a document is submitted.' : undefined}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.document_no ?? undefined}
        description={detail?.subject ?? undefined}
        width="max-w-2xl"
        footer={detail?.status === 'PENDING' ? (
          <div className="flex w-full justify-end gap-2">
            <Button variant="danger" size="sm" onClick={() => { setReasonCode(''); setNote(''); setRejecting(detail) }}>Reject</Button>
            <Button variant="success" size="sm" onClick={() => { setNote(''); setApproving(detail) }}>Approve</Button>
          </div>
        ) : undefined}
      >
        {detail && (
          <div className="space-y-5">
            <DataGrid columns={2} items={[
              { label: 'Document', value: `${detail.document_label ?? ''} ${detail.document_no ?? ''}`, mono: true },
              { label: 'Requested by', value: detail.requester ?? '—' },
              { label: 'Amount', value: detail.amount == null ? '—' : formatCurrency(detail.amount) },
              { label: 'Approval level', value: `${detail.level_name ?? ''} · ${detail.level_no} of ${detail.total_levels}` },
              { label: 'Assigned', value: formatDate(detail.assigned_at) },
              { label: 'Due', value: detail.due_at ? formatDate(detail.due_at) : '—' },
            ]} />
            {detail.on_behalf_of && (
              <Alert tone="info" title="Delegated">This task is assigned to you on behalf of {detail.on_behalf_of} (active delegation).</Alert>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={!!approving} onClose={() => setApproving(null)} title="Approve this document?" size="sm"
        footer={<><Button variant="outline" onClick={() => setApproving(null)}>Cancel</Button><Button variant="success" loading={decide.isPending} onClick={() => approving && approve(approving)}>Approve</Button></>}
      >
        {approving && (
          <div className="space-y-3 text-sm text-fg-muted">
            <p><span className="font-medium text-fg">{approving.document_no}</span> — {approving.subject}{approving.amount != null && <> for <span className="font-medium text-fg">{formatCurrency(approving.amount)}</span></>}, requested by {approving.requester}.</p>
            <p className="text-xs">{approving.level_no >= approving.total_levels ? 'This is the final level — the document becomes fully approved.' : `This clears level ${approving.level_no} of ${approving.total_levels}. It moves to the next level automatically.`}</p>
            <Textarea label="Comment (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!rejecting} onClose={() => setRejecting(null)} title="Reject this document?" size="sm"
        footer={<><Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button><Button variant="danger" loading={decide.isPending} onClick={() => rejecting && reject(rejecting)}>Reject and send back</Button></>}
      >
        {rejecting && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted"><span className="font-medium text-fg">{rejecting.document_no}</span> goes back to {rejecting.requester} with your reason.</p>
            <Select label="Reason" required value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}
              options={[{ value: '', label: 'Select a reason…' }, ...reasons.map((r) => ({ value: r.code, label: r.label }))]} />
            <Textarea label="Note to the requester" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What has to change before this can be approved." />
          </div>
        )}
      </Modal>
    </div>
  )
}
