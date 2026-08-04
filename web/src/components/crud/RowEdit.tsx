import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useCollection, type StoredRow } from '@/store/data'

/**
 * Edit and delete for a list that already has its own screen logic.
 *
 * `useCrud` is the right tool when a screen is essentially a maintained
 * register — it owns the Add button, the form and the store. Many transaction
 * lists are not that: they already read their collection, already have their own
 * actions, and only lack the two things every row in the product should offer —
 * edit it, or delete it.
 *
 * This provides exactly those two, and derives the form from the data rather
 * than asking each screen to declare a field list. It reads the collection under
 * the same key the screen uses, so both see one set of records.
 */

export interface RowEditConfig<T extends StoredRow> {
  /** Same storage key the screen passes to useCollection. */
  key: string
  seed: T[]
  /** Singular noun for messages: 'Batch', 'Shipment'. */
  entity: string
  /** Label used in the dialogs. */
  titleOf: (row: T) => string
  /** Fields to expose, in order. Omit to derive every editable scalar. */
  fields?: string[]
  /** Extra names to keep out of the derived form. */
  omit?: string[]
  /** Return a reason to refuse deletion. */
  blockDelete?: (row: T) => string | undefined
  /** Return a reason to refuse editing. */
  blockEdit?: (row: T) => string | undefined
}

/** Never editable: identity, audit and derived columns. */
const ALWAYS_OMIT = new Set([
  'uid',
  'deletedAt',
  'deletedBy',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'version',
  'barcode',
  'contents',
])

