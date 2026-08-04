import { useMemo, useState } from 'react'
import { AlertTriangle, Database, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ModuleChip, SourceNote } from '@/components/bi/BiShell'
import { dataSources as seedSources } from '@/mock/bi'
import { useCollection } from '@/store/data'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { DataSource } from '@/types/bi'

/**
 * Data source health.
 *
 * This is the screen that decides whether anything else in this portal can be
 * trusted. A dashboard built on a feed that failed four hours ago is worse than
 * no dashboard, because it looks fine — so freshness is computed against the
 * feed's own expected interval rather than reported as a flag somebody set.
 */

const MODE_MINUTES: Record<DataSource['refreshMode'], number> = {
  REAL_TIME: 5,
  EVERY_15_MIN: 15,
  HOURLY: 60,
  NIGHTLY: 24 * 60,
}

const MODE_LABEL: Record<DataSource['refreshMode'], string> = {
  REAL_TIME: 'Real time',
  EVERY_15_MIN: 'Every 15 minutes',
  HOURLY: 'Hourly',
  NIGHTLY: 'Nightly',
}

/** How late the feed is against its own promise, in minutes. */
function lateness(s: DataSource, now: number) {
  const last = new Date(s.lastRefreshedAt).getTime()
  if (!Number.isFinite(last)) return null
  const elapsed = (now - last) / 60_000
  // Allow one interval's grace before calling a feed late.
  return Math.round(elapsed - MODE_MINUTES[s.refreshMode] * 2)
}

