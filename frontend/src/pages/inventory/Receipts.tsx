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
import { InvFilterBar, InvSearch, InvSelect } from '@/components/inventory/InvFilterBar'
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
                key: 'itemName', header: 'Item', width: '16rem', render: (l: any) => (
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
  const [status, setStatus] = useState('')

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
    if (status) list = list.filter(r => (isPosted(r) ? 'POSTED' : 'PENDING') === status)
    if (dateRange.from) list = list.filter(r => r.docDate >= dateRange.from)
    if (dateRange.to) list = list.filter(r => r.docDate <= dateRange.to)
    return list
  }, [grnQuery.data, search, status, dateRange])

  // Line-derived figures. The GRN payload carries its lines, so the counts and
  // totals are computed from the same numbers the detail modal shows — no second
  // source of truth, and no field the API does not actually return.
  const lineCount = (r: any) => (Array.isArray(r.lines) ? r.lines.length : 0)
  const totalQty = (r: any) =>
    (r.lines ?? []).reduce(
      (sum: number, l: any) => sum + (Number(l.acceptedQty ?? l.receivedQty) || 0), 0,
    )
  const totalValue = (r: any) =>
    Number(r.grnValue) ||
    (r.lines ?? []).reduce(
      (sum: number, l: any) =>
        sum + (Number(l.acceptedQty ?? l.receivedQty) || 0) * (Number(l.rate) || 0), 0,
    )

  const columns: Column<any>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'docNo', header: 'Stock In No', width: '155px', sortable: true,
      accessor: (r) => r.docNo ?? '',
      render: (r) => (
        <span className="font-mono text-[13px] font-semibold text-brand-600">{r.docNo ?? '—'}</span>
      ),
    },
    {
      key: 'docDate', header: 'Date', width: '115px', sortable: true,
      accessor: (r) => r.docDate ?? '',
      render: (r) => (
        <span className="text-[13px] tabular-nums">{r.docDate ? formatDate(r.docDate) : '—'}</span>
      ),
    },
    {
      key: 'supplierName', header: 'Supplier', width: '160px',
      accessor: (r) => r.supplierName ?? '',
      render: (r) => (
        <span className="block truncate text-[14px] text-fg" title={r.supplierName ?? ''}>
          {r.supplierName || '—'}
        </span>
      ),
    },
    {
      key: 'poNo', header: 'Reference', width: '160px', defaultHidden: true,
      accessor: (r) => r.poNo ?? '',
      render: (r) => r.poNo
        ? <span className="font-mono text-[12px] text-fg-muted">{r.poNo}</span>
        : <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'warehouse', header: 'Store', width: '145px',
      accessor: (r) => r.warehouse ?? '',
      render: (r) => (
        <span className="block truncate text-[14px] text-fg-muted" title={r.warehouse ?? ''}>
          {r.warehouse || '—'}
        </span>
      ),
    },
    {
      key: 'itemCount', header: 'Items', width: '80px', align: 'right',
      accessor: (r) => lineCount(r),
      render: (r) => <span className="text-[14px] tabular-nums">{lineCount(r)}</span>,
    },
    {
      key: 'totalQty', header: 'Total Qty', width: '110px', align: 'right', sortable: true,
      accessor: (r) => totalQty(r),
      render: (r) => (
        <span className="text-[14px] font-medium tabular-nums text-fg">{fmtQty(totalQty(r))}</span>
      ),
    },
    {
      key: 'totalValue', header: 'Total Value', width: '130px', align: 'right', sortable: true,
      accessor: (r) => totalValue(r),
      render: (r) => (
        <span className="text-[14px] font-semibold tabular-nums text-fg">{money(totalValue(r))}</span>
      ),
    },
    {
      key: 'receivedBy', header: 'Created By', width: '145px', defaultHidden: true,
      accessor: (r) => r.receivedBy ?? '',
      render: (r) => (
        <span className="block truncate text-[13px] text-fg-muted" title={r.receivedBy ?? ''}>
          {r.receivedBy || '—'}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', width: '110px', align: 'center',
      accessor: (r) => (isPosted(r) ? 'POSTED' : 'PENDING'),
      render: (r) => {
        const posted = isPosted(r)
        return (
          <Badge tone={posted ? 'success' : 'warning'} size="sm">
            {posted ? 'POSTED' : 'PENDING'}
          </Badge>
        )
      },
    },
    {
      // View is always available — a posted receipt is the one most often
      // looked at. Posting stays a separate primary action that only appears
      // while there is still something to post.
      key: 'action', header: 'Actions', align: 'center', width: '150px', className: 'col-flex',
      render: (r) => {
        const posted = isPosted(r)
        return (
          <div className="flex items-center justify-center gap-1">
            <IconButton
              icon={Eye}
              variant="ghost"
              size="sm"
              title="View receipt details"
              aria-label={`View receipt ${r.docNo ?? ''}`}
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
                icon={<PackagePlus className="h-3 w-3" />}
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
        left={
          <>
            <InvSearch value={search} onChange={setSearch} placeholder="Search supplier, GRN, PO…" />
            <InvSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'POSTED', label: 'Posted' },
              ]}
            />
          </>
        }
        right={
          <div className="flex items-center gap-2">
            <InvDateFilter value={dateRange} onChange={setDateRange} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setSearch(''); setStatus(''); setDateRange({ from: '', to: '' }) }}
            >
              Clear Filters
            </Button>
          </div>
        }
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
