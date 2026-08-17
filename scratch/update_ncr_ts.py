import re
file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Ncr.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports
if 'ncrsApi' not in content:
    content = content.replace("import { newUid } from '@/store/data'", "import { newUid } from '@/store/data'\nimport { ncrsApi } from '@/api/ncrs'")
    content = content.replace("import { useState } from 'react'", "import { useState, useEffect } from 'react'")

# Replace mock hooks and state
mock_state_old = """  const toast = useToast()
  const { ncrs, capas, defects, inspections } = useQualityData()
  const { rows, create, update, remove } = ncrs"""

mock_state_new = """  const toast = useToast()
  const { capas, defects, inspections } = useQualityData()
  const [rows, setRows] = useState<Ncr[]>([])

  const fetchNcrs = async () => {
    try {
      const data = await ncrsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch NCRs')
    }
  }

  useEffect(() => {
    fetchNcrs()
  }, [])"""

content = content.replace(mock_state_old, mock_state_new)

# Handle Create / Update / Delete
save_func_old = """  const save = () => {
    if (detail) {
      update(detail.uid, { ...detail, ...form })
      setDetail(null)
      toast.success('Saved', `${detail.docNo} updated.`)
    } else {
      const docNo = `NCR/26-27/${String(counts.all + 1).padStart(4, '0')}`
      create({ ...form, docNo, status: 'OPEN', raisedBy: 'Me', raisedOn: new Date().toISOString(), fiveWhys: emptyWhys(), containedAt: null, containment: '', rootCause: '', causeCategory: null, costImpact: 0, remarks: '', capaDocNo: null, closedOn: null })
      toast.success('Created', `${docNo} raised.`)
    }
    setFormOpen(false)
  }"""

save_func_new = """  const save = async () => {
    try {
      if (detail) {
        await ncrsApi.update((detail as any).id, { ...detail, ...form })
        setDetail(null)
        fetchNcrs()
        toast.success('Saved', `${detail.docNo} updated.`)
      } else {
        const nextCode = await ncrsApi.getNextCode()
        await ncrsApi.create({ ...form, docNo: nextCode.code, status: 'OPEN', raisedBy: 'Me', raisedOn: new Date().toISOString(), fiveWhys: emptyWhys(), containedAt: null, containment: '', rootCause: '', causeCategory: null, costImpact: 0, remarks: '', capaDocNo: null, closedOn: null })
        fetchNcrs()
        toast.success('Created', `${nextCode.code} raised.`)
      }
      setFormOpen(false)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save NCR')
    }
  }"""

content = content.replace(save_func_old, save_func_new)

delete_old = """<Button variant="danger" onClick={() => { if (confirmDelete) { remove(confirmDelete.uid); toast.success('Deleted', `${confirmDelete.docNo} was cancelled.`) } setConfirmDelete(null) }}>Cancel NCR</Button>"""
delete_new = """<Button variant="danger" onClick={() => { if (confirmDelete) { ncrsApi.remove((confirmDelete as any).id).then(() => { fetchNcrs(); toast.success('Deleted', `${confirmDelete.docNo} was cancelled.`) }).catch(e => toast.error('Error', e.message)) } setConfirmDelete(null) }}>Cancel NCR</Button>"""
content = content.replace(delete_old, delete_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
