import React from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { X, Search } from 'lucide-react'

export interface ProcurementToolbarProps {
  search: string
  onSearchChange: (v: string) => void
  dateFrom: string
  onDateFromChange: (v: string) => void
  dateTo: string
  onDateToChange: (v: string) => void
  onReset: () => void
  onSearch?: () => void
}

export function ProcurementToolbar({
  search,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onReset,
  onSearch
}: ProcurementToolbarProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 p-4 border-b border-border bg-surface">
      <div className="flex-1 min-w-[200px] max-w-sm">
        <Input 
          label="Search"
          placeholder="Search..." 
          value={search} 
          onChange={e => onSearchChange(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && onSearch && onSearch()}
        />
      </div>
      <div className="w-40">
        <Input 
          type="date" 
          label="From:"
          value={dateFrom} 
          onChange={e => onDateFromChange(e.target.value)} 
        />
      </div>
      <div className="w-40">
        <Input 
          type="date" 
          label="To:"
          value={dateTo} 
          onChange={e => onDateToChange(e.target.value)} 
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onSearch || (() => {})} className="gap-2">
          <Search className="h-4 w-4" /> Search
        </Button>
        <Button variant="outline" onClick={onReset} className="gap-2">
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  )
}
