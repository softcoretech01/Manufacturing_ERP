import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, FileText, Lock, Play } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input, Select } from '@/components/ui/Input'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { PageHeader, StatTile } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ModuleChip, SourceNote, useCanSeeFinancial, useCanSeePeople } from '@/components/bi/BiShell'
import { biReports as seedReports } from '@/mock/bi'
import { useCollection } from '@/store/data'
import { exportRows } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { BiReport } from '@/types/bi'

/**
 * The report catalogue.
 *
 * Reports that carry money or people data are not merely hidden here — they are
 * shown as locked with the permission named, because a user who cannot find a
 * report they know exists raises a ticket, while a user who can see it is locked
 * asks the right person for access.
 */

const CATEGORY_LABEL: Record<BiReport['category'], string> = {
  OPERATIONAL: 'Operational',
  MANAGEMENT: 'Management',
  EXECUTIVE: 'Executive',
  STATUTORY: 'Statutory',
  CUSTOMER: 'Customer',
  SUPPLIER: 'Supplier',
}

const TYPE_NOTE: Record<BiReport['reportType'], string> = {
  INTERACTIVE: 'Filter and sort on screen',
  PIVOT: 'Cross-tab with dimensions you choose',
  DRILL_DOWN: 'Summary that opens to the transactions',
  SNAPSHOT: 'Fixed at the moment it was run',
}

