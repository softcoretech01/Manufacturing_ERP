import re
import os

file_path = r"d:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Plans.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
content = content.replace("import { newUid } from '@/store/data'", "import { plansApi } from '@/api/quality_plans'")
content = content.replace("import { useMemo, useState }", "import { useMemo, useState, useEffect }")

# Replace CharEntry
content = content.replace("uid: `pch-${Date.now().toString(36)}-${seq}`", "id: 0, planId: 0")
content = content.replace("uid: string", "id: number\n  planId: number")

# Replace plans from useQualityData
content = content.replace("const { plans, instruments, inspections } = useQualityData()\n  const { rows, create, update, remove } = plans", """const { instruments, inspections } = useQualityData()
  const [rows, setRows] = useState<InspectionPlan[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPlans = async () => {
    try {
      const data = await plansApi.getAll()
      setRows(data)
    } catch (e) {
      toast.error('Error', 'Failed to fetch plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])""")

# Replace docNo -> planCode
content = content.replace("docNo", "planCode")
content = content.replace("DocNo", "PlanCode")
content = content.replace("uid", "id")
content = content.replace("Uid", "Id")

# Replace save function calls
content = re.sub(r'update\(editing\.id, \{ \.\.\.common, version: editing\.version \+ 1 \}\)', r'await plansApi.update(editing.id, { ...common }); await fetchPlans()', content)
content = re.sub(r"update\(revisingFrom\.id, \{ status: 'SUPERSEDED', version: revisingFrom\.version \+ 1 \}\)\n      create\(\{ \.\.\.common, id: newId\('qip'\), planCode: revisingFrom\.planCode, revision: revisingFrom\.revision \+ 1, createdBy: 'S. Meena', createdAt: new Date\(\)\.toISOString\(\), version: 1 \} as InspectionPlan\)", r"await plansApi.update(revisingFrom.id, { status: 'SUPERSEDED' }); await plansApi.create({ ...common, planCode: revisingFrom.planCode, revision: revisingFrom.revision + 1 }); await fetchPlans()", content)
content = re.sub(r"create\(\{ \.\.\.common, id: newId\('qip'\), planCode, revision: 1, createdBy: 'S. Meena', createdAt: new Date\(\)\.toISOString\(\), version: 1 \} as InspectionPlan\)", r"await plansApi.create({ ...common, revision: 1 }); await fetchPlans()", content)
content = re.sub(r"const planCode = `QIP/26-27/\$\{String\(rows\.length \+ 1\)\.padStart\(4, '0'\)\}`\n      await plansApi.create", r"await plansApi.create", content)

content = content.replace("function save(activate: boolean)", "async function save(activate: boolean)")

# Change status update in MenuItem
content = content.replace("update(p.id, { status: 'ACTIVE', approvedBy: 'Meera Rajan', version: p.version + 1 })", "plansApi.update(p.id, { status: 'ACTIVE', approvedBy: 'Meera Rajan' }).then(fetchPlans)")
content = content.replace("update(p.id, { status: 'OBSOLETE', version: p.version + 1 })", "plansApi.update(p.id, { status: 'OBSOLETE' }).then(fetchPlans)")
content = content.replace("remove(confirmDelete.id)", "plansApi.remove(confirmDelete.id).then(fetchPlans)")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Plans.tsx updated successfully!")
