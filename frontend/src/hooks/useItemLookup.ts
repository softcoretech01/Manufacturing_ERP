import { useEffect, useMemo, useState } from 'react'
import { getItems } from '@/api/masters'
import { useItemCategories } from './useItemCategories'

/**
 * Resolves a procurement line's item code back to its master record.
 *
 * Transaction lines store only the item code, name, UOM and quantity — the
 * category and price live on the Item master. Every screen that shows a line
 * needs the same lookup, so it lives here once: pass an item code, get the
 * category, its parent (Product / Company Items), and the suggested price.
 */
export function useItemLookup() {
  const [items, setItems] = useState<any[]>([])
  const cats = useItemCategories()

  useEffect(() => {
    let alive = true
    getItems()
      .then((rows) => { if (alive) setItems(rows || []) })
      .catch(() => { /* screens surface their own load errors */ })
    return () => { alive = false }
  }, [])

  return useMemo(() => {
    const byCode = new Map<string, any>()
    for (const i of items) {
      if (i?.code) byCode.set(String(i.code), i)
      if (i?.id !== undefined) byCode.set(String(i.id), i)
      if (i?.uid) byCode.set(String(i.uid), i)
    }

    const itemOf = (code: any) => byCode.get(String(code ?? ''))

    return {
      items,
      itemOf,
      /** Item category, e.g. "Office Stationery". */
      categoryOf: (code: any): string => itemOf(code)?.category || '',
      /** Category's parent — "Product Items" or "Company Items". */
      itemTypeOf: (code: any): string => {
        const c = itemOf(code)?.category
        return c ? cats.parentFor[c] || '' : ''
      },
      /** Suggested unit price from the master, in order of business preference. */
      priceOf: (code: any): number => {
        const i = itemOf(code)
        return i ? Number(i.lastPurchaseRate || i.standardCost || i.sellingPrice || 0) : 0
      },
      uomOf: (code: any): string => itemOf(code)?.purchaseUom || itemOf(code)?.baseUom || '',
    }
  }, [items, cats])
}