function describeAge(minutes: number) {
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} h`
  return `${(minutes / 1440).toFixed(1)} days`
}

export function BiDataSourcesPage() {
  const toast = useToast()
  const sources = useCollection<DataSource>('bi.dataSources', seedSources)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const now = Date.now()
  const rows = useMemo(
    () =>
      sources.rows.map((s) => {
        const late = lateness(s, now)
        const ageMinutes = (now - new Date(s.lastRefreshedAt).getTime()) / 60_000
        return { ...s, late, ageMinutes, isLate: late !== null && late > 0 }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources.rows],
  )

  const failed = rows.filter((s) => s.status === 'FAILED')
  const degraded = rows.filter((s) => s.status === 'DEGRADED' || s.status === 'STALE')
  const healthy = rows.filter((s) => s.status === 'HEALTHY')
  const rejected = rows.reduce((sum, s) => sum + s.rejectedRows, 0)

  /**
   * A refresh is honest: a feed whose upstream module does not exist fails again
   * with the same error rather than turning green because somebody pressed a
   * button.
   */
  function refresh(s: DataSource) {
    setRefreshing(s.uid)
    window.setTimeout(() => {
      setRefreshing(null)
      if (s.lastError && s.status === 'FAILED') {
        sources.update(s.uid, { lastRefreshedAt: new Date().toISOString() })
        toast.error(`${s.name} failed again — ${s.lastError}`)
        return
      }
      sources.update(s.uid, {
        lastRefreshedAt: new Date().toISOString(),
        status: 'HEALTHY',
        lastError: null,
        rejectedRows: 0,
      })
      toast.success(`${s.name} reloaded — ${s.rowCount.toLocaleString('en-IN')} rows`)
    }, 500)
  }

  function refreshAll() {
    const runnable = rows.filter((s) => s.status !== 'FAILED')
    runnable.forEach((s) =>
      sources.update(s.uid, { lastRefreshedAt: new Date().toISOString(), status: 'HEALTHY', rejectedRows: 0 }),
    )
    toast.success(
      failed.length
        ? `${runnable.length} feeds reloaded. ${failed.length} still failing and cannot be fixed from here.`
        : `${runnable.length} feeds reloaded`,
    )
  }

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'name',
      header: 'Feed',
      render: (s) => (
        <div>
          <p className="text-xs font-medium text-fg">{s.name}</p>
          <p className="font-mono text-2xs text-fg-subtle">
            {s.code} · {s.entity}
          </p>
        </div>
      ),
    },
    { key: 'module', header: 'Module', render: (s) => <ModuleChip module={s.module} /> },
    {
      key: 'refreshMode',
      header: 'Cadence',
      render: (s) => <span className="text-2xs text-fg-muted">{MODE_LABEL[s.refreshMode]}</span>,
    },
    {
      key: 'lastRefreshedAt',
      header: 'Freshness',
      render: (s) => (
        <div>
          <p className={cn('text-xs', s.isLate ? 'font-medium text-danger' : 'text-fg')}>
            {describeAge(s.ageMinutes)} old
          </p>
          <p className="text-2xs text-fg-subtle">
            {s.isLate ? `${describeAge(s.late!)} past its interval` : `Loaded ${formatDateTime(s.lastRefreshedAt)}`}
          </p>
        </div>
      ),
    },
    {
      key: 'rowCount',
      header: 'Rows',
      align: 'right',
      render: (s) => (
        <div className="text-right">
          <p className="tabular text-xs text-fg">{s.rowCount.toLocaleString('en-IN')}</p>
          <p className={cn('text-2xs', s.rejectedRows > 0 ? 'text-warning' : 'text-fg-subtle')}>
            {s.rejectedRows > 0 ? `${s.rejectedRows} rejected` : 'none rejected'}
          </p>
        </div>
      ),
    },
    {
      key: 'completenessPct',
      header: 'Completeness',
      render: (s) => (
        <div className="min-w-[7rem]">
          <div className="mb-0.5 flex items-center justify-between text-2xs">
            <span className="tabular text-fg">{s.completenessPct.toFixed(1)}%</span>
            <span className="text-fg-subtle">{s.lastRefreshDurationSeconds}s load</span>
          </div>
          <ProgressBar
            value={s.completenessPct}
            tone={s.completenessPct >= 98 ? 'success' : s.completenessPct >= 90 ? 'warning' : 'danger'}
          />
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <div>
          <Badge
            tone={
              s.status === 'HEALTHY'
                ? 'success'
                : s.status === 'STALE'
                  ? 'warning'
                  : s.status === 'DEGRADED'
                    ? 'warning'
                    : 'danger'
            }
          >
            {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
          </Badge>
          {s.lastError && <p className="mt-0.5 max-w-[18rem] text-2xs leading-snug text-danger">{s.lastError}</p>}
        </div>
      ),
    },
    {
      key: 'nextRefreshAt',
      header: '',
      render: (s) => (
        <Button size="xs" variant="ghost" disabled={refreshing === s.uid} onClick={() => refresh(s)}>
          <RefreshCw size={12} className={refreshing === s.uid ? 'animate-spin' : undefined} />
          {refreshing === s.uid ? 'Loading' : 'Reload'}
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Data sources"
        description="Where every figure in this portal comes from, and whether the feed behind it is current"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Data sources' }]}
        actions={
          <Button variant="secondary" onClick={refreshAll}>
            <RefreshCw size={14} /> Reload everything
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Healthy feeds" value={`${healthy.length} / ${rows.length}`} icon={<Database size={16} />} tone={healthy.length === rows.length ? 'success' : 'brand'} />
        <StatTile
          label="Failed"
          value={String(failed.length)}
          sub={failed.length ? failed.map((f) => f.code).join(', ') : 'Nothing failing'}
          icon={<AlertTriangle size={16} />}
          tone={failed.length ? 'danger' : 'success'}
        />
        <StatTile
          label="Stale or degraded"
          value={String(degraded.length)}
          sub={degraded.length ? 'Figures from these feeds are behind' : 'Everything current'}
          tone={degraded.length ? 'warning' : 'success'}
        />
        <StatTile
          label="Rows rejected"
          value={rejected.toLocaleString('en-IN')}
          sub="A rising count means an upstream field changed shape"
          tone={rejected > 0 ? 'warning' : 'success'}
        />
      </div>

      {failed.length > 0 && (
        <Card className="mb-4 border-danger/40">
          <CardHeader title="These feeds are not delivering" description="Anything downstream of them is incomplete, and the screens say so" />
          <CardBody className="space-y-2">
            {failed.map((f) => (
              <div key={f.uid} className="rounded border border-danger/30 bg-danger/[0.03] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ModuleChip module={f.module} />
                  <span className="text-xs font-medium text-fg">{f.name}</span>
                  <span className="ml-auto text-2xs text-fg-subtle">
                    last succeeded {formatDateTime(f.lastRefreshedAt)}
                  </span>
                </div>
                <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{f.lastError}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(s) => s.uid}
        dense
        searchable
        searchPlaceholder="Search feeds by name, code or entity…"
        emptyTitle="No feeds configured"
        rowActions={(s) => (
          <>
            <MenuItem label="Reload this feed" onClick={() => refresh(s)} />
            <MenuItem
              label="Mark as stale"
              disabled={s.status === 'FAILED'}
              onClick={() => {
                sources.update(s.uid, { status: 'STALE' })
                toast.info(`${s.name} flagged as stale — dashboards using it will show the warning`)
              }}
            />
          </>
        )}
      />

      <Card className="mt-4">
        <CardBody className="text-2xs leading-relaxed text-fg-muted">
          <span className="font-medium text-fg">How freshness is judged.</span> A feed is late when it has gone more
          than twice its own interval without loading — one interval of grace, so a job that runs a few minutes behind
          does not turn the board red. Reloading a feed whose upstream module does not exist fails again with the same
          error, on purpose: a green light that was pressed rather than earned is the exact failure this screen exists
          to prevent.
        </CardBody>
      </Card>

      <SourceNote
        modules={['FINANCE', 'PRODUCTION', 'QUALITY', 'INVENTORY', 'PROCUREMENT', 'DISPATCH', 'MAINTENANCE', 'HRMS', 'PLANNING', 'SALES']}
        note="Feeds read the operational tables. Where a module has not been built, the feed is listed as failed rather than omitted, so the gap is visible."
      />
    </div>
  )
}
