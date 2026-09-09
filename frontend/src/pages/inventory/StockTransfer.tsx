import { StockTxnPage } from './StockTxnPage'

/** Stock Transfer — one document, two ledger legs. Posting writes the OUT at the
 *  source and the IN at the destination inside a single database transaction at
 *  the same unit cost, so value is never created or lost in transit and neither
 *  leg can exist without the other. */
export function StockTransferPage() {
  return (
    <StockTxnPage
      config={{
        txnType: 'STOCK_TRANSFER',
        title: 'Stock Transfer',
        description: 'Move material between stores. Both legs post together at the source cost — if either fails, neither is written.',
        partyHeader: 'To Store',
        partyValue: (t) => t.dst_warehouse_name || t.dst_warehouse_code || '',
        newLabel: 'New Stock Transfer',
      }}
    />
  )
}

export default StockTransferPage
