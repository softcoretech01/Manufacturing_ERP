import re

file_path = r"d:\Manuf ERP\11AugERP\Manufacturing_ERP\web\src\pages\engineering\Changes.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace(
"""import { newUid, useCollection } from '@/store/data'
import {
  boms as seedBoms,
  engChanges as seedChanges,
  products as seedProducts,
  routings as seedRoutings,
  tools as seedTools,
  workCentres as seedWorkCentres,
} from '@/mock/engineering'
import { items as masterItems } from '@/mock/masters'""",
"""import { newUid } from '@/store/data'
import { api } from '@/lib/api'
import { useEffect } from 'react'
import type { Item } from '@/types/master'"""
)

# 2. FormState
content = content.replace(
"""interface FormState {
  changeType: EngChange['changeType']""",
"""interface FormState {
  docNo: string
  changeType: EngChange['changeType']"""
)

content = content.replace(
"""const emptyForm: FormState = {
  changeType: 'ECR',""",
"""const emptyForm: FormState = {
  docNo: '',
  changeType: 'ECR',"""
)

# 3. Data fetching
old_hooks = """  const toast = useToast()
  const { rows, create, update, remove } = useCollection<EngChange>('eng:changes', useMemo(() => seedChanges, []))
  const { rows: boms, create: createBom, update: updateBom } = useCollection<Bom>('eng:boms', useMemo(() => seedBoms, []))
  const { rows: products } = useCollection<EngProduct>('eng:products', useMemo(() => seedProducts, []))
  const { rows: routings } = useCollection<Routing>('eng:routings', useMemo(() => seedRoutings, []))
  const { rows: workCentres } = useCollection<EngWorkCentre>('eng:workcentres', useMemo(() => seedWorkCentres, []))
  const { rows: tools } = useCollection<Tool>('eng:tools', useMemo(() => seedTools, []))

  const ctx = { boms, routings, workCentres, tools, items: masterItems, products }"""

new_hooks = """  const toast = useToast()
  
  const [rows, setRows] = useState<EngChange[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [products, setProducts] = useState<EngProduct[]>([])
  const [routings, setRoutings] = useState<Routing[]>([])
  const [workCentres, setWorkCentres] = useState<EngWorkCentre[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [masterItems, setMasterItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)

  async function loadData() {
    try {
      const [chgs, bs, ps, rs, wcs, ts, is] = await Promise.all([
        api.getEngChanges().catch(() => []),
        api.getBoms().catch(() => []),
        api.getEngProducts().catch(() => []),
        api.getRoutings().catch(() => []),
        api.getEngWorkCentres().catch(() => []),
        api.getEngTools().catch(() => []),
        api.getItems().catch(() => [])
      ])
      setRows(chgs)
      setBoms(bs)
      setProducts(ps)
      setRoutings(rs)
      setWorkCentres(wcs)
      setTools(ts)
      setMasterItems(is)
    } catch (err) {
      toast.error('Error', 'Failed to load live engineering data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const ctx = { boms, routings, workCentres, tools, items: masterItems, products }"""

content = content.replace(old_hooks, new_hooks)

# 4. openCreate / next code logic
old_open_create = """  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, productCode: products[0]?.code ?? '', effectiveFrom: new Date().toISOString().slice(0, 10) })
    setErrors({})
    setFormOpen(true)
  }"""

new_open_create = """  async function openCreate() {
    setEditing(null)
    try {
      const docNo = await api.getNextEngChangeCode('ECR')
      setForm({ ...emptyForm, docNo, productCode: products[0]?.code ?? '', effectiveFrom: new Date().toISOString().slice(0, 10) })
    } catch (e) {
      setForm({ ...emptyForm, productCode: products[0]?.code ?? '', effectiveFrom: new Date().toISOString().slice(0, 10) })
    }
    setErrors({})
    setFormOpen(true)
  }
  
  async function handleChangeType(val: string) {
    const type = val as EngChange['changeType']
    try {
      const docNo = await api.getNextEngChangeCode(type)
      setForm({ ...form, changeType: type, docNo })
    } catch (e) {
      setForm({ ...form, changeType: type })
    }
  }"""

content = content.replace(old_open_create, new_open_create)

# 5. openEdit
old_open_edit = """    setForm({
      changeType: c.changeType,"""

new_open_edit = """    setForm({
      docNo: c.docNo,
      changeType: c.changeType,"""
content = content.replace(old_open_edit, new_open_edit)

