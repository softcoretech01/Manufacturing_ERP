import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { StoredRow } from './data'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

const endpointMap: Record<string, string> = {
  'eng:products': '/engineering/products',
  'eng:boms': '/engineering/boms',
  'eng:routings': '/engineering/routings',
  'eng:workcentres': '/engineering/workcentres',
  'eng:tools': '/engineering/tools',
  'eng:changes': '/engineering/changes',
  'eng:documents': '/engineering/documents',
  'eng:operations': '/engineering/operations',
}

export function useEngineeringCollection<T extends StoredRow>(key: string, seed: T[] = []) {
  const queryClient = useQueryClient()
  const endpoint = endpointMap[key]

  if (!endpoint) {
    throw new Error(`useEngineeringCollection: Unknown key ${key}`)
  }

  const { data = [], isLoading } = useQuery<T[]>({
    queryKey: [key],
    queryFn: async () => {
      const res = await fetch(`${API_URL}${endpoint}`)
      if (!res.ok) throw new Error(`Failed to fetch ${key}`)
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (row: T) => {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      })
      if (!res.ok) throw new Error(`Failed to create ${key}`)
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [key] }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ uid, patch }: { uid: string; patch: Record<string, unknown> }) => {
      const res = await fetch(`${API_URL}${endpoint}/${uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`Failed to update ${key}`)
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [key] }),
  })

  const removeMutation = useMutation({
    mutationFn: async (uid: string) => {
      const res = await fetch(`${API_URL}${endpoint}/${uid}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to remove ${key}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [key] }),
  })

  // For compatibility with useCollection
  const all = data
  const rows = all.filter((r: any) => !r.deletedAt)

  return {
    rows,
    all,
    deletedCount: all.length - rows.length,
    create: (row: T) => createMutation.mutateAsync(row),
    update: (uid: string, patch: Partial<T>) => updateMutation.mutateAsync({ uid, patch: patch as Record<string, unknown> }),
    remove: (uid: string) => removeMutation.mutateAsync(uid),
    restore: (uid: string) => {}, // Not supported by REST typically unless soft delete
    resetToSeed: () => {}, // Not applicable for REST
    isLoading,
  }
}
