import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatCompact, formatCurrency } from '@/lib/format'
import { usePermissions } from '@/store/auth'
import type { KpiReading, MetricFormat, MetricStatus, SourceModule } from '@/types/bi'

/**
 * Shared parts for the analytics screens.
 *
 * The two rules this shell enforces everywhere: a number always says where it
 * came from and where to go and check it, and a number nobody is allowed to see
 * disappears rather than showing as zero. A masked metric reading as 0% is worse
 * than no metric, because somebody will act on it.
 */

/* ─────────────────────────── Visibility ─────────────────────────── */

/** Revenue, margin, cost and stock value. */
export function useCanSeeFinancial() {
  const { has } = usePermissions()
  return has('BI.FINANCIAL.VIEW') || has('FINANCE.LEDGER.VIEW') || has('BI.REPORT.VIEW_VALUE')
}

/** Salary, attrition and per-person productivity. */
export function useCanSeePeople() {
  const { has } = usePermissions()
  return has('BI.PEOPLE.VIEW') || has('HRMS.PAYROLL.VIEW')
}

/** Whether a given reading may be shown at all. */
export function useVisibleReadings(readings: KpiReading[]) {
  const fin = useCanSeeFinancial()
  const ppl = useCanSeePeople()
  return useMemo(
    () =>
      readings.filter(
        (r) => r.sensitivity === 'OPEN' || (r.sensitivity === 'FINANCIAL' && fin) || (r.sensitivity === 'PEOPLE' && ppl),
      ),
    [readings, fin, ppl],
  )
}

/* ─────────────────────────── Formatting ─────────────────────────── */

export function formatMetric(value: number, format: MetricFormat, unit = '') {
  if (!Number.isFinite(value)) return '—'
  switch (format) {
    case 'CURRENCY':
      return Math.abs(value) >= 100_000 ? formatCompact(value) : formatCurrency(value)
    case 'PERCENT':
      return `${value.toFixed(1)}%`
    case 'DAYS':
      return `${value.toFixed(1)} d`
    case 'HOURS':
      return `${value.toFixed(1)} h`
    case 'PPM':
      return `${Math.round(value).toLocaleString('en-IN')} ppm`
    case 'RATIO':
      return value.toFixed(2)
    default:
      return `${Math.round(value).toLocaleString('en-IN')}${unit && unit !== '₹' && unit !== '%' ? ` ${unit}` : ''}`
  }
}

const STATUS_TONE: Record<MetricStatus, StatusTone> = {
  ON_TARGET: 'success',
  WATCH: 'warning',
  OFF_TARGET: 'danger',
  NO_DATA: 'neutral',
}

const STATUS_LABEL: Record<MetricStatus, string> = {
  ON_TARGET: 'on target',
  WATCH: 'watch',
  OFF_TARGET: 'off target',
  NO_DATA: 'no data',
}

export function StatusBadge({ status, size = 'sm' }: { status: MetricStatus; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={STATUS_TONE[status]} size={size} dot={status !== 'NO_DATA'}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

/** Movement against the previous period, coloured by whether it is good news. */
export function DeltaChip({
  value,
  previous,
  direction,
  format,
}: {
  value: number
  previous: number | null
  direction: 'HIGHER_BETTER' | 'LOWER_BETTER'
  format: MetricFormat
}) {
  if (previous === null || !Number.isFinite(previous) || previous === 0) {
    return <span className="text-2xs text-fg-subtle">no comparison</span>
  }
  const changePct = ((value - previous) / Math.abs(previous)) * 100
  const improved = direction === 'HIGHER_BETTER' ? changePct > 0 : changePct < 0
  const flat = Math.abs(changePct) < 0.5
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-2xs font-medium tabular',
        flat ? 'text-fg-muted' : improved ? 'text-success' : 'text-danger',
      )}
      title={`Previous: ${formatMetric(previous, format)}`}
    >
      {flat ? '→' : changePct > 0 ? '▲' : '▼'}
      {Math.abs(changePct).toFixed(1)}%
    </span>
  )
}

