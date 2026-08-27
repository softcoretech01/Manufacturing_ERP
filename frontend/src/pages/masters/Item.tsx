import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, Upload, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/format'
import { SIMPLE_MASTER_BY_CODE } from '@/mock/masterRegistry'
import { useDataStore } from '@/store/data'
import { useMasterOptions } from '@/hooks/useMasterOptions'
import type { Item, ItemType } from '@/types/masters'
import * as api from '@/api/masters'

/*
 * Item categories come live from the Item Category master. Its two parents —
 * Product Items / Company Items — each carry their own child categories, so the
 * Item form can cascade: pick a parent, then only its categories are shown.
 */
const ITEM_CAT_DEF = SIMPLE_MASTER_BY_CODE['ITEM_CATEGORY']
const ITEM_CAT_KEY = `master:ITEM_CATEGORY${ITEM_CAT_DEF?.seedVersion ? `:v${ITEM_CAT_DEF.seedVersion}` : ''}`

type CatRow = { name: string; values?: Record<string, any>; deletedAt?: string | null }

function useItemCategories() {
  const live = useDataStore((s) => s.collections[ITEM_CAT_KEY]) as CatRow[] | undefined
  const rows: CatRow[] = live && live.length ? live : ((ITEM_CAT_DEF?.rows ?? []) as CatRow[])
  return useMemo(() => {
    const active = rows.filter((r) => !r.deletedAt)
    const byParent: Record<string, string[]> = {}
    const parentFor: Record<string, string> = {}
    for (const r of active) {
      const p = String(r.values?.parentCategory ?? '')
      if (p) {
        ;(byParent[p] ||= []).push(r.name)
        parentFor[r.name] = p
      }
    }
    return { parents: Object.keys(byParent), byParent, parentFor, all: active.map((r) => r.name) }
  }, [rows])
}

/*
 * itemType is required by the backend but is no longer shown on the screen —
 * Category is the single classification. Derive a sensible itemType from the
 * chosen category so the API contract is still satisfied.
 */
const TYPE_FOR_CATEGORY: Record<string, ItemType> = {
  // Product Items
  'Raw Materials': 'RAW_MATERIAL',
  'Components': 'RAW_MATERIAL',
  'Semi-Finished Goods': 'SEMI_FINISHED',
  'Finished Goods': 'FINISHED',
  'Packing Materials': 'PACKING',
  'Production Consumables': 'CONSUMABLE',
  // Company Items
  'Machines & Equipment': 'SPARE',
  'Maintenance Spares': 'SPARE',
  'Office Stationery': 'CONSUMABLE',
  'IT & Electronics': 'SPARE',
  'Furniture & Fixtures': 'SPARE',
  'Housekeeping & Safety': 'CONSUMABLE',
}
const typeForCategory = (cat: string): ItemType => TYPE_FOR_CATEGORY[cat] ?? 'FINISHED'

const UOM_OPTIONS = [
  { value: 'NOS', label: 'Numbers (NOS)' },
  { value: 'KGS', label: 'Kilograms (KGS)' },
  { value: 'MTRS', label: 'Meters (MTRS)' },
  { value: 'LTRS', label: 'Liters (LTRS)' },
  { value: 'BOX', label: 'Boxes (BOX)' },
]

