import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarRange, Eye, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemandNettingPanel } from '@/components/planning/DemandNettingPanel'
import { NewMasterScheduleModal } from '@/components/planning/NewMasterScheduleModal'
import { FilterBar, EMPTY_FILTERS, applyFilters, hasFilters, type FilterState } from '@/components/planning/PlanningKit'
import { demandProgress } from '@/lib/demandProgress'
import { DemandViewDrawer } from '@/components/planning/DemandViewDrawer'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DemandSourceBadge, DEMAND_SOURCE_LABEL, PlanStatusBadge } from '@/components/planning/PlanShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { bucketIndex, isPastDue } from '@/lib/planFlow'
import { newUid } from '@/store/data'
import { usePlanningData } from './usePlanningData'
import { DEMAND_PRIORITY, type DemandLine, type DemandSource } from '@/types/planning'

/**
 * Demand management (Ch 6).
 *
 * Everything the plant is being asked for, in one list, ranked. The ranking is
 * the point: when capacity or material runs short something has to give, and it
 * should be the forecast rather than the firm export contract. Sorting by
 * priority makes that decision visible instead of leaving it to whoever shouts.
 */

const SOURCES: DemandSource[] = ['SALES_ORDER', 'EXPORT_CONTRACT', 'CUSTOMER_SCHEDULE', 'BLANKET', 'FORECAST', 'SAFETY_STOCK']
const MARKETS: DemandLine['market'][] = ['DOMESTIC', 'EXPORT', 'OEM']

interface FormState {
  docNo: string
  source: DemandSource
  productCode: string
  qty: string
  requiredOn: string
  customer: string
  market: DemandLine['market']
  isFirm: boolean
  remarks: string
}

const emptyForm: FormState = {
  docNo: '',
  source: 'SALES_ORDER',
  productCode: '',
  qty: '',
  requiredOn: '',
  customer: '',
  market: 'DOMESTIC',
  isFirm: true,
  remarks: '',
}

