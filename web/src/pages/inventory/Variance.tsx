import { CountWorkspace } from './CountWorkspace'

/** Variance approval (SRS Vol 4 Ch 8) — review submitted counts and approve the
 *  variance, which posts reconciling movements through the stock engine. The
 *  approver cannot be the counter (segregation of duties, V4-CNT-FR-013). */
export function VarianceApprovalPage() {
  return (
    <CountWorkspace config={{
      title: 'Variance approval',
      description: 'Review submitted counts, their system-vs-counted variance, and approve — which posts the reconciling adjustments. You cannot approve a count you did yourself.',
      crumb: 'Variance approval',
      mode: 'variance',
    }} />
  )
}
