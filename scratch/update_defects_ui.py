import os

file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Defects.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update save method
old_save = """  async function save() {
    const e: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()
    if (!code) e.code = 'A code is required.'
    else if (rows.some((d) => d.code === code && d.id !== editing?.id)) e.code = `${code} is already in the catalogue.`
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!form.category.trim()) e.category = 'A category groups the defect on the Pareto.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch = { code, name: form.name.trim(), severity: form.severity, category: form.category.trim(), defaultCause: form.defaultCause, scrapCostPerUnit: Number(form.scrapCostPerUnit) || 0, reworkCostPerUnit: Number(form.reworkCostPerUnit) || 0, isActive: form.isActive }"""

new_save = """  async function save() {
    const e: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()
    if (editing && !code) e.code = 'A code is required.'
    else if (editing && rows.some((d) => d.code === code && d.id !== editing?.id)) e.code = `${code} is already in the catalogue.`
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!form.category.trim()) e.category = 'A category groups the defect on the Pareto.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch: any = { name: form.name.trim(), severity: form.severity, category: form.category.trim(), defaultCause: form.defaultCause, scrapCostPerUnit: Number(form.scrapCostPerUnit) || 0, reworkCostPerUnit: Number(form.reworkCostPerUnit) || 0, isActive: form.isActive }
    if (editing) patch.code = code"""

content = content.replace(old_save, new_save)

# 2. Update Input
old_input = '<Input label="Code" required maxLength={50} value={form.code} error={errors.code} placeholder="DF-019" onChange={(e) => setForm({ ...form, code: e.target.value })} />'
new_input = '<Input label="Code" disabled value={editing ? form.code : ""} placeholder={editing ? "" : "Auto-generated"} onChange={(e) => setForm({ ...form, code: e.target.value })} />'

content = content.replace(old_input, new_input)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Update Defects.tsx UI successful")
