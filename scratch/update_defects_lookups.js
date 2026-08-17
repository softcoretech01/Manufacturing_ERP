const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/web/src/pages/quality/Defects.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add api import for lookups
if (!content.includes(`import { api } from '@/api/client'`)) {
  content = content.replace(`import { defectsApi } from '@/api/defects'`, `import { defectsApi } from '@/api/defects'\nimport { api } from '@/api/client'`);
}

// 2. Add state for lookups
const stateInject = `  const [severities, setSeverities] = useState<{value: string, label: string}[]>([])
  const [causes, setCauses] = useState<{value: string, label: string}[]>([])`;

content = content.replace(`  const [rows, setRows] = useState<DefectType[]>([])`, `  const [rows, setRows] = useState<DefectType[]>([])\n${stateInject}`);

// 3. Fetch lookups
const fetchInject = `  const fetchLookups = async () => {
    try {
      const [sevData, causeData] = await Promise.all([
        api.get<any[]>('/quality/lookups/severities'),
        api.get<any[]>('/quality/lookups/causes')
      ])
      setSeverities(sevData.map(d => ({ value: d.name, label: d.name.charAt(0) + d.name.slice(1).toLowerCase() })))
      setCauses(causeData.map(d => ({ value: d.name, label: d.name })))
    } catch (e) {
      console.error('Failed to fetch lookups')
    }
  }`;

content = content.replace(`  const fetchDefects = async () => {`, `${fetchInject}\n\n  const fetchDefects = async () => {`);

// 4. Call fetchLookups in useEffect
content = content.replace(`  useEffect(() => {\n    fetchDefects()\n  }, [])`, `  useEffect(() => {\n    fetchDefects()\n    fetchLookups()\n  }, [])`);

// 5. Update input max lengths
content = content.replace(`<Input label="Code" required value={form.code}`, `<Input label="Code" required maxLength={50} value={form.code}`);
content = content.replace(`<Input label="Name" required value={form.name}`, `<Input label="Name" required maxLength={150} value={form.name}`);
content = content.replace(`<Input label="Category" required value={form.category}`, `<Input label="Category" required maxLength={100} value={form.category}`);

// 6. Update selects
// Look for options={(['CRITICAL', 'MAJOR', 'MINOR'] as const)...
const oldSevSelect = `options={(['CRITICAL', 'MAJOR', 'MINOR'] as const).map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}`;
content = content.replace(oldSevSelect, `options={severities.length ? severities : (['CRITICAL', 'MAJOR', 'MINOR'] as const).map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}`);

// Look for options={CAUSE_CATEGORIES.map((c) => ({ value: c, label: CAUSE_LABEL[c] }))}
const oldCauseSelect = `options={CAUSE_CATEGORIES.map((c) => ({ value: c, label: CAUSE_LABEL[c] }))}`;
content = content.replace(oldCauseSelect, `options={causes.length ? causes : CAUSE_CATEGORIES.map((c) => ({ value: c, label: CAUSE_LABEL[c] }))}`);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Update defects lookups script successful');
