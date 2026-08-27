import { useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
import { formatDate, formatDateTime } from '@/lib/format'
import { newUid } from '@/store/data'
import {
  CategoryBadge, ChartTip, DetailBlock, MaintStatusBadge, PriorityBadge,
  duration, hours, useMaintenanceData,
} from '@/components/maintenance/MaintShell'
import { BREAKDOWN_CATEGORY_LABEL, isoDate, minutesBetween, reliabilityOf } from '@/lib/maintFlow'
import type { Breakdown, BreakdownCategory, BreakdownStatus, WoPriority } from '@/types/maintenance'

/**
 * Breakdown maintenance (Ch 9).
 *
 * A breakdown is not closed when the machine restarts — it is closed when
 * somebody has written down why it failed and what will stop it happening
 * again. The screen enforces exactly that: no root cause, no closure.
 */

const FLOW: Record<BreakdownStatus, BreakdownStatus[]> = {
  REPORTED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['UNDER_REPAIR', 'CANCELLED'],
  UNDER_REPAIR: ['REPAIRED'],
  REPAIRED: ['VERIFIED'],
  VERIFIED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

const STATUS_LABEL: Record<BreakdownStatus, string> = {
  REPORTED: 'Reported', ACKNOWLEDGED: 'Acknowledged', UNDER_REPAIR: 'Under repair',
  REPAIRED: 'Repaired', VERIFIED: 'Verified', CLOSED: 'Closed', CANCELLED: 'Cancelled',
}

const OPEN: BreakdownStatus[] = ['REPORTED', 'ACKNOWLEDGED', 'UNDER_REPAIR', 'REPAIRED', 'VERIFIED']

/** What stops a breakdown moving on. */
function blockers(b: Breakdown, to: BreakdownStatus): string[] {
  const out: string[] = []
  if (to === 'ACKNOWLEDGED' && b.responseMinutes === null) out.push('Record how long it took someone to attend.')
  if (to === 'UNDER_REPAIR' && !b.immediateAction.trim()) out.push('Record what was done immediately to make the area safe and keep production going.')
  if (to === 'REPAIRED') {
    if (!b.downtimeEnd) out.push('Record when the machine came back — without it there is no repair time and no availability figure.')
    if (!b.correctiveAction.trim()) out.push('Record what was actually repaired.')
  }
  if (to === 'VERIFIED' && !b.workOrderNo && !b.correctiveAction.trim()) out.push('Nothing has been recorded as repaired.')
  if (to === 'CLOSED') {
    if (b.rootCause.trim().length < 15) out.push('Record the root cause. "Bearing failed" is a symptom; why it failed is the cause.')
    if (!b.causeCategory) out.push('Classify the cause so failures can be counted by type.')
    if (!b.preventiveAction.trim()) out.push('Record what will stop this recurring. A breakdown closed without one will be back.')
    if (!b.verifiedBy) out.push('The repair has not been verified by anyone.')
  }
  if (to === 'CANCELLED' && b.remarks.trim().length < 10) out.push('Cancelling needs a recorded reason.')
  return out
}

const BLANK = (): Partial<Breakdown> => ({
  docNo: '', assetCode: '', assetName: '', reportedBy: 'You', reportedAt: new Date().toISOString(),
  category: 'MECHANICAL', priority: 'HIGH', symptoms: '', immediateAction: '', productionOrderNo: '',
  downtimeStart: new Date().toISOString(), downtimeEnd: null, responseMinutes: null,
  rootCause: '', causeCategory: null, correctiveAction: '', preventiveAction: '',
  workOrderNo: null, status: 'REPORTED', verifiedBy: null, closedOn: null, remarks: '', version: 1,
})

/** An ISO timestamp as the value a datetime-local input expects. */
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')

export function BreakdownsPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const { rows, create, update, remove } = m.breakdowns
  const today = isoDate(new Date())
  const from = isoDate(new Date(Date.now() - 89 * 86_400_000))

  const [tab, setTab] = useState('open')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<Breakdown> | null>(null)
  const [advancing, setAdvancing] = useState<{ b: Breakdown; to: BreakdownStatus } | null>(null)

  const live = useMemo(() => rows.filter((b) => !b.deletedAt), [rows])
  const detail = live.find((b) => b.uid === openUid) ?? null

  const filtered = useMemo(() => {
    if (tab === 'open') return live.filter((b) => OPEN.includes(b.status))
    if (tab === 'norca') return live.filter((b) => b.status !== 'CANCELLED' && (!b.rootCause.trim() || !b.preventiveAction.trim()))
    if (tab === 'closed') return live.filter((b) => b.status === 'CLOSED' || b.status === 'CANCELLED')
    return live
  }, [live, tab])

  const k = useMemo(() => {
    const inWindow = live.filter((b) => b.status !== 'CANCELLED' && b.downtimeStart.slice(0, 10) >= from)
    const closedRepairs = inWindow.filter((b) => b.downtimeEnd)
    const totalRepairMinutes = closedRepairs.reduce((s, b) => s + minutesBetween(b.downtimeStart, b.downtimeEnd as string), 0)
    const openOnes = live.filter((b) => OPEN.includes(b.status))
    const accruing = openOnes.reduce((s, b) => s + (b.downtimeEnd ? 0 : minutesBetween(b.downtimeStart, new Date().toISOString())), 0)
    const responses = inWindow.filter((b) => b.responseMinutes !== null).map((b) => b.responseMinutes as number)

    const byCategory = (Object.keys(BREAKDOWN_CATEGORY_LABEL) as BreakdownCategory[])
      .map((c) => {
        const of = inWindow.filter((b) => (b.causeCategory ?? b.category) === c)
        return {
          category: BREAKDOWN_CATEGORY_LABEL[c],
          count: of.length,
          minutes: of.reduce((s, b) => s + (b.downtimeEnd ? minutesBetween(b.downtimeStart, b.downtimeEnd) : 0), 0),
        }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.minutes - a.minutes)

    return {
      open: openOnes.length,
      down: openOnes.filter((b) => !b.downtimeEnd).length,
      accruing,
      inWindow: inWindow.length,
      mttr: closedRepairs.length ? totalRepairMinutes / 60 / closedRepairs.length : null,
      avgResponse: responses.length ? responses.reduce((s, v) => s + v, 0) / responses.length : null,
      totalDowntime: totalRepairMinutes + accruing,
      noRca: live.filter((b) => b.status !== 'CANCELLED' && (!b.rootCause.trim() || !b.preventiveAction.trim())).length,
      byCategory,
      repeat: (() => {
        // Assets that failed more than once in the window — the ones worth a plan change.
        const counts = new Map<string, { name: string; n: number }>()
        for (const b of inWindow) {
          const e = counts.get(b.assetCode) ?? { name: b.assetName, n: 0 }
          e.n += 1
          counts.set(b.assetCode, e)
        }
        return [...counts.entries()].filter(([, v]) => v.n > 1).map(([code, v]) => ({ code, ...v }))
      })(),
    }
  }, [live, from])

  /* ── actions ────────────────────────────────────────────────── */

  function advance(b: Breakdown, to: BreakdownStatus) {
    const bl = blockers(b, to)
    if (bl.length) { toast.error(bl[0]); return }
    const patch: Partial<Breakdown> = { status: to }
    if (to === 'VERIFIED') patch.verifiedBy = 'You'
    if (to === 'CLOSED' || to === 'CANCELLED') patch.closedOn = today
    update(b.uid, patch)

    // Bringing the machine back should say so on the asset, not just here.
    if (to === 'REPAIRED') {
      const asset = m.assets.rows.find((a) => !a.deletedAt && a.code === b.assetCode)
      if (asset && (asset.status === 'BREAKDOWN' || asset.status === 'UNDER_MAINTENANCE')) {
        m.assets.update(asset.uid, { status: 'RUNNING' })
        toast.success(`${b.docNo} repaired`, `${asset.code} is back to running.`)
        setAdvancing(null)
        return
      }
    }
    toast.success(`${b.docNo} → ${STATUS_LABEL[to]}`)
    setAdvancing(null)
  }

  /** Raise the repair job from the ticket, carrying the context across. */
  function raiseWorkOrder(b: Breakdown) {
    if (b.workOrderNo) { toast.error(`${b.workOrderNo} already covers this breakdown.`); return }
    const asset = m.assets.rows.find((a) => a.code === b.assetCode)
    const docNo = `WO/26-27/${String(m.workOrders.rows.length + 120).padStart(4, '0')}`
    m.workOrders.create({
      uid: newUid('wo'), docNo, woType: 'BREAKDOWN', priority: b.priority,
      assetCode: b.assetCode, assetName: b.assetName, sourceDocNo: b.docNo,
      title: `${b.assetName} — ${b.category.toLowerCase()} failure`,
      description: b.symptoms,
      raisedBy: 'You', raisedOn: today, supervisor: '',
      plannedStart: today, plannedFinish: today,
      actualStart: null, actualFinish: null, status: 'PLANNED',
      labour: [], spares: [], externalCost: 0, externalVendor: '',
      checklist: [
        { uid: newUid('wcl'), seq: 1, description: 'Make the area safe and isolate the asset', mandatory: true, capture: 'NONE', uom: '', done: false, reading: null, result: null, remarks: '' },
        { uid: newUid('wcl'), seq: 2, description: 'Diagnose the failure', mandatory: true, capture: 'NONE', uom: '', done: false, reading: null, result: null, remarks: '' },
        { uid: newUid('wcl'), seq: 3, description: 'Carry out the repair', mandatory: true, capture: 'NONE', uom: '', done: false, reading: null, result: null, remarks: '' },
        { uid: newUid('wcl'), seq: 4, description: 'Function test before handback', mandatory: true, capture: 'PASS_FAIL', uom: '', done: false, reading: null, result: null, remarks: '' },
      ],
      permitNo: null, requiresPermit: false, downtimeMinutes: 0,
      verifiedBy: null, verifiedOn: null, closedOn: null,
      isRework: false, reworkOfDocNo: null,
      remarks: `Raised from breakdown ${b.docNo}.`, version: 1,
    })
    update(b.uid, { workOrderNo: docNo, status: b.status === 'REPORTED' ? 'ACKNOWLEDGED' : b.status })
    if (asset) m.assets.update(asset.uid, { status: 'BREAKDOWN' })
    toast.success(`${docNo} raised`, 'The asset is marked down and the job is planned.')
  }

  function save() {
    if (!editing) return
    const problems: string[] = []
    if (!editing.assetCode) problems.push('Which asset has failed?')
    if ((editing.symptoms ?? '').trim().length < 10) problems.push('Describe what is actually wrong.')
    if (!editing.downtimeStart) problems.push('When did it stop?')
    if (editing.downtimeEnd && editing.downtimeStart && editing.downtimeEnd < editing.downtimeStart) {
      problems.push('The machine cannot have come back before it stopped.')
    }
    if (problems.length) { toast.error(problems[0]); return }

    const asset = m.assets.rows.find((a) => a.code === editing.assetCode)
    const payload = { ...editing, assetName: asset?.name ?? '' } as Breakdown
    if (editing.uid) { update(editing.uid, payload); toast.success(`${editing.docNo} updated`) }
    else {
      const seq = live.length + 10
      create({ ...(BLANK() as Breakdown), ...payload, uid: newUid('brk'), docNo: `BRK/26-27/${String(seq).padStart(4, '0')}` })
      if (asset) m.assets.update(asset.uid, { status: 'BREAKDOWN' })
      toast.success('Breakdown logged', `${asset?.code ?? 'The asset'} is marked down.`)
    }
    setEditing(null)
  }

  function removeRow(b: Breakdown) {
    if (b.status !== 'REPORTED') { toast.error('This failure is part of the asset history. Cancel it with a reason rather than deleting it.'); return }
    remove(b.uid)
    if (openUid === b.uid) setOpenUid(null)
    toast.success(`${b.docNo} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<Breakdown>[] = [
    { key: 'doc', header: 'Ticket', width: '13rem', render: (b) => (<><p className="font-mono text-2xs text-fg">{b.docNo}</p><p className="text-3xs text-fg-subtle">{formatDateTime(b.reportedAt)}</p></>) },
    { key: 'asset', header: 'Asset', width: '17rem', render: (b) => (<><p className="truncate text-xs text-fg">{b.assetName}</p><p className="font-mono text-2xs text-fg-subtle">{b.assetCode}</p></>) },
    { key: 'category', header: 'Category', width: '11rem', render: (b) => <CategoryBadge category={b.causeCategory ?? b.category} /> },
    { key: 'priority', header: 'Priority', width: '8rem', render: (b) => <PriorityBadge priority={b.priority} /> },
    {
      key: 'downtime', header: 'Downtime', width: '11rem', align: 'right',
      render: (b) => {
        const mins = b.downtimeEnd ? minutesBetween(b.downtimeStart, b.downtimeEnd) : minutesBetween(b.downtimeStart, new Date().toISOString())
        return <span className={cn('text-xs tabular', b.downtimeEnd ? 'text-fg' : 'text-danger')}>{duration(mins)}{b.downtimeEnd ? '' : ' …'}</span>
      },
    },
    { key: 'response', header: 'Response', width: '9rem', align: 'right', render: (b) => (b.responseMinutes === null ? <span className="text-2xs text-fg-subtle">—</span> : <span className={cn('text-2xs tabular', b.responseMinutes > 30 ? 'text-warning' : 'text-fg-muted')}>{b.responseMinutes} m</span>) },
    { key: 'wo', header: 'Work order', width: '11rem', render: (b) => (b.workOrderNo ? <span className="font-mono text-2xs text-fg-muted">{b.workOrderNo}</span> : <Badge tone="warning" size="sm">None raised</Badge>) },
    {
      key: 'rca', header: 'Root cause', width: '10rem',
      render: (b) => b.rootCause.trim()
        ? (b.preventiveAction.trim() ? <Badge tone="success" size="sm">Complete</Badge> : <Badge tone="warning" size="sm">No prevention</Badge>)
        : <Badge tone="danger" size="sm">Not done</Badge>,
    },
    { key: 'status', header: 'Status', width: '11rem', render: (b) => <MaintStatusBadge status={b.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Breakdowns"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Breakdowns' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>Log a breakdown</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: k.open },
              { id: 'norca', label: 'No root cause', count: k.noRca },
              { id: 'closed', label: 'Closed', count: live.filter((b) => b.status === 'CLOSED' || b.status === 'CANCELLED').length },
              { id: 'all', label: 'All', count: live.length },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Down now" value={k.down} sub={k.down ? `${duration(k.accruing)} of downtime accruing` : 'Nothing is stopped'} icon={<AlertTriangle />} tone={k.down ? 'danger' : 'success'} />
        <StatTile label="Failures, 90 days" value={k.inWindow} sub={`${duration(k.totalDowntime)} of downtime in total`} tone={k.inWindow > 6 ? 'warning' : 'brand'} />
        <StatTile label="Mean time to repair" value={k.mttr === null ? '—' : `${k.mttr.toFixed(1)} h`} sub={k.avgResponse === null ? 'No response times recorded' : `Response averages ${k.avgResponse.toFixed(0)} minutes`} tone={k.mttr !== null && k.mttr > 6 ? 'warning' : 'success'} />
        <StatTile label="Without a root cause" value={k.noRca} sub={k.noRca ? 'These will happen again' : 'Every failure has been analysed'} tone={k.noRca ? 'danger' : 'success'} />
      </div>

      {k.repeat.length > 0 && (
        <Alert tone="warning" title={`${k.repeat.length} asset${k.repeat.length === 1 ? ' has' : 's have'} failed more than once in 90 days`} className="mb-4">
          {k.repeat.map((r) => `${r.name} (${r.n})`).join(' · ')}. Repeat failures on the same asset mean the maintenance plan is wrong, not that the technician is slow — review the interval and the checklist before adding more repairs.
        </Alert>
      )}

      {k.byCategory.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Where the failures come from" description="Last 90 days, by downtime rather than by count — a long failure matters more than a frequent short one" />
          <CardBody className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={k.byCategory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<ChartTip suffix=" min" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="minutes" name="Downtime" maxBarSize={34} radius={[3, 3, 0, 0]}>
                  {k.byCategory.map((_, i) => (<Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#94a3b8'} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(b) => b.uid}
        searchable
        searchPlaceholder="Search by ticket, asset or symptom"
        onRowClick={(b) => setOpenUid(b.uid)}
        rowClassName={(b) => (OPEN.includes(b.status) && !b.downtimeEnd ? 'bg-danger/5' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, `breakdowns-${tab}`, 'Breakdown register', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(b) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...b })} />
            {!b.workOrderNo && b.status !== 'CLOSED' && <MenuItem label="Raise a work order" onClick={() => raiseWorkOrder(b)} />}
            {FLOW[b.status].map((to) => (<MenuItem key={to} label={STATUS_LABEL[to]} onClick={() => setAdvancing({ b, to })} />))}
            <MenuItem label="Delete" danger onClick={() => removeRow(b)} />
          </>
        )}
        emptyTitle={tab === 'open' ? 'Nothing is down' : 'No breakdowns'}
        emptyDescription={tab === 'open' ? 'Every asset is running.' : 'Log one when a machine stops.'}
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.docNo} · ${detail.assetName}` : ''} width="max-w-2xl">
        {detail && (() => {
          const downMins = detail.downtimeEnd ? minutesBetween(detail.downtimeStart, detail.downtimeEnd) : minutesBetween(detail.downtimeStart, new Date().toISOString())
          const asset = m.assets.rows.find((a) => a.code === detail.assetCode)
          const rel = asset ? reliabilityOf(asset, live, from, today) : null
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <MaintStatusBadge status={detail.status} size="md" />
                <PriorityBadge priority={detail.priority} />
                <CategoryBadge category={detail.category} />
                {!detail.downtimeEnd && <Badge tone="danger" size="sm">Still down · {duration(downMins)}</Badge>}
              </div>

              <DetailBlock title="What happened">
                <p className="text-xs leading-relaxed text-fg">{detail.symptoms}</p>
                {detail.immediateAction && (
                  <div className="mt-2 rounded border border-border bg-surface-2 p-2.5">
                    <p className="text-3xs uppercase tracking-wider text-fg-subtle">Immediate action</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{detail.immediateAction}</p>
                  </div>
                )}
              </DetailBlock>

              <DetailBlock title="Timing">
                <DataGrid columns={3} items={[
                  { label: 'Reported', value: formatDateTime(detail.reportedAt) },
                  { label: 'By', value: detail.reportedBy },
                  { label: 'Response', value: detail.responseMinutes === null ? 'Not recorded' : `${detail.responseMinutes} minutes` },
                  { label: 'Down from', value: formatDateTime(detail.downtimeStart) },
                  { label: 'Back at', value: detail.downtimeEnd ? formatDateTime(detail.downtimeEnd) : 'Still down' },
                  { label: 'Total downtime', value: duration(downMins) },
                  { label: 'Production order hit', value: detail.productionOrderNo || 'None' },
                  { label: 'Work order', value: detail.workOrderNo || 'None raised', mono: !!detail.workOrderNo },
                  { label: 'Closed', value: detail.closedOn ? formatDate(detail.closedOn) : 'Open' },
                ]} />
              </DetailBlock>

              {rel && (
                <DetailBlock title="This asset's record — last 90 days">
                  <DataGrid columns={4} items={[
                    { label: 'Failures', value: String(rel.failures) },
                    { label: 'Downtime', value: duration(rel.downtimeMinutes) },
                    { label: 'MTBF', value: rel.mtbfHours === null ? '—' : hours(rel.mtbfHours) },
                    { label: 'Availability', value: `${rel.availabilityPct.toFixed(1)}%` },
                  ]} />
                </DetailBlock>
              )}

              <DetailBlock title="Root cause analysis">
                {detail.rootCause ? (
                  <div className="space-y-2">
                    <div className="rounded border border-border bg-surface-2 p-2.5">
                      <p className="text-3xs uppercase tracking-wider text-fg-subtle">Root cause{detail.causeCategory ? ` · ${BREAKDOWN_CATEGORY_LABEL[detail.causeCategory]}` : ''}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-fg">{detail.rootCause}</p>
                    </div>
                    {detail.correctiveAction && (
                      <div className="rounded border border-border p-2.5">
                        <p className="text-3xs uppercase tracking-wider text-fg-subtle">What was repaired</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{detail.correctiveAction}</p>
                      </div>
                    )}
                    {detail.preventiveAction ? (
                      <div className="rounded border border-success/40 bg-success/5 p-2.5">
                        <p className="text-3xs uppercase tracking-wider text-fg-subtle">What stops it recurring</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-fg">{detail.preventiveAction}</p>
                      </div>
                    ) : (
                      <Alert tone="warning" title="No preventive action">The cause is known but nothing has been changed. Expect this failure again.</Alert>
                    )}
                  </div>
                ) : (
                  <Alert tone="danger" title="Not analysed">
                    The machine may be running again, but nothing has been recorded about why it stopped. This breakdown cannot be closed until it is.
                  </Alert>
                )}
              </DetailBlock>

              {detail.remarks && <DetailBlock title="Notes"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>}

              {FLOW[detail.status].length > 0 && (
                <DetailBlock title="Next step">
                  <div className="flex flex-wrap gap-2">
                    {FLOW[detail.status].map((to) => {
                      const b = blockers(detail, to)
                      return (
                        <Button key={to} variant={to === 'CANCELLED' ? 'outline' : 'primary'} size="sm" onClick={() => setAdvancing({ b: detail, to })} disabled={b.length > 0} title={b[0]}>
                          {STATUS_LABEL[to]}
                        </Button>
                      )
                    })}
                    {!detail.workOrderNo && <Button variant="outline" size="sm" onClick={() => raiseWorkOrder(detail)}>Raise a work order</Button>}
                  </div>
                  {(() => {
                    const all = FLOW[detail.status].flatMap((to) => blockers(detail, to).map((x) => `${STATUS_LABEL[to]}: ${x}`))
                    return all.length ? (
                      <Alert tone="info" title="Outstanding before the next step" className="mt-2">
                        <ul className="list-disc space-y-0.5 pl-4">{all.map((x) => (<li key={x}>{x}</li>))}</ul>
                      </Alert>
                    ) : null
                  })()}
                </DetailBlock>
              )}

              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail }); setOpenUid(null) }}>Edit</Button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── advance ──────────────────────────────────────────── */}
      <Modal
        open={!!advancing}
        onClose={() => setAdvancing(null)}
        title={advancing ? `${advancing.b.docNo} → ${STATUS_LABEL[advancing.to]}` : ''}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdvancing(null)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => advancing && advance(advancing.b, advancing.to)} disabled={!!advancing && blockers(advancing.b, advancing.to).length > 0}>Confirm</Button>
          </>
        }
      >
        {advancing && (() => {
          const b = blockers(advancing.b, advancing.to)
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                {advancing.to === 'CLOSED'
                  ? 'Closing records that the cause is understood and something has been changed to stop it recurring. It cannot be closed on the repair alone.'
                  : advancing.to === 'REPAIRED'
                    ? 'Marking it repaired stops the downtime clock and sets the asset back to running.'
                    : `Moving ${advancing.b.docNo} to ${STATUS_LABEL[advancing.to].toLowerCase()}.`}
              </p>
              {b.length > 0
                ? <Alert tone="danger" title="Not yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert>
                : <Alert tone="tip" title="Ready">Everything this step requires is in place.</Alert>}
            </div>
          )
        })()}
      </Modal>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.docNo}` : 'Log a breakdown'}
        width="max-w-2xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <Select
              label="Asset" required value={editing.assetCode ?? ''}
              onChange={(e) => {
                const a = m.assets.rows.find((x) => x.code === e.target.value)
                setEditing({ ...editing, assetCode: e.target.value, assetName: a?.name ?? '', priority: a?.criticality === 'A' ? 'CRITICAL' : a?.criticality === 'B' ? 'HIGH' : 'MEDIUM' })
              }}
              hint="A class A asset defaults to critical priority"
            >
              <option value="">Choose the asset that has failed…</option>
              {m.assets.rows.filter((a) => !a.deletedAt).sort((a, b) => a.code.localeCompare(b.code)).map((a) => (
                <option key={a.uid} value={a.code}>{a.code} · {a.name} (class {a.criticality})</option>
              ))}
            </Select>
            <div className="grid grid-cols-3 gap-3">
              <Select label="Category" value={editing.category ?? 'MECHANICAL'} onChange={(e) => setEditing({ ...editing, category: e.target.value as BreakdownCategory })}>
                {(Object.keys(BREAKDOWN_CATEGORY_LABEL) as BreakdownCategory[]).map((c) => (<option key={c} value={c}>{BREAKDOWN_CATEGORY_LABEL[c]}</option>))}
              </Select>
              <Select label="Priority" value={editing.priority ?? 'HIGH'} onChange={(e) => setEditing({ ...editing, priority: e.target.value as WoPriority })}>
                <option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
              </Select>
              <Input label="Reported by" value={editing.reportedBy ?? ''} onChange={(e) => setEditing({ ...editing, reportedBy: e.target.value })} />
            </div>
            <Textarea label="Symptoms" required rows={3} value={editing.symptoms ?? ''} onChange={(e) => setEditing({ ...editing, symptoms: e.target.value })} hint="What the operator actually saw or heard" />
            <Textarea label="Immediate action" rows={2} value={editing.immediateAction ?? ''} onChange={(e) => setEditing({ ...editing, immediateAction: e.target.value })} hint="What was done to make it safe and keep production going" />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Down from" type="datetime-local" value={toLocalInput(editing.downtimeStart ?? null)} onChange={(e) => setEditing({ ...editing, downtimeStart: e.target.value ? new Date(e.target.value).toISOString() : editing.downtimeStart })} />
              <Input label="Back at" type="datetime-local" value={toLocalInput(editing.downtimeEnd ?? null)} onChange={(e) => setEditing({ ...editing, downtimeEnd: e.target.value ? new Date(e.target.value).toISOString() : null })} hint="Leave blank while it is still down" />
              <Input label="Response (minutes)" type="number" value={editing.responseMinutes === null || editing.responseMinutes === undefined ? '' : String(editing.responseMinutes)} onChange={(e) => setEditing({ ...editing, responseMinutes: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <Input label="Production order affected" value={editing.productionOrderNo ?? ''} onChange={(e) => setEditing({ ...editing, productionOrderNo: e.target.value })} />

            <div className="space-y-3 rounded border border-border bg-surface-2 p-3">
              <p className="text-3xs uppercase tracking-wider text-fg-subtle">Analysis — required before closing</p>
              <Textarea label="Root cause" rows={3} value={editing.rootCause ?? ''} onChange={(e) => setEditing({ ...editing, rootCause: e.target.value })} hint="Not the symptom. Why did the part that failed, fail?" />
              <Select label="Cause category" value={editing.causeCategory ?? ''} onChange={(e) => setEditing({ ...editing, causeCategory: (e.target.value || null) as BreakdownCategory | null })}>
                <option value="">Not classified</option>
                {(Object.keys(BREAKDOWN_CATEGORY_LABEL) as BreakdownCategory[]).map((c) => (<option key={c} value={c}>{BREAKDOWN_CATEGORY_LABEL[c]}</option>))}
              </Select>
              <Textarea label="Corrective action" rows={2} value={editing.correctiveAction ?? ''} onChange={(e) => setEditing({ ...editing, correctiveAction: e.target.value })} hint="What was repaired this time" />
              <Textarea label="Preventive action" rows={2} value={editing.preventiveAction ?? ''} onChange={(e) => setEditing({ ...editing, preventiveAction: e.target.value })} hint="What changes so it does not happen again — a plan interval, a checklist line, a spare minimum" />
            </div>

            <Textarea label="Notes" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />
          </div>
        )}
      </Drawer>
    </div>
  )
}
