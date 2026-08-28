import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import {
  ConfidenceMeter,
  MODULE_LABEL,
  ModuleChip,
  SeverityBadge,
  SourceNote,
  formatMetric,
  useCanSeeFinancial,
} from '@/components/bi/BiShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { insights as seedInsights } from '@/mock/bi'
import type { Insight, InsightKind, SourceModule } from '@/types/bi'

const KIND_LABEL: Record<InsightKind, string> = {
  TREND: 'Trend',
  ANOMALY: 'Anomaly',
  THRESHOLD: 'Threshold',
  CORRELATION: 'Correlation',
  FORECAST: 'Forecast',
  RECOMMENDATION: 'Recommendation',
}

const KIND_EXPLAIN: Record<InsightKind, string> = {
  TREND: 'A measure moving consistently in one direction over several periods.',
  ANOMALY: 'A value well outside its own recent range, or well outside its peers.',
  THRESHOLD: 'A measure that has crossed a configured limit.',
  CORRELATION: 'Two measures moving together often enough to be worth checking.',
  FORECAST: 'A projection from the trend, with the usual caveat that it assumes nothing changes.',
  RECOMMENDATION: 'A suggested action derived from the pattern, not an instruction.',
}

const TABS = [
  { id: 'OPEN', label: 'Open' },
  { id: 'ACTIONED', label: 'Actioned' },
  { id: 'DISMISSED', label: 'Dismissed' },
  { id: 'ALL', label: 'All' },
]

/**
 * The insight engine.
 *
 * The hard part of this screen is not generating observations — it is stopping
 * them becoming noise. Three things do that: every insight states the window it
 * was measured over and links to the evidence, confidence is shown so a weak
 * signal reads as weak, and every insight can be marked useful or not. The
 * feedback is the only thing that keeps the engine honest over a year.
 */
