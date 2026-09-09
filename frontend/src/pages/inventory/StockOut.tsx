import { StockTxnPage } from './StockTxnPage'

/** Stock Out — material issued from a store to a department, production or a job.
 *  Posts an OUT movement through the stock engine, which refuses to take a
 *  balance negative and issues at the current moving-average rate. */
export function StockOutPage() {
  return (
    <StockTxnPage
      config={{
        txnType: 'STOCK_OUT',
        title: 'Stock Out',
        description: 'Issue material out of a store. Stock is checked before posting and the ledger records every movement.',
        partyHeader: 'Issued To',
        partyValue: (t) => t.department_name || t.issued_to || '',
        newLabel: 'New Stock Out',
      }}
    />
  )
}

export default StockOutPage
