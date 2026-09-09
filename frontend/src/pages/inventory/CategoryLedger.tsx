import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { useCategoryLedger } from '@/hooks/useStockTxn'
import { InvTxnListPage } from '@/components/inventory/InvTxnListPage'

export function CategoryLedgerPage() {
  const navigate = useNavigate()

  // Filter State
  const [filters, setFilters] = useState<{
    date_from: string
    date_to: string
    warehouse: string
    search: string
  }>({
    date_from: '',
    date_to: '',
    warehouse: '',
    search: ''
  })

  // List Query
  const { data: rows = [], isLoading } = useCategoryLedger(filters)

  const formatPrice = (p: number | null) => {
    // Masked server-side when the caller lacks INVENTORY.STOCK.VALUE.
    if (p === null) return 'Hidden'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(p)
  }

  const qty = (n: number) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(n) || 0)

  // Columns. Opening + In - Out = Closing, and the backend guarantees that
  // identity, so the row reads as a real ledger line rather than four unrelated
  // aggregates.
  const columns = [
    {
      header: 'S.No', accessor: 'sno', align: 'center' as const,
      render: (_row: any, i: number) => (
        <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>
      ),
    },
    {
      header: 'Category', accessor: 'category',
      render: (row: any) => (
        <span className="text-[14px] font-semibold text-fg">{row.category}</span>
      ),
    },
    {
      header: 'Item Count', accessor: 'item_count', align: 'right' as const,
      render: (row: any) => <span className="tabular-nums">{row.item_count}</span>,
    },
    {
      header: 'Opening Qty', accessor: 'opening_qty', align: 'right' as const,
      render: (row: any) => (
        <span className="tabular-nums text-fg-muted">{qty(row.opening_qty)}</span>
      ),
    },
    {
      header: 'Stock In', accessor: 'total_in_qty', align: 'right' as const,
      render: (row: any) => (
        <span className="tabular-nums font-medium text-success">{qty(row.total_in_qty)}</span>
      ),
    },
    {
      header: 'Stock Out', accessor: 'total_out_qty', align: 'right' as const,
      render: (row: any) => (
        <span className="tabular-nums font-medium text-danger">{qty(row.total_out_qty)}</span>
      ),
    },
    {
      header: 'Closing Qty', accessor: 'current_qty', align: 'right' as const,
      render: (row: any) => (
        <span className="tabular-nums font-bold text-brand-700">{qty(row.current_qty)}</span>
      ),
    },
    {
      header: 'Stock Value', accessor: 'total_value', align: 'right' as const,
      render: (row: any) => (
        <span className="tabular-nums font-semibold text-fg">{formatPrice(row.total_value)}</span>
      ),
    },
    {
      header: 'Actions', accessor: 'actions', align: 'center' as const,
      render: (row: any) => (
        <button
          type="button"
          onClick={() => navigate(`/inventory/stock?item_type=${encodeURIComponent(row.item_type)}`)}
          title={`View current stock for ${row.category}`}
          aria-label={`View current stock for ${row.category}`}
          className="inline-flex items-center gap-1 rounded p-1 text-xs font-semibold text-brand-600 transition-colors hover:bg-surface-2"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          <span>View Stock</span>
        </button>
      ),
    },
  ]

  const handleSearch = (newFilters: any) => {
    setFilters(newFilters)
  }

  return (
    <div className="h-full">
      <InvTxnListPage
        title="Category Ledger"
        description="Aggregate inventory movements and valuations grouped by item categories. Filter by date range or warehouse to audit category changes."
        rows={rows}
        columns={columns}
        onSearch={handleSearch}
        loading={isLoading}
      />
    </div>
  )
}
export default CategoryLedgerPage
