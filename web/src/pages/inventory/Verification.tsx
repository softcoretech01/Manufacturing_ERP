import { CountWorkspace } from './CountWorkspace'

/** Physical verification (SRS Vol 4 Ch 8) — a full stocktake of a warehouse.
 *  Same blind-count engine as cycle count, typed FULL. */
export function PhysicalVerificationPage() {
  return (
    <CountWorkspace config={{
      title: 'Physical verification',
      description: 'A full physical stocktake of a warehouse at a cut-off. Blind counting like a cycle count, but covering the whole warehouse for the auditor statement.',
      crumb: 'Physical verification',
      countType: 'FULL',
      mode: 'count',
    }} />
  )
}
