import { useMemo, useState } from 'react'
import { Check, Download, FileUp, Play, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { newUid, useCollection } from '@/store/data'
import { parseDelimited, validateImport, type ImportValidation } from '@/lib/platformFlow'
import { importRuns as seedRuns, importSpecs as seedSpecs } from '@/mock/platform'
import type { ImportRun, ImportSpec } from '@/types/platform'

/**
 * Import and export framework (Volume 15, Ch 13).
 *
 * Nothing is written until the whole file has been checked and a person has
 * seen what will happen. The preview is the screen — a validator that reports
 * "7 errors" without saying which rows and why is a validator nobody can act on.
 */

const RUN_TONE: Record<ImportRun['status'], 'draft' | 'success' | 'danger' | 'neutral' | 'warning'> = {
  DRAFT: 'draft', VALIDATED: 'warning', FAILED_VALIDATION: 'danger', COMMITTED: 'success', ROLLED_BACK: 'neutral',
}

export function DataImportPage() {
  const toast = useToast()
  const specs = useCollection<ImportSpec>('plat:importSpecs', useMemo(() => seedSpecs, []))
  const runs = useCollection<ImportRun>('plat:importRuns', useMemo(() => seedRuns, []))

  const [tab, setTab] = useState('new')
  const [specCode, setSpecCode] = useState(seedSpecs[0]?.code ?? '')
  const [pasted, setPasted] = useState('')
  const [openSpec, setOpenSpec] = useState<ImportSpec | null>(null)
  const [openRun, setOpenRun] = useState<ImportRun | null>(null)
  const [confirming, setConfirming] = useState(false)

  const liveSpecs = useMemo(() => specs.rows.filter((s) => !s.deletedAt), [specs.rows])
  const liveRuns = useMemo(() => runs.rows.filter((r) => !r.deletedAt), [runs.rows])
  const spec = liveSpecs.find((s) => s.code === specCode) ?? liveSpecs[0]

  const parsed = useMemo(() => (pasted.trim() ? parseDelimited(pasted) : []), [pasted])

  /** References the sample data can be checked against, so the demo is honest. */
  const references = useMemo(
    () => ({
      Item: ['RM-COIL-304-050', 'RM-COIL-304-060', 'FG-SS-750-BLK', 'SA-LID-750'],
      Warehouse: ['WH-RM', 'WH-FG', 'WH-WIP', 'WH-SPARES'],
      Department: ['Production', 'Quality', 'Maintenance', 'Stores', 'Procurement', 'Finance'],
    }),
    [],
  )

  const validation: ImportValidation | null = useMemo(
    () => (spec && parsed.length ? validateImport(parsed, spec, { references }) : null),
    [spec, parsed, references],
  )

  const k = useMemo(() => ({
    specs: liveSpecs.length,
    runs: liveRuns.length,
    committed: liveRuns.filter((r) => r.status === 'COMMITTED').length,
    failed: liveRuns.filter((r) => r.status === 'FAILED_VALIDATION').length,
    rowsLoaded: liveRuns.filter((r) => r.status === 'COMMITTED').reduce((s, r) => s + r.validRows, 0),
  }), [liveSpecs, liveRuns])

  /* ── actions ────────────────────────────────────────────────── */

  function loadSample() {
    if (!spec) return
    const header = spec.fields.map((f) => f.key).join(',')
    const row = spec.fields.map((f) => spec.sampleRow[f.key] ?? '').join(',')
    setPasted(`${header}\n${row}`)
    toast.success('Sample loaded', 'One valid row, so you can see the shape the file must take.')
  }

  function downloadTemplate() {
    if (!spec) return
    const cols: ExportColumn<Record<string, string>>[] = spec.fields.map((f) => ({ header: f.key, value: (r) => r[f.key] ?? '' }))
    const n = exportRows('csv', `template-${spec.code.toLowerCase()}`, `${spec.name} import template`, cols, [spec.sampleRow])
    toast.success('Template downloaded', `${n} sample row, with every column in the order the importer expects.`)
  }

  function commit() {
    if (!spec || !validation) return
    if (!validation.canCommit) { toast.error('This file cannot be committed as it stands.'); return }

    const now = new Date().toISOString()
    runs.create({
      uid: newUid('run'),
      docNo: `IMP/26-27/${String(liveRuns.length + 46).padStart(4, '0')}`,
      specCode: spec.code, specName: spec.name,
      fileName: 'pasted-data.csv', uploadedBy: 'You', uploadedAt: now,
      rowCount: validation.rows.length,
      validRows: validation.validRows,
      errorRows: validation.errorRows,
      warningRows: validation.warningRows,
      duplicateRows: validation.duplicateRows,
      status: 'COMMITTED',
      issues: validation.issues,
      committedAt: now, rolledBackAt: null, version: 1,
    })
    toast.success(
      `${validation.validRows} rows imported`,
      validation.errorRows ? `${validation.errorRows} rows with errors were skipped.` : 'Every row was valid.',
    )
    setConfirming(false)
    setPasted('')
    setTab('history')
  }

  /**
   * Rolling back reverses what the run wrote. It is only possible while nothing
   * later has depended on the data — which is why it is offered on the run
   * rather than on the records.
   */
  function rollback(run: ImportRun) {
    if (run.status !== 'COMMITTED') { toast.error('Only a committed run can be rolled back.'); return }
    runs.update(run.uid, { status: 'ROLLED_BACK', rolledBackAt: new Date().toISOString() })
    toast.success(`${run.docNo} rolled back`, `${run.validRows} rows removed.`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const runColumns: Column<ImportRun>[] = [
    { key: 'doc', header: 'Run', width: '14rem', render: (r) => (<><p className="font-mono text-2xs text-fg">{r.docNo}</p><p className="text-3xs text-fg-subtle">{formatDateTime(r.uploadedAt)}</p></>) },
    { key: 'spec', header: 'Import', width: '14rem', render: (r) => (<><p className="text-xs text-fg">{r.specName}</p><p className="font-mono text-3xs text-fg-subtle">{r.specCode}</p></>) },
    { key: 'file', header: 'File', width: '16rem', render: (r) => <span className="truncate font-mono text-2xs text-fg-muted">{r.fileName}</span> },
    { key: 'by', header: 'By', width: '11rem', render: (r) => <span className="text-2xs text-fg-muted">{r.uploadedBy}</span> },
    { key: 'rows', header: 'Rows', width: '9rem', align: 'right', render: (r) => <span className="text-xs tabular text-fg">{r.rowCount}</span> },
    {
      key: 'outcome', header: 'Outcome', width: '16rem',
      render: (r) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={r.rowCount ? (r.validRows / r.rowCount) * 100 : 0} tone={r.errorRows ? 'danger' : 'success'} className="w-14" />
          <span className="text-2xs tabular text-fg-muted">
            {r.validRows} ok{r.errorRows ? ` · ${r.errorRows} bad` : ''}{r.duplicateRows ? ` · ${r.duplicateRows} dup` : ''}
          </span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', width: '13rem', render: (r) => <Badge tone={RUN_TONE[r.status]} size="sm">{r.status.replace(/_/g, ' ').toLowerCase()}</Badge> },
  ]

  const specColumns: Column<ImportSpec>[] = [
    { key: 'spec', header: 'Import', width: '18rem', render: (s) => (<><p className="text-xs text-fg">{s.name}</p><p className="font-mono text-2xs text-fg-subtle">{s.code}</p></>) },
    { key: 'module', header: 'Module', width: '11rem', render: (s) => <Badge tone="neutral" size="sm" dot={false}>{s.module}</Badge> },
    { key: 'entity', header: 'Writes to', width: '12rem', render: (s) => <span className="text-2xs text-fg-muted">{s.entity}</span> },
    { key: 'fields', header: 'Columns', width: '9rem', align: 'right', render: (s) => (<><p className="text-xs tabular text-fg">{s.fields.length}</p><p className="text-3xs text-fg-subtle">{s.fields.filter((f) => f.required).length} required</p></>) },
    { key: 'key', header: 'Natural key', width: '15rem', render: (s) => <span className="text-2xs text-fg-muted">{s.fields.filter((f) => f.isKey).map((f) => f.label).join(' + ') || 'None'}</span> },
    { key: 'dup', header: 'On duplicate', width: '11rem', render: (s) => <Badge tone={s.onDuplicate === 'REJECT' ? 'danger' : s.onDuplicate === 'UPDATE' ? 'warning' : 'neutral'} size="sm" dot={false}>{s.onDuplicate.toLowerCase()}</Badge> },
    { key: 'mode', header: 'Mode', width: '13rem', render: (s) => <span className="text-2xs text-fg-muted">{s.allOrNothing ? 'All or nothing' : 'Skip bad rows'}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Import & export"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Import & export' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'new', label: 'New import' },
              { id: 'specs', label: 'Import definitions', count: k.specs },
              { id: 'history', label: 'History', count: k.runs },
            ]}
          />
        }
      />

      {tab === 'new' && spec && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Rows pasted" value={parsed.length} sub={parsed.length ? 'Nothing has been written yet' : 'Paste a file to begin'} icon={<FileUp />} tone="brand" />
            <StatTile label="Valid" value={validation?.validRows ?? 0} sub={validation ? `${validation.warningRows} with warnings` : '—'} tone={validation && validation.validRows ? 'success' : 'neutral'} />
            <StatTile label="Errors" value={validation?.errorRows ?? 0} sub={validation?.errorRows ? 'These rows cannot be written' : 'No blocking errors'} tone={validation?.errorRows ? 'danger' : 'success'} />
            <StatTile label="Duplicates" value={validation?.duplicateRows ?? 0} sub={`Will be ${spec.onDuplicate.toLowerCase()}d`} tone={validation?.duplicateRows ? 'warning' : 'neutral'} />
          </div>

          <Card className="mb-3">
            <CardBody className="flex flex-wrap items-end gap-3">
              <Select label="What are you importing" value={specCode} onChange={(e) => { setSpecCode(e.target.value); setPasted('') }} className="w-72">
                {liveSpecs.map((s) => (<option key={s.uid} value={s.code}>{s.name} — {s.module}</option>))}
              </Select>
              <Button variant="outline" size="sm" icon={<Download />} onClick={downloadTemplate}>Download the template</Button>
              <Button variant="ghost" size="sm" onClick={loadSample}>Load a sample</Button>
              <Button variant="ghost" size="sm" onClick={() => setOpenSpec(spec)}>What the columns mean</Button>
              <span className="ml-auto text-2xs text-fg-subtle">
                {spec.allOrNothing ? 'All or nothing — one bad row blocks the whole file' : 'Bad rows are skipped, the rest are imported'}
              </span>
            </CardBody>
          </Card>

          <Card className="mb-3">
            <CardHeader title="Paste the file" description="Comma separated, with the column names on the first line" />
            <CardBody>
              <Textarea
                rows={7}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={`${spec.fields.map((f) => f.key).join(',')}\n${spec.fields.map((f) => spec.sampleRow[f.key] ?? '').join(',')}`}
                className="font-mono text-xs"
                aria-label="Paste CSV data"
              />
              <p className="mt-1 text-2xs text-fg-subtle">
                Required columns: {spec.fields.filter((f) => f.required).map((f) => f.key).join(', ')}.
                A quoted comma inside a value survives — "Alpha, Beta Pvt Ltd" stays one field.
              </p>
            </CardBody>
          </Card>

          {validation && (
            <>
              <Alert
                tone={validation.errorRows ? (spec.allOrNothing ? 'danger' : 'warning') : 'tip'}
                title={validation.errorRows ? 'The file has problems' : 'The file is clean'}
                className="mb-3"
              >
                {validation.summary}
              </Alert>

              <Card className="mb-3">
                <CardHeader
                  title="Preview"
                  description="Exactly what will be written, row by row. Nothing has been saved."
                  actions={
                    <Button variant="primary" size="sm" icon={<Play />} onClick={() => setConfirming(true)} disabled={!validation.canCommit}>
                      Import {validation.validRows} row{validation.validRows === 1 ? '' : 's'}
                    </Button>
                  }
                />
                <CardBody className="p-0">
                  <div className="max-h-96 overflow-auto">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th style={{ width: '4rem' }}>Row</th>
                          <th style={{ width: '7rem' }}>Verdict</th>
                          {spec.fields.map((f) => (<th key={f.key} style={{ minWidth: '9rem' }}>{f.label}</th>))}
                          <th style={{ minWidth: '20rem' }}>Problems</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validation.rows.map((r) => (
                          <tr key={r.rowNo} className={r.errors.length ? 'bg-danger/5' : r.warnings.length ? 'bg-warning/5' : undefined}>
                            <td className="text-2xs tabular text-fg-subtle">{r.rowNo}</td>
                            <td>
                              {r.errors.length
                                ? <Badge tone="danger" size="sm">Error</Badge>
                                : r.isDuplicate
                                  ? <Badge tone="warning" size="sm">Duplicate</Badge>
                                  : r.warnings.length
                                    ? <Badge tone="warning" size="sm">Warning</Badge>
                                    : <Badge tone="success" size="sm">Ok</Badge>}
                            </td>
                            {spec.fields.map((f) => (
                              <td key={f.key} className="text-2xs text-fg">
                                {r.data[f.key] || <span className="text-fg-subtle">—</span>}
                              </td>
                            ))}
                            <td>
                              {[...r.errors, ...r.warnings].length === 0
                                ? <span className="text-2xs text-fg-subtle">—</span>
                                : (
                                  <ul className="space-y-0.5">
                                    {r.errors.map((e, i) => (<li key={`e${i}`} className="text-2xs text-danger">{e}</li>))}
                                    {r.warnings.map((w, i) => (<li key={`w${i}`} className="text-2xs text-warning">{w}</li>))}
                                  </ul>
                                )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}

      {tab === 'specs' && (
        <DataTable
          rows={liveSpecs}
          columns={specColumns}
          rowKey={(s) => s.uid}
          onRowClick={(s) => setOpenSpec(s)}
          rowActions={(s) => (
            <>
              <MenuItem label="Edit" onClick={() => setOpenSpec(s)} />
              <MenuItem label="Use this import" onClick={() => { setSpecCode(s.code); setTab('new') }} />
            </>
          )}
          emptyTitle="No import definitions"
          emptyDescription="Each defines the columns and the rules for one entity."
        />
      )}

      {tab === 'history' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Runs" value={k.runs} sub={`${k.committed} committed`} tone="brand" />
            <StatTile label="Rows loaded" value={k.rowsLoaded.toLocaleString('en-IN')} sub="Across every committed run" tone="success" />
            <StatTile label="Failed validation" value={k.failed} sub={k.failed ? 'Nothing was written for these' : 'None'} tone={k.failed ? 'danger' : 'success'} />
            <StatTile label="Rolled back" value={liveRuns.filter((r) => r.status === 'ROLLED_BACK').length} sub="Committed and then reversed" tone="neutral" />
          </div>

          <DataTable
            rows={liveRuns.slice().sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))}
            columns={runColumns}
            rowKey={(r) => r.uid}
            onRowClick={(r) => setOpenRun(r)}
            rowClassName={(r) => (r.status === 'FAILED_VALIDATION' ? 'bg-danger/5' : r.status === 'ROLLED_BACK' ? 'opacity-60' : undefined)}
            rowActions={(r) => (
              <>
                <MenuItem label="Edit" onClick={() => setOpenRun(r)} />
                {r.status === 'COMMITTED' && <MenuItem label="Roll back" onClick={() => rollback(r)} />}
                <MenuItem label="Delete" danger onClick={() => { runs.remove(r.uid); toast.success(`${r.docNo} removed from the history`) }} />
              </>
            )}
            emptyTitle="No imports yet"
            emptyDescription="Every run is kept, whether it committed or not."
          />
        </>
      )}

      {/* ── spec detail ──────────────────────────────────────── */}
      <Drawer open={!!openSpec} onClose={() => setOpenSpec(null)} title={openSpec ? `${openSpec.code} · ${openSpec.name}` : ''} width="max-w-2xl">
        {openSpec && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-fg-muted">{openSpec.description}</p>
            <DataGrid columns={2} items={[
              { label: 'Module', value: openSpec.module },
              { label: 'Writes to', value: openSpec.entity },
              { label: 'Natural key', value: openSpec.fields.filter((f) => f.isKey).map((f) => f.label).join(' + ') || 'None — duplicates cannot be detected' },
              { label: 'On duplicate', value: openSpec.onDuplicate === 'REJECT' ? 'Reject the row' : openSpec.onDuplicate === 'UPDATE' ? 'Update the existing record' : 'Skip it' },
              { label: 'Mode', value: openSpec.allOrNothing ? 'All or nothing' : 'Skip bad rows and import the rest' },
              { label: 'Columns', value: `${openSpec.fields.length}, of which ${openSpec.fields.filter((f) => f.required).length} required` },
            ]} />

            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Columns</p>
              <table className="grid-table">
                <thead><tr><th>Column</th><th style={{ width: '9rem' }}>Type</th><th style={{ width: '6rem' }}>Required</th><th>Rules</th></tr></thead>
                <tbody>
                  {openSpec.fields.map((f) => (
                    <tr key={f.key}>
                      <td><p className="text-xs text-fg">{f.label}</p><p className="font-mono text-3xs text-fg-subtle">{f.key}{f.isKey ? ' · key' : ''}</p></td>
                      <td><Badge tone="neutral" size="sm" dot={false}>{f.type.toLowerCase()}</Badge></td>
                      <td>{f.required ? <Badge tone="danger" size="sm" dot={false}>Yes</Badge> : <span className="text-2xs text-fg-subtle">No</span>}</td>
                      <td>
                        <p className="text-2xs text-fg-muted">
                          {f.options ? `One of: ${f.options.join(', ')}` : ''}
                          {f.referenceOf ? `Must already exist in ${f.referenceOf}` : ''}
                          {f.min !== undefined ? `Minimum ${f.min}. ` : ''}
                          {f.max !== undefined ? `Maximum ${f.max}. ` : ''}
                          {f.maxLength ? `Up to ${f.maxLength} characters. ` : ''}
                          {f.type === 'DATE' ? 'Format YYYY-MM-DD. ' : ''}
                          {f.hint ?? ''}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="mb-1 text-3xs uppercase tracking-wider text-fg-subtle">A valid row looks like this</p>
              <pre className="overflow-x-auto font-mono text-2xs text-fg">{openSpec.fields.map((f) => f.key).join(',')}{'\n'}{openSpec.fields.map((f) => openSpec.sampleRow[f.key] ?? '').join(',')}</pre>
            </div>

            <div className="flex gap-2 border-t border-border pt-3">
              <Button variant="primary" size="sm" onClick={() => { setSpecCode(openSpec.code); setTab('new'); setOpenSpec(null) }}>Use this import</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── run detail ───────────────────────────────────────── */}
      <Drawer open={!!openRun} onClose={() => setOpenRun(null)} title={openRun ? `${openRun.docNo} · ${openRun.specName}` : ''} width="max-w-2xl">
        {openRun && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={RUN_TONE[openRun.status]} size="md">{openRun.status.replace(/_/g, ' ').toLowerCase()}</Badge>
              <span className="font-mono text-2xs text-fg-subtle">{openRun.fileName}</span>
            </div>

            <DataGrid columns={3} items={[
              { label: 'Uploaded', value: `${openRun.uploadedBy} · ${formatDateTime(openRun.uploadedAt)}` },
              { label: 'Rows in the file', value: String(openRun.rowCount) },
              { label: 'Valid', value: String(openRun.validRows) },
              { label: 'Errors', value: String(openRun.errorRows) },
              { label: 'Warnings', value: String(openRun.warningRows) },
              { label: 'Duplicates', value: String(openRun.duplicateRows) },
              { label: 'Committed', value: openRun.committedAt ? formatDateTime(openRun.committedAt) : 'Not committed' },
              { label: 'Rolled back', value: openRun.rolledBackAt ? formatDateTime(openRun.rolledBackAt) : '—' },
            ]} />

            {openRun.status === 'FAILED_VALIDATION' && (
              <Alert tone="danger" title="Nothing was written">
                This run failed validation, so no record was created or changed. Fix the rows below and upload the file again.
              </Alert>
            )}
            {openRun.status === 'ROLLED_BACK' && (
              <Alert tone="info" title="Reversed">
                {openRun.validRows} rows were written and then removed on {openRun.rolledBackAt ? formatDateTime(openRun.rolledBackAt) : '—'}.
              </Alert>
            )}

            {openRun.issues.length > 0 && (
              <div>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Issues ({openRun.issues.length})</p>
                <table className="grid-table">
                  <thead><tr><th style={{ width: '5rem' }}>Row</th><th style={{ width: '8rem' }}>Column</th><th style={{ width: '7rem' }}>Severity</th><th>Message</th></tr></thead>
                  <tbody>
                    {openRun.issues.map((i, idx) => (
                      <tr key={idx} className={i.severity === 'ERROR' ? 'bg-danger/5' : undefined}>
                        <td className="text-2xs tabular text-fg-muted">{i.rowNo}</td>
                        <td className="font-mono text-2xs text-fg-muted">{i.field ?? '—'}</td>
                        <td><Badge tone={i.severity === 'ERROR' ? 'danger' : 'warning'} size="sm">{i.severity.toLowerCase()}</Badge></td>
                        <td className="text-xs text-fg">{i.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {openRun.status === 'COMMITTED' && (
              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" icon={<RotateCcw />} onClick={() => { rollback(openRun); setOpenRun(null) }}>Roll this run back</Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ── confirm ──────────────────────────────────────────── */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Import this file"
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button><Button variant="primary" size="sm" onClick={commit}>Import</Button></>}
      >
        {spec && validation && (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">
              {validation.validRows} row{validation.validRows === 1 ? '' : 's'} will be written to <strong className="text-fg">{spec.entity}</strong>.
              {validation.errorRows > 0 && ` ${validation.errorRows} row(s) with errors will be skipped.`}
              {validation.duplicateRows > 0 && ` ${validation.duplicateRows} duplicate(s) will be ${spec.onDuplicate.toLowerCase()}d.`}
            </p>
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="flex justify-between py-0.5"><span className="text-fg-muted">Rows in the file</span><span className="tabular text-fg">{validation.rows.length}</span></p>
              <p className="flex justify-between py-0.5"><span className="text-fg-muted">Will be written</span><span className="font-medium tabular text-success">{validation.validRows}</span></p>
              <p className="flex justify-between py-0.5"><span className="text-fg-muted">Skipped</span><span className="tabular text-danger">{validation.errorRows}</span></p>
              <p className="flex justify-between border-t border-border py-0.5 pt-1"><span className="text-fg-muted">Target</span><span className="text-fg">{spec.module} · {spec.entity}</span></p>
            </div>
            <Alert tone="info" title="This can be undone">
              The run is recorded and can be rolled back from the history, provided nothing has since been posted against the imported records.
            </Alert>
          </div>
        )}
      </Modal>
    </div>
  )
}
