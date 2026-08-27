import { useMemo, useState } from 'react'
import { Activity, Plus, TrendingUp } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { newUid } from '@/store/data'
import {
  ChartTip, DetailBlock, ParameterBadge, VerdictBadge, useMaintenanceData,
} from '@/components/maintenance/MaintShell'
import { PARAMETER_LABEL, conditionTrend, evaluateReading, isoDate, type ConditionTrend } from '@/lib/maintFlow'
import type { ConditionParameter, ConditionPoint } from '@/types/maintenance'

/**
 * Predictive maintenance — condition monitoring (Ch 8).
 *
 * The point of this screen is the slope, not the reading. A bearing at 4.1 mm/s
 * inside a 4.5 limit is fine today and a problem if it has climbed 0.3 every
 * week; the reading alone cannot tell you which. Where a value is trending
 * towards its trip limit, the screen says how many rounds are left.
 */

const BLANK_POINT = (): Partial<ConditionPoint> => ({
  assetCode: '', assetName: '', parameter: 'VIBRATION', uom: 'mm/s',
  warnLow: null, warnHigh: null, tripLow: null, tripHigh: null, isActive: true, version: 1,
})

export function ConditionPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const today = isoDate(new Date())

  const [tab, setTab] = useState('alerts')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<ConditionPoint> | null>(null)
  const [logging, setLogging] = useState<ConditionTrend | null>(null)
  const [value, setValue] = useState('')
  const [logRemarks, setLogRemarks] = useState('')

  const points = useMemo(() => m.points.rows.filter((p) => !p.deletedAt), [m.points.rows])
  const trends = useMemo(() => points.map((p) => conditionTrend(p, m.readings.rows)), [points, m.readings.rows])
  const detail = trends.find((t) => t.point.uid === openUid) ?? null

  const filtered = useMemo(() => {
    if (tab === 'alerts') return trends.filter((t) => t.verdict === 'WARNING' || t.verdict === 'TRIP')
    if (tab === 'trending') return trends.filter((t) => t.readingsToTrip !== null && t.readingsToTrip <= 6 && t.readingsToTrip > 0)
    return trends
  }, [trends, tab])

  const k = useMemo(() => ({
    total: points.length,
    trip: trends.filter((t) => t.verdict === 'TRIP').length,
    warning: trends.filter((t) => t.verdict === 'WARNING').length,
    trending: trends.filter((t) => t.readingsToTrip !== null && t.readingsToTrip <= 6 && t.readingsToTrip > 0).length,
    unread: trends.filter((t) => t.latest === null).length,
    noLimits: trends.filter((t) => t.verdict === 'NO_LIMITS' && t.latest !== null).length,
  }), [points, trends])

  /* ── actions ────────────────────────────────────────────────── */

  function logReading() {
    if (!logging) return
    const v = Number(value)
    if (!Number.isFinite(v) || value.trim() === '') { toast.error('Enter the value that was read.'); return }
    m.readings.create({
      uid: newUid('crd'), pointUid: logging.point.uid, assetCode: logging.point.assetCode,
      parameter: logging.point.parameter, readAt: new Date().toISOString(), value: v,
      readBy: 'You', remarks: logRemarks, version: 1,
    })
    const verdict = evaluateReading(logging.point, v)
    if (verdict.verdict === 'TRIP') toast.error(`${verdict.message}`)
    else if (verdict.verdict === 'WARNING') toast.success('Reading logged', verdict.message)
    else toast.success('Reading logged', verdict.message)
    setLogging(null); setValue(''); setLogRemarks('')
  }

  /** Raise a predictive job off a trend, before it becomes a breakdown. */
  function raiseJob(t: ConditionTrend) {
    const asset = m.assets.rows.find((a) => a.code === t.point.assetCode)
    const docNo = `WO/26-27/${String(m.workOrders.rows.length + 120).padStart(4, '0')}`
    m.workOrders.create({
      uid: newUid('wo'), docNo, woType: 'PREDICTIVE',
      priority: t.verdict === 'TRIP' ? 'CRITICAL' : asset?.criticality === 'A' ? 'HIGH' : 'MEDIUM',
      assetCode: t.point.assetCode, assetName: t.point.assetName,
      sourceDocNo: `CM-${t.point.uid}`,
      title: `${t.point.assetName} — ${PARAMETER_LABEL[t.point.parameter].toLowerCase()} outside its band`,
      description: `${t.message}${t.readingsToTrip !== null ? ` About ${t.readingsToTrip} more readings to the trip limit at the present rate of ${t.slope} ${t.point.uom} per round.` : ''}`,
      raisedBy: 'Condition monitoring', raisedOn: today, supervisor: '',
      plannedStart: today, plannedFinish: isoDate(new Date(Date.now() + 2 * 86_400_000)),
      actualStart: null, actualFinish: null, status: 'PLANNED',
      labour: [], spares: [], externalCost: 0, externalVendor: '',
      checklist: [
        { uid: newUid('wcl'), seq: 1, description: `Take a fresh ${PARAMETER_LABEL[t.point.parameter].toLowerCase()} reading`, mandatory: true, capture: 'READING', uom: t.point.uom, done: false, reading: null, result: null, remarks: '' },
        { uid: newUid('wcl'), seq: 2, description: 'Inspect the component the trend points at', mandatory: true, capture: 'PASS_FAIL', uom: '', done: false, reading: null, result: null, remarks: '' },
        { uid: newUid('wcl'), seq: 3, description: 'Rectify and re-read to confirm the value has come back', mandatory: true, capture: 'READING', uom: t.point.uom, done: false, reading: null, result: null, remarks: '' },
      ],
      permitNo: null, requiresPermit: false, downtimeMinutes: 0,
      verifiedBy: null, verifiedOn: null, closedOn: null,
      isRework: false, reworkOfDocNo: null,
      remarks: 'Raised from a condition trend, before the failure.', version: 1,
    })
    toast.success(`${docNo} raised`, 'Caught by the trend rather than by a breakdown.')
  }

  function pointBlockers(p: Partial<ConditionPoint>): string[] {
    const out: string[] = []
    if (!p.assetCode) out.push('Choose the asset this point is on.')
    if (!p.uom?.trim()) out.push('Give the unit of measure.')
    const hasAny = [p.warnLow, p.warnHigh, p.tripLow, p.tripHigh].some((x) => x !== null && x !== undefined)
    if (!hasAny) out.push('Set at least one limit, or nothing can be judged.')
    if (p.warnHigh !== null && p.warnHigh !== undefined && p.tripHigh !== null && p.tripHigh !== undefined && p.warnHigh > p.tripHigh) {
      out.push('The high warning limit is above the high trip limit — the warning would never fire.')
    }
    if (p.warnLow !== null && p.warnLow !== undefined && p.tripLow !== null && p.tripLow !== undefined && p.warnLow < p.tripLow) {
      out.push('The low warning limit is below the low trip limit — the warning would never fire.')
    }
    if (p.warnLow !== null && p.warnLow !== undefined && p.warnHigh !== null && p.warnHigh !== undefined && p.warnLow > p.warnHigh) {
      out.push('The low warning limit is above the high one.')
    }
    return out
  }

  function savePoint() {
    if (!editing) return
    const b = pointBlockers(editing)
    if (b.length) { toast.error(b[0]); return }
    const asset = m.assets.rows.find((a) => a.code === editing.assetCode)
    const payload = { ...editing, assetName: asset?.name ?? '' } as ConditionPoint
    if (editing.uid) { m.points.update(editing.uid, payload); toast.success('Monitoring point updated') }
    else { m.points.create({ ...(BLANK_POINT() as ConditionPoint), ...payload, uid: newUid('cp') }); toast.success('Monitoring point added') }
    setEditing(null)
  }

  function removePoint(p: ConditionPoint) {
    const n = m.readings.rows.filter((r) => !r.deletedAt && r.pointUid === p.uid).length
    if (n) { toast.error(`${n} reading(s) belong to this point. Deactivate it instead — the history is the whole value of monitoring.`); return }
    m.points.remove(p.uid)
    if (openUid === p.uid) setOpenUid(null)
    toast.success('Monitoring point removed')
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<ConditionTrend>[] = [
    { key: 'asset', header: 'Asset', width: '18rem', render: (t) => (<><p className="truncate text-xs text-fg">{t.point.assetName}</p><p className="font-mono text-2xs text-fg-subtle">{t.point.assetCode}</p></>) },
    { key: 'parameter', header: 'Parameter', width: '12rem', render: (t) => <ParameterBadge parameter={t.point.parameter} /> },
    {
      key: 'latest', header: 'Latest', width: '11rem', align: 'right',
      render: (t) => t.latest
        ? (<><p className={cn('text-xs tabular font-medium', t.verdict === 'TRIP' ? 'text-danger' : t.verdict === 'WARNING' ? 'text-warning' : 'text-fg')}>{t.latest.value} {t.point.uom}</p><p className="text-3xs text-fg-subtle">{formatDateTime(t.latest.readAt).slice(0, 11)}</p></>)
        : <span className="text-2xs text-fg-subtle">Never read</span>,
    },
    {
      key: 'band', header: 'Normal band', width: '13rem',
      render: (t) => {
        const p = t.point
        const lo = p.warnLow !== null ? p.warnLow : p.tripLow
        const hi = p.warnHigh !== null ? p.warnHigh : p.tripHigh
        if (lo === null && hi === null) return <span className="text-2xs text-fg-subtle">No limits</span>
        return <span className="text-2xs tabular text-fg-muted">{lo === null ? '≤' : `${lo} –`} {hi ?? '∞'} {p.uom}</span>
      },
    },
    {
      key: 'slope', header: 'Trend', width: '12rem',
      render: (t) => {
        if (t.readings.length < 2) return <span className="text-2xs text-fg-subtle">Too few readings</span>
        const rising = t.slope > 0.001
        const falling = t.slope < -0.001
        return (
          <span className={cn('inline-flex items-center gap-1 text-2xs tabular', rising ? 'text-warning' : falling ? 'text-brand-600' : 'text-fg-muted')}>
            {rising && <TrendingUp className="h-3 w-3" />}
            {rising ? '+' : ''}{t.slope} {t.point.uom}/read
          </span>
        )
      },
    },
    {
      key: 'toTrip', header: 'To trip', width: '11rem',
      render: (t) => t.readingsToTrip === null
        ? <span className="text-2xs text-fg-subtle">—</span>
        : <Badge tone={t.readingsToTrip <= 2 ? 'danger' : t.readingsToTrip <= 5 ? 'warning' : 'neutral'} size="sm">{t.readingsToTrip} reading{t.readingsToTrip === 1 ? '' : 's'}</Badge>,
    },
    { key: 'verdict', header: 'Verdict', width: '11rem', render: (t) => <VerdictBadge verdict={t.verdict} /> },
    { key: 'count', header: 'Readings', width: '8rem', align: 'right', render: (t) => <span className="text-2xs tabular text-fg-muted">{t.readings.length}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Condition monitoring"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Condition monitoring' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK_POINT())}>New monitoring point</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'alerts', label: 'Outside band', count: k.trip + k.warning },
              { id: 'trending', label: 'Trending to trip', count: k.trending },
              { id: 'all', label: 'All points', count: k.total },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Past the trip limit" value={k.trip} sub={k.trip ? 'Stop the asset' : 'Nothing beyond its trip'} icon={<Activity />} tone={k.trip ? 'danger' : 'success'} />
        <StatTile label="In the warning band" value={k.warning} sub="Outside normal, not yet at trip" tone={k.warning ? 'warning' : 'success'} />
        <StatTile label="Trending to trip" value={k.trending} sub="Within six rounds at the present rate" icon={<TrendingUp />} tone={k.trending ? 'warning' : 'success'} />
        <StatTile label="Monitoring points" value={k.total} sub={k.unread ? `${k.unread} never read` : 'All have readings'} tone="brand" />
      </div>

      {k.noLimits > 0 && (
        <Alert tone="warning" title={`${k.noLimits} point${k.noLimits === 1 ? ' has' : 's have'} readings but no limits`} className="mb-4">
          A reading with nothing to compare it against cannot raise an alert. Set the warning and trip bands, or the round is being walked for nothing.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(t) => t.point.uid}
        searchable
        searchPlaceholder="Search by asset or parameter"
        onRowClick={(t) => setOpenUid(t.point.uid)}
        rowClassName={(t) => (t.verdict === 'TRIP' ? 'bg-danger/5' : t.verdict === 'WARNING' ? 'bg-warning/5' : !t.point.isActive ? 'opacity-60' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, `condition-${tab}`, 'Condition monitoring', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(t) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...t.point })} />
            <MenuItem label="Log a reading" onClick={() => { setLogging(t); setValue(''); setLogRemarks('') }} />
            {(t.verdict === 'TRIP' || t.verdict === 'WARNING' || (t.readingsToTrip !== null && t.readingsToTrip <= 6)) && (
              <MenuItem label="Raise a predictive job" onClick={() => raiseJob(t)} />
            )}
            <MenuItem label="Delete" danger onClick={() => removePoint(t.point)} />
          </>
        )}
        emptyTitle={tab === 'alerts' ? 'Everything is inside its band' : 'No monitoring points'}
        emptyDescription={tab === 'alerts' ? 'No parameter is in warning or past its trip limit.' : 'Add a point so a failure can be seen coming.'}
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.point.assetName} · ${PARAMETER_LABEL[detail.point.parameter]}` : ''} width="max-w-2xl">
        {detail && (() => {
          const chartData = detail.readings.map((r, i) => ({ n: i + 1, when: formatDateTime(r.readAt).slice(0, 6), value: r.value }))
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={detail.verdict} />
                <ParameterBadge parameter={detail.point.parameter} />
                {!detail.point.isActive && <Badge tone="neutral" size="sm">Inactive</Badge>}
              </div>

              <Alert tone={detail.verdict === 'TRIP' ? 'danger' : detail.verdict === 'WARNING' ? 'warning' : 'tip'} title="Where it stands">
                {detail.message}
                {detail.readingsToTrip !== null && detail.readingsToTrip > 0 && (
                  <> At {detail.slope > 0 ? '+' : ''}{detail.slope} {detail.point.uom} per round, that is about <strong>{detail.readingsToTrip} more reading{detail.readingsToTrip === 1 ? '' : 's'}</strong> before it reaches the trip limit.</>
                )}
              </Alert>

              <DetailBlock title="Limits">
                <DataGrid columns={4} items={[
                  { label: 'Low trip', value: detail.point.tripLow ?? '—' },
                  { label: 'Low warning', value: detail.point.warnLow ?? '—' },
                  { label: 'High warning', value: detail.point.warnHigh ?? '—' },
                  { label: 'High trip', value: detail.point.tripHigh ?? '—' },
                ]} />
                <p className="mt-1 text-3xs text-fg-subtle">All in {detail.point.uom}. A value past a trip limit means stop; past a warning means investigate.</p>
              </DetailBlock>

              {chartData.length >= 2 && (
                <DetailBlock title={`History (${chartData.length} readings)`}>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                        <XAxis dataKey="when" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} />
                        <Tooltip content={<ChartTip suffix={` ${detail.point.uom}`} />} />
                        {detail.point.warnHigh !== null && <ReferenceLine y={detail.point.warnHigh} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: 'warn', fontSize: 9, fill: '#f59e0b', position: 'right' }} />}
                        {detail.point.tripHigh !== null && <ReferenceLine y={detail.point.tripHigh} stroke="#ef4444" strokeDasharray="4 3" label={{ value: 'trip', fontSize: 9, fill: '#ef4444', position: 'right' }} />}
                        {detail.point.warnLow !== null && <ReferenceLine y={detail.point.warnLow} stroke="#f59e0b" strokeDasharray="4 3" />}
                        {detail.point.tripLow !== null && <ReferenceLine y={detail.point.tripLow} stroke="#ef4444" strokeDasharray="4 3" />}
                        <Line type="monotone" dataKey="value" name={PARAMETER_LABEL[detail.point.parameter]} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </DetailBlock>
              )}

              <DetailBlock title="Readings">
                <div className="max-h-56 overflow-y-auto rounded border border-border">
                  <table className="grid-table">
                    <thead><tr><th style={{ width: '11rem' }}>When</th><th className="text-right" style={{ width: '8rem' }}>Value</th><th style={{ width: '9rem' }}>Verdict</th><th>Notes</th></tr></thead>
                    <tbody>
                      {detail.readings.slice().reverse().map((r) => {
                        const v = evaluateReading(detail.point, r.value)
                        return (
                          <tr key={r.uid} className={v.verdict === 'TRIP' ? 'bg-danger/5' : v.verdict === 'WARNING' ? 'bg-warning/5' : undefined}>
                            <td className="text-2xs tabular text-fg-muted">{formatDateTime(r.readAt)}</td>
                            <td className="text-right text-xs tabular text-fg">{r.value}</td>
                            <td><VerdictBadge verdict={v.verdict} /></td>
                            <td><p className="truncate text-2xs text-fg-muted">{r.remarks || '—'}</p></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </DetailBlock>

              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="primary" size="sm" onClick={() => { setLogging(detail); setValue(''); setLogRemarks('') }}>Log a reading</Button>
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail.point }); setOpenUid(null) }}>Edit limits</Button>
                {(detail.verdict === 'TRIP' || detail.verdict === 'WARNING') && (
                  <Button variant="outline" size="sm" onClick={() => raiseJob(detail)}>Raise a job</Button>
                )}
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── log a reading ────────────────────────────────────── */}
      <Modal
        open={!!logging}
        onClose={() => setLogging(null)}
        title={logging ? `Log a ${PARAMETER_LABEL[logging.point.parameter].toLowerCase()} reading` : ''}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setLogging(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={logReading}>Log it</Button></>}
      >
        {logging && (() => {
          const v = Number(value)
          const preview = value.trim() !== '' && Number.isFinite(v) ? evaluateReading(logging.point, v) : null
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                {logging.point.assetCode} · {logging.point.assetName}
                {logging.latest && <> — last read <strong className="text-fg">{logging.latest.value} {logging.point.uom}</strong> on {formatDateTime(logging.latest.readAt)}.</>}
              </p>
              <Input label={`Value (${logging.point.uom})`} type="number" required value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
              <Textarea label="Notes" rows={2} value={logRemarks} onChange={(e) => setLogRemarks(e.target.value)} />
              {preview && (
                <Alert tone={preview.verdict === 'TRIP' ? 'danger' : preview.verdict === 'WARNING' ? 'warning' : 'tip'} title={preview.verdict === 'TRIP' ? 'Past the trip limit' : preview.verdict === 'WARNING' ? 'In the warning band' : 'Normal'}>
                  {preview.message}
                  {logging.latest && <> That is {v > logging.latest.value ? 'up' : v < logging.latest.value ? 'down' : 'unchanged'} {v !== logging.latest.value ? `${Math.abs(v - logging.latest.value).toFixed(2)} ${logging.point.uom}` : ''} on the last round.</>}
                </Alert>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* ── point form ───────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? 'Edit monitoring point' : 'New monitoring point'}
        width="max-w-lg"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={savePoint}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <Select
              label="Asset" required value={editing.assetCode ?? ''}
              onChange={(e) => { const a = m.assets.rows.find((x) => x.code === e.target.value); setEditing({ ...editing, assetCode: e.target.value, assetName: a?.name ?? '' }) }}
            >
              <option value="">Choose an asset…</option>
              {m.assets.rows.filter((a) => !a.deletedAt).sort((a, b) => a.code.localeCompare(b.code)).map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Parameter" value={editing.parameter ?? 'VIBRATION'} onChange={(e) => setEditing({ ...editing, parameter: e.target.value as ConditionParameter })}>
                {(Object.keys(PARAMETER_LABEL) as ConditionParameter[]).map((p) => (<option key={p} value={p}>{PARAMETER_LABEL[p]}</option>))}
              </Select>
              <Input label="Unit" required value={editing.uom ?? ''} onChange={(e) => setEditing({ ...editing, uom: e.target.value })} placeholder="mm/s" />
            </div>
            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="mb-2 text-3xs uppercase tracking-wider text-fg-subtle">Limits — leave blank where a side does not apply</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Low trip" type="number" value={editing.tripLow === null || editing.tripLow === undefined ? '' : String(editing.tripLow)} onChange={(e) => setEditing({ ...editing, tripLow: e.target.value === '' ? null : Number(e.target.value) })} />
                <Input label="Low warning" type="number" value={editing.warnLow === null || editing.warnLow === undefined ? '' : String(editing.warnLow)} onChange={(e) => setEditing({ ...editing, warnLow: e.target.value === '' ? null : Number(e.target.value) })} />
                <Input label="High warning" type="number" value={editing.warnHigh === null || editing.warnHigh === undefined ? '' : String(editing.warnHigh)} onChange={(e) => setEditing({ ...editing, warnHigh: e.target.value === '' ? null : Number(e.target.value) })} />
                <Input label="High trip" type="number" value={editing.tripHigh === null || editing.tripHigh === undefined ? '' : String(editing.tripHigh)} onChange={(e) => setEditing({ ...editing, tripHigh: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
              <p className="mt-2 text-3xs text-fg-subtle">A warning must sit inside its trip, or it can never fire.</p>
            </div>
            <Switch label="Active" checked={editing.isActive !== false} onChange={(v) => setEditing({ ...editing, isActive: v })} />

            {(() => {
              const b = pointBlockers(editing)
              return b.length ? <Alert tone="danger" title="Cannot save yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert> : null
            })()}
          </div>
        )}
      </Drawer>
    </div>
  )
}
