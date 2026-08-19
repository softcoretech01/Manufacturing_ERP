file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Complaints.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
content = content.replace("import { useMemo, useState } from 'react'", "import { useMemo, useState, useEffect } from 'react'")
content = content.replace("import { newUid } from '@/store/data'", "import { newUid } from '@/store/data'\nimport { complaintsApi } from '@/api/complaints'")

# 2. Replace mock hooks with local state
old_mock = """  const toast = useToast()
  const { complaints, ncrs, capas } = useQualityData()
  const { rows, create, update, remove } = complaints"""

new_mock = """  const toast = useToast()
  const { ncrs, capas } = useQualityData()
  const [rows, setRows] = useState<Complaint[]>([])

  const fetchComplaints = async () => {
    try {
      const data = await complaintsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch complaints')
    }
  }

  useEffect(() => {
    fetchComplaints()
  }, [])"""
content = content.replace(old_mock, new_mock)

# 3. Replace advance function
old_advance = """  function advance(c: Complaint, to: ComplaintStatus) {
    const b = stepBlockers(c, to)
    if (b.length) { toast.error(b[0]); return }
    update(c.uid, {
      status: to,
      closedOn: to === 'CLOSED' || to === 'REJECTED' ? new Date().toISOString().slice(0, 10) : null,
    })
    toast.success(`${c.docNo} → ${STATUS_LABEL[to]}`)
    setAdvancing(null)
  }"""
new_advance = """  function advance(c: Complaint, to: ComplaintStatus) {
    const b = stepBlockers(c, to)
    if (b.length) { toast.error(b[0]); return }
    complaintsApi.update((c as any).id, {
      status: to,
      closedOn: to === 'CLOSED' || to === 'REJECTED' ? new Date().toISOString().slice(0, 10) : null,
    }).then(() => {
      fetchComplaints()
      toast.success(`${c.docNo} → ${STATUS_LABEL[to]}`)
      setAdvancing(null)
    }).catch((e: any) => toast.error('Error', e.message))
  }"""
content = content.replace(old_advance, new_advance)

# 4. Replace save function
old_save = """  function save() {
    if (!editing) return
    const problems: string[] = []
    if (!editing.customerName?.trim()) problems.push('Name the customer.')
    if (!editing.itemCode?.trim()) problems.push('Which item is being complained about?')
    if (!editing.complaintType?.trim()) problems.push('Give the complaint a type so it can be counted.')
    if ((editing.qtyComplained ?? 0) <= 0) problems.push('How many units are affected?')
    if ((editing.qtyComplained ?? 0) > (editing.qtySupplied ?? 0)) problems.push('More units complained about than were supplied — check the quantities.')
    if ((editing.description ?? '').trim().length < 10) problems.push('Describe what the customer reported.')
    if (problems.length) { toast.error(problems[0]); return }

    if (editing.uid) {
      update(editing.uid, editing as Complaint)
      toast.success(`${editing.docNo} updated`)
    } else {
      const seq = live.length + 31
      create({ ...(BLANK() as Complaint), ...(editing as Complaint), uid: newUid('cmp'), docNo: `CMP/26-27/${String(seq).padStart(4, '0')}` })
      toast.success('Complaint logged')
    }
    setEditing(null)
  }"""

new_save = """  async function save() {
    if (!editing) return
    const problems: string[] = []
    if (!(editing.customerName ?? '').trim()) problems.push('Name the customer.')
    if (!(editing.itemCode ?? '').trim()) problems.push('Which item is being complained about?')
    if (!(editing.complaintType ?? '').trim()) problems.push('Give the complaint a type so it can be counted.')
    if ((editing.qtyComplained ?? 0) <= 0) problems.push('How many units are affected?')
    if ((editing.qtyComplained ?? 0) > (editing.qtySupplied ?? 0)) problems.push('More units complained about than were supplied — check the quantities.')
    if ((editing.description ?? '').trim().length < 10) problems.push('Describe what the customer reported.')
    if (problems.length) { toast.error(problems[0]); return }

    try {
      if (editing.docNo) {
        await complaintsApi.update((editing as any).id, editing as Complaint)
        toast.success(`${editing.docNo} updated`)
      } else {
        await complaintsApi.create({ ...(BLANK() as Complaint), ...(editing as Complaint) } as any)
        toast.success('Complaint logged')
      }
      fetchComplaints()
      setEditing(null)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save')
    }
  }"""
content = content.replace(old_save, new_save)

# 5. Replace removeRow function
old_remove_row = """  function removeRow(c: Complaint) {
    if (c.status !== 'LOGGED') { toast.error('The investigation has already started. Reject it with a reason rather than deleting the record.'); return }
    remove(c.uid)
    if (openUid === c.uid) setOpenUid(null)
    toast.success(`${c.docNo} removed`)
  }"""

