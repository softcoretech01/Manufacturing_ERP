import { useMemo, useState } from 'react'
import { AlertTriangle, Download, Play, ShoppingCart, Factory } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DetailBlock, LateChip } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate, formatQty } from '@/lib/format'
import { scheduleRouting } from '@/lib/planFlow'
import { defaultRoutingFor, rollUpCost, NO_SIMULATION } from '@/lib/engFlow'
import { newUid } from '@/store/data'
import { usePlanningData } from './usePlanningData'
import type { MrpException, MrpItemPlan, MrpShortage, PlannedOrder } from '@/lib/planFlow'
import type { ProductionOrder } from '@/types/planning'

/**
 * MRP (Ch 8).
 *
 * The run itself is live — every screen in the portal reads the same result, so
 * there is no "last run" that quietly disagrees with the data. What this screen
 * adds is the four ways a planner needs to read it: the time-phased grid per
 * item, the orders it wants raised, the things that are already too late, and
 * the exceptions worth arguing with.
 *
 * A planned order is a suggestion until someone firms it. Firming a production
 * order here creates a real order with its components and operations attached.
 */

export function MrpPage() {
  const toast = useToast()
  const { mrp, orders, ctx, products, starts } = usePlanningData()

  const [tab, setTab] = useState('orders')
  const [detail, setDetail] = useState<MrpItemPlan | null>(null)
  const [firming, setFirming] = useState<PlannedOrder | null>(null)
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [severityFilter, setSeverityFilter] = useState('ALL')

  const plannedOrders = mrp.plannedOrders.filter((o) => (typeFilter === 'ALL' ? true : o.orderType === typeFilter))
  const exceptions = mrp.exceptions.filter((e) => (severityFilter === 'ALL' ? true : e.severity === severityFilter))

  /** Which planned production orders have already been firmed into real ones. */
  const firmedKeys = useMemo(
    () => new Set(orders.rows.filter((o) => !o.deletedAt && o.plannedFinish).map((o) => `${o.productCode}|${o.plannedFinish.slice(0, 10)}`)),
    [orders.rows],
  )

  const orderColumns: Column<PlannedOrder>[] = [
    {
      key: 'itemCode',
      header: 'Item',
      sortable: true,
      render: (o) => (
        <>
          <p className="text-xs font-medium text-fg">{o.itemName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{o.itemCode}</p>
        </>
      ),
    },
    {
      key: 'orderType',
      header: 'Type',
      sortable: true,
      width: '7.5rem',
      render: (o) => (
        <Badge tone={o.orderType === 'PRODUCTION' ? 'progress' : 'brand'} size="sm" dot={false}>
          {o.orderType === 'PRODUCTION' ? 'Make' : 'Buy'}
        </Badge>
      ),
    },
    { key: 'llc', header: 'Level', align: 'right', width: '5rem', accessor: (o) => o.llc, render: (o) => <span className="text-2xs text-fg-subtle">L{o.llc}</span> },
    { key: 'qty', header: 'Quantity', align: 'right', sortable: true, width: '8rem', accessor: (o) => o.qty, render: (o) => `${formatQty(o.qty, 2)} ${o.uom}` },
    { key: 'releaseDate', header: 'Release on', sortable: true, width: '9rem', accessor: (o) => o.releaseDate, render: (o) => <span className={o.isLate ? 'text-danger' : ''}>{formatDate(o.releaseDate)}</span> },
    { key: 'dueDate', header: 'Needed by', sortable: true, width: '9rem', accessor: (o) => o.dueDate, render: (o) => formatDate(o.dueDate) },
    { key: 'isLate', header: 'Timing', width: '7rem', accessor: (o) => o.daysLate, render: (o) => <LateChip days={o.daysLate} /> },
    { key: 'value', header: 'Value', align: 'right', sortable: true, width: '9rem', accessor: (o) => o.value, render: (o) => `₹${formatAmount(o.value)}` },
    { key: 'peggedTo', header: 'Covers', width: '14rem', render: (o) => <span className="truncate text-2xs text-fg-muted">{o.peggedTo}</span> },
    {
      key: 'firmed',
      header: 'Firmed',
      width: '6rem',
      accessor: (o) => (firmedKeys.has(`${o.itemCode}|${o.dueDate}`) ? 'Yes' : 'No'),
      render: (o) => (firmedKeys.has(`${o.itemCode}|${o.dueDate}`) ? <Badge tone="success" size="sm">Firmed</Badge> : <span className="text-2xs text-fg-subtle">—</span>),
    },
  ]

  const planColumns: Column<MrpItemPlan>[] = [
    {
      key: 'itemCode',
      header: 'Item',
      sortable: true,
      render: (p) => (
        <>
          <p className="text-xs font-medium text-fg">{p.itemName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{p.itemCode}</p>
        </>
      ),
    },
    { key: 'llc', header: 'Level', align: 'right', width: '5rem', accessor: (p) => p.llc, render: (p) => <span className="text-2xs text-fg-subtle">L{p.llc}</span> },
    { key: 'source', header: 'Source', width: '6rem', accessor: (p) => (p.isManufactured ? 'Make' : 'Buy'), render: (p) => <span className="text-2xs text-fg-muted">{p.isManufactured ? 'Make' : 'Buy'}</span> },
    { key: 'openingStock', header: 'Free stock', align: 'right', sortable: true, width: '8rem', accessor: (p) => p.openingStock, render: (p) => formatQty(p.openingStock, 0) },
    { key: 'safetyStock', header: 'Safety', align: 'right', width: '7rem', accessor: (p) => p.safetyStock, render: (p) => formatQty(p.safetyStock, 0) },
    { key: 'leadTimeDays', header: 'Lead', align: 'right', width: '5.5rem', accessor: (p) => p.leadTimeDays, render: (p) => `${p.leadTimeDays}d` },
    { key: 'totalGross', header: 'Gross req.', align: 'right', sortable: true, width: '9rem', accessor: (p) => p.totalGross, render: (p) => formatQty(p.totalGross, 0) },
    { key: 'totalPlanned', header: 'Planned', align: 'right', sortable: true, width: '9rem', accessor: (p) => p.totalPlanned, render: (p) => <span className="font-medium">{formatQty(p.totalPlanned, 0)}</span> },
    {
      key: 'firstLateBucket',
      header: 'Timing',
      width: '9rem',
      accessor: (p) => p.firstLateBucket ?? 99,
      render: (p) =>
        p.firstLateBucket === null ? (
          <span className="text-2xs text-success">Coverable</span>
        ) : (
          <span className="text-2xs text-danger">Late from W{p.firstLateBucket + 1}</span>
        ),
    },
  ]

  const shortageColumns: Column<MrpShortage>[] = [
    {
      key: 'itemCode',
      header: 'Item',
      sortable: true,
      render: (s) => (
        <>
          <p className="text-xs font-medium text-fg">{s.itemName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{s.itemCode}</p>
        </>
      ),
    },
    { key: 'shortQty', header: 'Short by', align: 'right', sortable: true, width: '10rem', accessor: (s) => s.shortQty, render: (s) => <span className="font-medium text-danger">{formatQty(s.shortQty, 2)} {s.uom}</span> },
    { key: 'requiredOn', header: 'Needed by', sortable: true, width: '9rem', accessor: (s) => s.requiredOn, render: (s) => formatDate(s.requiredOn) },
    { key: 'leadTimeDays', header: 'Lead time', align: 'right', width: '8rem', accessor: (s) => s.leadTimeDays, render: (s) => `${s.leadTimeDays} days` },
    { key: 'daysLate', header: 'Already late by', align: 'right', sortable: true, width: '9rem', accessor: (s) => s.daysLate, render: (s) => <LateChip days={s.daysLate} /> },
    { key: 'value', header: 'Value at risk', align: 'right', sortable: true, width: '10rem', accessor: (s) => s.value, render: (s) => `₹${formatAmount(s.value)}` },
  ]

  const exceptionColumns: Column<MrpException>[] = [
    {
      key: 'severity',
      header: 'Severity',
      sortable: true,
      width: '7rem',
      render: (e) => (
        <Badge tone={e.severity === 'ERROR' ? 'danger' : e.severity === 'WARNING' ? 'warning' : 'neutral'} size="sm">
          {e.severity.charAt(0) + e.severity.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    { key: 'itemCode', header: 'Item', sortable: true, width: '12rem', render: (e) => <span className="font-mono text-2xs text-fg-muted">{e.itemCode}</span> },
    { key: 'type', header: 'Type', sortable: true, width: '12rem', render: (e) => <span className="text-2xs text-fg-muted">{e.type.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'message', header: 'What happened', render: (e) => <span className="text-xs text-fg">{e.message}</span> },
    { key: 'action', header: 'What to do', render: (e) => <span className="text-xs text-fg-muted">{e.action}</span> },
  ]

  /* ── Firming a planned order into a real production order ─────────── */

  function firm(o: PlannedOrder) {
    const product = products.rows.find((p) => p.code === o.itemCode)
    const routing = defaultRoutingFor(o.itemCode, ctx.routings)
    const bom = ctx.boms.find((b) => b.productCode === o.itemCode && (b.status === 'ACTIVE' || b.status === 'APPROVED') && b.isDefault)
    const roll = rollUpCost(o.itemCode, { ...ctx, tools: [], products: products.rows, items: ctx.items }, NO_SIMULATION)

    const start = o.releaseDate < starts[0] ? starts[0] : o.releaseDate
    const operations = routing ? scheduleRouting(routing, o.qty, start, 'FORWARD', ctx.calendar) : []

    const components = (bom?.lines ?? []).map((l) => {
      const required = (l.qtyPer / Math.max(1, bom!.baseQty)) * (1 + l.scrapPct / 100) * o.qty
      const sp = ctx.stock.find((s) => s.itemCode === l.itemCode)
      return {
        uid: `oc-${newUid('c')}`,
        itemCode: l.itemCode,
        itemName: l.itemName,
        uom: l.uom,
        requiredQty: required,
        reservedQty: 0,
        issuedQty: 0,
        availableAtPlanning: sp?.available ?? 0,
      }
    })

    const seq = orders.rows.reduce((m, x) => Math.max(m, Number(x.docNo.slice(-4)) || 0), 0) + 1
    const docNo = `PRD/26-27/${String(seq).padStart(4, '0')}`

    orders.create({
      uid: newUid('pro'),
      docNo,
      orderType: o.isLate ? 'URGENT' : 'STANDARD',
      productCode: o.itemCode,
      productName: o.itemName,
      uom: o.uom,
      qty: o.qty,
      producedQty: 0,
      rejectedQty: 0,
      plant: 'Chennai — Unit 1',
      warehouse: product?.productType === 'SEMI_FINISHED' ? 'Work in Progress Store' : 'Finished Goods Store',
      priority: o.isLate ? 'URGENT' : 'NORMAL',
      plannedStart: start,
      plannedFinish: o.dueDate,
      status: 'FIRM_PLANNED',
      bomDocNo: bom?.docNo ?? '',
      bomRevision: bom?.revision ?? 0,
      routingDocNo: routing?.docNo ?? '',
      routingRevision: routing?.revision ?? 0,
      components,
      operations,
      demandRefs: o.peggedTo === '—' ? [] : o.peggedTo.split(', '),
      estimatedUnitCost: roll.total,
      remarks: `Firmed from the MRP suggestion for week ${o.bucket + 1}.`,
      createdBy: 'A. Lakshmi',
      createdAt: new Date().toISOString(),
      version: 1,
    } as ProductionOrder)

    toast.success(
      'Production order firmed',
      `${docNo} for ${formatQty(o.qty, 0)} ${o.uom}${operations.length ? `, ${operations.length} operations scheduled` : ' — no routing, so no operations'}.`,
    )
    setFirming(null)
  }

  function exportOrders(format: ExportFormat) {
    const columns: ExportColumn<PlannedOrder>[] = [
      { header: 'Item', value: (o) => o.itemCode },
      { header: 'Description', value: (o) => o.itemName },
      { header: 'Type', value: (o) => (o.orderType === 'PRODUCTION' ? 'Make' : 'Buy') },
      { header: 'Level', value: (o) => o.llc },
      { header: 'Quantity', value: (o) => o.qty.toFixed(3) },
      { header: 'UoM', value: (o) => o.uom },
      { header: 'Release on', value: (o) => o.releaseDate },
      { header: 'Needed by', value: (o) => o.dueDate },
      { header: 'Days late', value: (o) => o.daysLate },
      { header: 'Value', value: (o) => o.value.toFixed(2) },
      { header: 'Covers', value: (o) => o.peggedTo },
    ]
    const n = exportRows(format, 'mrp-planned-orders', 'MRP planned orders', columns, plannedOrders)
    toast.success('Export ready', `${n} rows written.`)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Material requirements planning"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'MRP' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportOrders('xlsx')}>
              Export
            </Button>
            <Button variant="primary" size="sm" icon={<Play className="h-4 w-4" />} onClick={() => toast.success('Plan is current', 'MRP re-runs on every change, so this result is already up to date.')}>
              Run MRP
            </Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'orders', label: 'Planned orders', count: mrp.plannedOrders.length },
              { id: 'plan', label: 'Time-phased plan', count: mrp.plans.length },
              { id: 'shortages', label: 'Shortages', count: mrp.shortages.length },
              { id: 'exceptions', label: 'Exceptions', count: mrp.exceptions.length },
            ]}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded border border-border bg-surface-2 px-4 py-3 text-xs">
        <span className="text-fg-muted">
          Horizon <span className="font-semibold text-fg">{mrp.horizon} weeks</span> from {formatDate(mrp.starts[0])}
        </span>
        <span className="text-fg-muted">
          Items planned <span className="font-semibold text-fg tabular">{mrp.stats.itemsPlanned}</span>
        </span>
        <span className="text-fg-muted">
          Buy <span className="font-semibold text-fg tabular">{mrp.stats.purchaseOrders}</span> · make{' '}
          <span className="font-semibold text-fg tabular">{mrp.stats.productionOrders}</span>
        </span>
        <span className="text-fg-muted">
          Purchase value <span className="font-semibold text-fg tabular">₹{formatAmount(mrp.stats.purchaseValue)}</span>
        </span>
        <span className={cn('ml-auto', mrp.stats.lateOrders ? 'text-danger' : 'text-success')}>
          {mrp.stats.lateOrders ? `${mrp.stats.lateOrders} orders already past their release date` : 'Every order can still be released on time'}
        </span>
      </div>

      {tab === 'orders' && (
        <DataTable
          className="flex-1"
          rows={plannedOrders}
          columns={orderColumns}
          rowKey={(o) => o.uid}
          searchPlaceholder="Search item, description or peg…"
          onExport={exportOrders}
          rowClassName={(o) => (o.isLate ? 'bg-danger/5' : undefined)}
          filterPanel={
            <Select
              sizeVariant="sm"
              containerClassName="w-40"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'Make and buy' },
                { value: 'PRODUCTION', label: 'Make only' },
                { value: 'PURCHASE', label: 'Buy only' },
              ]}
            />
          }
          emptyTitle="Nothing to plan"
          emptyDescription="Stock and open orders already cover every requirement in the horizon."
          rowActions={(o) => (
            <>
              <MenuItem
                label={o.orderType === 'PRODUCTION' ? 'Firm into a production order' : 'Raise a purchase requisition'}
                icon={o.orderType === 'PRODUCTION' ? <Factory /> : <ShoppingCart />}
                disabled={o.orderType === 'PRODUCTION' && firmedKeys.has(`${o.itemCode}|${o.dueDate}`)}
                onClick={() =>
                  o.orderType === 'PRODUCTION'
                    ? setFirming(o)
                    : toast.success('Sent to procurement', `${o.itemCode} × ${formatQty(o.qty, 0)} ${o.uom} added to the requisition queue for ${formatDate(o.releaseDate)}.`)
                }
              />
              <MenuItem
                label="Open the item plan"
                separatorBefore
                onClick={() => {
                  const p = mrp.plans.find((x) => x.itemCode === o.itemCode)
                  if (p) {
                    setDetail(p)
                    setTab('plan')
                  }
                }}
              />
            </>
          )}
        />
      )}

      {tab === 'plan' && (
        <DataTable
          className="flex-1"
          rows={mrp.plans}
          columns={planColumns}
          rowKey={(p) => p.itemCode}
          searchPlaceholder="Search item…"
          onRowClick={setDetail}
          emptyTitle="Nothing planned"
          emptyDescription="Add demand or a master schedule to plan against."
        />
      )}

      {tab === 'shortages' && (
        <>
          {mrp.shortages.length === 0 ? (
            <Card>
              <EmptyState title="No shortages" description="Every requirement can still be covered within its lead time." />
            </Card>
          ) : (
            <>
              <Alert tone="danger" className="mb-4">
                {mrp.shortages.length} requirement{mrp.shortages.length === 1 ? '' : 's'} cannot be covered in time — the
                order would have had to be released before today. Expediting, splitting the lot or re-timing the demand
                are the only three ways out.
              </Alert>
              <DataTable
                className="flex-1"
                rows={mrp.shortages}
                columns={shortageColumns}
                rowKey={(s) => `${s.itemCode}-${s.requiredOn}`}
                searchPlaceholder="Search item…"
                onExport={(f: ExportFormat) => {
                  const columns: ExportColumn<MrpShortage>[] = [
                    { header: 'Item', value: (s) => s.itemCode },
                    { header: 'Description', value: (s) => s.itemName },
                    { header: 'Short by', value: (s) => s.shortQty.toFixed(3) },
                    { header: 'UoM', value: (s) => s.uom },
                    { header: 'Needed by', value: (s) => s.requiredOn },
                    { header: 'Lead time days', value: (s) => s.leadTimeDays },
                    { header: 'Days late', value: (s) => s.daysLate },
                    { header: 'Value', value: (s) => s.value.toFixed(2) },
                  ]
                  const n = exportRows(f, 'mrp-shortages', 'MRP shortages', columns, mrp.shortages)
                  toast.success('Export ready', `${n} rows written.`)
                }}
                emptyTitle="No shortages"
              />
            </>
          )}
        </>
      )}

      {tab === 'exceptions' && (
        <DataTable
          className="flex-1"
          rows={exceptions}
          columns={exceptionColumns}
          rowKey={(e) => e.uid}
          searchPlaceholder="Search item or message…"
          filterPanel={
            <Select
              sizeVariant="sm"
              containerClassName="w-40"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All severities' },
                { value: 'ERROR', label: 'Errors' },
                { value: 'WARNING', label: 'Warnings' },
                { value: 'INFO', label: 'Information' },
              ]}
            />
          }
          emptyTitle="No exceptions"
          emptyDescription="The run completed with nothing worth raising."
        />
      )}

      {/* Time-phased grid for one item -------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.itemCode}
        description={detail?.itemName}
        width="max-w-5xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
              <span className="text-fg-muted">
                Level <span className="font-semibold text-fg">L{detail.llc}</span>
              </span>
              <span className="text-fg-muted">
                Source <span className="font-semibold text-fg">{detail.isManufactured ? 'Made in house' : 'Bought out'}</span>
              </span>
              <span className="text-fg-muted">
                Free stock <span className="font-semibold text-fg tabular">{formatQty(detail.openingStock, 0)} {detail.uom}</span>
              </span>
              <span className="text-fg-muted">
                Safety <span className="font-semibold text-fg tabular">{formatQty(detail.safetyStock, 0)}</span>
              </span>
              <span className="text-fg-muted">
                Lead time <span className="font-semibold text-fg">{detail.leadTimeDays} days</span>
              </span>
            </div>

            <DetailBlock title="Time-phased plan">
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '11rem' }}>Row</th>
                      {detail.buckets.map((b) => (
                        <th key={b.bucket} className="text-right" style={{ minWidth: '5.5rem' }}>
                          <span className="block">W{b.bucket + 1}</span>
                          <span className="block text-[9px] font-normal normal-case text-fg-subtle">{formatDate(b.start).slice(0, 6)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-xs text-fg-muted">Gross requirement</td>
                      {detail.buckets.map((b) => (
                        <td key={b.bucket} className="text-right tabular text-xs">{b.grossRequirement ? formatQty(b.grossRequirement, 0) : <span className="text-fg-subtle">—</span>}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="text-xs text-fg-muted">Scheduled receipts</td>
                      {detail.buckets.map((b) => (
                        <td key={b.bucket} className="text-right tabular text-xs">{b.scheduledReceipts ? formatQty(b.scheduledReceipts, 0) : <span className="text-fg-subtle">—</span>}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="text-xs font-medium text-fg">Projected stock</td>
                      {detail.buckets.map((b) => (
                        <td
                          key={b.bucket}
                          className={cn('text-right tabular text-xs', b.projectedOnHand < detail.safetyStock ? 'text-warning' : 'text-fg')}
                        >
                          {formatQty(b.projectedOnHand, 0)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="text-xs text-fg-muted">Net requirement</td>
                      {detail.buckets.map((b) => (
                        <td key={b.bucket} className="text-right tabular text-xs">{b.netRequirement ? formatQty(b.netRequirement, 0) : <span className="text-fg-subtle">—</span>}</td>
                      ))}
                    </tr>
                    <tr className="bg-brand-500/5">
                      <td className="text-xs font-medium text-fg">Planned receipt</td>
                      {detail.buckets.map((b) => (
                        <td key={b.bucket} className="text-right tabular text-xs font-medium">{b.plannedReceipt ? formatQty(b.plannedReceipt, 0) : <span className="text-fg-subtle">—</span>}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="text-xs text-fg-muted">Release on</td>
                      {detail.buckets.map((b) => (
                        <td key={b.bucket} className={cn('text-right text-2xs', (b.releaseBucket ?? 0) < 0 ? 'font-medium text-danger' : 'text-fg-muted')}>
                          {b.releaseDate ? formatDate(b.releaseDate).slice(0, 6) : '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-2xs text-fg-subtle">
                Projected stock = previous week + scheduled receipts − gross requirement + planned receipt. A planned
                receipt is raised whenever the projection would fall below the safety stock, then sized by the item's lot
                rule and offset back by {detail.leadTimeDays} days to give the release date.
              </p>
            </DetailBlock>

            {detail.firstLateBucket !== null && (
              <Alert tone="danger" title="This item cannot be covered on time">
                The first requirement that cannot be met falls in week {detail.firstLateBucket + 1}. At{' '}
                {detail.leadTimeDays} days' lead time the order needed to go out before today.
              </Alert>
            )}
          </div>
        )}
      </Drawer>

      {/* Firm confirmation ---------------------------------------------------- */}
      <Modal
        open={!!firming}
        onClose={() => setFirming(null)}
        title="Firm this into a production order?"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFirming(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => firming && firm(firming)}>
              Create the order
            </Button>
          </>
        }
      >
        {firming && (
          <div className="space-y-3 text-sm text-fg-muted">
            <p>
              <span className="font-medium text-fg">{firming.itemCode}</span> — {formatQty(firming.qty, 0)} {firming.uom},
              needed by {formatDate(firming.dueDate)}.
            </p>
            <p className="text-xs">
              The order is created as firm planned with its component list exploded from the live BOM and its operations
              scheduled forward across the production calendar. Nothing is reserved or issued until it is released.
            </p>
            {firming.isLate && (
              <Alert tone="warning">
                The release date was {formatDate(firming.releaseDate)}, {firming.daysLate} days ago. The order will be
                created as urgent and will still finish late unless the lot is split or the date moves.
              </Alert>
            )}
          </div>
        )}
      </Modal>

      {mrp.stats.lateOrders > 0 && tab === 'orders' && (
        <Alert tone="warning" className="mt-4">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Rows shaded red have a release date in the past. MRP still plans them — hiding a late order does not make it
            arrive on time.
          </span>
        </Alert>
      )}
    </div>
  )
}
