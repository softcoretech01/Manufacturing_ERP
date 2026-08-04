import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Database, FileSpreadsheet, Layers, Search, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { SearchInput, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { cn } from '@/lib/cn'
import { masterDefinitions } from '@/mock/data2'
import type { MasterDefinition } from '@/types'

/**
 * The capabilities every master inherits from the framework. A master that is
 * missing one of these is not finished — that is the point of listing them
 * here rather than leaving it to each module's discretion.
 */
const CAPABILITIES = [
  { key: 'code', label: 'Code + name + short name', detail: 'Auto-numbered or manual, unique within company and branch.' },
  { key: 'status', label: 'Active / inactive with effective dating', detail: 'Effective-from and effective-to; a master is never hard-deleted.' },
  { key: 'approval', label: 'Configurable approval', detail: 'Draft → submitted → approved → active, or auto-approve where the master is low risk.' },
  { key: 'revision', label: 'Revision with diff', detail: 'Approved masters are versioned, not edited in place.' },
  { key: 'attachment', label: 'Attachments', detail: 'Drawings, certificates, photographs, test reports.' },
  { key: 'notes', label: 'Notes and comments', detail: 'Internal, purchase, sales and customer-facing note channels.' },
  { key: 'audit', label: 'Audit trail', detail: 'Field-level before/after on every change, append-only.' },
  { key: 'import', label: 'Excel import / export', detail: 'Template download, dry-run validation, row-level error report.' },
  { key: 'whereused', label: 'Where-used / dependency check', detail: 'Deactivation is blocked while an open transaction references the record.' },
  { key: 'api', label: 'REST API + events', detail: 'Full CRUD under /api/v1 plus domain events on every state change.' },
  { key: 'barcode', label: 'Barcode / QR ready', detail: 'Every master that is physically handled resolves from a scan.' },
  { key: 'rbac', label: 'RBAC + field-level security', detail: 'Action, data scope and field visibility enforced server-side.' },
]

const LIFECYCLE = ['DRAFT', 'SUBMITTED', 'DEPT_APPROVAL', 'PLANT_APPROVAL', 'APPROVED', 'ACTIVE', 'ARCHIVED']

export function MasterFrameworkPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'master-data-framework', 'Master data framework', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('registry')
  const [module, setModule] = useState('')
  const [q, setQ] = useState('')
  const [config, setConfig] = useState<MasterDefinition | null>(null)
  const [cfgOptions, setCfgOptions] = useState({
    approval: false,
    revision: false,
    attachment: false,
    import: true,
    blockDeactivation: true,
    autoCode: false,
  })

  useEffect(() => {
    if (config)
      setCfgOptions({
        approval: config.hasApproval,
        revision: config.hasRevision,
        attachment: config.hasAttachment,
        import: true,
        blockDeactivation: true,
        autoCode: false,
      })
  }, [config])

  const modules = useMemo(() => [...new Set(masterDefinitions.map((m) => m.module))].sort(), [])
  const rows = masterDefinitions.filter((m) => !module || m.module === module)

  const totalRecords = masterDefinitions.reduce((s, m) => s + m.recordCount, 0)

  const columns: Column<MasterDefinition>[] = [
    {
      key: 'name',
      header: 'Master',
      sortable: true,
      sticky: true,
      width: '230px',
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{m.name}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{m.code}</p>
        </div>
      ),
    },
    { key: 'module', header: 'Category', sortable: true, width: '150px', render: (m) => <Badge tone="neutral" size="sm" dot={false}>{m.module}</Badge> },
    { key: 'recordCount', header: 'Records', align: 'right', sortable: true, width: '100px', render: (m) => <span className="tabular">{m.recordCount.toLocaleString('en-IN')}</span> },
    {
      key: 'capabilities',
      header: 'Framework capabilities',
      accessor: (m) => (m.hasApproval ? 4 : 0) + (m.hasRevision ? 2 : 0) + (m.hasAttachment ? 1 : 0),
      render: (m) => (
        <div className="flex flex-wrap gap-1">
          {m.hasApproval && <Badge tone="progress" size="sm" dot={false}>approval</Badge>}
          {m.hasRevision && <Badge tone="warning" size="sm" dot={false}>revision</Badge>}
          {m.hasAttachment && <Badge tone="neutral" size="sm" dot={false}>attachments</Badge>}
          <Badge tone="success" size="sm" dot={false}>audit</Badge>
          <Badge tone="success" size="sm" dot={false}>import</Badge>
        </div>
      ),
    },
    {
      key: 'isConfigured',
      header: 'Status',
      width: '120px',
      accessor: (m) => (m.isConfigured ? 1 : 0),
      render: (m) => <Badge tone={m.isConfigured ? 'success' : 'draft'} size="sm">{m.isConfigured ? 'Configured' : 'Not set up'}</Badge>,
    },
    {
      key: 'open',
      header: '',
      width: '90px',
      align: 'right',
      render: (m) => (
        <Link to={m.route} className="inline-flex items-center gap-1 text-2xs font-medium text-brand-600 hover:underline">
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      ),
    },
  ]

  const grouped = useMemo(() => {
    const map = new Map<string, MasterDefinition[]>()
    for (const m of masterDefinitions) {
      if (q && !m.name.toLowerCase().includes(q.toLowerCase()) && !m.code.toLowerCase().includes(q.toLowerCase())) continue
      const list = map.get(m.module) ?? []
      list.push(m)
      map.set(m.module, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [q])

  return (
    <div>
      <PageHeader
        title="Master data framework"
        description="Masters are not written one at a time. Every master in the product is generated from one framework so behaviour — approval, revision, audit, import, where-used — is identical everywhere."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Platform services' }, { label: 'Master data framework' }]}
        actions={
          <Button variant="outline" size="sm" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => toast.success('Templates downloaded', 'One Excel import template per master, with validation rules embedded.')}>
            Download import templates
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'registry', label: 'Master registry', count: masterDefinitions.length },
              { id: 'catalogue', label: 'Browse by category' },
              { id: 'capabilities', label: 'Framework capabilities', count: CAPABILITIES.length },
              { id: 'lifecycle', label: 'Lifecycle' },
            ]}
          />
        }
      />

      {tab === 'registry' && (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(m) => m.code}
          searchPlaceholder="Master name or code…"
          pageSize={20}
          onExport={doExport}
          toolbar={
            <Select
              sizeVariant="sm"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              options={[{ value: '', label: 'All categories' }, ...modules.map((m) => ({ value: m, label: m }))]}
            />
          }
          filterChips={module ? [{ key: 'm', label: 'Category', value: module, onRemove: () => setModule('') }] : []}
          onClearFilters={() => setModule('')}
          rowActions={(m) => (
            <>
              <MenuItem label="Configure framework options" onClick={() => setConfig(m)} />
              <MenuItem label="Download import template" onClick={() => toast.success('Template downloaded')} />
              <MenuItem label="Where used" onClick={() => toast.info('Where used', `Dependency check for ${m.name} — lists every open transaction and master that references it before deactivation.`)} />
              <MenuItem label="Audit history" onClick={() => toast.info('Audit history', `Field-level change history for ${m.name}, append-only.`)} />
            </>
          )}
        />
      )}

      {tab === 'catalogue' && (
        <div className="space-y-4">
          <SearchInput
            placeholder="Search all masters…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="max-w-md"
          />
          {grouped.map(([mod, items]) => (
            <Card key={mod}>
              <CardHeader title={mod} description={`${items.length} masters · ${items.reduce((s, i) => s + i.recordCount, 0).toLocaleString('en-IN')} records`} />
              <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((m) => (
                  <Link
                    key={m.code}
                    to={m.route}
                    className="group rounded border border-border p-2.5 transition-colors hover:border-brand-500/50 hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-fg group-hover:text-brand-600">{m.name}</span>
                      <span className="shrink-0 text-2xs text-fg-subtle tabular">{m.recordCount.toLocaleString('en-IN')}</span>
                    </div>
                    <p className="mt-0.5 font-mono text-2xs text-fg-subtle">{m.code}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.hasApproval && <Badge tone="progress" size="sm" dot={false}>approval</Badge>}
                      {m.hasRevision && <Badge tone="warning" size="sm" dot={false}>revision</Badge>}
                    </div>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'capabilities' && (
        <div className="space-y-4">
          
          <div className="grid gap-3 md:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <div key={c.key} className="card p-3.5">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div>
                    <p className="text-sm font-medium text-fg">{c.label}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">{c.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'lifecycle' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Master lifecycle" description="The same states for every approval-controlled master" />
            <CardBody>
              <ol className="space-y-0">
                {LIFECYCLE.map((s, i) => (
                  <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < LIFECYCLE.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-border" />}
                    <span
                      className={cn(
                        'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                        i < 5 ? 'bg-brand-500/15 text-brand-600' : 'bg-surface-3 text-fg-muted',
                      )}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-fg">{s.replace(/_/g, ' ').toLowerCase()}</p>
                      <p className="text-xs text-fg-muted">
                        {s === 'DRAFT' && 'Editable by the creator. Not selectable in any transaction.'}
                        {s === 'SUBMITTED' && 'Locked for editing; sits in the approver’s inbox.'}
                        {s === 'DEPT_APPROVAL' && 'Department head confirms the business need and classification.'}
                        {s === 'PLANT_APPROVAL' && 'Plant or finance approval where the master affects costing or statutory data.'}
                        {s === 'APPROVED' && 'Signed off, awaiting its effective-from date.'}
                        {s === 'ACTIVE' && 'Selectable in transactions. Changes now create a revision, not an edit.'}
                        {s === 'ARCHIVED' && 'No longer selectable. Existing documents keep their reference — history is never rewritten.'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Universal business rules" />
              <CardBody>
                <ul className="space-y-2 text-xs text-fg-muted">
                  {[
                    'Code is unique within company and branch; uniqueness survives soft delete via a generated companion column.',
                    'Inactive and archived records cannot be selected in a new transaction, but remain readable on old ones.',
                    'An approved master cannot be deleted — only deactivated, and only when nothing open references it.',
                    'A change to effective dates on an active master requires re-approval.',
                    'Duplicate detection runs on configurable field sets (supplier name + GSTIN, item name + specification) and warns before saving.',
                    'Mandatory fields vary by master type and are configuration, not code.',
                  ].map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                      {r}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Standard screen layout" description="Same tabs, same order, every master" />
              <CardBody className="flex flex-wrap gap-1.5">
                {['General', 'Classification', 'Address', 'Contacts', 'Financial', 'Tax', 'Attachments', 'Notes', 'Where used', 'Revisions', 'Audit', 'Workflow'].map((t) => (
                  <span key={t} className="rounded border border-border px-2 py-1 text-2xs text-fg-muted">{t}</span>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      <Modal
        open={!!config}
        onClose={() => setConfig(null)}
        title={`Framework options — ${config?.name ?? ''}`}
        description="These switches change behaviour without a code change."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfig(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Configuration saved'); setConfig(null) }}>Save</Button>
          </>
        }
      >
        {config && (
          <div className="space-y-3">
            <Switch checked={cfgOptions.approval} onChange={(v) => setCfgOptions((c) => ({ ...c, approval: v }))} label="Require approval before a record becomes active" />
            <Switch checked={cfgOptions.revision} onChange={(v) => setCfgOptions((c) => ({ ...c, revision: v }))} label="Version approved records instead of editing in place" />
            <Switch checked={cfgOptions.attachment} onChange={(v) => setCfgOptions((c) => ({ ...c, attachment: v }))} label="Allow attachments" />
            <Switch checked={cfgOptions.import} onChange={(v) => setCfgOptions((c) => ({ ...c, import: v }))} label="Allow Excel import" />
            <Switch checked={cfgOptions.blockDeactivation} onChange={(v) => setCfgOptions((c) => ({ ...c, blockDeactivation: v }))} label="Block deactivation while referenced by an open transaction" />
            <Switch checked={cfgOptions.autoCode} onChange={(v) => setCfgOptions((c) => ({ ...c, autoCode: v }))} label="Auto-generate code from the numbering engine" />
            <Select
              label="Duplicate detection fields"
              options={[
                { value: 'NAME', label: 'Name only' },
                { value: 'NAME_GST', label: 'Name + GSTIN' },
                { value: 'NAME_SPEC', label: 'Name + specification' },
                { value: 'NONE', label: 'No duplicate check' },
              ]}
            />
            <Alert tone="warning">
              Turning approval off on a master that already has records in DRAFT will activate them
              at the next save. Review the pending list first.
            </Alert>
          </div>
        )}
      </Modal>
    </div>
  )
}
