import { CountWorkspace } from './CountWorkspace'

/** Cycle count (SRS Vol 4 Ch 8) — blind counting of a warehouse, submitted for
 *  variance approval. */
export function CountingPage() {
  return (
    <CountWorkspace config={{
      title: 'Cycle count',
      description: 'Blind counting of stock, one warehouse at a time. Counters never see the system quantity; variances go to a different user for approval.',
      crumb: 'Cycle count',
      countType: 'CYCLE',
      mode: 'count',
    }} />
  )
}