/** A minimal sparkline drawn as an inline SVG polyline — no chart library needed. */
export function Spark({ points, tone = 'brand' }: { points: number[]; tone?: 'brand' | 'success' | 'danger' | 'warning' }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const w = 64
  const h = 18
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * h}`)
    .join(' ')
  const stroke = { brand: '#7c3aed', success: '#10b981', danger: '#ef4444', warning: '#f59e0b' }[tone]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" aria-hidden>
      <polyline points={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - ((points[points.length - 1] - min) / span) * h} r={1.8} fill={stroke} />
    </svg>
  )
}

/**
 * The unit every dashboard is built from. It carries the target, the movement,
 * the trend, the source sentence and the drill-through — which together are what
 * separate a dashboard from a poster.
 */
export function KpiCard({
  reading,
  size = 'md',
}: {
  reading: KpiReading
  size?: 'sm' | 'md' | 'lg'
}) {
  const tone =
    reading.status === 'ON_TARGET' ? 'success' : reading.status === 'WATCH' ? 'warning' : reading.status === 'OFF_TARGET' ? 'danger' : 'brand'

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs uppercase tracking-wide text-fg-subtle">{reading.name}</p>
        <StatusBadge status={reading.status} />
      </div>
      <p
        className={cn(
          'mt-1 font-semibold tabular',
          size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl',
          reading.status === 'OFF_TARGET' ? 'text-danger' : reading.status === 'WATCH' ? 'text-warning' : 'text-fg',
        )}
      >
        {formatMetric(reading.value, reading.format, reading.unit)}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-2xs text-fg-muted">
          target {formatMetric(reading.target, reading.format, reading.unit)}
        </span>
        <DeltaChip value={reading.value} previous={reading.previousValue} direction={reading.direction} format={reading.format} />
      </div>
      {reading.spark.length > 1 && (
        <div className="mt-2">
          <Spark points={reading.spark} tone={tone} />
        </div>
      )}
      <p className="mt-2 truncate text-[10px] text-fg-subtle" title={reading.source}>
        {reading.source}
      </p>
    </>
  )

  return reading.drillTo ? (
    <Link
      to={reading.drillTo}
      className="card group p-3 transition-colors hover:border-border-strong hover:bg-surface-2"
      title={`Open ${reading.name} in ${MODULE_LABEL[reading.module]}`}
    >
      {body}
      <p className="mt-1 text-[10px] font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
        Drill through to {MODULE_LABEL[reading.module].toLowerCase()} →
      </p>
    </Link>
  ) : (
    <div className="card p-3">{body}</div>
  )
}

/** Shown in place of a KPI the signed-in role may not see. */
export function MaskedCard({ name, reason }: { name: string; reason: string }) {
  return (
    <div className="card border-dashed p-3 opacity-70">
      <p className="text-2xs uppercase tracking-wide text-fg-subtle">{name}</p>
      <p className="mt-1 text-lg font-semibold text-fg-subtle">restricted</p>
      <p className="mt-2 text-[10px] leading-snug text-fg-muted">{reason}</p>
    </div>
  )
}

/* ───────────────────────── Global filter bar ───────────────────────── */

export interface BiFilters {
  plant: string
  line: string
  productFamily: string
  capacity: string
  shift: string
  region: string
  period: string
}

const DEFAULT_FILTERS: BiFilters = {
  plant: 'all',
  line: 'all',
  productFamily: 'all',
  capacity: 'all',
  shift: 'all',
  region: 'all',
  period: '30d',
}

const FilterContext = createContext<{ filters: BiFilters; set: (f: Partial<BiFilters>) => void }>({
  filters: DEFAULT_FILTERS,
  set: () => {},
})

export function BiFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<BiFilters>(DEFAULT_FILTERS)
  const set = (f: Partial<BiFilters>) => setFilters((s) => ({ ...s, ...f }))
  return <FilterContext.Provider value={{ filters, set }}>{children}</FilterContext.Provider>
}

export const useBiFilters = () => useContext(FilterContext)

/**
 * Route layout for the analytics portal. The filter bar is shared state across
 * the BI screens, so it lives above the routes rather than inside each page —
 * changing plant on one screen and finding it reset on the next is the kind of
 * small friction that stops people using an analytics portal at all.
 */
export function BiRouteLayout() {
  return (
    <BiFilterProvider>
      <Outlet />
    </BiFilterProvider>
  )
}

export const FILTER_OPTIONS = {
  plant: [
    { value: 'all', label: 'All plants' },
    { value: 'Chennai — Unit 1', label: 'Chennai — Unit 1' },
    { value: 'Chennai — Unit 2', label: 'Chennai — Unit 2 (Coating)' },
  ],
  line: [
    { value: 'all', label: 'All lines' },
    { value: 'Line 1', label: 'Line 1' },
    { value: 'Line 2', label: 'Line 2' },
  ],
  productFamily: [
    { value: 'all', label: 'All families' },
    { value: 'Insulated', label: 'Insulated bottles' },
    { value: 'Single wall', label: 'Single wall' },
    { value: 'Flask', label: 'Flasks' },
  ],
  capacity: [
    { value: 'all', label: 'All capacities' },
    { value: '350', label: '350 ml' },
    { value: '500', label: '500 ml' },
    { value: '750', label: '750 ml' },
    { value: '1000', label: '1 litre' },
  ],
  shift: [
    { value: 'all', label: 'All shifts' },
    { value: 'A', label: 'A — morning' },
    { value: 'B', label: 'B — evening' },
    { value: 'C', label: 'C — night' },
  ],
  region: [
    { value: 'all', label: 'All regions' },
    { value: 'South', label: 'South' },
    { value: 'West', label: 'West' },
    { value: 'North', label: 'North' },
    { value: 'East', label: 'East' },
    { value: 'Export', label: 'Export' },
  ],
  period: [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: 'mtd', label: 'Month to date' },
    { value: 'qtd', label: 'Quarter to date' },
    { value: 'ytd', label: 'Year to date' },
  ],
}

/**
 * The filter bar the analytics screens share. Which filters are shown is per
 * screen — a finance analysis has no use for a shift filter, and offering one
 * that does nothing is worse than not offering it.
 */
export function BiFilterBar({
  show = ['period', 'plant'],
  extra,
}: {
  show?: (keyof BiFilters)[]
  extra?: ReactNode
}) {
  const { filters, set } = useBiFilters()
  const active = show.filter((k) => filters[k] !== 'all' && !(k === 'period' && filters.period === '30d'))

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {show.map((key) => (
        <Select
          key={key}
          sizeVariant="sm"
          containerClassName="w-40"
          value={filters[key]}
          onChange={(e) => set({ [key]: e.target.value } as Partial<BiFilters>)}
          options={FILTER_OPTIONS[key as keyof typeof FILTER_OPTIONS]}
        />
      ))}
      {extra}
      {active.length > 0 && (
        <button
          type="button"
          onClick={() => set(DEFAULT_FILTERS)}
          className="text-2xs font-medium text-brand-600 hover:underline"
        >
          Clear {active.length} filter{active.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}

/* ─────────────────────── Insight & module chrome ─────────────────────── */

export const MODULE_LABEL: Record<SourceModule, string> = {
  SALES: 'Sales & CRM',
  PROCUREMENT: 'Procurement',
  INVENTORY: 'Inventory',
  PRODUCTION: 'Shop floor',
  QUALITY: 'Quality',
  MAINTENANCE: 'Maintenance',
  DISPATCH: 'Dispatch',
  FINANCE: 'Finance',
  HRMS: 'HR & payroll',
  PLANNING: 'Planning',
  ENGINEERING: 'Engineering',
}

export const MODULE_TONE: Record<SourceModule, string> = {
  SALES: 'bg-blue-500/10 text-blue-600',
  PROCUREMENT: 'bg-amber-500/10 text-amber-600',
  INVENTORY: 'bg-emerald-500/10 text-emerald-600',
  PRODUCTION: 'bg-rose-500/10 text-rose-600',
  QUALITY: 'bg-teal-500/10 text-teal-600',
  MAINTENANCE: 'bg-orange-500/10 text-orange-600',
  DISPATCH: 'bg-fuchsia-500/10 text-fuchsia-600',
  FINANCE: 'bg-green-500/10 text-green-600',
  HRMS: 'bg-purple-500/10 text-purple-600',
  PLANNING: 'bg-lime-500/10 text-lime-600',
  ENGINEERING: 'bg-sky-500/10 text-sky-600',
}

export function ModuleChip({ module }: { module: SourceModule }) {
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', MODULE_TONE[module])}>
      {MODULE_LABEL[module]}
    </span>
  )
}

const SEVERITY_TONE: Record<string, StatusTone> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
  POSITIVE: 'success',
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge tone={SEVERITY_TONE[severity] ?? 'neutral'} size="sm" dot={severity === 'CRITICAL'}>
      {severity.toLowerCase()}
    </Badge>
  )
}

/** Model confidence, drawn so a weak signal reads as weak. */
export function ConfidenceMeter({ pct }: { pct: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Model confidence ${pct}%`}>
      <span className="flex gap-0.5">
        {[20, 40, 60, 80].map((step) => (
          <span
            key={step}
            className={cn(
              'h-2.5 w-1 rounded-sm',
              pct > step ? (pct >= 85 ? 'bg-success' : pct >= 70 ? 'bg-brand-500' : 'bg-warning') : 'bg-surface-3',
            )}
          />
        ))}
      </span>
      <span className={cn('text-2xs tabular', pct >= 85 ? 'text-success' : pct >= 70 ? 'text-fg-muted' : 'text-warning')}>
        {pct}%
      </span>
    </span>
  )
}

