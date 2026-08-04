import { useState } from 'react'
import { ArrowRight, Plus, UserCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { delegations, users } from '@/mock/data'
import { numberSeries } from '@/mock/data2'
import type { Delegation } from '@/types'

export function DelegationsPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'delegation-of-authority', 'Delegation of authority', columnsFromTable(columns), delegations)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [open, setOpen] = useState(false)

  const columns: Column<Delegation>[] = [
    {
      key: 'from',
      header: 'Delegated by',
      accessor: (d) => d.fromUserName,
      render: (d) => (
        <span className="flex items-center gap-2">
          <Avatar name={d.fromUserName} size="sm" />
          <span className="text-sm text-fg">{d.fromUserName}</span>
        </span>
      ),
    },
    { key: 'arrow', header: '', width: '32px', render: () => <ArrowRight className="h-3.5 w-3.5 text-fg-subtle" /> },
    {
      key: 'to',
      header: 'Delegated to',
      accessor: (d) => d.toUserName,
      render: (d) => (
        <span className="flex items-center gap-2">
          <Avatar name={d.toUserName} size="sm" />
          <span className="text-sm text-fg">{d.toUserName}</span>
        </span>
      ),
    },
    {
      key: 'documentTypes',
      header: 'Document types',
      accessor: (d) => d.documentTypes.join(','),
      render: (d) =>
        d.documentTypes.length === 0 ? (
          <Badge tone="warning" size="sm">All document types</Badge>
        ) : (
          <span className="flex flex-wrap gap-1">
            {d.documentTypes.map((t) => (
              <span key={t} className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">
                {t.replace(/_/g, ' ').toLowerCase()}
              </span>
            ))}
          </span>
        ),
    },
    { key: 'validFrom', header: 'From', sortable: true, width: '110px', render: (d) => formatDate(d.validFrom) },
    { key: 'validTo', header: 'To', sortable: true, width: '110px', render: (d) => formatDate(d.validTo) },
    { key: 'reason', header: 'Reason', defaultHidden: true },
    { key: 'status', header: 'Status', width: '110px', render: (d) => <StatusBadge status={d.status} size="sm" /> },
  ]

  const active = delegations.filter((d) => d.status === 'ACTIVE')

  return (
    <div>
      <PageHeader
        title="Delegation of authority"
        description="A delegation transfers approval authority only — never data-entry rights, and never more than one hop."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Delegations' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New delegation</Button>}
      />

      <Alert tone="info" className="mb-4" title="How delegation is recorded">
        Delegated approvals appear as “approved by B on behalf of A” in the document, the audit log
        and the printout. The original authority holder remains accountable. Chains are limited to a
        single hop — B cannot re-delegate A’s authority onward.
      </Alert>

      <DataTable
        rows={delegations}
        columns={columns}
        rowKey={(d) => d.uid}
        searchPlaceholder="Person or reason…"
        onExport={doExport}
        rowActions={(d) => (
          <>
            <MenuItem label="View details" onClick={() => toast.info('Delegation details', `${d.fromUserName} → ${d.toUserName}, valid ${formatDate(d.validFrom)} – ${formatDate(d.validTo)}.`)} />
            <MenuItem label="Extend" disabled={d.status !== 'ACTIVE'} onClick={() => toast.success('Delegation extended', 'Both users have been notified of the new end date.')} />
            <MenuItem label="Revoke" icon={<X />} danger disabled={d.status !== 'ACTIVE'} onClick={() => toast.warning('Delegation revoked', 'Pending tasks return to the original approver.')} />
          </>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New delegation"
        description="Transfer your approval authority for a defined period."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Delegation created', 'Both users have been notified.'); setOpen(false) }}>
              Create delegation
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select label="Delegate from" required defaultValue="usr-01"
            options={users.filter((u) => u.status === 'ACTIVE').map((u) => ({ value: u.uid, label: `${u.fullName} — ${u.designation}` }))}
            hint="Delegating on behalf of another user requires SYSTEM.DELEGATION.CREATE_FOR_OTHERS." />
          <Select label="Delegate to" required defaultValue="usr-02"
            options={users.filter((u) => u.status === 'ACTIVE').map((u) => ({ value: u.uid, label: `${u.fullName} — ${u.designation}` }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valid from" type="date" required />
            <Input label="Valid to" type="date" required />
          </div>
          <div>
            <p className="field-label">Document types</p>
            <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded border border-border p-2.5 sm:grid-cols-2">
              <Checkbox label="All document types" />
              {[...new Set(numberSeries.map((s) => s.documentLabel))].slice(0, 14).map((t) => (
                <Checkbox key={t} label={t} />
              ))}
            </div>
          </div>
          <Textarea label="Reason" required placeholder="Annual leave, travel, medical…" />
          <Alert tone="warning">
            The system validates that this delegation does not create a segregation-of-duties conflict
            before saving.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
