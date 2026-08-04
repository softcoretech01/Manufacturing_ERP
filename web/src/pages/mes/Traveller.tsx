import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { MesStatusBadge, OperationCell } from '@/components/mes/MesShell'
import { exportRows } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { productionOrders as seedOrders, travellerSteps } from '@/mock/mes'
import type { ProductionOrder, TravellerStep } from '@/types/mes'

/**
 * Traveller card — the sheet that moves with the batch. On paper it is what the
 * operator signs at each operation; here it is the same chain, kept current, so
 * anybody can see where a batch is and what it has already been through.
 */
export function TravellerPage() {
  const toast = useToast()
  const seed = useMemo(() => seedOrders, [])
  const { rows: orders } = useCollection<ProductionOrder>('mes:order', seed)

  const printable = orders.filter((o) => o.status !== 'PLANNED' && o.status !== 'CANCELLED')
  const [orderUid, setOrderUid] = useState(printable[0]?.uid ?? '')
  const order = orders.find((o) => o.uid === orderUid) ?? printable[0]

  const steps: TravellerStep[] = travellerSteps
  const done = steps.filter((s) => s.completedAt)
  const current = steps.find((s) => s.startedAt && !s.completedAt)
  const totalScrap = steps.reduce((s, x) => s + x.scrapQty, 0)
  const yieldPct = steps[0]?.inputQty ? ((done.at(-1)?.outputQty ?? steps[0].inputQty) / steps[0].inputQty) * 100 : 0

  function printCard() {
    try {
      exportRows(
        'pdf',
        `traveller-${order?.docNo.replace(/\//g, '-') ?? 'card'}`,
        `Traveller card — ${order?.docNo ?? ''}`,
        [
          { header: 'Op', value: (s: TravellerStep) => s.sequence },
          { header: 'Operation', value: (s: TravellerStep) => s.operationName },
          { header: 'Work centre', value: (s: TravellerStep) => s.workCentre },
          { header: 'Machine', value: (s: TravellerStep) => s.machine ?? '—' },
          { header: 'Operator', value: (s: TravellerStep) => s.operator ?? 'not assigned' },
          { header: 'Tool', value: (s: TravellerStep) => s.tool ?? '—' },
          { header: 'In', value: (s: TravellerStep) => s.inputQty },
          { header: 'Out', value: (s: TravellerStep) => s.outputQty },
          { header: 'Scrap', value: (s: TravellerStep) => s.scrapQty },
          { header: 'QC', value: (s: TravellerStep) => s.qcResult },
          { header: 'Completed', value: (s: TravellerStep) => (s.completedAt ? formatDateTime(s.completedAt) : 'not complete') },
        ],
        steps,
      )
      toast.success('Traveller card ready', 'Print it and keep it with the trolley — the operator signs each row as the batch moves.')
    } catch (e) {
      toast.error('Print failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  if (!order) {
    return (
      <div>
        <PageHeader title="Traveller card" breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Traveller' }]} />
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-sm text-fg-muted">No released order to print a card for yet.</p>
            <Link to="/production/orders" className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">Go to production orders</Link>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Traveller card"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Traveller' }]}
        actions={<Button variant="primary" size="sm" onClick={printCard}>Print the card</Button>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-80"
          value={order.uid}
          onChange={(e) => setOrderUid(e.target.value)}
          options={printable.map((o) => ({ value: o.uid, label: `${o.docNo} — ${o.itemName}` }))}
        />
        <p className="text-xs text-fg-muted">
          The card travels with the batch. Each row is signed off as the pieces move on, so the next operation always knows what
          it is receiving.
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader
          title={order.docNo}
          description={`${order.itemName} · batch ${order.batchNo ?? 'not assigned'}`}
          actions={<MesStatusBadge status={order.status} />}
        />
        <CardBody>
          <DataGrid
            items={[
              { label: 'Item', value: `${order.itemName} (${order.itemCode})` },
              { label: 'Batch', value: order.batchNo ?? '—', mono: true },
              { label: 'Order quantity', value: `${formatQty(order.plannedQty)} ${order.uom}` },
              { label: 'BOM / routing', value: `${order.bomRevision} / ${order.routingRevision}` },
              { label: 'Line', value: order.line },
              { label: 'Customer', value: order.customer ?? 'Stock build' },
              { label: 'Sales order', value: order.salesOrderNo ?? '—', mono: true },
              { label: 'Released by', value: order.releasedBy ?? 'not released' },
            ]}
          />
          <div className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wide text-fg-subtle">Progress through the route</p>
              <div className="flex items-center gap-2">
                <ProgressBar value={(done.length / steps.length) * 100} tone="brand" className="flex-1" />
                <span className="text-2xs tabular text-fg">{done.length}/{steps.length} ops</span>
              </div>
            </div>
            <p className="text-xs text-fg-muted">
              Cumulative scrap <span className={cn('block text-sm font-semibold tabular', totalScrap ? 'text-danger' : 'text-success')}>{formatQty(totalScrap)} pcs</span>
            </p>
            <p className="text-xs text-fg-muted">
              Yield so far <span className={cn('block text-sm font-semibold tabular', yieldPct >= 97 ? 'text-success' : 'text-warning')}>{yieldPct.toFixed(1)}%</span>
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Operation history"
          description={current ? `Currently at operation ${current.sequence} — ${current.operationName}` : 'All started operations are complete'}
        />
        <CardBody className="space-y-0">
          {steps.map((s, i) => {
            const state = s.completedAt ? 'done' : s.startedAt ? 'current' : 'pending'
            return (
              <div key={s.sequence} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tabular',
                      state === 'done' && 'border-success bg-success/10 text-success',
                      state === 'current' && 'border-progress bg-progress/10 text-progress',
                      state === 'pending' && 'border-border bg-surface-2 text-fg-subtle',
                    )}
                  >
                    {s.sequence}
                  </span>
                  {i < steps.length - 1 && (
                    <span className={cn('w-px flex-1', state === 'done' ? 'bg-success/40' : 'bg-border')} />
                  )}
                </div>

                <div className={cn('min-w-0 flex-1 pb-4', i === steps.length - 1 && 'pb-0')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <OperationCell sequence={s.sequence} name={s.operationName} workCentre={s.workCentre} />
                    <div className="flex items-center gap-2">
                      {s.qcResult !== 'NOT_REQUIRED' && (
                        <Badge tone={s.qcResult === 'PASSED' ? 'success' : s.qcResult === 'FAILED' ? 'danger' : 'warning'} size="sm" dot={false}>
                          QC {s.qcResult.toLowerCase()}
                        </Badge>
                      )}
                      {state === 'done' && <Badge tone="success" size="sm">Completed</Badge>}
                      {state === 'current' && <Badge tone="progress" size="sm">Running</Badge>}
                      {state === 'pending' && <Badge tone="neutral" size="sm" dot={false}>Not started</Badge>}
                    </div>
                  </div>

                  <div className="mt-1.5 grid gap-x-4 gap-y-1 text-2xs text-fg-muted sm:grid-cols-4">
                    <p>Machine <span className="font-mono text-fg">{s.machine ?? '—'}</span></p>
                    <p>Operator <span className="text-fg">{s.operator ?? 'not assigned'}</span></p>
                    <p>Tool <span className="text-fg">{s.tool ?? '—'}</span></p>
                    <p>
                      In / out{' '}
                      <span className="tabular text-fg">
                        {formatQty(s.inputQty)} → {formatQty(s.outputQty)}
                      </span>
                      {s.scrapQty > 0 && <span className="tabular text-danger"> (−{s.scrapQty})</span>}
                    </p>
                  </div>

                  {(s.startedAt || s.inputBatches.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-subtle">
                      {s.startedAt && <span>Started {formatDateTime(s.startedAt)}</span>}
                      {s.completedAt && <span>Completed {formatDateTime(s.completedAt)}</span>}
                      {s.inputBatches.length > 0 && (
                        <span>
                          Material consumed:{' '}
                          {s.inputBatches.map((b) => (
                            <span key={b} className="ml-1 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-fg-muted">{b}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Why the card matters after the batch has shipped" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>A customer complaint six months later starts with a batch number. This chain is what turns that number into a machine, an operator, a shift and a raw-material heat number.</p>
          <p>Every input batch recorded at an operation is a link backwards. Follow them and you get the full genealogy — see <Link to="/production/genealogy" className="font-medium text-brand-600 hover:underline">genealogy</Link>.</p>
          <p>The scrap at each step is the yield story. A single operation losing 2% quietly is worth more than a dramatic one-off rejection.</p>
        </CardBody>
      </Card>
    </div>
  )
}
