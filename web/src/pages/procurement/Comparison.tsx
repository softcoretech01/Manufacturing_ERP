import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Award, Download, Printer, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { useCollection } from '@/store/data'
import { quotations as seedQuotations, rfqs as seedRfqs } from '@/mock/procurement'
import { comparableRfqs, MIN_QUOTES_TO_COMPARE, scoreQuotations, type ScoredQuotation } from '@/lib/procFlow'
import type { Rfq, SupplierQuotation } from '@/types/procurement'
import { cn } from '@/lib/cn'

/**
 * Quotation comparison.
 *
 * One table: criteria down the side, vendors across the top, the best value in
 * every row marked. Below it, the recommendation in a sentence and the four
 * things you can do about it. Nothing else — this screen exists to support one
 * decision, and everything that is not that decision was in the way.
 */

const WEIGHTS = { price: 60, delivery: 25, terms: 15 }

/** A comparison row. `better` says which direction wins, or null if it is not scored. */
interface Criterion {
  label: string
  value: (s: ScoredQuotation) => string
  /** Numeric basis for "which is best". Omit for rows that are informational. */
  score?: (s: ScoredQuotation) => number
  better?: 'higher' | 'lower'
  strong?: boolean
}

export function ComparisonPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const qSeed = useMemo(() => seedQuotations, [])
  const { rows: quotations, update: updateQuotation } = useCollection<SupplierQuotation>('proc:sq', qSeed)
  
  const rfqSeed = useMemo(() => seedRfqs, [])
  const { rows: rfqs, update: updateRfq } = useCollection<Rfq>('proc:rfqs', rfqSeed)

  const ready = comparableRfqs(rfqs, quotations)
  const [rfqNo, setRfqNo] = useState('')
  const active = rfqs.find((r) => r.docNo === rfqNo) ?? ready[0]

  const onTable = quotations.filter((q) => q.rfqNo === active?.docNo)
  const scored = useMemo(() => scoreQuotations(onTable, WEIGHTS), [onTable])
  const recommended = scored.find((s) => s.isBestOverall)
  const awarded = onTable.find((q) => q.status === 'AWARDED')

  const [awarding, setAwarding] = useState<ScoredQuotation | null>(null)
  const [reason, setReason] = useState('')

  /* The criteria, in the order a buyer reads them. */
  const criteria: Criterion[] = [
    { label: 'Price (basic)', value: (s) => formatCurrency(s.quotation.basicValue), score: (s) => s.quotation.basicValue, better: 'lower' },
    { label: 'Freight', value: (s) => formatCurrency(s.quotation.freightValue), score: (s) => s.quotation.freightValue, better: 'lower' },
    { label: 'Tax', value: (s) => formatCurrency(s.quotation.taxValue) },
    { label: 'Landed value', value: (s) => formatCurrency(s.quotation.landedValue), score: (s) => s.quotation.landedValue, better: 'lower', strong: true },
    { label: 'Delivery days', value: (s) => `${s.quotation.leadTimeDays} days`, score: (s) => s.quotation.leadTimeDays, better: 'lower' },
    { label: 'Payment terms', value: (s) => s.quotation.paymentTerms },
    { label: 'Warranty', value: (s) => `${s.quotation.warrantyMonths} months`, score: (s) => s.quotation.warrantyMonths, better: 'higher' },
    { label: 'Quotation valid till', value: (s) => formatDate(s.quotation.validTill) },
    { label: 'Score', value: (s) => s.totalScore.toFixed(1), score: (s) => s.totalScore, better: 'higher', strong: true },
  ]

  function bestFor(c: Criterion): number | null {
    if (!c.score || !c.better || !scored.length) return null
    const vals = scored.map(c.score)
    return c.better === 'lower' ? Math.min(...vals) : Math.max(...vals)
  }

  async function confirmAward() {
    if (!awarding || !active) return
    if (!awarding.isBestOverall && !reason.trim()) {
      toast.error('Reason required', 'Selecting a vendor other than the recommended one has to be justified.')
      return
    }

    try {
      onTable.forEach((q) => {
        updateQuotation(q.uid.toString(), {
          status: q.uid === awarding.quotation.uid ? 'AWARDED' : 'REGRETTED',
          rank: scored.find((s) => s.quotation.uid === q.uid)?.rank ?? 0,
          totalScore: Math.round(scored.find((s) => s.quotation.uid === q.uid)?.totalScore ?? 0),
        })
      })

      updateRfq(active.uid.toString(), { 
        status: 'COMPLETED', 
        awardedTo: awarding.quotation.supplierName 
      })

      toast.success('Vendor selected', `${awarding.quotation.supplierName} selected on ${active.docNo}. You can raise the purchase order now.`)
      setAwarding(null)
      setReason('')
    } catch (e) {
      toast.error('Error', 'Failed to update award')
    }
  }

  function doExport(format: ExportFormat) {
    if (!active) return
    const cols = [
      { header: 'Criteria', value: (r: Record<string, string>) => r.criterion },
      ...scored.map((s) => ({
        header: s.quotation.supplierName,
        value: (r: Record<string, string>) => r[s.quotation.uid] ?? '',
      })),
    ]
    const data = criteria.map((c) => {
      const row: Record<string, string> = { criterion: c.label }
      scored.forEach((s) => {
        row[s.quotation.uid] = c.value(s)
      })
      return row
    })
    const n = exportRows(format, `comparison-${active.docNo.replace(/\//g, '-')}`, `Quotation comparison — ${active.docNo}`, cols, data)
    toast.success('Export ready', `${n} criteria written.`)
  }

  return (
    <div>
      <PageHeader
        title="Quotation comparison"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Quotation comparison' }]}
        actions={
          ready.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {ready.length > 1 && (
                <Select
                  value={active?.docNo ?? ''}
                  onChange={(e) => setRfqNo(e.target.value)}
                  sizeVariant="sm"
                  options={ready.map((r) => ({ value: r.docNo, label: `${r.docNo} — ${r.title}` }))}
                />
              )}
              <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => doExport('xlsx')}>
                Export
              </Button>
              <Button size="sm" variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                Print
              </Button>
              {awarded ? (
                <Button size="sm" variant="primary" onClick={() => navigate('/procurement/orders')}>
                  Generate purchase order
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Award className="h-4 w-4" />}
                  disabled={!recommended}
                  onClick={() => {
                    if (recommended) {
                      setAwarding(recommended)
                      setReason('')
                    }
                  }}
                >
                  Select vendor
                </Button>
              )}
            </div>
          )
        }
      />

      {!ready.length ? (
        <Alert tone="info" title="Nothing to compare yet">
          A comparison needs at least {MIN_QUOTES_TO_COMPARE} quotations against the same RFQ. Record them on the{' '}
          <Link to="/procurement/quotations" className="underline">
            Vendor Quotations
          </Link>{' '}
          screen and this table fills itself.
        </Alert>
      ) : !active ? null : (
        <>
          {/* ── Recommendation, stated before the table rather than buried under it ── */}
          {recommended && (
            <Card className="mb-4">
              <div className="flex flex-wrap items-start gap-4 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <Trophy className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Recommended vendor</p>
                  <p className="mt-0.5 text-lg font-semibold text-fg">
                    {awarded ? awarded.supplierName : recommended.quotation.supplierName}
                    {awarded && <Badge tone="success" size="sm" className="ml-2">Selected</Badge>}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                    {recommended.isBestPrice
                      ? `Lowest landed value at ${formatCurrency(recommended.quotation.landedValue)}, and the best overall score.`
                      : `${formatCurrency(recommended.quotation.landedValue)} — ${formatCurrency(
                          recommended.deltaVsBest,
                        )} (${recommended.deltaPct.toFixed(1)}%) above the cheapest quotation, offset by ${
                          recommended.quotation.leadTimeDays
                        } days delivery and ${recommended.quotation.warrantyMonths} months warranty.`}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title={`${active.docNo} — ${active.title}`}
              description={`${onTable.length} quotations · ${active.lines.length} items · requisition ${active.prRefs.join(', ') || '—'}`}
            />

            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface-2" style={{ minWidth: '13rem' }}>
                      Criteria
                    </th>
                    {scored.map((s) => (
                      <th key={s.quotation.uid} className="text-right" style={{ minWidth: '12rem' }}>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs font-semibold text-fg">{s.quotation.supplierName}</span>
                          {s.isBestOverall && <Badge tone="success" size="sm">Recommended</Badge>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((c) => {
                    const best = bestFor(c)
                    return (
                      <tr key={c.label} className={c.strong ? 'bg-surface-2' : undefined}>
                        <td className={cn('sticky left-0 z-10', c.strong ? 'bg-surface-2 text-xs font-semibold text-fg' : 'bg-surface text-xs text-fg-muted')}>
                          {c.label}
                        </td>
                        {scored.map((s) => {
                          const isBest = best !== null && c.score !== undefined && c.score(s) === best
                          return (
                            <td
                              key={s.quotation.uid}
                              className={cn(
                                'text-right tabular text-xs',
                                c.strong && 'text-sm font-semibold',
                                isBest ? 'font-semibold text-success' : 'text-fg',
                              )}
                            >
                              {c.value(s)}
                              {isBest && <span className="ml-1 text-2xs font-normal">best</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}

                  <tr>
                    <td className="sticky left-0 z-10 bg-surface" />
                    {scored.map((s) => (
                      <td key={s.quotation.uid} className="text-right">
                        {s.quotation.status === 'AWARDED' ? (
                          <Badge tone="success" size="sm">Selected</Badge>
                        ) : awarded ? (
                          <span className="text-2xs text-fg-subtle">Not selected</span>
                        ) : (
                          <Button
                            size="xs"
                            variant={s.isBestOverall ? 'success' : 'outline'}
                            onClick={() => {
                              setAwarding(s)
                              setReason('')
                            }}
                          >
                            Select vendor
                          </Button>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── Confirm the selection ── */}
      <Modal
        open={!!awarding}
        onClose={() => setAwarding(null)}
        title="Select this vendor?"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAwarding(null)}>
              Cancel
            </Button>
            <Button variant="success" icon={<Award className="h-4 w-4" />} onClick={confirmAward}>
              Confirm selection
            </Button>
          </>
        }
      >
        {awarding && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg">
              <span className="font-semibold">{awarding.quotation.supplierName}</span> at{' '}
              <span className="font-semibold tabular">{formatCurrency(awarding.quotation.landedValue)}</span> on {active?.docNo}.
            </p>
            {awarding.isBestOverall ? (
              <Alert tone="tip">This is the recommended vendor.</Alert>
            ) : (
              <Alert tone="warning" title="Not the recommended vendor">
                {recommended?.quotation.supplierName} scored {recommended?.totalScore.toFixed(1)} against{' '}
                {awarding.totalScore.toFixed(1)}, at {formatCurrency(recommended?.quotation.landedValue ?? 0)}.
              </Alert>
            )}
            <Textarea
              label="Reason"
              required={!awarding.isBestOverall}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={awarding.isBestOverall ? 'Optional note.' : 'Why this vendor rather than the recommended one.'}
            />
            <p className="text-2xs text-fg-subtle">
              The other quotations are marked not selected and the RFQ closes. The purchase order then picks up these
              rates automatically.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
