import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { Duration, MachineDot, MesChartTip, OeeBar } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { machines as seedMachines, oeeTrend } from '@/mock/mes'
import { oeeOf } from './Machines'
import type { Machine } from '@/types/mes'

/**
 * OEE — availability × performance × quality. Kept deliberately transparent:
 * every figure on this page can be traced to the run minutes, the piece counts
 * and the downtime events that produced it.
 */
export function OeePage() {
  const toast = useToast()
  const seed = useMemo(() => seedMachines, [])
  const { rows: machines } = useCollection<Machine>('mes:machine', seed)

  const [period, setPeriod] = useState<'shift' | 'week'>('shift')
  const [line, setLine] = useState('all')

  const filtered = machines.filter((m) => (line === 'all' ? true : m.line === line) && m.plannedMinutes > 0)
  const lines = [...new Set(machines.map((m) => m.line))]

  /** Plant OEE is computed from the totals, not by averaging machine OEEs. */
  const plant = useMemo(() => {
    const planned = filtered.reduce((s, m) => s + m.plannedMinutes, 0)
    const down = filtered.reduce((s, m) => s + m.downMinutes, 0)
    const run = filtered.reduce((s, m) => s + m.runMinutes, 0)
    const ideal = filtered.reduce((s, m) => s + (m.totalPieces * m.idealCycleSeconds) / 60, 0)
    const total = filtered.reduce((s, m) => s + m.totalPieces, 0)
    const good = filtered.reduce((s, m) => s + m.goodPieces, 0)
    const availability = planned ? ((planned - down) / planned) * 100 : 0
    const performance = run ? Math.min(100, (ideal / run) * 100) : 0
    const quality = total ? (good / total) * 100 : 0
    return { availability, performance, quality, oee: (availability * performance * quality) / 10_000, planned, down, run, total, good }
  }, [filtered])

  const worst = [...filtered].sort((a, b) => oeeOf(a).oee - oeeOf(b).oee).slice(0, 3)

  const columns: Column<Machine>[] = [
    { key: 'code', header: 'Machine', sortable: true, width: '13rem', render: (m) => (
      <div className="flex items-center gap-2">
        <MachineDot state={m.state} />
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium text-fg">{m.code}</p>
          <p className="truncate text-2xs text-fg-subtle">{m.name}</p>
        </div>
      </div>
    ) },
    { key: 'workCentre', header: 'Work centre', sortable: true },
    { key: 'plannedMinutes', header: 'Planned', width: '7rem', render: (m) => <Duration minutes={m.plannedMinutes} /> },
    { key: 'downMinutes', header: 'Down', width: '7rem', sortable: true, render: (m) => (m.downMinutes ? <span className="text-danger"><Duration minutes={m.downMinutes} /></span> : <span className="text-2xs text-success">none</span>) },
    { key: 'availability', header: 'Availability', align: 'right', width: '8rem', sortable: true, accessor: (m) => oeeOf(m).availability, render: (m) => {
      const v = oeeOf(m).availability
      return <span className={cn('tabular', v < 85 ? 'text-warning' : '')}>{v.toFixed(1)}%</span>
    } },
    { key: 'performance', header: 'Performance', align: 'right', width: '8.5rem', sortable: true, accessor: (m) => oeeOf(m).performance, render: (m) => {
      const v = oeeOf(m).performance
      return <span className={cn('tabular', v < 85 ? 'text-warning' : '')}>{v.toFixed(1)}%</span>
    } },
    { key: 'quality', header: 'Quality', align: 'right', width: '7rem', sortable: true, accessor: (m) => oeeOf(m).quality, render: (m) => {
      const v = oeeOf(m).quality
      return <span className={cn('tabular', v < 97 ? 'text-warning' : '')}>{v.toFixed(1)}%</span>
    } },
    { key: 'oee', header: 'OEE', align: 'right', width: '7rem', sortable: true, accessor: (m) => oeeOf(m).oee, render: (m) => {
      const v = oeeOf(m).oee
      return <span className={cn('font-medium tabular', v >= 85 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-danger')}>{v.toFixed(1)}%</span>
    } },
    { key: 'goodPieces', header: 'Good pieces', align: 'right', sortable: true, render: (m) => <span className="tabular">{formatQty(m.goodPieces)}</span> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'oee-report', 'OEE by machine', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="OEE"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'OEE' }]}
        tabs={
          <Tabs
            variant="pill"
            active={period}
            onChange={(v) => setPeriod(v as typeof period)}
            tabs={[{ id: 'shift', label: 'This shift' }, { id: 'week', label: 'Last 7 days' }]}
          />
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-44"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          options={[{ value: 'all', label: 'All lines' }, ...lines.map((l) => ({ value: l, label: l }))]}
        />
        <p className="text-xs text-fg-muted">
          OEE = availability × performance × quality. World class is around 85%; below 70% usually means one specific machine,
          not a general problem.
        </p>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={line === 'all' ? 'Plant OEE' : `${line} OEE`} description="Computed from the totals, not an average of machines" />
          <CardBody>
            <OeeBar availability={plant.availability} performance={plant.performance} quality={plant.quality} />
            <div className="mt-3 grid gap-2 border-t border-border pt-3 text-2xs text-fg-muted sm:grid-cols-2">
              <p>Planned <span className="block font-medium tabular text-fg">{Math.round(plant.planned)} min</span></p>
              <p>Lost to stops <span className="block font-medium tabular text-danger">{Math.round(plant.down)} min</span></p>
              <p>Pieces made <span className="block font-medium tabular text-fg">{formatQty(plant.total)}</span></p>
              <p>Good first time <span className="block font-medium tabular text-success">{formatQty(plant.good)}</span></p>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Seven-day trend" description="The three factors and the resulting OEE" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={oeeTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                <Tooltip content={<MesChartTip suffix="%" />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Line type="monotone" dataKey="availability" name="Availability" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="performance" name="Performance" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="quality" name="Quality" stroke="#10b981" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="oee" name="OEE" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader title="Where to look first" description="The three lowest machines this shift" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {worst.map((m) => {
            const o = oeeOf(m)
            const weakest = o.availability <= o.performance && o.availability <= o.quality ? 'availability' : o.performance <= o.quality ? 'performance' : 'quality'
            return (
              <div key={m.uid} className="rounded border border-border p-3">
                <p className="flex items-center gap-1.5 font-mono text-xs font-medium text-fg">
                  <MachineDot state={m.state} /> {m.code}
                </p>
                <p className="mt-1 truncate text-2xs text-fg-subtle">{m.name}</p>
                <p className={cn('mt-2 text-xl font-semibold tabular', o.oee >= 70 ? 'text-warning' : 'text-danger')}>{o.oee.toFixed(1)}%</p>
                <p className="mt-1 text-2xs text-fg-muted">
                  Weakest factor: <span className="font-medium text-fg">{weakest}</span>
                  {weakest === 'availability' && ` — ${Math.round(m.downMinutes)} minutes of stops`}
                  {weakest === 'performance' && ' — running slower than the ideal cycle'}
                  {weakest === 'quality' && ` — ${m.totalPieces - m.goodPieces} pieces not right first time`}
                </p>
              </div>
            )
          })}
        </CardBody>
      </Card>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(m) => m.uid}
        searchPlaceholder="Search machine or work centre…"
        onExport={doExport}
        emptyTitle="No machines with planned time"
      />

      <Card className="mt-4">
        <CardHeader title="What each factor actually measures" description="Kept simple on purpose — three questions, three numbers" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Availability</span> — of the time we planned to run, how much did we actually
            run? Every downtime event with a reason lands here.
          </p>
          <p>
            <span className="font-medium text-fg">Performance</span> — while running, did we hit the ideal cycle time? Slow
            running, small stops and speed losses land here.
          </p>
          <p>
            <span className="font-medium text-fg">Quality</span> — of what we made, how much was right first time? Scrap and
            rework both count against it; rework is not free.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
