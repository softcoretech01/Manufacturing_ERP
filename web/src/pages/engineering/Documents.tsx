import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Plus, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DetailBlock, EngStatusBadge } from '@/components/engineering/EngShell'
import { api } from '@/lib/api'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { useEngineeringCollection } from '@/store/engData'
import { useCollection } from '@/store/data'
import { products as seedProducts } from '@/mock/engineering'
import type { DocType, EngDocument, EngProduct } from '@/types/engineering'

/**
 * Engineering document register (Ch 19).
 *
 * Drawings, models, SOPs and certificates, under the same revision discipline as
 * the BOM: a new revision supersedes the old rather than overwriting it, so a
 * batch made last year can still be checked against the drawing it was made to.
 *
 * This prototype records the metadata and the revision chain. Attaching the
 * actual file is the object store's job in the real system.
 */

const DOC_TYPES: DocType[] = ['CAD_DRAWING', 'MODEL_3D', 'PDF_DRAWING', 'SOP', 'WORK_INSTRUCTION', 'CUSTOMER_SPEC', 'CERTIFICATE', 'DATASHEET', 'IMAGE']
const DOC_TYPE_LABEL: Record<DocType, string> = {
  CAD_DRAWING: 'CAD drawing',
  MODEL_3D: '3D model',
  PDF_DRAWING: 'PDF drawing',
  SOP: 'Standard operating procedure',
  WORK_INSTRUCTION: 'Work instruction',
  CUSTOMER_SPEC: 'Customer specification',
  CERTIFICATE: 'Certificate',
  DATASHEET: 'Datasheet',
  IMAGE: 'Image',
}

interface FormState {
  code: string
  title: string
  docType: DocType
  productCode: string
  fileName: string
  sizeKb: string
  remarks: string
}

const emptyForm: FormState = {
  code: '',
  title: '',
  docType: 'CAD_DRAWING',
  productCode: '',
  fileName: '',
  sizeKb: '',
  remarks: '',
}

const isLive = (d: EngDocument) => d.status === 'ACTIVE' || d.status === 'APPROVED'

