import { useMemo, useState } from 'react'
import { ArrowRight, Truck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatQty } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useTransfer } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'

export function TransfersPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const columns: Column<any>[] = [
    { key: 'date', header: 'Date', width: '120px' },
    { key: 'item', header: 'Item' },
    { key: 'qty', header: 'Quantity' },
    { key: 'from', header: 'From Warehouse' },
    { key: 'to', header: 'To Warehouse' }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader 
        title="Stock transfer" 
        description="Move material from one warehouse/store to another immediately."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Transfers' }]} 
        actions={<Button variant="primary" onClick={() => setModalOpen(true)}>New Transfer</Button>}
      />
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        <DataTable
          rows={[]}
          columns={columns}
          rowKey={(r) => r.id}
          searchPlaceholder="Search transfers…"
          emptyTitle="No recent transfers"
        />
      </div>
      {modalOpen && <TransferModal onClose={() => setModalOpen(false)} />}
    </div>
  )
}

function TransferModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const items = useItems({ active_only: true }).data ?? []
  const warehouses = useWarehouses().data?.data ?? []
  const transfer = useTransfer()

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
          onClose()
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

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Stock transfer"
      description="Move material from one warehouse/store to another immediately. Both sides of the transaction are ledgered atomically."
      size="md"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Truck className="h-4 w-4" />} loading={transfer.isPending} onClick={submit}>Transfer Stock</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}

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
      </div>
    </Modal>
  )
}
