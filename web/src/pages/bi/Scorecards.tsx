import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import {
  MaskedCard,
  SourceNote,
  StatusBadge,
  formatMetric,
  useCanSeeFinancial,
  useCanSeePeople,
} from '@/components/bi/BiShell'
import { kpiDefinitions as seedKpis, readingByCode } from '@/mock/bi'
import { useCollection } from '@/store/data'
import { cn } from '@/lib/cn'
import type { KpiDefinition, MetricStatus } from '@/types/bi'

/**
 * Scorecards — the KPI library reorganised around the two questions people
 * actually ask: how is each part of the business doing, and who is answerable.
 *
 * The score is deliberately blunt: on target counts one, watch counts a half,
 * off target counts nothing. A weighted composite would be defensible and
 * useless, because nobody can tell from an 81 which metric moved it.
 */

function statusFor(def: KpiDefinition, value: number): MetricStatus {
  if (!Number.isFinite(value)) return 'NO_DATA'
  const band = (def.target * def.watchBandPct) / 100
  if (def.direction === 'HIGHER_BETTER') {
    if (value >= def.target) return 'ON_TARGET'
    return value >= def.target - band ? 'WATCH' : 'OFF_TARGET'
  }
  if (value <= def.target) return 'ON_TARGET'
  return value <= def.target + band ? 'WATCH' : 'OFF_TARGET'
}

const WEIGHT: Record<MetricStatus, number> = { ON_TARGET: 1, WATCH: 0.5, OFF_TARGET: 0, NO_DATA: 0 }

const PERSPECTIVE_LABEL: Record<KpiDefinition['category'], string> = {
  FINANCIAL: 'Financial',
  OPERATIONAL: 'Operations',
  QUALITY: 'Quality',
  CUSTOMER: 'Customer',
  PEOPLE: 'People & learning',
  SUPPLY_CHAIN: 'Supply chain',
}

const PERSPECTIVE_NOTE: Record<KpiDefinition['category'], string> = {
  FINANCIAL: 'Whether the business is making money and keeping it.',
  OPERATIONAL: 'Whether the plant is producing what it said it would.',
  QUALITY: 'Whether what it produced is good enough to ship.',
  CUSTOMER: 'Whether the customer got it when they were promised it.',
  PEOPLE: 'Whether the plant has the people to keep doing this.',
  SUPPLY_CHAIN: 'Whether material arrives without tying up cash.',
}

function scoreOf(items: { status: MetricStatus }[]) {
  const measured = items.filter((i) => i.status !== 'NO_DATA')
  if (!measured.length) return null
  return Math.round((measured.reduce((s, i) => s + WEIGHT[i.status], 0) / measured.length) * 100)
}

function scoreTone(score: number | null) {
  if (score === null) return 'neutral' as const
  if (score >= 80) return 'success' as const
  if (score >= 60) return 'warning' as const
  return 'danger' as const
}

/** ProgressBar has no neutral tone; an unmeasured bar is drawn in brand at zero. */
function barTone(score: number | null) {
  const t = scoreTone(score)
  return t === 'neutral' ? ('brand' as const) : t
}

function KpiLine({
  item,
}: {
  item: KpiDefinition & { actual: number; status: MetricStatus }
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-1.5">
      <div className="min-w-[10rem] flex-1">
        <p className="truncate text-xs font-medium text-fg">{item.name}</p>
        <p className="truncate text-2xs text-fg-subtle">
          {item.ownerName} · {item.reviewCycle}
        </p>
      </div>
      <span className="tabular w-24 text-right text-xs text-fg">
        {Number.isFinite(item.actual) ? formatMetric(item.actual, item.format, item.unit) : '—'}
      </span>
      <span className="tabular w-24 text-right text-2xs text-fg-subtle">
        target {formatMetric(item.target, item.format, item.unit)}
      </span>
      <StatusBadge status={item.status} />
      {item.drillTo && (
        <Link to={item.drillTo} className="text-2xs font-medium text-brand-600 hover:underline">
          Check →
        </Link>
      )}
    </div>
  )
}

