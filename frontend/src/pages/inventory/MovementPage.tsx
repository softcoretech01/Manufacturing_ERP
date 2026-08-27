import { useMemo, useState, type ReactNode } from 'react'
import { type UseMutationResult, useQuery } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatQty, formatCurrency, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useMovements } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import { getReasonCodes } from '@/api/masters'
import type { MovementResult, MovementRow } from '@/api/stock'

interface ReasonCode {
  code: string
  name: string
  context?: string
  requiresComment?: boolean
  status?: string
  isDeleted?: boolean
}

/**
 * Shared page for single-location movement transactions (issue / return / adjust
 * / scrap). Each is one posting through the stock engine; this renders the form
 * + a recent-movements list. Transfers have two warehouses and use their own page.
 */
export interface MovementConfig {
  title: string
  description: string
  crumb: string
  movementTypes: string // comma list for the recent-movements filter
  submitLabel: string
  needsRate?: boolean
  needsReason?: boolean
  needsDirection?: boolean
  reasonLabel?: string
  /** Restrict the reason dropdown to reason codes of this context (e.g.
   *  'STOCK_ADJUSTMENT'). When no active code matches, all active codes show. */
  reasonContext?: string
  note?: ReactNode
}

export function MovementPage({
  config,
  useHook,
}: {
  config: MovementConfig
  useHook: () => UseMutationResult<MovementResult, unknown, Record<string, unknown>>
}) {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const itemsQ = useItems({ active_only: true })
  const items = itemsQ.data ?? []
  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  const mutation = useHook()
  const listQ = useMovements(config.movementTypes)
  const movements = listQ.data ?? []

  // Reason codes are a controlled master list (V1: "free text alone cannot be
  // counted"). Load them only when this transaction captures a reason.
  const reasonQ = useQuery({
    queryKey: ['reason-codes', companyUid] as const,
    queryFn: () => getReasonCodes() as Promise<ReasonCode[]>,
    enabled: !!config.needsReason && !!companyUid,
    staleTime: 5 * 60_000,
  })
  const reasonCodes = useMemo(() => {
    const all = (reasonQ.data ?? []).filter(
      (r) => (r.status ?? 'ACTIVE') === 'ACTIVE' && !r.isDeleted,
    )
    if (!config.reasonContext) return all
    const scoped = all.filter((r) => r.context === config.reasonContext)
    // Fall back to the full active list if nothing is configured for this
    // context, so a reason can always be recorded.
    return scoped.length ? scoped : all
  }, [reasonQ.data, config.reasonContext])

  const [itemUid, setItemUid] = useState('')
  const [warehouseUid, setWarehouseUid] = useState('')
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [reason, setReason] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [direction, setDirection] = useState('OUT')
  const [batch, setBatch] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const item = useMemo(() => items.find((i) => i.uid === itemUid), [items, itemUid])
  const needsBatch = !!item?.is_batch_tracked
  const selectedReason = useMemo(() => reasonCodes.find((r) => r.code === reason), [reasonCodes, reason])
  const reasonNeedsNote = !!selectedReason?.requiresComment
  // If the reason-code master is unavailable (endpoint down / not seeded), fall
  // back to a free-text reason so the movement can still be posted.
  const reasonAsText = !reasonQ.isLoading && (reasonQ.isError || reasonCodes.length === 0)

  function submit() {
    setErrors({})
    const fe: Record<string, string> = {}
    if (!itemUid) fe.item = 'Pick an item'
    if (!warehouseUid) fe.warehouse = 'Pick a warehouse'
    if (!qty || Number(qty) <= 0) fe.quantity = 'Quantity must be > 0'
    if (config.needsReason && !reason.trim()) fe.reason = 'Select a reason'
    if (config.needsReason && reasonNeedsNote && !reasonNote.trim()) fe.reason_note = 'This reason needs a comment'
    if (needsBatch && !batch.trim()) fe.batch_no = 'This item is batch-managed'
    if (Object.keys(fe).length) { setErrors(fe); return }

    const body: Record<string, unknown> = {
      item_uid: itemUid, warehouse_uid: warehouseUid, quantity: Number(qty), batch_no: batch.trim(),
    }
    if (config.needsRate && rate !== '') body.rate = Number(rate)
    // Store the controlled reason code; append the mandatory comment when the
    // chosen code requires one, keeping the code prefix for reason analysis.
    if (config.needsReason) body.reason = reasonNeedsNote ? `${reason} — ${reasonNote.trim()}` : reason
    if (config.needsDirection) body.direction = direction

    mutation.mutate(body, {
      onSuccess: (res) => {
        toast.success('Posted', `${res.document_no} · ${res.direction} ${formatQty(res.quantity)} ${item?.base_uom ?? ''} → on-hand ${formatQty(res.balance_qty_after)}`)
        setQty(''); setRate(''); setReason(''); setReasonNote(''); setBatch('')
      },
      onError: (e) => {
        if (e instanceof ProblemError) {
          const m: Record<string, string> = {}
          for (const x of e.problem.errors ?? []) m[x.field] = x.message
          setErrors(m)
          toast.error(e.problem.title || 'Failed', e.problem.detail)
        } else toast.error('Failed', 'Unknown error.')
      },
    })
  }

  const columns: Column<MovementRow>[] = [
    { key: 'business_date', header: 'Date', width: '100px', render: (m) => formatDate(m.business_date) },
    { key: 'document_no', header: 'Document', width: '170px', render: (m) => <span className="font-mono text-2xs text-brand-600">{m.document_no}</span> },
    { key: 'item', header: 'Item', render: (m) => <span className="text-xs">{m.item_code}</span> },
    { key: 'warehouse_code', header: 'WH', width: '90px', render: (m) => <span className="text-2xs text-fg-muted">{m.warehouse_code ?? '—'}</span> },
    { key: 'quantity', header: 'Qty', align: 'right', width: '110px', render: (m) => <span className={m.direction === 'IN' ? 'tabular text-xs text-success' : 'tabular text-xs text-danger'}>{m.direction === 'IN' ? '+' : '−'}{formatQty(m.quantity)}</span> },
    { key: 'balance_qty_after', header: 'Balance', align: 'right', width: '110px', render: (m) => <span className="tabular text-2xs text-fg-muted">{formatQty(m.balance_qty_after)}</span> },
    { key: 'remarks', header: 'Reason / note', render: (m) => <span className="text-2xs text-fg-muted">{m.remarks ?? '—'}</span> },
    { key: 'posted_by_name', header: 'By', width: '130px', render: (m) => <span className="text-2xs text-fg-subtle">{m.posted_by_name ?? '—'}</span> },
  ]

  return (
    <div>
      <PageHeader title={config.title} description={config.description}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: config.crumb }]} />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader title={config.submitLabel} description="Posts through the stock engine." />
          <CardBody className="space-y-3.5">
            <Select label="Item" required value={itemUid} error={errors.item} onChange={(e) => setItemUid(e.target.value)}
              options={[{ value: '', label: 'Select an item…' }, ...items.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))]} />
            <Select label="Warehouse" required value={warehouseUid} error={errors.warehouse} onChange={(e) => setWarehouseUid(e.target.value)}
              options={[{ value: '', label: 'Select a warehouse…' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
            {config.needsDirection && (
              <Select label="Direction" value={direction} onChange={(e) => setDirection(e.target.value)}
                options={[{ value: 'OUT', label: 'Decrease (write down)' }, { value: 'IN', label: 'Increase (write up)' }]} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label={`Quantity${item ? ` (${item.base_uom})` : ''}`} type="number" required value={qty} error={errors.quantity} onChange={(e) => setQty(e.target.value)} />
              {config.needsRate && <Input label="Rate (optional)" type="number" value={rate} onChange={(e) => setRate(e.target.value)} hint="Blank = current avg" />}
            </div>
            {needsBatch && <Input label="Batch number" required value={batch} error={errors.batch_no} onChange={(e) => setBatch(e.target.value)} />}
            {config.needsReason && (reasonAsText ? (
              <Input label={config.reasonLabel ?? 'Reason'} required value={reason} error={errors.reason}
                onChange={(e) => setReason(e.target.value)} hint="Reason-code master unavailable — enter a reason" />
            ) : (
              <Select label={config.reasonLabel ?? 'Reason'} required value={reason} error={errors.reason}
                onChange={(e) => { setReason(e.target.value); setReasonNote('') }}
                hint={reasonQ.isLoading ? 'Loading reason codes…' : undefined}
                options={[{ value: '', label: 'Select a reason…' }, ...reasonCodes.map((r) => ({ value: r.code, label: `${r.code} — ${r.name}` }))]} />
            ))}
            {config.needsReason && !reasonAsText && reasonNeedsNote && (
              <Input label="Reason comment" required value={reasonNote} error={errors.reason_note}
                onChange={(e) => setReasonNote(e.target.value)} hint="This reason code requires a note" />
            )}
            {config.note && <Alert tone="info">{config.note}</Alert>}
            <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={mutation.isPending} onClick={submit} className="w-full">{config.submitLabel}</Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent movements" description="Live from the stock ledger." />
          <CardBody className="p-0">
            <DataTable rows={movements} columns={columns} rowKey={(m) => m.uid} loading={listQ.isLoading}
              searchPlaceholder="Item, document…" emptyTitle="No movements yet" />
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
