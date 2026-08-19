import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useLiveCrud } from '@/components/crud/CrudKit'
import { exportShipmentApi } from '@/api/exportShipmentApi'
import { exportDocumentApi } from '@/api/exportDocumentApi'
import { useEffect } from 'react'
import {
  DispatchStatusBadge,
  EXPORT_DOC_LABEL,
  PartyCell,
  useCanSeeFreight,
} from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'

import type { ExportDocument, ExportShipment } from '@/types/dispatch'

const TABS = [
  { id: 'ACTIVE', label: 'In progress' },
  { id: 'SAILED', label: 'At sea' },
  { id: 'ALL', label: 'All containers' },
]

const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'DAP', 'DDP'] as const

/**
 * Export shipments and containers — the stuffing date, the vessel and the cut-off
 * are what everything else is planned around. A container that misses its cut-off
 * waits a week for the next vessel, and the demurrage clock starts at the port.
 */
export function ExportsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeFreight()
  const [exportsData, setExportsData] = useState<ExportShipment[]>([])
  const [docsData, setDocsData] = useState<ExportDocument[]>([])

  const loadData = async () => {
    try {
      const data = await exportShipmentApi.getAll()
      setExportsData(data)
    } catch (e) {
      console.error(e)
    }
  }

  const loadDocs = async () => {
    try {
      const data = await exportDocumentApi.getAll()
      setDocsData(data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadData()
    loadDocs()
  }, [])

  const crud = useLiveCrud<ExportShipment>({
    key: 'dispatch:export-shipment',
    entity: 'Export shipment',
    titleOf: (e) => `${e.docNo} — ${e.containerNo}`,
    fields: [
      { name: 'docNo', label: 'Export shipment number', required: true, readOnly: true },
      { name: 'shipmentNo', label: 'Linked shipment', required: true },
      { name: 'customer', label: 'Customer', required: true },
      { name: 'country', label: 'Destination country', required: true },
      {
        name: 'incoterm',
        label: 'Incoterm',
        type: 'select',
        required: true,
        options: INCOTERMS.map((i) => ({ value: i, label: i })),
        hint: 'Decides who pays freight and insurance, and where risk passes',
      },
      { name: 'containerNo', label: 'Container number', required: true, upper: true },
      {
        name: 'containerSize',
        label: 'Container size',
        type: 'select',
        required: true,
        options: [
          { value: '20FT', label: "20 ft — 28,000 kg, 33 cbm" },
          { value: '40FT', label: '40 ft — 26,000 kg, 67 cbm' },
          { value: '40HC', label: '40 ft high cube — 26,000 kg, 76 cbm' },
        ],
      },
      { name: 'sealNo', label: 'Seal number' },
      { name: 'stuffingDate', label: 'Stuffing date', type: 'date', required: true },
      { name: 'vessel', label: 'Vessel', required: true },
      { name: 'voyageNo', label: 'Voyage number' },
      { name: 'portOfLoading', label: 'Port of loading', required: true },
      { name: 'portOfDischarge', label: 'Port of discharge', required: true },
      { name: 'etd', label: 'ETD', type: 'date', required: true },
      { name: 'eta', label: 'ETA', type: 'date', required: true },
      { name: 'hsCode', label: 'HS code', required: true, hint: '9617 0011 for vacuum flasks' },
      { name: 'fobValueUsd', label: 'FOB value (USD)', type: 'number', required: true },
      { name: 'exchangeRate', label: 'Exchange rate', type: 'number' },
      { name: 'shippingBillNo', label: 'Shipping bill' },
      { name: 'blNo', label: 'Bill of lading' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? { docNo: v.docNo, customsStatus: 'NOT_FILED' as const, status: 'PLANNED' as const }),
      shipmentNo: v.shipmentNo,
      customer: v.customer,
      country: v.country,
      incoterm: v.incoterm as ExportShipment['incoterm'],
      containerNo: v.containerNo,
      containerSize: v.containerSize as ExportShipment['containerSize'],
      sealNo: v.sealNo,
      stuffingDate: v.stuffingDate,
      vessel: v.vessel,
      voyageNo: v.voyageNo,
      portOfLoading: v.portOfLoading,
      portOfDischarge: v.portOfDischarge,
      etd: v.etd,
      eta: v.eta,
      hsCode: v.hsCode,
      fobValueUsd: Number(v.fobValueUsd) || 0,
      exchangeRate: Number(v.exchangeRate) || 83.5,
      shippingBillNo: v.shippingBillNo || null,
      blNo: v.blNo || null,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (e) =>
      e.status === 'SAILED' || e.status === 'ARRIVED' || e.status === 'DELIVERED'
        ? `${e.docNo} has already sailed on ${e.vessel}. A sailed container is on a bill of lading and cannot be deleted.`
        : e.customsStatus !== 'NOT_FILED'
          ? `${e.docNo} has been filed with customs under ${e.shippingBillNo ?? 'a shipping bill'}. Withdraw the filing first.`
          : undefined,
  }, exportsData, exportShipmentApi, loadData)

  const exports = crud.rows
  const docs = docsData

  const updateRow = async (id: number, patch: Partial<ExportShipment>) => {
    try {
      const row = exports.find((x: any) => x.id === id);
      if (!row) return;
      await exportShipmentApi.update(id, { ...row, ...patch });
      loadData();
    } catch (e) {
      toast.error('Update failed', e instanceof Error ? e.message : 'Unknown error');
      throw e;
    }
  }


  const [tab, setTab] = useState('ACTIVE')
  const [viewing, setViewing] = useState<ExportShipment | null>(null)
  const [stuffing, setStuffing] = useState<ExportShipment | null>(null)
  const [seal, setSeal] = useState('')

  const visible = exports.filter((e) => {
    if (tab === 'ACTIVE') return e.status === 'PLANNED' || e.status === 'STUFFED' || e.status === 'GATED_IN'
    if (tab === 'SAILED') return e.status === 'SAILED' || e.status === 'ARRIVED'
    return true
  })

  /** Documents for a container, and how many mandatory ones are still missing. */
  const docsFor = (e: ExportShipment) => docs.filter((d) => d.exportShipmentNo === e.docNo)
  const missingDocs = (e: ExportShipment) =>
    docsFor(e).filter((d) => d.isMandatory && (d.status === 'MISSING' || d.status === 'DRAFT'))
  const docProgress = (e: ExportShipment) => {
    const all = docsFor(e).filter((d) => d.isMandatory)
    if (!all.length) return 0
    return (all.filter((d) => d.status === 'ISSUED' || d.status === 'SUBMITTED' || d.status === 'ACCEPTED').length / all.length) * 100
  }

  const daysToEtd = (e: ExportShipment) => Math.round((new Date(e.etd).getTime() - Date.now()) / 86_400_000)
  const atRisk = exports.filter((e) => e.status === 'PLANNED' && missingDocs(e).length > 0 && daysToEtd(e) <= 7)

  const columns: Column<ExportShipment>[] = [
    { key: 'docNo', header: 'Export', sortable: true, width: '11.5rem', render: (e) => (
      <button type="button" onClick={() => setViewing(e)} className="text-left">
        <p className="font-mono text-xs font-medium text-brand-600 hover:underline">{e.docNo}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{e.shipmentNo}</p>
      </button>
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (e) => <PartyCell name={e.customer} place={e.country} /> },
    { key: 'containerNo', header: 'Container', sortable: true, width: '12rem', render: (e) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-fg">{e.containerNo}</p>
        <p className="text-2xs text-fg-subtle">
          {e.containerSize === '40HC' ? '40 ft high cube' : e.containerSize === '40FT' ? '40 ft' : '20 ft'}
          {e.sealNo ? ` · seal ${e.sealNo}` : ' · not sealed'}
        </p>
      </div>
    ) },
    { key: 'incoterm', header: 'Terms', align: 'center', width: '6.5rem', sortable: true, render: (e) => (
      <Badge tone="neutral" size="sm" dot={false}>{e.incoterm}</Badge>
    ) },
    { key: 'vessel', header: 'Vessel · voyage', sortable: true, render: (e) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{e.vessel}</p>
        <p className="truncate text-2xs text-fg-subtle">{e.voyageNo}</p>
      </div>
    ) },
    { key: 'route', header: 'Port to port', sortable: true, width: '13rem', accessor: (e) => e.portOfLoading, render: (e) => (
      <div className="min-w-0">
        <p className="truncate font-mono text-2xs text-fg">{e.portOfLoading}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">→ {e.portOfDischarge}</p>
      </div>
    ) },
    { key: 'stuffingDate', header: 'Stuffing', sortable: true, width: '8.5rem', accessor: (e) => e.stuffingDate, render: (e) => formatDate(e.stuffingDate) },
    { key: 'etd', header: 'ETD', sortable: true, width: '9.5rem', accessor: (e) => e.etd, render: (e) => (
      <div className="min-w-0">
        <p className="text-xs text-fg">{formatDate(e.etd)}</p>
        {e.status === 'PLANNED' && (
          <p className={cn('text-2xs', daysToEtd(e) <= 3 ? 'font-medium text-danger' : daysToEtd(e) <= 7 ? 'text-warning' : 'text-fg-subtle')}>
            {daysToEtd(e) < 0 ? `${-daysToEtd(e)} d overdue` : `in ${daysToEtd(e)} d`}
          </p>
        )}
      </div>
    ) },
    { key: 'eta', header: 'ETA', sortable: true, width: '8.5rem', accessor: (e) => e.eta, render: (e) => formatDate(e.eta) },
    { key: 'docs', header: 'Documents', width: '12rem', sortable: true, accessor: (e) => docProgress(e), render: (e) => {
      const missing = missingDocs(e).length
      return (
        <div className="flex items-center gap-2">
          <ProgressBar value={docProgress(e)} tone={missing === 0 ? 'success' : 'warning'} className="w-14" />
          <span className={cn('text-2xs tabular', missing ? 'font-medium text-danger' : 'text-success')}>
            {missing ? `${missing} missing` : 'complete'}
          </span>
        </div>
      )
    } },
    { key: 'hsCode', header: 'HS code', width: '8rem', defaultHidden: true, render: (e) => <span className="font-mono text-2xs">{e.hsCode}</span> },
    ...(canSeeValue
      ? [{
          key: 'fobValueUsd', header: 'FOB value', align: 'right' as const, sortable: true, width: '11rem',
          render: (e: ExportShipment) => (
            <div>
              <p className="tabular text-xs text-fg">${e.fobValueUsd.toLocaleString('en-US')}</p>
              <p className="tabular text-2xs text-fg-subtle">{formatCurrency(e.fobValueUsd * e.exchangeRate)}</p>
            </div>
          ),
        }]
      : []),
    { key: 'customsStatus', header: 'Customs', sortable: true, width: '9rem', render: (e) => <DispatchStatusBadge status={e.customsStatus} size="sm" /> },
    { key: 'status', header: 'Status', sortable: true, width: '8.5rem', render: (e) => <DispatchStatusBadge status={e.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'export-shipments', 'Export shipment register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Export shipments"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Exports' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/export-documents')}>Export documents</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({
                docNo: `EXP/2607/${String(48 + exports.length).padStart(4, '0')}`,
                incoterm: 'FOB',
                containerSize: '40FT',
                portOfLoading: 'INMAA — Chennai',
                hsCode: '9617 0011',
                exchangeRate: '83.52',
              })}
            >
              New export shipment
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{exports.filter((e) => e.status !== 'DELIVERED').length}</span> live container
        {exports.filter((e) => e.status !== 'DELIVERED').length === 1 ? '' : 's'}
        {atRisk.length > 0 && (
          <>
            {' '}· <span className="font-medium text-danger">{atRisk.length}</span> at risk of missing the vessel cut-off with
            documents outstanding
          </>
        )}
        {canSeeValue && (
          <>
            {' '}· <span className="font-medium text-fg tabular">
              ${exports.reduce((s, e) => s + e.fobValueUsd, 0).toLocaleString('en-US')}
            </span> FOB in the pipeline
          </>
        )}
        .
      </p>

      {atRisk.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="At risk of missing the vessel"
            description="A missed cut-off means a week's wait and demurrage at the port"
          />
          <CardBody className="space-y-2">
            {atRisk.map((e) => (
              <div key={e.uid} className="rounded border border-danger/30 bg-danger/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">
                      {e.containerNo} — {e.customer}, {e.vessel} {e.voyageNo}
                    </p>
                    <p className="mt-0.5 text-2xs text-fg-muted">
                      Sails in {daysToEtd(e)} day{daysToEtd(e) === 1 ? '' : 's'} · still missing:{' '}
                      {missingDocs(e).map((d) => EXPORT_DOC_LABEL[d.docType]).join(', ')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/export-documents')}>
                    Work the documents
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(e) => String((e as any).id || e.uid)}
        searchPlaceholder="Search export, container, customer, vessel or port…"
        onExport={doExport}
        emptyTitle="No export shipments"
        rowClassName={(e) => cn(
          missingDocs(e).length > 0 && daysToEtd(e) <= 7 && e.status === 'PLANNED' && 'bg-danger/[0.05]',
          e.customsStatus === 'HELD' && 'bg-danger/[0.05]',
        )}
        rowActions={(e) => (
          <>
            <MenuItem label="Edit the export shipment" onClick={() => crud.openEdit(e)} />
            <MenuItem label="Delete the export shipment" danger onClick={() => crud.askDelete(e)} />
            <MenuItem separatorBefore label="Open the container detail" onClick={() => setViewing(e)} />
            <MenuItem
              label="Record stuffing and seal"
              disabled={e.status !== 'PLANNED'}
              onClick={() => { setStuffing(e); setSeal(e.sealNo) }}
            />
            <MenuItem
              label="File with customs"
              disabled={e.customsStatus !== 'NOT_FILED'}
              onClick={() => {
                if (missingDocs(e).length > 0) {
                  toast.error(
                    'Documents outstanding',
                    `${e.containerNo} is missing ${missingDocs(e).map((d) => EXPORT_DOC_LABEL[d.docType]).join(', ')}. Customs will reject the filing without them.`,
                  )
                  return
                }
                const sb = `SB/${4_471_900 + exports.length}`
                updateRow((e as any).id, { customsStatus: 'FILED', shippingBillNo: sb })
                toast.success('Filed with customs', `Shipping bill ${sb} filed on ICEGATE for ${e.containerNo}. Assessment usually follows within a day.`)
              }}
            />
            <MenuItem
              label="Record gate-in at the port"
              disabled={e.status !== 'STUFFED'}
              onClick={() => {
                updateRow((e as any).id, { status: 'GATED_IN' })
                toast.success('Gated in', `${e.containerNo} is inside the port. The free period before demurrage starts now.`)
              }}
            />
            <MenuItem
              label="Record sailing"
              disabled={e.status !== 'GATED_IN'}
              onClick={() => {
                if (e.customsStatus !== 'CLEARED') {
                  toast.error('Not cleared by customs', `${e.containerNo} has customs status "${e.customsStatus.replace(/_/g, ' ').toLowerCase()}". A container cannot be loaded onto a vessel before clearance.`)
                  return
                }
                const bl = `MAEU-${2_274_500 + exports.length}`
                updateRow((e as any).id, { status: 'SAILED', blNo: bl })
                toast.success('Sailed', `${e.containerNo} is aboard ${e.vessel} ${e.voyageNo}. Bill of lading ${bl} issued — the document set is now complete for the buyer's bank.`)
              }}
            />
            <MenuItem label="Print the packing list" onClick={() => doExport('pdf')} />
          </>
        )}
      />

      {/* Stuffing and seal --------------------------------------------------- */}
      <Modal
        open={!!stuffing}
        onClose={() => setStuffing(null)}
        title={stuffing ? `Stuff ${stuffing.containerNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setStuffing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!stuffing) return
                if (!seal.trim()) {
                  toast.error('Seal number required', 'The shipping line seal number goes on the bill of lading. Without it the container cannot be gated in.')
                  return
                }
                updateRow((stuffing as any).id, { sealNo: seal.trim(), status: 'STUFFED', stuffingDate: new Date().toISOString().slice(0, 10) })
                toast.success(
                  'Container stuffed and sealed',
                  `${stuffing.containerNo} sealed with ${seal.trim()}. Next is the customs filing, then gate-in before the ${formatDate(stuffing.etd)} cut-off.`,
                )
                setStuffing(null)
              }}
            >
              Record
            </Button>
          </>
        }
      >
        {stuffing && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">
                {stuffing.containerSize === '40HC' ? '40 ft high cube' : stuffing.containerSize === '40FT' ? '40 ft' : '20 ft'} for{' '}
                {stuffing.customer}
              </p>
              <p className="mt-1 text-fg-muted">
                {stuffing.vessel} {stuffing.voyageNo} · {stuffing.portOfLoading} → {stuffing.portOfDischarge} · sails{' '}
                {formatDate(stuffing.etd)}
              </p>
            </div>
            {missingDocs(stuffing).length > 0 && (
              <p className="rounded border border-warning/30 bg-warning/5 p-2.5 text-2xs text-warning">
                {missingDocs(stuffing).length} mandatory document
                {missingDocs(stuffing).length === 1 ? '' : 's'} still outstanding. Stuffing can go ahead, but the container cannot
                be filed with customs until they exist.
              </p>
            )}
            <Input label="Shipping line seal number" value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="MSC-9924118" />
          </div>
        )}
      </Modal>

      {/* Container detail ---------------------------------------------------- */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.containerNo}` : ''}
        description={viewing ? `${viewing.customer} · ${viewing.country} · ${viewing.incoterm}` : ''}
        width="max-w-2xl"
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
              <Button variant="primary" onClick={() => navigate('/dispatch/export-documents')}>
                Open the documents
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <DataGrid
              items={[
                { label: 'Export shipment', value: viewing.docNo, mono: true },
                { label: 'Linked shipment', value: viewing.shipmentNo, mono: true },
                { label: 'Container', value: `${viewing.containerNo} (${viewing.containerSize})`, mono: true },
                { label: 'Seal', value: viewing.sealNo || 'not sealed', mono: true },
                { label: 'Vessel', value: `${viewing.vessel} ${viewing.voyageNo}` },
                { label: 'Incoterm', value: viewing.incoterm },
                { label: 'Port of loading', value: viewing.portOfLoading, mono: true },
                { label: 'Port of discharge', value: viewing.portOfDischarge, mono: true },
                { label: 'Stuffed on', value: formatDate(viewing.stuffingDate) },
                { label: 'ETD → ETA', value: `${formatDate(viewing.etd)} → ${formatDate(viewing.eta)}` },
                { label: 'HS code', value: viewing.hsCode, mono: true },
                { label: 'Shipping bill', value: viewing.shippingBillNo ?? 'not filed', mono: true },
                { label: 'Bill of lading', value: viewing.blNo ?? 'not issued', mono: true },
                ...(canSeeValue
                  ? [
                      { label: 'FOB value', value: `$${viewing.fobValueUsd.toLocaleString('en-US')} @ ${viewing.exchangeRate}` },
                      { label: 'In rupees', value: formatCurrency(viewing.fobValueUsd * viewing.exchangeRate) },
                    ]
                  : []),
              ]}
            />

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Document set</h3>
              <div className="space-y-1.5">
                {docsFor(viewing).map((d) => (
                  <div key={d.uid} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-fg">
                        {EXPORT_DOC_LABEL[d.docType]}
                        {!d.isMandatory && <span className="ml-1.5 text-2xs text-fg-subtle">(not required for {viewing.incoterm})</span>}
                      </p>
                      {d.docNo && <p className="truncate font-mono text-2xs text-fg-subtle">{d.docNo}</p>}
                      {d.remarks && <p className="mt-0.5 text-2xs text-fg-muted">{d.remarks}</p>}
                    </div>
                    <DispatchStatusBadge status={d.status} size="sm" />
                  </div>
                ))}
                {docsFor(viewing).length === 0 && (
                  <p className="py-3 text-center text-xs text-fg-muted">No documents raised against this container yet.</p>
                )}
              </div>
            </section>

            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">What {viewing.incoterm} means here</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                {viewing.incoterm === 'FOB' && 'We deliver on board at Chennai. Risk and freight pass to the buyer once loaded, so marine insurance is their arrangement, not ours.'}
                {viewing.incoterm === 'CIF' && 'We pay freight and insurance to the port of discharge. Both appear as our cost on the freight screen and both belong in the price.'}
                {viewing.incoterm === 'CFR' && 'We pay freight to the discharge port but not insurance. The buyer insures from the moment it is loaded.'}
                {viewing.incoterm === 'EXW' && 'The buyer collects from our gate. Everything after that — including export clearance — is theirs.'}
                {viewing.incoterm === 'DAP' && 'We deliver to the named place in the destination country. All freight and risk to that point are ours.'}
                {viewing.incoterm === 'DDP' && 'We deliver duty paid. Import duty and clearance at destination are our cost, which is the most expensive term to quote.'}
              </p>
            </div>
          </div>
        )}
      </Drawer>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Container planning, in the order it actually happens" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-fg">Book the slot first.</span> The vessel cut-off is fixed; packing has to fit around it, not the other way round.</p>
          <p><span className="font-medium text-fg">Stuff and seal.</span> Export pallets must be ISPM-15 stamped, and the seal number goes onto the bill of lading — get it wrong and the container is opened at destination.</p>
          <p><span className="font-medium text-fg">File before gate-in.</span> Customs assessment takes time. A container sitting inside the port with no shipping bill is accruing demurrage.</p>
        </CardBody>
      </Card>
    </div>
  )
}
