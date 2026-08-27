import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { MesStatusBadge, SCRAP_REASON_LABEL, useCanSeeCost } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { operatorStats, reworkOrders as seedRework } from '@/mock/mes'
import type { ReworkOrder, ReworkStatus } from '@/types/mes'

const FLOW: { state: ReworkStatus; label: string; next: ReworkStatus | null; help: string }[] = [
  { state: 'RAISED', label: 'Raised', next: 'IN_REPAIR', help: 'Rejected pieces set aside with a defect and an owner.' },
  { state: 'IN_REPAIR', label: 'In repair', next: 'INSPECTION', help: 'Being repaired by a named operator.' },
  { state: 'INSPECTION', label: 'Inspection', next: 'ACCEPTED', help: 'Re-inspected exactly like new production — no shortcuts.' },
  { state: 'ACCEPTED', label: 'Accepted', next: null, help: 'Back into the flow, with the rework recorded against the batch.' },
  { state: 'REJECTED', label: 'Rejected', next: null, help: 'Could not be saved — written off to scrap.' },
]

/** Rework — rejected pieces repaired and re-inspected, with the trail kept. */
export function ReworkPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeCost()
  const seed = useMemo(() => seedRework, [])
  const { rows: orders, update } = useCollection<ReworkOrder>('mes:rework', seed)
  const rowEdit = useRowEdit<ReworkOrder>({
    key: 'mes:rework',
    seed: seed,
    entity: 'Rework order',
    titleOf: (r) => r.docNo,
  })

  const [detail, setDetail] = useState<ReworkOrder | null>(null)
  const [advanceTarget, setAdvanceTarget] = useState<ReworkOrder | null>(null)
  const [advance, setAdvance] = useState({ assignedTo: '', repaired: '', scrapped: '', note: '' })

  const openOrders = orders.filter((o) => !['ACCEPTED', 'REJECTED'].includes(o.status))
  const totalPieces = openOrders.reduce((s, o) => s + o.quantity - o.repairedQty - o.scrappedQty, 0)
  const reworkCost = orders.reduce((s, o) => s + o.repairedQty * o.costPerUnit, 0)
  const saved = orders.reduce((s, o) => s + o.repairedQty, 0)

  const columns: Column<ReworkOrder>[] = [
    { key: 'docNo', header: 'Rework order', sortable: true, width: '11rem', render: (o) => (
      <div>
        <p className="font-mono text-xs font-medium text-brand-600">{o.docNo}</p>
        <p className="font-mono text-2xs text-fg-subtle">{o.sourceWorkOrderNo}</p>
      </div>
    ) },
    { key: 'raisedOn', header: 'Raised', sortable: true, width: '7rem', accessor: (o) => o.raisedOn, render: (o) => formatDate(o.raisedOn) },
    { key: 'itemName', header: 'Item', sortable: true, render: (o) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{o.itemName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{o.batchNo ?? o.itemCode}</p>
      </div>
    ) },
    { key: 'defect', header: 'Defect', sortable: true, width: '11rem', render: (o) => <Badge tone="danger" size="sm" dot={false}>{SCRAP_REASON_LABEL[o.defect]}</Badge> },
    { key: 'operation', header: 'From operation', sortable: true },
    { key: 'quantity', header: 'Pieces', align: 'right', sortable: true, render: (o) => <span className="tabular">{formatQty(o.quantity)}</span> },
    { key: 'progress', header: 'Repaired', width: '11rem', accessor: (o) => o.repairedQty, render: (o) => (
      <div className="flex items-center gap-2">
        <ProgressBar value={(o.repairedQty / o.quantity) * 100} tone={o.repairedQty === o.quantity ? 'success' : 'brand'} className="w-14" />
        <span className="text-2xs tabular text-fg-muted">{o.repairedQty}/{o.quantity}</span>
      </div>
    ) },
    { key: 'scrappedQty', header: 'Lost', align: 'right', width: '6rem', render: (o) => (o.scrappedQty ? <span className="tabular text-danger">{o.scrappedQty}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'assignedTo', header: 'Assigned to', sortable: true, render: (o) => o.assignedTo ?? <span className="text-2xs text-danger">nobody yet</span> },
    ...(canSeeValue ? [{ key: 'cost', header: 'Rework cost', align: 'right' as const, sortable: true, accessor: (o: ReworkOrder) => o.repairedQty * o.costPerUnit, render: (o: ReworkOrder) => formatCurrency(o.repairedQty * o.costPerUnit) }] : []),
    { key: 'status', header: 'Status', sortable: true, width: '9.5rem', render: (o) => <MesStatusBadge status={o.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'rework-register', 'Rework register', columnsFromTable(columns), orders)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function saveAdvance() {
    if (!advanceTarget) return
    const step = FLOW.find((f) => f.state === advanceTarget.status)
    if (!step?.next) return

    if (advanceTarget.status === 'RAISED') {
      if (!advance.assignedTo) {
        toast.error('Assign someone', 'A rework order without an owner sits in the corner of the shop for a month.')
        return
      }
      update(advanceTarget.uid, { status: 'IN_REPAIR', assignedTo: advance.assignedTo })
      toast.success('In repair', `${advanceTarget.docNo} assigned to ${advance.assignedTo}.`)
    } else if (advanceTarget.status === 'IN_REPAIR') {
      const repaired = Number(advance.repaired || 0)
      const scrapped = Number(advance.scrapped || 0)
      if (repaired + scrapped === 0) {
        toast.error('Nothing recorded', 'Enter how many were saved and how many could not be.')
        return
      }
      if (repaired + scrapped > advanceTarget.quantity) {
        toast.error('More than were raised', `Only ${formatQty(advanceTarget.quantity)} pieces came into this rework order.`)
        return
      }
      update(advanceTarget.uid, { status: 'INSPECTION', repairedQty: repaired, scrappedQty: scrapped, remarks: advance.note || advanceTarget.remarks })
      toast.success('Sent for inspection', `${repaired} repaired pieces go through the same inspection as new production.`)
    } else if (advanceTarget.status === 'INSPECTION') {
      update(advanceTarget.uid, { status: 'ACCEPTED', inspectionNo: `QC/26-27/${String(900 + Math.floor(Math.random() * 90))}` })
      toast.success('Accepted', `${formatQty(advanceTarget.repairedQty)} pieces back in the flow. The rework stays recorded against batch ${advanceTarget.batchNo ?? '—'}.`)
    }
    setAdvanceTarget(null)
    setAdvance({ assignedTo: '', repaired: '', scrapped: '', note: '' })
  }

  return (
    <div>
      <PageHeader
        title="Rework"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Rework' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/production/scrap')}>Scrap register</Button>}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', openOrders.length ? 'text-warning' : 'text-success')}>{openOrders.length}</span> open
        rework order{openOrders.length === 1 ? '' : 's'} holding{' '}
        <span className="font-medium text-fg tabular">{formatQty(totalPieces)}</span> pieces ·{' '}
        <span className="font-medium text-success tabular">{formatQty(saved)}</span> pieces saved so far
        {canSeeValue && <> at a rework cost of <span className="font-medium text-fg tabular">{formatCurrency(reworkCost)}</span></>}.
      </p>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-xs">
          {FLOW.filter((f) => f.state !== 'REJECTED').map((f, i) => (
            <div key={f.state} className="flex items-center gap-2">
              {i > 0 && <span className="text-fg-subtle">→</span>}
              <div>
                <MesStatusBadge status={f.state} size="sm" />
                <p className="mt-1 max-w-[15rem] text-2xs text-fg-muted">{f.help}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <DataTable
        rows={orders}
        columns={columns}
        rowKey={(o) => o.uid}
        searchPlaceholder="Search rework order, item, defect or person…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No rework orders"
        rowClassName={(o) => cn(o.status === 'RAISED' && !o.assignedTo && 'bg-warning/[0.04]')}
        rowActions={(o) => {
          const step = FLOW.find((f) => f.state === o.status)
          return (
            <>
              {rowEdit.actions(o)}
              <MenuItem label="Open" onClick={() => setDetail(o)} />
              {step?.next && (
                <MenuItem
                  label={o.status === 'RAISED' ? 'Assign for repair' : o.status === 'IN_REPAIR' ? 'Record the repair' : 'Accept after inspection'}
                  onClick={() => {
                    setAdvanceTarget(o)
                    setAdvance({ assignedTo: o.assignedTo ?? '', repaired: String(o.quantity - o.scrappedQty), scrapped: '0', note: '' })
                  }}
                />
              )}
              <MenuItem
                label="Reject — cannot be saved"
                danger
                separatorBefore
                disabled={['ACCEPTED', 'REJECTED'].includes(o.status)}
                onClick={() => {
                  update(o.uid, { status: 'REJECTED', scrappedQty: o.quantity - o.repairedQty })
                  toast.success('Written off', `${formatQty(o.quantity - o.repairedQty)} pieces moved to scrap — the defect and the attempt both stay on the record.`)
                }}
              />
            </>
          )
        }}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.itemName} · ${SCRAP_REASON_LABEL[detail.defect]}` : undefined}
        width="max-w-2xl"
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <MesStatusBadge status={detail.status} />
              <Badge tone="danger" size="sm" dot={false}>{SCRAP_REASON_LABEL[detail.defect]}</Badge>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-fg-muted">Repaired</span>
                <span className="tabular text-fg">{detail.repairedQty} / {detail.quantity} pieces</span>
              </div>
              <ProgressBar value={(detail.repairedQty / detail.quantity) * 100} tone={detail.repairedQty === detail.quantity ? 'success' : 'brand'} height="h-2" showLabel />
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'From work order', value: detail.sourceWorkOrderNo, mono: true },
                { label: 'Production order', value: detail.productionOrderNo, mono: true },
                { label: 'Operation', value: detail.operation },
                { label: 'Batch', value: detail.batchNo ?? '—', mono: true },
                { label: 'Raised by', value: detail.raisedBy },
                { label: 'Assigned to', value: detail.assignedTo ?? 'Not assigned' },
                { label: 'Pieces in', value: `${formatQty(detail.quantity)} ${detail.uom}` },
                { label: 'Repaired · lost', value: `${detail.repairedQty} · ${detail.scrappedQty}` },
                { label: 'Inspection', value: detail.inspectionNo ?? 'Not inspected yet', mono: true },
                ...(canSeeValue ? [{ label: 'Rework cost', value: `${formatCurrency(detail.repairedQty * detail.costPerUnit)} (${formatCurrency(detail.costPerUnit)}/piece)` }] : []),
              ]}
            />

            {detail.remarks && <p className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">{detail.remarks}</p>}

            <p className="text-2xs leading-relaxed text-fg-subtle">
              Repaired pieces are inspected exactly like new production before they rejoin the flow, and the rework stays
              recorded against the batch — a customer asking about a specific bottle can be told it was reworked and re-passed.
            </p>
          </div>
        )}
      </Drawer>

      <Modal
        open={!!advanceTarget}
        onClose={() => setAdvanceTarget(null)}
        title={advanceTarget ? `${advanceTarget.docNo} — next step` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdvanceTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveAdvance}>Confirm</Button>
          </>
        }
      >
        {advanceTarget && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted">
              {formatQty(advanceTarget.quantity)} × {advanceTarget.itemName} — {SCRAP_REASON_LABEL[advanceTarget.defect]} at{' '}
              {advanceTarget.operation}.
            </p>

            {advanceTarget.status === 'RAISED' && (
              <Select
                label="Who will repair these"
                value={advance.assignedTo}
                onChange={(e) => setAdvance({ ...advance, assignedTo: e.target.value })}
                options={[{ value: '', label: 'Choose an operator…' }, ...operatorStats.filter((o) => o.present).map((o) => ({ value: o.name, label: `${o.name} — ${o.skill}` }))]}
              />
            )}

            {advanceTarget.status === 'IN_REPAIR' && (
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Input label="Pieces saved" type="number" value={advance.repaired} onChange={(e) => setAdvance({ ...advance, repaired: e.target.value })} />
                <Input label="Pieces beyond repair" type="number" value={advance.scrapped} hint="These go to scrap" onChange={(e) => setAdvance({ ...advance, scrapped: e.target.value })} />
                <Textarea label="What was done" containerClassName="sm:col-span-2" rows={2} value={advance.note} onChange={(e) => setAdvance({ ...advance, note: e.target.value })} />
              </div>
            )}

            {advanceTarget.status === 'INSPECTION' && (
              <p className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                Accepting records an inspection number and puts {formatQty(advanceTarget.repairedQty)} pieces back into the flow
                at {advanceTarget.operation}. They are inspected on the same plan as new production.
              </p>
            )}
          </div>
        )}
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
