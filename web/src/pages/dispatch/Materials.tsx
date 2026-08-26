import { useMemo, useState, useEffect } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { PackageMinus } from 'lucide-react'
import {
  DispatchChartTip,
  DispatchStatusBadge,
  ItemCell,
  MATERIAL_CATEGORY_LABEL,
  useCanSeeFreight,
} from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { PackMaterialLine, PackingOrder } from '@/types/dispatch'
import { packMaterialApi } from '@/api/packMaterial'
import { packingOrderApi } from '@/api/packingOrder'

export function PackMaterialsPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeFreight()

  const [lines, setLines] = useState<PackMaterialLine[]>([])
  const [orders, setOrders] = useState<PackingOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [order, setOrder] = useState('all')
  const [issuing, setIssuing] = useState<PackMaterialLine | null>(null)
  const [issueQty, setIssueQty] = useState('')
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PackMaterialLine | null>(null)
  const [formData, setFormData] = useState<Partial<PackMaterialLine>>({})
  const [isSaving, setIsSaving] = useState(false)

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [materialsRes, ordersRes] = await Promise.all([
        packMaterialApi.getAll(),
        packingOrderApi.getAll()
      ])
      setLines(materialsRes)
      setOrders(ordersRes)
    } catch (e: any) {
      toast.error('Failed to load data', e.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const orderNos = [...new Set(lines.map((l) => l.packingOrderNo))]
  const visible = lines.filter((l) => (order === 'all' ? true : l.packingOrderNo === order))

  const pending = visible.filter((l) => l.status === 'PENDING')
  const totalValue = visible.reduce((s, l) => s + l.consumedQty * l.unitCost, 0)
  const excess = visible.filter((l) => l.consumedQty > l.standardQty)

  const byCategory = Object.keys(MATERIAL_CATEGORY_LABEL)
    .map((c) => {
      const group = visible.filter((l) => l.category === c)
      const std = group.reduce((s, l) => s + l.standardQty * l.unitCost, 0)
      const used = group.reduce((s, l) => s + l.consumedQty * l.unitCost, 0)
      return { category: MATERIAL_CATEGORY_LABEL[c as keyof typeof MATERIAL_CATEGORY_LABEL], standard: Math.round(std), consumed: Math.round(used), variance: Math.round(used - std) }
    })
    .filter((c) => c.standard > 0 || c.consumed > 0)

  const columns: Column<PackMaterialLine>[] = [
    { key: 'packingOrderNo', header: 'Packing order', sortable: true, width: '11rem', render: (m) => (
      <span className="font-mono text-xs font-medium text-brand-600">{m.packingOrderNo}</span>
    ) },
    { key: 'itemName', header: 'Material', sortable: true, render: (m) => <ItemCell name={m.itemName} code={m.itemCode} /> },
    { key: 'category', header: 'Category', sortable: true, width: '9.5rem', render: (m) => (
      <Badge tone="neutral" size="sm" dot={false}>{MATERIAL_CATEGORY_LABEL[m.category]}</Badge>
    ) },
    { key: 'standardQty', header: 'Standard', align: 'right', sortable: true, width: '7rem', render: (m) => (
      <span className="tabular text-xs text-fg-muted">{formatQty(m.standardQty)}</span>
    ) },
    { key: 'issuedQty', header: 'Issued', align: 'right', sortable: true, width: '7rem', render: (m) => (
      <span className={cn('tabular text-xs', m.issuedQty > m.standardQty && 'text-warning')}>{formatQty(m.issuedQty)}</span>
    ) },
    { key: 'consumedQty', header: 'Consumed', align: 'right', sortable: true, width: '7.5rem', render: (m) => (
      <span className={cn('tabular text-xs font-medium', m.consumedQty > m.standardQty ? 'text-danger' : 'text-fg')}>
        {formatQty(m.consumedQty)}
      </span>
    ) },
    { key: 'variance', header: 'Against standard', align: 'right', width: '10rem', sortable: true, accessor: (m) => m.consumedQty - m.standardQty, render: (m) => {
      const v = m.consumedQty - m.standardQty
      if (m.consumedQty === 0) return <span className="text-2xs text-fg-subtle">not used yet</span>
      return (
        <span className={cn('tabular text-2xs', v > 0 ? 'text-danger' : v < 0 ? 'text-success' : 'text-fg-muted')}>
          {v > 0 ? '+' : ''}{formatQty(v)} {m.uom}
          {m.standardQty > 0 && ` (${((v / m.standardQty) * 100).toFixed(1)}%)`}
        </span>
      )
    } },
    { key: 'uom', header: 'Unit', align: 'center', width: '5rem' },
    ...(canSeeValue
      ? [
          { key: 'unitCost', header: 'Rate', align: 'right' as const, sortable: true, width: '7rem', render: (m: PackMaterialLine) => formatCurrency(m.unitCost) },
          { key: 'value', header: 'Consumed value', align: 'right' as const, sortable: true, width: '10rem', accessor: (m: PackMaterialLine) => m.consumedQty * m.unitCost, render: (m: PackMaterialLine) => (
            <span className="tabular text-xs font-medium">{formatCurrency(m.consumedQty * m.unitCost)}</span>
          ) },
        ]
      : []),
    { key: 'warehouse', header: 'Store', sortable: true, defaultHidden: true },
    { key: 'issuedOn', header: 'Issued on', sortable: true, width: '9rem', accessor: (m) => m.issuedOn ?? '', render: (m) => (
      m.issuedOn ? <span className="text-2xs">{formatDate(m.issuedOn)} · {m.issuedBy}</span> : <span className="text-2xs text-warning">not issued</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (m) => <DispatchStatusBadge status={m.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'packaging-material', 'Packaging material consumption', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e: any) {
      toast.error('Export failed', e.message)
    }
  }

  async function issueAllFor(orderNo: string) {
    const target = lines.filter((l) => l.packingOrderNo === orderNo && l.status === 'PENDING')
    if (!target.length) {
      toast.info('Nothing pending', `Every material line on ${orderNo} has already been issued.`)
      return
    }
    
    try {
      await packMaterialApi.issueAll(orderNo)
      await loadData()
      
      const po = orders.find((o) => o.docNo === orderNo)
      if (po && !po.materialReady) {
        toast.success(
          'Material issued',
          `${target.length} line${target.length === 1 ? '' : 's'} issued and deducted from the packing store. ${orderNo} has cleared its material gate and can start packing.`
        )
      } else {
        toast.success('Material issued', `${target.length} line${target.length === 1 ? '' : 's'} issued and deducted from the packing store.`)
      }
    } catch (e: any) {
      toast.error('Failed to issue materials', e.message)
    }
  }

  const handleCreate = () => {
    setEditingItem(null)
    setFormData({
      uom: 'NOS',
      warehouse: 'Packing Store',
      category: 'CARTON',
      status: 'PENDING',
      itemCode: 'PKG-NEW',
      standardQty: 0,
      issuedQty: 0,
      consumedQty: 0,
      unitCost: 0
    })
    setIsModalOpen(true)
  }

  const handleEdit = (item: PackMaterialLine) => {
    setEditingItem(item)
    setFormData(item)
    setIsModalOpen(true)
  }

  const handleDelete = async (item: PackMaterialLine) => {
    if (item.status === 'CONSUMED') {
      toast.error('Cannot delete', `${item.itemName} has already been consumed against ${item.packingOrderNo}. The consumption is posted to inventory — it cannot be deleted, only reversed by a material return.`)
      return
    }
    
    if (window.confirm('Are you sure you want to delete this material line?')) {
      try {
        await packMaterialApi.delete(Number(item.uid))
        toast.success('Deleted', 'Material line removed successfully.')
        await loadData()
      } catch (e: any) {
        toast.error('Delete failed', e.message)
      }
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    
    try {
      const payload: Partial<PackMaterialLine> = {
        ...formData,
        standardQty: Number(formData.standardQty) || 0,
        issuedQty: Number(formData.issuedQty) || 0,
        consumedQty: Number(formData.consumedQty) || 0,
        unitCost: Number(formData.unitCost) || 0,
      }
      
      if (editingItem) {
        await packMaterialApi.update(Number(editingItem.uid), payload)
        toast.success('Saved', 'Material line updated successfully.')
      } else {
        await packMaterialApi.create(payload)
        toast.success('Created', 'Material line created successfully.')
      }
      setIsModalOpen(false)
      await loadData()
    } catch (err: any) {
      toast.error('Save failed', err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Packaging material"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Packaging material' }]}
        actions={<Button variant="primary" size="sm" onClick={handleCreate}>Add a material line</Button>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-56"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          options={[{ value: 'all', label: 'All packing orders' }, ...orderNos.map((o) => ({ value: o, label: o }))]}
        />
        {order !== 'all' && (
          <Button variant="secondary" size="sm" onClick={() => issueAllFor(order)}>
            Issue all pending material
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => doExport('csv')}>
          CSV
        </Button>
        <Button variant="secondary" size="sm" onClick={() => doExport('xlsx')}>
          Excel
        </Button>
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader title="Pending issues" subtitle="Material lines waiting to be issued" />
          <CardBody className="pb-6 text-3xl font-light text-brand-600">{pending.length}</CardBody>
        </Card>
        {canSeeValue && (
          <Card>
            <CardHeader title="Consumed value" subtitle="Value of materials packed so far" />
            <CardBody className="pb-6 text-3xl font-light">{formatCurrency(totalValue)}</CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Excess consumption" subtitle="Material lines exceeding standard" />
          <CardBody className="pb-6 text-3xl font-light text-danger">{excess.length}</CardBody>
        </Card>
      </div>

      {byCategory.length > 0 && canSeeValue && (
        <Card className="mb-6">
          <CardHeader title="Consumption vs Standard" subtitle="Value consumed by category" />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-muted)" />
                  <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--fg-muted)' }} tickLine={false} axisLine={false} dy={10} />
                  <YAxis tickFormatter={(v) => formatCurrency(v, 0)} tick={{ fontSize: 11, fill: 'var(--fg-muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip content={DispatchChartTip} cursor={{ fill: 'var(--bg-subtle)' }} />
                  <Bar dataKey="standard" name="Standard" fill="var(--border-muted)" radius={[4, 4, 0, 0]} barSize={32} />
                  <Bar dataKey="consumed" name="Consumed" radius={[4, 4, 0, 0]} barSize={32}>
                    {byCategory.map((c, i) => (
                      <Cell key={i} fill={c.variance > 0 ? 'var(--danger-500)' : 'var(--brand-500)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(m) => m.uid}
        loading={isLoading}
        rowActions={(m) => (
          <>
            <MenuItem label="Edit" onClick={() => handleEdit(m)} />
            <MenuItem label="Issue material" icon={<PackageMinus />} onClick={() => setIssuing(m)} disabled={m.status !== 'PENDING'} />
            <MenuItem danger label="Delete" onClick={() => handleDelete(m)} />
          </>
        )}
      />

      <Modal title={editingItem ? "Edit Material Line" : "Add Material Line"} open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Input label="Packing order" value={formData.packingOrderNo || ''} onChange={e => setFormData({...formData, packingOrderNo: e.target.value})} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Item Code" value={formData.itemCode || ''} onChange={e => setFormData({...formData, itemCode: e.target.value})} required />
            <Input label="Material Name" value={formData.itemName || ''} onChange={e => setFormData({...formData, itemName: e.target.value})} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" value={formData.category || ''} onChange={e => setFormData({...formData, category: e.target.value as any})} required options={Object.entries(MATERIAL_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
            <Input label="Standard quantity" type="number" value={formData.standardQty || ''} onChange={e => setFormData({...formData, standardQty: Number(e.target.value)})} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <Input label="Issued quantity" type="number" value={formData.issuedQty || ''} onChange={e => setFormData({...formData, issuedQty: Number(e.target.value)})} />
             <Input label="Consumed quantity" type="number" value={formData.consumedQty || ''} onChange={e => setFormData({...formData, consumedQty: Number(e.target.value)})} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Unit" value={formData.uom || ''} onChange={e => setFormData({...formData, uom: e.target.value})} required />
            <Input label="Unit cost" type="number" value={formData.unitCost || ''} onChange={e => setFormData({...formData, unitCost: Number(e.target.value)})} />
            <Input label="Issuing store" value={formData.warehouse || ''} onChange={e => setFormData({...formData, warehouse: e.target.value})} required />
          </div>
          
          <div className="mt-4 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal title="Issue Material" open={!!issuing} onClose={() => { setIssuing(null); setIssueQty('') }} size="sm">
        {issuing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const qty = Number(issueQty) || issuing.standardQty
              try {
                await packMaterialApi.update(Number(issuing.uid), {
                  issuedQty: qty,
                  status: 'ISSUED',
                  issuedOn: new Date().toISOString(),
                  issuedBy: 'S. Bhaskar',
                })
                
                const po = orders.find((o) => o.docNo === issuing.packingOrderNo)
                
                toast.success('Material issued', `Issued ${formatQty(qty)} ${issuing.uom} of ${issuing.itemName}.`)
                setIssuing(null)
                setIssueQty('')
                loadData()
              } catch (err: any) {
                toast.error('Failed to issue', err.message)
              }
            }}
            className="flex flex-col gap-4"
          >
            <div className="text-sm text-fg-muted">
              Issuing material for <strong>{issuing.itemName}</strong> on order <strong>{issuing.packingOrderNo}</strong>.
            </div>
            <Input
              label="Issue quantity"
              type="number"
              value={issueQty}
              onChange={(e) => setIssueQty(e.target.value)}
              placeholder={`Standard: ${issuing.standardQty}`}
              hint={`Leave blank to issue the standard quantity (${issuing.standardQty} ${issuing.uom}).`}
            />
            <div className="mt-4 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => { setIssuing(null); setIssueQty('') }}>Cancel</Button>
              <Button type="submit" variant="primary">Post issue</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
