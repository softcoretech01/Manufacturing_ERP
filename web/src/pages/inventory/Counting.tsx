import { useMemo, useState } from 'react'
import { Check, EyeOff, Lock, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { ApprovalTrail, DetailBlock, InvStatusBadge, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { useCurrentUser } from '@/store/auth'
import { accuracyTrend, counts as seedCounts, warehouseSummaries } from '@/mock/inventory'
import type { CountDoc, RootCause } from '@/types/inventory'

const ROOT_CAUSES: { value: RootCause; label: string }[] = [
  { value: 'RECEIPT_ERROR', label: 'Receipt error' },
  { value: 'ISSUE_ERROR', label: 'Issue error' },
  { value: 'PUT_AWAY_ERROR', label: 'Put-away error' },
  { value: 'WEIGHMENT', label: 'Weighment' },
  { value: 'UOM_CONVERSION', label: 'UOM conversion' },
  { value: 'PILFERAGE', label: 'Pilferage' },
  { value: 'DAMAGE_UNREPORTED', label: 'Unreported damage' },
  { value: 'SYSTEM_TIMING', label: 'System timing' },
  { value: 'UNKNOWN', label: 'Unknown' },
]

export function CountingPage() {
  const toast = useToast()
  const user = useCurrentUser()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedCounts, [])
  const { rows: counts, create, update } = useCollection<CountDoc>('inv:count', seed)
  const rowEdit = useRowEdit<CountDoc>({
    key: 'inv:count',
    seed: seed,
    entity: 'Count sheet',
    titleOf: (r) => r.docNo,
  })

  const [detail, setDetail] = useState<CountDoc | null>(null)
  const [sheet, setSheet] = useState<CountDoc | null>(null)
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [causes, setCauses] = useState<Record<string, RootCause>>({})
  const [planOpen, setPlanOpen] = useState(false)
  const [plan, setPlan] = useState({ warehouse: 'Raw Material Store', scope: 'Rack Area A', abcClass: 'A', counter: 'S. Kumar', dueOn: '' })

  const stats = {
    open: counts.filter((c) => c.status === 'ASSIGNED' || c.status === 'COUNTED' || c.status === 'RECOUNT_REQUIRED').length,
    recounts: counts.filter((c) => c.status === 'RECOUNT_REQUIRED').length,
    frozen: counts.filter((c) => c.isFrozen).length,
    accuracy: accuracyTrend[accuracyTrend.length - 1].accuracyPct,
    coverage: { a: 100, b: 72, c: 41 },
  }

  const columns: Column<CountDoc>[] = [
    { key: 'docNo', header: 'Count', sortable: true, width: '11rem', render: (c) => <span className="font-mono text-xs font-medium text-brand-600">{c.docNo}</span> },
    { key: 'countType', header: 'Type', sortable: true, width: '9rem', render: (c) => (
      <Badge tone={c.countType === 'PHYSICAL_VERIFICATION' ? 'danger' : c.countType === 'EVENT' ? 'warning' : 'neutral'} size="sm" dot={false}>
        {c.countType === 'PHYSICAL_VERIFICATION' ? 'Full PV' : c.countType.toLowerCase()}
      </Badge>
    ) },
    { key: 'warehouse', header: 'Warehouse', sortable: true },
    { key: 'scope', header: 'Scope' },
    { key: 'counter', header: 'Counter', sortable: true, width: '9rem' },
    { key: 'dueOn', header: 'Due', sortable: true, width: '7rem', accessor: (c) => c.dueOn, render: (c) => {
      const overdue = new Date(c.dueOn).getTime() < Date.now() && c.status !== 'POSTED'
      return <span className={cn('text-2xs', overdue ? 'font-medium text-danger' : 'text-fg-muted')}>{formatDate(c.dueOn)}</span>
    } },
    { key: 'bins', header: 'Bins', align: 'right', width: '6rem', accessor: (c) => c.binsCounted, render: (c) => `${c.binsCounted}/${c.binsPlanned}` },
    { key: 'linesWithVariance', header: 'Variances', align: 'right', width: '6.5rem', sortable: true },
    { key: 'accuracyPct', header: 'Accuracy', align: 'right', width: '7rem', sortable: true, render: (c) => (c.binsCounted ? <span className={cn(c.accuracyPct < 95 && 'text-warning')}>{c.accuracyPct.toFixed(1)}%</span> : '—') },
    ...(canSeeValue
      ? [{
          key: 'netVarianceValue',
          header: 'Variance value',
          align: 'right' as const,
          sortable: true,
          render: (c: CountDoc) => (c.netVarianceValue ? <span className={cn(c.netVarianceValue < 0 ? 'text-danger' : 'text-success')}>{formatCurrency(c.netVarianceValue)}</span> : '—'),
        }]
      : []),
    { key: 'isFrozen', header: 'Freeze', align: 'center', width: '6rem', accessor: (c) => (c.isFrozen ? 'Frozen' : ''), render: (c) => (c.isFrozen ? <Badge tone="progress" size="sm">Frozen</Badge> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '11rem', render: (c) => <InvStatusBadge status={c.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'count-register', 'Cycle count register', columnsFromTable(columns), counts)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function openSheet(c: CountDoc) {
    setSheet(c)
    setEntries(Object.fromEntries(c.lines.map((l) => [l.uid, l.countedQty !== null ? String(l.countedQty) : ''])))
  }

  function submitSheet() {
    if (!sheet) return
    const missing = sheet.lines.filter((l) => !entries[l.uid] && entries[l.uid] !== '0')
    if (missing.length) {
      toast.error('Incomplete sheet', `${missing.length} line(s) not counted. Mark a bin empty with 0 rather than leaving it blank.`)
      return
    }
    // System quantities are revealed only now — the sheet was blind (V4-CNT-BR-002).
    const lines = sheet.lines.map((l) => {
      const counted = Number(entries[l.uid])
      const system = l.systemQty ?? Math.round(counted * (0.98 + Math.random() * 0.04))
      const variance = counted - system
      const variancePct = system ? (variance / system) * 100 : null
      const within = variancePct === null ? false : Math.abs(variancePct) <= l.tolerancePct
      return {
        ...l,
        systemQty: system,
        countedQty: counted,
        varianceQty: variance,
        variancePct,
        withinTolerance: within,
        recountRequired: !within && variance !== 0,
      }
    })
    const varianceLines = lines.filter((l) => (l.varianceQty ?? 0) !== 0)
    const needsRecount = lines.some((l) => l.recountRequired)
    update(sheet.uid, {
      lines,
      binsCounted: sheet.binsPlanned,
      linesWithVariance: varianceLines.length,
      accuracyPct: ((lines.length - varianceLines.length) / lines.length) * 100,
      status: needsRecount ? 'RECOUNT_REQUIRED' : 'PENDING_APPROVAL',
      countedOn: new Date().toISOString().slice(0, 10),
    })
    toast.success(
      'Count submitted',
      needsRecount
        ? 'Variances beyond tolerance need a recount by a different person before this can post.'
        : `${varianceLines.length} variance line(s) within tolerance — routed for approval.`,
    )
    setSheet(null)
  }

  /** The counter never approves their own count (SoD rule SOD-INV-02). */
  function canApprove(c: CountDoc) {
    return (c.status === 'PENDING_APPROVAL' || c.status === 'COUNTED') && c.counter !== (user?.fullName ?? '')
  }

  function postCount(c: CountDoc) {
    const missingCause = c.lines.filter((l) => (l.varianceQty ?? 0) !== 0 && !(causes[l.uid] ?? l.rootCause))
    if (missingCause.length) {
      toast.error('Root cause required', `${missingCause.length} variance line(s) have no root cause. "It just happened" is not a category.`)
      return
    }
    update(c.uid, {
      status: 'POSTED',
      postedOn: new Date().toISOString().slice(0, 10),
      isFrozen: false,
      lines: c.lines.map((l) => ({ ...l, rootCause: causes[l.uid] ?? l.rootCause })),
      approvals: c.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: 'APPROVED' as const, actedAt: new Date().toISOString(), approver: user?.fullName ?? 'Approver' } : a)),
    })
    toast.success('Count posted', `${c.docNo} posted — variances written to the ledger as movements 403/404 and the freeze lifted.`)
    setDetail(null)
  }

  function createPlan() {
    const next = Math.max(...counts.map((c) => Number(c.docNo.slice(-4)) || 0)) + 1
    const docNo = `CC/26-27/${String(next).padStart(4, '0')}`
    create({
      uid: newUid('cc'),
      docNo,
      countType: 'CYCLE',
      status: 'ASSIGNED',
      warehouse: plan.warehouse,
      scope: `${plan.scope} · ${plan.abcClass}-class`,
      abcClass: plan.abcClass as CountDoc['abcClass'],
      counter: plan.counter,
      assignedOn: new Date().toISOString().slice(0, 10),
      dueOn: plan.dueOn || new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      binsPlanned: 3,
      binsCounted: 0,
      linesWithVariance: 0,
      accuracyPct: 0,
      netVarianceValue: 0,
      isFrozen: false,
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'PENDING' }],
      lines: [
        { uid: newUid('ccl'), bin: 'A-02-1-1', itemCode: 'CMP-SEAL-68', itemName: 'Silicone Sealing Ring 68 mm', uom: 'NOS', batchNo: 'B2607014', systemQty: null, countedQty: null, varianceQty: null, variancePct: null, valueImpact: 0, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, isFoundStock: false },
        { uid: newUid('ccl'), bin: 'A-02-1-2', itemCode: 'CMP-INS-PP-750', itemName: 'PP Lid Insert — 750 ml', uom: 'NOS', batchNo: 'B2606018', systemQty: null, countedQty: null, varianceQty: null, variancePct: null, valueImpact: 0, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, isFoundStock: false },
        { uid: newUid('ccl'), bin: 'A-02-2-1', itemCode: 'CMP-LID-SCR-SS', itemName: 'Screw Cap — Stainless', uom: 'NOS', batchNo: 'B2607021', systemQty: null, countedQty: null, varianceQty: null, variancePct: null, valueImpact: 0, tolerancePct: 0.5, withinTolerance: true, recountRequired: false, isFoundStock: false },
      ],
    } as CountDoc)
    toast.success('Count assigned', `${docNo} assigned to ${plan.counter}. The sheet is blind — system quantities are not sent to the device.`)
    setPlanOpen(false)
  }

  return (
    <div>
      <PageHeader
        title="Cycle count & verification"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Counting' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Lock className="h-4 w-4" />} onClick={() => toast.warning('Freeze', 'A full physical verification freezes the warehouse: no issue, receipt, transfer or adjustment may post until it lifts.')}>
              Start verification
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPlanOpen(true)}>
              Assign count
            </Button>
          </>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{stats.open}</span> open count{stats.open === 1 ? '' : 's'} ·{' '}
        <span className={cn('font-medium', stats.recounts ? 'text-warning' : 'text-fg')}>{stats.recounts}</span> awaiting recount ·
        accuracy <span className="font-medium text-fg tabular">{stats.accuracy.toFixed(1)}%</span> (target ≥ 98%) ·{' '}
        <span className="font-medium text-fg">{stats.frozen}</span> location{stats.frozen === 1 ? '' : 's'} frozen · coverage
        A {stats.coverage.a}% · B {stats.coverage.b}% · C {stats.coverage.c}%
      </p>

      <DataTable
        rows={counts}
        columns={columns}
        rowKey={(c) => c.uid}
        searchPlaceholder="Search count, warehouse, scope or counter…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No counts scheduled"
        rowActions={(c) => (
          <>
            {rowEdit.actions(c)}
            <MenuItem label="Open" onClick={() => setDetail(c)} />
            <MenuItem
              label="Enter count (blind sheet)"
              icon={<EyeOff />}
              disabled={c.status !== 'ASSIGNED' && c.status !== 'RECOUNT_REQUIRED'}
              onClick={() => openSheet(c)}
            />
            <MenuItem
              label="Approve & post"
              icon={<Check />}
              disabled={!canApprove(c)}
              onClick={() => postCount(c)}
            />
            <MenuItem
              label="Assign recount to someone else"
              separatorBefore
              disabled={c.status !== 'RECOUNT_REQUIRED'}
              onClick={() => {
                const others = ['S. Kumar', 'M. Devi', 'P. Suresh', 'K. Ravi'].filter((n) => n !== c.counter)
                const next = others[0]
                update(c.uid, {
                  counter: next,
                  status: 'ASSIGNED',
                  lines: c.lines.map((l) => (l.recountRequired ? { ...l, recountBy: next, countedQty: null } : l)),
                })
                toast.success('Recount assigned', `${next} will recount ${c.docNo}. A recount is never done by the person whose count is being checked.`)
              }}
            />
          </>
        )}
        rowClassName={(c) => cn(c.status === 'RECOUNT_REQUIRED' && 'bg-warning/[0.04]')}
      />

      {/* Count detail --------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.warehouse} · ${detail.scope}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">Counted by {detail.counter}</span>
              <div className="flex gap-2">
                {(detail.status === 'ASSIGNED' || detail.status === 'RECOUNT_REQUIRED') && (
                  <Button variant="outline" size="sm" onClick={() => { openSheet(detail); setDetail(null) }}>
                    Enter count
                  </Button>
                )}
                {(detail.status === 'PENDING_APPROVAL' || detail.status === 'COUNTED') && (
                  <Button variant="success" size="sm" disabled={!canApprove(detail)} onClick={() => postCount(detail)}>
                    {canApprove(detail) ? 'Approve & post' : 'Blocked — you counted this'}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InvStatusBadge status={detail.status} />
              {detail.isFrozen && <Badge tone="progress" size="sm">Locations frozen</Badge>}
              {detail.status === 'RECOUNT_REQUIRED' && <Badge tone="warning" size="sm">Recount by a different person</Badge>}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-fg-muted">Bins counted</span>
                <span className="tabular text-fg">{detail.binsCounted} / {detail.binsPlanned}</span>
              </div>
              <ProgressBar value={(detail.binsCounted / detail.binsPlanned) * 100} tone={detail.binsCounted === detail.binsPlanned ? 'success' : 'brand'} height="h-2" showLabel />
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Type', value: detail.countType === 'PHYSICAL_VERIFICATION' ? 'Full physical verification' : detail.countType.toLowerCase() },
                { label: 'ABC class', value: String(detail.abcClass) },
                { label: 'Counter', value: detail.counter },
                { label: 'Assigned', value: formatDate(detail.assignedOn) },
                { label: 'Due', value: formatDate(detail.dueOn) },
                { label: 'Counted on', value: detail.countedOn ? formatDate(detail.countedOn) : 'Not yet' },
                { label: 'Accuracy', value: detail.binsCounted ? `${detail.accuracyPct.toFixed(1)}%` : '—' },
                ...(canSeeValue ? [{ label: 'Net variance value', value: formatCurrency(detail.netVarianceValue) }] : []),
              ]}
            />

            <DetailBlock title={`Lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Bin · item</th>
                      <th className="text-right">System</th>
                      <th className="text-right">Counted</th>
                      <th className="text-right">Variance</th>
                      <th className="text-right">%</th>
                      <th>Root cause</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid} className={cn(l.recountRequired && 'bg-warning/[0.06]', l.isFoundStock && 'bg-progress/[0.06]')}>
                        <td>
                          <p className="font-mono text-2xs text-fg">{l.bin ?? '—'}</p>
                          <p className="truncate text-xs text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.batchNo ?? 'no batch'}</p>
                        </td>
                        <td className="text-right tabular text-fg-muted">
                          {l.systemQty === null ? <span className="text-2xs italic text-fg-subtle">hidden</span> : formatQty(l.systemQty)}
                        </td>
                        <td className="text-right tabular">{l.countedQty === null ? '—' : formatQty(l.countedQty)}</td>
                        <td className={cn('text-right tabular font-medium', (l.varianceQty ?? 0) < 0 ? 'text-danger' : (l.varianceQty ?? 0) > 0 ? 'text-success' : '')}>
                          {l.varianceQty === null ? '—' : `${l.varianceQty > 0 ? '+' : ''}${formatQty(l.varianceQty)}`}
                        </td>
                        <td className="text-right tabular text-2xs">{l.variancePct === null ? '—' : `${l.variancePct.toFixed(2)}%`}</td>
                        <td className="w-40">
                          {(l.varianceQty ?? 0) !== 0 ? (
                            <Select
                              sizeVariant="sm"
                              value={causes[l.uid] ?? l.rootCause ?? ''}
                              onChange={(e) => setCauses({ ...causes, [l.uid]: e.target.value as RootCause })}
                              options={[{ value: '', label: 'Choose cause…' }, ...ROOT_CAUSES]}
                            />
                          ) : (
                            <span className="text-2xs text-fg-subtle">—</span>
                          )}
                        </td>
                        <td>
                          {l.isFoundStock ? (
                            <Badge tone="progress" size="sm">Found stock</Badge>
                          ) : l.recountRequired ? (
                            <Badge tone="warning" size="sm">Recount</Badge>
                          ) : l.countedQty === null ? (
                            <span className="text-2xs text-fg-subtle">Not counted</span>
                          ) : (
                            <span className="text-2xs text-success">Within tolerance</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title="Approval">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>

            <p className="text-2xs leading-relaxed text-fg-subtle">
              Found stock of a batch-managed item with no identifiable batch is quarantined for QC disposition — never merged
              into the nearest existing batch, because that destroys the traceability the batch exists for.
            </p>
          </div>
        )}
      </Drawer>

      {/* Blind count sheet ---------------------------------------------------- */}
      <Modal
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet ? `Blind count sheet — ${sheet.docNo}` : ''}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSheet(null)}>Save & close</Button>
            <Button variant="primary" onClick={submitSheet}>Submit count</Button>
          </>
        }
      >
        {sheet && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded border border-progress/30 bg-progress/5 px-3 py-2 text-xs text-progress">
              <EyeOff className="h-3.5 w-3.5 shrink-0" />
              System quantities are hidden until this sheet is submitted — in the UI, in the export and in the API response.
            </div>
            <p className="text-xs text-fg-muted">
              {sheet.warehouse} · {sheet.scope} · counter {sheet.counter} · due {formatDate(sheet.dueOn)}
            </p>
            <div className="overflow-x-auto rounded border border-border">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Bin</th>
                    <th>Item</th>
                    <th>Batch</th>
                    <th>UOM</th>
                    <th className="w-32">Counted</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.lines.map((l) => (
                    <tr key={l.uid}>
                      <td className="font-mono text-2xs">{l.bin ?? '—'}</td>
                      <td>
                        <p className="text-xs font-medium text-fg">{l.itemName}</p>
                        <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                      </td>
                      <td className="font-mono text-2xs">{l.batchNo ?? '—'}</td>
                      <td className="text-2xs">{l.uom}</td>
                      <td>
                        <Input
                          sizeVariant="sm"
                          type="number"
                          value={entries[l.uid] ?? ''}
                          onChange={(e) => setEntries({ ...entries, [l.uid]: e.target.value })}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-2xs text-fg-subtle">
              Record an empty bin as 0 rather than leaving it blank. Material found that the system does not expect is added as
              a found-stock line, not discarded.
            </p>
          </div>
        )}
      </Modal>

      {/* Assign count --------------------------------------------------------- */}
      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title="Assign a cycle count"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={createPlan}>Assign</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Warehouse"
            value={plan.warehouse}
            onChange={(e) => setPlan({ ...plan, warehouse: e.target.value })}
            options={warehouseSummaries.filter((w) => w.isBinManaged).map((w) => ({ value: w.name, label: `${w.code} — ${w.name}` }))}
          />
          <Input label="Scope" value={plan.scope} onChange={(e) => setPlan({ ...plan, scope: e.target.value })} hint="Zone, bin range or item class" />
          <Select
            label="ABC class"
            value={plan.abcClass}
            onChange={(e) => setPlan({ ...plan, abcClass: e.target.value })}
            options={[
              { value: 'A', label: 'A — monthly, 0.5% tolerance' },
              { value: 'B', label: 'B — quarterly, 1% tolerance' },
              { value: 'C', label: 'C — half-yearly, 2% tolerance' },
              { value: 'ALL', label: 'All classes' },
            ]}
          />
          <Select
            label="Counter"
            value={plan.counter}
            onChange={(e) => setPlan({ ...plan, counter: e.target.value })}
            options={['S. Kumar', 'M. Devi', 'P. Suresh', 'K. Ravi'].map((n) => ({ value: n, label: n }))}
          />
          <Input label="Due date" type="date" containerClassName="sm:col-span-2" value={plan.dueOn} onChange={(e) => setPlan({ ...plan, dueOn: e.target.value })} />
        </div>
        <p className="mt-3 text-2xs text-fg-subtle">
          The counter will not see the system quantity, and cannot approve the variance they produce.
        </p>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Why counting is blind, twice-passed and approved elsewhere" description="Three rules that turn a stocktake into a control" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Blind.</span> A sheet showing the expected figure is not a count — it is a
            confirmation. The system quantity is absent from the device until the sheet is submitted.
          </p>
          <p>
            <span className="font-medium text-fg">Two passes.</span> Any variance beyond the item's tolerance is recounted by a
            different person, and it is the second count that posts.
          </p>
          <p>
            <span className="font-medium text-fg">Root cause, not absorption.</span> Every posted variance carries a reason and a
            root-cause class. The share of "unknown" is itself a reported metric.
          </p>
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
