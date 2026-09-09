import { useMemo, useState } from 'react'
import { Gauge, X, Factory, Clock, Target } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { InfoStrip } from '@/components/ui/InfoStrip'
import { useCapacityPlan, useCapacityDetail } from '@/hooks/useCapacity'
import { Select } from '@/components/ui/Input'
import { usePlanningData } from './usePlanningData'
import type { CapacityRow } from '@/api/capacity'

/**
 * Capacity requirements planning.
 *
 * The grid says which centres are overloaded; clicking one says because of what.
 * A load percentage a planner cannot trace back to specific operations is a
 * number they learn to ignore.
 *
 * Committed and planned hours are shown apart on purpose. Committed work is
 * going to happen and an overload means move it or add a shift; planned work is
 * MRP's proposal and an overload means change the plan.
 */

const hrs = (n: number) => `${n.toFixed(1)} h`

/** Load bands read as text as well as colour — colour alone is not an
 *  accessible status signal (CLAUDE.md §7). */
function loadBadge(pct: number) {
  if (pct >= 999) return <Badge tone="danger" size="sm">No capacity</Badge>
  if (pct > 100) return <Badge tone="danger" size="sm">{pct.toFixed(0)}% over</Badge>
  if (pct > 85) return <Badge tone="warning" size="sm">{pct.toFixed(0)}% tight</Badge>
  if (pct > 0) return <Badge tone="success" size="sm">{pct.toFixed(0)}%</Badge>
  return <Badge tone="neutral" size="sm">Idle</Badge>
}

/**
 * The load bar.
 *
 * `focusPct` shades the selected demand's share *inside* the total rather than
 * replacing it. Showing only the selected demand would make a work centre that
 * is already full look free, which is the one mistake this screen exists to
 * prevent.
 */
function LoadBar({ pct, focusPct = 0 }: { pct: number; focusPct?: number }) {
  const capped = Math.min(pct, 150)
  const focusCapped = Math.min(focusPct, capped)
  const tone = pct > 100 ? 'bg-danger' : pct > 85 ? 'bg-warning' : 'bg-success'
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className={`h-full ${tone} opacity-40`} style={{ width: `${(capped / 150) * 100}%` }} />
        {focusCapped > 0 && (
          <div
            className={`absolute inset-y-0 left-0 ${tone}`}
            style={{ width: `${(focusCapped / 150) * 100}%` }}
          />
        )}
      </div>
      <span className="text-[13px] tabular-nums text-fg">{pct.toFixed(0)}%</span>
      {focusPct > 0 && (
        <span className="text-[11px] tabular-nums text-brand-600" title="This demand's share">
          ({focusPct.toFixed(0)}%)
        </span>
      )}
    </div>
  )
}

