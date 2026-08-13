import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Scale, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { DetailBlock, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { api } from '@/lib/api'
import {
  GST_PCT,
  invitedVendorsAwaitingQuote,
  landedRate,
  nextDocNo,
  quotableRfqs,
  quotationTotals,
} from '@/lib/procFlow'
import type { QuotationLine, Rfq, SupplierQuotation } from '@/types/procurement'

/**
 * Vendor quotations — stage 3 of the chain.
 *
 * A quotation can only exist against an RFQ, and only from a vendor that RFQ was
 * actually sent to. The item lines come from the RFQ, so the vendor is priced
 * against the same scope as everyone else and the comparison that follows is
 * between comparable things.
 */

interface LineEntry {
  itemCode: string
  itemName: string
  uom: string
  qty: number
  rate: string
  discountPct: string
  freight: string
  leadTimeDays: string
}

export function QuotationsPage() {
  const toast = useToast()
  const [rows, setRows] = useState<SupplierQuotation[]>([])
  const [rfqs, setRfqs] = useState<Rfq[]>([])

  useEffect(() => {
    async function loadData() {
      try {
        const [qData, rData] = await Promise.all([
          api.getQuotations(),
          api.getRfqs(),
        ])
        setRows(qData)
        setRfqs(rData)
      } catch (err) {
        toast.error('Error', 'Failed to load data')
      }
    }
    loadData()
  }, [])

  const create = async (data: any) => {
    await api.createQuotation(data)
    setRows(await api.getQuotations())
  }
  const update = async (uid: string, data: any) => {
    const existing = rows.find(r => r.uid.toString() === uid.toString())
    if (!existing) return
    await api.updateQuotation(uid, { ...existing, ...data })
    setRows(await api.getQuotations())
  }
  const remove = async (uid: string) => {
    await api.deleteQuotation(uid)
    setRows(await api.getQuotations())
  }
  const updateRfq = async (uid: string, data: any) => {
    const existing = rfqs.find(r => r.uid.toString() === uid.toString())
    if (!existing) return
    await api.updateRfq(uid, { ...existing, ...data })
    setRfqs(await api.getRfqs())
  }

  const rowEdit = useRowEdit<SupplierQuotation>({
    key: 'proc:sq',
    seed: [],
    entity: 'Quotation',
    titleOf: (r) => r.docNo,
  })

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<SupplierQuotation | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<SupplierQuotation | null>(null)

  // Entry form ------------------------------------------------------------
  const [rfqNo, setRfqNo] = useState('')
  const [vendorUid, setVendorUid] = useState('')
  const [validTill, setValidTill] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('30 days from invoice')
  const [warrantyMonths, setWarrantyMonths] = useState('12')
  const [lines, setLines] = useState<LineEntry[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const openRfqs = quotableRfqs(rfqs)
  const selectedRfq = rfqs.find((r) => r.docNo === rfqNo)
  const availableVendors = selectedRfq ? invitedVendorsAwaitingQuote(selectedRfq, rows) : []

  const counts = {
    all: rows.length,
    received: rows.filter((r) => r.status === 'RECEIVED' || r.status === 'UNDER_REVIEW').length,
    awarded: rows.filter((r) => r.status === 'AWARDED').length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'received') return r.status === 'RECEIVED' || r.status === 'UNDER_REVIEW'
    if (tab === 'awarded') return r.status === 'AWARDED'
    return true
  })

  /** RFQs that now have enough quotations to compare. */
  const readyToCompare = rfqs.filter((r) => rows.filter((q) => q.rfqNo === r.docNo).length >= 2 && r.status !== 'COMPLETED')

  function openForm() {
    const first = openRfqs[0]
    setRfqNo(first?.docNo ?? '')
    setVendorUid('')
    setValidTill('')
    setPaymentTerms('30 days from invoice')
    setWarrantyMonths('12')
    setLines(first ? linesFor(first) : [])
    setErrors({})
    setFormOpen(true)
  }

  function linesFor(rfq: Rfq): LineEntry[] {
    return rfq.lines.map((l) => ({
      itemCode: l.itemCode,
      itemName: l.itemName,
      uom: l.uom,
      qty: l.qty,
      rate: '',
      discountPct: '0',
      freight: '0',
      leadTimeDays: '14',
    }))
  }

  function onRfqChange(no: string) {
    setRfqNo(no)
    setVendorUid('')
    const r = rfqs.find((x) => x.docNo === no)
    setLines(r ? linesFor(r) : [])
  }

  function setLine(i: number, patch: Partial<LineEntry>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  const preview = useMemo(() => {
    const built: QuotationLine[] = lines.map((l, i) => {
      const rate = Number(l.rate) || 0
      const discountPct = Number(l.discountPct) || 0
      const freight = Number(l.freight) || 0
      return {
        uid: `ql-${i}`,
        itemCode: l.itemCode,
        itemName: l.itemName,
        uom: l.uom,
        qty: l.qty,
        rate,
        discountPct,
        taxPct: GST_PCT,
        freight,
        landedRate: landedRate(rate, discountPct, GST_PCT, l.qty ? freight / l.qty : 0),
        leadTimeDays: Number(l.leadTimeDays) || 0,
        moq: 0,
      }
    })
    return { built, totals: quotationTotals(built) }
  }, [lines])

  function save() {
    const e: Record<string, string> = {}
    if (!rfqNo) e.rfqNo = 'Select the RFQ this quotation answers.'
    if (!vendorUid) e.vendorUid = 'Select the vendor. Only vendors this RFQ was sent to can quote.'
    if (!validTill) e.validTill = 'A quotation without a validity date cannot be awarded.'
    if (!lines.length) e.lines = 'The selected RFQ has no lines.'
    if (lines.some((l) => !l.rate || Number(l.rate) <= 0)) e.lines = 'Enter a positive rate for every item.'
    setErrors(e)
    if (Object.keys(e).length) return

    const vendor = availableVendors.find((v) => v.supplierUid === vendorUid)
    if (!vendor || !selectedRfq) return

    const { totals, built } = preview
    const docNo = nextDocNo('SQ', rows, 5)
    const leadTimeDays = Math.max(...built.map((l) => l.leadTimeDays), 0)

    create({
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      rfqNo,
      supplierUid: vendor.supplierUid,
      supplierName: vendor.supplierName,
      status: 'RECEIVED',
      currency: selectedRfq.currency || 'INR',
      exchangeRate: 1,
      validTill,
      paymentTerms,
      deliveryTerms: 'Free delivery',
      warrantyMonths: Number(warrantyMonths) || 0,
      basicValue: totals.basicValue,
      taxValue: totals.taxValue,
      freightValue: totals.freightValue,
      landedValue: totals.landedValue,
      leadTimeDays,
      technicalScore: 0,
      commercialScore: 0,
      totalScore: 0,
      rank: 0,
      lines: built,
      attachments: 0,
      negotiationRounds: 0,
    } as SupplierQuotation)

    // Mark the vendor as having responded on the RFQ.
    updateRfq(selectedRfq.uid, {
      suppliers: selectedRfq.suppliers.map((s) =>
        s.supplierUid === vendor.supplierUid
          ? { ...s, responseStatus: 'QUOTED' as const, respondedAt: new Date().toISOString() }
          : s,
      ),
    })

    const nowQuoted = rows.filter((q) => q.rfqNo === rfqNo).length + 1
    toast.success(
      'Quotation recorded',
      nowQuoted >= 2
        ? `${docNo} from ${vendor.supplierName}. ${nowQuoted} quotations on ${rfqNo} — ready for comparison.`
        : `${docNo} from ${vendor.supplierName}. One more quotation is needed before ${rfqNo} can be compared.`,
    )
    setFormOpen(false)
  }

  const columns: Column<SupplierQuotation>[] = [
    { key: 'docNo', header: 'Quotation', sortable: true, width: '10rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (r) => r.docDate, render: (r) => formatDate(r.docDate) },
    { key: 'rfqNo', header: 'Against RFQ', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-2xs">{r.rfqNo}</span> },
    { key: 'supplierName', header: 'Vendor', sortable: true },
    { key: 'lines', header: 'Items', align: 'center', width: '5rem', accessor: (r) => r.lines.length, render: (r) => r.lines.length },
    { key: 'basicValue', header: 'Basic', align: 'right', sortable: true, defaultHidden: true, accessor: (r) => r.basicValue, render: (r) => formatCurrency(r.basicValue) },
    { key: 'landedValue', header: 'Landed value', align: 'right', sortable: true, accessor: (r) => r.landedValue, render: (r) => <span className="font-medium">{formatCurrency(r.landedValue)}</span> },
    { key: 'leadTimeDays', header: 'Lead time', align: 'right', sortable: true, width: '7rem', accessor: (r) => r.leadTimeDays, render: (r) => `${r.leadTimeDays} d` },
    { key: 'validTill', header: 'Valid till', sortable: true, width: '8rem', accessor: (r) => r.validTill, render: (r) => formatDate(r.validTill) },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Vendor quotations"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Vendor quotations' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} disabled={!openRfqs.length} onClick={openForm}>
            New quotation
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'received', label: 'Received', count: counts.received },
              { id: 'awarded', label: 'Awarded', count: counts.awarded },
            ]}
          />
        }
      />

      {!openRfqs.length && (
        <Alert tone="warning" title="No RFQ is open for quotations" className="mb-4">
          A quotation can only be entered against an issued RFQ. Raise one from an approved requisition on the{' '}
          <Link to="/procurement/rfq" className="underline">Request for Quotation</Link> screen first.
        </Alert>
      )}

      {readyToCompare.length > 0 && (
        <Alert
          tone="tip"
          title={`${readyToCompare.length} RFQ${readyToCompare.length > 1 ? 's have' : ' has'} enough quotations to compare`}
          className="mb-4"
          action={<Link to="/procurement/comparison"><Button size="sm" variant="outline">Open comparison</Button></Link>}
        >
          {readyToCompare.map((r) => r.docNo).join(', ')}
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search quotation, RFQ, vendor…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'vendor-quotations', 'Vendor quotations', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        emptyTitle="No quotations yet"
        emptyDescription="Enter what each invited vendor quoted against an open RFQ."
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem
              label="Mark under review"
              disabled={r.status !== 'RECEIVED'}
              onClick={() => { update(r.uid, { status: 'UNDER_REVIEW' }); toast.success('Updated', `${r.docNo} is under review.`) }}
            />
            <MenuItem label="Delete" icon={<Trash2 />} danger separatorBefore disabled={r.status === 'AWARDED'} onClick={() => setConfirmDelete(r)} />
          </>
        )}
      />

      {/* ═════════════════ Detail ═════════════════ */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.docNo} description={detail ? `${detail.supplierName} · against ${detail.rfqNo}` : undefined} width="max-w-3xl">
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={detail.status} />
              {detail.rank > 0 && <Badge tone={detail.rank === 1 ? 'success' : 'neutral'} size="sm" dot={false}>Rank {detail.rank}</Badge>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Against RFQ', value: detail.rfqNo, mono: true },
                { label: 'Vendor', value: detail.supplierName },
                { label: 'Quotation date', value: formatDate(detail.docDate) },
                { label: 'Valid till', value: formatDate(detail.validTill) },
                { label: 'Payment terms', value: detail.paymentTerms },
                { label: 'Delivery terms', value: detail.deliveryTerms },
                { label: 'Lead time', value: `${detail.leadTimeDays} days` },
                { label: 'Warranty', value: `${detail.warrantyMonths} months` },
              ]}
            />

            <DetailBlock title={`Items (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Disc</th>
                      <th className="text-right">Freight</th>
                      <th className="text-right">Landed / unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular">{l.qty.toLocaleString('en-IN')} {l.uom}</td>
                        <td className="text-right tabular">{l.rate.toFixed(2)}</td>
                        <td className="text-right tabular">{l.discountPct}%</td>
                        <td className="text-right tabular">{formatCurrency(l.freight)}</td>
                        <td className="text-right tabular font-medium">{l.landedRate.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DataGrid
              columns={2}
              items={[
                { label: 'Basic value', value: formatCurrency(detail.basicValue) },
                { label: 'Freight', value: formatCurrency(detail.freightValue) },
                { label: `Tax (${GST_PCT}%)`, value: formatCurrency(detail.taxValue) },
                { label: 'Landed value', value: formatCurrency(detail.landedValue) },
              ]}
            />
          </div>
        )}
      </Drawer>

      {/* ═════════════════ Entry ═════════════════ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New vendor quotation"
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Record quotation</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Select
              label="Against RFQ"
              required
              value={rfqNo}
              error={errors.rfqNo}
              onChange={(e) => onRfqChange(e.target.value)}
              options={openRfqs.map((r) => ({ value: r.docNo, label: `${r.docNo} — ${r.title}` }))}
            />
            <Select
              label="Vendor"
              required
              value={vendorUid}
              error={errors.vendorUid}
              onChange={(e) => setVendorUid(e.target.value)}
              hint={selectedRfq ? `${availableVendors.length} of ${selectedRfq.suppliers.length} invited vendors yet to quote` : undefined}
              options={[
                { value: '', label: availableVendors.length ? 'Select a vendor…' : 'All invited vendors have quoted' },
                ...availableVendors.map((v) => ({ value: v.supplierUid, label: v.supplierName })),
              ]}
            />
            <Input label="Valid till" type="date" required value={validTill} error={errors.validTill} onChange={(e) => setValidTill(e.target.value)} />
            <Input label="Payment terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            <Input label="Warranty (months)" type="number" value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} />
          </div>

          {selectedRfq && (
            <p className="text-2xs text-fg-subtle">
              Items are fixed by {selectedRfq.docNo} so every vendor is priced against the same scope. Enter what this
              vendor quoted for each line.
            </p>
          )}

          {errors.lines && <Alert tone="danger">{errors.lines}</Alert>}

          <div className="overflow-x-auto rounded border border-border">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right" style={{ width: '7rem' }}>Rate *</th>
                  <th className="text-right" style={{ width: '6rem' }}>Disc %</th>
                  <th className="text-right" style={{ width: '7rem' }}>Freight</th>
                  <th className="text-right" style={{ width: '6rem' }}>Lead d</th>
                  <th className="text-right">Landed</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const built = preview.built[i]
                  return (
                    <tr key={l.itemCode + i}>
                      <td>
                        <p className="text-xs font-medium text-fg">{l.itemName}</p>
                        <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                      </td>
                      <td className="text-right tabular">{l.qty.toLocaleString('en-IN')} {l.uom}</td>
                      <td><CellInput value={l.rate} onChange={(v) => setLine(i, { rate: v })} placeholder="0.00" /></td>
                      <td><CellInput value={l.discountPct} onChange={(v) => setLine(i, { discountPct: v })} /></td>
                      <td><CellInput value={l.freight} onChange={(v) => setLine(i, { freight: v })} /></td>
                      <td><CellInput value={l.leadTimeDays} onChange={(v) => setLine(i, { leadTimeDays: v })} /></td>
                      <td className="text-right tabular font-medium">{built ? formatCurrency(built.landedRate * l.qty) : '—'}</td>
                    </tr>
                  )
                })}
                {!lines.length && <tr><td colSpan={7} className="text-center text-2xs text-fg-subtle">Select an RFQ to load its items.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-xs">
              <Row label="Basic" value={preview.totals.basicValue} />
              <Row label="Freight" value={preview.totals.freightValue} />
              <Row label={`Tax ${GST_PCT}%`} value={preview.totals.taxValue} />
              <div className="border-t border-border pt-1">
                <Row label="Landed value" value={preview.totals.landedValue} strong />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete quotation"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  const rfq = rfqs.find((r) => r.docNo === confirmDelete.rfqNo)
                  if (rfq) {
                    updateRfq(rfq.uid, {
                      suppliers: rfq.suppliers.map((s) =>
                        s.supplierUid === confirmDelete.supplierUid ? { ...s, responseStatus: 'INVITED' as const, respondedAt: undefined } : s,
                      ),
                    })
                  }
                  toast.success('Deleted', `${confirmDelete.docNo} soft-deleted; the vendor may quote again.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.docNo} will be marked deleted and {confirmDelete?.supplierName} returns to the invited list on{' '}
          {confirmDelete?.rfqNo}.
        </p>
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}

function CellInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
    />
  )
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-fg-muted">{label}</span>
      <span className={strong ? 'text-sm font-semibold tabular text-fg' : 'tabular text-fg'}>{formatCurrency(value)}</span>
    </div>
  )
}
