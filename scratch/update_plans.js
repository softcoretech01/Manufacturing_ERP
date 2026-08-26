const fs = require('fs');

const filePath = 'd:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/web/src/pages/quality/Plans.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Replace Imports
content = content.replace("import { newUid } from '@/store/data'", "import { plansApi } from '@/api/quality_plans'");
content = content.replace("import { useMemo, useState }", "import { useMemo, useState, useEffect }");

// Replace CharEntry
content = content.replace("uid: `pch-${Date.now().toString(36)}-${seq}`", "id: 0, planId: 0");
content = content.replace("uid: string", "id: number\n  planId: number");

// Replace plans from useQualityData
content = content.replace(
  "const { plans, instruments, inspections } = useQualityData()\n  const { rows, create, update, remove } = plans",
  `const { instruments, inspections } = useQualityData()
  const [rows, setRows] = useState<InspectionPlan[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPlans = async () => {
    try {
      const { data } = await plansApi.getAll()
      setRows(data)
    } catch (e) {
      toast.error('Error', 'Failed to fetch plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])`
);

// Replace docNo -> planCode
content = content.replace(/docNo/g, "planCode");
content = content.replace(/DocNo/g, "PlanCode");
content = content.replace(/uid/g, "id");
content = content.replace(/Uid/g, "Id");

// Update save functions
content = content.replace(/update\(editing\.id, \{ \.\.\.common, version: editing\.version \+ 1 \}\)/g, "await plansApi.update(editing.id, { ...common }); await fetchPlans()");
content = content.replace(/update\(revisingFrom\.id, \{ status: 'SUPERSEDED', version: revisingFrom\.version \+ 1 \}\)\n      create\(\{ \.\.\.common, id: newId\('qip'\), planCode: revisingFrom\.planCode, revision: revisingFrom\.revision \+ 1, createdBy: 'S. Meena', createdAt: new Date\(\)\.toISOString\(\), version: 1 \} as InspectionPlan\)/g, "await plansApi.update(revisingFrom.id, { status: 'SUPERSEDED' }); await plansApi.create({ ...common, planCode: revisingFrom.planCode, revision: revisingFrom.revision + 1 }); await fetchPlans()");
content = content.replace(/create\(\{ \.\.\.common, id: newId\('qip'\), planCode, revision: 1, createdBy: 'S. Meena', createdAt: new Date\(\)\.toISOString\(\), version: 1 \} as InspectionPlan\)/g, "await plansApi.create({ ...common, revision: 1 }); await fetchPlans()");
content = content.replace(/const planCode = `QIP\/26-27\/\$\{String\(rows\.length \+ 1\)\.padStart\(4, '0'\)\}`\n      await plansApi\.create/g, "await plansApi.create");

content = content.replace("function save(activate: boolean)", "async function save(activate: boolean)");

// Menu Items
content = content.replace(/update\(p\.id, \{ status: 'ACTIVE', approvedBy: 'Meera Rajan', version: p\.version \+ 1 \}\)/g, "plansApi.update(p.id, { status: 'ACTIVE', approvedBy: 'Meera Rajan' }).then(fetchPlans)");
content = content.replace(/update\(p\.id, \{ status: 'OBSOLETE', version: p\.version \+ 1 \}\)/g, "plansApi.update(p.id, { status: 'OBSOLETE' }).then(fetchPlans)");
content = content.replace(/remove\(confirmDelete\.id\)/g, "plansApi.remove(confirmDelete.id).then(fetchPlans)");

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Plans.tsx updated successfully!');
