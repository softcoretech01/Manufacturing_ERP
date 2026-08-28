import { useMemo, useState } from 'react'
import { Check, Printer, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import {
  ApprovalTrail,
  DetailBlock,
  InvStatusBadge,
  ItemCell,
  QtyCell,
  SlaChip,
  useCanSeeValue,
} from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { binSlots, putaways as seedPutaways, quarantineLots as seedLots } from '@/mock/inventory'
import type { PutawayDoc, QuarantineLot } from '@/types/inventory'

export function PutawayPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const putawaySeed = useMemo(() => seedPutaways, [])
  const lotSeed = useMemo(() => seedLots, [])
  const { rows: putaways, update } = useCollection<PutawayDoc>('inv:putaway', putawaySeed)
  const { rows: lots, update: updateLot } = useCollection<QuarantineLot>('inv:quarantine', lotSeed)

  const [view, setView] = useState<'putaway' | 'quarantine'>('putaway')
  const [detail, setDetail] = useState<PutawayDoc | null>(null)
  const [binForm, setBinForm] = useState<Record<string, string>>({})
  const [decisionLot, setDecisionLot] = useState<QuarantineLot | null>(null)
  const [decision, setDecision] = useState({ outcome: 'ACCEPT', acceptedQty: '', reason: '' })

  const pending = putaways.filter((p) => p.totalBinned < p.totalReceived)
  const done = putaways.filter((p) => p.totalBinned >= p.totalReceived)
  const openLots = lots.filter((l) => l.decision === 'PENDING')

  const stats = {
    pendingLines: pending.reduce((s, p) => s + p.lines.filter((l) => l.binnedQty < l.receivedQty).length, 0),
    oldest: Math.max(0, ...pending.map((p) => p.ageHours)),
    quarantineValue: openLots.reduce((s, l) => s + l.value, 0),
    quarantineOldest: Math.max(0, ...openLots.map((l) => l.ageDays)),
  }

  const putawayColumns: Column<PutawayDoc>[] = [
    { key: 'docNo', header: 'Put-away', sortable: true, width: '11rem', render: (p) => <span className="font-mono text-xs font-medium text-brand-600">{p.docNo}</span> },
    { key: 'sourceDocNo', header: 'Against', sortable: true, width: '12rem', render: (p) => (
      <div>
        <p className="font-mono text-2xs text-fg">{p.sourceDocNo}</p>
        <p className="text-2xs text-fg-subtle">{p.sourceType.replace(/_/g, ' ').toLowerCase()}</p>
      </div>
    ) },
    { key: 'sourceParty', header: 'Source', sortable: true },
    { key: 'warehouse', header: 'Warehouse', sortable: true },
    { key: 'strategy', header: 'Strategy', width: '9rem', render: (p) => <span className="font-mono text-2xs text-fg-muted">{p.strategy}</span> },
    { key: 'lines', header: 'Lines', align: 'right', width: '5rem', accessor: (p) => p.lines.length, render: (p) => p.lines.length },
    { key: 'totalReceived', header: 'Received', align: 'right', sortable: true, render: (p) => <QtyCell qty={p.totalReceived} /> },
    { key: 'totalBinned', header: 'Binned', align: 'right', render: (p) => <QtyCell qty={p.totalBinned} tone={p.totalBinned >= p.totalReceived ? 'success' : 'muted'} /> },
    { key: 'ageHours', header: 'Age (4 h SLA)', sortable: true, width: '8rem', accessor: (p) => p.ageHours, render: (p) => (p.totalBinned >= p.totalReceived ? <span className="text-2xs text-success">Done</span> : <SlaChip hours={p.ageHours} target={4} />) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (p) => <InvStatusBadge status={p.status} size="sm" /> },
  ]

  const lotColumns: Column<QuarantineLot>[] = [
    { key: 'docNo', header: 'Lot', sortable: true, width: '11rem', render: (l) => <span className="font-mono text-xs font-medium text-brand-600">{l.docNo}</span> },
    { key: 'itemCode', header: 'Item', sortable: true, render: (l) => <ItemCell code={l.itemCode} name={l.itemName} sub={l.batchNo} /> },
    { key: 'supplier', header: 'Source', sortable: true },
    { key: 'sourceDocNo', header: 'Document', width: '11rem', render: (l) => <span className="font-mono text-2xs">{l.sourceDocNo}</span> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (l) => <QtyCell qty={l.quantity} uom={l.uom} /> },
    { key: 'inspectionNo', header: 'Inspection', width: '10rem', render: (l) => (l.inspectionNo ? <span className="font-mono text-2xs">{l.inspectionNo}</span> : <span className="text-2xs text-warning">Not raised</span>) },
    { key: 'mtcReceived', header: 'MTC / COA', align: 'center', width: '7rem', accessor: (l) => (l.mtcReceived ? 'Yes' : 'No'), render: (l) => (
      <Badge tone={l.mtcReceived ? 'success' : 'danger'} size="sm" dot={false}>
        {l.mtcReceived ? 'Received' : 'Missing'}
      </Badge>
    ) },
    { key: 'ageDays', header: 'Held', sortable: true, width: '6rem', render: (l) => <span className={cn('text-2xs tabular', l.ageDays > 3 ? 'text-danger' : 'text-fg-muted')}>{l.ageDays} d</span> },
    ...(canSeeValue ? [{ key: 'value', header: 'Value', align: 'right' as const, sortable: true, render: (l: QuarantineLot) => formatCurrency(l.value) }] : []),
    { key: 'decision', header: 'QC decision', sortable: true, width: '10rem', render: (l) => <InvStatusBadge status={l.decision} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        view === 'putaway'
          ? exportRows(format, 'putaway-queue', 'Put-away queue', columnsFromTable(putawayColumns), putaways)
          : exportRows(format, 'quarantine-register', 'Quarantine register', columnsFromTable(lotColumns), lots)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function confirmPutaway() {
    if (!detail) return
    const unresolved = detail.lines.filter((l) => l.binnedQty < l.receivedQty && !(binForm[l.uid] ?? l.proposedBin))
    if (unresolved.length) {
      toast.error('Bin required', `${unresolved.length} line(s) have no destination bin. Accept the proposal or choose one.`)
      return
    }
    const overrides = detail.lines.filter((l) => {
      const chosen = binForm[l.uid] ?? l.proposedBin
      return l.binnedQty < l.receivedQty && chosen !== l.proposedBin
    })
    const lines = detail.lines.map((l) => ({
      ...l,
      toBin: binForm[l.uid] ?? l.proposedBin,
      binnedQty: l.receivedQty,
      overrideReason: (binForm[l.uid] ?? l.proposedBin) !== l.proposedBin ? 'Operator override — recorded with both bins' : l.overrideReason,
      labelsPrinted: l.labelsPrinted + 1,
    }))
    update(detail.uid, { lines, totalBinned: detail.totalReceived, status: 'COMPLETED', version: detail.version + 1 })
    toast.success(
      'Put-away confirmed',
      overrides.length
        ? `${detail.docNo} binned. ${overrides.length} bin override(s) recorded with the proposed bin and a reason.`
        : `${detail.docNo} binned and ${lines.length} label(s) queued for printing.`,
    )
    setDetail(null)
  }

  function postDecision() {
    if (!decisionLot) return
    const qty = Number(decision.acceptedQty || decisionLot.quantity)
    if (decision.outcome !== 'REJECT' && (Number.isNaN(qty) || qty <= 0 || qty > decisionLot.quantity)) {
      toast.error('Check the quantity', `Accepted quantity must be between 1 and ${formatQty(decisionLot.quantity)}.`)
      return
    }
    if (decision.outcome === 'DEVIATION' && !decision.reason.trim()) {
      toast.error('Reason required', 'Accepting under deviation needs a written justification — it is reported monthly.')
      return
    }
    if (decision.outcome === 'ACCEPT') {
      updateLot(decisionLot.uid, { decision: 'ACCEPTED', acceptedQty: qty, rejectedQty: decisionLot.quantity - qty })
      toast.success('Released to stores', `${formatQty(qty)} ${decisionLot.uom} moved from quarantine to available (movement 501).`)
    } else if (decision.outcome === 'REJECT') {
      updateLot(decisionLot.uid, { decision: 'REJECTED', acceptedQty: 0, rejectedQty: decisionLot.quantity })
      toast.success('Rejected', `${decisionLot.docNo} moved to the reject store; a purchase return can now be raised.`)
    } else {
      updateLot(decisionLot.uid, { decision: 'DEVIATION_ACCEPTED', acceptedQty: qty, rejectedQty: decisionLot.quantity - qty })
      toast.warning('Accepted under deviation', 'The batch is flagged, the deviation is stored against it and the quality review will see it.')
    }
    setDecisionLot(null)
  }

  return (
    <div>
      <PageHeader
        title="Receipts & put-away"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Receipts & put-away' }]}
        actions={
          <Button variant="outline" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => toast.success('Labels queued', 'Reprints are audited — a duplicate batch label is a traceability hazard.')}>
            Reprint labels
          </Button>
        }
        tabs={
          <Tabs
            variant="pill"
            active={view}
            onChange={(v) => setView(v as 'putaway' | 'quarantine')}
            tabs={[
              { id: 'putaway', label: 'Put-away', count: pending.length },
              { id: 'quarantine', label: 'Quarantine & QC hold', count: openLots.length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{pending.length}</span> document{pending.length === 1 ? '' : 's'} awaiting put-away
        ({stats.pendingLines} line{stats.pendingLines === 1 ? '' : 's'}), oldest{' '}
        <span className={cn('font-medium tabular', stats.oldest >= 4 ? 'text-danger' : stats.oldest >= 3 ? 'text-warning' : 'text-fg')}>
          {stats.oldest.toFixed(1)} h
        </span>{' '}
        against a 4 h target · <span className="font-medium text-fg">{openLots.length}</span> lot{openLots.length === 1 ? '' : 's'} in
        quarantine (oldest {stats.quarantineOldest} d
        {canSeeValue ? <>, {formatCurrency(stats.quarantineValue)} held</> : null})
      </p>

      {view === 'putaway' ? (
        <DataTable
          density="comfortable"
          rows={putaways}
          columns={putawayColumns}
          rowKey={(p) => p.uid}
          searchPlaceholder="Search put-away, GRN, supplier or warehouse…"
          onExport={doExport}
          onRowClick={(p) => {
            setDetail(p)
            setBinForm(Object.fromEntries(p.lines.map((l) => [l.uid, l.toBin ?? l.proposedBin ?? ''])))
          }}
          emptyTitle="Nothing awaiting put-away"
          rowActions={(p) => (
            <>
              <MenuItem label="Open" onClick={() => { setDetail(p); setBinForm(Object.fromEntries(p.lines.map((l) => [l.uid, l.toBin ?? l.proposedBin ?? '']))) }} />
              <MenuItem
                label="Accept all proposals"
                icon={<Check />}
                disabled={p.totalBinned >= p.totalReceived}
                onClick={() => {
                  update(p.uid, {
                    lines: p.lines.map((l) => ({ ...l, toBin: l.proposedBin, binnedQty: l.receivedQty, labelsPrinted: l.labelsPrinted + 1 })),
                    totalBinned: p.totalReceived,
                    status: 'COMPLETED',
                  })
                  toast.success('Put-away confirmed', `${p.docNo} binned using the proposed bins.`)
                }}
              />
              <MenuItem
                label="Print labels"
                onClick={() => {
                  update(p.uid, { lines: p.lines.map((l) => ({ ...l, labelsPrinted: l.labelsPrinted + 1 })) })
                  toast.success('Labels queued', `${p.lines.length} batch label(s) sent to the store printer. Reprints are counted.`)
                }}
              />
            </>
          )}
        />
      ) : (
        <DataTable
          rows={lots}
          columns={lotColumns}
          rowKey={(l) => l.uid}
          searchPlaceholder="Search lot, item, batch, supplier or inspection…"
          onExport={doExport}
          onRowClick={(l) => {
            setDecisionLot(l)
            setDecision({ outcome: 'ACCEPT', acceptedQty: String(l.quantity), reason: '' })
          }}
          emptyTitle="Nothing in quarantine"
          rowActions={(l) => (
            <>
              <MenuItem
                label="Record QC decision"
                disabled={l.decision !== 'PENDING'}
                onClick={() => {
                  setDecisionLot(l)
                  setDecision({ outcome: 'ACCEPT', acceptedQty: String(l.quantity), reason: '' })
                }}
              />
              <MenuItem
                label="Release without inspection"
                separatorBefore
                disabled={l.decision !== 'PENDING'}
                onClick={() => toast.warning('Exception path', 'A manual release without a QC decision notifies the Quality Head and appears on the standing exception report.')}
              />
              <MenuItem label="Chase the inspection" onClick={() => toast.success('Reminder sent', `Quality notified about ${l.docNo}, held ${l.ageDays} days.`)} />
            </>
          )}
          rowClassName={(l) => cn(l.ageDays > 3 && l.decision === 'PENDING' && 'bg-warning/[0.04]')}
        />
      )}

      {/* Put-away detail ------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.sourceParty} · ${detail.warehouse} · strategy ${detail.strategy}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                Received {formatDateTime(detail.receivedAt)} · {detail.totalBinned >= detail.totalReceived ? 'binned' : `${detail.ageHours.toFixed(1)} h in queue`}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
                <Button variant="primary" size="sm" disabled={detail.totalBinned >= detail.totalReceived} onClick={confirmPutaway}>
                  Confirm put-away & print
                </Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InvStatusBadge status={detail.status} />
              <Badge tone="neutral" size="sm" dot={false}>{detail.sourceType.replace(/_/g, ' ').toLowerCase()}</Badge>
              <SlaChip hours={detail.ageHours} target={4} />
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Against', value: detail.sourceDocNo, mono: true },
                { label: 'Source', value: detail.sourceParty },
                { label: 'Warehouse', value: detail.warehouse },
                { label: 'Put-away strategy', value: detail.strategy, mono: true },
                { label: 'Received at', value: formatDateTime(detail.receivedAt) },
                { label: 'Received by', value: detail.createdBy },
              ]}
            />

            <DetailBlock title={`Lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item · batch</th>
                      <th className="text-right">Received</th>
                      <th className="text-right">Binned</th>
                      <th>Proposed bin</th>
                      <th>Destination</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => {
                      const chosen = binForm[l.uid] ?? l.proposedBin ?? ''
                      const overridden = !!l.proposedBin && chosen !== l.proposedBin
                      const eligible = binSlots.filter((b) => b.status === 'AVAILABLE' || b.code === l.proposedBin)
                      return (
                        <tr key={l.uid}>
                          <td>
                            <p className="text-xs font-medium text-fg">{l.itemName}</p>
                            <p className="font-mono text-2xs text-fg-subtle">
                              {l.itemCode}
                              {l.batchNo ? ` · ${l.batchNo}` : ''}
                              {l.expiresOn ? ` · exp ${formatDate(l.expiresOn)}` : ''}
                            </p>
                            {l.mtcNo && <p className="text-2xs text-success">MTC {l.mtcNo} attached to the batch</p>}
                          </td>
                          <td className="text-right tabular">{formatQty(l.receivedQty)} {l.uom}</td>
                          <td className="text-right tabular">{formatQty(l.binnedQty)}</td>
                          <td>
                            <p className="font-mono text-2xs">{l.proposedBin ?? '—'}</p>
                            <p className="text-2xs text-fg-subtle">{l.proposalReason}</p>
                          </td>
                          <td className="w-40">
                            {l.binnedQty >= l.receivedQty ? (
                              <span className="font-mono text-2xs">{l.toBin ?? '—'}</span>
                            ) : (
                              <Select
                                sizeVariant="sm"
                                value={chosen}
                                onChange={(e) => setBinForm({ ...binForm, [l.uid]: e.target.value })}
                                options={[{ value: '', label: 'Choose bin…' }, ...eligible.map((b) => ({ value: b.code, label: `${b.code} · ${b.utilisationPct}%` }))]}
                              />
                            )}
                            {overridden && <p className="mt-0.5 text-2xs text-warning">Override — reason recorded</p>}
                          </td>
                          <td><InvStatusBadge status={l.stockStatus} size="sm" /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title="Approval">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>

            <p className="text-2xs leading-relaxed text-fg-subtle">
              Quarantined lines can be binned into a segregated bin but stay unavailable to production until QC releases them.
              Overriding a proposed bin stores both bins and the reason, because a bin nobody can explain is a bin nobody can find.
            </p>
          </div>
        )}
      </Drawer>

      {/* QC decision --------------------------------------------------------- */}
      <Modal
        open={!!decisionLot}
        onClose={() => setDecisionLot(null)}
        title={decisionLot ? `QC decision — ${decisionLot.docNo}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDecisionLot(null)}>Cancel</Button>
            <Button variant="primary" onClick={postDecision}>Post decision</Button>
          </>
        }
      >
        {decisionLot && (
          <div className="space-y-4">
            <DataGrid
              columns={2}
              items={[
                { label: 'Item', value: `${decisionLot.itemName}` },
                { label: 'Batch', value: decisionLot.batchNo, mono: true },
                { label: 'Supplier lot / heat', value: decisionLot.supplierBatchNo ?? '—', mono: true },
                { label: 'Source', value: decisionLot.sourceDocNo, mono: true },
                { label: 'Quantity', value: `${formatQty(decisionLot.quantity)} ${decisionLot.uom}` },
                { label: 'Inspection', value: decisionLot.inspectionNo ?? 'Not raised' },
                { label: 'MTC / COA', value: decisionLot.mtcReceived ? 'Received' : 'Missing' },
                { label: 'Held for', value: `${decisionLot.ageDays} days` },
              ]}
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Select
                label="Outcome"
                containerClassName="sm:col-span-2"
                value={decision.outcome}
                onChange={(e) => setDecision({ ...decision, outcome: e.target.value })}
                options={[
                  { value: 'ACCEPT', label: 'Accept — release to available stock' },
                  { value: 'DEVIATION', label: 'Accept under deviation — batch flagged' },
                  { value: 'REJECT', label: 'Reject — move to the reject store' },
                ]}
              />
              {decision.outcome !== 'REJECT' && (
                <Input
                  label="Accepted quantity"
                  type="number"
                  value={decision.acceptedQty}
                  hint={`Balance of ${formatQty(decisionLot.quantity)} is rejected — partial decisions are normal`}
                  onChange={(e) => setDecision({ ...decision, acceptedQty: e.target.value })}
                />
              )}
              <Textarea
                label={decision.outcome === 'DEVIATION' ? 'Justification (required)' : 'Remarks'}
                containerClassName="sm:col-span-2"
                rows={2}
                value={decision.reason}
                onChange={(e) => setDecision({ ...decision, reason: e.target.value })}
                placeholder={decision.outcome === 'REJECT' ? 'Defect observed, sampling result, NCR reference…' : 'Anything the stores or the supplier should know.'}
              />
            </div>

            {!decisionLot.mtcReceived && (
              <p className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                No mill test certificate is attached to this batch. Steel cannot clear incoming QC without one — accepting will
                be recorded as an exception.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Receipt sources" description="Inventory posts the stock; it never creates the source document" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Purchase receipt', note: 'Posted on procurement.grn.approved (movement 101)' },
            { label: 'Production receipt', note: 'Posted on production.entry.confirmed (103)' },
            { label: 'Sales return', note: 'Always quarantined — a returned bottle is inspected (104)' },
            { label: 'Job-work receipt', note: 'Against an open challan, consumes issued material (105)' },
          ].map((s) => (
            <div key={s.label} className="rounded border border-border p-3">
              <p className="text-xs font-medium text-fg">{s.label}</p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{s.note}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
