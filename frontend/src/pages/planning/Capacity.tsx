import { useMemo, useState } from 'react'
import { Download, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, DetailBlock, LoadCell } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { bucketIndex, capacityPlan, workingDaysInBucket, type CrpRow } from '@/lib/planFlow'
import { defaultRoutingFor } from '@/lib/engFlow'
import { usePlanningData } from './usePlanningData'

/**
 * Capacity requirement planning and bottleneck analysis (Ch 9 and 17).
 *
 * MRP will happily plan more work than the plant can do — it nets material, not
 * hours. This is the screen that catches it, before the orders are released
 * rather than after the shift has run out of time.
 *
 * Available hours are derated by each centre's OEE target, because planning
 * against nameplate hours is how a board that reads 90% turns out to be 115%.
 */

type Source = 'PLANNED' | 'FIRM' | 'BOTH'

export function CapacityPage() {
  const toast = useToast()
  const { mrp, orders, ctx, starts } = usePlanningData()

  const [tab, setTab] = useState('grid')
  const [source, setSource] = useState<Source>('BOTH')
  const [detail, setDetail] = useState<CrpRow | null>(null)

  /** Where the load comes from: MRP suggestions, firmed orders, or both. */
  const demand = useMemo(() => {
    const rows: { productCode: string; qty: number; bucket: number; ref: string }[] = []
    if (source === 'PLANNED' || source === 'BOTH') {
      for (const o of mrp.plannedOrders) {
        if (o.orderType !== 'PRODUCTION') continue
        rows.push({ productCode: o.itemCode, qty: o.qty, bucket: Math.max(0, o.releaseBucket), ref: `MRP week ${o.bucket + 1}` })
      }
    }
    if (source === 'FIRM' || source === 'BOTH') {
      for (const o of orders.rows) {
        if (o.deletedAt || ['COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status)) continue
        const open = Math.max(0, o.qty - o.producedQty)
        if (open <= 0) continue
        const b = bucketIndex(o.plannedStart, starts)
        if (b < 0) continue
        rows.push({ productCode: o.productCode, qty: open, bucket: b, ref: o.docNo })
      }
    }
    return rows
  }, [mrp.plannedOrders, orders.rows, source, starts])

  const crp = useMemo(() => capacityPlan(demand, ctx, starts), [demand, ctx, starts])

  const bottlenecks = crp.filter((r) => r.isBottleneck)
  const totalRequired = crp.reduce((s, r) => s + r.totalRequired, 0)
  const totalAvailable = crp.reduce((s, r) => s + r.totalAvailable, 0)
  const overallLoad = totalAvailable > 0 ? (totalRequired / totalAvailable) * 100 : 0

  /** What each work centre's peak week looks like, for the chart. */
  const chart = crp.map((r) => ({
    name: r.workCentreCode,
    Peak: Number(r.peakLoadPct.toFixed(0)),
  }))

  /** Which orders load a given centre, for the drawer. */
  const contributors = useMemo(() => {
    if (!detail) return []
    const out: { ref: string; productCode: string; qty: number; bucket: number; hours: number }[] = []
    for (const d of demand) {
      const routing = defaultRoutingFor(d.productCode, ctx.routings)
      if (!routing) continue
      const hours = routing.operations
        .filter((o) => o.workCentreCode === detail.workCentreCode)
        .reduce((s, o) => s + o.setupMinutes / 60 + (d.qty * o.cycleSeconds) / 3600, 0)
      if (hours > 0) out.push({ ...d, hours })
    }
    return out.sort((a, b) => b.hours - a.hours)
  }, [detail, demand, ctx.routings])

  function doExport(format: ExportFormat) {
    interface Row { centre: string; name: string; week: string; required: string; available: string; load: string }
    const data: Row[] = crp.flatMap((r) =>
      r.cells.map((c) => ({
        centre: r.workCentreCode,
        name: r.workCentreName,
        week: `W${c.bucket + 1} (${c.start})`,
        required: c.requiredHours.toFixed(1),
        available: c.availableHours.toFixed(1),
        load: c.loadPct.toFixed(0) + '%',
      })),
    )
    const columns: ExportColumn<Row>[] = [
      { header: 'Work centre', value: (r) => r.centre },
      { header: 'Name', value: (r) => r.name },
      { header: 'Week', value: (r) => r.week },
      { header: 'Required hours', value: (r) => r.required },
      { header: 'Available hours', value: (r) => r.available },
      { header: 'Load', value: (r) => r.load },
    ]
    const n = exportRows(format, 'capacity-plan', 'Capacity requirement plan', columns, data)
    toast.success('Export ready', `${n} rows written.`)
  }

  return (
    <div>
      <PageHeader
        title="Capacity planning"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Capacity' }]}
        actions={
          <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => doExport('xlsx')}>
            Export
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'grid', label: 'Load by week' },
              { id: 'bottleneck', label: 'Bottlenecks', count: bottlenecks.length },
            ]}
          />
        }
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3.5 sm:grid-cols-4">
          <Select
            label="Load from"
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            options={[
              { value: 'BOTH', label: 'Firm orders and MRP suggestions' },
              { value: 'FIRM', label: 'Firm orders only' },
              { value: 'PLANNED', label: 'MRP suggestions only' },
            ]}
          />
          <div className="flex flex-col justify-end pb-1">
            <p className="text-2xs text-fg-subtle">Hours required</p>
            <p className="text-sm font-semibold tabular text-fg">{totalRequired.toFixed(0)} h</p>
          </div>
          <div className="flex flex-col justify-end pb-1">
            <p className="text-2xs text-fg-subtle">Hours available</p>
            <p className="text-sm font-semibold tabular text-fg">{totalAvailable.toFixed(0)} h</p>
          </div>
          <div className="flex flex-col justify-end pb-1">
            <p className="text-2xs text-fg-subtle">Overall load</p>
            <p className={cn('text-sm font-semibold tabular', overallLoad > 100 ? 'text-danger' : overallLoad > 85 ? 'text-warning' : 'text-success')}>
              {overallLoad.toFixed(0)}%
            </p>
          </div>
        </CardBody>
      </Card>

      {bottlenecks.length > 0 ? (
        <Alert tone="danger" className="mb-4">
          {bottlenecks.length} work centre{bottlenecks.length === 1 ? '' : 's'} go{bottlenecks.length === 1 ? 'es' : ''} over
          100% in at least one week: {bottlenecks.map((b) => `${b.workCentreCode} (peak ${b.peakLoadPct.toFixed(0)}%)`).join(', ')}. Overall load
          is only {overallLoad.toFixed(0)}%, so the problem is timing, not total capacity — move work into the quieter
          weeks before adding a shift.
        </Alert>
      ) : (
        <Alert tone="info" className="mb-4">
          No work centre exceeds its available hours in any week of the horizon. Peak load is{' '}
          {Math.max(0, ...crp.map((r) => r.peakLoadPct)).toFixed(0)}% at {crp[0]?.workCentreCode ?? '—'}.
        </Alert>
      )}

      {tab === 'grid' && (
        <>
          <Card className="mb-4">
            <CardHeader title="Peak load by work centre" description="The busiest single week in the horizon, against available hours" />
            <CardBody className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} unit="%" />
                  <Tooltip content={<ChartTip suffix="%" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 3" label={{ value: 'capacity', fontSize: 10, fill: '#ef4444', position: 'right' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar dataKey="Peak" name="Peak load" radius={[3, 3, 0, 0]} maxBarSize={34}>
                    {chart.map((d) => (
                      <Cell key={d.name} fill={d.Peak > 100 ? '#ef4444' : d.Peak > 85 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Load heat map" description="Percentage of each centre's available hours consumed, week by week" />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '14rem' }}>Work centre</th>
                      {starts.map((s, b) => (
                        <th key={s} className="text-center" style={{ minWidth: '3.5rem' }}>
                          <span className="block">W{b + 1}</span>
                          <span className="block text-[9px] font-normal normal-case text-fg-subtle">{workingDaysInBucket(s, ctx.calendar)}d</span>
                        </th>
                      ))}
                      <th className="text-right" style={{ width: '6rem' }}>Peak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crp.map((r) => (
                      <tr key={r.workCentreCode} className="cursor-pointer" onClick={() => setDetail(r)}>
                        <td>
                          <p className="text-xs font-medium text-fg">{r.workCentreName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{r.workCentreCode}</p>
                        </td>
                        {r.cells.map((c) => (
                          <td key={c.bucket} className="px-1 text-center" title={`${c.requiredHours.toFixed(1)} h of ${c.availableHours.toFixed(1)} h`}>
                            <LoadCell pct={c.loadPct} compact />
                          </td>
                        ))}
                        <td className="text-right">
                          {r.isBottleneck ? (
                            <Badge tone="danger" size="sm">{r.peakLoadPct.toFixed(0)}%</Badge>
                          ) : (
                            <span className="text-xs tabular text-fg-muted">{r.peakLoadPct.toFixed(0)}%</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
          <p className="mt-2 text-2xs text-fg-subtle">
            Available hours = working days from the production calendar × the centre's shift hours × its OEE target. The
            day count under each week already excludes holidays and the maintenance shutdown.
          </p>
        </>
      )}

      {tab === 'bottleneck' && (
        <Card>
          <CardHeader title="Bottleneck analysis" description="Where the plan exceeds capacity, and what can be done about it" />
          <CardBody className="p-0">
            {bottlenecks.length === 0 ? (
              <p className="p-4 text-xs text-fg-subtle">No centre is overloaded in any week.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Work centre</th>
                      <th className="text-right" style={{ width: '7rem' }}>Peak load</th>
                      <th className="text-right" style={{ width: '8rem' }}>Weeks over</th>
                      <th className="text-right" style={{ width: '9rem' }}>Hours over</th>
                      <th>Options</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bottlenecks.map((r) => {
                      const over = r.cells.filter((c) => c.loadPct > 100)
                      const excessHours = over.reduce((s, c) => s + (c.requiredHours - c.availableHours), 0)
                      const slackWeeks = r.cells.filter((c) => c.loadPct < 60).length
                      return (
                        <tr key={r.workCentreCode}>
                          <td>
                            <p className="text-xs font-medium text-fg">{r.workCentreName}</p>
                            <p className="font-mono text-2xs text-fg-subtle">{r.workCentreCode}</p>
                          </td>
                          <td className="text-right"><Badge tone="danger" size="sm">{r.peakLoadPct.toFixed(0)}%</Badge></td>
                          <td className="text-right text-xs tabular">
                            {over.map((c) => `W${c.bucket + 1}`).join(', ')}
                          </td>
                          <td className="text-right text-xs tabular text-danger">{excessHours.toFixed(0)} h</td>
                          <td className="text-xs text-fg-muted">
                            {slackWeeks > 0
                              ? `Move work into the ${slackWeeks} week${slackWeeks === 1 ? '' : 's'} under 60% load, or add ${Math.ceil(excessHours / 8)} shift${Math.ceil(excessHours / 8) === 1 ? '' : 's'}.`
                              : `No slack week to move into — ${Math.ceil(excessHours / 8)} extra shift${Math.ceil(excessHours / 8) === 1 ? '' : 's'} or subcontracting is the only route.`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* What loads this centre --------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.workCentreCode} — ${detail.workCentreName}` : ''}
        description={detail ? `Peak ${detail.peakLoadPct.toFixed(0)}% · ${detail.totalRequired.toFixed(0)} h required of ${detail.totalAvailable.toFixed(0)} h available` : ''}
        width="max-w-3xl"
      >
        {detail && (
          <div className="space-y-5">
            <DetailBlock title="Load by week">
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '5rem' }}>Week</th>
                      <th style={{ width: '8rem' }}>Starting</th>
                      <th className="text-right" style={{ width: '8rem' }}>Required</th>
                      <th className="text-right" style={{ width: '8rem' }}>Available</th>
                      <th>Load</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.cells.map((c) => (
                      <tr key={c.bucket} className={c.loadPct > 100 ? 'bg-danger/5' : undefined}>
                        <td className="text-xs tabular">W{c.bucket + 1}</td>
                        <td className="text-2xs text-fg-muted">{formatDate(c.start)}</td>
                        <td className="text-right tabular text-xs">{c.requiredHours.toFixed(1)} h</td>
                        <td className="text-right tabular text-xs text-fg-muted">{c.availableHours.toFixed(1)} h</td>
                        <td><LoadCell pct={c.loadPct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title={`What is loading it (${contributors.length})`}>
              {!contributors.length ? (
                <p className="text-xs text-fg-subtle">Nothing in the current plan routes through this centre.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Product</th>
                        <th className="text-right" style={{ width: '7rem' }}>Quantity</th>
                        <th className="text-right" style={{ width: '5rem' }}>Week</th>
                        <th className="text-right" style={{ width: '7rem' }}>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributors.map((c, i) => (
                        <tr key={i}>
                          <td className="font-mono text-2xs text-fg-muted">{c.ref}</td>
                          <td className="font-mono text-2xs">{c.productCode}</td>
                          <td className="text-right tabular text-xs">{c.qty.toLocaleString('en-IN')}</td>
                          <td className="text-right text-xs tabular">W{c.bucket + 1}</td>
                          <td className="text-right tabular text-xs font-medium">{c.hours.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DetailBlock>

            {detail.isBottleneck && (
              <Alert tone="warning" title="This centre is a constraint">
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Every hour recovered here moves the whole plan. Everywhere else, an hour saved just creates idle time.
                </span>
              </Alert>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
