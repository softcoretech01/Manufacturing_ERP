/*
 * Procurement Dashboard.
 *
 * Every number on this page is a way into the documents behind it: the KPI tiles
 * are buttons, and clicking one opens a drill-down list underneath the grid
 * rather than navigating away. The counts come from the dashboard endpoint; the
 * lists behind them come from the module's own list endpoints, because the
 * dashboard payload carries totals, not documents.
 *
 * Charts are Recharts — the project's chart library (CLAUDE.md §2). They are
 * bound to `spendTrend` / `categoryPie` exactly as the stored procedure returns
 * them, and each renders an explicit empty state, because on a young dataset
 * those result sets legitimately come back with no rows.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, FileCheck2, FileText, IndianRupee, PackageCheck,
} from 'lucide-react'
import { api } from '@/api/client'
import { Alert } from '@/components/ui/Misc'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProcPageHeader } from '@/components/procurement/ProcPageHeader'
import { ProcKpiTile } from '@/components/procurement/ProcKpiTile'
import { ProcDetailsPanel, type ProcDetailCol } from '@/components/procurement/ProcDetailsPanel'
import { ProcDateFilter, inDateRange, type ProcDateRange } from '@/components/procurement/ProcDateFilter'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import { getRequisitions, getPurchaseOrders, getGrns } from '@/api/procurement'

type DrillKey = 'pr' | 'po' | 'grn' | 'spend'

/** Which KPI tiles exist, and what each one drills into. */
const TILES = [
  { key: 'pr' as const, label: 'Pending PR Approvals', icon: <FileText />, tone: 'pending' as const },
  { key: 'po' as const, label: 'Open Purchase Orders', icon: <FileCheck2 />, tone: 'brand' as const },
  { key: 'grn' as const, label: 'Receipts Awaiting QC', icon: <PackageCheck />, tone: 'warning' as const },
  { key: 'spend' as const, label: 'Spend (YTD)', icon: <IndianRupee />, tone: 'success' as const },
]

