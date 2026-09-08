import React, { useState } from 'react'
import { Calendar, RefreshCw, Search, X } from 'lucide-react'
import { useWarehouses } from '@/hooks/useOrganisation'
import { InvStatusBadge } from './InvStatusBadge'

interface Column {
  header: string
  accessor: string
  align?: 'left' | 'center' | 'right'
  render?: (row: any, index: number) => React.ReactNode
}

interface InvTxnListPageProps {
  title: string
  description: string
  rows: any[]
  columns: Column[]
  onNew?: () => void
  onSearch: (params: {
    date_from: string
    date_to: string
    warehouse: string
    search: string
  }) => void
  loading?: boolean
  actionIcon?: React.ReactNode
  actionLabel?: string
}

export const InvTxnListPage: React.FC<InvTxnListPageProps> = ({
  title,
  description,
  rows = [],
  columns = [],
  onNew,
  onSearch,
  loading = false,
  actionIcon,
  actionLabel = "New Document"
}) => {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [search, setSearch] = useState('')

  const { data: warehousesPage } = useWarehouses()
  const warehouses = warehousesPage?.data ?? []

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch({
      date_from: dateFrom,
      date_to: dateTo,
      warehouse,
      search
    })
  }

  const handleClear = () => {
    setDateFrom('')
    setDateTo('')
    setWarehouse('')
    setSearch('')
    onSearch({
      date_from: '',
      date_to: '',
      warehouse: '',
      search: ''
    })
  }

  return (
    <div className="flex flex-col flex-1 gap-4 h-full min-h-[650px] bg-transparent">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        {onNew && (
          <button
            onClick={onNew}
            className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
          >
            {actionIcon || <span>+</span>}
            <span>{actionLabel}</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <form onSubmit={handleApply} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm flex flex-wrap gap-4 items-end">
        {/* Search */}
        <div className="flex-[2] min-w-[220px]">
          <label className="block text-xs font-bold text-gray-500 mb-1">Search</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Search code, document number or remarks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white text-gray-900"
            />
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          </div>
        </div>

        {/* Date From */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-bold text-gray-500 mb-1">Date From</label>
          <div className="relative">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full h-10 pl-3 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white text-gray-900"
            />
          </div>
        </div>

        {/* Date To */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-bold text-gray-500 mb-1">Date To</label>
          <div className="relative">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full h-10 pl-3 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white text-gray-900"
            />
          </div>
        </div>

        {/* Warehouse */}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-bold text-gray-500 mb-1">Store / Warehouse</label>
          <select
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white text-gray-900"
          >
            <option value="">All Stores</option>
            {warehouses.map((w: any) => (
              <option key={w.uid} value={w.uid}>
                {w.code} - {w.name}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 min-w-[180px]">
          <button
            type="submit"
            className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold flex items-center gap-2 transition-colors flex-1 justify-center shadow-sm"
          >
            <span>Apply</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="h-10 px-4 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors justify-center"
          >
            <X className="h-4 w-4" />
            <span>Reset</span>
          </button>
        </div>
      </form>

      {/* Enterprise Data Grid */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px]">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="h-14">
                <th className="px-6 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-[80px]">
                  S.No
                </th>
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className={`px-6 text-xs font-bold text-gray-500 uppercase tracking-wider ${
                      c.align === 'right'
                        ? 'text-right'
                        : c.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {loading ? (
                Array.from({ length: 5 }).map((_, rIdx) => (
                  <tr key={rIdx} className="h-16 animate-pulse border-b border-gray-200">
                    <td className="px-6 text-center">
                      <div className="h-4 bg-gray-200 rounded w-6 mx-auto"></div>
                    </td>
                    {columns.map((_, cIdx) => (
                      <td key={cIdx} className="px-6">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="py-24 text-center text-gray-400 text-sm font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Calendar className="h-8 w-8 text-gray-300" />
                      <span className="font-semibold text-gray-500">No stock transactions found</span>
                      <span className="text-xs text-gray-400 max-w-sm">There are no inventory documents matching the selected filters. Click Reset to see all transactions.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, rIdx) => (
                  <tr key={row.uid || rIdx} className="hover:bg-gray-50/50 transition-colors h-16 border-b border-gray-200">
                    <td className="px-6 text-center text-sm font-bold text-gray-500">
                      {rIdx + 1}
                    </td>
                    {columns.map((c, cIdx) => {
                      const value = row[c.accessor]
                      const alignClass =
                        c.align === 'right'
                          ? 'text-right'
                          : c.align === 'center'
                          ? 'text-center'
                          : 'text-left'

                      return (
                        <td key={cIdx} className={`px-6 text-sm text-gray-900 font-semibold ${alignClass}`}>
                          {c.render ? c.render(row, rIdx) : value ?? '-'}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
export default InvTxnListPage
