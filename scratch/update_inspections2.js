const fs = require('fs');

const inspPath = 'd:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/web/src/pages/quality/Inspections.tsx';
let inspContent = fs.readFileSync(inspPath, 'utf-8');

// 1. Add imports
inspContent = inspContent.replace(
  "import { useMemo, useState } from 'react'",
  "import { useMemo, useState, useEffect } from 'react'\nimport { inspectionsApi } from '@/api/inspections'"
);

// 2. Replace hooks
inspContent = inspContent.replace(
  "  const { inspections, plans, instruments, defects } = useQualityData()\n  const { rows, create, update, remove } = inspections",
  `  const { plans, instruments, defects } = useQualityData()
  const [rows, setRows] = useState<Inspection[]>([])

  const fetchInspections = async () => {
    try {
      const data = await inspectionsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch inspections')
    }
  }

  useEffect(() => {
    fetchInspections()
  }, [])`
);

// 3. Replace detail.uid to detail.id
inspContent = inspContent.replace(/detail\.uid/g, "detail.id");
inspContent = inspContent.replace(/r\.uid/g, "r.id");

// 4. save() function
const oldSave = `  function save() {
    if (!validate() || !selectedPlan) return
    const lotSize = Number(form.lotSize)
    const sampling = samplingFor(selectedPlan, lotSize)
    const uid = newUid('qin')
    const prefix = selectedPlan.stage === 'IQC' ? 'IQC' : selectedPlan.stage === 'FIRST_PIECE' ? 'FAI' : selectedPlan.stage
    const seq = rows.filter((r) => r.docNo.includes(\`/\${prefix}/\`)).length + 1

    create({
      uid,
      docNo: \`QC/\${prefix}/26-27/\${String(seq).padStart(4, '0')}\`,
      stage: selectedPlan.stage,
      sourceType: selectedPlan.stage === 'IQC' ? 'GRN' : selectedPlan.stage === 'OQA' ? 'SHIPMENT' : 'PRODUCTION_ORDER',
      sourceDocNo: form.sourceDocNo.trim(),
      itemCode: selectedPlan.itemCode,
      itemName: selectedPlan.itemName,
      uom: 'NOS',
      batchNo: form.batchNo.trim(),
      supplierCode: form.supplierCode.trim(),
      supplierName: '',
      operationCode: selectedPlan.operationCode,
      workCentreCode: null,
      machineCode: form.machineCode.trim() || null,
      shift: form.shift,
      planDocNo: selectedPlan.docNo,
      planRevision: selectedPlan.revision,
      lotSize,
      sampleSize: sampling.sampleSize,
      acceptNumber: sampling.acceptNumber,
      rejectNumber: sampling.rejectNumber,
      samplingMethod: selectedPlan.samplingMethod,
      aql: selectedPlan.aql,
      acceptedQty: 0,
      rejectedQty: 0,
      reworkQty: 0,
      readings: readingsFromPlan(selectedPlan.characteristics, uid),
      defects: [],
      status: 'IN_PROGRESS',
      disposition: 'PENDING',
      dispositionReason: '',
      inspector: 'S. Meena',
      inspectedAt: null,
      approvedBy: null,
      approvedAt: null,
      ncrDocNo: null,
      remarks: '',
      createdAt: new Date().toISOString(),
      version: 1,
    } as Inspection)

    toast.success(
      'Inspection raised',
      \`\${sampling.sampleSize} of \${formatQty(lotSize, 0)} to be checked against \${selectedPlan.characteristics.length} characteristics. Accept on \${sampling.acceptNumber}, reject on \${sampling.rejectNumber}.\`,
    )
    setFormOpen(false)
  }`;

