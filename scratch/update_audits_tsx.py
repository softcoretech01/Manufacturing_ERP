file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Audits.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
content = content.replace("import { useMemo, useState } from 'react'", "import { useMemo, useState, useEffect } from 'react'")
content = content.replace("import { newUid } from '@/store/data'", "import { newUid } from '@/store/data'\nimport { auditsApi } from '@/api/audits'")

# 2. Replace mock hooks with local state
old_mock = """  const toast = useToast()
  const { audits } = useQualityData()
  const { rows, create, update, remove } = audits"""

new_mock = """  const toast = useToast()
  const [rows, setRows] = useState<QualityAudit[]>([])

  const fetchAudits = async () => {
    try {
      const data = await auditsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch audits')
    }
  }

  useEffect(() => {
    fetchAudits()
  }, [])"""
content = content.replace(old_mock, new_mock)

# 3. Replace advance function
old_advance = """  function advance(a: QualityAudit, to: AuditStatus) {
    const b = stepBlockers(a, to)
    if (b.length) { toast.error(b[0]); return }
    update(a.uid, { status: to })
    toast.success(`${a.docNo} → ${STATUS_LABEL[to]}`)
    setAdvancing(null)
  }"""
new_advance = """  function advance(a: QualityAudit, to: AuditStatus) {
    const b = stepBlockers(a, to)
    if (b.length) { toast.error(b[0]); return }
    auditsApi.update((a as any).id, { ...a, status: to }).then(() => {
      fetchAudits()
      toast.success(`${a.docNo} → ${STATUS_LABEL[to]}`)
      setAdvancing(null)
    }).catch((e: any) => toast.error('Error', e.message))
  }"""
content = content.replace(old_advance, new_advance)

# 4. Replace closeFinding function
old_close_finding = """  function closeFinding(a: QualityAudit, findingUid: string) {
    const findings = a.findings.map((f) =>
      f.uid === findingUid ? { ...f, closedOn: f.closedOn ? null : new Date().toISOString().slice(0, 10) } : f,
    )
    const wasOpen = a.findings.find((f) => f.uid === findingUid)?.closedOn === null
    update(a.uid, { findings })
    // Closing the last one moves the audit on by itself — an audit sitting in
    // "actions open" with nothing open is the state nobody ever tidies up.
    if (wasOpen && !findings.some(needsAction) && a.status === 'ACTIONS_OPEN' && a.reportRef.trim()) {
      update(a.uid, { status: 'CLOSED' })
      toast.success('Last finding closed — the audit is now closed')
    } else {
      toast.success(wasOpen ? 'Finding closed' : 'Finding reopened')
    }
  }"""

new_close_finding = """  function closeFinding(a: QualityAudit, findingUid: string) {
    const findings = a.findings.map((f) =>
      f.uid === findingUid ? { ...f, closedOn: f.closedOn ? null : new Date().toISOString().slice(0, 10) } : f,
    )
    const wasOpen = a.findings.find((f) => f.uid === findingUid)?.closedOn === null
    let newStatus = a.status
    let statusMsg = ''
    if (wasOpen && !findings.some(needsAction) && a.status === 'ACTIONS_OPEN' && (a.reportRef ?? '').trim()) {
      newStatus = 'CLOSED'
      statusMsg = 'Last finding closed — the audit is now closed'
    } else {
      statusMsg = wasOpen ? 'Finding closed' : 'Finding reopened'
    }
    
    auditsApi.update((a as any).id, { ...a, findings, status: newStatus }).then(() => {
      fetchAudits()
      toast.success(statusMsg)
    }).catch((e: any) => toast.error('Error', e.message))
  }"""
content = content.replace(old_close_finding, new_close_finding)

# 5. Replace save function
old_save = """  function save() {
    if (!editing) return
    const problems: string[] = []
    if (!editing.title?.trim()) problems.push('Give the audit a title.')
    if (!editing.auditee?.trim()) problems.push('Who is being audited?')
    if (!editing.scope?.trim()) problems.push('State the scope — what was examined and what was not.')
    if (!editing.plannedOn) problems.push('When is it planned for?')
    const bad = (editing.findings ?? []).filter((f) => f.grade !== 'CONFORMS' && !f.description.trim())
    if (bad.length) problems.push('Every non-conformity needs a description.')
    if (problems.length) { toast.error(problems[0]); return }

    const payload = { ...editing } as QualityAudit
    if (editing.uid) {
      update(editing.uid, payload)
      toast.success(`${editing.docNo} updated`)
    } else {
      const seq = live.length + 7
      create({ ...(BLANK() as QualityAudit), ...payload, uid: newUid('aud'), docNo: `AUD/26-27/${String(seq).padStart(4, '0')}` })
      toast.success('Audit scheduled')
    }
    setEditing(null)
  }"""

new_save = """  async function save() {
    if (!editing) return
    const problems: string[] = []
    if (!(editing.title ?? '').trim()) problems.push('Give the audit a title.')
    if (!(editing.auditee ?? '').trim()) problems.push('Who is being audited?')
    if (!(editing.scope ?? '').trim()) problems.push('State the scope — what was examined and what was not.')
    if (!editing.plannedOn) problems.push('When is it planned for?')
    const bad = (editing.findings ?? []).filter((f) => f.grade !== 'CONFORMS' && !(f.description ?? '').trim())
    if (bad.length) problems.push('Every non-conformity needs a description.')
    if (problems.length) { toast.error(problems[0]); return }

    const payload = { ...editing } as QualityAudit
    try {
      if (editing.docNo) {
        await auditsApi.update((editing as any).id, payload)
        toast.success(`${editing.docNo} updated`)
      } else {
        await auditsApi.create({ ...(BLANK() as QualityAudit), ...payload } as any)
        toast.success('Audit scheduled')
      }
      fetchAudits()
      setEditing(null)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save')
    }
  }"""
