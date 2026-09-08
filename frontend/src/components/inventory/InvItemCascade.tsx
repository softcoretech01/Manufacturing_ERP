import React, { useEffect, useState } from 'react'
import { getItems } from '@/api/masters'

interface ItemData {
  id: number
  code: string
  name: string
  itemType: string
  category: string
  baseUom: string
  standardCost: number
}

interface InvItemCascadeProps {
  selectedItemId?: number
  onSelectItem: (item: ItemData) => void
  disabled?: boolean
}

export const InvItemCascade: React.FC<InvItemCascadeProps> = ({
  selectedItemId,
  onSelectItem,
  disabled = false
}) => {
  const [allItems, setAllItems] = useState<ItemData[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [search, setSearch] = useState('')

  // Load all items once
  useEffect(() => {
    setLoading(true)
    getItems()
      .then((data: any) => {
        const itemsList = Array.isArray(data) ? data : []
        // Sort by name
        itemsList.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        setAllItems(itemsList)
      })
      .catch((err) => console.error('Failed to load items:', err))
      .finally(() => setLoading(false))
  }, [])

  // Handle Item selection change
  const handleItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val) {
      const matched = allItems.find((i) => i.id === parseInt(val))
      if (matched) {
        onSelectItem(matched)
      }
    }
  }

  return (
    <div className="w-full">
      <label className="block text-xs font-semibold text-gray-500 mb-1">Item Name</label>
      <select
        value={selectedItemId || ''}
        onChange={handleItemChange}
        disabled={disabled || loading}
        className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
      >
        <option value="">Select Item</option>
        {allItems.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name} ({i.code})
          </option>
        ))}
      </select>
    </div>
  )
}
export default InvItemCascade