interface DerivedField {
  name: string
  label: string
  kind: 'text' | 'number' | 'date' | 'switch' | 'textarea' | 'select'
  options?: string[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T/

/** "grossWeightKg" → "Gross weight kg"; "docNo" → "Doc no". */
function humanise(name: string) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Works out an editable form from the records themselves. A field's type comes
 * from the first non-null value found across the rows, so `string | null`
 * columns are still typed correctly. A short string field with few distinct
 * values across the data is offered as a picker rather than free text — that is
 * almost always a status or a category.
 */
function deriveFields<T extends StoredRow>(rows: T[], only?: string[], omit?: string[]): DerivedField[] {
  if (!rows.length) return []
  const skip = new Set([...ALWAYS_OMIT, ...(omit ?? [])])
  const names = only ?? Object.keys(rows[0] as Record<string, unknown>)
  const out: DerivedField[] = []

  for (const name of names) {
    if (skip.has(name)) continue
    const values = rows.map((r) => (r as Record<string, unknown>)[name]).filter((v) => v !== null && v !== undefined)
    const sample = values[0]
    if (sample === undefined) continue
    if (Array.isArray(sample) || typeof sample === 'object') continue

    if (typeof sample === 'boolean') {
      out.push({ name, label: humanise(name), kind: 'switch' })
      continue
    }
    if (typeof sample === 'number') {
      out.push({ name, label: humanise(name), kind: 'number' })
      continue
    }
    if (typeof sample === 'string') {
      if (DATE_RE.test(sample)) {
        out.push({ name, label: humanise(name), kind: 'date' })
        continue
      }
      if (DATETIME_RE.test(sample)) {
        // Timestamps are set by the events that produce them, not typed in.
        continue
      }
      const distinct = [...new Set(values as string[])]
      const looksEnumerated =
        distinct.length > 1 &&
        distinct.length <= 8 &&
        distinct.length < values.length &&
        distinct.every((v) => v.length <= 24 && /^[A-Z0-9_ -]+$/.test(v))
      if (looksEnumerated) {
        out.push({ name, label: humanise(name), kind: 'select', options: distinct.sort() })
        continue
      }
      const longest = Math.max(...(values as string[]).map((v) => v.length))
      out.push({ name, label: humanise(name), kind: longest > 80 ? 'textarea' : 'text' })
    }
  }

  return out
}

export function useRowEdit<T extends StoredRow>(config: RowEditConfig<T>) {
  const toast = useToast()
  const seed = useMemo(() => config.seed, [config.seed])
  const store = useCollection<T>(config.key, seed)

  const [editing, setEditing] = useState<T | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<T | null>(null)

  const fields = useMemo(
    () => deriveFields(store.rows.length ? store.rows : seed, config.fields, config.omit),
    [store.rows, seed, config.fields, config.omit],
  )

  function openEdit(row: T) {
    const reason = config.blockEdit?.(row)
    if (reason) {
      toast.error(`Cannot edit this ${config.entity.toLowerCase()}`, reason)
      return
    }
    setEditing(row)
    setValues(
      Object.fromEntries(
        fields.map((f) => {
          const raw = (row as Record<string, unknown>)[f.name]
          return [f.name, raw === null || raw === undefined ? '' : String(raw)]
        }),
      ),
    )
    setErrors({})
  }

  function askDelete(row: T) {
    const reason = config.blockDelete?.(row)
    if (reason) {
      toast.error('Cannot delete', reason)
      return
    }
    setDeleting(row)
  }

  function save() {
    if (!editing) return
    const e: Record<string, string> = {}
    for (const f of fields) {
      const v = (values[f.name] ?? '').trim()
      if (f.kind === 'number' && v && Number.isNaN(Number(v))) e[f.name] = 'Enter a number.'
    }
    if (Object.keys(e).length) {
      setErrors(e)
      return
    }

    const patch: Record<string, unknown> = {}
    for (const f of fields) {
      const raw = (values[f.name] ?? '').trim()
      const before = (editing as Record<string, unknown>)[f.name]
      if (f.kind === 'switch') {
        patch[f.name] = raw === 'true'
      } else if (f.kind === 'number') {
        patch[f.name] = raw === '' ? 0 : Number(raw)
      } else {
        // A field that was null and is still blank stays null rather than ''.
        patch[f.name] = raw === '' && (before === null || before === undefined) ? before : raw
      }
    }

    store.update(editing.uid, patch as Partial<T>)
    toast.success(`${config.entity} updated`, `${config.titleOf(editing)} saved.`)
    setEditing(null)
  }

  /** Drop into a screen's `rowActions` to get the two standard entries. */
  function actions(row: T): ReactNode {
    return (
      <>
        <MenuItem label={`Edit the ${config.entity.toLowerCase()}`} onClick={() => openEdit(row)} />
        <MenuItem label={`Delete the ${config.entity.toLowerCase()}`} danger onClick={() => askDelete(row)} />
      </>
    )
  }

  const dialogs = (
    <>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${config.entity.toLowerCase()} — ${config.titleOf(editing)}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          {fields.map((f) => {
            const value = values[f.name] ?? ''
            const onChange = (v: string) => {
              setValues((s) => ({ ...s, [f.name]: v }))
              if (errors[f.name]) setErrors((s) => ({ ...s, [f.name]: '' }))
            }

            if (f.kind === 'switch') {
              return (
                <div key={f.name} className="flex h-9 items-center">
                  <Switch checked={value === 'true'} onChange={(v) => onChange(String(v))} label={f.label} />
                </div>
              )
            }
            if (f.kind === 'select') {
              return (
                <Select
                  key={f.name}
                  label={f.label}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  error={errors[f.name]}
                  options={(f.options ?? []).map((o) => ({ value: o, label: o.replace(/_/g, ' ').toLowerCase() }))}
                />
              )
            }
            if (f.kind === 'textarea') {
              return (
                <Textarea
                  key={f.name}
                  label={f.label}
                  containerClassName="sm:col-span-2"
                  rows={3}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  error={errors[f.name]}
                />
              )
            }
            return (
              <Input
                key={f.name}
                label={f.label}
                type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                error={errors[f.name]}
              />
            )
          })}
          {fields.length === 0 && (
            <p className="text-sm text-fg-muted sm:col-span-2">
              This record has no directly editable fields — it is derived from documents raised elsewhere.
            </p>
          )}
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
            <Button
              variant="danger"
              onClick={() => {
                if (!deleting) return
                store.remove(deleting.uid)
                toast.success(
                  `${config.entity} deleted`,
                  `${config.titleOf(deleting)} removed. It is marked deleted rather than erased, so the audit trail stays intact and it can be restored.`,
                )
                setDeleting(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{deleting ? config.titleOf(deleting) : ''}</span> will be removed from the list.
          Nothing is erased — the record is flagged deleted, which keeps the history and any document referencing it intact.
        </p>
      </Modal>
    </>
  )

  return { ...store, openEdit, askDelete, actions, dialogs, editing }
}
