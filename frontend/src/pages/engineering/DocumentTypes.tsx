import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import type { DocumentType } from '@/types/engineering'
import { engineeringApi as api } from '@/api/engineering'

/**
 * Document type master (ERP_Product.DocumentType).
 *
 * The Type list on the document register reads from here, so adding a type is
 * configuration rather than a code change. Three rules the server enforces and
 * this page mirrors, so the user is not surprised by a 409:
 *
 *  - the code is fixed once a document uses it (documents store the code itself),
 *  - a type in use cannot be deactivated,
 *  - a type in use cannot be retired.
 */

interface FormState {
  code: string
  name: string
  description: string
  retentionRule: string
  isVersioned: boolean
  sortOrder: string
  isActive: boolean
}

const emptyForm: FormState = {
  code: '',
  name: '',
  description: '',
  retentionRule: '',
  isVersioned: false,
  sortOrder: '0',
  isActive: true,
}

export function DocumentTypesPage() {
  const toast = useToast()

  const [rows, setRows] = useState<DocumentType[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentType | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmRetire, setConfirmRetire] = useState<DocumentType | null>(null)

  async function loadData() {
    try {
      // The whole master, not just active rows — this page maintains both.
      setRows(await api.getDocumentTypes(false))
    } catch {
      toast.error('Error', 'Failed to load document types')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const columns: Column<DocumentType>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '10rem', render: (t) => <span className="font-mono text-xs font-medium text-brand-600">{t.code}</span> },
    { key: 'name', header: 'Type', sortable: true, width: '14rem' },
    { key: 'description', header: 'Description', render: (t) => <span className="text-xs text-fg-muted">{t.description || '—'}</span> },
    { key: 'retentionRule', header: 'Retention', sortable: true, width: '11rem', render: (t) => <span className="text-xs text-fg-muted">{t.retentionRule || '—'}</span> },
    { key: 'isVersioned', header: 'Revisions', width: '7rem', accessor: (t) => (t.isVersioned ? 'Yes' : 'No'), render: (t) => (t.isVersioned ? <Badge tone="progress" size="sm">Revised</Badge> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'sortOrder', header: 'Order', align: 'right', sortable: true, width: '6rem', accessor: (t) => t.sortOrder, render: (t) => <span className="text-xs text-fg-muted tabular">{t.sortOrder}</span> },
    { key: 'inUseCount', header: 'Used by', align: 'right', sortable: true, width: '7rem', accessor: (t) => t.inUseCount, render: (t) => <span className="text-xs text-fg-muted tabular">{t.inUseCount}</span> },
    { key: 'isActive', header: 'Status', width: '6.5rem', accessor: (t) => (t.isActive ? 'Active' : 'Retired'), render: (t) => <Badge tone={t.isActive ? 'success' : 'neutral'} size="sm">{t.isActive ? 'Active' : 'Retired'}</Badge> },
  ]

  function openCreate() {
    setEditing(null)
    setErrors({})
    // Put a new type after the last one rather than at the top of the picker.
    const nextOrder = rows.reduce((max, t) => Math.max(max, t.sortOrder), 0) + 10
    setForm({ ...emptyForm, sortOrder: String(nextOrder) })
    setFormOpen(true)
  }

  function openEdit(t: DocumentType) {
    setEditing(t)
    setForm({
      code: t.code,
      name: t.name,
      description: t.description ?? '',
      retentionRule: t.retentionRule ?? '',
      isVersioned: t.isVersioned,
      sortOrder: String(t.sortOrder),
      isActive: t.isActive,
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()

    if (!code) e.code = 'A code is required.'
    else if (!/^[A-Z0-9_]+$/.test(code)) e.code = 'Use capitals, digits and underscores only.'
    else if (rows.some((t) => t.code === code && t.uid !== editing?.uid)) e.code = `${code} already exists.`

    if (!form.name.trim()) e.name = 'A name is required.'
    if (Number.isNaN(Number(form.sortOrder))) e.sortOrder = 'Order must be a number.'

    // Mirror the server rule so the user sees it before the request goes out.
    if (editing && editing.inUseCount > 0) {
      if (code !== editing.code) e.code = `${editing.code} is used by ${editing.inUseCount} document(s); its code cannot change.`
      if (!form.isActive) e.isActive = `${editing.code} is used by ${editing.inUseCount} document(s) and cannot be deactivated.`
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      retentionRule: form.retentionRule.trim() || null,
      isVersioned: form.isVersioned,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    }
    try {
      if (editing) {
        await api.updateDocumentType(editing.uid, payload)
        toast.success('Document type updated', `${payload.code} saved.`)
      } else {
        await api.createDocumentType(payload)
        toast.success('Document type created', `${payload.code} can now be used on a document.`)
      }
      setFormOpen(false)
      loadData()
    } catch (err: any) {
      toast.error('Error', err?.message ?? 'Failed to save document type')
    }
  }

  async function toggleActive(t: DocumentType) {
    if (t.isActive && t.inUseCount > 0) {
      toast.error('In use', `${t.code} is on ${t.inUseCount} document(s) and cannot be deactivated.`)
      return
    }
    try {
      await api.updateDocumentType(t.uid, { ...t, isActive: !t.isActive })
      toast.success(t.isActive ? 'Retired' : 'Activated', `${t.code} is now ${t.isActive ? 'retired' : 'active'}.`)
      loadData()
    } catch (err: any) {
      toast.error('Error', err?.message ?? 'Failed to update status')
    }
  }

  return (
    <div>
      <PageHeader
        title="Document types"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Document types' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New document type
          </Button>
        }
      />

      <Alert tone="info" className="mb-4">
        These are the options in the Type list when a document is registered. A retired type
        disappears from that list but still labels the documents already filed under it.
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.uid}
        searchPlaceholder="Search code, name or retention…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'document-types', 'Document types', columnsFromTable(columns), rows)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={openEdit}
        emptyTitle="No document types"
        emptyDescription="The document register's Type list is built from this master."
        loading={isLoading}
        rowActions={(t) => (
          <>
            <MenuItem label="Edit" onClick={() => openEdit(t)} />
            <MenuItem
              label={t.isActive ? (t.inUseCount ? `Retire — blocked (${t.inUseCount} documents)` : 'Retire') : 'Activate'}
              disabled={t.isActive && t.inUseCount > 0}
              onClick={() => toggleActive(t)}
            />
            <MenuItem
              label={t.inUseCount ? `Delete — blocked (${t.inUseCount} documents)` : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={t.inUseCount > 0}
              onClick={() => setConfirmRetire(t)}
            />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'New document type'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Create document type'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input
            maxLength={50}
            label="Code"
            required
            value={form.code}
            error={errors.code}
            disabled={!!editing && editing.inUseCount > 0}
            hint={
              editing && editing.inUseCount > 0
                ? `Fixed — ${editing.inUseCount} document(s) store this code.`
                : 'Stored on every document of this type, e.g. RISK_ASSESSMENT.'
            }
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          <Input
            maxLength={150}
            label="Name"
            required
            value={form.name}
            error={errors.name}
            hint="What the Type list shows."
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            maxLength={150}
            label="Retention rule"
            value={form.retentionRule}
            hint="How long a document of this type is kept, e.g. 8 years (statutory)."
            onChange={(e) => setForm({ ...form, retentionRule: e.target.value })}
          />
          <Input
            maxLength={10}
            label="Order in the list"
            type="number"
            value={form.sortOrder}
            error={errors.sortOrder}
            hint="Lower numbers appear first."
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
          <div className="flex items-end gap-4 pb-1 sm:col-span-2">
            <Switch
              checked={form.isVersioned}
              onChange={(v) => setForm({ ...form, isVersioned: v })}
              label="Superseded by revisions"
            />
            <Switch
              checked={form.isActive}
              onChange={(v) => setForm({ ...form, isActive: v })}
              label="Active"
            />
          </div>
          <Textarea
            maxLength={500}
            label="Description"
            containerClassName="sm:col-span-2"
            rows={2}
            value={form.description}
            hint="Shown to whoever is choosing a type."
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {errors.isActive && (
          <Alert tone="danger" className="mt-4">
            {errors.isActive}
          </Alert>
        )}

        {editing && editing.inUseCount > 0 && !errors.isActive && (
          <Alert tone="info" className="mt-4">
            {editing.inUseCount} document(s) are filed as{' '}
            <span className="font-semibold text-fg">{editing.code}</span>. The name and
            description can change freely — they are labels. The code cannot, because each of
            those documents stores it.
          </Alert>
        )}
      </Modal>

      <Modal
        open={!!confirmRetire}
        onClose={() => setConfirmRetire(null)}
        title="Delete document type"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmRetire(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmRetire) {
                  try {
                    await api.retireDocumentType(confirmRetire.uid)
                    toast.success('Retired', `${confirmRetire.code} was retired, not deleted.`)
                    loadData()
                  } catch (err: any) {
                    toast.error('Error', err?.message ?? 'Failed to retire')
                  }
                }
                setConfirmRetire(null)
              }}
            >
              Retire
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmRetire?.code} will be retired, not physically removed — it disappears from
          the Type list but any document already using it keeps its label.
        </p>
      </Modal>
    </div>
  )
}
