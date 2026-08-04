import { useState } from 'react'
import { Activity, CircleStop, Clock, PlayCircle, RefreshCw, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { backgroundJobs } from '@/mock/data2'
import type { BackgroundJob } from '@/types'

/** Scheduled work that runs whether or not anyone is logged in. */
const SCHEDULES = [
  { name: 'Nightly full backup', cron: '0 1 * * *', next: '01:00', owner: 'Platform', critical: true },
  { name: 'Approval SLA escalation sweep', cron: '*/15 * * * *', next: 'in 7 min', owner: 'Workflow', critical: true },
  { name: 'Notification retry queue', cron: '*/5 * * * *', next: 'in 2 min', owner: 'Notification', critical: false },
  { name: 'Outbox dispatcher', cron: '* * * * *', next: 'continuous', owner: 'Platform', critical: true },
  { name: 'Registration expiry check', cron: '0 6 * * *', next: '06:00', owner: 'Compliance', critical: true },
  { name: 'Dormant user report', cron: '0 6 * * 1', next: 'Monday 06:00', owner: 'Security', critical: false },
  { name: 'Exchange rate import', cron: '30 9 * * 1-5', next: '09:30', owner: 'Finance', critical: false },
  { name: 'Session cleanup', cron: '0 * * * *', next: 'in 24 min', owner: 'Platform', critical: false },
  { name: 'Search index refresh', cron: '*/30 * * * *', next: 'in 12 min', owner: 'Platform', critical: false },
]

export function JobsPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'background-jobs', 'Background jobs', columnsFromTable(columns), backgroundJobs)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('running')
  const [detail, setDetail] = useState<BackgroundJob | null>(null)

  const running = backgroundJobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED')
  const failed = backgroundJobs.filter((j) => j.status === 'FAILED')

  const columns: Column<BackgroundJob>[] = [
    {
      key: 'label',
      header: 'Job',
      sortable: true,
      sticky: true,
      width: '260px',
      render: (j) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{j.label}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{j.type}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '120px',
      render: (j) => (
        <Badge
          tone={
            j.status === 'SUCCESS' ? 'success'
              : j.status === 'RUNNING' ? 'progress'
                : j.status === 'QUEUED' ? 'pending'
                  : j.status === 'FAILED' ? 'danger' : 'neutral'
          }
          size="sm"
        >
          {j.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '170px',
      accessor: (j) => j.progressPct,
      render: (j) =>
        j.status === 'RUNNING' ? (
          <ProgressBar value={j.progressPct} showLabel tone="brand" />
        ) : (
          <span className="text-2xs text-fg-subtle">{j.status === 'SUCCESS' ? 'complete' : '—'}</span>
        ),
    },
    { key: 'message', header: 'Message', render: (j) => <span className="truncate text-2xs text-fg-muted">{j.message}</span> },
    { key: 'triggeredBy', header: 'Triggered by', width: '150px' },
    { key: 'startedAt', header: 'Started', sortable: true, width: '140px', render: (j) => <span title={formatDateTime(j.startedAt)}>{formatTimeAgo(j.startedAt)}</span> },
    {
      key: 'durationSec',
      header: 'Duration',
      align: 'right',
      width: '100px',
      accessor: (j) => j.durationSec ?? 0,
      render: (j) =>
        j.durationSec == null ? (
          <span className="text-2xs text-fg-subtle">running</span>
        ) : (
          <span className="tabular">{j.durationSec < 60 ? `${j.durationSec}s` : `${Math.floor(j.durationSec / 60)}m ${j.durationSec % 60}s`}</span>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Background jobs"
        description="Anything that cannot finish inside a request — MRP runs, bulk imports, large exports, month-end — runs here and reports progress back to the user who started it."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & ops' }, { label: 'Background jobs' }]}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => toast.success('Refreshed')}>
            Refresh
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'running', label: 'Job history', count: backgroundJobs.length },
              { id: 'schedules', label: 'Schedules', count: SCHEDULES.length },
              { id: 'workers', label: 'Workers' },
            ]}
          />
        }
      />

      {failed.length > 0 && (
        <Alert
          tone="danger"
          className="mb-4"
          title={`${failed.length} job(s) failed`}
          action={<Button size="sm" variant="outline" icon={<RotateCw className="h-3.5 w-3.5" />} onClick={() => toast.success('Requeued')}>Retry all</Button>}
        >
          A failed job leaves no partial data — each job runs inside its own transaction boundary
          and rolls back cleanly. Retrying is safe.
        </Alert>
      )}

      {tab === 'running' && (
        <DataTable
          rows={backgroundJobs}
          columns={columns}
          rowKey={(j) => j.uid}
          searchPlaceholder="Job type, label or user…"
          onRowClick={setDetail}
          onExport={doExport}
          rowClassName={(j) => (j.status === 'FAILED' ? 'bg-danger/[0.03]' : undefined)}
          rowActions={(j) => (
            <>
              <MenuItem label="View detail" onClick={() => setDetail(j)} />
              <MenuItem label="Download log" onClick={() => toast.info('Download log', `The full execution log for ${j.label} would download.`)} />
              <MenuItem label="Retry" disabled={j.status !== 'FAILED'} onClick={() => toast.success('Requeued')} />
              <MenuItem label="Cancel" danger disabled={j.status !== 'RUNNING' && j.status !== 'QUEUED'} icon={<CircleStop className="h-3.5 w-3.5" />} onClick={() => toast.success('Cancellation requested', `${j.label} will stop and roll back cleanly.`)} />
            </>
          )}
        />
      )}

      {tab === 'schedules' && (
        <Card>
          <CardHeader title="Scheduled jobs" description="Celery beat entries — configuration, not code" />
          <CardBody className="p-0">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th className="w-40">Cron</th>
                  <th className="w-40">Next run</th>
                  <th className="w-32">Owner</th>
                  <th className="w-28">Criticality</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {SCHEDULES.map((s) => (
                  <tr key={s.name}>
                    <td className="font-medium text-fg">{s.name}</td>
                    <td><span className="font-mono text-2xs">{s.cron}</span></td>
                    <td className="text-fg-muted">{s.next}</td>
                    <td><Badge tone="neutral" size="sm" dot={false}>{s.owner}</Badge></td>
                    <td>{s.critical ? <Badge tone="danger" size="sm">Critical</Badge> : <Badge tone="neutral" size="sm">Routine</Badge>}</td>
                    <td>
                      <Button variant="ghost" size="sm" icon={<PlayCircle className="h-3.5 w-3.5" />} onClick={() => toast.success('Job queued', `${s.name} will start within a few seconds.`)}>
                        Run
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {tab === 'workers' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { name: 'worker-default-1', queues: 'default, notification', concurrency: 8, active: 3, uptime: '6 d 14 h', load: 38 },
            { name: 'worker-default-2', queues: 'default, notification', concurrency: 8, active: 2, uptime: '6 d 14 h', load: 25 },
            { name: 'worker-heavy-1', queues: 'reports, imports, mrp', concurrency: 4, active: 4, uptime: '2 d 03 h', load: 100 },
            { name: 'worker-outbox-1', queues: 'outbox', concurrency: 2, active: 1, uptime: '14 d 08 h', load: 50 },
            { name: 'beat', queues: 'scheduler', concurrency: 1, active: 1, uptime: '14 d 08 h', load: 4 },
          ].map((w) => (
            <Card key={w.name}>
              <CardHeader
                title={<span className="font-mono text-xs">{w.name}</span>}
                actions={<Badge tone={w.load >= 100 ? 'warning' : 'success'} size="sm">{w.load >= 100 ? 'Saturated' : 'Healthy'}</Badge>}
              />
              <CardBody className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Queues</span>
                  <span className="truncate font-mono text-2xs text-fg">{w.queues}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Slots</span>
                  <span className="text-fg tabular">{w.active} / {w.concurrency}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-fg-muted">Uptime</span>
                  <span className="text-fg">{w.uptime}</span>
                </div>
                <ProgressBar value={w.load} tone={w.load >= 100 ? 'warning' : 'success'} showLabel />
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.label} description={detail?.type} width="max-w-lg">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={detail.status === 'SUCCESS' ? 'success' : detail.status === 'FAILED' ? 'danger' : 'progress'}>
                {detail.status.toLowerCase()}
              </Badge>
              <span className="text-xs text-fg-muted">started {formatDateTime(detail.startedAt)}</span>
            </div>

            {detail.status === 'RUNNING' && <ProgressBar value={detail.progressPct} showLabel tone="brand" />}

            <div className="rounded border border-border p-3">
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Message</p>
              <p className="mt-0.5 text-sm text-fg">{detail.message}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Triggered by', detail.triggeredBy],
                ['Duration', detail.durationSec == null ? 'running' : `${detail.durationSec}s`],
                ['Job uid', detail.uid],
                ['Queue', detail.type.includes('REPORT') || detail.type.includes('IMPORT') ? 'heavy' : 'default'],
              ].map(([l, v]) => (
                <div key={l} className="rounded border border-border p-2.5">
                  <p className="text-2xs uppercase tracking-wide text-fg-subtle">{l}</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-fg">{v}</p>
                </div>
              ))}
            </div>

            {detail.status === 'FAILED' && (
              <Alert tone="danger" title="This job did not complete">
                No partial changes were committed. Fix the underlying cause and retry — the job is
                idempotent and can be re-run against the same inputs safely.
              </Alert>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
