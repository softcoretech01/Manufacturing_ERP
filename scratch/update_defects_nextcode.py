import os

file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Defects.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_openCreate = """  function openCreate() {
    setEditing(null)
    setForm({ code: '', name: '', severity: 'MAJOR', category: '', defaultCause: 'MACHINE', scrapCostPerUnit: '0', reworkCostPerUnit: '0', isActive: true })
    setErrors({}); setFormOpen(true)
  }"""

new_openCreate = """  function openCreate() {
    setEditing(null)
    setForm({ code: 'Loading...', name: '', severity: 'MAJOR', category: '', defaultCause: 'MACHINE', scrapCostPerUnit: '0', reworkCostPerUnit: '0', isActive: true })
    setErrors({}); setFormOpen(true)
    defectsApi.getNextCode().then((res) => {
      setForm(prev => ({ ...prev, code: res.code }))
    }).catch(() => {
      setForm(prev => ({ ...prev, code: 'Auto-generated' }))
    })
  }"""

content = content.replace(old_openCreate, new_openCreate)

# update input to show form.code regardless of editing
old_input = '<Input label="Code" disabled value={editing ? form.code : ""} placeholder={editing ? "" : "Auto-generated"} onChange={(e) => setForm({ ...form, code: e.target.value })} />'
new_input = '<Input label="Code" disabled value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />'

content = content.replace(old_input, new_input)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Update Defects.tsx next-code successful")