/** A heat cell for a matrix of metric values. */
export function HeatCell({ value, status, label }: { value: number; status: MetricStatus; label?: string }) {
  return (
    <span
      title={label}
      className={cn(
        'flex h-7 min-w-[3rem] items-center justify-center rounded text-2xs font-medium tabular',
        status === 'ON_TARGET' && 'bg-success/15 text-success',
        status === 'WATCH' && 'bg-warning/15 text-warning',
        status === 'OFF_TARGET' && 'bg-danger/15 text-danger',
        status === 'NO_DATA' && 'bg-surface-3 text-fg-subtle',
      )}
    >
      {Number.isFinite(value) ? value.toFixed(1) : '—'}
    </span>
  )
}

export function BiChartTip({ active, payload, label, suffix = '', prefix = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-pop">
      {label && <p className="mb-0.5 text-2xs font-medium text-fg">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="text-2xs text-fg-muted">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.color ?? p.fill }} />
          {p.name}:{' '}
          <span className="font-medium tabular text-fg">
            {prefix}
            {typeof p.value === 'number' ? p.value.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : p.value}
            {suffix}
          </span>
        </p>
      ))}
    </div>
  )
}

export const BI_COLOURS = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6']

/**
 * A short line naming where a screen's numbers come from. Every analytics screen
 * carries one, because "which system said this" is the first question anybody
 * asks of a figure they do not like.
 */
export function SourceNote({ modules, note }: { modules: SourceModule[]; note?: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border bg-surface-2/50 px-3 py-2">
      <p className="text-2xs leading-relaxed text-fg-muted">
        <span className="font-medium text-fg-subtle">Built from:</span>{' '}
        {modules.map((m) => MODULE_LABEL[m]).join(' · ')}
        {note ? ` — ${note}` : ''} Every figure on this screen is computed from those modules at read time; BI keeps no
        second copy of the numbers.
      </p>
    </div>
  )
}