# 6. save
old_save = """    if (editing) {
      update(editing.uid, { ...common, version: editing.version + 1 })
      toast.success('Change saved', `${editing.docNo} updated.`)
    } else {
      const docNo = nextDocNo(form.changeType, rows)
      create({
        ...common,
        uid: newUid('ecn'),
        docNo,
        requestedBy: 'Rahul Iyer',
        requestedOn: new Date().toISOString().slice(0, 10),
        sourceEcr: null,
        resultingBom: null,
        createdAt: new Date().toISOString(),
        version: 1,
      } as EngChange)
      toast.success(`${form.changeType} raised`, `${docNo} created${submit ? ' and sent for review' : ' as a draft'}.`)
    }
    setFormOpen(false)"""

new_save = """    try {
      if (editing) {
        await api.updateEngChange(editing.uid, { ...common, version: editing.version + 1 })
        toast.success('Change saved', `${editing.docNo} updated.`)
      } else {
        const payload: Omit<EngChange, 'uid'> = {
          ...common,
          docNo: form.docNo,
          requestedBy: 'Rahul Iyer',
          requestedOn: new Date().toISOString().slice(0, 10),
          sourceEcr: null,
          resultingBom: null,
          createdAt: new Date().toISOString(),
          version: 1,
        }
        await api.createEngChange(payload)
        toast.success(`${form.changeType} raised`, `${form.docNo} created${submit ? ' and sent for review' : ' as a draft'}.`)
      }
      setFormOpen(false)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to save engineering change')
    }"""
content = content.replace(old_save, new_save)


# 7. promote
old_promote = """  function promote(c: EngChange) {
    const docNo = nextDocNo('ECN', rows)
    create({
      ...c,
      uid: newUid('ecn'),
      docNo,
      changeType: 'ECN',
      status: 'PENDING_APPROVAL',
      sourceEcr: c.docNo,
      approvals: APPROVAL_CHAIN.map((a) => ({ ...a, status: 'PENDING' as const })),
      createdAt: new Date().toISOString(),
      version: 1,
    } as EngChange)
    update(c.uid, { status: 'CANCELLED' })
    toast.success('Promoted to a change notice', `${docNo} raised from ${c.docNo} and sent for approval.`)
    setDetail(null)
  }"""

new_promote = """  async function promote(c: EngChange) {
    try {
      const docNo = await api.getNextEngChangeCode('ECN')
      await api.createEngChange({
        ...c,
        docNo,
        changeType: 'ECN',
        status: 'PENDING_APPROVAL',
        sourceEcr: c.docNo,
        approvals: APPROVAL_CHAIN.map((a) => ({ ...a, status: 'PENDING' as const })),
        createdAt: new Date().toISOString(),
        version: 1,
      } as any)
      await api.updateEngChange(c.uid, { status: 'CANCELLED' })
      toast.success('Promoted to a change notice', `${docNo} raised from ${c.docNo} and sent for approval.`)
      setDetail(null)
      loadData()
    } catch (e) {
      toast.error('Error', 'Failed to promote to ECN')
    }
  }"""
content = content.replace(old_promote, new_promote)

# 8. approveLevel
old_approve_level = """    update(c.uid, { approvals, status: allDone ? 'APPROVED' : 'PENDING_APPROVAL' })
    toast.success(
      allDone ? 'Fully approved' : `Level ${next.level} approved`,
      allDone ? `${c.docNo} can now be implemented against the BOM.` : `${c.docNo} moves to level ${next.level + 1}.`,
    )
    setDetail(allDone ? null : { ...c, approvals, status: allDone ? 'APPROVED' : 'PENDING_APPROVAL' })"""

new_approve_level = """    api.updateEngChange(c.uid, { approvals, status: allDone ? 'APPROVED' : 'PENDING_APPROVAL' }).then(() => {
      toast.success(
        allDone ? 'Fully approved' : `Level ${next.level} approved`,
        allDone ? `${c.docNo} can now be implemented against the BOM.` : `${c.docNo} moves to level ${next.level + 1}.`,
      )
      setDetail(allDone ? null : { ...c, approvals, status: allDone ? 'APPROVED' : 'PENDING_APPROVAL' })
      loadData()
    }).catch(() => toast.error('Error', 'Failed to approve'))"""
content = content.replace(old_approve_level, new_approve_level)

# 9. reject
old_reject = """    update(c.uid, { approvals, status: 'REJECTED' })
    toast.success('Rejected', `${c.docNo} sent back to ${c.requestedBy}.`)
    setRejecting(null)
    setRejectNote('')
    setDetail(null)"""

new_reject = """    api.updateEngChange(c.uid, { approvals, status: 'REJECTED' }).then(() => {
      toast.success('Rejected', `${c.docNo} sent back to ${c.requestedBy}.`)
      setRejecting(null)
      setRejectNote('')
      setDetail(null)
      loadData()
    }).catch(() => toast.error('Error', 'Failed to reject'))"""