export function DemandPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { demand, mps, orders, products, sellableProducts, starts } = usePlanningData()
  const { rows, create, update, remove } = demand

  // Schedule wizard. `scheduleFor` pre-selects a demand when it is opened from
  // a row rather than from the header button.
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleFor, setScheduleFor] = useState<string | undefined>(undefined)

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  // The row being viewed. Held as the row itself, not an index — an index
  // goes stale the moment a filter or a sort changes underneath it.
  const [viewing, setViewing] = useState<DemandLine | null>(null)

  /*
   * Planning progress per demand, computed once for the whole page.
   *
   * Each grid cell calling `demandProgress` directly would re-scan every MPS row
   * and every production order for every cell on every render — six columns of
   * O(n*m) work on a list that can run to hundreds of rows.
   */
  const progressByDoc = useMemo(() => {
    const map = new Map<string, ReturnType<typeof demandProgress>>()
    for (const d of rows) map.set(d.docNo, demandProgress(d, mps.rows, orders.rows))
    return map
  }, [rows, mps.rows, orders.rows])

  const progressOf = (d: DemandLine) =>
    progressByDoc.get(d.docNo) ?? demandProgress(d, mps.rows, orders.rows)

  /** How many schedule buckets exist for a demand — drives the row affordance. */
  const scheduledBuckets = (docNo: string) =>
    mps.rows.filter((m) => m.demandDocNo === docNo).length

  const [tab, setTab] = useState('open')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DemandLine | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<DemandLine | null>(null)

  const counts = {
    open: rows.filter((d) => d.status === 'OPEN').length,
    firm: rows.filter((d) => d.status === 'OPEN' && d.isFirm).length,
    overdue: rows.filter((d) => d.status === 'OPEN' && isPastDue(d.requiredOn)).length,
    closed: rows.filter((d) => d.status !== 'OPEN').length,
    all: rows.length,
  }

  const tabbed = rows.filter((d) => {
    if (tab === 'open') return d.status === 'OPEN'
    if (tab === 'firm') return d.status === 'OPEN' && d.isFirm
    if (tab === 'overdue') return d.status === 'OPEN' && isPastDue(d.requiredOn)
    if (tab === 'closed') return d.status !== 'OPEN'
    return true
  })

  const filtered = applyFilters(tabbed, filters, (d) => ({
    text: [d.docNo, d.productCode, d.productName, d.customer],
    date: d.requiredOn,
    status: d.status,
  }))
    .sort((a, b) => DEMAND_PRIORITY[a.source] - DEMAND_PRIORITY[b.source] || a.requiredOn.localeCompare(b.requiredOn))

  const columns: Column<DemandLine>[] = [
    {
      key: 'sno', header: 'S.No', width: '4.5rem', align: 'center',
      render: (_d, i) => <span className="text-[13px] tabular-nums text-fg-muted">{i + 1}</span>,
    },
    { key: 'docNo', header: 'Demand No', sortable: true, width: '11rem', render: (d) => <span className="font-mono text-xs font-medium text-brand-600">{d.docNo}</span> },
    { key: 'source', header: 'Source', sortable: true, width: '9.5rem', accessor: (d) => DEMAND_SOURCE_LABEL[d.source], render: (d) => <DemandSourceBadge source={d.source} /> },
    {
      key: 'productCode',
      header: 'Product',
      sortable: true,
      width: '16rem',
      render: (d) => (
        <>
          <p className="text-xs font-medium text-fg">{d.productName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{d.productCode}</p>
        </>
      ),
    },
    { key: 'customer', header: 'Customer', sortable: true, width: '13rem' },
    { key: 'market', header: 'Market', width: '6rem', defaultHidden: true, render: (d) => <span className="text-xs text-fg-muted">{d.market.toLowerCase()}</span> },
    {
      key: 'qty', header: 'Demand Qty', align: 'right', sortable: true, width: '8rem',
      accessor: (d) => d.qty,
      render: (d) => <span className="tabular-nums">{d.qty.toLocaleString('en-IN')}</span>,
    },
    { key: 'uom', header: 'UOM', width: '5rem', align: 'center', render: (d) => <span className="text-[12px] text-fg-muted">{d.uom}</span> },
    {
      key: 'scheduled', header: 'Scheduled', align: 'right', sortable: true, width: '8rem',
      accessor: (d) => progressOf(d).scheduled,
      render: (d) => {
        const p = progressOf(d)
        return p.scheduled > 0 ? (
          <span className="tabular-nums text-fg">{p.scheduled.toLocaleString('en-IN')}</span>
        ) : (
          <span className="text-[12px] text-fg-subtle" title="No master schedule built for this demand yet">—</span>
        )
      },
    },
    {
      key: 'produced', header: 'Produced', align: 'right', sortable: true, width: '8rem',
      accessor: (d) => progressOf(d).produced,
      render: (d) => {
        const p = progressOf(d)
        return p.produced > 0 ? (
          <span className="tabular-nums text-success">{p.produced.toLocaleString('en-IN')}</span>
        ) : (
          <span className="text-[12px] text-fg-subtle" title="Nothing produced against this demand yet">—</span>
        )
      },
    },
    {
      key: 'remaining', header: 'Remaining', align: 'right', sortable: true, width: '8rem',
      accessor: (d) => progressOf(d).remaining,
      render: (d) => {
        const p = progressOf(d)
        return p.remaining <= 0 ? (
          <span className="text-[12px] font-medium text-success">Covered</span>
        ) : (
          <span className="tabular-nums font-medium text-warning">{p.remaining.toLocaleString('en-IN')}</span>
        )
      },
    },
    {
      key: 'requiredOn',
      header: 'Required by',
      sortable: true,
      width: '9rem',
      accessor: (d) => d.requiredOn,
      render: (d) => (
        <span className={isPastDue(d.requiredOn) && d.status === 'OPEN' ? 'text-danger' : ''}>
          {formatDate(d.requiredOn)}
          {isPastDue(d.requiredOn) && d.status === 'OPEN' && <span className="ml-1 text-2xs">overdue</span>}
        </span>
      ),
    },
    {
      key: 'bucket',
      header: 'Week',
      align: 'right',
      width: '5rem',
      defaultHidden: true,
      accessor: (d) => bucketIndex(d.requiredOn, starts),
      render: (d) => {
        const b = bucketIndex(d.requiredOn, starts)
        return b < 0 ? <span className="text-2xs text-fg-subtle">beyond</span> : <span className="text-xs tabular">W{b + 1}</span>
      },
    },
    { key: 'isFirm', header: 'Firm', width: '5rem', accessor: (d) => (d.isFirm ? 'Firm' : 'Planned'), render: (d) => <span className="text-2xs text-fg-muted">{d.isFirm ? 'Firm' : 'Planned'}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '7rem', render: (d) => <PlanStatusBadge status={d.status} size="sm" /> },
  ]

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, productCode: products.rows[0]?.code ?? '', requiredOn: starts[2] })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(d: DemandLine) {
    setEditing(d)
    setForm({
      docNo: d.docNo,
      source: d.source,
      productCode: d.productCode,
      qty: String(d.qty),
      requiredOn: d.requiredOn,
      customer: d.customer,
      market: d.market,
      isFirm: d.isFirm,
      remarks: d.remarks,
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.docNo.trim()) e.docNo = 'A document number is required.'
    else if (rows.some((d) => d.docNo === form.docNo.trim() && d.uid !== editing?.uid)) e.docNo = `${form.docNo.trim()} already exists.`
    if (!form.productCode) e.productCode = 'Choose the product being demanded.'
    if (!(Number(form.qty) > 0)) e.qty = 'Quantity must be greater than zero.'
    if (!form.requiredOn) e.requiredOn = 'A required-by date is mandatory — MRP times the plan from it.'
    if (!form.customer.trim()) e.customer = 'Name the customer or the channel.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save() {
    if (!validate()) return
    const product = products.rows.find((p) => p.code === form.productCode)
    const patch = {
      docNo: form.docNo.trim(),
      source: form.source,
      productCode: form.productCode,
      productName: product?.name ?? form.productCode,
      uom: product?.baseUom ?? 'NOS',
      qty: Number(form.qty),
      requiredOn: form.requiredOn,
      customer: form.customer.trim(),
      market: form.market,
      isFirm: form.isFirm,
      remarks: form.remarks.trim(),
    }
    if (editing) {
      update(editing.uid, { ...patch, version: editing.version + 1 })
      toast.success('Demand updated', `${patch.docNo} saved. Re-run MRP to see the effect.`)
    } else {
      create({ ...patch, uid: newUid('dem'), qtyPlanned: 0, status: 'OPEN', createdAt: new Date().toISOString(), version: 1 } as DemandLine)
      toast.success('Demand added', `${patch.docNo} is in the plan from week ${bucketIndex(patch.requiredOn, starts) + 1}.`)
    }
    setFormOpen(false)
  }


  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Demand"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Demand' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<CalendarRange className="h-4 w-4" />}
              onClick={() => {
                setScheduleFor(undefined)
                setScheduleOpen(true)
              }}
            >
              New master schedule
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add demand
            </Button>
          </div>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: counts.open },
              { id: 'firm', label: 'Firm', count: counts.firm },
              { id: 'overdue', label: 'Overdue', count: counts.overdue },
              { id: 'closed', label: 'Closed', count: counts.closed },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />


      {/* What MRP will actually plan. The list below shows documents; this shows
          the netted total, which is not the same number once a firm order has
          consumed part of a forecast. */}
      <div className="mb-4">
        <DemandNettingPanel />
      </div>

      <div className="mb-4">
        <FilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="Demand number, product or customer…"
          dateLabel="Required"
          statuses={[
            { value: 'OPEN', label: 'Open' },
            { value: 'CLOSED', label: 'Closed' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
        />
      </div>

      <DataTable
        className="flex-1"
        rows={filtered}
        columns={columns}
        rowKey={(d) => d.uid}
        searchable={false}
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'demand', 'Demand', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={(d) => setViewing(d)}
        emptyTitle={hasFilters(filters) ? 'No demand matches these filters' : 'No demand yet'}
        emptyDescription={
          hasFilters(filters)
            ? 'Nothing matches the current search and date range. Clear the filters to see every demand line.'
            : 'Add a sales order, a contract or a forecast line to plan against.'
        }
        rowClassName={(d) => (d.status === 'OPEN' && isPastDue(d.requiredOn) ? 'bg-danger/5' : undefined)}
        rowActions={(d) => (
          <>
            <MenuItem label="View" icon={<Eye />} onClick={() => setViewing(d)} />
            {scheduledBuckets(d.docNo) > 0 ? (
              <MenuItem
                label={`View schedule (${scheduledBuckets(d.docNo)} weeks)`}
                icon={<CalendarRange />}
                separatorBefore
                onClick={() => navigate(`/planning/mps?demand=${encodeURIComponent(d.docNo)}`)}
              />
            ) : (
              <MenuItem
                label="Build master schedule"
                icon={<CalendarRange />}
                separatorBefore
                onClick={() => {
                  setScheduleFor(d.docNo)
                  setScheduleOpen(true)
                }}
              />
            )}
            <MenuItem label="Edit" separatorBefore onClick={() => openEdit(d)} />
            <MenuItem
              label={d.status === 'OPEN' ? 'Close as satisfied' : 'Reopen'}
              separatorBefore
              onClick={() => {
                update(d.uid, { status: d.status === 'OPEN' ? 'CLOSED' : 'OPEN' })
                toast.success(d.status === 'OPEN' ? 'Closed' : 'Reopened', `${d.docNo} is now ${d.status === 'OPEN' ? 'closed' : 'open'}.`)
              }}
            />
            <MenuItem
              label={d.isFirm ? 'Mark as planned (not firm)' : 'Mark as firm'}
              onClick={() => {
                update(d.uid, { isFirm: !d.isFirm })
                toast.success('Updated', `${d.docNo} is ${d.isFirm ? 'no longer firm' : 'firm'}.`)
              }}
            />
            <MenuItem label="Delete" icon={<Trash2 />} danger separatorBefore onClick={() => setConfirmDelete(d)} />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'Add demand'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Add demand'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Document number" required value={form.docNo} error={errors.docNo} placeholder="SO/26-27/00530" onChange={(e) => setForm({ ...form, docNo: e.target.value })} />
          <Select
            label="Source"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value as DemandSource, isFirm: e.target.value === 'SALES_ORDER' || e.target.value === 'EXPORT_CONTRACT' })}
            options={SOURCES.map((s) => ({ value: s, label: `${DEMAND_SOURCE_LABEL[s]} — priority ${DEMAND_PRIORITY[s]}` }))}
          />
          <Select
            label="Product"
            required
            containerClassName="sm:col-span-2"
            value={form.productCode}
            error={errors.productCode}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
            options={[{ value: '', label: 'Select a product…' }, ...sellableProducts.rows.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <Input label="Customer or channel" required value={form.customer} error={errors.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
          <Select label="Market" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value as DemandLine['market'] })} options={MARKETS.map((m) => ({ value: m, label: m.toLowerCase() }))} />
          <Input label="Quantity" type="number" required value={form.qty} error={errors.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          <Input label="Required by" type="date" required value={form.requiredOn} error={errors.requiredOn} onChange={(e) => setForm({ ...form, requiredOn: e.target.value })} />
          <div className="flex items-end pb-1">
            <Switch checked={form.isFirm} onChange={(v) => setForm({ ...form, isFirm: v })} label="Firm — planned exactly as entered" />
          </div>
          <Textarea label="Remarks" containerClassName="sm:col-span-2" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>

        <Alert tone="info" className="mt-4">
          Priority runs from firm customer orders down to forecast. When material or capacity is short, MRP still plans
          everything — the ranking is what tells you which line to protect.
        </Alert>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete demand line"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted; re-run MRP to drop it from the plan.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.docNo} will be marked deleted, not physically removed. Any order already raised against it
          stays.
        </p>
      </Modal>

      <DemandViewDrawer
        demand={viewing}
        mps={mps.rows}
        orders={orders.rows}
        onClose={() => setViewing(null)}
        onEdit={(d) => {
          setViewing(null)
          openEdit(d)
        }}
        onSchedule={(d) => {
          setViewing(null)
          if (scheduledBuckets(d.docNo) > 0) {
            navigate(`/planning/mps?demand=${encodeURIComponent(d.docNo)}`)
          } else {
            setScheduleFor(d.docNo)
            setScheduleOpen(true)
          }
        }}
        onOpenMrp={() => navigate('/planning/mrp')}
        onOpenOrders={(d) => navigate(`/planning/orders?demand=${encodeURIComponent(d.docNo)}`)}
      />

      <NewMasterScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        demand={rows}
        starts={starts}
        existing={mps.rows}
        onCreate={mps.create}
        presetDemandDocNo={scheduleFor}
        onSaved={(docNo) => {
          setScheduleOpen(false)
          navigate(`/planning/mps?demand=${encodeURIComponent(docNo)}`)
        }}
      />
    </div>
  )
}
