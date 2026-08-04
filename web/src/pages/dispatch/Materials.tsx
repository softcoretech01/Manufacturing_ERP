import { useMemo, useState } from 'react'
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
import { useCrud } from '@/components/crud/CrudKit'
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
import { useCollection } from '@/store/data'
import { packMaterials as seedMaterials, packingOrders as seedPacking } from '@/mock/dispatch'
import type { PackMaterialLine, PackingOrder } from '@/types/dispatch'

/**
 * Packaging material — what a packing order is allowed to consume, what was
 * actually issued and what was actually used. The variance between the standard
 * and the consumption is where packaging waste hides: a label reprinted twice
 * per carton is invisible in a monthly stock count but obvious here.
 */
export function PackMaterialsPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeFreight()
  const seed = useMemo(() => seedMaterials, [])
  const orderSeed = useMemo(() => seedPacking, [])

  const crud = useCrud<PackMaterialLine>({
    key: 'dispatch:pack-material',
    seed,
    entity: 'Material line',
    titleOf: (m) => `${m.itemName} on ${m.packingOrderNo}`,
    fields: [
      { name: 'packingOrderNo', label: 'Packing order', required: true },
      { name: 'itemName', label: 'Material', required: true, span: 2 },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: Object.entries(MATERIAL_CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'standardQty', label: 'Standard quantity', type: 'number', required: true, hint: 'What the packing rule says this order needs' },
      { name: 'issuedQty', label: 'Issued quantity', type: 'number' },
      { name: 'consumedQty', label: 'Consumed quantity', type: 'number' },
      { name: 'uom', label: 'Unit', required: true },
      { name: 'unitCost', label: 'Unit cost', type: 'number' },
      { name: 'warehouse', label: 'Issuing store', required: true },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? { issuedOn: null, issuedBy: null, status: 'PENDING' as const, itemCode: 'PKG-NEW' }),
      packingOrderNo: v.packingOrderNo,
      itemName: v.itemName,
      category: v.category as PackMaterialLine['category'],
      standardQty: Number(v.standardQty) || 0,
      issuedQty: Number(v.issuedQty) || 0,
      consumedQty: Number(v.consumedQty) || 0,
      uom: v.uom,
      unitCost: Number(v.unitCost) || 0,
      warehouse: v.warehouse,
    }),
    blockDelete: (m) =>
      m.status === 'CONSUMED'
        ? `${m.itemName} has already been consumed against ${m.packingOrderNo}. The consumption is posted to inventory — it cannot be deleted, only reversed by a material return.`
        : undefined,
  })

  const lines = crud.rows
  const { rows: orders, update: updateOrder } = useCollection<PackingOrder>('dispatch:packing-order', orderSeed)

  const [order, setOrder] = useState('all')
  const [issuing, setIssuing] = useState<PackMaterialLine | null>(null)
  const [issueQty, setIssueQty] = useState('')

  const orderNos = [...new Set(lines.map((l) => l.packingOrderNo))]
  const visible = lines.filter((l) => (order === 'all' ? true : l.packingOrderNo === order))

  const pending = visible.filter((l) => l.status === 'PENDING')
  const totalValue = visible.reduce((s, l) => s + l.consumedQty * l.unitCost, 0)
  const excess = visible.filter((l) => l.consumedQty > l.standardQty)

  /** Consumption against the standard, by category — where the waste is. */
  const byCategory = Object.keys(MATERIAL_CATEGORY_LABEL)
    .map((c) => {
      const group = visible.filter((l) => l.category === c)
      const std = group.reduce((s, l) => s + l.standardQty * l.unitCost, 0)
      const used = group.reduce((s, l) => s + l.consumedQty * l.unitCost, 0)
      return { category: MATERIAL_CATEGORY_LABEL[c], standard: Math.round(std), consumed: Math.round(used), variance: Math.round(used - std) }
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
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Issuing every pending line for an order also clears that order's material gate. */
  function issueAllFor(orderNo: string) {
    const target = lines.filter((l) => l.packingOrderNo === orderNo && l.status === 'PENDING')
    if (!target.length) {
      toast.info('Nothing pending', `Every material line on ${orderNo} has already been issued.`)
      return
    }
    for (const l of target) {
      crud.update(l.uid, {
        issuedQty: l.standardQty,
        status: 'ISSUED',
        issuedOn: new Date().toISOString(),
        issuedBy: 'S. Bhaskar',
      })
    }
    const po = orders.find((o) => o.docNo === orderNo)
    if (po && !po.materialReady) {
      updateOrder(po.uid, { materialReady: true, status: po.status === 'PLANNED' ? 'MATERIAL_READY' : po.status })
      toast.success(
        'Material issued',
        `${target.length} line${target.length === 1 ? '' : 's'} issued and deducted from the packing store. ${orderNo} has cleared its material gate and can start packing.`,
      )
    } else {
      toast.success('Material issued', `${target.length} line${target.length === 1 ? '' : 's'} issued and deducted from the packing store.`)
    }
  }

  return (
    <div>
      <PageHeader
        title="Packaging material"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Packaging material' }]}
        actions={<Button variant="primary" size="sm" onClick={() => crud.openCreate({ uom: 'NOS', warehouse: 'Packing Store', category: 'CARTON' })}>Add a material line</Button>}
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
            Issue everything pending on {order}
          </Button>
        )}
        <p className="text-xs text-fg-muted">
          <span className={cn('font-medium', pending.length ? 'text-warning' : 'text-success')}>{pending.length}</span> line
          {pending.length === 1 ? '' : 's'} still to issue
          {canSeeValue && <>, <span className="font-medium text-fg tabular">{formatCurrency(totalValue)}</span> of material consumed</>}
          {excess.length > 0 && <>, <span className="font-medium text-danger">{excess.length}</span> over the standard</>}.
        </p>
      </div>

      {canSeeValue && byCategory.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Consumption against standard"
            description="Value by category — a bar taller than its standard is packaging money leaking"
          />
          <CardBody className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<DispatchChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="standard" name="Standard" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="consumed" name="Consumed" radius={[3, 3, 0, 0]} maxBarSize={22}>
                  {byCategory.map((c, i) => (
                    <Cell key={i} fill={c.variance > 0 ? '#ef4444' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(m) => m.uid}
        searchPlaceholder="Search material, order or category…"
        onExport={doExport}
        emptyTitle="No material lines"
        rowClassName={(m) => cn(
          m.status === 'PENDING' && 'bg-warning/[0.04]',
          m.consumedQty > m.standardQty && 'bg-danger/[0.03]',
        )}
        rowActions={(m) => (
          <>
            <MenuItem label="Edit the line" onClick={() => crud.openEdit(m)} />
            <MenuItem label="Delete the line" danger onClick={() => crud.askDelete(m)} />
            <MenuItem
              separatorBefore
              label="Issue from the store"
              disabled={m.status !== 'PENDING'}
              onClick={() => { setIssuing(m); setIssueQty(String(m.standardQty)) }}
            />
            <MenuItem
              label="Record consumption"
              disabled={m.status !== 'ISSUED'}
              onClick={() => {
                crud.update(m.uid, { consumedQty: m.issuedQty, status: 'CONSUMED' })
                toast.success('Consumption posted', `${formatQty(m.issuedQty)} ${m.uom} of ${m.itemName} consumed against ${m.packingOrderNo} and written off the packing store.`)
              }}
            />
            <MenuItem
              label="Return the balance to store"
              disabled={m.status !== 'ISSUED' || m.issuedQty <= m.consumedQty}
              onClick={() => {
                const back = m.issuedQty - m.consumedQty
                crud.update(m.uid, { issuedQty: m.consumedQty, status: m.consumedQty > 0 ? 'CONSUMED' : 'RETURNED' })
                toast.success('Balance returned', `${formatQty(back)} ${m.uom} of ${m.itemName} returned to the packing store and back in stock.`)
              }}
            />
          </>
        )}
      />

      <Modal
        open={!!issuing}
        onClose={() => setIssuing(null)}
        title={issuing ? `Issue ${issuing.itemName}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setIssuing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!issuing) return
                const qty = Number(issueQty)
                if (!qty || qty <= 0) {
                  toast.error('Enter a quantity', 'The issue quantity has to be greater than zero.')
                  return
                }
                crud.update(issuing.uid, { issuedQty: qty, status: 'ISSUED', issuedOn: new Date().toISOString(), issuedBy: 'S. Bhaskar' })
                const stillPending = lines.filter((l) => l.packingOrderNo === issuing.packingOrderNo && l.status === 'PENDING' && l.uid !== issuing.uid)
                const po = orders.find((o) => o.docNo === issuing.packingOrderNo)
                if (po && !stillPending.length && !po.materialReady) {
                  updateOrder(po.uid, { materialReady: true, status: po.status === 'PLANNED' ? 'MATERIAL_READY' : po.status })
                }
                toast.success(
                  'Material issued',
                  stillPending.length
                    ? `${formatQty(qty)} ${issuing.uom} issued. ${stillPending.length} line${stillPending.length === 1 ? '' : 's'} still pending on ${issuing.packingOrderNo}.`
                    : `${formatQty(qty)} ${issuing.uom} issued — ${issuing.packingOrderNo} has now cleared its material gate.`,
                )
                setIssuing(null)
              }}
            >
              Issue
            </Button>
          </>
        }
      >
        {issuing && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{issuing.itemName}</p>
              <p className="mt-1 text-fg-muted">
                Standard for this order is <span className="font-medium tabular text-fg">{formatQty(issuing.standardQty)} {issuing.uom}</span>{' '}
                from {issuing.warehouse}
                {canSeeValue && ` · ${formatCurrency(issuing.standardQty * issuing.unitCost)} at standard`}.
              </p>
            </div>
            <Input
              label="Quantity to issue"
              type="number"
              value={issueQty}
              onChange={(e) => setIssueQty(e.target.value)}
              hint="Issuing more than the standard is allowed but shows as a variance on this screen and on the consumption report"
            />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why standard, issued and consumed are three separate columns" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Standard</span> comes from the packing rule — 400 cartons for 4,800 bottles at 12
            per carton. It is the yardstick, not a transaction.
          </p>
          <p>
            <span className="font-medium text-fg">Issued</span> is what physically left the packing store, and it is what reduces
            stock. Issue 450 labels for 400 cartons and the store is 450 down.
          </p>
          <p>
            <span className="font-medium text-fg">Consumed</span> is what went onto product. The gap between issued and consumed
            comes back to store; the gap between consumed and standard is waste worth asking about.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
