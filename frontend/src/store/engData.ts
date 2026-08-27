import { useCollection, type StoredRow } from './data'

export function useEngineeringCollection<T extends StoredRow>(key: string, seed: T[] = []) {
  return useCollection<T>(key, seed)
}
