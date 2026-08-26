import { useMemo, useState } from 'react'
import { ArrowRight, Truck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatQty, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useMovements, useTransfer } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { MovementRow } from '@/api/stock'

/** Stock transfer (SRS Vol 4 Ch 5) — moves material between warehouses as an
 *  OUT at the source + an IN at the destination, at the same rate, so the total
 *  value across warehouses is unchanged (V4-STK-FR-003). */
export function TransfersPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const items = useItems({ active_only: true }).data ?? []
  const warehouses = useWarehouses().data?.data ?? []
  const transfer = useTransfer()
  const listQ = useMovements('TRANSFER_OUT,TRANSFER_IN')
  const movements = listQ.data ?? []

  const [itemUid, setItemUid] = useState('')
  const [fromWh, setFromWh] = useState('')
  const [toWh, setToWh] = useState('')
  const [qty, setQty] = useState('')
  const [batch, setBatch] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const item = useMemo(() => items.find((i) => i.uid === itemUid), [items, itemUid])
  const needsBatch = !!item?.is_batch_tracked

  function submit() {
    setErrors({})
    const fe: Record<string, string> = {}
    if (!itemUid) fe.item = 'Pick an item'
    if (!fromWh) fe.from = 'Pick a source'
    if (!toWh) fe.to = 'Pick a destination'
    if (fromWh && toWh && fromWh === toWh) fe.to = 'Destination must differ'
    if (!qty || Number(qty) <= 0) fe.quantity = 'Quantity must be > 0'
    if (needsBatch && !batch.trim()) fe.batch_no = 'This item is batch-managed'
    if (Object.keys(fe).length) { setErrors(fe); return }

    transfer.mutate(
      { item_uid: itemUid, from_warehouse_uid: fromWh, to_warehouse_uid: toWh, quantity: Number(qty), batch_no: batch.trim() },
      {
        onSuccess: (res: any) => {
          toast.success('Transferred', `${res.document_no} · ${formatQty(res.quantity)} ${res.item_code} ${res.from_warehouse} → ${res.to_warehouse}`)
          setQty(''); setBatch('')
        },
        onError: (e) => {
          if (e instanceof ProblemError) {
            const m: Record<string, string> = {}
            for (const x of e.problem.errors ?? []) m[x.field.replace('to_warehouse_uid', 'to')] = x.message
            setErrors(m)
            toast.error(e.problem.title || 'Transfer failed', e.problem.detail)
          } else toast.error('Transfer failed', 'Unknown error.')
        },
      },
    )
  }

  const columns: Column<MovementRow>[] = [
    { key: 'business_date', header: 'Date', width: '100px', render: (m) => formatDate(m.business_date) },
    { key: 'document_no', header: 'Document', width: '150px', render: (m) => <span className="font-mono text-2xs text-brand-600">{m.document_no}</span> },
    { key: 'item', header: 'Item', render: (m) => <span className="text-xs">{m.item_code}</span> },
    { key: 'dir', header: 'Leg', width: '110px', render: (m) => <span className={m.direction === 'IN' ? 'text-2xs text-success' : 'text-2xs text-danger'}>{m.movement_type === 'TRANSFER_IN' ? 'in →' : 'out ←'} {m.warehouse_code}</span> },
    { key: 'quantity', header: 'Qty', align: 'right', width: '110px', render: (m) => <span className="tabular text-xs">{formatQty(m.quantity)}</span> },
    { key: 'balance_qty_after', header: 'Balance', align: 'right', width: '110px', render: (m) => <span className="tabular text-2xs text-fg-muted">{formatQty(m.balance_qty_after)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Stock transfer"
        description="Move material between warehouses. It leaves the source and arrives at the destination at the same rate — the total inventory value is unchanged."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock transfer' }]} />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader title="Transfer stock" description="OUT at source + IN at destination, atomically." />
          <CardBody className="space-y-3.5">
            <Select label="Item" required value={itemUid} error={errors.item} onChange={(e) => setItemUid(e.target.value)}
              options={[{ value: '', label: 'Select an item…' }, ...items.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))]} />
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <Select label="From" required value={fromWh} error={errors.from} onChange={(e) => setFromWh(e.target.value)}
                options={[{ value: '', label: 'Source…' }, ...warehouses.map((w) => ({ value: w.uid, label: w.code }))]} />
              <ArrowRight className="mb-2.5 h-4 w-4 text-fg-subtle" />
              <Select label="To" required value={toWh} error={errors.to} onChange={(e) => setToWh(e.target.value)}
                options={[{ value: '', label: 'Destination…' }, ...warehouses.map((w) => ({ value: w.uid, label: w.code }))]} />
            </div>
            <Input label={`Quantity${item ? ` (${item.base_uom})` : ''}`} type="number" required value={qty} error={errors.quantity} onChange={(e) => setQty(e.target.value)} />
            {needsBatch && <Input label="Batch number" required value={batch} error={errors.batch_no} onChange={(e) => setBatch(e.target.value)} />}
            <Alert tone="info">Moving material between warehouses never changes its value — it ships at the source moving-average rate.</Alert>
            <Button variant="primary" icon={<Truck className="h-4 w-4" />} loading={transfer.isPending} onClick={submit} className="w-full">Transfer stock</Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent transfers" description="Both legs of each transfer." />
          <CardBody className="p-0">
            <DataTable rows={movements} columns={columns} rowKey={(m) => m.uid} loading={listQ.isLoading}
              searchPlaceholder="Item, document…" emptyTitle="No transfers yet" />
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