export function BiReportsPage() {
  const toast = useToast()
  const canSeeFinancial = useCanSeeFinancial()
  const canSeePeople = useCanSeePeople()
  const reports = useCollection<BiReport>('bi.reports', seedReports)

  const [category, setCategory] = useState('ALL')
  const [scheduling, setScheduling] = useState<BiReport | null>(null)
  const [schedule, setSchedule] = useState({ cron: '', recipients: '' })

  function lockedFor(r: BiReport) {
    if (r.sensitivity === 'FINANCIAL' && !canSeeFinancial) return 'BI.FINANCIAL.VIEW'
    if (r.sensitivity === 'PEOPLE' && !canSeePeople) return 'BI.PEOPLE.VIEW'
    return null
  }

  const rows = useMemo(
    () =>
      reports.rows
        .filter((r) => category === 'ALL' || r.category === category)
        .map((r) => ({ ...r, lockedBy: lockedFor(r) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports.rows, category, canSeeFinancial, canSeePeople],
  )

  const scheduled = reports.rows.filter((r) => r.schedule)
  const locked = reports.rows.filter((r) => lockedFor(r))
  const neverRun = reports.rows.filter((r) => !r.lastRunAt)

  /** Running a report stamps it, so the catalogue shows what people actually use. */
  function run(r: BiReport & { lockedBy: string | null }) {
    if (r.lockedBy) {
      toast.error(`${r.name} needs ${r.lockedBy}`)
      return
    }
    reports.update(r.uid, { lastRunAt: new Date().toISOString(), runCount: r.runCount + 1 })
    toast.success(`${r.name} generated — available as ${r.formats.join(', ')}`)
  }

  function openSchedule(r: BiReport) {
    setScheduling(r)
    setSchedule({ cron: r.schedule ?? '', recipients: r.recipients.join(', ') })
  }

  const scheduleRecipients = schedule.recipients
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const scheduleValid = schedule.cron.trim().length > 3 && scheduleRecipients.length > 0

  function saveSchedule() {
    if (!scheduling || !scheduleValid) return
    reports.update(scheduling.uid, { schedule: schedule.cron.trim(), recipients: scheduleRecipients })
    toast.success(`${scheduling.name} will be sent ${schedule.cron.trim().toLowerCase()} to ${scheduleRecipients.length} recipients`)
    setScheduling(null)
  }

  function unschedule(r: BiReport) {
    reports.update(r.uid, { schedule: null })
    toast.info(`${r.name} is now run on demand only`)
  }

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'name',
      header: 'Report',
      render: (r) => (
        <div>
          <p className={cn('text-xs font-medium', r.isActive ? 'text-fg' : 'text-fg-subtle line-through')}>{r.name}</p>
          <p className="max-w-[24rem] text-2xs leading-snug text-fg-subtle">{r.description}</p>
        </div>
      ),
    },
    { key: 'module', header: 'Source', render: (r) => <ModuleChip module={r.module} /> },
    {
      key: 'category',
      header: 'Category',
      render: (r) => (
        <div>
          <Badge tone="neutral">{CATEGORY_LABEL[r.category]}</Badge>
          <p className="mt-0.5 text-2xs text-fg-subtle">{TYPE_NOTE[r.reportType]}</p>
        </div>
      ),
    },
    {
      key: 'columns',
      header: 'What it contains',
      render: (r) => (
        <div className="max-w-[20rem]">
          <p className="text-2xs leading-snug text-fg-muted">{r.columns}</p>
          <p className="mt-0.5 text-2xs text-fg-subtle">Filters: {r.filters}</p>
        </div>
      ),
    },
    {
      key: 'schedule',
      header: 'Delivery',
      render: (r) =>
        r.schedule ? (
          <div>
            <Badge tone="brand">{r.schedule}</Badge>
            <p className="max-w-[12rem] truncate text-2xs text-fg-subtle">{r.recipients.join(', ')}</p>
          </div>
        ) : (
          <span className="text-2xs text-fg-subtle">On demand</span>
        ),
    },
    {
      key: 'runCount',
      header: 'Use',
      align: 'right',
      render: (r) => (
        <div className="text-right">
          <p className="tabular text-xs text-fg">{r.runCount} runs</p>
          <p className="text-2xs text-fg-subtle">{r.lastRunAt ? formatDateTime(r.lastRunAt) : 'never run'}</p>
        </div>
      ),
    },
    {
      key: 'sensitivity',
      header: 'Access',
      render: (r) =>
        r.lockedBy ? (
          <div className="flex items-center gap-1.5">
            <Lock size={12} className="text-warning" />
            <span className="font-mono text-2xs text-fg-muted">{r.lockedBy}</span>
          </div>
        ) : (
          <span className="text-2xs text-success">Available to you</span>
        ),
    },
    {
      key: 'formats',
      header: '',
      render: (r) => (
        <Button size="xs" variant="ghost" disabled={!!r.lockedBy || !r.isActive} onClick={() => run(r)}>
          <Play size={12} /> Run
        </Button>
      ),
    },
  ]

  function doExport(format: 'pdf' | 'xlsx' | 'csv') {
    exportRows(
      format,
      'report-catalogue',
      'Report catalogue',
      [
        { header: 'Code', value: (r: (typeof rows)[number]) => r.code },
        { header: 'Report', value: (r) => r.name },
        { header: 'Module', value: (r) => r.module },
        { header: 'Category', value: (r) => CATEGORY_LABEL[r.category] },
        { header: 'Type', value: (r) => r.reportType },
        { header: 'Contents', value: (r) => r.columns },
        { header: 'Schedule', value: (r) => r.schedule ?? 'On demand' },
        { header: 'Recipients', value: (r) => r.recipients.join('; ') },
        { header: 'Runs', value: (r) => r.runCount },
        { header: 'Last run', value: (r) => r.lastRunAt ?? '' },
        { header: 'Sensitivity', value: (r) => r.sensitivity },
      ],
      rows,
    )
  }

  return (
    <div>
      <PageHeader
        title="Report catalogue"
        description="Every standard report, what is in it, who it goes to and when"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Reports' }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Reports" value={String(reports.rows.length)} icon={<FileText size={16} />} tone="brand" />
        <StatTile
          label="On a schedule"
          value={String(scheduled.length)}
          sub="Sent without anybody asking"
          icon={<CalendarClock size={16} />}
          tone="success"
        />
        <StatTile
          label="Locked for you"
          value={String(locked.length)}
          sub={locked.length ? 'Money or people data' : 'You can run every report'}
          icon={<Lock size={16} />}
          tone={locked.length ? 'warning' : 'success'}
        />
        <StatTile
          label="Never run"
          value={String(neverRun.length)}
          sub={neverRun.length ? 'Worth asking whether they are still wanted' : 'Every report gets used'}
          tone="neutral"
        />
      </div>

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Category"
            sizeVariant="sm"
            containerClassName="w-56"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: 'ALL', label: `All categories (${reports.rows.length})` },
              ...(Object.keys(CATEGORY_LABEL) as BiReport['category'][]).map((c) => ({
                value: c,
                label: `${CATEGORY_LABEL[c]} (${reports.rows.filter((r) => r.category === c).length})`,
              })),
            ]}
          />
          <p className="flex-1 text-2xs leading-relaxed text-fg-muted">
            A locked report is still listed, with the permission it needs named. Hiding it would only produce a support
            ticket asking where it went.
          </p>
        </CardBody>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.uid}
        dense
        searchable
        searchPlaceholder="Search reports by name, contents or code…"
        onExport={doExport}
        emptyTitle="No reports in this category"
        rowActions={(r) => (
          <>
            <MenuItem label="Run it now" disabled={!!r.lockedBy || !r.isActive} onClick={() => run(r)} />
            <MenuItem label={r.schedule ? 'Change the schedule' : 'Put it on a schedule'} onClick={() => openSchedule(r)} />
            {r.schedule && <MenuItem label="Stop sending it" onClick={() => unschedule(r)} />}
            <MenuItem
              separatorBefore
              label={r.isActive ? 'Retire this report' : 'Put back in service'}
              danger={r.isActive}
              onClick={() => {
                reports.update(r.uid, { isActive: !r.isActive })
                toast.info(r.isActive ? `${r.name} retired` : `${r.name} back in service`)
              }}
            />
          </>
        )}
      />

      <Card className="mt-4">
        <CardHeader title="Where these come from" description="Each report reads one module and drills back into it" />
        <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows
            .filter((r) => r.drillTo)
            .slice(0, 9)
            .map((r) => (
              <Link
                key={r.uid}
                to={r.drillTo!}
                className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-xs text-fg hover:border-brand-500/50 hover:bg-brand-500/5"
              >
                <span className="truncate">{r.name}</span>
                <span className="ml-2 shrink-0 text-2xs text-brand-600">Open module →</span>
              </Link>
            ))}
        </CardBody>
      </Card>

      <Modal
        open={scheduling !== null}
        onClose={() => setScheduling(null)}
        title={scheduling ? `Schedule ${scheduling.name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduling(null)}>
              Cancel
            </Button>
            <Button onClick={saveSchedule} disabled={!scheduleValid}>
              Save the schedule
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="When should it go?"
            hint="Plain words — Daily 07:00, Weekly Monday 08:00, Monthly 1st 09:00"
            value={schedule.cron}
            onChange={(e) => setSchedule({ ...schedule, cron: e.target.value })}
            placeholder="Daily 07:00"
          />
          <Input
            label="Recipients"
            hint="Comma separated. A schedule with no recipients is just a job that burns CPU."
            value={schedule.recipients}
            onChange={(e) => setSchedule({ ...schedule, recipients: e.target.value })}
          />
          {scheduling && (
            <p className="text-2xs leading-relaxed text-fg-subtle">
              Delivered as {scheduling.formats.join(', ')}.
              {scheduling.sensitivity !== 'OPEN' && (
                <>
                  {' '}
                  This report carries {scheduling.sensitivity === 'FINANCIAL' ? 'financial' : 'people'} data, so every
                  send is written to the access log with the recipients named.
                </>
              )}
            </p>
          )}
        </div>
      </Modal>

      <SourceNote
        modules={['FINANCE', 'PRODUCTION', 'QUALITY', 'INVENTORY', 'PROCUREMENT', 'DISPATCH', 'MAINTENANCE', 'HRMS']}
        note="Reports read the operational tables directly rather than a copy, so a report and the screen it drills into always agree."
      />
    </div>
  )
}
