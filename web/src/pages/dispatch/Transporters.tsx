import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import {
  DispatchChartTip,
  PctChip,
  regionColour,
  useCanSeeFreight,
} from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/cn'
import { regionDispatch, transporterScores } from '@/mock/dispatch'
import type { RegionDispatch, TransporterScore } from '@/types/dispatch'

const TABS = [
  { id: 'TRANSPORTER', label: 'Transporter performance' },
  { id: 'ROUTE', label: 'Route & region' },
]

/**
 * Transporter and route performance — the scorecard that turns "they are always
 * late" into a number. On-time percentage, damage rate and freight per kilogram
 * together decide who gets the next contract; any one of them alone misleads.
 */
export function TransportersPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeFreight()

  const scores = useMemo(() => transporterScores, [])
  const regions = useMemo(() => regionDispatch, [])
  const [tab, setTab] = useState('TRANSPORTER')

  /**
   * A single score out of 100 so the list can be ranked: on-time is weighted
   * heaviest because a late delivery is what the customer actually feels,
   * damage next, and cost last — the cheapest transporter who breaks things is
   * not cheap.
   */
  const rank = (t: TransporterScore) => {
    const onTime = t.onTimePct
    const damage = Math.max(0, 100 - t.damagePct * 40)
    const cost = Math.max(0, 100 - (t.freightPerKg / 25) * 100)
    return onTime * 0.5 + damage * 0.3 + cost * 0.2
  }

  const ranked = [...scores].sort((a, b) => rank(b) - rank(a))
  const best = ranked[0]
  const worst = ranked[ranked.length - 1]
  const totalTrips = scores.reduce((s, t) => s + t.trips, 0)
  const weightedOnTime = totalTrips ? scores.reduce((s, t) => s + t.onTimePct * t.trips, 0) / totalTrips : 0

  const transporterColumns: Column<TransporterScore>[] = [
    { key: 'transporter', header: 'Transporter', sortable: true, width: '14rem', render: (t) => (
      <div className="flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', rank(t) >= 85 ? 'bg-success' : rank(t) >= 70 ? 'bg-warning' : 'bg-danger')} />
        <span className="text-xs font-medium text-fg">{t.transporter}</span>
      </div>
    ) },
    { key: 'trips', header: 'Trips', align: 'right', sortable: true, width: '6.5rem', render: (t) => (
      <span className="tabular text-xs">{t.trips}</span>
    ) },
    { key: 'onTimePct', header: 'On time', align: 'right', sortable: true, width: '8rem', render: (t) => <PctChip value={t.onTimePct} target={95} /> },
    { key: 'damagePct', header: 'Damage rate', align: 'right', sortable: true, width: '9.5rem', render: (t) => (
      <span className={cn('tabular text-xs font-medium', t.damagePct <= 0.2 ? 'text-success' : t.damagePct <= 0.5 ? 'text-warning' : 'text-danger')}>
        {t.damagePct.toFixed(2)}%
      </span>
    ) },
    { key: 'avgTransitDays', header: 'Average transit', align: 'right', sortable: true, width: '10rem', render: (t) => (
      <span className="tabular text-xs text-fg-muted">{t.avgTransitDays.toFixed(1)} days</span>
    ) },
    ...(canSeeValue
      ? [{
          key: 'freightPerKg', header: 'Freight per kg', align: 'right' as const, sortable: true, width: '10rem',
          render: (t: TransporterScore) => (
            <span className={cn('tabular text-xs', t.freightPerKg > 12 ? 'text-warning' : 'text-fg')}>{formatCurrency(t.freightPerKg)}</span>
          ),
        }]
      : []),
    { key: 'score', header: 'Score', align: 'right', sortable: true, width: '7.5rem', accessor: (t) => rank(t), render: (t) => (
      <span className={cn('tabular text-xs font-semibold', rank(t) >= 85 ? 'text-success' : rank(t) >= 70 ? 'text-warning' : 'text-danger')}>
        {rank(t).toFixed(0)}
      </span>
    ) },
    { key: 'verdict', header: 'Reading', render: (t) => (
      <span className="text-2xs text-fg-muted">
        {t.onTimePct < 90
          ? 'Late too often — the delays land on the customer, not on us'
          : t.damagePct > 0.5
            ? 'Reliable on time but damages too much; check how loads are secured'
            : t.freightPerKg > 15
              ? 'Good service at a premium price. Right for urgent, wrong for routine'
              : 'Solid on all three measures'}
      </span>
    ) },
  ]

  const regionColumns: Column<RegionDispatch>[] = [
    { key: 'region', header: 'Region', sortable: true, width: '10rem', render: (r) => (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: regionColour(r.region) }} />
        <span className="text-xs font-medium text-fg">{r.region}</span>
      </div>
    ) },
    { key: 'cartons', header: 'Cartons', align: 'right', sortable: true, width: '9rem', render: (r) => (
      <span className="tabular text-xs">{r.cartons.toLocaleString('en-IN')}</span>
    ) },
    { key: 'weightKg', header: 'Weight', align: 'right', sortable: true, width: '10rem', render: (r) => (
      <span className="tabular text-xs">{r.weightKg.toLocaleString('en-IN')} kg</span>
    ) },
    ...(canSeeValue
      ? [{ key: 'value', header: 'Dispatched value', align: 'right' as const, sortable: true, width: '12rem', render: (r: RegionDispatch) => formatCurrency(r.value) }]
      : []),
    { key: 'onTimePct', header: 'On time', align: 'right', sortable: true, width: '8rem', render: (r) => <PctChip value={r.onTimePct} target={95} /> },
    { key: 'share', header: 'Share of cartons', width: '13rem', accessor: (r) => r.cartons, render: (r) => {
      const totalCartons = regions.reduce((s, x) => s + x.cartons, 0)
      const pct = totalCartons ? (r.cartons / totalCartons) * 100 : 0
      return (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: regionColour(r.region) }} />
          </div>
          <span className="text-2xs tabular text-fg-muted">{pct.toFixed(1)}%</span>
        </div>
      )
    } },
    { key: 'reading', header: 'Reading', render: (r) => (
      <span className="text-2xs text-fg-muted">
        {r.onTimePct >= 95
          ? 'Meeting the promise consistently'
          : r.onTimePct >= 88
            ? 'Slipping — worth checking which transporter carries this region'
            : 'Regularly late. Either the promise is wrong or the carrier is.'}
      </span>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'TRANSPORTER'
          ? exportRows(format, 'transporter-performance', 'Transporter performance', columnsFromTable(transporterColumns), ranked)
          : exportRows(format, 'route-performance', 'Route & region performance', columnsFromTable(regionColumns), regions)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Transporter & route performance"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Performance' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/dispatch/vehicles')}>Vehicles</Button>}
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg tabular">{totalTrips}</span> trips across {scores.length} transporters ·{' '}
        weighted on-time <PctChip value={weightedOnTime} target={95} />
        {best && (
          <>
            {' '}· best is <span className="font-medium text-success">{best.transporter}</span>, weakest is{' '}
            <span className="font-medium text-danger">{worst.transporter}</span>
          </>
        )}
        .
      </p>

      {tab === 'TRANSPORTER' ? (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="On-time delivery" description="The measure the customer actually feels" />
              <CardBody className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ranked} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                    <XAxis type="number" domain={[70, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="transporter" width={110} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DispatchChartTip suffix="%" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Bar dataKey="onTimePct" name="On time" radius={[0, 3, 3, 0]} maxBarSize={18}>
                      {ranked.map((t, i) => (
                        <Cell key={i} fill={t.onTimePct >= 95 ? '#10b981' : t.onTimePct >= 88 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Damage rate" description="Anything above half a percent is a packing or securing problem" />
              <CardBody className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ranked} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="transporter" width={110} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DispatchChartTip suffix="%" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Bar dataKey="damagePct" name="Damage" radius={[0, 3, 3, 0]} maxBarSize={18}>
                      {ranked.map((t, i) => (
                        <Cell key={i} fill={t.damagePct <= 0.2 ? '#10b981' : t.damagePct <= 0.5 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </div>

          <DataTable
            rows={ranked}
            columns={transporterColumns}
            rowKey={(t) => t.transporter}
            searchPlaceholder="Search transporter…"
            onExport={doExport}
            emptyTitle="No transporter data"
            rowClassName={(t) => cn(rank(t) < 70 && 'bg-danger/[0.04]', rank(t) >= 90 && 'bg-success/[0.03]')}
            rowActions={(t) => (
              <>
                <MenuItem label="Edit the contract terms" onClick={() => navigate('/masters/transporter')} />
                <MenuItem
                  label="Delete from the scorecard"
                  danger
                  onClick={() =>
                    toast.error(
                      'Cannot delete',
                      `${t.transporter} has ${t.trips} completed trips behind this score. Performance history is derived from shipments and cannot be deleted — deactivate the transporter in the master instead.`,
                    )
                  }
                />
                <MenuItem separatorBefore label="See their shipments" onClick={() => navigate('/dispatch/shipments')} />
                <MenuItem label="See their freight bills" onClick={() => navigate('/dispatch/freight')} />
                <MenuItem label="Print the scorecard" onClick={() => doExport('pdf')} />
              </>
            )}
          />

          <Card className="mt-4">
            <CardHeader title="How the score is built" description="Three measures, deliberately weighted" />
            <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
              <p>
                <span className="font-medium text-fg">On time — half the score.</span> It is the only measure the customer
                experiences directly. A transporter who is cheap and careful but always a day late still generates complaints.
              </p>
              <p>
                <span className="font-medium text-fg">Damage — three tenths.</span> Damage costs twice: the replacement and the
                credit note. It is also the measure that most often traces back to our own packing rather than their driving.
              </p>
              <p>
                <span className="font-medium text-fg">Cost — one fifth.</span> Weighted last on purpose. The cheapest carrier per
                kilogram is frequently the most expensive once claims and re-deliveries are counted.
              </p>
            </CardBody>
          </Card>
        </>
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader title="Dispatch by region" description="Volume against on-time performance — the two do not always move together" />
            <CardBody className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regions} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="region" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<DispatchChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Bar dataKey="cartons" name="Cartons" radius={[3, 3, 0, 0]} maxBarSize={40}>
                    {regions.map((r, i) => (
                      <Cell key={i} fill={regionColour(r.region)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <DataTable
            rows={regions}
            columns={regionColumns}
            rowKey={(r) => r.region}
            searchPlaceholder="Search region…"
            onExport={doExport}
            emptyTitle="No region data"
            rowClassName={(r) => cn(r.onTimePct < 88 && 'bg-danger/[0.04]')}
            rowActions={(r) => (
              <>
                <MenuItem label="Edit the delivery promise" onClick={() => navigate('/dispatch/planning')} />
                <MenuItem
                  label="Delete the region"
                  danger
                  onClick={() =>
                    toast.error(
                      'Cannot delete',
                      `${r.region} carries ${r.cartons.toLocaleString('en-IN')} dispatched cartons. Regions come from the customer master and cannot be deleted here.`,
                    )
                  }
                />
                <MenuItem separatorBefore label="See shipments to this region" onClick={() => navigate('/dispatch/shipments')} />
                <MenuItem label="See freight for this region" onClick={() => navigate('/dispatch/freight')} />
              </>
            )}
          />

          <Card className="mt-4">
            <CardHeader title="Reading the region table" />
            <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
              <p>
                <span className="font-medium text-fg">Export leads on on-time</span> because the promise is measured against a
                vessel schedule with weeks of slack, not a next-day dock appointment.
              </p>
              <p>
                <span className="font-medium text-fg">East is the weak region.</span> Low volume and the worst on-time figure
                usually means it is served by whoever is available rather than by a contracted carrier.
              </p>
              <p>
                <span className="font-medium text-fg">Share of cartons matters more than value</span> for planning: cartons and
                weight fill vehicles, rupees do not.
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
