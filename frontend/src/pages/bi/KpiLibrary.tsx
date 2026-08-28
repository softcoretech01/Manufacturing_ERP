import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Target } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input, Select, Switch } from '@/components/ui/Input'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { PageHeader, StatTile } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ModuleChip, SourceNote, StatusBadge, formatMetric } from '@/components/bi/BiShell'
import { kpiDefinitions as seedKpis, readingByCode } from '@/mock/bi'
import { useCollection } from '@/store/data'
import { exportRows } from '@/lib/export'
import { cn } from '@/lib/cn'
import type { KpiDefinition, MetricStatus } from '@/types/bi'

/**
 * The KPI library — the definition of every number the business reports on.
 *
 * The formula is held as a plain sentence rather than only in code, because a
 * KPI nobody can argue with is a KPI nobody can use. Targets and watch bands are
 * editable here and the status recomputes against the edited target on the spot,
 * so the effect of moving a target is visible before it is committed rather than
 * discovered on somebody's dashboard next month.
 */

/** The same rule the metric layer uses, applied to the edited target. */
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

const CATEGORY_LABEL: Record<KpiDefinition['category'], string> = {
  FINANCIAL: 'Financial',
  OPERATIONAL: 'Operational',
  QUALITY: 'Quality',
  CUSTOMER: 'Customer',
  PEOPLE: 'People',
  SUPPLY_CHAIN: 'Supply chain',
}

