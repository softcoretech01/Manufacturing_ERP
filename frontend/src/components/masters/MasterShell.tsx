import { useState, type ReactNode } from 'react'
import {
  Archive,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  History,
  MessageSquare,
  Paperclip,
  Pencil,
  Printer,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/Card'
import { Alert, Avatar } from '@/components/ui/Misc'
import { Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatTimeAgo } from '@/lib/format'
import type { MasterStatus, RevisionEntry, WhereUsedEntry } from '@/types/masters'

/* ─────────────────────────── Lifecycle ─────────────────────────── */

/** V2 Ch 9 — one lifecycle for every approval-controlled master. */
export const MASTER_LIFECYCLE: MasterStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'ARCHIVED',
]

const STATUS_TONE: Record<MasterStatus, StatusTone> = {
  DRAFT: 'draft',
  SUBMITTED: 'pending',
  PENDING_APPROVAL: 'pending',
  APPROVED: 'progress',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  REJECTED: 'danger',
  ARCHIVED: 'neutral',
}

const STATUS_LABEL: Record<MasterStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
}

export function MasterStatusBadge({ status, size = 'md' }: { status: MasterStatus; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={STATUS_TONE[status]} size={size}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function LifecycleTrail({ status }: { status: MasterStatus }) {
  const idx = MASTER_LIFECYCLE.indexOf(status)
  const off = idx < 0
  return (
    <div className="flex flex-wrap items-center gap-1">
      {MASTER_LIFECYCLE.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          {i > 0 && <span className="text-fg-subtle">›</span>}
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-2xs',
              off
                ? 'text-fg-subtle'
                : i < idx
                  ? 'text-success'
                  : i === idx
                    ? 'bg-brand-500/10 font-medium text-brand-600 ring-1 ring-inset ring-brand-500/25'
                    : 'text-fg-subtle',
            )}
          >
            {STATUS_LABEL[s]}
          </span>
        </span>
      ))}
      {off && (
        <span className="ml-1 rounded bg-danger/10 px-1.5 py-0.5 text-2xs font-medium text-danger">
          {STATUS_LABEL[status]}
        </span>
      )}
    </div>
  )
}

/* ─────────────────────────── Action bar (V2 Ch 5) ─────────────────────── */

export interface MasterActionsProps {
  status: MasterStatus
  /** Blocks deactivation and deletion while open transactions reference it. */
  usageCount: number
  onNew?: () => void
  onEdit?: () => void
  onSubmit?: () => void
  onApprove?: () => void
  onReject?: () => void
  onCopy?: () => void
  onArchive?: () => void
  onDelete?: () => void
  onPrint?: () => void
  onExport?: () => void
  onImport?: () => void
  onAttach?: () => void
  onComment?: () => void
  onHistory?: () => void
  compact?: boolean
}

/**
 * The universal action set. Which actions are legal depends on the record's
 * lifecycle state, not on who remembered to hide a button — an illegal
 * transition is disabled with the reason in its tooltip.
 */