const newSave = `  async function save() {
    if (!validate() || !selectedPlan) return
    const lotSize = Number(form.lotSize)
    const sampling = samplingFor(selectedPlan, lotSize)

    await inspectionsApi.create({
      stage: selectedPlan.stage,
      sourceType: selectedPlan.stage === 'IQC' ? 'GRN' : selectedPlan.stage === 'OQA' ? 'SHIPMENT' : 'PRODUCTION_ORDER',
      sourceDocNo: form.sourceDocNo.trim(),
      itemCode: selectedPlan.itemCode,
      itemName: selectedPlan.itemName,
      uom: 'NOS',
      batchNo: form.batchNo.trim(),
      supplierCode: form.supplierCode.trim(),
      supplierName: '',
      operationCode: selectedPlan.operationCode,
      workCentreCode: null,
      machineCode: form.machineCode.trim() || null,
      shift: form.shift,
      planDocNo: selectedPlan.docNo,
      planRevision: selectedPlan.revision,
      lotSize,
      sampleSize: sampling.sampleSize,
      acceptNumber: sampling.acceptNumber,
      rejectNumber: sampling.rejectNumber,
      samplingMethod: selectedPlan.samplingMethod,
      aql: selectedPlan.aql,
      acceptedQty: 0,
      rejectedQty: 0,
      reworkQty: 0,
      readings: readingsFromPlan(selectedPlan.characteristics, '0') as any,
      defects: [],
      status: 'IN_PROGRESS',
      disposition: 'PENDING',
      dispositionReason: '',
      inspector: 'S. Meena',
      inspectedAt: null,
      approvedBy: null,
      approvedAt: null,
      ncrDocNo: null,
      remarks: '',
      version: 1,
    } as Partial<Inspection>)
    await fetchInspections()

    toast.success(
      'Inspection raised',
      \`\${sampling.sampleSize} of \${formatQty(lotSize, 0)} to be checked against \${selectedPlan.characteristics.length} characteristics. Accept on \${sampling.acceptNumber}, reject on \${sampling.rejectNumber}.\`,
    )
    setFormOpen(false)
  }`;

inspContent = inspContent.replace(oldSave, newSave);

// 5. Update mutations
const oldSetReading = `  function setReading(insp: Inspection, readingUid: string, patch: Partial<Inspection['readings'][number]>) {
    update(insp.uid, {
      readings: insp.readings.map((r) => (r.uid === readingUid ? { ...r, ...patch } : r)),
      status: insp.status === 'PENDING' ? 'IN_PROGRESS' : insp.status,
      version: insp.version + 1,
    })
  }`;

const newSetReading = `  async function setReading(insp: Inspection, readingUid: string, patch: Partial<Inspection['readings'][number]>) {
    await inspectionsApi.update(insp.id as number, {
      readings: insp.readings.map((r) => ((r.id?.toString() === readingUid || r.uid === readingUid) ? { ...r, ...patch } : r)),
      status: insp.status === 'PENDING' ? 'IN_PROGRESS' : insp.status,
      version: insp.version + 1,
    })
    await fetchInspections()
  }`;

inspContent = inspContent.replace(oldSetReading, newSetReading);

const oldAddDefect = `  function addDefect(insp: Inspection) {
    const t = defects.rows.find((d) => d.code === defectDraft.defectCode)
    if (!t || !(Number(defectDraft.qty) > 0)) {
      toast.error('Cannot add', 'Choose a defect and a quantity greater than zero.')
      return
    }
    const entry: DefectEntry = {
      uid: \`dfe-\${Date.now().toString(36)}\`,
      defectCode: t.code,
      defectName: t.name,
      severity: t.severity,
      qty: Number(defectDraft.qty),
      source: defectDraft.source.trim() || insp.machineCode || insp.supplierCode || '—',
      remarks: defectDraft.remarks.trim(),
    }
    update(insp.uid, { defects: [...insp.defects, entry], version: insp.version + 1 })
    setDefectDraft({ defectCode: '', qty: '', source: '', remarks: '' })
    setDefectOpen(false)
    toast.success('Defect recorded', \`\${entry.qty} × \${t.name} counted in the sample of \${insp.sampleSize}.\`)
  }`;

const newAddDefect = `  async function addDefect(insp: Inspection) {
    const t = defects.rows.find((d) => d.code === defectDraft.defectCode)
    if (!t || !(Number(defectDraft.qty) > 0)) {
      toast.error('Cannot add', 'Choose a defect and a quantity greater than zero.')
      return
    }
    const entry: DefectEntry = {
      uid: \`dfe-\${Date.now().toString(36)}\`,
      defectCode: t.code,
      defectName: t.name,
      severity: t.severity,
      qty: Number(defectDraft.qty),
      source: defectDraft.source.trim() || insp.machineCode || insp.supplierCode || '—',
      remarks: defectDraft.remarks.trim(),
    } as DefectEntry
    await inspectionsApi.update(insp.id as number, { defects: [...insp.defects, entry], version: insp.version + 1 })
    await fetchInspections()
    setDefectDraft({ defectCode: '', qty: '', source: '', remarks: '' })
    setDefectOpen(false)
    toast.success('Defect recorded', \`\${entry.qty} × \${t.name} counted in the sample of \${insp.sampleSize}.\`)
  }`;
  
inspContent = inspContent.replace(oldAddDefect, newAddDefect);

