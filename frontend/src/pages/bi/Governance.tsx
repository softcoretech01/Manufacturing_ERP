import { useMemo, useState } from 'react'
import { Download, Eye, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Select, Switch } from '@/components/ui/Input'
import { PageHeader, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { SourceNote } from '@/components/bi/BiShell'
import { accessLog as seedLog, dashboardAccess as seedAccess } from '@/mock/bi'
import { useCollection } from '@/store/data'
import { exportRows } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { AccessLogEntry, DashboardAccess } from '@/types/bi'

/**
 * Analytics governance — who may see which dashboard, at what row scope, with
 * which fields blanked; and a log of what was actually looked at.
 *
 * The access log is append-only by design. Rows can be filtered and exported but
 * never edited or removed from this screen, because a log somebody can tidy up
 * is not evidence of anything.
 */

const SCOPE_LABEL: Record<DashboardAccess['rowScope'], string> = {
  ALL: 'Every row in the company',
  OWN_PLANT: 'Their own plant only',
  OWN_DEPARTMENT: 'Their own department',
  OWN_TEAM: 'Their own team',
  SELF: 'Their own records only',
}

const ACTION_TONE: Record<AccessLogEntry['action'], string> = {
  VIEWED: 'neutral',
  EXPORTED: 'warning',
  DRILLED: 'brand',
  SCHEDULED: 'brand',
  CHANGED: 'warning',
  SHARED: 'danger',
}

export function BiGovernancePage() {
  const toast = useToast()
  const [tab, setTab] = useState('access')
  const [sensitivity, setSensitivity] = useState('ALL')
  const [action, setAction] = useState('ALL')
  const [exportsOnly, setExportsOnly] = useState(false)

  const access = useCollection<DashboardAccess>('bi.dashboardAccess', seedAccess)
  const log = useCollection<AccessLogEntry>('bi.accessLog', seedLog)

  const logRows = useMemo(
    () =>
      log.rows
        .filter((e) => sensitivity === 'ALL' || e.sensitivity === sensitivity)
        .filter((e) => action === 'ALL' || e.action === action)
        .filter((e) => !exportsOnly || e.action === 'EXPORTED' || e.action === 'SHARED')
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [log.rows, sensitivity, action, exportsOnly],
  )

  const sensitiveExports = log.rows.filter(
    (e) => (e.action === 'EXPORTED' || e.action === 'SHARED') && e.sensitivity !== 'OPEN',
  )
  const rowsTaken = sensitiveExports.reduce((s, e) => s + (e.rowsTouched ?? 0), 0)
  const unrestricted = access.rows.filter((a) => a.rowScope === 'ALL')
  const canExportSensitive = access.rows.filter((a) => a.canExport && a.maskedFields.length === 0)

  const accessColumns: Column<DashboardAccess>[] = [
    {
      key: 'role',
      header: 'Role',
      render: (a) => <p className="text-xs font-medium text-fg">{a.role}</p>,
    },
    {
      key: 'dashboardName',
      header: 'Dashboard',
      render: (a) => (
        <div>
          <p className="text-xs text-fg">{a.dashboardName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{a.dashboardCode}</p>
        </div>
      ),
    },
    {
      key: 'rowScope',
      header: 'Which rows',
      render: (a) => (
        <div>
          <Badge tone={a.rowScope === 'ALL' ? 'warning' : 'neutral'}>{a.rowScope.replace(/_/g, ' ').toLowerCase()}</Badge>
          <p className="mt-0.5 text-2xs text-fg-subtle">{SCOPE_LABEL[a.rowScope]}</p>
        </div>
      ),
    },
    {
      key: 'maskedFields',
      header: 'Fields blanked',
      render: (a) =>
        a.maskedFields.length ? (
          <p className="max-w-[16rem] font-mono text-2xs leading-snug text-fg-muted">{a.maskedFields.join(', ')}</p>
        ) : (
          <span className="text-2xs text-fg-subtle">Nothing blanked</span>
        ),
    },
    {
      key: 'canDrillToTransaction',
      header: 'May they',
      render: (a) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={a.canDrillToTransaction ? 'success' : 'neutral'}>
            {a.canDrillToTransaction ? 'Drill to transactions' : 'Summary only'}
          </Badge>
          <Badge tone={a.canExport ? 'warning' : 'neutral'}>{a.canExport ? 'Export' : 'No export'}</Badge>
          <Badge tone={a.canSchedule ? 'brand' : 'neutral'}>{a.canSchedule ? 'Schedule' : 'No schedule'}</Badge>
        </div>
      ),
    },
    {
      key: 'grantedBy',
      header: 'Granted',
      render: (a) => (
        <div>
          <p className="text-2xs text-fg">{a.grantedBy}</p>
          <p className="text-2xs text-fg-subtle">{a.grantedOn}</p>
        </div>
      ),
    },
  ]

  const logColumns: Column<AccessLogEntry>[] = [
    { key: 'at', header: 'When', render: (e) => <span className="text-xs text-fg">{formatDateTime(e.at)}</span> },
    {
      key: 'user',
      header: 'Who',
      render: (e) => (
        <div>
          <p className="text-xs text-fg">{e.user}</p>
          <p className="text-2xs text-fg-subtle">{e.role}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Did what',
      render: (e) => (
        <Badge tone={ACTION_TONE[e.action] as 'neutral' | 'warning' | 'brand' | 'danger'}>
          {e.action.charAt(0) + e.action.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'objectName',
      header: 'To what',
      render: (e) => (
        <div>
          <p className="text-xs text-fg">{e.objectName}</p>
          <p className="text-2xs text-fg-subtle">{e.objectType.toLowerCase()}</p>
        </div>
      ),
    },
    {
      key: 'sensitivity',
      header: 'Sensitivity',
      render: (e) => (
        <Badge tone={e.sensitivity === 'OPEN' ? 'neutral' : e.sensitivity === 'FINANCIAL' ? 'warning' : 'danger'}>
          {e.sensitivity === 'OPEN' ? 'Open' : e.sensitivity === 'FINANCIAL' ? 'Financial' : 'People'}
        </Badge>
      ),
    },
    {
      key: 'rowsTouched',
      header: 'Rows',
      align: 'right',
      render: (e) => (
        <span className={cn('tabular text-xs', (e.rowsTouched ?? 0) > 1000 ? 'font-medium text-warning' : 'text-fg')}>
          {e.rowsTouched === null ? '—' : e.rowsTouched.toLocaleString('en-IN')}
        </span>
      ),
    },
    { key: 'ipAddress', header: 'From', render: (e) => <span className="font-mono text-2xs text-fg-subtle">{e.ipAddress}</span> },
    {
      key: 'note',
      header: 'Note',
      render: (e) => (e.note ? <p className="max-w-[18rem] text-2xs leading-snug text-fg-muted">{e.note}</p> : null),
    },
  ]

  function exportLog(format: 'pdf' | 'xlsx' | 'csv') {
    exportRows(
      format,
      'analytics-access-log',
      'Analytics access log',
      [
        { header: 'When', value: (e: AccessLogEntry) => e.at },
        { header: 'User', value: (e) => e.user },
        { header: 'Role', value: (e) => e.role },
        { header: 'Action', value: (e) => e.action },
        { header: 'Object', value: (e) => e.objectName },
        { header: 'Type', value: (e) => e.objectType },
        { header: 'Sensitivity', value: (e) => e.sensitivity },
        { header: 'Rows', value: (e) => e.rowsTouched ?? '' },
        { header: 'IP', value: (e) => e.ipAddress },
        { header: 'Note', value: (e) => e.note ?? '' },
      ],
      logRows,
    )
    toast.info('Exporting the access log is itself a logged action')
  }

  return (
    <div>
      <PageHeader
        title="Governance & access"
        description="Who may see which dashboard, how much of it, and a record of what was actually looked at"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Governance' }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Access grants" value={String(access.rows.length)} icon={<ShieldCheck size={16} />} tone="brand" />
        <StatTile
          label="Company-wide scope"
          value={String(unrestricted.length)}
          sub="Roles that see every plant and every row"
          tone={unrestricted.length > 3 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Sensitive exports"
          value={String(sensitiveExports.length)}
          sub={`${rowsTaken.toLocaleString('en-IN')} rows of money or people data left the system`}
          icon={<Download size={16} />}
          tone={sensitiveExports.length ? 'warning' : 'success'}
        />
        <StatTile
          label="Export with nothing masked"
          value={String(canExportSensitive.length)}
          sub="Grants that can take a full, unmasked copy"
          icon={<Eye size={16} />}
          tone={canExportSensitive.length > 2 ? 'warning' : 'neutral'}
        />
      </div>

      <Tabs
        variant="pill"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'access', label: 'Who can see what', count: access.rows.length },
          { id: 'log', label: 'Access log', count: log.rows.length },
        ]}
      />

      {tab === 'access' && (
        <div className="mt-4">
          <Card className="mb-4">
            <CardBody className="text-2xs leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">Three separate controls.</span> Whether a role may open the
              dashboard at all; which rows it sees inside it; and which fields are blanked even within those rows. A
              supervisor can see their line's OEE without seeing anybody's pay, and that is three decisions, not one.
            </CardBody>
          </Card>

          <DataTable
            rows={access.rows}
            columns={accessColumns}
            rowKey={(a) => a.uid}
            dense
            searchable
            searchPlaceholder="Search by role or dashboard…"
            emptyTitle="No access grants"
            rowActions={(a) => (
              <>
                <MenuItem
                  label={a.canExport ? 'Withdraw export rights' : 'Allow export'}
                  onClick={() => {
                    access.update(a.uid, { canExport: !a.canExport })
                    toast.info(
                      a.canExport
                        ? `${a.role} can no longer export ${a.dashboardName}`
                        : `${a.role} may now export ${a.dashboardName}`,
                    )
                  }}
                />
                <MenuItem
                  label={a.canDrillToTransaction ? 'Restrict to summary' : 'Allow drill to transactions'}
                  onClick={() => {
                    access.update(a.uid, { canDrillToTransaction: !a.canDrillToTransaction })
                    toast.info(`${a.role} · ${a.dashboardName} updated`)
                  }}
                />
                <MenuItem
                  separatorBefore
                  danger
                  label="Revoke this grant"
                  onClick={() => {
                    access.remove(a.uid)
                    toast.info(`${a.role} no longer has ${a.dashboardName}`)
                  }}
                />
              </>
            )}
          />
        </div>
      )}

      {tab === 'log' && (
        <div className="mt-4">
          <Card className="mb-4">
            <CardBody className="flex flex-wrap items-end gap-3">
              <Select
                label="Sensitivity"
                sizeVariant="sm"
                containerClassName="w-44"
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value)}
                options={[
                  { value: 'ALL', label: 'All data' },
                  { value: 'OPEN', label: 'Open' },
                  { value: 'FINANCIAL', label: 'Financial' },
                  { value: 'PEOPLE', label: 'People' },
                ]}
              />
              <Select
                label="Action"
                sizeVariant="sm"
                containerClassName="w-44"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                options={[
                  { value: 'ALL', label: 'Every action' },
                  ...(['VIEWED', 'EXPORTED', 'DRILLED', 'SCHEDULED', 'CHANGED', 'SHARED'] as const).map((a) => ({
                    value: a,
                    label: a.charAt(0) + a.slice(1).toLowerCase(),
                  })),
                ]}
              />
              <Switch
                label="Only data that left the system"
                checked={exportsOnly}
                onChange={() => setExportsOnly(!exportsOnly)}
              />
              <p className="flex-1 text-2xs leading-relaxed text-fg-muted">
                Exports and shares are the entries an auditor reads first, because they are the only actions that put
                company data somewhere this system no longer controls.
              </p>
            </CardBody>
          </Card>

          <DataTable
            rows={logRows}
            columns={logColumns}
            rowKey={(e) => e.uid}
            dense
            searchable
            searchPlaceholder="Search the log by user, object or note…"
            onExport={exportLog}
            emptyTitle="Nothing matches"
            emptyDescription="No log entry matches the filters above."
          />

          <Card className="mt-4">
            <CardBody className="text-2xs leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">This log cannot be edited.</span> There is no edit or delete action
              on these rows and there deliberately never will be — an audit trail somebody can tidy up proves nothing.
              Exporting it is itself recorded.
            </CardBody>
          </Card>
        </div>
      )}

      <SourceNote
        modules={['FINANCE', 'PRODUCTION', 'QUALITY', 'INVENTORY', 'DISPATCH', 'HRMS']}
        note="Grants are enforced server-side in the real system. A dashboard hidden from a menu is a convenience; the row scope and field masking are the actual control."
      />
    </div>
  )
}
