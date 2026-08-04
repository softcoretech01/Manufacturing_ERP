import { useMemo, useState } from 'react'
import { Lock, LockOpen, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { InvStatusBadge, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { counts as seedCounts, warehouseSummaries } from '@/mock/inventory'
import type { CountDoc } from '@/types/inventory'

/**
 * Physical verification — the full stocktake. Unlike a cycle count it freezes
 * the warehouse: while it runs, nothing may be received, issued, transferred or
 * adjusted in the covered locations.
 */
export function PhysicalVerificationPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedCounts, [])
  const { rows: counts, create, update } = useCollection<CountDoc>('inv:count', seed)
  const rowEdit = useRowEdit<CountDoc>({
    key: 'inv:count',
    seed: seed,
    entity: 'Verification',
    titleOf: (r) => r.docNo,
  })

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ warehouse: 'Raw Material Store', scope: 'Full warehouse', counter: 'K. Ravi', dueOn: '', freeze: 'yes' })

  const verifications = counts.filter((c) => c.countType === 'PHYSICAL_VERIFICATION')
  const frozen = counts.filter((c) => c.isFrozen)

  const columns: Column<CountDoc>[] = [
    { key: 'docNo', header: 'Verification', sortable: true, width: '12rem', render: (c) => <span className="font-mono text-xs font-medium text-brand-600">{c.docNo}</span> },
    { key: 'warehouse', header: 'Warehouse', sortable: true },
    { key: 'scope', header: 'Scope' },
    { key: 'counter', header: 'Led by', sortable: true, width: '9rem' },
    { key: 'assignedOn', header: 'Started', sortable: true, width: '8rem', accessor: (c) => c.assignedOn, render: (c) => formatDate(c.assignedOn) },
    { key: 'dueOn', header: 'Due', sortable: true, width: '8rem', accessor: (c) => c.dueOn, render: (c) => formatDate(c.dueOn) },
    { key: 'progress', header: 'Progress', width: '11rem', accessor: (c) => c.binsCounted, render: (c) => (
      <div className="flex items-center gap-2">
        <ProgressBar value={c.binsPlanned ? (c.binsCounted / c.binsPlanned) * 100 : 0} tone={c.binsCounted === c.binsPlanned ? 'success' : 'brand'} className="w-16" />
        <span className="text-2xs tabular text-fg-muted">{c.binsCounted}/{c.binsPlanned}</span>
      </div>
    ) },
    { key: 'linesWithVariance', header: 'Variances', align: 'right', width: '7rem', sortable: true },
    { key: 'accuracyPct', header: 'Accuracy', align: 'right', width: '7rem', sortable: true, render: (c) => (c.binsCounted ? <span className={cn(c.accuracyPct < 95 && 'text-warning')}>{c.accuracyPct.toFixed(1)}%</span> : '—') },
    ...(canSeeValue
      ? [{ key: 'netVarianceValue', header: 'Variance value', align: 'right' as const, sortable: true, render: (c: CountDoc) => (c.netVarianceValue ? <span className={cn(c.netVarianceValue < 0 ? 'text-danger' : 'text-success')}>{formatCurrency(c.netVarianceValue)}</span> : '—') }]
      : []),
    { key: 'isFrozen', header: 'Freeze', align: 'center', width: '7rem', accessor: (c) => (c.isFrozen ? 'Frozen' : 'Open'), render: (c) => (
      c.isFrozen ? <Badge tone="progress" size="sm">Frozen</Badge> : <span className="text-2xs text-fg-subtle">Open</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '11rem', render: (c) => <InvStatusBadge status={c.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'physical-verification', 'Physical verification statement', columnsFromTable(columns), verifications)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function start() {
    const next = Math.max(...counts.map((c) => Number(c.docNo.slice(-3)) || 0)) + 1
    const docNo = `PV/26-27/${String(next).padStart(3, '0')}`
    create({
      uid: newUid('pv'),
      docNo,
      countType: 'PHYSICAL_VERIFICATION',
      status: 'ASSIGNED',
      warehouse: form.warehouse,
      scope: form.scope,
      abcClass: 'ALL',
      counter: form.counter,
      assignedOn: new Date().toISOString().slice(0, 10),
      dueOn: form.dueOn || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      binsPlanned: 24,
      binsCounted: 0,
      linesWithVariance: 0,
      accuracyPct: 0,
      netVarianceValue: 0,
      isFrozen: form.freeze === 'yes',
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: [
        { level: 1, role: 'Materials Manager', approver: 'K. Ravi', status: 'PENDING' },
        { level: 2, role: 'Factory Head', approver: 'S. Balaji', status: 'PENDING' },
        { level: 3, role: 'CFO', approver: 'K. Raman', status: 'PENDING' },
      ],
      lines: [],
    } as CountDoc)
    toast.success(
      'Verification started',
      form.freeze === 'yes'
        ? `${docNo} — ${form.warehouse} is frozen. No receipt, issue, transfer or adjustment can post there until it lifts.`
        : `${docNo} started without a freeze — movements during the count must be reconciled explicitly.`,
    )
    setFormOpen(false)
  }

  return (
    <div>
      <PageHeader
        title="Physical verification"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Physical verification' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
            Start verification
          </Button>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        A full count of one or more warehouses at a cut-off point. While it runs the covered locations are{' '}
        <span className="font-medium text-fg">frozen</span> — that is what makes the result defensible.{' '}
        <span className={cn('font-medium', frozen.length ? 'text-warning' : 'text-success')}>{frozen.length}</span> location
        {frozen.length === 1 ? '' : 's'} currently frozen.
      </p>

      {frozen.length > 0 && (
        <Card className="mb-4">
          <CardBody className="flex flex-wrap items-center gap-3 border-l-2 border-progress py-3">
            <Lock className="h-4 w-4 shrink-0 text-progress" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg">Freeze in force</p>
              <p className="text-2xs text-fg-muted">
                {frozen.map((c) => `${c.warehouse} (${c.docNo})`).join(' · ')} — receipts, issues, transfers and adjustments are
                blocked in these locations until the count posts.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={verifications}
        columns={columns}
        rowKey={(c) => c.uid}
        searchPlaceholder="Search verification, warehouse or lead…"
        onExport={doExport}
        emptyTitle="No physical verification has been run"
        emptyDescription="Cycle counting keeps accuracy up day to day; a full verification is what the statutory auditor signs."
        rowActions={(c) => (
          <>
            {rowEdit.actions(c)}
            <MenuItem
              label={c.isFrozen ? 'Lift the freeze' : 'Freeze the warehouse'}
              icon={c.isFrozen ? <LockOpen /> : <Lock />}
              onClick={() => {
                update(c.uid, { isFrozen: !c.isFrozen })
                toast.success(
                  c.isFrozen ? 'Freeze lifted' : 'Warehouse frozen',
                  c.isFrozen
                    ? `${c.warehouse} accepts movements again. Documents queued during the freeze post in the order they were raised.`
                    : `${c.warehouse} is frozen — nothing can move there until this is lifted.`,
                )
              }}
            />
            <MenuItem
              label="Record progress"
              disabled={c.status === 'POSTED'}
              onClick={() => {
                const counted = Math.min(c.binsPlanned, c.binsCounted + Math.ceil(c.binsPlanned / 4))
                update(c.uid, { binsCounted: counted, status: counted >= c.binsPlanned ? 'PENDING_APPROVAL' : 'COUNTED', accuracyPct: 96 + Math.random() * 3 })
                toast.success('Progress recorded', `${counted} of ${c.binsPlanned} bins counted.`)
              }}
            />
            <MenuItem
              label="Sign off & post"
              separatorBefore
              disabled={c.status !== 'PENDING_APPROVAL' && c.status !== 'COUNTED'}
              onClick={() => {
                update(c.uid, {
                  status: 'POSTED',
                  isFrozen: false,
                  postedOn: new Date().toISOString().slice(0, 10),
                  approvals: c.approvals.map((a) => ({ ...a, status: 'APPROVED' as const, actedAt: new Date().toISOString() })),
                })
                toast.success('Verification posted', `${c.docNo} signed off, variances written to the ledger and the freeze lifted.`)
              }}
            />
          </>
        )}
        rowClassName={(c) => cn(c.isFrozen && 'bg-progress/[0.04]')}
      />

      <Card className="mt-4">
        <CardHeader title="How a verification runs" description="Five steps, and the reason each one exists" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { t: '1 · Plan', d: 'Choose the warehouses and the cut-off. Everything in them will be counted.' },
            { t: '2 · Freeze', d: 'Movements stop, so the count is of one moment and not a moving target.' },
            { t: '3 · Count', d: 'Blind sheets, zone by zone. Counters never see the expected figure.' },
            { t: '4 · Review', d: 'Variances beyond tolerance are recounted by a different person.' },
            { t: '5 · Sign off', d: 'Materials Manager, Factory Head and CFO approve; the ledger is corrected and the freeze lifts.' },
          ].map((s) => (
            <div key={s.t} className="rounded border border-border p-3">
              <p className="text-xs font-medium text-fg">{s.t}</p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{s.d}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Start a physical verification"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={start}>Start</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Warehouse"
            value={form.warehouse}
            onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
            options={warehouseSummaries.map((w) => ({ value: w.name, label: `${w.code} — ${w.name}` }))}
          />
          <Input label="Scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
          <Select
            label="Led by"
            value={form.counter}
            onChange={(e) => setForm({ ...form, counter: e.target.value })}
            options={['K. Ravi', 'M. Lakshmi', 'P. Suresh', 'M. Devi'].map((n) => ({ value: n, label: n }))}
          />
          <Input label="Complete by" type="date" value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
          <Select
            label="Freeze the warehouse?"
            containerClassName="sm:col-span-2"
            value={form.freeze}
            onChange={(e) => setForm({ ...form, freeze: e.target.value })}
            hint={form.freeze === 'yes' ? 'Recommended — no movement can post while counting' : 'Movements during the count must then be reconciled line by line'}
            options={[{ value: 'yes', label: 'Yes — block all movements (recommended)' }, { value: 'no', label: 'No — count live' }]}
          />
        </div>
        <p className="mt-3 text-2xs text-fg-subtle">
          A freeze is disruptive on purpose. Counting a warehouse while material moves through it produces a number nobody can
          defend two weeks later.
        </p>
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
