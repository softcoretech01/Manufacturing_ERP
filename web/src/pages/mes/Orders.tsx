import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Play, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { MesDetailBlock, MesStatusBadge, ProgressCell } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { useCurrentUser } from '@/store/auth'
import { productionOrders as seedOrders, workOrders as seedWorkOrders } from '@/mock/mes'
import type { ProductionOrder, WorkOrder } from '@/types/mes'

const CHECKS: { key: keyof ProductionOrder; label: string; fix: string }[] = [
  { key: 'materialReady', label: 'Material available', fix: 'Stock or an open receipt does not cover the BOM for this quantity.' },
  { key: 'machineReady', label: 'Machine available', fix: 'A machine on the routing is down or already committed.' },
  { key: 'toolingReady', label: 'Tooling available', fix: 'A die, jig or fixture on the routing is out of service.' },
  { key: 'manpowerReady', label: 'Manpower available', fix: 'Not enough certified operators are rostered for the shift.' },
]

/**
 * Production orders — the release gate. An order only becomes work on the shop
 * floor once material, machine, tooling and manpower have all been checked.
 */
export function ProductionOrdersPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const orderSeed = useMemo(() => seedOrders, [])
  const woSeed = useMemo(() => seedWorkOrders, [])
  const { rows: orders, update } = useCollection<ProductionOrder>('mes:order', orderSeed)
  const rowEdit = useRowEdit<ProductionOrder>({
    key: 'mes:order',
    seed: orderSeed,
    entity: 'Production order',
    titleOf: (r) => r.docNo,
  })
  const { rows: workOrders } = useCollection<WorkOrder>('mes:workorder', woSeed)

  const [tab, setTab] = useState('open')
  const [detail, setDetail] = useState<ProductionOrder | null>(null)
  const [holdTarget, setHoldTarget] = useState<ProductionOrder | null>(null)
  const [holdReason, setHoldReason] = useState('')

  const filtered = orders.filter((o) => {
    if (tab === 'open') return ['PLANNED', 'RELEASED', 'MATERIAL_ALLOCATED', 'IN_PROGRESS', 'ON_HOLD'].includes(o.status)
    if (tab === 'planned') return o.status === 'PLANNED'
    if (tab === 'running') return o.status === 'IN_PROGRESS'
    if (tab === 'done') return o.status === 'COMPLETED' || o.status === 'CLOSED'
    return true
  })

  const blocked = orders.filter((o) => o.status === 'PLANNED' && CHECKS.some((c) => !o[c.key]))
  const late = orders.filter((o) => ['RELEASED', 'IN_PROGRESS'].includes(o.status) && new Date(o.plannedEnd).getTime() < Date.now())

  function readiness(o: ProductionOrder) {
    return CHECKS.filter((c) => o[c.key]).length
  }

  function release(o: ProductionOrder) {
    const missing = CHECKS.filter((c) => !o[c.key])
    if (missing.length) {
      toast.error(
        'Cannot release yet',
        `${missing.map((m) => m.label.toLowerCase()).join(', ')} — fix that first. Releasing an order the floor cannot start just moves the problem downstream.`,
      )
      return
    }
    update(o.uid, { status: 'RELEASED', releasedBy: user?.fullName ?? 'Planner', releasedAt: new Date().toISOString() })
    toast.success('Order released', `${o.docNo} released to ${o.line}. ${workOrders.filter((w) => w.productionOrderNo === o.docNo).length || 15} work orders generated, one per routing operation, plus a traveller card.`)
  }

  const columns: Column<ProductionOrder>[] = [
    { key: 'docNo', header: 'Order', sortable: true, width: '11rem', render: (o) => <span className="font-mono text-xs font-medium text-brand-600">{o.docNo}</span> },
    { key: 'itemCode', header: 'Product', sortable: true, render: (o) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{o.itemName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{o.itemCode} · BOM {o.bomRevision} · routing {o.routingRevision}</p>
      </div>
    ) },
    { key: 'line', header: 'Line', sortable: true, width: '6.5rem' },
    { key: 'customer', header: 'For', sortable: true, render: (o) => (
      o.customer ? <div><p className="truncate text-xs">{o.customer}</p><p className="font-mono text-2xs text-fg-subtle">{o.salesOrderNo}</p></div> : <span className="text-2xs text-fg-subtle">Stock build</span>
    ) },
    { key: 'plannedQty', header: 'Quantity', align: 'right', sortable: true, render: (o) => <span className="tabular">{formatQty(o.plannedQty)} <span className="text-2xs text-fg-subtle">{o.uom}</span></span> },
    { key: 'progress', header: 'Made', width: '11rem', accessor: (o) => o.producedQty, render: (o) => <ProgressCell done={o.producedQty} total={o.plannedQty} /> },
    { key: 'scrapQty', header: 'Scrap', align: 'right', width: '6rem', sortable: true, render: (o) => (o.scrapQty ? <span className="tabular text-danger">{formatQty(o.scrapQty)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'plannedEnd', header: 'Due', sortable: true, width: '8rem', accessor: (o) => o.plannedEnd, render: (o) => {
      const overdue = new Date(o.plannedEnd).getTime() < Date.now() && !['COMPLETED', 'CLOSED'].includes(o.status)
      return <span className={cn('text-2xs', overdue ? 'font-medium text-danger' : 'text-fg-muted')}>{formatDate(o.plannedEnd)}{overdue ? ' · late' : ''}</span>
    } },
    { key: 'readiness', header: 'Ready to run', width: '10rem', accessor: (o) => readiness(o), render: (o) => {
      const n = readiness(o)
      if (['COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status)) return <span className="text-2xs text-fg-subtle">—</span>
      return (
        <div className="flex items-center gap-1.5">
          {CHECKS.map((c) => (
            <span key={String(c.key)} title={c.label} className={cn('h-2 w-2 rounded-full', o[c.key] ? 'bg-success' : 'bg-danger')} />
          ))}
          <span className={cn('ml-1 text-2xs tabular', n === 4 ? 'text-success' : 'text-danger')}>{n}/4</span>
        </div>
      )
    } },
    { key: 'priority', header: 'Priority', width: '6.5rem', sortable: true, render: (o) => (
      <Badge size="sm" dot={false} tone={o.priority === 'URGENT' ? 'danger' : o.priority === 'HIGH' ? 'warning' : 'neutral'}>
        {o.priority.charAt(0) + o.priority.slice(1).toLowerCase()}
      </Badge>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '11rem', render: (o) => <MesStatusBadge status={o.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'production-orders', 'Production order register', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const detailWorkOrders = detail ? workOrders.filter((w) => w.productionOrderNo === detail.docNo) : []

  return (
    <div>
      <PageHeader
        title="Production orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Production orders' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/production/work-orders')}>Work orders</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: orders.filter((o) => ['PLANNED', 'RELEASED', 'MATERIAL_ALLOCATED', 'IN_PROGRESS', 'ON_HOLD'].includes(o.status)).length },
              { id: 'planned', label: 'Awaiting release', count: orders.filter((o) => o.status === 'PLANNED').length },
              { id: 'running', label: 'Running', count: orders.filter((o) => o.status === 'IN_PROGRESS').length },
              { id: 'done', label: 'Finished', count: orders.filter((o) => ['COMPLETED', 'CLOSED'].includes(o.status)).length },
              { id: 'all', label: 'All', count: orders.length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        An order is only released when material, machine, tooling and manpower have all been confirmed — the four dots in the
        "ready to run" column.{' '}
        <span className={cn('font-medium', blocked.length ? 'text-warning' : 'text-success')}>{blocked.length}</span> order
        {blocked.length === 1 ? '' : 's'} cannot be released yet ·{' '}
        <span className={cn('font-medium', late.length ? 'text-danger' : 'text-success')}>{late.length}</span> past the planned
        finish date.
      </p>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(o) => o.uid}
        searchPlaceholder="Search order, product, customer or line…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No production orders"
        rowClassName={(o) => cn(o.status === 'ON_HOLD' && 'bg-warning/[0.04]', o.status === 'PLANNED' && readiness(o) < 4 && 'bg-danger/[0.03]')}
        rowActions={(o) => (
          <>
            {rowEdit.actions(o)}
            <MenuItem label="Open" onClick={() => setDetail(o)} />
            <MenuItem label="Release to the floor" icon={<Play />} disabled={o.status !== 'PLANNED'} onClick={() => release(o)} />
            <MenuItem label="View work orders" onClick={() => navigate('/production/work-orders')} />
            <MenuItem label="Print traveller card" onClick={() => navigate('/production/traveller')} />
            <MenuItem
              label="Put on hold"
              separatorBefore
              disabled={!['RELEASED', 'IN_PROGRESS', 'MATERIAL_ALLOCATED'].includes(o.status)}
              onClick={() => {
                setHoldTarget(o)
                setHoldReason('')
              }}
            />
            <MenuItem
              label="Cancel order"
              danger
              disabled={['COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status) || o.producedQty > 0}
              onClick={() => {
                update(o.uid, { status: 'CANCELLED' })
                toast.success('Cancelled', `${o.docNo} cancelled. An order with production already booked against it cannot be cancelled — it is short-closed instead.`)
              }}
            />
          </>
        )}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.itemName} · ${detail.line}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                {detail.releasedAt ? `Released ${formatDateTime(detail.releasedAt)} by ${detail.releasedBy}` : 'Not released yet'}
              </span>
              <div className="flex gap-2">
                {detail.status === 'PLANNED' && (
                  <Button variant="primary" size="sm" onClick={() => { release(detail); setDetail(null) }}>Release</Button>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate('/production/work-orders')}>Work orders</Button>
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <MesStatusBadge status={detail.status} />
              <Badge size="sm" dot={false} tone={detail.priority === 'URGENT' ? 'danger' : 'neutral'}>
                {detail.priority.charAt(0) + detail.priority.slice(1).toLowerCase()}
              </Badge>
              {detail.batchNo && <Badge tone="brand" size="sm" dot={false}>Batch {detail.batchNo}</Badge>}
            </div>

            <MesDetailBlock title="Release checks">
              <div className="grid gap-2 sm:grid-cols-2">
                {CHECKS.map((c) => {
                  const ok = detail[c.key] as boolean
                  return (
                    <div key={String(c.key)} className={cn('flex items-start gap-2.5 rounded border p-3', ok ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5')}>
                      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                      <div className="min-w-0">
                        <p className={cn('text-xs font-medium', ok ? 'text-success' : 'text-danger')}>{c.label}</p>
                        {!ok && <p className="mt-0.5 text-2xs text-fg-muted">{c.fix}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </MesDetailBlock>

            <DataGrid
              columns={2}
              items={[
                { label: 'Product', value: `${detail.itemCode} — ${detail.itemName}` },
                { label: 'BOM / routing revision', value: `${detail.bomRevision} / ${detail.routingRevision}` },
                { label: 'Line', value: detail.line },
                { label: 'Batch', value: detail.batchNo ?? 'Allocated at first operation', mono: true },
                { label: 'Planned quantity', value: `${formatQty(detail.plannedQty)} ${detail.uom}` },
                { label: 'Made so far', value: `${formatQty(detail.producedQty)} (${((detail.producedQty / detail.plannedQty) * 100).toFixed(0)}%)` },
                { label: 'Scrap', value: formatQty(detail.scrapQty) },
                { label: 'Rework', value: formatQty(detail.reworkQty) },
                { label: 'Planned window', value: `${formatDate(detail.plannedStart)} → ${formatDate(detail.plannedEnd)}` },
                { label: 'Actual start', value: detail.actualStart ? formatDateTime(detail.actualStart) : 'Not started' },
                { label: 'Sales order', value: detail.salesOrderNo ?? 'Stock build', mono: true },
                { label: 'Customer', value: detail.customer ?? '—' },
              ]}
            />

            {detail.remarks && <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">{detail.remarks}</div>}

            <MesDetailBlock title={`Work orders (${detailWorkOrders.length})`}>
              {detailWorkOrders.length === 0 ? (
                <p className="text-xs text-fg-subtle">Work orders are generated when the order is released.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Operation</th>
                        <th>Work centre</th>
                        <th>Machine</th>
                        <th className="text-right">In</th>
                        <th className="text-right">Out</th>
                        <th className="text-right">Scrap</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailWorkOrders.map((w) => (
                        <tr key={w.uid}>
                          <td className="font-mono text-2xs">{String(w.sequence).padStart(2, '0')}</td>
                          <td className="text-xs">{w.operationName}</td>
                          <td className="text-2xs text-fg-muted">{w.workCentre}</td>
                          <td className="font-mono text-2xs">{w.machine ?? '—'}</td>
                          <td className="text-right tabular">{w.inputQty ? formatQty(w.inputQty) : '—'}</td>
                          <td className="text-right tabular">{w.producedQty ? formatQty(w.producedQty) : '—'}</td>
                          <td className={cn('text-right tabular', w.scrapQty && 'text-danger')}>{w.scrapQty || '—'}</td>
                          <td><MesStatusBadge status={w.status} size="sm" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </MesDetailBlock>
          </div>
        )}
      </Drawer>

      {/* Hold ----------------------------------------------------------------- */}
      <Modal
        open={!!holdTarget}
        onClose={() => setHoldTarget(null)}
        title={holdTarget ? `Hold ${holdTarget.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setHoldTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!holdTarget) return
                if (!holdReason.trim()) {
                  toast.error('Reason required', 'The floor needs to know why it stopped, and planning needs it to reschedule.')
                  return
                }
                update(holdTarget.uid, { status: 'ON_HOLD', remarks: holdReason.trim() })
                toast.success('Order on hold', `${holdTarget.docNo} held. Running work orders finish their current piece and then stop.`)
                setHoldTarget(null)
              }}
            >
              Put on hold
            </Button>
          </>
        }
      >
        {holdTarget && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              {formatQty(holdTarget.producedQty)} of {formatQty(holdTarget.plannedQty)} {holdTarget.uom} already made. Holding
              stops new work orders starting; anything on a machine right now completes the piece in progress.
            </p>
            <Textarea label="Why (required)" rows={3} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Customer changed the artwork, awaiting revised approval…" />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="From plan to floor" description="What happens at each step, and what has to be true before it can" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { t: '1 · Planned', d: 'Created by MRP or a planner. Nothing has been committed yet.' },
            { t: '2 · Checked', d: 'Material, machine, tooling and manpower are verified — all four, not three.' },
            { t: '3 · Released', d: 'Work orders are generated, one per routing operation, and a traveller card is printed.' },
            { t: '4 · In progress', d: 'Operators confirm production against each work order in sequence.' },
            { t: '5 · Completed', d: 'The last operation passes QC and the finished goods are received into stock.' },
          ].map((s) => (
            <div key={s.t} className="rounded border border-border p-3">
              <p className="text-xs font-medium text-fg">{s.t}</p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{s.d}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