export function MasterActions({
  status,
  usageCount,
  onNew,
  onEdit,
  onSubmit,
  onApprove,
  onReject,
  onCopy,
  onArchive,
  onDelete,
  onPrint,
  onExport,
  onImport,
  onAttach,
  onComment,
  onHistory,
  compact,
}: MasterActionsProps) {
  const toast = useToast()
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)

  const editable = status === 'DRAFT' || status === 'REJECTED' || status === 'ACTIVE'
  const submittable = status === 'DRAFT' || status === 'REJECTED'
  const decidable = status === 'SUBMITTED' || status === 'PENDING_APPROVAL'
  const referenced = usageCount > 0

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {onNew && (
          <Button variant="primary" size="sm" onClick={onNew}>
            New
          </Button>
        )}
        {onEdit && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil className="h-3.5 w-3.5" />}
            disabled={!editable}
            title={editable ? undefined : `A ${STATUS_LABEL[status].toLowerCase()} record cannot be edited directly.`}
            onClick={onEdit}
          >
            Edit
          </Button>
        )}
        {onSubmit && submittable && (
          <Button variant="secondary" size="sm" onClick={onSubmit}>
            Submit for approval
          </Button>
        )}
        {decidable && (
          <>
            <Button variant="primary" size="sm" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setDecision('approve')}>
              Approve
            </Button>
            <Button variant="outline" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={() => setDecision('reject')}>
              Reject
            </Button>
          </>
        )}

        {!compact && (
          <Menu
            align="right"
            trigger={
              <Button variant="ghost" size="sm">
                More
              </Button>
            }
          >
            <MenuItem label="Copy / duplicate" icon={<Copy className="h-3.5 w-3.5" />} onClick={onCopy ?? (() => toast.success('Copied to a new draft'))} />
            <MenuItem label="Print" icon={<Printer className="h-3.5 w-3.5" />} onClick={onPrint ?? (() => toast.success('Sent to printer'))} />
            <MenuItem label="Export" icon={<Download className="h-3.5 w-3.5" />} onClick={onExport ?? (() => toast.success('Export queued'))} />
            <MenuItem label="Import from Excel" icon={<FileSpreadsheet className="h-3.5 w-3.5" />} onClick={onImport ?? (() => toast.info('Import', 'Download the template, fill it, then dry-run before committing.'))} />
            <MenuSeparator />
            <MenuItem label="Attach document" icon={<Paperclip className="h-3.5 w-3.5" />} onClick={onAttach ?? (() => toast.info('Attach'))} />
            <MenuItem label="Add comment" icon={<MessageSquare className="h-3.5 w-3.5" />} onClick={onComment ?? (() => toast.info('Comment'))} />
            <MenuItem label="Revision history" icon={<History className="h-3.5 w-3.5" />} onClick={onHistory ?? (() => {})} />
            <MenuSeparator />
            <MenuItem
              label="Archive"
              icon={<Archive className="h-3.5 w-3.5" />}
              disabled={referenced}
              onClick={() => setConfirm('archive')}
            />
            <MenuItem
              label={referenced ? `Delete — blocked (${usageCount} references)` : 'Delete'}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              danger
              disabled={referenced || status === 'ACTIVE' || status === 'APPROVED'}
              onClick={() => setConfirm('delete')}
            />
          </Menu>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'archive'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          toast.success('Record archived', 'It is no longer selectable in new transactions.')
          setConfirm(null)
          onArchive?.()
        }}
        title="Archive this record"
        confirmLabel="Archive"
        tone="danger"
        message="Archiving removes the record from selection lists. Existing documents keep their reference and remain readable."
      >
        <div className="mt-3">
          <Select
            label="Reason code"
            required
            options={[
              { value: 'SUPERSEDED', label: 'Superseded by a newer record' },
              { value: 'OBSOLETE', label: 'No longer used by the business' },
              { value: 'DUPLICATE', label: 'Duplicate of another record' },
              { value: 'ERROR', label: 'Created in error' },
            ]}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          toast.success('Record deleted', 'Soft deleted — the row is retained with a deletion stamp.')
          setConfirm(null)
          onDelete?.()
        }}
        title="Delete this record"
        confirmLabel="Delete"
        message="Masters are never physically removed. The record is soft deleted, keeping the audit trail and any historical references intact."
      >
        <div className="mt-3">
          <Textarea label="Reason" rows={2} required placeholder="Recorded on the audit trail against your name." />
        </div>
      </ConfirmDialog>

      <Modal
        open={!!decision}
        onClose={() => setDecision(null)}
        size="sm"
        title={decision === 'approve' ? 'Approve this record' : 'Reject this record'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button
              variant={decision === 'approve' ? 'primary' : 'danger'}
              onClick={() => {
                if (decision === 'approve') {
                  toast.success('Approved', 'The record becomes active on its effective-from date.')
                  onApprove?.()
                } else {
                  toast.success('Rejected', 'Returned to the creator with your comments.')
                  onReject?.()
                }
                setDecision(null)
              }}
            >
              {decision === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          {decision === 'reject' && (
            <Select
              label="Reason code"
              required
              options={[
                { value: 'INCOMPLETE', label: 'Incomplete information' },
                { value: 'INCORRECT', label: 'Incorrect data' },
                { value: 'DUPLICATE', label: 'Duplicate of an existing record' },
                { value: 'NOT_REQUIRED', label: 'Not required' },
                { value: 'DOCS', label: 'Supporting documents missing' },
              ]}
            />
          )}
          <Textarea
            label="Comments"
            rows={3}
            required={decision === 'reject'}
            placeholder={decision === 'approve' ? 'Optional note recorded on the approval trail.' : 'Tell the creator what needs to change.'}
          />
          <Alert tone={decision === 'approve' ? 'info' : 'warning'}>
            {decision === 'approve'
              ? 'Approval is recorded against your user id and cannot be reversed — a change after this point creates a new revision.'
              : 'Rejection returns the record to DRAFT. Nothing is deleted and the creator keeps their work.'}
          </Alert>
        </div>
      </Modal>
    </>
  )
}

