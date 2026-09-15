import { useState, useEffect, useMemo } from 'react'
import { Award, Check, TrendingDown, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import {
  ProcModal, ModalFooter, Section, FieldGrid, Field, EmptyState, money, qty as fmtQty,
} from '@/components/procurement/ProcKit'
import * as api from '@/api/procurement'
import { useItemLookup } from '@/hooks/useItemLookup'

/*
 * Quotation Comparison is an ANALYSIS screen, not a data-entry form.
 *
 * "Save & score" builds a persisted comparison on the backend: it normalises each
 * quotation to a landed cost excluding creditable GST, scores the vendors on
 * price/delivery/quality weights, ranks them, and records the recommendation.
 * Lowest score is a recommendation, never an automatic award — the decision stays
 * with the buyer, and awarding off the recommendation needs a deviation reason.
 */

const DEVIATION_REASONS = ['QUALITY', 'DELIVERY', 'CAPACITY', 'SPECIFICATION', 'CUSTOMER_NOMINATED', 'RISK_DIVERSIFICATION', 'PAYMENT_TERMS', 'OTHER']

interface SupplierColumn {
  quotationUid: string
  quotationNo: string
  supplierName: string
  quotationDate: string
  status: string
  total: number
  byItem: Record<string, { rate: number; taxPct: number; lineTotal: number; qty: number }>
}

export function ComparisonPage() {
  const toast = useToast()
  const lookup = useItemLookup()

  const [rfqs, setRfqs] = useState<any[]>([])
  const [selectedRfqNo, setSelectedRfqNo] = useState('')
  const [rfq, setRfq] = useState<any | null>(null)
  const [quotations, setQuotations] = useState<any[]>([])
  const [comparison, setComparison] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)

  const [awardOpen, setAwardOpen] = useState(false)
  const [awardTarget, setAwardTarget] = useState<SupplierColumn | null>(null)
  const [awardRemarks, setAwardRemarks] = useState('')
  const [deviationReason, setDeviationReason] = useState('')
  const [awarding, setAwarding] = useState(false)

  const [quotedRfqNos, setQuotedRfqNos] = useState<Set<string>>(new Set())

  const loadRfqs = () => {
    Promise.all([api.getRfqs(), api.getQuotations()])
      .then(([r, q]) => {
        setRfqs(r || [])
        setQuotedRfqNos(new Set((q || []).map((x: any) => x.rfqNo).filter(Boolean)))
      })
      .catch(() => toast.error('Error', 'Could not load RFQs for comparison'))
  }

  useEffect(loadRfqs, [])

  const loadComparisonFor = async (rfqNo: string) => {
    try {
      const all = await api.getComparisons()
      const head = (all || []).find((c: any) => c.rfqNo === rfqNo)
      setComparison(head?.uid ? await api.getComparison(String(head.uid)) : null)
    } catch {
      setComparison(null)
    }
  }

  const handleSelectRfq = async (rfqNo: string) => {
    setSelectedRfqNo(rfqNo)
    setRfq(null)
    setQuotations([])
    setComparison(null)
    if (!rfqNo) return

    setLoading(true)
    try {
      const header = rfqs.find(r => r.docNo === rfqNo)
      const full = header?.uid ? await api.getRfq(String(header.uid)) : header
      setRfq(full || header)
      const all = await api.getQuotations()
      setQuotations((all || []).filter((q: any) => q.rfqNo === rfqNo))
      await loadComparisonFor(rfqNo)
    } catch {
      toast.error('Error', 'Could not load the quotations for this RFQ')
    } finally {
      setLoading(false)
    }
  }

  const handleBuild = async () => {
    if (!selectedRfqNo) return
    setBuilding(true)
    try {
      const cmp = await api.buildComparison(selectedRfqNo)
      setComparison(cmp)
      toast.success('Comparison scored', `${cmp.docNo}: ${cmp.recommendedSupplier || 'no vendor'} recommended`)
    } catch (err: any) {
      toast.error('Could not score the comparison', err.message || 'Please try again.')
    } finally {
      setBuilding(false)
    }
  }

  /** Per-quotation score/rank/recommendation from the persisted comparison. */
  const vendorMeta = useMemo(() => {
    const m: Record<string, any> = {}
    for (const v of comparison?.vendors || []) m[String(v.quotationUid)] = v
    return m
  }, [comparison])

  const { items, columns, bestUid } = useMemo(() => {
    const rfqItems: any[] = rfq?.lines || []
    const cols: SupplierColumn[] = quotations.map((q: any) => {
      const byItem: SupplierColumn['byItem'] = {}
      let total = 0
      for (const l of q.lines || []) {
        const qty = Number(l.qty) || 0
        const rate = Number(l.rate) || 0
        const taxPct = Number(l.taxPct) || 0
        const landed = Number(l.landedRate) || rate + rate * (taxPct / 100)
        const lineTotal = qty * landed
        byItem[String(l.itemCode)] = { rate, taxPct, lineTotal, qty }
        total += lineTotal
      }
      return {
        quotationUid: String(q.uid ?? q.id ?? ''),
        quotationNo: q.docNo,
        supplierName: q.supplierName || q.supplierUid,
        quotationDate: q.docDate,
        status: q.status,
        total: Number(q.landedValue) || total,
        byItem,
      }
    })
    const live = cols.filter(c => c.status !== 'REJECTED' && c.total > 0)
    const best = live.length ? live.reduce((a, b) => (b.total < a.total ? b : a)).quotationUid : ''
    return { items: rfqItems, columns: cols, bestUid: best }
  }, [rfq, quotations])

  // The recommendation comes from the scored comparison when it exists, else the
  // cheapest live quote (advisory preview before scoring).
  const recommendedUid = comparison?.recommendedQuotationUid || bestUid
  const awardedUid = comparison?.awardedQuotationUid
  const selected = columns.find(c => c.status === 'SELECTED' || c.status === 'USED')
  const isAwarded = !!awardedUid || !!selected

  const openAward = (col: SupplierColumn) => {
    setAwardTarget(col)
    setAwardRemarks('')
    setDeviationReason('')
    setAwardOpen(true)
  }

  const confirmAward = async () => {
    if (!awardTarget || awarding) return
    const offRec = comparison && String(awardTarget.quotationUid) !== String(recommendedUid)
    if (offRec && !deviationReason) {
      toast.error('Deviation reason required', 'Awarding off the recommended vendor needs a reason code.')
      return
    }
    setAwarding(true)
    try {
      if (comparison) {
        const res: any = await api.awardComparison(String(comparison.uid), awardTarget.quotationUid, deviationReason || undefined, awardRemarks || undefined)
        toast.success('Supplier awarded', `${res.awardedSupplier} awarded on ${comparison.docNo}.`)
      } else {
        const res: any = await api.selectQuotation(awardTarget.quotationUid, awardRemarks)
        toast.success('Supplier selected', `${res.selectedSupplier} awarded ${res.rfqNo}. ${res.rejectedCount} other quotation(s) closed.`)
      }
      setAwardOpen(false)
      await handleSelectRfq(selectedRfqNo)
      loadRfqs()
    } catch (err: any) {
      toast.error('Could not award', err.message || 'Please try again.')
    } finally {
      setAwarding(false)
    }
  }

  const comparableRfqs = rfqs.filter(
    r => quotedRfqNos.has(r.docNo) && r.status !== 'COMPLETED' && r.status !== 'CLOSED'
  )

  return (
    <div className="flex h-full w-full flex-1 flex-col">
      <PageHeader
        title="Quotation Comparison"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Comparison' }]}
      />

      <div className="flex flex-1 flex-col gap-4 bg-surface-2 p-4">
        <Card>
          <CardBody className="flex flex-wrap items-end gap-4">
            <div className="min-w-[320px]">
              <Select label="RFQ to compare" value={selectedRfqNo} onChange={e => handleSelectRfq(e.target.value)}>
                <option value="">Select an RFQ…</option>
                {comparableRfqs.map(r => (
                  <option key={r.docNo} value={r.docNo}>{r.docNo} — {r.title || r.category}</option>
                ))}
              </Select>
            </div>
            {rfq && (
              <>
                <Field label="RFQ Date" value={formatDate(rfq.docDate)} />
                <Field label="Quotations Received" value={String(quotations.length)} />
                <Field label="Status" value={<ProcStatusBadge status={rfq.status} />} />
                {comparison && <Field label="Comparison" value={<span className="font-mono text-xs">{comparison.docNo}</span>} />}
                {columns.length > 0 && !isAwarded && (
                  <Button variant="primary" size="sm" onClick={handleBuild} loading={building} disabled={building}>
                    <Sparkles className="mr-1.5 h-4 w-4" /> {comparison ? 'Re-score' : 'Save & score'}
                  </Button>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {comparison && (
          <Card>
            <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <Field label="Recommendation" value={<span className="font-semibold text-brand-700">{comparison.recommendedSupplier || '—'}</span>} />
              <Field label="Savings vs highest" value={<span className="text-success">{money(comparison.savingsVsHighest)}</span>} />
              <Field label="Weights (P/D/Q)" value={`${comparison.weights?.price ?? 60} / ${comparison.weights?.delivery ?? 25} / ${comparison.weights?.quality ?? 15}`} />
              <Field label="Status" value={<ProcStatusBadge status={comparison.status} />} />
              {comparison.rationale && <div className="w-full text-[12px] text-fg-muted">{comparison.rationale}</div>}
            </CardBody>
          </Card>
        )}

        {!selectedRfqNo && (
          <Card><CardBody>
            <EmptyState message={comparableRfqs.length === 0
              ? 'No RFQ has any supplier quotations yet. Record vendor quotations first.'
              : 'Select an RFQ above to compare the quotations received against it.'} />
          </CardBody></Card>
        )}

        {selectedRfqNo && !loading && columns.length === 0 && (
          <Card><CardBody><EmptyState message="No supplier quotations have been recorded against this RFQ yet." /></CardBody></Card>
        )}

        {columns.length > 0 && (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-surface-2">
                      <th className="w-12 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-fg-muted">#</th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Item</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Required Qty</th>
                      {columns.map(c => {
                        const isRec = c.quotationUid === recommendedUid
                        const isWon = c.quotationUid === awardedUid || c.quotationUid === selected?.quotationUid
                        return (
                          <th key={c.quotationUid} className={`min-w-[150px] px-3 py-3 text-right align-bottom ${isWon ? 'bg-success/10' : isRec ? 'bg-brand-50' : ''}`}>
                            <span className="block text-[13px] font-semibold text-fg">{c.supplierName}</span>
                            <span className="block font-mono text-[11px] font-normal text-fg-muted">{c.quotationNo}</span>
                            <span className="mt-1 block text-[11px] font-normal text-fg-subtle">{formatDate(c.quotationDate)}</span>
                            {isWon ? (
                              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-success"><Check className="h-3 w-3" /> Awarded</span>
                            ) : isRec ? (
                              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600"><TrendingDown className="h-3 w-3" /> {comparison ? 'Recommended' : 'Best price'}</span>
                            ) : null}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any, i: number) => {
                      const rates = columns.map(c => c.byItem[String(it.itemCode)]?.rate).filter((r): r is number => typeof r === 'number' && r > 0)
                      const lowest = rates.length ? Math.min(...rates) : null
                      return (
                        <tr key={i} className="border-t border-border-subtle">
                          <td className="px-3 py-3 text-center text-fg-muted">{i + 1}</td>
                          <td className="px-3 py-3">
                            <span className="font-medium text-fg">{it.itemName}</span>
                            <span className="block text-[11px] text-fg-muted">{[lookup.categoryOf(it.itemCode), it.uom].filter(Boolean).join(' · ')}</span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{fmtQty(it.qty)}</td>
                          {columns.map(c => {
                            const cell = c.byItem[String(it.itemCode)]
                            if (!cell) return <td key={c.quotationUid} className="px-3 py-3 text-right text-fg-subtle">Not quoted</td>
                            const isLowest = lowest !== null && cell.rate === lowest
                            return (
                              <td key={c.quotationUid} className={`px-3 py-3 text-right tabular-nums ${isLowest ? 'bg-brand-50/60' : ''}`}>
                                <span className={`block ${isLowest ? 'font-semibold text-brand-700' : 'text-fg'}`}>{money(cell.rate)}</span>
                                <span className="block text-[11px] text-fg-muted">+{cell.taxPct}% · {money(cell.lineTotal)}</span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}

                    <tr className="border-t-2 border-border bg-surface-2">
                      <td colSpan={3} className="px-3 py-3 text-right text-[13px] font-semibold text-fg">Supplier total (landed)</td>
                      {columns.map(c => (
                        <td key={c.quotationUid} className={`px-3 py-3 text-right text-[14px] font-semibold tabular-nums ${c.quotationUid === recommendedUid ? 'text-brand-700' : 'text-fg'}`}>{money(c.total)}</td>
                      ))}
                    </tr>

                    {comparison && (
                      <>
                        <tr className="border-t border-border">
                          <td colSpan={3} className="px-3 py-3 text-right text-[13px] text-fg-muted">Weighted score</td>
                          {columns.map(c => {
                            const v = vendorMeta[c.quotationUid]
                            return <td key={c.quotationUid} className="px-3 py-3 text-right tabular-nums font-medium text-fg">{v ? Number(v.totalScore).toFixed(1) : '—'}</td>
                          })}
                        </tr>
                        <tr className="border-t border-border-subtle">
                          <td colSpan={3} className="px-3 py-3 text-right text-[13px] text-fg-muted">Rank</td>
                          {columns.map(c => {
                            const v = vendorMeta[c.quotationUid]
                            return <td key={c.quotationUid} className="px-3 py-3 text-right">{v?.rank ? <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded px-1 text-[11px] font-semibold ${v.rank === 1 ? 'bg-brand-100 text-brand-700' : 'bg-surface-3 text-fg-muted'}`}>{v.rank}</span> : <span className="text-fg-subtle">—</span>}</td>
                          })}
                        </tr>
                      </>
                    )}

                    <tr className="border-t border-border">
                      <td colSpan={3} className="px-3 py-3 text-right text-[13px] text-fg-muted">Decision</td>
                      {columns.map(c => (
                        <td key={c.quotationUid} className="px-3 py-3 text-right">
                          {isAwarded ? (
                            (c.quotationUid === awardedUid || c.quotationUid === selected?.quotationUid) ? (
                              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success"><Award className="h-3.5 w-3.5" /> Awarded</span>
                            ) : (
                              <ProcStatusBadge status={c.status} size="sm" />
                            )
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => openAward(c)} disabled={c.status === 'REJECTED'}>Award</Button>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <ProcModal
        open={awardOpen}
        onClose={() => setAwardOpen(false)}
        title="Award supplier"
        subtitle="The other quotations on this RFQ will be closed and the RFQ marked completed."
        footer={
          <ModalFooter onCancel={() => setAwardOpen(false)}>
            <Button variant="primary" onClick={confirmAward} loading={awarding} disabled={awarding}>Confirm award</Button>
          </ModalFooter>
        }
      >
        {awardTarget && (() => {
          const offRec = !!comparison && String(awardTarget.quotationUid) !== String(recommendedUid)
          return (
            <>
              <FieldGrid>
                <Field label="Supplier" value={awardTarget.supplierName} />
                <Field label="Quotation" mono value={awardTarget.quotationNo} />
                <Field label="Landed Value" value={money(awardTarget.total)} />
                <Field label="Position" value={
                  !comparison ? 'Not yet scored'
                    : awardTarget.quotationUid === recommendedUid ? 'Recommended vendor'
                    : `Rank ${vendorMeta[awardTarget.quotationUid]?.rank ?? '—'} — not recommended`} />
              </FieldGrid>
              {offRec && (
                <Select label="Deviation reason (required)" value={deviationReason} onChange={e => setDeviationReason(e.target.value)}>
                  <option value="">Select a reason…</option>
                  {DEVIATION_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </Select>
              )}
              <Textarea
                label={offRec ? 'Justification' : 'Reason for selection (optional)'}
                rows={3}
                value={awardRemarks}
                onChange={e => setAwardRemarks(e.target.value)}
                placeholder={offRec ? 'Explain why this supplier is chosen over the recommendation' : 'Optional'}
              />
            </>
          )
        })()}
      </ProcModal>
    </div>
  )
}
