import { useMemo, useState } from 'react'
import { PackagePlus, Download, Check, Eye } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItemLookup } from '@/hooks/useItemLookup'
import {
  Section, FieldGrid, Field, LineItemsTable, TotalsPanel, money, qty as fmtQty,
} from '@/components/procurement/ProcKit'
import { getGrns, postGrn } from '@/api/procurement'
import { InvFilterBar, InvSearch } from '@/components/inventory/InvFilterBar'
import { InvDateFilter, type DateRange } from '@/components/inventory/InvDateFilter'

/** A GRN that has already been posted is in the ledger and must never go in twice. */
const isPosted = (grn: any) => String(grn?.status ?? '').toUpperCase() === 'POSTED'

/*
 * Putaway — review a goods receipt, then post it to the stock ledger.
 *
 * The modal previously asked the user to retype a warehouse, a quantity and a
 * rate, and then sent them to the generic /inventory/receipts endpoint. That was
 * wrong twice over. The GRN already carries all three, and posting through the
 * generic endpoint bypasses GrnPostingService — the backend's documented single
 * posting path, which books only *accepted* quantity, routes inspection-gated
 * items to quarantine, rolls the quantities back onto the purchase order and
 * refuses a GRN that is already posted. So this screen now reviews the document
 * and posts it through that path instead of re-keying it beside it.
 */
