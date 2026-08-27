import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { DetailBlock, InvStatusBadge, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { batches as seedBatches } from '@/mock/inventory'
import type { Batch } from '@/types/inventory'

const daysTo = (date: string | null) => (date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000) : null)

/** Batch & lot tracking — the identity that travels with the material. */
export function BatchesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedBatches, [])
  const { rows: batches, update } = useCollection<Batch>('inv:batch', seed)
  const rowEdit = useRowEdit<Batch>({
    key: 'inv:batch',
    seed: seed,
    entity: 'Batch',
    titleOf: (r) => r.batchNo,
  })

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<Batch | null>(null)
  const [detailTab, setDetailTab] = useState('genealogy')
  const [blockTarget, setBlockTarget] = useState<Batch | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [expiryTarget, setExpiryTarget] = useState<Batch | null>(null)
  const [expiryForm, setExpiryForm] = useState({ newDate: '', retestRef: '', reason: '' })

  const expiring = batches.filter((b) => {
    const d = daysTo(b.expiresOn)
    return d !== null && d <= 30 && b.status !== 'CONSUMED'
  })

  const stats = {
    active: batches.filter((b) => b.status === 'ACTIVE').length,
    quarantine: batches.filter((b) => b.status === 'QUARANTINE').length,
    blocked: batches.filter((b) => b.status === 'BLOCKED' || b.status === 'RECALLED').length,
    missingMtc: batches.filter((b) => b.steelGrade && !b.mtcVerified).length,
  }

  const filtered = batches.filter((b) => {
    if (tab === 'active') return b.status === 'ACTIVE'
    if (tab === 'quarantine') return b.status === 'QUARANTINE'
    if (tab === 'blocked') return b.status === 'BLOCKED' || b.status === 'RECALLED' || b.status === 'EXPIRED'
    if (tab === 'expiring') return expiring.includes(b)
    return true
  })

  const columns: Column<Batch>[] = [
    { key: 'batchNo', header: 'Batch', sortable: true, width: '11rem', render: (b) => <span className="font-mono text-xs font-medium text-brand-600">{b.batchNo}</span> },
    { key: 'itemCode', header: 'Item', sortable: true, render: (b) => <ItemCell code={b.itemCode} name={b.itemName} /> },
    { key: 'supplierBatchNo', header: 'Supplier lot / heat', sortable: true, width: '11rem', render: (b) => <span className="font-mono text-2xs">{b.supplierBatchNo ?? '—'}</span> },
    { key: 'supplier', header: 'Supplier', sortable: true, defaultHidden: true, render: (b) => b.supplier ?? 'Made in-house' },
    { key: 'receivedOn', header: 'Received', sortable: true, width: '8rem', accessor: (b) => b.receivedOn, render: (b) => formatDate(b.receivedOn) },
    { key: 'quantityRemaining', header: 'Remaining', align: 'right', sortable: true, render: (b) => <QtyCell qty={b.quantityRemaining} uom={b.uom} /> },
    { key: 'quantityReceived', header: 'Received qty', align: 'right', defaultHidden: true, render: (b) => <QtyCell qty={b.quantityReceived} tone="muted" /> },
    { key: 'expiresOn', header: 'Expiry', width: '10rem', accessor: (b) => b.expiresOn ?? '', render: (b) => {
      const d = daysTo(b.expiresOn)
      if (d === null) return <span className="text-2xs text-fg-subtle">no shelf life</span>
      return (
        <span className={cn('tabular text-2xs', d <= 0 ? 'text-danger' : d <= 30 ? 'text-warning' : 'text-fg-muted')}>
          {formatDate(b.expiresOn)}{d <= 0 ? ' · expired' : d <= 60 ? ` · ${d} d` : ''}
        </span>
      )
    } },
    { key: 'mtcVerified', header: 'Certificate', align: 'center', width: '8rem', accessor: (b) => (b.mtcVerified ? 'Verified' : b.mtcNo ? 'Unverified' : '—'), render: (b) => (
      b.mtcNo ? <Badge tone={b.mtcVerified ? 'success' : 'warning'} size="sm" dot={false}>{b.mtcVerified ? 'Verified' : 'Unverified'}</Badge> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    ...(canSeeValue ? [{ key: 'value', header: 'Value', align: 'right' as const, sortable: true, accessor: (b: Batch) => b.quantityRemaining * b.rate, render: (b: Batch) => formatCurrency(b.quantityRemaining * b.rate) }] : []),
    { key: 'qcStatus', header: 'QC', sortable: true, width: '9rem', render: (b) => <InvStatusBadge status={b.qcStatus} size="sm" /> },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (b) => <InvStatusBadge status={b.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'batch-register', 'Batch & lot register', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function extendExpiry() {
    if (!expiryTarget) return
    if (!expiryForm.newDate || (expiryTarget.expiresOn && new Date(expiryForm.newDate) <= new Date(expiryTarget.expiresOn))) {
      toast.error('Date must move forward', 'An expiry can only be extended, never pulled back.')
      return
    }
    if (!expiryForm.retestRef.trim()) {
      toast.error('Re-test reference required', 'An expiry only moves on the strength of a QC re-test.')
      return
    }
    update(expiryTarget.uid, {
      expiresOn: expiryForm.newDate,
      status: expiryTarget.status === 'EXPIRED' ? 'ACTIVE' : expiryTarget.status,
      blockReason: `Expiry extended to ${formatDate(expiryForm.newDate)} on re-test ${expiryForm.retestRef.trim()}${expiryForm.reason ? ` — ${expiryForm.reason.trim()}` : ''}`,
    })
    toast.success('Expiry extended', `${expiryTarget.batchNo} now expires ${formatDate(expiryForm.newDate)}. The original date, the re-test reference and your name stay in the audit trail.`)
    setExpiryTarget(null)
    setExpiryForm({ newDate: '', retestRef: '', reason: '' })
  }

  return (
    <div>
      <PageHeader
        title="Batch & lot tracking"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Batches' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/serials')}>Serial numbers</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/traceability')}>Trace</Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: batches.length },
              { id: 'active', label: 'Active', count: stats.active },
              { id: 'quarantine', label: 'In quarantine', count: stats.quarantine },
              { id: 'expiring', label: 'Expiring', count: expiring.length },
              { id: 'blocked', label: 'Blocked & expired', count: stats.blocked + batches.filter((b) => b.status === 'EXPIRED').length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        A batch is the identity that travels with the material — one coil, one heat, one supplier lot. Blocking a batch blocks it
        in every warehouse at once.{' '}
        <span className={cn('font-medium', stats.blocked ? 'text-danger' : 'text-success')}>{stats.blocked}</span> blocked or
        recalled · <span className={cn('font-medium', expiring.length ? 'text-warning' : 'text-success')}>{expiring.length}</span>{' '}
        expiring within 30 days ·{' '}
        <span className={cn('font-medium', stats.missingMtc ? 'text-warning' : 'text-success')}>{stats.missingMtc}</span> steel
        batch{stats.missingMtc === 1 ? '' : 'es'} without a verified certificate.
      </p>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(b) => b.uid}
        searchPlaceholder="Search batch, item, heat number or supplier…"
        onExport={doExport}
        onRowClick={(b) => { setDetail(b); setDetailTab('genealogy') }}
        emptyTitle="No batches"
        emptyDescription="Batches are created automatically when batch-tracked material is received."
        rowActions={(b) => (
          <>
            {rowEdit.actions(b)}
            <MenuItem label="Open batch" onClick={() => { setDetail(b); setDetailTab('genealogy') }} />
            <MenuItem label="Trace this batch" onClick={() => navigate('/inventory/traceability')} />
            <MenuItem
              label={b.status === 'BLOCKED' ? 'Unblock batch' : 'Block batch everywhere'}
              danger={b.status !== 'BLOCKED'}
              separatorBefore
              onClick={() => {
                if (b.status === 'BLOCKED') {
                  update(b.uid, { status: 'ACTIVE', blockReason: undefined })
                  toast.success('Unblocked', `${b.batchNo} is available again in every warehouse.`)
                } else {
                  setBlockTarget(b)
                  setBlockReason('')
                }
              }}
            />
            <MenuItem
              label="Extend expiry (needs a re-test)"
              disabled={!b.expiresOn}
              onClick={() => {
                setExpiryTarget(b)
                setExpiryForm({ newDate: '', retestRef: '', reason: '' })
              }}
            />
          </>
        )}
        rowClassName={(b) => cn(b.status === 'BLOCKED' && 'bg-danger/[0.04]', b.status === 'EXPIRED' && 'bg-warning/[0.04]')}
      />

      {/* Batch detail --------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.batchNo}
        description={detail ? `${detail.itemName} · ${detail.supplier ?? 'made in-house'}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/inventory/traceability')}>Full trace</Button>
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InvStatusBadge status={detail.status} />
              <InvStatusBadge status={detail.qcStatus} size="sm" />
              {detail.mtcNo && (
                <Badge tone={detail.mtcVerified ? 'success' : 'warning'} size="sm" dot={false}>
                  MTC {detail.mtcNo} {detail.mtcVerified ? 'verified' : 'unverified'}
                </Badge>
              )}
              {detail.blockReason && <span className="text-2xs text-danger">{detail.blockReason}</span>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Supplier lot / heat', value: detail.supplierBatchNo ?? '—', mono: true },
                { label: 'Source document', value: detail.sourceDocNo, mono: true },
                { label: 'Received', value: formatDate(detail.receivedOn) },
                { label: 'Manufactured', value: detail.manufacturedOn ? formatDate(detail.manufacturedOn) : '—' },
                { label: 'Expiry', value: detail.expiresOn ? formatDate(detail.expiresOn) : 'No shelf life' },
                { label: 'Received quantity', value: `${formatQty(detail.quantityReceived)} ${detail.uom}` },
                { label: 'Remaining', value: `${formatQty(detail.quantityRemaining)} ${detail.uom}` },
                { label: 'Inspection', value: detail.qcInspectionNo ?? '—', mono: true },
                ...(detail.steelGrade
                  ? [
                      { label: 'Grade / thickness / width', value: `${detail.steelGrade} · ${detail.thicknessMm} mm · ${detail.widthMm} mm` },
                      { label: 'Coil weight', value: `${formatQty(detail.coilWeightKg ?? 0)} kg` },
                    ]
                  : []),
                ...(canSeeValue ? [{ label: 'Rate', value: formatCurrency(detail.rate) }] : []),
              ]}
            />

            <Tabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'genealogy', label: 'Made from / went into', count: detail.parents.length + detail.children.length },
                { id: 'locations', label: 'Where it is', count: detail.locations.length },
              ]}
            />

            {detailTab === 'genealogy' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailBlock title={`Made from (${detail.parents.length})`}>
                  {detail.parents.length === 0 ? (
                    <p className="text-xs text-fg-subtle">Purchased batch — the chain starts here.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.parents.map((p) => (
                        <div key={`${p.batchNo}-${p.docNo}`} className="rounded border border-border p-2.5">
                          <p className="font-mono text-2xs text-brand-600">{p.batchNo}</p>
                          <p className="truncate text-xs text-fg">{p.itemName}</p>
                          <p className="text-2xs text-fg-subtle">{formatQty(p.quantity)} via {p.docNo}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </DetailBlock>
                <DetailBlock title={`Went into (${detail.children.length})`}>
                  {detail.children.length === 0 ? (
                    <p className="text-xs text-fg-subtle">Nothing has been made from this batch yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.children.map((c) => (
                        <div key={`${c.batchNo}-${c.docNo}`} className="rounded border border-border p-2.5">
                          <p className="font-mono text-2xs text-brand-600">{c.batchNo}</p>
                          <p className="truncate text-xs text-fg">{c.itemName}</p>
                          <p className="text-2xs text-fg-subtle">{formatQty(c.quantity)} via {c.docNo}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </DetailBlock>
              </div>
            )}

            {detailTab === 'locations' && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Warehouse</th>
                      <th>Bin</th>
                      <th className="text-right">Quantity</th>
                      <th>Stock status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.locations.map((l, i) => (
                      <tr key={i}>
                        <td className="font-mono text-2xs">{l.warehouseCode}</td>
                        <td className="font-mono text-2xs">{l.bin ?? '—'}</td>
                        <td className="text-right tabular">{formatQty(l.quantity)} {detail.uom}</td>
                        <td><InvStatusBadge status={l.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-2xs leading-relaxed text-fg-subtle">
              The test certificate is attached to the batch, not to the receipt document — so it survives a cancelled receipt and
              stays reachable from any bottle made from this heat.
            </p>
          </div>
        )}
      </Drawer>

      {/* Block ---------------------------------------------------------------- */}
      <Modal
        open={!!blockTarget}
        onClose={() => setBlockTarget(null)}
        title={blockTarget ? `Block ${blockTarget.batchNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setBlockTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!blockTarget) return
                if (!blockReason.trim()) {
                  toast.error('Reason required', 'A block without a reason is a mystery for the next shift.')
                  return
                }
                update(blockTarget.uid, { status: 'BLOCKED', blockReason: blockReason.trim() })
                toast.success('Blocked everywhere', `${blockTarget.batchNo} is unusable in every warehouse, and anyone holding a reservation against it has been notified.`)
                setBlockTarget(null)
              }}
            >
              Block in every warehouse
            </Button>
          </>
        }
      >
        {blockTarget && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              Blocking <span className="font-medium text-fg">{blockTarget.batchNo}</span> stops it being picked, issued,
              transferred or reserved — everywhere at once, in one transaction. It stays valued and counted.
            </p>
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="text-fg-muted">Currently held at</p>
              {blockTarget.locations.map((l, i) => (
                <p key={i} className="mt-1 font-mono text-2xs text-fg">
                  {l.warehouseCode}{l.bin ? ` · ${l.bin}` : ''} — {formatQty(l.quantity)} {blockTarget.uom}
                </p>
              ))}
            </div>
            <Textarea label="Reason (required)" rows={2} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="NCR reference, customer complaint, suspected contamination…" />
          </div>
        )}
      </Modal>

      {/* Extend expiry --------------------------------------------------------- */}
      <Modal
        open={!!expiryTarget}
        onClose={() => setExpiryTarget(null)}
        title={expiryTarget ? `Extend expiry — ${expiryTarget.batchNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setExpiryTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={extendExpiry}>Extend expiry</Button>
          </>
        }
      >
        {expiryTarget && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted">
              {expiryTarget.itemName} · currently expires{' '}
              <span className="font-medium text-fg">{expiryTarget.expiresOn ? formatDate(expiryTarget.expiresOn) : '—'}</span> with{' '}
              {formatQty(expiryTarget.quantityRemaining)} {expiryTarget.uom} remaining.
            </p>
            <Input label="New expiry date" type="date" value={expiryForm.newDate} onChange={(e) => setExpiryForm({ ...expiryForm, newDate: e.target.value })} />
            <Input label="QC re-test reference" required value={expiryForm.retestRef} placeholder="QC/26-27/00912" onChange={(e) => setExpiryForm({ ...expiryForm, retestRef: e.target.value })} />
            <Textarea label="Notes" rows={2} value={expiryForm.reason} onChange={(e) => setExpiryForm({ ...expiryForm, reason: e.target.value })} />
            <p className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-2xs text-warning">
              An expiry may only move forward, and only against a re-test. The original date is kept and the extension is
              reported to the Quality Head and Finance.
            </p>
          </div>
        )}
      </Modal>

      {expiring.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Expiring soon" description="FEFO picks these first — the earliest expiry always leaves first" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Item</th>
                    <th className="text-right">Remaining</th>
                    <th>Expires</th>
                    <th>Days</th>
                    {canSeeValue && <th className="text-right">Value at risk</th>}
                    <th>What to do</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((b) => {
                    const d = daysTo(b.expiresOn)!
                    return (
                      <tr key={b.uid}>
                        <td className="font-mono text-2xs text-brand-600">{b.batchNo}</td>
                        <td className="max-w-[16rem] truncate text-xs">{b.itemName}</td>
                        <td className="text-right tabular">{formatQty(b.quantityRemaining)} {b.uom}</td>
                        <td className="text-2xs">{formatDate(b.expiresOn)}</td>
                        <td><Badge tone={d <= 0 ? 'danger' : d <= 14 ? 'warning' : 'pending'} size="sm">{d <= 0 ? 'Expired' : `${d} d`}</Badge></td>
                        {canSeeValue && <td className="text-right tabular">{formatCurrency(b.quantityRemaining * b.rate)}</td>}
                        <td className="text-2xs text-fg-muted">{d <= 0 ? 'Write off or re-test' : 'Consume first (FEFO)'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {rowEdit.dialogs}
    </div>
  )
}
