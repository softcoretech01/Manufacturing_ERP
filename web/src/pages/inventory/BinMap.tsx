import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Select, Textarea } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { InvStatusBadge, useCanSeeValue } from '@/components/inventory/InvShell'
import { formatCompact, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { binSlots as seedBins, warehouseSummaries } from '@/mock/inventory'
import type { BinSlot } from '@/types/inventory'

/** Colour by how full a bin is, with blocked and counting states overriding. */
function heat(pct: number, status: string) {
  if (status === 'BLOCKED' || status === 'DAMAGED' || status === 'INACTIVE') return 'bg-danger/25 text-danger border-danger/40'
  if (status === 'UNDER_COUNT') return 'bg-progress/20 text-progress border-progress/40'
  if (pct >= 90) return 'bg-warning/30 text-warning border-warning/50'
  if (pct >= 60) return 'bg-brand-500/25 text-brand-600 border-brand-500/40'
  if (pct > 0) return 'bg-success/15 text-success border-success/30'
  return 'bg-surface-3 text-fg-subtle border-border'
}

export function BinMapPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedBins, [])
  const { rows: bins, update } = useCollection<BinSlot>('inv:bin', seed)

  const [warehouse, setWarehouse] = useState('RM-01')
  const [detail, setDetail] = useState<BinSlot | null>(null)
  const [blockTarget, setBlockTarget] = useState<BinSlot | null>(null)
  const [reason, setReason] = useState('')

  const wh = warehouseSummaries.find((w) => w.code === warehouse)
  const list = bins.filter((b) => b.warehouseCode === warehouse)
  const zones = [...new Set(list.map((b) => b.zone))]

  const stats = {
    total: list.length,
    occupied: list.filter((b) => b.quantity > 0).length,
    empty: list.filter((b) => b.quantity === 0 && b.status === 'AVAILABLE').length,
    blocked: list.filter((b) => b.status === 'BLOCKED' || b.status === 'DAMAGED').length,
    avg: list.length ? list.reduce((s, b) => s + b.utilisationPct, 0) / list.length : 0,
  }

  return (
    <div>
      <PageHeader
        title="Bin map & occupancy"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Bin map' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/structure')}>Edit bins</Button>
            <Button variant="outline" size="sm" onClick={() => toast.success('Labels queued', `${list.length} bin labels for ${warehouse} sent to the store printer.`)}>
              Print all labels
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-64"
          value={warehouse}
          onChange={(e) => setWarehouse(e.target.value)}
          options={warehouseSummaries.filter((w) => w.isBinManaged).map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` }))}
        />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg">{stats.occupied}</span>/{stats.total} bins in use ·{' '}
          <span className="font-medium text-fg">{stats.empty}</span> empty ·{' '}
          <span className={cn('font-medium', stats.blocked ? 'text-danger' : 'text-fg')}>{stats.blocked}</span> blocked · average
          fill <span className="font-medium text-fg tabular">{stats.avg.toFixed(0)}%</span>
          {canSeeValue && wh ? <> · <span className="font-medium text-fg tabular">₹{formatCompact(wh.stockValue)}</span> held here</> : null}
        </p>
      </div>

      <div className="space-y-4">
        {zones.map((zone) => {
          const zoneBins = list.filter((b) => b.zone === zone)
          const util = zoneBins.reduce((s, b) => s + b.utilisationPct, 0) / zoneBins.length
          return (
            <Card key={zone}>
              <CardHeader
                title={zone}
                description={`${zoneBins.length} bins · average fill ${util.toFixed(0)}%`}
                actions={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/counting')}>Count this zone</Button>
                }
              />
              <CardBody>
                <div className="flex flex-wrap gap-2">
                  {zoneBins.map((b) => (
                    <button
                      key={b.uid}
                      onClick={() => setDetail(b)}
                      title={`${b.code} · ${b.contents}`}
                      className={cn('w-28 rounded border px-2 py-1.5 text-left transition-transform hover:-translate-y-0.5', heat(b.utilisationPct, b.status))}
                    >
                      <span className="block font-mono text-2xs font-medium">{b.code}</span>
                      <span className="mt-0.5 block text-2xs tabular">
                        {b.status === 'BLOCKED' || b.status === 'DAMAGED' ? 'blocked' : `${b.utilisationPct}%`}
                      </span>
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-2xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-border bg-surface-3" /> empty</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-success/30 bg-success/15" /> under 60%</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-brand-500/40 bg-brand-500/25" /> 60–90%</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-warning/50 bg-warning/30" /> over 90%</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-danger/40 bg-danger/25" /> blocked</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-progress/40 bg-progress/20" /> being counted</span>
      </div>

      {/* Bin detail ----------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.code}
        description={detail ? `${detail.warehouseCode} · ${detail.zone} · ${detail.binType.replace(/_/g, ' ').toLowerCase()}` : undefined}
        width="max-w-2xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="font-mono text-2xs text-fg-subtle">v1|LOC|{detail.warehouseCode}|{detail.zone}|{detail.code}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    update(detail.uid, { status: detail.status === 'UNDER_COUNT' ? 'AVAILABLE' : 'UNDER_COUNT' })
                    toast.success(
                      detail.status === 'UNDER_COUNT' ? 'Count finished' : 'Marked for counting',
                      detail.status === 'UNDER_COUNT' ? `${detail.code} accepts movements again.` : `${detail.code} is frozen for counting — nothing can be picked from or put into it.`,
                    )
                  }}
                >
                  {detail.status === 'UNDER_COUNT' ? 'Finish count' : 'Count this bin'}
                </Button>
                <Button
                  variant={detail.status === 'BLOCKED' ? 'outline' : 'danger'}
                  size="sm"
                  onClick={() => {
                    if (detail.status === 'BLOCKED') {
                      update(detail.uid, { status: 'AVAILABLE', blockReason: undefined })
                      toast.success('Unblocked', `${detail.code} accepts put-away again.`)
                      setDetail(null)
                    } else {
                      setBlockTarget(detail)
                      setReason('')
                    }
                  }}
                >
                  {detail.status === 'BLOCKED' ? 'Unblock' : 'Block bin'}
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
              {!detail.mixingAllowed && <Badge tone="brand" size="sm" dot={false}>One item / batch only</Badge>}
              {detail.fixedItem && <Badge tone="neutral" size="sm" dot={false}>Fixed to {detail.fixedItem}</Badge>}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-fg-muted">How full</span>
                <span className="tabular text-fg">{detail.utilisationPct}%</span>
              </div>
              <ProgressBar value={detail.utilisationPct} tone={detail.utilisationPct >= 90 ? 'warning' : 'brand'} height="h-2" />
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'What is in it', value: detail.contents },
                { label: 'Item', value: detail.itemCode ?? '—', mono: true },
                { label: 'Batch', value: detail.batchNo ?? '—', mono: true },
                { label: 'Quantity', value: detail.quantity ? formatQty(detail.quantity) : 'Empty' },
                { label: 'Capacity', value: detail.maxWeightKg ? `${formatQty(detail.maxWeightKg)} kg` : '—' },
                { label: 'Pick sequence', value: String(detail.pickSequence) },
                { label: 'Mixing', value: detail.mixingAllowed ? 'Allowed' : 'Not allowed' },
                { label: 'Last counted', value: detail.lastCountedOn ? formatDate(detail.lastCountedOn) : 'Never' },
              ]}
            />

            {detail.blockReason && <div className="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{detail.blockReason}</div>}

            <p className="text-2xs leading-relaxed text-fg-subtle">
              A blocked bin accepts no put-away and no picking. A bin holding stock cannot be removed at all — the structure
              screen will name the item and quantity that is blocking it.
            </p>
          </div>
        )}
      </Drawer>

      {/* Block ---------------------------------------------------------------- */}
      <Modal
        open={!!blockTarget}
        onClose={() => setBlockTarget(null)}
        title={blockTarget ? `Block bin ${blockTarget.code}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setBlockTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!blockTarget) return
                if (!reason.trim()) {
                  toast.error('Reason required', 'A blocked bin without a reason is a puzzle for the next shift.')
                  return
                }
                update(blockTarget.uid, { status: 'BLOCKED', blockReason: reason.trim() })
                toast.success('Bin blocked', `${blockTarget.code} accepts no put-away and no picking until it is unblocked.`)
                setBlockTarget(null)
                setDetail(null)
              }}
            >
              Block bin
            </Button>
          </>
        }
      >
        {blockTarget && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              {blockTarget.quantity > 0 ? (
                <>
                  This bin holds <span className="font-medium text-fg">{formatQty(blockTarget.quantity)}</span> of{' '}
                  <span className="font-medium text-fg">{blockTarget.itemCode}</span>. Blocking stops picking from it, so any
                  reservation against that stock will need re-planning.
                </>
              ) : (
                'The bin is empty. Blocking keeps put-away away until the physical problem is fixed.'
              )}
            </p>
            <Textarea label="Reason (required)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rack upright damaged, under repair until 02-Aug…" />
          </div>
        )}
      </Modal>
    </div>
  )
}