content = content.replace(old_reject, new_reject)

# 10. implement
old_implement = """      createBom({
        ...revised,
        uid: newUid('bom'),
        status: 'ACTIVE',
        effectiveFrom: c.effectiveFrom,
        effectiveTo: null,
        createdBy: c.requestedBy,
        createdAt: new Date().toISOString(),
        approvedBy: 'Meera Rajan',
        approvedAt: new Date().toISOString(),
        sourceEcn: c.docNo,
        changeReason: c.title,
      })
      updateBom(baseBom.uid, { status: 'SUPERSEDED', effectiveTo: c.effectiveFrom })
      produced.push(`${docNo} R${revised.revision}`)
    }

    update(c.uid, { status: 'IMPLEMENTED', resultingBom: produced.join(', ') || null })
    if (warnings.length) {
      toast.error('Implemented with warnings', warnings[0])
    } else {
      toast.success('Change implemented', `${produced.join(', ')} is live. Costing and planning pick it up immediately.`)
    }
    setImplementing(null)
    setDetail(null)
  }"""

new_implement = """      await api.createBom({
        ...revised,
        status: 'ACTIVE',
        effectiveFrom: c.effectiveFrom,
        effectiveTo: null,
        createdBy: c.requestedBy,
        createdAt: new Date().toISOString(),
        approvedBy: 'Meera Rajan',
        approvedAt: new Date().toISOString(),
        sourceEcn: c.docNo,
        changeReason: c.title,
      } as any)
      await api.updateBom(baseBom.uid, { status: 'SUPERSEDED', effectiveTo: c.effectiveFrom })
      produced.push(`${docNo} R${revised.revision}`)
    }

    await api.updateEngChange(c.uid, { status: 'IMPLEMENTED', resultingBom: produced.join(', ') || null })
    if (warnings.length) {
      toast.error('Implemented with warnings', warnings[0])
    } else {
      toast.success('Change implemented', `${produced.join(', ')} is live. Costing and planning pick it up immediately.`)
    }
    setImplementing(null)
    setDetail(null)
    loadData()
  }"""
content = content.replace(old_implement, new_implement)
# wait, implement needs to be async
content = content.replace("function implement(c: EngChange) {", "async function implement(c: EngChange) {")

# 11. Dropdown calls and deletion
content = content.replace("""                update(c.uid, {
                  status: c.changeType === 'ECN' ? 'PENDING_APPROVAL' : 'UNDER_REVIEW',
                  approvals: c.changeType === 'ECN' ? APPROVAL_CHAIN.map((a) => ({ ...a, status: 'PENDING' as const })) : [],
                })
                toast.success('Submitted', `${c.docNo} sent for review.`)""", """                api.updateEngChange(c.uid, {
                  status: c.changeType === 'ECN' ? 'PENDING_APPROVAL' : 'UNDER_REVIEW',
                  approvals: c.changeType === 'ECN' ? APPROVAL_CHAIN.map((a) => ({ ...a, status: 'PENDING' as const })) : [],
                }).then(() => {
                  toast.success('Submitted', `${c.docNo} sent for review.`)
                  loadData()
                })""")

# Delete Confirm Modal - actually the file doesn't have a direct delete action, it has `setConfirmDelete(c)`.
# Let's see how confirmDelete is used... Oh wait, in the file I extracted earlier, there was no `Modal` for `confirmDelete` shown, only `setConfirmDelete`.
# Let's add it or replace `setConfirmDelete` with actual deletion if it's there.
old_delete_action = """              onClick={() => setConfirmDelete(c)}"""
new_delete_action = """              onClick={async () => {
                if(confirm('Are you sure you want to delete this change?')) {
                  await api.deleteEngChange(c.uid)
                  toast.success('Deleted', `${c.docNo} has been deleted.`)
                  loadData()
                }
              }}"""
content = content.replace(old_delete_action, new_delete_action)

# 12. Add the requested field: 'Change Code'
old_form_ui = """        <div className="grid gap-3.5 sm:grid-cols-4">
          <Select
            label="Raise as"
            value={form.changeType}
            disabled={!!editing}
            onChange={(e) => setForm({ ...form, changeType: e.target.value as EngChange['changeType'] })}"""

new_form_ui = """        <div className="grid gap-3.5 sm:grid-cols-4">
          <Input 
            label="Change Code" 
            value={form.docNo} 
            disabled 
            hint="Auto-generated" 
          />
          <Select
            label="Raise as"
            value={form.changeType}
            disabled={!!editing}
            onChange={(e) => handleChangeType(e.target.value)}"""
content = content.replace(old_form_ui, new_form_ui)


with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Changes.tsx refactored.")
