import { useMemo, useState } from 'react'
import { AlertTriangle, Hash, Play, Plus, ShieldCheck } from 'lucide-react'
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
import { formatDateTime } from '@/lib/format'
import { numberAllocations, numberSeries } from '@/mock/data2'
import type { NumberAllocation, NumberSeries } from '@/types'

/* ─────────────────────────── Format engine ─────────────────────────── */

const TOKENS = [
  { token: '{PREFIX}', desc: 'Series prefix, e.g. PO' },
  { token: '{BRANCH}', desc: 'Branch code of the document' },
  { token: '{PLANT}', desc: 'Plant code of the document' },
  { token: '{FY}', desc: 'Financial year short code, e.g. 2627' },
  { token: '{YYYY}', desc: 'Calendar year, 4 digits' },
  { token: '{YY}', desc: 'Calendar year, 2 digits' },
  { token: '{MM}', desc: 'Month, 2 digits' },
  { token: '{DD}', desc: 'Day, 2 digits' },
  { token: '{SEQ}', desc: 'Sequence, padded to the configured width' },
  { token: '{SUBTYPE}', desc: 'Document sub-type code' },
]

/**
 * Renders a format string the same way the server would. Kept pure so the
 * editor preview and the simulator cannot disagree.
 */
function renderFormat(
  format: string,
  ctx: { prefix: string; branch: string; plant: string; fy: string; subType: string; seq: number; pad: number },
) {
  const now = new Date()
  return format
    .replace(/\{PREFIX\}/g, ctx.prefix)
    .replace(/\{BRANCH\}/g, ctx.branch)
    .replace(/\{PLANT\}/g, ctx.plant)
    .replace(/\{FY\}/g, ctx.fy)
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{YY\}/g, String(now.getFullYear()).slice(2))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/\{DD\}/g, String(now.getDate()).padStart(2, '0'))
    .replace(/\{SUBTYPE\}/g, ctx.subType)
    .replace(/\{SEQ\}/g, String(ctx.seq).padStart(ctx.pad, '0'))
}

interface SeriesIssue {
  severity: 'ERROR' | 'WARNING'
  message: string
}

function validateSeries(s: {
  formatString: string
  isStatutory: boolean
  isGapless: boolean
  allocateOn: string
  paddingWidth: number
  prefix: string
}): SeriesIssue[] {
  const issues: SeriesIssue[] = []

  if (!s.formatString.includes('{SEQ}')) {
    issues.push({ severity: 'ERROR', message: 'Format must contain {SEQ} or every document would get the same number.' })
  }

  // GST invoice numbers are capped at 16 characters and restricted to
  // alphanumerics, hyphen and slash. A longer number is rejected by the IRP.
  if (s.isStatutory) {
    const sample = renderFormat(s.formatString, {
      prefix: s.prefix || 'XX',
      branch: 'HO',
      plant: 'P1',
      fy: '2627',
      subType: 'STD',
      seq: 999999,
      pad: s.paddingWidth,
    })
    if (sample.length > 16) {
      issues.push({ severity: 'ERROR', message: `Statutory number would be ${sample.length} characters — GST rule 46 caps invoice numbers at 16.` })
    }
    if (!/^[A-Za-z0-9/-]+$/.test(sample)) {
      issues.push({ severity: 'ERROR', message: 'Statutory numbers may contain only letters, digits, hyphen and slash.' })
    }
    if (!s.isGapless) {
      issues.push({ severity: 'ERROR', message: 'A statutory series must be gapless — the tax authority requires an unbroken sequence.' })
    }
    if (s.allocateOn !== 'APPROVAL') {
      issues.push({ severity: 'WARNING', message: 'Allocating a statutory number on DRAFT creates gaps when drafts are abandoned. Allocate on approval.' })
    }
  }

  if (s.isGapless && s.allocateOn === 'DRAFT') {
    issues.push({ severity: 'WARNING', message: 'Gapless + allocate-on-draft serialises document creation and will bottleneck under load.' })
  }
  if (s.paddingWidth < 3) {
    issues.push({ severity: 'WARNING', message: 'Padding below 3 digits makes numbers hard to sort and read.' })
  }

  return issues
}

