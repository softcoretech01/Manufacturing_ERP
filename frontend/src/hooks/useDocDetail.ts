import { useCallback, useState } from 'react'

/**
 * Loads the full record behind a grid row before View or Edit opens.
 *
 * List endpoints are not guaranteed to carry everything a detail screen needs,
 * and a row can be stale by the time it is clicked. Every View/Edit therefore
 * re-reads the document from its detail endpoint rather than trusting the row
 * it was opened from.
 *
 * The row is shown immediately so the modal never flashes empty, then replaced
 * by the authoritative record. If the detail call fails the row remains — the
 * caller is told via `error` and can surface it, rather than the screen silently
 * showing partial data.
 */
export function useDocDetail<T extends Record<string, any>>(
  fetchOne: (id: string) => Promise<T>,
) {
  const [record, setRecord] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (row: T): Promise<T> => {
      setRecord(row)
      setError(null)
      const id = row?.uid ?? row?.id
      if (id === undefined || id === null || id === '') return row

      setLoading(true)
      try {
        const full = await fetchOne(String(id))
        if (full && typeof full === 'object') {
          setRecord(full)
          return full
        }
        return row
      } catch (err: any) {
        setError(err?.message || 'Could not load the latest version of this document.')
        return row
      } finally {
        setLoading(false)
      }
    },
    [fetchOne],
  )

  const clear = useCallback(() => {
    setRecord(null)
    setError(null)
  }, [])

  return { record, setRecord, loading, error, load, clear }
}
