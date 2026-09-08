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
    if (p === null) return '●●●●'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(p)
  }

  // Columns
  const columns = [
    { header: 'Item Category', accessor: 'category' },
    { header: 'SKU Count', accessor: 'item_count', align: 'center' as const },
    { header: 'Total Receipts (IN)', accessor: 'total_in_qty', render: (row: any) => row.total_in_qty.toFixed(2), align: 'right' as const },
    { header: 'Total Issues (OUT)', accessor: 'total_out_qty', render: (row: any) => row.total_out_qty.toFixed(2), align: 'right' as const },
    { header: 'Current Stock', accessor: 'current_qty', render: (row: any) => row.current_qty.toFixed(2), align: 'right' as const },
    { header: 'Stock Value', accessor: 'total_value', render: (row: any) => formatPrice(row.total_value), align: 'right' as const },
    {
      header: 'Actions',
      accessor: 'actions',
      align: 'center' as const,
      render: (row: any) => (
        <button
          onClick={() => navigate(`/inventory/stock?search=${row.category}`)}
          title="Drill-down to Current Stock"
          className="p-1 hover:bg-gray-100 rounded text-blue-600 transition-colors flex items-center gap-1 text-xs font-semibold"
        >
          <BookOpen className="h-4 w-4" />
          <span>View Stock</span>
        </button>
      )
    }
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
