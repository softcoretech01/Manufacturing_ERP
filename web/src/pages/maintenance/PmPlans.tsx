import { useMemo, useState } from 'react'
import { CalendarCheck, Plus, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, DataGrid } from '@/components/ui/Card'
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
import { formatDate } from '@/lib/format'
import { newUid } from '@/store/data'
import {
  DetailBlock, DueChip, ElapsedBar, Field, TriggerBadge, hours, useMaintenanceData,
} from '@/components/maintenance/MaintShell'
import {
  PERMIT_LABEL, TRIGGER_LABEL, isoDate, planBlockers, pmCompliance, pmDue,
  workOrderFromPlan, type PmDue,
} from '@/lib/maintFlow'
import type { PermitType, PmFrequency, PmPlan, PmTask, PmTrigger } from '@/types/maintenance'

/**
 * Preventive maintenance plans and the schedule they drive (Ch 7).
 *
 * A plan is due on whichever comes first — the calendar or the meter. A press
 * due at 500 running hours does not get a reprieve because the quarter has not
 * ended, and the screen shows both clocks so the reason a job appeared is never
 * a mystery.
 */

const FREQUENCY_DAYS: Record<PmFrequency, number> = {
  DAILY: 1, WEEKLY: 7, MONTHLY: 30, QUARTERLY: 90, HALF_YEARLY: 180, YEARLY: 365, CUSTOM: 0,
}

const BLANK = (): Partial<PmPlan> => ({
  code: '', name: '', assetCode: '', assetName: '',
  trigger: 'CALENDAR', frequency: 'MONTHLY', intervalDays: 30, intervalUnits: 0, leadDays: 3,
  tasks: [], requiredSkill: 'MECHANICAL', estimatedHours: 2,
  requiresShutdown: false, requiresPermit: false, permitTypes: [], spares: [],
  lastDoneOn: isoDate(new Date()), lastDoneMeter: 0, isActive: true, remarks: '', version: 1,
})

const BLANK_TASK = (seq: number): PmTask => ({
  uid: newUid('tsk'), seq, description: '', standardMinutes: 15, mandatory: true, capture: 'NONE', uom: '',
})

