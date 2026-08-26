with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Vehicles.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update imports
text = text.replace(
    "import { useCrud } from '@/components/crud/CrudKit'",
    "import { useLiveCrud } from '@/components/crud/CrudKit'\nimport { vehicleApi } from '@/api/vehicleApi'\nimport { useEffect } from 'react'"
)
text = text.replace(
    "import { vehicles as seedVehicles } from '@/mock/dispatch'\n",
    ""
)

# 2. Update the start of component and useLiveCrud call
old_crud_setup = """  const seed = useMemo(() => seedVehicles, [])

  const crud = useCrud<Vehicle>({
    key: 'dispatch:vehicle',
    seed,"""

new_crud_setup = """  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  const fetchVehicles = async () => {
    try {
      const data = await vehicleApi.getAll()
      setVehicles(data)
    } catch (err) {
      toast.error('Failed to load vehicles', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchVehicles()
  }, [])

  const crud = useLiveCrud<Vehicle>({"""

text = text.replace(old_crud_setup, new_crud_setup)

# 3. Add api arguments to useLiveCrud and remove rows assignment
old_block_delete = """    blockDelete: (v) =>
      v.currentShipmentNo
        ? `${v.vehicleNo} is carrying ${v.currentShipmentNo} right now. Close that shipment first.`
        : v.state !== 'AVAILABLE' && v.state !== 'MAINTENANCE'
          ? `${v.vehicleNo} is ${v.state.replace(/_/g, ' ').toLowerCase()}. Only an idle vehicle can be removed from the register.`
          : undefined,
  })

  const vehicles = crud.rows"""

new_block_delete = """    blockDelete: (v) =>
      v.currentShipmentNo
        ? `${v.vehicleNo} is carrying ${v.currentShipmentNo} right now. Close that shipment first.`
        : v.state !== 'AVAILABLE' && v.state !== 'MAINTENANCE'
          ? `${v.vehicleNo} is ${v.state.replace(/_/g, ' ').toLowerCase()}. Only an idle vehicle can be removed from the register.`
          : undefined,
  }, vehicles, vehicleApi, fetchVehicles)"""

text = text.replace(old_block_delete, new_block_delete)

# 4. Fix rowKey to use id
text = text.replace("rowKey={(v) => v.uid}", "rowKey={(v) => String((v as any).id || v.uid)}")
text = text.replace("key={v.uid}", "key={(v as any).id || v.uid}")

# 5. Fix manual api calls

# Send for maintenance
old_maintenance = """                crud.update(v.uid, { state: 'MAINTENANCE' })"""
new_maintenance = """                vehicleApi.update((v as any).id, { ...v, state: 'MAINTENANCE' }).then(() => fetchVehicles())"""
text = text.replace(old_maintenance, new_maintenance)

# Mark available
old_available = """                crud.update(v.uid, { state: 'AVAILABLE', currentShipmentNo: null })"""
new_available = """                vehicleApi.update((v as any).id, { ...v, state: 'AVAILABLE', currentShipmentNo: null }).then(() => fetchVehicles())"""
text = text.replace(old_available, new_available)

# Record a service
old_service = """                crud.update(v.uid, { lastServiceOn: new Date().toISOString().slice(0, 10) })"""
new_service = """                vehicleApi.update((v as any).id, { ...v, lastServiceOn: new Date().toISOString().slice(0, 10) }).then(() => fetchVehicles())"""
text = text.replace(old_service, new_service)

# Deactivate/Activate
old_activate = """                crud.update(v.uid, { isActive: !v.isActive })"""
new_activate = """                vehicleApi.update((v as any).id, { ...v, isActive: !v.isActive }).then(() => fetchVehicles())"""
text = text.replace(old_activate, new_activate)


with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Vehicles.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated Vehicles.tsx')
