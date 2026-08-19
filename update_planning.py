with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Planning.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update imports
text = text.replace(
    "import { useCrud } from '@/components/crud/CrudKit'",
    "import { useLiveCrud } from '@/components/crud/CrudKit'\nimport { dispatchPlanApi } from '@/api/dispatchPlanApi'\nimport { vehicleApi } from '@/api/vehicleApi'\nimport { useEffect } from 'react'"
)
text = text.replace(
    "import { dispatchPlans as seedPlans, vehicles as seedVehicles } from '@/mock/dispatch'\n",
    ""
)
text = text.replace(
    "import { useCollection } from '@/store/data'\n",
    ""
)

# 2. Update the start of component and useLiveCrud call
old_crud_setup = """  const seed = useMemo(() => seedPlans, [])
  const vehicleSeed = useMemo(() => seedVehicles, [])

  const crud = useCrud<DispatchPlan>({
    key: 'dispatch:plan',
    seed,"""

new_crud_setup = """  const [plans, setPlans] = useState<DispatchPlan[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  const fetchPlans = async () => {
    try {
      const data = await dispatchPlanApi.getAll()
      setPlans(data)
    } catch (err) {
      toast.error('Failed to load plans', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const fetchVehicles = async () => {
    try {
      const data = await vehicleApi.getAll()
      setVehicles(data)
    } catch (err) {
      toast.error('Failed to load vehicles', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchPlans()
    fetchVehicles()
  }, [])

  const crud = useLiveCrud<DispatchPlan>({"""

text = text.replace(old_crud_setup, new_crud_setup)

# 3. Add api arguments to useLiveCrud
old_block_delete = """    blockDelete: (p) =>
      p.status === 'DISPATCHED'
        ? `${p.docNo} has already been dispatched. A dispatched plan is part of the delivery record — cancel it instead if it was raised in error.`
        : p.status === 'LOADING'
          ? `${p.docNo} is being loaded right now. Stop the loading first.`
          : undefined,
  })

  const plans = crud.rows
  const { rows: vehicles, update: updateVehicle } = useCollection<Vehicle>('dispatch:vehicle', vehicleSeed)"""

new_block_delete = """    blockDelete: (p) =>
      p.status === 'DISPATCHED'
        ? `${p.docNo} has already been dispatched. A dispatched plan is part of the delivery record — cancel it instead if it was raised in error.`
        : p.status === 'LOADING'
          ? `${p.docNo} is being loaded right now. Stop the loading first.`
          : undefined,
  }, plans, dispatchPlanApi, fetchPlans)"""

text = text.replace(old_block_delete, new_block_delete)

# 4. Fix rowKey to use id
text = text.replace("rowKey={(p) => p.uid}", "rowKey={(p) => String((p as any).id || p.uid)}")

# 5. Fix manual api calls in menu items
old_release_pick_list = """                crud.update(p.uid, { status: 'PICKING' })
                toast.success('Pick list released', `${p.docNo} released to the warehouse. ${formatQty(p.cartons)} cartons to pick — the picker sees it on the pick list screen now.`)
                navigate('/dispatch/pick-lists')"""
new_release_pick_list = """                dispatchPlanApi.update((p as any).id, { status: 'PICKING' })
                  .then(() => {
                    toast.success('Pick list released', `${p.docNo} released to the warehouse. ${formatQty(p.cartons)} cartons to pick — the picker sees it on the pick list screen now.`)
                    fetchPlans()
                    navigate('/dispatch/pick-lists')
                  })"""
text = text.replace(old_release_pick_list, new_release_pick_list)

old_start_loading = """                crud.update(p.uid, { status: 'LOADING' })
                toast.success('Loading started', `${p.docNo} is at the bay. A loading sheet has been raised against ${p.vehicleNo}.`)
                navigate('/dispatch/loading')"""
new_start_loading = """                dispatchPlanApi.update((p as any).id, { status: 'LOADING' })
                  .then(() => {
                    toast.success('Loading started', `${p.docNo} is at the bay. A loading sheet has been raised against ${p.vehicleNo}.`)
                    fetchPlans()
                    navigate('/dispatch/loading')
                  })"""
text = text.replace(old_start_loading, new_start_loading)

old_cancel_plan = """              onClick={() => {
                if (p.vehicleNo) {
                  const v = vehicles.find((x) => x.vehicleNo === p.vehicleNo)
                  if (v) updateVehicle(v.uid, { state: 'AVAILABLE', currentShipmentNo: null })
                }
                crud.update(p.uid, { status: 'CANCELLED', vehicleNo: null, vehicleCapacityKg: 0 })
                toast.success('Plan cancelled', `${p.docNo} cancelled${p.vehicleNo ? ` and ${p.vehicleNo} released back to the pool` : ''}.`)
              }}"""
