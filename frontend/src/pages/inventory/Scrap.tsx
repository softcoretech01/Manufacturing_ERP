import { MovementPage } from './MovementPage'
import { useScrap } from '@/hooks/useStock'

/** Scrap / write-off (SRS Vol 4 Ch 6) — OUT movement removing damaged, expired
 *  or obsolete stock, with a mandatory reason. */
export function ScrapPage() {
  return (
    <MovementPage
      useHook={useScrap}
      config={{
        title: 'Scrap & write-off',
        description: 'Remove damaged, expired or obsolete stock with a mandatory reason. It leaves at the moving-average rate and is refused if it would go negative.',
        crumb: 'Scrap & write-off',
        movementTypes: 'SCRAP',
        submitLabel: 'Scrap stock',
        needsReason: true,
        reasonLabel: 'Reason (mandatory)',
        reasonContext: 'STOCK_ADJUSTMENT',
      }}
    />
  )
}
