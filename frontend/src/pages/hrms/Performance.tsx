import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Textarea } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { EmployeeCell, HrStatusBadge, RatingCell, useCanSeeAppraisal, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { appraisals as seedAppraisals, kpis as seedKpis } from '@/mock/hrms'
import type { Appraisal, AppraisalStage, Kpi } from '@/types/hrms'

/** The annual cycle, in order. */
const STAGES: { stage: AppraisalStage; label: string; who: string }[] = [
  { stage: 'GOAL_SETTING', label: 'Goal setting', who: 'Manager and employee agree the KPIs and targets' },
  { stage: 'MID_YEAR', label: 'Mid-year review', who: 'A checkpoint — nothing is rated, but drift gets caught' },
  { stage: 'SELF_APPRAISAL', label: 'Self appraisal', who: 'The employee rates themselves first, on purpose' },
  { stage: 'MANAGER_REVIEW', label: 'Manager review', who: 'The manager rates against the same KPIs' },
  { stage: 'HR_REVIEW', label: 'HR review', who: 'HR normalises across departments so one soft manager does not distort the curve' },
  { stage: 'FINALISED', label: 'Finalised', who: 'Rating, increment and any promotion are locked' },
]

const BANDS: { band: NonNullable<Appraisal['ratingBand']>; min: number; increment: number }[] = [
  { band: 'OUTSTANDING', min: 4.5, increment: 12 },
  { band: 'EXCEEDS', min: 4.0, increment: 9.5 },
  { band: 'MEETS', min: 3.0, increment: 7 },
  { band: 'PARTIALLY_MEETS', min: 2.0, increment: 3 },
  { band: 'BELOW', min: 0, increment: 0 },
]

const TABS = [
  { id: 'CYCLE', label: 'Appraisal cycle' },
  { id: 'KPIS', label: 'KPI library' },
]

/**
 * Performance management — goals from real production data, then five stages of
 * review. The KPI library matters more than the form: every KPI here names the
 * system it is measured from, so a rating conversation starts from a number both
 * sides can see rather than from an impression.
 */
export function PerformancePage() {
  const toast = useToast()
  const canSee = useCanSeeAppraisal()
  const canSeePay = useCanSeePay()
  const apprSeed = useMemo(() => seedAppraisals, [])
  const kpiSeed = useMemo(() => seedKpis, [])

  const kpiCrud = useCrud<Kpi>({
    key: 'hrms:kpi',
    seed: kpiSeed,
    entity: 'KPI',
    titleOf: (k) => `${k.name} (${k.code})`,
    fields: [
      { name: 'code', label: 'KPI code', required: true, upper: true },
      { name: 'name', label: 'KPI name', required: true },
      { name: 'appliesToRole', label: 'Applies to role', required: true },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: ['OUTPUT', 'QUALITY', 'ATTENDANCE', 'SAFETY', 'COST', 'DELIVERY', 'PEOPLE'].map((v) => ({ value: v, label: v.toLowerCase() })),
      },
      { name: 'unit', label: 'Unit', required: true, hint: '%, units/operator, ₹, incidents' },
      { name: 'target', label: 'Target', type: 'number', required: true },
      { name: 'weightPct', label: 'Weight %', type: 'number', required: true },
      {
        name: 'direction',
        label: 'Direction',
        type: 'select',
        required: true,
        options: [
          { value: 'HIGHER_BETTER', label: 'Higher is better' },
          { value: 'LOWER_BETTER', label: 'Lower is better' },
        ],
      },
      { name: 'dataSource', label: 'Measured from', required: true, span: 2, hint: 'Which system the actual comes from — a KPI with no source is an opinion' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (k) => ({
      code: k.code,
      name: k.name,
      appliesToRole: k.appliesToRole,
      category: k.category,
      unit: k.unit,
      target: String(k.target),
      weightPct: String(k.weightPct),
      direction: k.direction,
      dataSource: k.dataSource,
      isActive: String(k.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? {}),
      code: v.code,
      name: v.name,
      appliesToRole: v.appliesToRole,
      category: v.category as Kpi['category'],
      unit: v.unit,
      target: Number(v.target) || 0,
      weightPct: Number(v.weightPct) || 0,
      direction: v.direction as Kpi['direction'],
      dataSource: v.dataSource,
      isActive: v.isActive !== 'false',
    }),
  })

  const kpis = kpiCrud.rows
  const { rows: appraisals, update: updateAppraisal } = useCollection<Appraisal>('hrms:appraisal', apprSeed)

  const [tab, setTab] = useState('CYCLE')
  const [viewing, setViewing] = useState<Appraisal | null>(null)
  const [rating, setRating] = useState<Appraisal | null>(null)
  const [form, setForm] = useState({ rating: '', remarks: '' })

  const inFlight = appraisals.filter((a) => a.stage !== 'FINALISED')
  const finalised = appraisals.filter((a) => a.stage === 'FINALISED')
  const promotions = appraisals.filter((a) => a.promotionRecommended)

  /** Weighted score from the goal lines that have both an actual and a score. */
  function weightedScore(a: Appraisal) {
    const scored = a.goals.filter((g) => g.score !== null)
    if (!scored.length) return null
    const totalWeight = scored.reduce((s, g) => s + g.weightPct, 0) || 1
    return Math.round((scored.reduce((s, g) => s + (g.score ?? 0) * g.weightPct, 0) / totalWeight) * 10) / 10
  }

  function bandFor(score: number) {
    return BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1]
  }

  /** How each goal is tracking, before anybody rates it. */
  function goalStatus(a: Appraisal) {
    const withActual = a.goals.filter((g) => g.actual !== null)
    const met = withActual.filter((g) => {
      const kpi = kpis.find((k) => k.code === g.kpiCode)
      return kpi?.direction === 'LOWER_BETTER' ? (g.actual ?? 0) <= g.target : (g.actual ?? 0) >= g.target
    })
    return { measured: withActual.length, met: met.length, total: a.goals.length }
  }

  const apprColumns: Column<Appraisal>[] = [
    { key: 'docNo', header: 'Appraisal', sortable: true, width: '11.5rem', render: (a) => (
      <button type="button" onClick={() => setViewing(a)} className="text-left">
        <p className="font-mono text-xs font-medium text-brand-600 hover:underline">{a.docNo}</p>
        <p className="text-2xs text-fg-subtle">{a.cycle}</p>
      </button>
    ) },
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (a) => (
      <EmployeeCell name={a.employeeName} code={a.employeeCode} sub={a.department} />
    ) },
    { key: 'designation', header: 'Role', sortable: true, render: (a) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{a.designation}</p>
        <p className="truncate text-2xs text-fg-subtle">reviewed by {a.reviewer}</p>
      </div>
    ) },
    { key: 'goals', header: 'Goals met', width: '12rem', accessor: (a) => goalStatus(a).met, render: (a) => {
      const g = goalStatus(a)
      if (!g.measured) return <span className="text-2xs text-fg-subtle">not yet measured</span>
      return (
        <div className="flex items-center gap-2">
          <ProgressBar value={(g.met / g.measured) * 100} tone={g.met === g.measured ? 'success' : g.met >= g.measured / 2 ? 'warning' : 'danger'} className="w-14" />
          <span className="text-2xs tabular text-fg-muted">{g.met}/{g.measured}</span>
        </div>
      )
    } },
    { key: 'selfRating', header: 'Self', align: 'right', width: '9rem', sortable: true, accessor: (a) => a.selfRating ?? 0, render: (a) => <RatingCell rating={a.selfRating} /> },
    { key: 'managerRating', header: 'Manager', align: 'right', width: '9rem', sortable: true, accessor: (a) => a.managerRating ?? 0, render: (a) => <RatingCell rating={a.managerRating} /> },
    { key: 'finalRating', header: 'Final', align: 'right', width: '9rem', sortable: true, accessor: (a) => a.finalRating ?? 0, render: (a) => <RatingCell rating={a.finalRating} /> },
    { key: 'ratingBand', header: 'Band', sortable: true, width: '11rem', render: (a) => (
      a.ratingBand ? <HrStatusBadge status={a.ratingBand} size="sm" /> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    ...(canSeePay
      ? [{
          key: 'incrementPct', header: 'Increment', align: 'right' as const, sortable: true, width: '9.5rem',
          render: (a: Appraisal) => (
            a.incrementPct === null
              ? <span className="text-2xs text-fg-subtle">—</span>
              : <span className={cn('tabular text-xs font-medium', a.incrementPct >= 9 ? 'text-success' : a.incrementPct > 0 ? 'text-fg' : 'text-danger')}>{a.incrementPct}%</span>
          ),
        }]
      : []),
    { key: 'promotionRecommended', header: 'Promotion', width: '13rem', accessor: (a) => (a.promotionRecommended ? 1 : 0), render: (a) => (
      a.promotionRecommended ? (
        <div className="min-w-0">
          <Badge tone="success" size="sm" dot={false}>recommended</Badge>
          {a.recommendedDesignation && <p className="mt-0.5 truncate text-2xs text-fg-subtle">{a.recommendedDesignation}</p>}
        </div>
      ) : (
        <span className="text-2xs text-fg-subtle">—</span>
      )
    ) },
    { key: 'stage', header: 'Stage', sortable: true, width: '11.5rem', render: (a) => <HrStatusBadge status={a.stage} size="sm" /> },
  ]

  const kpiColumns: Column<Kpi>[] = [
    { key: 'code', header: 'KPI', sortable: true, width: '15rem', render: (k) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{k.name}</p>
        <p className="font-mono text-2xs text-fg-subtle">{k.code}</p>
      </div>
    ) },
    { key: 'appliesToRole', header: 'Applies to', sortable: true },
    { key: 'category', header: 'Category', sortable: true, width: '9.5rem', render: (k) => (
      <Badge
        tone={k.category === 'SAFETY' ? 'danger' : k.category === 'QUALITY' ? 'warning' : k.category === 'OUTPUT' ? 'brand' : 'neutral'}
        size="sm"
        dot={false}
      >
        {k.category.toLowerCase()}
      </Badge>
    ) },
    { key: 'target', header: 'Target', align: 'right', width: '9rem', sortable: true, render: (k) => (
      <span className="tabular text-xs">
        {k.direction === 'LOWER_BETTER' ? '≤ ' : '≥ '}
        {k.target}
        {k.unit === '%' ? '%' : ` ${k.unit}`}
      </span>
    ) },
    { key: 'weightPct', header: 'Weight', align: 'right', width: '8rem', sortable: true, render: (k) => (
      <span className="tabular text-xs">{k.weightPct}%</span>
    ) },
    { key: 'direction', header: 'Direction', width: '10rem', render: (k) => (
      <span className="text-2xs text-fg-muted">{k.direction === 'HIGHER_BETTER' ? 'higher is better' : 'lower is better'}</span>
    ) },
    { key: 'dataSource', header: 'Measured from', render: (k) => <span className="text-2xs text-fg-muted">{k.dataSource}</span> },
    { key: 'isActive', header: 'Status', align: 'center', width: '7.5rem', sortable: true, accessor: (k) => (k.isActive ? 1 : 0), render: (k) => (
      <HrStatusBadge status={k.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'KPIS'
          ? exportRows(format, 'kpi-library', 'KPI library', columnsFromTable(kpiColumns), kpis)
          : exportRows(format, 'appraisal-summary', 'Appraisal summary', columnsFromTable(apprColumns), appraisals)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Move an appraisal to the next stage, applying the rating rules on the way. */
  function advance(a: Appraisal) {
    const idx = STAGES.findIndex((s) => s.stage === a.stage)
    const next = STAGES[idx + 1]
    if (!next) return

    if (next.stage === 'MANAGER_REVIEW' && a.selfRating === null) {
      toast.error(
        'Self appraisal not submitted',
        `${a.employeeName} has not rated themselves yet. The self rating comes first deliberately — it stops the conversation being a verdict.`,
      )
      return
    }
    if (next.stage === 'HR_REVIEW' && a.managerRating === null) {
      toast.error('Manager rating missing', 'The manager has to rate against the KPIs before HR can normalise.')
      return
    }
    if (next.stage === 'FINALISED') {
      const score = a.hrRating ?? a.managerRating
      if (score === null) {
        toast.error('No rating to finalise', 'HR has to record a rating before the appraisal can be closed.')
        return
      }
      const band = bandFor(score)
      updateAppraisal(a.uid, {
        stage: 'FINALISED',
        finalRating: score,
        ratingBand: band.band,
        incrementPct: band.increment,
        finalisedOn: new Date().toISOString().slice(0, 10),
      })
      toast.success(
        'Appraisal finalised',
        `${a.employeeName} rated ${score.toFixed(1)} — ${band.band.replace(/_/g, ' ').toLowerCase()}${canSeePay ? `, ${band.increment}% increment` : ''}. ${a.promotionRecommended ? 'The promotion recommendation goes to the plant head.' : ''}`,
      )
      return
    }

    updateAppraisal(a.uid, { stage: next.stage })
    toast.success('Moved on', `${a.docNo} is now at ${next.label.toLowerCase()} — ${next.who.toLowerCase()}.`)
  }

  if (!canSee) {
    return (
      <div>
        <PageHeader
          title="Performance"
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Performance' }]}
        />
        <Card>
          <CardHeader title="Appraisals are restricted" description="Ratings and increments are visible only to HR and the reviewing line" />
          <CardBody className="space-y-3 text-xs leading-relaxed text-fg-muted">
            <p>
              Appraisal ratings need <span className="font-mono text-fg">HRMS.APPRAISAL.VIEW</span>. A rating read by a colleague
              damages the working relationship in a way a salary figure does not quite manage, so the permission is separate from
              payroll and granted narrowly.
            </p>
            <p>
              The KPI library itself is not sensitive — the targets everybody is measured against are on the{' '}
              <Link to="/hrms/skills" className="font-medium text-brand-600 hover:underline">skill matrix</Link> and{' '}
              <Link to="/hrms/incentives" className="font-medium text-brand-600 hover:underline">incentive schemes</Link>, both of
              which are open.
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Performance"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Performance' }]}
        actions={
          tab === 'KPIS' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => kpiCrud.openCreate({ category: 'OUTPUT', direction: 'HIGHER_BETTER', unit: '%', weightPct: '20', isActive: 'true' })}
            >
              Add a KPI
            </Button>
          ) : undefined
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      {tab === 'CYCLE' ? (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className="font-medium text-fg tabular">{inFlight.length}</span> appraisals in flight ·{' '}
            <span className="font-medium text-success tabular">{finalised.length}</span> finalised
            {promotions.length > 0 && <> · <span className="font-medium text-brand-600">{promotions.length}</span> promotion{promotions.length === 1 ? '' : 's'} recommended</>}
          </p>

          {/* Stage funnel */}
          <Card className="mb-4">
            <CardHeader title="Where the cycle has reached" description="Five stages, and what each one is actually for" />
            <CardBody className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {STAGES.map((s) => {
                const at = appraisals.filter((a) => a.stage === s.stage)
                return (
                  <div key={s.stage} className={cn('rounded border p-2.5', at.length ? 'border-border bg-surface-2' : 'border-border')}>
                    <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{s.label}</p>
                    <p className={cn('mt-1 text-xl font-semibold tabular', at.length ? 'text-fg' : 'text-fg-subtle')}>{at.length}</p>
                    <p className="mt-1 text-[10px] leading-snug text-fg-muted">{s.who}</p>
                  </div>
                )
              })}
            </CardBody>
          </Card>

          <DataTable
            rows={appraisals}
            columns={apprColumns}
            rowKey={(a) => a.uid}
            searchPlaceholder="Search appraisal, employee, department or reviewer…"
            onExport={doExport}
            emptyTitle="No appraisals"
            rowClassName={(a) => cn(
              a.stage === 'FINALISED' && 'bg-success/[0.03]',
              a.promotionRecommended && 'bg-brand-500/[0.03]',
              goalStatus(a).measured > 0 && goalStatus(a).met === 0 && 'bg-danger/[0.03]',
            )}
            rowActions={(a) => (
              <>
                <MenuItem label="Edit the rating" onClick={() => { setRating(a); setForm({ rating: String(a.managerRating ?? weightedScore(a) ?? ''), remarks: a.managerRemarks ?? '' }) }} />
                <MenuItem
                  label="Delete the appraisal"
                  danger
                  disabled={a.stage === 'FINALISED'}
                  onClick={() => {
                    updateAppraisal(a.uid, { stage: 'GOAL_SETTING', selfRating: null, managerRating: null, hrRating: null, finalRating: null, ratingBand: null, incrementPct: null })
                    toast.success('Appraisal reset', `${a.docNo} is back at goal setting with all ratings cleared.`)
                  }}
                />
                <MenuItem separatorBefore label="Open the appraisal" onClick={() => setViewing(a)} />
                <MenuItem
                  label="Move to the next stage"
                  disabled={a.stage === 'FINALISED'}
                  onClick={() => advance(a)}
                />
                <MenuItem
                  label="Record the manager rating"
                  disabled={a.stage !== 'MANAGER_REVIEW' && a.stage !== 'HR_REVIEW'}
                  onClick={() => { setRating(a); setForm({ rating: String(weightedScore(a) ?? ''), remarks: a.managerRemarks ?? '' }) }}
                />
                <MenuItem
                  label={a.promotionRecommended ? 'Withdraw the promotion recommendation' : 'Recommend a promotion'}
                  onClick={() => {
                    updateAppraisal(a.uid, { promotionRecommended: !a.promotionRecommended })
                    toast.success(
                      a.promotionRecommended ? 'Recommendation withdrawn' : 'Promotion recommended',
                      a.promotionRecommended
                        ? `${a.employeeName}'s promotion recommendation has been withdrawn.`
                        : `${a.employeeName} recommended for promotion. It goes to the plant head with the final rating.`,
                    )
                  }}
                />
                <MenuItem label="Print the appraisal" onClick={() => doExport('pdf')} />
              </>
            )}
          />
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className="font-medium text-fg tabular">{kpis.filter((k) => k.isActive).length}</span> active KPIs. Every one
            names the system its actual comes from — a KPI without a data source is an opinion with a number attached.
          </p>

          <DataTable
            rows={kpis}
            columns={kpiColumns}
            rowKey={(k) => k.uid}
            searchPlaceholder="Search KPI, role, category or source…"
            onExport={doExport}
            emptyTitle="No KPIs defined"
            rowClassName={(k) => cn(!k.isActive && 'opacity-60', k.category === 'SAFETY' && 'bg-danger/[0.02]')}
            rowActions={(k) => (
              <>
                <MenuItem label="Edit the KPI" onClick={() => kpiCrud.openEdit(k)} />
                <MenuItem label="Delete the KPI" danger onClick={() => kpiCrud.askDelete(k)} />
                <MenuItem
                  separatorBefore
                  label={k.isActive ? 'Deactivate' : 'Activate'}
                  onClick={() => {
                    kpiCrud.update(k.uid, { isActive: !k.isActive })
                    toast.success(
                      k.isActive ? 'KPI deactivated' : 'KPI activated',
                      k.isActive
                        ? `${k.name} will not be offered on new goal sheets. Existing appraisals keep it.`
                        : `${k.name} is available for goal setting again.`,
                    )
                  }}
                />
              </>
            )}
          />
        </>
      )}

      {/* Appraisal detail --------------------------------------------------- */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.employeeName} — ${viewing.cycle}` : ''}
        description={viewing ? `${viewing.docNo} · ${viewing.designation} · reviewed by ${viewing.reviewer}` : ''}
        width="max-w-2xl"
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
              <Button
                variant="primary"
                disabled={viewing.stage === 'FINALISED'}
                onClick={() => { advance(viewing); setViewing(null) }}
              >
                Move to the next stage
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {STAGES.map((s, i) => {
                const idx = STAGES.findIndex((x) => x.stage === viewing.stage)
                return (
                  <span
                    key={s.stage}
                    className={cn(
                      'rounded px-2 py-1 text-2xs',
                      i < idx ? 'bg-success/10 text-success' : i === idx ? 'bg-brand-500/10 font-medium text-brand-600' : 'bg-surface-2 text-fg-subtle',
                    )}
                  >
                    {s.label}
                  </span>
                )
              })}
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Goals</h3>
              <div className="overflow-hidden rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 text-2xs uppercase tracking-wide text-fg-subtle">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">KPI</th>
                      <th className="px-3 py-1.5 text-right font-medium">Target</th>
                      <th className="px-3 py-1.5 text-right font-medium">Actual</th>
                      <th className="px-3 py-1.5 text-right font-medium">Weight</th>
                      <th className="px-3 py-1.5 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.goals.map((g) => {
                      const kpi = kpis.find((k) => k.code === g.kpiCode)
                      const met =
                        g.actual === null
                          ? null
                          : kpi?.direction === 'LOWER_BETTER'
                            ? g.actual <= g.target
                            : g.actual >= g.target
                      return (
                        <tr key={g.kpiCode} className="border-t border-border">
                          <td className="px-3 py-1.5">
                            <p className="text-fg">{g.kpiName}</p>
                            <p className="text-2xs text-fg-subtle">{kpi?.dataSource ?? 'no source recorded'}</p>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular text-fg-muted">{g.target}</td>
                          <td className={cn('px-3 py-1.5 text-right tabular', met === null ? 'text-fg-subtle' : met ? 'text-success' : 'text-danger')}>
                            {g.actual ?? 'not measured'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular text-fg-muted">{g.weightPct}%</td>
                          <td className="px-3 py-1.5 text-right tabular text-fg">{g.score ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {weightedScore(viewing) !== null && (
                <p className="mt-2 text-2xs text-fg-muted">
                  Weighted score from the goal lines:{' '}
                  <span className="font-medium tabular text-fg">{weightedScore(viewing)?.toFixed(1)}</span> — this is what the
                  manager rating is checked against.
                </p>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Self rating', value: viewing.selfRating },
                { label: 'Manager rating', value: viewing.managerRating },
                { label: 'Final rating', value: viewing.finalRating },
              ].map((r) => (
                <div key={r.label} className="rounded border border-border p-3">
                  <p className="text-2xs uppercase tracking-wide text-fg-subtle">{r.label}</p>
                  <div className="mt-1"><RatingCell rating={r.value} /></div>
                </div>
              ))}
            </div>

            {viewing.ratingBand && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-success/30 bg-success/5 p-3">
                <div>
                  <p className="text-xs font-medium text-fg">Finalised as {viewing.ratingBand.replace(/_/g, ' ').toLowerCase()}</p>
                  <p className="text-2xs text-fg-muted">
                    {viewing.finalisedOn ? `on ${formatDate(viewing.finalisedOn)}` : ''}
                    {viewing.promotionRecommended ? ` · promotion to ${viewing.recommendedDesignation} recommended` : ''}
                  </p>
                </div>
                {canSeePay && viewing.incrementPct !== null && (
                  <p className="text-lg font-semibold tabular text-success">{viewing.incrementPct}%</p>
                )}
              </div>
            )}

            {(viewing.managerRemarks || viewing.employeeRemarks) && (
              <section className="space-y-2">
                {viewing.managerRemarks && (
                  <div className="rounded border border-border bg-surface-2 p-3">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Manager</p>
                    <p className="mt-1 text-xs leading-relaxed text-fg-muted">{viewing.managerRemarks}</p>
                  </div>
                )}
                {viewing.employeeRemarks && (
                  <div className="rounded border border-border bg-surface-2 p-3">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Employee</p>
                    <p className="mt-1 text-xs leading-relaxed text-fg-muted">{viewing.employeeRemarks}</p>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </Drawer>

      {/* Rating ------------------------------------------------------------ */}
      <Modal
        open={!!rating}
        onClose={() => setRating(null)}
        title={rating ? `Rate ${rating.employeeName}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setRating(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!rating) return
                const val = Number(form.rating)
                if (Number.isNaN(val) || val < 1 || val > 5) {
                  toast.error('Rating is out of five', 'Enter a value between 1 and 5.')
                  return
                }
                const computed = weightedScore(rating)
                if (computed !== null && Math.abs(val - computed) > 1 && !form.remarks.trim()) {
                  toast.error(
                    'Rating differs from the goal scores',
                    `The weighted goal score is ${computed.toFixed(1)} and you have entered ${val.toFixed(1)}. A gap of more than a point needs a written explanation, otherwise the KPIs are decoration.`,
                  )
                  return
                }
                const isHr = rating.stage === 'HR_REVIEW'
                updateAppraisal(rating.uid, {
                  ...(isHr ? { hrRating: val } : { managerRating: val }),
                  managerRemarks: form.remarks.trim() || rating.managerRemarks,
                })
                toast.success(
                  isHr ? 'HR rating recorded' : 'Manager rating recorded',
                  `${rating.employeeName} rated ${val.toFixed(1)}. ${isHr ? 'The appraisal can now be finalised.' : 'It moves to HR for normalisation next.'}`,
                )
                setRating(null)
              }}
            >
              Save rating
            </Button>
          </>
        }
      >
        {rating && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{rating.employeeName} — {rating.designation}</p>
              <p className="mt-1 text-fg-muted">
                {goalStatus(rating).met} of {goalStatus(rating).measured} measured goals met
                {weightedScore(rating) !== null && ` · weighted goal score ${weightedScore(rating)?.toFixed(1)}`}
                {rating.selfRating !== null && ` · self rated ${rating.selfRating.toFixed(1)}`}
              </p>
            </div>
            <Input
              label="Rating out of 5"
              type="number"
              step="0.1"
              min={1}
              max={5}
              value={form.rating}
              onChange={(e) => setForm({ ...form, rating: e.target.value })}
              hint={
                weightedScore(rating) !== null
                  ? `The goal scores work out to ${weightedScore(rating)?.toFixed(1)} — a gap of more than a point needs an explanation`
                  : undefined
              }
            />
            <Textarea
              label="Remarks"
              rows={3}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="Best output in the press shop and a clean safety record. Ready for a senior grade."
            />
            {canSeePay && (
              <p className="rounded border border-border p-2.5 text-2xs text-fg-muted">
                Bands and increments:{' '}
                {BANDS.map((b) => `${b.band.replace(/_/g, ' ').toLowerCase()} ≥ ${b.min} → ${b.increment}%`).join(' · ')}
              </p>
            )}
          </div>
        )}
      </Modal>

      {kpiCrud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why the self appraisal comes first" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            A manager who rates first turns the meeting into a verdict to be defended. An employee who rates first turns it into a
            comparison of two views, which is a conversation.
          </p>
          <p>
            The weighted goal score is computed from production data, so both sides arrive with the same numbers. A rating more
            than a point away from it has to be explained in writing — otherwise the KPIs are decoration.
          </p>
          <p>
            HR normalises last. One generous manager and one harsh one otherwise produce incomparable ratings, and the increment
            budget gets spent on whoever had the softer reviewer.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
