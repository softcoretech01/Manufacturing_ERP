import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pause, Play, Square } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { Duration, EfficiencyChip, MesDetailBlock, MesStatusBadge, OperationCell, ProgressCell } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { productionEntries, workOrders as seedWorkOrders } from '@/mock/mes'
import type { WorkOrder } from '@/types/mes'

/**
 * Work orders — one per routing operation. The floor works this list, not the
 * production order: each row is a real job on a real machine with a real person.
 */
export function WorkOrdersPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const seed = useMemo(() => seedWorkOrders, [])
  const { rows: workOrders, update } = useCollection<WorkOrder>('mes:workorder', seed)
  const rowEdit = useRowEdit<WorkOrder>({
    key: 'mes:workorder',
    seed: seed,
    entity: 'Work order',
    titleOf: (r) => r.docNo,
  })

  const [tab, setTab] = useState('active')
  const [detail, setDetail] = useState<WorkOrder | null>(null)

  const filtered = workOrders.filter((w) => {
    if (tab === 'active') return ['READY', 'SETUP', 'RUNNING', 'PAUSED'].includes(w.status)
    if (tab === 'queued') return w.status === 'QUEUED'
    if (tab === 'hold') return w.status === 'QC_HOLD'
    if (tab === 'done') return w.status === 'COMPLETED'
    return true
  })

  const running = workOrders.filter((w) => w.status === 'RUNNING')
  const yieldPct = (w: WorkOrder) => (w.inputQty ? (w.producedQty / w.inputQty) * 100 : 0)

  /** Only one operation can be running per machine, and sequence must be respected. */
  function start(w: WorkOrder) {
    const previous = workOrders.filter((x) => x.productionOrderNo === w.productionOrderNo && x.sequence < w.sequence)
    const unfinished = previous.filter((x) => x.status !== 'COMPLETED')
    if (unfinished.length) {
      toast.error(
        'Earlier operation is not finished',
        `${unfinished[0].operationName} (seq ${unfinished[0].sequence}) must complete before ${w.operationName} can start — the material has not reached this station yet.`,
      )
      return
    }
    const busy = workOrders.find((x) => x.machine && x.machine === w.machine && x.status === 'RUNNING')
    if (busy) {
      toast.error('Machine already running', `${w.machine} is on ${busy.docNo} (${busy.operationName}). Pause or finish that first.`)
      return
    }
    update(w.uid, { status: 'RUNNING', startedAt: new Date().toISOString() })
    toast.success('Started', `${w.docNo} — ${w.operationName} running on ${w.machine ?? 'the work centre'}. Machine and labour hours are now accumulating.`)
  }

  function complete(w: WorkOrder) {
    if (w.producedQty === 0) {
      toast.error('Nothing booked yet', 'Post a production entry before completing the operation — the quantity has to come from somewhere.')
      return
    }
    update(w.uid, {
      status: w.qcRequired ? 'QC_HOLD' : 'COMPLETED',
      completedAt: new Date().toISOString(),
      qcResult: w.qcRequired ? 'PENDING' : 'NOT_REQUIRED',
    })
    const next = workOrders.find((x) => x.productionOrderNo === w.productionOrderNo && x.sequence === w.sequence + 1)
    if (next && !w.qcRequired) update(next.uid, { status: 'READY', inputQty: w.producedQty })
    toast.success(
      w.qcRequired ? 'Sent for inspection' : 'Operation complete',
      w.qcRequired
        ? `${formatQty(w.producedQty)} ${w.uom} held for QC. The next operation stays queued until it passes.`
        : `${formatQty(w.producedQty)} ${w.uom} moved on to ${next ? next.operationName : 'finished goods'}.`,
    )
  }

  const columns: Column<WorkOrder>[] = [
    { key: 'docNo', header: 'Work order', sortable: true, width: '11rem', render: (w) => (
      <div>
        <p className="font-mono text-xs font-medium text-brand-600">{w.docNo}</p>
        <p className="font-mono text-2xs text-fg-subtle">{w.productionOrderNo}</p>
      </div>
    ) },
    { key: 'sequence', header: 'Operation', sortable: true, render: (w) => <OperationCell sequence={w.sequence} name={w.operationName} workCentre={w.workCentre} /> },
    { key: 'machine', header: 'Machine', sortable: true, width: '9rem', render: (w) => <span className="font-mono text-2xs">{w.machine ?? '—'}</span> },
    { key: 'tool', header: 'Tool', width: '10rem', defaultHidden: true, render: (w) => <span className="text-2xs text-fg-muted">{w.tool ?? '—'}</span> },
    { key: 'operator', header: 'Operator', sortable: true, render: (w) => (w.operator ? <span className="text-xs">{w.operator}{w.shift ? ` · ${w.shift}` : ''}</span> : <span className="text-2xs text-fg-subtle">unassigned</span>) },
    { key: 'inputQty', header: 'In', align: 'right', width: '6rem', sortable: true, render: (w) => (w.inputQty ? <span className="tabular">{formatQty(w.inputQty)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'producedQty', header: 'Out', width: '11rem', accessor: (w) => w.producedQty, render: (w) => <ProgressCell done={w.producedQty} total={w.inputQty || w.plannedQty} /> },
    { key: 'scrapQty', header: 'Scrap', align: 'right', width: '6rem', sortable: true, render: (w) => (w.scrapQty ? <span className="tabular text-danger">{w.scrapQty}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'yield', header: 'Yield', align: 'right', width: '6rem', accessor: (w) => yieldPct(w), render: (w) => (
      w.inputQty ? <span className={cn('tabular text-2xs', yieldPct(w) < 96 ? 'text-warning' : 'text-success')}>{yieldPct(w).toFixed(1)}%</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'actualMinutes', header: 'Time', width: '7rem', render: (w) => <Duration minutes={w.actualMinutes} /> },
    { key: 'efficiency', header: 'vs standard', align: 'right', width: '8rem', accessor: (w) => (w.actualMinutes ? (w.standardMinutes / w.actualMinutes) * 100 : 0), render: (w) => <EfficiencyChip standard={w.standardMinutes} actual={w.actualMinutes} /> },
    { key: 'qcResult', header: 'QC', width: '8rem', render: (w) => (w.qcRequired ? <MesStatusBadge status={w.qcResult} size="sm" /> : <span className="text-2xs text-fg-subtle">not required</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (w) => <MesStatusBadge status={w.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'work-orders', 'Work order register', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const detailEntries = detail ? productionEntries.filter((e) => e.workOrderNo === detail.docNo) : []

  return (
    <div>
      <PageHeader
        title="Work orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Work orders' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/production/queue')}>Operation queue</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/production/entry')}>Book production</Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'active', label: 'On the floor', count: workOrders.filter((w) => ['READY', 'SETUP', 'RUNNING', 'PAUSED'].includes(w.status)).length },
              { id: 'queued', label: 'Queued', count: workOrders.filter((w) => w.status === 'QUEUED').length },
              { id: 'hold', label: 'QC hold', count: workOrders.filter((w) => w.status === 'QC_HOLD').length },
              { id: 'done', label: 'Completed', count: workOrders.filter((w) => w.status === 'COMPLETED').length },
              { id: 'all', label: 'All', count: workOrders.length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        One work order per routing operation. An operation cannot start before the one in front of it has finished, and a machine
        can only run one at a time — the same two rules the floor already works to.{' '}
        <span className="font-medium text-success">{running.length}</span> running now.
      </p>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(w) => w.uid}
        searchPlaceholder="Search work order, operation, machine or operator…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No work orders in this state"
        rowClassName={(w) => cn(w.status === 'RUNNING' && 'bg-success/[0.04]', w.status === 'QC_HOLD' && 'bg-danger/[0.04]')}
        rowActions={(w) => (
          <>
            {rowEdit.actions(w)}
            <MenuItem label="Open" onClick={() => setDetail(w)} />
            <MenuItem label="Start operation" icon={<Play />} disabled={w.status !== 'READY' && w.status !== 'PAUSED'} onClick={() => start(w)} />
            <MenuItem
              label="Pause"
              icon={<Pause />}
              disabled={w.status !== 'RUNNING'}
              onClick={() => {
                update(w.uid, { status: 'PAUSED' })
                toast.success('Paused', `${w.docNo} paused — record why on the downtime screen so the lost minutes are explained.`)
              }}
            />
            <MenuItem label="Complete operation" icon={<Square />} disabled={w.status !== 'RUNNING'} onClick={() => complete(w)} />
            <MenuItem label="Book production against it" separatorBefore onClick={() => navigate('/production/entry')} />
            <MenuItem label="Open work instruction" onClick={() => navigate('/production/instructions')} />
          </>
        )}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.operationName} · ${detail.workCentre}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {(detail.status === 'READY' || detail.status === 'PAUSED') && (
                <Button variant="success" size="sm" onClick={() => { start(detail); setDetail(null) }}>Start</Button>
              )}
              {detail.status === 'RUNNING' && (
                <Button variant="primary" size="sm" onClick={() => { complete(detail); setDetail(null) }}>Complete</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <MesStatusBadge status={detail.status} />
              {detail.qcRequired && <Badge tone="warning" size="sm" dot={false}>Inspection point</Badge>}
              {detail.batchNo && <Badge tone="brand" size="sm" dot={false}>Batch {detail.batchNo}</Badge>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Production order', value: detail.productionOrderNo, mono: true },
                { label: 'Sequence', value: `${detail.sequence} of 15` },
                { label: 'Operation', value: `${detail.operationCode} — ${detail.operationName}` },
                { label: 'Work centre', value: detail.workCentre },
                { label: 'Machine', value: detail.machine ?? 'Not assigned' },
                { label: 'Tool / die', value: detail.tool ?? '—' },
                { label: 'Operator · shift', value: detail.operator ? `${detail.operator} · ${detail.shift}` : 'Unassigned' },
                { label: 'Input quantity', value: detail.inputQty ? `${formatQty(detail.inputQty)} ${detail.uom}` : 'Awaiting the previous operation' },
                { label: 'Produced', value: `${formatQty(detail.producedQty)} ${detail.uom}` },
                { label: 'Scrap · rework', value: `${detail.scrapQty} · ${detail.reworkQty}` },
                { label: 'Standard time', value: `${detail.standardMinutes} min (setup ${detail.setupMinutes} min)` },
                { label: 'Actual time', value: detail.actualMinutes ? `${detail.actualMinutes} min` : 'Not started' },
                { label: 'Started', value: detail.startedAt ? formatDateTime(detail.startedAt) : '—' },
                { label: 'Completed', value: detail.completedAt ? formatDateTime(detail.completedAt) : '—' },
              ]}
            />

            <MesDetailBlock title={`Production entries (${detailEntries.length})`}>
              {detailEntries.length === 0 ? (
                <p className="text-xs text-fg-subtle">Nothing booked against this work order yet.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>Entry</th>
                        <th>Window</th>
                        <th>Operator</th>
                        <th className="text-right">Good</th>
                        <th className="text-right">Scrap</th>
                        <th className="text-right">Rework</th>
                        <th className="text-right">Cycle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailEntries.map((e) => (
                        <tr key={e.uid}>
                          <td className="font-mono text-2xs text-brand-600">{e.docNo}</td>
                          <td className="text-2xs">{formatDateTime(e.startedAt).slice(-5)} → {formatDateTime(e.endedAt).slice(-5)}</td>
                          <td className="text-xs">{e.operator} · {e.shift}</td>
                          <td className="text-right tabular text-success">{formatQty(e.goodQty)}</td>
                          <td className="text-right tabular text-danger">{e.scrapQty || '—'}</td>
                          <td className="text-right tabular text-warning">{e.reworkQty || '—'}</td>
                          <td className="text-right tabular text-2xs">{e.cycleSeconds}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </MesDetailBlock>

            <p className="text-2xs leading-relaxed text-fg-subtle">
              Completing an operation moves its good quantity to the next one as input, updates machine and labour hours, and —
              where the operation is an inspection point — holds the lot until quality releases it.
            </p>
          </div>
        )}
      </Drawer>

      {rowEdit.dialogs}
    </div>
  )
}
