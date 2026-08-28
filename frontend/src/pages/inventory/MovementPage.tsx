import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { type UseMutationResult, useQuery } from '@tanstack/react-query'
import { Send, Plus, Trash2, Eye, Pencil, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatQty } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useStockEnquiry, useMovements } from '@/hooks/useStock'
import * as api from '@/api/stock'
import { useItemCategories } from '@/hooks/useItemCategories'
import { useItemLookup } from '@/hooks/useItemLookup'
import { useWarehouses, useDepartments } from '@/hooks/useOrganisation'
import type { MovementResult } from '@/api/stock'

export interface MovementConfig {
  title: string
  description: string
  crumb: string
  movementTypes: string
  submitLabel: string
  needsRate?: boolean
  needsReason?: boolean
  needsDirection?: boolean
  needsDepartment?: boolean
  reasonLabel?: string
  note?: ReactNode
}

interface LineItem {
  id: number
  itemType: string
  itemCategory: string
  itemUid: string
  qty: string
  rate: string
  batch: string
}


export function ViewModal({
  documentNo,
  rows,
  onClose,
}: {
  documentNo: string
  rows: any[]
  onClose: () => void
}) {
  return (
    <Modal open={true} onClose={onClose} title={`View Document: ${documentNo}`} size="2xl">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 bg-surface-2 p-4 rounded-lg">
          <div><span className="text-sm text-fg-muted">Date:</span> <span className="font-medium">{rows[0]?.business_date}</span></div>
          <div><span className="text-sm text-fg-muted">Source:</span> <span className="font-medium">{rows[0]?.warehouse_code}</span></div>
          <div><span className="text-sm text-fg-muted">Destination:</span> <span className="font-medium">{rows[0]?.remarks || '-'}</span></div>
          <div><span className="text-sm text-fg-muted">Status:</span> <span className="font-medium">{rows[0]?.stock_status}</span></div>
        </div>
        <DataTable
          density="compact"
          searchable={false}
          columns={[
            { key: 'item_code', header: 'Item Code' },
            { key: 'item_name', header: 'Name' },
            { key: 'quantity', header: 'Quantity', align: 'right' },
            { key: 'batch_no', header: 'Batch' },
          ].filter(c => c.key !== 'batch_no' || !rows[0]?.movement_type?.includes('ISSUE'))}
          rows={rows}
          rowKey={(r: any) => r.uid}
        />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}

export function MovementModal({
  config,
  useHook,
  onClose,
  initialData,
}: {
  config: MovementConfig
  useHook: () => UseMutationResult<any, unknown, Record<string, unknown>[]>
  onClose: () => void
  initialData?: any[]
}) {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const itemsQ = useItems({ active_only: true })
  const items = itemsQ.data ?? []
  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  const deptQ = useDepartments({ page_size: 200 })
  const departments = deptQ.data?.data ?? []
  const mutation = useHook()

  // State first: everything below reads it, and a `const` referenced before its
  // declaration is a temporal-dead-zone crash at runtime, not a warning.
  const [warehouseUid, setWarehouseUid] = useState('')
  const [departmentUid, setDepartmentUid] = useState('')
  const [reason, setReason] = useState('')
  const [direction, setDirection] = useState('OUT')

  // An issue comes out of a store; other movements may use any warehouse.
  const filteredWarehouses = config.movementTypes === 'ISSUE'
    ? warehouses.filter(w => w.name.toLowerCase().includes('store') || w.code.toLowerCase().includes('store'))
    : warehouses

  const stockQ = useStockEnquiry({ warehouse: warehouseUid })
  
  // Force refresh stock when modal opens
  useEffect(() => {
    stockQ.refetch()
  }, [warehouseUid])
  const stock = stockQ.data ?? []

  const cats = useItemCategories()
  const lookup = useItemLookup()
  const itemTypes = cats.parents

  const [lines, setLines] = useState<LineItem[]>([
    { id: Date.now(), itemType: '', itemCategory: '', itemUid: '', qty: '', rate: '', batch: '' }
  ])
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (initialData && initialData.length > 0 && !initialized && items.length > 0 && filteredWarehouses.length > 0) {
      const wh = filteredWarehouses.find(w => w.code === initialData[0].warehouse_code)
      if (wh) setWarehouseUid(wh.uid)
      setReason(initialData[0].remarks || '')
      
      // Auto-select department matching remarks
      const remarks = initialData[0].remarks || ''
      const dept = departments.find(d => remarks.includes(`${d.code} - ${d.name}`))
      if (dept) setDepartmentUid(dept.uid)
      
      const newL = initialData.map((r: any) => {
        const itemObj = items.find((i: any) => i.code === r.item_code)
        return {
          id: Date.now() + Math.random(),
          itemType: itemObj ? lookup.itemTypeOf(itemObj.code) || '' : '',
          itemCategory: itemObj ? lookup.categoryOf(itemObj.code) || '' : '',
          itemUid: itemObj?.uid || '',
          qty: String(r.quantity ?? r.available ?? ''),
          rate: String(r.rate || ''),
          batch: r.batch_no || ''
        }
      })
      setLines(newL)
      setInitialized(true)
    }
  }, [initialData, items, filteredWarehouses, initialized, departments])
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Auto-select store if there's only one
  useEffect(() => {
    if (filteredWarehouses.length === 1 && !warehouseUid) {
      setWarehouseUid(filteredWarehouses[0].uid)
    }
  }, [filteredWarehouses, warehouseUid])

  function addLine() {
    setLines([...lines, { id: Date.now(), itemType: '', itemCategory: '', itemUid: '', qty: '', rate: '', batch: '' }])
  }

  function removeLine(id: number) {
    if (lines.length > 1) {
      setLines(lines.filter(l => l.id !== id))
    }
  }

  function updateLine(id: number, field: keyof LineItem, value: string) {
    setLines(lines.map(l => {
      if (l.id === id) {
        if (field === 'itemType' || field === 'itemCategory') {
          return { ...l, [field]: value, itemUid: '' } // reset item on cat change
        }
        return { ...l, [field]: value }
      }
      return l
    }))
  }

  function submit() {
    setErrors({})
    const fe: Record<string, string> = {}
    if (!warehouseUid) fe.warehouse = 'Pick a warehouse / store'
    if (config.needsDepartment && !departmentUid) fe.department = 'Pick a department'
    if (config.needsReason && !reason.trim()) fe.reason = 'A reason is required'

    if (Object.keys(fe).length) { setErrors(fe); return }

    // Validate lines
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (!l.itemUid) return toast.error('Incomplete line', `Please select an item for line ${i + 1}`)
      if (!l.qty || Number(l.qty) <= 0) return toast.error('Invalid quantity', `Please enter a valid quantity for line ${i + 1}`)
      const item = items.find(it => it.uid === l.itemUid)
      if (item?.is_batch_tracked && config.movementTypes !== 'ISSUE' && !l.batch.trim()) return toast.error('Missing batch', `Please enter a batch number for line ${i + 1}`)
      
      if (config.movementTypes === 'ISSUE' && item) {
        // Stock enquiry reports availability per item; `available` already
        // excludes quarantined and blocked stock. Per-batch availability is
        // enforced server-side, which is the authoritative refusal — this check
        // just catches the obvious case before a round trip.
        const available = stock
          .filter(s => s.item_code === item.code)
          .reduce((acc, s) => acc + (s.available ?? 0), 0)

        if (Number(l.qty) > available) {
          return toast.error('Insufficient Stock', `Line ${i + 1}: ${item.code} only has ${formatQty(available)} available.`)
        }
      }
    }

    const payload = lines.map(l => {
      const body: Record<string, unknown> = {
        item_uid: l.itemUid, warehouse_uid: warehouseUid, quantity: Number(l.qty), batch_no: l.batch.trim(),
      }
      if (config.needsDepartment && departmentUid) body.department_uid = departmentUid
      if (config.needsRate && l.rate !== '') body.rate = Number(l.rate)
      if (config.needsReason) body.reason = reason.trim()
      if (config.needsDirection) body.direction = direction
      return body
    })

    mutation.mutate(payload, {
      onSuccess: (results) => {
        const res = results[0]
        toast.success('Posted', `Processed ${results.length} items successfully.`)
        onClose()
      },
      onError: (e) => {
        if (e instanceof ProblemError) {
          toast.error(e.problem.title || 'Failed', e.problem.detail)
        } else toast.error('Failed', 'Unknown error.')
      },
    })
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={config.title}
      description={config.description}
      size="5xl"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={mutation.isPending} onClick={submit}>{config.submitLabel}</Button>
        </>
      }
    >
      <div className="space-y-6">
        {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}

        <div className="grid grid-cols-3 gap-4 bg-surface-2 p-4 rounded-lg">
          <Select label="Source Store" required value={warehouseUid} error={errors.warehouse} onChange={(e) => setWarehouseUid(e.target.value)}
            options={[
              { value: '', label: 'Select a store...' },
              ...filteredWarehouses.map((w) => ({ value: w.uid, label: w.name }))
            ]} />

          {config.needsDepartment && (
            <Select label="Department / Destination" required value={departmentUid} error={errors.department} onChange={(e) => setDepartmentUid(e.target.value)}
              options={[
                { value: '', label: 'Select a department...' },
                ...departments.filter(d => d.is_active).map((d) => ({ value: d.uid, label: `${d.code} — ${d.name}` }))
              ]} />
          )}
          
          {config.needsDirection && (
            <Select label="Direction" value={direction} onChange={(e) => setDirection(e.target.value)}
              options={[{ value: 'OUT', label: 'Decrease (write down)' }, { value: 'IN', label: 'Increase (write up)' }]} />
          )}

          {config.needsReason && <Input label={config.reasonLabel ?? 'Reason'} required value={reason} error={errors.reason} onChange={(e) => setReason(e.target.value)} />}
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-fg">Items</h4>
          {lines.map((line, idx) => {
            const itemCategories = line.itemType ? (cats.byParent[line.itemType] || []) : cats.all
            let filteredItems = items
            if (line.itemType) filteredItems = filteredItems.filter((i) => lookup.itemTypeOf(i.code) === line.itemType)
            if (line.itemCategory) filteredItems = filteredItems.filter((i) => lookup.categoryOf(i.code) === line.itemCategory)
            const itemObj = items.find((i) => i.uid === line.itemUid)
            const needsBatch = !!itemObj?.is_batch_tracked && config.movementTypes !== 'ISSUE'

            return (
              <div key={line.id} className="flex gap-2 items-start border-b border-border pb-3">
                <Select className="w-40" aria-label="Type" value={line.itemType} onChange={(e) => updateLine(line.id, 'itemType', e.target.value)}
                  options={[{ value: '', label: 'All types' }, ...itemTypes.map((t) => ({ value: t, label: t }))]} />
                  
                <Select className="w-40" aria-label="Category" value={line.itemCategory} onChange={(e) => updateLine(line.id, 'itemCategory', e.target.value)}
                  options={[{ value: '', label: 'All categories' }, ...itemCategories.map((c) => ({ value: c, label: c }))]} />

                <Select className="flex-1" aria-label="Item" required value={line.itemUid} onChange={(e) => updateLine(line.id, 'itemUid', e.target.value)}
                  options={[{ value: '', label: 'Select item...' }, ...filteredItems.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))]} />

                <Input className="w-24" aria-label="Qty" placeholder={`Qty${itemObj ? ` ${itemObj.base_uom}` : ''}`} type="number" required value={line.qty} onChange={(e) => updateLine(line.id, 'qty', e.target.value)} />
                
                {config.needsRate && <Input className="w-24" aria-label="Rate" placeholder="Rate" type="number" value={line.rate} onChange={(e) => updateLine(line.id, 'rate', e.target.value)} />}
                
                {needsBatch ? (
                  <Input className="w-32" aria-label="Batch" placeholder="Batch no" required value={line.batch} onChange={(e) => updateLine(line.id, 'batch', e.target.value)} />
                ) : (
                  <div className="w-32" />
                )}

                <div className="pt-1">
                  <IconButton icon={Trash2} variant="ghost" tone="danger" title="Remove" onClick={() => removeLine(line.id)} disabled={lines.length === 1} />
                </div>
              </div>
            )
          })}
          <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4"/>} onClick={addLine}>Add another item</Button>
        </div>

        {config.note && <div className="text-sm text-fg-muted bg-surface-2 p-3 rounded-md">{config.note}</div>}
      </div>
    </Modal>
  )
}

