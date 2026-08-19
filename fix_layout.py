with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Pallets.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

import re

new_modal = """      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Add pallet' : 'Edit pallet'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Pallet number" required>
              <Input type="text" value={editing?.palletNo || ''} readOnly disabled />
            </Field>
            <Field label="Pallet type" required hint="Export pallets must be heat-treated and ISPM-15 stamped">
              <Select
                value={editing?.palletType || ''}
                onChange={(e) => setEditing({ ...editing, palletType: e.target.value as any })}
                required
              >
                {Object.entries(TYPE_LABEL).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Customer" required>
            <Input
              type="text"
              value={editing?.customer || ''}
              onChange={(e) => setEditing({ ...editing, customer: e.target.value })}
              required
              maxLength={255}
            />
          </Field>
          <Field label="Destination" required>
            <Input
              type="text"
              value={editing?.destination || ''}
              onChange={(e) => setEditing({ ...editing, destination: e.target.value })}
              required
              maxLength={255}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Carton capacity" required>
              <Input
                type="number"
                value={editing?.cartonCapacity || ''}
                onChange={(e) => setEditing({ ...editing, cartonCapacity: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Length (mm)" required>
              <Input
                type="number"
                value={editing?.lengthMm || ''}
                onChange={(e) => setEditing({ ...editing, lengthMm: Number(e.target.value) })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Width (mm)" required>
              <Input
                type="number"
                value={editing?.widthMm || ''}
                onChange={(e) => setEditing({ ...editing, widthMm: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Maximum stack height (mm)" required hint="Container door height limits this — 2,300 mm for a 40 ft high cube">
              <Input
                type="number"
                value={editing?.stackHeightMm || ''}
                onChange={(e) => setEditing({ ...editing, stackHeightMm: Number(e.target.value) })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Built by" required>
              <Input
                type="text"
                value={editing?.builtBy || ''}
                onChange={(e) => setEditing({ ...editing, builtBy: e.target.value })}
                required
                maxLength={100}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" type="submit">{isNew ? 'Add pallet' : 'Save'}</Button>
          </div>
        </form>
      </Modal>"""

# Replace the entire modal block
text = re.sub(r'      <Modal.*?<\/Modal>', new_modal, text, flags=re.DOTALL)

# Also ensure setEditing sets a placeholder for palletNo when adding a new pallet, just so it shows in the UI like in the screenshot
old_open_create = """                setEditing({
                  palletType: 'STANDARD',
                  cartonCapacity: 40,
                  lengthMm: 1200,
                  widthMm: 1000,
                  stackHeightMm: 1800,
                  builtBy: 'A. Ramesh',
                })"""

new_open_create = """                setEditing({
                  palletNo: `PLT/2607/${String(215 + pallets.length).padStart(4, '0')}`,
                  palletType: 'STANDARD',
                  cartonCapacity: 40,
                  lengthMm: 1200,
                  widthMm: 1000,
                  stackHeightMm: 1800,
                  builtBy: 'A. Ramesh',
                })"""
text = text.replace(old_open_create, new_open_create)

with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Pallets.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Done layout fix')
