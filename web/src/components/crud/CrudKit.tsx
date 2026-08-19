import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { newUid, useCollection, type StoredRow } from '@/store/data'

/**
 * One place that turns a field list into a working add / edit / delete screen.
 *
 * Before this existed every list screen rendered from a frozen mock array and
 * its buttons only raised a toast. Screens now declare *what* a record looks
 * like and this handles the rest: a controlled form, validation, a persisted
 * record store, soft delete, and a delete guard for records still in use.
 */

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'switch' | 'email' | 'tel'

export interface CrudField {
  name: string
  label: string
  type?: FieldType
  options?: { value: string; label: string }[]
  required?: boolean
  hint?: string
  placeholder?: string
  /** Column span inside the two-column form grid. */
  span?: 1 | 2
  maxLength?: number
  /** Force the typed value to upper case — codes, GSTIN, PAN. */
  upper?: boolean
  /** Return an error message to block saving. */
  validate?: (value: string, values: Values) => string | undefined
  /** Hide the field unless the predicate passes — dependent fields. */
  showIf?: (values: Values) => boolean
  readOnly?: boolean
}

export type Values = Record<string, string>

export interface CrudConfig<T extends StoredRow> {
  /** Storage key for the record store, e.g. 'admin:branch'. */
  key: string
  seed: T[]
  /** Singular noun used in messages: 'Branch', 'User'. */
  entity: string
  fields: CrudField[]
  /** Values shown when adding. Anything omitted starts blank. */
  defaults?: Values
  /** Row → form values. Defaults to reading each field name off the row. */
  toForm?: (row: T) => Values
  /** Form values → the stored record. Called for both create and edit. */
  fromForm: (values: Values, existing?: T) => Record<string, unknown>
  /** Label shown in the list and in confirmation dialogs. */
  titleOf: (row: T) => string
  /** Return a reason to refuse deletion — a record still referenced elsewhere. */
  blockDelete?: (row: T) => string | undefined
}

export function useCrud<T extends StoredRow>(config: CrudConfig<T>) {
  const toast = useToast()
  const seed = useMemo(() => config.seed, [config.seed])
  const store = useCollection<T>(config.key, seed)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [values, setValues] = useState<Values>({})
  const [errors, setErrors] = useState<Values>({})
  const [deleting, setDeleting] = useState<T | null>(null)

  const visibleFields = config.fields.filter((f) => !f.showIf || f.showIf(values))

  function openCreate(preset?: Values) {
    setEditing(null)
    setValues({ ...(config.defaults ?? {}), ...(preset ?? {}) })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(row: T) {
    setEditing(row)
    const v = config.toForm
      ? config.toForm(row)
      : Object.fromEntries(
          config.fields.map((f) => {
            const raw = (row as Record<string, unknown>)[f.name]
            return [f.name, raw === null || raw === undefined ? '' : String(raw)]
          }),
        )
    setValues(v)
    setErrors({})
    setFormOpen(true)
  }

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }))
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }))
  }

  function validate() {
    const e: Values = {}
    for (const f of visibleFields) {
      const v = (values[f.name] ?? '').trim()
      if (f.required && !v && f.type !== 'switch') {
        e[f.name] = `${f.label} is required.`
        continue
      }
      if (v && f.type === 'number' && Number.isNaN(Number(v))) {
        e[f.name] = 'Enter a number.'
        continue
      }
      if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        e[f.name] = 'Enter a valid email address.'
        continue
      }
      const custom = f.validate?.(v, values)
      if (custom) e[f.name] = custom
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save() {
    if (!validate()) return
    const patch = config.fromForm(values, editing ?? undefined)
    if (editing) {
      store.update(editing.uid, patch as Partial<T>)
      toast.success(`${config.entity} updated`, `${config.titleOf(editing)} saved.`)
    } else {
      const row = { uid: newUid(config.key.replace(/[^a-z]/gi, '').slice(0, 4) || 'rec'), ...patch } as T
      store.create(row)
      toast.success(`${config.entity} created`, `${config.titleOf(row)} added.`)
    }
    setFormOpen(false)
  }

  function askDelete(row: T) {
    const reason = config.blockDelete?.(row)
    if (reason) {
      toast.error('Cannot delete', reason)
      return
    }
    setDeleting(row)
  }

  function confirmDelete() {
    if (!deleting) return
    store.remove(deleting.uid)
    toast.success(`${config.entity} deleted`, `${config.titleOf(deleting)} removed. Nothing is erased — it can be restored.`)
    setDeleting(null)
  }

  /** Render inside the page so the add/edit and delete dialogs exist. */
  const dialogs = (
    <>
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${config.entity.toLowerCase()}` : `Add ${config.entity.toLowerCase()}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : `Add ${config.entity.toLowerCase()}`}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          {visibleFields.map((f) => (
            <FieldControl key={f.name} field={f} value={values[f.name] ?? ''} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
          ))}
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${config.entity.toLowerCase()}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{deleting ? config.titleOf(deleting) : ''}</span> will be removed from
          the list. It is marked deleted rather than erased, so the history stays intact.
        </p>
      </Modal>
    </>
  )

  return { ...store, openCreate, openEdit, askDelete, dialogs, editing, values, setValue: set }
}