function AddToStockModal({
  grn,
  onClose,
}: {
  grn: any
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const lookup = useItemLookup()
  const posted = isPosted(grn)

  const post = useMutation({
    mutationFn: () => postGrn(String(grn.uid ?? grn.docNo)),
    onSuccess: (res: any) => {
      const moved = res?.posting?.movements?.length
      toast.success(
        'Posted to stock',
        `${grn.docNo} is in the stock ledger${moved ? ` — ${moved} movement(s)` : ''}.`,
      )
      queryClient.invalidateQueries({ queryKey: ['grns'] })
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      onClose()
    },
    onError: (e: unknown) => {
      if (e instanceof ProblemError) {
        toast.error(e.problem.title || 'Could not post this GRN', e.problem.detail)
      } else {
        toast.error('Could not post this GRN', 'Unknown error.')
      }
    },
  })

  const lines: any[] = grn.lines || []
  // The line is the authority on what was received: its own UOM and rate, not a
  // field guessed off an item master that this screen was reading incorrectly.
  const amountOf = (l: any) =>
    (Number(l.acceptedQty ?? l.receivedQty) || 0) * (Number(l.rate) || 0)
  const subtotal = lines.reduce((a, l) => a + amountOf(l), 0)

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Add to Stock (Putaway)"
      description={`Goods receipt ${grn.docNo} from ${grn.supplierName || 'supplier'}.`}
      size="4xl"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            variant={posted ? 'outline' : 'primary'}
            icon={posted ? <Check className="h-4 w-4 text-success" /> : <PackagePlus className="h-4 w-4" />}
            loading={post.isPending}
            disabled={posted || post.isPending}
            onClick={() => post.mutate()}
          >
            {posted ? 'Added to Stock' : 'Add to Stock'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">


        <Section title="Receipt Details">
          <FieldGrid cols={3}>
            <Field label="GRN Number" mono value={grn.docNo} />
            <Field label="GRN Date" value={grn.docDate ? formatDate(grn.docDate) : null} />
            <Field label="PO Reference" mono value={grn.poNo} />
            <Field label="Supplier" value={grn.supplierName} />
            <Field label="Destination Store" value={grn.warehouse} />
            <Field label="Status" value={grn.status} />
            <Field label="Invoice Number" value={grn.invoiceNo} />
            <Field label="Invoice Date" value={grn.invoiceDate ? formatDate(grn.invoiceDate) : null} />
            <Field label="Received By" value={grn.receivedBy} />
          </FieldGrid>
        </Section>

        <Section title="Items Received">
          <LineItemsTable
            rows={lines}
            empty="This GRN has no lines."
            columns={[
              {
                key: 'itemType', header: 'Type', width: '120px', render: (l: any) =>
                  lookup.itemTypeOf(l.itemCode) || <span className="text-fg-subtle">&mdash;</span>
              },
              {
                key: 'category', header: 'Category', width: '150px', render: (l: any) =>
                  lookup.categoryOf(l.itemCode) || <span className="text-fg-subtle">&mdash;</span>
              },
              {
                key: 'itemName', header: 'Item', render: (l: any) => (
                  <>
                    <span className="font-medium text-fg">{l.itemName || l.itemCode}</span>
                    <span className="block font-mono text-[11px] text-fg-muted">{l.itemCode}</span>
                  </>
                )
              },
              // UOM comes off the receipt line itself.
              {
                key: 'uom', header: 'UOM', align: 'center' as const, width: '70px', render: (l: any) =>
                  l.uom || lookup.uomOf(l.itemCode) || <span className="text-fg-subtle">&mdash;</span>
              },
              { key: 'poQty', header: 'Ordered', align: 'right' as const, width: '90px', render: (l: any) => fmtQty(l.poQty) },
              { key: 'receivedQty', header: 'Received', align: 'right' as const, width: '95px', render: (l: any) => fmtQty(l.receivedQty) },
              // Only accepted quantity becomes stock - the rule the posting
              // service applies, made visible before the user commits to it.
              {
                key: 'acceptedQty', header: 'Accepted', align: 'right' as const, width: '95px', render: (l: any) =>
                  <span className="font-medium text-fg">{fmtQty(l.acceptedQty)}</span>
              },
              {
                key: 'rejectedQty', header: 'Rejected', align: 'right' as const, width: '90px', render: (l: any) =>
                  Number(l.rejectedQty) > 0
                    ? <span className="font-medium text-danger">{fmtQty(l.rejectedQty)}</span>
                    : fmtQty(0)
              },
              { key: 'batchNo', header: 'Batch/Lot', width: '110px' },
              { key: 'rate', header: 'Unit Price', align: 'right' as const, width: '105px', render: (l: any) => money(l.rate) },
              {
                key: 'amount', header: 'Amount', align: 'right' as const, width: '115px', render: (l: any) =>
                  <span className="font-medium text-fg">{money(amountOf(l))}</span>
              },
            ]}
          />
          <TotalsPanel subtotal={subtotal} tax={0} grandTotal={Number(grn.grnValue) || subtotal} />
        </Section>
      </div>
    </Modal>
  )
}

export function GoodsReceiptPage() {
  const companyUid = useSession((s) => s.companyUid)
  const [selectedGrn, setSelectedGrn] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })

  // Fetch pending GRNs
  const grnQuery = useQuery({
    queryKey: ['grns', companyUid],
    queryFn: () => getGrns(),
    enabled: !!companyUid,
  })

  const grns = useMemo(() => {
    if (!grnQuery.data) return []
    let list: any[] = grnQuery.data
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        (r.docNo || '').toLowerCase().includes(q) ||
        (r.supplierName || '').toLowerCase().includes(q) ||
        (r.poNo || '').toLowerCase().includes(q),
      )
    }
    if (dateRange.from) list = list.filter(r => r.docDate >= dateRange.from)
    if (dateRange.to) list = list.filter(r => r.docDate <= dateRange.to)
    return list
  }, [grnQuery.data, search, dateRange])

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.NO', width: '70px', render: (_, i) => <span className="text-fg-muted">{i + 1}</span> },
    { key: 'docDate', header: 'Date', width: '140px', render: (r) => formatDate(r.docDate) },
    { key: 'docNo', header: 'GRN Number', render: (r) => <span className="font-mono text-2xs text-brand-600 font-semibold">{r.docNo}</span> },
    { key: 'supplierName', header: 'Supplier' },
    { key: 'poNo', header: 'PO Reference', render: (r) => <span className="font-mono text-2xs">{r.poNo}</span> },
    {
      key: 'status', header: 'Status', width: '140px',
      render: (r) => {
        const posted = isPosted(r)
        const displayStatus = posted ? 'POSTED' : 'PENDING'
        return (
          <Badge tone={posted ? 'success' : 'warning'} size="sm">
            {displayStatus}
          </Badge>
        )
      },
    },
    {
      // View is always available — a posted receipt is the one you most often
      // need to look at, and disabling the whole cell once it was posted left
      // no way to open it at all. Posting stays a separate, primary action that
      // only appears while there is something to post.
      key: 'action', header: 'Actions', align: 'right', width: '180px', className: 'col-flex',
      render: (r) => {
        const posted = isPosted(r)
        return (
          <div className="flex items-center justify-end gap-1">
            <IconButton
              icon={Eye}
              variant="ghost"
              size="sm"
              title="View receipt details"
              aria-label="View receipt details"
              onClick={() => setSelectedGrn(r)}
            />
            {posted ? (
              <span className="inline-flex items-center gap-1 text-2xs font-medium text-success">
                <Check className="h-3.5 w-3.5" aria-hidden /> In stock
              </span>
            ) : (
              <Button
                size="sm"
                variant="primary"
                icon={<PackagePlus className="w-3 h-3" />}
                onClick={() => setSelectedGrn(r)}
              >
                Add to Stock
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Stock In (GRN)"
        description="Post Goods Receipt Notes to the stock ledger."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock In' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load GRNs.</Alert>}

      {/* Filter bar */}
      <InvFilterBar
        left={<InvSearch value={search} onChange={setSearch} placeholder="Search supplier, GRN, PO…" />}
        right={<InvDateFilter value={dateRange} onChange={setDateRange} />}
      />

      <DataTable
          density="comfortable"
          searchable={false}
          rows={grns}
          columns={columns}
          rowKey={(r) => r.uid || r.docNo}
          loading={grnQuery.isLoading}
          emptyTitle="No GRNs found"
          emptyDescription="No goods receipt notes match your filters."
        />

      {selectedGrn && (
        <AddToStockModal grn={selectedGrn} onClose={() => setSelectedGrn(null)} />
      )}
    </div>
  )
}