export function BiInsightsPage() {
  const toast = useToast()
  const canSeeFinancial = useCanSeeFinancial()
  const seed = useMemo(() => seedInsights, [])

  const { rows: insights, update } = useCollection<Insight>('bi:insight', seed)

  const [tab, setTab] = useState('OPEN')
  const [module, setModule] = useState<'all' | SourceModule>('all')
  const [acting, setActing] = useState<Insight | null>(null)
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState('')

  const modules = [...new Set(insights.map((i) => i.module))]

  const visible = insights
    .filter((i) => (module === 'all' ? true : i.module === module))
    .filter((i) => {
      if (tab === 'OPEN') return i.status === 'NEW' || i.status === 'ACKNOWLEDGED'
      if (tab === 'ACTIONED') return i.status === 'ACTIONED' || i.status === 'RESOLVED'
      if (tab === 'DISMISSED') return i.status === 'DISMISSED'
      return true
    })
    .sort((a, b) => {
      const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, POSITIVE: 4 }
      return rank[a.severity] - rank[b.severity] || (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0)
    })

  const open = insights.filter((i) => i.status === 'NEW' || i.status === 'ACKNOWLEDGED')
  const critical = open.filter((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH')
  const totalImpact = open.reduce((s, i) => s + (i.estimatedImpact ?? 0), 0)

  /** The only honest measure of whether the engine is worth having. */
  const rated = insights.filter((i) => i.feedback !== 'NONE')
  const usefulPct = rated.length ? (rated.filter((i) => i.feedback === 'USEFUL').length / rated.length) * 100 : 0

  const columns: Column<Insight>[] = [
    { key: 'title', header: 'Insight', sortable: true, render: (i) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{i.title}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{i.code}</p>
      </div>
    ) },
    { key: 'module', header: 'Module', sortable: true, width: '11rem', render: (i) => <ModuleChip module={i.module} /> },
    { key: 'kind', header: 'Kind', sortable: true, width: '10rem', render: (i) => (
      <span title={KIND_EXPLAIN[i.kind]}>
        <Badge tone="neutral" size="sm" dot={false}>{KIND_LABEL[i.kind]}</Badge>
      </span>
    ) },
    { key: 'severity', header: 'Severity', sortable: true, width: '8.5rem', render: (i) => <SeverityBadge severity={i.severity} /> },
    { key: 'change', header: 'Movement', align: 'right', width: '10rem', sortable: true, accessor: (i) => i.changePct ?? 0, render: (i) => {
      if (i.currentValue === null) return <span className="text-2xs text-fg-subtle">—</span>
      return (
        <div className="min-w-0">
          <p className="tabular text-xs text-fg">{formatMetric(i.currentValue, i.format)}</p>
          {i.changePct !== null && (
            <p className={cn('tabular text-2xs', i.severity === 'POSITIVE' ? 'text-success' : 'text-danger')}>
              {i.changePct > 0 ? '+' : ''}{i.changePct.toFixed(1)}% vs {i.comparisonValue !== null ? formatMetric(i.comparisonValue, i.format) : 'baseline'}
            </p>
          )}
        </div>
      )
    } },
    ...(canSeeFinancial
      ? [{
          key: 'estimatedImpact', header: 'Impact if ignored', align: 'right' as const, sortable: true, width: '11rem',
          render: (i: Insight) => (
            i.estimatedImpact !== null
              ? <span className="tabular text-xs font-medium text-fg">{formatCompact(i.estimatedImpact)}</span>
              : <span className="text-2xs text-fg-subtle">—</span>
          ),
        }]
      : []),
    { key: 'confidencePct', header: 'Confidence', width: '9.5rem', sortable: true, render: (i) => <ConfidenceMeter pct={i.confidencePct} /> },
    { key: 'basis', header: 'Basis', render: (i) => <span className="text-2xs text-fg-muted">{i.basis}</span> },
    { key: 'assignedTo', header: 'Owner', sortable: true, width: '10rem', render: (i) => (
      i.assignedTo ? <span className="text-xs">{i.assignedTo}</span> : <span className="text-2xs text-fg-subtle">unassigned</span>
    ) },
    { key: 'detectedOn', header: 'Detected', sortable: true, width: '10.5rem', accessor: (i) => i.detectedOn, render: (i) => (
      <span className="text-2xs">{formatDateTime(i.detectedOn)}</span>
    ) },
    { key: 'feedback', header: 'Was it useful', align: 'center', width: '10rem', render: (i) => (
      i.feedback === 'USEFUL' ? <Badge tone="success" size="sm" dot={false}>useful</Badge>
      : i.feedback === 'NOT_USEFUL' ? <Badge tone="danger" size="sm" dot={false}>not useful</Badge>
      : <span className="text-2xs text-fg-subtle">not rated</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9.5rem', render: (i) => (
      <Badge
        tone={i.status === 'NEW' ? 'pending' : i.status === 'ACKNOWLEDGED' ? 'progress' : i.status === 'ACTIONED' || i.status === 'RESOLVED' ? 'success' : 'neutral'}
        size="sm"
        dot={i.status === 'NEW'}
      >
        {i.status.toLowerCase()}
      </Badge>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'ai-insights', 'AI insight digest', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="AI insights"
        description="Generated observations, each with its basis, its confidence and a link to the evidence"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Insights' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.success(
                'Engine run queued',
                'The insight engine re-reads every feed and re-tests each pattern. Insights that no longer hold are retired automatically rather than left on the list.',
              )
            }
          >
            Re-run the engine
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'OPEN' ? open.length : undefined }))} />}
      />

      {/* Headline */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn('card p-3', critical.length && 'border-danger/30 bg-danger/[0.03]')}>
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Needing attention</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', critical.length ? 'text-danger' : 'text-success')}>
            {critical.length}
          </p>
          <p className="mt-1 text-2xs text-fg-muted">critical or high, still open</p>
        </div>
        <div className="card p-3">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Open in total</p>
          <p className="mt-1 text-2xl font-semibold tabular text-fg">{open.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">across {new Set(open.map((i) => i.module)).size} modules</p>
        </div>
        {canSeeFinancial ? (
          <div className="card p-3">
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Impact if all ignored</p>
            <p className="mt-1 text-2xl font-semibold tabular text-fg">{formatCompact(totalImpact)}</p>
            <p className="mt-1 text-2xs text-fg-muted">estimated, and deliberately rough</p>
          </div>
        ) : (
          <div className="card border-dashed p-3 opacity-70">
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Estimated impact</p>
            <p className="mt-1 text-lg font-semibold text-fg-subtle">restricted</p>
            <p className="mt-1 text-2xs text-fg-muted">rupee impact needs the financial permission</p>
          </div>
        )}
        <div className="card p-3">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Rated useful</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', usefulPct >= 70 ? 'text-success' : 'text-warning')}>
            {rated.length ? `${usefulPct.toFixed(0)}%` : '—'}
          </p>
          <p className="mt-1 text-2xs text-fg-muted">
            {rated.length} of {insights.length} rated — this is what tells you whether the engine earns its place
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-48"
          value={module}
          onChange={(e) => setModule(e.target.value as typeof module)}
          options={[{ value: 'all', label: 'All modules' }, ...modules.map((m) => ({ value: m, label: MODULE_LABEL[m] }))]}
        />
        <p className="text-xs text-fg-muted">
          Nothing here is an instruction. Each observation names what was compared and over what window, and links to the screen
          where it can be checked — an insight you cannot verify is a rumour with a chart on it.
        </p>
      </div>

      {/* The cards — the primary way to read this screen */}
      <div className="mb-4 space-y-2.5">
        {visible.map((i) => (
          <Card key={i.uid} className={cn(i.severity === 'CRITICAL' && 'border-danger/30', i.severity === 'POSITIVE' && 'border-success/30')}>
            <CardBody className="space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-fg">{i.title}</p>
                    <SeverityBadge severity={i.severity} />
                    <ModuleChip module={i.module} />
                    <span title={KIND_EXPLAIN[i.kind]}>
                      <Badge tone="neutral" size="sm" dot={false}>{KIND_LABEL[i.kind]}</Badge>
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{i.detail}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <ConfidenceMeter pct={i.confidencePct} />
                  {canSeeFinancial && i.estimatedImpact !== null && (
                    <span className="text-2xs tabular text-fg-muted">≈ {formatCompact(i.estimatedImpact)} at stake</span>
                  )}
                  <span className="text-2xs text-fg-subtle">{formatDateTime(i.detectedOn)}</span>
                </div>
              </div>

              <div className="rounded border border-border bg-surface-2 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">How it was measured</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-fg-muted">{i.basis}</p>
                {i.currentValue !== null && (
                  <p className="mt-1 text-2xs tabular text-fg-muted">
                    Now <span className="font-medium text-fg">{formatMetric(i.currentValue, i.format)}</span>
                    {i.comparisonValue !== null && (
                      <>
                        {' '}against <span className="font-medium text-fg">{formatMetric(i.comparisonValue, i.format)}</span>
                      </>
                    )}
                    {i.changePct !== null && (
                      <span className={cn('ml-1 font-medium', i.severity === 'POSITIVE' ? 'text-success' : 'text-danger')}>
                        ({i.changePct > 0 ? '+' : ''}{i.changePct.toFixed(1)}%)
                      </span>
                    )}
                  </p>
                )}
              </div>

              {i.recommendation && (
                <div className="rounded border border-brand-500/25 bg-brand-500/5 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">Suggested next step</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-fg-muted">{i.recommendation}</p>
                </div>
              )}

              {i.actionNote && (
                <p className="text-2xs text-fg-muted">
                  <span className="font-medium text-fg">{i.assignedTo ?? 'Someone'}:</span> {i.actionNote}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                {i.evidenceTo && (
                  <Link to={i.evidenceTo}>
                    <Button variant="outline" size="sm">{i.evidenceLabel} →</Button>
                  </Link>
                )}
                {(i.status === 'NEW' || i.status === 'ACKNOWLEDGED') && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setActing(i); setNote(i.actionNote ?? ''); setAssignee(i.assignedTo ?? '') }}
                    >
                      {i.status === 'NEW' ? 'Take it on' : 'Record what was done'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        update(i.uid, { status: 'DISMISSED', feedback: 'NOT_USEFUL' })
                        toast.success(
                          'Dismissed',
                          'Marked not useful. The engine weights this pattern down, so the same observation is less likely to be raised again.',
                        )
                      }}
                    >
                      Dismiss
                    </Button>
                  </>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="text-2xs text-fg-subtle">Was this useful?</span>
                  <Button
                    variant={i.feedback === 'USEFUL' ? 'success' : 'ghost'}
                    size="sm"
                    className="h-6 px-2 text-2xs"
                    onClick={() => {
                      update(i.uid, { feedback: 'USEFUL' })
                      toast.success('Thanks', 'Marked useful. Patterns rated useful are surfaced earlier next time.')
                    }}
                  >
                    Yes
                  </Button>
                  <Button
                    variant={i.feedback === 'NOT_USEFUL' ? 'danger' : 'ghost'}
                    size="sm"
                    className="h-6 px-2 text-2xs"
                    onClick={() => {
                      update(i.uid, { feedback: 'NOT_USEFUL' })
                      toast.success('Noted', 'Marked not useful. This is the feedback that stops the list turning into noise.')
                    }}
                  >
                    No
                  </Button>
                </span>
              </div>
            </CardBody>
          </Card>
        ))}
        {visible.length === 0 && (
          <Card>
            <CardBody className="py-10 text-center">
              <p className="text-sm font-medium text-fg">Nothing here</p>
              <p className="mt-1 text-xs text-fg-muted">
                No insight matches this filter. That is either good news or a sign the feeds are stale — the{' '}
                <Link to="/bi/data-sources" className="font-medium text-brand-600 hover:underline">data sources</Link> screen says which.
              </p>
            </CardBody>
          </Card>
        )}
      </div>

      {/* The same set as a table, for exporting and scanning */}
      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(i) => i.uid}
        searchPlaceholder="Search insight, module, basis or owner…"
        onExport={doExport}
        emptyTitle="No insights match"
        rowClassName={(i) => cn(
          i.severity === 'CRITICAL' && 'bg-danger/[0.04]',
          i.severity === 'POSITIVE' && 'bg-success/[0.03]',
          i.status === 'DISMISSED' && 'opacity-60',
        )}
        rowActions={(i) => (
          <>
            <MenuItem
              label="Edit — record the action"
              onClick={() => { setActing(i); setNote(i.actionNote ?? ''); setAssignee(i.assignedTo ?? '') }}
            />
            <MenuItem
              label="Delete — dismiss it"
              danger
              disabled={i.status === 'DISMISSED'}
              onClick={() => {
                update(i.uid, { status: 'DISMISSED', feedback: 'NOT_USEFUL' })
                toast.success('Dismissed', `${i.title} dismissed and weighted down.`)
              }}
            />
            <MenuItem
              separatorBefore
              label="Acknowledge"
              disabled={i.status !== 'NEW'}
              onClick={() => {
                update(i.uid, { status: 'ACKNOWLEDGED' })
                toast.success('Acknowledged', 'Somebody has seen it. It stays open until an action is recorded.')
              }}
            />
            <MenuItem
              label="Mark resolved"
              disabled={i.status !== 'ACTIONED'}
              onClick={() => {
                update(i.uid, { status: 'RESOLVED' })
                toast.success('Resolved', `${i.title} closed. The engine will re-test the pattern on the next run.`)
              }}
            />
            <MenuItem label="Open the evidence" onClick={() => i.evidenceTo && window.location.assign(i.evidenceTo)} />
          </>
        )}
      />

      {/* Take action -------------------------------------------------------- */}
      <Modal
        open={!!acting}
        onClose={() => setActing(null)}
        title={acting ? acting.title : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setActing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!acting) return
                if (!assignee.trim()) {
                  toast.error('Give it an owner', 'An insight with no owner is a note. Somebody has to be accountable for the next step.')
                  return
                }
                if (!note.trim()) {
                  toast.error('Say what will be done', 'The action note is what makes this reviewable next month.')
                  return
                }
                update(acting.uid, {
                  status: 'ACTIONED',
                  assignedTo: assignee.trim(),
                  actionNote: note.trim(),
                  feedback: acting.feedback === 'NONE' ? 'USEFUL' : acting.feedback,
                })
                toast.success(
                  'Action recorded',
                  `${assignee.trim()} owns it. The insight stays visible until it is marked resolved, and the engine re-tests the pattern on each run.`,
                )
                setActing(null)
              }}
            >
              Record
            </Button>
          </>
        }
      >
        {acting && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="text-xs leading-relaxed text-fg-muted">{acting.detail}</p>
              <p className="mt-1.5 text-2xs text-fg-subtle">Basis: {acting.basis}</p>
              {acting.recommendation && (
                <p className="mt-1.5 text-2xs text-brand-600">Suggested: {acting.recommendation}</p>
              )}
            </div>
            <Select
              label="Owner"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              options={[
                { value: '', label: 'Choose an owner…' },
                { value: 'Meera Rajan', label: 'Meera Rajan — Plant Head' },
                { value: 'S. Ganapathy', label: 'S. Ganapathy — CFO' },
                { value: 'Prakash Menon', label: 'Prakash Menon — Production' },
                { value: 'Lakshmi Narayanan', label: 'Lakshmi Narayanan — Quality' },
                { value: 'Anand Krishnan', label: 'Anand Krishnan — Procurement' },
                { value: 'Suresh Babu', label: 'Suresh Babu — Maintenance' },
                { value: 'Divya Sundaram', label: 'Divya Sundaram — Stores' },
              ]}
            />
            <Textarea
              label="What will be done"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Spindle bearing ordered; preventive service brought forward to Saturday."
            />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Six kinds of observation, and what each is worth" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(KIND_LABEL) as InsightKind[]).map((k) => (
            <p key={k}>
              <span className="font-medium text-fg">{KIND_LABEL[k]}.</span> {KIND_EXPLAIN[k]}
            </p>
          ))}
        </CardBody>
        <CardBody className="border-t border-border pt-3 text-xs leading-relaxed text-fg-muted">
          Confidence is shown on every insight because these are patterns in data, not facts. A correlation at 74% confidence is
          worth ten minutes of somebody's time; the same statement presented as certainty would waste a day. The useful/not-useful
          rating is the feedback loop — without it, an insight engine reliably becomes an ignored list within about three months.
        </CardBody>
      </Card>

      <SourceNote
        modules={[...new Set(insights.map((i) => i.module))]}
        note="Insights are regenerated on each engine run and re-tested against current data; ones that no longer hold are retired."
      />
    </div>
  )
}