const oldRecordDecision = `  function recordDecision(i: Inspection) {
    if ((decision === 'REJECTED' || decision === 'ACCEPTED_WITH_DEVIATION' || decision === 'HOLD') && !reason.trim()) {
      toast.error('A reason is required', 'A rejection, a deviation or a hold has to be explained.')
      return
    }
    const e = evaluateInspection(i)
    // The quantity split follows the decision, so the totals always reconcile.
    const accepted = decision === 'ACCEPTED' || decision === 'ACCEPTED_WITH_DEVIATION' ? i.lotSize : 0
    const rejected = decision === 'REJECTED' ? i.lotSize : 0
    const rework = decision === 'HOLD' ? i.lotSize : 0

    update(i.uid, {
      disposition: decision,
      dispositionReason: reason.trim(),
      acceptedQty: accepted,
      rejectedQty: rejected,
      reworkQty: rework,
      inspectedAt: i.inspectedAt ?? new Date().toISOString(),
      status: 'PENDING_APPROVAL',
      version: i.version + 1,
    })

    toast.success(
      'Disposition recorded',
      decision === e.suggestedDisposition
        ? \`\${DISPOSITION_LABEL[decision]} — matches what the rules arrived at.\`
        : \`\${DISPOSITION_LABEL[decision]} — the rules suggested \${DISPOSITION_LABEL[e.suggestedDisposition].toLowerCase()}. The override is recorded with your reason.\`,
    )
    setDeciding(null)
  }`;

const newRecordDecision = `  async function recordDecision(i: Inspection) {
    if ((decision === 'REJECTED' || decision === 'ACCEPTED_WITH_DEVIATION' || decision === 'HOLD') && !reason.trim()) {
      toast.error('A reason is required', 'A rejection, a deviation or a hold has to be explained.')
      return
    }
    const e = evaluateInspection(i)
    // The quantity split follows the decision, so the totals always reconcile.
    const accepted = decision === 'ACCEPTED' || decision === 'ACCEPTED_WITH_DEVIATION' ? i.lotSize : 0
    const rejected = decision === 'REJECTED' ? i.lotSize : 0
    const rework = decision === 'HOLD' ? i.lotSize : 0

    await inspectionsApi.update(i.id as number, {
      disposition: decision,
      dispositionReason: reason.trim(),
      acceptedQty: accepted,
      rejectedQty: rejected,
      reworkQty: rework,
      inspectedAt: i.inspectedAt ?? new Date().toISOString(),
      status: 'PENDING_APPROVAL',
      version: i.version + 1,
    })
    await fetchInspections()

    toast.success(
      'Disposition recorded',
      decision === e.suggestedDisposition
        ? \`\${DISPOSITION_LABEL[decision]} — matches what the rules arrived at.\`
        : \`\${DISPOSITION_LABEL[decision]} — the rules suggested \${DISPOSITION_LABEL[e.suggestedDisposition].toLowerCase()}. The override is recorded with your reason.\`,
    )
    setDeciding(null)
  }`;

inspContent = inspContent.replace(oldRecordDecision, newRecordDecision);

const oldApprove = `  function approve(i: Inspection) {
    const blockers = approvalBlockers(i, instruments.rows)
    if (blockers.length) {
      toast.error('Cannot approve', blockers[0])
      return
    }
    update(i.uid, { status: 'COMPLETED', approvedBy: 'Meera Rajan', approvedAt: new Date().toISOString(), version: i.version + 1 })
    toast.success('Inspection approved', \`\${i.docNo} is closed. The result cannot be edited — a correction needs a new inspection.\`)
    setDetail(null)
  }`;

const newApprove = `  async function approve(i: Inspection) {
    const blockers = approvalBlockers(i, instruments.rows)
    if (blockers.length) {
      toast.error('Cannot approve', blockers[0])
      return
    }
    await inspectionsApi.update(i.id as number, { status: 'COMPLETED', approvedBy: 'Meera Rajan', approvedAt: new Date().toISOString(), version: i.version + 1 })
    await fetchInspections()
    toast.success('Inspection approved', \`\${i.docNo} is closed. The result cannot be edited — a correction needs a new inspection.\`)
    setDetail(null)
  }`;

inspContent = inspContent.replace(oldApprove, newApprove);

// 6. Fix confirmDelete
inspContent = inspContent.replace(
  /onClick=\{\(\) => \{\n\s*remove\(confirmDelete\.uid\)\n\s*setConfirmDelete\(null\)\n\s*\}\}/,
  `onClick={async () => {
              await inspectionsApi.remove(confirmDelete.id as number)
              await fetchInspections()
              setConfirmDelete(null)
            }}`
);

fs.writeFileSync(inspPath, inspContent, 'utf-8');
console.log('Update script successful');
