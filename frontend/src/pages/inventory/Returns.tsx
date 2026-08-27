import { MovementPage } from './MovementPage'
import { useReturnMaterial } from '@/hooks/useStock'

/** Material return (SRS Vol 4 Ch 4) — IN movement putting unused material back,
 *  at the current moving-average rate (or an entered rate). */
export function MaterialReturnsPage() {
  return (
    <MovementPage
      useHook={useReturnMaterial}
      config={{
        title: 'Material return',
        description: 'Return unused or surplus material to stock. It goes back in at the current moving-average rate unless you enter one.',
        crumb: 'Material return',
        movementTypes: 'RETURN',
        submitLabel: 'Return stock',
        needsRate: true,
        note: 'Returned at the current moving average by default — leave the rate blank.',
      }}
    />
  )
}
