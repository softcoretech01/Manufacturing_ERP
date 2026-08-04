import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { DispatchStatusBadge, ExpiryCell, VEHICLE_TYPE_LABEL } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { vehicles as seedVehicles } from '@/mock/dispatch'
import type { Vehicle, VehicleType } from '@/types/dispatch'

const TABS = [
  { id: 'ALL', label: 'All vehicles' },
  { id: 'AVAILABLE', label: 'Available now' },
  { id: 'OUT', label: 'Out on a trip' },
  { id: 'PAPERS', label: 'Papers expiring' },
]

/**
 * Vehicles — company fleet, hired transport, couriers, containers and air cargo,
 * all in one register. The three expiry dates are not administrative detail: a
 * vehicle stopped at a checkpost with lapsed papers is a consignment that does
 * not arrive, so an expiring document blocks allocation.
 */
export function VehiclesPage() {
  const toast = useToast()
  const seed = useMemo(() => seedVehicles, [])

  const crud = useCrud<Vehicle>({
    key: 'dispatch:vehicle',
    seed,
    entity: 'Vehicle',
    titleOf: (v) => `${v.vehicleNo} (${v.transporter})`,
    fields: [
      { name: 'vehicleNo', label: 'Vehicle number', required: true, upper: true },
      {
        name: 'vehicleType',
        label: 'Type',
        type: 'select',
        required: true,
        options: Object.entries(VEHICLE_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'transporter', label: 'Transporter', required: true },
      { name: 'route', label: 'Usual route', required: true },
      { name: 'driver', label: 'Driver', required: true },
      { name: 'driverPhone', label: 'Driver phone', type: 'tel', required: true },
      { name: 'capacityKg', label: 'Capacity (kg)', type: 'number', required: true },
      { name: 'capacityCbm', label: 'Capacity (cbm)', type: 'number' },
      { name: 'insuranceExpiry', label: 'Insurance expires', type: 'date', required: true },
      { name: 'fitnessExpiry', label: 'Fitness certificate expires', type: 'date', required: true },
      { name: 'permitExpiry', label: 'Permit expires', type: 'date', required: true },
      { name: 'lastServiceOn', label: 'Last serviced', type: 'date' },
      { name: 'hasGps', label: 'GPS device fitted', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (v) => ({
      vehicleNo: v.vehicleNo,
      vehicleType: v.vehicleType,
      transporter: v.transporter,
      route: v.route,
      driver: v.driver,
      driverPhone: v.driverPhone,
      capacityKg: String(v.capacityKg),
      capacityCbm: String(v.capacityCbm),
      insuranceExpiry: v.insuranceExpiry,
      fitnessExpiry: v.fitnessExpiry,
      permitExpiry: v.permitExpiry,
      lastServiceOn: v.lastServiceOn,
      hasGps: String(v.hasGps),
      isActive: String(v.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? { state: 'AVAILABLE' as const, currentShipmentNo: null }),
      vehicleNo: v.vehicleNo,
      vehicleType: v.vehicleType as VehicleType,
      transporter: v.transporter,
      route: v.route,
      driver: v.driver,
      driverPhone: v.driverPhone,
      capacityKg: Number(v.capacityKg) || 0,
      capacityCbm: Number(v.capacityCbm) || 0,
      insuranceExpiry: v.insuranceExpiry,
      fitnessExpiry: v.fitnessExpiry,
      permitExpiry: v.permitExpiry,
      lastServiceOn: v.lastServiceOn,
      hasGps: v.hasGps === 'true',
      isActive: v.isActive !== 'false',
    }),
    blockDelete: (v) =>
      v.currentShipmentNo
        ? `${v.vehicleNo} is carrying ${v.currentShipmentNo} right now. Close that shipment first.`
        : v.state !== 'AVAILABLE' && v.state !== 'MAINTENANCE'
          ? `${v.vehicleNo} is ${v.state.replace(/_/g, ' ').toLowerCase()}. Only an idle vehicle can be removed from the register.`
          : undefined,
  })

  const vehicles = crud.rows
  const [tab, setTab] = useState('ALL')

  const daysTo = (d: string) => Math.round((new Date(d).getTime() - Date.now()) / 86_400_000)
  const expiringSoon = (v: Vehicle) => Math.min(daysTo(v.insuranceExpiry), daysTo(v.fitnessExpiry), daysTo(v.permitExpiry))
  const papersProblem = (v: Vehicle) => expiringSoon(v) < 30

  const visible = vehicles.filter((v) => {
    if (tab === 'AVAILABLE') return v.state === 'AVAILABLE' && v.isActive && !papersProblem(v)
    if (tab === 'OUT') return v.state === 'IN_TRANSIT' || v.state === 'LOADING' || v.state === 'RETURNING'
    if (tab === 'PAPERS') return papersProblem(v)
    return true
  })

  const available = vehicles.filter((v) => v.state === 'AVAILABLE' && v.isActive && !papersProblem(v))
  const withProblems = vehicles.filter(papersProblem)
  const totalCapacity = available.reduce((s, v) => s + v.capacityKg, 0)

  const columns: Column<Vehicle>[] = [
    { key: 'vehicleNo', header: 'Vehicle', sortable: true, width: '12rem', render: (v) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-fg">{v.vehicleNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{VEHICLE_TYPE_LABEL[v.vehicleType]}</p>
      </div>
    ) },
    { key: 'transporter', header: 'Transporter', sortable: true, render: (v) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{v.transporter}</p>
        <p className="truncate text-2xs text-fg-subtle">{v.route}</p>
      </div>
    ) },
    { key: 'driver', header: 'Driver', sortable: true, render: (v) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{v.driver}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{v.driverPhone}</p>
      </div>
    ) },
    { key: 'capacityKg', header: 'Capacity', align: 'right', sortable: true, width: '9rem', render: (v) => (
      <div>
        <p className="tabular text-xs text-fg">{v.capacityKg.toLocaleString('en-IN')} kg</p>
        <p className="tabular text-2xs text-fg-subtle">{v.capacityCbm} cbm</p>
      </div>
    ) },
    { key: 'insuranceExpiry', header: 'Insurance', sortable: true, width: '9rem', accessor: (v) => v.insuranceExpiry, render: (v) => <ExpiryCell date={v.insuranceExpiry} /> },
    { key: 'fitnessExpiry', header: 'Fitness', sortable: true, width: '9rem', accessor: (v) => v.fitnessExpiry, render: (v) => <ExpiryCell date={v.fitnessExpiry} /> },
    { key: 'permitExpiry', header: 'Permit', sortable: true, width: '9rem', accessor: (v) => v.permitExpiry, render: (v) => <ExpiryCell date={v.permitExpiry} /> },
    { key: 'hasGps', header: 'GPS', align: 'center', width: '6.5rem', accessor: (v) => (v.hasGps ? 1 : 0), render: (v) => (
      v.hasGps ? <Badge tone="success" size="sm" dot={false}>fitted</Badge> : <span className="text-2xs text-fg-subtle">none</span>
    ) },
    { key: 'lastServiceOn', header: 'Last service', sortable: true, width: '9rem', defaultHidden: true, accessor: (v) => v.lastServiceOn, render: (v) => formatDate(v.lastServiceOn) },
    { key: 'currentShipmentNo', header: 'Carrying', sortable: true, width: '10rem', render: (v) => (
      v.currentShipmentNo ? <span className="font-mono text-2xs text-fg">{v.currentShipmentNo}</span> : <span className="text-2xs text-fg-subtle">empty</span>
    ) },
    { key: 'state', header: 'State', sortable: true, width: '9rem', render: (v) => <DispatchStatusBadge status={v.state} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'vehicle-register', 'Vehicle register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Vehicles"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Vehicles' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => crud.openCreate({ vehicleType: 'THIRD_PARTY', hasGps: 'true', isActive: 'true', route: 'Chennai city' })}
          >
            Add a vehicle
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', available.length ? 'text-success' : 'text-warning')}>{available.length}</span> vehicle
        {available.length === 1 ? '' : 's'} available, giving{' '}
        <span className="font-medium text-fg tabular">{totalCapacity.toLocaleString('en-IN')} kg</span> of capacity today
        {withProblems.length > 0 && (
          <>
            {' '}· <span className="font-medium text-danger">{withProblems.length}</span> with papers expiring inside 30 days
          </>
        )}
        .
      </p>

      {withProblems.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Papers expiring"
            description="A vehicle stopped at a checkpost with lapsed papers is a consignment that does not arrive"
          />
          <CardBody className="space-y-2">
            {withProblems.map((v) => {
              const items = [
                daysTo(v.insuranceExpiry) < 30 && `insurance ${daysTo(v.insuranceExpiry) < 0 ? `expired ${-daysTo(v.insuranceExpiry)} days ago` : `expires in ${daysTo(v.insuranceExpiry)} days`}`,
                daysTo(v.fitnessExpiry) < 30 && `fitness ${daysTo(v.fitnessExpiry) < 0 ? `expired ${-daysTo(v.fitnessExpiry)} days ago` : `expires in ${daysTo(v.fitnessExpiry)} days`}`,
                daysTo(v.permitExpiry) < 30 && `permit ${daysTo(v.permitExpiry) < 0 ? `expired ${-daysTo(v.permitExpiry)} days ago` : `expires in ${daysTo(v.permitExpiry)} days`}`,
              ].filter(Boolean)
              const expired = expiringSoon(v) < 0
              return (
                <div
                  key={v.uid}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded border p-2.5',
                    expired ? 'border-danger/30 bg-danger/5' : 'border-warning/30 bg-warning/5',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">
                      {v.vehicleNo} — {v.transporter}
                    </p>
                    <p className="text-2xs text-fg-muted">{items.join(' · ')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {expired && <Badge tone="danger" size="sm">cannot be allocated</Badge>}
                    <Button variant="outline" size="sm" onClick={() => crud.openEdit(v)}>
                      Update the papers
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(v) => v.uid}
        searchPlaceholder="Search vehicle, transporter, driver or route…"
        onExport={doExport}
        emptyTitle="No vehicles"
        rowClassName={(v) => cn(
          !v.isActive && 'opacity-60',
          expiringSoon(v) < 0 && 'bg-danger/[0.05]',
          expiringSoon(v) >= 0 && expiringSoon(v) < 30 && 'bg-warning/[0.04]',
        )}
        rowActions={(v) => (
          <>
            <MenuItem label="Edit the vehicle" onClick={() => crud.openEdit(v)} />
            <MenuItem label="Delete the vehicle" danger onClick={() => crud.askDelete(v)} />
            <MenuItem
              separatorBefore
              label="Send for maintenance"
              disabled={v.state === 'MAINTENANCE' || !!v.currentShipmentNo}
              onClick={() => {
                crud.update(v.uid, { state: 'MAINTENANCE' })
                toast.success('Sent for maintenance', `${v.vehicleNo} is out of the allocation pool until it is marked available again.`)
              }}
            />
            <MenuItem
              label="Mark available"
              disabled={v.state === 'AVAILABLE'}
              onClick={() => {
                if (expiringSoon(v) < 0) {
                  toast.error(
                    'Papers have lapsed',
                    `${v.vehicleNo} cannot be put back in the pool while its papers are expired. Update the insurance, fitness or permit date first.`,
                  )
                  return
                }
                crud.update(v.uid, { state: 'AVAILABLE', currentShipmentNo: null })
                toast.success('Vehicle available', `${v.vehicleNo} is back in the allocation pool.`)
              }}
            />
            <MenuItem
              label="Record a service"
              onClick={() => {
                crud.update(v.uid, { lastServiceOn: new Date().toISOString().slice(0, 10) })
                toast.success('Service recorded', `${v.vehicleNo} serviced today.`)
              }}
            />
            <MenuItem
              label={v.isActive ? 'Deactivate' : 'Activate'}
              onClick={() => {
                crud.update(v.uid, { isActive: !v.isActive })
                toast.success(v.isActive ? 'Vehicle deactivated' : 'Vehicle activated', `${v.vehicleNo} ${v.isActive ? 'will no longer be offered for allocation' : 'is available for allocation again'}.`)
              }}
            />
          </>
        )}
      />

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Five kinds of carriage, each with its own economics" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-fg">Company vehicle</span> — cheapest per kilogram on short runs, and the only one whose schedule we actually control.</p>
          <p><span className="font-medium text-fg">Third-party transport</span> — the workhorse for line-haul. Performance varies enough that it is worth scoring, which is what the transporter screen does.</p>
          <p><span className="font-medium text-fg">Courier</span> — for samples and single cartons. Expensive per kilogram, unbeatable on paperwork.</p>
          <p><span className="font-medium text-fg">Container</span> — export. Planned around the vessel cut-off and the stuffing date, not around when packing finishes.</p>
          <p><span className="font-medium text-fg">Air cargo</span> — when a customer needs it tomorrow. Roughly ten times the sea freight cost, so every use should have a name against it.</p>
        </CardBody>
      </Card>
    </div>
  )
}
