import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { CountBar, DispatchStatusBadge, DocCell, PartyCell, WeightCell } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { dispatchPlans as seedPlans, loadingSheets as seedSheets, vehicles as seedVehicles } from '@/mock/dispatch'
import type { DispatchPlan, LoadingSheet, Vehicle } from '@/types/dispatch'

/** Staging → verify → load → seal → dispatch, in that order. */
const STEPS: { state: LoadingSheet['status']; label: string; detail: string }[] = [
  { state: 'STAGED', label: 'Staged', detail: 'Pallets are at the bay and the vehicle has arrived' },
  { state: 'VERIFYING', label: 'Verified', detail: 'Carton count and pallet count checked against the plan' },
  { state: 'LOADING', label: 'Loading', detail: 'Cartons going onto the vehicle, counted as they go' },
  { state: 'SEALED', label: 'Sealed', detail: 'Doors closed, seal number recorded and photographed' },
  { state: 'DISPATCHED', label: 'Dispatched', detail: 'Gate pass issued, vehicle has left' },
]

/**
 * Loading management — the last point at which a mistake is cheap. Every check
 * here (count, weight, seal) exists because the alternative is discovering the
 * problem at the customer's dock, where it becomes a claim rather than a recount.
 */
export function LoadingPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const seed = useMemo(() => seedSheets, [])
  const planSeed = useMemo(() => seedPlans, [])
  const vehicleSeed = useMemo(() => seedVehicles, [])

  const crud = useCrud<LoadingSheet>({
    key: 'dispatch:loading-sheet',
    seed,
    entity: 'Loading sheet',
    titleOf: (l) => l.docNo,
    fields: [
      { name: 'docNo', label: 'Loading sheet number', required: true, readOnly: true },
      { name: 'dispatchPlanNo', label: 'Dispatch plan', required: true },
      { name: 'vehicleNo', label: 'Vehicle', required: true, upper: true },
      { name: 'transporter', label: 'Transporter', required: true },
      { name: 'driver', label: 'Driver', required: true },
      { name: 'customer', label: 'Customer', required: true },
      { name: 'destination', label: 'Destination', required: true, span: 2 },
      { name: 'stagingBay', label: 'Staging bay', required: true },
      { name: 'cartonsPlanned', label: 'Cartons to load', type: 'number', required: true },
      { name: 'cartonsLoaded', label: 'Cartons loaded', type: 'number' },
      { name: 'palletsLoaded', label: 'Pallets loaded', type: 'number' },
      { name: 'plannedWeightKg', label: 'Planned weight (kg)', type: 'number', required: true },
      { name: 'actualWeightKg', label: 'Weighbridge weight (kg)', type: 'number' },
      { name: 'loader', label: 'Loading gang', required: true },
      { name: 'supervisor', label: 'Supervisor', required: true },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        docNo: v.docNo,
        startedAt: null,
        completedAt: null,
        sealNo: null,
        sealVerified: false,
        photosAttached: 0,
        status: 'STAGED' as const,
      }),
      dispatchPlanNo: v.dispatchPlanNo,
      vehicleNo: v.vehicleNo,
      transporter: v.transporter,
      driver: v.driver,
      customer: v.customer,
      destination: v.destination,
      stagingBay: v.stagingBay,
      cartonsPlanned: Number(v.cartonsPlanned) || 0,
      cartonsLoaded: Number(v.cartonsLoaded) || 0,
      palletsLoaded: Number(v.palletsLoaded) || 0,
      plannedWeightKg: Number(v.plannedWeightKg) || 0,
      actualWeightKg: Number(v.actualWeightKg) || 0,
      loader: v.loader,
      supervisor: v.supervisor,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (l) =>
      l.status === 'DISPATCHED'
        ? `${l.docNo} has been dispatched and the gate pass issued. A dispatched loading sheet is part of the delivery record.`
        : undefined,
  })

  const sheets = crud.rows
  const { rows: plans, update: updatePlan } = useCollection<DispatchPlan>('dispatch:plan', planSeed)
  const { rows: vehicles, update: updateVehicle } = useCollection<Vehicle>('dispatch:vehicle', vehicleSeed)

  const [loading, setLoading] = useState<LoadingSheet | null>(null)
  const [loadedCount, setLoadedCount] = useState('')
  const [sealing, setSealing] = useState<LoadingSheet | null>(null)
  const [seal, setSeal] = useState('')
  const [bridgeWeight, setBridgeWeight] = useState('')

  const active = sheets.filter((l) => l.status !== 'DISPATCHED' && l.status !== 'CANCELLED')
  const atBay = sheets.filter((l) => l.status === 'STAGED')
  const shortLoaded = sheets.filter((l) => l.status !== 'CANCELLED' && l.cartonsLoaded > 0 && l.cartonsLoaded < l.cartonsPlanned && l.status !== 'LOADING')

  const weightVariance = (l: LoadingSheet) =>
    l.plannedWeightKg > 0 && l.actualWeightKg > 0 ? ((l.actualWeightKg - l.plannedWeightKg) / l.plannedWeightKg) * 100 : 0

  const columns: Column<LoadingSheet>[] = [
    { key: 'docNo', header: 'Loading sheet', sortable: true, width: '12rem', render: (l) => (
      <DocCell docNo={l.docNo} sub={`${l.dispatchPlanNo} · ${l.stagingBay}`} />
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (l) => <PartyCell name={l.customer} place={l.destination} /> },
    { key: 'vehicleNo', header: 'Vehicle', sortable: true, width: '11.5rem', render: (l) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-fg">{l.vehicleNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{l.driver} · {l.transporter}</p>
      </div>
    ) },
    { key: 'cartonsLoaded', header: 'Cartons loaded', width: '11rem', sortable: true, accessor: (l) => l.cartonsLoaded, render: (l) => (
      <CountBar done={l.cartonsLoaded} total={l.cartonsPlanned} />
    ) },
    { key: 'palletsLoaded', header: 'Pallets', align: 'right', sortable: true, width: '6.5rem', render: (l) => (
      <span className="tabular text-xs text-fg-muted">{l.palletsLoaded}</span>
    ) },
    { key: 'plannedWeightKg', header: 'Planned', align: 'right', sortable: true, width: '8rem', render: (l) => <WeightCell kg={l.plannedWeightKg} /> },
    { key: 'actualWeightKg', header: 'Weighbridge', align: 'right', sortable: true, width: '9rem', render: (l) => (
      l.actualWeightKg > 0 ? <WeightCell kg={l.actualWeightKg} planned={l.plannedWeightKg} /> : <span className="text-2xs text-fg-subtle">not weighed</span>
    ) },
    { key: 'variance', header: 'Difference', align: 'right', width: '8.5rem', sortable: true, accessor: (l) => weightVariance(l), render: (l) => {
      if (!l.actualWeightKg) return <span className="text-2xs text-fg-subtle">—</span>
      const v = weightVariance(l)
      return (
        <span className={cn('tabular text-2xs', Math.abs(v) > 2 ? 'font-medium text-danger' : Math.abs(v) > 1 ? 'text-warning' : 'text-success')}>
          {v > 0 ? '+' : ''}{v.toFixed(1)}%
        </span>
      )
    } },
    { key: 'sealNo', header: 'Seal', sortable: true, width: '10rem', render: (l) => (
      l.sealNo ? (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-2xs text-fg">{l.sealNo}</span>
          {l.sealVerified && <Badge tone="success" size="sm" dot={false}>verified</Badge>}
        </div>
      ) : (
        <span className="text-2xs text-fg-subtle">not sealed</span>
      )
    ) },
    { key: 'photosAttached', header: 'Photos', align: 'center', width: '6.5rem', sortable: true, render: (l) => (
      <span className={cn('tabular text-2xs', l.photosAttached === 0 ? 'text-warning' : 'text-fg-muted')}>{l.photosAttached}</span>
    ) },
    { key: 'loader', header: 'Gang · supervisor', sortable: true, defaultHidden: true, render: (l) => (
      <span className="text-2xs">{l.loader} · {l.supervisor}</span>
    ) },
    { key: 'startedAt', header: 'Started', sortable: true, width: '10rem', accessor: (l) => l.startedAt ?? '', render: (l) => (
      l.startedAt ? <span className="text-2xs">{formatDateTime(l.startedAt)}</span> : <span className="text-2xs text-fg-subtle">not started</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (l) => <DispatchStatusBadge status={l.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'loading-sheets', 'Vehicle loading report', columnsFromTable(columns), sheets)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Dispatch is the point of no return — it needs the count, the weight and the seal. */
  function dispatchBlocker(l: LoadingSheet): string | null {
    if (l.cartonsLoaded === 0) return 'Nothing has been loaded'
    if (!l.sealNo) return 'No seal number recorded'
    if (!l.sealVerified) return 'The seal has not been verified'
    if (l.actualWeightKg === 0) return 'The vehicle has not been over the weighbridge'
    if (Math.abs(weightVariance(l)) > 2) return `The weighbridge is ${weightVariance(l).toFixed(1)}% off the planned weight — recount before releasing`
    return null
  }

  return (
    <div>
      <PageHeader
        title="Vehicle loading"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Loading' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/shipments')}>Shipments</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({
                docNo: `LDS/2607/${String(290 + sheets.length).padStart(4, '0')}`,
                stagingBay: 'Bay 1',
                loader: 'Loading gang A',
                supervisor: 'R. Vasanth',
              })}
            >
              New loading sheet
            </Button>
          </>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', active.length ? 'text-progress' : 'text-fg')}>{active.length}</span> vehicle
        {active.length === 1 ? '' : 's'} at the bays ·{' '}
        <span className={cn('font-medium', atBay.length ? 'text-warning' : 'text-fg')}>{atBay.length}</span> staged and waiting to
        start
        {shortLoaded.length > 0 && (
          <>
            {' '}· <span className="font-medium text-danger">{shortLoaded.length}</span> loaded short of the plan
          </>
        )}
        .
      </p>

      {active.length > 0 && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {active.map((l) => {
            const stepIdx = STEPS.findIndex((s) => s.state === l.status)
            const blocker = dispatchBlocker(l)
            return (
              <Card key={l.uid}>
                <CardHeader
                  title={`${l.vehicleNo} · ${l.stagingBay}`}
                  description={`${l.customer} → ${l.destination} · ${l.driver}`}
                  actions={<DispatchStatusBadge status={l.status} />}
                />
                <CardBody className="space-y-3">
                  {/* Step trail */}
                  <div className="flex items-center gap-1">
                    {STEPS.map((s, i) => (
                      <div key={s.state} className="flex flex-1 items-center gap-1">
                        <div
                          className={cn(
                            'flex-1 rounded-full',
                            i <= stepIdx ? 'h-1.5 bg-brand-500' : 'h-1.5 bg-surface-3',
                          )}
                          title={`${s.label} — ${s.detail}`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-2xs text-fg-muted">
                    <span className="font-medium text-fg">{STEPS[stepIdx]?.label ?? l.status}</span> — {STEPS[stepIdx]?.detail ?? ''}
                  </p>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-fg-muted">Cartons on the vehicle</span>
                      <span className="tabular text-fg">{l.cartonsLoaded} / {l.cartonsPlanned}</span>
                    </div>
                    <ProgressBar
                      value={l.cartonsPlanned ? (l.cartonsLoaded / l.cartonsPlanned) * 100 : 0}
                      tone={l.cartonsLoaded >= l.cartonsPlanned ? 'success' : 'brand'}
                      height="h-2"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {l.status === 'STAGED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          crud.update(l.uid, { status: 'VERIFYING' })
                          toast.success('Verification started', `Count the pallets at ${l.stagingBay} against ${l.dispatchPlanNo} before anything goes on the vehicle.`)
                        }}
                      >
                        Start verification
                      </Button>
                    )}
                    {l.status === 'VERIFYING' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          crud.update(l.uid, { status: 'LOADING', startedAt: new Date().toISOString() })
                          toast.success('Loading started', `${l.vehicleNo} loading at ${l.stagingBay}. Count the cartons as they go on.`)
                        }}
                      >
                        Start loading
                      </Button>
                    )}
                    {l.status === 'LOADING' && (
                      <Button variant="primary" size="sm" onClick={() => { setLoading(l); setLoadedCount(String(l.cartonsPlanned)) }}>
                        Record what was loaded
                      </Button>
                    )}
                    {(l.status === 'LOADING' || l.status === 'SEALED') && (
                      <Button
                        variant={l.sealNo ? 'success' : 'secondary'}
                        size="sm"
                        onClick={() => { setSealing(l); setSeal(l.sealNo ?? ''); setBridgeWeight(l.actualWeightKg ? String(l.actualWeightKg) : '') }}
                      >
                        {l.sealNo ? 'Seal recorded' : 'Seal and weigh'}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        crud.update(l.uid, { photosAttached: l.photosAttached + 1 })
                        toast.success('Photo attached', `Photo ${l.photosAttached + 1} attached to ${l.docNo}. Loading photos settle most transit-damage arguments.`)
                      }}
                    >
                      Attach a photo ({l.photosAttached})
                    </Button>
                    {l.status === 'SEALED' && (
                      <Button
                        variant={blocker ? 'outline' : 'success'}
                        size="sm"
                        onClick={() => {
                          if (blocker) {
                            toast.error('Cannot dispatch', `${blocker}.`)
                            return
                          }
                          crud.update(l.uid, { status: 'DISPATCHED', completedAt: new Date().toISOString() })
                          const plan = plans.find((p) => p.docNo === l.dispatchPlanNo)
                          if (plan) updatePlan(plan.uid, { status: 'DISPATCHED' })
                          const v = vehicles.find((x) => x.vehicleNo === l.vehicleNo)
                          if (v) updateVehicle(v.uid, { state: 'IN_TRANSIT' })
                          toast.success(
                            'Dispatched',
                            `${l.vehicleNo} has left with ${l.cartonsLoaded} cartons on seal ${l.sealNo}. Gate pass issued and the shipment is now trackable.`,
                          )
                        }}
                      >
                        Dispatch the vehicle
                      </Button>
                    )}
                  </div>
                  {blocker && l.status === 'SEALED' && <p className="text-2xs text-warning">Cannot dispatch — {blocker.toLowerCase()}.</p>}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <DataTable
        rows={sheets}
        columns={columns}
        rowKey={(l) => l.uid}
        searchPlaceholder="Search sheet, plan, vehicle, driver or customer…"
        onExport={doExport}
        emptyTitle="No loading sheets"
        emptyDescription="A loading sheet is raised when a dispatch plan reaches the bay."
        rowClassName={(l) => cn(
          l.status === 'LOADING' && 'bg-progress/[0.04]',
          l.status === 'STAGED' && 'bg-warning/[0.03]',
          l.actualWeightKg > 0 && Math.abs(weightVariance(l)) > 2 && 'bg-danger/[0.04]',
        )}
        rowActions={(l) => (
          <>
            <MenuItem label="Edit the sheet" onClick={() => crud.openEdit(l)} />
            <MenuItem label="Delete the sheet" danger onClick={() => crud.askDelete(l)} />
            <MenuItem
              separatorBefore
              label="Record what was loaded"
              disabled={l.status === 'DISPATCHED' || l.status === 'CANCELLED'}
              onClick={() => { setLoading(l); setLoadedCount(String(l.cartonsLoaded || l.cartonsPlanned)) }}
            />
            <MenuItem
              label="Seal and weigh"
              disabled={l.status === 'DISPATCHED' || l.status === 'CANCELLED' || l.cartonsLoaded === 0}
              onClick={() => { setSealing(l); setSeal(l.sealNo ?? ''); setBridgeWeight(l.actualWeightKg ? String(l.actualWeightKg) : '') }}
            />
            <MenuItem label="Print the loading sheet" onClick={() => doExport('pdf')} />
            <MenuItem
              separatorBefore
              label="Cancel the loading"
              danger
              disabled={l.status === 'DISPATCHED' || l.status === 'CANCELLED'}
              onClick={() => {
                crud.update(l.uid, { status: 'CANCELLED' })
                const v = vehicles.find((x) => x.vehicleNo === l.vehicleNo)
                if (v) updateVehicle(v.uid, { state: 'AVAILABLE', currentShipmentNo: null })
                toast.success('Loading cancelled', `${l.docNo} cancelled and ${l.vehicleNo} released back to the pool.`)
              }}
            />
          </>
        )}
      />

      {/* Record the loaded count -------------------------------------------- */}
      <Modal
        open={!!loading}
        onClose={() => setLoading(null)}
        title={loading ? `Loaded onto ${loading.vehicleNo}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setLoading(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!loading) return
                const n = Number(loadedCount)
                if (Number.isNaN(n) || n < 0) {
                  toast.error('Enter a count', 'How many cartons actually went on?')
                  return
                }
                if (n > loading.cartonsPlanned) {
                  toast.error(
                    'More than planned',
                    `The plan is ${loading.cartonsPlanned} cartons. Loading ${n} means something belonging to another customer is on this vehicle — recount before continuing.`,
                  )
                  return
                }
                crud.update(loading.uid, {
                  cartonsLoaded: n,
                  palletsLoaded: Math.ceil(n / Math.max(1, Math.round(loading.cartonsPlanned / Math.max(1, loading.palletsLoaded || 1)))) || loading.palletsLoaded,
                })
                toast.success(
                  n < loading.cartonsPlanned ? 'Loaded short' : 'Count recorded',
                  n < loading.cartonsPlanned
                    ? `${n} of ${loading.cartonsPlanned} loaded — short by ${loading.cartonsPlanned - n}. The challan and the invoice will both follow the loaded count, not the planned one.`
                    : `All ${n} cartons on the vehicle. Next is the seal and the weighbridge.`,
                )
                setLoading(null)
              }}
            >
              Record
            </Button>
          </>
        }
      >
        {loading && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {loading.dispatchPlanNo} calls for <span className="font-medium tabular text-fg">{loading.cartonsPlanned} cartons</span>{' '}
              at {Math.round(loading.plannedWeightKg).toLocaleString('en-IN')} kg.
            </p>
            <Input label="Cartons actually loaded" type="number" value={loadedCount} onChange={(e) => setLoadedCount(e.target.value)} />
          </div>
        )}
      </Modal>

      {/* Seal and weighbridge ---------------------------------------------- */}
      <Modal
        open={!!sealing}
        onClose={() => setSealing(null)}
        title={sealing ? `Seal ${sealing.vehicleNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setSealing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!sealing) return
                if (!seal.trim()) {
                  toast.error('Seal number required', 'The seal number is what proves the doors were not opened in transit.')
                  return
                }
                const w = Number(bridgeWeight)
                if (!w || w <= 0) {
                  toast.error('Weighbridge reading required', 'Take the vehicle over the weighbridge before sealing.')
                  return
                }
                const variance = ((w - sealing.plannedWeightKg) / sealing.plannedWeightKg) * 100
                crud.update(sealing.uid, {
                  sealNo: seal.trim(),
                  sealVerified: Math.abs(variance) <= 2,
                  actualWeightKg: w,
                  status: Math.abs(variance) <= 2 ? 'SEALED' : 'LOADING',
                  photosAttached: sealing.photosAttached + 1,
                })
                if (Math.abs(variance) > 2) {
                  toast.error(
                    'Weight does not agree',
                    `The weighbridge reads ${w.toLocaleString('en-IN')} kg against a planned ${Math.round(sealing.plannedWeightKg).toLocaleString('en-IN')} kg — ${variance.toFixed(1)}% out. The seal is recorded but not verified, and the vehicle cannot be released until the count is checked.`,
                  )
                } else {
                  toast.success(
                    'Sealed and verified',
                    `Seal ${seal.trim()} recorded at ${w.toLocaleString('en-IN')} kg, within ${Math.abs(variance).toFixed(1)}% of plan. A photo of the seal has been attached. The vehicle can be dispatched.`,
                  )
                }
                setSealing(null)
              }}
            >
              Record seal
            </Button>
          </>
        }
      >
        {sealing && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{sealing.cartonsLoaded} cartons loaded on {sealing.palletsLoaded} pallets</p>
              <p className="mt-1 text-fg-muted">
                Expected weight <span className="font-medium tabular text-fg">{Math.round(sealing.plannedWeightKg).toLocaleString('en-IN')} kg</span>.
                Anything more than 2% out is refused — that is roughly one pallet on a full load.
              </p>
            </div>
            <Input label="Seal number" value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="SL-448120" />
            <Input label="Weighbridge reading (kg)" type="number" value={bridgeWeight} onChange={(e) => setBridgeWeight(e.target.value)} />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why the sequence cannot be shortened" description="Each step catches a different kind of mistake" />
        <CardBody className="space-y-2">
          {STEPS.map((s, i) => (
            <div key={s.state} className="flex gap-3 rounded border border-border p-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-2xs font-semibold tabular text-brand-600">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-fg">{s.label}</p>
                <p className="text-2xs leading-relaxed text-fg-muted">{s.detail}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