export function BiKpiLibraryPage() {
  const toast = useToast()
  const kpis = useCollection<KpiDefinition>('bi.kpiDefinitions', seedKpis)

  const [category, setCategory] = useState('ALL')
  const [editing, setEditing] = useState<KpiDefinition | null>(null)
  const [draft, setDraft] = useState({ target: '', watchBandPct: '', ownerName: '', reviewCycle: '' })

  const rows = useMemo(
    () => kpis.rows.filter((k) => category === 'ALL' || k.category === category),
    [kpis.rows, category],
  )

  /** Live actual for each KPI, judged against the target as it stands now. */
  const withStatus = rows.map((k) => {
    const reading = readingByCode[k.code]
    const value = reading?.value ?? NaN
    return { ...k, actual: value, liveStatus: statusFor(k, value) }
  })

  const offTarget = withStatus.filter((k) => k.liveStatus === 'OFF_TARGET')
  const unowned = kpis.rows.filter((k) => !k.ownerName.trim())
  const inactive = kpis.rows.filter((k) => !k.isActive)

  function openEdit(k: KpiDefinition) {
    setEditing(k)
    setDraft({
      target: String(k.target),
      watchBandPct: String(k.watchBandPct),
      ownerName: k.ownerName,
      reviewCycle: k.reviewCycle,
    })
  }

  const draftTarget = Number(draft.target)
  const draftBand = Number(draft.watchBandPct)
  const draftValid =
    Number.isFinite(draftTarget) && draftTarget !== 0 && Number.isFinite(draftBand) && draftBand >= 0 && draftBand <= 100 && draft.ownerName.trim().length > 1

  /** What the edited target would do to today's reading — shown before saving. */
  const preview = editing
    ? statusFor({ ...editing, target: draftTarget, watchBandPct: draftBand }, readingByCode[editing.code]?.value ?? NaN)
    : null

  function save() {
    if (!editing || !draftValid) return
    kpis.update(editing.uid, {
      target: draftTarget,
      watchBandPct: draftBand,
      ownerName: draft.ownerName.trim(),
      reviewCycle: draft.reviewCycle.trim() || editing.reviewCycle,
    })
    toast.success(`${editing.code} target set to ${formatMetric(draftTarget, editing.format, editing.unit)}`)
    setEditing(null)
  }

  function toggleActive(k: KpiDefinition) {
    kpis.update(k.uid, { isActive: !k.isActive })
    toast.info(
      k.isActive
        ? `${k.code} retired — dashboards that reference it will show it as unavailable`
        : `${k.code} back in service`,
    )
  }

  const columns: Column<(typeof withStatus)[number]>[] = [
    {
      key: 'code',
      header: 'KPI',
      render: (k) => (
        <div>
          <p className={cn('font-medium', k.isActive ? 'text-fg' : 'text-fg-subtle line-through')}>{k.name}</p>
          <p className="font-mono text-2xs text-fg-subtle">{k.code}</p>
        </div>
      ),
    },
    { key: 'module', header: 'Source', render: (k) => <ModuleChip module={k.module} /> },
    {
      key: 'formula',
      header: 'How it is calculated',
      render: (k) => <p className="max-w-[20rem] text-2xs leading-snug text-fg-muted">{k.formula}</p>,
    },
    {
      key: 'actual',
      header: 'Actual',
      align: 'right',
      render: (k) => (
        <span className="tabular text-xs font-medium text-fg">
          {Number.isFinite(k.actual) ? formatMetric(k.actual, k.format, k.unit) : '—'}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      align: 'right',
      render: (k) => (
        <div className="text-right">
          <p className="tabular text-xs text-fg">{formatMetric(k.target, k.format, k.unit)}</p>
          <p className="text-2xs text-fg-subtle">
            ±{k.watchBandPct}% amber · {k.direction === 'HIGHER_BETTER' ? 'higher better' : 'lower better'}
          </p>
        </div>
      ),
    },
    { key: 'liveStatus', header: 'Status', render: (k) => <StatusBadge status={k.liveStatus} /> },
    {
      key: 'ownerName',
      header: 'Accountable',
      render: (k) => (
        <div>
          <p className="text-xs text-fg">{k.ownerName || <span className="text-danger">Unassigned</span>}</p>
          <p className="text-2xs text-fg-subtle">
            {k.ownerRole} · {k.reviewCycle}
          </p>
        </div>
      ),
    },
    {
      key: 'frequency',
      header: 'Cadence',
      render: (k) => (
        <div>
          <Badge tone="neutral">{k.frequency.charAt(0) + k.frequency.slice(1).toLowerCase()}</Badge>
          {k.sensitivity !== 'OPEN' && (
            <p className="mt-0.5 text-2xs text-fg-subtle">{k.sensitivity === 'FINANCIAL' ? 'Money' : 'People'} data</p>
          )}
        </div>
      ),
    },
  ]

  function doExport(format: 'pdf' | 'xlsx' | 'csv') {
    exportRows(format, 'kpi-library', 'KPI library', [
      { header: 'Code', value: (k: (typeof withStatus)[number]) => k.code },
      { header: 'KPI', value: (k) => k.name },
      { header: 'Module', value: (k) => k.module },
      { header: 'Category', value: (k) => CATEGORY_LABEL[k.category] },
      { header: 'Formula', value: (k) => k.formula },
      { header: 'Target', value: (k) => k.target },
      { header: 'Watch band %', value: (k) => k.watchBandPct },
      { header: 'Actual', value: (k) => (Number.isFinite(k.actual) ? k.actual : '') },
      { header: 'Status', value: (k) => k.liveStatus },
      { header: 'Owner', value: (k) => k.ownerName },
      { header: 'Review', value: (k) => k.reviewCycle },
      { header: 'Active', value: (k) => (k.isActive ? 'Yes' : 'Retired') },
    ], withStatus)
  }

  return (
    <div>
      <PageHeader
        title="KPI library"
        description="Every metric the business reports on, with its formula, its target and the person answerable for it"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'KPI library' }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Defined KPIs" value={String(kpis.rows.length)} icon={<Target size={16} />} tone="brand" />
        <StatTile
          label="Off target now"
          value={String(offTarget.length)}
          sub={offTarget.length ? offTarget.slice(0, 3).map((k) => k.code).join(', ') : 'Nothing outside its band'}
          tone={offTarget.length ? 'danger' : 'success'}
        />
        <StatTile
          label="Without an owner"
          value={String(unowned.length)}
          sub="A metric nobody owns is a metric nobody fixes"
          tone={unowned.length ? 'warning' : 'success'}
        />
        <StatTile label="Retired" value={String(inactive.length)} sub="Kept for history, not shown on dashboards" tone="neutral" />
      </div>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Category"
            sizeVariant="sm"
            containerClassName="w-52"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: 'ALL', label: `All categories (${kpis.rows.length})` },
              ...(Object.keys(CATEGORY_LABEL) as KpiDefinition['category'][]).map((c) => ({
                value: c,
                label: `${CATEGORY_LABEL[c]} (${kpis.rows.filter((k) => k.category === c).length})`,
              })),
            ]}
          />
          <p className="flex-1 text-2xs leading-relaxed text-fg-muted">
            Status is computed against the target as it stands, using the same rule the dashboards use: inside the
            target is green, within the watch band is amber, past the band is red.
          </p>
        </CardBody>
      </Card>

      <DataTable
        rows={withStatus}
        columns={columns}
        rowKey={(k) => k.uid}
        dense
        searchable
        searchPlaceholder="Search by code, name, owner or formula…"
        onExport={doExport}
        emptyTitle="No KPIs in this category"
        rowActions={(k) => (
          <>
            <MenuItem label="Edit target and owner" onClick={() => openEdit(k)} />
            {k.drillTo && <MenuItem label="Verify the number at source" onClick={() => window.location.assign(k.drillTo!)} />}
            <MenuItem
              separatorBefore
              label={k.isActive ? 'Retire this KPI' : 'Put back in service'}
              danger={k.isActive}
              onClick={() => toggleActive(k)}
            />
          </>
        )}
      />

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.code} — ${editing.name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!draftValid}>
              <Pencil size={14} /> Save the target
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div className="rounded border border-border bg-surface-2 px-3 py-2">
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">How it is calculated</p>
              <p className="mt-0.5 text-xs leading-relaxed text-fg">{editing.formula}</p>
              {editing.drillTo && (
                <Link to={editing.drillTo} className="mt-1 inline-block text-2xs font-medium text-brand-600 hover:underline">
                  Check it at source →
                </Link>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={`Target (${editing.unit})`}
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
                inputMode="decimal"
              />
              <Input
                label="Watch band %"
                hint="How far past the target still counts as amber"
                value={draft.watchBandPct}
                onChange={(e) => setDraft({ ...draft, watchBandPct: e.target.value })}
                inputMode="decimal"
              />
              <Input
                label="Accountable person"
                value={draft.ownerName}
                onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })}
              />
              <Input
                label="Review cycle"
                value={draft.reviewCycle}
                onChange={(e) => setDraft({ ...draft, reviewCycle: e.target.value })}
              />
            </div>

            {preview && (
              <div className="rounded border border-border px-3 py-2">
                <p className="mb-1 text-2xs uppercase tracking-wide text-fg-subtle">Effect on today's reading</p>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="tabular text-fg">
                    Actual{' '}
                    {Number.isFinite(readingByCode[editing.code]?.value)
                      ? formatMetric(readingByCode[editing.code].value, editing.format, editing.unit)
                      : 'not available'}
                  </span>
                  <span className="text-fg-subtle">against</span>
                  <span className="tabular text-fg">
                    {Number.isFinite(draftTarget) ? formatMetric(draftTarget, editing.format, editing.unit) : '—'}
                  </span>
                  <StatusBadge status={preview} />
                  {preview !== statusFor(editing, readingByCode[editing.code]?.value ?? NaN) && (
                    <span className="text-2xs text-warning">
                      This changes the status — was{' '}
                      {statusFor(editing, readingByCode[editing.code]?.value ?? NaN).replace('_', ' ').toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            )}

            <Switch
              label="Shown on dashboards"
              checked={editing.isActive}
              onChange={() => {
                toggleActive(editing)
                setEditing({ ...editing, isActive: !editing.isActive })
              }}
            />
          </div>
        )}
      </Modal>

      <SourceNote
        modules={['FINANCE', 'PRODUCTION', 'QUALITY', 'INVENTORY', 'PROCUREMENT', 'DISPATCH', 'MAINTENANCE', 'HRMS']}
        note="Actuals are read from the operational modules on each load. Moving a target changes how the number is judged, never the number itself."
      />
    </div>
  )
}
