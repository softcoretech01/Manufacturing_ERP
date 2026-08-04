import { useMemo, useState } from 'react'
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
import { useCollection } from '@/store/data'
import { approvalTasks as seedTasks } from '@/mock/data2'
import { isApprovable } from '@/lib/procFlow'
import type { ApprovalTask } from '@/types'

/**
 * Approval queue.
 *
 * One list of what is waiting on you, with Approve and Reject on the row. The
 * decision is the whole job, so it takes one click and a confirmation — being
 * routed through a separate page to make it is what made this screen slow.
 *
 * The document is still one click away for anyone who wants to read it before
 * deciding, but nobody is forced through it.
 */

const REJECT_REASONS = [
  'Rate not justified',
  'Budget exceeded',
  'Insufficient documentation',
  'Better alternative available',
  'Requirement no longer valid',
  'Specification error',
  'Other',
]

type Task = ApprovalTask & { deletedAt?: string | null }

export function ApprovalInboxPage() {
  const toast = useToast()
  const seed = useMemo(() => seedTasks as Task[], [])
  const { rows: allRows, update } = useCollection<Task>('wfl:tasks', seed)
  const rows = allRows.filter((t) => isApprovable(t.documentType))

  const [tab, setTab] = useState('pending')
  const [detail, setDetail] = useState<Task | null>(null)
  const [approving, setApproving] = useState<Task | null>(null)
  const [rejecting, setRejecting] = useState<Task | null>(null)
  const [reason, setReason] = useState(REJECT_REASONS[0])
  const [note, setNote] = useState('')

  const pending = rows.filter((t) => t.status === 'PENDING')
  const counts = {
    pending: pending.length,
    overdue: pending.filter((t) => t.isOverdue).length,
    done: rows.filter((t) => t.status !== 'PENDING').length,
  }

  const visible = rows.filter((t) => {
    if (tab === 'overdue') return t.status === 'PENDING' && t.isOverdue
    if (tab === 'done') return t.status !== 'PENDING'
    return t.status === 'PENDING'
  })

  function approve(t: Task) {
    const last = t.levelNo >= t.totalLevels
    update(t.uid, { status: 'APPROVED' })
    toast.success(
      last ? 'Approved' : `Approved — level ${t.levelNo} of ${t.totalLevels}`,
      last
        ? `${t.documentNo} is fully approved.`
        : `${t.documentNo} moves to level ${t.levelNo + 1} automatically.`,
    )
    setApproving(null)
    setDetail(null)
  }

  function reject(t: Task) {
    if (reason === 'Other' && !note.trim()) {
      toast.error('Explanation required', 'Choose a reason, or explain it when the reason is "Other".')
      return
    }
    update(t.uid, { status: 'REJECTED' })
    toast.success('Rejected', `${t.documentNo} sent back to ${t.requester} — ${reason.toLowerCase()}.`)
    setRejecting(null)
    setDetail(null)
    setNote('')
  }

  const columns: Column<Task>[] = [
    {
      key: 'documentNo',
      header: 'Document',
      sortable: true,
      width: '12rem',
      render: (t) => <span className="font-mono text-xs font-medium text-brand-600">{t.documentNo}</span>,
    },
    { key: 'assignedAt', header: 'Date', sortable: true, width: '8rem', accessor: (t) => t.assignedAt, render: (t) => formatDate(t.assignedAt) },
    { key: 'department', header: 'Department', sortable: true, width: '11rem', accessor: (t) => t.department ?? '', render: (t) => t.department ?? '—' },
    { key: 'requester', header: 'Requested by', sortable: true, width: '11rem' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      width: '11rem',
      accessor: (t) => t.amount ?? 0,
      render: (t) => (t.amount === null ? <span className="text-2xs text-fg-subtle">—</span> : formatCurrency(t.amount)),
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      render: (t) =>
        t.status === 'PENDING' ? (
          // Overdue rides on the status badge rather than costing a column.
          <Badge tone={t.isOverdue ? 'danger' : 'pending'} size="sm">
            {t.isOverdue ? 'Overdue' : 'Pending'}
          </Badge>
        ) : (
          <Badge tone={t.status === 'APPROVED' ? 'success' : 'danger'} size="sm">
            {t.status === 'APPROVED' ? 'Approved' : 'Rejected'}
          </Badge>
        ),
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      width: '11rem',
      render: (t) =>
        t.status !== 'PENDING' ? (
          <span className="text-2xs text-fg-subtle">Decided</span>
        ) : (
          <div className="flex justify-end gap-1.5">
            <Button
              size="xs"
              variant="success"
              icon={<Check className="h-3 w-3" />}
              onClick={(e) => {
                e.stopPropagation()
                setApproving(t)
              }}
            >
              Approve
            </Button>
            <Button
              size="xs"
              variant="danger"
              icon={<X className="h-3 w-3" />}
              onClick={(e) => {
                e.stopPropagation()
                setReason(REJECT_REASONS[0])
                setNote('')
                setRejecting(t)
              }}
            >
              Reject
            </Button>
          </div>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Approvals"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Approvals' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'pending', label: 'Pending', count: counts.pending },
              { id: 'overdue', label: 'Overdue', count: counts.overdue },
              { id: 'done', label: 'Decided', count: counts.done },
            ]}
          />
        }
      />

      {counts.overdue > 0 && tab === 'pending' && (
        <Alert tone="warning" className="mb-4">
          {counts.overdue} of these are past their due date.
        </Alert>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(t) => t.uid}
        searchPlaceholder="Search document, department, requester…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'approvals', 'Approval queue', columnsFromTable(columns), visible)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        emptyTitle={tab === 'pending' ? 'Nothing waiting on you' : 'Nothing here'}
        emptyDescription={tab === 'pending' ? 'Approvals assigned to you appear in this queue.' : undefined}
        // No overflow menu: the row already carries Approve and Reject, and
        // clicking it opens the document. A second Action column would only
        // repeat what is already a click away.
      />

      {/* ── The document, for anyone who wants to read before deciding ── */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.documentNo}
        description={detail?.subject}
        width="max-w-2xl"
        footer={
          detail?.status === 'PENDING' ? (
            <div className="flex w-full justify-end gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setReason(REJECT_REASONS[0])
                  setNote('')
                  setRejecting(detail)
                }}
              >
                Reject
              </Button>
              <Button variant="success" size="sm" onClick={() => setApproving(detail)}>
                Approve
              </Button>
            </div>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <DataGrid
              columns={2}
              items={[
                { label: 'Document', value: `${detail.documentLabel} ${detail.documentNo}`, mono: true },
                { label: 'Requested by', value: detail.requester },
                { label: 'Amount', value: detail.amount === null ? '—' : formatCurrency(detail.amount) },
                { label: 'Approval level', value: `${detail.levelName} · ${detail.levelNo} of ${detail.totalLevels}` },
                { label: 'Assigned', value: formatDate(detail.assignedAt) },
                { label: 'Due', value: formatDate(detail.dueAt) },
              ]}
            />

            {detail.warnings.length > 0 && (
              <Alert tone="warning" title="Worth checking before you decide">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {detail.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {detail.context.length > 0 && (
              <DataGrid columns={2} items={detail.context.map((c) => ({ label: c.label, value: c.value }))} />
            )}
          </div>
        )}
      </Drawer>

      {/* ── Approve: confirm, then move to the next level ── */}
      <Modal
        open={!!approving}
        onClose={() => setApproving(null)}
        title="Approve this document?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setApproving(null)}>
              Cancel
            </Button>
            <Button variant="success" onClick={() => approving && approve(approving)}>
              Approve
            </Button>
          </>
        }
      >
        {approving && (
          <div className="space-y-2 text-sm text-fg-muted">
            <p>
              <span className="font-medium text-fg">{approving.documentNo}</span> — {approving.subject}
              {approving.amount !== null && (
                <>
                  {' '}
                  for <span className="font-medium text-fg">{formatCurrency(approving.amount)}</span>
                </>
              )}
              , requested by {approving.requester}.
            </p>
            <p className="text-xs">
              {approving.levelNo >= approving.totalLevels
                ? 'This is the final level — the document becomes fully approved.'
                : `This clears level ${approving.levelNo} of ${approving.totalLevels}. It moves to level ${approving.levelNo + 1} automatically.`}
            </p>
          </div>
        )}
      </Modal>

      {/* ── Reject: reason mandatory, document goes back to the requester ── */}
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject this document?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => rejecting && reject(rejecting)}>
              Reject and send back
            </Button>
          </>
        }
      >
        {rejecting && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">{rejecting.documentNo}</span> goes back to {rejecting.requester} with
              your reason.
            </p>
            <Select
              label="Reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              options={REJECT_REASONS.map((r) => ({ value: r, label: r }))}
            />
            <Textarea
              label="Note to the requester"
              required={reason === 'Other'}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What has to change before this can be approved."
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
