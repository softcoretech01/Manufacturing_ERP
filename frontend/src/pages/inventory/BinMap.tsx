import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { InvStatusBadge, useCanSeeValue } from '@/components/inventory/InvShell'
import { formatCompact, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useWarehouses } from '@/hooks/useOrganisation'
import { useZones, useAllBins, useBlockBin, useUnblockBin, useUpdateBin } from '@/hooks/useInventory'
import { useBinOccupancy, usePutaway, useItems } from '@/hooks/useStock'
import type { OccupiedBin } from '@/api/stock'
import type { BinSlot, BinStatus } from '@/types/inventory'

/** Colour a tile by occupancy state — blocked/counting override, then occupied vs empty.
 *  Bins carry no unit-capacity, so we never fabricate a "% full"; we show real quantity. */
function heat(occupied: boolean, status: string) {
  if (status === 'BLOCKED' || status === 'DAMAGED' || status === 'INACTIVE')
    return 'bg-danger/25 text-danger border-danger/40'
  if (status === 'UNDER_COUNT') return 'bg-progress/20 text-progress border-progress/40'
  if (occupied) return 'bg-brand-500/25 text-brand-600 border-brand-500/40'
  return 'bg-surface-3 text-fg-subtle border-border'
}

export function BinMapPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeValue()

  const [warehouseUid, setWarehouseUid] = useState<string>('')
  const [detail, setDetail] = useState<BinSlot | null>(null)
  const [blockTarget, setBlockTarget] = useState<BinSlot | null>(null)
  const [reason, setReason] = useState('')
  const [putawayOpen, setPutawayOpen] = useState(false)
  const [paSource, setPaSource] = useState('') // "item_code|batch_no"
  const [paBin, setPaBin] = useState('')
  const [paQty, setPaQty] = useState('')

  // 1. Fetch live warehouses (first load only selects the first bin-managed one)
  const { data: whRes } = useWarehouses({ page_size: 200 })
  const warehouses = whRes?.data ?? []
  const binManaged = warehouses.filter((w) => w.is_bin_managed && w.is_active)

  if (!warehouseUid && binManaged.length > 0) {
    setWarehouseUid(binManaged[0].uid)
  }

  const selectedWh = warehouses.find((w) => w.uid === warehouseUid)

  // 2. Fetch live zones, bins and live occupancy (from the stock engine) for the warehouse
  const { data: zonesRes } = useZones(warehouseUid || undefined)
  const { data: binsRes } = useAllBins(warehouseUid || undefined)
  const { data: occRes } = useBinOccupancy(warehouseUid || undefined)
  const { data: itemList } = useItems({ active_only: true })
  const blockBin = useBlockBin()
  const unblockBin = useUnblockBin()
  const updateBin = useUpdateBin()
  const putaway = usePutaway()

  // 3. Index occupancy by bin uid, and resolve item code → uid for put-away
  const occByBin = useMemo(
    () => new Map<string, OccupiedBin>((occRes?.bins ?? []).map((b) => [b.bin_uid, b])),
    [occRes],
  )
  const itemUidByCode = useMemo(
    () => new Map((itemList ?? []).map((i) => [i.code, i.uid])),
    [itemList],
  )
  const implicit = occRes?.implicit ?? { total_qty: 0, value: 0, contents: [] }

  // 4. Map API data to the UI's BinSlot shape, filling contents from live occupancy
  const liveZones = zonesRes ?? []
  const zoneMap = new Map(liveZones.map((z) => [z.uid, z.name]))

  const list: BinSlot[] = (binsRes ?? []).map((b) => {
    const occ = occByBin.get(b.uid)
    const contents = occ
      ? occ.distinct_items > 1
        ? `${occ.distinct_items} items`
        : `${occ.top_item_code ?? ''}`
      : 'Empty'
    const only = occ && occ.contents.length === 1 ? occ.contents[0] : null
    return {
      uid: b.uid,
      warehouseCode: selectedWh?.code ?? '—',
      zone: b.zone_uid ? (zoneMap.get(b.zone_uid) ?? 'Unknown') : 'No zone',
      code: b.code,
      binType: b.bin_type,
      status: b.status as BinStatus,
      contents,
      quantity: occ?.total_qty ?? 0,
      utilisationPct: 0,
      itemCode: only ? only.item_code : occ && occ.distinct_items > 1 ? null : (occ?.top_item_code ?? null),
      batchNo: only ? only.batch_no || null : null,
      maxWeightKg: b.max_weight_kg,
      pickSequence: b.pick_sequence,
      mixingAllowed: b.mixing_allowed,
      fixedItem: null,
      blockReason: b.block_reason ?? undefined,
      lastCountedOn: null,
      version: b.version,
    }
  })

  const zones = [...new Set(list.map((b) => b.zone))]

  const heldValue =
    (occRes?.bins ?? []).reduce((s, b) => s + (b.value ?? 0), 0) + (implicit.value ?? 0)
  const stats = {
    total: list.length,
    occupied: list.filter((b) => b.quantity > 0).length,
    empty: list.filter((b) => b.quantity === 0 && b.status === 'AVAILABLE').length,
    blocked: list.filter((b) => b.status === 'BLOCKED' || b.status === 'DAMAGED').length,
  }

  // Bins that can receive put-away
  const availableBins = list
    .filter((b) => b.status === 'AVAILABLE')
    .sort((a, b) => a.pickSequence - b.pickSequence || a.code.localeCompare(b.code))

  const paSourceLine = implicit.contents.find((c) => `${c.item_code}|${c.batch_no}` === paSource)

  function submitPutaway() {
    if (!paSourceLine || !paBin) {
      toast.error('Pick a source and a bin', 'Choose what to put away and where it goes.')
      return
    }
    const itemUid = itemUidByCode.get(paSourceLine.item_code)
    if (!itemUid) {
      toast.error('Item not found', `Could not resolve ${paSourceLine.item_code}.`)
      return
    }
    const qty = Number(paQty)
    if (!(qty > 0) || qty > paSourceLine.quantity) {
      toast.error('Check the quantity', `Enter between 0 and ${formatQty(paSourceLine.quantity)}.`)
      return
    }
    const bin = availableBins.find((b) => b.uid === paBin)
    putaway.mutate(
      {
        item_uid: itemUid,
        warehouse_uid: warehouseUid,
        to_bin_uid: paBin,
        quantity: qty,
        batch_no: paSourceLine.batch_no || '',
      },
      {
        onSuccess: () => {
          toast.success(
            'Put away',
            `${formatQty(qty)} of ${paSourceLine.item_code} placed in ${bin?.code ?? 'the bin'}.`,
          )
          setPutawayOpen(false)
          setPaSource('')
          setPaBin('')
          setPaQty('')
        },
      },
    )
  }

  return (
    <div>
      <PageHeader
        title="Bin map & occupancy"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Bin map' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/structure')}>Edit bins</Button>
            <Button variant="outline" size="sm" onClick={() => toast.success('Labels queued', `${list.length} bin labels for ${selectedWh?.code || 'the warehouse'} sent to the store printer.`)}>
              Print all labels
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-64"
          value={warehouseUid}
          onChange={(e) => setWarehouseUid(e.target.value)}
          options={binManaged.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))}
        />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg">{stats.occupied}</span>/{stats.total} bins in use ·{' '}
          <span className="font-medium text-fg">{stats.empty}</span> empty ·{' '}
          <span className={cn('font-medium', stats.blocked ? 'text-danger' : 'text-fg')}>{stats.blocked}</span> blocked
          {canSeeValue && selectedWh ? <> · <span className="font-medium text-fg tabular">₹{formatCompact(heldValue)}</span> held here</> : null}
        </p>
      </div>

      {/* Received, awaiting put-away ------------------------------------------- */}
      {implicit.total_qty > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <div className="text-sm">
            <span className="font-medium text-fg">{formatQty(implicit.total_qty)}</span>
            <span className="text-fg-muted"> units received but not yet put away</span>
            <span className="text-fg-subtle">
              {' '}· {implicit.contents.length} line{implicit.contents.length === 1 ? '' : 's'}
              {canSeeValue && implicit.value != null ? ` · ₹${formatCompact(implicit.value)}` : ''}
            </span>
            <p className="mt-0.5 text-2xs text-fg-subtle">
              Stock in the receiving area occupies no bin. Put it away to make it pickable and visible on the map.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => { setPutawayOpen(true); setPaSource(''); setPaBin(''); setPaQty('') }}
            disabled={availableBins.length === 0}
          >
            Put away stock
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {zones.map((zone) => {
          const zoneBins = list.filter((b) => b.zone === zone)
          const inUse = zoneBins.filter((b) => b.quantity > 0).length
          return (
            <Card key={zone}>
              <CardHeader
                title={zone}
                description={`${zoneBins.length} bins · ${inUse} in use`}
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
                      className={cn('w-28 rounded border px-2 py-1.5 text-left transition-transform hover:-translate-y-0.5', heat(b.quantity > 0, b.status))}
                    >
                      <span className="block font-mono text-2xs font-medium">{b.code}</span>
                      <span className="mt-0.5 block truncate text-2xs tabular">
                        {b.status === 'BLOCKED' || b.status === 'DAMAGED'
                          ? 'blocked'
                          : b.quantity > 0
                            ? formatQty(b.quantity, 0)
                            : 'empty'}
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
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-brand-500/40 bg-brand-500/25" /> occupied</span>
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
                    const nextStatus = detail.status === 'UNDER_COUNT' ? 'AVAILABLE' : 'UNDER_COUNT'
                    updateBin.mutate({ uid: detail.uid, body: { version: detail.version as number, status: nextStatus } }, {
                      onSuccess: () => {
                        toast.success(
                          detail.status === 'UNDER_COUNT' ? 'Count finished' : 'Marked for counting',
                          detail.status === 'UNDER_COUNT' ? `${detail.code} accepts movements again.` : `${detail.code} is frozen for counting — nothing can be picked from or put into it.`,
                        )
                        setDetail(null)
                      }
                    })
                  }}
                  disabled={updateBin.isPending}
                >
                  {detail.status === 'UNDER_COUNT' ? 'Finish count' : 'Count this bin'}
                </Button>
                <Button
                  variant={detail.status === 'BLOCKED' ? 'outline' : 'danger'}
                  size="sm"
                  onClick={() => {
                    if (detail.status === 'BLOCKED') {
                      unblockBin.mutate({ uid: detail.uid, version: detail.version as number }, {
                        onSuccess: () => {
                          toast.success('Unblocked', `${detail.code} accepts put-away again.`)
                          setDetail(null)
                        }
                      })
                    } else {
                      setBlockTarget(detail)
                      setReason('')
                    }
                  }}
                  disabled={unblockBin.isPending}
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

            <DataGrid
              columns={2}
              items={[
                { label: 'What is in it', value: detail.contents },
                { label: 'Quantity', value: detail.quantity ? formatQty(detail.quantity) : 'Empty' },
                { label: 'Capacity', value: detail.maxWeightKg ? `${formatQty(detail.maxWeightKg)} kg` : '—' },
                { label: 'Pick sequence', value: String(detail.pickSequence) },
                { label: 'Mixing', value: detail.mixingAllowed ? 'Allowed' : 'Not allowed' },
                { label: 'Last counted', value: detail.lastCountedOn ? formatDate(detail.lastCountedOn) : 'Never' },
              ]}
            />

            {/* Live contents from the stock engine */}
            {(() => {
              const occ = occByBin.get(detail.uid)
              if (!occ || occ.contents.length === 0) {
                return <p className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">This bin is empty.</p>
              }
              return (
                <div className="overflow-hidden rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-2 text-fg-muted">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Item</th>
                        <th className="px-3 py-1.5 text-left font-medium">Batch</th>
                        <th className="px-3 py-1.5 text-left font-medium">Status</th>
                        <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                        {canSeeValue && <th className="px-3 py-1.5 text-right font-medium">Value</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {occ.contents.map((c, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-1.5 font-mono">{c.item_code}<span className="ml-1.5 font-sans text-fg-subtle">{c.item_name}</span></td>
                          <td className="px-3 py-1.5 font-mono text-fg-muted">{c.batch_no || '—'}</td>
                          <td className="px-3 py-1.5 text-fg-muted">{c.stock_status.toLowerCase()}</td>
                          <td className="px-3 py-1.5 text-right tabular">{formatQty(c.quantity)} {c.uom}</td>
                          {canSeeValue && <td className="px-3 py-1.5 text-right tabular">{c.value != null ? `₹${formatCompact(c.value)}` : '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            {detail.blockReason && <div className="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{detail.blockReason}</div>}

            <p className="text-2xs leading-relaxed text-fg-subtle">
              A blocked bin accepts no put-away and no picking. A bin holding stock cannot be removed at all — the structure
              screen will name the item and quantity that is blocking it.
            </p>
          </div>
        )}
      </Drawer>

      {/* Put-away ------------------------------------------------------------- */}
      <Modal
        open={putawayOpen}
        onClose={() => setPutawayOpen(false)}
        title="Put away received stock"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPutawayOpen(false)}>Cancel</Button>
            <Button onClick={submitPutaway} disabled={putaway.isPending}>Put away</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            Move stock from the receiving area into a storage bin. The value moves with it unchanged — this only records
            where the stock physically sits.
          </p>
          <Select
            label="What to put away"
            value={paSource}
            onChange={(e) => {
              setPaSource(e.target.value)
              const line = implicit.contents.find((c) => `${c.item_code}|${c.batch_no}` === e.target.value)
              setPaQty(line ? String(line.quantity) : '')
            }}
            options={[
              { value: '', label: 'Select an item…' },
              ...implicit.contents.map((c) => ({
                value: `${c.item_code}|${c.batch_no}`,
                label: `${c.item_code}${c.batch_no ? ` · ${c.batch_no}` : ''} — ${formatQty(c.quantity)} ${c.uom} available`,
              })),
            ]}
          />
          <Select
            label="Into bin"
            value={paBin}
            onChange={(e) => setPaBin(e.target.value)}
            options={[
              { value: '', label: 'Select a bin…' },
              ...availableBins.map((b) => ({ value: b.uid, label: `${b.code}${b.quantity > 0 ? ` · holds ${formatQty(b.quantity, 0)}` : ' · empty'}` })),
            ]}
          />
          <Input
            label="Quantity"
            type="number"
            value={paQty}
            onChange={(e) => setPaQty(e.target.value)}
            hint={paSourceLine ? `Up to ${formatQty(paSourceLine.quantity)} available` : undefined}
          />
        </div>
      </Modal>

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
              disabled={blockBin.isPending}
              onClick={() => {
                if (!blockTarget) return
                if (!reason.trim()) {
                  toast.error('Reason required', 'A blocked bin without a reason is a puzzle for the next shift.')
                  return
                }
                blockBin.mutate({ uid: blockTarget.uid, version: blockTarget.version as number, reason: reason.trim() }, {
                  onSuccess: () => {
                    toast.success('Bin blocked', `${blockTarget.code} accepts no put-away and no picking until it is unblocked.`)
                    setBlockTarget(null)
                    setDetail(null)
                  }
                })
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
                  This bin holds <span className="font-medium text-fg">{formatQty(blockTarget.quantity)}</span>
                  {blockTarget.itemCode ? <> of <span className="font-medium text-fg">{blockTarget.itemCode}</span></> : null}. Blocking stops picking from it, so any
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
