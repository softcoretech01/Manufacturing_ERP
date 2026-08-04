import { useMemo, useState } from 'react'
import { Ban, FlaskConical, Play, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { CoverBar, DetailBlock, OrderStatusBadge, PriorityBadge } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate, formatDateTime, formatQty } from '@/lib/format'
import {
  ORDER_FLOW,
  ORDER_STATUS_LABEL,
  releaseBlockers,
  reservationCheck,
  scheduleRouting,
  simulateOrder,
  type OrderSimulation,
} from '@/lib/planFlow'
import { NO_SIMULATION, defaultBomFor, defaultRoutingFor, rollUpCost } from '@/lib/engFlow'
import { newUid } from '@/store/data'
import { usePlanningData } from './usePlanningData'
import { items as masterItems } from '@/mock/masters'
import type { OrderComponent, ProductionOrder, ProductionOrderType } from '@/types/planning'

/**
 * Production orders (Ch 11, 12, 15, 16, 18).
 *
 * Creating an order is not filling in a form — it explodes the live BOM into a
 * component list, schedules the routing across the production calendar into
 * dated work order operations, and prices it from the engineering roll-up. The
 * simulation runs all of that before anything is committed, so the release
 * decision is made on the material, the hours and the cost rather than on hope.
 */

const TYPES: ProductionOrderType[] = ['STANDARD', 'BATCH', 'TRIAL', 'PROTOTYPE', 'REWORK', 'REPAIR', 'SAMPLE', 'URGENT']
const OPEN_STATES: ProductionOrder['status'][] = ['PLANNED', 'FIRM_PLANNED', 'RELEASED', 'MATERIAL_RESERVED', 'MATERIAL_ISSUED', 'IN_PRODUCTION']

interface FormState {
  productCode: string
  qty: string
  orderType: ProductionOrderType
  priority: ProductionOrder['priority']
  plannedStart: string
  remarks: string
}

