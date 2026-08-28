import { useMemo, useState, type ReactNode } from 'react'
import { type UseMutationResult } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatQty } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
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
  reasonLabel?: string
  note?: ReactNode
}

export function MovementModal({
  config,
  useHook,
  onClose,
}: {
  config: MovementConfig
  useHook: () => UseMutationResult<MovementResult, unknown, Record<string, unknown>>
  onClose: () => void
}) {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const itemsQ = useItems({ active_only: true })
  const items = itemsQ.data ?? []
  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  const mutation = useHook()

  const [itemUid, setItemUid] = useState('')
  const [warehouseUid, setWarehouseUid] = useState('')
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [reason, setReason] = useState('')
  const [direction, setDirection] = useState('OUT')
  const [batch, setBatch] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const item = useMemo(() => items.find((i) => i.uid === itemUid), [items, itemUid])
  const needsBatch = !!item?.is_batch_tracked

  function submit() {
    setErrors({})
    const fe: Record<string, string> = {}
    if (!itemUid) fe.item = 'Pick an item'
    if (!warehouseUid) fe.warehouse = 'Pick a warehouse'
    if (!qty || Number(qty) <= 0) fe.quantity = 'Quantity must be > 0'
    if (config.needsReason && !reason.trim()) fe.reason = 'A reason is required'
    if (needsBatch && !batch.trim()) fe.batch_no = 'This item is batch-managed'
    if (Object.keys(fe).length) { setErrors(fe); return }

    const body: Record<string, unknown> = {
      item_uid: itemUid, warehouse_uid: warehouseUid, quantity: Number(qty), batch_no: batch.trim(),
    }
    if (config.needsRate && rate !== '') body.rate = Number(rate)
    if (config.needsReason) body.reason = reason.trim()
    if (config.needsDirection) body.direction = direction

    mutation.mutate(body, {
      onSuccess: (res) => {
        toast.success('Posted', `${res.document_no} · ${res.direction} ${formatQty(res.quantity)} ${item?.base_uom ?? ''} → on-hand ${formatQty(res.balance_qty_after)}`)
        setQty(''); setRate(''); setReason(''); setBatch('')
        onClose()
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

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={config.title}
      description={config.description}
      size="md"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Send className="h-4 w-4" />} loading={mutation.isPending} onClick={submit}>{config.submitLabel}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
        
        <Select label="Warehouse" required value={warehouseUid} error={errors.warehouse} onChange={(e) => setWarehouseUid(e.target.value)}
          options={[{ value: '', label: 'Select a warehouse…' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
        
        <Select label="Item" required value={itemUid} error={errors.item} onChange={(e) => setItemUid(e.target.value)}
          options={[{ value: '', label: 'Select an item…' }, ...items.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))]} />
        
        {config.needsDirection && (
          <Select label="Direction" value={direction} onChange={(e) => setDirection(e.target.value)}
            options={[{ value: 'OUT', label: 'Decrease (write down)' }, { value: 'IN', label: 'Increase (write up)' }]} />
        )}
        
        <div className="grid grid-cols-2 gap-3">
          <Input label={`Quantity${item ? ` (${item.base_uom})` : ''}`} type="number" required value={qty} error={errors.quantity} onChange={(e) => setQty(e.target.value)} />
          {config.needsRate && <Input label="Rate (optional)" type="number" value={rate} onChange={(e) => setRate(e.target.value)} hint="Blank = current avg" />}
        </div>
        
        {needsBatch && <Input label="Batch number" required value={batch} error={errors.batch_no} onChange={(e) => setBatch(e.target.value)} />}
        
        {config.needsReason && <Input label={config.reasonLabel ?? 'Reason'} required value={reason} error={errors.reason} onChange={(e) => setReason(e.target.value)} />}
        
        {config.note && <div className="text-sm text-fg-muted bg-surface-2 p-3 rounded-md mt-4">{config.note}</div>}
      </div>
    </Modal>
  )
}

import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'

export function MovementPage({
  config,
  useHook,
}: {
  config: MovementConfig
  useHook: () => UseMutationResult<MovementResult, unknown, Record<string, unknown>>
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const columns: Column<any>[] = [
    { key: 'date', header: 'Date', width: '120px' },
    { key: 'item', header: 'Item' },
    { key: 'qty', header: 'Quantity' },
    { key: 'status', header: 'Status' }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader 
        title={config.title} 
        description={config.description}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: config.title }]} 
        actions={<Button variant="primary" onClick={() => setModalOpen(true)}>New {config.title}</Button>}
      />
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        <DataTable
          rows={[]}
          columns={columns}
          rowKey={(r) => r.id}
          searchPlaceholder="Search transactions…"
          emptyTitle="No recent transactions"
        />
      </div>
      {modalOpen && <MovementModal config={config} useHook={useHook} onClose={() => setModalOpen(false)} />}
    </div>
  )
}
