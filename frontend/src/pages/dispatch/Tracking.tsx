import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DispatchStatusBadge, EtaChip, PartyCell } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { shipmentApi } from '@/api/shipmentApi'
import { vehicleApi } from '@/api/vehicleApi'
import { useEffect } from 'react'
import type { Shipment, Vehicle } from '@/types/dispatch'

const TABS = [
  { id: 'MOVING', label: 'On the road' },
  { id: 'LATE', label: 'Late or delayed' },
  { id: 'GPS', label: 'GPS tracked' },
  { id: 'ALL', label: 'Everything' },
]

/**
 * Logistics tracking — where every consignment is right now, and which ones are
 * not going to arrive when we told the customer they would. Four alerts matter:
 * running late, gone quiet, delivery missed, and proof of delivery outstanding.
 */
export function TrackingPage() {
  const toast = useToast()
  const navigate = useNavigate()
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

  const [tab, setTab] = useState('MOVING')
  const [updating, setUpdating] = useState<Shipment | null>(null)
  const [location, setLocation] = useState('')
  const [reason, setReason] = useState('')

  const hoursLate = (s: Shipment) =>
    s.etaAt && !s.deliveredAt ? Math.round((Date.now() - new Date(s.etaAt).getTime()) / 3_600_000) : 0
  const hoursSilent = (s: Shipment) =>
    s.lastUpdatedAt ? Math.round((Date.now() - new Date(s.lastUpdatedAt).getTime()) / 3_600_000) : 999

  const inTransit = shipments.filter((s) => s.status === 'IN_TRANSIT' || s.status === 'DISPATCHED')
  const late = inTransit.filter((s) => hoursLate(s) > 0)
  const silent = inTransit.filter((s) => hoursSilent(s) > 12)
  const podOutstanding = shipments.filter((s) => s.podStatus === 'PENDING')

  const gpsOf = (s: Shipment) => vehicles.find((v) => v.vehicleNo === s.vehicleNo)?.hasGps ?? false

  const visible = shipments.filter((s) => {
    if (tab === 'MOVING') return s.status === 'IN_TRANSIT' || s.status === 'DISPATCHED'
    if (tab === 'LATE') return hoursLate(s) > 0 || !!s.delayReason
    if (tab === 'GPS') return gpsOf(s) && (s.status === 'IN_TRANSIT' || s.status === 'DISPATCHED')
    return true
  })

  const columns: Column<Shipment>[] = [
    { key: 'docNo', header: 'Shipment', sortable: true, width: '11.5rem', render: (s) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{s.docNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{s.challanNo}</p>
      </div>
    ) },
    { key: 'customer', header: 'Going to', sortable: true, render: (s) => <PartyCell name={s.customer} place={s.destination} /> },
    { key: 'lastLocation', header: 'Where it is now', sortable: true, render: (s) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{s.lastLocation ?? 'no update yet'}</p>
        <p className={cn('text-2xs', hoursSilent(s) > 12 ? 'text-warning' : 'text-fg-subtle')}>
          {s.lastUpdatedAt ? `updated ${hoursSilent(s)} h ago` : 'never updated'}
        </p>
      </div>
    ) },
    { key: 'gps', header: 'GPS', align: 'center', width: '6rem', accessor: (s) => (gpsOf(s) ? 1 : 0), render: (s) => (
      gpsOf(s) ? <Badge tone="success" size="sm" dot={false}>live</Badge> : <span className="text-2xs text-fg-subtle">manual</span>
    ) },
    { key: 'vehicleNo', header: 'Vehicle · driver', sortable: true, render: (s) => (
      <div className="min-w-0">
        <p className="truncate font-mono text-2xs text-fg">{s.vehicleNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{s.driver} · {s.driverPhone}</p>
      </div>
    ) },
    { key: 'transporter', header: 'Transporter', sortable: true, width: '11rem' },
    { key: 'dispatchedAt', header: 'Left', sortable: true, width: '10rem', accessor: (s) => s.dispatchedAt ?? '', render: (s) => (
      s.dispatchedAt ? <span className="text-2xs">{formatDateTime(s.dispatchedAt)}</span> : <span className="text-2xs text-fg-subtle">not yet</span>
    ) },
    { key: 'etaAt', header: 'Expected', sortable: true, width: '10.5rem', accessor: (s) => s.etaAt ?? '', render: (s) => (
      <div className="min-w-0">
        {s.etaAt && <p className="text-2xs text-fg-muted">{formatDateTime(s.etaAt)}</p>}
        <EtaChip eta={s.etaAt} delivered={s.deliveredAt} />
      </div>
    ) },
    { key: 'cartons', header: 'Cartons', align: 'right', sortable: true, width: '7rem', render: (s) => (
      <span className="tabular text-xs">{formatQty(s.cartons)}</span>
    ) },
    { key: 'delayReason', header: 'Why late', render: (s) => (
      s.delayReason ? <span className="text-2xs text-danger">{s.delayReason}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'podStatus', header: 'POD', sortable: true, width: '8rem', render: (s) => <DispatchStatusBadge status={s.podStatus} size="sm" /> },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (s) => <DispatchStatusBadge status={s.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'shipment-tracking', 'Shipment tracking', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Shipment tracking"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Tracking' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/dispatch/pod')}>Proof of delivery</Button>}
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      {/* Alert strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-3">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">On the road</p>
          <p className="mt-1 text-2xl font-semibold tabular text-fg">{inTransit.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">
            {formatQty(inTransit.reduce((s, x) => s + x.cartons, 0))} cartons in transit
          </p>
        </div>
        <div className={cn('card p-3', late.length && 'border-danger/30 bg-danger/[0.03]')}>
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Running late</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', late.length ? 'text-danger' : 'text-success')}>{late.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">
            {late.length ? `worst is ${Math.max(...late.map(hoursLate))} h past the promised time` : 'everything is on schedule'}
          </p>
        </div>
        <div className={cn('card p-3', silent.length && 'border-warning/30 bg-warning/[0.03]')}>
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Gone quiet</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', silent.length ? 'text-warning' : 'text-success')}>{silent.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">no position update in over 12 hours</p>
        </div>
        <div className={cn('card p-3', podOutstanding.length && 'border-warning/30 bg-warning/[0.03]')}>
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">POD outstanding</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', podOutstanding.length ? 'text-warning' : 'text-success')}>{podOutstanding.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">delivered but not signed for — the invoice cannot close</p>
        </div>
      </div>

      {(late.length > 0 || silent.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Needs a phone call" description="Somebody has to ring the driver or the transporter about each of these" />
          <CardBody className="space-y-2">
            {[...new Set([...late, ...silent])].map((s) => (
              <div key={String((s as any).id || s.uid)} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {s.docNo} — {s.customer}
                  </p>
                  <p className="text-2xs text-fg-muted">
                    {hoursLate(s) > 0 && `${hoursLate(s)} h past the promised arrival. `}
                    {hoursSilent(s) > 12 && `No position update for ${hoursSilent(s)} h. `}
                    Last seen {s.lastLocation ?? 'never reported'} · {s.driver} on {s.driverPhone}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setUpdating(s); setLocation(s.lastLocation ?? ''); setReason(s.delayReason ?? '') }}
                  >
                    Update the position
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      toast.info(
                        'Customer notified',
                        `A delay notification for ${s.docNo} has been queued to ${s.customer}. Telling them before they ring us is the difference between a delay and a complaint.`,
                      )
                    }
                  >
                    Notify the customer
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(s) => String((s as any).id || s.uid)}
        searchPlaceholder="Search shipment, customer, vehicle, driver or transporter…"
        onExport={doExport}
        emptyTitle="Nothing to track"
        emptyDescription="Shipments appear here from the moment they leave the plant until proof of delivery is received."
        rowClassName={(s) => cn(
          hoursLate(s) > 0 && 'bg-danger/[0.04]',
          hoursLate(s) <= 0 && hoursSilent(s) > 12 && (s.status === 'IN_TRANSIT' || s.status === 'DISPATCHED') && 'bg-warning/[0.04]',
        )}
        rowActions={(s) => (
          <>
            <MenuItem
              label="Edit the position"
              onClick={() => { setUpdating(s); setLocation(s.lastLocation ?? ''); setReason(s.delayReason ?? '') }}
            />
            <MenuItem
              label="Delete the delay note"
              danger
              disabled={!s.delayReason}
              onClick={() => {
                shipmentApi.update((s as any).id, { ...s, delayReason: null }).then(fetchData)
                toast.success('Delay note cleared', `${s.docNo} no longer shows a delay reason. The shipment itself is untouched.`)
              }}
            />
            <MenuItem
              separatorBefore
              label="Confirm it has arrived"
              disabled={s.status !== 'IN_TRANSIT' && s.status !== 'DISPATCHED'}
              onClick={() => {
                shipmentApi.update((s as any).id, {
                  ...s,
                  status: 'DELIVERED',
                  deliveredAt: new Date().toISOString(),
                  lastLocation: `Delivered — ${s.destination}`,
                  lastUpdatedAt: new Date().toISOString(),
                  podStatus: 'PENDING',
                  delayReason: hoursLate(s) > 0 ? s.delayReason : null,
                }).then(fetchData)
                toast.success('Arrival recorded', `${s.docNo} arrived at ${s.destination}. Proof of delivery is now the outstanding item.`)
              }}
            />
            <MenuItem
              label="Notify the customer"
              onClick={() => toast.info('Customer notified', `Status update for ${s.docNo} queued to ${s.customer}.`)}
            />
            <MenuItem label="Open proof of delivery" onClick={() => navigate('/dispatch/pod')} />
            <MenuItem label="Open the shipment" onClick={() => navigate('/dispatch/shipments')} />
          </>
        )}
      />

      <Modal
        open={!!updating}
        onClose={() => setUpdating(null)}
        title={updating ? `Position — ${updating.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setUpdating(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!updating) return
                if (!location.trim()) {
                  toast.error('Enter a location', 'Where is the vehicle now? "Krishnagiri toll — NH 44" is enough.')
                  return
                }
                shipmentApi.update((updating as any).id, {
                  ...updating,
                  lastLocation: location.trim(),
                  lastUpdatedAt: new Date().toISOString(),
                  delayReason: reason.trim() || null,
                  status: updating.status === 'DISPATCHED' ? 'IN_TRANSIT' : updating.status,
                }).then(fetchData)
                toast.success('Position updated', `${updating.docNo} is at ${location.trim()}.${reason.trim() ? ' The delay reason is recorded and visible to sales.' : ''}`)
                setUpdating(null)
              }}
            >
              Update
            </Button>
          </>
        }
      >
        {updating && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{updating.customer} — {updating.destination}</p>
              <p className="mt-1 text-fg-muted">
                {updating.vehicleNo} · {updating.driver}, {updating.driverPhone}
                {updating.etaAt && ` · promised ${formatDateTime(updating.etaAt)}`}
                {hoursLate(updating) > 0 && (
                  <span className="font-medium text-danger"> · {hoursLate(updating)} h late</span>
                )}
              </p>
              {!gpsOf(updating) && (
                <p className="mt-1.5 text-2xs text-warning">
                  This vehicle has no GPS, so the only position we get is the one somebody types in after ringing the driver.
                </p>
              )}
            </div>
            <Input label="Where is it now" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Krishnagiri toll — NH 44" />
            <Textarea
              label="Delay reason (only if it is running late)"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Held 9 hours at Hosur after a tyre burst. Revised arrival 14:00 today."
              hint="Sales can see this, so write it the way you would want it read to the customer"
            />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Four alerts, and what each one is really telling you" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Running late</span> — past the promised arrival. The customer usually knows before we do, which is the wrong way round.</p>
          <p><span className="font-medium text-fg">Gone quiet</span> — no position update in half a day. On a GPS vehicle that means the device has failed; on a manual one it means nobody rang.</p>
          <p><span className="font-medium text-fg">Delivery missed</span> — arrived but was turned away, usually a missed dock appointment. It costs a second trip.</p>
          <p><span className="font-medium text-fg">POD outstanding</span> — delivered but nothing signed. Without proof of delivery the invoice cannot be closed and payment slips a month.</p>
        </CardBody>
      </Card>
    </div>
  )
}
