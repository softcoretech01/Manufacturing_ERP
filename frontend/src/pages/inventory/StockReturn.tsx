import { StockTxnPage } from './StockTxnPage'

/** Stock Return — unused material coming back into a store against the Stock Out
 *  that issued it. The backend caps each line at its returnable quantity, so a
 *  return can never exceed what was issued less what has already come back. */
export function StockReturnPage() {
  return (
    <StockTxnPage
      config={{
        txnType: 'STOCK_RETURN',
        title: 'Stock Return',
        description: 'Return unused material to a store against the Stock Out it was issued on. Return quantity is capped at what remains returnable.',
        partyHeader: 'Against Document',
        partyValue: (t) => t.reference_no || '',
        newLabel: 'New Stock Return',
      }}
    />
  )
}

export default StockReturnPage