export function PmPlansPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const { rows, create, update, remove } = m.plans
  const today = isoDate(new Date())

  const [tab, setTab] = useState('due')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<PmPlan> | null>(null)
  const [generating, setGenerating] = useState(false)

  const live = useMemo(() => rows.filter((p) => !p.deletedAt), [rows])
  const assets = useMemo(() => m.assets.rows.filter((a) => !a.deletedAt), [m.assets.rows])
  const detail = live.find((p) => p.uid === openUid) ?? null

  /** Every plan with its due position, computed once. */
  const dues = useMemo(
    () => live.map((p) => pmDue(p, assets.find((a) => a.code === p.assetCode), today)),
    [live, assets, today],
  )

  const filtered = useMemo(() => {
    if (tab === 'due') return dues.filter((d) => d.isDue)
    if (tab === 'overdue') return dues.filter((d) => d.isOverdue)
    if (tab === 'inactive') return dues.filter((d) => !d.plan.isActive)
    return dues
  }, [dues, tab])

  /** Plans that should generate a work order and have not already got one open. */
  const pending = useMemo(
    () =>
      dues.filter((d) => {
        if (!d.shouldRaise) return false
        return !m.workOrders.rows.some(
          (w) => !w.deletedAt && w.sourceDocNo === d.plan.code && !['CLOSED', 'CANCELLED'].includes(w.status),
        )
      }),
    [dues, m.workOrders.rows],
  )

  const k = useMemo(() => {
    const compliance = pmCompliance(m.workOrders.rows, isoDate(new Date(Date.now() - 89 * 86_400_000)), today)
    return {
      total: live.length,
      active: live.filter((p) => p.isActive).length,
      due: dues.filter((d) => d.isDue).length,
      overdue: dues.filter((d) => d.isOverdue).length,
      pending: pending.length,
      compliance,
      estimatedHours: dues.filter((d) => d.isDue).reduce((s, d) => s + d.plan.estimatedHours, 0),
    }
  }, [live, dues, pending, m.workOrders.rows, today])

  /* ── actions ────────────────────────────────────────────────── */

  /**
   * Raise a work order for every plan that is due and does not already have one.
   * Generating a second job for a plan that already has one open is the classic
   * way a CMMS ends up with forty duplicate work orders, so it is guarded.
   */
  function generateAll() {
    if (!pending.length) { toast.error('Nothing to generate — every due plan already has an open work order.'); return }
    let seq = m.workOrders.rows.length + 120
    for (const d of pending) {
      const asset = assets.find((a) => a.code === d.plan.assetCode)
      m.workOrders.create(workOrderFromPlan(d.plan, asset, `WO/26-27/${String(seq++).padStart(4, '0')}`, today, newUid))
    }
    toast.success(`${pending.length} work order${pending.length === 1 ? '' : 's'} raised`, 'Each carries a copy of its plan checklist.')
    setGenerating(false)
  }

  function generateOne(d: PmDue) {
    const existing = m.workOrders.rows.find((w) => !w.deletedAt && w.sourceDocNo === d.plan.code && !['CLOSED', 'CANCELLED'].includes(w.status))
    if (existing) { toast.error(`${existing.docNo} is already open for this plan.`); return }
    const asset = assets.find((a) => a.code === d.plan.assetCode)
    const docNo = `WO/26-27/${String(m.workOrders.rows.length + 120).padStart(4, '0')}`
    m.workOrders.create(workOrderFromPlan(d.plan, asset, docNo, today, newUid))
    toast.success(`${docNo} raised for ${d.plan.name}`)
  }

  function save() {
    if (!editing) return
    const b = planBlockers(editing, assets, editing.uid, live)
    if (b.length) { toast.error(b[0]); return }
    const asset = assets.find((a) => a.code === editing.assetCode)
    const payload = { ...editing, assetName: asset?.name ?? '' } as PmPlan
    if (editing.uid) { update(editing.uid, payload); toast.success(`${editing.code} updated`) }
    else { create({ ...(BLANK() as PmPlan), ...payload, uid: newUid('pm') }); toast.success(`${editing.code} added`) }
    setEditing(null)
  }

  function removePlan(p: PmPlan) {
    const wos = m.workOrders.rows.filter((w) => !w.deletedAt && w.sourceDocNo === p.code)
    if (wos.length) { toast.error(`${wos.length} work order(s) came from this plan. Deactivate it instead — deleting would orphan their history.`); return }
    remove(p.uid)
    if (openUid === p.uid) setOpenUid(null)
    toast.success(`${p.code} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<PmDue>[] = [
    {
      key: 'plan', header: 'Plan', width: '18rem',
      render: (d) => (<><p className="truncate text-xs text-fg">{d.plan.name}</p><p className="font-mono text-2xs text-fg-subtle">{d.plan.code}</p></>),
    },
    { key: 'asset', header: 'Asset', width: '16rem', render: (d) => (<><p className="truncate text-2xs text-fg-muted">{d.plan.assetName}</p><p className="font-mono text-3xs text-fg-subtle">{d.plan.assetCode}</p></>) },
    { key: 'trigger', header: 'Driven by', width: '12rem', render: (d) => <TriggerBadge trigger={d.plan.trigger} /> },
    {
      key: 'interval', header: 'Interval', width: '11rem',
      render: (d) => (
        <span className="text-2xs text-fg-muted">
          {d.plan.trigger === 'CALENDAR'
            ? `${d.plan.intervalDays} days`
            : d.plan.trigger === 'CONDITION'
              ? 'On alert'
              : `${d.plan.intervalUnits.toLocaleString('en-IN')} ${d.plan.trigger === 'CYCLES' ? 'cycles' : 'hours'}`}
        </span>
      ),
    },
    { key: 'elapsed', header: 'Elapsed', width: '11rem', render: (d) => <ElapsedBar pct={d.elapsedPct} /> },
    {
      key: 'due', header: 'Due', width: '11rem',
      render: (d) =>
        d.plan.trigger === 'CALENDAR'
          ? <DueChip days={d.daysRemaining} />
          : d.unitsRemaining !== null
            ? <span className={cn('text-2xs tabular', d.unitsRemaining < 0 ? 'text-danger' : d.unitsRemaining < d.plan.intervalUnits * 0.1 ? 'text-warning' : 'text-fg-muted')}>
                {d.unitsRemaining < 0 ? `${Math.abs(d.unitsRemaining).toLocaleString('en-IN')} over` : `${d.unitsRemaining.toLocaleString('en-IN')} left`}
              </span>
            : <span className="text-2xs text-fg-subtle">—</span>,
    },
    { key: 'tasks', header: 'Tasks', width: '8rem', align: 'right', render: (d) => <span className="text-2xs tabular text-fg-muted">{d.plan.tasks.length}</span> },
    { key: 'effort', header: 'Effort', width: '8rem', align: 'right', render: (d) => <span className="text-2xs tabular text-fg-muted">{d.plan.estimatedHours} h</span> },
    {
      key: 'state', header: 'State', width: '10rem',
      render: (d) => !d.plan.isActive
        ? <Badge tone="neutral" size="sm">Inactive</Badge>
        : d.isOverdue
          ? <Badge tone="danger" size="sm">Overdue</Badge>
          : d.isDue
            ? <Badge tone="warning" size="sm">Due</Badge>
            : <Badge tone="success" size="sm">In interval</Badge>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Preventive maintenance"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Preventive plans' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Zap />} onClick={() => setGenerating(true)} disabled={!pending.length}>
              Generate {pending.length ? `(${pending.length})` : ''}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>New plan</Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'due', label: 'Due', count: k.due },
              { id: 'overdue', label: 'Overdue', count: k.overdue },
              { id: 'all', label: 'All plans', count: k.total },
              { id: 'inactive', label: 'Inactive', count: k.total - k.active },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Plans due" value={k.due} sub={`${k.overdue} of them overdue · about ${k.estimatedHours} h of work`} icon={<CalendarCheck />} tone={k.overdue ? 'danger' : k.due ? 'warning' : 'success'} />
        <StatTile label="Work orders to raise" value={k.pending} sub={k.pending ? 'Due plans with nothing open against them' : 'Every due plan has a job open'} tone={k.pending ? 'warning' : 'success'} />
        <StatTile label="Compliance, 90 days" value={`${k.compliance.compliancePct.toFixed(0)}%`} sub={`${k.compliance.onTime} on time of ${k.compliance.due} due · ${k.compliance.late} late`} tone={k.compliance.compliancePct >= 90 ? 'success' : k.compliance.compliancePct >= 75 ? 'warning' : 'danger'} />
        <StatTile label="Active plans" value={k.active} sub={`${k.total - k.active} switched off`} tone="brand" />
      </div>

      {k.compliance.late > 0 && (
        <Alert tone="warning" title={`${k.compliance.late} preventive job${k.compliance.late === 1 ? ' was' : 's were'} done late`} className="mb-4">
          Completion is {k.compliance.completionPct.toFixed(0)}% but compliance is {k.compliance.compliancePct.toFixed(0)}% — the work happened, just not by the date it was due.
          Between those two dates the machines were running unprotected, which is the gap this measure exists to expose.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(d) => d.plan.uid}
        searchable
        searchPlaceholder="Search by plan, code or asset"
        onRowClick={(d) => setOpenUid(d.plan.uid)}
        rowClassName={(d) => (d.isOverdue ? 'bg-danger/5' : !d.plan.isActive ? 'opacity-60' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, `pm-schedule-${tab}`, 'Preventive maintenance schedule', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(d) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...d.plan, tasks: d.plan.tasks.map((t) => ({ ...t })), spares: d.plan.spares.map((s) => ({ ...s })) })} />
            {d.isDue && <MenuItem label="Raise a work order" onClick={() => generateOne(d)} />}
            <MenuItem label={d.plan.isActive ? 'Deactivate' : 'Reactivate'} onClick={() => { update(d.plan.uid, { isActive: !d.plan.isActive }); toast.success(`${d.plan.code} ${d.plan.isActive ? 'deactivated' : 'reactivated'}`) }} />
            <MenuItem label="Delete" danger onClick={() => removePlan(d.plan)} />
          </>
        )}
        emptyTitle={tab === 'due' ? 'Nothing due' : 'No plans'}
        emptyDescription={tab === 'due' ? 'Every plan is inside its interval.' : 'Add a plan so work is scheduled rather than remembered.'}
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.code} · ${detail.name}` : ''} width="max-w-2xl">
        {detail && (() => {
          const d = pmDue(detail, assets.find((a) => a.code === detail.assetCode), today)
          const history = m.workOrders.rows.filter((w) => !w.deletedAt && w.sourceDocNo === detail.code)
          const openWo = history.find((w) => !['CLOSED', 'CANCELLED'].includes(w.status))
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <TriggerBadge trigger={detail.trigger} />
                <Badge tone="neutral" size="sm" dot={false}>{detail.frequency.replace(/_/g, ' ').toLowerCase()}</Badge>
                {d.isOverdue ? <Badge tone="danger" size="sm">Overdue</Badge> : d.isDue ? <Badge tone="warning" size="sm">Due</Badge> : <Badge tone="success" size="sm">In interval</Badge>}
                {!detail.isActive && <Badge tone="neutral" size="sm">Inactive</Badge>}
                {detail.requiresShutdown && <Badge tone="warning" size="sm" dot={false}>Needs a stop</Badge>}
              </div>

              <Alert tone={d.isOverdue ? 'danger' : d.isDue ? 'warning' : 'tip'} title="When it falls due">
                {d.basis}
                {d.plan.trigger !== 'CALENDAR' && d.dueAtMeter !== null && (
                  <> The meter reads {d.currentMeter.toLocaleString('en-IN')} and the plan is due at {d.dueAtMeter.toLocaleString('en-IN')}.</>
                )}
              </Alert>

              <DetailBlock title="Plan">
                <DataGrid columns={3} items={[
                  { label: 'Asset', value: `${detail.assetCode} · ${detail.assetName}` },
                  { label: 'Driven by', value: TRIGGER_LABEL[detail.trigger] },
                  { label: 'Interval', value: detail.trigger === 'CALENDAR' ? `${detail.intervalDays} days` : detail.trigger === 'CONDITION' ? 'On alert' : `${detail.intervalUnits.toLocaleString('en-IN')} ${detail.trigger === 'CYCLES' ? 'cycles' : 'hours'}` },
                  { label: 'Raise it this early', value: `${detail.leadDays} days` },
                  { label: 'Trade needed', value: detail.requiredSkill.toLowerCase() },
                  { label: 'Estimated effort', value: hours(detail.estimatedHours) },
                  { label: 'Last done', value: detail.lastDoneOn ? formatDate(detail.lastDoneOn) : 'Never' },
                  { label: 'Meter at last service', value: detail.lastDoneMeter ? detail.lastDoneMeter.toLocaleString('en-IN') : '—' },
                  { label: 'Standard minutes', value: `${detail.tasks.reduce((s, t) => s + t.standardMinutes, 0)} min across ${detail.tasks.length} tasks` },
                ]} />
              </DetailBlock>

              {detail.requiresPermit && (
                <Alert tone="warning" title="Permit required">
                  This work cannot start without {detail.permitTypes.map((p) => PERMIT_LABEL[p]).join(' and ')}. The generated work order carries the requirement forward.
                </Alert>
              )}

              <DetailBlock title={`Checklist (${detail.tasks.length})`}>
                <table className="grid-table">
                  <thead><tr><th style={{ width: '3rem' }}>#</th><th>Task</th><th style={{ width: '9rem' }}>Captures</th><th className="text-right" style={{ width: '7rem' }}>Std min</th><th style={{ width: '7rem' }}>Must</th></tr></thead>
                  <tbody>
                    {detail.tasks.slice().sort((a, b) => a.seq - b.seq).map((t) => (
                      <tr key={t.uid}>
                        <td className="text-2xs tabular text-fg-subtle">{t.seq}</td>
                        <td className="text-xs text-fg">{t.description}</td>
                        <td className="text-2xs text-fg-muted">{t.capture === 'NONE' ? '—' : t.capture === 'READING' ? `reading ${t.uom}` : t.capture.toLowerCase().replace('_', '/')}</td>
                        <td className="text-right text-2xs tabular text-fg-muted">{t.standardMinutes}</td>
                        <td>{t.mandatory ? <Badge tone="danger" size="sm" dot={false}>Yes</Badge> : <span className="text-2xs text-fg-subtle">Optional</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DetailBlock>

              {detail.spares.length > 0 && (
                <DetailBlock title="Spares this plan consumes">
                  <div className="space-y-1">
                    {detail.spares.map((s, i) => {
                      const part = m.spares.rows.find((p) => p.itemCode === s.itemCode)
                      const short = part && part.onHand - part.reserved < s.qty
                      return (
                        <p key={i} className="flex items-baseline gap-2 text-2xs">
                          <span className="font-mono text-fg-subtle">{s.itemCode}</span>
                          <span className="text-fg">{s.itemName}</span>
                          <span className="ml-auto tabular text-fg-muted">{s.qty} {s.uom}</span>
                          {short && <Badge tone="danger" size="sm">Short in store</Badge>}
                        </p>
                      )
                    })}
                  </div>
                </DetailBlock>
              )}

              <DetailBlock title={`Work orders from this plan (${history.length})`}>
                {history.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">None yet.</p>
                ) : (
                  <div className="space-y-1">
                    {history.slice(-5).reverse().map((w) => (
                      <p key={w.uid} className="flex items-baseline gap-2 text-2xs">
                        <span className="font-mono text-fg">{w.docNo}</span>
                        <span className="text-fg-subtle">{formatDate(w.plannedFinish)}</span>
                        <span className="ml-auto text-fg-muted">{w.status.replace(/_/g, ' ').toLowerCase()}</span>
                      </p>
                    ))}
                  </div>
                )}
                {openWo && <Alert tone="info" className="mt-2" title="Already open">{openWo.docNo} is open against this plan, so generating will not raise another.</Alert>}
              </DetailBlock>

              {detail.remarks && <DetailBlock title="Notes"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>}

              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail, tasks: detail.tasks.map((t) => ({ ...t })), spares: detail.spares.map((s) => ({ ...s })) }); setOpenUid(null) }}>Edit</Button>
                {d.isDue && !openWo && <Button variant="primary" size="sm" onClick={() => generateOne(d)}>Raise a work order</Button>}
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── generate ─────────────────────────────────────────── */}
      <Modal
        open={generating}
        onClose={() => setGenerating(false)}
        title={`Raise ${pending.length} work order${pending.length === 1 ? '' : 's'}`}
        size="lg"
        footer={<><Button variant="ghost" size="sm" onClick={() => setGenerating(false)}>Cancel</Button><Button variant="primary" size="sm" onClick={generateAll}>Raise them</Button></>}
      >
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            Each job is created as <strong className="text-fg">planned</strong> with a copy of its plan's checklist, so revising the plan later does not rewrite what a technician signed.
            Plans that already have an open work order are skipped.
          </p>
          <div className="max-h-72 overflow-y-auto rounded border border-border">
            <table className="grid-table">
              <thead><tr><th>Plan</th><th>Asset</th><th style={{ width: '18rem' }}>Why now</th><th className="text-right" style={{ width: '7rem' }}>Effort</th></tr></thead>
              <tbody>
                {pending.map((d) => (
                  <tr key={d.plan.uid} className={d.isOverdue ? 'bg-danger/5' : undefined}>
                    <td><p className="text-xs text-fg">{d.plan.name}</p><p className="font-mono text-3xs text-fg-subtle">{d.plan.code}</p></td>
                    <td className="text-2xs text-fg-muted">{d.plan.assetName}</td>
                    <td className="text-2xs text-fg-muted">{d.basis}</td>
                    <td className="text-right text-2xs tabular text-fg-muted">{d.plan.estimatedHours} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-fg-subtle">
            Total effort {pending.reduce((s, d) => s + d.plan.estimatedHours, 0)} hours ·
            {' '}{pending.filter((d) => d.plan.requiresShutdown).length} need the asset stopped ·
            {' '}{pending.filter((d) => d.plan.requiresPermit).length} need a permit
          </p>
        </div>
      </Modal>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.code}` : 'New maintenance plan'}
        width="max-w-3xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Plan code" required value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="PM-PRESS-500H" />
              <Select
                label="Asset" required value={editing.assetCode ?? ''}
                onChange={(e) => { const a = assets.find((x) => x.code === e.target.value); setEditing({ ...editing, assetCode: e.target.value, assetName: a?.name ?? '' }) }}
              >
                <option value="">Choose an asset…</option>
                {assets.sort((a, b) => a.code.localeCompare(b.code)).map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
              </Select>
            </div>
            <Input label="Name" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />

            <div className="space-y-3 rounded border border-border bg-surface-2 p-3">
              <p className="text-3xs uppercase tracking-wider text-fg-subtle">When it falls due</p>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Driven by" value={editing.trigger ?? 'CALENDAR'}
                  onChange={(e) => setEditing({ ...editing, trigger: e.target.value as PmTrigger })}
                  hint="A meter plan ignores the calendar entirely"
                >
                  {(Object.keys(TRIGGER_LABEL) as PmTrigger[]).map((t) => (<option key={t} value={t}>{TRIGGER_LABEL[t]}</option>))}
                </Select>
                <Select
                  label="Frequency" value={editing.frequency ?? 'MONTHLY'}
                  onChange={(e) => {
                    const f = e.target.value as PmFrequency
                    setEditing({ ...editing, frequency: f, intervalDays: FREQUENCY_DAYS[f] || editing.intervalDays })
                  }}
                  disabled={editing.trigger !== 'CALENDAR'}
                >
                  {(Object.keys(FREQUENCY_DAYS) as PmFrequency[]).map((f) => (<option key={f} value={f}>{f.replace(/_/g, ' ').toLowerCase()}</option>))}
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Interval (days)" type="number" value={String(editing.intervalDays ?? 0)}
                  onChange={(e) => setEditing({ ...editing, intervalDays: Number(e.target.value) })}
                  disabled={editing.trigger !== 'CALENDAR'}
                />
                <Input
                  label={editing.trigger === 'CYCLES' ? 'Interval (cycles)' : 'Interval (hours)'} type="number"
                  value={String(editing.intervalUnits ?? 0)}
                  onChange={(e) => setEditing({ ...editing, intervalUnits: Number(e.target.value) })}
                  disabled={editing.trigger === 'CALENDAR' || editing.trigger === 'CONDITION'}
                />
                <Input label="Raise it this early (days)" type="number" value={String(editing.leadDays ?? 0)} onChange={(e) => setEditing({ ...editing, leadDays: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Last done on" type="date" value={editing.lastDoneOn ?? ''} onChange={(e) => setEditing({ ...editing, lastDoneOn: e.target.value || null })} />
                <Input label="Meter at last service" type="number" value={String(editing.lastDoneMeter ?? 0)} onChange={(e) => setEditing({ ...editing, lastDoneMeter: Number(e.target.value) })} disabled={editing.trigger === 'CALENDAR'} />
              </div>
              {editing.assetCode && editing.trigger !== 'CALENDAR' && editing.trigger !== 'CONDITION' && (() => {
                const a = assets.find((x) => x.code === editing.assetCode)
                const meter = editing.trigger === 'CYCLES' ? a?.cycleCount ?? 0 : a?.runningHours ?? 0
                const dueAt = (editing.lastDoneMeter ?? 0) + (editing.intervalUnits ?? 0)
                return (
                  <p className="text-3xs text-fg-subtle">
                    The asset's meter reads <strong className="text-fg">{meter.toLocaleString('en-IN')}</strong>, so this plan would fall due at{' '}
                    <strong className="text-fg">{dueAt.toLocaleString('en-IN')}</strong> — {dueAt - meter >= 0 ? `${(dueAt - meter).toLocaleString('en-IN')} to go` : `${Math.abs(dueAt - meter).toLocaleString('en-IN')} overdue`}.
                  </p>
                )
              })()}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input label="Trade needed" value={editing.requiredSkill ?? ''} onChange={(e) => setEditing({ ...editing, requiredSkill: e.target.value.toUpperCase() })} hint="Matched against technician skills" />
              <Input label="Estimated hours" type="number" value={String(editing.estimatedHours ?? 0)} onChange={(e) => setEditing({ ...editing, estimatedHours: Number(e.target.value) })} />
              <div className="flex items-end pb-1"><Switch label="Active" checked={editing.isActive !== false} onChange={(v) => setEditing({ ...editing, isActive: v })} /></div>
            </div>

            <div className="space-y-2 rounded border border-border bg-surface-2 p-3">
              <Switch label="The asset must be stopped" checked={!!editing.requiresShutdown} onChange={(v) => setEditing({ ...editing, requiresShutdown: v })} />
              <Switch label="A safety permit is required" checked={!!editing.requiresPermit} onChange={(v) => setEditing({ ...editing, requiresPermit: v, permitTypes: v ? editing.permitTypes ?? [] : [] })} />
              {editing.requiresPermit && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(Object.keys(PERMIT_LABEL) as PermitType[]).map((p) => {
                    const on = (editing.permitTypes ?? []).includes(p)
                    return (
                      <button
                        key={p} type="button"
                        onClick={() => setEditing({ ...editing, permitTypes: on ? (editing.permitTypes ?? []).filter((x) => x !== p) : [...(editing.permitTypes ?? []), p] })}
                        className={cn('rounded border px-2 py-1 text-2xs transition-colors', on ? 'border-brand-400 bg-brand-500/10 text-brand-600' : 'border-border text-fg-muted hover:border-border-strong')}
                      >{PERMIT_LABEL[p]}</button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="rounded border border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-3xs uppercase tracking-wider text-fg-subtle">Checklist ({(editing.tasks ?? []).length})</p>
                <Button
                  variant="ghost" size="sm" icon={<Plus />}
                  onClick={() => setEditing({ ...editing, tasks: [...(editing.tasks ?? []), BLANK_TASK((editing.tasks ?? []).length + 1)] })}
                >Add a task</Button>
              </div>
              {(editing.tasks ?? []).length === 0 ? (
                <p className="text-2xs text-fg-subtle">No tasks. A plan with nothing to do generates a work order with nothing to sign.</p>
              ) : (
                <div className="space-y-2">
                  {(editing.tasks ?? []).map((t, i) => (
                    <div key={t.uid} className="rounded border border-border bg-surface p-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-2 w-5 shrink-0 text-center text-2xs tabular text-fg-subtle">{t.seq}</span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <Input
                            label="Task" sizeVariant="sm" value={t.description}
                            onChange={(e) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
                          />
                          <div className="grid grid-cols-4 gap-2">
                            <Select
                              label="Captures" value={t.capture}
                              onChange={(e) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, capture: e.target.value as PmTask['capture'] } : x)) })}
                            >
                              <option value="NONE">Nothing</option>
                              <option value="READING">A reading</option>
                              <option value="PASS_FAIL">Pass or fail</option>
                              <option value="PHOTO">A photograph</option>
                            </Select>
                            <Input
                              label="Unit" sizeVariant="sm" value={t.uom} disabled={t.capture !== 'READING'}
                              onChange={(e) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, uom: e.target.value } : x)) })}
                            />
                            <Input
                              label="Std minutes" type="number" sizeVariant="sm" value={String(t.standardMinutes)}
                              onChange={(e) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, standardMinutes: Number(e.target.value) } : x)) })}
                            />
                            <div className="flex items-end justify-between pb-1">
                              <Switch
                                label="Must" checked={t.mandatory}
                                onChange={(v) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, mandatory: v } : x)) })}
                              />
                              <button
                                type="button" aria-label="Remove task"
                                onClick={() => setEditing({ ...editing, tasks: (editing.tasks ?? []).filter((_, j) => j !== i).map((x, j) => ({ ...x, seq: j + 1 })) })}
                                className="rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                              ><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(editing.tasks ?? []).length > 0 && (
                <p className="mt-2 text-3xs text-fg-subtle">
                  {(editing.tasks ?? []).reduce((s, t) => s + t.standardMinutes, 0)} standard minutes ·
                  {' '}{(editing.tasks ?? []).filter((t) => t.mandatory).length} mandatory ·
                  {' '}{(editing.tasks ?? []).filter((t) => t.capture !== 'NONE').length} capture a value
                </p>
              )}
            </div>

            <Textarea label="Notes" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />

            {(() => {
              const b = planBlockers(editing, assets, editing.uid, live)
              return b.length ? <Alert tone="danger" title="Cannot save yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert> : null
            })()}
          </div>
        )}
      </Drawer>
    </div>
  )
}
