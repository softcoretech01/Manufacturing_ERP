import { useMemo, useState } from 'react'
import { CalendarClock, FileSignature, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DetailBlock, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { newUid, useCollection } from '@/store/data'
import { contracts as seedContracts } from '@/mock/procurement'
import type { Contract } from '@/types/procurement'

const TYPES: Contract['contractType'][] = ['RATE_CONTRACT', 'BLANKET', 'SERVICE', 'AMC', 'JOB_WORK', 'NDA']
const SUPPLIERS = [
  'Jindal Stainless Limited',
  'Perfect Polymers Private Limited',
  'Coatmaster Powder Coatings LLP',
  'Sri Venkateswara Packaging Industries',
  'Metro Logistics Services Private Limited',
  'Apex Tooling Works',
  'Nordic Vacuum Technologies AB',
  'ThermoCare Engineering Services',
]

const daysTo = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)

export function ContractsPage() {
  const toast = useToast()
  const seed = useMemo(() => seedContracts, [])
  const { rows, create, update, remove } = useCollection<Contract>('proc:ctr', seed)

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<Contract | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [form, setForm] = useState({
    title: '',
    contractType: 'RATE_CONTRACT',
    supplierName: SUPPLIERS[0],
    validFrom: '',
    validTo: '',
    contractValue: '',
    currency: 'INR',
    paymentTerms: '30 days from invoice',
    owner: '',
    autoRenew: false,
    noticeDays: '30',
    priceRevisionClause: '',
    penaltyClause: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Contract | null>(null)

  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.status === 'ACTIVE').length,
    expiring: rows.filter((r) => r.status === 'EXPIRING' || (r.status === 'ACTIVE' && daysTo(r.validTo) <= 60)).length,
    expired: rows.filter((r) => r.status === 'EXPIRED' || r.status === 'TERMINATED').length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'active') return r.status === 'ACTIVE'
    if (tab === 'expiring') return r.status === 'EXPIRING' || (r.status === 'ACTIVE' && daysTo(r.validTo) <= 60)
    if (tab === 'expired') return r.status === 'EXPIRED' || r.status === 'TERMINATED'
    return true
  })

  const columns: Column<Contract>[] = [
    { key: 'docNo', header: 'Contract', sortable: true, width: '10rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="text-xs font-medium text-fg">{r.title}</span> },
    { key: 'contractType', header: 'Type', sortable: true, width: '8rem', render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.contractType.replace('_', ' ').toLowerCase()}</Badge> },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'validFrom', header: 'From', sortable: true, width: '7rem', accessor: (r) => r.validFrom, render: (r) => formatDate(r.validFrom) },
    {
      key: 'validTo',
      header: 'To',
      sortable: true,
      width: '9rem',
      accessor: (r) => r.validTo,
      render: (r) => {
        const d = daysTo(r.validTo)
        return (
          <div>
            <span className="text-xs">{formatDate(r.validTo)}</span>
            {r.status !== 'EXPIRED' && r.status !== 'TERMINATED' && d <= 90 && (
              <span className={d <= 30 ? 'ml-1.5 text-2xs text-danger' : 'ml-1.5 text-2xs text-warning'}>{d}d</span>
            )}
          </div>
        )
      },
    },
    { key: 'contractValue', header: 'Value', align: 'right', sortable: true, accessor: (r) => r.contractValue, render: (r) => formatCurrency(r.contractValue) },
    {
      key: 'consumed',
      header: 'Consumed',
      width: '9rem',
      accessor: (r) => (r.contractValue ? (r.consumedValue / r.contractValue) * 100 : 0),
      render: (r) => {
        const pct = r.contractValue ? (r.consumedValue / r.contractValue) * 100 : 0
        return (
          <div className="w-24">
            <ProgressBar value={pct} tone={pct >= 95 ? 'danger' : pct >= 80 ? 'warning' : 'success'} />
            <span className="mt-0.5 block text-2xs text-fg-muted tabular">{pct.toFixed(0)}% · {formatCurrency(r.consumedValue)}</span>
          </div>
        )
      },
    },
    { key: 'owner', header: 'Owner', sortable: true, width: '8rem' },
    { key: 'autoRenew', header: 'Auto renew', align: 'center', width: '6rem', accessor: (r) => (r.autoRenew ? 'Yes' : 'No'), render: (r) => <span className="text-2xs text-fg-muted">{r.autoRenew ? `Yes · ${r.noticeDays}d notice` : 'No'}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'contracts', 'Supplier contracts', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function openCreate() {
    setEditing(null)
    setForm({ title: '', contractType: 'RATE_CONTRACT', supplierName: SUPPLIERS[0], validFrom: '', validTo: '', contractValue: '', currency: 'INR', paymentTerms: '30 days from invoice', owner: '', autoRenew: false, noticeDays: '30', priceRevisionClause: '', penaltyClause: '' })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(r: Contract) {
    setEditing(r)
    setForm({
      title: r.title,
      contractType: r.contractType,
      supplierName: r.supplierName,
      validFrom: r.validFrom,
      validTo: r.validTo,
      contractValue: String(r.contractValue),
      currency: r.currency,
      paymentTerms: r.paymentTerms,
      owner: r.owner,
      autoRenew: r.autoRenew,
      noticeDays: String(r.noticeDays),
      priceRevisionClause: r.priceRevisionClause,
      penaltyClause: r.penaltyClause,
    })
    setErrors({})
    setFormOpen(true)
  }

  function save() {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'Title is required.'
    if (!form.owner.trim()) e.owner = 'Assign an internal owner.'
    if (!form.validFrom) e.validFrom = 'Start date is required.'
    if (!form.validTo) e.validTo = 'End date is required.'
    if (form.validFrom && form.validTo && form.validTo <= form.validFrom) e.validTo = 'End date must be after the start date.'
    const v = Number(form.contractValue)
    if (form.contractType !== 'NDA' && (!form.contractValue || Number.isNaN(v) || v <= 0))
      e.contractValue = 'Enter a positive contract value.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch = {
      title: form.title.trim(),
      contractType: form.contractType as Contract['contractType'],
      supplierName: form.supplierName,
      validFrom: form.validFrom,
      validTo: form.validTo,
      contractValue: Number.isNaN(v) ? 0 : v,
      currency: form.currency,
      paymentTerms: form.paymentTerms,
      owner: form.owner.trim(),
      autoRenew: form.autoRenew,
      noticeDays: Number(form.noticeDays) || 30,
      priceRevisionClause: form.priceRevisionClause.trim() || '—',
      penaltyClause: form.penaltyClause.trim() || '—',
    }

    if (editing) {
      update(editing.uid, patch)
      toast.success('Contract updated', `${editing.docNo} saved.`)
    } else {
      const next = Math.max(...rows.map((r) => Number(r.docNo.slice(-4)) || 0)) + 1
      const docNo = `CTR/26-27/${String(next).padStart(4, '0')}`
      create({
        uid: newUid('ctr'),
        docNo,
        status: 'DRAFT',
        supplierUid: 'sup-new',
        consumedValue: 0,
        items: [],
        attachments: 0,
        ...patch,
      } as Contract)
      toast.success('Contract created', `${docNo} saved as draft — attach the signed copy to activate it.`)
    }
    setFormOpen(false)
  }

  const expiringSoon = rows.filter((r) => (r.status === 'ACTIVE' || r.status === 'EXPIRING') && daysTo(r.validTo) <= 60)
  const nearlyConsumed = rows.filter((r) => r.contractValue > 0 && r.consumedValue / r.contractValue >= 0.85 && r.status !== 'EXPIRED')

  return (
    <div>
      <PageHeader
        title="Contracts"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Contracts' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New contract
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'active', label: 'Active', count: counts.active },
              { id: 'expiring', label: 'Expiring', count: counts.expiring },
              { id: 'expired', label: 'Ended', count: counts.expired },
            ]}
          />
        }
      />

      {expiringSoon.length > 0 && (
        <Alert tone="warning" className="mb-4" title={`${expiringSoon.length} contracts expire within 60 days`}>
          {expiringSoon.map((c) => `${c.title} (${daysTo(c.validTo)}d)`).join(' · ')}. Notice periods run to{' '}
          {Math.max(...expiringSoon.map((c) => c.noticeDays))} days, so a renewal decision is needed now.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search contract, supplier, title…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No contracts"
        rowActions={(r) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem label="Edit" disabled={r.status === 'EXPIRED' || r.status === 'TERMINATED'} onClick={() => openEdit(r)} />
            <MenuItem
              label="Activate"
              separatorBefore
              disabled={r.status !== 'DRAFT'}
              onClick={() => {
                update(r.uid, { status: 'ACTIVE' })
                toast.success('Activated', `${r.docNo} is now available for purchase orders.`)
              }}
            />
            <MenuItem
              label="Renew"
              icon={<RefreshCw />}
              disabled={r.status === 'DRAFT' || r.status === 'TERMINATED'}
              onClick={() => {
                const to = new Date(r.validTo)
                to.setFullYear(to.getFullYear() + 1)
                update(r.uid, { status: 'ACTIVE', validTo: to.toISOString().slice(0, 10), consumedValue: 0 })
                toast.success('Renewed', `${r.docNo} extended to ${formatDate(to.toISOString())} with the consumption reset.`)
              }}
            />
            <MenuItem
              label="Terminate"
              danger
              disabled={r.status === 'TERMINATED' || r.status === 'EXPIRED'}
              onClick={() => {
                update(r.uid, { status: 'TERMINATED' })
                toast.warning('Terminated', `${r.docNo} terminated. Open orders against it continue until closed.`)
              }}
            />
            <MenuItem label="Delete" icon={<Trash2 />} danger separatorBefore disabled={r.consumedValue > 0} onClick={() => setConfirmDelete(r)} />
          </>
        )}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title}
        description={detail ? `${detail.docNo} · ${detail.supplierName}` : undefined}
        width="max-w-3xl"
        footer={
          <div className="flex w-full justify-end">
            <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
          </div>
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={detail.status} />
              <Badge tone="neutral" size="sm" dot={false}>{detail.contractType.replace('_', ' ').toLowerCase()}</Badge>
              {detail.autoRenew && <Badge tone="brand" size="sm">Auto-renew</Badge>}
            </div>

            {detail.contractValue > 0 && (
              <div className="rounded border border-border p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Consumed</span>
                  <span className="font-medium text-fg tabular">
                    {formatCurrency(detail.consumedValue)} of {formatCurrency(detail.contractValue)}
                  </span>
                </div>
                <ProgressBar
                  value={(detail.consumedValue / detail.contractValue) * 100}
                  tone={detail.consumedValue / detail.contractValue >= 0.9 ? 'danger' : 'success'}
                  showLabel
                />
              </div>
            )}

            <DataGrid
              columns={2}
              items={[
                { label: 'Valid from', value: formatDate(detail.validFrom) },
                { label: 'Valid to', value: formatDate(detail.validTo) },
                { label: 'Currency', value: detail.currency },
                { label: 'Payment terms', value: detail.paymentTerms },
                { label: 'Owner', value: detail.owner },
                { label: 'Notice period', value: `${detail.noticeDays} days` },
                { label: 'Auto renew', value: detail.autoRenew ? 'Yes' : 'No' },
                { label: 'Attachments', value: detail.attachments },
              ]}
            />

            <DetailBlock title="Price revision clause">
              <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.priceRevisionClause}</p>
            </DetailBlock>

            <DetailBlock title="Penalty clause">
              <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.penaltyClause}</p>
            </DetailBlock>

            {detail.items.length > 0 && (
              <DetailBlock title={`Contracted items (${detail.items.length})`}>
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="text-right">Contracted</th>
                        <th className="text-right">Consumed</th>
                        <th className="text-right">Balance</th>
                        <th className="text-right">Rate</th>
                        <th>Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr key={it.itemCode}>
                          <td>
                            <p className="text-xs font-medium text-fg">{it.itemName}</p>
                            <p className="font-mono text-2xs text-fg-subtle">{it.itemCode}</p>
                          </td>
                          <td className="text-right tabular">{it.contractedQty.toLocaleString('en-IN')} {it.uom}</td>
                          <td className="text-right tabular">{it.consumedQty.toLocaleString('en-IN')}</td>
                          <td className="text-right tabular">{(it.contractedQty - it.consumedQty).toLocaleString('en-IN')}</td>
                          <td className="text-right tabular">{formatCurrency(it.rate)}</td>
                          <td className="text-2xs">{it.priceBasis.toLowerCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailBlock>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'New contract'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>{editing ? 'Save changes' : 'Create contract'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Title" required containerClassName="sm:col-span-2" value={form.title} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select label="Type" value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })} options={TYPES.map((t) => ({ value: t, label: t.replace('_', ' ').toLowerCase() }))} />
          <Select label="Supplier" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} options={SUPPLIERS.map((s) => ({ value: s, label: s }))} />
          <Input label="Valid from" type="date" required value={form.validFrom} error={errors.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          <Input label="Valid to" type="date" required value={form.validTo} error={errors.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
          <Input label="Contract value" type="number" required={form.contractType !== 'NDA'} value={form.contractValue} error={errors.contractValue} hint={form.contractType === 'NDA' ? 'Not applicable to an NDA — leave blank.' : undefined} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} />
          <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} options={[{ value: 'INR', label: 'INR' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }]} />
          <Input label="Owner" required value={form.owner} error={errors.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          <Input label="Notice period (days)" type="number" value={form.noticeDays} onChange={(e) => setForm({ ...form, noticeDays: e.target.value })} />
          <div className="flex items-end pb-1">
            <Switch checked={form.autoRenew} onChange={(v) => setForm({ ...form, autoRenew: v })} label="Auto renew on expiry" />
          </div>
          <Textarea label="Price revision clause" containerClassName="sm:col-span-2" rows={2} value={form.priceRevisionClause} onChange={(e) => setForm({ ...form, priceRevisionClause: e.target.value })} placeholder="Quarterly, linked to the LME nickel 3-month average; ± 5% band absorbed by the supplier." />
          <Textarea label="Penalty clause" containerClassName="sm:col-span-2" rows={2} value={form.penaltyClause} onChange={(e) => setForm({ ...form, penaltyClause: e.target.value })} placeholder="0.5% of the delayed line value per week, capped at 5%." />
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete contract"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${confirmDelete.docNo} soft-deleted.`)
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
          A contract with consumption against it cannot be deleted — terminate it so the orders placed under it keep
          their reference.
        </p>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Consumption watch" description="Contracts approaching their committed value" />
        <CardBody className="space-y-3">
          {nearlyConsumed.length === 0 ? (
            <p className="text-xs text-fg-subtle">No contract is above 85% consumed.</p>
          ) : (
            nearlyConsumed.map((c) => (
              <div key={c.uid} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-fg">{c.title}</p>
                  <p className="truncate text-2xs text-fg-muted">{c.supplierName}</p>
                </div>
                <div className="w-40">
                  <ProgressBar value={(c.consumedValue / c.contractValue) * 100} tone="danger" showLabel />
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  )
}
