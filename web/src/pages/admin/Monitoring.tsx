import { useMemo, useState } from 'react'
import { Activity, AlertTriangle, Check, HeartPulse, Timer } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { useCollection } from '@/store/data'
import { LOG_SOURCE_LABEL, summariseLogs } from '@/lib/platformFlow'
import { apiTrend, endpointMetrics, healthChecks, systemLogs as seedLogs } from '@/mock/platform'
import type { LogLevel, LogSource, SystemLog } from '@/types/platform'

/**
 * Logging and monitoring (Volume 15, Ch 17).
 *
 * Recurring faults are grouped rather than listed. Fourteen instances of one
 * timeout is one problem, and a screen that shows it fourteen times buries
 * every other problem underneath it — which is how a log stops being read.
 */

const LEVEL_TONE: Record<LogLevel, 'neutral' | 'brand' | 'warning' | 'danger'> = {
  DEBUG: 'neutral', INFO: 'brand', WARN: 'warning', ERROR: 'danger', FATAL: 'danger',
}

const HEALTH_TONE = { HEALTHY: 'success', DEGRADED: 'warning', DOWN: 'danger' } as const

/** A tooltip that matches the rest of the app. */
function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number | string; color?: string }[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-md">
      {label !== undefined && <p className="mb-0.5 text-2xs font-medium text-fg">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-2xs text-fg-muted">
          {p.color && <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />}
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular text-fg">{typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export function MonitoringPage() {
  const toast = useToast()
  const logs = useCollection<SystemLog>('plat:logs', useMemo(() => seedLogs, []))

  const [tab, setTab] = useState('health')
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'ALL'>('ALL')
  const [sourceFilter, setSourceFilter] = useState<LogSource | 'ALL'>('ALL')
  const [openUid, setOpenUid] = useState<string | null>(null)

  const live = useMemo(() => logs.rows.filter((l) => !l.deletedAt), [logs.rows])
  const detail = live.find((l) => l.uid === openUid) ?? null
  const summary = useMemo(() => summariseLogs(live), [live])

  const filtered = useMemo(
    () =>
      live
        .filter((l) => (levelFilter === 'ALL' || l.level === levelFilter) && (sourceFilter === 'ALL' || l.source === sourceFilter))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [live, levelFilter, sourceFilter],
  )

  const health = useMemo(() => ({
    down: healthChecks.filter((h) => h.status === 'DOWN'),
    degraded: healthChecks.filter((h) => h.status === 'DEGRADED'),
    healthy: healthChecks.filter((h) => h.status === 'HEALTHY').length,
  }), [])

  const api = useMemo(() => {
    const calls = endpointMetrics.reduce((s, e) => s + e.calls, 0)
    const errors = endpointMetrics.reduce((s, e) => s + e.errors, 0)
    // Slowest by p95, which is what users feel — not by max, which is one bad request.
    const slowest = endpointMetrics.slice().sort((a, b) => b.p95Ms - a.p95Ms)
    const worstErrorRate = endpointMetrics
      .map((e) => ({ ...e, rate: e.calls ? (e.errors / e.calls) * 100 : 0 }))
      .sort((a, b) => b.rate - a.rate)
    return { calls, errors, errorRate: calls ? (errors / calls) * 100 : 0, slowest, worstErrorRate }
  }, [])

  function acknowledge(l: SystemLog) {
    logs.update(l.uid, { acknowledged: true })
    toast.success('Acknowledged', 'It stays in the log; it just stops counting as unseen.')
  }

  function acknowledgeGroup(message: string) {
    const affected = live.filter((l) => l.message === message && !l.acknowledged)
    for (const l of affected) logs.update(l.uid, { acknowledged: true })
    toast.success(`${affected.length} entries acknowledged`, 'The whole group, since it is one fault.')
  }

  const logColumns: Column<SystemLog>[] = [
    { key: 'at', header: 'When', width: '13rem', render: (l) => <span className="text-2xs tabular text-fg-muted">{formatDateTime(l.at)}</span> },
    { key: 'level', header: 'Level', width: '8rem', render: (l) => <Badge tone={LEVEL_TONE[l.level]} size="sm">{l.level.toLowerCase()}</Badge> },
    { key: 'source', header: 'Source', width: '12rem', render: (l) => <Badge tone="neutral" size="sm" dot={false}>{LOG_SOURCE_LABEL[l.source]}</Badge> },
    { key: 'origin', header: 'Origin', width: '18rem', render: (l) => <span className="truncate font-mono text-2xs text-fg-muted">{l.origin}</span> },
    { key: 'message', header: 'Message', render: (l) => <p className="truncate text-xs text-fg">{l.message}</p> },
    { key: 'user', header: 'User', width: '11rem', render: (l) => <span className="text-2xs text-fg-muted">{l.userName ?? '—'}</span> },
    { key: 'duration', header: 'Took', width: '9rem', align: 'right', render: (l) => (l.durationMs === null ? <span className="text-2xs text-fg-subtle">—</span> : <span className={cn('text-2xs tabular', l.durationMs > 5_000 ? 'text-warning' : 'text-fg-muted')}>{l.durationMs.toLocaleString('en-IN')} ms</span>) },
    {
      key: 'ack', header: 'Seen', width: '8rem',
      render: (l) => (l.level === 'ERROR' || l.level === 'FATAL')
        ? (l.acknowledged ? <Badge tone="success" size="sm">Yes</Badge> : <Badge tone="danger" size="sm">No</Badge>)
        : <span className="text-2xs text-fg-subtle">—</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Logging & monitoring"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Monitoring' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'health', label: 'System health', count: health.down.length + health.degraded.length },
              { id: 'api', label: 'API performance', count: endpointMetrics.length },
              { id: 'logs', label: 'Logs', count: live.length },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Components down" value={health.down.length} sub={health.down.length ? health.down.map((h) => h.component).join(', ') : 'Everything is responding'} icon={<HeartPulse />} tone={health.down.length ? 'danger' : 'success'} />
        <StatTile label="Degraded" value={health.degraded.length} sub={health.degraded.length ? health.degraded.map((h) => h.component).join(', ') : 'Nothing is struggling'} tone={health.degraded.length ? 'warning' : 'success'} />
        <StatTile label="Unseen errors" value={summary.unacknowledged} sub={`${summary.errorRate}% of log entries are errors`} icon={<AlertTriangle />} tone={summary.unacknowledged ? 'danger' : 'success'} />
        <StatTile label="API error rate" value={`${api.errorRate.toFixed(2)}%`} sub={`${api.errors.toLocaleString('en-IN')} of ${api.calls.toLocaleString('en-IN')} calls`} icon={<Activity />} tone={api.errorRate > 2 ? 'danger' : api.errorRate > 0.5 ? 'warning' : 'success'} />
      </div>

      {health.down.length > 0 && (
        <Alert tone="danger" title={`${health.down.length} component${health.down.length === 1 ? ' is' : 's are'} down`} className="mb-4">
          {health.down.map((h) => `${h.component}: ${h.message}`).join(' · ')}
        </Alert>
      )}

      {/* ─────────────── Health ─────────────── */}
      {tab === 'health' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {healthChecks.map((h) => (
              <Card key={h.component} className={cn(h.status === 'DOWN' && 'border-danger/40', h.status === 'DEGRADED' && 'border-warning/40')}>
                <CardBody>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-fg">{h.component}</p>
                    <Badge tone={HEALTH_TONE[h.status]} size="sm">{h.status.toLowerCase()}</Badge>
                  </div>
                  <p className="text-3xs uppercase tracking-wider text-fg-subtle">{h.kind.toLowerCase()}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{h.message}</p>
                  <p className="mt-1.5 flex items-center justify-between text-3xs text-fg-subtle">
                    <span>Latency</span>
                    <span className={cn('tabular', h.latencyMs > 1_000 ? 'text-danger' : h.latencyMs > 100 ? 'text-warning' : 'text-fg-muted')}>
                      {h.latencyMs.toLocaleString('en-IN')} ms
                    </span>
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>

          <Section title="Recurring faults">
            {summary.recurring.length === 0 ? (
              <Alert tone="tip" title="Nothing is repeating">Every warning and error in the log has happened once.</Alert>
            ) : (
              <Card>
                <CardBody className="p-0">
                  <table className="grid-table">
                    <thead><tr><th className="text-right" style={{ width: '7rem' }}>Times</th><th style={{ width: '13rem' }}>Source</th><th>Message</th><th style={{ width: '13rem' }}>Last seen</th><th style={{ width: '9rem' }} /></tr></thead>
                    <tbody>
                      {summary.recurring.map((r) => (
                        <tr key={r.message} className={r.count >= 10 ? 'bg-danger/5' : 'bg-warning/5'}>
                          <td className="text-right"><Badge tone={r.count >= 10 ? 'danger' : 'warning'} size="sm">{r.count}×</Badge></td>
                          <td><Badge tone="neutral" size="sm" dot={false}>{LOG_SOURCE_LABEL[r.source]}</Badge></td>
                          <td><p className="text-xs text-fg">{r.message}</p></td>
                          <td className="text-2xs tabular text-fg-muted">{formatDateTime(r.lastAt)}</td>
                          <td className="text-right"><Button variant="ghost" size="sm" onClick={() => acknowledgeGroup(r.message)}>Acknowledge all</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            )}
            <p className="mt-2 text-2xs text-fg-subtle">
              Grouped by message. One fault that fires fourteen times is one thing to fix, not fourteen — and a list that shows it fourteen times hides everything else.
            </p>
          </Section>
        </>
      )}

      {/* ─────────────── API ─────────────── */}
      {tab === 'api' && (
        <>
          <Card className="mb-4">
            <CardHeader title="Calls and errors" description="Last 24 hours — p95 is the latency most users actually experience" />
            <CardBody className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={apiTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={48} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar yAxisId="l" dataKey="calls" name="Calls" fill="#94a3b8" maxBarSize={16} radius={[2, 2, 0, 0]} />
                  <Line yAxisId="r" type="monotone" dataKey="p95Ms" name="p95 (ms)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line yAxisId="r" type="monotone" dataKey="errors" name="Errors" stroke="#ef4444" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          {api.worstErrorRate[0] && api.worstErrorRate[0].rate > 2 && (
            <Alert tone="warning" title={`${api.worstErrorRate[0].method} ${api.worstErrorRate[0].endpoint} fails ${api.worstErrorRate[0].rate.toFixed(1)}% of the time`} className="mb-4">
              {api.worstErrorRate[0].errors.toLocaleString('en-IN')} of {api.worstErrorRate[0].calls.toLocaleString('en-IN')} calls.
              A high failure rate on an authentication endpoint usually means credential stuffing rather than a bug; on a business endpoint it usually means validation nobody expected.
            </Alert>
          )}

          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22rem' }}>Endpoint</th>
                      <th style={{ width: '7rem' }}>Method</th>
                      <th className="text-right" style={{ width: '10rem' }}>Calls</th>
                      <th className="text-right" style={{ width: '9rem' }}>Errors</th>
                      <th className="text-right" style={{ width: '10rem' }}>Failure rate</th>
                      <th className="text-right" style={{ width: '8rem' }}>p50</th>
                      <th className="text-right" style={{ width: '8rem' }}>p95</th>
                      <th className="text-right" style={{ width: '8rem' }}>p99</th>
                      <th style={{ width: '12rem' }}>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {api.slowest.map((e) => {
                      const rate = e.calls ? (e.errors / e.calls) * 100 : 0
                      return (
                        <tr key={`${e.method}-${e.endpoint}`} className={e.p95Ms > 2_000 || rate > 2 ? 'bg-warning/5' : undefined}>
                          <td className="font-mono text-2xs text-fg">{e.endpoint}</td>
                          <td><Badge tone={e.method === 'GET' ? 'neutral' : 'brand'} size="sm" dot={false}>{e.method}</Badge></td>
                          <td className="text-right text-xs tabular text-fg">{e.calls.toLocaleString('en-IN')}</td>
                          <td className="text-right text-xs tabular text-fg-muted">{e.errors.toLocaleString('en-IN')}</td>
                          <td className={cn('text-right text-xs tabular', rate > 2 ? 'text-danger' : rate > 0.5 ? 'text-warning' : 'text-fg-muted')}>{rate.toFixed(2)}%</td>
                          <td className="text-right text-2xs tabular text-fg-muted">{e.p50Ms}</td>
                          <td className={cn('text-right text-xs tabular', e.p95Ms > 2_000 ? 'text-danger' : e.p95Ms > 500 ? 'text-warning' : 'text-fg')}>{e.p95Ms.toLocaleString('en-IN')}</td>
                          <td className="text-right text-2xs tabular text-fg-muted">{e.p99Ms.toLocaleString('en-IN')}</td>
                          <td><ProgressBar value={Math.min(100, (e.p95Ms / 3_000) * 100)} tone={e.p95Ms > 2_000 ? 'danger' : e.p95Ms > 500 ? 'warning' : 'success'} className="w-16" /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
          <p className="mt-2 text-2xs text-fg-subtle">
            Ordered by p95, not by maximum. One slow request does not matter; one call in twenty being slow does.
          </p>
        </>
      )}

      {/* ─────────────── Logs ─────────────── */}
      {tab === 'logs' && (
        <>
          <Card className="mb-3">
            <CardBody className="flex flex-wrap items-end gap-3">
              <Select label="Level" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'ALL')} className="w-40">
                <option value="ALL">Every level</option>
                {(['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as LogLevel[]).map((l) => (<option key={l} value={l}>{l.toLowerCase()}</option>))}
              </Select>
              <Select label="Source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as LogSource | 'ALL')} className="w-48">
                <option value="ALL">Every source</option>
                {(Object.keys(LOG_SOURCE_LABEL) as LogSource[]).map((s) => (<option key={s} value={s}>{LOG_SOURCE_LABEL[s]}</option>))}
              </Select>
              <div className="ml-auto flex flex-wrap items-center gap-3 text-2xs">
                {(['FATAL', 'ERROR', 'WARN', 'INFO'] as LogLevel[]).map((l) => (
                  summary.byLevel[l] ? (
                    <span key={l} className="inline-flex items-center gap-1">
                      <Badge tone={LEVEL_TONE[l]} size="sm" dot={false}>{summary.byLevel[l]}</Badge>
                      <span className="text-fg-subtle">{l.toLowerCase()}</span>
                    </span>
                  ) : null
                ))}
              </div>
            </CardBody>
          </Card>

          <DataTable
            rows={filtered}
            columns={logColumns}
            rowKey={(l) => l.uid}
            searchable
            searchPlaceholder="Search by message, origin or correlation id"
            onRowClick={(l) => setOpenUid(l.uid)}
            rowClassName={(l) => (l.level === 'FATAL' || l.level === 'ERROR' ? 'bg-danger/5' : l.level === 'WARN' ? 'bg-warning/5' : undefined)}
            onExport={(f: ExportFormat) => { const n = exportRows(f, 'system-logs', 'System log', columnsFromTable(logColumns), filtered); toast.success('Export ready', `${n} rows written.`) }}
            rowActions={(l) => (
              <>
                <MenuItem label="Edit" onClick={() => setOpenUid(l.uid)} />
                {!l.acknowledged && (l.level === 'ERROR' || l.level === 'FATAL') && <MenuItem label="Acknowledge" onClick={() => acknowledge(l)} />}
                <MenuItem label="Delete" danger onClick={() => { logs.remove(l.uid); toast.success('Entry removed from the view') }} />
              </>
            )}
            emptyTitle="Nothing logged"
            emptyDescription="Change the filters, or the system has been quiet."
          />
        </>
      )}

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.level} · ${detail.origin}` : ''} width="max-w-2xl">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={LEVEL_TONE[detail.level]} size="md">{detail.level.toLowerCase()}</Badge>
              <Badge tone="neutral" size="sm" dot={false}>{LOG_SOURCE_LABEL[detail.source]}</Badge>
              {detail.acknowledged && <Badge tone="success" size="sm">Acknowledged</Badge>}
            </div>

            <p className="text-sm leading-relaxed text-fg">{detail.message}</p>

            <DataGrid columns={2} items={[
              { label: 'When', value: formatDateTime(detail.at) },
              { label: 'Origin', value: detail.origin, mono: true },
              { label: 'Correlation id', value: detail.correlationId, mono: true },
              { label: 'User', value: detail.userName ?? 'System' },
              { label: 'Duration', value: detail.durationMs === null ? '—' : `${detail.durationMs.toLocaleString('en-IN')} ms` },
              { label: 'HTTP status', value: detail.httpStatus === null ? '—' : String(detail.httpStatus) },
            ]} />

            {(() => {
              const same = live.filter((l) => l.message === detail.message)
              return same.length > 1 ? (
                <Alert tone="warning" title={`This has happened ${same.length} times`}>
                  Most recently {formatDateTime(same.map((l) => l.at).sort().reverse()[0])}.
                  Fixing the cause clears all {same.length}.
                </Alert>
              ) : null
            })()}

            {detail.stackTrace && (
              <div>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Stack trace</p>
                <pre className="overflow-x-auto rounded border border-border bg-surface-2 p-3 font-mono text-2xs leading-relaxed text-fg-muted">{detail.stackTrace}</pre>
              </div>
            )}

            <p className="text-2xs text-fg-subtle">
              The correlation id ties this entry to every other log line, audit row and API response from the same request.
              It is the fastest way to reconstruct what a user actually did.
            </p>

            {!detail.acknowledged && (detail.level === 'ERROR' || detail.level === 'FATAL') && (
              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="primary" size="sm" icon={<Check />} onClick={() => { acknowledge(detail); setOpenUid(null) }}>Acknowledge</Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
