import { useMemo, useState } from 'react'
import { Check, ClipboardCheck, PackageCheck, Plus, ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ApprovalTrail, DelayChip, DetailBlock, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { useEffect } from 'react'
import { useCollection, newUid } from '@/store/data'
import { grns as seedGrns, inspections as seedIqcs, purchaseOrders as seedOrders } from '@/mock/procurement'
import { plants as seedPlants, warehouses as seedWarehouses } from '@/mock/data'
import { receivableOrders } from '@/lib/procFlow'
import type { Grn, IncomingInspection, PurchaseOrder } from '@/types/procurement'
import { cn } from '@/lib/cn'

export function GrnPage() {
  const toast = useToast()
  const gSeed = useMemo(() => seedGrns, [])
  const { rows: grns, create: createGrn, update: updateGrn, remove: deleteGrn } = useCollection<Grn>('proc:grns', gSeed)

  const iSeed = useMemo(() => seedIqcs, [])
  const { rows: inspections, update: updateIqc } = useCollection<IncomingInspection>('proc:iqc', iSeed)

  const oSeed = useMemo(() => seedOrders, [])
  const { rows: orders } = useCollection<PurchaseOrder>('proc:po', oSeed)

  const warehouses = seedWarehouses
  const plants = seedPlants

  /** Only an approved order can be received against. */
  const receivable = receivableOrders(orders)

  const [view, setView] = useState<'receipts' | 'inspection'>('receipts')
  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<Grn | null>(null)
  const [detailTab, setDetailTab] = useState('lines')
  const [iqcDetail, setIqcDetail] = useState<IncomingInspection | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Grn | null>(null)
  const [form, setForm] = useState({
    poNo: '',
    supplierName: '',
    warehouse: 'RM Store — Chennai',
    invoiceNo: '',
    invoiceDate: '',
    invoiceValue: '',
    vehicleNo: '',
    receivedBy: '',
    plant: 'Chennai — Unit 1',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Grn | null>(null)

  const counts = {
    all: grns.length,
    pending: grns.filter((g) => g.status === 'PENDING_APPROVAL').length,
    qc: grns.filter((g) => g.qcStatus === 'PENDING' || g.qcStatus === 'IN_PROGRESS').length,
    rejected: grns.filter((g) => g.totalRejected > 0).length,
  }

  const filtered = grns.filter((g) => {
    if (tab === 'pending') return g.status === 'PENDING_APPROVAL'
    if (tab === 'qc') return g.qcStatus === 'PENDING' || g.qcStatus === 'IN_PROGRESS'
    if (tab === 'rejected') return g.totalRejected > 0
    return true
  })

  const columns: Column<Grn>[] = [
    { key: 'docNo', header: 'GRN', sortable: true, width: '11rem', render: (g) => <span className="font-mono text-xs font-medium text-brand-600">{g.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (g) => g.docDate, render: (g) => formatDate(g.docDate) },
    { key: 'poNo', header: 'PO', sortable: true, width: '11rem', render: (g) => <span className="font-mono text-2xs">{g.poNo}</span> },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'warehouse', header: 'Warehouse', sortable: true, defaultHidden: true },
    { key: 'invoiceNo', header: 'Invoice', render: (g) => <span className="font-mono text-2xs">{g.invoiceNo}</span> },
    { key: 'totalReceived', header: 'Received', align: 'right', sortable: true, render: (g) => g.totalReceived.toLocaleString('en-IN') },
    { key: 'totalAccepted', header: 'Accepted', align: 'right', render: (g) => g.totalAccepted.toLocaleString('en-IN') },
    { key: 'totalRejected', header: 'Rejected', align: 'right', sortable: true, render: (g) => <span className={cn(g.totalRejected > 0 && 'font-medium text-danger')}>{g.totalRejected.toLocaleString('en-IN')}</span> },
    { key: 'grnValue', header: 'Value', align: 'right', sortable: true, accessor: (g) => g.grnValue, render: (g) => formatCurrency(g.grnValue) },
    { key: 'delayDays', header: 'Timeliness', width: '7rem', accessor: (g) => g.delayDays, render: (g) => <DelayChip days={g.delayDays} /> },
    { key: 'qcStatus', header: 'QC', sortable: true, width: '9rem', render: (g) => <ProcStatusBadge status={g.qcStatus} size="sm" /> },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (g) => <ProcStatusBadge status={g.status} size="sm" /> },
  ]

  const iqcColumns: Column<IncomingInspection>[] = [
    { key: 'docNo', header: 'Inspection', sortable: true, width: '11rem', render: (i) => <span className="font-mono text-xs font-medium text-brand-600">{i.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (i) => i.docDate, render: (i) => formatDate(i.docDate) },
    { key: 'grnNo', header: 'GRN', width: '11rem', render: (i) => <span className="font-mono text-2xs">{i.grnNo}</span> },
    { key: 'itemName', header: 'Item', sortable: true, render: (i) => (
      <div>
        <p className="text-xs font-medium text-fg">{i.itemName}</p>
        <p className="font-mono text-2xs text-fg-subtle">{i.itemCode}{i.heatNo ? ` · heat ${i.heatNo}` : ''}</p>
      </div>
    ) },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'lotQty', header: 'Lot', align: 'right', render: (i) => i.lotQty.toLocaleString('en-IN') },
    { key: 'sampleSize', header: 'Sample', align: 'right', width: '5rem' },
    { key: 'aql', header: 'AQL', align: 'right', width: '4.5rem' },
    { key: 'defectsFound', header: 'Defects', align: 'right', width: '5.5rem', render: (i) => <span className={cn(i.defectsFound > 0 && 'text-danger')}>{i.defectsFound}</span> },
    { key: 'rejectedQty', header: 'Rejected', align: 'right', render: (i) => i.rejectedQty.toLocaleString('en-IN') },
    { key: 'mtcVerified', header: 'MTC', align: 'center', width: '5rem', accessor: (i) => (i.mtcVerified ? 'Verified' : i.mtcReceived ? 'Received' : 'None'), render: (i) => (
      <Badge tone={i.mtcVerified ? 'success' : i.mtcReceived ? 'warning' : 'neutral'} size="sm" dot={false}>
        {i.mtcVerified ? 'Verified' : i.mtcReceived ? 'Received' : '—'}
      </Badge>
    ) },
    { key: 'inspectedBy', header: 'Inspector', sortable: true, defaultHidden: true },
    { key: 'status', header: 'Result', sortable: true, width: '10rem', render: (i) => <ProcStatusBadge status={i.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        view === 'receipts'
          ? exportRows(format, 'goods-receipts', 'Goods receipt notes', columnsFromTable(columns), filtered)
          : exportRows(format, 'incoming-inspections', 'Incoming inspections', columnsFromTable(iqcColumns), inspections)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  async function save() {
    const e: Record<string, string> = {}
    if (!form.invoiceNo.trim()) e.invoiceNo = 'Supplier invoice number is required.'
    if (!form.invoiceDate) e.invoiceDate = 'Invoice date is required.'
    if (!form.receivedBy.trim()) e.receivedBy = 'Record who received the material.'
    const v = Number(form.invoiceValue)
    if (!form.invoiceValue || Number.isNaN(v) || v <= 0) e.invoiceValue = 'Enter a positive invoice value.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch = {
      poNo: form.poNo,
      supplierName: form.supplierName,
      warehouse: form.warehouse,
      invoiceNo: form.invoiceNo,
      invoiceDate: form.invoiceDate,
      invoiceValue: Number(form.invoiceValue),
      vehicleNo: form.vehicleNo,
      receivedBy: form.receivedBy,
      plant: form.plant,
    }

    try {
      if (editing) {
        updateGrn(editing.uid, { ...editing, ...patch })
        toast.success('GRN updated', `${editing.docNo} saved successfully.`)
      } else {
        const po = orders.find((o) => o.docNo === form.poNo)
        const docNo = `GRN/26-27/${(grns.length + 1).toString().padStart(4, '0')}`
        
        createGrn({
          docNo,
          docDate: new Date().toISOString().slice(0, 10),
          status: 'PENDING_APPROVAL',
          poNo: form.poNo,
          supplierUid: 'sup-new',
          supplierName: form.supplierName,
          warehouse: form.warehouse,
          gateEntryNo: `GE/26-27/${1190 + grns.length + 1}`,
          gateEntryAt: new Date().toISOString(),
          invoiceNo: form.invoiceNo,
          invoiceDate: form.invoiceDate,
          invoiceValue: Number(form.invoiceValue),
          vehicleNo: form.vehicleNo,
          lrNo: '—',
          receivedBy: form.receivedBy.trim(),
          qcStatus: 'PENDING',
          totalReceived: 0,
          totalAccepted: 0,
          totalRejected: 0,
          grnValue: Number(form.invoiceValue),
          delayDays: 0,
          version: 1,
          attachments: 0,
          comments: 0,
          approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'PENDING', actedAt: null, remarks: null }],
          lines: [],
          uid: newUid(),
        } as Grn)
        toast.success('Receipt created', `${docNo} raised against ${form.poNo}.`)
      }
      setFormOpen(false)
    } catch (e) {
      toast.error('Error', 'Failed to save GRN')
    }
  }

  return (
    <div>
      <PageHeader
        title="Goods receipt & incoming quality"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Goods receipt' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null)
              setForm({ poNo: receivable[0]?.docNo ?? '', supplierName: receivable[0]?.supplierName ?? '', warehouse: 'RM Store — Chennai', invoiceNo: '', invoiceDate: '', invoiceValue: '', vehicleNo: '', receivedBy: '', plant: 'Chennai — Unit 1' })
              setErrors({})
              setFormOpen(true)
            }}
          >
            New receipt
          </Button>
        }
        tabs={
          <Tabs
            variant="pill"
            active={view}
            onChange={(v) => setView(v as 'receipts' | 'inspection')}
            tabs={[
              { id: 'receipts', label: 'Receipts', count: grns.length },
              { id: 'inspection', label: 'Incoming inspection', count: inspections.length },
            ]}
          />
        }
      />

      {view === 'receipts' ? (
        <>
          <Tabs
            className="mb-3"
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'pending', label: 'Pending approval', count: counts.pending },
              { id: 'qc', label: 'In inspection', count: counts.qc },
              { id: 'rejected', label: 'With rejections', count: counts.rejected },
            ]}
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(g) => g.uid}
            searchPlaceholder="Search GRN, PO, supplier, invoice…"
            onExport={doExport}
            onRowClick={(g) => { setDetail(g); setDetailTab('lines') }}
            emptyTitle="No goods receipts"
            rowActions={(g) => (
              <>
                <MenuItem label="Open" onClick={() => { setDetail(g); setDetailTab('lines') }} />
                <MenuItem label="Edit" disabled={g.status !== 'PENDING_APPROVAL'} onClick={() => {
                  setEditing(g)
                  setForm({ poNo: g.poNo, supplierName: g.supplierName, warehouse: g.warehouse, invoiceNo: g.invoiceNo, invoiceDate: g.invoiceDate, invoiceValue: String(g.invoiceValue), vehicleNo: g.vehicleNo, receivedBy: g.receivedBy, plant: g.plant })
                  setErrors({})
                  setFormOpen(true)
                }} />
                <MenuItem
                  label="Approve receipt"
                  icon={<Check />}
                  separatorBefore
                  disabled={g.status !== 'PENDING_APPROVAL'}
                  onClick={async () => {
                    try {
                      updateGrn(g.uid, { ...g, status: 'APPROVED', approvals: g.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: 'APPROVED' as const, actedAt: new Date().toISOString() } : a)) })
                      toast.success('GRN approved', `${g.docNo} has been approved and moved to QC.`)
                    } catch (e) {
                      toast.error('Error', 'Failed to approve receipt')
                    }
                  }}
                />
                <MenuItem
                  label="Raise purchase return"
                  disabled={g.totalRejected === 0}
                  onClick={() => toast.success('Return drafted', `${g.totalRejected} units from ${g.docNo} carried into a purchase return.`)}
                />
                <MenuItem
                  label="Cancel receipt"
                  icon={<X />}
                  danger
                  separatorBefore
                  disabled={g.status === 'CANCELLED'}
                  onClick={async () => {
                    try {
                      updateGrn(g.uid, { ...g, status: 'CANCELLED', remarks: 'Cancelled by stores with a reason code.' })
                      toast.success('GRN cancelled', `${g.docNo} has been cancelled.`)
                    } catch (e) {
                      toast.error('Error', 'Failed to cancel receipt')
                    }
                  }}
                />
                <MenuItem label="Delete" danger disabled={g.status === 'APPROVED'} onClick={() => setConfirmDelete(g)} />
              </>
            )}
          />
        </>
      ) : (
        <DataTable
          rows={inspections}
          columns={iqcColumns}
          rowKey={(i) => i.uid}
          searchPlaceholder="Search inspection, GRN, item, supplier…"
          onExport={doExport}
          onRowClick={setIqcDetail}
          emptyTitle="No inspections"
          rowActions={(i) => (
            <>
              <MenuItem label="Open" onClick={() => setIqcDetail(i)} />
              <MenuItem
                label="Accept lot"
                disabled={i.status !== 'PENDING' && i.status !== 'IN_PROGRESS'}
                onClick={async () => {
                  try {
                    updateIqc(i.uid, { ...i, status: 'ACCEPTED', acceptedQty: i.lotQty, rejectedQty: 0 })
                    toast.success('Lot accepted', `${i.docNo} marked as accepted.`)
                  } catch (e) {
                    toast.error('Error', 'Failed to accept lot')
                  }
                }}
              />
              <MenuItem
                label="Reject lot"
                danger
                disabled={i.status !== 'PENDING' && i.status !== 'IN_PROGRESS'}
                onClick={async () => {
                  try {
                    updateIqc(i.uid, { ...i, status: 'REJECTED', acceptedQty: 0, rejectedQty: i.lotQty, ncrNo: `NCR/26-27/00${Math.floor(40 + Math.random() * 9)}` })
                    toast.success('Lot rejected', `${i.docNo} rejected and NCR raised.`)
                  } catch (e) {
                    toast.error('Error', 'Failed to reject lot')
                  }
                }}
              />
              <MenuItem
                label="Accept under deviation"
                separatorBefore
                disabled={i.status === 'ACCEPTED'}
                onClick={async () => {
                  try {
                    updateIqc(i.uid, { ...i, status: 'DEVIATION_ACCEPTED', deviationApprovedBy: 'V. Ramanathan' })
                    toast.success('Deviation accepted', `${i.docNo} accepted with deviation.`)
                  } catch (e) {
                    toast.error('Error', 'Failed to accept deviation')
                  }
                }}
              />
            </>
          )}
        />
      )}

      {/* GRN detail ------------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.supplierName} · ${detail.warehouse}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">Gate entry {detail.gateEntryNo} · {formatDateTime(detail.gateEntryAt)}</span>
              <div className="flex gap-2">
                {detail.status === 'PENDING_APPROVAL' && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={async () => {
                      try {
                        updateGrn(detail.uid, { ...detail, status: 'APPROVED' })
                        toast.success('Approved', `${detail.docNo} approved.`)
                        setDetail(null)
                      } catch (e) {
                        toast.error('Error', 'Failed to approve receipt')
                      }
                    }}
                  >
                    Approve
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={detail.status} />
              <ProcStatusBadge status={detail.qcStatus} size="sm" />
              <DelayChip days={detail.delayDays} />
            </div>

            <Tabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'lines', label: 'Lines', count: detail.lines.length },
                { id: 'header', label: 'Header' },
                { id: 'qc', label: 'Inspection' },
                { id: 'approval', label: 'Approval' },
              ]}
            />

            {detailTab === 'lines' && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">PO qty</th>
                      <th className="text-right">Challan</th>
                      <th className="text-right">Received</th>
                      <th className="text-right">Accepted</th>
                      <th className="text-right">Rejected</th>
                      <th>Batch / heat</th>
                      <th>Bin</th>
                      <th>QC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                          {l.rejectionReason && <p className="mt-0.5 text-2xs text-danger">{l.rejectionReason}</p>}
                        </td>
                        <td className="text-right tabular">{l.poQty.toLocaleString('en-IN')}</td>
                        <td className="text-right tabular">{l.challanQty.toLocaleString('en-IN')}</td>
                        <td className="text-right tabular font-medium">{l.receivedQty.toLocaleString('en-IN')} {l.uom}</td>
                        <td className="text-right tabular text-success">{l.acceptedQty.toLocaleString('en-IN')}</td>
                        <td className={cn('text-right tabular', l.rejectedQty > 0 && 'text-danger')}>{l.rejectedQty.toLocaleString('en-IN')}</td>
                        <td className="font-mono text-2xs">{l.batchNo ?? '—'}{l.heatNo ? ` / ${l.heatNo}` : ''}</td>
                        <td className="font-mono text-2xs">{l.binCode}</td>
                        <td><ProcStatusBadge status={l.qcStatus} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'header' && (
              <DataGrid
                columns={2}
                items={[
                  { label: 'Against PO', value: detail.poNo, mono: true },
                  { label: 'ASN', value: detail.asnNo ?? '—', mono: true },
                  { label: 'Gate entry', value: `${detail.gateEntryNo} · ${formatDateTime(detail.gateEntryAt)}` },
                  { label: 'Vehicle / LR', value: `${detail.vehicleNo} / ${detail.lrNo}` },
                  { label: 'Invoice', value: `${detail.invoiceNo} · ${formatDate(detail.invoiceDate)}`, mono: true },
                  { label: 'Invoice value', value: formatCurrency(detail.invoiceValue) },
                  { label: 'GRN value', value: formatCurrency(detail.grnValue) },
                  { label: 'Received by', value: detail.receivedBy },
                  { label: 'Warehouse', value: detail.warehouse },
                  { label: 'Plant', value: detail.plant },
                ]}
              />
            )}

            {detailTab === 'qc' && (
              <div className="space-y-3">
                {inspections.filter((i) => i.grnNo === detail.docNo).length === 0 ? (
                  <p className="text-xs text-fg-subtle">No inspection raised against this receipt.</p>
                ) : (
                  inspections
                    .filter((i) => i.grnNo === detail.docNo)
                    .map((i) => (
                      <button
                        key={i.uid}
                        onClick={() => { setIqcDetail(i); setDetail(null) }}
                        className="w-full rounded border border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-medium text-brand-600">{i.docNo}</span>
                          <ProcStatusBadge status={i.status} size="sm" />
                        </div>
                        <p className="mt-1 text-xs text-fg">{i.itemName}</p>
                        <p className="text-2xs text-fg-muted">
                          Lot {i.lotQty.toLocaleString('en-IN')} · sample {i.sampleSize} · AQL {i.aql} · {i.defectsFound} defects
                        </p>
                      </button>
                    ))
                )}
              </div>
            )}

            {detailTab === 'approval' && (
              <div className="space-y-4">
                <ApprovalTrail steps={detail.approvals} />
                {detail.remarks && (
                  <DetailBlock title="Remarks">
                    <p className="text-xs text-fg-muted">{detail.remarks}</p>
                  </DetailBlock>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Inspection detail ------------------------------------------------------ */}
      <Drawer
        open={!!iqcDetail}
        onClose={() => setIqcDetail(null)}
        title={iqcDetail?.docNo}
        description={iqcDetail ? `${iqcDetail.itemName} · ${iqcDetail.supplierName}` : undefined}
        width="max-w-3xl"
        footer={
          iqcDetail && (
            <div className="flex w-full justify-end gap-2">
              {(iqcDetail.status === 'PENDING' || iqcDetail.status === 'IN_PROGRESS') && (
                <>
                  <Button variant="danger" size="sm" onClick={() => { updateIqc(iqcDetail.uid, { status: 'REJECTED' }); toast.success('Rejected', 'NCR raised.'); setIqcDetail(null) }}>
                    Reject lot
                  </Button>
                  <Button variant="success" size="sm" onClick={() => { updateIqc(iqcDetail.uid, { status: 'ACCEPTED', acceptedQty: iqcDetail.lotQty }); toast.success('Accepted', 'Lot released to stores.'); setIqcDetail(null) }}>
                    Accept lot
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => setIqcDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {iqcDetail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={iqcDetail.status} />
              {iqcDetail.ncrNo && <Badge tone="danger" size="sm">{iqcDetail.ncrNo}</Badge>}
              {iqcDetail.deviationApprovedBy && <span className="text-2xs text-warning">Deviation approved by {iqcDetail.deviationApprovedBy}</span>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'GRN', value: iqcDetail.grnNo, mono: true },
                { label: 'PO', value: iqcDetail.poNo, mono: true },
                { label: 'Batch', value: iqcDetail.batchNo ?? '—', mono: true },
                { label: 'Heat', value: iqcDetail.heatNo ?? '—', mono: true },
                { label: 'Lot quantity', value: iqcDetail.lotQty.toLocaleString('en-IN') },
                { label: 'Sample size', value: `${iqcDetail.sampleSize} (${iqcDetail.samplingPlan})` },
                { label: 'AQL', value: iqcDetail.aql },
                { label: 'Inspector', value: iqcDetail.inspectedBy },
                { label: 'Accepted', value: iqcDetail.acceptedQty.toLocaleString('en-IN') },
                { label: 'Rejected', value: iqcDetail.rejectedQty.toLocaleString('en-IN') },
                { label: 'MTC received', value: iqcDetail.mtcReceived ? 'Yes' : 'No' },
                { label: 'MTC verified', value: iqcDetail.mtcVerified ? 'Yes' : 'No' },
              ]}
            />

            <DetailBlock title={`Parameters (${iqcDetail.parameters.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Method</th>
                      <th>Specification</th>
                      <th>Observed</th>
                      <th className="text-center">Critical</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iqcDetail.parameters.map((p) => (
                      <tr key={p.uid} className={p.result === 'FAIL' ? 'bg-danger/5' : undefined}>
                        <td className="text-xs font-medium text-fg">{p.name}</td>
                        <td className="text-2xs text-fg-muted">{p.method}</td>
                        <td className="text-2xs">{p.spec}</td>
                        <td className={cn('text-2xs font-medium', p.result === 'FAIL' ? 'text-danger' : p.result === 'DEVIATION' ? 'text-warning' : 'text-fg')}>{p.observed}</td>
                        <td className="text-center text-2xs">{p.critical ? 'Yes' : '—'}</td>
                        <td><ProcStatusBadge status={p.result} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <p className="text-2xs leading-relaxed text-fg-subtle">
              A failure on any parameter marked critical rejects the lot regardless of the AQL count. Non-critical
              failures within the acceptance number are recorded as deviations and reported to the supplier.
            </p>
          </div>
        )}
      </Drawer>

      {/* Create / edit ---------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'New goods receipt'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>{editing ? 'Save changes' : 'Create receipt'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Against purchase order"
            containerClassName="sm:col-span-2"
            value={form.poNo}
            onChange={(e) => {
              const po = receivable.find((p) => p.docNo === e.target.value)
              setForm({ ...form, poNo: e.target.value, supplierName: po?.supplierName ?? form.supplierName })
            }}
            hint="Approved orders only — material cannot be received against an order nobody has authorised."
            options={[
              { value: '', label: receivable.length ? 'Select an order…' : 'No approved order to receive against' },
              ...receivable.map((p) => ({ value: p.docNo, label: `${p.docNo} — ${p.supplierName}` })),
            ]}
          />
          <Input label="Supplier" readOnly value={form.supplierName} className="bg-surface-2" />
          <Select label="Warehouse" value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} options={warehouses.length ? warehouses.map((v) => ({ value: v.name, label: v.name })) : [{ value: 'RM Store — Chennai', label: 'RM Store — Chennai' }]} />
          <Input label="Supplier invoice no" required value={form.invoiceNo} error={errors.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
          <Input label="Invoice date" type="date" required value={form.invoiceDate} error={errors.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
          <Input label="Invoice value (₹)" type="number" required value={form.invoiceValue} error={errors.invoiceValue} onChange={(e) => setForm({ ...form, invoiceValue: e.target.value })} />
          <Input label="Vehicle number" value={form.vehicleNo} placeholder="TN 38 BQ 4471" onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} />
          <Input label="Received by" required value={form.receivedBy} error={errors.receivedBy} onChange={(e) => setForm({ ...form, receivedBy: e.target.value })} />
          <Select label="Plant" value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })} options={plants.length ? plants.map((v) => ({ value: v.name, label: v.name })) : [{ value: 'Chennai — Unit 1', label: 'Chennai — Unit 1' }]} />
          <Textarea label="Notes" containerClassName="sm:col-span-2" rows={2} placeholder="Seal condition, packing state, anything the inspector should know." />
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete receipt"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) {
                  try {
                    deleteGrn(confirmDelete.uid)
                    toast.success('GRN deleted', `${confirmDelete.docNo} has been removed.`)
                  } catch (e) {
                    toast.error('Error', 'Failed to delete receipt')
                  }
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
          An approved receipt has already posted stock and cannot be deleted — cancel it instead so the reversal is
          traceable.
        </p>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Three-way match" description="Receipt is matched against the order and the supplier invoice before payment is released" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Quantity match', ok: grns.filter((g) => g.totalReceived > 0).length, total: grns.length },
            { label: 'Rate match', ok: grns.filter((g) => g.status === 'APPROVED').length, total: grns.length },
            { label: 'Tax match', ok: grns.filter((g) => g.invoiceValue > 0).length, total: grns.length },
          ].map((m) => (
            <div key={m.label} className="rounded border border-border p-3">
              <p className="text-xs font-medium text-fg">{m.label}</p>
              <p className="mt-1 text-lg font-semibold text-fg tabular">
                {m.ok}
                <span className="text-xs font-normal text-fg-subtle"> / {m.total}</span>
              </p>
              <p className="mt-0.5 text-2xs text-fg-muted">Receipts clearing this leg of the match</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
