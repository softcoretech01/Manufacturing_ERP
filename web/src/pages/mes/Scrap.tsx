import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { MesChartTip, MesStatusBadge, SCRAP_REASON_LABEL, useCanSeeCost } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { scrapRecords as seedScrap } from '@/mock/mes'
import type { ScrapAction, ScrapRecord } from '@/types/mes'

const ACTIONS: { value: ScrapAction; label: string; effect: string }[] = [
  { value: 'REWORK', label: 'Rework', effect: 'Raises a rework order; the pieces stay in WIP and come back after repair.' },
  { value: 'SCRAP', label: 'Scrap', effect: 'Written off to the scrap yard at recovery value; the cost lands on this operation.' },
  { value: 'HOLD', label: 'Hold', effect: 'Kept aside until quality decides — neither counted as good nor written off.' },
  { value: 'DISPOSE', label: 'Dispose', effect: 'Destroyed with no recovery. Needs an approval above the value threshold.' },
]

/** Scrap — what was rejected, why, and what is being done about it. */
export function ScrapPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeCost()
  const seed = useMemo(() => seedScrap, [])
  const { rows: records, update } = useCollection<ScrapRecord>('mes:scrap', seed)
  const rowEdit = useRowEdit<ScrapRecord>({
    key: 'mes:scrap',
    seed: seed,
    entity: 'Scrap record',
    titleOf: (r) => r.docNo,
  })

  const [actionTarget, setActionTarget] = useState<ScrapRecord | null>(null)
  const [decision, setDecision] = useState({ action: 'REWORK' as ScrapAction, note: '' })

  const open = records.filter((r) => r.status === 'OPEN')
  const totalQty = records.reduce((s, r) => s + r.quantity, 0)
  const totalCost = records.reduce((s, r) => s + r.quantity * r.unitCost, 0)

  const byReason = Object.keys(SCRAP_REASON_LABEL)
    .map((r) => ({
      reason: SCRAP_REASON_LABEL[r],
      key: r,
      qty: records.filter((x) => x.reason === r).reduce((s, x) => s + x.quantity, 0),
      cost: records.filter((x) => x.reason === r).reduce((s, x) => s + x.quantity * x.unitCost, 0),
    }))
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.qty - a.qty)

  const columns: Column<ScrapRecord>[] = [
    { key: 'docNo', header: 'Record', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'entryDate', header: 'Date', sortable: true, width: '7rem', accessor: (r) => r.entryDate, render: (r) => formatDate(r.entryDate) },
    { key: 'operationName', header: 'Where it happened', sortable: true, render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{r.operationName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{r.workOrderNo} · {r.machine}</p>
      </div>
    ) },
    { key: 'itemName', header: 'Item', sortable: true, render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{r.itemName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{r.batchNo ?? r.itemCode}</p>
      </div>
    ) },
    { key: 'quantity', header: 'Pieces', align: 'right', sortable: true, render: (r) => <span className="tabular font-medium text-danger">{formatQty(r.quantity)}</span> },
    { key: 'reason', header: 'Reason', sortable: true, width: '11rem', render: (r) => <Badge tone="danger" size="sm" dot={false}>{SCRAP_REASON_LABEL[r.reason]}</Badge> },
    { key: 'operator', header: 'Operator · shift', sortable: true, render: (r) => <span className="text-xs">{r.operator} · {r.shift}</span> },
    { key: 'detectedBy', header: 'Found by', sortable: true, defaultHidden: true },
    ...(canSeeValue ? [{ key: 'cost', header: 'Cost', align: 'right' as const, sortable: true, accessor: (r: ScrapRecord) => r.quantity * r.unitCost, render: (r: ScrapRecord) => formatCurrency(r.quantity * r.unitCost) }] : []),
    { key: 'action', header: 'Decision', width: '8rem', sortable: true, render: (r) => (
      <Badge tone={r.action === 'REWORK' ? 'warning' : r.action === 'SCRAP' ? 'danger' : 'neutral'} size="sm" dot={false}>
        {ACTIONS.find((a) => a.value === r.action)?.label ?? r.action}
      </Badge>
    ) },
    { key: 'correctiveAction', header: 'Corrective action', render: (r) => (
      r.correctiveAction ? <span className="text-2xs text-fg-muted">{r.correctiveAction}</span> : <span className="text-2xs text-danger">not recorded</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (r) => <MesStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'scrap-register', 'Scrap register', columnsFromTable(columns), records)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Scrap"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Scrap' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/production/rework')}>Rework orders</Button>}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-danger tabular">{formatQty(totalQty)}</span> pieces rejected across{' '}
        {records.length} records
        {canSeeValue && <>, costing <span className="font-medium text-fg tabular">{formatCurrency(totalCost)}</span></>} ·{' '}
        <span className={cn('font-medium', open.length ? 'text-warning' : 'text-success')}>{open.length}</span> still waiting for
        a decision. Every rejection names the operation, the machine and the operator — that is what makes the pattern visible.
      </p>

      <Card className="mb-4">
        <CardHeader title="Why pieces are being rejected" description="Pieces by defect — the tall bar is the one worth fixing" />
        <CardBody className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byReason} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="reason" width={130} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<MesChartTip suffix=" pcs" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
              <Bar dataKey="qty" name="Pieces" radius={[0, 3, 3, 0]} maxBarSize={20}>
                {byReason.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <DataTable
        rows={records}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search record, operation, item, reason or operator…"
        onExport={doExport}
        emptyTitle="No scrap recorded"
        rowClassName={(r) => cn(r.status === 'OPEN' && 'bg-warning/[0.04]')}
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem
              label="Decide what happens to it"
              disabled={r.status === 'CLOSED'}
              onClick={() => {
                setActionTarget(r)
                setDecision({ action: r.action, note: r.correctiveAction ?? '' })
              }}
            />
            <MenuItem label="Open the work order" onClick={() => navigate('/production/work-orders')} />
            <MenuItem label="Trace the batch" onClick={() => navigate('/production/genealogy')} />
          </>
        )}
      />

      <Modal
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget ? `Decision — ${actionTarget.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!actionTarget) return
                if (!decision.note.trim()) {
                  toast.error('Corrective action required', 'Recording the defect without saying what was done about it just builds a list nobody acts on.')
                  return
                }
                update(actionTarget.uid, { action: decision.action, correctiveAction: decision.note.trim(), status: decision.action === 'HOLD' ? 'OPEN' : 'ACTIONED' })
                toast.success(
                  'Decision recorded',
                  decision.action === 'REWORK'
                    ? `${formatQty(actionTarget.quantity)} pieces sent to rework — a rework order has been raised and they stay in WIP.`
                    : decision.action === 'SCRAP'
                      ? `${formatQty(actionTarget.quantity)} pieces written off; the cost sits against ${actionTarget.operationName}.`
                      : `${formatQty(actionTarget.quantity)} pieces held for a quality decision.`,
                )
                setActionTarget(null)
              }}
            >
              Record decision
            </Button>
          </>
        }
      >
        {actionTarget && (
          <div className="space-y-3.5">
            <div className="rounded border border-danger/30 bg-danger/5 p-3 text-xs">
              <p className="font-medium text-danger">
                {formatQty(actionTarget.quantity)} × {actionTarget.itemName} — {SCRAP_REASON_LABEL[actionTarget.reason]}
              </p>
              <p className="mt-1 text-fg-muted">
                {actionTarget.operationName} on {actionTarget.machine}, {actionTarget.operator} (shift {actionTarget.shift}), found
                by {actionTarget.detectedBy}
                {canSeeValue && ` · ${formatCurrency(actionTarget.quantity * actionTarget.unitCost)} at risk`}.
              </p>
            </div>
            <Select
              label="What happens to these pieces"
              value={decision.action}
              onChange={(e) => setDecision({ ...decision, action: e.target.value as ScrapAction })}
              hint={ACTIONS.find((a) => a.value === decision.action)?.effect}
              options={ACTIONS.map((a) => ({ value: a.value, label: a.label }))}
            />
            <Textarea
              label="Corrective action (required)"
              rows={3}
              value={decision.note}
              onChange={(e) => setDecision({ ...decision, note: e.target.value })}
              placeholder="Weld current re-set to 210 A and first piece re-approved…"
            />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Four decisions, four different costs" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIONS.map((a) => (
            <div key={a.value} className="rounded border border-border p-3">
              <p className="text-xs font-medium text-fg">{a.label}</p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{a.effect}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
