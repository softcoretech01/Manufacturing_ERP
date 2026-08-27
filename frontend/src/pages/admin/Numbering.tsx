import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Play, Plus } from 'lucide-react'
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
import { formatDateTime } from '@/lib/format'
import { ProblemError } from '@/api/client'
import {
  useSeries,
  useExhaustionWarnings,
  useAllocations,
  useGapAnalysis,
  useCreateSeries,
  useUpdateSeries,
  useDeactivateSeries,
  usePreview,
  useSimulate,
} from '@/hooks/useNumbering'
import type { Series } from '@/api/numbering'

/**
 * Document numbering (SRS V1-NUM §3). Wired to the real engine — one service
 * issues every document number. The editor's preview and validation come from
 * the server so it can never disagree with what the allocator would produce.
 */

const RESETS = [
  { value: 'NEVER', label: 'Never' },
  { value: 'FINANCIAL_YEARLY', label: 'Every financial year' },
  { value: 'YEARLY', label: 'Every calendar year' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'DAILY', label: 'Daily' },
]
const TOKENS = ['{PREFIX}', '{BRANCH}', '{PLANT}', '{FY}', '{YYYY}', '{YY}', '{MM}', '{DD}', '{SEQ}', '{SEQ:5}']

export function NumberingPage() {
  const [tab, setTab] = useState('series')
  const [editing, setEditing] = useState<Series | 'new' | null>(null)
  const [simOpen, setSimOpen] = useState(false)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)

  const seriesQ = useSeries()
  const rows = seriesQ.data ?? []
  const warnQ = useExhaustionWarnings()
  const warnings = warnQ.data ?? []
  const deactivate = useDeactivateSeries()
  const toast = useToast()

  useEffect(() => {
    if (!selectedUid && rows.length) setSelectedUid(rows[0].uid)
  }, [selectedUid, rows])

  const seriesColumns: Column<Series>[] = [
    {
      key: 'document_label', header: 'Document type', sortable: true, sticky: true, width: '220px',
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{s.document_label}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{s.document_type}{s.sub_type && ` · ${s.sub_type}`}</p>
        </div>
      ),
    },
    { key: 'format_string', header: 'Format', render: (s) => <span className="font-mono text-2xs">{s.format_string}</span> },
    { key: 'next_number', header: 'Next number', width: '180px', render: (s) => <span className="font-mono text-xs font-medium text-fg">{s.next_number}</span> },
    { key: 'issued_count', header: 'Issued', align: 'right', sortable: true, width: '90px', render: (s) => s.issued_count },
    { key: 'allocate_on', header: 'Allocate on', width: '110px', render: (s) => <Badge tone={s.allocate_on === 'APPROVAL' ? 'progress' : 'neutral'} size="sm" dot={false}>{s.allocate_on.toLowerCase()}</Badge> },
    {
      key: 'flags', header: 'Flags', width: '160px', accessor: (s) => (s.is_statutory ? 2 : 0) + (s.is_gapless ? 1 : 0),
      render: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.is_statutory && <Badge tone="danger" size="sm" dot={false}>statutory</Badge>}
          {s.is_gapless && <Badge tone="warning" size="sm" dot={false}>gapless</Badge>}
          {s.is_default && <Badge tone="brand" size="sm" dot={false}>default</Badge>}
        </div>
      ),
    },
    { key: 'is_active', header: 'Status', width: '100px', accessor: (s) => (s.is_active ? 1 : 0), render: (s) => <Badge tone={s.is_active ? 'success' : 'neutral'} size="sm">{s.is_active ? 'Active' : 'Inactive'}</Badge> },
  ]

  return (
    <div>
      <PageHeader
        title="Document numbering"
        description="One engine issues every document number in the product. No module holds its own sequence — that is how numbering stays consistent, configurable and auditable."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Platform services' }, { label: 'Document numbering' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Play className="h-4 w-4" />} onClick={() => setSimOpen(true)}>Simulate</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>New series</Button>
          </>
        }
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'series', label: 'Series', count: rows.length },
          { id: 'allocations', label: 'Allocation log' },
          { id: 'gaps', label: 'Gap analysis' },
        ]} />}
      />

      {seriesQ.error && <Alert tone="danger" title="Could not load series">{seriesQ.error instanceof ProblemError ? seriesQ.error.problem.detail : 'Is the backend running?'}</Alert>}
      {warnings.length > 0 && (
        <Alert tone="warning" className="mb-4" title={`${warnings.length} series near capacity`}>
          {warnings.map((w) => `${w.label} at ${w.used_pct}%`).join(', ')}. Widen padding or reset earlier.
        </Alert>
      )}

      {tab === 'series' && (
        <DataTable
          rows={rows}
          columns={seriesColumns}
          rowKey={(s) => s.uid}
          loading={seriesQ.isLoading}
          searchPlaceholder="Document type, format…"
          pageSize={20}
          onRowClick={(s) => setEditing(s)}
          rowActions={(s) => (
            <>
              <MenuItem label="Edit format" onClick={() => setEditing(s)} />
              <MenuItem label="View allocations" onClick={() => { setSelectedUid(s.uid); setTab('allocations') }} />
              <MenuItem
                label={s.is_active ? 'Deactivate' : 'Activate'}
                danger={s.is_active}
                separatorBefore
                onClick={() => deactivate.mutate({ uid: s.uid, active: !s.is_active }, {
                  onSuccess: () => toast.success(s.is_active ? 'Series deactivated' : 'Series activated', s.document_label),
                  onError: (e) => toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
                })}
              />
            </>
          )}
          emptyTitle="No series yet"
          emptyDescription="Define a number series so documents of that type can be created."
        />
      )}

      {(tab === 'allocations' || tab === 'gaps') && (
        <Card className="mb-4"><CardBody className="flex items-end gap-3">
          <Select label="Series" containerClassName="w-80" value={selectedUid ?? ''} onChange={(e) => setSelectedUid(e.target.value)}
            options={rows.map((s) => ({ value: s.uid, label: `${s.document_label}${s.sub_type ? ` · ${s.sub_type}` : ''}` }))} />
        </CardBody></Card>
      )}

      {tab === 'allocations' && <AllocationLog uid={selectedUid} />}
      {tab === 'gaps' && <GapAnalysis uid={selectedUid} series={rows.find((s) => s.uid === selectedUid)} />}

      {editing && <SeriesEditor target={editing} allSeries={rows} onClose={() => setEditing(null)} />}
      <SimulatorModal open={simOpen} series={rows} onClose={() => setSimOpen(false)} />
    </div>
  )
}

