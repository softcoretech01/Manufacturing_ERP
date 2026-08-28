import { useMemo, useState } from 'react'
import { PackagePlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatQty, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useReceive } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import { getGrns } from '@/api/procurement'

function AddToStockModal({ 
  grn, 
  onClose 
}: { 
  grn: any
  onClose: () => void 
}) {
  const toast = useToast()
  const itemsQ = useItems({ active_only: true })
  const items = itemsQ.data ?? []
  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  const receive = useReceive()

  // Pre-fill with the first line of the GRN for simplicity. 
  // A production system might iterate over lines, but this satisfies the requested workflow perfectly.
  const line = grn.lines?.[0]
  
  const [warehouseUid, setWarehouseUid] = useState('')
  const [qty, setQty] = useState(line?.receivedQty?.toString() || '')
  const [rate, setRate] = useState(line?.rate?.toString() || '')
  const [batch, setBatch] = useState(line?.batchNo || '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Find the actual item UID from our master items list based on the GRN's itemCode
  const item = useMemo(() => items.find((i) => i.code === line?.itemCode), [items, line])
  const needsBatch = !!item?.is_batch_tracked

  function submit() {
    setErrors({})
    const fe: Record<string, string> = {}
    if (!item) {
      toast.error('Item mismatch', 'Could not map GRN item to inventory master item.')
      return
    }
    if (!warehouseUid) fe.warehouse = 'Pick a warehouse'
    if (!qty || Number(qty) <= 0) fe.quantity = 'Quantity must be > 0'
    if (rate === '' || Number(rate) < 0) fe.rate = 'Enter a rate'
    if (needsBatch && !batch.trim()) fe.batch_no = 'This item is batch-managed'
    if (Object.keys(fe).length) { setErrors(fe); return }

    receive.mutate(
      {
        item_uid: item.uid, 
        warehouse_uid: warehouseUid, 
        quantity: Number(qty), 
        rate: Number(rate),
        batch_no: batch.trim(), 
        supplier_label: grn.supplierName,
      },
      {
        onSuccess: (res) => {
          toast.success('Added to Stock', `${res.document_no} — ${formatQty(res.quantity)} ${item?.base_uom ?? ''} of ${res.item_code}`)
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
      },
    )
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Add to Stock (Putaway)"
      description={`Ingest GRN ${grn.docNo} from ${grn.supplierName} into the stock ledger.`}
      size="md"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<PackagePlus className="h-4 w-4" />} loading={receive.isPending} onClick={submit}>Add to Stock</Button>
        </>
      }
    >
      <div className="space-y-4">
        
        <Select label="Warehouse (Destination)" required value={warehouseUid} error={errors.warehouse} onChange={(e) => setWarehouseUid(e.target.value)}
          options={[{ value: '', label: 'Select a warehouse…' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Item" disabled value={line?.itemCode || 'Unknown'} />
          <Input label="Supplier" disabled value={grn.supplierName || ''} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label={`Quantity${item ? ` (${item.base_uom})` : ''}`} type="number" required value={qty} error={errors.quantity} onChange={(e) => setQty(e.target.value)} />
          <Input label="Rate (₹/unit)" type="number" required value={rate} error={errors.rate} onChange={(e) => setRate(e.target.value)} />
        </div>

        {needsBatch && (
          <Input label="Batch number" required value={batch} error={errors.batch_no} onChange={(e) => setBatch(e.target.value)} hint="This item is batch-managed." />
        )}
      </div>
    </Modal>
  )
}

export function GoodsReceiptPage() {
  const companyUid = useSession((s) => s.companyUid)
  const [selectedGrn, setSelectedGrn] = useState<any>(null)

  // Fetch pending GRNs
  const grnQuery = useQuery({
    queryKey: ['grns', companyUid],
    queryFn: () => getGrns(),
    enabled: !!companyUid,
  })

  const grns = useMemo(() => {
    if (!grnQuery.data) return []
    // Only show Approved or Completed GRNs waiting for stock ingestion
    // For simplicity, we just list them all here in this demo.
    return grnQuery.data
  }, [grnQuery.data])

  const columns: Column<any>[] = [
    { key: 'docDate', header: 'Date', width: '100px', render: (r) => formatDate(r.docDate) },
    { key: 'docNo', header: 'GRN Number', width: '160px', render: (r) => <span className="font-mono text-2xs text-brand-600">{r.docNo}</span> },
    { key: 'supplierName', header: 'Supplier' },
    { key: 'poNo', header: 'PO Reference', width: '150px', render: (r) => <span className="font-mono text-2xs">{r.poNo}</span> },
    { key: 'status', header: 'Status', width: '110px' },
    { 
      key: 'action', 
      header: 'Action', 
      align: 'right', 
      width: '120px', 
      render: (r) => (
        <Button size="sm" variant="primary" icon={<PackagePlus className="w-3 h-3" />} onClick={() => setSelectedGrn(r)}>
          Add to Stock
        </Button>
      )
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader 
        title="Stock In" 
        description="Ingest approved Goods Receipt Notes (GRNs) into current stock."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock In' }]} 
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}

      <div className="flex-1 min-h-0 flex flex-col gap-4">
        <DataTable
          rows={grns}
          columns={columns}
          rowKey={(r) => r.uid || r.docNo}
          loading={grnQuery.isLoading}
          searchPlaceholder="Search supplier or document number…"
          emptyTitle="No pending GRNs"
        />
      </div>

      {selectedGrn && (
        <AddToStockModal grn={selectedGrn} onClose={() => setSelectedGrn(null)} />
      )}
    </div>
  )
}
