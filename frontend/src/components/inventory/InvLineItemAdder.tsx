import React, { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useItemLookup } from '@/hooks/useItemLookup'
import { useItemCategories } from '@/hooks/useItemCategories'
import { StockTxnLine } from '@/api/stockTxn'

interface InvLineItemAdderProps {
  onAdd: (line: StockTxnLine) => void
  disabled?: boolean
  hidePrice?: boolean
}

export const InvLineItemAdder: React.FC<InvLineItemAdderProps> = ({ onAdd, disabled = false, hidePrice = false }) => {
  const { items, priceOf, uomOf } = useItemLookup()
  const cats = useItemCategories()

  const [itemType, setItemType] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [selectedItemId, setSelectedItemId] = useState<string>('')

  const [batchNo, setBatchNo] = useState('')
  const [qty, setQty] = useState<number>(1)
  const [price, setPrice] = useState<number>(0)

  // Filter Categories by Item Type
  const availableCategories = useMemo(() => {
    if (!itemType) return []
    return cats.byParent[itemType] || []
  }, [itemType, cats])

  // Filter Items by Category
  const availableItems = useMemo(() => {
    if (!category) return []
    return items.filter(i => i.category === category)
  }, [category, items])

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemType(e.target.value)
    setCategory('')
    setSelectedItemId('')
  }

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value)
    setSelectedItemId('')
  }

  const handleItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setSelectedItemId(val)
    if (val) {
      // Auto-fill price
      setPrice(priceOf(val))
    } else {
      setPrice(0)
    }
  }

  const matchedItem = useMemo(() => {
    if (!selectedItemId) return null
    return items.find(i => String(i.uid || i.id) === selectedItemId || String(i.code) === selectedItemId)
  }, [selectedItemId, items])

  // Batch is no longer mandatory per user request
  const requiresBatch = false

  const handleAdd = () => {
    if (!matchedItem) return

    onAdd({
      item_id: matchedItem.uid || matchedItem.id,
      item_code: matchedItem.code,
      item_name: matchedItem.name,
      uom: uomOf(matchedItem.code) || matchedItem.baseUom,
      batch_no: batchNo,
      quantity: qty,
      unit_price: price,
      tax_rate: matchedItem.taxRate || 0,
      item_category: matchedItem.category // Needed for grid display, we can cast it if needed or just use useItemLookup
    })

    // Reset fields for quick entry
    setSelectedItemId('')
    setBatchNo('')
    setQty(1)
    setPrice(0)
    // Keep category and type for rapid entry of similar items
  }

  const isValid = selectedItemId && qty > 0 && price >= 0

  return (
    <div className="bg-white border-2 border-slate-200 rounded-lg p-5 space-y-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Item Type *</label>
          <select
            value={itemType}
            onChange={handleTypeChange}
            disabled={disabled}
            className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm bg-slate-50"
          >
            <option value="">Select Type</option>
            <option value="Product Items">Product Items</option>
            <option value="Company Items">Company Items</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Category *</label>
          <select
            value={category}
            onChange={handleCategoryChange}
            disabled={disabled || !itemType}
            className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm bg-slate-50"
          >
            <option value="">Select Category</option>
            {availableCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Item Name *</label>
          <select
            value={selectedItemId}
            onChange={handleItemChange}
            disabled={disabled || !category}
            className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm bg-slate-50"
          >
            <option value="">Select Item</option>
            {availableItems.map(i => (
              <option key={i.uid || i.id} value={i.uid || i.id}>{i.name} ({i.code})</option>
            ))}
          </select>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${hidePrice ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4 items-end`}>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Batch / Lot No {requiresBatch && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            placeholder={requiresBatch ? "Batch is required" : "e.g. BATCH-01"}
            value={batchNo}
            onChange={(e) => setBatchNo(e.target.value)}
            disabled={disabled || !selectedItemId}
            className={`w-full h-10 px-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm bg-white ${
              requiresBatch && !batchNo.trim() ? 'border-red-300 bg-red-50' : 'border-slate-300'
            }`}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Quantity *</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            disabled={disabled || !selectedItemId}
            className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm font-bold bg-white"
          />
        </div>
        {!hidePrice && (
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Unit Price (₹) *</label>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              disabled={disabled || !selectedItemId}
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm font-bold bg-white"
            />
          </div>
        )}
        <div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!isValid || disabled}
            className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold rounded-md flex justify-center items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="h-5 w-5" />
            Add to List
          </button>
        </div>
      </div>
    </div>
  )
}
