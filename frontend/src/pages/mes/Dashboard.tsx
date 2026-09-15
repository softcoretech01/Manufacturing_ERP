import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { MesChartTip, MesStatusBadge } from '@/components/mes/MesShell'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { shopFloorApi, type DashboardResult } from '@/api/shopfloor'

/**
 * Shop floor at a glance.
 *
 * Every tile on this page is a count or a sum of rows the floor actually
 * posted. Nothing is estimated and nothing is filled in when it is missing:
 * where a figure would need a model this system does not keep — machine
 * availability, downtime reasons, labour cost — the server says so, and the
 * page prints the reason instead of a number. A dashboard that shows a
 * plausible zero is worse than one that shows a gap, because the gap is what
 * sends someone to go and measure.
 */

const ORDER_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'progress'> = {
  IN_PROGRESS: 'progress',
  RELEASED: 'progress',
  PLANNED: 'neutral',
  FIRM_PLANNED: 'neutral',
  CLOSED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
}

const EMPTY: DashboardResult = {
  date: '',
  orders: [],
  workOrders: [],
  today: { goodQty: 0, scrapQty: 0, reworkQty: 0, entries: 0, yieldPct: null },
  trend: [],
  byWorkCentre: [],
  wip: { lots: 0, qty: 0 },
  unavailable: [],
}

