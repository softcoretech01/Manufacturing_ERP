const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/web/src/pages/quality/Defects.tsx');
let content = fs.readFileSync(filePath, 'utf-8');
content = content.replace(/\r\n/g, '\n');

// 1. Add API import
content = content.replace(
  "import { useMemo, useState } from 'react'",
  "import { useMemo, useState, useEffect } from 'react'\nimport { defectsApi } from '@/api/defects'"
);

// 2. Replace hooks
content = content.replace(
  "  const { defects, inspections } = useQualityData()\n  const { rows, create, update, remove } = defects",
  `  const { inspections } = useQualityData()
  const [rows, setRows] = useState<DefectType[]>([])

  const fetchDefects = async () => {
    try {
      const data = await defectsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch defects')
    }
  }

  useEffect(() => {
    fetchDefects()
  }, [])`
);

// 3. Replace usage of uid to id for editing/validation
content = content.replace(/d\.uid !== editing\?\.uid/g, "d.id !== editing?.id");
content = content.replace(/d\.uid !== editing\?\.id/g, "d.id !== editing?.id"); // Just in case it was already replaced
content = content.replace(/d\.uid/g, "d.id as number");

// 4. Update save()
const oldSave = `  function save() {
    const e: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()
    if (!code) e.code = 'A code is required.'
    else if (rows.some((d) => d.code === code && d.id !== editing?.id)) e.code = \`\${code} is already in the catalogue.\`
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!form.category.trim()) e.category = 'A category groups the defect on the Pareto.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch = { code, name: form.name.trim(), severity: form.severity, category: form.category.trim(), defaultCause: form.defaultCause, scrapCostPerUnit: Number(form.scrapCostPerUnit) || 0, reworkCostPerUnit: Number(form.reworkCostPerUnit) || 0, isActive: form.isActive }
    if (editing) { update(editing.uid, { ...patch, version: editing.version + 1 }); toast.success('Defect updated', \`\${code} saved.\`) }
    else { create({ ...patch, uid: newUid('dft'), version: 1 } as DefectType); toast.success('Defect added', \`\${code} can now be recorded on an inspection.\`) }
    setFormOpen(false)
  }`;

const oldSaveOriginal = `  function save() {
    const e: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()
    if (!code) e.code = 'A code is required.'
    else if (rows.some((d) => d.code === code && d.id !== editing?.id)) e.code = \`\${code} is already in the catalogue.\`
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!form.category.trim()) e.category = 'A category groups the defect on the Pareto.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch = { code, name: form.name.trim(), severity: form.severity, category: form.category.trim(), defaultCause: form.defaultCause, scrapCostPerUnit: Number(form.scrapCostPerUnit) || 0, reworkCostPerUnit: Number(form.reworkCostPerUnit) || 0, isActive: form.isActive }
    if (editing) { update(editing.id as number, { ...patch, version: editing.version + 1 }); toast.success('Defect updated', \`\${code} saved.\`) }
    else { create({ ...patch, uid: newUid('dft'), version: 1 } as DefectType); toast.success('Defect added', \`\${code} can now be recorded on an inspection.\`) }
    setFormOpen(false)
  }`;

// Note: Because I already replaced d.uid with d.id above, rows.some has d.id !== editing?.id
// And update(editing.uid... became update(editing.id as number...

const newSave = `  async function save() {
    const e: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()
    if (!code) e.code = 'A code is required.'
    else if (rows.some((d) => d.code === code && d.id !== editing?.id)) e.code = \`\${code} is already in the catalogue.\`
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!form.category.trim()) e.category = 'A category groups the defect on the Pareto.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch = { code, name: form.name.trim(), severity: form.severity, category: form.category.trim(), defaultCause: form.defaultCause, scrapCostPerUnit: Number(form.scrapCostPerUnit) || 0, reworkCostPerUnit: Number(form.reworkCostPerUnit) || 0, isActive: form.isActive }
    try {
      if (editing) { 
        await defectsApi.update(editing.id as number, patch); 
        toast.success('Defect updated', \`\${code} saved.\`) 
      } else { 
        await defectsApi.create(patch); 
        toast.success('Defect added', \`\${code} can now be recorded on an inspection.\`) 
      }
      await fetchDefects();
      setFormOpen(false)
    } catch (err) {
      toast.error('Error', 'Failed to save defect');
    }
  }`;

content = content.replace(oldSaveOriginal, newSave);

// Also replace the activation in MenuItem:
const oldActivate = `update(d.id as number, { isActive: !d.isActive, version: d.version + 1 }); toast.success(d.isActive ? 'Deactivated' : 'Activated', \`\${d.code} is now \${d.isActive ? 'hidden from' : 'available on'} the inspection screen.\`)`;
const newActivate = `defectsApi.update(d.id as number, { isActive: !d.isActive }).then(() => { fetchDefects(); toast.success(d.isActive ? 'Deactivated' : 'Activated', \`\${d.code} is now \${d.isActive ? 'hidden from' : 'available on'} the inspection screen.\`) })`;
content = content.replace(oldActivate, newActivate);

// 5. Update remove
const oldRemove = `remove(confirmDelete.id as number); toast.success('Deleted', \`\${confirmDelete.code} was soft-deleted.\`)`;
const newRemove = `defectsApi.remove(confirmDelete.id as number).then(() => { fetchDefects(); toast.success('Deleted', \`\${confirmDelete.code} was soft-deleted.\`) })`;
content = content.replace(oldRemove, newRemove);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Update script successful');
