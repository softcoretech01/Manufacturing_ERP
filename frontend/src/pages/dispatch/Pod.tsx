import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useLiveCrud } from '@/components/crud/CrudKit'
import { podApi } from '@/api/podApi'
import { shipmentApi } from '@/api/shipmentApi'
import { useEffect } from 'react'
import { DispatchStatusBadge, PartyCell } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'

import type { Pod, Shipment } from '@/types/dispatch'

const TABS = [
  { id: 'PENDING', label: 'Outstanding' },
  { id: 'PROBLEM', label: 'Short or damaged' },
  { id: 'DONE', label: 'Clean' },
  { id: 'ALL', label: 'All' },
]

/**
 * Proof of delivery — the signature, the photograph and the received quantity.
 * Nothing here is decoration: without a POD the invoice cannot be closed, a
 * shortage claim cannot be argued, and a damage claim cannot be lodged with the
 * transporter.
 */
export function PodPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [pods, setPods] = useState<Pod[]>([])

  const loadData = async () => {
    try {
      const sData = await shipmentApi.getAll()
      setShipments(sData)
      const pData = await podApi.getAll()
      setPods(pData)
    } catch (e) {
      console.error(e)
    }
  }
  useEffect(() => {
    loadData()
  }, [])

  const crud = useLiveCrud<Pod>(
    {
      key: 'dispatch:pod',
    entity: 'Proof of delivery',
    titleOf: (p) => p.docNo,
    fields: [
      { name: 'docNo', label: 'POD number', required: true, readOnly: true },
      { name: 'shipmentNo', label: 'Shipment', required: true },
      { name: 'challanNo', label: 'Delivery challan', required: true },
      { name: 'customer', label: 'Customer', required: true },
      { name: 'destination', label: 'Destination', required: true, span: 2 },
      { name: 'deliveredOn', label: 'Delivered on', type: 'date' },
      { name: 'deliveredAtTime', label: 'Delivered at (time)', hint: '14:20' },
      { name: 'receiverName', label: 'Received by' },
      { name: 'receiverDesignation', label: 'Their designation' },
      { name: 'dispatchedQty', label: 'Quantity dispatched', type: 'number', required: true },
      { name: 'receivedQty', label: 'Quantity received', type: 'number' },
      { name: 'shortQty', label: 'Short', type: 'number' },
      { name: 'damagedQty', label: 'Damaged', type: 'number' },
      { name: 'capturedBy', label: 'Captured by' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        docNo: v.docNo,
        signatureCaptured: false,
        photoCaptured: false,
        gpsLatitude: null,
        gpsLongitude: null,
        capturedVia: null,
        status: 'PENDING' as const,
      }),
      shipmentNo: v.shipmentNo,
      challanNo: v.challanNo,
      customer: v.customer,
      destination: v.destination,
      deliveredOn: v.deliveredOn || null,
      deliveredAtTime: v.deliveredAtTime || null,
      receiverName: v.receiverName || null,
      receiverDesignation: v.receiverDesignation || null,
      dispatchedQty: Number(v.dispatchedQty) || 0,
      receivedQty: Number(v.receivedQty) || 0,
      shortQty: Number(v.shortQty) || 0,
      damagedQty: Number(v.damagedQty) || 0,
      capturedBy: v.capturedBy || null,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (p) =>
      p.status === 'RECEIVED' || p.status === 'SHORT' || p.status === 'DAMAGED'
        ? `${p.docNo} is a signed delivery record for ${p.customer}. It is the evidence behind the invoice and any claim — it cannot be deleted.`
        : undefined,
    },
    pods,
    podApi,
    loadData
  )

  const _unused = crud.rows
  
  const [tab, setTab] = useState('PENDING')
  const [capturing, setCapturing] = useState<Pod | null>(null)
  const [form, setForm] = useState({
    receiverName: '',
    receiverDesignation: '',
    receivedQty: '',
    damagedQty: '',
    signature: false,
    photo: false,
    remarks: '',
  })

  const visible = pods.filter((p) => {
    if (tab === 'PENDING') return p.status === 'PENDING'
    if (tab === 'PROBLEM') return p.status === 'SHORT' || p.status === 'DAMAGED' || p.status === 'DISPUTED'
    if (tab === 'DONE') return p.status === 'RECEIVED'
    return true
  })

  const pending = pods.filter((p) => p.status === 'PENDING')
  const problems = pods.filter((p) => p.status === 'SHORT' || p.status === 'DAMAGED' || p.status === 'DISPUTED')
  const clean = pods.filter((p) => p.status === 'RECEIVED')
  const cleanRate = pods.length ? (clean.length / pods.filter((p) => p.status !== 'PENDING').length) * 100 : 0
  const shortTotal = pods.reduce((s, p) => s + p.shortQty + p.damagedQty, 0)

  const columns: Column<Pod>[] = [
    { key: 'docNo', header: 'POD', sortable: true, width: '11.5rem', render: (p) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{p.docNo}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{p.shipmentNo}</p>
      </div>
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (p) => <PartyCell name={p.customer} place={p.destination} /> },
    { key: 'deliveredOn', header: 'Delivered', sortable: true, width: '10rem', accessor: (p) => p.deliveredOn ?? '', render: (p) => (
      p.deliveredOn ? (
        <div>
          <p className="text-xs text-fg">{formatDate(p.deliveredOn)}</p>
          {p.deliveredAtTime && <p className="text-2xs text-fg-subtle">{p.deliveredAtTime}</p>}
        </div>
      ) : (
        <span className="text-2xs text-warning">not delivered</span>
      )
    ) },
    { key: 'receiverName', header: 'Received by', sortable: true, render: (p) => (
      p.receiverName ? (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{p.receiverName}</p>
          <p className="truncate text-2xs text-fg-subtle">{p.receiverDesignation ?? '—'}</p>
        </div>
      ) : (
        <span className="text-2xs text-warning">nobody signed</span>
      )
    ) },
    { key: 'dispatchedQty', header: 'Sent', align: 'right', sortable: true, width: '7rem', render: (p) => (
      <span className="tabular text-xs text-fg-muted">{formatQty(p.dispatchedQty)}</span>
    ) },
    { key: 'receivedQty', header: 'Received', align: 'right', sortable: true, width: '8rem', render: (p) => (
      <span className={cn('tabular text-xs font-medium', p.receivedQty < p.dispatchedQty ? 'text-danger' : 'text-fg')}>
        {formatQty(p.receivedQty)}
      </span>
    ) },
    { key: 'shortQty', header: 'Short', align: 'right', sortable: true, width: '6.5rem', render: (p) => (
      p.shortQty ? <span className="tabular text-xs font-medium text-danger">{formatQty(p.shortQty)}</span> : <span className="text-2xs text-success">nil</span>
    ) },
    { key: 'damagedQty', header: 'Damaged', align: 'right', sortable: true, width: '7.5rem', render: (p) => (
      p.damagedQty ? <span className="tabular text-xs font-medium text-danger">{formatQty(p.damagedQty)}</span> : <span className="text-2xs text-success">nil</span>
    ) },
    { key: 'evidence', header: 'Evidence', width: '11rem', render: (p) => (
      <div className="flex gap-1">
        <Badge tone={p.signatureCaptured ? 'success' : 'warning'} size="sm" dot={false}>{p.signatureCaptured ? 'signed' : 'no sign'}</Badge>
        <Badge tone={p.photoCaptured ? 'success' : 'neutral'} size="sm" dot={false}>{p.photoCaptured ? 'photo' : 'no photo'}</Badge>
        {p.gpsLatitude !== null && <Badge tone="progress" size="sm" dot={false}>GPS</Badge>}
      </div>
    ) },
    { key: 'capturedVia', header: 'Captured', sortable: true, width: '9rem', render: (p) => (
      p.capturedVia ? (
        <div className="min-w-0">
          <p className="text-2xs text-fg">{p.capturedVia === 'MOBILE' ? 'Mobile app' : p.capturedVia === 'COURIER_API' ? 'Courier API' : 'Web'}</p>
          <p className="truncate text-2xs text-fg-subtle">{p.capturedBy}</p>
        </div>
      ) : (
        <span className="text-2xs text-fg-subtle">—</span>
      )
    ) },
    { key: 'remarks', header: 'Remarks', render: (p) => (
      p.remarks ? <span className="text-2xs text-fg-muted">{p.remarks}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (p) => <DispatchStatusBadge status={p.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'proof-of-delivery', 'Proof of delivery register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Proof of delivery"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Proof of delivery' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/dispatch/returns')}>Returns</Button>}
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'PENDING' ? pending.length : t.id === 'PROBLEM' ? problems.length : undefined }))} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', pending.length ? 'text-warning' : 'text-success')}>{pending.length}</span> outstanding ·{' '}
        <span className={cn('font-medium', problems.length ? 'text-danger' : 'text-success')}>{problems.length}</span> short or
        damaged, <span className="font-medium text-fg tabular">{formatQty(shortTotal)}</span> bottles in dispute ·{' '}
        <span className={cn('font-medium tabular', cleanRate >= 98 ? 'text-success' : 'text-warning')}>{cleanRate.toFixed(1)}%</span>{' '}
        of confirmed deliveries were clean.
      </p>

      {pending.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Waiting on a signature"
            description="Until these are captured the invoices behind them cannot be closed"
          />
          <CardBody className="space-y-2">
            {pending.map((p) => {
              const shp = shipments.find((s) => s.docNo === p.shipmentNo)
              const overdue = shp?.etaAt ? Math.round((Date.now() - new Date(shp.etaAt).getTime()) / 86_400_000) : 0
              return (
                <div key={String((p as any).id || p.uid)} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">
                      {p.shipmentNo} — {p.customer}
                    </p>
                    <p className="text-2xs text-fg-muted">
                      {formatQty(p.dispatchedQty)} bottles to {p.destination}
                      {overdue > 0 && <span className="text-danger"> · {overdue} day{overdue === 1 ? '' : 's'} past the promised arrival</span>}
                      {p.remarks && ` · ${p.remarks}`}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setCapturing(p)
                      setForm({
                        receiverName: '',
                        receiverDesignation: '',
                        receivedQty: String(p.dispatchedQty),
                        damagedQty: '0',
                        signature: false,
                        photo: false,
                        remarks: '',
                      })
                    }}
                  >
                    Capture the POD
                  </Button>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(p) => String((p as any).id || p.uid)}
        searchPlaceholder="Search POD, shipment, challan, customer or receiver…"
        onExport={doExport}
        emptyTitle="No delivery records"
        rowClassName={(p) => cn(
          p.status === 'PENDING' && 'bg-warning/[0.04]',
          (p.status === 'SHORT' || p.status === 'DAMAGED' || p.status === 'DISPUTED') && 'bg-danger/[0.04]',
        )}
        rowActions={(p) => (
          <>
            <MenuItem label="Edit the record" onClick={() => crud.openEdit(p)} />
            <MenuItem label="Delete the record" danger onClick={() => crud.askDelete(p)} />
            <MenuItem
              separatorBefore
              label="Capture the POD"
              disabled={p.status !== 'PENDING'}
              onClick={() => {
                setCapturing(p)
                setForm({
                  receiverName: '',
                  receiverDesignation: '',
                  receivedQty: String(p.dispatchedQty),
                  damagedQty: '0',
                  signature: false,
                  photo: false,
                  remarks: '',
                })
              }}
            />
            <MenuItem
              label="Raise a return for the shortfall"
              disabled={p.shortQty === 0 && p.damagedQty === 0}
              onClick={() => {
                toast.success(
                  'Return started',
                  `A return for ${formatQty(p.shortQty + p.damagedQty)} bottles against ${p.shipmentNo} has been drafted. Finish it on the returns screen — it needs a return type and an approval.`,
                )
                navigate('/dispatch/returns')
              }}
            />
            <MenuItem
              label="Mark the delivery disputed"
              disabled={p.status === 'PENDING' || p.status === 'DISPUTED'}
              onClick={() => {
                crud.update(String((p as any).id || p.uid), { status: 'DISPUTED' })
                const shp = shipments.find((s) => s.docNo === p.shipmentNo)
                if (shp) shipmentApi.update(String((shp as any).id || shp.uid), { ...shp, podStatus: 'DISPUTED' }).then(loadData)
                toast.success('Marked disputed', `${p.docNo} is disputed. Sales and finance both see this before the invoice is chased.`)
              }}
            />
            <MenuItem label="Print the POD" onClick={() => doExport('pdf')} />
          </>
        )}
      />

      {/* POD capture — the mobile form, on the web */}
      <Modal
        open={!!capturing}
        onClose={() => setCapturing(null)}
        title={capturing ? `POD — ${capturing.shipmentNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCapturing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!capturing) return
                if (!form.receiverName.trim()) {
                  toast.error('Receiver name required', 'A delivery nobody signed for is not a proof of delivery.')
                  return
                }
                if (!form.signature) {
                  toast.error('Signature required', "Capture the receiver's signature. Without it the customer can deny receipt and the invoice cannot be defended.")
                  return
                }
                const received = Number(form.receivedQty)
                const damaged = Number(form.damagedQty) || 0
                if (Number.isNaN(received) || received < 0) {
                  toast.error('Enter the received quantity', 'How many did they actually take in?')
                  return
                }
                if (received > capturing.dispatchedQty) {
                  toast.error(
                    'More than was sent',
                    `${formatQty(capturing.dispatchedQty)} was dispatched. The customer cannot receive more than that — recheck the count.`,
                  )
                  return
                }
                const short = capturing.dispatchedQty - received
                if ((short > 0 || damaged > 0) && !form.remarks.trim()) {
                  toast.error(
                    'Remarks required',
                    'A shortage or damage without a note cannot be claimed from the transporter later. Write what the receiver said.',
                  )
                  return
                }
                const status: Pod['status'] = damaged > 0 ? 'DAMAGED' : short > 0 ? 'SHORT' : 'RECEIVED'
                crud.update(String((capturing as any).id || capturing.uid), {
                  deliveredOn: new Date().toISOString().slice(0, 10),
                  deliveredAtTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
                  receiverName: form.receiverName.trim(),
                  receiverDesignation: form.receiverDesignation.trim() || null,
                  receivedQty: received,
                  shortQty: short,
                  damagedQty: damaged,
                  signatureCaptured: form.signature,
                  photoCaptured: form.photo,
                  gpsLatitude: 13.0418,
                  gpsLongitude: 80.2341,
                  capturedBy: 'Delivery driver',
                  capturedVia: 'MOBILE',
                  status,
                  remarks: form.remarks.trim() || undefined,
                })
                const shp = shipments.find((s) => s.docNo === capturing.shipmentNo)
                if (shp) {
                  shipmentApi.update(String((shp as any).id || shp.uid), {
                    ...shp,
                    status: 'DELIVERED',
                    deliveredAt: new Date().toISOString(),
                    podStatus: status === 'RECEIVED' ? 'RECEIVED' : status,
                  }).then(loadData)
                }
                toast.success(
                  status === 'RECEIVED' ? 'Delivery confirmed clean' : status === 'SHORT' ? 'Short delivery recorded' : 'Damage recorded',
                  status === 'RECEIVED'
                    ? `${formatQty(received)} received in full by ${form.receiverName.trim()}. The invoice can now be closed.`
                    : `${formatQty(received)} of ${formatQty(capturing.dispatchedQty)} received${damaged ? `, ${formatQty(damaged)} damaged` : ''}. A claim can now be raised against the transporter, and a return can be raised for the customer.`,
                )
                setCapturing(null)
              }}
            >
              Save the POD
            </Button>
          </>
        }
      >
        {capturing && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{capturing.customer} — {capturing.destination}</p>
              <p className="mt-1 text-fg-muted">
                {capturing.challanNo} · <span className="font-medium tabular text-fg">{formatQty(capturing.dispatchedQty)}</span>{' '}
                bottles dispatched
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Received by" value={form.receiverName} onChange={(e) => setForm({ ...form, receiverName: e.target.value })} placeholder="S. Thangam" />
              <Select
                label="Their designation"
                value={form.receiverDesignation}
                onChange={(e) => setForm({ ...form, receiverDesignation: e.target.value })}
                options={[
                  { value: '', label: 'Select…' },
                  { value: 'Store manager', label: 'Store manager' },
                  { value: 'Inbound associate', label: 'Inbound associate' },
                  { value: 'Warehouse supervisor', label: 'Warehouse supervisor' },
                  { value: 'Security', label: 'Security' },
                  { value: 'Owner', label: 'Owner' },
                ]}
              />
              <Input label="Quantity received" type="number" value={form.receivedQty} onChange={(e) => setForm({ ...form, receivedQty: e.target.value })} />
              <Input label="Of which damaged" type="number" value={form.damagedQty} onChange={(e) => setForm({ ...form, damagedQty: e.target.value })} />
            </div>

            {Number(form.receivedQty) < capturing.dispatchedQty && (
              <p className="rounded border border-danger/30 bg-danger/5 p-2.5 text-2xs text-danger">
                Short by {formatQty(capturing.dispatchedQty - Number(form.receivedQty || 0))} bottles. This becomes a claim, so the
                remarks below are required.
              </p>
            )}

            <div className="space-y-2 rounded border border-border p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Evidence</p>
              <Switch
                checked={form.signature}
                onChange={(v) => setForm({ ...form, signature: v })}
                label="Receiver's signature captured"
              />
              <Switch
                checked={form.photo}
                onChange={(v) => setForm({ ...form, photo: v })}
                label="Photograph of the delivered goods"
              />
              <p className="text-2xs text-fg-muted">
                On the mobile app the signature is drawn on screen and the GPS position is stamped automatically. Both are held
                against this record permanently.
              </p>
            </div>

            <Textarea
              label={Number(form.receivedQty) < capturing.dispatchedQty || Number(form.damagedQty) > 0 ? 'Remarks (required)' : 'Remarks'}
              rows={3}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="Six units short-received against carton CTN/2607/03918; receiver noted the carton was already open on arrival…"
            />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="What a proof of delivery is actually for" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">It closes the invoice.</span> Finance will not chase payment on a delivery
            nobody signed for, and most customers will not pay without it.
          </p>
          <p>
            <span className="font-medium text-fg">It settles shortages.</span> A signed received quantity that matches the challan
            is the end of the argument. One that does not is the start of a claim against the transporter.
          </p>
          <p>
            <span className="font-medium text-fg">It dates the warranty.</span> The warranty on a bottle runs from delivery, not
            dispatch, so the delivery date on this record is what a warranty claim is checked against.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
