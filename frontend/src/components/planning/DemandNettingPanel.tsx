import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { api } from '@/api/client'
import { useSession } from '@/api/session'

/**
 * What MRP will actually plan, and how it differs from the raw demand list.
 *
 * A forecast is a guess that a firm order will arrive. Once the order arrives,
 * planning both is planning the same demand twice — so firm orders consume the
 * forecast for the same product and month, and only the uncovered remainder is
 * planned.
 *
 * The panel exists because the demand list cannot show this: it lists documents,
 * and the netting happens across them. Without it a planner sees 217,958 units
 * of demand rows and has no way to know MRP is planning 199,758.
 */

export interface DemandSummaryRow {
  product_code: string
  product_name: string
  uom: string
  period: string
  firm_qty: number
  forecast_qty: number
  consumed_qty: number
  remaining_forecast_qty: number
  net_demand: number
  gross_if_not_netted: number
  over_forecast: boolean
  firm_documents: string[]
}

const qty = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export function DemandNettingPanel({ months = 6 }: { months?: number }) {
  const companyUid = useSession((s) => s.companyUid)
  const [open, setOpen] = useState(true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['planning:demand-summary', companyUid, months],
    queryFn: () => api.get<DemandSummaryRow[]>('/planning/demand-summary', { months }),
    enabled: !!companyUid,
  })

  const rows = data ?? []
  const totals = useMemo(
    () => ({
      net: rows.reduce((s, r) => s + r.net_demand, 0),
      gross: rows.reduce((s, r) => s + r.gross_if_not_netted, 0),
      consumed: rows.reduce((s, r) => s + r.consumed_qty, 0),
    }),
    [rows],
  )

  if (error) {
    return (
      <div className="rounded-xl border border-danger-border bg-danger-surface p-3 text-sm text-danger-fg">
        Unable to load the demand netting summary.
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-fg-muted" aria-hidden />
              : <ChevronRight className="h-4 w-4 text-fg-muted" aria-hidden />}
        <span className="text-sm font-semibold text-fg">What MRP will plan</span>
        {totals.consumed > 0 && (
          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-2xs font-medium text-brand-600">
            {qty(totals.consumed)} consumed
          </span>
        )}
        <span className="ml-auto text-2xs text-fg-muted">
          {isLoading ? 'Loading…' : `${qty(totals.net)} net of ${qty(totals.gross)} gross`}
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          {totals.consumed > 0 && (
            <p className="flex items-start gap-2 border-b border-border bg-surface-2 px-4 py-2.5 text-2xs text-fg-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden />
              <span>
                Firm orders already cover <strong className="text-fg">{qty(totals.consumed)}</strong> of the
                forecast. MRP plans <strong className="text-fg">{qty(totals.net)}</strong>, not{' '}
                {qty(totals.gross)} — the difference is the same demand counted twice.
              </span>
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-2xs uppercase tracking-wider text-fg-muted">
                  <th className="px-4 py-2.5 font-medium">Period</th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 text-right font-medium">Firm</th>
                  <th className="px-4 py-2.5 text-right font-medium">Forecast</th>
                  <th className="px-4 py-2.5 text-right font-medium">Consumed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net to Plan</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-fg-muted">Loading…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-fg-muted">
                    No open demand in this horizon.
                  </td></tr>
                )}
                {rows.map((r) => (
                  <tr key={`${r.period}-${r.product_code}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-[13px] tabular-nums text-fg-muted">{monthLabel(r.period)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[13px] font-medium text-fg">{r.product_code}</span>
                      {r.over_forecast && (
                        <span className="ml-2 text-2xs text-warning" title="Firm orders exceed the forecast for this period">
                          over forecast
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-fg">{qty(r.firm_qty)}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-fg-muted">{qty(r.forecast_qty)}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums">
                      {r.consumed_qty > 0
                        ? <span className="font-medium text-brand-600">−{qty(r.consumed_qty)}</span>
                        : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums text-fg">
                      {qty(r.net_demand)} <span className="text-2xs font-normal text-fg-muted">{r.uom}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

export default DemandNettingPanel
