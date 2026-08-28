import { useState, useEffect, useMemo } from 'react'
import { Award, Check, TrendingDown } from 'lucide-react'
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
 * Every number on it comes from quotations the suppliers actually submitted —
 * nothing is typed here and no price can be edited. The screen lays the
 * quotations side by side per item, totals each supplier, marks the cheapest as
 * recommended, and lets an authorised buyer award the RFQ. Lowest price is a
 * recommendation, never an automatic award: the decision stays with the user.
 */

interface SupplierColumn {
  quotationUid: string
  quotationNo: string
  supplierName: string
  quotationDate: string
  status: string
  total: number
  /** itemCode -> that supplier's line */
  byItem: Record<string, { rate: number; taxPct: number; lineTotal: number; qty: number }>
}

export function ComparisonPage() {
  const toast = useToast()
  const lookup = useItemLookup()

  const [rfqs, setRfqs] = useState<any[]>([])
  const [selectedRfqNo, setSelectedRfqNo] = useState('')
  const [rfq, setRfq] = useState<any | null>(null)
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [awardOpen, setAwardOpen] = useState(false)
  const [awardTarget, setAwardTarget] = useState<SupplierColumn | null>(null)
  const [awardRemarks, setAwardRemarks] = useState('')
  const [awarding, setAwarding] = useState(false)

  // Only RFQs that actually have quotations are worth comparing.
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

  const handleSelectRfq = async (rfqNo: string) => {
    setSelectedRfqNo(rfqNo)
    setRfq(null)
    setQuotations([])
    if (!rfqNo) return

    setLoading(true)
    try {
      const header = rfqs.find(r => r.docNo === rfqNo)
      const full = header?.uid ? await api.getRfq(String(header.uid)) : header
      setRfq(full || header)

      const all = await api.getQuotations()
      // Every quotation raised against this RFQ, whatever its state — a rejected
      // or already-selected quote is still part of the comparison record.
      setQuotations((all || []).filter((q: any) => q.rfqNo === rfqNo))
    } catch {
      toast.error('Error', 'Could not load the quotations for this RFQ')
    } finally {
      setLoading(false)
    }
  }

  /** Build the comparison matrix: RFQ items down, suppliers across. */
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

    // Cheapest overall wins the recommendation; quotes already rejected are out.
    const live = cols.filter(c => c.status !== 'REJECTED' && c.total > 0)
    const best = live.length
      ? live.reduce((a, b) => (b.total < a.total ? b : a)).quotationUid
      : ''

    return { items: rfqItems, columns: cols, bestUid: best }
  }, [rfq, quotations])

  const selected = columns.find(c => c.status === 'SELECTED' || c.status === 'USED')

  const openAward = (col: SupplierColumn) => {
    setAwardTarget(col)
    setAwardRemarks('')
    setAwardOpen(true)
  }

  const confirmAward = async () => {
    if (!awardTarget) return
    if (awarding) {
      toast.success('Success', 'Already created successfully')
      return
    }
    setAwarding(true)
    try {
      const res: any = await api.selectQuotation(awardTarget.quotationUid, awardRemarks)
      toast.success(
        'Supplier selected',
        `${res.selectedSupplier} awarded ${res.rfqNo}. ${res.rejectedCount} other quotation(s) closed.`,
      )
      setAwardOpen(false)
      await handleSelectRfq(selectedRfqNo)
      loadRfqs()
    } catch (err: any) {
      toast.error('Could not select supplier', err.message || 'Please try again.')
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
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Procurement', to: '/procurement' },
          { label: 'Comparison' },
        ]}
      />

      <div className="flex flex-1 flex-col gap-4 bg-surface-2 p-4">
        <Card>
          <CardBody className="flex flex-wrap items-end gap-4">
            <div className="min-w-[320px]">
              <Select
                label="RFQ to compare"
                value={selectedRfqNo}
                onChange={e => handleSelectRfq(e.target.value)}
              >
                <option value="">Select an RFQ…</option>
                {comparableRfqs.map(r => (
                  <option key={r.docNo} value={r.docNo}>
                    {r.docNo} — {r.title || r.category}
                  </option>
                ))}
              </Select>
            </div>
            {rfq && (
              <>
                <Field label="RFQ Date" value={formatDate(rfq.docDate)} />
                <Field label="Quotations Received" value={String(quotations.length)} />
                <Field label="Status" value={<ProcStatusBadge status={rfq.status} />} />
              </>
            )}
          </CardBody>
        </Card>

        {!selectedRfqNo && (
          <Card>
            <CardBody>
              <EmptyState
                message={
                  comparableRfqs.length === 0
                    ? 'No RFQ has any supplier quotations yet. Record vendor quotations first.'
                    : 'Select an RFQ above to compare the quotations received against it.'
                }
              />
            </CardBody>
          </Card>
        )}

        {selectedRfqNo && !loading && columns.length === 0 && (
          <Card>
            <CardBody>
              <EmptyState message="No supplier quotations have been recorded against this RFQ yet." />
            </CardBody>
          </Card>
        )}

        {columns.length > 0 && (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-surface-2">
                      <th className="w-12 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                        #
                      </th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                        Item
                      </th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                        Required Qty
                      </th>
                      {columns.map(c => {
                        const isBest = c.quotationUid === bestUid
                        const isWon = c.quotationUid === selected?.quotationUid
                        return (
                          <th
                            key={c.quotationUid}
                            className={`min-w-[150px] px-3 py-3 text-right align-bottom ${
                              isWon ? 'bg-success/10' : isBest ? 'bg-brand-50' : ''
                            }`}
                          >
                            <span className="block text-[13px] font-semibold text-fg">
                              {c.supplierName}
                            </span>
                            <span className="block font-mono text-[11px] font-normal text-fg-muted">
                              {c.quotationNo}
                            </span>
                            <span className="mt-1 block text-[11px] font-normal text-fg-subtle">
                              {formatDate(c.quotationDate)}
                            </span>
                            {isWon ? (
                              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                                <Check className="h-3 w-3" /> Selected
                              </span>
                            ) : isBest ? (
                              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600">
                                <TrendingDown className="h-3 w-3" /> Best price
                              </span>
                            ) : null}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any, i: number) => {
                      // Cheapest unit price for this row, so the eye can scan across.
                      const rates = columns
                        .map(c => c.byItem[String(it.itemCode)]?.rate)
                        .filter((r): r is number => typeof r === 'number' && r > 0)
                      const lowest = rates.length ? Math.min(...rates) : null
                      return (
                        <tr key={i} className="border-t border-border-subtle">
                          <td className="px-3 py-3 text-center text-fg-muted">{i + 1}</td>
                          <td className="px-3 py-3">
                            <span className="font-medium text-fg">{it.itemName}</span>
                            <span className="block text-[11px] text-fg-muted">
                              {[lookup.categoryOf(it.itemCode), it.uom].filter(Boolean).join(' · ')}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{fmtQty(it.qty)}</td>
                          {columns.map(c => {
                            const cell = c.byItem[String(it.itemCode)]
                            if (!cell) {
                              return (
                                <td key={c.quotationUid} className="px-3 py-3 text-right text-fg-subtle">
                                  Not quoted
                                </td>
                              )
                            }
                            const isLowest = lowest !== null && cell.rate === lowest
                            return (
                              <td
                                key={c.quotationUid}
                                className={`px-3 py-3 text-right tabular-nums ${
                                  isLowest ? 'bg-brand-50/60' : ''
                                }`}
                              >
                                <span className={`block ${isLowest ? 'font-semibold text-brand-700' : 'text-fg'}`}>
                                  {money(cell.rate)}
                                </span>
                                <span className="block text-[11px] text-fg-muted">
                                  +{cell.taxPct}% · {money(cell.lineTotal)}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}

                    <tr className="border-t-2 border-border bg-surface-2">
                      <td colSpan={3} className="px-3 py-3 text-right text-[13px] font-semibold text-fg">
                        Supplier total
                      </td>
                      {columns.map(c => (
                        <td
                          key={c.quotationUid}
                          className={`px-3 py-3 text-right text-[14px] font-semibold tabular-nums ${
                            c.quotationUid === bestUid ? 'text-brand-700' : 'text-fg'
                          }`}
                        >
                          {money(c.total)}
                        </td>
                      ))}
                    </tr>

                    <tr className="border-t border-border">
                      <td colSpan={3} className="px-3 py-3 text-right text-[13px] text-fg-muted">
                        Decision
                      </td>
                      {columns.map(c => (
                        <td key={c.quotationUid} className="px-3 py-3 text-right">
                          {selected ? (
                            c.quotationUid === selected.quotationUid ? (
                              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success">
                                <Award className="h-3.5 w-3.5" /> Awarded
                              </span>
                            ) : (
                              <ProcStatusBadge status={c.status} size="sm" />
                            )
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => openAward(c)}>
                              Select supplier
                            </Button>
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

        {selected && (
          <Card>
            <CardBody>
              <Section title="Selection">
                <FieldGrid cols={3}>
                  <Field label="Selected Supplier" value={selected.supplierName} />
                  <Field label="Quotation" mono value={selected.quotationNo} />
                  <Field label="Selection Status" value={<ProcStatusBadge status={selected.status} />} />
                  <Field label="Awarded Value" value={money(selected.total)} />
                  <Field label="Awarded On" value={rfq?.modifiedAt ? formatDate(rfq.modifiedAt) : null} />
                  <Field label="RFQ" mono value={rfq?.docNo} />
                </FieldGrid>
              </Section>
            </CardBody>
          </Card>
        )}
      </div>

      <ProcModal
        open={awardOpen}
        onClose={() => setAwardOpen(false)}
        title="Select supplier"
        subtitle="The other quotations on this RFQ will be closed and the RFQ marked completed."
        footer={
          <ModalFooter onCancel={() => setAwardOpen(false)}>
            <Button variant="primary" onClick={confirmAward} loading={awarding} disabled={awarding}>
              Confirm selection
            </Button>
          </ModalFooter>
        }
      >
        {awardTarget && (
          <>
            <FieldGrid>
              <Field label="Supplier" value={awardTarget.supplierName} />
              <Field label="Quotation" mono value={awardTarget.quotationNo} />
              <Field label="Total Value" value={money(awardTarget.total)} />
              <Field
                label="Price position"
                value={
                  awardTarget.quotationUid === bestUid
                    ? 'Lowest quotation'
                    : 'Higher than the lowest quotation'
                }
              />
            </FieldGrid>
            <Textarea
              label="Reason for selection"
              rows={3}
              value={awardRemarks}
              onChange={e => setAwardRemarks(e.target.value)}
              placeholder={
                awardTarget.quotationUid === bestUid
                  ? 'Optional — lowest price'
                  : 'Explain why this supplier is chosen over the lowest quotation'
              }
            />
          </>
        )}
      </ProcModal>
    </div>
  )
}