export function ProcurementDashboardPage() {
  const navigate = useNavigate()

  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [range, setRange] = useState<ProcDateRange>({ from: '', to: '' })
  const [open, setOpen] = useState<DrillKey | null>(null)

  // Documents behind the tiles. Loaded once alongside the dashboard so a tile
  // opens instantly instead of showing a spinner on every click.
  const [prs, setPrs] = useState<any[]>([])
  const [pos, setPos] = useState<any[]>([])
  const [grns, setGrns] = useState<any[]>([])
  const [docsLoading, setDocsLoading] = useState(true)

  useEffect(() => {
    let alive = true
    // Through the shared client: a bare fetch sends no Authorization header, so
    // the endpoint answers 401 and the error body gets rendered as if it were
    // the dashboard.
    api.get<any>('/procurement/dashboard/')
      .then((json) => { if (alive) { setData(json); setLoading(false) } })
      .catch((err: any) => {
        if (!alive) return
        setError(err?.problem?.detail || err?.message || 'Could not load the dashboard.')
        setLoading(false)
      })

    Promise.all([getRequisitions(), getPurchaseOrders(), getGrns()])
      .then(([pr, po, grn]) => {
        if (!alive) return
        setPrs(pr || []); setPos(po || []); setGrns(grn || [])
      })
      .catch(() => { /* the tiles still show their counts; only drill-down is thinner */ })
      .finally(() => { if (alive) setDocsLoading(false) })

    return () => { alive = false }
  }, [])

  const kpis = data?.kpis
  const spendTrend: any[] = data?.spendTrend ?? []
  const categoryPie: any[] = data?.categoryPie ?? []
  const supplierSpend: any[] = data?.supplierSpend ?? []
  const overduePo: any[] = data?.overduePo ?? []

  // The applied date range narrows the drill-down lists. The headline KPIs come
  // from the server and are not re-derived here — showing a filtered list under
  // an unfiltered total would be worse than showing neither.
  const inRange = (d: unknown) => inDateRange(d, range)
  const filteredPrs = useMemo(() => prs.filter((p) => inRange(p.docDate)), [prs, range])
  const filteredPos = useMemo(() => pos.filter((p) => inRange(p.docDate)), [pos, range])
  const filteredGrns = useMemo(() => grns.filter((g) => inRange(g.docDate)), [grns, range])

  const money = (v: any) => formatCurrency(Number(v) || 0)

  if (loading) {
    return (
      <div className="flex h-full flex-col p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-surface-3" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TILES.map((t) => <div key={t.key} className="h-32 animate-pulse rounded-2xl bg-surface-3" />)}
        </div>
      </div>
    )
  }

  if (error || !kpis) {
    return (
      <div className="p-6">
        <Alert tone="danger" title="Dashboard unavailable">
          {error || 'The dashboard returned no data.'}
        </Alert>
      </div>
    )
  }

  const tileValue: Record<DrillKey, React.ReactNode> = {
    pr: kpis.prPending ?? 0,
    po: kpis.openPoCount ?? 0,
    grn: kpis.qcPending ?? 0,
    spend: money(kpis.ytdSpend),
  }
  const tileSub: Record<DrillKey, string> = {
    pr: `${prs.length} requisition${prs.length === 1 ? '' : 's'} in total`,
    po: `${money(kpis.openValue)} committed`,
    grn: `${(kpis.rejectionPct ?? 0).toFixed(1)}% rejected on receipt`,
    spend: `${(kpis.onTimePct ?? 0).toFixed(0)}% delivered on time`,
  }

  const DOC_COLS: Record<DrillKey, ProcDetailCol[]> = {
    pr: [
      { key: 'docNo', header: 'PR No', render: (r) => <span className="font-mono text-brand-600">{r.docNo}</span> },
      { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate) },
      { key: 'department', header: 'Department', render: (r) => r.department || r.itemType || '—' },
      { key: 'requestedBy', header: 'Requested By' },
      { key: 'estimatedValue', header: 'Est. Value', align: 'right', render: (r) => money(r.estimatedValue) },
      { key: 'status', header: 'Status', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
    ],
    po: [
      { key: 'docNo', header: 'PO No', render: (r) => <span className="font-mono text-brand-600">{r.docNo}</span> },
      { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate) },
      { key: 'supplierName', header: 'Supplier' },
      { key: 'promisedDate', header: 'Due', render: (r) => r.promisedDate ? formatDate(r.promisedDate) : '—' },
      { key: 'totalValue', header: 'Value', align: 'right', render: (r) => money(r.totalValue) },
      { key: 'status', header: 'Status', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
    ],
    grn: [
      { key: 'docNo', header: 'GRN No', render: (r) => <span className="font-mono text-brand-600">{r.docNo}</span> },
      { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate) },
      { key: 'poNo', header: 'PO Ref', render: (r) => <span className="font-mono">{r.poNo}</span> },
      { key: 'supplierName', header: 'Supplier' },
      { key: 'grnValue', header: 'Value', align: 'right', render: (r) => money(r.grnValue) },
      { key: 'qcStatus', header: 'QC', render: (r) => <ProcStatusBadge status={r.qcStatus || 'PENDING'} size="sm" /> },
    ],
    spend: [
      { key: 'supplierName', header: 'Supplier' },
      { key: 'value', header: 'Spend', align: 'right', render: (r) => money(r.value) },
      { key: 'sharePct', header: 'Share', align: 'right', render: (r) => `${(Number(r.sharePct) || 0).toFixed(1)}%` },
      { key: 'onTimePct', header: 'On Time', align: 'right', render: (r) => `${(Number(r.onTimePct) || 0).toFixed(0)}%` },
      { key: 'grade', header: 'Grade' },
    ],
  }

  const DRILL: Record<DrillKey, { label: string; rows: any[]; note: string; to?: string }> = {
    pr: { label: 'Purchase Requisitions', rows: filteredPrs, note: 'Click a row to open it in Purchase Requisitions.', to: '/procurement/requisitions' },
    po: { label: 'Purchase Orders', rows: filteredPos, note: 'Click a row to open it in Purchase Orders.', to: '/procurement/orders' },
    grn: { label: 'Goods Receipts', rows: filteredGrns, note: 'Click a row to open it in Goods Receipt Notes.', to: '/procurement/grn' },
    spend: { label: 'Spend by Supplier', rows: supplierSpend, note: 'Year-to-date spend, ranked by value.' },
  }

  const maxCategory = Math.max(1, ...categoryPie.map((c) => Number(c.value) || 0))

  return (
    <div className="flex h-full flex-col overflow-auto bg-surface-2 p-6">
      <ProcPageHeader
        title="Procurement Dashboard"
        subtitle="Requisitions, orders and receipts at a glance — click any figure to see what is behind it."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement' }, { label: 'Dashboard' }]}
        actions={<ProcDateFilter value={range} onChange={setRange} label="Document date" />}
      />

      {/* KPI tiles + inline drill-down */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map((t) => (
          <ProcKpiTile
            key={t.key}
            label={t.label}
            value={tileValue[t.key]}
            sub={tileSub[t.key]}
            icon={t.icon}
            tone={t.tone}
            active={open === t.key}
            onClick={() => setOpen(open === t.key ? null : t.key)}
          />
        ))}

        {open && (
          <ProcDetailsPanel
            label={DRILL[open].label}
            cols={DOC_COLS[open]}
            rows={DRILL[open].rows}
            loading={open !== 'spend' && docsLoading}
            note={DRILL[open].note}
            emptyMessage={
              range.from || range.to
                ? 'No documents in the selected date range.'
                : 'No documents yet.'
            }
            onRowClick={DRILL[open].to ? () => navigate(DRILL[open].to!) : undefined}
            onClose={() => setOpen(null)}
          />
        )}
      </div>

      {/* Trend + category */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm lg:col-span-2">
          <header className="mb-4">
            <h2 className="text-sm font-semibold text-fg">Spend vs Budget</h2>
            <p className="text-xs text-fg-muted">Monthly committed spend against budget.</p>
          </header>
          {spendTrend.length === 0 ? (
            <EmptyChart message="No trend data yet — it appears once orders span more than one month." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spendTrend} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="procSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="procBudget" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--st-success))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="rgb(var(--st-success))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgb(var(--fg-muted))" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke="rgb(var(--fg-muted))" tickLine={false} axisLine={false}
                    tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: any, name: string) => [formatCurrency(Number(v) || 0), name === 'spend' ? 'Spend' : 'Budget']}
                    contentStyle={{
                      background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))',
                      borderRadius: 12, fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="budget" name="Budget" stroke="rgb(var(--st-success))" fill="url(#procBudget)" strokeWidth={2} />
                  <Area type="monotone" dataKey="spend" name="Spend" stroke="rgb(var(--brand-500))" fill="url(#procSpend)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <header className="mb-4">
            <h2 className="text-sm font-semibold text-fg">Spend by Category</h2>
            <p className="text-xs text-fg-muted">Top categories year to date.</p>
          </header>
          {categoryPie.length === 0 ? (
            <EmptyChart message="No categorised spend yet." />
          ) : (
            <ul className="flex flex-col gap-3">
              {categoryPie.map((c) => {
                const v = Number(c.value) || 0
                return (
                  <li key={c.category}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-fg">{c.category}</span>
                      <span className="shrink-0 text-xs tabular-nums text-fg-muted">{money(v)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(v / maxCategory) * 100}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Suppliers + attention */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-fg">Top Suppliers</h2>
          </header>
          {supplierSpend.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-fg-muted">No supplier spend recorded yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-surface-2">
                <tr>
                  <th className="px-5 py-2.5 text-left font-semibold uppercase tracking-wider text-fg-muted">Supplier</th>
                  <th className="px-5 py-2.5 text-right font-semibold uppercase tracking-wider text-fg-muted">Spend</th>
                  <th className="px-5 py-2.5 text-right font-semibold uppercase tracking-wider text-fg-muted">On Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {supplierSpend.map((s, i) => (
                  <tr key={i} className="hover:bg-surface-2">
                    <td className="px-5 py-2.5 font-medium text-fg">{s.supplierName}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg">{money(s.value)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">{(Number(s.onTimePct) || 0).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-fg">Needs Attention</h2>
          </header>
          <ul className="divide-y divide-border">
            <AttentionRow label="Requisitions awaiting approval" count={kpis.prPending ?? 0} to="/procurement/approvals" navigate={navigate} />
            <AttentionRow label="Orders awaiting approval" count={kpis.poPending ?? 0} to="/procurement/approvals" navigate={navigate} />
            <AttentionRow label="RFQs open for quoting" count={kpis.rfqOpen ?? 0} to="/procurement/rfq" navigate={navigate} />
            <AttentionRow label="Quotations awaiting comparison" count={kpis.quotesAwaiting ?? 0} to="/procurement/comparison" navigate={navigate} />
            <AttentionRow label="Receipts pending QC" count={kpis.qcPending ?? 0} to="/procurement/grn" navigate={navigate} />
            <AttentionRow label="Overdue purchase orders" count={overduePo.length} to="/procurement/orders" navigate={navigate} tone="danger" />
          </ul>
        </section>
      </div>
    </div>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
      <AlertTriangle className="h-5 w-5 text-fg-subtle" aria-hidden />
      <p className="max-w-xs text-xs text-fg-muted">{message}</p>
    </div>
  )
}

function AttentionRow({
  label, count, to, navigate, tone = 'default',
}: {
  label: string
  count: number
  to: string
  navigate: (to: string) => void
  tone?: 'default' | 'danger'
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(to)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500/40"
      >
        <span className="text-xs text-fg">{label}</span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
            count === 0
              ? 'bg-surface-3 text-fg-muted'
              : tone === 'danger'
                ? 'bg-danger/10 text-danger'
                : 'bg-brand-500/10 text-brand-600',
          )}
        >
          {count}
        </span>
      </button>
    </li>
  )
}
