import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { SIMPLE_MASTERS } from '@/mock/masterRegistry'
import { importRuns } from '@/mock/masters'
import type { ImportRun } from '@/types/masters'

const ALL_MASTERS = [
  { code: 'SUPPLIER', name: 'Supplier' },
  { code: 'CUSTOMER', name: 'Customer' },
  { code: 'ITEM', name: 'Item / Product' },
  { code: 'EMPLOYEE', name: 'Employee' },
  { code: 'MACHINE', name: 'Machine' },
  ...SIMPLE_MASTERS.map((m) => ({ code: m.code, name: m.title })),
]

export function ImportExportPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'master-import-export', 'Master import & export', columnsFromTable(columns), importRuns)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('runs')
  const [detail, setDetail] = useState<ImportRun | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [updateExisting, setUpdateExisting] = useState(false)

  const awaiting = importRuns.filter((r) => r.status === 'DRY_RUN_COMPLETE')
  const committed = importRuns.filter((r) => r.status === 'COMMITTED')

  const columns: Column<ImportRun>[] = [
    { key: 'fileName', header: 'File', sortable: true, sticky: true, width: '270px', render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{r.fileName}</p>
        <p className="truncate text-2xs text-fg-subtle">{r.masterName}</p>
      </div>
    ) },
    { key: 'rowsTotal', header: 'Rows', align: 'right', sortable: true, width: '90px', render: (r) => <span className="tabular">{r.rowsTotal}</span> },
    {
      key: 'breakdown',
      header: 'Validation',
      width: '210px',
      accessor: (r) => r.rowsError,
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.rowsValid > 0 && <Badge tone="success" size="sm" dot={false}>{r.rowsValid} ok</Badge>}
          {r.rowsWarning > 0 && <Badge tone="warning" size="sm" dot={false}>{r.rowsWarning} warn</Badge>}
          {r.rowsError > 0 && <Badge tone="danger" size="sm" dot={false}>{r.rowsError} error</Badge>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '170px',
      render: (r) => (
        <Badge
          tone={
            r.status === 'COMMITTED' ? 'success'
              : r.status === 'FAILED' ? 'danger'
                : r.status === 'CANCELLED' ? 'neutral' : 'pending'
          }
          size="sm"
        >
          {r.status.replace(/_/g, ' ').toLowerCase()}
        </Badge>
      ),
    },
    { key: 'startedBy', header: 'Started by', width: '150px' },
    { key: 'startedAt', header: 'When', sortable: true, width: '150px', render: (r) => <span title={formatDateTime(r.startedAt)}>{formatTimeAgo(r.startedAt)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Master import & export"
        description="Every master imports the same way: download the template, fill it, dry-run, read the errors, then commit. Nothing is written to the database until the dry run is accepted."
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }, { label: 'Import & export' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => toast.success('Templates downloaded', 'One workbook per master, with validation rules and picklists embedded.')}>
              Download templates
            </Button>
            <Button variant="primary" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
              New import
            </Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'runs', label: 'Import runs', count: importRuns.length },
              { id: 'templates', label: 'Templates', count: ALL_MASTERS.length },
              { id: 'how', label: 'How import works' },
            ]}
          />
        }
      />

      {awaiting.length > 0 && (
        <Alert tone="warning" className="mb-4" title={`${awaiting.length} dry run awaiting a decision`}>
          A dry run validates every row and writes nothing. Review the errors, fix the source file
          and re-run, or commit only the valid rows — that choice is deliberate rather than a
          silent partial import.
        </Alert>
      )}

      {tab === 'runs' && (
        <DataTable
          rows={importRuns}
          columns={columns}
          rowKey={(r) => r.uid}
          searchPlaceholder="File name, master or user…"
          onRowClick={setDetail}
          onExport={doExport}
          rowClassName={(r) => (r.status === 'FAILED' ? 'bg-danger/[0.03]' : undefined)}
        />
      )}

      {tab === 'templates' && (
        <Card>
          <CardHeader
            title="Import templates"
            description="Each template carries the column order, data types, picklists and mandatory-field marking for that master"
          />
          <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_MASTERS.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => toast.success(`${m.name} template downloaded`)}
                className="flex items-center justify-between gap-2 rounded border border-border p-2.5 text-left transition-colors hover:border-brand-500/50 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-fg">{m.name}</span>
                  <span className="block truncate font-mono text-2xs text-fg-subtle">{m.code}</span>
                </span>
                <Download className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === 'how' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="The five steps" />
            <CardBody>
              <ol className="space-y-3 text-xs text-fg-muted">
                {[
                  ['Download the template', 'Generated from the live master definition, so it always matches the current fields — not a copy someone saved last year.'],
                  ['Fill it', 'Picklist columns are constrained in the workbook itself, so most errors never reach the server.'],
                  ['Dry run', 'Every row is validated against the same rules the API enforces. Nothing is written. You get a row-and-column error report.'],
                  ['Review', 'Errors block a row; warnings do not. You decide whether to fix the file or commit the valid rows only.'],
                  ['Commit', 'Valid rows are written in a single transaction. If anything fails at this point the whole import rolls back — never half a master file.'],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-2xs font-semibold text-fg">{i + 1}</span>
                    <span>
                      <span className="block text-xs font-medium text-fg">{t}</span>
                      <span className="block">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="What import will not let you do" />
              <CardBody>
                <ul className="space-y-2 text-xs text-fg-muted">
                  {[
                    'Bypass approval — imported records land in the same lifecycle state a manual entry would.',
                    'Bypass validation — the importer calls the same application service as the UI, not the database directly.',
                    'Create duplicates silently — matching records are flagged and routed to duplicate review.',
                    'Overwrite an approved record — an update creates a revision, exactly as a manual edit does.',
                    'Import into another company — the file is scoped to your active company context.',
                  ].map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                      {r}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            
          </div>
        </div>
      )}

      {/* Run detail */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        size="xl"
        title={detail?.fileName}
        description={detail ? `${detail.masterName} · ${detail.rowsTotal} rows · ${detail.startedBy}` : undefined}
        footer={
          detail && (
            <>
              <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
              <Button variant="outline" onClick={() => toast.success('Error report downloaded')}>
                Download error report
              </Button>
              {detail.status === 'DRY_RUN_COMPLETE' && (
                <>
                  <Button variant="secondary" onClick={() => { toast.success('Import cancelled', 'Nothing was written.'); setDetail(null) }}>
                    Cancel import
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      toast.success('Committed', `${detail.rowsValid} rows written in a single transaction.`)
                      setDetail(null)
                    }}
                  >
                    Commit {detail.rowsValid} valid rows
                  </Button>
                </>
              )}
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded border border-border p-3">
                <p className="text-2xs uppercase tracking-wide text-fg-subtle">Total rows</p>
                <p className="mt-0.5 text-lg font-semibold text-fg tabular">{detail.rowsTotal}</p>
              </div>
              <div className="rounded border border-success/30 bg-success/5 p-3">
                <p className="text-2xs uppercase tracking-wide text-success">Valid</p>
                <p className="mt-0.5 text-lg font-semibold text-success tabular">{detail.rowsValid}</p>
              </div>
              <div className="rounded border border-warning/30 bg-warning/5 p-3">
                <p className="text-2xs uppercase tracking-wide text-warning">Warnings</p>
                <p className="mt-0.5 text-lg font-semibold text-warning tabular">{detail.rowsWarning}</p>
              </div>
              <div className="rounded border border-danger/30 bg-danger/5 p-3">
                <p className="text-2xs uppercase tracking-wide text-danger">Errors</p>
                <p className="mt-0.5 text-lg font-semibold text-danger tabular">{detail.rowsError}</p>
              </div>
            </div>

            <ProgressBar
              value={detail.rowsValid}
              max={detail.rowsTotal || 1}
              showLabel
              tone={detail.rowsError === 0 ? 'success' : detail.rowsError > detail.rowsValid ? 'danger' : 'warning'}
            />

            {detail.errors.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-fg">Row-level findings ({detail.errors.length})</p>
                <div className="max-h-80 overflow-auto rounded border border-border">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th className="w-16">Row</th>
                        <th className="w-40">Column</th>
                        <th className="w-40">Value</th>
                        <th>Message</th>
                        <th className="w-24">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="tabular">{e.row}</td>
                          <td><span className="font-mono text-2xs">{e.column}</span></td>
                          <td><span className="font-mono text-2xs text-fg-muted">{e.value || '(blank)'}</span></td>
                          <td className="text-2xs text-fg-muted">{e.message}</td>
                          <td>
                            <Badge tone={e.severity === 'ERROR' ? 'danger' : 'warning'} size="sm">
                              {e.severity.toLowerCase()}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.status === 'FAILED' && (
              <Alert tone="danger" title="This import failed before any row could be validated">
                Nothing was written. The most common cause is a stale template — download a fresh
                one, which is generated from the live master definition.
              </Alert>
            )}
            {detail.status === 'COMMITTED' && (
              <Alert tone="info" title="Committed">
                {detail.rowsValid} rows were written in a single transaction on{' '}
                {formatDateTime(detail.startedAt)}. Each created record carries an audit entry
                attributing it to this import run.
              </Alert>
            )}
          </div>
        )}
      </Modal>

      {/* New import */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New import"
        footer={
          <>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Dry run started', 'You will be notified when validation completes.'); setNewOpen(false) }}>
              Upload and dry-run
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select label="Master" required options={ALL_MASTERS.map((m) => ({ value: m.code, label: m.name }))} />
          <div className="flex flex-col items-center justify-center rounded border-2 border-dashed border-border-strong py-10 text-center">
            <Upload className="mb-2 h-6 w-6 text-fg-subtle" />
            <p className="text-sm text-fg">Drop the filled template here</p>
            <p className="mt-0.5 text-2xs text-fg-subtle">.xlsx or .csv · up to 25 MB · 50,000 rows</p>
          </div>
          <Switch checked={dryRun} onChange={setDryRun} label="Dry run first (strongly recommended)" />
          <Switch checked={updateExisting} onChange={setUpdateExisting} label="Update existing records where the code matches" />
          <Alert tone="warning" title="Updating is not the same as creating">
            With update enabled, a matching code amends the existing record — which on an approved
            master creates a revision and may re-trigger approval. Leave it off if you only mean to
            add new records.
          </Alert>
        </div>
      </Modal>

      <p className="mt-4 flex items-center gap-1.5 text-2xs text-fg-subtle">
        <XCircle className="h-3 w-3" />
        Imports are logged to the audit trail with the file name, the row count and the user who ran
        them.
        <AlertTriangle className="ml-2 h-3 w-3" />
        A committed import cannot be undone in bulk — records are corrected or deactivated
        individually, as with any other master change.
      </p>
    </div>
  )
}
