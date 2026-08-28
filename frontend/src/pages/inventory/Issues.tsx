import { MovementPage } from './MovementPage'
import { useIssue } from '@/hooks/useStock'

/** Goods / material issue (SRS Vol 4 Ch 4) — OUT movement at moving average.
 *  The engine refuses to issue more than is on hand (negative-stock refusal). */
export function MaterialIssuePage() {
  return (
    <MovementPage
      useHook={useIssue}
      config={{
        title: 'Goods issue',
        description: 'Issue material out of stock — for production, a department or a job. The engine issues at the moving-average rate and refuses to go below what is on hand.',
        crumb: 'Goods issue',
        movementTypes: 'ISSUE',
        submitLabel: 'Issue stock',
        note: 'Issued at the current moving-average rate. Over-issuing is refused, naming the shortfall.',
      }}
    />
  )
}
