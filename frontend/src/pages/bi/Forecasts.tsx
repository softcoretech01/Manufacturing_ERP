import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Check, Play, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { BiChartTip, ModuleChip, SourceNote, formatMetric } from '@/components/bi/BiShell'
import { failureRisks as seedRisks, forecastModels as seedModels } from '@/mock/bi'
import { useCollection } from '@/store/data'
import { formatCompact, formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { FailureRisk, ForecastModel } from '@/types/bi'

/**
 * Predictive analytics.
 *
 * A forecast that shows a single confident line is a lie told with a chart. Every
 * model here plots its confidence band and states its backtest error, and the
 * band widens with distance because that is what actually happens to a forecast.
 * A model with 22% error is shown as such rather than quietly dropped, so people
 * can decide how much weight to put on it.
 */

const SUBJECT_LABEL: Record<ForecastModel['subject'], string> = {
  SALES_DEMAND: 'Demand',
  MATERIAL_CONSUMPTION: 'Material consumption',
  INVENTORY_LEVEL: 'Inventory level',
  MACHINE_FAILURE: 'Machine failure',
  LABOUR_REQUIREMENT: 'Labour requirement',
  CASH_FLOW: 'Cash flow',
  REVENUE: 'Revenue',
  MAINTENANCE_DUE: 'Maintenance due',
}

const METHOD_LABEL: Record<ForecastModel['method'], string> = {
  MOVING_AVERAGE: 'Moving average',
  LINEAR_TREND: 'Linear trend',
  SEASONAL: 'Seasonal',
  WEIGHTED: 'Weighted average',
  CROSTON: 'Croston (intermittent)',
}

/** Below 10% error a forecast is worth planning on; above 20% it is a hint. */
function accuracyTone(errorPct: number) {
  if (errorPct <= 10) return { tone: 'success' as const, word: 'Reliable' }
  if (errorPct <= 20) return { tone: 'warning' as const, word: 'Indicative' }
  return { tone: 'danger' as const, word: 'Weak' }
}

function ForecastChart({ model }: { model: ForecastModel }) {
  // Recharts stacks an Area from its own baseline, so the band is drawn as a
  // transparent floor at `lower` plus a visible ribbon of (upper − lower).
  const data = model.series.map((p) => ({
    period: p.period,
    actual: p.actual,
    forecast: p.forecast,
    floor: p.lower,
    band: p.lower !== null && p.upper !== null ? p.upper - p.lower : null,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }}
          axisLine={false}
          tickLine={false}
          width={model.format === 'CURRENCY' ? 52 : 44}
          tickFormatter={(v) => (model.format === 'CURRENCY' ? formatCompact(Number(v)) : String(v))}
        />
        <Tooltip content={<BiChartTip prefix={model.format === 'CURRENCY' ? '₹' : ''} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
        <Area dataKey="floor" stackId="band" stroke="none" fill="transparent" legendType="none" name="  " />
        <Area
          dataKey="band"
          stackId="band"
          stroke="none"
          fill="#7c3aed"
          fillOpacity={0.14}
          name="Confidence band"
          connectNulls
        />
        <Line type="monotone" dataKey="actual" name="Actual" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} connectNulls />
        <Line
          type="monotone"
          dataKey="forecast"
          name="Forecast"
          stroke="#7c3aed"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 2 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function ModelCard({ model, onRun }: { model: ForecastModel; onRun: (m: ForecastModel) => void }) {
  const acc = accuracyTone(model.accuracyPct)
  const lastActual = [...model.series].reverse().find((p) => p.actual !== null)
  const nextForecast = model.series.find((p) => p.actual === null && p.forecast !== null)
  const change =
    lastActual?.actual && nextForecast?.forecast
      ? ((nextForecast.forecast - lastActual.actual) / lastActual.actual) * 100
      : null

  return (
    <Card>
      <CardHeader
        title={model.name}
        description={`${METHOD_LABEL[model.method]} over ${model.historyPeriods} periods, projected ${model.horizonPeriods} ahead`}
        actions={
          <div className="flex items-center gap-2">
            <ModuleChip module={model.module} />
            <Badge tone={acc.tone}>
              {acc.word} · ±{model.accuracyPct.toFixed(1)}%
            </Badge>
          </div>
        }
      />
      <CardBody className="h-56">
        <ForecastChart model={model} />
      </CardBody>
      <CardBody className="border-t border-border">
        <p className="mb-2 text-xs leading-relaxed text-fg">{model.headline}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-subtle">
          <span>{SUBJECT_LABEL[model.subject]}</span>
          {change !== null && (
            <span className={change >= 0 ? 'text-success' : 'text-danger'}>
              Next period {change >= 0 ? '+' : ''}
              {change.toFixed(1)}% on the last actual
            </span>
          )}
          <span>Last run {formatDate(model.lastRunOn)}</span>
          <span>Next run {formatDate(model.nextRunOn)}</span>
          <span className="ml-auto flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={() => onRun(model)}>
              <Play size={12} /> Re-run
            </Button>
            {model.drillTo && (
              <Link to={model.drillTo} className="font-medium text-brand-600 hover:underline">
                Evidence →
              </Link>
            )}
          </span>
        </div>
        {model.accuracyPct > 20 && (
          <p className="mt-2 rounded border border-warning/40 bg-warning/5 px-2 py-1 text-2xs leading-relaxed text-fg-muted">
            Backtest error is above 20%, so treat this as a direction rather than a number. Plan to the confidence band,
            not to the line.
          </p>
        )}
      </CardBody>
    </Card>
  )
}

export function BiForecastsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('models')

  const models = useCollection<ForecastModel & { uid: string }>('bi.forecasts', seedModels)
  const risks = useCollection<FailureRisk & { uid: string }>('bi.failureRisks', seedRisks)

  const [ackTarget, setAckTarget] = useState<FailureRisk | null>(null)
  const [ackNote, setAckNote] = useState('')

  const activeModels = models.rows.filter((m) => m.isActive)
  const weak = activeModels.filter((m) => m.accuracyPct > 20)

  const riskRows = useMemo(
    () => risks.rows.slice().sort((a, b) => b.failureProbabilityPct - a.failureProbabilityPct),
    [risks.rows],
  )
  const urgent = riskRows.filter((r) => r.status === 'URGENT')
  const exposure = riskRows.reduce((s, r) => s + (r.status === 'MONITOR' ? 0 : r.estimatedImpact), 0)

  function runModel(m: ForecastModel) {
    // Re-running does not invent new numbers; it restamps the run and says so.
    models.update(m.uid, { lastRunOn: new Date().toISOString().slice(0, 10) })
    toast.success(`${m.name} re-run against the current data`)
  }

  /** Scheduling a PM is the whole point of the risk list, so it changes state. */
  function scheduleWork(risk: FailureRisk) {
    risks.update(risk.uid, { status: 'SCHEDULE_PM' })
    toast.success(`${risk.machineCode} queued for preventive work`)
  }

  function acknowledge() {
    if (!ackTarget) return
    risks.update(ackTarget.uid, {
      status: 'MONITOR',
      recommendation: ackNote.trim()
        ? `${ackTarget.recommendation} — reviewed: ${ackNote.trim()}`
        : ackTarget.recommendation,
    })
    toast.success(`${ackTarget.machineCode} moved to monitoring`)
    setAckTarget(null)
    setAckNote('')
  }

  const riskColumns: Column<FailureRisk>[] = [
    {
      key: 'machineCode',
      header: 'Machine',
      render: (r) => (
        <div>
          <p className="font-medium text-fg">{r.machineCode}</p>
          <p className="text-2xs text-fg-subtle">
            {r.machineName} · {r.line}
          </p>
        </div>
      ),
    },
    {
      key: 'criticality',
      header: 'Criticality',
      render: (r) => (
        <Badge tone={r.criticality === 'CRITICAL' ? 'danger' : r.criticality === 'HIGH' ? 'warning' : 'neutral'}>
          {r.criticality.charAt(0) + r.criticality.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'failureProbabilityPct',
      header: 'Risk of stopping (30 days)',
      align: 'left',
      render: (r) => (
        <div className="min-w-[9rem]">
          <div className="mb-0.5 flex items-center justify-between text-2xs">
            <span className="tabular font-medium text-fg">{r.failureProbabilityPct.toFixed(0)}%</span>
            <span className="text-fg-subtle">{r.predictedFailureWindow}</span>
          </div>
          <ProgressBar
            value={r.failureProbabilityPct}
            tone={r.failureProbabilityPct >= 60 ? 'danger' : r.failureProbabilityPct >= 35 ? 'warning' : 'success'}
          />
        </div>
      ),
    },
    {
      key: 'runHoursSinceService',
      header: 'Service position',
      align: 'right',
      render: (r) => {
        const over = r.runHoursSinceService > r.serviceIntervalHours
        return (
          <div className="text-right">
            <p className={cn('tabular text-xs', over ? 'font-medium text-danger' : 'text-fg')}>
              {r.runHoursSinceService.toLocaleString('en-IN')} / {r.serviceIntervalHours.toLocaleString('en-IN')} h
            </p>
            <p className="text-2xs text-fg-subtle">
              {over
                ? `${(r.runHoursSinceService - r.serviceIntervalHours).toLocaleString('en-IN')} h overdue`
                : `${(r.serviceIntervalHours - r.runHoursSinceService).toLocaleString('en-IN')} h to go`}
            </p>
          </div>
        )
      },
    },
    {
      key: 'breakdownsLast90Days',
      header: 'History',
      align: 'right',
      render: (r) => (
        <div className="text-right">
          <p className="tabular text-xs text-fg">{r.breakdownsLast90Days} stops / 90 days</p>
          <p className="text-2xs text-fg-subtle">MTBF {r.mtbfHours.toLocaleString('en-IN')} h</p>
        </div>
      ),
    },
    {
      key: 'estimatedImpact',
      header: 'If it stops',
      align: 'right',
      render: (r) => (
        <div className="text-right">
          <p className="tabular text-xs text-fg">{formatCompact(r.estimatedImpact)}</p>
          <p className="text-2xs text-fg-subtle">{r.estimatedDowntimeHours} h out</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div>
          <Badge tone={r.status === 'URGENT' ? 'danger' : r.status === 'SCHEDULE_PM' ? 'warning' : 'success'}>
            {r.status === 'SCHEDULE_PM' ? 'Schedule PM' : r.status.charAt(0) + r.status.slice(1).toLowerCase()}
          </Badge>
          <p className="mt-0.5 max-w-[16rem] text-2xs leading-snug text-fg-subtle">{r.recommendation}</p>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Forecasts & predictions"
        description="Every model states its method and its backtest error, and plots the band rather than a single confident line"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Forecasts' }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active models" value={String(activeModels.length)} icon={<TrendingUp size={16} />} tone="brand" />
        <StatTile
          label="Weak models"
          value={String(weak.length)}
          sub={weak.length ? 'Backtest error above 20% — direction only' : 'All models inside 20% error'}
          icon={<AlertTriangle size={16} />}
          tone={weak.length ? 'warning' : 'success'}
        />
        <StatTile
          label="Machines needing work now"
          value={String(urgent.length)}
          sub={urgent.length ? urgent.map((u) => u.machineCode).join(', ') : 'Nothing urgent'}
          icon={<AlertTriangle size={16} />}
          tone={urgent.length ? 'danger' : 'success'}
        />
        <StatTile
          label="Output at risk"
          value={formatCompact(exposure)}
          sub="Value behind machines flagged urgent or due"
          tone="warning"
        />
      </div>

      <Tabs
        variant="pill"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'models', label: 'Forecast models', count: activeModels.length },
          { id: 'failure', label: 'Machine failure risk', count: riskRows.length },
        ]}
      />

      {tab === 'models' && (
        <div className="mt-4">
          <Card className="mb-4">
            <CardBody className="text-2xs leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">How to read these.</span> The solid line is what happened, the dashed
              line is what the model expects, and the shaded ribbon is the range it is willing to commit to. Plan
              capacity and material to the top of the band and cash to the bottom of it — the line itself is the least
              useful part of a forecast.
            </CardBody>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            {activeModels.map((m) => (
              <ModelCard key={m.uid} model={m} onRun={runModel} />
            ))}
          </div>
          {activeModels.length === 0 && (
            <Card>
              <CardBody className="py-10 text-center text-xs text-fg-muted">No active forecast models.</CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === 'failure' && (
        <div className="mt-4">
          <Card className="mb-4">
            <CardBody className="text-2xs leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">This is not a prediction of a date.</span> The probability is
              modelled from hours run past the service interval and how often the machine has stopped recently. It is
              here to order the maintenance queue — a 70% machine should be worked on before a 30% one, whatever the
              schedule says.
            </CardBody>
          </Card>

          <DataTable
            rows={riskRows}
            columns={riskColumns}
            rowKey={(r) => r.uid}
            dense
            emptyTitle="No assets under watch"
            rowActions={(r) => (
              <>
                <MenuItem
                  label="Schedule preventive work"
                  disabled={r.status === 'SCHEDULE_PM'}
                  onClick={() => scheduleWork(r)}
                />
                <MenuItem
                  separatorBefore
                  label="Acknowledge and monitor"
                  onClick={() => {
                    setAckTarget(r)
                    setAckNote('')
                  }}
                />
              </>
            )}
          />

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {riskRows.slice(0, 3).map((r) => (
              <Card key={r.uid}>
                <CardHeader
                  title={r.machineCode}
                  description={r.machineName}
                  actions={
                    <Badge tone={r.status === 'URGENT' ? 'danger' : r.status === 'SCHEDULE_PM' ? 'warning' : 'success'}>
                      {r.failureProbabilityPct.toFixed(0)}%
                    </Badge>
                  }
                />
                <CardBody className="space-y-2 text-2xs leading-relaxed text-fg-muted">
                  <p>
                    <span className="font-medium text-fg">Why it is flagged:</span> {r.breakdownsLast90Days} unplanned
                    stops in ninety days against an MTBF of {r.mtbfHours.toLocaleString('en-IN')} hours, and{' '}
                    {r.runHoursSinceService.toLocaleString('en-IN')} hours run since the last service on a{' '}
                    {r.serviceIntervalHours.toLocaleString('en-IN')} hour interval.
                  </p>
                  <p>
                    <span className="font-medium text-fg">If it stops:</span> {r.estimatedDowntimeHours} hours out and
                    about {formatCompact(r.estimatedImpact)} of output, on a {r.criticality.toLowerCase()} criticality
                    asset.
                  </p>
                  <p>
                    <span className="font-medium text-fg">Do this:</span> {r.recommendation} PM is due {formatDate(r.pmDueOn)}.
                  </p>
                  <Button size="xs" variant="secondary" onClick={() => scheduleWork(r)} disabled={r.status === 'SCHEDULE_PM'}>
                    <Check size={12} /> {r.status === 'SCHEDULE_PM' ? 'Already queued' : 'Queue the work'}
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={ackTarget !== null}
        onClose={() => setAckTarget(null)}
        title={ackTarget ? `Acknowledge ${ackTarget.machineCode}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAckTarget(null)}>
              Cancel
            </Button>
            <Button onClick={acknowledge} disabled={ackNote.trim().length < 5}>
              Move to monitoring
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-fg-muted">
          Moving a flagged machine back to monitoring means somebody has looked at it and judged the risk acceptable.
          Say why, so the next person reading this list knows it was a decision and not an oversight.
        </p>
        <Textarea
          label="What did you find?"
          value={ackNote}
          onChange={(e) => setAckNote(e.target.value)}
          rows={3}
          placeholder="Bearing checked on 28th, temperature normal, next inspection at the weekend shutdown"
        />
        {ackTarget && (
          <p className="mt-3 text-2xs text-fg-subtle">
            Current reading: {formatMetric(ackTarget.failureProbabilityPct, 'PERCENT')} chance of an unplanned stop,
            worth about {formatCompact(ackTarget.estimatedImpact)} — last updated {formatDateTime(ackTarget.pmDueOn)}.
          </p>
        )}
      </Modal>

      <SourceNote
        modules={['MAINTENANCE', 'PRODUCTION', 'INVENTORY', 'FINANCE', 'DISPATCH']}
        note="Models run on a schedule against the operational tables. Re-running restamps the run date; it does not fabricate new history."
      />
    </div>
  )
}
