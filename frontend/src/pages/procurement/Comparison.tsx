import { useState, useEffect } from 'react'
import { CheckCircle2, ChevronRight, Scale } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency } from '@/lib/format'
import * as api from '@/api/procurement'

export function ComparisonPage() {
  const toast = useToast()
  
  const [rfqs, setRfqs] = useState<any[]>([])
  const [selectedRfqNo, setSelectedRfqNo] = useState<string>('')
  
  const [rfqDetails, setRfqDetails] = useState<any>(null)
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [preferredSupplier, setPreferredSupplier] = useState<string>('')
  const [selectionRemarks, setSelectionRemarks] = useState<string>('')

  useEffect(() => {
    // Fetch OPEN RFQs for comparison
    api.getRfqs().then(res => {
      setRfqs(res?.filter((r:any) => r.status === 'OPEN') || [])
    }).catch(console.error)
  }, [])

  const handleRfqSelect = async (rfqNo: string) => {
    setSelectedRfqNo(rfqNo)
    if (!rfqNo) {
      setRfqDetails(null)
      setQuotations([])
      return
    }
    
    setLoading(true)
    try {
      const selectedRfq = rfqs.find(r => r.docNo === rfqNo)
      setRfqDetails(selectedRfq)

      // Fetch quotations and filter for this RFQ
      const quotes = await api.getQuotations()
      const rfqQuotes = quotes.filter((q:any) => q.rfqNo === rfqNo && q.status === 'QUOTED')
      setQuotations(rfqQuotes)
    } catch (err: any) {
      toast.error('Error', 'Failed to load comparison data')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmSelection = async () => {
    if (!preferredSupplier) return toast.error('Validation', 'Please select a preferred supplier')
    if (!selectionRemarks.trim()) return toast.error('Validation', 'Selection remarks are required')

    try {
      // Update RFQ status to COMPLETED and set awardedTo
      await api.updateRfq(rfqDetails.uid, { 
        status: 'COMPLETED',
        awardedTo: preferredSupplier,
        remarks: selectionRemarks
      })

      // The backend should ideally handle updating the quotation statuses, 
      // but in this frontend-heavy fix, we just mark the RFQ complete.
      toast.success('Success', 'Supplier selection confirmed. RFQ Closed.')
      
      // Refresh
      setSelectedRfqNo('')
      setRfqDetails(null)
      setQuotations([])
      
      const res = await api.getRfqs()
      setRfqs(res?.filter((r:any) => r.status === 'OPEN') || [])

    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to confirm selection')
    }
  }

  // Generate Matrix
  // items: array of items from RFQ
  // cols: array of suppliers who quoted
  const items = rfqDetails?.lines || []
  
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Quotation Comparison"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'Comparison' }]}
      />
      <div className="flex-1 overflow-auto p-6 bg-gray-50/50 space-y-6">
        <Card>
          <CardBody className="flex gap-4 items-center">
            <div className="w-96">
                <Select label="Select RFQ to Compare" value={selectedRfqNo} onChange={e => handleRfqSelect(e.target.value)}>
                    <option value="">-- Select RFQ --</option>
                    {rfqs.map(r => <option key={r.docNo} value={r.docNo}>{r.docNo} - {r.title}</option>)}
                </Select>
            </div>
            {loading && <span className="text-fg-muted text-sm mt-6">Loading quotations...</span>}
          </CardBody>
        </Card>

        {rfqDetails && quotations.length === 0 && !loading && (
            <Card>
                <CardBody className="py-12 text-center text-fg-muted">
                    <Scale className="h-12 w-12 mx-auto mb-4 text-border-strong" />
                    <h3 className="text-lg font-medium text-fg">No Quotations Found</h3>
                    <p>There are no active quotations submitted for this RFQ yet.</p>
                </CardBody>
            </Card>
        )}

        {rfqDetails && quotations.length > 0 && (
            <>
                <Card>
                <CardHeader title="Comparison Matrix" description={`Comparing ${quotations.length} supplier(s) for ${rfqDetails.docNo}`} />
                <CardBody className="p-0 overflow-x-auto">
                    <table className="grid-table w-full whitespace-nowrap">
                    <thead>
                        <tr>
                            <th className="bg-surface-2 sticky left-0 z-10 w-64 border-r border-border">Item Details</th>
                            {quotations.map(q => (
                                <th key={q.uid} className="text-center min-w-[200px] border-r border-border">
                                    <div className="font-semibold text-brand-600">{q.supplierName}</div>
                                    <div className="text-xs text-fg-muted font-normal">Quote: {q.docNo}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item: any, idx: number) => {
                            // Find lowest landed rate for this item across all quotes
                            let lowestRate = Infinity
                            quotations.forEach(q => {
                                const qLine = q.lines?.find((l:any) => l.itemCode === item.itemCode)
                                if (qLine && qLine.landedRate < lowestRate && qLine.landedRate > 0) lowestRate = qLine.landedRate
                            })

                            return (
                                <tr key={idx}>
                                    <td className="bg-surface-2 sticky left-0 z-10 border-r border-border">
                                        <div className="font-medium text-fg">{item.itemName}</div>
                                        <div className="text-xs text-fg-muted">Req: {item.qty} {item.uom}</div>
                                    </td>
                                    {quotations.map(q => {
                                        const qLine = q.lines?.find((l:any) => l.itemCode === item.itemCode)
                                        if (!qLine) return <td key={q.uid} className="text-center text-fg-muted border-r border-border">- No Bid -</td>
                                        
                                        const isLowest = qLine.landedRate === lowestRate
                                        
                                        return (
                                            <td key={q.uid} className={`border-r border-border ${isLowest ? 'bg-success/5' : ''}`}>
                                                <div className="flex flex-col items-center">
                                                    <span className={`text-lg font-semibold tabular ${isLowest ? 'text-success' : 'text-fg'}`}>
                                                        {formatCurrency(qLine.landedRate)} <span className="text-xs font-normal text-fg-muted">/ {item.uom}</span>
                                                    </span>
                                                    <span className="text-xs text-fg-muted mt-1">Basic: {formatCurrency(qLine.rate)} | Tax: {qLine.taxPct}%</span>
                                                    {isLowest && <span className="text-[10px] uppercase font-bold text-success mt-1 bg-success/20 px-1.5 py-0.5 rounded">Lowest Price</span>}
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                        {/* Grand Totals */}
                        <tr className="bg-surface-2 border-t-2 border-border">
                            <td className="sticky left-0 z-10 font-bold text-fg border-r border-border text-right pr-4">Grand Total</td>
                            {quotations.map(q => {
                                // Find overall lowest
                                let lowestTotal = Infinity
                                quotations.forEach(qt => { if(qt.landedValue < lowestTotal) lowestTotal = qt.landedValue })
                                const isLowest = q.landedValue === lowestTotal

                                return (
                                    <td key={q.uid} className={`text-center border-r border-border ${isLowest ? 'bg-success/10' : ''}`}>
                                        <div className={`text-xl font-bold ${isLowest ? 'text-success' : 'text-fg'}`}>{formatCurrency(q.landedValue)}</div>
                                        {isLowest && <div className="text-xs font-medium text-success mt-1 flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> Best Overall Value</div>}
                                    </td>
                                )
                            })}
                        </tr>
                    </tbody>
                    </table>
                </CardBody>
                </Card>

                <Card>
                    <CardHeader title="Supplier Selection" />
                    <CardBody className="grid gap-6 md:grid-cols-2">
                        <div>
                            <Select label="Preferred Supplier" value={preferredSupplier} onChange={e => setPreferredSupplier(e.target.value)}>
                                <option value="">-- Select Winner --</option>
                                {quotations.map(q => <option key={q.supplierUid} value={q.supplierUid}>{q.supplierName} ({formatCurrency(q.landedValue)})</option>)}
                            </Select>
                            <p className="text-xs text-fg-muted mt-2">Selecting a supplier will mark this RFQ as complete and enable Purchase Order creation.</p>
                        </div>
                        <div>
                            <Textarea label="Selection Remarks / Justification" rows={3} value={selectionRemarks} onChange={e => setSelectionRemarks(e.target.value)} />
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                            <Button variant="primary" onClick={handleConfirmSelection}>Confirm Selection & Close RFQ <ChevronRight className="w-4 h-4 ml-2" /></Button>
                        </div>
                    </CardBody>
                </Card>
            </>
        )}

      </div>
    </div>
  )
}
