import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { MesStatusBadge } from '@/components/mes/MesShell'
import { exportRows } from '@/lib/export'
import { formatDate, formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { shopFloorApi, type ProductionOrderRow, type TravellerResult } from '@/api/shopfloor'

/**
 * The traveller — the job card a lot carries through the plant.
 *
 * Every step is a work order row, and the quantities under each step are the
 * production entries actually booked against it. Where a step shows a produced
 * quantity but carries no entries, that is shown as it is rather than hidden:
 * it means the quantity reached the work order by some route other than a
 * booking, and somebody should know.
 */

export function TravellerPage() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [orders, setOrders] = useState<ProductionOrderRow[]>([])
  const [data, setData] = useState<TravellerResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selected = params.get('order') ?? ''

  useEffect(() => {
    shopFloorApi
      .orders()
      .then((list) => {
        const released = list.filter((o) => o.released)
        setOrders(released)
        if (!selected && released.length) setParams({ order: released[0].docNo }, { replace: true })
        setError(null)
      })
      .catch((err) => setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setData(null)
    shopFloorApi
      .traveller(selected)
      .then((res) => {
        setData(res)
        setError(null)
      })
      .catch((err) => setError(err instanceof ProblemError ? err.problem.detail : 'That order has no traveller.'))
  }, [selected])

  function print() {
    if (!data) return
    try {
      exportRows(
        'pdf',
        `traveller-${data.order.docNo.replace(/\//g, '-')}`,
        `Traveller — ${data.order.docNo}`,
        [
          { header: 'Seq', value: (s: TravellerResult['steps'][number]) => String(s.seq) },
          { header: 'Operation', value: (s) => s.operationName },
          { header: 'Work centre', value: (s) => s.workCentreCode },
          { header: 'Machine', value: (s) => s.machineCode ?? '—' },
          { header: 'Operator', value: (s) => s.operatorName ?? '—' },
          { header: 'In', value: (s) => formatQty(s.inputQty) },
          { header: 'Good', value: (s) => formatQty(s.producedQty) },
          { header: 'Scrap', value: (s) => formatQty(s.scrapQty) },
          { header: 'Status', value: (s) => s.status },
        ],
        data.steps,
      )
      toast.success('Traveller printed', `${data.order.docNo} — one sheet to travel with the lot.`)
    } catch (e) {
      toast.error('Print failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** A step whose quantity did not come from a booking. Worth flagging. */
  function unbooked(step: TravellerResult['steps'][number]) {
    return step.producedQty > 0 && step.entries.length === 0
  }

  const orphans = data ? data.steps.filter(unbooked) : []

  return (
    <div>
      <PageHeader
        title="Traveller"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Traveller' }]}
        actions={<Button variant="outline" size="sm" disabled={!data} onClick={print}>Print traveller</Button>}
      />

      {error && (
        <Alert tone="danger" title="The traveller could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

      {!loading && !orders.length && !error && (
        <Alert tone="info" title="No order has been released">
          A traveller exists only once an order is on the floor. Release a production order to create one.
        </Alert>
      )}

      {orders.length > 0 && (
        <div className="mb-4 max-w-md">
          <Select
            label="Production order"
            value={selected}
            onChange={(e) => setParams({ order: e.target.value })}
            options={orders.map((o) => ({ value: o.docNo, label: `${o.docNo} — ${o.productCode} (${formatQty(o.qty)})` }))}
          />
        </div>
      )}

      {data && (
        <>
          <Card className="mb-4">
            <CardHeader
              title={data.order.docNo}
              description={`${data.order.productCode} — ${data.order.productName}`}
              actions={<MesStatusBadge status={data.order.status} />}
            />
            <CardBody>
              <DataGrid
                items={[
                  { label: 'Ordered', value: `${formatQty(data.order.qty)} ${data.order.uom}` },
                  { label: 'Produced', value: formatQty(data.order.producedQty) },
                  { label: 'Rejected', value: formatQty(data.order.rejectedQty) },
                  { label: 'Bill', value: `${data.order.bomDocNo} r${data.order.bomRevision}` },
                  { label: 'Routing', value: `${data.order.routingDocNo} r${data.order.routingRevision}` },
                  { label: 'Plant', value: data.order.plant || '—' },
                ]}
              />
            </CardBody>
          </Card>

          {orphans.length > 0 && (
            <Alert tone="warning" title="Some steps carry a quantity with no booking behind it" className="mb-4">
              {orphans.map((s) => `operation ${s.seq} (${s.operationName})`).join(', ')} show produced quantities but have no
              production entry. The current code cannot complete an operation without a booking, so these rows predate it. They
              are left exactly as they are — a production record is never rewritten to make a report look tidy.
            </Alert>
          )}

          {/* The route ------------------------------------------------------ */}
          <div className="space-y-3">
            {data.steps.map((s) => (
              <Card key={s.uid}>
                <CardHeader
                  title={`${s.seq} · ${s.operationName}`}
                  description={`${s.workCentreCode}${s.machineCode ? ` · ${s.machineCode}` : ''}${s.operatorName ? ` · ${s.operatorName}` : ''}`}
                  actions={
                    <div className="flex items-center gap-2">
                      {s.qcCheckpoint && (
                        <Badge tone={s.qcResult === 'PASSED' || s.qcResult === 'PASS' ? 'success' : s.qcResult === 'FAILED' ? 'danger' : 'warning'} size="sm">
                          QC {s.qcResult.toLowerCase().replace('_', ' ')}
                        </Badge>
                      )}
                      <MesStatusBadge status={s.status} size="sm" />
                    </div>
                  }
                />
                <CardBody>
                  <div className="grid gap-2 text-xs sm:grid-cols-5">
                    <p className="text-fg-muted">Came in <span className="block font-medium tabular text-fg">{formatQty(s.inputQty)}</span></p>
                    <p className="text-fg-muted">Good <span className="block font-medium tabular text-success">{formatQty(s.producedQty)}</span></p>
                    <p className="text-fg-muted">Scrap <span className={cn('block font-medium tabular', s.scrapQty ? 'text-danger' : 'text-fg')}>{formatQty(s.scrapQty)}</span></p>
                    <p className="text-fg-muted">Standard <span className="block font-medium tabular text-fg">{s.setupMinutesStd + s.runMinutesStd} min</span></p>
                    <p className="text-fg-muted">Actual <span className="block font-medium tabular text-fg">{s.setupMinutesAct + s.runMinutesAct} min</span></p>
                  </div>

                  {(s.startedAt || s.completedAt) && (
                    <p className="mt-2 text-2xs text-fg-subtle">
                      {s.startedAt ? `Started ${formatDateTime(s.startedAt)}` : 'Not started'}
                      {s.completedAt ? ` · finished ${formatDateTime(s.completedAt)}` : ''}
                      {s.batchNo ? ` · batch ${s.batchNo}` : ''}
                    </p>
                  )}

                  {s.entries.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="grid-table">
                        <thead>
                          <tr>
                            <th className="w-36">Entry</th>
                            <th className="w-28">Date</th>
                            <th>Operator</th>
                            <th className="w-20">Shift</th>
                            <th className="w-24 text-right">Good</th>
                            <th className="w-24 text-right">Scrap</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.entries.map((e) => (
                            <tr key={e.docNo} className={cn(e.isReversal && 'opacity-60')}>
                              <td className={cn('font-mono text-2xs', e.isReversal ? 'text-danger' : 'text-brand-600')}>
                                {e.docNo}{e.isReversal ? ' (reversed)' : ''}
                              </td>
                              <td className="text-2xs">{e.businessDate ? formatDate(e.businessDate) : '—'}</td>
                              <td className="text-2xs">{e.operatorName || '—'}</td>
                              <td className="text-2xs">{e.shiftCode || '—'}</td>
                              <td className="text-right tabular text-2xs">{formatQty(e.goodQty)}</td>
                              <td className="text-right tabular text-2xs">{formatQty(e.scrapQty)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 text-2xs text-fg-subtle">
                      {unbooked(s)
                        ? 'No production entry sits behind this quantity.'
                        : 'Nothing has been booked against this operation yet.'}
                    </p>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Components ------------------------------------------------------ */}
          <Card className="mt-4">
            <CardHeader title="Material on this order" description="What the bill called for, and what has actually been issued" />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="w-28 text-right">Required</th>
                      <th className="w-28 text-right">Reserved</th>
                      <th className="w-28 text-right">Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.components.map((c) => (
                      <tr key={c.itemCode}>
                        <td>
                          <p className="font-mono text-2xs text-fg">{c.itemCode}</p>
                          <p className="truncate text-2xs text-fg-subtle" title={c.itemName}>{c.itemName}</p>
                        </td>
                        <td className="text-right tabular">{formatQty(c.requiredQty)}</td>
                        <td className="text-right tabular">{formatQty(c.reservedQty)}</td>
                        <td className={cn('text-right tabular', c.issuedQty >= c.requiredQty ? 'text-success' : 'text-fg')}>
                          {formatQty(c.issuedQty)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
