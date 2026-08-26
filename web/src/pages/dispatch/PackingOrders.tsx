import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { Input, Select, Textarea } from '@/components/ui/Input'
import {
  CountBar,
  DispatchStatusBadge,
  DocCell,
  GateChip,
  ItemCell,
  PartyCell,
} from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { PackingOrder, PackingStatus } from '@/types/dispatch'
import { packingOrderApi } from '@/api/packingOrder'

const FLOW: PackingStatus[] = ['PLANNED', 'MATERIAL_READY', 'PACKING_STARTED', 'PACKED', 'QC_VERIFIED', 'READY_FOR_DISPATCH']

const TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'OPEN', label: 'On the packing floor' },
  { id: 'READY', label: 'Ready to dispatch' },
  { id: 'EXPORT', label: 'Export & OEM' },
]

export function PackingOrdersPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const [orders, setOrders] = useState<PackingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('ALL')
  const [advance, setAdvance] = useState<PackingOrder | null>(null)
  const [deleting, setDeleting] = useState<PackingOrder | null>(null)

  // Edit / Create Form state
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PackingOrder | null>(null)
  const [form, setForm] = useState<Partial<PackingOrder>>({})

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await packingOrderApi.getAll()
      setOrders(data)
    } catch (e: any) {
      toast.error('Failed to load orders', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const visible = orders.filter((o) => {
    if (tab === 'OPEN') return o.status === 'MATERIAL_READY' || o.status === 'PACKING_STARTED' || o.status === 'PACKED'
    if (tab === 'READY') return o.status === 'READY_FOR_DISPATCH' || o.status === 'QC_VERIFIED'
    if (tab === 'EXPORT') return o.isExport || o.isOem
    return true
  })

  const blocked = orders.filter((o) => o.status === 'PLANNED' && !o.materialReady)
  const awaitingQc = orders.filter((o) => o.status === 'PACKED' && !o.qcReleased)
  const readyCount = orders.filter((o) => o.status === 'READY_FOR_DISPATCH').length

  function blockingGate(o: PackingOrder): string | null {
    const next = FLOW[FLOW.indexOf(o.status) + 1]
    if (!next) return null
    if (next === 'MATERIAL_READY' && !o.materialReady) return 'Packaging material has not been issued yet'
    if (next === 'QC_VERIFIED' && !o.qcReleased) return 'Quality has not released the batch for dispatch'
    if (next === 'READY_FOR_DISPATCH' && !o.weightVerified) return 'Carton weights have not been verified'
    return null
  }

  const columns: Column<PackingOrder>[] = [
    { key: 'docNo', header: 'Packing order', sortable: true, width: '12rem', render: (o) => (
      <DocCell docNo={o.docNo} sub={`${formatDate(o.docDate)} · from ${o.sourceNo}`} />
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (o) => (
      <PartyCell name={o.customer} place={o.salesOrderNo ?? 'stock build'} />
    ) },
    { key: 'itemName', header: 'Product', sortable: true, render: (o) => (
      <ItemCell name={o.itemName} code={o.itemCode} batch={o.batchNo} />
    ) },
    { key: 'quantity', header: 'Bottles', align: 'right', sortable: true, width: '7rem', render: (o) => (
      <span className="tabular text-xs">{formatQty(o.quantity)}</span>
    ) },
    { key: 'cartonSpec', header: 'Packs as', sortable: true, width: '11rem', render: (o) => (
      <span className="text-2xs text-fg-muted">{o.cartonSpec}</span>
    ) },
    { key: 'cartonsPacked', header: 'Cartons packed', width: '11rem', accessor: (o) => o.cartonsPacked, render: (o) => (
      <CountBar done={o.cartonsPacked} total={o.cartonsPlanned} />
    ) },
    { key: 'gates', header: 'Gates', width: '15rem', render: (o) => (
      <div className="flex flex-wrap gap-1">
        <GateChip ok={o.materialReady} label="material" />
        <GateChip ok={o.qcReleased} label="QC" />
        <GateChip ok={o.weightVerified} label="weight" />
      </div>
    ) },
    { key: 'supervisor', header: 'Supervisor', sortable: true, width: '9rem' },
    { key: 'packingDate', header: 'Packing date', sortable: true, width: '8rem', accessor: (o) => o.packingDate, render: (o) => formatDate(o.packingDate) },
    { key: 'priority', header: 'Priority', align: 'center', width: '7rem', sortable: true, render: (o) => (
      <Badge tone={o.priority === 'URGENT' ? 'danger' : o.priority === 'HIGH' ? 'warning' : 'neutral'} size="sm" dot={o.priority === 'URGENT'}>
        {o.priority.toLowerCase()}
      </Badge>
    ) },
    { key: 'tags', header: 'Type', width: '8rem', render: (o) => (
      <div className="flex flex-wrap gap-1">
        {o.isExport && <Badge tone="progress" size="sm" dot={false}>export</Badge>}
        {o.isOem && <Badge tone="brand" size="sm" dot={false}>OEM</Badge>}
        {!o.isExport && !o.isOem && <span className="text-2xs text-fg-subtle">domestic</span>}
      </div>
    ) },
    { key: 'warehouse', header: 'Warehouse', sortable: true, defaultHidden: true },
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (o) => <DispatchStatusBadge status={o.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'packing-orders', 'Packing order register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const handleUpdate = async (uid: string, patch: Partial<PackingOrder>) => {
    try {
      await packingOrderApi.update(Number(uid), patch)
      loadData()
    } catch (e: any) {
      toast.error('Update failed', e.message)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await packingOrderApi.delete(Number(deleting.uid))
      toast.success('Packing order deleted', `${deleting.docNo} removed.`)
      setDeleting(null)
      loadData()
    } catch (e: any) {
      toast.error('Delete failed', e.message)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      docNo: '',
      customer: '',
      salesOrderNo: '',
      itemName: '',
      batchNo: '',
      quantity: 0,
      cartonSpec: '',
      cartonsPlanned: 0,
      warehouse: 'FG Store — Chennai',
      packingDate: new Date().toISOString(),
      supervisor: '',
      priority: 'NORMAL',
      remarks: '',
      status: 'PLANNED',
      sourceType: 'SALES_ORDER',
      sourceNo: '—',
      customerCode: 'CUS-NEW',
      itemCode: 'FG-NEW',
      packedQuantity: 0,
      cartonsPacked: 0,
      uom: 'NOS',
      materialReady: false,
      qcReleased: false,
      weightVerified: false,
      isExport: false,
      isOem: false,
    })
    setFormOpen(true)
  }

  const openEdit = (o: PackingOrder) => {
    setEditing(o)
    setForm({ ...o })
    setFormOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editing) {
        await packingOrderApi.update(Number(editing.uid), form)
        toast.success('Updated', `${editing.docNo} saved.`)
      } else {
        await packingOrderApi.create(form)
        toast.success('Created', `New packing order added.`)
      }
      setFormOpen(false)
      loadData()
    } catch (e: any) {
      toast.error('Save failed', e.message)
    }
  }

  return (
    <div>
      <PageHeader
        title="Packing orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Packing orders' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/packing-materials')}>
              Packaging material
            </Button>
            <Button variant="primary" size="sm" onClick={openCreate}>
              New packing order
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'ALL' ? orders.length : undefined }))} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', readyCount ? 'text-success' : 'text-fg')}>{readyCount}</span> order
        {readyCount === 1 ? '' : 's'} ready to dispatch ·{' '}
        <span className={cn('font-medium', awaitingQc.length ? 'text-warning' : 'text-fg')}>{awaitingQc.length}</span> packed but
        waiting on a quality release ·{' '}
        <span className={cn('font-medium', blocked.length ? 'text-danger' : 'text-fg')}>{blocked.length}</span> cannot start
        because the packaging material has not been issued.
      </p>

      {(blocked.length > 0 || awaitingQc.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Held up right now" description="Each of these is a packing order that cannot move to its next state" />
          <CardBody className="space-y-2">
            {[...blocked, ...awaitingQc].map((o) => (
              <div key={o.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {o.docNo} — {o.customer}
                  </p>
                  <p className="text-2xs text-fg-muted">{blockingGate(o) ?? 'Waiting on the next step'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!o.materialReady && (
                    <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/packing-materials')}>
                      Issue material
                    </Button>
                  )}
                  {o.status === 'PACKED' && !o.qcReleased && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => {
                        handleUpdate(o.uid, { qcReleased: true, status: 'QC_VERIFIED' })
                        toast.success('Quality release recorded', `${o.docNo} is QC verified. Once the carton weights are checked it can move to dispatch staging.`)
                      }}
                    >
                      Record QC release
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(o) => o.uid}
        searchPlaceholder="Search order, customer, product or supervisor…"
        onExport={doExport}
        emptyTitle="No packing orders"
        emptyDescription="Packing orders arrive automatically when production completes and quality releases the batch."
        rowClassName={(o) => cn(
          o.status === 'READY_FOR_DISPATCH' && 'bg-success/[0.04]',
          o.status === 'PLANNED' && !o.materialReady && 'bg-warning/[0.04]',
        )}
        rowActions={(o) => (
          <>
            <MenuItem label="Edit the order" onClick={() => openEdit(o)} />
            <MenuItem label="Delete the order" danger onClick={() => {
                if (o.cartonsPacked > 0) {
                    toast.error('Cannot delete', `${o.docNo} already has ${o.cartonsPacked} cartons packed against it. Cancel the order instead — deleting it would orphan those cartons.`)
                } else {
                    setDeleting(o)
                }
            }} />
            <MenuItem
              separatorBefore
              label="Move to the next stage"
              disabled={o.status === 'READY_FOR_DISPATCH' || o.status === 'DISPATCHED' || o.status === 'CANCELLED'}
              onClick={() => setAdvance(o)}
            />
            <MenuItem label="Open the cartons" onClick={() => navigate('/dispatch/cartons')} />
            <MenuItem label="View material consumption" onClick={() => navigate('/dispatch/packing-materials')} />
            <MenuItem label="Print the packing slip" onClick={() => doExport('pdf')} />
            <MenuItem
              separatorBefore
              label="Cancel the order"
              danger
              disabled={o.status === 'DISPATCHED' || o.status === 'CANCELLED'}
              onClick={() => {
                handleUpdate(o.uid, { status: 'CANCELLED' })
                toast.success('Packing order cancelled', `${o.docNo} cancelled. The record stays for the audit trail — nothing is erased.`)
              }}
            />
          </>
        )}
      />

      <Modal
        open={!!advance}
        onClose={() => setAdvance(null)}
        title={advance ? `Move ${advance.docNo} on` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdvance(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!!(advance && blockingGate(advance))}
              onClick={() => {
                if (!advance) return
                const next = FLOW[FLOW.indexOf(advance.status) + 1]
                if (!next) return
                const patch: Partial<PackingOrder> = { status: next }
                if (next === 'PACKED') {
                  patch.cartonsPacked = advance.cartonsPlanned
                  patch.packedQuantity = advance.quantity
                }
                handleUpdate(advance.uid, patch)
                toast.success(
                  'Stage recorded',
                  next === 'PACKED'
                    ? `${advance.docNo} fully packed — ${formatQty(advance.cartonsPlanned)} cartons. Quality release is the next gate.`
                    : `${advance.docNo} is now ${next.replace(/_/g, ' ').toLowerCase()}.`,
                )
                setAdvance(null)
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        {advance && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              {advance.docNo} moves from <span className="font-medium text-fg">{advance.status.replace(/_/g, ' ').toLowerCase()}</span>{' '}
              to <span className="font-medium text-fg">{(FLOW[FLOW.indexOf(advance.status) + 1] ?? '—').replace(/_/g, ' ').toLowerCase()}</span>.
            </p>
            {blockingGate(advance) ? (
              <p className="rounded border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
                Blocked — {blockingGate(advance)}. Clear that first; the stage cannot be forced.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <GateChip ok={advance.materialReady} label="material issued" />
                <GateChip ok={advance.qcReleased} label="QC released" />
                <GateChip ok={advance.weightVerified} label="weight verified" />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete packing order"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>Keep it</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{deleting?.docNo}</span> will be removed from
          the list. It is marked deleted rather than erased, so the history stays intact.
        </p>
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'New packing order'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>{editing ? 'Save changes' : 'Create order'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          {!editing && <Input label="Doc No" hint="Auto-generated if left blank" value={form.docNo || ''} onChange={e => setForm({ ...form, docNo: e.target.value })} />}
          <Input label="Customer" required value={form.customer || ''} onChange={e => setForm({ ...form, customer: e.target.value })} />
          <Input label="Sales order" value={form.salesOrderNo || ''} onChange={e => setForm({ ...form, salesOrderNo: e.target.value })} />
          <Input label="Product" required containerClassName="sm:col-span-2" value={form.itemName || ''} onChange={e => setForm({ ...form, itemName: e.target.value })} />
          <Input label="Batch" value={form.batchNo || ''} onChange={e => setForm({ ...form, batchNo: e.target.value })} />
          <Input label="Quantity" type="number" required value={String(form.quantity || '')} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
          <Input label="Carton specification" hint="12 bottles / carton, FBA single-unit box…" required value={form.cartonSpec || ''} onChange={e => setForm({ ...form, cartonSpec: e.target.value })} />
          <Input label="Cartons planned" type="number" required value={String(form.cartonsPlanned || '')} onChange={e => setForm({ ...form, cartonsPlanned: Number(e.target.value) })} />
          <Input label="Warehouse" required value={form.warehouse || ''} onChange={e => setForm({ ...form, warehouse: e.target.value })} />
          <Input label="Packing date" type="date" required value={form.packingDate ? form.packingDate.slice(0, 10) : ''} onChange={e => setForm({ ...form, packingDate: new Date(e.target.value).toISOString() })} />
          <Input label="Supervisor" required value={form.supervisor || ''} onChange={e => setForm({ ...form, supervisor: e.target.value })} />
          <Select label="Priority" options={[{value: 'LOW', label: 'Low'}, {value: 'NORMAL', label: 'Normal'}, {value: 'HIGH', label: 'High'}, {value: 'URGENT', label: 'Urgent'}]} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as any })} />
          <Textarea label="Remarks" containerClassName="sm:col-span-2" value={form.remarks || ''} onChange={e => setForm({ ...form, remarks: e.target.value })} />
        </div>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Six stages, three gates" description="The gates are what stop a half-ready consignment reaching the loading bay" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Material gate.</span> Cartons, inner boxes, foam, labels and manuals have to be
            issued from the packing store before packing starts. Starting without them means a half-packed order blocking a bay.
          </p>
          <p>
            <span className="font-medium text-fg">Quality gate.</span> The batch needs a final release certificate. A packed order
            with no release cannot be verified, and an unverified order cannot be staged.
          </p>
          <p>
            <span className="font-medium text-fg">Weight gate.</span> Every carton is weighed against its expected weight. A carton
            2 kg light usually means a missing bottle — cheaper to find here than at the customer's dock.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
