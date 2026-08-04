import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { DispatchStatusBadge, DocCell, EtaChip, PartyCell, WeightCell } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { dispatchPlans as seedPlans, vehicles as seedVehicles } from '@/mock/dispatch'
import type { DispatchPlan, Vehicle } from '@/types/dispatch'

const BASIS_LABEL: Record<string, string> = {
  DAILY: 'Daily run',
  WEEKLY: 'Weekly consolidation',
  ROUTE: 'Route-wise',
  CUSTOMER: 'Customer-wise',
  EXPORT: 'Export',
}

const TABS = [
  { id: 'ALL', label: 'All plans' },
  { id: 'ACTIVE', label: 'In progress' },
  { id: 'NO_VEHICLE', label: 'No vehicle yet' },
  { id: 'EXPORT', label: 'Export' },
]

/**
 * Dispatch planning — deciding what goes out, on what, and in what order. The
 * planner's real constraint is vehicle capacity: a plan that weighs more than
 * the allocated vehicle can carry is a plan that fails at the weighbridge, so
 * that check happens here rather than at the gate.
 */
export function DispatchPlanningPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const seed = useMemo(() => seedPlans, [])
  const vehicleSeed = useMemo(() => seedVehicles, [])

  const crud = useCrud<DispatchPlan>({
    key: 'dispatch:plan',
    seed,
    entity: 'Dispatch plan',
    titleOf: (p) => p.docNo,
    fields: [
      { name: 'docNo', label: 'Plan number', required: true, readOnly: true },
      { name: 'planDate', label: 'Plan date', type: 'date', required: true },
      {
        name: 'basis',
        label: 'Planning basis',
        type: 'select',
        required: true,
        options: Object.entries(BASIS_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'customer', label: 'Customer', required: true },
      { name: 'salesOrderNo', label: 'Sales order' },
      { name: 'route', label: 'Route', required: true },
      { name: 'region', label: 'Region', required: true },
      { name: 'deliveryDate', label: 'Promised delivery date', type: 'date', required: true },
      {
        name: 'priority',
        label: 'Priority',
        type: 'select',
        options: [
          { value: 'LOW', label: 'Low' },
          { value: 'NORMAL', label: 'Normal' },
          { value: 'HIGH', label: 'High' },
          { value: 'URGENT', label: 'Urgent' },
        ],
      },
      { name: 'cartons', label: 'Cartons', type: 'number', required: true },
      { name: 'pallets', label: 'Pallets', type: 'number' },
      { name: 'weightKg', label: 'Weight (kg)', type: 'number', required: true },
      { name: 'volumeCbm', label: 'Volume (cbm)', type: 'number' },
      { name: 'transporter', label: 'Transporter', required: true },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        docNo: v.docNo,
        status: 'DRAFT' as const,
        customerCode: 'CUS-NEW',
        vehicleNo: null,
        vehicleCapacityKg: 0,
        isExport: v.basis === 'EXPORT',
      }),
      planDate: v.planDate,
      basis: v.basis as DispatchPlan['basis'],
      customer: v.customer,
      salesOrderNo: v.salesOrderNo || null,
      route: v.route,
      region: v.region,
      deliveryDate: v.deliveryDate,
      priority: (v.priority || 'NORMAL') as DispatchPlan['priority'],
      cartons: Number(v.cartons) || 0,
      pallets: Number(v.pallets) || 0,
      weightKg: Number(v.weightKg) || 0,
      volumeCbm: Number(v.volumeCbm) || 0,
      transporter: v.transporter,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (p) =>
      p.status === 'DISPATCHED'
        ? `${p.docNo} has already been dispatched. A dispatched plan is part of the delivery record — cancel it instead if it was raised in error.`
        : p.status === 'LOADING'
          ? `${p.docNo} is being loaded right now. Stop the loading first.`
          : undefined,
  })

  const plans = crud.rows
  const { rows: vehicles, update: updateVehicle } = useCollection<Vehicle>('dispatch:vehicle', vehicleSeed)

  const [tab, setTab] = useState('ALL')
  const [allocating, setAllocating] = useState<DispatchPlan | null>(null)
  const [pickVehicle, setPickVehicle] = useState('')

  const visible = plans.filter((p) => {
    if (tab === 'ACTIVE') return p.status === 'PICKING' || p.status === 'LOADING'
    if (tab === 'NO_VEHICLE') return !p.vehicleNo && p.status !== 'DISPATCHED' && p.status !== 'CANCELLED'
    if (tab === 'EXPORT') return p.isExport
    return true
  })

  const noVehicle = plans.filter((p) => !p.vehicleNo && p.status !== 'DISPATCHED' && p.status !== 'CANCELLED')
  const overloaded = plans.filter((p) => p.vehicleNo && p.vehicleCapacityKg > 0 && p.weightKg > p.vehicleCapacityKg)
  const todayWeight = plans.filter((p) => p.status !== 'CANCELLED').reduce((s, p) => s + p.weightKg, 0)

  const utilisation = (p: DispatchPlan) => (p.vehicleCapacityKg > 0 ? (p.weightKg / p.vehicleCapacityKg) * 100 : 0)

  const columns: Column<DispatchPlan>[] = [
    { key: 'docNo', header: 'Plan', sortable: true, width: '11.5rem', render: (p) => (
      <DocCell docNo={p.docNo} sub={`${formatDate(p.planDate)} · ${BASIS_LABEL[p.basis]}`} />
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (p) => (
      <PartyCell name={p.customer} place={p.salesOrderNo ?? 'no sales order'} />
    ) },
    { key: 'route', header: 'Route', sortable: true, render: (p) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{p.route}</p>
        <p className="text-2xs text-fg-subtle">{p.region}</p>
      </div>
    ) },
    { key: 'cartons', header: 'Cartons', align: 'right', sortable: true, width: '7rem', render: (p) => (
      <span className="tabular text-xs">{formatQty(p.cartons)}</span>
    ) },
    { key: 'pallets', header: 'Pallets', align: 'right', sortable: true, width: '6.5rem', render: (p) => (
      <span className="tabular text-xs text-fg-muted">{p.pallets}</span>
    ) },
    { key: 'weightKg', header: 'Weight', align: 'right', sortable: true, width: '8rem', render: (p) => (
      <WeightCell kg={p.weightKg} planned={p.vehicleCapacityKg} />
    ) },
    { key: 'utilisation', header: 'Vehicle used', width: '11rem', sortable: true, accessor: (p) => utilisation(p), render: (p) => {
      if (!p.vehicleNo) return <span className="text-2xs text-warning">no vehicle</span>
      const u = utilisation(p)
      return (
        <div className="flex items-center gap-2">
          <ProgressBar value={Math.min(100, u)} tone={u > 100 ? 'danger' : u > 85 ? 'success' : 'warning'} className="w-14" />
          <span className={cn('text-2xs tabular', u > 100 ? 'font-medium text-danger' : 'text-fg-muted')}>{u.toFixed(0)}%</span>
        </div>
      )
    } },
    { key: 'vehicleNo', header: 'Vehicle', sortable: true, width: '11rem', render: (p) => (
      p.vehicleNo ? (
        <div className="min-w-0">
          <p className="font-mono text-2xs text-fg">{p.vehicleNo}</p>
          <p className="truncate text-2xs text-fg-subtle">{p.transporter}</p>
        </div>
      ) : (
        <span className="text-2xs text-warning">not allocated</span>
      )
    ) },
    { key: 'deliveryDate', header: 'Promised', sortable: true, width: '9rem', accessor: (p) => p.deliveryDate, render: (p) => (
      <div className="min-w-0">
        <p className="text-xs text-fg">{formatDate(p.deliveryDate)}</p>
        <EtaChip eta={p.deliveryDate} delivered={p.status === 'DISPATCHED' ? p.deliveryDate : null} />
      </div>
    ) },
    { key: 'priority', header: 'Priority', align: 'center', width: '7rem', sortable: true, render: (p) => (
      <Badge tone={p.priority === 'URGENT' ? 'danger' : p.priority === 'HIGH' ? 'warning' : 'neutral'} size="sm" dot={p.priority === 'URGENT'}>
        {p.priority.toLowerCase()}
      </Badge>
    ) },
    { key: 'volumeCbm', header: 'Volume', align: 'right', width: '7rem', defaultHidden: true, render: (p) => (
      <span className="tabular text-2xs">{p.volumeCbm.toFixed(1)} cbm</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (p) => <DispatchStatusBadge status={p.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'dispatch-plans', 'Dispatch plan register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Dispatch planning"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Dispatch planning' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/pick-lists')}>Pick lists</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({
                docNo: `DSP/2607/${String(143 + plans.length).padStart(4, '0')}`,
                basis: 'DAILY',
                priority: 'NORMAL',
                planDate: new Date().toISOString().slice(0, 10),
                region: 'South',
              })}
            >
              New dispatch plan
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', noVehicle.length ? 'text-warning' : 'text-success')}>{noVehicle.length}</span> plan
        {noVehicle.length === 1 ? '' : 's'} still without a vehicle ·{' '}
        <span className="font-medium text-fg tabular">{Math.round(todayWeight).toLocaleString('en-IN')} kg</span> planned in total
        {overloaded.length > 0 && (
          <>
            {' '}· <span className="font-medium text-danger">{overloaded.length}</span> over the allocated vehicle's capacity
          </>
        )}
        .
      </p>

      {overloaded.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Over capacity" description="These will be turned away at the weighbridge, not at the customer" />
          <CardBody className="space-y-2">
            {overloaded.map((p) => (
              <div key={p.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">{p.docNo} — {p.customer}</p>
                  <p className="text-2xs text-fg-muted">
                    {Math.round(p.weightKg).toLocaleString('en-IN')} kg on {p.vehicleNo}, which is rated for{' '}
                    {p.vehicleCapacityKg.toLocaleString('en-IN')} kg — over by{' '}
                    {Math.round(p.weightKg - p.vehicleCapacityKg).toLocaleString('en-IN')} kg.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setAllocating(p); setPickVehicle('') }}>
                  Change the vehicle
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(p) => p.uid}
        searchPlaceholder="Search plan, customer, route or transporter…"
        onExport={doExport}
        emptyTitle="No dispatch plans"
        emptyDescription="A plan groups what is going out together — by day, by route, by customer or as an export consignment."
        rowClassName={(p) => cn(
          !p.vehicleNo && p.status !== 'DISPATCHED' && p.status !== 'CANCELLED' && 'bg-warning/[0.04]',
          p.vehicleCapacityKg > 0 && p.weightKg > p.vehicleCapacityKg && 'bg-danger/[0.05]',
        )}
        rowActions={(p) => (
          <>
            <MenuItem label="Edit the plan" onClick={() => crud.openEdit(p)} />
            <MenuItem label="Delete the plan" danger onClick={() => crud.askDelete(p)} />
            <MenuItem
              separatorBefore
              label={p.vehicleNo ? 'Change the vehicle' : 'Allocate a vehicle'}
              disabled={p.status === 'DISPATCHED' || p.status === 'CANCELLED'}
              onClick={() => { setAllocating(p); setPickVehicle(p.vehicleNo ?? '') }}
            />
            <MenuItem
              label="Release the pick list"
              disabled={p.status !== 'DRAFT' && p.status !== 'PLANNED'}
              onClick={() => {
                crud.update(p.uid, { status: 'PICKING' })
                toast.success('Pick list released', `${p.docNo} released to the warehouse. ${formatQty(p.cartons)} cartons to pick — the picker sees it on the pick list screen now.`)
                navigate('/dispatch/pick-lists')
              }}
            />
            <MenuItem
              label="Start loading"
              disabled={p.status !== 'PICKING'}
              onClick={() => {
                if (!p.vehicleNo) {
                  toast.error('No vehicle allocated', `${p.docNo} has no vehicle. Allocate one before loading — a loading sheet needs a vehicle and a driver on it.`)
                  return
                }
                crud.update(p.uid, { status: 'LOADING' })
                toast.success('Loading started', `${p.docNo} is at the bay. A loading sheet has been raised against ${p.vehicleNo}.`)
                navigate('/dispatch/loading')
              }}
            />
            <MenuItem label="Print the dispatch plan" onClick={() => doExport('pdf')} />
            <MenuItem
              separatorBefore
              label="Cancel the plan"
              danger
              disabled={p.status === 'DISPATCHED' || p.status === 'CANCELLED'}
              onClick={() => {
                if (p.vehicleNo) {
                  const v = vehicles.find((x) => x.vehicleNo === p.vehicleNo)
                  if (v) updateVehicle(v.uid, { state: 'AVAILABLE', currentShipmentNo: null })
                }
                crud.update(p.uid, { status: 'CANCELLED', vehicleNo: null, vehicleCapacityKg: 0 })
                toast.success('Plan cancelled', `${p.docNo} cancelled${p.vehicleNo ? ` and ${p.vehicleNo} released back to the pool` : ''}.`)
              }}
            />
          </>
        )}
      />

      <Modal
        open={!!allocating}
        onClose={() => setAllocating(null)}
        title={allocating ? `Vehicle for ${allocating.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAllocating(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
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
              }}
            >
              Allocate
            </Button>
          </>
        }
      >
        {allocating && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{allocating.customer} — {allocating.route}</p>
              <p className="mt-1 text-fg-muted">
                {formatQty(allocating.cartons)} cartons on {allocating.pallets} pallets,{' '}
                <span className="font-medium tabular text-fg">{Math.round(allocating.weightKg).toLocaleString('en-IN')} kg</span> and{' '}
                {allocating.volumeCbm.toFixed(1)} cbm. Promised {formatDate(allocating.deliveryDate)}.
              </p>
            </div>
            <Select
              label="Vehicle"
              value={pickVehicle}
              onChange={(e) => setPickVehicle(e.target.value)}
              hint="Vehicles already in transit or under maintenance are not offered"
              options={vehicles
                .filter((v) => v.isActive && (v.state === 'AVAILABLE' || v.vehicleNo === allocating.vehicleNo))
                .map((v) => ({
                  value: v.vehicleNo,
                  label: `${v.vehicleNo} — ${v.transporter}, ${v.capacityKg.toLocaleString('en-IN')} kg${v.capacityKg < allocating.weightKg ? ' (too small)' : ''}`,
                }))}
            />
            {pickVehicle && (() => {
              const v = vehicles.find((x) => x.vehicleNo === pickVehicle)
              if (!v) return null
              const u = (allocating.weightKg / v.capacityKg) * 100
              return (
                <div className="rounded border border-border p-3">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Capacity used</span>
                    <span className={cn('font-medium tabular', u > 100 ? 'text-danger' : u > 85 ? 'text-success' : 'text-warning')}>
                      {u.toFixed(0)}%
                    </span>
                  </div>
                  <ProgressBar value={Math.min(100, u)} tone={u > 100 ? 'danger' : u > 85 ? 'success' : 'warning'} height="h-2" />
                  <p className="mt-1.5 text-2xs text-fg-muted">
                    {u < 70
                      ? 'Well under capacity — worth checking whether another customer on the same route can share the trip.'
                      : u > 100
                        ? 'Over capacity. This will be refused at the weighbridge.'
                        : 'A sensible load. Driver ' + v.driver + ', ' + v.driverPhone + '.'}
                  </p>
                </div>
              )
            })()}
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Five ways to group a dispatch" description="The basis decides what gets consolidated onto one vehicle" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-fg">Daily run</span> — everything ready today for a nearby destination. Simple, and the default for local delivery.</p>
          <p><span className="font-medium text-fg">Weekly consolidation</span> — hold small orders and send one full vehicle. Cheaper per kilogram, slower to the customer.</p>
          <p><span className="font-medium text-fg">Route-wise</span> — one vehicle, several customers along the same road. The mixed pallet exists for exactly this.</p>
          <p><span className="font-medium text-fg">Customer-wise</span> — a dedicated vehicle for one customer, usually because their dock needs an appointment.</p>
          <p><span className="font-medium text-fg">Export</span> — planned around the container and the vessel cut-off, not around our own convenience.</p>
        </CardBody>
      </Card>
    </div>
  )
}
