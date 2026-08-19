with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\PickLists.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update imports
text = text.replace(
    "import { useCrud } from '@/components/crud/CrudKit'",
    "import { useLiveCrud } from '@/components/crud/CrudKit'\nimport { pickListApi } from '@/api/pickListApi'\nimport { useEffect } from 'react'"
)
text = text.replace(
    "import { pickLists as seedPicks } from '@/mock/dispatch'\n",
    ""
)

# 2. Update the start of component and useLiveCrud call
old_crud_setup = """  const seed = useMemo(() => seedPicks, [])

  const crud = useCrud<PickList>({
    key: 'dispatch:pick-list',
    seed,"""

new_crud_setup = """  const [picks, setPicks] = useState<PickList[]>([])

  const fetchPicks = async () => {
    try {
      const data = await pickListApi.getAll()
      setPicks(data)
    } catch (err) {
      toast.error('Failed to load pick lists', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchPicks()
  }, [])

  const crud = useLiveCrud<PickList>({"""

text = text.replace(old_crud_setup, new_crud_setup)

# 3. Add api arguments to useLiveCrud and remove `const picks = crud.rows`
old_block_delete = """    blockDelete: (p) =>
      p.pickedQty > 0
        ? `${p.docNo} already has ${formatQty(p.pickedQty)} ${p.uom} picked. Reverse the pick first — the stock has physically moved out of the bin.`
        : undefined,
  })

  const picks = crud.rows"""

new_block_delete = """    blockDelete: (p) =>
      p.pickedQty > 0
        ? `${p.docNo} already has ${formatQty(p.pickedQty)} ${p.uom} picked. Reverse the pick first — the stock has physically moved out of the bin.`
        : undefined,
  }, picks, pickListApi, fetchPicks)"""

text = text.replace(old_block_delete, new_block_delete)

# 4. Fix rowKey to use id
text = text.replace("rowKey={(p) => p.uid}", "rowKey={(p) => String((p as any).id || p.uid)}")
text = text.replace("key={p.uid}", "key={(p as any).id || p.uid}")

# 5. Fix manual api calls
# Ship what was picked
old_ship = """                        crud.update(p.uid, { requiredQty: p.pickedQty, status: 'PICKED', shortReason: `${p.shortReason ?? ''} Short-closed — the consignment ships with ${formatQty(p.pickedQty)}.`.trim() })"""
new_ship = """                        pickListApi.update((p as any).id, { ...p, requiredQty: p.pickedQty, status: 'PICKED', shortReason: `${p.shortReason ?? ''} Short-closed — the consignment ships with ${formatQty(p.pickedQty)}.`.trim() })
                          .then(() => fetchPicks())"""
text = text.replace(old_ship, new_ship)

# Search other bins
old_search = """                        crud.update(p.uid, { status: 'PICKING', shortReason: `${p.shortReason ?? ''} Re-issued to the picker to search other bins.`.trim() })"""
new_search = """                        pickListApi.update((p as any).id, { ...p, status: 'PICKING', shortReason: `${p.shortReason ?? ''} Re-issued to the picker to search other bins.`.trim() })
                          .then(() => fetchPicks())"""
text = text.replace(old_search, new_search)

# Cancel pick list
old_cancel = """                crud.update(p.uid, { status: 'CANCELLED' })"""
new_cancel = """                pickListApi.update((p as any).id, { ...p, status: 'CANCELLED' })
                  .then(() => fetchPicks())"""
text = text.replace(old_cancel, new_cancel)

# Assign a picker
old_assign = """                crud.update(assigning.uid, { picker, status: assigning.status === 'OPEN' ? 'ASSIGNED' : assigning.status })"""
new_assign = """                pickListApi.update((assigning as any).id, { ...assigning, picker, status: assigning.status === 'OPEN' ? 'ASSIGNED' : assigning.status })
                  .then(() => fetchPicks())"""
text = text.replace(old_assign, new_assign)

# Confirm pick
old_confirm = """                crud.update(confirming.uid, {
                  pickedQty: qty,
                  status: isShort ? 'SHORT' : 'PICKED',
                  shortReason: isShort ? shortReason.trim() : null,
                })"""
new_confirm = """                pickListApi.update((confirming as any).id, {
                  ...confirming,
                  pickedQty: qty,
                  status: isShort ? 'SHORT' : 'PICKED',
                  shortReason: isShort ? shortReason.trim() : null,
                }).then(() => fetchPicks())"""
text = text.replace(old_confirm, new_confirm)

with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\PickLists.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated PickLists.tsx')