export function CapacityPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const [horizon, setHorizon] = useState(8)
  const [includePlanned, setIncludePlanned] = useState(true)
  const [drill, setDrill] = useState<{ code: string; bucket?: number } | null>(null)
  // Which order to highlight. Empty means the plain factory-wide view.
  const [demandFocus, setDemandFocus] = useState('')

  const { demand } = usePlanningData()
  const openDemand = useMemo(
    () =>
      demand.rows
        .filter((d) => d.status === 'OPEN' && d.qty - (d.qtyPlanned ?? 0) > 0)
        .sort((a, b) => a.requiredOn.localeCompare(b.requiredOn)),
    [demand.rows],
  )
  const focused = openDemand.find((d) => d.docNo === demandFocus) ?? null

  const { data, isLoading, error } = useCapacityPlan({
    horizon,
    include_planned: includePlanned,
    demand_doc_no: demandFocus || undefined,
  })
  const detail = useCapacityDetail(drill?.code, { horizon, bucket: drill?.bucket })

  const rows = data?.work_centres ?? []
  const starts = data?.starts ?? []

  const totals = useMemo(
    () => ({
      required: rows.reduce((s, r) => s + r.total_required_hours, 0),
      available: rows.reduce((s, r) => s + r.total_available_hours, 0),
      focus: rows.reduce((s, r) => s + (r.total_focus_hours ?? 0), 0),
      // Only the centres that are short — netting a spare centre against a
      // full one would understate the problem, because hours do not transfer.
      overload: rows.reduce(
        (s, r) => s + Math.max(0, r.total_required_hours - r.total_available_hours),
        0,
      ),
    }),
    [rows],
  )

  const overloadHours = totals.overload

  const columns: Column<CapacityRow>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'work_centre', header: 'Work Centre', width: '260px', sortable: true, sticky: true,
      accessor: (r) => `${r.work_centre_name} ${r.work_centre_code}`,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-fg" title={r.work_centre_name}>
            {r.work_centre_name}
          </p>
          <p className="truncate font-mono text-[12px] text-fg-subtle">
            {r.work_centre_code} · {r.hours_per_day} h/day @ {r.oee_target_pct}% OEE
          </p>
        </div>
      ),
    },
    {
      key: 'total_required_hours', header: 'Required', width: '130px', align: 'right', sortable: true,
      accessor: (r) => r.total_required_hours,
      render: (r) => <span className="text-[14px] tabular-nums text-fg">{hrs(r.total_required_hours)}</span>,
    },
    {
      key: 'total_available_hours', header: 'Available', width: '130px', align: 'right',
      accessor: (r) => r.total_available_hours,
      render: (r) => (
        <span className="text-[14px] tabular-nums text-fg-muted">{hrs(r.total_available_hours)}</span>
      ),
    },
    {
      key: 'remaining_hours', header: 'Remaining', width: '9.5rem', align: 'right', sortable: true,
      accessor: (r) => r.total_available_hours - r.total_required_hours,
      render: (r) => {
        const left = r.total_available_hours - r.total_required_hours
        return left >= 0 ? (
          <span className="tabular-nums text-fg">{hrs(left)}</span>
        ) : (
          <span className="tabular-nums font-medium text-danger" title="Required hours exceed available hours over the horizon">
            {hrs(Math.abs(left))} over
          </span>
        )
      },
    },
    {
      key: 'overall_load_pct', header: 'Overall Load', width: '170px', sortable: true,
      accessor: (r) => r.overall_load_pct,
      render: (r) => (
        <LoadBar
          pct={r.overall_load_pct}
          focusPct={
            r.total_available_hours > 0
              ? ((r.total_focus_hours ?? 0) / r.total_available_hours) * 100
              : 0
          }
        />
      ),
    },
    {
      key: 'peak_load_pct', header: 'Peak Week', width: '150px', align: 'center', sortable: true,
      accessor: (r) => r.peak_load_pct,
      render: (r) => loadBadge(r.peak_load_pct),
    },
    {
      key: 'overloaded_buckets', header: 'Weeks Over', width: '130px', align: 'right',
      accessor: (r) => r.overloaded_buckets,
      render: (r) => (
        <span className={`text-[14px] tabular-nums ${r.overloaded_buckets ? 'font-semibold text-danger' : 'text-fg-subtle'}`}>
          {r.overloaded_buckets || '—'}
        </span>
      ),
    },
    {
      key: 'actions', header: 'Actions', width: '130px', align: 'center', className: 'col-flex',
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => setDrill({ code: r.work_centre_code })}>
          Why?
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        title="Capacity Planning"
        description="What the plan asks of each work centre, against the hours the calendar and its shift pattern allow."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Capacity' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load the capacity plan.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load capacity">
          {error instanceof ProblemError ? error.problem.detail : 'Unable to reach the planning service.'}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="cap-horizon" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Horizon</label>
          <select
            id="cap-horizon" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}
            className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          >
            {[4, 8, 12, 26].map((h) => <option key={h} value={h}>{h} weeks</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-fg">
          <input
            type="checkbox" checked={includePlanned}
            onChange={(e) => setIncludePlanned(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500"
          />
          Include MRP proposals
        </label>
        <Select
          label="Highlight demand"
          containerClassName="w-64"
          value={demandFocus}
          onChange={(e) => setDemandFocus(e.target.value)}
          options={[
            { value: '', label: 'No demand highlighted' },
            ...openDemand.map((d) => ({
              value: d.docNo,
              label: `${d.docNo} — ${d.productCode}`,
            })),
          ]}
        />
        <span className="pb-2 text-2xs text-fg-muted">
          {includePlanned
            ? 'Showing committed work plus what MRP proposes.'
            : 'Showing only work already committed to a production order.'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {data?.mrp_run_no && (
            <span className="pb-2 font-mono text-2xs text-fg-muted">from {data.mrp_run_no}</span>
          )}
          <Button
            size="sm" variant="outline"
            onClick={() => {
              const n = exportRows('csv', 'capacity', 'Capacity plan', columnsFromTable(columns), rows)
              toast.success('Export ready', `${n} rows written.`)
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {data && data.bottlenecks.length > 0 && (
        <Alert tone="danger" title={`${data.bottlenecks.length} work centre(s) over capacity`}>
          {data.bottlenecks.join(', ')} exceed 100% in at least one week
          {overloadHours > 0 ? `, by ${hrs(overloadHours)} in total` : ''}.{' '}
          {!includePlanned
            ? 'This is work already committed, so the options are to move it out, add a shift, or subcontract.'
            : 'Reschedule the planned orders, add capacity, or move production out. Untick "Include MRP proposals" to see how much of this is already committed.'}
        </Alert>
      )}

      {focused && totals.focus === 0 && (
        <Alert tone="info" title={`${focused.docNo} has no load on the plan yet`}>
          Nothing is scheduled or proposed for this demand, so no hours are attributed
          to it. Build a master schedule for it, or run MRP for it, and the shaded share
          will appear.
        </Alert>
      )}

      {data && (
        <InfoStrip
          items={[
            { label: 'Required', value: hrs(totals.required), icon: <Clock className="h-3.5 w-3.5" aria-hidden /> },
            { label: 'Available', value: hrs(totals.available), icon: <Factory className="h-3.5 w-3.5" aria-hidden /> },
            {
              label: 'Overall',
              value: `${totals.available > 0 ? ((totals.required / totals.available) * 100).toFixed(1) : '0.0'}%`,
              icon: <Gauge className="h-3.5 w-3.5" aria-hidden />,
              alert: totals.available > 0 && totals.required > totals.available,
            },
            ...(focused
              ? [{
                  label: `${focused.docNo} needs`,
                  value: hrs(totals.focus),
                  icon: <Target className="h-3.5 w-3.5" aria-hidden />,
                }]
              : []),
          ]}
        />
      )}

      <DataTable
        density="comfortable" searchable={false}
        rows={rows} columns={columns} rowKey={(r) => r.work_centre_code}
        loading={isLoading}
        emptyTitle="No work centres"
        emptyDescription="Work centres are created in Product Engineering."
      />

      {/* ── Week grid for the whole plant ──────────────────────────────── */}
      {rows.length > 0 && (
        <section className="rounded-xl border border-border bg-surface">
          <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">
            Load by week
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-2xs uppercase tracking-wider text-fg-muted">
                  <th className="px-4 py-2.5 font-medium">Work Centre</th>
                  {starts.map((s, i) => (
                    <th key={s} className="px-2 py-2.5 text-center font-medium">
                      W{i + 1}
                      <span className="block font-normal normal-case text-fg-subtle">
                        {formatDate(s).slice(0, 6)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.work_centre_code} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-[13px] font-medium text-fg">{r.work_centre_code}</td>
                    {r.cells.map((c) => (
                      <td key={c.bucket} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setDrill({ code: r.work_centre_code, bucket: c.bucket })}
                          title={`${hrs(c.required_hours)} of ${hrs(c.available_hours)} · ${c.working_days} working days`}
                          className={`w-full rounded px-1.5 py-1 text-[12px] tabular-nums transition-colors ${
                            c.load_pct > 100
                              ? 'bg-danger/15 font-semibold text-danger hover:bg-danger/25'
                              : c.load_pct > 85
                                ? 'bg-warning/15 text-warning hover:bg-warning/25'
                                : c.load_pct > 0
                                  ? 'text-fg-muted hover:bg-surface-2'
                                  : 'text-fg-subtle hover:bg-surface-2'
                          }`}
                        >
                          {c.load_pct > 0 ? `${c.load_pct.toFixed(0)}%` : '—'}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Drill-down: what makes the number ──────────────────────────── */}
      {drill && (
        <Modal
          open
          onClose={() => setDrill(null)}
          title={
            detail.data
              ? `${detail.data.work_centre_code} — ${detail.data.work_centre_name}`
              : drill.code
          }
          description={
            drill.bucket != null
              ? `Week ${drill.bucket + 1} load, operation by operation.`
              : 'Every operation loading this work centre in the horizon.'
          }
          size="4xl"
          footer={<Button variant="secondary" onClick={() => setDrill(null)}>Close</Button>}
        >
          {detail.isLoading && <p className="py-8 text-center text-sm text-fg-muted">Loading…</p>}
          {detail.data && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg bg-surface-2 p-3 text-[13px]">
                <span className="text-fg-muted">
                  Committed <b className="tabular-nums text-fg">{hrs(detail.data.committed_hours)}</b>
                </span>
                <span className="text-fg-muted">
                  Planned <b className="tabular-nums text-brand-600">{hrs(detail.data.planned_hours)}</b>
                </span>
                <span className="text-fg-muted">
                  Peak <b className="tabular-nums text-fg">{detail.data.peak_load_pct.toFixed(1)}%</b>
                </span>
              </div>

              {detail.data.operations.length === 0 ? (
                <p className="py-6 text-center text-sm text-fg-muted">
                  Nothing loads this work centre in the selected period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-2xs uppercase tracking-wider text-fg-muted">
                        <th className="px-3 py-2 font-medium">Week</th>
                        <th className="px-3 py-2 font-medium">Source</th>
                        <th className="px-3 py-2 font-medium">Document</th>
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium">Operation</th>
                        <th className="px-3 py-2 text-right font-medium">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.operations.map((o, i) => (
                        <tr key={`${o.document_no ?? 'plan'}-${o.operation}-${i}`} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-[13px] tabular-nums text-fg-muted">W{o.bucket + 1}</td>
                          <td className="px-3 py-2">
                            <Badge tone={o.source === 'COMMITTED' ? 'neutral' : 'brand'} size="sm" dot={false}>
                              {o.source === 'COMMITTED' ? 'Committed' : 'Planned'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-fg-muted">
                            {o.document_no ?? '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-fg">{o.product_code}</td>
                          <td className="px-3 py-2 text-[13px] text-fg">{o.operation}</td>
                          <td className="px-3 py-2 text-right text-[13px] font-medium tabular-nums text-fg">
                            {o.hours.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default CapacityPage