/* ─────────────────────────── Standard tab set (V2 Ch 4) ───────────────── */

export const MASTER_TABS = [
  { id: 'general', label: 'General' },
  { id: 'classification', label: 'Classification' },
  { id: 'address', label: 'Address' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'financial', label: 'Financial' },
  { id: 'tax', label: 'Tax' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'notes', label: 'Notes' },
  { id: 'whereused', label: 'Where used' },
  { id: 'revisions', label: 'Revisions' },
  { id: 'audit', label: 'Audit' },
  { id: 'workflow', label: 'Workflow' },
]

/* ─────────────────────────── Where used ─────────────────────────── */

export function WhereUsedPanel({ entries }: { entries: WhereUsedEntry[] }) {
  const open = entries.filter((e) => e.isOpen)
  return (
    <Card>
      <CardHeader
        title="Where used"
        description={
          entries.length === 0
            ? 'Not referenced by any transaction — safe to deactivate.'
            : `${entries.length} reference${entries.length > 1 ? 's' : ''}, ${open.length} still open`
        }
        actions={
          open.length > 0 ? (
            <Badge tone="warning" size="sm">Deactivation blocked</Badge>
          ) : (
            <Badge tone="success" size="sm">Safe to deactivate</Badge>
          )
        }
      />
      <CardBody className="p-0">
        {entries.length === 0 && (
          <EmptyState title="No references" description="Nothing in the system points at this record yet." />
        )}
        {entries.length > 0 && (
          <table className="grid-table">
            <thead>
              <tr>
                <th className="w-32">Module</th>
                <th className="w-48">Document type</th>
                <th>Document</th>
                <th className="w-36">Status</th>
                <th className="w-32">Date</th>
                <th className="w-24">Open</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td><Badge tone="neutral" size="sm" dot={false}>{e.module}</Badge></td>
                  <td className="text-fg-muted">{e.documentType}</td>
                  <td><span className="font-mono text-2xs font-medium text-fg">{e.documentNo}</span></td>
                  <td className="text-fg-muted">{e.status.replace(/_/g, ' ').toLowerCase()}</td>
                  <td>{formatDate(e.date)}</td>
                  <td>
                    {e.isOpen ? <Badge tone="warning" size="sm">Open</Badge> : <span className="text-2xs text-fg-subtle">closed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
      {open.length > 0 && (
        <div className="border-t border-border p-3">
          <Alert tone="warning" title="This record cannot be deactivated yet">
            {open.length} open transaction{open.length > 1 ? 's' : ''} still reference it. Close or
            cancel them first — deactivating now would leave documents pointing at something no one
            can select again.
          </Alert>
        </div>
      )}
    </Card>
  )
}

/* ─────────────────────────── Revisions (V2 Ch 7) ─────────────────────── */

export function RevisionPanel({ revisions }: { revisions: RevisionEntry[] }) {
  return (
    <Card>
      <CardHeader
        title="Revision history"
        description="Approved masters are versioned, never edited in place. Each revision keeps its own before-and-after."
      />
      <CardBody className="space-y-3">
        {revisions.map((r) => (
          <div key={r.revision} className="rounded border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="brand" size="sm" dot={false}>Rev {r.revision}</Badge>
                <span className="text-xs font-medium text-fg">{r.reason}</span>
              </div>
              <span className="text-2xs text-fg-subtle">
                {r.by} · {formatTimeAgo(r.at)}
                {r.approvedBy ? ` · approved by ${r.approvedBy}` : ' · not approved'}
              </span>
            </div>
            {r.changes.length > 0 && (
              <table className="grid-table mt-2">
                <thead>
                  <tr>
                    <th className="w-40">Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {r.changes.map((c, i) => (
                    <tr key={i}>
                      <td className="font-mono text-2xs">{c.field}</td>
                      <td className="text-2xs text-danger line-through">{c.old ?? '—'}</td>
                      <td className="text-2xs text-success">{c.new ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.changes.length === 0 && (
              <p className="mt-1 text-2xs text-fg-subtle">Record created — no prior values to compare.</p>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

/* ─────────────────────────── Governance summary ─────────────────────── */

export function GovernanceCard({
  createdBy,
  createdAt,
  modifiedBy,
  modifiedAt,
  approvedBy,
  approvedAt,
  revision,
  effectiveFrom,
  effectiveTo,
}: {
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  approvedBy: string | null
  approvedAt: string | null
  revision: number
  effectiveFrom: string
  effectiveTo: string | null
}) {
  const rows: [string, ReactNode][] = [
    ['Created', <span key="c" className="flex items-center gap-1.5"><Avatar name={createdBy} size="xs" /> {createdBy} · {formatDate(createdAt)}</span>],
    ['Last modified', <span key="m" className="flex items-center gap-1.5"><Avatar name={modifiedBy} size="xs" /> {modifiedBy} · {formatDateTime(modifiedAt)}</span>],
    ['Approved', approvedBy ? <span key="a" className="flex items-center gap-1.5"><Avatar name={approvedBy} size="xs" /> {approvedBy} · {formatDate(approvedAt!)}</span> : <span key="a" className="text-warning">Not yet approved</span>],
    ['Revision', `Rev ${revision}`],
    ['Effective from', formatDate(effectiveFrom)],
    ['Effective to', effectiveTo ? formatDate(effectiveTo) : 'Open ended'],
  ]
  return (
    <Card>
      <CardHeader title="Governance" description="Who touched this record and when" />
      <CardBody className="space-y-0">
        {rows.map(([l, v]) => (
          <div key={l} className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-0">
            <span className="shrink-0 text-xs text-fg-muted">{l}</span>
            <span className="min-w-0 text-right text-xs text-fg">{v}</span>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

/* ─────────────────────────── Rules card (V2 Ch 6) ─────────────────────── */

export function RulesCard({ rules, title = 'Business rules' }: { rules: string[]; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} description="Enforced server-side — the UI only explains them" />
      <CardBody>
        <ul className="space-y-2 text-xs text-fg-muted">
          {rules.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
              {r}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

/* ─────────────────────────── Import helper ─────────────────────── */

export function ImportButton({ masterName }: { masterName: string }) {
  const toast = useToast()
  return (
    <Button
      variant="outline"
      size="sm"
      icon={<Upload className="h-4 w-4" />}
      onClick={() => toast.info('Import ' + masterName, 'Download the template, fill it, then dry-run before committing.')}
    >
      Import
    </Button>
  )
}
