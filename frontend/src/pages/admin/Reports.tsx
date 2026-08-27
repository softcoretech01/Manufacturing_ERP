import { useMemo, useState } from 'react'
import { CalendarClock, FileSpreadsheet, FileText, Play, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { reportDefinitions } from '@/mock/data2'
import type { ReportDefinition } from '@/types'

const VARIANT_TONE: Record<ReportDefinition['variant'], 'brand' | 'progress' | 'pending' | 'warning' | 'danger' | 'neutral' | 'success'> = {
  SUMMARY: 'brand',
  DETAIL: 'progress',
  PENDING: 'pending',
  AGEING: 'warning',
  EXCEPTION: 'danger',
  MIS: 'success',
  PIVOT: 'neutral',
}

export function ReportsPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'report-engine', 'Report engine', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('catalogue')
  const [module, setModule] = useState('')
  const [run, setRun] = useState<ReportDefinition | null>(null)
  const [schedule, setSchedule] = useState<ReportDefinition | null>(null)
  const [opts, setOpts] = useState({ stampExport: true, logExport: true, includeTotals: true, emailResult: false, skipEmpty: true })

  const modules = useMemo(() => [...new Set(reportDefinitions.map((r) => r.module))].sort(), [])
  const rows = reportDefinitions.filter((r) => !module || r.module === module)
  const scheduled = reportDefinitions.filter((r) => r.isScheduled)
  const exceptions = reportDefinitions.filter((r) => r.variant === 'EXCEPTION')

  const columns: Column<ReportDefinition>[] = [
    {
      key: 'name',
      header: 'Report',
      sortable: true,
      sticky: true,
      width: '260px',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{r.name}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{r.code}</p>
        </div>
      ),
    },
    { key: 'module', header: 'Module', sortable: true, width: '130px', render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.module}</Badge> },
    { key: 'variant', header: 'Type', sortable: true, width: '120px', render: (r) => <Badge tone={VARIANT_TONE[r.variant]} size="sm" dot={false}>{r.variant.toLowerCase()}</Badge> },
    { key: 'description', header: 'What it shows', render: (r) => <span className="text-xs text-fg-muted">{r.description}</span> },
    {
      key: 'isScheduled',
      header: 'Schedule',
      width: '120px',
      accessor: (r) => (r.isScheduled ? 1 : 0),
      render: (r) => (r.isScheduled ? <Badge tone="success" size="sm">Scheduled</Badge> : <span className="text-2xs text-fg-subtle">On demand</span>),
    },
    { key: 'lastRunAt', header: 'Last run', sortable: true, width: '140px', render: (r) => (r.lastRunAt ? <span title={formatDateTime(r.lastRunAt)}>{formatTimeAgo(r.lastRunAt)}</span> : <span className="text-fg-subtle">never</span>) },
    {
      key: 'actions',
      header: '',
      width: '80px',
      align: 'right',
      render: (r) => (
        <Button variant="ghost" size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={(e) => { e.stopPropagation(); setRun(r) }}>
          Run
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Report engine"
        description="Reports are definitions, not screens. Every report inherits the same parameter panel, the same export formats and the same row-level security as the data it reads."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Platform services' }, { label: 'Report engine' }]}
        actions={
          <Button variant="outline" size="sm" icon={<Table2 className="h-4 w-4" />} onClick={() => toast.info('Ad-hoc builder', 'Pick a subject area, drag fields, save as a personal or shared view.')}>
            Ad-hoc report
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'catalogue', label: 'Catalogue', count: reportDefinitions.length },
              { id: 'scheduled', label: 'Scheduled', count: scheduled.length },
              { id: 'exports', label: 'Export & delivery' },
            ]}
          />
        }
      />

      {tab === 'catalogue' && (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.uid}
          searchPlaceholder="Report name, code or description…"
          pageSize={20}
          onExport={doExport}
          onRowClick={setRun}
          toolbar={
            <Select
              sizeVariant="sm"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              options={[{ value: '', label: 'All modules' }, ...modules.map((m) => ({ value: m, label: m }))]}
            />
          }
          filterChips={module ? [{ key: 'm', label: 'Module', value: module, onRemove: () => setModule('') }] : []}
          onClearFilters={() => setModule('')}
          rowActions={(r) => (
            <>
              <MenuItem label="Run now" onClick={() => setRun(r)} />
              <MenuItem label="Schedule" onClick={() => setSchedule(r)} />
              <MenuItem label="Save as my view" onClick={() => toast.info('Save as my view', `Save the current parameters of ${r.name} as a personal saved view.`)} />
              <MenuItem label="Export to Excel" onClick={() => toast.success('Export queued')} />
              <MenuItem label="Export to PDF" onClick={() => toast.success('Export queued')} />
            </>
          )}
        />
      )}

      {tab === 'scheduled' && (
        <div className="space-y-4">
          <Alert tone="info" title="Scheduled runs respect the recipient's permissions">
            A report is generated in the security context of each recipient, not the person who set
            up the schedule. Two people on the same distribution list can receive different rows —
            that is correct, and it is why one shared PDF is never emailed to everybody.
          </Alert>
          <div className="grid gap-3 md:grid-cols-2">
            {scheduled.map((r) => (
              <Card key={r.uid}>
                <CardHeader
                  title={r.name}
                  description={r.description}
                  actions={<Badge tone="success" size="sm">Active</Badge>}
                />
                <CardBody className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Frequency</span>
                    <span className="text-fg">Daily at 06:00 IST</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Format</span>
                    <span className="text-fg">Excel + PDF</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Last run</span>
                    <span className="text-fg">{r.lastRunAt ? formatTimeAgo(r.lastRunAt) : '—'}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setSchedule(r)}>Edit schedule</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRun(r)}>Run now</Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'exports' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Export formats" description="Available on every report and every list screen" />
            <CardBody className="space-y-3">
              {[
                { icon: FileSpreadsheet, name: 'Excel (.xlsx)', detail: 'Typed cells — numbers stay numbers, dates stay dates. Filters and column widths preserved.' },
                { icon: FileText, name: 'PDF', detail: 'Server-rendered with the company letterhead, page numbers, filter summary and the generating user stamped in the footer.' },
                { icon: Table2, name: 'CSV', detail: 'UTF-8 with BOM so Excel opens Indian names correctly. No formatting, one row per record.' },
              ].map((f) => (
                <div key={f.name} className="flex items-start gap-2.5 rounded border border-border p-3">
                  <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
                  <div>
                    <p className="text-sm font-medium text-fg">{f.name}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">{f.detail}</p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Large export handling" />
            <CardBody className="space-y-3.5">
              <Input label="Synchronous row limit" type="number" defaultValue={5000} hint="Above this the export runs as a background job and the user is notified when it is ready." />
              <Input label="Maximum export rows" type="number" defaultValue={500000} hint="Hard ceiling. Beyond this the user is asked to narrow the filter." />
              <Switch checked={opts.stampExport} onChange={(v) => setOpts((o) => ({ ...o, stampExport: v }))} label="Stamp every export with user, timestamp and applied filters" />
              <Switch checked={opts.logExport} onChange={(v) => setOpts((o) => ({ ...o, logExport: v }))} label="Log every export to the audit trail" />
              <Alert tone="warning" title="Exports are a data-loss vector">
                An export removes data from the system's access controls. Every export is therefore
                logged with who took it, what filters were applied and how many rows left — the same
                scrutiny a report screen gets.
              </Alert>
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={!!run}
        onClose={() => setRun(null)}
        size="lg"
        title={run?.name}
        description={run?.description}
        footer={
          <>
            <Button variant="outline" onClick={() => setRun(null)}>Cancel</Button>
            <Button variant="outline" onClick={() => { toast.success('Export queued'); setRun(null) }}>Export Excel</Button>
            <Button variant="primary" icon={<Play className="h-4 w-4" />} onClick={() => { toast.success('Report running', 'You will be notified when it is ready.'); setRun(null) }}>
              Run report
            </Button>
          </>
        }
      >
        {run && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3.5">
              <p className="field-label">Period</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="From" type="date" />
                <Input label="To" type="date" />
              </div>
              <Select label="Company" options={[{ value: 'cmp-01', label: 'SSB Industries Pvt Ltd' }, { value: 'cmp-02', label: 'SSB Exports LLP' }]} />
              <Select label="Branch" options={[{ value: '', label: 'All branches in my scope' }, { value: 'HO', label: 'Head Office' }, { value: 'CHN', label: 'Chennai' }]} />
              <Select label="Plant" options={[{ value: '', label: 'All plants in my scope' }, { value: 'P1', label: 'Plant 1' }, { value: 'P2', label: 'Plant 2' }]} />
            </div>
            <div className="space-y-3.5">
              <Select label="Output format" defaultValue="SCREEN" options={[{ value: 'SCREEN', label: 'On screen' }, { value: 'XLSX', label: 'Excel' }, { value: 'PDF', label: 'PDF' }, { value: 'CSV', label: 'CSV' }]} />
              <Select label="Group by" options={[{ value: '', label: 'No grouping' }, { value: 'MODULE', label: 'Module' }, { value: 'USER', label: 'User' }, { value: 'DATE', label: 'Date' }]} />
              <Switch checked={opts.includeTotals} onChange={(v) => setOpts((o) => ({ ...o, includeTotals: v }))} label="Include summary totals" />
              <Switch checked={opts.emailResult} onChange={(v) => setOpts((o) => ({ ...o, emailResult: v }))} label="Email me the result instead of showing it" />
              <Alert tone="info">
                Results are limited to the companies, branches, plants and warehouses in your data
                scope. That filtering happens in the query, not in the UI.
              </Alert>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!schedule}
        onClose={() => setSchedule(null)}
        title="Schedule report"
        description={schedule?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setSchedule(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Schedule saved'); setSchedule(null) }}>Save schedule</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select label="Frequency" defaultValue="DAILY" options={[{ value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }, { value: 'PERIOD_CLOSE', label: 'On period close' }]} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Time" type="time" defaultValue="06:00" />
            <Select label="Timezone" defaultValue="IST" options={[{ value: 'IST', label: 'Asia/Kolkata (IST)' }, { value: 'UTC', label: 'UTC' }]} />
          </div>
          <Select label="Recipients" options={[{ value: 'ROLE', label: 'Everyone holding a role' }, { value: 'USER', label: 'Named users' }, { value: 'DEPT', label: 'Department' }]} />
          <Select label="Format" defaultValue="XLSX" options={[{ value: 'XLSX', label: 'Excel' }, { value: 'PDF', label: 'PDF' }, { value: 'BOTH', label: 'Excel and PDF' }]} />
          <Switch checked={opts.skipEmpty} onChange={(v) => setOpts((o) => ({ ...o, skipEmpty: v }))} label="Skip the send when the report returns no rows" />
        </div>
      </Modal>
    </div>
  )
}