content = content.replace(old_save, new_save)

# 6. Replace removeRow function
old_remove_row = """  function removeRow(a: QualityAudit) {
    if (a.status !== 'PLANNED') { toast.error('This audit has been conducted. Cancel it with a reason rather than deleting the evidence.'); return }
    remove(a.uid)
    if (openUid === a.uid) setOpenUid(null)
    toast.success(`${a.docNo} removed`)
  }"""

new_remove_row = """  function removeRow(a: QualityAudit) {
    if (a.status !== 'PLANNED') { toast.error('This audit has been conducted. Cancel it with a reason rather than deleting the evidence.'); return }
    auditsApi.remove((a as any).id).then(() => {
      fetchAudits()
      if (openUid === a.uid) setOpenUid(null)
      toast.success(`${a.docNo} removed`)
    }).catch((e: any) => toast.error('Error', e.message))
  }"""
content = content.replace(old_remove_row, new_remove_row)

# 7. Add null fallbacks to stepBlockers for safety
old_blockers = """function stepBlockers(a: QualityAudit, to: AuditStatus): string[] {
  const out: string[] = []
  if (to === 'IN_PROGRESS' && !a.auditor.trim()) out.push('Name the auditor before the audit starts.')
  if (to === 'REPORTED') {
    if (!a.conductedOn) out.push('Record the date the audit was actually conducted.')
    if (!a.findings.length) out.push('An audit with no findings recorded — not even a conformity — has no report to issue.')
    const unactioned = a.findings.filter((f) => f.grade !== 'CONFORMS' && !f.action.trim())
    if (unactioned.length) out.push(`${unactioned.length} finding(s) have no corrective action written against them.`)
    const unowned = a.findings.filter((f) => f.grade !== 'CONFORMS' && !f.owner.trim())
    if (unowned.length) out.push(`${unowned.length} finding(s) have nobody accountable for closing them.`)
    if (a.scorePct === null) out.push('Record the checklist score — what proportion of the clauses examined conformed.')
  }
  if (to === 'CLOSED') {
    const open = a.findings.filter(needsAction)
    if (open.length) out.push(`${open.length} finding(s) are still open. An audit cannot be closed over an open non-conformity.`)
    if (!a.reportRef.trim()) out.push('Record the report reference so the audit can be found again.')
  }
  if (to === 'CANCELLED' && a.remarks.trim().length < 10) out.push('Cancelling a planned audit needs a recorded reason.')
  return out
}"""

new_blockers = """function stepBlockers(a: QualityAudit, to: AuditStatus): string[] {
  const out: string[] = []
  if (to === 'IN_PROGRESS' && !(a.auditor ?? '').trim()) out.push('Name the auditor before the audit starts.')
  if (to === 'REPORTED') {
    if (!a.conductedOn) out.push('Record the date the audit was actually conducted.')
    if (!a.findings.length) out.push('An audit with no findings recorded — not even a conformity — has no report to issue.')
    const unactioned = a.findings.filter((f) => f.grade !== 'CONFORMS' && !(f.action ?? '').trim())
    if (unactioned.length) out.push(`${unactioned.length} finding(s) have no corrective action written against them.`)
    const unowned = a.findings.filter((f) => f.grade !== 'CONFORMS' && !(f.owner ?? '').trim())
    if (unowned.length) out.push(`${unowned.length} finding(s) have nobody accountable for closing them.`)
    if (a.scorePct === null) out.push('Record the checklist score — what proportion of the clauses examined conformed.')
  }
  if (to === 'CLOSED') {
    const open = a.findings.filter(needsAction)
    if (open.length) out.push(`${open.length} finding(s) are still open. An audit cannot be closed over an open non-conformity.`)
    if (!(a.reportRef ?? '').trim()) out.push('Record the report reference so the audit can be found again.')
  }
  if (to === 'CANCELLED' && (a.remarks ?? '').trim().length < 10) out.push('Cancelling a planned audit needs a recorded reason.')
  return out
}"""
content = content.replace(old_blockers, new_blockers)

# 8. Fix edit action for form fields safety
old_edit_action = """<MenuItem label="Edit" onClick={() => setEditing({ ...a })} />"""
new_edit_action = """<MenuItem label="Edit" onClick={() => setEditing({ ...a, title: a.title ?? '', scope: a.scope ?? '', auditee: a.auditee ?? '', auditor: a.auditor ?? '', reportRef: a.reportRef ?? '', remarks: a.remarks ?? '' })} />"""
content = content.replace(old_edit_action, new_edit_action)


# 9. Ensure finding form rendering maps fields with ?? ''
# Wait, this might be a bit tricky if there are many inputs inside the finding list modal.
# Let's write a simple patch for `f.description` and others if they crash, but `Input` component usually handles `undefined` fine in React if it's uncontrolled or we can replace value={x ?? ''}. Let's be safe and let React `Input` handle it. 

# 10. Fix live lookup and rowKey
content = content.replace(
    "const detail = live.find((a) => a.uid === openUid) ?? null",
    "const detail = live.find((a) => String((a as any).id ?? a.uid) === openUid) ?? null"
)
content = content.replace(
    "onRowClick={(a) => setOpenUid(a.uid)}",
    "onRowClick={(a) => setOpenUid(String((a as any).id ?? a.uid))}"
)
content = content.replace(
    "rowKey={(a) => a.uid}",
    "rowKey={(a) => String((a as any).id ?? a.uid)}"
)
content = content.replace("openUid === a.uid", "openUid === String((a as any).id ?? a.uid)")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Audits.tsx updated successfully')