export function ProductionOrdersPage() {
  const toast = useToast()
  const { orders, products, ctx, starts } = usePlanningData()
  const { rows, create, update, remove } = orders

  const [tab, setTab] = useState('open')
  const [detail, setDetail] = useState<ProductionOrder | null>(null)
  const [detailTab, setDetailTab] = useState('components')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>({ productCode: '', qty: '', orderType: 'STANDARD', priority: 'NORMAL', plannedStart: '', remarks: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<ProductionOrder | null>(null)
  const [simFor, setSimFor] = useState<ProductionOrder | null>(null)
  const [moving, setMoving] = useState<{ order: ProductionOrder; to: ProductionOrder['status'] } | null>(null)

  const counts = {
    open: rows.filter((o) => OPEN_STATES.includes(o.status)).length,
    firm: rows.filter((o) => o.status === 'FIRM_PLANNED' || o.status === 'PLANNED').length,
    running: rows.filter((o) => o.status === 'IN_PRODUCTION').length,
    late: rows.filter((o) => OPEN_STATES.includes(o.status) && o.plannedFinish < starts[0]).length,
    closed: rows.filter((o) => ['COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status)).length,
    all: rows.length,
  }

  const filtered = rows.filter((o) => {
    if (tab === 'open') return OPEN_STATES.includes(o.status)
    if (tab === 'firm') return o.status === 'FIRM_PLANNED' || o.status === 'PLANNED'
    if (tab === 'running') return o.status === 'IN_PRODUCTION'
    if (tab === 'late') return OPEN_STATES.includes(o.status) && o.plannedFinish < starts[0]
    if (tab === 'closed') return ['COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status)
    return true
  })

  const columns: Column<ProductionOrder>[] = [
    { key: 'docNo', header: 'Order', sortable: true, width: '11rem', render: (o) => <span className="font-mono text-xs font-medium text-brand-600">{o.docNo}</span> },
    {
      key: 'productCode',
      header: 'Product',
      sortable: true,
      render: (o) => (
        <>
          <p className="text-xs font-medium text-fg">{o.productName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{o.productCode}</p>
        </>
      ),
    },
    { key: 'orderType', header: 'Type', width: '6.5rem', accessor: (o) => o.orderType, render: (o) => <span className="text-xs text-fg-muted">{o.orderType.charAt(0) + o.orderType.slice(1).toLowerCase()}</span> },
    { key: 'qty', header: 'Quantity', align: 'right', sortable: true, width: '7.5rem', accessor: (o) => o.qty, render: (o) => `${formatQty(o.qty, 0)} ${o.uom}` },
    {
      key: 'progress',
      header: 'Progress',
      width: '9rem',
      accessor: (o) => (o.qty > 0 ? (o.producedQty / o.qty) * 100 : 0),
      render: (o) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={o.qty > 0 ? (o.producedQty / o.qty) * 100 : 0} tone={o.producedQty >= o.qty ? 'success' : 'brand'} className="w-16" />
          <span className="text-2xs tabular text-fg-muted">{formatQty(o.producedQty, 0)}</span>
        </div>
      ),
    },
    { key: 'priority', header: 'Priority', width: '6rem', render: (o) => <PriorityBadge priority={o.priority} /> },
    { key: 'plannedStart', header: 'Start', sortable: true, width: '8rem', accessor: (o) => o.plannedStart, render: (o) => formatDate(o.plannedStart) },
    {
      key: 'plannedFinish',
      header: 'Finish',
      sortable: true,
      width: '8rem',
      accessor: (o) => o.plannedFinish,
      render: (o) => (
        <span className={OPEN_STATES.includes(o.status) && o.plannedFinish < starts[0] ? 'text-danger' : ''}>{formatDate(o.plannedFinish)}</span>
      ),
    },
    { key: 'estimatedUnitCost', header: 'Est. value', align: 'right', sortable: true, width: '9.5rem', accessor: (o) => o.estimatedUnitCost * o.qty, render: (o) => `₹${formatAmount(o.estimatedUnitCost * o.qty)}` },
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (o) => <OrderStatusBadge status={o.status} /> },
  ]

  /* ── Create ────────────────────────────────────────────────────────── */

  function openCreate() {
    setForm({
      productCode: products.rows.find((p) => p.lifecycle === 'PRODUCTION')?.code ?? '',
      qty: '',
      orderType: 'STANDARD',
      priority: 'NORMAL',
      plannedStart: starts[1],
      remarks: '',
    })
    setErrors({})
    setFormOpen(true)
  }

  /** Live simulation of whatever the form currently says. */
  const formSim: OrderSimulation | null = useMemo(() => {
    if (!formOpen || !form.productCode || !(Number(form.qty) > 0)) return null
    const roll = rollUpCost(form.productCode, { ...ctx, tools: [], products: products.rows, items: masterItems }, NO_SIMULATION)
    return simulateOrder(form.productCode, Number(form.qty), form.plannedStart || starts[0], ctx, roll.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, form.productCode, form.qty, form.plannedStart, ctx])

  function validate() {
    const e: Record<string, string> = {}
    if (!form.productCode) e.productCode = 'Choose the product to make.'
    if (!(Number(form.qty) > 0)) e.qty = 'Quantity must be greater than zero.'
    if (!form.plannedStart) e.plannedStart = 'A planned start date is required.'
    if (form.productCode && !defaultBomFor(form.productCode, ctx.boms)) e.productCode = 'That product has no live bill of material, so no component list can be built.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save() {
    if (!validate()) return
    const qty = Number(form.qty)
    const product = products.rows.find((p) => p.code === form.productCode)
    const bom = defaultBomFor(form.productCode, ctx.boms)
    const routing = defaultRoutingFor(form.productCode, ctx.routings)
    const roll = rollUpCost(form.productCode, { ...ctx, tools: [], products: products.rows, items: masterItems }, NO_SIMULATION)
    const operations = routing ? scheduleRouting(routing, qty, form.plannedStart, 'FORWARD', ctx.calendar) : []

    const components: OrderComponent[] = (bom?.lines ?? []).map((l, i) => {
      const sp = ctx.stock.find((s) => s.itemCode === l.itemCode)
      return {
        uid: `oc-${Date.now().toString(36)}-${i}`,
        itemCode: l.itemCode,
        itemName: l.itemName,
        uom: l.uom,
        requiredQty: (l.qtyPer / Math.max(1, bom!.baseQty)) * (1 + l.scrapPct / 100) * qty,
        reservedQty: 0,
        issuedQty: 0,
        availableAtPlanning: sp?.available ?? 0,
      }
    })

    const seq = rows.reduce((m, x) => Math.max(m, Number(x.docNo.slice(-4)) || 0), 0) + 1
    const docNo = `PRD/26-27/${String(seq).padStart(4, '0')}`

    create({
      uid: newUid('pro'),
      docNo,
      orderType: form.orderType,
      productCode: form.productCode,
      productName: product?.name ?? form.productCode,
      uom: product?.baseUom ?? 'NOS',
      qty,
      producedQty: 0,
      rejectedQty: 0,
      plant: 'Chennai — Unit 1',
      warehouse: product?.productType === 'SEMI_FINISHED' ? 'Work in Progress Store' : 'Finished Goods Store',
      priority: form.priority,
      plannedStart: form.plannedStart,
      plannedFinish: operations.length ? operations[operations.length - 1].plannedFinish.slice(0, 10) : form.plannedStart,
      status: 'PLANNED',
      bomDocNo: bom?.docNo ?? '',
      bomRevision: bom?.revision ?? 0,
      routingDocNo: routing?.docNo ?? '',
      routingRevision: routing?.revision ?? 0,
      components,
      operations,
      demandRefs: [],
      estimatedUnitCost: roll.total,
      remarks: form.remarks.trim(),
      createdBy: 'A. Lakshmi',
      createdAt: new Date().toISOString(),
      version: 1,
    } as ProductionOrder)

    toast.success(
      'Production order created',
      `${docNo} — ${components.length} components exploded, ${operations.length} operations scheduled, estimated ₹${formatAmount(roll.total * qty)}.`,
    )
    setFormOpen(false)
  }

  /* ── Lifecycle ─────────────────────────────────────────────────────── */

  function moveStatus(o: ProductionOrder, to: ProductionOrder['status']) {
    if (to === 'RELEASED') {
      const blockers = releaseBlockers(o, ctx)
      if (blockers.length) {
        toast.error('Cannot release', blockers[0])
        setMoving(null)
        return
      }
    }

    if (to === 'MATERIAL_RESERVED') {
      // Reserve what free stock allows, and say plainly what could not be covered.
      let shortfalls = 0
      const components = o.components.map((c) => {
        const check = reservationCheck(c.itemCode, c.requiredQty, rows, o.uid, ctx)
        if (check.isOverAllocated) shortfalls++
        return { ...c, reservedQty: check.canReserve }
      })
      update(o.uid, { components, status: 'MATERIAL_RESERVED', version: o.version + 1 })
      toast.success(
        shortfalls ? 'Partly reserved' : 'Material reserved',
        shortfalls
          ? `${shortfalls} component${shortfalls === 1 ? '' : 's'} could not be fully reserved — free stock is already committed elsewhere.`
          : `All ${components.length} components reserved against ${o.docNo}.`,
      )
      setMoving(null)
      setDetail(null)
      return
    }

    if (to === 'MATERIAL_ISSUED') {
      const components = o.components.map((c) => ({ ...c, issuedQty: c.reservedQty }))
      update(o.uid, { components, status: 'MATERIAL_ISSUED', version: o.version + 1 })
      toast.success('Material issued', `${o.docNo} — what was reserved is now issued to the floor.`)
      setMoving(null)
      setDetail(null)
      return
    }

    if (to === 'COMPLETED') {
      update(o.uid, { status: 'COMPLETED', producedQty: o.producedQty || o.qty, version: o.version + 1 })
      toast.success('Completed', `${o.docNo} finished at ${formatQty(o.producedQty || o.qty, 0)} ${o.uom}.`)
      setMoving(null)
      setDetail(null)
      return
    }

    update(o.uid, { status: to, version: o.version + 1 })
    toast.success(ORDER_STATUS_LABEL[to], `${o.docNo} moved to ${ORDER_STATUS_LABEL[to].toLowerCase()}.`)
    setMoving(null)
    setDetail(null)
  }

  /** Simulation for an existing order. */
  const orderSim = useMemo(() => {
    if (!simFor) return null
    return simulateOrder(simFor.productCode, simFor.qty, simFor.plannedStart, ctx, simFor.estimatedUnitCost)
  }, [simFor, ctx])

  const detailBlockers = detail ? releaseBlockers(detail, ctx) : []

  return (
    <div>
      <PageHeader
        title="Production orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Production orders' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New order
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: counts.open },
              { id: 'firm', label: 'Planned & firm', count: counts.firm },
              { id: 'running', label: 'In production', count: counts.running },
              { id: 'late', label: 'Past due', count: counts.late },
              { id: 'closed', label: 'Closed', count: counts.closed },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />

      {counts.late > 0 && tab === 'open' && (
        <Alert tone="danger" className="mb-4">
          {counts.late} open order{counts.late === 1 ? '' : 's'} {counts.late === 1 ? 'is' : 'are'} past the planned
          finish date. Re-schedule them, or the plan behind them is fiction.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(o) => o.uid}
        searchPlaceholder="Search order, product or remarks…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'production-orders', 'Production orders', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={(o) => {
          setDetail(o)
          setDetailTab('components')
        }}
        rowClassName={(o) => (OPEN_STATES.includes(o.status) && o.plannedFinish < starts[0] ? 'bg-danger/5' : undefined)}
        emptyTitle="No production orders"
        emptyDescription="Firm an MRP suggestion, or raise an order directly."
        rowActions={(o) => (
          <>
            <MenuItem label="Edit" disabled={!['PLANNED', 'FIRM_PLANNED'].includes(o.status)} onClick={() => { setDetail(o); setDetailTab('components') }} />
            <MenuItem label="Simulate before release" icon={<FlaskConical />} separatorBefore onClick={() => setSimFor(o)} />
            {ORDER_FLOW[o.status]
              .filter((s) => s !== 'CANCELLED')
              .map((to) => (
                <MenuItem key={to} label={`Move to ${ORDER_STATUS_LABEL[to].toLowerCase()}`} icon={to === 'RELEASED' ? <Play /> : undefined} onClick={() => setMoving({ order: o, to })} />
              ))}
            <MenuItem
              label="Cancel order"
              icon={<Ban />}
              danger
              separatorBefore
              disabled={!ORDER_FLOW[o.status].includes('CANCELLED')}
              onClick={() => setMoving({ order: o, to: 'CANCELLED' })}
            />
            <MenuItem
              label={['PLANNED', 'FIRM_PLANNED', 'CANCELLED'].includes(o.status) ? 'Delete' : 'Delete — blocked (released)'}
              icon={<Trash2 />}
              danger
              disabled={!['PLANNED', 'FIRM_PLANNED', 'CANCELLED'].includes(o.status)}
              onClick={() => setConfirmDelete(o)}
            />
          </>
        )}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.productCode} — ${detail.productName}` : ''}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                {detail.bomDocNo ? `${detail.bomDocNo} R${detail.bomRevision}` : 'no BOM'} ·{' '}
                {detail.routingDocNo ? `${detail.routingDocNo} R${detail.routingRevision}` : 'no routing'} · raised by {detail.createdBy}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" icon={<FlaskConical className="h-3.5 w-3.5" />} onClick={() => setSimFor(detail)}>
                  Simulate
                </Button>
                {ORDER_FLOW[detail.status].filter((s) => s !== 'CANCELLED').slice(0, 1).map((to) => (
                  <Button key={to} variant="primary" size="sm" disabled={to === 'RELEASED' && detailBlockers.length > 0} onClick={() => setMoving({ order: detail, to })}>
                    {ORDER_STATUS_LABEL[to]}
                  </Button>
                ))}
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={detail.status} size="md" />
              <PriorityBadge priority={detail.priority} />
              <Badge tone="neutral" size="sm" dot={false}>{detail.orderType.charAt(0) + detail.orderType.slice(1).toLowerCase()}</Badge>
            </div>

            {detailBlockers.length > 0 && ['PLANNED', 'FIRM_PLANNED'].includes(detail.status) && (
              <Alert tone="warning" title="Not ready to release">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {detailBlockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <DataGrid
              columns={2}
              items={[
                { label: 'Quantity', value: `${formatQty(detail.qty, 0)} ${detail.uom}` },
                { label: 'Produced', value: `${formatQty(detail.producedQty, 0)} · ${formatQty(detail.rejectedQty, 0)} rejected` },
                { label: 'Planned start', value: formatDate(detail.plannedStart) },
                { label: 'Planned finish', value: formatDate(detail.plannedFinish) },
                { label: 'Plant', value: detail.plant },
                { label: 'Receiving store', value: detail.warehouse },
                { label: 'Estimated unit cost', value: `₹${formatAmount(detail.estimatedUnitCost)}` },
                { label: 'Estimated order value', value: `₹${formatAmount(detail.estimatedUnitCost * detail.qty)}` },
                ...(detail.demandRefs.length ? [{ label: 'Covers', value: detail.demandRefs.join(', ') }] : []),
              ]}
            />

            {detail.remarks && (
              <DetailBlock title="Remarks">
                <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.remarks}</p>
              </DetailBlock>
            )}

            <Tabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'components', label: 'Components', count: detail.components.length },
                { id: 'operations', label: 'Work orders', count: detail.operations.length },
              ]}
            />

            {detailTab === 'components' && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="text-right" style={{ width: '8rem' }}>Required</th>
                      <th className="text-right" style={{ width: '8rem' }}>Reserved</th>
                      <th className="text-right" style={{ width: '8rem' }}>Issued</th>
                      <th className="text-right" style={{ width: '8rem' }}>Free at planning</th>
                      <th style={{ width: '8rem' }}>Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.components.map((c) => (
                      <tr key={c.uid} className={c.availableAtPlanning < c.requiredQty ? 'bg-warning/5' : undefined}>
                        <td>
                          <p className="text-xs font-medium text-fg">{c.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{c.itemCode}</p>
                        </td>
                        <td className="text-right tabular text-xs">{formatQty(c.requiredQty, 2)} {c.uom}</td>
                        <td className="text-right tabular text-xs">{c.reservedQty ? formatQty(c.reservedQty, 2) : <span className="text-fg-subtle">—</span>}</td>
                        <td className="text-right tabular text-xs">{c.issuedQty ? formatQty(c.issuedQty, 2) : <span className="text-fg-subtle">—</span>}</td>
                        <td className="text-right tabular text-2xs text-fg-muted">{formatQty(c.availableAtPlanning, 0)}</td>
                        <td><CoverBar required={c.requiredQty} available={c.availableAtPlanning} /></td>
                      </tr>
                    ))}
                    {!detail.components.length && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-2xs text-fg-subtle">
                          No components — the product had no live BOM when the order was raised.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'operations' && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '3.5rem' }}>Seq</th>
                      <th>Operation</th>
                      <th style={{ width: '5.5rem' }}>Centre</th>
                      <th className="text-right" style={{ width: '5rem' }}>Setup</th>
                      <th className="text-right" style={{ width: '6rem' }}>Run</th>
                      <th style={{ width: '10rem' }}>Start</th>
                      <th style={{ width: '10rem' }}>Finish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.operations.map((o) => (
                      <tr key={o.uid}>
                        <td className="text-2xs tabular text-fg-subtle">{o.seq}</td>
                        <td>
                          <p className="text-xs font-medium text-fg">
                            {o.operationName}
                            {o.qcCheckpoint && <Badge tone="progress" size="sm" className="ml-1.5" dot={false}>QC</Badge>}
                          </p>
                          <p className="font-mono text-2xs text-fg-subtle">
                            {o.operationCode} · {o.operators} operator{o.operators === 1 ? '' : 's'}
                            {o.toolCode && ` · ${o.toolCode}`}
                          </p>
                        </td>
                        <td className="font-mono text-2xs">{o.workCentreCode}</td>
                        <td className="text-right tabular text-2xs">{o.setupMinutes}m</td>
                        <td className="text-right tabular text-2xs">{(o.runMinutes / 60).toFixed(1)}h</td>
                        <td className="text-2xs text-fg-muted">{formatDateTime(o.plannedStart)}</td>
                        <td className="text-2xs text-fg-muted">{formatDateTime(o.plannedFinish)}</td>
                      </tr>
                    ))}
                    {!detail.operations.length && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-2xs text-fg-subtle">
                          No operations — the product had no live routing when the order was raised.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Create ---------------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New production order"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Create order
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Product"
            required
            containerClassName="sm:col-span-2"
            value={form.productCode}
            error={errors.productCode}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
            options={[{ value: '', label: 'Select a product…' }, ...products.rows.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <Input label="Quantity" type="number" required value={form.qty} error={errors.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          <Input label="Planned start" type="date" required value={form.plannedStart} error={errors.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.target.value })} />
          <Select label="Order type" value={form.orderType} onChange={(e) => setForm({ ...form, orderType: e.target.value as ProductionOrderType })} options={TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))} />
          <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as ProductionOrder['priority'] })} options={(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))} />
          <Textarea label="Remarks" containerClassName="sm:col-span-2" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>

        {formSim && (
          <div className="mt-4 rounded border border-border bg-surface-2 p-3">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">What this order will look like</p>
            <div className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
              <p className="flex justify-between gap-4">
                <span className="text-fg-muted">Components</span>
                <span className={cn('font-medium', formSim.shortCount ? 'text-warning' : 'text-success')}>
                  {formSim.materialLines.length} · {formSim.shortCount ? `${formSim.shortCount} short` : 'all covered'}
                </span>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-fg-muted">Shop hours</span>
                <span className="font-medium tabular text-fg">{(formSim.totalMinutes / 60).toFixed(1)} h</span>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-fg-muted">Finishes</span>
                <span className="font-medium text-fg">{formatDate(formSim.plannedFinish)}</span>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-fg-muted">Estimated value</span>
                <span className="font-medium tabular text-fg">₹{formatAmount(formSim.totalCost)}</span>
              </p>
            </div>
            {formSim.warnings.map((w) => (
              <p key={w} className="mt-1.5 text-2xs text-warning">{w}</p>
            ))}
          </div>
        )}
      </Modal>

      {/* Simulation ------------------------------------------------------------ */}
      <Drawer
        open={!!simFor}
        onClose={() => setSimFor(null)}
        title={simFor ? `Simulation — ${simFor.docNo}` : ''}
        description={simFor ? `${formatQty(simFor.qty, 0)} ${simFor.uom} of ${simFor.productCode} from ${formatDate(simFor.plannedStart)}` : ''}
        width="max-w-3xl"
      >
        {orderSim && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={cn('card p-3', orderSim.materialOk ? 'border-success/40' : 'border-danger/40')}>
                <p className="text-2xs uppercase tracking-wide text-fg-muted">Material</p>
                <p className={cn('mt-1 text-lg font-semibold', orderSim.materialOk ? 'text-success' : 'text-danger')}>
                  {orderSim.materialOk ? 'Available' : `${orderSim.shortCount} short`}
                </p>
              </div>
              <div className={cn('card p-3', orderSim.capacityOk ? 'border-success/40' : 'border-warning/40')}>
                <p className="text-2xs uppercase tracking-wide text-fg-muted">Capacity</p>
                <p className={cn('mt-1 text-lg font-semibold', orderSim.capacityOk ? 'text-success' : 'text-warning')}>
                  {(orderSim.totalMinutes / 60).toFixed(0)} h
                </p>
              </div>
              <div className="card p-3">
                <p className="text-2xs uppercase tracking-wide text-fg-muted">Estimated cost</p>
                <p className="mt-1 text-lg font-semibold tabular text-fg">₹{formatAmount(orderSim.totalCost)}</p>
              </div>
            </div>

            <DetailBlock title="Material availability">
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="text-right" style={{ width: '8rem' }}>Required</th>
                      <th className="text-right" style={{ width: '8rem' }}>Free stock</th>
                      <th className="text-right" style={{ width: '8rem' }}>Short</th>
                      <th className="text-right" style={{ width: '6rem' }}>Lead</th>
                      <th style={{ width: '8rem' }}>Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderSim.materialLines.map((l) => (
                      <tr key={l.itemCode} className={l.shortQty > 0 ? 'bg-danger/5' : undefined}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular text-xs">{formatQty(l.required, 2)}</td>
                        <td className="text-right tabular text-xs text-fg-muted">{formatQty(l.available, 0)}</td>
                        <td className="text-right tabular text-xs">{l.shortQty > 0 ? <span className="font-medium text-danger">{formatQty(l.shortQty, 2)}</span> : <span className="text-fg-subtle">—</span>}</td>
                        <td className="text-right text-2xs text-fg-muted">{l.leadTimeDays}d</td>
                        <td><CoverBar required={l.required} available={l.available} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title="Capacity by work centre">
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Work centre</th>
                      <th className="text-right" style={{ width: '9rem' }}>Hours needed</th>
                      <th className="text-right" style={{ width: '9rem' }}>Hours a week</th>
                      <th className="text-right" style={{ width: '8rem' }}>Weeks</th>
                      <th className="text-right" style={{ width: '7rem' }}>Load</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderSim.capacityLines.map((c) => (
                      <tr key={c.workCentreCode} className={c.loadPct > 100 ? 'bg-warning/5' : undefined}>
                        <td>
                          <p className="text-xs font-medium text-fg">{c.workCentreName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{c.workCentreCode}</p>
                        </td>
                        <td className="text-right tabular text-xs">{c.requiredHours.toFixed(1)}</td>
                        <td className="text-right tabular text-xs text-fg-muted">{c.availableHoursPerWeek.toFixed(1)}</td>
                        <td className="text-right tabular text-xs">{c.weeksNeeded.toFixed(2)}</td>
                        <td className={cn('text-right tabular text-xs', c.loadPct > 100 ? 'text-danger' : 'text-fg-muted')}>{c.loadPct.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-2xs text-fg-subtle">
                Load is this order alone against one week at each centre. The capacity screen shows it against everything
                else in the plan.
              </p>
            </DetailBlock>

            <DetailBlock title="Schedule">
              <p className="text-xs text-fg-muted">
                Starting {formatDate(orderSim.plannedStart)}, {(orderSim.totalMinutes / 60).toFixed(1)} shop hours across{' '}
                {orderSim.operations.length} operations finishes on{' '}
                <span className="font-medium text-fg">{formatDate(orderSim.plannedFinish)}</span>, with holidays and the
                weekly off already taken out.
              </p>
            </DetailBlock>

            {orderSim.warnings.length > 0 && (
              <Alert tone="warning" title="Worth knowing">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {orderSim.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </div>
        )}
      </Drawer>

      {/* Status move ----------------------------------------------------------- */}
      <Modal
        open={!!moving}
        onClose={() => setMoving(null)}
        title={moving ? `Move to ${ORDER_STATUS_LABEL[moving.to].toLowerCase()}?` : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button variant={moving?.to === 'CANCELLED' ? 'danger' : 'primary'} onClick={() => moving && moveStatus(moving.order, moving.to)}>
              {moving?.to === 'CANCELLED' ? 'Cancel the order' : ORDER_STATUS_LABEL[moving?.to ?? 'PLANNED']}
            </Button>
          </>
        }
      >
        {moving && (
          <div className="space-y-2 text-sm text-fg-muted">
            <p>
              <span className="font-medium text-fg">{moving.order.docNo}</span> — {formatQty(moving.order.qty, 0)}{' '}
              {moving.order.uom} of {moving.order.productCode}.
            </p>
            {moving.to === 'RELEASED' && <p className="text-xs">Released orders appear on the shop floor and can no longer be edited or deleted.</p>}
            {moving.to === 'MATERIAL_RESERVED' && (
              <p className="text-xs">
                Free stock is claimed for each component. Anything already reserved by another open order is not
                double-counted — what cannot be covered is reported rather than silently over-allocated.
              </p>
            )}
            {moving.to === 'MATERIAL_ISSUED' && <p className="text-xs">What was reserved is issued to the floor and leaves free stock.</p>}
            {moving.to === 'CANCELLED' && <p className="text-xs">Reserved material is released back to free stock and the demand it covered becomes uncovered again.</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete production order"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.docNo} will be marked deleted, not physically removed. It has not been released.
        </p>
      </Modal>
    </div>
  )
}