new_cancel_plan = """              onClick={async () => {
                if (p.vehicleNo) {
                  const v = vehicles.find((x) => x.vehicleNo === p.vehicleNo)
                  if (v) await vehicleApi.update((v as any).id, { state: 'AVAILABLE', currentShipmentNo: null })
                }
                await dispatchPlanApi.update((p as any).id, { status: 'CANCELLED', vehicleNo: null, vehicleCapacityKg: 0 })
                toast.success('Plan cancelled', `${p.docNo} cancelled${p.vehicleNo ? ` and ${p.vehicleNo} released back to the pool` : ''}.`)
                fetchPlans()
                fetchVehicles()
              }}"""
text = text.replace(old_cancel_plan, new_cancel_plan)

old_allocate_vehicle = """              onClick={() => {
                if (!allocating) return
                const v = vehicles.find((x) => x.vehicleNo === pickVehicle)
                if (!v) {
                  toast.error('Choose a vehicle', 'Pick one from the list.')
                  return
                }
                if (allocating.weightKg > v.capacityKg) {
                  toast.error(
                    'Vehicle too small',
                    `${allocating.docNo} weighs ${Math.round(allocating.weightKg).toLocaleString('en-IN')} kg and ${v.vehicleNo} is rated for ${v.capacityKg.toLocaleString('en-IN')} kg. Split the plan or pick a larger vehicle.`,
                  )
                  return
                }
                // Release whatever vehicle was allocated before.
                if (allocating.vehicleNo && allocating.vehicleNo !== v.vehicleNo) {
                  const old = vehicles.find((x) => x.vehicleNo === allocating.vehicleNo)
                  if (old) updateVehicle(old.uid, { state: 'AVAILABLE', currentShipmentNo: null })
                }
                updateVehicle(v.uid, { state: 'LOADING' })
                crud.update(allocating.uid, {
                  vehicleNo: v.vehicleNo,
                  transporter: v.transporter,
                  vehicleCapacityKg: v.capacityKg,
                  status: allocating.status === 'DRAFT' ? 'PLANNED' : allocating.status,
                })
                toast.success(
                  'Vehicle allocated',
                  `${v.vehicleNo} (${v.driver}) allocated to ${allocating.docNo} — ${((allocating.weightKg / v.capacityKg) * 100).toFixed(0)}% of its rated capacity.`,
                )
                setAllocating(null)
              }}"""
new_allocate_vehicle = """              onClick={async () => {
                if (!allocating) return
                const v = vehicles.find((x) => x.vehicleNo === pickVehicle)
                if (!v) {
                  toast.error('Choose a vehicle', 'Pick one from the list.')
                  return
                }
                if (allocating.weightKg > v.capacityKg) {
                  toast.error(
                    'Vehicle too small',
                    `${allocating.docNo} weighs ${Math.round(allocating.weightKg).toLocaleString('en-IN')} kg and ${v.vehicleNo} is rated for ${v.capacityKg.toLocaleString('en-IN')} kg. Split the plan or pick a larger vehicle.`,
                  )
                  return
                }
                // Release whatever vehicle was allocated before.
                if (allocating.vehicleNo && allocating.vehicleNo !== v.vehicleNo) {
                  const old = vehicles.find((x) => x.vehicleNo === allocating.vehicleNo)
                  if (old) await vehicleApi.update((old as any).id, { state: 'AVAILABLE', currentShipmentNo: null })
                }
                await vehicleApi.update((v as any).id, { state: 'LOADING' })
                await dispatchPlanApi.update((allocating as any).id, {
                  ...allocating,
                  vehicleNo: v.vehicleNo,
                  transporter: v.transporter,
                  vehicleCapacityKg: v.capacityKg,
                  status: allocating.status === 'DRAFT' ? 'PLANNED' : allocating.status,
                })
                toast.success(
                  'Vehicle allocated',
                  `${v.vehicleNo} (${v.driver}) allocated to ${allocating.docNo} — ${((allocating.weightKg / v.capacityKg) * 100).toFixed(0)}% of its rated capacity.`,
                )
                fetchPlans()
                fetchVehicles()
                setAllocating(null)
              }}"""
text = text.replace(old_allocate_vehicle, new_allocate_vehicle)


with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Planning.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated Planning.tsx')
