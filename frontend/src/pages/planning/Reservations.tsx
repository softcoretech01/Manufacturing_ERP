import { useMemo, useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { CoverBar, OrderStatusBadge } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatAmount, formatQty } from '@/lib/format'
import { planningItem, reservationCheck } from '@/lib/planFlow'
import { usePlanningData } from './usePlanningData'
import type { ProductionOrder } from '@/types/planning'

/**
 * Material reservation (Ch 15).
 *
 * The screen that stops the same kilogram of steel being promised to three
 * orders. Free stock is what inventory reports less everything other open
 * orders have already claimed, so a reservation that cannot be covered is
 * refused and reported rather than quietly written down.
 */

const OPEN: ProductionOrder['status'][] = ['RELEASED', 'MATERIAL_RESERVED', 'MATERIAL_ISSUED', 'IN_PRODUCTION']

interface Row {
  key: string
  order: ProductionOrder
  itemCode: string
  itemName: string
  uom: string
  requiredQty: number
  reservedQty: number
  issuedQty: number
  freeStock: number
  claimedElsewhere: number
  canStillReserve: number
  rate: number
}

export function ReservationsPage() {
  const toast = useToast()
  const { orders, ctx } = usePlanningData()

  const [tab, setTab] = useState('open')
  const [releasing, setReleasing] = useState<Row | null>(null)
  const [reserving, setReserving] = useState<ProductionOrder | null>(null)

  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    for (const o of orders.rows) {
      if (o.deletedAt || !OPEN.includes(o.status)) continue
      for (const c of o.components) {
        const check = reservationCheck(c.itemCode, c.requiredQty - c.reservedQty, orders.rows, o.uid, ctx)
        const item = planningItem(c.itemCode, ctx)
        out.push({
          key: `${o.uid}-${c.uid}`,
          order: o,
          itemCode: c.itemCode,
          itemName: c.itemName,
          uom: c.uom,
          requiredQty: c.requiredQty,
          reservedQty: c.reservedQty,
          issuedQty: c.issuedQty,
          freeStock: check.freeStock,
          claimedElsewhere: check.alreadyReserved,
          canStillReserve: check.canReserve,
          rate: item.rate,
        })
      }
    }
    return out
  }, [orders.rows, ctx])

  const counts = {
    open: rows.filter((r) => r.reservedQty < r.requiredQty).length,
    reserved: rows.filter((r) => r.reservedQty >= r.requiredQty).length,
    blocked: rows.filter((r) => r.reservedQty < r.requiredQty && r.canStillReserve < r.requiredQty - r.reservedQty).length,
    all: rows.length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'open') return r.reservedQty < r.requiredQty
    if (tab === 'reserved') return r.reservedQty >= r.requiredQty
    if (tab === 'blocked') return r.reservedQty < r.requiredQty && r.canStillReserve < r.requiredQty - r.reservedQty
    return true
  })

  /** Per-item view: total claimed against what inventory actually holds. */
  const byItem = useMemo(() => {
    const map = new Map<string, { itemCode: string; itemName: string; uom: string; required: number; reserved: number; free: number; orders: number; rate: number }>()
    for (const r of rows) {
      const e = map.get(r.itemCode) ?? {
        itemCode: r.itemCode,
        itemName: r.itemName,
        uom: r.uom,
        required: 0,
        reserved: 0,
        free: planningItem(r.itemCode, ctx).available,
        orders: 0,
        rate: r.rate,
      }
      e.required += r.requiredQty
      e.reserved += r.reservedQty
      e.orders++
      map.set(r.itemCode, e)
    }
    return [...map.values()].sort((a, b) => b.required - b.free - (a.required - a.free))
  }, [rows, ctx])

  const overCommitted = byItem.filter((i) => i.required > i.free)

  function reserveAll(o: ProductionOrder) {
    let shortfalls = 0
    const components = o.components.map((c) => {
      const check = reservationCheck(c.itemCode, c.requiredQty, orders.rows, o.uid, ctx)
      if (check.isOverAllocated) shortfalls++
      return { ...c, reservedQty: check.canReserve }
    })
    orders.update(o.uid, { components, status: o.status === 'RELEASED' ? 'MATERIAL_RESERVED' : o.status, version: o.version + 1 })
    toast.success(
      shortfalls ? 'Partly reserved' : 'Reserved',
      shortfalls
        ? `${shortfalls} of ${components.length} components could not be fully covered — free stock is already claimed.`
        : `All ${components.length} components reserved for ${o.docNo}.`,
    )
    setReserving(null)
  }

  function releaseLine(r: Row) {
    const components = r.order.components.map((c) => (c.itemCode === r.itemCode ? { ...c, reservedQty: 0 } : c))
    orders.update(r.order.uid, { components, version: r.order.version + 1 })
    toast.success('Released', `${formatQty(r.reservedQty, 2)} ${r.uom} of ${r.itemCode} returned to free stock.`)
    setReleasing(null)
  }

  const columns: Column<Row>[] = [
    { key: 'order', header: 'Order', sortable: true, width: '11rem', accessor: (r) => r.order.docNo, render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.order.docNo}</span> },
    {
      key: 'itemCode',
      header: 'Component',
      sortable: true,
      render: (r) => (
        <>
          <p className="text-xs font-medium text-fg">{r.itemName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{r.itemCode}</p>
        </>
      ),
    },
    { key: 'requiredQty', header: 'Required', align: 'right', sortable: true, width: '8rem', accessor: (r) => r.requiredQty, render: (r) => `${formatQty(r.requiredQty, 2)} ${r.uom}` },
    { key: 'reservedQty', header: 'Reserved', align: 'right', sortable: true, width: '8rem', accessor: (r) => r.reservedQty, render: (r) => (r.reservedQty ? formatQty(r.reservedQty, 2) : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'issuedQty', header: 'Issued', align: 'right', width: '7rem', accessor: (r) => r.issuedQty, render: (r) => (r.issuedQty ? formatQty(r.issuedQty, 2) : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'freeStock', header: 'Free stock', align: 'right', width: '8rem', accessor: (r) => r.freeStock, render: (r) => <span className="text-fg-muted">{formatQty(r.freeStock, 0)}</span> },
    { key: 'claimedElsewhere', header: 'Claimed elsewhere', align: 'right', width: '10rem', accessor: (r) => r.claimedElsewhere, render: (r) => (r.claimedElsewhere ? formatQty(r.claimedElsewhere, 0) : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'cover', header: 'Cover', width: '8rem', accessor: (r) => (r.requiredQty ? (r.reservedQty / r.requiredQty) * 100 : 100), render: (r) => <CoverBar required={r.requiredQty} available={r.reservedQty} /> },
    { key: 'status', header: 'Order status', width: '10rem', accessor: (r) => r.order.status, render: (r) => <OrderStatusBadge status={r.order.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Material reservation"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Reservations' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Not fully reserved', count: counts.open },
              { id: 'blocked', label: 'Cannot be covered', count: counts.blocked },
              { id: 'reserved', label: 'Fully reserved', count: counts.reserved },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />

      {overCommitted.length > 0 && (
        <Alert tone="danger" className="mb-4">
          {overCommitted.length} component{overCommitted.length === 1 ? '' : 's'} {overCommitted.length === 1 ? 'is' : 'are'} demanded
          by open orders beyond what is in free stock:{' '}
          {overCommitted.slice(0, 4).map((i) => `${i.itemCode} (short ${formatQty(i.required - i.free, 0)} ${i.uom})`).join(', ')}
          . Reservation will cover what exists and refuse the rest rather than promising it twice.
        </Alert>
      )}

      <Card className="mb-4">
        <CardHeader title="Demand against free stock, by component" description="Every open order's requirement summed and compared with what inventory holds" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="text-right" style={{ width: '6rem' }}>Orders</th>
                  <th className="text-right" style={{ width: '9rem' }}>Required</th>
                  <th className="text-right" style={{ width: '9rem' }}>Reserved</th>
                  <th className="text-right" style={{ width: '9rem' }}>Free stock</th>
                  <th className="text-right" style={{ width: '9rem' }}>Balance</th>
                  <th style={{ width: '9rem' }}>Cover</th>
                  <th className="text-right" style={{ width: '10rem' }}>Value at risk</th>
                </tr>
              </thead>
              <tbody>
                {byItem.map((i) => {
                  const balance = i.free - i.required
                  return (
                    <tr key={i.itemCode} className={balance < 0 ? 'bg-danger/5' : undefined}>
                      <td>
                        <p className="text-xs font-medium text-fg">{i.itemName}</p>
                        <p className="font-mono text-2xs text-fg-subtle">{i.itemCode}</p>
                      </td>
                      <td className="text-right tabular text-xs text-fg-muted">{i.orders}</td>
                      <td className="text-right tabular text-xs">{formatQty(i.required, 2)} {i.uom}</td>
                      <td className="text-right tabular text-xs">{formatQty(i.reserved, 2)}</td>
                      <td className="text-right tabular text-xs text-fg-muted">{formatQty(i.free, 0)}</td>
                      <td className={cn('text-right tabular text-xs font-medium', balance < 0 ? 'text-danger' : 'text-success')}>
                        {balance < 0 ? '' : '+'}
                        {formatQty(balance, 2)}
                      </td>
                      <td><CoverBar required={i.required} available={i.free} /></td>
                      <td className="text-right tabular text-xs">
                        {balance < 0 ? `₹${formatAmount(Math.abs(balance) * i.rate)}` : <span className="text-2xs text-fg-subtle">—</span>}
                      </td>
                    </tr>
                  )
                })}
                {!byItem.length && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-2xs text-fg-subtle">No released orders, so nothing is claiming stock.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.key}
        searchPlaceholder="Search order or component…"
        onExport={(f: ExportFormat) => {
          const columns2: ExportColumn<Row>[] = [
            { header: 'Order', value: (r) => r.order.docNo },
            { header: 'Component', value: (r) => r.itemCode },
            { header: 'Description', value: (r) => r.itemName },
            { header: 'Required', value: (r) => r.requiredQty.toFixed(3) },
            { header: 'Reserved', value: (r) => r.reservedQty.toFixed(3) },
            { header: 'Issued', value: (r) => r.issuedQty.toFixed(3) },
            { header: 'Free stock', value: (r) => r.freeStock.toFixed(3) },
            { header: 'Claimed elsewhere', value: (r) => r.claimedElsewhere.toFixed(3) },
          ]
          const n = exportRows(f, 'reservations', 'Material reservations', columns2, filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        rowClassName={(r) => (r.reservedQty < r.requiredQty && r.canStillReserve < r.requiredQty - r.reservedQty ? 'bg-warning/5' : undefined)}
        emptyTitle="Nothing to reserve"
        emptyDescription="Release a production order to claim its components."
        rowActions={(r) => (
          <>
            <MenuItem
              label="Reserve everything on this order"
              icon={<Lock />}
              disabled={r.order.status === 'MATERIAL_ISSUED' || r.order.status === 'IN_PRODUCTION'}
              onClick={() => setReserving(r.order)}
            />
            <MenuItem
              label="Release this reservation"
              icon={<Unlock />}
              danger
              separatorBefore
              disabled={r.reservedQty <= 0 || r.issuedQty > 0}
              onClick={() => setReleasing(r)}
            />
          </>
        )}
      />

      <Modal
        open={!!reserving}
        onClose={() => setReserving(null)}
        title="Reserve material"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReserving(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => reserving && reserveAll(reserving)}>
              Reserve what is available
            </Button>
          </>
        }
      >
        {reserving && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">{reserving.docNo}</span> — {reserving.components.length} components.
            </p>
            <div className="overflow-x-auto rounded border border-border">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="text-right" style={{ width: '7rem' }}>Required</th>
                    <th className="text-right" style={{ width: '7rem' }}>Can reserve</th>
                    <th style={{ width: '6rem' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {reserving.components.map((c) => {
                    const check = reservationCheck(c.itemCode, c.requiredQty, orders.rows, reserving.uid, ctx)
                    return (
                      <tr key={c.uid}>
                        <td className="font-mono text-2xs">{c.itemCode}</td>
                        <td className="text-right tabular text-xs">{formatQty(c.requiredQty, 2)}</td>
                        <td className="text-right tabular text-xs">{formatQty(check.canReserve, 2)}</td>
                        <td>
                          {check.isOverAllocated ? (
                            <Badge tone="warning" size="sm">Partial</Badge>
                          ) : (
                            <Badge tone="success" size="sm">Full</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-2xs text-fg-subtle">
              Only what is genuinely free is reserved. Anything another open order has already claimed is left alone —
              which is the whole point of reserving rather than assuming.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!releasing}
        onClose={() => setReleasing(null)}
        title="Release this reservation?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReleasing(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => releasing && releaseLine(releasing)}>
              Release
            </Button>
          </>
        }
      >
        {releasing && (
          <p className="text-sm text-fg-muted">
            {formatQty(releasing.reservedQty, 2)} {releasing.uom} of{' '}
            <span className="font-medium text-fg">{releasing.itemCode}</span> goes back to free stock and{' '}
            {releasing.order.docNo} loses its claim. Any other order short of this component can then take it.
          </p>
        )}
      </Modal>
    </div>
  )
}
