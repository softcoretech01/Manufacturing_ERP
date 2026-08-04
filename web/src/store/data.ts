import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * A working record store for the prototype.
 *
 * Screens used to render straight from the mock arrays, so Save / Edit / Delete
 * could only ever raise a toast. This holds the same data in a mutable,
 * persisted store so those actions genuinely change what is on screen and
 * survive a reload — the behaviour the real API will provide.
 *
 * Deletion is soft, matching the rule that no master or transaction row is ever
 * physically removed.
 */

/**
 * The minimum a stored row must have. Deliberately a type alias rather than an
 * interface with an index signature — an interface without one is not
 * assignable to an indexed type, which would force a cast at every call site.
 */
export type StoredRow = { uid: string; deletedAt?: string | null }

/** Bump when seed data changes shape, so stale local copies are discarded. */
const SEED_VERSION = 7

interface DataState {
  version: number
  collections: Record<string, StoredRow[]>
  seedIfEmpty: (key: string, rows: StoredRow[]) => void
  create: (key: string, row: StoredRow) => void
  update: (key: string, uid: string, patch: Record<string, unknown>) => void
  remove: (key: string, uid: string) => void
  restore: (key: string, uid: string) => void
  reset: (key: string, rows: StoredRow[]) => void
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      version: SEED_VERSION,
      collections: {},

      seedIfEmpty: (key, rows) => {
        if (get().collections[key]) return
        set((s) => ({ collections: { ...s.collections, [key]: rows } }))
      },

      create: (key, row) =>
        set((s) => ({
          collections: { ...s.collections, [key]: [row, ...(s.collections[key] ?? [])] },
        })),

      update: (key, uid, patch) =>
        set((s) => ({
          collections: {
            ...s.collections,
            [key]: (s.collections[key] ?? []).map((r) =>
              r.uid === uid ? { ...r, ...patch, modifiedAt: new Date().toISOString() } : r,
            ),
          },
        })),

      remove: (key, uid) =>
        set((s) => ({
          collections: {
            ...s.collections,
            [key]: (s.collections[key] ?? []).map((r) =>
              r.uid === uid ? { ...r, deletedAt: new Date().toISOString() } : r,
            ),
          },
        })),

      restore: (key, uid) =>
        set((s) => ({
          collections: {
            ...s.collections,
            [key]: (s.collections[key] ?? []).map((r) => (r.uid === uid ? { ...r, deletedAt: null } : r)),
          },
        })),

      reset: (key, rows) => set((s) => ({ collections: { ...s.collections, [key]: rows } })),
    }),
    {
      name: 'ssberp.data',
      version: SEED_VERSION,
      migrate: () => ({ version: SEED_VERSION, collections: {} }) as never,
    },
  ),
)

/** Generates a prototype identifier that sorts by creation time, like a ULID. */
export function newUid(prefix = 'new') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Binds a screen to a named collection. Rows are seeded from the mock data on
 * first use, then owned by the store.
 */
export function useCollection<T extends StoredRow>(key: string, seed: T[]) {
  const seedIfEmpty = useDataStore((s) => s.seedIfEmpty)
  const stored = useDataStore((s) => s.collections[key]) as T[] | undefined

  useEffect(() => {
    seedIfEmpty(key, seed)
  }, [key, seed, seedIfEmpty])

  const all = stored ?? seed
  const rows = all.filter((r) => !r.deletedAt)

  const api = useDataStore.getState()

  return {
    /** Live rows, excluding soft-deleted ones. */
    rows,
    /** Including soft-deleted, for a recycle-bin view. */
    all,
    deletedCount: all.length - rows.length,
    create: (row: T) => api.create(key, row),
    update: (uid: string, patch: Partial<T>) => api.update(key, uid, patch as Record<string, unknown>),
    remove: (uid: string) => api.remove(key, uid),
    restore: (uid: string) => api.restore(key, uid),
    resetToSeed: () => api.reset(key, seed),
  }
}
