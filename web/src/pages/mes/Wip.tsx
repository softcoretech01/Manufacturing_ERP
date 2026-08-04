import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft } from 'lucide-react'
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
import { Duration, MesStatusBadge, useCanSeeCost } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { wipLots as seedLots } from '@/mock/mes'
import type { WipLot, WipState } from '@/types/mes'

const STATE_HELP: Record<WipState, string> = {
  READY: 'Sitting at the station, ready for the operator to start.',
  IN_PROCESS: 'On a machine right now.',
  QUALITY_HOLD: 'Stopped by inspection — cannot move until quality decides.',
  WAITING: 'Finished the last operation but the next station is not free.',
  TRANSFERRED: 'Moved on to the next operation or into finished goods.',
  COMPLETED: 'Finished the route.',
}

/** Work in progress — what is between operations right now, and for how long. */
export function WipPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeCost()
  const seed = useMemo(() => seedLots, [])
  const { rows: lots, update } = useCollection<WipLot>('mes:wip', seed)
  const rowEdit = useRowEdit<WipLot>({
    key: 'mes:wip',
    seed: seed,
    entity: 'WIP lot',
    titleOf: (r) => r.lotNo,
  })

  const [moveTarget, setMoveTarget] = useState<WipLot | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [holdTarget, setHoldTarget] = useState<WipLot | null>(null)
  const [holdReason, setHoldReason] = useState('')

  const live = lots.filter((l) => l.state !== 'TRANSFERRED' && l.state !== 'COMPLETED')
  const totalQty = live.reduce((s, l) => s + l.quantity, 0)
  const totalValue = live.reduce((s, l) => s + l.value, 0)
  const held = live.filter((l) => l.state === 'QUALITY_HOLD')
  const waiting = live.filter((l) => l.state === 'WAITING')
  const longestWait = Math.max(0, ...live.map((l) => l.waitingMinutes))

  const byWorkCentre = [...new Set(live.map((l) => l.workCentre))].map((wc) => ({
    workCentre: wc,
    qty: live.filter((l) => l.workCentre === wc).reduce((s, l) => s + l.quantity, 0),
    value: live.filter((l) => l.workCentre === wc).reduce((s, l) => s + l.value, 0),
    lots: live.filter((l) => l.workCentre === wc).length,
  }))

  const columns: Column<WipLot>[] = [
    { key: 'lotNo', header: 'Lot', sortable: true, width: '11rem', render: (l) => (
      <div>
        <p className="font-mono text-xs font-medium text-brand-600">{l.lotNo}</p>
        <p className="font-mono text-2xs text-fg-subtle">{l.productionOrderNo}</p>
      </div>
    ) },
    { key: 'itemName', header: 'What it is', sortable: true, render: (l) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{l.itemName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{l.itemCode} · batch {l.batchNo}</p>
      </div>
    ) },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (l) => <span className="tabular">{formatQty(l.quantity)} <span className="text-2xs text-fg-subtle">{l.uom}</span></span> },
    { key: 'currentOperation', header: 'At operation', sortable: true, render: (l) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{l.currentOperation}</p>
        <p className="truncate text-2xs text-fg-subtle">{l.nextOperation ? `next: ${l.nextOperation}` : 'last operation'}</p>
      </div>
    ) },
    { key: 'workCentre', header: 'Work centre', sortable: true, defaultHidden: true },
    { key: 'location', header: 'Where', width: '11rem', render: (l) => <span className="font-mono text-2xs">{l.location}</span> },
    { key: 'machine', header: 'Machine · operator', width: '11rem', accessor: (l) => l.machine ?? '', render: (l) => (
      l.machine ? <div><p className="font-mono text-2xs">{l.machine}</p><p className="text-2xs text-fg-subtle">{l.operator}</p></div> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'waitingMinutes', header: 'Waiting', width: '7rem', sortable: true, render: (l) => (
      l.waitingMinutes ? <span className={cn(l.waitingMinutes > 240 ? 'text-danger' : l.waitingMinutes > 60 ? 'text-warning' : '')}><Duration minutes={l.waitingMinutes} /></span> : <span className="text-2xs text-success">moving</span>
    ) },
    { key: 'enteredAt', header: 'Since', width: '9rem', defaultHidden: true, render: (l) => formatDateTime(l.enteredAt) },
    ...(canSeeValue ? [{ key: 'value', header: 'Value', align: 'right' as const, sortable: true, render: (l: WipLot) => formatCurrency(l.value) }] : []),
    { key: 'state', header: 'State', sortable: true, width: '9.5rem', render: (l) => <MesStatusBadge status={l.state} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'wip-report', 'Work in progress', columnsFromTable(columns), lots)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Work in progress"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'WIP' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/production/work-orders')}>Work orders</Button>}
      />

      <p className="mb-3 text-xs text-fg-muted">
        Everything between the first and last operation. <span className="font-medium text-fg tabular">{formatQty(totalQty)}</span>{' '}
        pieces in <span className="font-medium text-fg">{live.length}</span> lots
        {canSeeValue && <> worth <span className="font-medium text-fg tabular">₹{formatCompact(totalValue)}</span></>} ·{' '}
        <span className={cn('font-medium', held.length ? 'text-danger' : 'text-success')}>{held.length}</span> on quality hold ·{' '}
        <span className={cn('font-medium', waiting.length ? 'text-warning' : 'text-success')}>{waiting.length}</span> waiting for a
        free station, the longest for <Duration minutes={longestWait} />.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {byWorkCentre.map((w) => (
          <div key={w.workCentre} className="card p-3">
            <p className="truncate text-xs font-medium text-fg">{w.workCentre}</p>
            <p className="mt-1 text-lg font-semibold tabular text-fg">{formatQty(w.qty)}</p>
            <p className="mt-0.5 text-2xs text-fg-muted">
              {w.lots} lot{w.lots === 1 ? '' : 's'}{canSeeValue ? ` · ₹${formatCompact(w.value)}` : ''}
            </p>
          </div>
        ))}
      </div>

      <DataTable
        rows={lots}
        columns={columns}
        rowKey={(l) => l.uid}
        searchPlaceholder="Search lot, item, batch, operation or location…"
        onExport={doExport}
        emptyTitle="Nothing in progress"
        rowClassName={(l) => cn(l.state === 'QUALITY_HOLD' && 'bg-danger/[0.04]', l.state === 'WAITING' && l.waitingMinutes > 240 && 'bg-warning/[0.04]')}
        rowActions={(l) => (
          <>
            {rowEdit.actions(l)}
            <MenuItem
              label="Move to the next operation"
              icon={<ArrowRightLeft />}
              disabled={l.state === 'QUALITY_HOLD' || !l.nextOperation}
              onClick={() => {
                setMoveTarget(l)
                setMoveTo(l.nextOperation ?? '')
              }}
            />
            <MenuItem
              label="Put on quality hold"
              danger
              disabled={l.state === 'QUALITY_HOLD'}
              onClick={() => {
                setHoldTarget(l)
                setHoldReason('')
              }}
            />
            <MenuItem
              label="Release from hold"
              disabled={l.state !== 'QUALITY_HOLD'}
              onClick={() => {
                update(l.uid, { state: 'READY', waitingMinutes: 0 })
                toast.success('Released', `${l.lotNo} back in the queue at ${l.currentOperation}.`)
              }}
            />
            <MenuItem label="Trace this lot" separatorBefore onClick={() => navigate('/production/genealogy')} />
          </>
        )}
      />

      {/* Move ----------------------------------------------------------------- */}
      <Modal
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        title={moveTarget ? `Move ${moveTarget.lotNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!moveTarget) return
                update(moveTarget.uid, {
                  currentOperation: moveTo,
                  state: 'READY',
                  waitingMinutes: 0,
                  enteredAt: new Date().toISOString(),
                  machine: null,
                  operator: null,
                })
                toast.success('Moved', `${formatQty(moveTarget.quantity)} ${moveTarget.uom} handed over to ${moveTo}. The batch identity travels with it.`)
                setMoveTarget(null)
              }}
            >
              Move lot
            </Button>
          </>
        }
      >
        {moveTarget && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">{formatQty(moveTarget.quantity)} {moveTarget.uom}</span> of{' '}
              {moveTarget.itemName}, batch {moveTarget.batchNo}, currently at {moveTarget.currentOperation}.
            </p>
            <Select
              label="Next operation"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              options={[moveTarget.nextOperation ?? '', 'Rework', 'Quality hold trolley'].filter(Boolean).map((v) => ({ value: v, label: v }))}
            />
            <p className="rounded border border-border bg-surface-2 px-3 py-2 text-2xs text-fg-subtle">
              The lot keeps its batch number through every operation. That is what lets a finished bottle be traced back to the
              steel heat it came from.
            </p>
          </div>
        )}
      </Modal>

      {/* Hold ----------------------------------------------------------------- */}
      <Modal
        open={!!holdTarget}
        onClose={() => setHoldTarget(null)}
        title={holdTarget ? `Hold ${holdTarget.lotNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setHoldTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!holdTarget) return
                if (!holdReason.trim()) {
                  toast.error('Reason required', 'Quality and the next shift both need to know why this lot stopped.')
                  return
                }
                update(holdTarget.uid, { state: 'QUALITY_HOLD', location: 'QTN-01', machine: null, operator: null })
                toast.success('On quality hold', `${holdTarget.lotNo} moved to the hold area. It cannot advance until quality decides.`)
                setHoldTarget(null)
              }}
            >
              Hold lot
            </Button>
          </>
        }
      >
        {holdTarget && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              Holding {formatQty(holdTarget.quantity)} {holdTarget.uom} stops it moving to {holdTarget.nextOperation ?? 'the next step'}.
              It stays counted as WIP and keeps its place in the genealogy.
            </p>
            <Textarea label="Why (required)" rows={3} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Weld porosity found on the sample, awaiting inspector…" />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="What each state means" description="The floor and the planner use the same six words" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(STATE_HELP) as WipState[]).map((s) => (
            <div key={s} className="rounded border border-border p-3">
              <MesStatusBadge status={s} size="sm" />
              <p className="mt-1.5 text-2xs leading-relaxed text-fg-muted">{STATE_HELP[s]}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