function ItemDetail({ i, onClose, onEdit }: { i: Item; onClose: () => void; onEdit: () => void }) {
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-xl"
      title={`${i.code} — ${i.name}`}
      description={i.category}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="primary" icon={<Pencil className="h-4 w-4" />} onClick={() => { onClose(); onEdit() }}>Edit</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DataGrid
              columns={1}
              items={[
                { label: 'Item code', value: i.code, mono: true },
                { label: 'Item name', value: i.name },
                { label: 'Category', value: i.category },
                { label: 'Base UOM', value: i.baseUom },
                { label: 'Unit price', value: i.sellingPrice ? formatCurrency(i.sellingPrice) : '—' },
                { label: 'Status', value: i.status },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </Drawer>
  )
}

function ItemForm({ s, open, onClose, onSave, fixedParent }: { s?: Item | null; open: boolean; onClose: () => void; onSave: (data: Partial<Item>) => void; fixedParent?: string }) {
  const toast = useToast()

  const cats = useItemCategories()
  const uomOptions = useMasterOptions('UOM')
  const [code, setCode] = useState(s?.code || '')
  const [name, setName] = useState(s?.name || '')
  const [parent, setParent] = useState(fixedParent || '')
  const [category, setCategory] = useState(s?.category || '')
  const [baseUom, setBaseUom] = useState(s?.baseUom || 'NOS')
  const [unitPrice, setUnitPrice] = useState<number | ''>(s?.sellingPrice ?? '')

  useEffect(() => {
    if (open) {
      if (!s) {
        setCode('')
        // Backend returns { nextCode }; keep a `code` fallback for safety.
        api.getNextItemCode().then((res: any) => setCode(res.nextCode || res.code || '')).catch(() => setCode(''))
      } else {
        setCode(s.code)
      }
      setName(s?.name || '')
      setCategory(s?.category || '')
      setParent(s?.category ? cats.parentFor[s.category] ?? fixedParent ?? '' : fixedParent ?? '')
      setBaseUom(s?.baseUom || 'NOS')
      setUnitPrice(s?.sellingPrice ?? '')
    }
  }, [s, open])

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Item name is required')
      return
    }
    if (!category) {
      toast.error('Category is required')
      return
    }
    const shortName = name.trim().substring(0, 50)
    const base = baseUom || 'NOS'
    const price = unitPrice === '' ? 0 : Number(unitPrice)
    if (s) {
      // Preserve the existing itemType on edit; only Category is user-editable.
      onSave({ ...s, code: s.code, name: name.trim(), shortName, category, baseUom: base, purchaseUom: base, salesUom: base, sellingPrice: price })
    } else {
      if (!code.trim()) {
        toast.error('Item code is still generating — please wait a moment and try again.')
        return
      }
      onSave({
        code: code.trim(),
        name: name.trim(),
        shortName,
        itemType: typeForCategory(category),
        category,
        baseUom: base,
        purchaseUom: base,
        salesUom: base,
        sellingPrice: price,
        valuationMethod: 'STANDARD',
        status: 'ACTIVE',
      } as Partial<Item>)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={s ? 'Edit item' : 'New item'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit}>{s ? 'Save changes' : 'Create item'}</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Item code" value={code ?? ''} placeholder={s ? '' : 'Auto-generated'} disabled />
        <Input label="Item name" required value={name ?? ''} onChange={(e) => setName(e.target.value)} placeholder="Vacuum Flask 750 ml - Matte Black" />
        {!fixedParent && (
          <Select
            label="Parent category"
            required
            value={parent}
            onChange={(e) => { setParent(e.target.value); setCategory('') }}
            options={[{ value: '', label: '— select —' }, ...cats.parents.map((p) => ({ value: p, label: p }))]}
          />
        )}
        <Select
          label="Category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={!(fixedParent || parent)}
          options={[{ value: '', label: (fixedParent || parent) ? '— select —' : 'Select a parent first' }, ...(cats.byParent[fixedParent || parent] ?? []).map((c) => ({ value: c, label: c }))]}
        />
        <Select label="Base UOM" value={baseUom} onChange={(e) => setBaseUom(e.target.value)} options={uomOptions.length ? uomOptions : UOM_OPTIONS} />
        <Input label="Unit price" type="number" value={unitPrice === '' ? '' : unitPrice} onChange={(e) => setUnitPrice(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" />
      </div>
    </Modal>
  )
}

export function ItemMasterPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: list = [] } = useQuery({ queryKey: ['items'], queryFn: api.getItems })

  const createMutation = useMutation({
    mutationFn: api.createItem,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['items'] }); setFormOpen(false); toast.success('Item created') },
    onError: (e: any) => toast.error('Failed to create item', e?.message),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Item> }) => api.updateItem(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['items'] }); setFormOpen(false); toast.success('Item updated') },
    onError: (e: any) => toast.error('Failed to update item', e?.message),
  })
  const deleteMutation = useMutation({
    mutationFn: api.deleteItem,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['items'] }); toast.success('Item deleted') },
    onError: () => toast.error('Failed to delete item'),
  })

  const { pathname } = useLocation()
  const group = pathname.includes('company-items') ? 'Company Items' : pathname.includes('product-items') ? 'Product Items' : ''
  const cats = useItemCategories()
  const groupCategories = group ? (cats.byParent[group] ?? []) : cats.all
  const [detail, setDetail] = useState<Item | null>(null)
  const [editTarget, setEditTarget] = useState<Item | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')

  const rows = useMemo(() => {
    let out = list
    if (group) out = out.filter((i) => cats.parentFor[i.category] === group)
    if (categoryFilter) out = out.filter((i) => i.category === categoryFilter)
    return out
  }, [group, categoryFilter, list, cats])

  useEffect(() => { setCategoryFilter('') }, [group])

  const columns: Column<Item>[] = [
    { key: 'sno', header: 'S.no', width: '60px', render: (_, i) => <span className="text-2xs text-fg-subtle">{i + 1}</span> },
    { key: 'code', header: 'Item code', sortable: true, sticky: true, width: '130px', accessor: (i) => i.code, render: (i) => <span className="font-mono text-2xs font-medium text-brand-600">{i.code}</span> },
    { key: 'name', header: 'Item name', sortable: true, width: '260px', accessor: (i) => i.name, render: (i) => <span className="truncate text-xs text-fg">{i.name}</span> },
    { key: 'category', header: 'Category', width: '200px', sortable: true, render: (i) => <span className="truncate text-xs text-fg-muted">{i.category}</span> },
    { key: 'baseUom', header: 'UOM', width: '90px', sortable: true, render: (i) => <span className="text-xs text-fg-muted">{i.baseUom}</span> },
    { key: 'sellingPrice', header: 'Unit price', align: 'right', sortable: true, width: '130px', accessor: (i) => i.sellingPrice ?? 0, render: (i) => i.sellingPrice ? formatCurrency(i.sellingPrice) : <span className="text-2xs text-fg-subtle">—</span> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'items', 'Items', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title={group || 'Items'}
        description={group === 'Company Items'
          ? 'Company operational items — machines, spares, stationery, IT and more.'
          : group === 'Product Items'
            ? 'Items used to make or sell the product.'
            : 'Reference list of items used as a dropdown across the other portals.'}
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }, { label: 'Product Engineering' }, { label: group || 'Items' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => toast.info('Import items')}>
              Import
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditTarget(null); setFormOpen(true) }}>
              New item
            </Button>
          </>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(i) => String(i.id)}
        searchPlaceholder="Code, name or category…"
        pageSize={20}
        onRowClick={setDetail}
        onExport={doExport}
        filterChips={categoryFilter ? [{ key: 'c', label: 'Category', value: categoryFilter, onRemove: () => setCategoryFilter('') }] : []}
        onClearFilters={() => setCategoryFilter('')}
        toolbar={
          <Select
            sizeVariant="sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[{ value: '', label: 'All categories' }, ...groupCategories.map((c) => ({ value: c, label: c }))]}
          />
        }
        rowActions={(i) => (
          <>
            <MenuItem label="View" onClick={() => setDetail(i)} />
            <MenuItem label="Edit" onClick={() => { setEditTarget(i); setFormOpen(true) }} />
            <MenuItem
              label={i.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              danger={i.status === 'ACTIVE'}
              separatorBefore
              onClick={() => updateMutation.mutate({ id: i.id, data: { ...i, status: i.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } })}
            />
            <MenuItem
              label={(i.whereUsed?.length ?? 0) ? `Delete — blocked (${i.whereUsed.length} refs)` : 'Delete'}
              danger
              disabled={(i.whereUsed?.length ?? 0) > 0}
              onClick={() => deleteMutation.mutate(i.id)}
            />
          </>
        )}
      />

      {detail && !formOpen && <ItemDetail i={detail} onClose={() => setDetail(null)} onEdit={() => { setEditTarget(detail); setFormOpen(true) }} />}
      <ItemForm
        s={editTarget}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null) }}
        onSave={(data) => editTarget ? updateMutation.mutate({ id: editTarget.id, data }) : createMutation.mutate(data)}
        fixedParent={group || undefined}
      />
    </div>
  )
}
