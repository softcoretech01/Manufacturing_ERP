import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cartonApi } from '@/api/cartonApi'
import { useEffect } from 'react'
import {
  DimensionCell,
  DispatchStatusBadge,
  ItemCell,
  WeightCell,
} from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import type { Carton, Pallet } from '@/types/dispatch'

const TABS = [
  { id: 'ALL', label: 'All cartons' },
  { id: 'OPEN', label: 'Being packed' },
  { id: 'SEALED', label: 'Sealed, not on a pallet' },
  { id: 'MIXED', label: 'Mixed SKU' },
]

/**
 * Cartonisation — every carton gets its own number and barcode the moment it is
 * sealed, and carries what is inside it, what it weighs and who packed it. That
 * identity is the thread a customer complaint is pulled back along months later.
 */
export function CartonsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [cartons, setCartons] = useState<Carton[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingItem, setEditingItem] = useState<Carton | null>(null)
  const [formData, setFormData] = useState<Partial<Carton>>({})
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchCartons = async () => {
    setIsLoading(true)
    try {
      const data = await cartonApi.getAll()
      setCartons(data)
    } catch (e) {
      toast.error('Error fetching cartons', String(e))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCartons()
  }, [])


  const cartons = cartons
  const { rows: pallets, update: updatePallet } = useCollection<Pallet>('dispatch:pallet', palletSeed)

  const [tab, setTab] = useState('ALL')
  const [order, setOrder] = useState('all')
  const [viewing, setViewing] = useState<Carton | null>(null)
  const [assign, setAssign] = useState<Carton | null>(null)
  const [assignTo, setAssignTo] = useState('')
  const [weighing, setWeighing] = useState<Carton | null>(null)
  const [weight, setWeight] = useState('')

  const orderNos = [...new Set(cartons.map((c) => c.packingOrderNo))]

  const visible = cartons
    .filter((c) => (order === 'all' ? true : c.packingOrderNo === order))
    .filter((c) => {
      if (tab === 'OPEN') return c.status === 'OPEN'
      if (tab === 'SEALED') return c.status === 'SEALED'
      if (tab === 'MIXED') return c.contents.length > 1
      return true
    })

  const open = cartons.filter((c) => c.status === 'OPEN')
  const unlabelled = cartons.filter((c) => !c.labelPrinted && c.status !== 'OPEN')
  const totalBottles = visible.reduce((s, c) => s + c.quantity, 0)
  const totalWeight = visible.reduce((s, c) => s + c.grossWeightKg, 0)

  const columns: Column<Carton>[] = [
    { key: 'cartonNo', header: 'Carton', sortable: true, width: '11.5rem', render: (c) => (
      <button type="button" onClick={() => setViewing(c)} className="text-left">
        <p className="font-mono text-xs font-medium text-brand-600 hover:underline">{c.cartonNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{c.packingOrderNo}</p>
      </button>
    ) },
    { key: 'itemName', header: 'Contents', sortable: true, render: (c) => (
      c.contents.length > 1 ? (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">
            Mixed — {c.contents.length} SKUs
            <Badge tone="progress" size="sm" dot={false} className="ml-1.5">mixed</Badge>
          </p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{c.contents.map((x) => `${x.itemCode} × ${x.quantity}`).join(', ')}</p>
        </div>
      ) : (
        <ItemCell name={c.itemName} code={c.itemCode} batch={c.batchNo} />
      )
    ) },
    { key: 'customer', header: 'Customer', sortable: true, width: '12rem' },
    { key: 'quantity', header: 'Bottles', align: 'right', sortable: true, width: '6.5rem', render: (c) => (
      <span className="tabular text-xs font-medium">{c.quantity}</span>
    ) },
    { key: 'grossWeightKg', header: 'Gross', align: 'right', sortable: true, width: '7rem', render: (c) => <WeightCell kg={c.grossWeightKg} /> },
    { key: 'netWeightKg', header: 'Net', align: 'right', sortable: true, width: '7rem', defaultHidden: true, render: (c) => <WeightCell kg={c.netWeightKg} /> },
    { key: 'dims', header: 'L × W × H (mm)', width: '10rem', render: (c) => <DimensionCell l={c.lengthMm} w={c.widthMm} h={c.heightMm} /> },
    { key: 'operator', header: 'Packed by', sortable: true, width: '9rem', render: (c) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{c.operator}</p>
        <p className="text-2xs text-fg-subtle">{formatDateTime(c.packedOn)}</p>
      </div>
    ) },
    { key: 'checks', header: 'Checks', width: '9rem', render: (c) => (
      <div className="flex gap-1">
        <Badge tone={c.weightChecked ? 'success' : 'warning'} size="sm" dot={false}>{c.weightChecked ? 'weighed' : 'not weighed'}</Badge>
        <Badge tone={c.labelPrinted ? 'success' : 'warning'} size="sm" dot={false}>{c.labelPrinted ? 'labelled' : 'no label'}</Badge>
      </div>
    ) },
    { key: 'palletNo', header: 'Pallet', sortable: true, width: '9rem', render: (c) => (
      c.palletNo ? <span className="font-mono text-2xs text-fg">{c.palletNo}</span> : <span className="text-2xs text-fg-subtle">loose</span>
    ) },
    { key: 'barcode', header: 'Barcode', defaultHidden: true, render: (c) => <span className="font-mono text-2xs">{c.barcode}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (c) => <DispatchStatusBadge status={c.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'carton-register', 'Carton register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Cartons"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Cartons' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/pallets')}>Pallets</Button>
            <Button variant="primary" size="sm" onClick={() => crud.openCreate({ cartonNo: `CTN/2607/${String(4_201 + cartons.length).padStart(5, '0')}`, operator: 'M. Priya' })}>
              New carton
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-52"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          options={[{ value: 'all', label: 'All packing orders' }, ...orderNos.map((o) => ({ value: o, label: o }))]}
        />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg tabular">{visible.length}</span> cartons holding{' '}
          <span className="font-medium text-fg tabular">{formatQty(totalBottles)}</span> bottles,{' '}
          <span className="font-medium text-fg tabular">{Math.round(totalWeight).toLocaleString('en-IN')} kg</span> gross ·{' '}
          <span className={cn('font-medium', open.length ? 'text-warning' : 'text-success')}>{open.length}</span> still open
          {unlabelled.length > 0 && <>, <span className="font-medium text-warning">{unlabelled.length}</span> sealed without a label</>}.
        </p>
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(c) => c.uid}
        searchPlaceholder="Search carton number, barcode, product or operator…"
        onExport={doExport}
        emptyTitle="No cartons"
        emptyDescription="Cartons appear here as they are sealed on the packing line."
        rowClassName={(c) => cn(c.status === 'OPEN' && 'bg-warning/[0.04]', !c.labelPrinted && c.status !== 'OPEN' && 'bg-warning/[0.03]')}
        rowActions={(c) => (
          <>
            <MenuItem label="Edit the carton" onClick={() => crud.openEdit(c)} />
            <MenuItem label="Delete the carton" danger onClick={() => crud.askDelete(c)} />
            <MenuItem separatorBefore label="Open the carton detail" onClick={() => setViewing(c)} />
            <MenuItem
              label="Verify the weight"
              disabled={c.weightChecked}
              onClick={() => { setWeighing(c); setWeight(String(c.grossWeightKg)) }}
            />
            <MenuItem
              label="Seal the carton"
              disabled={c.status !== 'OPEN'}
              onClick={() => {
                if (!c.weightChecked) {
                  toast.error('Weigh it first', `${c.cartonNo} has not been weight-checked. A carton is sealed only after its weight is confirmed against the expected weight.`)
                  return
                }
                crud.update(c.uid, { status: 'SEALED' })
                toast.success('Carton sealed', `${c.cartonNo} sealed with ${c.quantity} bottles. It can now be labelled and put on a pallet.`)
              }}
            />
            <MenuItem
              label="Print the carton label"
              onClick={() => {
                crud.update(c.uid, { labelPrinted: true })
                toast.success('Label printed', `GS1-128 label for ${c.cartonNo} sent to the packing-bay printer. Barcode ${c.barcode}.`)
              }}
            />
            <MenuItem
              label="Assign to a pallet"
              disabled={c.status !== 'SEALED'}
              onClick={() => { setAssign(c); setAssignTo(pallets.find((p) => p.status === 'BUILDING' && p.customer === c.customer)?.palletNo ?? '') }}
            />
            <MenuItem
              label="Take off the pallet"
              disabled={!c.palletNo || c.status === 'LOADED' || c.status === 'DELIVERED'}
              onClick={() => {
                const p = pallets.find((x) => x.palletNo === c.palletNo)
                if (p) updatePallet(p.uid, { cartonCount: Math.max(0, p.cartonCount - 1), totalWeightKg: Math.max(0, p.totalWeightKg - c.grossWeightKg) })
                crud.update(c.uid, { palletNo: null, status: 'SEALED' })
                toast.success('Carton removed from pallet', `${c.cartonNo} is loose again. Pallet ${c.palletNo} now holds ${Math.max(0, (p?.cartonCount ?? 1) - 1)} cartons.`)
              }}
            />
          </>
        )}
      />

      {/* Weight verification ------------------------------------------------ */}
      <Modal
        open={!!weighing}
        onClose={() => setWeighing(null)}
        title={weighing ? `Weigh ${weighing.cartonNo}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setWeighing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!weighing) return
                const w = Number(weight)
                if (!w || w <= 0) {
                  toast.error('Enter a weight', 'Read the weight off the bench scale.')
                  return
                }
                const expected = weighing.grossWeightKg
                const deviation = Math.abs((w - expected) / expected) * 100
                if (deviation > 3) {
                  toast.error(
                    'Weight out of tolerance',
                    `${w} kg against an expected ${expected} kg — ${deviation.toFixed(1)}% out. That is usually a missing or extra bottle. Open the carton and recount before sealing.`,
                  )
                  return
                }
                crud.update(weighing.uid, { grossWeightKg: w, weightChecked: true })
                toast.success('Weight verified', `${weighing.cartonNo} at ${w} kg, within tolerance of the expected ${expected} kg.`)
                setWeighing(null)
              }}
            >
              Record weight
            </Button>
          </>
        }
      >
        {weighing && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {weighing.quantity} × {weighing.itemName}. Expected gross weight is{' '}
              <span className="font-medium tabular text-fg">{weighing.grossWeightKg} kg</span>. Anything more than 3% out is
              refused — that is roughly one bottle on a 12-pack.
            </p>
            <Input label="Weight on the scale (kg)" type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        )}
      </Modal>

      {/* Pallet assignment ------------------------------------------------- */}
      <Modal
        open={!!assign}
        onClose={() => setAssign(null)}
        title={assign ? `Put ${assign.cartonNo} on a pallet` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssign(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!assign) return
                const p = pallets.find((x) => x.palletNo === assignTo)
                if (!p) {
                  toast.error('Choose a pallet', 'Pick a pallet that is still being built, or start a new one on the pallets screen.')
                  return
                }
                if (p.cartonCount >= p.cartonCapacity) {
                  toast.error('Pallet is full', `${p.palletNo} already holds ${p.cartonCount} of ${p.cartonCapacity} cartons. Close it and start another.`)
                  return
                }
                if (p.customer !== assign.customer && p.palletType !== 'MIXED') {
                  toast.error(
                    'Different customer',
                    `${p.palletNo} is built for ${p.customer}. Mixing customers on one pallet needs a mixed pallet — otherwise the wrong stock arrives at the wrong dock.`,
                  )
                  return
                }
                updatePallet(p.uid, {
                  cartonCount: p.cartonCount + 1,
                  totalWeightKg: Math.round((p.totalWeightKg + assign.grossWeightKg) * 10) / 10,
                })
                crud.update(assign.uid, { palletNo: p.palletNo, status: 'PALLETISED' })
                toast.success('Carton palletised', `${assign.cartonNo} added to ${p.palletNo} — now ${p.cartonCount + 1} of ${p.cartonCapacity} cartons.`)
                setAssign(null)
              }}
            >
              Assign
            </Button>
          </>
        }
      >
        {assign && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {assign.cartonNo} for <span className="font-medium text-fg">{assign.customer}</span>,{' '}
              {assign.grossWeightKg} kg. Only pallets that are still being built can take cartons.
            </p>
            <Select
              label="Pallet"
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              options={pallets
                .filter((p) => p.status === 'BUILDING')
                .map((p) => ({
                  value: p.palletNo,
                  label: `${p.palletNo} — ${p.customer} (${p.cartonCount}/${p.cartonCapacity})`,
                }))}
            />
          </div>
        )}
      </Modal>

      {/* Carton detail ----------------------------------------------------- */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.cartonNo ?? ''}
        description={viewing ? `${viewing.customer} · packed by ${viewing.operator} on ${formatDateTime(viewing.packedOn)}` : ''}
        width="max-w-xl"
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
              <Button
                variant="primary"
                onClick={() => {
                  crud.update(viewing.uid, { labelPrinted: true })
                  toast.success('Label printed', `Label for ${viewing.cartonNo} sent to the printer.`)
                }}
              >
                Print the label
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Barcode (GS1-128)</p>
              <p className="mt-1 break-all font-mono text-sm text-fg">{viewing.barcode}</p>
              <p className="mt-1.5 text-2xs text-fg-muted">
                (01) is the global trade item number, (37) is the count of units inside. A scanner at the customer's dock reads
                both from this one symbol.
              </p>
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">What is inside</h3>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 text-2xs uppercase tracking-wide text-fg-subtle">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Item</th>
                      <th className="px-3 py-1.5 text-left font-medium">Code</th>
                      <th className="px-3 py-1.5 text-right font-medium">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewing.contents.length ? viewing.contents : [{ itemCode: viewing.itemCode, itemName: viewing.itemName, quantity: viewing.quantity }]).map((line) => (
                      <tr key={line.itemCode} className="border-t border-border">
                        <td className="px-3 py-1.5 text-fg">{line.itemName}</td>
                        <td className="px-3 py-1.5 font-mono text-2xs text-fg-muted">{line.itemCode}</td>
                        <td className="px-3 py-1.5 text-right tabular text-fg">{line.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-border p-3 text-xs">
                <p className="text-2xs uppercase tracking-wide text-fg-subtle">Weight</p>
                <p className="mt-1 text-fg">Gross <span className="font-medium tabular">{viewing.grossWeightKg} kg</span></p>
                <p className="text-fg">Net <span className="font-medium tabular">{viewing.netWeightKg} kg</span></p>
                <p className="mt-1 text-2xs text-fg-muted">
                  Tare is {(viewing.grossWeightKg - viewing.netWeightKg).toFixed(2)} kg — carton, inserts and packaging.
                </p>
              </div>
              <div className="rounded border border-border p-3 text-xs">
                <p className="text-2xs uppercase tracking-wide text-fg-subtle">Dimensions</p>
                <p className="mt-1 font-mono text-fg">{viewing.lengthMm} × {viewing.widthMm} × {viewing.heightMm} mm</p>
                <p className="mt-1 text-2xs text-fg-muted">
                  {((viewing.lengthMm * viewing.widthMm * viewing.heightMm) / 1_000_000_000).toFixed(3)} cbm — this is what the
                  transporter charges volumetric freight on.
                </p>
              </div>
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Where it is</h3>
              <div className="space-y-1.5 text-xs">
                <p className="text-fg-muted">Packing order <span className="font-mono text-fg">{viewing.packingOrderNo}</span></p>
                <p className="text-fg-muted">Batch <span className="font-mono text-fg">{viewing.batchNo ?? 'not batch-controlled'}</span></p>
                <p className="text-fg-muted">Pallet <span className="font-mono text-fg">{viewing.palletNo ?? 'not on a pallet'}</span></p>
                <p className="text-fg-muted">Status <DispatchStatusBadge status={viewing.status} size="sm" /></p>
              </div>
            </section>
          </div>
        )}
      </Drawer>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Configurable packing rules" description="The carton specification comes from the customer, not from us" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">12 per carton</span> is the standard retail pack for 500 ml and 750 ml — one shelf-ready layer.</p>
          <p><span className="font-medium text-fg">24 per export carton</span> uses 5-ply board so it survives a container stack of five high.</p>
          <p><span className="font-medium text-fg">Mixed SKU</span> assortment cartons hold more than one product. The label lists every SKU and count inside.</p>
          <p><span className="font-medium text-fg">FBA single unit</span> means every bottle is its own box with its own FNSKU label, and there is no master carton label at all.</p>
        </CardBody>
      </Card>
    </div>
  )
}
