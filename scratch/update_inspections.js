const fs = require('fs');

const path = 'd:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/web/src/types/quality.ts';
let content = fs.readFileSync(path, 'utf-8');

// InspectionReading
content = content.replace("  uid: string\n  characteristicUid: string", "  id: number\n  uid?: string\n  characteristicId: number");
// DefectEntry
content = content.replace("export interface DefectEntry {\n  uid: string", "export interface DefectEntry {\n  id: number\n  uid?: string");
// Inspection
content = content.replace("export interface Inspection {\n  uid: string\n  docNo: string", "export interface Inspection {\n  id: number\n  uid?: string\n  docNo: string");

fs.writeFileSync(path, content, 'utf-8');

const inspPath = 'd:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/web/src/pages/quality/Inspections.tsx';
let inspContent = fs.readFileSync(inspPath, 'utf-8');

// Add import
inspContent = inspContent.replace("import { useMemo, useState } from 'react'", "import { useMemo, useState, useEffect } from 'react'\nimport { inspectionsApi } from '@/api/inspections'");

// Replace data hooks
inspContent = inspContent.replace(
  "const { inspections, plans, instruments, defects } = useQualityData()\n  const { rows, create, update, remove } = inspections",
  `const { plans, instruments, defects } = useQualityData()
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

inspContent = inspContent.replace(/detail\.uid/g, "detail.id");
inspContent = inspContent.replace(/r\.uid/g, "r.id");

// Create saving
inspContent = inspContent.replace(/const uid = newUid\('qin'\)\n\s*const prefix.*\n\s*const seq.*\n\s*const docNo = `\$\{prefix\}\/26-27\/\$\{String\(seq\)\.padStart\(4, '0'\)\}`/g, "");

inspContent = inspContent.replace(
  `create({\n      uid,\n      docNo,\n      stage: selectedPlan.stage,\n      sourceType: 'GRN',\n      sourceDocNo: form.sourceDocNo.trim(),\n      itemCode: selectedPlan.itemCode,\n      itemName: selectedPlan.itemName,\n      uom: 'Nos',\n      batchNo: form.batchNo.trim(),\n      supplierCode: form.supplierCode.trim(),\n      supplierName: '',\n      operationCode: selectedPlan.operationCode,\n      workCentreCode: '',\n      machineCode: form.machineCode.trim(),\n      shift: form.shift,\n      planDocNo: selectedPlan.docNo!,\n      planRevision: selectedPlan.revision,\n      lotSize,\n      sampleSize: sampling.sampleSize,\n      acceptNumber: sampling.accept,\n      rejectNumber: sampling.reject,\n      samplingMethod: selectedPlan.samplingMethod,\n      aql: selectedPlan.aql,\n      acceptedQty: 0,\n      rejectedQty: 0,\n      reworkQty: 0,\n      readings: readingsFromPlan(selectedPlan),\n      defects: [],\n      status: 'PENDING',\n      disposition: 'PENDING',\n      dispositionReason: '',\n      inspector: 'Meera Rajan',\n      inspectedAt: null,\n      approvedBy: null,\n      approvedAt: null,\n      ncrDocNo: null,\n      remarks: '',\n      createdAt: new Date().toISOString(),\n      version: 1,\n    })\n    toast.success('Inspection created', \`\${docNo} ready to record.\`)\n    setFormOpen(false)`,
  `const payload: Partial<Inspection> = {
      stage: selectedPlan.stage,
      sourceType: 'GRN',
      sourceDocNo: form.sourceDocNo.trim(),
      itemCode: selectedPlan.itemCode,
      itemName: selectedPlan.itemName,
      uom: 'Nos',
      batchNo: form.batchNo.trim(),
      supplierCode: form.supplierCode.trim(),
      supplierName: '',
      operationCode: selectedPlan.operationCode,
      workCentreCode: '',
      machineCode: form.machineCode.trim(),
      shift: form.shift,
      planDocNo: selectedPlan.docNo!,
      planRevision: selectedPlan.revision,
      lotSize,
      sampleSize: sampling.sampleSize,
      acceptNumber: sampling.accept,
      rejectNumber: sampling.reject,
      samplingMethod: selectedPlan.samplingMethod,
      aql: selectedPlan.aql,
      acceptedQty: 0,
      rejectedQty: 0,
      reworkQty: 0,
      readings: readingsFromPlan(selectedPlan),
      defects: [],
      status: 'PENDING',
      disposition: 'PENDING',
      dispositionReason: '',
      inspector: 'Meera Rajan',
    }
    await inspectionsApi.create(payload)
    await fetchInspections()
    toast.success('Inspection created', \`Ready to record.\`)
    setFormOpen(false)`
);

// Delete
inspContent = inspContent.replace(
  /remove\(confirmDelete\.uid\)/,
  `await inspectionsApi.remove(confirmDelete.id as number); await fetchInspections()`
);

// Updates
inspContent = inspContent.replace(
  /update\(live\.uid, \{/g,
  `await inspectionsApi.update(live.id as number, {`
);

inspContent = inspContent.replace(
  /update\(detail\.uid, \{/g,
  `await inspectionsApi.update(detail.id as number, {`
);

inspContent = inspContent.replace(
  /update\(deciding\.uid, \{([^}]+)\}\)/g,
  `await inspectionsApi.update(deciding.id as number, {$1}); await fetchInspections()`
);

// We need to also await fetchInspections when a reading is saved or a defect is saved
// There's many updates in the UI for readings
// It's easier to find `update(live.id` and add fetchInspections?
// No, the original update was synchronous for the mock.
inspContent = inspContent.replace(/update\(live\.uid, (.*?)\)/g, 'await inspectionsApi.update(live.id as number, $1); await fetchInspections()');
// Actually, earlier I replaced `live.uid` to `live.id as number`.
inspContent = inspContent.replace(/update\(live\.id as number, (.*?)\)/g, 'await inspectionsApi.update(live.id as number, $1); await fetchInspections()');

// Re-write the setChar/saveChar logic for async if needed. Since it's in a button click, we can just await it.

fs.writeFileSync(inspPath, inspContent, 'utf-8');
console.log('Done refactoring Inspections page.');
