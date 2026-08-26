file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Calibration.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
content = content.replace("import { useMemo, useState } from 'react'", "import { useMemo, useState, useEffect } from 'react'")
content = content.replace("import { newUid } from '@/store/data'", "import { newUid } from '@/store/data'\nimport { instrumentsApi } from '@/api/instruments'")

# 2. Replace mock hooks with local state
old_mock = """  const toast = useToast()
  const { instruments, inspections } = useQualityData()
  const { rows, create, update, remove } = instruments"""

new_mock = """  const toast = useToast()
  const { inspections } = useQualityData()
  const [rows, setRows] = useState<Instrument[]>([])

  const fetchInstruments = async () => {
    try {
      const data = await instrumentsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch instruments')
    }
  }

  useEffect(() => {
    fetchInstruments()
  }, [])"""

content = content.replace(old_mock, new_mock)

# 3. Update form initialization to remove 'code' as an input since it is auto-generated
content = content.replace(
    "setForm({ code: '', name: '', instrumentType: '', make: '', serialNo: '', range: '', leastCount: '', location: 'Quality Lab', custodian: 'S. Meena', calibrationFrequencyDays: '365', lastCalibratedOn: new Date().toISOString().slice(0, 10), agency: '', certificateNo: '', observedErrorPct: '0', permittedErrorPct: '1', remarks: '' })",
    "setForm({ code: '', name: '', instrumentType: '', make: '', serialNo: '', range: '', leastCount: '', location: 'Quality Lab', custodian: 'S. Meena', calibrationFrequencyDays: '365', lastCalibratedOn: new Date().toISOString().slice(0, 10), agency: '', certificateNo: '', observedErrorPct: '0', permittedErrorPct: '1', remarks: '' })"
)

old_open_edit = """    setForm({ code: i.code, name: i.name, instrumentType: i.instrumentType, make: i.make, serialNo: i.serialNo, range: i.range, leastCount: i.leastCount, location: i.location, custodian: i.custodian, calibrationFrequencyDays: String(i.calibrationFrequencyDays), lastCalibratedOn: i.lastCalibratedOn, agency: i.agency, certificateNo: i.certificateNo, observedErrorPct: String(i.observedErrorPct), permittedErrorPct: String(i.permittedErrorPct), remarks: i.remarks })"""
new_open_edit = """    setForm({ code: i.code ?? '', name: i.name ?? '', instrumentType: i.instrumentType ?? '', make: i.make ?? '', serialNo: i.serialNo ?? '', range: i.range ?? '', leastCount: i.leastCount ?? '', location: i.location ?? '', custodian: i.custodian ?? '', calibrationFrequencyDays: String(i.calibrationFrequencyDays ?? '365'), lastCalibratedOn: i.lastCalibratedOn ?? '', agency: i.agency ?? '', certificateNo: i.certificateNo ?? '', observedErrorPct: String(i.observedErrorPct ?? 0), permittedErrorPct: String(i.permittedErrorPct ?? 0), remarks: i.remarks ?? '' })"""
content = content.replace(old_open_edit, new_open_edit)

# 4. Remove code validation
old_validate = """    const code = form.code.trim().toUpperCase()
    if (!code) e.code = 'A code is required.'
    else if (rows.some((i) => i.code === code && i.uid !== editing?.uid)) e.code = `${code} is already in the register.`"""
new_validate = """    // Code is auto-generated on backend"""
content = content.replace(old_validate, new_validate)

# 5. Replace save function
old_save = """  function save() {
    if (!validate()) return
    const freq = Number(form.calibrationFrequencyDays)
    const patch = {
      code: form.code.trim().toUpperCase(), name: form.name.trim(), instrumentType: form.instrumentType.trim(),
      make: form.make.trim(), serialNo: form.serialNo.trim(), range: form.range.trim(), leastCount: form.leastCount.trim(),
      location: form.location.trim(), custodian: form.custodian.trim(), calibrationFrequencyDays: freq,
      lastCalibratedOn: form.lastCalibratedOn, nextDueOn: nextDueFrom(form.lastCalibratedOn, freq),
      agency: form.agency.trim(), certificateNo: form.certificateNo.trim(),
      observedErrorPct: Number(form.observedErrorPct) || 0, permittedErrorPct: Number(form.permittedErrorPct) || 0,
      remarks: form.remarks.trim(),
    }
    if (editing) {
      update(editing.uid, { ...patch, version: editing.version + 1 })
      toast.success('Instrument updated', `${patch.code} next due ${formatDate(patch.nextDueOn)}.`)
    } else {
      create({ ...patch, uid: newUid('ins'), status: 'VALID', version: 1 } as Instrument)
      toast.success('Instrument registered', `${patch.code} next due ${formatDate(patch.nextDueOn)}.`)
    }
    setFormOpen(false)
  }"""

