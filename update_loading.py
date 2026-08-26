with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Loading.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update imports
text = text.replace(
    "import { useCrud } from '@/components/crud/CrudKit'",
    "import { useLiveCrud } from '@/components/crud/CrudKit'\nimport { loadingSheetApi } from '@/api/loadingSheetApi'\nimport { dispatchPlanApi } from '@/api/dispatchPlanApi'\nimport { vehicleApi } from '@/api/vehicleApi'\nimport { useEffect } from 'react'"
)
text = text.replace(
    "import { useCollection } from '@/store/data'\n",
    ""
)
text = text.replace(
    "import { dispatchPlans as seedPlans, loadingSheets as seedSheets, vehicles as seedVehicles } from '@/mock/dispatch'\n",
    ""
)

# 2. Update the start of component and useLiveCrud call
old_crud_setup = """  const seed = useMemo(() => seedSheets, [])
  const planSeed = useMemo(() => seedPlans, [])
  const vehicleSeed = useMemo(() => seedVehicles, [])

  const crud = useCrud<LoadingSheet>({
    key: 'dispatch:loading-sheet',
    seed,"""

new_crud_setup = """  const [sheets, setSheets] = useState<LoadingSheet[]>([])
  const [plans, setPlans] = useState<DispatchPlan[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  const fetchData = async () => {
    try {
      const [lData, pData, vData] = await Promise.all([
        loadingSheetApi.getAll(),
        dispatchPlanApi.getAll(),
        vehicleApi.getAll()
      ])
      setSheets(lData)
      setPlans(pData)
      setVehicles(vData)
    } catch (err) {
      toast.error('Failed to load data', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const crud = useLiveCrud<LoadingSheet>({"""

text = text.replace(old_crud_setup, new_crud_setup)

# 3. Add api arguments to useLiveCrud and remove rows assignment
old_block_delete = """    blockDelete: (l) =>
      l.status === 'DISPATCHED'
        ? `${l.docNo} has been dispatched and the gate pass issued. A dispatched loading sheet is part of the delivery record.`
        : undefined,
  })

  const sheets = crud.rows
  const { rows: plans, update: updatePlan } = useCollection<DispatchPlan>('dispatch:plan', planSeed)
  const { rows: vehicles, update: updateVehicle } = useCollection<Vehicle>('dispatch:vehicle', vehicleSeed)"""

new_block_delete = """    blockDelete: (l) =>
      l.status === 'DISPATCHED'
        ? `${l.docNo} has been dispatched and the gate pass issued. A dispatched loading sheet is part of the delivery record.`
        : undefined,
  }, sheets, loadingSheetApi, fetchData)"""

text = text.replace(old_block_delete, new_block_delete)

# 4. Fix rowKey to use id
text = text.replace("rowKey={(l) => l.uid}", "rowKey={(l) => String((l as any).id || l.uid)}")
text = text.replace("key={l.uid}", "key={(l as any).id || l.uid}")

# 5. Fix manual api calls

# STAGED -> VERIFYING
old_verify = """                          crud.update(l.uid, { status: 'VERIFYING' })"""
new_verify = """                          loadingSheetApi.update((l as any).id, { ...l, status: 'VERIFYING' }).then(() => fetchData())"""
text = text.replace(old_verify, new_verify)

# VERIFYING -> LOADING
old_start_load = """                          crud.update(l.uid, { status: 'LOADING', startedAt: new Date().toISOString() })"""
new_start_load = """                          loadingSheetApi.update((l as any).id, { ...l, status: 'LOADING', startedAt: new Date().toISOString() }).then(() => fetchData())"""
text = text.replace(old_start_load, new_start_load)

# Attach photo
old_photo = """                        crud.update(l.uid, { photosAttached: l.photosAttached + 1 })"""
new_photo = """                        loadingSheetApi.update((l as any).id, { ...l, photosAttached: l.photosAttached + 1 }).then(() => fetchData())"""
text = text.replace(old_photo, new_photo)