import { DataTable, type Column } from '@/components/ui/DataTable'
import { InvFilterBar, InvSearch } from '@/components/inventory/InvFilterBar'

export function MovementPage({
  config,
  useHook,
}: {
  config: MovementConfig
  useHook: () => UseMutationResult<any, unknown, Record<string, unknown>[]>
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editData, setEditData] = useState<any[] | undefined>(undefined)
  const [viewRows, setViewRows] = useState<any[] | null>(null)
  const [search, setSearch] = useState('')
  const toast = useToast()
  
  const query = useMovements(config.movementTypes)
  const flatRows = query.data ?? []

  const handleReverse = async (docNo: string) => {
    try {
      await api.transactions.reverseDocument(docNo)
      toast.success('Success', 'Document reversed successfully')
      query.refetch()
    } catch (e: any) {
      toast.error('Failed', e.response?.data?.title || e.message)
    }
  }

  const handleEdit = async (docNo: string, rows: any[]) => {
    try {
      await api.transactions.reverseDocument(docNo)
      toast.success('Success', 'Document reversed. Opening draft...')
      query.refetch()
      setEditData(rows)
      setModalOpen(true)
    } catch (e: any) {
      toast.error('Failed', e.response?.data?.title || e.message)
    }
  }

  const groupedRows = useMemo(() => {
    const map = new Map<string, any>()
    for (const r of flatRows) {
      if (!r.document_no) continue
      if (r.movement_type.endsWith('_REV')) continue
      
      if (!map.has(r.document_no)) {
        map.set(r.document_no, {
          id: r.document_no,
          document_no: r.document_no,
          date: r.business_date,
          source: r.warehouse_code,
          destination: r.remarks || '-',
          itemsCount: 0,
          status: r.stock_status,
          rawRows: []
        })
      }
      const g = map.get(r.document_no)
      g.itemsCount++
      g.rawRows.push(r)
    }
    
    const revs = flatRows.filter(r => r.movement_type.endsWith('_REV')).map(r => r.remarks?.split(': ')[0]?.replace('Reverses ', ''))
    
    const result = Array.from(map.values()).filter(g => !revs.includes(g.document_no))
    
    return result.filter(g => {
      const q = search.toLowerCase()
      if (!search) return true
      return g.document_no.toLowerCase().includes(q) || (g.source && g.source.toLowerCase().includes(q))
    })
  }, [flatRows, search])

  const columns: Column<any>[] = [
    { key: 'date', header: 'Date', width: '120px' },
    { key: 'document_no', header: 'Document No' },
    { key: 'source', header: 'Source' },
    { key: 'destination', header: 'Destination' },
    { key: 'items', header: 'Items', render: (row) => `${row.itemsCount} items` },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions', align: 'right', render: (row) => (
      <div className="flex justify-end gap-1">
        <IconButton title="View" onClick={() => setViewRows(row.rawRows)} icon={Eye} />
        <IconButton title="Edit" onClick={() => handleEdit(row.document_no, row.rawRows)} icon={Pencil} />
        <IconButton title="Reverse / Delete" onClick={() => handleReverse(row.document_no)} className="text-red-500 hover:text-red-600 hover:bg-red-50" icon={Trash2} />
      </div>
    )}
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title={config.title}
        description={config.description}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: config.title }]}
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 transition-colors"
          >
            + New {config.title}
          </button>
        }
      />

      <InvFilterBar
        left={<InvSearch value={search} onChange={setSearch} placeholder={`Search ${config.title.toLowerCase()}...`} />}
      />

      <DataTable
          density="comfortable"
          searchable={false}
          rows={groupedRows}
          columns={columns}
          rowKey={(r) => r.id}
          emptyTitle={`No ${config.title.toLowerCase()} records`}
          emptyDescription={`Click + New ${config.title} to create one.`}
        />
      {modalOpen && <MovementModal config={config} useHook={useHook} initialData={editData} onClose={() => { setModalOpen(false); setEditData(undefined); query.refetch(); }} />}
      {viewRows && <ViewModal documentNo={viewRows[0].document_no} rows={viewRows} onClose={() => setViewRows(null)} />}
    </div>
  )
}