new_remove_row = """  function removeRow(c: Complaint) {
    if (c.status !== 'LOGGED') { toast.error('The investigation has already started. Reject it with a reason rather than deleting the record.'); return }
    complaintsApi.remove((c as any).id).then(() => {
      fetchComplaints()
      if (openUid === c.uid) setOpenUid(null)
      toast.success(`${c.docNo} removed`)
    }).catch((e: any) => toast.error('Error', e.message))
  }"""
content = content.replace(old_remove_row, new_remove_row)

# 6. Replace edit menu action to pass ?? '' safe values
old_edit_action = """<MenuItem label="Edit" onClick={() => setEditing({ ...c })} />"""
new_edit_action = """<MenuItem label="Edit" onClick={() => setEditing({ ...c, customerName: c.customerName ?? '', complaintType: c.complaintType ?? '', itemCode: c.itemCode ?? '', itemName: c.itemName ?? '', batchNo: c.batchNo ?? '', productionOrderNo: c.productionOrderNo ?? '', invoiceNo: c.invoiceNo ?? '', description: c.description ?? '', owner: c.owner ?? '', rootCause: c.rootCause ?? '', remarks: c.remarks ?? '' })} />"""
content = content.replace(old_edit_action, new_edit_action)

# 7. Add null fallbacks to stepBlockers for safety
old_blockers = """function stepBlockers(c: Complaint, to: ComplaintStatus): string[] {
  const out: string[] = []
  if (to === 'UNDER_INVESTIGATION' && !c.owner.trim()) out.push('Name the person who will investigate.')
  if (to === 'ROOT_CAUSE_IDENTIFIED') {
    if (c.rootCause.trim().length < 10) out.push('Record the root cause — a sentence, not a word.')
    if (!c.causeCategory) out.push('Classify the cause so it can be counted in the Pareto.')
  }
  if (to === 'RESOLVED') {
    if (c.resolution === 'PENDING') out.push('Decide the resolution: replacement, credit note, repair, or no fault found.')
    if (c.resolution !== 'NO_FAULT_FOUND' && c.resolutionValue <= 0) out.push('Enter what the resolution cost — a complaint with no cost never reaches the cost-of-poor-quality report.')
  }
  if (to === 'CLOSED') {
    if (c.severity === 'CRITICAL' && !c.capaDocNo) out.push('A critical complaint cannot be closed without a CAPA raised against it.')
    if (!c.ncrDocNo && c.resolution !== 'NO_FAULT_FOUND') out.push('Link the NCR raised for the returned material.')
  }
  if (to === 'REJECTED' && c.remarks.trim().length < 10) out.push('Rejecting a complaint needs a written justification for the customer.')
  return out
}"""

new_blockers = """function stepBlockers(c: Complaint, to: ComplaintStatus): string[] {
  const out: string[] = []
  if (to === 'UNDER_INVESTIGATION' && !(c.owner ?? '').trim()) out.push('Name the person who will investigate.')
  if (to === 'ROOT_CAUSE_IDENTIFIED') {
    if ((c.rootCause ?? '').trim().length < 10) out.push('Record the root cause — a sentence, not a word.')
    if (!c.causeCategory) out.push('Classify the cause so it can be counted in the Pareto.')
  }
  if (to === 'RESOLVED') {
    if (c.resolution === 'PENDING') out.push('Decide the resolution: replacement, credit note, repair, or no fault found.')
    if (c.resolution !== 'NO_FAULT_FOUND' && (c.resolutionValue ?? 0) <= 0) out.push('Enter what the resolution cost — a complaint with no cost never reaches the cost-of-poor-quality report.')
  }
  if (to === 'CLOSED') {
    if (c.severity === 'CRITICAL' && !c.capaDocNo) out.push('A critical complaint cannot be closed without a CAPA raised against it.')
    if (!c.ncrDocNo && c.resolution !== 'NO_FAULT_FOUND') out.push('Link the NCR raised for the returned material.')
  }
  if (to === 'REJECTED' && (c.remarks ?? '').trim().length < 10) out.push('Rejecting a complaint needs a written justification for the customer.')
  return out
}"""
content = content.replace(old_blockers, new_blockers)

# 8. Fix live lookup and rowKey
content = content.replace(
    "const live = openUid ? rows.find((r) => r.uid === openUid) ?? null : null",
    "const live = openUid ? rows.find((r) => String((r as any).id ?? r.uid) === openUid) ?? null : null"
)
content = content.replace(
    "onRowClick={(c) => setOpenUid(c.uid)}",
    "onRowClick={(c) => setOpenUid(String((c as any).id ?? c.uid))}"
)
content = content.replace(
    "rowKey={(c) => c.uid}",
    "rowKey={(c) => String((c as any).id ?? c.uid)}"
)

# 9. Update openUid comparison in removeRow
content = content.replace("openUid === c.uid", "openUid === String((c as any).id ?? c.uid)")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Complaints.tsx updated successfully')
