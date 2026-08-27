import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { exportRows } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { productionOrders as seedOrders, travellerSteps } from '@/mock/mes'
import type { ProductionOrder, TravellerStep } from '@/types/mes'

type Direction = 'backward' | 'forward'

/** Where a batch went after it left the plant — the forward half of traceability. */
const DESPATCHES = [
  { docNo: 'DC/2607/0412', customer: 'Reliance Retail — Chennai DC', quantity: 2_400, despatchedOn: '2026-07-24T10:20:00Z', invoiceNo: 'INV/2627/0871' },
  { docNo: 'DC/2607/0418', customer: 'Metro Cash & Carry — Bengaluru', quantity: 1_800, despatchedOn: '2026-07-26T14:05:00Z', invoiceNo: 'INV/2627/0884' },
  { docNo: 'DC/2607/0431', customer: 'Own outlet — T. Nagar', quantity: 600, despatchedOn: '2026-07-28T09:40:00Z', invoiceNo: null },
]

/**
 * Production genealogy — the answer to "this bottle failed, what else is at
 * risk?". Backward from a finished batch to every raw material heat number;
 * forward from a raw-material batch to every customer who received it.
 */
export function GenealogyPage() {
  const toast = useToast()
  const seed = useMemo(() => seedOrders, [])
  const { rows: orders } = useCollection<ProductionOrder>('mes:order', seed)

  const traceable = orders.filter((o) => o.batchNo)
  const [direction, setDirection] = useState<Direction>('backward')
  const [batchNo, setBatchNo] = useState(traceable[0]?.batchNo ?? '')
  const [serial, setSerial] = useState('')

  const order = traceable.find((o) => o.batchNo === batchNo) ?? traceable[0]
  const steps = travellerSteps
  const inputBatches = [...new Set(steps.flatMap((s) => s.inputBatches))]
  const despatched = DESPATCHES.reduce((s, d) => s + d.quantity, 0)
  const stillInPlant = Math.max(0, (order?.producedQty ?? 0) - despatched)

  function exportTrace() {
    try {
      exportRows(
        'pdf',
        `genealogy-${batchNo.replace(/\//g, '-')}`,
        `Genealogy — batch ${batchNo}`,
        [
          { header: 'Op', value: (s: TravellerStep) => s.sequence },
          { header: 'Operation', value: (s: TravellerStep) => s.operationName },
          { header: 'Machine', value: (s: TravellerStep) => s.machine ?? '—' },
          { header: 'Operator', value: (s: TravellerStep) => s.operator ?? 'not assigned' },
          { header: 'Out', value: (s: TravellerStep) => s.outputQty },
          { header: 'Scrap', value: (s: TravellerStep) => s.scrapQty },
          { header: 'Material consumed', value: (s: TravellerStep) => s.inputBatches.join(', ') || '—' },
        ],
        steps,
      )
      toast.success('Trace report ready', 'This is the document a recall or a customer audit asks for.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  if (!order) {
    return (
      <div>
        <PageHeader title="Production genealogy" breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Genealogy' }]} />
        <Card>
          <CardBody className="py-10 text-center text-sm text-fg-muted">No batch-controlled order to trace yet.</CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Production genealogy"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Genealogy' }]}
        actions={<Button variant="primary" size="sm" onClick={exportTrace}>Export the trace report</Button>}
        tabs={
          <Tabs
            variant="pill"
            active={direction}
            onChange={(v) => setDirection(v as Direction)}
            tabs={[
              { id: 'backward', label: 'Backward — where did it come from' },
              { id: 'forward', label: 'Forward — where did it go' },
            ]}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label="Finished batch"
          sizeVariant="sm"
          containerClassName="w-64"
          value={batchNo}
          onChange={(e) => setBatchNo(e.target.value)}
          options={traceable.map((o) => ({ value: o.batchNo as string, label: `${o.batchNo} — ${o.itemName}` }))}
        />
        <Input
          label="Or a serial number from a returned bottle"
          sizeVariant="sm"
          containerClassName="w-64"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          placeholder="SN-750-0043128"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!serial.trim()) {
              toast.error('Enter a serial number', 'Or pick a batch from the list on the left.')
              return
            }
            setBatchNo(order.batchNo as string)
            toast.success('Serial resolved', `${serial.trim()} belongs to batch ${order.batchNo}. The chain below is that batch.`)
          }}
        >
          Trace the serial
        </Button>
      </div>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-fg">{order.batchNo}</p>
            <p className="text-xs text-fg-muted">{order.itemName} · order {order.docNo} · {order.line}</p>
          </div>
          <div className="flex flex-wrap gap-6 text-xs">
            <p className="text-fg-muted">Made <span className="block text-sm font-semibold tabular text-fg">{formatQty(order.producedQty)}</span></p>
            <p className="text-fg-muted">Despatched <span className="block text-sm font-semibold tabular text-fg">{formatQty(despatched)}</span></p>
            <p className="text-fg-muted">Still in plant <span className={cn('block text-sm font-semibold tabular', stillInPlant ? 'text-progress' : 'text-fg')}>{formatQty(stillInPlant)}</span></p>
            <p className="text-fg-muted">Raw batches <span className="block text-sm font-semibold tabular text-fg">{inputBatches.length}</span></p>
          </div>
        </CardBody>
      </Card>

      {direction === 'backward' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Raw material consumed"
              description="Every heat number and supplier batch that went into these bottles"
            />
            <CardBody className="space-y-2">
              {inputBatches.map((b) => {
                const usedAt = steps.filter((s) => s.inputBatches.includes(b))
                return (
                  <div key={b} className="rounded border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-fg">{b}</span>
                      <Badge tone="brand" size="sm" dot={false}>
                        consumed at {usedAt.length} operation{usedAt.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-2xs text-fg-muted">
                      Used at {usedAt.map((s) => `${s.operationName} (${s.machine ?? 'no machine'})`).join(', ')} ·{' '}
                      <Link to="/inventory/traceability" className="font-medium text-brand-600 hover:underline">
                        open in inventory traceability
                      </Link>
                    </p>
                  </div>
                )
              })}
              {inputBatches.length === 0 && (
                <p className="py-4 text-center text-xs text-fg-muted">No batch-controlled material recorded against this order.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Operation chain" description="What happened to the pieces, in order, with who and on what" />
            <CardBody className="space-y-0">
              {steps.map((s, i) => (
                <div key={s.sequence} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tabular',
                      s.completedAt ? 'border-success bg-success/10 text-success' : s.startedAt ? 'border-progress bg-progress/10 text-progress' : 'border-border bg-surface-2 text-fg-subtle',
                    )}>
                      {s.sequence}
                    </span>
                    {i < steps.length - 1 && <span className={cn('w-px flex-1', s.completedAt ? 'bg-success/40' : 'bg-border')} />}
                  </div>
                  <div className={cn('min-w-0 flex-1 pb-3.5', i === steps.length - 1 && 'pb-0')}>
                    <p className="text-xs font-medium text-fg">{s.operationName}</p>
                    <p className="mt-0.5 text-2xs text-fg-muted">
                      {s.machine ?? 'no machine'} · {s.operator ?? 'not assigned'} ·{' '}
                      <span className="tabular">{formatQty(s.outputQty)} out</span>
                      {s.scrapQty > 0 && <span className="tabular text-danger"> · {s.scrapQty} scrapped</span>}
                      {s.completedAt && ` · ${formatDateTime(s.completedAt)}`}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Where this batch went"
              description="If a defect is confirmed, these are the customers to contact"
            />
            <CardBody className="space-y-2">
              {DESPATCHES.map((d) => (
                <div key={d.docNo} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">{d.customer}</p>
                    <p className="font-mono text-2xs text-fg-subtle">
                      {d.docNo}
                      {d.invoiceNo ? ` · ${d.invoiceNo}` : ' · not invoiced'} · {formatDateTime(d.despatchedOn)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular text-fg">{formatQty(d.quantity)} pcs</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toast.info('Recall list drafted', `${d.customer} — ${formatQty(d.quantity)} pieces from ${batchNo}. In the live system this raises a customer notification.`)}
                    >
                      Add to recall list
                    </Button>
                  </div>
                </div>
              ))}
              {stillInPlant > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-progress/30 bg-progress/5 p-3">
                  <div>
                    <p className="text-xs font-medium text-fg">Still in the plant</p>
                    <p className="text-2xs text-fg-muted">Finished-goods store and WIP — these can be held before they ship.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular text-progress">{formatQty(stillInPlant)} pcs</span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => toast.success('Stock blocked', `${formatQty(stillInPlant)} pieces of ${batchNo} blocked in the finished-goods store. They cannot be picked until quality releases them.`)}
                    >
                      Block the stock
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Everything made on the same machine that shift" description="The usual second question after a defect is confirmed" />
            <CardBody className="space-y-2">
              {steps
                .filter((s) => s.machine && s.startedAt)
                .map((s) => (
                  <div key={s.sequence} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                    <span className="text-xs text-fg">
                      <span className="font-mono">{s.machine}</span> — {s.operationName}, {s.operator}
                    </span>
                    <span className="text-2xs tabular text-fg-muted">{formatQty(s.outputQty)} pcs</span>
                  </div>
                ))}
            </CardBody>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader title="Two directions, two different questions" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2">
          <p>
            <span className="font-medium text-fg">Backward</span> starts with a failed bottle and asks what went into it — which
            coil, which disc, which machine, which operator. That is how you find the cause.
          </p>
          <p>
            <span className="font-medium text-fg">Forward</span> starts with a suspect raw-material batch and asks who received
            the bottles made from it. That is how you size a recall — and how you avoid recalling more than you need to.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