export function EngDocumentsPage() {
  const toast = useToast()
  // Products can remain mocked or use the real API. Since the user only asked for Documents, we'll keep products as is to avoid breaking changes, but we could fetch them.
  // Actually, we should ideally fetch products too if we want a true integration, but let's stick to the requirements for Documents.
  const { rows: products } = useEngineeringCollection<EngProduct>('eng:products', useMemo(() => seedProducts, []))

  const [rows, setRows] = useState<EngDocument[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState('live')
  const [detail, setDetail] = useState<EngDocument | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EngDocument | null>(null)
  const [revisingFrom, setRevisingFrom] = useState<EngDocument | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<EngDocument | null>(null)

  const fetchDocuments = async () => {
    try {
      const data = await api.getEngDocuments()
      setRows(data)
    } catch (error) {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const counts = {
    live: rows.filter(isLive).length,
    pending: rows.filter((d) => d.status === 'PENDING_APPROVAL' || d.status === 'DRAFT').length,
    superseded: rows.filter((d) => d.status === 'SUPERSEDED' || d.status === 'OBSOLETE').length,
    all: rows.length,
  }

  const filtered = rows.filter((d) => {
    if (tab === 'live') return isLive(d)
    if (tab === 'pending') return d.status === 'PENDING_APPROVAL' || d.status === 'DRAFT'
    if (tab === 'superseded') return d.status === 'SUPERSEDED' || d.status === 'OBSOLETE'
    return true
  })

  const columns: Column<EngDocument>[] = [
    { key: 'code', header: 'Document', sortable: true, width: '12rem', render: (d) => <span className="font-mono text-xs font-medium text-brand-600">{d.code}</span> },
    { key: 'title', header: 'Title', sortable: true },
    { key: 'docType', header: 'Type', sortable: true, width: '12rem', accessor: (d) => DOC_TYPE_LABEL[d.docType], render: (d) => <span className="text-xs text-fg-muted">{DOC_TYPE_LABEL[d.docType]}</span> },
    { key: 'productCode', header: 'Product', sortable: true, width: '11rem', render: (d) => <span className="font-mono text-2xs text-fg-muted">{d.productCode}</span> },
    { key: 'revision', header: 'Rev', align: 'right', width: '4.5rem', accessor: (d) => d.revision, render: (d) => <span className="font-mono text-2xs">R{d.revision}</span> },
    { key: 'fileName', header: 'File', width: '14rem', render: (d) => <span className="truncate font-mono text-2xs text-fg-muted">{d.fileName}</span> },
    { key: 'sizeKb', header: 'Size', align: 'right', sortable: true, width: '6rem', accessor: (d) => d.sizeKb, render: (d) => (d.sizeKb > 1024 ? `${(d.sizeKb / 1024).toFixed(1)} MB` : `${d.sizeKb} KB`) },
    { key: 'uploadedOn', header: 'Uploaded', sortable: true, width: '7.5rem', accessor: (d) => d.uploadedOn, render: (d) => formatDate(d.uploadedOn) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (d) => <EngStatusBadge status={d.status} size="sm" /> },
  ]

  async function openCreate() {
    setEditing(null)
    setRevisingFrom(null)
    setForm({ ...emptyForm, productCode: products[0]?.code ?? '' })
    setErrors({})
    setFormOpen(true)
    
    try {
      const { nextCode } = await api.getNextEngDocumentCode()
      setForm(prev => ({ ...prev, code: nextCode }))
    } catch (error) {
      console.error('Failed to get next document code', error)
    }
  }

  function openEdit(d: EngDocument) {
    setEditing(d)
    setRevisingFrom(null)
    setForm({
      code: d.code,
      title: d.title,
      docType: d.docType,
      productCode: d.productCode,
      fileName: d.fileName,
      sizeKb: String(d.sizeKb),
      remarks: d.remarks,
    })
    setErrors({})
    setFormOpen(true)
  }

  function openRevision(d: EngDocument) {
    setEditing(null)
    setRevisingFrom(d)
    setForm({
      code: d.code,
      title: d.title,
      docType: d.docType,
      productCode: d.productCode,
      fileName: d.fileName,
      sizeKb: String(d.sizeKb),
      remarks: '',
    })
    setErrors({})
    setFormOpen(true)
    setDetail(null)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'A title is required.'
    if (!form.productCode) e.productCode = 'Link the document to a product.'
    if (!form.fileName.trim()) e.fileName = 'A file name is required.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save(submit: boolean) {
    if (!validate()) return
    const common = {
      title: form.title.trim(),
      docType: form.docType,
      productCode: form.productCode,
      fileName: form.fileName.trim(),
      sizeKb: Number(form.sizeKb) || 0,
      remarks: form.remarks.trim(),
      status: (submit ? 'PENDING_APPROVAL' : 'DRAFT') as EngDocument['status'],
    }

    try {
      if (editing) {
        await api.updateEngDocument(editing.uid, { ...editing, ...common })
        toast.success('Document updated', `Saved.`)
      } else if (revisingFrom) {
        await api.createEngDocument({
          ...common,
          revision: revisingFrom.revision + 1,
          version: revisingFrom.revision + 1,
        })
        toast.success(
          `Revision ${revisingFrom.revision + 1} uploaded`,
          `Approving it supersedes R${revisingFrom.revision}, which stays readable.`,
        )
      } else {
        await api.createEngDocument({
          ...common,
          revision: 1,
          version: 1,
        })
        toast.success('Document registered', `R1 saved.`)
      }
      setFormOpen(false)
      fetchDocuments()
    } catch (error) {
      toast.error('Failed to save document')
    }
  }

  async function approve(d: EngDocument) {
    try {
      const previous = rows.find((x) => x.code === d.code && x.uid !== d.uid && isLive(x))
      if (previous) await api.updateEngDocument(previous.uid, { ...previous, status: 'SUPERSEDED' })
      await api.updateEngDocument(d.uid, { ...d, status: 'ACTIVE', approvedBy: 'Meera Rajan' })
      toast.success(
        'Document approved',
        previous ? `${d.code} R${d.revision} is current; R${previous.revision} is superseded.` : `${d.code} R${d.revision} is current.`,
      )
      setDetail(null)
      fetchDocuments()
    } catch (error) {
      toast.error('Failed to approve document')
    }
  }

  const revisionChain = detail ? rows.filter((d) => d.code === detail.code).sort((a, b) => b.revision - a.revision) : []

  return (
    <div>
      <PageHeader
        title="Engineering documents"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Documents' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Register document
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'live', label: 'Current', count: counts.live },
              { id: 'pending', label: 'Draft & pending', count: counts.pending },
              { id: 'superseded', label: 'Superseded', count: counts.superseded },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(d) => d.uid}
        searchPlaceholder="Search code, title, product or file…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'engineering-documents', 'Engineering documents', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        emptyTitle="No documents"
        emptyDescription="Register a drawing, model, SOP or certificate against a product."
        rowActions={(d) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(d)} />
            <MenuItem label="Edit" disabled={isLive(d)} onClick={() => openEdit(d)} />
            <MenuItem label="Upload a new revision" icon={<Copy />} disabled={!isLive(d)} onClick={() => openRevision(d)} />
            <MenuItem label="Approve" icon={<Check />} separatorBefore disabled={isLive(d)} onClick={() => approve(d)} />
            <MenuItem
              label="Reject"
              icon={<X />}
              danger
              disabled={d.status !== 'PENDING_APPROVAL'}
              onClick={async () => {
                try {
                  await api.updateEngDocument(d.uid, { ...d, status: 'REJECTED' })
                  toast.success('Rejected', `${d.code} R${d.revision} sent back to ${d.uploadedBy}.`)
                  fetchDocuments()
                } catch (error) {
                  toast.error('Failed to reject document')
                }
              }}
            />
            <MenuItem
              label={isLive(d) ? 'Delete — blocked (current)' : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={isLive(d)}
              onClick={() => setConfirmDelete(d)}
            />
          </>
        )}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.code} · revision ${detail.revision}` : ''}
        description={detail?.title}
        width="max-w-2xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                Uploaded by {detail.uploadedBy} on {formatDate(detail.uploadedOn)}
              </span>
              <div className="flex gap-2">
                {!isLive(detail) && (
                  <Button variant="success" size="sm" onClick={() => approve(detail)}>
                    Approve
                  </Button>
                )}
                {isLive(detail) && (
                  <Button variant="outline" size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => openRevision(detail)}>
                    Upload a new revision
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <EngStatusBadge status={detail.status} />

            <DataGrid
              columns={2}
              items={[
                { label: 'Code', value: detail.code, mono: true },
                { label: 'Type', value: DOC_TYPE_LABEL[detail.docType] },
                { label: 'Product', value: detail.productCode, mono: true },
                { label: 'Revision', value: `R${detail.revision}` },
                { label: 'File', value: detail.fileName, mono: true },
                { label: 'Size', value: detail.sizeKb > 1024 ? `${(detail.sizeKb / 1024).toFixed(1)} MB` : `${detail.sizeKb} KB` },
                { label: 'Uploaded', value: `${detail.uploadedBy} · ${formatDate(detail.uploadedOn)}` },
                { label: 'Approved', value: detail.approvedBy ? `${detail.approvedBy} · ${formatDate(detail.approvedOn)}` : 'Not approved' },
              ]}
            />

            {detail.remarks && (
              <DetailBlock title="Remarks">
                <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.remarks}</p>
              </DetailBlock>
            )}

            <DetailBlock title={`Revision history (${revisionChain.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '4rem' }}>Rev</th>
                      <th>File</th>
                      <th style={{ width: '8rem' }}>Uploaded</th>
                      <th style={{ width: '9rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisionChain.map((r) => (
                      <tr key={r.uid} className={r.uid === detail.uid ? 'bg-brand-500/5' : undefined}>
                        <td className="font-mono text-2xs">R{r.revision}</td>
                        <td className="font-mono text-2xs text-fg-muted">{r.fileName}</td>
                        <td className="text-2xs">{formatDate(r.uploadedOn)}</td>
                        <td><EngStatusBadge status={r.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <Alert tone="info">
              The prototype records the revision chain and the metadata. The file itself is held in the document store in
              the real system, reached from this record.
            </Alert>
          </div>
        )}
      </Drawer>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={revisingFrom ? `${revisingFrom.code} — new revision ${revisingFrom.revision + 1}` : editing ? `Edit ${editing.code}` : 'Register a document'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => save(false)}>
              Save draft
            </Button>
            <Button variant="primary" onClick={() => save(true)}>
              Save and submit
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input maxLength={255} label="Document code" disabled value={form.code ?? ''} placeholder="Auto-generated" />
          <Input maxLength={255} label="Title" required value={form.title ?? ''} maxLength={150} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select label="Type" value={form.docType ?? ''} onChange={(e) => setForm({ ...form, docType: e.target.value as DocType })} options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))} />
          <Select
            label="Product"
            required
            value={form.productCode ?? ''}
            error={errors.productCode}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
            options={[{ value: '', label: 'Select a product…' }, ...products.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <Input maxLength={255} label="File name" required value={form.fileName ?? ''} maxLength={255} error={errors.fileName} placeholder="DRG-FG-600-GRN-R1.pdf" onChange={(e) => setForm({ ...form, fileName: e.target.value })} />
          <Input maxLength={255} label="Size (KB)" type="number" value={form.sizeKb ?? ''} onChange={(e) => setForm({ ...form, sizeKb: e.target.value })} />
          <Textarea maxLength={1000} label="Remarks" containerClassName="sm:col-span-2" maxLength={1000} rows={2} value={form.remarks ?? ''} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>

        {revisingFrom && (
          <Alert tone="info" className="mt-4">
            Approving this revision supersedes R{revisingFrom.revision}. The old revision stays readable, which is what
            lets a batch built last year be checked against the drawing it was actually made to.
          </Alert>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete document"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) {
                  try {
                    await api.deleteEngDocument(confirmDelete.uid)
                    toast.success('Deleted', `${confirmDelete.code} R${confirmDelete.revision} was soft-deleted.`)
                    fetchDocuments()
                  } catch (error) {
                    toast.error('Failed to delete document')
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
          {confirmDelete?.code} R{confirmDelete?.revision} will be marked deleted, not physically removed.
        </p>
      </Modal>
    </div>
  )
}
