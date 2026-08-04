import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ClassChip, CoverChip, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { reorderRows as seedReorder, shortages } from '@/mock/inventory'
import type { ReorderRow, ShortageRow } from '@/types/inventory'

const ACTION_META: Record<ReorderRow['action'], { tone: 'success' | 'progress' | 'warning' | 'brand' | 'danger'; label: string }> = {
  OK: { tone: 'success', label: 'OK' },
  COVERED: { tone: 'progress', label: 'Covered' },
  RAISE_PR: { tone: 'warning', label: 'Raise PR' },
  TRANSFER: { tone: 'brand', label: 'Transfer' },
  URGENT: { tone: 'danger', label: 'Urgent' },
}

export function ReorderReportPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedReorder, [])
  const { rows: reorder, update } = useCollection<ReorderRow>('inv:reorder', seed)

  const [detail, setDetail] = useState<ReorderRow | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [levelTarget, setLevelTarget] = useState<ReorderRow | null>(null)
  const [levelForm, setLevelForm] = useState({ minLevel: '', reorderLevel: '', maxLevel: '', safetyStock: '', reason: '' })

  const needsAction = reorder.filter((r) => r.action === 'RAISE_PR' || r.action === 'TRANSFER' || r.action === 'URGENT')
  const orderValue = needsAction.reduce((s, r) => s + r.suggestedQty * r.lastRate, 0)

  /** Raising a requisition marks the line covered and names the document. */
  function raisePr(rows: ReorderRow[]) {
    if (!rows.length) return
    const prNo = `PR/26-27/${String(190 + Math.floor(Math.random() * 60)).padStart(5, '0')}`
    rows.forEach((r) => update(r.uid, { action: 'COVERED', onOrder: r.onOrder + r.suggestedQty, note: `${prNo} raised for ${formatQty(r.suggestedQty)} ${r.uom} — awaiting procurement approval` }))
    toast.success(
      `${prNo} raised`,
      `${rows.length} line(s) sent to procurement with stock, coverage, last rate and the transfer alternative attached, so the approver never has to open this module.`,
    )
    setSelected([])
  }

  function proposeTransfer(r: ReorderRow) {
    if (!r.transferAlternative) return
    update(r.uid, {
      action: 'COVERED',
      onOrder: r.onOrder + r.transferAlternative.quantity,
      note: `Transfer proposed from ${r.transferAlternative.plant} — ${formatQty(r.transferAlternative.quantity)} ${r.uom} above its own maximum`,
    })
    toast.success('Transfer proposed', `${r.transferAlternative.plant} covers this faster and cheaper than a purchase. The decision is recorded either way.`)
  }

  const columns: Column<ReorderRow>[] = [
    { key: 'abcClass', header: 'Class', width: '6.5rem', accessor: (r) => `${r.abcClass}/${r.xyzClass}`, render: (r) => <ClassChip abc={r.abcClass} xyz={r.xyzClass} /> },
    { key: 'itemCode', header: 'Item', sortable: true, render: (r) => <ItemCell code={r.itemCode} name={r.itemName} /> },
    { key: 'free', header: 'Free', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.free} tone={r.free <= r.minLevel ? 'danger' : undefined} /> },
    { key: 'minLevel', header: 'Minimum', align: 'right', render: (r) => <QtyCell qty={r.minLevel} tone="muted" /> },
    { key: 'reorderLevel', header: 'Reorder at', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.reorderLevel} tone="muted" /> },
    { key: 'maxLevel', header: 'Maximum', align: 'right', defaultHidden: true, render: (r) => <QtyCell qty={r.maxLevel} tone="muted" /> },
    { key: 'safetyStock', header: 'Safety', align: 'right', defaultHidden: true, render: (r) => <QtyCell qty={r.safetyStock} tone="muted" /> },
    { key: 'onOrder', header: 'On order', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.onOrder} tone="muted" /> },
    { key: 'coverageDays', header: 'Cover', width: '6.5rem', sortable: true, render: (r) => <CoverChip days={r.coverageDays} /> },
    { key: 'suggestedQty', header: 'Order', align: 'right', sortable: true, render: (r) => (r.suggestedQty ? <QtyCell qty={r.suggestedQty} uom={r.uom} /> : <span className="text-2xs text-fg-subtle">—</span>) },
    ...(canSeeValue
      ? [{ key: 'value', header: 'Est. value', align: 'right' as const, sortable: true, accessor: (r: ReorderRow) => r.suggestedQty * r.lastRate, render: (r: ReorderRow) => (r.suggestedQty ? formatCurrency(r.suggestedQty * r.lastRate) : '—') }]
      : []),
    { key: 'preferredSupplier', header: 'Supplier', sortable: true },
    { key: 'action', header: 'Recommendation', width: '8rem', sortable: true, render: (r) => (
      <Badge tone={ACTION_META[r.action].tone} size="sm" dot={false}>{ACTION_META[r.action].label}</Badge>
    ) },
  ]

  const shortageColumns: Column<ShortageRow>[] = [
    { key: 'itemCode', header: 'Item', sortable: true, render: (s) => <ItemCell code={s.itemCode} name={s.itemName} /> },
    { key: 'demandDocNo', header: 'Demand', width: '12rem', render: (s) => (
      <div>
        <p className="font-mono text-2xs text-brand-600">{s.demandDocNo}</p>
        <p className="text-2xs text-fg-subtle">{s.demandType}</p>
      </div>
    ) },
    { key: 'party', header: 'For', sortable: true },
    { key: 'requiredQty', header: 'Needed', align: 'right', sortable: true, render: (s) => <QtyCell qty={s.requiredQty} uom={s.uom} /> },
    { key: 'availableQty', header: 'Available', align: 'right', render: (s) => <QtyCell qty={s.availableQty} tone="muted" /> },
    { key: 'gap', header: 'Short by', align: 'right', sortable: true, render: (s) => <QtyCell qty={s.gap} tone="danger" /> },
    { key: 'requiredOn', header: 'Needed on', sortable: true, width: '8rem', accessor: (s) => s.requiredOn, render: (s) => formatDate(s.requiredOn) },
    { key: 'earliestCoverOn', header: 'Earliest cover', width: '11rem', render: (s) => (
      s.earliestCoverOn
        ? <div><p className="text-2xs text-fg">{formatDate(s.earliestCoverOn)}</p><p className="font-mono text-2xs text-fg-subtle">{s.coverSource}</p></div>
        : <span className="text-2xs text-danger">Nothing on order</span>
    ) },
    { key: 'daysLate', header: 'Late by', align: 'right', width: '7rem', sortable: true, render: (s) => (
      <span className={cn('tabular', s.daysLate > 7 ? 'text-danger' : 'text-warning')}>{s.daysLate > 90 ? 'unknown' : `${s.daysLate} d`}</span>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'reorder-report', 'Reorder report', columnsFromTable(columns), reorder)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function saveLevels() {
    if (!levelTarget) return
    const min = Number(levelForm.minLevel || 0)
    const rop = Number(levelForm.reorderLevel || 0)
    const max = Number(levelForm.maxLevel || 0)
    const safety = Number(levelForm.safetyStock || 0)
    if (!(min <= rop && rop <= max)) {
      toast.error('Check the levels', 'Minimum must be at or below the reorder level, and the reorder level at or below the maximum.')
      return
    }
    if (safety > rop) {
      toast.error('Check the safety stock', 'Safety stock cannot be higher than the reorder level — the level already includes it.')
      return
    }
    if (!levelForm.reason.trim()) {
      toast.error('Reason required', 'A manual level is flagged as manual so a later review can tell it from a calculated one.')
      return
    }
    const free = levelTarget.free
    update(levelTarget.uid, {
      minLevel: min,
      reorderLevel: rop,
      maxLevel: max,
      safetyStock: safety,
      action: free + levelTarget.onOrder < min ? 'URGENT' : free + levelTarget.onOrder < rop ? 'RAISE_PR' : 'OK',
      suggestedQty: free + levelTarget.onOrder < rop ? Math.max(levelTarget.moq, max - free) : 0,
      note: `Manual override — ${levelForm.reason.trim()}`,
    })
    toast.success('Levels updated', `${levelTarget.itemCode} recalculated against the new levels.`)
    setLevelTarget(null)
  }

  return (
    <div>
      <PageHeader
        title="Reorder report"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Reorder report' }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                reorder.forEach((r) => {
                  const projected = r.free + r.onOrder
                  const action: ReorderRow['action'] = projected < r.minLevel ? 'URGENT' : projected < r.reorderLevel ? (r.transferAlternative ? 'TRANSFER' : 'RAISE_PR') : r.onOrder > 0 && r.free < r.reorderLevel ? 'COVERED' : 'OK'
                  update(r.uid, { action, coverageDays: r.avgDailyDemand ? Math.floor(r.free / r.avgDailyDemand) : 999 })
                })
                toast.success('Recalculated', 'Levels re-evaluated from current free stock, open orders and average daily use.')
              }}
            >
              Recalculate
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={selected.length === 0}
              onClick={() => raisePr(reorder.filter((r) => selected.includes(r.uid)))}
            >
              Raise PR for {selected.length || 0} item{selected.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        An item needs ordering when <span className="font-medium text-fg">free + on order</span> falls below the reorder level.
        Reorder level = average daily use × lead time + safety stock, so it already allows for the wait.{' '}
        <span className={cn('font-medium', needsAction.length ? 'text-warning' : 'text-success')}>{needsAction.length}</span> item
        {needsAction.length === 1 ? '' : 's'} need action today
        {canSeeValue && orderValue > 0 && <> · about <span className="font-medium text-fg tabular">₹{formatCompact(orderValue)}</span> to cover</>}.
      </p>

      <DataTable
        rows={reorder}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search item or supplier…"
        onExport={doExport}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <>
            <Button variant="outline" size="sm" onClick={() => raisePr(reorder.filter((r) => selected.includes(r.uid)))}>
              Raise one consolidated PR
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const withAlt = reorder.filter((r) => selected.includes(r.uid) && r.transferAlternative)
                if (!withAlt.length) {
                  toast.error('No transfer alternative', 'None of the selected items has surplus at another plant.')
                  return
                }
                withAlt.forEach(proposeTransfer)
                setSelected([])
              }}
            >
              Propose transfers instead
            </Button>
          </>
        }
        onRowClick={setDetail}
        emptyTitle="Nothing to reorder"
        rowClassName={(r) => cn(r.action === 'URGENT' && 'bg-danger/[0.04]', r.action === 'RAISE_PR' && 'bg-warning/[0.03]')}
        rowActions={(r) => (
          <>
            <MenuItem label="Open planning detail" onClick={() => setDetail(r)} />
            <MenuItem
              label="Raise purchase requisition"
              disabled={r.action === 'OK' || r.action === 'COVERED'}
              onClick={() => raisePr([r])}
            />
            <MenuItem
              label="Propose stock transfer"
              disabled={!r.transferAlternative || r.action === 'COVERED'}
              onClick={() => proposeTransfer(r)}
            />
            <MenuItem
              label="Change levels"
              separatorBefore
              onClick={() => {
                setLevelTarget(r)
                setLevelForm({ minLevel: String(r.minLevel), reorderLevel: String(r.reorderLevel), maxLevel: String(r.maxLevel), safetyStock: String(r.safetyStock), reason: '' })
              }}
            />
          </>
        )}
      />

      <Card className="mt-4">
        <CardHeader title="Shortage list" description="Demand that cannot be met from free stock, and when it can be" />
        <CardBody className="p-0">
          <DataTable
            rows={shortages}
            columns={shortageColumns}
            rowKey={(s) => s.uid}
            searchPlaceholder="Search item, demand or customer…"
            className="border-0"
            emptyTitle="No shortages"
            rowClassName={(s) => cn(s.daysLate > 7 && 'bg-danger/[0.04]')}
          />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="What the actions mean" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-success">OK</span> — above the reorder level, nothing to do.</p>
          <p><span className="font-medium text-progress">Covered</span> — below the level, but an open order or transfer already covers it.</p>
          <p><span className="font-medium text-warning">Raise PR</span> — send a requisition to procurement with the suggested quantity.</p>
          <p><span className="font-medium text-danger">Urgent</span> — below the minimum; production stops before a normal order arrives.</p>
        </CardBody>
      </Card>

      {/* Planning detail ------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.itemName}
        description={detail ? `${detail.itemCode} · ${detail.abcClass}/${detail.xyzClass} · lead time ${detail.leadTimeDays} days` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {detail.transferAlternative && detail.action !== 'COVERED' && (
                <Button variant="outline" size="sm" onClick={() => { proposeTransfer(detail); setDetail(null) }}>
                  Propose transfer
                </Button>
              )}
              {(detail.action === 'RAISE_PR' || detail.action === 'URGENT' || detail.action === 'TRANSFER') && (
                <Button variant="primary" size="sm" onClick={() => { raisePr([detail]); setDetail(null) }}>
                  Raise requisition
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ACTION_META[detail.action].tone} size="sm" dot={false}>{ACTION_META[detail.action].label}</Badge>
              <CoverChip days={detail.coverageDays} />
              {detail.transferAlternative && <Badge tone="brand" size="sm">Transfer alternative available</Badge>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Free stock', value: `${formatQty(detail.free)} ${detail.uom}` },
                { label: 'On order', value: `${formatQty(detail.onOrder)} ${detail.uom}` },
                { label: 'Minimum level', value: formatQty(detail.minLevel) },
                { label: 'Reorder level', value: formatQty(detail.reorderLevel) },
                { label: 'Maximum level', value: formatQty(detail.maxLevel) },
                { label: 'Safety stock', value: formatQty(detail.safetyStock) },
                { label: 'Average daily use', value: `${formatQty(detail.avgDailyDemand)} ${detail.uom}` },
                { label: 'Lead time', value: `${detail.leadTimeDays} days` },
                { label: 'Suggested order', value: detail.suggestedQty ? `${formatQty(detail.suggestedQty)} ${detail.uom} (MOQ ${formatQty(detail.moq)})` : 'None' },
                { label: 'Preferred supplier', value: detail.preferredSupplier },
                ...(canSeeValue ? [{ label: 'Last rate', value: formatCurrency(detail.lastRate) }] : []),
              ]}
            />

            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">How the level was worked out</p>
              <p className="mt-1.5 font-mono text-2xs leading-relaxed text-fg-muted">
                reorder level = (daily use {formatQty(detail.avgDailyDemand)} × lead time {detail.leadTimeDays} d) + safety{' '}
                {formatQty(detail.safetyStock)} = {formatQty(detail.avgDailyDemand * detail.leadTimeDays + detail.safetyStock)}<br />
                cover = free {formatQty(detail.free)} ÷ daily use {formatQty(detail.avgDailyDemand)} = {detail.coverageDays} days
              </p>
            </div>

            {detail.note && <div className="rounded border border-progress/30 bg-progress/5 px-3 py-2 text-xs text-progress">{detail.note}</div>}

            {detail.transferAlternative && (
              <div className="rounded border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-xs text-brand-600">
                {detail.transferAlternative.plant} holds {formatQty(detail.transferAlternative.quantity)} {detail.uom} above its own
                maximum — a transfer covers this faster and cheaper than buying.
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Change levels -------------------------------------------------------- */}
      <Modal
        open={!!levelTarget}
        onClose={() => setLevelTarget(null)}
        title={levelTarget ? `Levels — ${levelTarget.itemCode}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setLevelTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveLevels}>Save levels</Button>
          </>
        }
      >
        {levelTarget && (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input label="Minimum level" type="number" value={levelForm.minLevel} onChange={(e) => setLevelForm({ ...levelForm, minLevel: e.target.value })} />
            <Input label="Reorder level" type="number" value={levelForm.reorderLevel} onChange={(e) => setLevelForm({ ...levelForm, reorderLevel: e.target.value })} />
            <Input label="Maximum level" type="number" value={levelForm.maxLevel} onChange={(e) => setLevelForm({ ...levelForm, maxLevel: e.target.value })} />
            <Input label="Safety stock" type="number" value={levelForm.safetyStock} onChange={(e) => setLevelForm({ ...levelForm, safetyStock: e.target.value })} />
            <Textarea
              label="Why (required)"
              containerClassName="sm:col-span-2"
              rows={2}
              value={levelForm.reason}
              onChange={(e) => setLevelForm({ ...levelForm, reason: e.target.value })}
              placeholder="Supplier lead time increased to 24 days, buffer raised accordingly…"
            />
            <p className="text-2xs text-fg-subtle sm:col-span-2">
              Calculated levels come from actual consumption and actual lead times. A manual level is kept, but flagged as manual
              with this reason so a later review can tell the two apart.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