/* ─────────────────────────── Editor ─────────────────────────── */

function SeriesEditor({
  open,
  onClose,
  series,
}: {
  open: boolean
  onClose: () => void
  series: NumberSeries | null
}) {
  const toast = useToast()
  const [format, setFormat] = useState(series?.formatString ?? '{PREFIX}/{BRANCH}/{FY}/{SEQ}')
  const [prefix, setPrefix] = useState(series?.prefix ?? 'PO')
  const [pad, setPad] = useState(series?.paddingWidth ?? 5)
  const [statutory, setStatutory] = useState(series?.isStatutory ?? false)
  const [gapless, setGapless] = useState(series?.isGapless ?? false)
  const [allocateOn, setAllocateOn] = useState(series?.allocateOn ?? 'DRAFT')
  const [start, setStart] = useState(series?.startNumber ?? 1)

  const issues = validateSeries({ formatString: format, isStatutory: statutory, isGapless: gapless, allocateOn, paddingWidth: pad, prefix })
  const errors = issues.filter((i) => i.severity === 'ERROR')

  const preview = [0, 1, 2].map((i) =>
    renderFormat(format, {
      prefix,
      branch: series?.branchCode || 'HO',
      plant: series?.plantCode || 'P1',
      fy: series?.fyCode || '2627',
      subType: series?.subType || 'STD',
      seq: (series?.currentNumber ?? start) + i,
      pad,
    }),
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={series ? `Edit series — ${series.documentLabel}` : 'New number series'}
      description="The format is data, not code. Changing it affects future allocations only; issued numbers are never rewritten."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={errors.length > 0}
            onClick={() => {
              toast.success('Series saved', `Next number will be ${preview[0]}.`)
              onClose()
            }}
          >
            Save series
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3.5">
          <Select
            label="Document type"
            required
            defaultValue={series?.documentType}
            options={[...new Set(numberSeries.map((s) => s.documentType))].map((t) => ({
              value: t,
              label: `${t} — ${numberSeries.find((s) => s.documentType === t)?.documentLabel}`,
            }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} required />
            <Input label="Padding width" type="number" min={1} max={12} value={pad} onChange={(e) => setPad(Number(e.target.value))} />
          </div>
          <Input
            label="Format string"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            required
            className="font-mono"
            hint="Tokens are substituted at allocation time from the document's own context."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start number" type="number" value={start} onChange={(e) => setStart(Number(e.target.value))} />
            <Select
              label="Reset frequency"
              defaultValue={series?.resetFrequency ?? 'FINANCIAL_YEARLY'}
              options={[
                { value: 'NEVER', label: 'Never' },
                { value: 'FINANCIAL_YEARLY', label: 'Every financial year' },
                { value: 'YEARLY', label: 'Every calendar year' },
                { value: 'MONTHLY', label: 'Monthly' },
                { value: 'DAILY', label: 'Daily' },
              ]}
            />
          </div>
          <Select
            label="Allocate number on"
            value={allocateOn}
            onChange={(e) => setAllocateOn(e.target.value as 'DRAFT' | 'APPROVAL')}
            options={[
              { value: 'DRAFT', label: 'Draft creation — number visible while editing' },
              { value: 'APPROVAL', label: 'Approval — no number burned on abandoned drafts' },
            ]}
          />
          <div className="space-y-2.5 rounded border border-border p-3">
            <Switch checked={statutory} onChange={setStatutory} label="Statutory series (GST / e-invoice)" />
            <Switch checked={gapless} onChange={setGapless} label="Gapless — no missing numbers permitted" disabled={statutory} />
            <p className="text-2xs text-fg-subtle">
              Gapless allocation takes a row lock on the counter. Use it only where the law demands
              it; operational series should stay non-gapless so concurrent users never queue.
            </p>
          </div>
        </div>

        <div className="space-y-3.5">
          <div>
            <p className="field-label">Live preview</p>
            <div className="space-y-1.5 rounded border border-border bg-surface-2 p-3">
              {preview.map((p, i) => (
                <p key={i} className={i === 0 ? 'font-mono text-sm font-semibold text-fg' : 'font-mono text-xs text-fg-muted'}>
                  {p}
                  {i === 0 && <span className="ml-2 text-2xs font-normal text-fg-subtle">next</span>}
                  <span className="ml-2 text-2xs font-normal text-fg-subtle">{p.length} chars</span>
                </p>
              ))}
            </div>
          </div>

          {issues.length > 0 && (
            <div className="space-y-1.5">
              {issues.map((i, idx) => (
                <div
                  key={idx}
                  className={
                    i.severity === 'ERROR'
                      ? 'flex items-start gap-2 rounded border border-danger/30 bg-danger/5 px-2.5 py-2 text-2xs text-danger'
                      : 'flex items-start gap-2 rounded border border-warning/30 bg-warning/5 px-2.5 py-2 text-2xs text-warning'
                  }
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="text-fg-muted">{i.message}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="field-label">Available tokens</p>
            <div className="max-h-52 overflow-auto rounded border border-border">
              <table className="grid-table">
                <tbody>
                  {TOKENS.map((t) => (
                    <tr key={t.token}>
                      <td className="w-28">
                        <button
                          type="button"
                          onClick={() => setFormat((f) => f + t.token)}
                          className="font-mono text-2xs text-brand-600 hover:underline"
                        >
                          {t.token}
                        </button>
                      </td>
                      <td className="text-2xs text-fg-muted">{t.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ─────────────────────────── Page ─────────────────────────── */

export function NumberingPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'document-numbering', 'Document numbering', columnsFromTable(seriesColumns), numberSeries)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('series')
  const [editing, setEditing] = useState<NumberSeries | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [simOpen, setSimOpen] = useState(false)

  const statutoryCount = numberSeries.filter((s) => s.isStatutory).length
  const inactiveCount = numberSeries.filter((s) => !s.isActive).length
  const voided = numberAllocations.filter((a) => a.status === 'VOIDED')

  /** A statutory series with a voided number is a compliance problem, not a data problem. */
  const gapRisk = useMemo(() => {
    const statutoryUids = new Set(numberSeries.filter((s) => s.isStatutory).map((s) => s.uid))
    return voided.filter((a) => statutoryUids.has(a.seriesUid))
  }, [voided])

  const seriesColumns: Column<NumberSeries>[] = [
    {
      key: 'documentLabel',
      header: 'Document type',
      sortable: true,
      sticky: true,
      width: '220px',
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{s.documentLabel}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">
            {s.documentType}
            {s.subType && ` · ${s.subType}`}
          </p>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      width: '140px',
      accessor: (s) => `${s.branchCode}${s.plantCode}`,
      render: (s) => (
        <span className="font-mono text-2xs text-fg-muted">
          {s.branchCode}/{s.plantCode}
          {s.fyCode && `/${s.fyCode}`}
        </span>
      ),
    },
    { key: 'formatString', header: 'Format', render: (s) => <span className="font-mono text-2xs">{s.formatString}</span> },
    { key: 'nextNumber', header: 'Next number', width: '190px', render: (s) => <span className="font-mono text-xs font-medium text-fg">{s.nextNumber}</span> },
    { key: 'issuedCount', header: 'Issued', align: 'right', sortable: true, width: '90px' },
    {
      key: 'resetFrequency',
      header: 'Reset',
      width: '110px',
      defaultHidden: true,
      render: (s) => <span className="text-2xs text-fg-muted">{s.resetFrequency.toLowerCase().replace('_', ' ')}</span>,
    },
    {
      key: 'allocateOn',
      header: 'Allocate on',
      width: '110px',
      render: (s) => <Badge tone={s.allocateOn === 'APPROVAL' ? 'progress' : 'neutral'} size="sm" dot={false}>{s.allocateOn.toLowerCase()}</Badge>,
    },
    {
      key: 'flags',
      header: 'Flags',
      width: '170px',
      accessor: (s) => (s.isStatutory ? 2 : 0) + (s.isGapless ? 1 : 0),
      render: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.isStatutory && <Badge tone="danger" size="sm" dot={false}>statutory</Badge>}
          {s.isGapless && <Badge tone="warning" size="sm" dot={false}>gapless</Badge>}
          {s.isDefault && <Badge tone="brand" size="sm" dot={false}>default</Badge>}
        </div>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      width: '100px',
      accessor: (s) => (s.isActive ? 1 : 0),
      render: (s) => <Badge tone={s.isActive ? 'success' : 'neutral'} size="sm">{s.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  const allocColumns: Column<NumberAllocation>[] = [
    { key: 'formattedNumber', header: 'Number', sortable: true, width: '200px', render: (a) => <span className="font-mono text-xs font-medium">{a.formattedNumber}</span> },
    { key: 'sequence', header: 'Seq', align: 'right', sortable: true, width: '80px' },
    { key: 'entityLabel', header: 'Consumed by' },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (a) => (
        <Badge tone={a.status === 'CONSUMED' ? 'success' : a.status === 'ALLOCATED' ? 'pending' : 'danger'} size="sm">
          {a.status.toLowerCase()}
        </Badge>
      ),
    },
    { key: 'reason', header: 'Reason', render: (a) => <span className="text-2xs text-fg-muted">{a.reason ?? '—'}</span> },
    { key: 'allocatedBy', header: 'By', width: '140px' },
    { key: 'allocatedAt', header: 'When', sortable: true, width: '160px', render: (a) => formatDateTime(a.allocatedAt) },
  ]

  return (
    <div>
      <PageHeader
        title="Document numbering"
        description="One engine issues every document number in the product. No module holds its own sequence — that is how numbering stays consistent, configurable and auditable."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Platform services' }, { label: 'Document numbering' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Play className="h-4 w-4" />} onClick={() => setSimOpen(true)}>
              Simulate
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setEditorOpen(true) }}>
              New series
            </Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'series', label: 'Series', count: numberSeries.length },
              { id: 'allocations', label: 'Allocation log', count: numberAllocations.length },
              { id: 'gaps', label: 'Gap analysis', count: gapRisk.length },
            ]}
          />
        }
      />

      {gapRisk.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${gapRisk.length} voided number(s) in a statutory series`}>
          A gapless series must have no missing numbers. Each void needs a documented reason and
          appears on the GSTR-1 reconciliation as a cancelled invoice — it cannot simply be
          reissued.
        </Alert>
      )}

      {tab === 'series' && (
        <DataTable
          rows={numberSeries}
          columns={seriesColumns}
          rowKey={(s) => s.uid}
          searchPlaceholder="Document type, prefix or format…"
          pageSize={20}
          onExport={doExport}
          onRowClick={(s) => { setEditing(s); setEditorOpen(true) }}
          rowActions={(s) => (
            <>
              <MenuItem label="Edit format" onClick={() => { setEditing(s); setEditorOpen(true) }} />
              <MenuItem label="View allocations" onClick={() => setTab('allocations')} />
              <MenuItem label="Reserve a block" onClick={() => toast.info('Reserve a block', `Reserve a contiguous range of ${s.documentLabel} numbers for offline or pre-printed use.`)} />
              <MenuItem label="Set as default" disabled={s.isDefault} onClick={() => toast.success('Default series set', `${s.documentLabel} is now the default series for ${s.documentType}.`)} />
              <MenuItem label={s.isActive ? 'Deactivate' : 'Activate'} danger={s.isActive} separatorBefore onClick={() => toast.success(s.isActive ? 'Series deactivated' : 'Series activated', `${s.documentLabel} is now ${s.isActive ? 'inactive' : 'active'}.`)} />
            </>
          )}
        />
      )}

      {tab === 'allocations' && (
        <>
          <Alert tone="info" className="mb-3" title="Every number is accounted for">
            An allocation row is written the instant a number is issued, before the document is
            saved. If the document is abandoned, the row stays as ALLOCATED and is reported here —
            numbers never disappear silently.
          </Alert>
          <DataTable
            rows={numberAllocations}
            columns={allocColumns}
            rowKey={(a) => a.uid}
            searchPlaceholder="Number, entity or user…"
            onExport={doExport}
          />
        </>
      )}

      {tab === 'gaps' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Voided numbers" description="Reported to the tax authority as cancelled" />
            <CardBody className="space-y-2">
              {voided.length === 0 && <p className="text-xs text-fg-muted">No voided numbers.</p>}
              {voided.map((a) => {
                const s = numberSeries.find((x) => x.uid === a.seriesUid)
                return (
                  <div key={a.uid} className="rounded border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-fg">{a.formattedNumber}</span>
                      {s?.isStatutory ? <Badge tone="danger" size="sm">statutory</Badge> : <Badge tone="neutral" size="sm">operational</Badge>}
                    </div>
                    <p className="mt-1 text-2xs text-fg-muted">{a.reason ?? 'No reason recorded'}</p>
                    <p className="mt-0.5 text-2xs text-fg-subtle">
                      {a.allocatedBy} · {formatDateTime(a.allocatedAt)}
                    </p>
                  </div>
                )
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Continuity check" description="Per statutory series" />
            <CardBody className="space-y-3">
              {numberSeries.filter((s) => s.isStatutory).map((s) => {
                const holes = voided.filter((a) => a.seriesUid === s.uid).length
                return (
                  <div key={s.uid} className="rounded border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-fg">{s.documentLabel}</span>
                      <Badge tone={holes === 0 ? 'success' : 'danger'} size="sm">
                        {holes === 0 ? 'Unbroken' : `${holes} break(s)`}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-2xs text-fg-subtle">
                      {s.startNumber} → {s.currentNumber} · {s.issuedCount} issued
                    </p>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </div>
      )}

      <SeriesEditor open={editorOpen} onClose={() => setEditorOpen(false)} series={editing} />

      <Modal
        open={simOpen}
        onClose={() => setSimOpen(false)}
        title="Number simulator"
        description="Shows which series would be selected for a document and what number it would receive."
        footer={<Button variant="primary" onClick={() => setSimOpen(false)}>Close</Button>}
      >
        <div className="space-y-3.5">
          <Select label="Document type" defaultValue="PO" options={[...new Set(numberSeries.map((s) => s.documentType))].map((t) => ({ value: t, label: t }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Branch" options={[{ value: 'HO', label: 'HO' }, { value: 'CHN', label: 'CHN' }, { value: 'MUM', label: 'MUM' }]} />
            <Select label="Plant" options={[{ value: 'P1', label: 'P1' }, { value: 'P2', label: 'P2' }]} />
          </div>
          <Alert tone="info" title="Series selection order">
            Most specific wins: document type + sub-type + branch + plant + FY, then progressively
            broader, ending at the company default. If no series matches, document creation is
            blocked with a clear message rather than falling back to a raw counter.
          </Alert>
          <div className="rounded border border-border bg-surface-2 p-3">
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Resolved series</p>
            <p className="mt-0.5 text-xs text-fg">{numberSeries[0].documentLabel} · {numberSeries[0].formatString}</p>
            <p className="mt-2 text-2xs uppercase tracking-wide text-fg-subtle">Number that would be issued</p>
            <p className="mt-0.5 font-mono text-base font-semibold text-fg">{numberSeries[0].nextNumber}</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
