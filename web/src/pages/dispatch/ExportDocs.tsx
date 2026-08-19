import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useLiveCrud } from '@/components/crud/CrudKit'
import { exportDocumentApi } from '@/api/exportDocumentApi'
import { useEffect } from 'react'
import { DispatchStatusBadge, EXPORT_DOC_LABEL } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { exportShipmentApi } from '@/api/exportShipmentApi'
import type { ExportDocument, ExportShipment } from '@/types/dispatch'

const ISSUERS: Record<string, string> = {
  COMMERCIAL_INVOICE: 'us',
  PACKING_LIST: 'us',
  CERTIFICATE_OF_ORIGIN: 'the Chamber of Commerce',
  BILL_OF_LADING: 'the shipping line',
  SHIPPING_BILL: 'customs (ICEGATE)',
  INSPECTION_CERTIFICATE: 'the Export Inspection Agency',
  INSURANCE_POLICY: 'the insurer',
}

/**
 * Export documentation — a checklist with dependencies. The certificate of origin
 * needs the commercial invoice, the bill of lading needs the shipping bill, and
 * the shipping bill needs everything else. Missing one late is what turns a
 * container into two days of demurrage.
 */
export function ExportDocsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [docsData, setDocsData] = useState<ExportDocument[]>([])
  const [exportsData, setExportsData] = useState<ExportShipment[]>([])

  const loadData = async () => {
    try {
      const data = await exportDocumentApi.getAll()
      setDocsData(data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadData()
    exportShipmentApi.getAll().then(setExportsData).catch(console.error)
  }, [])

  const crud = useLiveCrud<ExportDocument>({
    key: 'dispatch:export-doc',
    entity: 'Export document',
    titleOf: (d) => `${EXPORT_DOC_LABEL[d.docType]} for ${d.exportShipmentNo}`,
    fields: [
      { name: 'exportShipmentNo', label: 'Export shipment', required: true },
      {
        name: 'docType',
        label: 'Document',
        type: 'select',
        required: true,
        options: Object.entries(EXPORT_DOC_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'docNo', label: 'Document number' },
      { name: 'issuedOn', label: 'Issued on', type: 'date' },
      { name: 'issuedBy', label: 'Issued by' },
      { name: 'fileName', label: 'Attached file' },
      { name: 'isMandatory', label: 'Mandatory for this consignment', type: 'switch' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    toForm: (d) => ({
      exportShipmentNo: d.exportShipmentNo,
      docType: d.docType,
      docNo: d.docNo ?? '',
      issuedOn: d.issuedOn ?? '',
      issuedBy: d.issuedBy ?? '',
      fileName: d.fileName ?? '',
      isMandatory: String(d.isMandatory),
      remarks: d.remarks ?? '',
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? { dependsOn: null, status: 'MISSING' as const }),
      exportShipmentNo: v.exportShipmentNo,
      docType: v.docType as ExportDocument['docType'],
      docNo: v.docNo || null,
      issuedOn: v.issuedOn || null,
      issuedBy: v.issuedBy || null,
      fileName: v.fileName || null,
      isMandatory: v.isMandatory !== 'false',
      remarks: v.remarks || undefined,
    }),
    blockDelete: (d) =>
      d.status === 'ACCEPTED' || d.status === 'SUBMITTED'
        ? `${EXPORT_DOC_LABEL[d.docType]} ${d.docNo} has been ${d.status.toLowerCase()} to customs or the buyer's bank. It cannot be deleted — supersede it with a corrected document instead.`
        : undefined,
  }, docsData, exportDocumentApi, loadData)

  const docs = crud.rows
  const exports = exportsData

  const updateRow = async (id: number, patch: Partial<ExportDocument>) => {
    try {
      const row = docs.find((x: any) => x.id === id);
      if (!row) return;
      await exportDocumentApi.update(id, { ...row, ...patch });
      loadData();
    } catch (e) {
      toast.error('Update failed', e instanceof Error ? e.message : 'Unknown error');
      throw e;
    }
  }


  const [shipment, setShipment] = useState('all')
  const [issuing, setIssuing] = useState<ExportDocument | null>(null)
  const [form, setForm] = useState({ docNo: '', issuedBy: '' })

  const shipmentNos = [...new Set(docs.map((d) => d.exportShipmentNo))]
  const visible = docs.filter((d) => (shipment === 'all' ? true : d.exportShipmentNo === shipment))

  const missing = visible.filter((d) => d.isMandatory && d.status === 'MISSING')
  const inDraft = visible.filter((d) => d.status === 'DRAFT')
  const done = visible.filter((d) => d.status === 'ISSUED' || d.status === 'SUBMITTED' || d.status === 'ACCEPTED')
  const mandatoryCount = visible.filter((d) => d.isMandatory).length

  /** A document cannot be issued before whatever it depends on exists. */
  function blockedBy(d: ExportDocument): ExportDocument | null {
    if (!d.dependsOn) return null
    const parent = docs.find((x) => x.exportShipmentNo === d.exportShipmentNo && x.docType === d.dependsOn)
    if (!parent) return null
    const parentDone = parent.status === 'ISSUED' || parent.status === 'SUBMITTED' || parent.status === 'ACCEPTED'
    return parentDone ? null : parent
  }

  const columns: Column<ExportDocument>[] = [
    { key: 'exportShipmentNo', header: 'Export shipment', sortable: true, width: '11rem', render: (d) => (
      <span className="font-mono text-xs font-medium text-brand-600">{d.exportShipmentNo}</span>
    ) },
    { key: 'docType', header: 'Document', sortable: true, render: (d) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">
          {EXPORT_DOC_LABEL[d.docType]}
          {!d.isMandatory && <span className="ml-1.5 text-2xs font-normal text-fg-subtle">(optional)</span>}
        </p>
        <p className="truncate text-2xs text-fg-subtle">issued by {ISSUERS[d.docType]}</p>
      </div>
    ) },
    { key: 'docNo', header: 'Number', sortable: true, width: '12rem', render: (d) => (
      d.docNo ? <span className="font-mono text-2xs text-fg">{d.docNo}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'issuedOn', header: 'Issued', sortable: true, width: '9rem', accessor: (d) => d.issuedOn ?? '', render: (d) => (
      d.issuedOn ? <span className="text-2xs">{formatDate(d.issuedOn)}</span> : <span className="text-2xs text-fg-subtle">not issued</span>
    ) },
    { key: 'issuedBy', header: 'Issued by', sortable: true },
    { key: 'dependsOn', header: 'Waiting on', width: '13rem', render: (d) => {
      const blocker = blockedBy(d)
      if (!d.dependsOn) return <span className="text-2xs text-fg-subtle">nothing</span>
      return blocker ? (
        <span className="text-2xs font-medium text-danger">{EXPORT_DOC_LABEL[d.dependsOn]}</span>
      ) : (
        <span className="text-2xs text-success">{EXPORT_DOC_LABEL[d.dependsOn]} ready</span>
      )
    } },
    { key: 'fileName', header: 'File', width: '13rem', render: (d) => (
      d.fileName ? (
        <button
          type="button"
          onClick={() => toast.info('Opening document', `${d.fileName} — in the live system this opens the stored PDF.`)}
          className="truncate font-mono text-2xs text-brand-600 hover:underline"
        >
          {d.fileName}
        </button>
      ) : (
        <span className="text-2xs text-fg-subtle">nothing attached</span>
      )
    ) },
    { key: 'remarks', header: 'Note', render: (d) => (
      d.remarks ? <span className="text-2xs text-fg-muted">{d.remarks}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (d) => <DispatchStatusBadge status={d.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'export-documents', 'Export documentation status', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Export documents"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Export documents' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/exports')}>Export shipments</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({ docType: 'COMMERCIAL_INVOICE', isMandatory: 'true', exportShipmentNo: shipmentNos[0] ?? '' })}
            >
              Add a document
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-56"
          value={shipment}
          onChange={(e) => setShipment(e.target.value)}
          options={[{ value: 'all', label: 'All export shipments' }, ...shipmentNos.map((s) => ({ value: s, label: s }))]}
        />
        <p className="text-xs text-fg-muted">
          <span className={cn('font-medium', missing.length ? 'text-danger' : 'text-success')}>{missing.length}</span> mandatory
          document{missing.length === 1 ? '' : 's'} missing
          {inDraft.length > 0 && <>, <span className="font-medium text-warning">{inDraft.length}</span> in draft</>} ·{' '}
          <span className="font-medium text-fg tabular">{done.length}</span> of {mandatoryCount} complete.
        </p>
      </div>

      {/* One card per shipment showing the whole set at a glance */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {shipmentNos
          .filter((s) => shipment === 'all' || s === shipment)
          .map((s) => {
            const set = docs.filter((d) => d.exportShipmentNo === s)
            const mandatory = set.filter((d) => d.isMandatory)
            const ready = mandatory.filter((d) => d.status === 'ISSUED' || d.status === 'SUBMITTED' || d.status === 'ACCEPTED')
            const exp = exports.find((e) => e.docNo === s)
            const pct = mandatory.length ? (ready.length / mandatory.length) * 100 : 0
            return (
              <Card key={s}>
                <CardHeader
                  title={s}
                  description={exp ? `${exp.customer} · ${exp.containerNo} · sails ${formatDate(exp.etd)}` : undefined}
                  actions={
                    <Badge tone={pct === 100 ? 'success' : pct >= 50 ? 'warning' : 'danger'} size="sm" dot={false}>
                      {ready.length}/{mandatory.length}
                    </Badge>
                  }
                />
                <CardBody className="space-y-2.5">
                  <ProgressBar value={pct} tone={pct === 100 ? 'success' : 'warning'} height="h-2" showLabel />
                  <div className="space-y-1">
                    {set.map((d) => {
                      const blocker = blockedBy(d)
                      return (
                        <div key={d.uid} className="flex items-center justify-between gap-2 text-2xs">
                          <span className={cn('truncate', d.isMandatory ? 'text-fg' : 'text-fg-subtle')}>
                            {EXPORT_DOC_LABEL[d.docType]}
                            {!d.isMandatory && ' (optional)'}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {blocker && <span className="text-danger">needs {EXPORT_DOC_LABEL[blocker.docType].toLowerCase()}</span>}
                            <DispatchStatusBadge status={d.status} size="sm" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {pct === 100 && (
                    <p className="text-2xs text-success">
                      Complete. The set can go to the buyer's bank for the letter of credit.
                    </p>
                  )}
                </CardBody>
              </Card>
            )
          })}
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(d) => String((d as any).id || d.uid)}
        searchPlaceholder="Search document, number, shipment or issuer…"
        onExport={doExport}
        emptyTitle="No export documents"
        rowClassName={(d) => cn(
          d.isMandatory && d.status === 'MISSING' && 'bg-danger/[0.04]',
          d.status === 'DRAFT' && 'bg-warning/[0.03]',
          !d.isMandatory && 'opacity-70',
        )}
        rowActions={(d) => (
          <>
            <MenuItem label="Edit the document" onClick={() => crud.openEdit(d)} />
            <MenuItem label="Delete the document" danger onClick={() => crud.askDelete(d)} />
            <MenuItem
              separatorBefore
              label="Record it as issued"
              disabled={d.status === 'ISSUED' || d.status === 'SUBMITTED' || d.status === 'ACCEPTED'}
              onClick={() => {
                const blocker = blockedBy(d)
                if (blocker) {
                  toast.error(
                    'Blocked by another document',
                    `${EXPORT_DOC_LABEL[d.docType]} cannot be issued until ${EXPORT_DOC_LABEL[blocker.docType].toLowerCase()} exists — it takes its figures from it.`,
                  )
                  return
                }
                setIssuing(d)
                setForm({ docNo: d.docNo ?? '', issuedBy: d.issuedBy ?? '' })
              }}
            />
            <MenuItem
              label="Submit to customs"
              disabled={d.status !== 'ISSUED'}
              onClick={() => {
                updateRow((d as any).id, { status: 'SUBMITTED' })
                toast.success('Submitted', `${EXPORT_DOC_LABEL[d.docType]} ${d.docNo} submitted. It is now on record with ${ISSUERS[d.docType]}.`)
              }}
            />
            <MenuItem
              label="Mark accepted"
              disabled={d.status !== 'SUBMITTED'}
              onClick={() => {
                updateRow((d as any).id, { status: 'ACCEPTED' })
                toast.success('Accepted', `${EXPORT_DOC_LABEL[d.docType]} accepted. Anything waiting on it is now unblocked.`)
              }}
            />
            <MenuItem
              label={d.isMandatory ? 'Mark not required' : 'Mark mandatory'}
              onClick={() => {
                updateRow((d as any).id, { isMandatory: !d.isMandatory })
                toast.success(
                  d.isMandatory ? 'Marked not required' : 'Marked mandatory',
                  d.isMandatory
                    ? `${EXPORT_DOC_LABEL[d.docType]} is no longer counted against this consignment — usually because the incoterm puts it on the buyer.`
                    : `${EXPORT_DOC_LABEL[d.docType]} now counts towards the completeness check.`,
                )
              }}
            />
            <MenuItem label="Print the document" onClick={() => doExport('pdf')} />
          </>
        )}
      />

      <Modal
        open={!!issuing}
        onClose={() => setIssuing(null)}
        title={issuing ? `Issue ${EXPORT_DOC_LABEL[issuing.docType]}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setIssuing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!issuing) return
                if (!form.docNo.trim()) {
                  toast.error('Document number required', 'Every export document is referenced by number on the ones that follow it.')
                  return
                }
                if (!form.issuedBy.trim()) {
                  toast.error('Issuer required', `Who issued it? For this document it is normally ${ISSUERS[issuing.docType]}.`)
                  return
                }
                updateRow((issuing as any).id, {
                  docNo: form.docNo.trim(),
                  issuedBy: form.issuedBy.trim(),
                  issuedOn: new Date().toISOString().slice(0, 10),
                  status: 'ISSUED',
                  fileName: `${form.docNo.trim().replace(/[^\w-]/g, '-')}.pdf`,
                })
                const unblocked = docs.filter((x) => x.exportShipmentNo === issuing.exportShipmentNo && x.dependsOn === issuing.docType)
                toast.success(
                  'Document issued',
                  unblocked.length
                    ? `${EXPORT_DOC_LABEL[issuing.docType]} ${form.docNo.trim()} issued. That unblocks ${unblocked.map((x) => EXPORT_DOC_LABEL[x.docType].toLowerCase()).join(' and ')}.`
                    : `${EXPORT_DOC_LABEL[issuing.docType]} ${form.docNo.trim()} issued and filed against ${issuing.exportShipmentNo}.`,
                )
                setIssuing(null)
              }}
            >
              Record
            </Button>
          </>
        }
      >
        {issuing && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{EXPORT_DOC_LABEL[issuing.docType]}</p>
              <p className="mt-1 text-fg-muted">
                For {issuing.exportShipmentNo}, normally issued by {ISSUERS[issuing.docType]}.
                {issuing.dependsOn && ` It takes its figures from the ${EXPORT_DOC_LABEL[issuing.dependsOn].toLowerCase()}.`}
              </p>
            </div>
            <Input
              label="Document number"
              value={form.docNo}
              onChange={(e) => setForm({ ...form, docNo: e.target.value })}
              placeholder={
                issuing.docType === 'SHIPPING_BILL' ? 'SB/4471820'
                : issuing.docType === 'BILL_OF_LADING' ? 'MAEU-2274418'
                : issuing.docType === 'CERTIFICATE_OF_ORIGIN' ? 'COO/TN/44812'
                : 'CI/2627/0094'
              }
            />
            <Input
              label="Issued by"
              value={form.issuedBy}
              onChange={(e) => setForm({ ...form, issuedBy: e.target.value })}
              placeholder={ISSUERS[issuing.docType] === 'us' ? 'S. Ganapathy' : ISSUERS[issuing.docType]}
            />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="The dependency chain, and why it exists" />
        <CardBody className="space-y-2.5">
          <div className="rounded border border-border p-3 text-xs leading-relaxed text-fg-muted">
            <p className="font-medium text-fg">Commercial invoice → everything else</p>
            <p className="mt-1">
              It fixes the description, the quantity and the value. The packing list, the certificate of origin, the shipping bill
              and the insurance policy all quote it, so issuing them first means reissuing them later.
            </p>
          </div>
          <div className="rounded border border-border p-3 text-xs leading-relaxed text-fg-muted">
            <p className="font-medium text-fg">Packing list → after palletisation</p>
            <p className="mt-1">
              It states carton counts, pallet counts and weights. Those numbers do not exist until the pallets are actually built,
              which is why a packing list raised early is always wrong.
            </p>
          </div>
          <div className="rounded border border-border p-3 text-xs leading-relaxed text-fg-muted">
            <p className="font-medium text-fg">Shipping bill → bill of lading</p>
            <p className="mt-1">
              The shipping line will not release a bill of lading without the customs shipping bill number. Without the bill of
              lading the buyer's bank will not release payment under the letter of credit.
            </p>
          </div>
          <div className="rounded border border-border p-3 text-xs leading-relaxed text-fg-muted">
            <p className="font-medium text-fg">The incoterm decides what is mandatory</p>
            <p className="mt-1">
              Under FOB the buyer arranges marine insurance, so our insurance policy is not a required document. Under CIF it is,
              and forgetting it means the container ships uninsured on our risk.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
