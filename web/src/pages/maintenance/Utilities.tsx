import { useMemo, useState } from 'react'
import { Fuel, Plus, Zap } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { newUid } from '@/store/data'
import { ChartTip, DetailBlock, duration, hours, useMaintenanceData } from '@/components/maintenance/MaintShell'
import { daysBetween, isoDate, utilityEfficiency, type UtilityEfficiency } from '@/lib/maintFlow'
import type { UtilityLog } from '@/types/maintenance'

/**
 * Utility management (Ch 15).
 *
 * Specific energy — units consumed per unit delivered — is the figure that
 * matters. Total consumption rising is expected when output rises; consumption
 * *per unit* rising means the machine is getting worse, and that is what tells
 * you to clean a cooler before it trips.
 */

const WINDOW = 30

export function UtilitiesPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const today = isoDate(new Date())
  const from = isoDate(new Date(Date.now() - (WINDOW - 1) * 86_400_000))

  const [tab, setTab] = useState('summary')
  const [openCode, setOpenCode] = useState<string | null>(null)
  const [logging, setLogging] = useState<Partial<UtilityLog> | null>(null)

  const utilities = useMemo(
    () => m.assets.rows.filter((a) => !a.deletedAt && a.category === 'UTILITY' && a.parentCode !== null),
    [m.assets.rows],
  )
  const logs = useMemo(() => m.utilityLogs.rows.filter((l) => !l.deletedAt), [m.utilityLogs.rows])

  const efficiencies = useMemo(
    () => utilities.map((a) => utilityEfficiency(a, logs, from, today)),
    [utilities, logs, from, today],
  )
  const detail = efficiencies.find((e) => e.assetCode === openCode) ?? null

  const k = useMemo(() => {
    const totalKwh = efficiencies.reduce((s, e) => s + e.energyKwh, 0)
    const totalFuel = efficiencies.reduce((s, e) => s + e.fuelLitres, 0)
    const totalDown = efficiencies.reduce((s, e) => s + e.downtimeMinutes, 0)

    // Compare the last week against the week before it to spot degradation
    // early — the whole month averages a problem away.
    const recentFrom = isoDate(new Date(Date.now() - 6 * 86_400_000))
    const priorFrom = isoDate(new Date(Date.now() - 13 * 86_400_000))
    const priorTo = isoDate(new Date(Date.now() - 7 * 86_400_000))
    const degrading = utilities
      .map((a) => {
        const recent = utilityEfficiency(a, logs, recentFrom, today)
        const prior = utilityEfficiency(a, logs, priorFrom, priorTo)
        if (recent.specificEnergy === null || prior.specificEnergy === null || prior.specificEnergy === 0) return null
        const changePct = ((recent.specificEnergy - prior.specificEnergy) / prior.specificEnergy) * 100
        return { asset: a, recent: recent.specificEnergy, prior: prior.specificEnergy, changePct }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.changePct > 3)
      .sort((a, b) => b.changePct - a.changePct)

    return { count: utilities.length, totalKwh, totalFuel, totalDown, degrading }
  }, [utilities, efficiencies, logs, today])

  /** Daily series for the chart on the drawer. */
  function seriesFor(assetCode: string) {
    return logs
      .filter((l) => l.assetCode === assetCode && l.logDate >= from && l.logDate <= today)
      .sort((a, b) => a.logDate.localeCompare(b.logDate))
      .map((l) => ({
        day: l.logDate.slice(5),
        energy: l.energyKwh,
        output: l.output,
        specific: l.output > 0 ? Math.round((l.energyKwh / l.output) * 1000) / 1000 : 0,
      }))
  }

  function saveLog() {
    if (!logging) return
    if (!logging.assetCode) { toast.error('Which utility is this for?'); return }
    if (!logging.logDate) { toast.error('Which day?'); return }
    if ((logging.runningHours ?? 0) < 0 || (logging.runningHours ?? 0) > 24) { toast.error('Running hours must be between nil and 24 for one day.'); return }
    if ((logging.energyKwh ?? 0) < 0 || (logging.output ?? 0) < 0) { toast.error('Consumption and output cannot be negative.'); return }
    if ((logging.downtimeMinutes ?? 0) > 1440) { toast.error('A day holds 1,440 minutes.'); return }

    const existing = logs.find((l) => l.assetCode === logging.assetCode && l.logDate === logging.logDate && l.uid !== logging.uid)
    if (existing) { toast.error(`${logging.assetCode} already has a reading for ${logging.logDate}. Edit that one instead of adding a second.`); return }

    const asset = m.assets.rows.find((a) => a.code === logging.assetCode)
    const payload = { ...logging, assetName: asset?.name ?? '' } as UtilityLog
    if (logging.uid) { m.utilityLogs.update(logging.uid, payload); toast.success('Reading updated') }
    else { m.utilityLogs.create({ ...payload, uid: newUid('utl'), version: 1 }); toast.success('Reading logged') }
    setLogging(null)
  }

  const columns: Column<UtilityEfficiency>[] = [
    { key: 'asset', header: 'Utility', width: '20rem', render: (e) => (<><p className="truncate text-xs text-fg">{e.assetName}</p><p className="font-mono text-2xs text-fg-subtle">{e.assetCode}</p></>) },
    { key: 'hours', header: 'Running hours', width: '12rem', align: 'right', render: (e) => <span className="text-xs tabular text-fg">{e.runningHours.toLocaleString('en-IN')}</span> },
    {
      key: 'load', header: 'Load factor', width: '12rem',
      render: (e) => e.loadFactorPct === null ? <span className="text-2xs text-fg-subtle">—</span> : (
        <span className={cn('text-xs tabular', e.loadFactorPct > 90 ? 'text-warning' : 'text-fg-muted')}>
          {e.loadFactorPct.toFixed(1)}%
          {e.loadFactorPct > 90 && <span className="ml-1 text-3xs">no standby</span>}
        </span>
      ),
    },
    { key: 'energy', header: 'Energy', width: '11rem', align: 'right', render: (e) => (e.energyKwh ? <span className="text-xs tabular text-fg">{e.energyKwh.toLocaleString('en-IN')} kWh</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'fuel', header: 'Fuel', width: '10rem', align: 'right', render: (e) => (e.fuelLitres ? <span className="text-xs tabular text-fg">{e.fuelLitres.toLocaleString('en-IN')} L</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'output', header: 'Output', width: '12rem', align: 'right', render: (e) => (e.output ? <span className="text-xs tabular text-fg">{e.output.toLocaleString('en-IN')} {e.outputUom}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    {
      key: 'specific', header: 'Specific energy', width: '13rem', align: 'right',
      render: (e) => e.specificEnergy === null
        ? <span className="text-2xs text-fg-subtle">—</span>
        : (<><p className="text-xs font-medium tabular text-fg">{e.specificEnergy}</p><p className="text-3xs text-fg-subtle">kWh per {e.outputUom}</p></>),
    },
    { key: 'fuelEff', header: 'Fuel efficiency', width: '12rem', align: 'right', render: (e) => (e.fuelEfficiency === null ? <span className="text-2xs text-fg-subtle">—</span> : <span className="text-xs tabular text-fg">{e.fuelEfficiency} {e.outputUom}/L</span>) },
    {
      key: 'avail', header: 'Availability', width: '11rem', align: 'right',
      render: (e) => <span className={cn('text-xs tabular', e.availabilityPct >= 99 ? 'text-success' : e.availabilityPct >= 97 ? 'text-warning' : 'text-danger')}>{e.availabilityPct.toFixed(1)}%</span>,
    },
  ]

  const logColumns: Column<UtilityLog>[] = [
    { key: 'date', header: 'Date', width: '9rem', render: (l) => <span className="text-2xs tabular text-fg-muted">{formatDate(l.logDate)}</span> },
    { key: 'asset', header: 'Utility', width: '18rem', render: (l) => (<><p className="truncate text-xs text-fg">{l.assetName}</p><p className="font-mono text-2xs text-fg-subtle">{l.assetCode}</p></>) },
    { key: 'hours', header: 'Hours', width: '8rem', align: 'right', render: (l) => <span className="text-xs tabular text-fg">{l.runningHours}</span> },
    { key: 'energy', header: 'kWh', width: '9rem', align: 'right', render: (l) => <span className="text-xs tabular text-fg-muted">{l.energyKwh || '—'}</span> },
    { key: 'fuel', header: 'Litres', width: '8rem', align: 'right', render: (l) => <span className="text-xs tabular text-fg-muted">{l.fuelLitres || '—'}</span> },
    { key: 'output', header: 'Output', width: '11rem', align: 'right', render: (l) => <span className="text-xs tabular text-fg">{l.output ? `${l.output} ${l.outputUom}` : '—'}</span> },
    {
      key: 'specific', header: 'kWh per unit', width: '11rem', align: 'right',
      render: (l) => (l.output > 0 && l.energyKwh > 0 ? <span className="text-xs tabular text-fg">{(l.energyKwh / l.output).toFixed(3)}</span> : <span className="text-2xs text-fg-subtle">—</span>),
    },
    { key: 'down', header: 'Downtime', width: '10rem', align: 'right', render: (l) => (l.downtimeMinutes ? <span className="text-xs tabular text-danger">{duration(l.downtimeMinutes)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'note', header: 'Notes', render: (l) => <p className="truncate text-2xs text-fg-muted">{l.remarks || '—'}</p> },
  ]

  return (
    <div>
      <PageHeader
        title="Utilities"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Utilities' }]}
        actions={
          <Button
            variant="primary" size="sm" icon={<Plus />}
            onClick={() => setLogging({ assetCode: '', assetName: '', logDate: today, runningHours: 0, energyKwh: 0, fuelLitres: 0, output: 0, outputUom: '', downtimeMinutes: 0, remarks: '' })}
          >Log a reading</Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[{ id: 'summary', label: 'Efficiency', count: utilities.length }, { id: 'logs', label: 'Daily readings', count: logs.length }]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Utilities monitored" value={k.count} sub={`${WINDOW} days of readings`} icon={<Zap />} tone="brand" />
        <StatTile label="Energy consumed" value={`${(k.totalKwh / 1000).toFixed(1)} MWh`} sub={`${k.totalKwh.toLocaleString('en-IN')} kWh across every utility`} tone="progress" />
        <StatTile label="Fuel consumed" value={`${k.totalFuel.toLocaleString('en-IN')} L`} sub="Diesel for the standby generator" icon={<Fuel />} tone="neutral" />
        <StatTile label="Utility downtime" value={duration(k.totalDown)} sub={k.totalDown ? 'Plant air, chilled water or power interrupted' : 'No interruptions'} tone={k.totalDown ? 'warning' : 'success'} />
      </div>

      {k.degrading.length > 0 && (
        <Alert tone="warning" title={`${k.degrading.length} utilit${k.degrading.length === 1 ? 'y is' : 'ies are'} using more energy per unit than last week`} className="mb-4">
          {k.degrading.map((x) => `${x.asset.name}: ${x.prior} → ${x.recent} (+${x.changePct.toFixed(1)}%)`).join(' · ')}.
          Output has not necessarily changed — the machine is doing the same work for more energy, which is what fouling, a worn seal or a slipping belt looks like before it becomes a breakdown.
        </Alert>
      )}

      {tab === 'summary' ? (
        <>
          <DataTable
            rows={efficiencies}
            columns={columns}
            rowKey={(e) => e.assetCode}
            onRowClick={(e) => setOpenCode(e.assetCode)}
            rowClassName={(e) => (e.availabilityPct < 97 ? 'bg-warning/5' : undefined)}
            onExport={(f: ExportFormat) => { const n = exportRows(f, 'utility-efficiency', 'Utility efficiency', columnsFromTable(columns), efficiencies); toast.success('Export ready', `${n} rows written.`) }}
            rowActions={(e) => (
              <>
                <MenuItem label="Edit" onClick={() => setOpenCode(e.assetCode)} />
                <MenuItem
                  label="Log a reading"
                  onClick={() => setLogging({ assetCode: e.assetCode, assetName: e.assetName, logDate: today, runningHours: 0, energyKwh: 0, fuelLitres: 0, output: 0, outputUom: e.outputUom, downtimeMinutes: 0, remarks: '' })}
                />
              </>
            )}
            emptyTitle="No utilities"
            emptyDescription="Add utility assets to the register to monitor them here."
          />
          <p className="mt-2 text-2xs text-fg-subtle">
            Specific energy is consumption divided by output. It is the number that says whether a machine is degrading — total consumption rising with output is normal, consumption per unit rising is not.
          </p>
        </>
      ) : (
        <DataTable
          rows={logs.slice().sort((a, b) => b.logDate.localeCompare(a.logDate) || a.assetCode.localeCompare(b.assetCode))}
          columns={logColumns}
          rowKey={(l) => l.uid}
          searchable
          searchPlaceholder="Search by utility or date"
          rowClassName={(l) => (l.downtimeMinutes ? 'bg-warning/5' : undefined)}
          onExport={(f: ExportFormat) => { const n = exportRows(f, 'utility-readings', 'Utility daily readings', columnsFromTable(logColumns), logs); toast.success('Export ready', `${n} rows written.`) }}
          rowActions={(l) => (
            <>
              <MenuItem label="Edit" onClick={() => setLogging({ ...l })} />
              <MenuItem label="Delete" danger onClick={() => { m.utilityLogs.remove(l.uid); toast.success('Reading removed') }} />
            </>
          )}
          emptyTitle="No readings"
          emptyDescription="Log the daily meter readings so efficiency can be tracked."
        />
      )}

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenCode(null)} title={detail ? `${detail.assetCode} · ${detail.assetName}` : ''} width="max-w-2xl">
        {detail && (() => {
          const series = seriesFor(detail.assetCode)
          const asset = m.assets.rows.find((a) => a.code === detail.assetCode)
          const worst = series.length ? series.reduce((a, b) => (b.specific > a.specific ? b : a)) : null
          const best = series.filter((s) => s.specific > 0)
          const bestDay = best.length ? best.reduce((a, b) => (b.specific < a.specific ? b : a)) : null
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand" size="sm" dot={false}>{asset?.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                {asset && <Badge tone="neutral" size="sm" dot={false}>{asset.ratedPowerKw} kW rated</Badge>}
                <Badge tone={detail.availabilityPct >= 99 ? 'success' : 'warning'} size="sm">{detail.availabilityPct.toFixed(1)}% available</Badge>
              </div>

              <DetailBlock title={`Last ${detail.days} days`}>
                <DataGrid columns={3} items={[
                  { label: 'Running hours', value: hours(detail.runningHours) },
                  { label: 'Load factor', value: detail.loadFactorPct === null ? '—' : `${detail.loadFactorPct.toFixed(1)}%` },
                  { label: 'Downtime', value: duration(detail.downtimeMinutes) },
                  { label: 'Energy', value: detail.energyKwh ? `${detail.energyKwh.toLocaleString('en-IN')} kWh` : '—' },
                  { label: 'Fuel', value: detail.fuelLitres ? `${detail.fuelLitres.toLocaleString('en-IN')} L` : '—' },
                  { label: 'Output', value: detail.output ? `${detail.output.toLocaleString('en-IN')} ${detail.outputUom}` : '—' },
                  { label: 'Specific energy', value: detail.specificEnergy === null ? '—' : `${detail.specificEnergy} kWh/${detail.outputUom}` },
                  { label: 'Fuel efficiency', value: detail.fuelEfficiency === null ? '—' : `${detail.fuelEfficiency} ${detail.outputUom}/L` },
                  { label: 'Energy per running hour', value: detail.runningHours > 0 ? `${(detail.energyKwh / detail.runningHours).toFixed(1)} kW` : '—' },
                ]} />
              </DetailBlock>

              {asset && asset.ratedPowerKw > 0 && detail.runningHours > 0 && (() => {
                const actualKw = detail.energyKwh / detail.runningHours
                const pct = (actualKw / asset.ratedPowerKw) * 100
                return (
                  <Alert tone={pct > 95 ? 'warning' : 'info'} title="Against the nameplate">
                    Drawing {actualKw.toFixed(1)} kW average against a {asset.ratedPowerKw} kW rating — {pct.toFixed(0)}% of nameplate.
                    {pct > 95 && ' Running that close to the rating leaves no headroom and shortens the life of the machine.'}
                    {pct < 40 && ' A machine loaded this lightly is usually oversized for the duty, which costs money every hour it runs.'}
                  </Alert>
                )
              })()}

              {series.length >= 2 && (
                <DetailBlock title="Daily consumption against output">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={4} />
                        <YAxis yAxisId="l" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
                        <Bar yAxisId="l" dataKey="energy" name="kWh" fill="#94a3b8" maxBarSize={14} radius={[2, 2, 0, 0]} />
                        <Line yAxisId="r" type="monotone" dataKey="specific" name={`kWh per ${detail.outputUom}`} stroke="#ef4444" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {worst && bestDay && worst.specific > bestDay.specific && (
                    <p className="mt-1 text-3xs text-fg-subtle">
                      Best day {bestDay.specific} on {bestDay.day}, worst {worst.specific} on {worst.day} — a spread of {((worst.specific / bestDay.specific - 1) * 100).toFixed(0)}%.
                      A wide spread on a machine doing steady work usually means a fouled heat exchanger or a leak.
                    </p>
                  )}
                </DetailBlock>
              )}

              <div className="flex gap-2 border-t border-border pt-3">
                <Button
                  variant="primary" size="sm"
                  onClick={() => { setLogging({ assetCode: detail.assetCode, assetName: detail.assetName, logDate: today, runningHours: 0, energyKwh: 0, fuelLitres: 0, output: 0, outputUom: detail.outputUom, downtimeMinutes: 0, remarks: '' }); setOpenCode(null) }}
                >Log today's reading</Button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── log ──────────────────────────────────────────────── */}
      <Modal
        open={!!logging}
        onClose={() => setLogging(null)}
        title={logging?.uid ? 'Edit a reading' : 'Log a utility reading'}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setLogging(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={saveLog}>Save</Button></>}
      >
        {logging && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Utility" required value={logging.assetCode ?? ''}
                onChange={(e) => { const a = utilities.find((x) => x.code === e.target.value); setLogging({ ...logging, assetCode: e.target.value, assetName: a?.name ?? '' }) }}
              >
                <option value="">Choose a utility…</option>
                {utilities.map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
              </Select>
              <Input label="Date" type="date" required value={logging.logDate ?? ''} onChange={(e) => setLogging({ ...logging, logDate: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Running hours" type="number" value={String(logging.runningHours ?? 0)} onChange={(e) => setLogging({ ...logging, runningHours: Number(e.target.value) })} hint="Nil to 24" />
              <Input label="Energy (kWh)" type="number" value={String(logging.energyKwh ?? 0)} onChange={(e) => setLogging({ ...logging, energyKwh: Number(e.target.value) })} />
              <Input label="Fuel (litres)" type="number" value={String(logging.fuelLitres ?? 0)} onChange={(e) => setLogging({ ...logging, fuelLitres: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Output" type="number" value={String(logging.output ?? 0)} onChange={(e) => setLogging({ ...logging, output: Number(e.target.value) })} />
              <Input label="Output unit" value={logging.outputUom ?? ''} onChange={(e) => setLogging({ ...logging, outputUom: e.target.value })} placeholder="m³" hint="m³ of air, TR·h, kWh, L" />
              <Input label="Downtime (minutes)" type="number" value={String(logging.downtimeMinutes ?? 0)} onChange={(e) => setLogging({ ...logging, downtimeMinutes: Number(e.target.value) })} />
            </div>
            <Textarea label="Notes" rows={2} value={logging.remarks ?? ''} onChange={(e) => setLogging({ ...logging, remarks: e.target.value })} />

            {(logging.output ?? 0) > 0 && (logging.energyKwh ?? 0) > 0 && (() => {
              const specific = (logging.energyKwh as number) / (logging.output as number)
              const e = efficiencies.find((x) => x.assetCode === logging.assetCode)
              const baseline = e?.specificEnergy ?? null
              return (
                <Alert tone={baseline !== null && specific > baseline * 1.1 ? 'warning' : 'info'} title="Specific energy for this reading">
                  {specific.toFixed(3)} kWh per {logging.outputUom || 'unit'}.
                  {baseline !== null && (
                    <> The {WINDOW}-day average is {baseline}, so this is {specific > baseline ? 'above' : 'below'} it by {Math.abs(((specific / baseline) - 1) * 100).toFixed(1)}%.</>
                  )}
                </Alert>
              )
            })()}
          </div>
        )}
      </Modal>
    </div>
  )
}
