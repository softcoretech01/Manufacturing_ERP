import { useMemo, useState } from 'react'
import { AlertOctagon, Search } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid, EmptyState } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { SearchInput, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { InvStatusBadge } from '@/components/inventory/InvShell'
import { exportRows } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { batches as seedBatches, serials as seedSerials } from '@/mock/inventory'
import type { Batch, SerialUnit } from '@/types/inventory'

interface TraceNode {
  batch: Batch
  depth: number
  via: string
  qty: number
}

/**
 * Traceability — backward from a finished bottle to the steel heat it was drawn
 * from, and forward from a heat to every bottle, carton and customer made from it.
 */
export function TraceabilityPage() {
  const toast = useToast()
  const batchSeed = useMemo(() => seedBatches, [])
  const serialSeed = useMemo(() => seedSerials, [])
  const { rows: batches, update } = useCollection<Batch>('inv:batch', batchSeed)
  const { rows: serials } = useCollection<SerialUnit>('inv:serial', serialSeed)

  const [key, setKey] = useState('')
  const [result, setResult] = useState<{ serial?: SerialUnit; batch?: Batch } | null>(null)
  const [recallOpen, setRecallOpen] = useState(false)
  const [recallReason, setRecallReason] = useState('')

  /** Walk up the genealogy: what this batch was made from, level by level. */
  function ancestors(b: Batch, depth = 0): TraceNode[] {
    if (depth > 4) return []
    return b.parents.flatMap((p) => {
      const parent = batches.find((x) => x.batchNo === p.batchNo)
      if (!parent) return []
      return [{ batch: parent, depth, via: p.docNo, qty: p.quantity }, ...ancestors(parent, depth + 1)]
    })
  }

  /** Walk down: everything made from this batch. */
  function descendants(b: Batch, depth = 0): TraceNode[] {
    if (depth > 4) return []
    return b.children.flatMap((c) => {
      const child = batches.find((x) => x.batchNo === c.batchNo)
      if (!child) return [{ batch: { ...b, batchNo: c.batchNo, itemName: c.itemName } as Batch, depth, via: c.docNo, qty: c.quantity }]
      return [{ batch: child, depth, via: c.docNo, qty: c.quantity }, ...descendants(child, depth + 1)]
    })
  }

  function runTrace(input?: string) {
    const q = (input ?? key).trim().toLowerCase()
    if (!q) return
    const serial = serials.find((s) => s.serialNo.toLowerCase() === q || s.cartonNo?.toLowerCase() === q || s.salesDocNo?.toLowerCase() === q)
    const batch =
      batches.find((b) => b.batchNo.toLowerCase() === q) ??
      batches.find((b) => (b.supplierBatchNo ?? '').toLowerCase() === q) ??
      batches.find((b) => b.sourceDocNo.toLowerCase() === q) ??
      (serial ? batches.find((b) => b.batchNo === serial.batchNo) : undefined)

    if (!serial && !batch) {
      setResult(null)
      toast.error('Nothing found', 'Try a serial number, a carton, an internal batch, a supplier heat number or a GRN.')
      return
    }
    setResult({ serial, batch })
  }

  const back = result?.batch ? ancestors(result.batch) : []
  const forward = result?.batch ? descendants(result.batch) : []
  const affectedSerials = result?.batch ? serials.filter((s) => s.batchNo === result.batch!.batchNo || forward.some((f) => f.batch.batchNo === s.batchNo)) : []
  const affectedCustomers = [...new Set(affectedSerials.map((s) => s.customer).filter(Boolean))] as string[]

  function startRecall() {
    if (!result?.batch) return
    if (!recallReason.trim()) {
      toast.error('Reason required', 'A recall is a serious act — say what triggered it.')
      return
    }
    const chain = [result.batch, ...forward.map((f) => f.batch)]
    chain.forEach((b) => {
      const live = batches.find((x) => x.batchNo === b.batchNo)
      if (live) update(live.uid, { status: 'RECALLED', blockReason: `Recall — ${recallReason.trim()}` })
    })
    toast.success(
      'Recall started',
      `${chain.length} batch(es) blocked everywhere they exist. ${affectedSerials.length} unit(s) and ${affectedCustomers.length} customer(s) are on the notification list.`,
    )
    setRecallOpen(false)
    setRecallReason('')
  }

  function exportPack() {
    if (!result?.batch) return
    try {
      const rows = [
        ...back.map((n) => ({ direction: 'Made from', batch: n.batch.batchNo, item: n.batch.itemName, qty: n.qty, doc: n.via, supplier: n.batch.supplier ?? 'in-house', heat: n.batch.supplierBatchNo ?? '—', mtc: n.batch.mtcNo ?? '—' })),
        { direction: 'This batch', batch: result.batch.batchNo, item: result.batch.itemName, qty: result.batch.quantityReceived, doc: result.batch.sourceDocNo, supplier: result.batch.supplier ?? 'in-house', heat: result.batch.supplierBatchNo ?? '—', mtc: result.batch.mtcNo ?? '—' },
        ...forward.map((n) => ({ direction: 'Went into', batch: n.batch.batchNo, item: n.batch.itemName, qty: n.qty, doc: n.via, supplier: '—', heat: '—', mtc: '—' })),
      ]
      exportRows('pdf', `trace-${result.batch.batchNo}`, `Traceability pack — ${result.batch.batchNo}`, [
        { header: 'Direction', value: (r: typeof rows[number]) => r.direction },
        { header: 'Batch', value: (r) => r.batch },
        { header: 'Item', value: (r) => r.item },
        { header: 'Quantity', value: (r) => formatQty(r.qty) },
        { header: 'Document', value: (r) => r.doc },
        { header: 'Supplier', value: (r) => r.supplier },
        { header: 'Heat / lot', value: (r) => r.heat },
        { header: 'MTC', value: (r) => r.mtc },
      ], rows)
      toast.success('Trace pack ready', 'Genealogy, documents and certificates in one printable file — the pack an auditor asks for.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Traceability"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Traceability' }]}
        actions={
          result?.batch && (
            <>
              <Button variant="outline" size="sm" onClick={exportPack}>Export trace pack</Button>
              <Button variant="danger" size="sm" icon={<AlertOctagon className="h-4 w-4" />} onClick={() => setRecallOpen(true)}>
                Start recall
              </Button>
            </>
          )
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="One input, both directions"
          description="A serial, a carton, an internal batch, a supplier heat number, a GRN or an invoice"
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <SearchInput
              containerClassName="w-full sm:w-96"
              placeholder="750BLK260700001, B2606-H4471, heat 4471, CTN260011284…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runTrace()}
            />
            <Button variant="primary" size="sm" icon={<Search className="h-4 w-4" />} onClick={() => runTrace()}>Trace</Button>
            <Button variant="ghost" size="sm" onClick={() => { setKey('4471'); runTrace('4471') }}>Try heat 4471</Button>
            <Button variant="ghost" size="sm" onClick={() => { setKey('750BLK260700001'); runTrace('750BLK260700001') }}>Try a bottle serial</Button>
          </div>
          <p className="text-2xs text-fg-subtle">
            Backward from a bottle: coating batch, body shell, steel heat, mill certificate, supplier and GRN. Forward from a
            heat: every shell, bottle, carton, invoice and customer it ended up in.
          </p>
        </CardBody>
      </Card>

      {!result ? (
        <Card>
          <EmptyState
            title="Nothing traced yet"
            description="Scan or type any identifier above. This is the screen a quality investigation, a warranty claim or a recall starts from."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {result.serial && (
            <Card>
              <CardHeader title="The unit" description={`Serial ${result.serial.serialNo}`} />
              <CardBody>
                <DataGrid
                  columns={3}
                  items={[
                    { label: 'Item', value: result.serial.itemName },
                    { label: 'Batch', value: result.serial.batchNo, mono: true },
                    { label: 'Production order', value: result.serial.productionOrderNo, mono: true },
                    { label: 'Made on', value: formatDate(result.serial.manufacturedOn) },
                    { label: 'Carton', value: result.serial.cartonNo ?? '—', mono: true },
                    { label: 'Invoice', value: result.serial.salesDocNo ?? '—', mono: true },
                    { label: 'Customer', value: result.serial.customer ?? '—' },
                    { label: 'Dispatched', value: result.serial.dispatchedOn ? formatDate(result.serial.dispatchedOn) : 'In stock' },
                    { label: 'Warranty to', value: result.serial.warrantyTo ? formatDate(result.serial.warrantyTo) : '—' },
                  ]}
                />
              </CardBody>
            </Card>
          )}

          {result.batch && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Backward — what it was made from" description="Up the chain to the raw material" />
                <CardBody className="space-y-2">
                  <div className="rounded border border-brand-500/40 bg-brand-500/5 p-3">
                    <p className="font-mono text-2xs font-medium text-brand-600">{result.batch.batchNo}</p>
                    <p className="text-xs text-fg">{result.batch.itemName}</p>
                    <p className="text-2xs text-fg-muted">
                      {result.batch.supplier ?? 'Made in-house'} · {result.batch.sourceDocNo}
                      {result.batch.supplierBatchNo ? ` · heat ${result.batch.supplierBatchNo}` : ''}
                    </p>
                  </div>
                  {back.length === 0 ? (
                    <p className="text-xs text-fg-subtle">This is a purchased batch — the chain starts here.</p>
                  ) : (
                    back.map((n, i) => (
                      <div key={`${n.batch.uid}-${i}`} className="border-l-2 border-border pl-3" style={{ marginLeft: n.depth * 14 }}>
                        <p className="font-mono text-2xs text-brand-600">{n.batch.batchNo}</p>
                        <p className="truncate text-xs text-fg">{n.batch.itemName}</p>
                        <p className="text-2xs text-fg-subtle">
                          {formatQty(n.qty)} {n.batch.uom} via {n.via}
                          {n.batch.supplierBatchNo ? ` · heat ${n.batch.supplierBatchNo}` : ''}
                          {n.batch.mtcNo ? ` · MTC ${n.batch.mtcNo}${n.batch.mtcVerified ? ' ✓' : ''}` : ''}
                        </p>
                      </div>
                    ))
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Forward — what came out of it" description="Down the chain to the customer" />
                <CardBody className="space-y-2">
                  {forward.length === 0 ? (
                    <p className="text-xs text-fg-subtle">Nothing has been made from this batch yet.</p>
                  ) : (
                    forward.map((n, i) => (
                      <div key={`${n.batch.batchNo}-${i}`} className="border-l-2 border-border pl-3" style={{ marginLeft: n.depth * 14 }}>
                        <p className="font-mono text-2xs text-brand-600">{n.batch.batchNo}</p>
                        <p className="truncate text-xs text-fg">{n.batch.itemName}</p>
                        <p className="text-2xs text-fg-subtle">{formatQty(n.qty)} via {n.via}</p>
                      </div>
                    ))
                  )}
                  {affectedSerials.length > 0 && (
                    <div className="mt-2 rounded border border-border bg-surface-2 p-3">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Reach</p>
                      <p className="mt-1 text-xs text-fg">
                        {forward.length} downstream batch(es) · {affectedSerials.length} unit(s) ·{' '}
                        {affectedCustomers.length} customer(s)
                      </p>
                      {affectedCustomers.length > 0 && <p className="mt-1 text-2xs text-fg-muted">{affectedCustomers.join(' · ')}</p>}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {result.batch && (
            <Card>
              <CardHeader title="Batch facts" description="What the certificate and the inspection say" />
              <CardBody>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <InvStatusBadge status={result.batch.status} />
                  <InvStatusBadge status={result.batch.qcStatus} size="sm" />
                  {result.batch.mtcNo && (
                    <Badge tone={result.batch.mtcVerified ? 'success' : 'warning'} size="sm" dot={false}>
                      MTC {result.batch.mtcNo} {result.batch.mtcVerified ? 'verified' : 'unverified'}
                    </Badge>
                  )}
                </div>
                <DataGrid
                  columns={3}
                  items={[
                    { label: 'Supplier', value: result.batch.supplier ?? 'Made in-house' },
                    { label: 'Supplier heat / lot', value: result.batch.supplierBatchNo ?? '—', mono: true },
                    { label: 'Source document', value: result.batch.sourceDocNo, mono: true },
                    { label: 'Received', value: formatDate(result.batch.receivedOn) },
                    { label: 'Expiry', value: result.batch.expiresOn ? formatDate(result.batch.expiresOn) : 'No shelf life' },
                    { label: 'Inspection', value: result.batch.qcInspectionNo ?? '—', mono: true },
                    ...(result.batch.steelGrade
                      ? [
                          { label: 'Grade', value: result.batch.steelGrade },
                          { label: 'Thickness × width', value: `${result.batch.thicknessMm} × ${result.batch.widthMm} mm` },
                          { label: 'Coil weight', value: `${formatQty(result.batch.coilWeightKg ?? 0)} kg` },
                        ]
                      : []),
                    { label: 'Received quantity', value: `${formatQty(result.batch.quantityReceived)} ${result.batch.uom}` },
                    { label: 'Remaining', value: `${formatQty(result.batch.quantityRemaining)} ${result.batch.uom}` },
                  ]}
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Recall --------------------------------------------------------------- */}
      <Modal
        open={recallOpen}
        onClose={() => setRecallOpen(false)}
        title="Start a recall"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setRecallOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={startRecall}>Block everything and notify</Button>
          </>
        }
      >
        {result?.batch && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              This will block <span className="font-medium text-fg">{1 + forward.length}</span> batch(es) in every warehouse at
              once, cancel any reservation against them, and build the notification list for{' '}
              <span className="font-medium text-fg">{affectedCustomers.length}</span> customer(s) holding{' '}
              <span className="font-medium text-fg">{affectedSerials.length}</span> unit(s).
            </p>
            <div className="rounded border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
              Starting from {result.batch.batchNo} — {result.batch.itemName}
              {result.batch.supplierBatchNo ? ` (heat ${result.batch.supplierBatchNo})` : ''}.
            </div>
            <Textarea
              label="What triggered the recall"
              rows={3}
              value={recallReason}
              onChange={(e) => setRecallReason(e.target.value)}
              placeholder="Customer complaint, failed vacuum test, supplier notification…"
            />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Why this works" description="Traceability is not a report — it is a property of every movement" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p><span className="font-medium text-fg">Recorded as it happens.</span> Every issue writes down which batch was consumed, in the same transaction that moves the stock.</p>
          <p><span className="font-medium text-fg">Certificates ride the batch.</span> The mill test certificate is attached to the batch, not the receipt, so it survives even if the receipt is cancelled.</p>
          <p><span className="font-medium text-fg">Recall is precise.</span> One heat means a handful of cartons and a named list of customers — not a month of production.</p>
        </CardBody>
      </Card>
    </div>
  )
}
