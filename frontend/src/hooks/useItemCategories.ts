import { useMemo } from 'react'
import { SIMPLE_MASTER_BY_CODE } from '@/mock/masterRegistry'
import { useDataStore } from '@/store/data'

/*
 * Single source of truth for Item Categories and their two parents
 * (Product Items / Company Items). Reads the ITEM_CATEGORY master — live rows
 * edited in the Masters portal (persisted in the data store) when present,
 * otherwise the registry seed. Any screen needing the category→parent mapping
 * (Item master, Purchase Requisition, …) must use this rather than re-declaring
 * hardcoded category arrays.
 */
const ITEM_CAT_DEF = SIMPLE_MASTER_BY_CODE['ITEM_CATEGORY']
const ITEM_CAT_KEY = `master:ITEM_CATEGORY${ITEM_CAT_DEF?.seedVersion ? `:v${ITEM_CAT_DEF.seedVersion}` : ''}`

type CatRow = { name: string; values?: Record<string, any>; deletedAt?: string | null }

export interface ItemCategoryMap {
  /** distinct parent names present, e.g. ['Product Items', 'Company Items'] */
  parents: string[]
  /** parent → list of its category names */
  byParent: Record<string, string[]>
  /** category name → its parent name */
  parentFor: Record<string, string>
  /** all active category names */
  all: string[]
}

export function useItemCategories(): ItemCategoryMap {
  const live = useDataStore((s) => s.collections[ITEM_CAT_KEY]) as unknown as CatRow[] | undefined
  const rows: CatRow[] = live && live.length ? live : ((ITEM_CAT_DEF?.rows ?? []) as CatRow[])
  return useMemo(() => {
    const active = rows.filter((r) => !r.deletedAt)
    const byParent: Record<string, string[]> = {}
    const parentFor: Record<string, string> = {}
    for (const r of active) {
      const p = String(r.values?.parentCategory ?? '')
      if (p) {
        ;(byParent[p] ||= []).push(r.name)
        parentFor[r.name] = p
      }
    }
    return { parents: Object.keys(byParent), byParent, parentFor, all: active.map((r) => r.name) }
  }, [rows])
}
