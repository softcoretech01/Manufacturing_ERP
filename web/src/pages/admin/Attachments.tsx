import { useState } from 'react'
import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Files,
  HardDrive,
  ShieldAlert,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { attachments } from '@/mock/data2'
import type { Attachment } from '@/types'

function fileIcon(type: string) {
  const t = type.toLowerCase()
  if (t.includes('image') || t.includes('png') || t.includes('jpg')) return FileImage
  if (t.includes('sheet') || t.includes('xls') || t.includes('csv')) return FileSpreadsheet
  if (t.includes('zip') || t.includes('dwg') || t.includes('step')) return FileArchive
  return FileText
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/** Document categories and their retention obligations. */
const CATEGORIES = [
  { code: 'DRAWING', label: 'Engineering drawing', retention: 'Life of product + 7 years', versioned: true },
  { code: 'CERTIFICATE', label: 'Test / material certificate', retention: '8 years (statutory)', versioned: false },
  { code: 'INVOICE', label: 'Supplier invoice copy', retention: '8 years (GST)', versioned: false },
  { code: 'PHOTO', label: 'Inspection photograph', retention: '3 years', versioned: false },
  { code: 'CONTRACT', label: 'Contract / agreement', retention: 'Term + 7 years', versioned: true },
  { code: 'SOP', label: 'Work instruction / SOP', retention: 'Superseded + 3 years', versioned: true },
  { code: 'POD', label: 'Proof of delivery', retention: '3 years', versioned: false },
  { code: 'COMPLIANCE', label: 'Licence / registration', retention: 'Until expiry + 5 years', versioned: true },
]

const ALLOWED = ['pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'docx', 'dwg', 'step', 'csv', 'zip']

export function AttachmentsPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'attachments-document-store', 'Attachments & document store', columnsFromTable(columns), attachments)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('files')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [policy, setPolicy] = useState({ virusScan: true, stripExif: true, signedUrls: true, encryption: true })

  const infected = attachments.filter((a) => a.status === 'INFECTED')
  const scanning = attachments.filter((a) => a.status === 'SCANNING')
  const totalBytes = attachments.reduce((s, a) => s + a.sizeBytes, 0)

  const columns: Column<Attachment>[] = [
    {
      key: 'fileName',
      header: 'File',
      sortable: true,
      sticky: true,
      width: '280px',
      render: (a) => {
        const Icon = fileIcon(a.fileType)
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-fg-subtle" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-fg">{a.fileName}</p>
              <p className="truncate text-2xs text-fg-subtle">{a.fileType} · {formatBytes(a.sizeBytes)}</p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'entity',
      header: 'Attached to',
      width: '210px',
      accessor: (a) => a.entityType,
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{a.entityType}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{a.entityUid}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortable: true, width: '150px', render: (a) => <Badge tone="neutral" size="sm" dot={false}>{a.category.toLowerCase()}</Badge> },
    { key: 'version', header: 'Ver', align: 'right', width: '60px', render: (a) => <span className="tabular">v{a.version}</span> },
    { key: 'uploadedBy', header: 'Uploaded by', width: '150px' },
    { key: 'uploadedAt', header: 'When', sortable: true, width: '160px', render: (a) => formatDateTime(a.uploadedAt) },
    {
      key: 'status',
      header: 'Status',
      width: '140px',
      sortable: true,
      render: (a) => (
        <Badge
          tone={a.status === 'AVAILABLE' ? 'success' : a.status === 'SCANNING' ? 'pending' : a.status === 'INFECTED' ? 'danger' : 'neutral'}
          size="sm"
        >
          {a.status === 'PENDING_UPLOAD' ? 'Uploading' : a.status.toLowerCase()}
        </Badge>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Attachments & document store"
        description="One polymorphic store serves every entity in the product. Files live in object storage; the database holds only metadata and the access rules."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Platform services' }, { label: 'Attachments & DMS' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>
            Upload
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'files', label: 'All files', count: attachments.length },
              { id: 'categories', label: 'Categories & retention', count: CATEGORIES.length },
              { id: 'policy', label: 'Storage policy' },
            ]}
          />
        }
      />

      {infected.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${infected.length} file(s) failed virus scanning`}>
          Quarantined files are never served for download. The uploader and the security contact are
          notified, and the file is retained in an isolated bucket for forensic review rather than
          deleted.
        </Alert>
      )}

      {tab === 'files' && (
        <DataTable
          rows={attachments}
          columns={columns}
          rowKey={(a) => a.uid}
          searchPlaceholder="File name, entity or uploader…"
          onExport={doExport}
          rowClassName={(a) => (a.status === 'INFECTED' ? 'bg-danger/[0.03]' : undefined)}
          rowActions={(a) => (
            <>
              <MenuItem label="Download" disabled={a.status !== 'AVAILABLE'} onClick={() => toast.info('Download', `${a.fileName} would download through a short-lived signed URL.`)} />
              <MenuItem label="Preview" disabled={a.status !== 'AVAILABLE'} onClick={() => toast.info('Preview', `Preview ${a.fileName} in the browser without downloading.`)} />
              <MenuItem label="Version history" disabled={a.version < 2} onClick={() => toast.info('Version history', `${a.fileName} is at v${a.version}. Earlier versions are retained.`)} />
              <MenuItem label="Open parent document" onClick={() => toast.info('Open parent document', `Go to ${a.entityType} · ${a.entityUid}.`)} />
              <MenuItem label="Delete" danger separatorBefore onClick={() => toast.success('Attachment deleted', `${a.fileName} was removed. The file is retained per its category retention policy.`)} />
            </>
          )}
        />
      )}

      {tab === 'categories' && (
        <Card>
          <CardHeader title="Document categories" description="Category drives retention, versioning and who may see the file" />
          <CardBody className="p-0">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Code</th>
                  <th>Retention</th>
                  <th className="w-24">Versioned</th>
                  <th className="w-24">Files</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((c) => (
                  <tr key={c.code}>
                    <td className="font-medium text-fg">{c.label}</td>
                    <td className="font-mono text-2xs">{c.code}</td>
                    <td className="text-fg-muted">{c.retention}</td>
                    <td>{c.versioned ? <Badge tone="progress" size="sm">Yes</Badge> : <Badge tone="neutral" size="sm">No</Badge>}</td>
                    <td className="tabular">{attachments.filter((a) => a.category === c.code).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {tab === 'policy' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Upload rules" />
            <CardBody className="space-y-3.5">
              <Input label="Maximum file size (MB)" type="number" defaultValue={25} hint="Files above this are rejected client-side and server-side." />
              <div>
                <p className="field-label">Permitted extensions</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALLOWED.map((e) => (
                    <span key={e} className="kbd">.{e}</span>
                  ))}
                </div>
                <p className="mt-1.5 text-2xs text-fg-subtle">
                  Extension alone is not trusted — the file's magic bytes are checked and a mismatch
                  is rejected. Executables and scripts are refused regardless of extension.
                </p>
              </div>
              <Switch checked={policy.virusScan} onChange={(v) => setPolicy((p) => ({ ...p, virusScan: v }))} label="Virus scan every upload before it becomes downloadable" />
              <Switch checked={policy.stripExif} onChange={(v) => setPolicy((p) => ({ ...p, stripExif: v }))} label="Strip EXIF metadata from photographs" />
              <Switch checked={policy.signedUrls} onChange={(v) => setPolicy((p) => ({ ...p, signedUrls: v }))} label="Serve downloads through short-lived signed URLs" />
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Storage" />
              <CardBody className="space-y-3">
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-fg-muted">Bucket usage</span>
                    <span className="text-fg tabular">184 GB of 500 GB</span>
                  </div>
                  <ProgressBar value={37} tone="success" showLabel />
                </div>
                <Select
                  label="Storage backend"
                  defaultValue="MINIO"
                  options={[
                    { value: 'MINIO', label: 'MinIO (on-premise, S3 compatible)' },
                    { value: 'S3', label: 'Amazon S3' },
                    { value: 'AZURE', label: 'Azure Blob Storage' },
                  ]}
                />
                <Input label="Bucket" defaultValue="ssberp-docs" className="font-mono" />
                <Switch checked={policy.encryption} onChange={(v) => setPolicy((p) => ({ ...p, encryption: v }))} label="Server-side encryption at rest (AES-256)" />
              </CardBody>
            </Card>

            
          </div>
        </div>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload attachment"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Uploaded', 'The file is queued for virus scanning and will be available shortly.'); setUploadOpen(false) }}>
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="flex flex-col items-center justify-center rounded border-2 border-dashed border-border-strong py-10 text-center">
            <Upload className="mb-2 h-6 w-6 text-fg-subtle" />
            <p className="text-sm text-fg">Drop files here or click to browse</p>
            <p className="mt-0.5 text-2xs text-fg-subtle">Up to 25 MB · {ALLOWED.join(', ')}</p>
          </div>
          <Select label="Attach to" options={[{ value: 'PO', label: 'Purchase order' }, { value: 'SUPPLIER', label: 'Supplier master' }, { value: 'ITEM', label: 'Item master' }, { value: 'GRN', label: 'Goods receipt note' }]} />
          <Input label="Reference" placeholder="PO/HO/2627/00184" className="font-mono" />
          <Select label="Category" required options={CATEGORIES.map((c) => ({ value: c.code, label: c.label }))} />
          <Input label="Description" placeholder="What this document is — shown in the file list." />
        </div>
      </Modal>
    </div>
  )
}
