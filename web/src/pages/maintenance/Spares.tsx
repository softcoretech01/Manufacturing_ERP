import { useMemo, useState } from 'react'
import { Package, Plus, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { newUid } from '@/store/data'
import { DetailBlock, inr, useMaintenanceData } from '@/components/maintenance/MaintShell'
import { isoDate, spareStatus, type SpareStatus } from '@/lib/maintFlow'
import type { SparePart, SpareTxn, SpareTxnType } from '@/types/maintenance'

/**
 * Spare parts (Ch 11).
 *
 * Available is on-hand less reserved, not on-hand. A critical bearing sitting
 * on the shelf but committed to tomorrow's overhaul is not available for
 * tonight's breakdown, and a store that reports it as available will fail the
 * one job it exists for.
 */

const BLANK = (): Partial<SparePart> => ({
  itemCode: '', itemName: '', category: 'Mechanical', uom: 'NOS',
  compatibleAssets: [], minStock: 1, maxStock: 4, reorderQty: 2,
  onHand: 0, reserved: 0, isCritical: false, preferredVendor: '', leadTimeDays: 14,
  rate: 0, binLocation: '', version: 1,
})

export function SparesPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const { rows, create, update, remove } = m.spares

  const [tab, setTab] = useState('low')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<SparePart> | null>(null)
  const [adjusting, setAdjusting] = useState<{ part: SparePart; kind: SpareTxnType } | null>(null)
  const [adjustQty, setAdjustQty] = useState('1')
  const [adjustNote, setAdjustNote] = useState('')

  const live = useMemo(() => rows.filter((p) => !p.deletedAt), [rows])
  const txns = useMemo(() => m.spareTxns.rows.filter((t) => !t.deletedAt), [m.spareTxns.rows])
  const statuses = useMemo(() => live.map((p) => spareStatus(p, txns)), [live, txns])
  const detail = statuses.find((s) => s.part.uid === openUid) ?? null

  const filtered = useMemo(() => {
    if (tab === 'low') return statuses.filter((s) => s.belowMin)
    if (tab === 'critical') return statuses.filter((s) => s.part.isCritical)
    if (tab === 'txns') return statuses
    return statuses
  }, [statuses, tab])

  const k = useMemo(() => ({
    total: live.length,
    below: statuses.filter((s) => s.belowMin).length,
    urgent: statuses.filter((s) => s.stockoutRisk === 'URGENT').length,
    criticalShort: statuses.filter((s) => s.part.isCritical && s.belowMin).length,
    value: live.reduce((s, p) => s + p.onHand * p.rate, 0),
    reserved: live.reduce((s, p) => s + p.reserved * p.rate, 0),
    toOrder: statuses.reduce((s, x) => s + x.suggestedOrder * x.part.rate, 0),
    consumed90: txns.filter((t) => t.txnType === 'ISSUE').reduce((s, t) => {
      const part = live.find((p) => p.itemCode === t.itemCode)
      return s + t.qty * (part?.rate ?? 0)
    }, 0),
  }), [live, statuses, txns])

  /* ── actions ────────────────────────────────────────────────── */

  /**
   * Every stock movement writes a transaction as well as moving the number.
   * A quantity that changes with no record behind it is how a store's book
   * stock quietly stops matching the shelf.
   */
  function applyAdjustment() {
    if (!adjusting) return
    const qty = Number(adjustQty)
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('Enter a quantity greater than nil.'); return }
    const { part, kind } = adjusting

    if (kind === 'RESERVE' && part.reserved + qty > part.onHand) {
      toast.error(`Only ${part.onHand} ${part.uom} on hand; ${part.reserved} is already reserved.`); return
    }
    if ((kind === 'ISSUE' || kind === 'SCRAP') && qty > part.onHand) {
      toast.error(`Only ${part.onHand} ${part.uom} on hand.`); return
    }

    const patch: Partial<SparePart> = {}
    if (kind === 'RECEIPT') patch.onHand = part.onHand + qty
    if (kind === 'ISSUE' || kind === 'SCRAP') patch.onHand = part.onHand - qty
    if (kind === 'RETURN') patch.onHand = part.onHand + qty
    if (kind === 'RESERVE') patch.reserved = part.reserved + qty
    update(part.uid, patch)

    const prefix: Record<SpareTxnType, string> = { RECEIPT: 'SR', ISSUE: 'SI', RETURN: 'SRT', SCRAP: 'SS', RESERVE: 'SV' }
    m.spareTxns.create({
      uid: newUid('stx'), docNo: `${prefix[kind]}/26-27/${String(txns.length + 400).padStart(4, '0')}`,
      txnType: kind, itemCode: part.itemCode, itemName: part.itemName, qty, uom: part.uom,
      workOrderNo: '', assetCode: '', txnAt: new Date().toISOString(), byWhom: 'You',
      remarks: adjustNote, version: 1,
    })

    const after = kind === 'RESERVE' ? part.onHand : (patch.onHand as number)
    toast.success(`${kind.toLowerCase()} of ${qty} ${part.uom} recorded`, `On hand is now ${after}.`)
    setAdjusting(null); setAdjustQty('1'); setAdjustNote('')
  }

  function releaseReservation(part: SparePart, qty: number) {
    if (qty > part.reserved) { toast.error('More would be released than is reserved.'); return }
    update(part.uid, { reserved: part.reserved - qty })
    toast.success(`${qty} ${part.uom} released back to available stock`)
  }

  function blockers(draft: Partial<SparePart>, uid?: string): string[] {
    const out: string[] = []
    if (!draft.itemCode?.trim()) out.push('A part code is required.')
    if (!draft.itemName?.trim()) out.push('Give the part a name.')
    if (draft.itemCode && live.some((p) => p.itemCode === draft.itemCode && p.uid !== uid)) out.push('That part code is already in use.')
    if ((draft.minStock ?? 0) < 0 || (draft.maxStock ?? 0) < 0) out.push('Stock levels cannot be negative.')
    if ((draft.maxStock ?? 0) < (draft.minStock ?? 0)) out.push('The maximum is below the minimum.')
    if ((draft.onHand ?? 0) < 0) out.push('On-hand stock cannot be negative.')
    if ((draft.reserved ?? 0) > (draft.onHand ?? 0)) out.push('More is reserved than is on hand.')
    if ((draft.leadTimeDays ?? 0) < 0) out.push('Lead time cannot be negative.')
    if (draft.isCritical && (draft.minStock ?? 0) === 0) out.push('A critical spare with a minimum of nil is not being protected at all.')
    return out
  }

  function save() {
    if (!editing) return
    const b = blockers(editing, editing.uid)
    if (b.length) { toast.error(b[0]); return }
    if (editing.uid) { update(editing.uid, editing as SparePart); toast.success(`${editing.itemCode} updated`) }
    else { create({ ...(BLANK() as SparePart), ...(editing as SparePart), uid: newUid('spr') }); toast.success(`${editing.itemCode} added`) }
    setEditing(null)
  }

  function removePart(p: SparePart) {
    const n = txns.filter((t) => t.itemCode === p.itemCode).length
    if (n) { toast.error(`${n} transaction(s) reference this part. Removing it would break the consumption history.`); return }
    remove(p.uid)
    if (openUid === p.uid) setOpenUid(null)
    toast.success(`${p.itemCode} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<SpareStatus>[] = [
    {
      key: 'part', header: 'Part', width: '20rem',
      render: (s) => (
        <>
          <p className="truncate text-xs text-fg">{s.part.itemName}{s.part.isCritical && <span className="ml-1.5 text-danger">•</span>}</p>
          <p className="font-mono text-2xs text-fg-subtle">{s.part.itemCode}{s.part.binLocation ? ` · ${s.part.binLocation}` : ''}</p>
        </>
      ),
    },
    { key: 'category', header: 'Category', width: '10rem', render: (s) => <span className="text-2xs text-fg-muted">{s.part.category}</span> },
    { key: 'fits', header: 'Fits', width: '14rem', render: (s) => (s.part.compatibleAssets.length ? <span className="truncate text-2xs text-fg-muted" title={s.part.compatibleAssets.join(', ')}>{s.part.compatibleAssets.slice(0, 2).join(', ')}{s.part.compatibleAssets.length > 2 ? ` +${s.part.compatibleAssets.length - 2}` : ''}</span> : <span className="text-2xs text-fg-subtle">Any</span>) },
    { key: 'onHand', header: 'On hand', width: '9rem', align: 'right', render: (s) => <span className="text-xs tabular text-fg">{s.part.onHand} {s.part.uom}</span> },
    { key: 'reserved', header: 'Reserved', width: '9rem', align: 'right', render: (s) => (s.part.reserved ? <span className="text-xs tabular text-warning">{s.part.reserved}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    {
      key: 'available', header: 'Available', width: '11rem', align: 'right',
      render: (s) => (
        <>
          <p className={cn('text-xs font-medium tabular', s.available <= 0 ? 'text-danger' : s.belowMin ? 'text-warning' : 'text-fg')}>{s.available}</p>
          <p className="text-3xs text-fg-subtle">min {s.part.minStock} / max {s.part.maxStock}</p>
        </>
      ),
    },
    {
      key: 'level', header: 'Level', width: '11rem',
      render: (s) => (
        <ProgressBar
          value={s.part.maxStock > 0 ? Math.min(100, (s.available / s.part.maxStock) * 100) : 0}
          tone={s.available <= 0 ? 'danger' : s.belowMin ? 'warning' : 'success'}
          className="w-16"
        />
      ),
    },
    {
      key: 'cover', header: 'Cover', width: '11rem',
      render: (s) => s.daysOfCover === null
        ? <span className="text-2xs text-fg-subtle">No usage</span>
        : <span className={cn('text-2xs tabular', s.daysOfCover < s.part.leadTimeDays ? 'text-danger' : 'text-fg-muted')}>{s.daysOfCover} d vs {s.part.leadTimeDays} d lead</span>,
    },
    {
      key: 'risk', header: 'Risk', width: '9rem',
      render: (s) => s.stockoutRisk === 'URGENT'
        ? <Badge tone="danger" size="sm">Urgent</Badge>
        : s.stockoutRisk === 'WATCH' ? <Badge tone="warning" size="sm">Watch</Badge> : <Badge tone="success" size="sm">Fine</Badge>,
    },
    { key: 'order', header: 'To order', width: '9rem', align: 'right', render: (s) => (s.suggestedOrder ? <span className="text-xs tabular text-fg">{s.suggestedOrder}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
  ]

  const txnColumns: Column<SpareTxn>[] = [
    { key: 'doc', header: 'Document', width: '13rem', render: (t) => (<><p className="font-mono text-2xs text-fg">{t.docNo}</p><p className="text-3xs text-fg-subtle">{formatDateTime(t.txnAt)}</p></>) },
    { key: 'type', header: 'Type', width: '9rem', render: (t) => <Badge tone={t.txnType === 'ISSUE' || t.txnType === 'SCRAP' ? 'danger' : t.txnType === 'RECEIPT' || t.txnType === 'RETURN' ? 'success' : 'warning'} size="sm" dot={false}>{t.txnType.toLowerCase()}</Badge> },
    { key: 'part', header: 'Part', width: '20rem', render: (t) => (<><p className="truncate text-xs text-fg">{t.itemName}</p><p className="font-mono text-2xs text-fg-subtle">{t.itemCode}</p></>) },
    { key: 'qty', header: 'Quantity', width: '9rem', align: 'right', render: (t) => <span className="text-xs tabular text-fg">{t.qty} {t.uom}</span> },
    { key: 'wo', header: 'Work order', width: '12rem', render: (t) => (t.workOrderNo ? <span className="font-mono text-2xs text-fg-muted">{t.workOrderNo}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'asset', header: 'Asset', width: '12rem', render: (t) => <span className="font-mono text-2xs text-fg-muted">{t.assetCode || '—'}</span> },
    { key: 'by', header: 'By', width: '11rem', render: (t) => <span className="text-2xs text-fg-muted">{t.byWhom}</span> },
    { key: 'note', header: 'Notes', render: (t) => <p className="truncate text-2xs text-fg-muted">{t.remarks || '—'}</p> },
  ]

  return (
    <div>
      <PageHeader
        title="Spare parts"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Spares' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>New spare</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'low', label: 'Below minimum', count: k.below },
              { id: 'critical', label: 'Critical spares', count: live.filter((p) => p.isCritical).length },
              { id: 'all', label: 'All parts', count: k.total },
              { id: 'txns', label: 'Movements', count: txns.length },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Below minimum" value={k.below} sub={`${k.urgent} will run out inside the lead time`} icon={<Package />} tone={k.urgent ? 'danger' : k.below ? 'warning' : 'success'} />
        <StatTile label="Critical spares short" value={k.criticalShort} sub={k.criticalShort ? 'A failure would wait for delivery' : 'Every critical spare is stocked'} tone={k.criticalShort ? 'danger' : 'success'} />
        <StatTile label="Stock value" value={inr(k.value)} sub={`${inr(k.reserved)} of it reserved`} tone="brand" />
        <StatTile label="Suggested order value" value={inr(k.toOrder)} sub="To bring every short part back to its maximum" icon={<ShoppingCart />} tone={k.toOrder > 0 ? 'warning' : 'success'} />
      </div>

      {k.criticalShort > 0 && (
        <Alert tone="danger" title={`${k.criticalShort} critical spare${k.criticalShort === 1 ? ' is' : 's are'} below minimum`} className="mb-4">
          {statuses.filter((s) => s.part.isCritical && s.belowMin).map((s) => `${s.part.itemName} (${s.available} of ${s.part.minStock}, ${s.part.leadTimeDays}-day lead)`).join(' · ')}.
          A critical spare is one where the machine waits for delivery. Raise the purchase order today, not when it fails.
        </Alert>
      )}

      {tab === 'txns' ? (
        <DataTable
          rows={txns.slice().sort((a, b) => b.txnAt.localeCompare(a.txnAt))}
          columns={txnColumns}
          rowKey={(t) => t.uid}
          searchable
          searchPlaceholder="Search by document, part or work order"
          onExport={(f: ExportFormat) => { const n = exportRows(f, 'spare-movements', 'Spare part movements', columnsFromTable(txnColumns), txns); toast.success('Export ready', `${n} rows written.`) }}
          emptyTitle="No movements"
          emptyDescription="Issues, returns and receipts appear here."
        />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(s) => s.part.uid}
          searchable
          searchPlaceholder="Search by code, name, category or vendor"
          onRowClick={(s) => setOpenUid(s.part.uid)}
          rowClassName={(s) => (s.stockoutRisk === 'URGENT' ? 'bg-danger/5' : s.belowMin ? 'bg-warning/5' : undefined)}
          onExport={(f: ExportFormat) => { const n = exportRows(f, `spares-${tab}`, 'Spare parts', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
          rowActions={(s) => (
            <>
              <MenuItem label="Edit" onClick={() => setEditing({ ...s.part, compatibleAssets: [...s.part.compatibleAssets] })} />
              <MenuItem label="Receive stock" onClick={() => { setAdjusting({ part: s.part, kind: 'RECEIPT' }); setAdjustQty(String(s.suggestedOrder || 1)) }} />
              <MenuItem label="Issue" onClick={() => { setAdjusting({ part: s.part, kind: 'ISSUE' }); setAdjustQty('1') }} />
              <MenuItem label="Reserve" onClick={() => { setAdjusting({ part: s.part, kind: 'RESERVE' }); setAdjustQty('1') }} />
              <MenuItem label="Scrap" onClick={() => { setAdjusting({ part: s.part, kind: 'SCRAP' }); setAdjustQty('1') }} />
              <MenuItem label="Delete" danger onClick={() => removePart(s.part)} />
            </>
          )}
          emptyTitle={tab === 'low' ? 'Everything is above its minimum' : 'No spares'}
          emptyDescription={tab === 'low' ? 'No part needs reordering.' : 'Add the parts the plant actually holds.'}
        />
      )}

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.part.itemCode} · ${detail.part.itemName}` : ''} width="max-w-2xl">
        {detail && (() => {
          const history = txns.filter((t) => t.itemCode === detail.part.itemCode).sort((a, b) => b.txnAt.localeCompare(a.txnAt))
          const fits = m.assets.rows.filter((a) => !a.deletedAt && detail.part.compatibleAssets.includes(a.code))
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {detail.part.isCritical && <Badge tone="danger" size="sm">Critical spare</Badge>}
                <Badge tone="neutral" size="sm" dot={false}>{detail.part.category}</Badge>
                {detail.stockoutRisk === 'URGENT' ? <Badge tone="danger" size="sm">Urgent</Badge> : detail.belowMin ? <Badge tone="warning" size="sm">Below minimum</Badge> : <Badge tone="success" size="sm">Stocked</Badge>}
              </div>

              <DetailBlock title="Stock">
                <DataGrid columns={4} items={[
                  { label: 'On hand', value: `${detail.part.onHand} ${detail.part.uom}` },
                  { label: 'Reserved', value: `${detail.part.reserved} ${detail.part.uom}` },
                  { label: 'Available', value: `${detail.available} ${detail.part.uom}` },
                  { label: 'Value on hand', value: inr(detail.part.onHand * detail.part.rate) },
                  { label: 'Minimum', value: String(detail.part.minStock) },
                  { label: 'Maximum', value: String(detail.part.maxStock) },
                  { label: 'Reorder quantity', value: String(detail.part.reorderQty) },
                  { label: 'Days of cover', value: detail.daysOfCover === null ? 'No usage recorded' : `${detail.daysOfCover} days` },
                ]} />
                {detail.suggestedOrder > 0 && (
                  <Alert tone={detail.stockoutRisk === 'URGENT' ? 'danger' : 'warning'} className="mt-2" title={`Order ${detail.suggestedOrder} ${detail.part.uom}`}>
                    Available is {detail.available} against a minimum of {detail.part.minStock}. Ordering {detail.suggestedOrder} brings it to the maximum of {detail.part.maxStock} —
                    ordering only to the minimum would leave it back at the reorder point the day it arrived.
                    {detail.daysOfCover !== null && detail.daysOfCover < detail.part.leadTimeDays && (
                      <> At the present usage there are {detail.daysOfCover} days of cover against a {detail.part.leadTimeDays}-day lead time, so this will run out before a replacement lands.</>
                    )}
                  </Alert>
                )}
                {detail.part.reserved > 0 && (
                  <div className="mt-2 flex items-center gap-2 rounded border border-warning/40 bg-warning/5 p-2.5">
                    <span className="flex-1 text-2xs text-fg-muted">{detail.part.reserved} {detail.part.uom} is committed to open jobs and is not available for anything else.</span>
                    <Button variant="ghost" size="sm" onClick={() => releaseReservation(detail.part, detail.part.reserved)}>Release all</Button>
                  </div>
                )}
              </DetailBlock>

              <DetailBlock title="Supply">
                <DataGrid columns={3} items={[
                  { label: 'Preferred vendor', value: detail.part.preferredVendor || '—' },
                  { label: 'Lead time', value: `${detail.part.leadTimeDays} days` },
                  { label: 'Rate', value: inr(detail.part.rate) },
                  { label: 'Unit', value: detail.part.uom },
                  { label: 'Bin', value: detail.part.binLocation || '—', mono: !!detail.part.binLocation },
                  { label: 'Critical', value: detail.part.isCritical ? 'Yes — the machine waits for it' : 'No' },
                ]} />
              </DetailBlock>

              <DetailBlock title={`Fits (${fits.length || 'any asset'})`}>
                {fits.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">Not restricted to particular assets.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {fits.map((a) => (<Badge key={a.uid} tone="neutral" size="sm" dot={false}>{a.code} · {a.name}</Badge>))}
                  </div>
                )}
              </DetailBlock>

              <DetailBlock title={`Movements (${history.length})`}>
                {history.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">Nothing has moved.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded border border-border">
                    <table className="grid-table">
                      <thead><tr><th style={{ width: '10rem' }}>When</th><th style={{ width: '8rem' }}>Type</th><th className="text-right" style={{ width: '6rem' }}>Qty</th><th>Against</th></tr></thead>
                      <tbody>
                        {history.map((t) => (
                          <tr key={t.uid}>
                            <td className="text-2xs tabular text-fg-muted">{formatDateTime(t.txnAt)}</td>
                            <td><Badge tone={t.txnType === 'ISSUE' || t.txnType === 'SCRAP' ? 'danger' : t.txnType === 'RECEIPT' || t.txnType === 'RETURN' ? 'success' : 'warning'} size="sm" dot={false}>{t.txnType.toLowerCase()}</Badge></td>
                            <td className="text-right text-xs tabular text-fg">{t.qty}</td>
                            <td><p className="truncate text-2xs text-fg-muted">{t.workOrderNo || t.remarks || '—'}</p></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DetailBlock>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail.part, compatibleAssets: [...detail.part.compatibleAssets] }); setOpenUid(null) }}>Edit</Button>
                <Button variant="outline" size="sm" onClick={() => { setAdjusting({ part: detail.part, kind: 'RECEIPT' }); setAdjustQty(String(detail.suggestedOrder || 1)) }}>Receive</Button>
                <Button variant="outline" size="sm" onClick={() => { setAdjusting({ part: detail.part, kind: 'ISSUE' }); setAdjustQty('1') }}>Issue</Button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── adjust ───────────────────────────────────────────── */}
      <Modal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        title={adjusting ? `${adjusting.kind.charAt(0)}${adjusting.kind.slice(1).toLowerCase()} — ${adjusting.part.itemName}` : ''}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setAdjusting(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={applyAdjustment}>Record it</Button></>}
      >
        {adjusting && (() => {
          const qty = Number(adjustQty) || 0
          const p = adjusting.part
          const after = adjusting.kind === 'RECEIPT' || adjusting.kind === 'RETURN' ? p.onHand + qty
            : adjusting.kind === 'RESERVE' ? p.onHand : p.onHand - qty
          const reservedAfter = adjusting.kind === 'RESERVE' ? p.reserved + qty : p.reserved
          return (
            <div className="space-y-3">
              <Input label={`Quantity (${p.uom})`} type="number" required value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} autoFocus />
              <Textarea label="Notes" rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
              <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                <p className="flex justify-between py-0.5"><span className="text-fg-muted">On hand now</span><span className="tabular text-fg">{p.onHand} {p.uom}</span></p>
                <p className="flex justify-between py-0.5"><span className="text-fg-muted">Reserved now</span><span className="tabular text-fg">{p.reserved} {p.uom}</span></p>
                <p className="flex justify-between border-t border-border py-0.5 pt-1"><span className="text-fg-muted">On hand after</span><span className={cn('font-medium tabular', after < 0 ? 'text-danger' : 'text-fg')}>{after} {p.uom}</span></p>
                <p className="flex justify-between py-0.5"><span className="text-fg-muted">Available after</span><span className={cn('font-medium tabular', after - reservedAfter < p.minStock ? 'text-warning' : 'text-fg')}>{after - reservedAfter} {p.uom}</span></p>
                <p className="flex justify-between py-0.5"><span className="text-fg-muted">Value moved</span><span className="tabular text-fg">{inr(qty * p.rate)}</span></p>
              </div>
              {after - reservedAfter < p.minStock && after >= 0 && (
                <Alert tone="warning" title="This takes it below the minimum">
                  Available would be {after - reservedAfter} against a minimum of {p.minStock}. A reorder of {Math.max(p.reorderQty, p.maxStock - (after - reservedAfter))} will be suggested.
                </Alert>
              )}
              {after < 0 && <Alert tone="danger" title="Not enough stock">Only {p.onHand} {p.uom} is on hand.</Alert>}
            </div>
          )
        })()}
      </Modal>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.itemCode}` : 'New spare part'}
        width="max-w-2xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Part code" required value={editing.itemCode ?? ''} onChange={(e) => setEditing({ ...editing, itemCode: e.target.value })} placeholder="SP-HYD-SEAL" />
              <Input label="Category" value={editing.category ?? ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            </div>
            <Input label="Name" required value={editing.itemName ?? ''} onChange={(e) => setEditing({ ...editing, itemName: e.target.value })} />
            <div className="grid grid-cols-4 gap-3">
              <Input label="Unit" value={editing.uom ?? ''} onChange={(e) => setEditing({ ...editing, uom: e.target.value })} />
              <Input label="On hand" type="number" value={String(editing.onHand ?? 0)} onChange={(e) => setEditing({ ...editing, onHand: Number(e.target.value) })} />
              <Input label="Reserved" type="number" value={String(editing.reserved ?? 0)} onChange={(e) => setEditing({ ...editing, reserved: Number(e.target.value) })} />
              <Input label="Rate" type="number" value={String(editing.rate ?? 0)} onChange={(e) => setEditing({ ...editing, rate: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Input label="Minimum" type="number" value={String(editing.minStock ?? 0)} onChange={(e) => setEditing({ ...editing, minStock: Number(e.target.value) })} hint="Reorder point" />
              <Input label="Maximum" type="number" value={String(editing.maxStock ?? 0)} onChange={(e) => setEditing({ ...editing, maxStock: Number(e.target.value) })} hint="Order up to here" />
              <Input label="Reorder quantity" type="number" value={String(editing.reorderQty ?? 0)} onChange={(e) => setEditing({ ...editing, reorderQty: Number(e.target.value) })} />
              <Input label="Lead time (days)" type="number" value={String(editing.leadTimeDays ?? 0)} onChange={(e) => setEditing({ ...editing, leadTimeDays: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Preferred vendor" value={editing.preferredVendor ?? ''} onChange={(e) => setEditing({ ...editing, preferredVendor: e.target.value })} />
              <Input label="Bin location" value={editing.binLocation ?? ''} onChange={(e) => setEditing({ ...editing, binLocation: e.target.value })} />
            </div>
            <Switch label="Critical spare — the machine waits for delivery" checked={!!editing.isCritical} onChange={(v) => setEditing({ ...editing, isCritical: v })} />

            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="mb-2 text-3xs uppercase tracking-wider text-fg-subtle">Fits which assets</p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {m.assets.rows.filter((a) => !a.deletedAt && a.category !== 'IT').map((a) => {
                  const on = (editing.compatibleAssets ?? []).includes(a.code)
                  return (
                    <button
                      key={a.uid} type="button"
                      onClick={() => setEditing({ ...editing, compatibleAssets: on ? (editing.compatibleAssets ?? []).filter((x) => x !== a.code) : [...(editing.compatibleAssets ?? []), a.code] })}
                      className={cn('rounded border px-2 py-1 text-2xs transition-colors', on ? 'border-brand-400 bg-brand-500/10 text-brand-600' : 'border-border text-fg-muted hover:border-border-strong')}
                    >{a.code}</button>
                  )
                })}
              </div>
              <p className="mt-2 text-3xs text-fg-subtle">Leave everything unselected if the part fits anything. This is what makes the right spare findable from a work order.</p>
            </div>

            {(() => {
              const b = blockers(editing, editing.uid)
              return b.length ? <Alert tone="danger" title="Cannot save yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert> : null
            })()}
          </div>
        )}
      </Drawer>
    </div>
  )
}
