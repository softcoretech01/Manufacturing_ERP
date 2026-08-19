file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Capa.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
content = content.replace("import { useState } from 'react'", "import { useState, useEffect } from 'react'")
content = content.replace("import { newUid } from '@/store/data'", "import { newUid } from '@/store/data'\nimport { capasApi } from '@/api/capas'")

# 2. Replace mock hooks with local state
old_mock = """  const toast = useToast()
  const { capas, ncrs } = useQualityData()
  const { rows, create, update, remove } = capas"""

new_mock = """  const toast = useToast()
  const { ncrs } = useQualityData()
  const [rows, setRows] = useState<Capa[]>([])

  const fetchCapas = async () => {
    try {
      const data = await capasApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch CAPAs')
    }
  }

  useEffect(() => {
    fetchCapas()
  }, [])"""

content = content.replace(old_mock, new_mock)

# 3. Fix live lookup to use id instead of uid
content = content.replace(
    "const live = detail ? rows.find((r) => r.uid === detail.uid) ?? detail : null",
    "const live = detail ? rows.find((r) => (r as any).id === (detail as any).id) ?? detail : null"
)

# 4. Fix openEdit — add null fallbacks
old_open_edit = """    setForm({ title: c.title, ncrDocNo: c.ncrDocNo, itemCode: c.itemCode, rootCause: c.rootCause, causeCategory: c.causeCategory, owner: c.owner, dueOn: c.dueOn })"""
new_open_edit = """    setForm({ title: c.title ?? '', ncrDocNo: c.ncrDocNo ?? '', itemCode: c.itemCode ?? '', rootCause: c.rootCause ?? '', causeCategory: c.causeCategory ?? 'METHOD', owner: c.owner ?? '', dueOn: c.dueOn ?? '' })"""
content = content.replace(old_open_edit, new_open_edit)

# 5. Replace save function
old_save = """  function save() {
    if (!validate()) return
    const patch = { title: form.title.trim(), ncrDocNo: form.ncrDocNo.trim(), itemCode: form.itemCode.trim(), rootCause: form.rootCause.trim(), causeCategory: form.causeCategory, owner: form.owner.trim(), dueOn: form.dueOn }
    if (editing) {
      update(editing.uid, { ...patch, version: editing.version + 1 })
      toast.success('CAPA updated', `${editing.docNo} saved.`)
    } else {
      const docNo = `CAPA/26-27/${String(rows.length + 11).padStart(4, '0')}`
      create({ ...patch, uid: newUid('cap'), docNo, correctiveAction: '', preventiveAction: '', raisedOn: new Date().toISOString().slice(0, 10), status: 'DRAFT', verificationMethod: '', verificationResult: '', verifiedBy: null, verifiedOn: null, closedOn: null, recurrenceChecked: false, effectivenessPct: null, version: 1 } as Capa)
      toast.success('CAPA raised', `${docNo} created. Both a corrective and a preventive action are needed before work starts.`)
    }
    setFormOpen(false)
  }"""

new_save = """  async function save() {
    if (!validate()) return
    const patch = { title: form.title.trim(), ncrDocNo: form.ncrDocNo.trim(), itemCode: form.itemCode.trim(), rootCause: form.rootCause.trim(), causeCategory: form.causeCategory, owner: form.owner.trim(), dueOn: form.dueOn }
    try {
      if (editing) {
        await capasApi.update((editing as any).id, { ...patch, version: editing.version + 1 })
        toast.success('CAPA updated', `${editing.docNo} saved.`)
      } else {
        const nextCode = await capasApi.getNextCode()
        await capasApi.create({ ...patch, docNo: nextCode.code, correctiveAction: '', preventiveAction: '', raisedOn: new Date().toISOString().slice(0, 10), status: 'DRAFT', verificationMethod: '', verificationResult: '', verifiedBy: null, verifiedOn: null, closedOn: null, recurrenceChecked: false, effectivenessPct: null, version: 1 } as any)
        toast.success('CAPA raised', `${nextCode.code} created. Both a corrective and a preventive action are needed before work starts.`)
      }
      fetchCapas()
      setFormOpen(false)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save CAPA')
    }
  }"""