function FieldControl({
  field,
  value,
  error,
  onChange,
}: {
  field: CrudField
  value: string
  error?: string
  onChange: (v: string) => void
}) {
  const span = field.span === 2 ? 'sm:col-span-2' : undefined

  if (field.type === 'switch') {
    return (
      <div className={span ?? ''}>
        <div className="flex h-9 items-center">
          <Switch checked={value === 'true'} onChange={(v) => onChange(String(v))} label={field.label} />
        </div>
        {field.hint && <p className="mt-1 text-2xs text-fg-subtle">{field.hint}</p>}
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <Select
        label={field.label}
        required={field.required}
        hint={field.hint}
        error={error}
        containerClassName={span}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[{ value: '', label: `Select ${field.label.toLowerCase()}…` }, ...(field.options ?? [])]}
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.label}
        required={field.required}
        hint={field.hint}
        error={error}
        placeholder={field.placeholder}
        containerClassName={span ?? 'sm:col-span-2'}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  return (
    <Input
      label={field.label}
      required={field.required}
      hint={field.hint}
      error={error}
      placeholder={field.placeholder}
      containerClassName={span}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
      maxLength={field.maxLength}
      readOnly={field.readOnly}
      className={field.readOnly ? 'bg-surface-2' : undefined}
      value={value}
      onChange={(e) => onChange(field.upper ? e.target.value.toUpperCase() : e.target.value)}
    />
  )
}

/* ────────────────────── Shared row-action helpers ────────────────────── */

/**
 * A short, plain-English explanation shown at the top of a screen so a new
 * user knows what the page is for and what they can do on it.
 */
export function HowItWorks({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-card border border-border bg-surface-2 px-3.5 py-3">
      <p className="text-xs leading-relaxed text-fg-muted">{children}</p>
    </div>
  )
}

export function useLiveCrud<T extends StoredRow>(
  config: Omit<CrudConfig<T>, 'key' | 'seed'>,
  rows: T[],
  api: {
    create: (data: any) => Promise<any>
    update: (id: number, data: any) => Promise<any>
    delete: (id: number) => Promise<any>
  },
  onRefresh: () => void
) {
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [values, setValues] = useState<Values>({})
  const [errors, setErrors] = useState<Values>({})
  const [deleting, setDeleting] = useState<T | null>(null)
  const [saving, setSaving] = useState(false)

  const visibleFields = config.fields.filter((f) => !f.showIf || f.showIf(values))

  function openCreate(preset?: Values) {
    setEditing(null)
    setValues({ ...(config.defaults ?? {}), ...(preset ?? {}) })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(row: T) {
    setEditing(row)
    const v = config.toForm
      ? config.toForm(row)
      : Object.fromEntries(
          config.fields.map((f) => {
            const raw = (row as Record<string, unknown>)[f.name]
            return [f.name, raw === null || raw === undefined ? '' : String(raw)]
          }),
        )
    setValues(v)
    setErrors({})
    setFormOpen(true)
  }

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }))
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }))
  }

  function validate() {
    const e: Values = {}
    for (const f of visibleFields) {
      const v = (values[f.name] ?? '').trim()
      if (f.required && !v && f.type !== 'switch') {
        e[f.name] = f.label + ' is required.'
        continue
      }
      if (v && f.type === 'number' && Number.isNaN(Number(v))) {
        e[f.name] = 'Enter a number.'
        continue
      }
      if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        e[f.name] = 'Enter a valid email address.'
        continue
      }
      const custom = f.validate?.(v, values)
      if (custom) e[f.name] = custom
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) {
      toast.error('Validation failed', 'Please check the form for errors or missing fields.')
      return
    }
    const patch = config.fromForm(values, editing ?? undefined)
    setSaving(true)
    try {
      if (editing) {
        const id = (editing as any).id
        await api.update(id, { ...editing, ...patch })
        toast.success(config.entity + ' updated', config.titleOf(editing) + ' saved.')
      } else {
        await api.create(patch)
        toast.success(config.entity + ' created', 'New ' + config.entity.toLowerCase() + ' added.')
      }
      setFormOpen(false)
      onRefresh()
    } catch (err) {
      toast.error('Save failed', err instanceof Error ? err.message : 'Unknown error.')
    } finally {
      setSaving(false)
    }
  }

  function askDelete(row: T) {
    const reason = config.blockDelete?.(row)
    if (reason) {
      toast.error('Cannot delete', reason)
      return
    }
    setDeleting(row)
  }

  async function confirmDelete() {
    if (!deleting) return
    setSaving(true)
    try {
      const id = (deleting as any).id
      await api.delete(id)
      toast.success(config.entity + ' deleted', config.titleOf(deleting) + ' removed.')
      setDeleting(null)
      onRefresh()
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : 'Unknown error.')
    } finally {
      setSaving(false)
    }
  }

  const dialogs = (
    <>
      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={editing ? 'Edit ' + config.entity.toLowerCase() : 'Add ' + config.entity.toLowerCase()}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {editing ? 'Save changes' : 'Add ' + config.entity.toLowerCase()}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          {visibleFields.map((f) => (
            <FieldControl key={f.name} field={f} value={values[f.name] ?? ''} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
          ))}
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => !saving && setDeleting(null)}
        title={'Delete ' + config.entity.toLowerCase()}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={saving}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={saving}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{deleting ? config.titleOf(deleting) : ''}</span> will be removed from
          the list.
        </p>
      </Modal>
    </>
  )

  return { rows, openCreate, openEdit, askDelete, dialogs, editing, values, setValue: set }
}
