import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useLiveCrud } from '@/components/crud/CrudKit'
import { shipmentApi } from '@/api/shipmentApi'
import { vehicleApi } from '@/api/vehicleApi'
import { useEffect, useState } from 'react'
import {
  DispatchStatusBadge,
  DocCell,
  EtaChip,
  PartyCell,
  SHIPMENT_TYPE_LABEL,
  WeightCell,
  useCanSeeFreight,
} from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { pods as seedPods } from '@/mock/dispatch'
import type { Pod, Shipment, ShipmentType, Vehicle } from '@/types/dispatch'

const TABS = [
  { id: 'ALL', label: 'All shipments' },
  { id: 'MOVING', label: 'On the road' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'EXPORT', label: 'Export' },
]

/**
 * Shipments — the consignment as the outside world sees it: a challan number, an
 * invoice, an e-way bill, a vehicle and a promise about when it arrives. Six
 * shipment types exist because each carries different paperwork; a sample needs
 * no invoice, an export needs eight documents.
 */
export function ShipmentsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeFreight()
  const podSeed = useMemo(() => seedPods, [])

  const [shipments, setShipments] = useState<Shipment[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  const fetchData = async () => {
    try {
      const [sData, vData] = await Promise.all([
        shipmentApi.getAll(),
        vehicleApi.getAll()
      ])
      setShipments(sData)
      setVehicles(vData)
    } catch (err) {
      toast.error('Failed to load data', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const crud = useLiveCrud<Shipment>({
    key: 'dispatch:shipment',
    seed,
    entity: 'Shipment',
    titleOf: (s) => s.docNo,
    fields: [
      { name: 'docNo', label: 'Shipment number', required: true, readOnly: true },
      {
        name: 'shipmentType',
        label: 'Shipment type',
        type: 'select',
        required: true,
        options: Object.entries(SHIPMENT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'customer', label: 'Customer', required: true },
      { name: 'destination', label: 'Destination', required: true, span: 2 },
      { name: 'region', label: 'Region', required: true },
      { name: 'route', label: 'Route', required: true },
      { name: 'challanNo', label: 'Delivery challan', required: true },
      { name: 'invoiceNo', label: 'Invoice', hint: 'A sample or replacement ships without one' },
      { name: 'ewayBillNo', label: 'E-way bill', hint: 'Required above ₹50,000 for interstate movement' },
      { name: 'vehicleNo', label: 'Vehicle', required: true, upper: true },
      { name: 'transporter', label: 'Transporter', required: true },
      { name: 'driver', label: 'Driver', required: true },
      { name: 'driverPhone', label: 'Driver phone', type: 'tel', maxLength: 10, validate: (v) => !/^\d{10}$/.test(v) ? 'Phone number must be exactly 10 digits.' : undefined },
      { name: 'cartons', label: 'Cartons', type: 'number', required: true },
      { name: 'pallets', label: 'Pallets', type: 'number' },
      { name: 'weightKg', label: 'Weight (kg)', type: 'number', required: true },
      { name: 'invoiceValue', label: 'Invoice value', type: 'number' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        status: 'PLANNED' as const,
        dispatchPlanNo: '—',
        customerCode: 'CUS-NEW',
        dispatchedAt: null,
        etaAt: null,
        deliveredAt: null,
        lastLocation: null,
        lastUpdatedAt: null,
        delayReason: null,
        podStatus: 'NOT_DUE' as const,
      }),
      shipmentType: v.shipmentType as ShipmentType,
      isExport: v.shipmentType === 'EXPORT',
      customer: v.customer,
      destination: v.destination,
      region: v.region,
      route: v.route,
      challanNo: v.challanNo,
      invoiceNo: v.invoiceNo || null,
      ewayBillNo: v.ewayBillNo || null,
      vehicleNo: v.vehicleNo,
      transporter: v.transporter,
      driver: v.driver,
      driverPhone: v.driverPhone,
      cartons: Number(v.cartons) || 0,
      pallets: Number(v.pallets) || 0,
      weightKg: Number(v.weightKg) || 0,
      invoiceValue: Number(v.invoiceValue) || 0,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (s) =>
      s.status === 'DELIVERED' || s.status === 'CLOSED'
        ? `${s.docNo} has been delivered. A delivered shipment is the customer's record as much as ours — it cannot be deleted.`
        : s.status === 'IN_TRANSIT'
          ? `${s.docNo} is in transit on ${s.vehicleNo}. It cannot be deleted while the goods are on the road.`
          : undefined,
  }, shipments, shipmentApi, fetchData)

  const { rows: pods, update: updatePod } = useCollection<Pod>('dispatch:pod', podSeed)

  const [tab, setTab] = useState('ALL')
  const [dispatching, setDispatching] = useState<Shipment | null>(null)
  const [eway, setEway] = useState('')
  const [invoice, setInvoice] = useState('')

  const visible = shipments.filter((s) => {
    if (tab === 'MOVING') return s.status === 'DISPATCHED' || s.status === 'IN_TRANSIT' || s.status === 'LOADED'
    if (tab === 'DELIVERED') return s.status === 'DELIVERED' || s.status === 'CLOSED'
    if (tab === 'EXPORT') return s.isExport
    return true
  })

  const moving = shipments.filter((s) => s.status === 'IN_TRANSIT' || s.status === 'DISPATCHED')
  const delayed = shipments.filter((s) => !!s.delayReason && s.status !== 'DELIVERED' && s.status !== 'CLOSED')
  const podPending = shipments.filter((s) => s.podStatus === 'PENDING')
  const totalValue = visible.reduce((s, x) => s + x.invoiceValue, 0)

  /** Interstate movement above ₹50,000 needs an e-way bill before it leaves. */
  function ewayRequired(s: Shipment) {
    return !s.isExport && s.invoiceValue > 50_000 && s.region !== 'South'
  }

  const columns: Column<Shipment>[] = [
    { key: 'docNo', header: 'Shipment', sortable: true, width: '12rem', render: (s) => (
      <DocCell docNo={s.docNo} sub={`${s.challanNo}${s.invoiceNo ? ` · ${s.invoiceNo}` : ''}`} />
    ) },
    { key: 'shipmentType', header: 'Type', sortable: true, width: '9rem', render: (s) => (
      <Badge tone={s.isExport ? 'progress' : s.shipmentType === 'REPLACEMENT' ? 'warning' : 'neutral'} size="sm" dot={false}>
        {SHIPMENT_TYPE_LABEL[s.shipmentType]}
      </Badge>
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (s) => <PartyCell name={s.customer} place={s.destination} /> },
    { key: 'vehicleNo', header: 'Vehicle · driver', sortable: true, render: (s) => (
      <div className="min-w-0">
        <p className="truncate font-mono text-2xs text-fg">{s.vehicleNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{s.driver} · {s.transporter}</p>
      </div>
    ) },
    { key: 'cartons', header: 'Cartons', align: 'right', sortable: true, width: '7rem', render: (s) => (
      <span className="tabular text-xs">{formatQty(s.cartons)}</span>
    ) },
    { key: 'weightKg', header: 'Weight', align: 'right', sortable: true, width: '8rem', render: (s) => <WeightCell kg={s.weightKg} /> },
    ...(canSeeValue
      ? [{
          key: 'invoiceValue', header: 'Invoice value', align: 'right' as const, sortable: true, width: '10rem',
          render: (s: Shipment) => (s.invoiceValue ? formatCurrency(s.invoiceValue) : <span className="text-2xs text-fg-subtle">no charge</span>),
        }]
      : []),
    { key: 'ewayBillNo', header: 'E-way bill', sortable: true, width: '11rem', render: (s) => (
      s.ewayBillNo ? (
        <span className="font-mono text-2xs text-fg">{s.ewayBillNo}</span>
      ) : ewayRequired(s) ? (
        <Badge tone="danger" size="sm">required</Badge>
      ) : (
        <span className="text-2xs text-fg-subtle">not needed</span>
      )
    ) },
    { key: 'dispatchedAt', header: 'Dispatched', sortable: true, width: '10rem', accessor: (s) => s.dispatchedAt ?? '', render: (s) => (
      s.dispatchedAt ? <span className="text-2xs">{formatDateTime(s.dispatchedAt)}</span> : <span className="text-2xs text-fg-subtle">not yet</span>
    ) },
    { key: 'eta', header: 'Arrival', width: '10rem', sortable: true, accessor: (s) => s.etaAt ?? '', render: (s) => (
      <div className="min-w-0">
        {s.etaAt && <p className="text-2xs text-fg-muted">{formatDateTime(s.etaAt)}</p>}
        <EtaChip eta={s.etaAt} delivered={s.deliveredAt} />
      </div>
    ) },
    { key: 'delayReason', header: 'Delay', render: (s) => (
      s.delayReason ? <span className="text-2xs text-danger">{s.delayReason}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'podStatus', header: 'POD', sortable: true, width: '8rem', render: (s) => <DispatchStatusBadge status={s.podStatus} size="sm" /> },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (s) => <DispatchStatusBadge status={s.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'shipment-register', 'Shipment register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Shipments"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Shipments' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/tracking')}>Track shipments</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({ docNo: `SHP/2607/${String(513 + shipments.length).padStart(4, '0')}`, shipmentType: 'DOMESTIC', region: 'South' })}
            >
              New shipment
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', moving.length ? 'text-progress' : 'text-fg')}>{moving.length}</span> shipment
        {moving.length === 1 ? '' : 's'} on the road
        {delayed.length > 0 && <>, <span className="font-medium text-danger">{delayed.length}</span> running late</>}
        {podPending.length > 0 && <>, <span className="font-medium text-warning">{podPending.length}</span> awaiting proof of delivery</>}
        {canSeeValue && <> · <span className="font-medium text-fg tabular">{formatCurrency(totalValue)}</span> of invoice value shown</>}
        .
      </p>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(s) => String((s as any).id || s.uid)}
        searchPlaceholder="Search shipment, challan, invoice, customer or vehicle…"
        onExport={doExport}
        emptyTitle="No shipments"
        rowClassName={(s) => cn(
          !!s.delayReason && s.status !== 'DELIVERED' && 'bg-danger/[0.04]',
          s.podStatus === 'PENDING' && 'bg-warning/[0.03]',
          ewayRequired(s) && !s.ewayBillNo && 'bg-danger/[0.05]',
        )}
        rowActions={(s) => (
          <>
            <MenuItem label="Edit the shipment" onClick={() => crud.openEdit(s)} />
            <MenuItem label="Delete the shipment" danger onClick={() => crud.askDelete(s)} />
            <MenuItem
              separatorBefore
              label="Dispatch the shipment"
              disabled={s.status !== 'PLANNED' && s.status !== 'LOADED'}
              onClick={() => { setDispatching(s); setEway(s.ewayBillNo ?? ''); setInvoice(s.invoiceNo ?? '') }}
            />
            <MenuItem
              label="Confirm delivery"
              disabled={s.status !== 'IN_TRANSIT' && s.status !== 'DISPATCHED'}
              onClick={() => {
                shipmentApi.update((s as any).id, {
                  ...s,
                  status: 'DELIVERED',
                  deliveredAt: new Date().toISOString(),
                  lastLocation: `Delivered — ${s.destination}`,
                  lastUpdatedAt: new Date().toISOString(),
                  podStatus: 'PENDING',
                }).then(fetchData)
                const v = vehicles.find((x) => x.vehicleNo === s.vehicleNo)
                if (v) vehicleApi.update((v as any).id, { ...v, state: 'RETURNING', currentShipmentNo: null }).then(fetchData)
                const pod = pods.find((p) => p.shipmentNo === s.docNo)
                if (pod) updatePod(pod.uid, { status: 'PENDING' })
                toast.success(
                  'Delivery confirmed',
                  `${s.docNo} delivered at ${s.destination}. Proof of delivery is now outstanding — capture it on the POD screen before the invoice can be closed.`,
                )
                navigate('/dispatch/pod')
              }}
            />
            <MenuItem label="Track this shipment" onClick={() => navigate('/dispatch/tracking')} />
            <MenuItem label="Open proof of delivery" onClick={() => navigate('/dispatch/pod')} />
            <MenuItem label="See the freight cost" onClick={() => navigate('/dispatch/freight')} />
            <MenuItem label="Print the challan" onClick={() => doExport('pdf')} />
            <MenuItem
              separatorBefore
              label="Cancel the shipment"
              danger
              disabled={s.status === 'DELIVERED' || s.status === 'CLOSED' || s.status === 'CANCELLED'}
              onClick={() => {
                shipmentApi.update((s as any).id, { ...s, status: 'CANCELLED' }).then(fetchData)
                const v = vehicles.find((x) => x.vehicleNo === s.vehicleNo)
                if (v) vehicleApi.update((v as any).id, { ...v, state: 'AVAILABLE', currentShipmentNo: null }).then(fetchData)
                toast.success('Shipment cancelled', `${s.docNo} cancelled with a reason recorded against it. ${s.vehicleNo} is back in the pool.`)
              }}
            />
          </>
        )}
      />

      <Modal
        open={!!dispatching}
        onClose={() => setDispatching(null)}
        title={dispatching ? `Dispatch ${dispatching.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDispatching(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!dispatching) return
                if (ewayRequired(dispatching) && !eway.trim()) {
                  toast.error(
                    'E-way bill required',
                    `${dispatching.docNo} is an interstate movement worth ${formatCurrency(dispatching.invoiceValue)}. Above ₹50,000 the e-way bill has to be generated before the vehicle leaves, not after.`,
                  )
                  return
                }
                if (dispatching.shipmentType !== 'SAMPLE' && dispatching.shipmentType !== 'REPLACEMENT' && !invoice.trim()) {
                  toast.error('Invoice required', `A ${SHIPMENT_TYPE_LABEL[dispatching.shipmentType].toLowerCase()} shipment cannot leave without an invoice.`)
                  return
                }
                const now = new Date()
                const eta = new Date(now.getTime() + (dispatching.isExport ? 30 : dispatching.region === 'South' ? 1 : 3) * 86_400_000)
                shipmentApi.update((dispatching as any).id, {
                  ...dispatching,
                  status: 'DISPATCHED',
                  dispatchedAt: now.toISOString(),
                  etaAt: eta.toISOString(),
                  ewayBillNo: eway.trim() || null,
                  invoiceNo: invoice.trim() || null,
                  lastLocation: 'Left the plant',
                  lastUpdatedAt: now.toISOString(),
                  podStatus: 'PENDING',
                }).then(fetchData)
                const v = vehicles.find((x) => x.vehicleNo === dispatching.vehicleNo)
                if (v) vehicleApi.update((v as any).id, { ...v, state: 'IN_TRANSIT', currentShipmentNo: dispatching.docNo }).then(fetchData)
                toast.success(
                  'Shipment dispatched',
                  `${dispatching.docNo} has left on ${dispatching.vehicleNo}. Expected at ${dispatching.destination} by ${eta.toLocaleDateString('en-IN')}.`,
                )
                setDispatching(null)
              }}
            >
              Dispatch
            </Button>
          </>
        }
      >
        {dispatching && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{dispatching.customer} — {dispatching.destination}</p>
              <p className="mt-1 text-fg-muted">
                {formatQty(dispatching.cartons)} cartons, {Math.round(dispatching.weightKg).toLocaleString('en-IN')} kg on{' '}
                {dispatching.vehicleNo} · {dispatching.driver}, {dispatching.driverPhone}
                {canSeeValue && dispatching.invoiceValue > 0 && ` · ${formatCurrency(dispatching.invoiceValue)}`}
              </p>
            </div>
            <Input
              label={dispatching.shipmentType === 'SAMPLE' || dispatching.shipmentType === 'REPLACEMENT' ? 'Invoice (optional for this type)' : 'Invoice number'}
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="INV/2627/0890"
            />
            <Input
              label={ewayRequired(dispatching) ? 'E-way bill number (required)' : 'E-way bill number (not required)'}
              value={eway}
              onChange={(e) => setEway(e.target.value)}
              placeholder="2418 7743 9021"
              hint={
                ewayRequired(dispatching)
                  ? `Interstate movement worth ${formatCurrency(dispatching.invoiceValue)} — above the ₹50,000 threshold`
                  : dispatching.isExport
                    ? 'Export consignments move on the shipping bill, not an e-way bill'
                    : 'Intrastate movement below the threshold'
              }
            />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Six shipment types, six sets of paperwork" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-fg">Domestic</span> — challan, invoice, and an e-way bill above ₹50,000 interstate.</p>
          <p><span className="font-medium text-fg">Export</span> — shipping bill, bill of lading, certificate of origin and five more. No e-way bill.</p>
          <p><span className="font-medium text-fg">Sample</span> — a delivery challan marked "not for sale" and no invoice. Still needs to be tracked; samples decide orders.</p>
          <p><span className="font-medium text-fg">Replacement</span> — goes out against a return, at no charge. The credit note lives on the return, not here.</p>
          <p><span className="font-medium text-fg">Distributor</span> — usually consignment stock, so the invoice may follow the sale rather than the shipment.</p>
          <p><span className="font-medium text-fg">E-commerce</span> — hundreds of small cartons to a fulfilment centre, with the marketplace's own labels and appointment slots.</p>
        </CardBody>
      </Card>
    </div>
  )
}
