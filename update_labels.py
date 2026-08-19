with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Labels.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update imports
text = text.replace(
    "import { useCrud } from '@/components/crud/CrudKit'",
    "import { useLiveCrud } from '@/components/crud/CrudKit'\nimport { labelApi } from '@/api/labelApi'\nimport { useEffect } from 'react'"
)
text = text.replace(
    "import { labelFormats as seedLabels } from '@/mock/dispatch'\n",
    ""
)

# 2. Replace useCrud with useLiveCrud and add fetch
old_crud_setup = """  const seed = useMemo(() => seedLabels, [])

  const crud = useCrud<LabelFormat>({
    key: 'dispatch:label-format',
    seed,
    entity: 'Label format',"""

new_crud_setup = """  const [formats, setFormats] = useState<LabelFormat[]>([])

  const fetchLabels = async () => {
    try {
      const data = await labelApi.getAll()
      setFormats(data)
    } catch (err) {
      toast.error('Failed to load labels', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchLabels()
  }, [])

  const crud = useLiveCrud<LabelFormat>({
    entity: 'Label format',"""

text = text.replace(old_crud_setup, new_crud_setup)

# 3. Add api and onRefresh arguments to useLiveCrud
old_block_delete = """    blockDelete: (l) =>
      l.printedCount > 0 && l.isActive
        ? `${l.code} has printed ${formatQty(l.printedCount)} labels and is still active. Deactivate it first so nothing is printing from a format that is about to disappear.`
        : undefined,
  })"""

new_block_delete = """    blockDelete: (l) =>
      l.printedCount > 0 && l.isActive
        ? `${l.code} has printed ${formatQty(l.printedCount)} labels and is still active. Deactivate it first so nothing is printing from a format that is about to disappear.`
        : undefined,
  }, formats, labelApi, fetchLabels)"""
text = text.replace(old_block_delete, new_block_delete)

# 4. Remove `const formats = crud.rows` since we already defined formats state
text = text.replace("  const formats = crud.rows\n", "")

# 5. Fix row key since UID is now ID
text = text.replace("rowKey={(l) => l.uid}", "rowKey={(l) => String((l as any).id || l.uid)}")

# 6. Fix manual api calls in context menu
old_deactivate = """                crud.update(l.uid, { isActive: !l.isActive })"""
new_deactivate = """                await labelApi.update((l as any).id, { ...l, isActive: !l.isActive })
                fetchLabels()"""
text = text.replace(old_deactivate, new_deactivate)

old_duplicate = """                crud.create({
                  ...l,
                  uid: `lf-copy-${Date.now().toString(36)}`,
                  code: `${l.code}-COPY`,
                  name: `${l.name} (copy)`,
                  printedCount: 0,
                  lastPrintedOn: null,
                  isActive: false,
                } as LabelFormat)"""
new_duplicate = """                await labelApi.create({
                  ...l,
                  code: `${l.code}-COPY`,
                  name: `${l.name} (copy)`,
                  printedCount: 0,
                  lastPrintedOn: null,
                  isActive: false,
                })
                fetchLabels()"""
text = text.replace(old_duplicate, new_duplicate)

# Fix onClick for activate/deactivate, and duplicate to be async
text = text.replace("onClick={() => {\n                await labelApi", "onClick={async () => {\n                await labelApi")

# 7. Fix print label count update
old_print_update = """crud.update(printing.uid, { printedCount: printing.printedCount + n, lastPrintedOn: new Date().toISOString() })"""
new_print_update = """labelApi.update((printing as any).id, { ...printing, printedCount: printing.printedCount + n, lastPrintedOn: new Date().toISOString() }).then(fetchLabels)"""
text = text.replace(old_print_update, new_print_update)


with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Labels.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated Labels.tsx')
