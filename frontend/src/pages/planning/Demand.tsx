import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
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
  const { demand, products, starts } = usePlanningData()
  const { rows, create, update, remove } = demand

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

  const filtered = rows
    .filter((d) => {
      if (tab === 'open') return d.status === 'OPEN'
      if (tab === 'firm') return d.status === 'OPEN' && d.isFirm
      if (tab === 'overdue') return d.status === 'OPEN' && isPastDue(d.requiredOn)
      if (tab === 'closed') return d.status !== 'OPEN'
      return true
    })
    .sort((a, b) => DEMAND_PRIORITY[a.source] - DEMAND_PRIORITY[b.source] || a.requiredOn.localeCompare(b.requiredOn))

  const columns: Column<DemandLine>[] = [
    { key: 'docNo', header: 'Document', sortable: true, width: '11rem', render: (d) => <span className="font-mono text-xs font-medium text-brand-600">{d.docNo}</span> },
    { key: 'source', header: 'Source', sortable: true, width: '9.5rem', accessor: (d) => DEMAND_SOURCE_LABEL[d.source], render: (d) => <DemandSourceBadge source={d.source} /> },
    {
      key: 'productCode',
      header: 'Product',
      sortable: true,
      render: (d) => (
        <>
          <p className="text-xs font-medium text-fg">{d.productName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{d.productCode}</p>
        </>
      ),
    },
    { key: 'customer', header: 'Customer', sortable: true, width: '13rem' },
    { key: 'market', header: 'Market', width: '6rem', render: (d) => <span className="text-xs text-fg-muted">{d.market.toLowerCase()}</span> },
    { key: 'qty', header: 'Quantity', align: 'right', sortable: true, width: '7rem', accessor: (d) => d.qty, render: (d) => d.qty.toLocaleString('en-IN') },
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

  const overdue = rows.filter((d) => d.status === 'OPEN' && isPastDue(d.requiredOn))

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Demand"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Demand' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add demand
          </Button>
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

      {overdue.length > 0 && tab === 'open' && (
        <Alert tone="danger" className="mb-4">
          {overdue.length} demand line{overdue.length === 1 ? '' : 's'} passed the required-by date and {overdue.length === 1 ? 'is' : 'are'} still
          open — {overdue.map((d) => d.docNo).join(', ')}. MRP plans them into the current week, so they show as late
          rather than disappearing.
        </Alert>
      )}

      <DataTable
        className="flex-1"
        rows={filtered}
        columns={columns}
        rowKey={(d) => d.uid}
        searchPlaceholder="Search document, product or customer…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'demand', 'Demand', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={openEdit}
        emptyTitle="No demand"
        emptyDescription="Add a sales order, a contract or a forecast line to plan against."
        rowClassName={(d) => (d.status === 'OPEN' && isPastDue(d.requiredOn) ? 'bg-danger/5' : undefined)}
        rowActions={(d) => (
          <>
            <MenuItem label="Edit" onClick={() => openEdit(d)} />
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
            options={[{ value: '', label: 'Select a product…' }, ...products.rows.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
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
    </div>
  )
}