/* ─────────────────────────── Allocation log ─────────────────────────── */
function AllocationLog({ uid }: { uid: string | null }) {
  const { data, isLoading } = useAllocations(uid ?? undefined)
  const rows = data ?? []
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'formatted_number', header: 'Number', sortable: true, width: '200px', render: (a) => <span className="font-mono text-xs font-medium">{a.formatted_number}</span> },
    { key: 'sequence', header: 'Seq', align: 'right', sortable: true, width: '80px', render: (a) => a.sequence },
    { key: 'entity_label', header: 'Consumed by', render: (a) => a.entity_label ?? '—' },
    { key: 'status', header: 'Status', width: '120px', render: (a) => <Badge tone={a.status === 'CONSUMED' ? 'success' : a.status === 'ALLOCATED' ? 'pending' : 'danger'} size="sm">{a.status.toLowerCase()}</Badge> },
    { key: 'reason', header: 'Reason', render: (a) => <span className="text-2xs text-fg-muted">{a.reason ?? '—'}</span> },
    { key: 'allocated_by_name', header: 'By', width: '140px', render: (a) => a.allocated_by_name ?? '—' },
    { key: 'allocated_at', header: 'When', sortable: true, width: '160px', render: (a) => formatDateTime(a.allocated_at) },
  ]
  return (
    <>
      <Alert tone="info" className="mb-3" title="Every number is accounted for">
        An allocation row is written the instant a number is issued. Abandoned drafts stay as ALLOCATED or VOIDED — numbers never disappear silently.
      </Alert>
      <DataTable rows={rows} columns={columns} rowKey={(a) => a.uid} loading={isLoading} searchPlaceholder="Number, entity…" emptyTitle="No numbers issued yet" />
    </>
  )
}