export function BiScorecardsPage() {
  const canSeeFinancial = useCanSeeFinancial()
  const canSeePeople = useCanSeePeople()
  const kpis = useCollection<KpiDefinition>('bi.kpiDefinitions', seedKpis)
  const [tab, setTab] = useState('perspective')

  const items = useMemo(
    () =>
      kpis.rows
        .filter((k) => k.isActive)
        .map((k) => {
          const value = readingByCode[k.code]?.value ?? NaN
          return { ...k, actual: value, status: statusFor(k, value) }
        }),
    [kpis.rows],
  )

  const visible = items.filter(
    (k) =>
      (k.sensitivity !== 'FINANCIAL' || canSeeFinancial) && (k.sensitivity !== 'PEOPLE' || canSeePeople),
  )
  const hiddenCount = items.length - visible.length

  const overall = scoreOf(visible)
  const offTarget = visible.filter((k) => k.status === 'OFF_TARGET')

  const perspectives = (Object.keys(PERSPECTIVE_LABEL) as KpiDefinition['category'][])
    .map((c) => ({
      key: c,
      label: PERSPECTIVE_LABEL[c],
      note: PERSPECTIVE_NOTE[c],
      all: items.filter((k) => k.category === c),
      rows: visible.filter((k) => k.category === c),
    }))
    .filter((p) => p.all.length > 0)

  /** One card per accountable person, because that is who gets asked about it. */
  const owners = useMemo(() => {
    const map = new Map<string, { name: string; role: string; department: string; rows: typeof visible }>()
    for (const k of visible) {
      const key = k.ownerName || 'Unassigned'
      const entry = map.get(key) ?? {
        name: key,
        role: k.ownerRole,
        department: k.responsibleDepartment,
        rows: [] as typeof visible,
      }
      entry.rows.push(k)
      map.set(key, entry)
    }
    return [...map.values()]
      .map((o) => ({ ...o, score: scoreOf(o.rows) }))
      .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
  }, [visible])

  return (
    <div>
      <PageHeader
        title="Scorecards"
        description="The same KPIs, arranged by what they measure and by who answers for them"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Scorecards' }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Overall score"
          value={overall === null ? '—' : `${overall}`}
          sub="On target counts 1, watch counts ½, off target counts 0"
          tone={scoreTone(overall)}
        />
        <StatTile label="Measured KPIs" value={String(visible.filter((k) => k.status !== 'NO_DATA').length)} sub={`of ${visible.length} active`} tone="brand" />
        <StatTile
          label="Off target"
          value={String(offTarget.length)}
          sub={offTarget.length ? offTarget.slice(0, 3).map((k) => k.name).join(', ') : 'Everything inside its band'}
          tone={offTarget.length ? 'danger' : 'success'}
        />
        <StatTile
          label="Restricted from you"
          value={String(hiddenCount)}
          sub={hiddenCount ? 'Money or people metrics you cannot see' : 'You can see every KPI'}
          tone="neutral"
        />
      </div>

      <Tabs
        variant="pill"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'perspective', label: 'By perspective', count: perspectives.length },
          { id: 'owner', label: 'By accountable person', count: owners.length },
        ]}
      />

      {tab === 'perspective' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {perspectives.map((p) => {
            const score = scoreOf(p.rows)
            const restricted = p.all.length - p.rows.length
            if (p.rows.length === 0) {
              return (
                <MaskedCard
                  key={p.key}
                  name={p.label}
                  reason={
                    p.key === 'FINANCIAL'
                      ? 'Every metric in this perspective carries money, so it needs BI.FINANCIAL.VIEW.'
                      : 'Every metric in this perspective resolves to individuals, so it needs BI.PEOPLE.VIEW.'
                  }
                />
              )
            }
            return (
              <Card key={p.key}>
                <CardHeader
                  title={p.label}
                  description={p.note}
                  actions={
                    <Badge tone={scoreTone(score)}>
                      {score === null ? 'No data' : `${score} / 100`}
                    </Badge>
                  }
                />
                <CardBody className="space-y-1.5">
                  <ProgressBar value={score ?? 0} tone={barTone(score)} />
                  {p.rows.map((k) => (
                    <KpiLine key={k.uid} item={k} />
                  ))}
                  {restricted > 0 && (
                    <p className="pt-1 text-2xs text-fg-subtle">
                      {restricted} further {restricted === 1 ? 'metric is' : 'metrics are'} restricted for your role and
                      excluded from this score.
                    </p>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'owner' && (
        <div className="mt-4">
          <Card className="mb-4">
            <CardBody className="text-2xs leading-relaxed text-fg-muted">
              Sorted worst first, because that is the order a review meeting should take them in. A person with one red
              metric and one green scores 50 — the score is a prompt to open the card, not a judgement on the person.
            </CardBody>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            {owners.map((o) => (
              <Card key={o.name} className={cn(o.score !== null && o.score < 60 && 'border-danger/30')}>
                <CardHeader
                  title={o.name}
                  description={`${o.role} · ${o.department} · answerable for ${o.rows.length} ${o.rows.length === 1 ? 'metric' : 'metrics'}`}
                  actions={<Badge tone={scoreTone(o.score)}>{o.score === null ? 'No data' : `${o.score} / 100`}</Badge>}
                />
                <CardBody className="space-y-1.5">
                  <ProgressBar value={o.score ?? 0} tone={barTone(o.score)} />
                  {o.rows.map((k) => (
                    <KpiLine key={k.uid} item={k} />
                  ))}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      <SourceNote
        modules={['FINANCE', 'PRODUCTION', 'QUALITY', 'INVENTORY', 'PROCUREMENT', 'DISPATCH', 'MAINTENANCE', 'HRMS']}
        note="Targets come from the KPI library, so a target changed there changes these scores immediately. Metrics with no reading are excluded rather than counted as failures."
      />
    </div>
  )
}
