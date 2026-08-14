import { useMemo, useState } from 'react'
import { PackagePlus, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatQty, formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useReceive } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { ReceiptResult } from '@/api/stock'

/**
 * Goods receipt (SRS Vol 4 Ch 3) — the entry point that puts stock in. It
 * allocates a GRN number from the Numbering engine and posts an IN movement
 * through the stock engine at the entered rate (moving average updates itself).
 */
export function GoodsReceiptPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const itemsQ = useItems({ active_only: true })
  const items = itemsQ.data ?? []
  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  const receive = useReceive()

  const [itemUid, setItemUid] = useState('')
  const [warehouseUid, setWarehouseUid] = useState('')
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [batch, setBatch] = useState('')
  const [supplier, setSupplier] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [recent, setRecent] = useState<ReceiptResult[]>([])

  const item = useMemo(() => items.find((i) => i.uid === itemUid), [items, itemUid])
  const needsBatch = !!item?.is_batch_tracked

  function submit() {
    setErrors({})
    const fe: Record<string, string> = {}
    if (!itemUid) fe.item = 'Pick an item'
    if (!warehouseUid) fe.warehouse = 'Pick a warehouse'
    if (!qty || Number(qty) <= 0) fe.quantity = 'Quantity must be > 0'
    if (rate === '' || Number(rate) < 0) fe.rate = 'Enter a rate'
    if (needsBatch && !batch.trim()) fe.batch_no = 'This item is batch-managed'
    if (Object.keys(fe).length) { setErrors(fe); return }

    receive.mutate(
      {
        item_uid: itemUid, warehouse_uid: warehouseUid, quantity: Number(qty), rate: Number(rate),
        batch_no: batch.trim(), supplier_label: supplier.trim() || null,
      },
      {
        onSuccess: (res) => {
          toast.success('Received', `${res.document_no} — ${formatQty(res.quantity)} ${item?.base_uom ?? ''} of ${res.item_code}`)
          setRecent((r) => [res, ...r].slice(0, 8))
          setQty(''); setRate(''); setBatch('')
        },
        onError: (e) => {
          if (e instanceof ProblemError) {
            const m: Record<string, string> = {}
            for (const x of e.problem.errors ?? []) m[x.field] = x.message
            setErrors(m)
            toast.error(e.problem.title || 'Receipt failed', e.problem.detail)
          } else toast.error('Receipt failed', 'Unknown error.')
        },
      },
    )
  }

  return (
    <div>
      <PageHeader
        title="Goods receipt"
        description="Bring stock in. A GRN number is issued by the numbering engine and the stock engine posts the movement — on-hand and moving-average value update immediately."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Goods receipt' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}

      <div className="grid gap-4 lg:grid-cols-[440px_1fr]">
        <Card>
          <CardHeader title="Receive stock" description="Posts one IN movement at moving-average valuation." />
          <CardBody className="space-y-3.5">
            <Select label="Item" required value={itemUid} error={errors.item} onChange={(e) => setItemUid(e.target.value)}
              options={[{ value: '', label: 'Select an item…' }, ...items.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))]} />
            <Select label="Warehouse" required value={warehouseUid} error={errors.warehouse} onChange={(e) => setWarehouseUid(e.target.value)}
              options={[{ value: '', label: 'Select a warehouse…' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={`Quantity${item ? ` (${item.base_uom})` : ''}`} type="number" required value={qty} error={errors.quantity} onChange={(e) => setQty(e.target.value)} />
              <Input label="Rate (₹/unit)" type="number" required value={rate} error={errors.rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            {needsBatch && (
              <Input label="Batch number" required value={batch} error={errors.batch_no} onChange={(e) => setBatch(e.target.value)} hint="This item is batch-managed." />
            )}
            <Input label="Supplier / reference (optional)" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Jindal Steel — GRN against PO…" />
            {item && (
              <p className="text-2xs text-fg-subtle">
                Receipt lands as <Badge tone={item.default_receipt_status === 'AVAILABLE' ? 'success' : 'warning'} size="sm">{item.default_receipt_status.toLowerCase()}</Badge>
                {qty && rate && <> · value {formatCurrency(Number(qty) * Number(rate))}</>}
              </p>
            )}
            <Button variant="primary" icon={<PackagePlus className="h-4 w-4" />} loading={receive.isPending} onClick={submit} className="w-full">
              Receive stock
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Received this session" description="Each posts a real GRN + stock movement." />
          <CardBody>
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-subtle">Receipts you post appear here with their GRN number and the resulting balance.</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 rounded border border-border bg-surface-2 p-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"><Check className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-fg"><span className="font-mono text-brand-600">{r.document_no}</span> · {r.item_code}</p>
                      <p className="truncate text-2xs text-fg-muted">+{formatQty(r.quantity)} @ {formatCurrency(r.rate)} into {r.warehouse_code} → on-hand {formatQty(r.balance_qty_after)} @ avg {formatCurrency(r.balance_rate_after)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