/* ─────────────────────────── Gap analysis ─────────────────────────── */
function GapAnalysis({ uid, series }: { uid: string | null; series?: Series }) {
  const { data, isLoading } = useGapAnalysis(uid ?? undefined)
  if (isLoading || !data) return <Card><CardBody className="py-8 text-center text-sm text-fg-muted">Loading…</CardBody></Card>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Continuity" description={series?.document_label} />
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone={data.unbroken ? 'success' : 'danger'} size="sm">{data.unbroken ? 'Unbroken' : `${data.gaps.length} gap(s)`}</Badge>
            {data.unbroken && <Check className="h-4 w-4 text-success" />}
          </div>
          <p className="font-mono text-2xs text-fg-subtle">
            {data.issued} issued · sequence {data.range_from ?? '—'} → {data.range_to ?? '—'} · {data.voided.length} voided
          </p>
          {series?.is_statutory && (
            <Alert tone={data.unbroken ? 'tip' : 'danger'}>
              {data.unbroken
                ? 'Gapless verified — the unbroken sequence a GST auditor asks for.'
                : 'A statutory series must have no missing numbers. Investigate each gap.'}
            </Alert>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Voided & missing" description="Reported to the tax authority as cancelled" />
        <CardBody className="space-y-2">
          {data.voided.length === 0 && data.gaps.length === 0 && <p className="text-xs text-fg-muted">No voided or missing numbers.</p>}
          {data.voided.map((seq) => (
            <div key={`v${seq}`} className="flex items-center justify-between rounded border border-border p-2 text-xs">
              <span className="font-mono">seq {seq}</span><Badge tone="warning" size="sm">voided</Badge>
            </div>
          ))}
          {data.gaps.map((seq) => (
            <div key={`g${seq}`} className="flex items-center justify-between rounded border border-danger/30 bg-danger/5 p-2 text-xs">
              <span className="font-mono">seq {seq}</span><Badge tone="danger" size="sm">missing</Badge>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}

/* ─────────────────────────── Editor ─────────────────────────── */
function SeriesEditor({ target, allSeries, onClose }: { target: Series | 'new'; allSeries: Series[]; onClose: () => void }) {
  const toast = useToast()
  const isNew = target === 'new'
  const s = isNew ? null : target
  const create = useCreateSeries()
  const update = useUpdateSeries()
  const preview = usePreview()

  const [documentType, setDocumentType] = useState(s?.document_type ?? '')
  const [documentLabel, setDocumentLabel] = useState(s?.document_label ?? '')
  const [subType, setSubType] = useState(s?.sub_type ?? '')
  const [format, setFormat] = useState(s?.format_string ?? '{PREFIX}/{FY}/{SEQ}')
  const [prefix, setPrefix] = useState(s?.prefix ?? '')
  const [pad, setPad] = useState(s?.padding_width ?? 5)
  const [start, setStart] = useState(s?.start_number ?? 1)
  const [reset, setReset] = useState(s?.reset_frequency ?? 'FINANCIAL_YEARLY')
  const [allocateOn, setAllocateOn] = useState(s?.allocate_on ?? 'DRAFT')
  const [statutory, setStatutory] = useState(s?.is_statutory ?? false)
  const [gapless, setGapless] = useState(s?.is_gapless ?? false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const issued = (s?.issued_count ?? 0) > 0

  // Server preview (editor and allocator agree). Debounced on the relevant fields.
  const previewMut = preview.mutate
  useEffect(() => {
    const t = setTimeout(() => {
      previewMut({ format_string: format, prefix: prefix || null, padding_width: pad, start_number: start, sub_type: subType || null, is_statutory: statutory, is_gapless: gapless, allocate_on: allocateOn })
    }, 250)
    return () => clearTimeout(t)
  }, [previewMut, format, prefix, pad, start, subType, statutory, gapless, allocateOn])

  const pv = preview.data
  const issues = pv?.issues ?? []
  const hasError = issues.some((i) => i.severity === 'ERROR')

  function save() {
    setErrors({})
    const body = {
      document_type: documentType.trim(), document_label: documentLabel.trim(), sub_type: subType.trim() || null,
      format_string: format, prefix: prefix.trim() || null, padding_width: pad, start_number: start,
      reset_frequency: reset, allocate_on: allocateOn, is_statutory: statutory, is_gapless: gapless,
    }
    const onError = (e: unknown) => {
      if (e instanceof ProblemError) {
        const fe: Record<string, string> = {}
        for (const x of e.problem.errors ?? []) fe[x.field] = x.message
        setErrors(fe)
        toast.error(e.problem.title || 'Save failed', e.problem.detail)
      } else toast.error('Save failed', 'Unknown error.')
    }
    if (isNew) create.mutate(body, { onSuccess: () => { toast.success('Series created', `Next number: ${pv?.numbers[0] ?? ''}`); onClose() }, onError })
    else update.mutate({ uid: s!.uid, body: { ...body, version: s!.version } }, { onSuccess: () => { toast.success('Series saved', 'Issued numbers are never rewritten.'); onClose() }, onError })
  }

  const docTypes = [...new Set(allSeries.map((x) => x.document_type))]

  return (
    <Modal open onClose={onClose} size="lg"
      title={isNew ? 'New number series' : `Edit series — ${s?.document_label}`}
      description="The format is data, not code. Changing it affects future allocations only; issued numbers are never rewritten."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={create.isPending || update.isPending} disabled={hasError || !documentType.trim() || !documentLabel.trim()}>Save series</Button></>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3.5">
          {isNew ? (
            <Input label="Document type" required value={documentType} error={errors.document_type} onChange={(e) => setDocumentType(e.target.value.toUpperCase())} hint="e.g. PURCHASE_ORDER" list="doctypes" />
          ) : (
            <Input label="Document type" value={documentType} disabled readOnlyReason={issued ? 'Locked — series has issued numbers' : 'Immutable'} />
          )}
          <datalist id="doctypes">{docTypes.map((t) => <option key={t} value={t} />)}</datalist>
          <Input label="Label" required value={documentLabel} error={errors.document_label} onChange={(e) => setDocumentLabel(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Sub-type" value={subType} disabled={issued} onChange={(e) => setSubType(e.target.value.toUpperCase())} placeholder="e.g. DOMESTIC" />
            <Input label="Prefix" value={prefix} disabled={issued} onChange={(e) => setPrefix(e.target.value.toUpperCase())} />
          </div>
          <Input label="Format string" required value={format} error={errors.format_string} disabled={issued} onChange={(e) => setFormat(e.target.value)} className="font-mono" />
          <div className="flex flex-wrap gap-1">
            {TOKENS.map((t) => <button key={t} type="button" disabled={issued} onClick={() => setFormat((f) => f + t)} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-brand-600 hover:bg-surface-3 disabled:opacity-40">{t}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start number" type="number" value={start} disabled={issued} onChange={(e) => setStart(Number(e.target.value))} />
            <Input label="Padding width" type="number" min={1} max={12} value={pad} onChange={(e) => setPad(Number(e.target.value))} hint={issued ? 'Only widening allowed' : undefined} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Reset frequency" value={reset} onChange={(e) => setReset(e.target.value)} options={RESETS} />
            <Select label="Allocate on" value={allocateOn} disabled={statutory} onChange={(e) => setAllocateOn(e.target.value)}
              options={[{ value: 'DRAFT', label: 'Draft creation' }, { value: 'APPROVAL', label: 'Approval' }]} />
          </div>
          <div className="space-y-2.5 rounded border border-border p-3">
            <Switch checked={statutory} onChange={(v) => { setStatutory(v); if (v) { setGapless(true); setAllocateOn('APPROVAL') } }} label="Statutory series (GST / e-invoice)" />
            <Switch checked={gapless} onChange={setGapless} disabled={statutory} label="Gapless — no missing numbers permitted" />
            <p className="text-2xs text-fg-subtle">Statutory forces gapless + allocate-on-approval and caps the number at 16 GST-legal characters.</p>
          </div>
        </div>

        <div className="space-y-3.5">
          <div>
            <p className="field-label">Live preview {preview.isPending && <span className="text-2xs text-fg-subtle">…</span>}</p>
            <div className="space-y-1.5 rounded border border-border bg-surface-2 p-3">
              {(pv?.numbers ?? []).map((p, i) => (
                <p key={i} className={i === 0 ? 'font-mono text-sm font-semibold text-fg' : 'font-mono text-xs text-fg-muted'}>
                  {p}{i === 0 && <span className="ml-2 text-2xs font-normal text-fg-subtle">next</span>}
                </p>
              ))}
              {pv && <p className="mt-1 text-2xs text-fg-subtle">Max length: {pv.max_length} chars</p>}
            </div>
          </div>
          {issues.length > 0 && (
            <div className="space-y-1.5">
              {issues.map((i, idx) => (
                <div key={idx} className={i.severity === 'ERROR' ? 'flex items-start gap-2 rounded border border-danger/30 bg-danger/5 px-2.5 py-2 text-2xs text-danger' : 'flex items-start gap-2 rounded border border-warning/30 bg-warning/5 px-2.5 py-2 text-2xs text-warning'}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="text-fg-muted">{i.message}</span>
                </div>
              ))}
            </div>
          )}
          {issued && <Alert tone="info">This series has issued {s?.issued_count} numbers. Format, prefix and sub-type are locked; you may only widen padding or change reset/behaviour.</Alert>}
        </div>
      </div>
    </Modal>
  )
}

/* ─────────────────────────── Simulator ─────────────────────────── */
function SimulatorModal({ open, series, onClose }: { open: boolean; series: Series[]; onClose: () => void }) {
  const simulate = useSimulate()
  const [docType, setDocType] = useState('')
  const [subType, setSubType] = useState('')
  const [branch, setBranch] = useState('CHN')
  const [plant, setPlant] = useState('P1')
  const result = simulate.data

  useEffect(() => { if (open && series.length && !docType) setDocType(series[0].document_type) }, [open, series, docType])
  if (!open) return null

  const docTypes = [...new Set(series.map((s) => s.document_type))]
  function run() {
    simulate.mutate({ document_type: docType, sub_type: subType || null, branch_code: branch, plant_code: plant })
  }

  return (
    <Modal open onClose={onClose} title="Numbering simulator" description="Shows which series would be selected and what number it would receive — without consuming a number."
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="primary" onClick={run} loading={simulate.isPending}>Simulate</Button></>}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)} options={docTypes.map((t) => ({ value: t, label: t }))} />
          <Input label="Sub-type (optional)" value={subType} onChange={(e) => setSubType(e.target.value.toUpperCase())} placeholder="DOMESTIC" />
          <Input label="Branch code" value={branch} onChange={(e) => setBranch(e.target.value.toUpperCase())} />
          <Input label="Plant code" value={plant} onChange={(e) => setPlant(e.target.value.toUpperCase())} />
        </div>
        {result && (result.matched ? (
          <div className="rounded border border-border bg-surface-2 p-3">
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Resolved series</p>
            <p className="mt-0.5 text-xs text-fg">{result.series_label} · <span className="font-mono">{result.format}</span></p>
            <p className="mt-2 text-2xs uppercase tracking-wide text-fg-subtle">Number that would be issued</p>
            <p className="mt-0.5 font-mono text-base font-semibold text-fg">{result.next_numbers?.[0]}</p>
            <p className="mt-1 text-2xs text-fg-muted">Next 5: {result.next_numbers?.join(', ')}</p>
            <p className="mt-1 text-2xs text-fg-subtle">On the next FY roll: <span className="font-mono">{result.on_fy_roll}</span></p>
          </div>
        ) : (
          <Alert tone="danger" title="No series matches — document creation would be blocked">{result.reason}</Alert>
        ))}
        <Alert tone="info" title="Series selection order">Most specific wins: sub-type + branch + plant, then progressively broader, ending at the company default. If none matches, creation is blocked rather than falling back to a raw counter.</Alert>
      </div>
    </Modal>
  )
}