# Dispatch
old_dispatch = """                          crud.update(l.uid, { status: 'DISPATCHED', completedAt: new Date().toISOString() })
                          const plan = plans.find((p) => p.docNo === l.dispatchPlanNo)
                          if (plan) updatePlan(plan.uid, { status: 'DISPATCHED' })
                          const v = vehicles.find((x) => x.vehicleNo === l.vehicleNo)
                          if (v) updateVehicle(v.uid, { state: 'IN_TRANSIT' })
                          toast.success("""
new_dispatch = """                          loadingSheetApi.update((l as any).id, { ...l, status: 'DISPATCHED', completedAt: new Date().toISOString() })
                            .then(async () => {
                              const plan = plans.find((p) => p.docNo === l.dispatchPlanNo)
                              if (plan) await dispatchPlanApi.update((plan as any).id, { ...plan, status: 'DISPATCHED' })
                              const v = vehicles.find((x) => x.vehicleNo === l.vehicleNo)
                              if (v) await vehicleApi.update((v as any).id, { ...v, state: 'IN_TRANSIT' })
                              fetchData()
                              toast.success("""
text = text.replace(old_dispatch, new_dispatch)
# The toast and closing braces for dispatch will just be nested inside `.then(...)` because `toast.success` and everything following it is fine inside the then block. We need to close the `then` block.
old_dispatch_end = """                          )
                        }}"""
new_dispatch_end = """                          )
                            })
                        }}"""
text = text.replace(old_dispatch_end, new_dispatch_end)

# Cancel
old_cancel = """                crud.update(l.uid, { status: 'CANCELLED' })
                const v = vehicles.find((x) => x.vehicleNo === l.vehicleNo)
                if (v) updateVehicle(v.uid, { state: 'AVAILABLE', currentShipmentNo: null })
                toast.success('Loading cancelled', `${l.docNo} cancelled and ${l.vehicleNo} released back to the pool.`)"""
new_cancel = """                loadingSheetApi.update((l as any).id, { ...l, status: 'CANCELLED' })
                  .then(async () => {
                    const v = vehicles.find((x) => x.vehicleNo === l.vehicleNo)
                    if (v) await vehicleApi.update((v as any).id, { ...v, state: 'AVAILABLE', currentShipmentNo: null })
                    fetchData()
                    toast.success('Loading cancelled', `${l.docNo} cancelled and ${l.vehicleNo} released back to the pool.`)
                  })"""
text = text.replace(old_cancel, new_cancel)

# Record Loaded
old_record_loaded = """                crud.update(loading.uid, {
                  cartonsLoaded: n,
                  palletsLoaded: Math.ceil(n / Math.max(1, Math.round(loading.cartonsPlanned / Math.max(1, loading.palletsLoaded || 1)))) || loading.palletsLoaded,
                })"""
new_record_loaded = """                loadingSheetApi.update((loading as any).id, {
                  ...loading,
                  cartonsLoaded: n,
                  palletsLoaded: Math.ceil(n / Math.max(1, Math.round(loading.cartonsPlanned / Math.max(1, loading.palletsLoaded || 1)))) || loading.palletsLoaded,
                }).then(() => fetchData())"""
text = text.replace(old_record_loaded, new_record_loaded)

# Record Seal
old_record_seal = """                crud.update(sealing.uid, {
                  sealNo: seal.trim(),
                  sealVerified: Math.abs(variance) <= 2,
                  actualWeightKg: w,
                  status: Math.abs(variance) <= 2 ? 'SEALED' : 'LOADING',
                  photosAttached: sealing.photosAttached + 1,
                })"""
new_record_seal = """                loadingSheetApi.update((sealing as any).id, {
                  ...sealing,
                  sealNo: seal.trim(),
                  sealVerified: Math.abs(variance) <= 2,
                  actualWeightKg: w,
                  status: Math.abs(variance) <= 2 ? 'SEALED' : 'LOADING',
                  photosAttached: sealing.photosAttached + 1,
                }).then(() => fetchData())"""
text = text.replace(old_record_seal, new_record_seal)


with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Loading.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated Loading.tsx')