export function MesDashboardPage() {
  const [data, setData] = useState<DashboardResult>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    shopFloorApi
      .dashboard()
      .then((res) => {
        setData(res)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.')
        setData(EMPTY)
      })
      .finally(() => setLoading(false))
  }, [])

  const openOrders = data.orders.filter((o) => !['CLOSED', 'COMPLETED', 'CANCELLED'].includes(o.status))
  const openQty = openOrders.reduce((s, o) => s + o.qty, 0)
  const running = data.workOrders.find((w) => w.status === 'RUNNING')?.count ?? 0
  const queued = data.workOrders
    .filter((w) => ['QUEUED', 'READY'].includes(w.status))
    .reduce((s, w) => s + w.count, 0)
  const held = data.workOrders
    .filter((w) => ['HOLD', 'QC_HOLD', 'PAUSED'].includes(w.status))
    .reduce((s, w) => s + w.count, 0)

  const trend = data.trend.map((t) => ({
    label: t.date ? formatDate(t.date).slice(0, 6) : '—',
    good: t.goodQty,
    scrap: t.scrapQty,
  }))

  return (
    <div>
      <PageHeader
        title="Shop floor"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor' }]}
      />

      {error && (
        <Alert tone="danger" title="The floor could not be read" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && <p className="mb-4 text-xs text-fg-muted">Reading the floor…</p>}

      {/* Tiles — each one a count of real rows ------------------------------- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Open orders" value={String(openOrders.length)} note={`${formatQty(openQty)} to make`} to="/production/orders" />
        <Tile label="Running now" value={String(running)} note={`${queued} queued · ${held} held`} to="/production/queue" tone={running ? 'success' : 'neutral'} />
        <Tile label="Booked today" value={formatQty(data.today.goodQty)} note={`${data.today.entries} entr${data.today.entries === 1 ? 'y' : 'ies'}`} to="/production/entry" />
        <Tile
          label="Yield today"
          value={data.today.yieldPct === null ? '—' : `${data.today.yieldPct}%`}
          note={data.today.yieldPct === null ? 'nothing booked today' : `${formatQty(data.today.scrapQty)} scrapped`}
          tone={data.today.yieldPct !== null && data.today.yieldPct < 95 ? 'warning' : 'neutral'}
        />
        <Tile label="In progress" value={formatQty(data.wip.qty)} note={`across ${data.wip.lots} lot${data.wip.lots === 1 ? '' : 's'}`} to="/production/wip" />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        {/* Output history ---------------------------------------------------- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Output booked"
            description="The last fortnight, from the production entries themselves"
            actions={<Link to="/production/entry" className="text-2xs font-medium text-brand-600 hover:underline">Register</Link>}
          />
          <CardBody className="h-64">
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip content={<MesChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="good" name="Good" fill="var(--color-success, #16a34a)" />
                  <Line type="monotone" dataKey="scrap" name="Scrap" stroke="var(--color-danger, #dc2626)" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-xs text-fg-muted">
                No production has been booked in the last fortnight.
              </p>
            )}
          </CardBody>
        </Card>

        {/* Orders ------------------------------------------------------------ */}
        <Card>
          <CardHeader title="Production orders" description="Every order by the state it is in" />
          <CardBody className="space-y-2">
            {data.orders.length ? (
              data.orders.map((o) => (
                <div key={o.status} className="flex items-center justify-between gap-2">
                  <Badge tone={ORDER_TONE[o.status] ?? 'neutral'} size="sm">{o.status.replace('_', ' ')}</Badge>
                  <span className="text-xs text-fg-muted">
                    <span className="font-medium tabular text-fg">{o.count}</span> · {formatQty(o.qty)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-fg-muted">No production order exists yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {/* Work centres ------------------------------------------------------ */}
        <Card>
          <CardHeader
            title="By work centre"
            description="Everything booked to date, best yield first"
            actions={<Link to="/production/queue" className="text-2xs font-medium text-brand-600 hover:underline">Queue</Link>}
          />
          <CardBody className="p-0">
            {data.byWorkCentre.length ? (
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Work centre</th>
                      <th className="w-24 text-right">Entries</th>
                      <th className="w-28 text-right">Good</th>
                      <th className="w-28 text-right">Scrap</th>
                      <th className="w-24 text-right">Yield</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byWorkCentre.map((w) => (
                      <tr key={w.workCentreCode}>
                        <td className="font-mono text-2xs">{w.workCentreCode || '—'}</td>
                        <td className="text-right tabular">{w.entries}</td>
                        <td className="text-right tabular text-success">{formatQty(w.goodQty)}</td>
                        <td className="text-right tabular text-danger">{formatQty(w.scrapQty)}</td>
                        <td className={cn('text-right tabular', w.yieldPct !== null && w.yieldPct < 95 && 'text-warning')}>
                          {w.yieldPct === null ? '—' : `${w.yieldPct}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-xs text-fg-muted">Nothing has been booked at any work centre yet.</p>
            )}
          </CardBody>
        </Card>

        {/* Work orders ------------------------------------------------------- */}
        <Card>
          <CardHeader title="Work orders" description="One per routing operation on a released order" />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {data.workOrders.length ? (
              data.workOrders.map((w) => (
                <div key={w.status} className="flex items-center justify-between gap-2 rounded border border-border bg-surface-2 px-3 py-2">
                  <MesStatusBadge status={w.status} size="sm" />
                  <span className="text-sm font-semibold tabular text-fg">{w.count}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-fg-muted">No order has been released to the floor yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* What this system cannot yet measure ---------------------------------- */}
      {data.unavailable.length > 0 && (
        <Card>
          <CardHeader
            title="Not shown, and why"
            description="These need a model this system does not keep. They are left blank rather than estimated."
          />
          <CardBody className="space-y-2">
            {data.unavailable.map((u) => (
              <div key={u.metric} className="rounded border border-border bg-surface-2 px-3 py-2">
                <p className="text-xs font-medium text-fg">{u.metric}</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-fg-muted">{u.reason}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function Tile({
  label,
  value,
  note,
  to,
  tone = 'neutral',
}: {
  label: string
  value: string
  note: string
  to?: string
  tone?: 'success' | 'warning' | 'neutral'
}) {
  const body = (
    <Card className={cn(to && 'transition hover:border-brand-400')}>
      <CardBody>
        <p className="text-2xs uppercase tracking-wide text-fg-subtle">{label}</p>
        <p
          className={cn(
            'mt-1 text-xl font-semibold tabular',
            tone === 'success' && 'text-success',
            tone === 'warning' && 'text-warning',
            tone === 'neutral' && 'text-fg',
          )}
        >
          {value}
        </p>
        <p className="mt-0.5 text-2xs text-fg-muted">{note}</p>
      </CardBody>
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}
