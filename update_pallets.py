with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Pallets.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

import re

# Remove useCrud and seed imports
text = re.sub(r"import \{ useCrud \} from '@/components/crud/CrudKit'\n", "", text)
text = re.sub(r"import \{ cartons as seedCartons, pallets as seedPallets \} from '@/mock/dispatch'\n", "import { cartons as seedCartons } from '@/mock/dispatch'\n", text)
text = text.replace(
    "import { cartonApi } from '@/api/cartonApi'\n",
    "import { cartonApi } from '@/api/cartonApi'\nimport { palletApi } from '@/api/palletApi'\n"
)
if "palletApi" not in text:
    text = text.replace(
        "import { cn } from '@/lib/cn'\n",
        "import { cn } from '@/lib/cn'\nimport { palletApi } from '@/api/palletApi'\nimport { cartonApi } from '@/api/cartonApi'\nimport { Modal } from '@/components/ui/Modal'\nimport { Field } from '@/components/ui/Field'\n"
    )
text = text.replace(
    "import { useMemo, useState } from 'react'\n",
    "import { useMemo, useState, useEffect } from 'react'\n"
)

# Build the replacement for the CRUD hook
new_hook = '''
  const [pallets, setPallets] = useState<Pallet[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Pallet> | null>(null)
  const [isNew, setIsNew] = useState(false)

  const fetchPallets = async () => {
    setLoading(true)
    try {
      const data = await palletApi.getAll()
      setPallets(data)
    } catch (e) {
      toast.error('Failed to load pallets', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPallets()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    try {
      if (isNew) {
        await palletApi.create({
          ...editing,
          palletNo: 'AUTO',
          builtOn: new Date().toISOString(),
          cartonCount: 0,
          totalWeightKg: editing.palletType === 'EXPORT' ? 28 : 22,
          wrapped: false,
          strapped: false,
          labelPrinted: false,
          status: 'BUILDING'
        })
        toast.success('Pallet created successfully', 'The pallet has been recorded.')
      } else {
        await palletApi.update((editing as any).id, editing)
        toast.success('Pallet updated successfully', 'The pallet details have been saved.')
      }
      setEditing(null)
      fetchPallets()
    } catch (err) {
      toast.error('Failed to save', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleDelete = async (p: Pallet) => {
    if (p.cartonCount > 0) {
      toast.error('Cannot delete', `${p.palletNo} holds ${p.cartonCount} cartons. Take them off first.`)
      return
    }
    if (p.status === 'LOADED' || p.status === 'SHIPPED') {
      toast.error('Cannot delete', `${p.palletNo} has already been ${p.status.toLowerCase()}.`)
      return
    }
    if (confirm(`Are you sure you want to delete pallet ${p.palletNo}?`)) {
      try {
        await palletApi.delete((p as any).id)
        toast.success('Pallet deleted', `${p.palletNo} has been removed.`)
        fetchPallets()
      } catch (err) {
        toast.error('Failed to delete', err instanceof Error ? err.message : 'Unknown error')
      }
    }
  }

  const updateStatus = async (p: Pallet, changes: Partial<Pallet>) => {
    try {
      await palletApi.update((p as any).id, changes)
      fetchPallets()
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }
'''

crud_pattern = re.compile(r'  const seed = useMemo\(\(\) => seedPallets, \[\]\).*?const pallets = crud\.rows', re.DOTALL)
text = crud_pattern.sub(new_hook, text)

# Now replace crud method calls
old_open_create = """onClick={() => crud.openCreate({
                palletNo: `PLT/2607/${String(215 + pallets.length).padStart(4, '0')}`,
                palletType: 'STANDARD',
                cartonCapacity: '40',
                lengthMm: '1200',
                widthMm: '1000',
                stackHeightMm: '1800',
                builtBy: 'A. Ramesh',
              })}"""
new_open_create = """onClick={() => {
                setIsNew(true)
                setEditing({
                  palletType: 'STANDARD',
                  cartonCapacity: 40,
                  lengthMm: 1200,
                  widthMm: 1000,
                  stackHeightMm: 1800,
                  builtBy: 'A. Ramesh',
                })
              }}"""
