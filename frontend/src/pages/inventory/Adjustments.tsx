import { MovementPage } from './MovementPage'
import { useAdjust } from '@/hooks/useStock'

/** Stock adjustment (SRS Vol 4 Ch 6) — correct an on-hand quantity up or down.
 *  A reason is mandatory and the movement is ledgered like any other. */
export function AdjustmentsPage() {
  return (
    <MovementPage
      useHook={useAdjust}
      config={{
        title: 'Stock adjustment',
        description: 'Correct an on-hand quantity — up or down — with a mandatory reason. Every adjustment is a ledgered movement, not a silent patch.',
        crumb: 'Stock adjustment',
        movementTypes: 'ADJUST',
        submitLabel: 'Post adjustment',
        needsReason: true,
        needsDirection: true,
        reasonLabel: 'Reason (mandatory)',
        reasonContext: 'STOCK_ADJUSTMENT',
        note: 'A decrease issues at the current moving average; an increase adds at the current rate. Reason is required.',
      }}
    />
  )
}
