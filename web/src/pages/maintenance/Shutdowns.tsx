import { useMemo, useState } from 'react'
import { CalendarClock, Play, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { newUid } from '@/store/data'
import { DetailBlock, MaintStatusBadge, hours, inr, useMaintenanceData } from '@/components/maintenance/MaintShell'
import { daysBetween, isoDate, shutdownProgress, taskStartBlockers } from '@/lib/maintFlow'
import type { Shutdown, ShutdownStatus, ShutdownTask, ShutdownType } from '@/types/maintenance'

/**
 * Shutdown management (Ch 16).
 *
 * The number that decides how long a shutdown takes is the critical path — the
 * longest chain of dependent tasks — not the total hours. Twelve people cannot
 * overhaul the press before it has been isolated, and a plan that adds up the
 * hours will always promise a shutdown shorter than it can possibly be.
 */

const FLOW: Record<ShutdownStatus, ShutdownStatus[]> = {
  PLANNED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
}

const STATUS_LABEL: Record<ShutdownStatus, string> = {
  PLANNED: 'Planned', APPROVED: 'Approved', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

const TYPE_LABEL: Record<ShutdownType, string> = {
  ANNUAL: 'Annual plant', LINE: 'Line', MACHINE: 'Machine', EMERGENCY: 'Emergency',
}

/** What stops a shutdown moving on. */
function blockers(s: Shutdown, to: ShutdownStatus): string[] {
  const out: string[] = []
  const p = shutdownProgress(s)
  if (to === 'APPROVED') {
    if (!s.tasks.length) out.push('A shutdown with no tasks stops production for nothing.')
    if (!s.coordinator.trim()) out.push('Name the coordinator accountable for the window.')
    if (s.budgetedCost <= 0) out.push('Set a budget, or the overspend cannot be measured.')
    const unowned = s.tasks.filter((t) => !t.owner.trim())
    if (unowned.length) out.push(`${unowned.length} task(s) have nobody accountable.`)
  }
  if (to === 'IN_PROGRESS' && s.status !== 'APPROVED') out.push('The shutdown has not been approved.')
  if (to === 'COMPLETED') {
    const unfinished = s.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'SKIPPED')
    if (unfinished.length) out.push(`${unfinished.length} task(s) are neither done nor deliberately skipped. Handing the plant back over unfinished work is how the next breakdown happens.`)
    if (!s.actualStart) out.push('Record when the shutdown actually started.')
  }
  if (to === 'CANCELLED' && s.remarks.trim().length < 10) out.push('Cancelling a planned shutdown needs a recorded reason.')
  return out
}

const BLANK = (): Partial<Shutdown> => ({
  docNo: '', shutdownType: 'MACHINE', title: '', scope: '', plant: 'PLANT-01',
  plannedStart: isoDate(new Date()), plannedEnd: isoDate(new Date(Date.now() + 2 * 86_400_000)),
  actualStart: null, actualEnd: null, status: 'PLANNED', tasks: [], contractors: [],
  budgetedCost: 0, actualCost: 0, coordinator: '', remarks: '', version: 1,
})

const BLANK_TASK = (seq: number): ShutdownTask => ({
  uid: newUid('sdt'), seq, description: '', assetCode: '', owner: '', contractor: '',
  plannedHours: 4, actualHours: null, dependsOnSeq: [], status: 'PENDING', permitNo: null,
})

export function ShutdownsPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const { rows, create, update, remove } = m.shutdowns
  const today = isoDate(new Date())

  const [tab, setTab] = useState('open')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<Shutdown> | null>(null)
  const [advancing, setAdvancing] = useState<{ s: Shutdown; to: ShutdownStatus } | null>(null)

  const live = useMemo(() => rows.filter((s) => !s.deletedAt), [rows])
  const detail = live.find((s) => s.uid === openUid) ?? null

  const filtered = useMemo(() => {
    if (tab === 'open') return live.filter((s) => ['PLANNED', 'APPROVED', 'IN_PROGRESS'].includes(s.status))
    if (tab === 'closed') return live.filter((s) => s.status === 'COMPLETED' || s.status === 'CANCELLED')
    return live
  }, [live, tab])

  const k = useMemo(() => {
    const open = live.filter((s) => ['PLANNED', 'APPROVED', 'IN_PROGRESS'].includes(s.status))
    const upcoming = open.filter((s) => daysBetween(today, s.plannedStart) >= 0 && daysBetween(today, s.plannedStart) <= 30)
    const completed = live.filter((s) => s.status === 'COMPLETED')
    const overruns = completed.filter((s) => s.actualCost > s.budgetedCost)
    return {
      open: open.length,
      upcoming: upcoming.length,
      nextIn: open.length ? Math.min(...open.map((s) => daysBetween(today, s.plannedStart)).filter((d) => d >= 0)) : null,
      budget: open.reduce((s2, s) => s2 + s.budgetedCost, 0),
      overruns: overruns.length,
      avgOverrunPct: overruns.length
        ? overruns.reduce((s2, s) => s2 + ((s.actualCost - s.budgetedCost) / s.budgetedCost) * 100, 0) / overruns.length
        : null,
    }
  }, [live, today])

  /* ── actions ────────────────────────────────────────────────── */

  function advance(s: Shutdown, to: ShutdownStatus) {
    const b = blockers(s, to)
    if (b.length) { toast.error(b[0]); return }
    const patch: Partial<Shutdown> = { status: to }
    if (to === 'IN_PROGRESS') patch.actualStart = new Date().toISOString()
    if (to === 'COMPLETED') patch.actualEnd = new Date().toISOString()
    update(s.uid, patch)

    // The whole scope goes down together, and comes back together.
    const scope = new Set(s.tasks.map((t) => t.assetCode).filter(Boolean))
    for (const code of scope) {
      const asset = m.assets.rows.find((a) => !a.deletedAt && a.code === code)
      if (!asset) continue
      if (to === 'IN_PROGRESS' && asset.status !== 'BREAKDOWN') m.assets.update(asset.uid, { status: 'SHUTDOWN' })
      if (to === 'COMPLETED' && asset.status === 'SHUTDOWN') m.assets.update(asset.uid, { status: 'RUNNING' })
    }
    toast.success(`${s.docNo} → ${STATUS_LABEL[to]}`, to === 'IN_PROGRESS' ? `${scope.size} asset(s) marked as shut down.` : to === 'COMPLETED' ? `${scope.size} asset(s) handed back to production.` : undefined)
    setAdvancing(null)
  }

  function setTaskStatus(s: Shutdown, seq: number, status: ShutdownTask['status']) {
    if (status === 'IN_PROGRESS') {
      const b = taskStartBlockers(s, seq)
      if (b.length) { toast.error(b[0]); return }
    }
    update(s.uid, { tasks: s.tasks.map((t) => (t.seq === seq ? { ...t, status } : t)) })
  }

  function setTaskHours(s: Shutdown, seq: number, actualHours: number | null) {
    update(s.uid, { tasks: s.tasks.map((t) => (t.seq === seq ? { ...t, actualHours } : t)) })
  }

  function save() {
    if (!editing) return
    const problems: string[] = []
    if (!editing.title?.trim()) problems.push('Give the shutdown a title.')
    if (!editing.scope?.trim()) problems.push('State the scope — what is coming down and what is not.')
    if (!editing.plannedStart || !editing.plannedEnd) problems.push('Set the window.')
    if (editing.plannedEnd && editing.plannedStart && editing.plannedEnd < editing.plannedStart) problems.push('The shutdown ends before it starts.')
    const seqs = (editing.tasks ?? []).map((t) => t.seq)
    if (new Set(seqs).size !== seqs.length) problems.push('Two tasks share a sequence number.')
    const badDeps = (editing.tasks ?? []).filter((t) => t.dependsOnSeq.some((d) => d === t.seq || !seqs.includes(d)))
    if (badDeps.length) problems.push('A task depends on itself or on a task that does not exist.')
    if (problems.length) { toast.error(problems[0]); return }

    const payload = editing as Shutdown
    if (editing.uid) { update(editing.uid, payload); toast.success(`${editing.docNo} updated`) }
    else {
      const seq = live.length + 3
      create({ ...(BLANK() as Shutdown), ...payload, uid: newUid('sd'), docNo: `SHD/26-27/${String(seq).padStart(4, '0')}` })
      toast.success('Shutdown planned')
    }
    setEditing(null)
  }

  function removeShutdown(s: Shutdown) {
    if (s.status !== 'PLANNED') { toast.error('This shutdown has been approved or has run. Cancel it with a reason rather than deleting it.'); return }
    remove(s.uid)
    if (openUid === s.uid) setOpenUid(null)
    toast.success(`${s.docNo} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<Shutdown>[] = [
    { key: 'doc', header: 'Shutdown', width: '20rem', render: (s) => (<><p className="truncate text-xs text-fg">{s.title}</p><p className="font-mono text-2xs text-fg-subtle">{s.docNo}</p></>) },
    { key: 'type', header: 'Type', width: '11rem', render: (s) => <Badge tone={s.shutdownType === 'ANNUAL' ? 'danger' : s.shutdownType === 'EMERGENCY' ? 'danger' : 'brand'} size="sm" dot={false}>{TYPE_LABEL[s.shutdownType]}</Badge> },
    { key: 'window', header: 'Window', width: '15rem', render: (s) => <span className="text-2xs tabular text-fg-muted">{formatDate(s.plannedStart)} → {formatDate(s.plannedEnd)}</span> },
    {
      key: 'starts', header: 'Starts in', width: '9rem',
      render: (s) => {
        if (['COMPLETED', 'CANCELLED'].includes(s.status)) return <span className="text-2xs text-fg-subtle">—</span>
        const d = daysBetween(today, s.plannedStart)
        return d < 0 ? <Badge tone="danger" size="sm">{Math.abs(d)}d late</Badge> : d <= 14 ? <Badge tone="warning" size="sm">{d}d</Badge> : <span className="text-2xs tabular text-fg-muted">{d}d</span>
      },
    },
    { key: 'tasks', header: 'Tasks', width: '8rem', align: 'right', render: (s) => <span className="text-2xs tabular text-fg-muted">{s.tasks.length}</span> },
    {
      key: 'progress', header: 'Progress', width: '12rem',
      render: (s) => {
        const p = shutdownProgress(s)
        return (
          <div className="flex items-center gap-2">
            <ProgressBar value={p.pctComplete} tone={p.pctComplete === 100 ? 'success' : 'brand'} className="w-12" />
            <span className="text-2xs tabular text-fg-muted">{p.done}/{p.total}</span>
          </div>
        )
      },
    },
    { key: 'critical', header: 'Critical path', width: '12rem', align: 'right', render: (s) => { const p = shutdownProgress(s); return (<><p className="text-xs tabular text-fg">{p.criticalPathHours} h</p><p className="text-3xs text-fg-subtle">of {p.plannedHours} h total</p></>) } },
    {
      key: 'cost', header: 'Cost', width: '13rem', align: 'right',
      render: (s) => {
        const v = s.actualCost - s.budgetedCost
        return (
          <>
            <p className="text-xs tabular text-fg">{inr(s.actualCost || s.budgetedCost)}</p>
            {s.actualCost > 0 && <p className={cn('text-3xs tabular', v > 0 ? 'text-danger' : 'text-success')}>{v > 0 ? '+' : ''}{inr(v)} vs budget</p>}
          </>
        )
      },
    },
    { key: 'status', header: 'Status', width: '11rem', render: (s) => <MaintStatusBadge status={s.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Shutdowns"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Shutdowns' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>Plan a shutdown</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: k.open },
              { id: 'closed', label: 'Finished', count: live.filter((s) => ['COMPLETED', 'CANCELLED'].includes(s.status)).length },
              { id: 'all', label: 'All', count: live.length },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open shutdowns" value={k.open} sub={k.nextIn === null ? 'Nothing scheduled' : `Next starts in ${k.nextIn} days`} icon={<CalendarClock />} tone={k.upcoming ? 'warning' : 'brand'} />
        <StatTile label="Within 30 days" value={k.upcoming} sub={k.upcoming ? 'Contractors and materials must be confirmed' : 'Nothing imminent'} tone={k.upcoming ? 'warning' : 'success'} />
        <StatTile label="Budgeted" value={inr(k.budget)} sub="Across every open shutdown" tone="progress" />
        <StatTile
          label="Past overruns"
          value={k.overruns}
          sub={k.avgOverrunPct === null ? 'No completed shutdown overran' : `Averaging ${k.avgOverrunPct.toFixed(0)}% over budget`}
          tone={k.overruns ? 'warning' : 'success'}
        />
      </div>

      {k.avgOverrunPct !== null && k.avgOverrunPct > 10 && (
        <Alert tone="warning" title="Past shutdowns have overrun their budget" className="mb-4">
          Completed shutdowns have run {k.avgOverrunPct.toFixed(0)}% over on average. Shutdown estimates are usually built from the planned hours; the overrun almost always comes from work found once things are opened up.
          Budget a contingency rather than a best case.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(s) => s.uid}
        searchable
        searchPlaceholder="Search by title, number or coordinator"
        onRowClick={(s) => setOpenUid(s.uid)}
        rowClassName={(s) => (s.status === 'IN_PROGRESS' ? 'bg-warning/5' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, `shutdowns-${tab}`, 'Shutdowns', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(s) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...s, tasks: s.tasks.map((t) => ({ ...t, dependsOnSeq: [...t.dependsOnSeq] })), contractors: [...s.contractors] })} />
            {FLOW[s.status].map((to) => (<MenuItem key={to} label={STATUS_LABEL[to]} onClick={() => setAdvancing({ s, to })} />))}
            <MenuItem label="Delete" danger onClick={() => removeShutdown(s)} />
          </>
        )}
        emptyTitle="No shutdowns"
        emptyDescription="Plan one so the work is sequenced rather than improvised."
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.docNo} · ${detail.title}` : ''} width="max-w-3xl">
        {detail && (() => {
          const p = shutdownProgress(detail)
          const running = detail.status === 'IN_PROGRESS'
          const onCritical = (() => {
            // Tasks whose longest upstream chain plus their own hours equals the
            // critical path — the ones where a delay delays everything.
            const bySeq = new Map(detail.tasks.map((t) => [t.seq, t]))
            const memo = new Map<number, number>()
            const pathOf = (seq: number, seen: Set<number>): number => {
              if (memo.has(seq)) return memo.get(seq) as number
              if (seen.has(seq)) return 0
              const t = bySeq.get(seq)
              if (!t) return 0
              const up = t.dependsOnSeq.length ? Math.max(...t.dependsOnSeq.map((d) => pathOf(d, new Set([...seen, seq])))) : 0
              const v = up + t.plannedHours
              memo.set(seq, v)
              return v
            }
            const target = p.criticalPathHours
            const critical = new Set<number>()
            // Walk back from whichever task ends the critical path.
            let cursor = detail.tasks.find((t) => Math.abs(pathOf(t.seq, new Set()) - target) < 0.01)
            while (cursor) {
              critical.add(cursor.seq)
              const next: ShutdownTask | undefined = cursor.dependsOnSeq
                .map((d) => bySeq.get(d))
                .filter((x): x is ShutdownTask => !!x)
                .sort((a, b) => pathOf(b.seq, new Set()) - pathOf(a.seq, new Set()))[0]
              cursor = next
            }
            return critical
          })()

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <MaintStatusBadge status={detail.status} size="md" />
                <Badge tone={detail.shutdownType === 'ANNUAL' ? 'danger' : 'brand'} size="sm" dot={false}>{TYPE_LABEL[detail.shutdownType]}</Badge>
                {['PLANNED', 'APPROVED'].includes(detail.status) && daysBetween(today, detail.plannedStart) <= 14 && (
                  <Badge tone="warning" size="sm">Starts in {daysBetween(today, detail.plannedStart)} days</Badge>
                )}
              </div>

              <p className="text-xs leading-relaxed text-fg-muted">{detail.scope}</p>

              <DetailBlock title="Window and cost">
                <DataGrid columns={3} items={[
                  { label: 'Planned', value: `${formatDate(detail.plannedStart)} → ${formatDate(detail.plannedEnd)}` },
                  { label: 'Window length', value: `${daysBetween(detail.plannedStart, detail.plannedEnd) + 1} days` },
                  { label: 'Coordinator', value: detail.coordinator || 'Not named' },
                  { label: 'Actual start', value: detail.actualStart ? formatDate(detail.actualStart.slice(0, 10)) : 'Not started' },
                  { label: 'Actual end', value: detail.actualEnd ? formatDate(detail.actualEnd.slice(0, 10)) : 'Not finished' },
                  { label: 'Contractors', value: detail.contractors.length ? detail.contractors.join(', ') : 'In-house' },
                  { label: 'Budget', value: inr(detail.budgetedCost) },
                  { label: 'Actual cost', value: detail.actualCost ? inr(detail.actualCost) : 'Not booked' },
                  { label: 'Variance', value: detail.actualCost ? `${p.costVariance > 0 ? '+' : ''}${inr(p.costVariance)}` : '—' },
                ]} />
              </DetailBlock>

              <DetailBlock title="Schedule">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded border border-border bg-surface-2 p-2.5">
                    <p className="text-3xs uppercase tracking-wider text-fg-subtle">Total effort</p>
                    <p className="mt-0.5 text-lg font-semibold tabular text-fg">{p.plannedHours} h</p>
                    <p className="text-3xs text-fg-subtle">across {p.total} tasks</p>
                  </div>
                  <div className="rounded border border-brand-400/40 bg-brand-500/5 p-2.5">
                    <p className="text-3xs uppercase tracking-wider text-fg-subtle">Critical path</p>
                    <p className="mt-0.5 text-lg font-semibold tabular text-brand-600">{p.criticalPathHours} h</p>
                    <p className="text-3xs text-fg-subtle">the real duration</p>
                  </div>
                  <div className="rounded border border-border bg-surface-2 p-2.5">
                    <p className="text-3xs uppercase tracking-wider text-fg-subtle">Window allows</p>
                    <p className="mt-0.5 text-lg font-semibold tabular text-fg">{(daysBetween(detail.plannedStart, detail.plannedEnd) + 1) * 24} h</p>
                    <p className="text-3xs text-fg-subtle">calendar hours</p>
                  </div>
                </div>
                {p.criticalPathHours > (daysBetween(detail.plannedStart, detail.plannedEnd) + 1) * 24 && (
                  <Alert tone="danger" className="mt-2" title="The window is too short">
                    The critical path is {p.criticalPathHours} hours but the window allows only {(daysBetween(detail.plannedStart, detail.plannedEnd) + 1) * 24}.
                    No amount of extra people fixes this — the chain has to be shortened or the window extended.
                  </Alert>
                )}
                {p.actualHours > 0 && (
                  <p className="mt-2 text-2xs text-fg-muted">
                    {p.actualHours} hours actually booked against {p.plannedHours} planned
                    {p.actualHours > p.plannedHours && <span className="text-warning"> — {((p.actualHours / p.plannedHours - 1) * 100).toFixed(0)}% over</span>}.
                  </p>
                )}
              </DetailBlock>

              <DetailBlock
                title={`Tasks — ${p.done} done, ${p.inProgress} running, ${p.pending} pending`}
                actions={<div className="flex items-center gap-2"><ProgressBar value={p.pctComplete} tone={p.pctComplete === 100 ? 'success' : 'brand'} className="w-20" /><span className="text-2xs tabular text-fg-muted">{p.pctComplete.toFixed(0)}%</span></div>}
              >
                <div className="space-y-1.5">
                  {detail.tasks.slice().sort((a, b) => a.seq - b.seq).map((t) => {
                    const waiting = taskStartBlockers(detail, t.seq)
                    const critical = onCritical.has(t.seq)
                    return (
                      <div
                        key={t.uid}
                        className={cn('rounded border p-2.5',
                          t.status === 'DONE' ? 'border-border bg-surface-2 opacity-75'
                            : t.status === 'IN_PROGRESS' ? 'border-warning/40 bg-warning/5'
                            : critical ? 'border-brand-400/40' : 'border-border')}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 w-5 shrink-0 text-center text-2xs tabular text-fg-subtle">{t.seq}</span>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-xs', t.status === 'DONE' ? 'text-fg-muted line-through' : 'text-fg')}>{t.description}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-3xs text-fg-subtle">
                              {t.assetCode && <span className="font-mono">{t.assetCode}</span>}
                              {t.owner && <span>{t.owner}</span>}
                              {t.contractor && <Badge tone="warning" size="sm" dot={false}>{t.contractor}</Badge>}
                              <span>{t.plannedHours} h planned{t.actualHours !== null ? ` · ${t.actualHours} h actual` : ''}</span>
                              {critical && <Badge tone="brand" size="sm" dot={false}>critical path</Badge>}
                              {t.dependsOnSeq.length > 0 && <span>after {t.dependsOnSeq.join(', ')}</span>}
                            </span>
                            {waiting.length > 0 && t.status === 'PENDING' && (
                              <span className="mt-1 block text-3xs text-warning">{waiting[0]}</span>
                            )}
                          </span>
                          <span className="shrink-0">
                            {running ? (
                              <span className="flex flex-col items-end gap-1">
                                <Select
                                  value={t.status}
                                  onChange={(e) => setTaskStatus(detail, t.seq, e.target.value as ShutdownTask['status'])}
                                  className="w-32"
                                  aria-label={`Status for task ${t.seq}`}
                                >
                                  <option value="PENDING">Pending</option>
                                  <option value="IN_PROGRESS">In progress</option>
                                  <option value="DONE">Done</option>
                                  <option value="SKIPPED">Skipped</option>
                                </Select>
                                {(t.status === 'DONE' || t.status === 'IN_PROGRESS') && (
                                  <Input
                                    type="number" sizeVariant="sm" className="w-24 text-right"
                                    value={t.actualHours === null ? '' : String(t.actualHours)}
                                    onChange={(e) => setTaskHours(detail, t.seq, e.target.value === '' ? null : Number(e.target.value))}
                                    placeholder="hours"
                                    aria-label={`Actual hours for task ${t.seq}`}
                                  />
                                )}
                              </span>
                            ) : (
                              <MaintStatusBadge status={t.status} />
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {p.blocked.length > 0 && (
                  <p className="mt-2 text-2xs text-fg-subtle">
                    {p.blocked.length} task(s) cannot start until their predecessors finish. That is the sequence working, not a problem.
                  </p>
                )}
              </DetailBlock>

              {detail.remarks && <DetailBlock title="Notes"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>}

              {FLOW[detail.status].length > 0 && (
                <DetailBlock title="Next step">
                  <div className="flex flex-wrap gap-2">
                    {FLOW[detail.status].map((to) => {
                      const b = blockers(detail, to)
                      return (
                        <Button key={to} variant={to === 'CANCELLED' ? 'outline' : 'primary'} size="sm" icon={to === 'IN_PROGRESS' ? <Play /> : undefined} onClick={() => setAdvancing({ s: detail, to })} disabled={b.length > 0} title={b[0]}>
                          {STATUS_LABEL[to]}
                        </Button>
                      )
                    })}
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
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail, tasks: detail.tasks.map((t) => ({ ...t, dependsOnSeq: [...t.dependsOnSeq] })), contractors: [...detail.contractors] }); setOpenUid(null) }}>Edit</Button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── advance ──────────────────────────────────────────── */}
      <Modal
        open={!!advancing}
        onClose={() => setAdvancing(null)}
        title={advancing ? `${advancing.s.docNo} → ${STATUS_LABEL[advancing.to]}` : ''}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setAdvancing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={() => advancing && advance(advancing.s, advancing.to)} disabled={!!advancing && blockers(advancing.s, advancing.to).length > 0}>Confirm</Button></>}
      >
        {advancing && (() => {
          const b = blockers(advancing.s, advancing.to)
          const scope = new Set(advancing.s.tasks.map((t) => t.assetCode).filter(Boolean))
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                {advancing.to === 'IN_PROGRESS'
                  ? `Starting the shutdown marks ${scope.size} asset(s) as shut down, so production planning sees them as unavailable.`
                  : advancing.to === 'COMPLETED'
                    ? `Completing hands ${scope.size} asset(s) back to production. Every task must be done or deliberately skipped first.`
                    : `Moving ${advancing.s.docNo} to ${STATUS_LABEL[advancing.to].toLowerCase()}.`}
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
        title={editing?.uid ? `Edit ${editing.docNo}` : 'Plan a shutdown'}
        width="max-w-3xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Type" value={editing.shutdownType ?? 'MACHINE'} onChange={(e) => setEditing({ ...editing, shutdownType: e.target.value as ShutdownType })}>
                {(Object.keys(TYPE_LABEL) as ShutdownType[]).map((t) => (<option key={t} value={t}>{TYPE_LABEL[t]}</option>))}
              </Select>
              <Input label="Coordinator" value={editing.coordinator ?? ''} onChange={(e) => setEditing({ ...editing, coordinator: e.target.value })} />
            </div>
            <Input label="Title" required value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <Textarea label="Scope" required rows={3} value={editing.scope ?? ''} onChange={(e) => setEditing({ ...editing, scope: e.target.value })} hint="What comes down, and what deliberately does not" />
            <div className="grid grid-cols-4 gap-3">
              <Input label="Planned start" type="date" value={editing.plannedStart ?? ''} onChange={(e) => setEditing({ ...editing, plannedStart: e.target.value })} />
              <Input label="Planned end" type="date" value={editing.plannedEnd ?? ''} onChange={(e) => setEditing({ ...editing, plannedEnd: e.target.value })} />
              <Input label="Budget" type="number" value={String(editing.budgetedCost ?? 0)} onChange={(e) => setEditing({ ...editing, budgetedCost: Number(e.target.value) })} />
              <Input label="Actual cost" type="number" value={String(editing.actualCost ?? 0)} onChange={(e) => setEditing({ ...editing, actualCost: Number(e.target.value) })} />
            </div>

            <div className="rounded border border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-3xs uppercase tracking-wider text-fg-subtle">Task list ({(editing.tasks ?? []).length})</p>
                <Button
                  variant="ghost" size="sm" icon={<Plus />}
                  onClick={() => setEditing({ ...editing, tasks: [...(editing.tasks ?? []), BLANK_TASK((editing.tasks ?? []).length + 1)] })}
                >Add a task</Button>
              </div>
              {(editing.tasks ?? []).length === 0 ? (
                <p className="text-2xs text-fg-subtle">No tasks. A shutdown with no task list stops production for nothing.</p>
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
                              label="Asset" value={t.assetCode}
                              onChange={(e) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, assetCode: e.target.value } : x)) })}
                            >
                              <option value="">None</option>
                              {m.assets.rows.filter((a) => !a.deletedAt).map((a) => (<option key={a.uid} value={a.code}>{a.code}</option>))}
                            </Select>
                            <Input
                              label="Owner" sizeVariant="sm" value={t.owner}
                              onChange={(e) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)) })}
                            />
                            <Input
                              label="Contractor" sizeVariant="sm" value={t.contractor}
                              onChange={(e) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, contractor: e.target.value } : x)) })}
                            />
                            <Input
                              label="Hours" type="number" sizeVariant="sm" value={String(t.plannedHours)}
                              onChange={(e) => setEditing({ ...editing, tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, plannedHours: Number(e.target.value) } : x)) })}
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-3xs uppercase tracking-wider text-fg-subtle">Must follow</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(editing.tasks ?? []).filter((x) => x.seq !== t.seq).map((other) => {
                                const on = t.dependsOnSeq.includes(other.seq)
                                return (
                                  <button
                                    key={other.uid} type="button"
                                    onClick={() => setEditing({
                                      ...editing,
                                      tasks: (editing.tasks ?? []).map((x, j) => (j === i ? { ...x, dependsOnSeq: on ? x.dependsOnSeq.filter((d) => d !== other.seq) : [...x.dependsOnSeq, other.seq] } : x)),
                                    })}
                                    className={cn('rounded border px-1.5 py-0.5 text-3xs transition-colors', on ? 'border-brand-400 bg-brand-500/10 text-brand-600' : 'border-border text-fg-subtle hover:border-border-strong')}
                                  >{other.seq}</button>
                                )
                              })}
                              <button
                                type="button" aria-label="Remove task"
                                onClick={() => setEditing({ ...editing, tasks: (editing.tasks ?? []).filter((_, j) => j !== i) })}
                                className="ml-auto rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                              ><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(editing.tasks ?? []).length > 0 && (() => {
                const preview = shutdownProgress(editing as Shutdown)
                const windowHours = editing.plannedStart && editing.plannedEnd ? (daysBetween(editing.plannedStart, editing.plannedEnd) + 1) * 24 : 0
                return (
                  <p className={cn('mt-2 text-3xs', preview.criticalPathHours > windowHours ? 'text-danger' : 'text-fg-subtle')}>
                    {preview.plannedHours} hours of work · critical path <strong>{preview.criticalPathHours} hours</strong> · window allows {windowHours} hours.
                    {preview.criticalPathHours > windowHours && ' The chain does not fit the window.'}
                  </p>
                )
              })()}
            </div>

            <Input
              label="Contractors" value={(editing.contractors ?? []).join(', ')}
              onChange={(e) => setEditing({ ...editing, contractors: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
              hint="Comma separated"
            />
            <Textarea label="Notes" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />
          </div>
        )}
      </Drawer>
    </div>
  )
}