text = text.replace(old_open_create, new_open_create)

text = text.replace('crud.update(p.uid, ', 'updateStatus(p, ')
text = text.replace('crud.openEdit(p)', '{ setIsNew(false); setEditing(p) }')
text = text.replace('crud.askDelete(p)', 'handleDelete(p)')

break_down_logic = """const on = cartons.filter((c) => c.palletNo === p.palletNo)
                for (const c of on) updateCarton(c.uid, { palletNo: null, status: 'SEALED' })
                crud.update(p.uid, { cartonCount: 0, totalWeightKg: p.palletType === 'EXPORT' ? 28 : 22, wrapped: false, strapped: false, status: 'BUILDING' })"""

new_break_down = """const on = cartons.filter((c) => c.palletNo === p.palletNo)
                Promise.all(on.map(c => cartonApi.update((c as any).id, { palletNo: null, status: 'SEALED' }))).then(() => {
                  updateStatus(p, { cartonCount: 0, totalWeightKg: p.palletType === 'EXPORT' ? 28 : 22, wrapped: false, strapped: false, status: 'BUILDING' })
                })"""
text = text.replace(break_down_logic, new_break_down)

text = text.replace('rowKey={(p) => p.uid}', 'rowKey={(p) => String((p as any).id || p.uid)}\n        loading={loading}')

modal_jsx = """      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Start a pallet' : 'Edit pallet'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {!isNew && (
            <Field label="Pallet number">
              <input type="text" value={editing?.palletNo || ''} readOnly className="form-input bg-surface-2 text-fg-muted" />
            </Field>
          )}
          <Field label="Pallet type" hint="Export pallets must be heat-treated and ISPM-15 stamped">
            <select
              value={editing?.palletType || ''}
              onChange={(e) => setEditing({ ...editing, palletType: e.target.value as any })}
              className="form-select"
              required
            >
              {Object.entries(TYPE_LABEL).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Customer">
            <input
              type="text"
              value={editing?.customer || ''}
              onChange={(e) => setEditing({ ...editing, customer: e.target.value })}
              className="form-input"
              required
              maxLength={255}
            />
          </Field>
          <Field label="Destination">
            <input
              type="text"
              value={editing?.destination || ''}
              onChange={(e) => setEditing({ ...editing, destination: e.target.value })}
              className="form-input"
              required
              maxLength={255}
            />
          </Field>
          <Field label="Carton capacity">
            <input
              type="number"
              value={editing?.cartonCapacity || ''}
              onChange={(e) => setEditing({ ...editing, cartonCapacity: Number(e.target.value) })}
              className="form-input"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Length (mm)">
              <input
                type="number"
                value={editing?.lengthMm || ''}
                onChange={(e) => setEditing({ ...editing, lengthMm: Number(e.target.value) })}
                className="form-input"
                required
              />
            </Field>
            <Field label="Width (mm)">
              <input
                type="number"
                value={editing?.widthMm || ''}
                onChange={(e) => setEditing({ ...editing, widthMm: Number(e.target.value) })}
                className="form-input"
                required
              />
            </Field>
          </div>
          <Field label="Maximum stack height (mm)" hint="Container door height limits this — 2,300 mm for a 40 ft high cube">
            <input
              type="number"
              value={editing?.stackHeightMm || ''}
              onChange={(e) => setEditing({ ...editing, stackHeightMm: Number(e.target.value) })}
              className="form-input"
              required
            />
          </Field>
          <Field label="Built by">
            <input
              type="text"
              value={editing?.builtBy || ''}
              onChange={(e) => setEditing({ ...editing, builtBy: e.target.value })}
              className="form-input"
              required
              maxLength={100}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" type="submit">Save</Button>
          </div>
        </form>
      </Modal>"""

text = text.replace('{crud.dialogs}', modal_jsx)

with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Pallets.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Done')
