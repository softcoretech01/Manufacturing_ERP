import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { CountBar, DispatchStatusBadge, PartyCell, WeightCell } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { palletApi } from '@/api/palletApi'
import { cartonApi } from '@/api/cartonApi'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select } from '@/components/ui/Input'
import type { Carton, Pallet } from '@/types/dispatch'

const TYPE_LABEL: Record<string, string> = {
  STANDARD: 'Standard',
  EXPORT: 'Export (ISPM-15)',
  RETURNABLE: 'Returnable',
  MIXED: 'Mixed customer',
}

const TABS = [
  { id: 'ALL', label: 'All pallets' },
  { id: 'BUILDING', label: 'Being built' },
  { id: 'READY', label: 'Closed & staged' },
  { id: 'GONE', label: 'Loaded & shipped' },
]

/**
 * Pallet building — cartons become a unit load. A pallet cannot be closed until
 * it is wrapped, strapped and labelled, because an unwrapped pallet arrives as a
 * pile of loose cartons and the damage claim follows.
 */
export function PalletsPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const [pallets, setPallets] = useState<Pallet[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Pallet> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [cartons, setCartons] = useState<Carton[]>([])

  const fetchPallets = async () => {
    setLoading(true)
    try {
      const [palletsData, cartonsData] = await Promise.all([
        palletApi.getAll(),
        cartonApi.getAll()
      ])
      setPallets(palletsData)
      setCartons(cartonsData)
    } catch (e) {
      toast.error('Failed to load data', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPallets()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    try {
      if (isNew) {
        await palletApi.create({
          ...editing,
          palletNo: 'AUTO',
          builtOn: new Date().toISOString(),
          cartonCount: 0,
          totalWeightKg: editing.palletType === 'EXPORT' ? 28 : 22,
          wrapped: false,
          strapped: false,
          labelPrinted: false,
          status: 'BUILDING'
        })
        toast.success('Pallet created successfully', 'The pallet has been recorded.')
      } else {
        await palletApi.update((editing as any).id, editing)
        toast.success('Pallet updated successfully', 'The pallet details have been saved.')
      }
      setEditing(null)
      fetchPallets()
    } catch (err) {
      toast.error('Failed to save', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleDelete = async (p: Pallet) => {
    if (p.cartonCount > 0) {
      toast.error('Cannot delete', `${p.palletNo} holds ${p.cartonCount} cartons. Take them off first.`)
      return
    }
    if (p.status === 'LOADED' || p.status === 'SHIPPED') {
      toast.error('Cannot delete', `${p.palletNo} has already been ${p.status.toLowerCase()}.`)
      return
    }
    if (confirm(`Are you sure you want to delete pallet ${p.palletNo}?`)) {
      try {
        await palletApi.delete((p as any).id)
        toast.success('Pallet deleted', `${p.palletNo} has been removed.`)
        fetchPallets()
      } catch (err) {
        toast.error('Failed to delete', err instanceof Error ? err.message : 'Unknown error')
      }
    }
  }

  const updateStatus = async (p: Pallet, changes: Partial<Pallet>) => {
    try {
      await palletApi.update((p as any).id, { ...p, ...changes })
      fetchPallets()
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }



  const [tab, setTab] = useState('ALL')

  const visible = pallets.filter((p) => {
    if (tab === 'BUILDING') return p.status === 'BUILDING'
    if (tab === 'READY') return p.status === 'CLOSED' || p.status === 'STAGED'
    if (tab === 'GONE') return p.status === 'LOADED' || p.status === 'SHIPPED'
    return true
  })

  const building = pallets.filter((p) => p.status === 'BUILDING')
  const unfinished = pallets.filter((p) => p.status === 'BUILDING' && p.cartonCount >= p.cartonCapacity)
  const totalWeight = visible.reduce((s, p) => s + p.totalWeightKg, 0)

  /** What stops this pallet being closed. */
  function closeBlocker(p: Pallet): string | null {
    if (p.cartonCount === 0) return 'The pallet is empty'
    if (!p.wrapped) return 'Not stretch-wrapped'
    if (!p.strapped) return 'Not strapped'
    if (!p.labelPrinted) return 'No pallet label'
    return null
  }

  const columns: Column<Pallet>[] = [
    { key: 'palletNo', header: 'Pallet', sortable: true, width: '11.5rem', render: (p) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{p.palletNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{TYPE_LABEL[p.palletType]}</p>
      </div>
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (p) => <PartyCell name={p.customer} place={p.destination} /> },
    { key: 'cartonCount', header: 'Cartons', width: '11rem', sortable: true, accessor: (p) => p.cartonCount, render: (p) => (
      <CountBar done={p.cartonCount} total={p.cartonCapacity} />
    ) },
    { key: 'totalWeightKg', header: 'Weight', align: 'right', sortable: true, width: '8rem', render: (p) => <WeightCell kg={p.totalWeightKg} /> },
    { key: 'footprint', header: 'Footprint (mm)', width: '9rem', render: (p) => (
      <span className="font-mono text-2xs text-fg-muted">{p.lengthMm} × {p.widthMm}</span>
    ) },
    { key: 'stackHeightMm', header: 'Stack height', align: 'right', sortable: true, width: '9rem', render: (p) => (
      <span className={cn('tabular text-2xs', p.stackHeightMm > 2_200 ? 'text-warning' : 'text-fg-muted')}>
        {p.stackHeightMm.toLocaleString('en-IN')} mm
      </span>
    ) },
    { key: 'finish', header: 'Wrap · strap · label', width: '13rem', render: (p) => (
      <div className="flex gap-1">
        <Badge tone={p.wrapped ? 'success' : 'warning'} size="sm" dot={false}>{p.wrapped ? 'wrapped' : 'no wrap'}</Badge>
        <Badge tone={p.strapped ? 'success' : 'warning'} size="sm" dot={false}>{p.strapped ? 'strapped' : 'no strap'}</Badge>
        <Badge tone={p.labelPrinted ? 'success' : 'warning'} size="sm" dot={false}>{p.labelPrinted ? 'label' : 'no label'}</Badge>
      </div>
    ) },
    { key: 'builtBy', header: 'Built by', sortable: true, width: '10rem', render: (p) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{p.builtBy}</p>
        <p className="text-2xs text-fg-subtle">{formatDateTime(p.builtOn)}</p>
      </div>
    ) },
    { key: 'shipmentNo', header: 'Shipment', sortable: true, width: '10rem', render: (p) => (
      p.shipmentNo ? <span className="font-mono text-2xs">{p.shipmentNo}</span> : <span className="text-2xs text-fg-subtle">not allocated</span>
    ) },
    { key: 'containerNo', header: 'Container', width: '10rem', defaultHidden: true, render: (p) => (
      p.containerNo ? <span className="font-mono text-2xs">{p.containerNo}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'barcode', header: 'SSCC', defaultHidden: true, render: (p) => <span className="font-mono text-2xs">{p.barcode}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '8.5rem', render: (p) => <DispatchStatusBadge status={p.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'pallet-register', 'Pallet register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Pallets"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Pallets' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dispatch/cartons')}>Cartons</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setIsNew(true)
                setEditing({
                  palletNo: `PLT/2607/${String(215 + pallets.length).padStart(4, '0')}`,
                  palletType: 'STANDARD',
                  cartonCapacity: 40,
                  lengthMm: 1200,
                  widthMm: 1000,
                  stackHeightMm: 1800,
                  builtBy: 'A. Ramesh',
                })
              }}
            >
              Start a pallet
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', building.length ? 'text-progress' : 'text-fg')}>{building.length}</span> pallet
        {building.length === 1 ? '' : 's'} being built ·{' '}
        <span className="font-medium text-fg tabular">{Math.round(totalWeight).toLocaleString('en-IN')} kg</span> on the shown
        pallets
        {unfinished.length > 0 && (
          <>
            {' '}· <span className="font-medium text-warning">{unfinished.length}</span> full but not closed
          </>
        )}
        . A pallet closes only once it is wrapped, strapped and labelled.
      </p>

      {building.length > 0 && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {building.map((p) => {
            const blocker = closeBlocker(p)
            return (
              <Card key={(p as any).id || p.uid}>
                <CardHeader
                  title={`${p.palletNo} · ${TYPE_LABEL[p.palletType]}`}
                  description={`${p.customer} → ${p.destination}`}
                  actions={
                    <Button
                      variant={blocker ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => {
                        if (blocker) {
                          toast.error('Cannot close the pallet', `${blocker}. Finish that first — a pallet that ships unwrapped arrives as loose cartons.`)
                          return
                        }
                        updateStatus(p, { status: 'CLOSED' })
                        toast.success('Pallet closed', `${p.palletNo} closed with ${p.cartonCount} cartons at ${p.totalWeightKg} kg. It can now be staged for loading.`)
                      }}
                    >
                      Close the pallet
                    </Button>
                  }
                />
                <CardBody className="space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-fg-muted">Cartons on the pallet</span>
                      <span className="tabular text-fg">{p.cartonCount} / {p.cartonCapacity}</span>
                    </div>
                    <ProgressBar
                      value={p.cartonCapacity ? (p.cartonCount / p.cartonCapacity) * 100 : 0}
                      tone={p.cartonCount >= p.cartonCapacity ? 'success' : 'brand'}
                      height="h-2"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant={p.wrapped ? 'success' : 'outline'}
                      size="sm"
                      onClick={() => {
                        updateStatus(p, { wrapped: !p.wrapped })
                        toast.success(p.wrapped ? 'Wrap removed' : 'Pallet wrapped', `${p.palletNo} — stretch film ${p.wrapped ? 'recorded as removed' : 'applied'}.`)
                      }}
                    >
                      {p.wrapped ? 'Wrapped' : 'Mark wrapped'}
                    </Button>
                    <Button
                      variant={p.strapped ? 'success' : 'outline'}
                      size="sm"
                      onClick={() => {
                        updateStatus(p, { strapped: !p.strapped })
                        toast.success(p.strapped ? 'Straps removed' : 'Pallet strapped', `${p.palletNo} — PP straps ${p.strapped ? 'recorded as cut' : 'applied'}.`)
                      }}
                    >
                      {p.strapped ? 'Strapped' : 'Mark strapped'}
                    </Button>
                    <Button
                      variant={p.labelPrinted ? 'success' : 'outline'}
                      size="sm"
                      onClick={() => {
                        updateStatus(p, { labelPrinted: true })
                        toast.success('Pallet label printed', `SSCC ${p.barcode} printed for ${p.palletNo}. One scan at the customer's dock books the whole pallet in.`)
                      }}
                    >
                      {p.labelPrinted ? 'Labelled' : 'Print the label'}
                    </Button>
                  </div>
                  {blocker && <p className="text-2xs text-warning">Cannot close yet — {blocker.toLowerCase()}.</p>}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(p) => String((p as any).id || p.uid)}
        loading={loading}
        searchPlaceholder="Search pallet, customer, destination or SSCC…"
        onExport={doExport}
        emptyTitle="No pallets"
        rowClassName={(p) => cn(
          p.status === 'BUILDING' && 'bg-progress/[0.04]',
          p.status === 'BUILDING' && p.cartonCount >= p.cartonCapacity && 'bg-warning/[0.05]',
        )}
        rowActions={(p) => (
          <>
            <MenuItem label="Edit the pallet" onClick={() => { setIsNew(false); setEditing(p) }} />
            <MenuItem label="Delete the pallet" danger onClick={() => handleDelete(p)} />
            <MenuItem
              separatorBefore
              label="Close the pallet"
              disabled={p.status !== 'BUILDING'}
              onClick={() => {
                const blocker = closeBlocker(p)
                if (blocker) {
                  toast.error('Cannot close the pallet', `${blocker}.`)
                  return
                }
                updateStatus(p, { status: 'CLOSED' })
                toast.success('Pallet closed', `${p.palletNo} closed with ${p.cartonCount} cartons.`)
              }}
            />
            <MenuItem
              label="Move to dispatch staging"
              disabled={p.status !== 'CLOSED'}
              onClick={() => {
                updateStatus(p, { status: 'STAGED' })
                toast.success('Pallet staged', `${p.palletNo} moved to the dispatch staging area and is ready for a loading sheet.`)
              }}
            />
            <MenuItem
              label="Print the pallet label"
              onClick={() => {
                updateStatus(p, { labelPrinted: true })
                toast.success('Pallet label printed', `SSCC ${p.barcode} sent to the printer.`)
              }}
            />
            <MenuItem label="See the cartons on it" onClick={() => navigate('/dispatch/cartons')} />
            <MenuItem
              separatorBefore
              label="Break the pallet down"
              danger
              disabled={p.status === 'SHIPPED' || p.status === 'LOADED' || p.cartonCount === 0}
              onClick={() => {
                const on = cartons.filter((c) => c.palletNo === p.palletNo)
                Promise.all(on.map(c => cartonApi.update((c as any).id, { palletNo: null, status: 'SEALED' }))).then(() => {
                  updateStatus(p, { cartonCount: 0, totalWeightKg: p.palletType === 'EXPORT' ? 28 : 22, wrapped: false, strapped: false, status: 'BUILDING' })
                })
                toast.success(
                  'Pallet broken down',
                  `${on.length} carton${on.length === 1 ? '' : 's'} released from ${p.palletNo} and back to loose. The pallet is empty and can be rebuilt.`,
                )
              }}
            />
          </>
        )}
      />

            <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Add pallet' : 'Edit pallet'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Pallet number" required>
              <Input type="text" value={editing?.palletNo || ''} readOnly disabled />
            </Field>
            <Field label="Pallet type" required hint="Export pallets must be heat-treated and ISPM-15 stamped">
              <Select
                value={editing?.palletType || ''}
                onChange={(e) => setEditing({ ...editing, palletType: e.target.value as any })}
                required
              >
                {Object.entries(TYPE_LABEL).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Customer" required>
            <Input
              type="text"
              value={editing?.customer || ''}
              onChange={(e) => setEditing({ ...editing, customer: e.target.value })}
              required
              maxLength={255}
            />
          </Field>
          <Field label="Destination" required>
            <Input
              type="text"
              value={editing?.destination || ''}
              onChange={(e) => setEditing({ ...editing, destination: e.target.value })}
              required
              maxLength={255}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Carton capacity" required>
              <Input
                type="number"
                value={editing?.cartonCapacity || ''}
                onChange={(e) => setEditing({ ...editing, cartonCapacity: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Length (mm)" required>
              <Input
                type="number"
                value={editing?.lengthMm || ''}
                onChange={(e) => setEditing({ ...editing, lengthMm: Number(e.target.value) })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Width (mm)" required>
              <Input
                type="number"
                value={editing?.widthMm || ''}
                onChange={(e) => setEditing({ ...editing, widthMm: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Maximum stack height (mm)" required hint="Container door height limits this — 2,300 mm for a 40 ft high cube">
              <Input
                type="number"
                value={editing?.stackHeightMm || ''}
                onChange={(e) => setEditing({ ...editing, stackHeightMm: Number(e.target.value) })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Built by" required>
              <Input
                type="text"
                value={editing?.builtBy || ''}
                onChange={(e) => setEditing({ ...editing, builtBy: e.target.value })}
                required
                maxLength={100}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" type="submit">{isNew ? 'Add pallet' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Four kinds of pallet, four different rules" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Standard</span> — 1200 × 1000 mm, one customer, one destination. The bulk of domestic dispatch.</p>
          <p><span className="font-medium text-fg">Export</span> — heat-treated softwood with an ISPM-15 stamp. Without the stamp the container is refused at the destination port.</p>
          <p><span className="font-medium text-fg">Returnable</span> — our own pallet, tracked out and back. It appears on the customer's account until it returns.</p>
          <p><span className="font-medium text-fg">Mixed customer</span> — the only type allowed to carry cartons for more than one customer, used on part-load routes.</p>
        </CardBody>
      </Card>
    </div>
  )
}