content = content.replace(old_save, new_save)

# 6. Replace moveStatus update calls
old_move_ncrs = """      const parent = ncrs.rows.find((n) => n.docNo === c.ncrDocNo && n.status !== 'CLOSED')
      if (parent) {
        ncrs.update(parent.uid, { status: 'CLOSED', closedOn: new Date().toISOString().slice(0, 10), version: parent.version + 1 })
        toast.success('CAPA and NCR closed', `${c.docNo} closed, and ${parent.docNo} with it.`)
        update(c.uid, patch)
        setMoving(null)
        setDetail(null)
        return
      }
    }
    update(c.uid, patch)
    toast.success(STATUS_LABEL[to], `${c.docNo} moved to ${STATUS_LABEL[to].toLowerCase()}.`)
    setMoving(null)
    setDetail(null)
  }"""

new_move_ncrs = """      // Backend SP auto-closes linked NCR
      const parent = ncrs.rows.find((n) => n.docNo === c.ncrDocNo && n.status !== 'CLOSED')
      if (parent) {
        capasApi.update((c as any).id, { ...patch, ncrDocNo: c.ncrDocNo }).then(() => {
          fetchCapas()
          toast.success('CAPA and NCR closed', `${c.docNo} closed, and ${parent.docNo} with it.`)
        }).catch((e: any) => toast.error('Error', e.message))
        setMoving(null)
        setDetail(null)
        return
      }
    }
    capasApi.update((c as any).id, patch).then(() => {
      fetchCapas()
      toast.success(STATUS_LABEL[to], `${c.docNo} moved to ${STATUS_LABEL[to].toLowerCase()}.`)
    }).catch((e: any) => toast.error('Error', e.message))
    setMoving(null)
    setDetail(null)
  }"""

content = content.replace(old_move_ncrs, new_move_ncrs)

# 7. Replace inline update calls in the detail drawer
# Corrective action
content = content.replace(
    'onChange={(e) => update(live.uid, { correctiveAction: e.target.value, version: live.version + 1 })}',
    'onChange={(e) => capasApi.update((live as any).id, { correctiveAction: e.target.value }).then(() => fetchCapas())}'
)
# Preventive action
content = content.replace(
    'onChange={(e) => update(live.uid, { preventiveAction: e.target.value, version: live.version + 1 })}',
    'onChange={(e) => capasApi.update((live as any).id, { preventiveAction: e.target.value }).then(() => fetchCapas())}'
)
# Verification method
content = content.replace(
    'onChange={(e) => update(live.uid, { verificationMethod: e.target.value, version: live.version + 1 })}',
    'onChange={(e) => capasApi.update((live as any).id, { verificationMethod: e.target.value }).then(() => fetchCapas())}'
)
# Verification result
content = content.replace(
    'onChange={(e) => update(live.uid, { verificationResult: e.target.value, version: live.version + 1 })}',
    'onChange={(e) => capasApi.update((live as any).id, { verificationResult: e.target.value }).then(() => fetchCapas())}'
)
# Recurrence checked switch
content = content.replace(
    'onChange={(v) => update(live.uid, { recurrenceChecked: v, version: live.version + 1 })}',
    'onChange={(v) => capasApi.update((live as any).id, { recurrenceChecked: v }).then(() => fetchCapas())}'
)

# 8. Fix rowKey
content = content.replace(
    "rowKey={(c) => c.uid}",
    "rowKey={(c) => String((c as any).id ?? c.uid)}"
)

# 9. Fix delete button
old_delete = """<Button variant="danger" onClick={() => { if (confirmDelete) { remove(confirmDelete.uid); toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted.`) } setConfirmDelete(null) }}>Delete</Button>"""
new_delete = """<Button variant="danger" onClick={() => { if (confirmDelete) { capasApi.remove((confirmDelete as any).id).then(() => { fetchCapas(); toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted.`) }).catch((e: any) => toast.error('Error', e.message)) } setConfirmDelete(null) }}>Delete</Button>"""
content = content.replace(old_delete, new_delete)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Capa.tsx updated successfully')
