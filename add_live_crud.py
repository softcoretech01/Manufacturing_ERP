with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\components\crud\CrudKit.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

live_crud = """
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
      if (v && f.type === 'email' && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)) {
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
    if (!validate()) return
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
"""

if 'export function useLiveCrud' not in text:
    text += live_crud
    with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\components\crud\CrudKit.tsx', 'w', encoding='utf-8') as f:
        f.write(text)
    print('Added useLiveCrud')
