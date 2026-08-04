import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { CoverChip, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { nonMoving as seedNonMoving, stockPositions } from '@/mock/inventory'
import type { NonMovingItem, StockPosition } from '@/types/inventory'

type Speed = 'FAST' | 'NORMAL' | 'SLOW' | 'DEAD'

const SPEED_META: Record<Speed, { label: string; tone: 'success' | 'brand' | 'warning' | 'danger'; rule: string }> = {
  FAST: { label: 'Fast', tone: 'success', rule: 'Issued within the last 7 days' },
  NORMAL: { label: 'Normal', tone: 'brand', rule: 'Issued within the last 30 days' },
  SLOW: { label: 'Slow', tone: 'warning', rule: 'Not issued for 30–180 days' },
  DEAD: { label: 'Dead', tone: 'danger', rule: 'Not issued for over 180 days' },
}

function idleDays(p: StockPosition) {
  return p.lastIssueOn ? Math.floor((Date.now() - new Date(p.lastIssueOn).getTime()) / 86_400_000) : 9_999
}

function speedOf(p: StockPosition): Speed {
  const d = idleDays(p)
  if (d <= 7) return 'FAST'
  if (d <= 30) return 'NORMAL'
  if (d <= 180) return 'SLOW'
  return 'DEAD'
}

export function StockMovementPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedNonMoving, [])
  const { rows: dead, update, remove } = useCollection<NonMovingItem>('inv:nonmoving', seed)

  const [filter, setFilter] = useState<'ALL' | Speed>('ALL')
  const [disposition, setDisposition] = useState<NonMovingItem | null>(null)
  const [note, setNote] = useState('')

  const items = stockPositions.filter((p) => (filter === 'ALL' ? true : speedOf(p) === filter))

  const counts = {
    FAST: stockPositions.filter((p) => speedOf(p) === 'FAST').length,
    NORMAL: stockPositions.filter((p) => speedOf(p) === 'NORMAL').length,
    SLOW: stockPositions.filter((p) => speedOf(p) === 'SLOW').length,
    DEAD: stockPositions.filter((p) => speedOf(p) === 'DEAD').length,
  }
  const deadValue = dead.reduce((s, n) => s + n.value, 0)

  const columns: Column<StockPosition>[] = [
    { key: 'itemCode', header: 'Item', sortable: true, render: (p) => <ItemCell code={p.itemCode} name={p.itemName} /> },
    { key: 'onHand', header: 'On hand', align: 'right', sortable: true, render: (p) => <QtyCell qty={p.onHand} uom={p.uom} /> },
    { key: 'avgDailyDemand', header: 'Daily use', align: 'right', sortable: true, render: (p) => <QtyCell qty={p.avgDailyDemand} tone="muted" /> },
    { key: 'cover', header: 'Cover', width: '6.5rem', accessor: (p) => (p.avgDailyDemand ? Math.floor(p.available / p.avgDailyDemand) : 999), render: (p) => (p.avgDailyDemand ? <CoverChip days={Math.floor(p.available / p.avgDailyDemand)} /> : <span className="text-2xs text-fg-subtle">no demand</span>) },
    { key: 'lastIssueOn', header: 'Last issued', sortable: true, width: '9rem', accessor: (p) => p.lastIssueOn ?? '', render: (p) => (p.lastIssueOn ? formatDate(p.lastIssueOn) : 'Never') },
    { key: 'idle', header: 'Idle for', align: 'right', width: '7rem', accessor: idleDays, render: (p) => {
      const d = idleDays(p)
      return <span className={cn('tabular text-2xs', d > 180 ? 'text-danger' : d > 30 ? 'text-warning' : 'text-fg-muted')}>{d > 900 ? '—' : `${d} d`}</span>
    } },
    ...(canSeeValue ? [{ key: 'value', header: 'Value held', align: 'right' as const, sortable: true, accessor: (p: StockPosition) => p.onHand * p.rate, render: (p: StockPosition) => formatCurrency(p.onHand * p.rate) }] : []),
    { key: 'speed', header: 'Speed', width: '7rem', accessor: (p) => SPEED_META[speedOf(p)].label, render: (p) => {
      const m = SPEED_META[speedOf(p)]
      return <Badge tone={m.tone} size="sm">{m.label}</Badge>
    } },
  ]

  const deadColumns: Column<NonMovingItem>[] = [
    { key: 'itemCode', header: 'Item', sortable: true, render: (n) => <ItemCell code={n.itemCode} name={n.itemName} /> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (n) => <QtyCell qty={n.quantity} uom={n.uom} /> },
    ...(canSeeValue ? [{ key: 'value', header: 'Value', align: 'right' as const, sortable: true, render: (n: NonMovingItem) => formatCurrency(n.value) }] : []),
    { key: 'daysIdle', header: 'Idle', align: 'right', width: '6.5rem', sortable: true, render: (n) => <span className={cn('tabular', n.daysIdle > 365 ? 'text-danger' : 'text-warning')}>{n.daysIdle} d</span> },
    { key: 'reason', header: 'Why it stopped moving' },
    { key: 'recommendation', header: 'Recommended action' },
    { key: 'provisionPct', header: 'Provision', align: 'right', width: '7rem', sortable: true, render: (n) => (
      <Badge tone={n.provisionPct === 100 ? 'danger' : n.provisionPct > 0 ? 'warning' : 'neutral'} size="sm" dot={false}>{n.provisionPct}%</Badge>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'fast-slow-dead', 'Fast, slow & dead stock', columnsFromTable(columns), items)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Fast, slow & dead stock"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Movement speed' }]}
      />

      <p className="mb-3 text-xs text-fg-muted">
        Speed is measured from the last issue date. Slow and dead stock is money standing still — every line below should end in
        a decision, not just a report.
        {canSeeValue && <> Dead and obsolete stock currently holds <span className="font-medium text-danger tabular">₹{formatCompact(deadValue)}</span>.</>}
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(SPEED_META) as Speed[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(filter === s ? 'ALL' : s)}
            className={cn(
              'card p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-2',
              filter === s && 'border-brand-500 bg-brand-500/5',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <Badge tone={SPEED_META[s].tone} size="sm">{SPEED_META[s].label}</Badge>
              <span className="text-lg font-semibold tabular text-fg">{counts[s]}</span>
            </div>
            <p className="mt-1.5 text-2xs text-fg-muted">{SPEED_META[s].rule}</p>
          </button>
        ))}
      </div>

      <DataTable
        rows={items}
        columns={columns}
        rowKey={(p) => p.uid}
        searchPlaceholder="Search item…"
        onExport={doExport}
        filterChips={filter === 'ALL' ? [] : [{ key: 'speed', label: 'Speed', value: SPEED_META[filter].label, onRemove: () => setFilter('ALL') }]}
        onClearFilters={() => setFilter('ALL')}
        emptyTitle="No items in this band"
        rowClassName={(p) => cn(speedOf(p) === 'DEAD' && 'bg-danger/[0.03]', speedOf(p) === 'SLOW' && 'bg-warning/[0.03]')}
      />

      <Card className="mt-4">
        <CardHeader
          title="Dead & obsolete register"
          description="Idle beyond 90 days, with the reason and the decision taken"
        />
        <CardBody className="p-0">
          <DataTable
            rows={dead}
            columns={deadColumns}
            rowKey={(n) => n.uid}
            searchPlaceholder="Search item or reason…"
            className="border-0"
            emptyTitle="Nothing idle — everything has moved recently"
            rowActions={(n) => (
              <>
                <MenuItem
                  label="Record a disposition"
                  onClick={() => {
                    setDisposition(n)
                    setNote(n.recommendation)
                  }}
                />
                <MenuItem
                  label="Raise provision to 100%"
                  disabled={n.provisionPct === 100}
                  onClick={() => {
                    update(n.uid, { provisionPct: 100 })
                    toast.success('Provision raised', `${n.itemCode} fully provided for. Finance approves the posting — this records the proposal.`)
                  }}
                />
                <MenuItem
                  label="Clear from the register"
                  danger
                  separatorBefore
                  onClick={() => {
                    remove(n.uid)
                    toast.success('Cleared', `${n.itemCode} removed from the non-moving register. It reappears if it stays idle.`)
                  }}
                />
              </>
            )}
            rowClassName={(n) => cn(n.provisionPct === 100 && 'bg-danger/[0.03]')}
          />
        </CardBody>
      </Card>

      <Modal
        open={!!disposition}
        onClose={() => setDisposition(null)}
        title={disposition ? `Disposition — ${disposition.itemCode}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDisposition(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!disposition) return
                if (!note.trim()) {
                  toast.error('Decision required', 'Write what will actually happen to this stock.')
                  return
                }
                update(disposition.uid, { recommendation: note.trim() })
                toast.success('Decision recorded', `${disposition.itemCode}: ${note.trim()}`)
                setDisposition(null)
              }}
            >
              Save decision
            </Button>
          </>
        }
      >
        {disposition && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">{disposition.itemName}</span> — {disposition.quantity.toLocaleString('en-IN')}{' '}
              {disposition.uom} idle for {disposition.daysIdle} days.
            </p>
            <p className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">{disposition.reason}</p>
            <Textarea
              label="What will be done"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              hint="Use, rework, sell as scrap, return to supplier, or write off"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