new_save = """  async function save() {
    if (!validate()) return
    const freq = Number(form.calibrationFrequencyDays)
    const patch = {
      name: form.name.trim(), instrumentType: form.instrumentType.trim(),
      make: form.make.trim(), serialNo: form.serialNo.trim(), range: form.range.trim(), leastCount: form.leastCount.trim(),
      location: form.location.trim(), custodian: form.custodian.trim(), calibrationFrequencyDays: freq,
      lastCalibratedOn: form.lastCalibratedOn, nextDueOn: nextDueFrom(form.lastCalibratedOn, freq),
      agency: form.agency.trim(), certificateNo: form.certificateNo.trim(),
      observedErrorPct: Number(form.observedErrorPct) || 0, permittedErrorPct: Number(form.permittedErrorPct) || 0,
      remarks: form.remarks.trim(),
    }
    try {
      if (editing) {
        await instrumentsApi.update((editing as any).id, patch)
        toast.success('Instrument updated', `${editing.code} next due ${formatDate(patch.nextDueOn)}.`)
      } else {
        const res = await instrumentsApi.create(patch as any)
        toast.success('Instrument registered', `${res.code} next due ${formatDate(patch.nextDueOn)}.`)
      }
      fetchInstruments()
      setFormOpen(false)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save')
    }
  }"""

content = content.replace(old_save, new_save)

# 6. Replace recordCalibration function
old_calib = """    update(i.uid, {
      lastCalibratedOn: calDraft.date,
      nextDueOn: nextDueFrom(calDraft.date, i.calibrationFrequencyDays),
      certificateNo: calDraft.certificateNo.trim() || i.certificateNo,
      agency: calDraft.agency.trim() || i.agency,
      observedErrorPct: observed,
      status: 'VALID',
      version: i.version + 1,
    })
    toast.success('Calibration recorded', `${i.code} valid until ${formatDate(nextDueFrom(calDraft.date, i.calibrationFrequencyDays))}. Inspections using it can be approved again.`)
    setCalibrating(null)"""

new_calib = """    instrumentsApi.update((i as any).id, {
      lastCalibratedOn: calDraft.date,
      nextDueOn: nextDueFrom(calDraft.date, i.calibrationFrequencyDays),
      certificateNo: calDraft.certificateNo.trim() || i.certificateNo,
      agency: calDraft.agency.trim() || i.agency,
      observedErrorPct: observed,
      status: 'VALID',
    }).then(() => {
      fetchInstruments()
      toast.success('Calibration recorded', `${i.code} valid until ${formatDate(nextDueFrom(calDraft.date, i.calibrationFrequencyDays))}. Inspections using it can be approved again.`)
      setCalibrating(null)
    }).catch((e: any) => toast.error('Error', e.message))"""

content = content.replace(old_calib, new_calib)

# 7. Remove 'Code' input field in the modal since it's auto-generated
content = content.replace('<Input label="Code" required containerClassName="sm:col-span-2" value={form.code} error={errors.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} />', '')

# 8. Fix rowKey
content = content.replace(
    "rowKey={(i) => i.uid}",
    "rowKey={(i) => String((i as any).id ?? i.uid)}"
)

# 9. Fix delete button
old_delete = """<Button variant="danger" onClick={() => { if (confirmDelete) { remove(confirmDelete.uid); toast.success('Deleted', `${confirmDelete.code} was soft-deleted.`) } setConfirmDelete(null) }}>Delete</Button>"""
new_delete = """<Button variant="danger" onClick={() => { if (confirmDelete) { instrumentsApi.remove((confirmDelete as any).id).then(() => { fetchInstruments(); toast.success('Deleted', `${confirmDelete.code} was soft-deleted.`) }).catch((e: any) => toast.error('Error', e.message)) } setConfirmDelete(null) }}>Delete</Button>"""
content = content.replace(old_delete, new_delete)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Calibration.tsx updated successfully')
