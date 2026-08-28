import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { workInstructions as seedInstructions } from '@/mock/mes'
import type { WorkInstruction } from '@/types/mes'

const KIND_TONE: Record<string, 'brand' | 'progress' | 'success' | 'warning'> = {
  SOP: 'brand',
  DRAWING: 'progress',
  IMAGE: 'success',
  VIDEO: 'warning',
}

/**
 * Digital work instructions — the SOP the operator reads at the machine.
 * Version-controlled: only the approved revision is shown on the shop floor,
 * and superseding one pushes the change to every station using it.
 */
export function InstructionsPage() {
  const toast = useToast()
  const seed = useMemo(() => seedInstructions, [])
  const { rows: instructions, update } = useCollection<WorkInstruction>('mes:instruction', seed)
  const rowEdit = useRowEdit<WorkInstruction>({
    key: 'mes:instruction',
    seed: seed,
    entity: 'Work instruction',
    titleOf: (r) => r.code,
  })

  const [viewing, setViewing] = useState<WorkInstruction | null>(null)
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({})

  const approved = instructions.filter((i) => i.status === 'APPROVED')
  const draft = instructions.filter((i) => i.status === 'DRAFT')

  const columns: Column<WorkInstruction>[] = [
    { key: 'code', header: 'Instruction', sortable: true, width: '12rem', render: (i) => (
      <button type="button" className="text-left font-mono text-xs font-medium text-brand-600 hover:underline" onClick={() => setViewing(i)}>
        {i.code}
      </button>
    ) },
    { key: 'operationName', header: 'Operation', sortable: true, render: (i) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{i.operationName}</p>
        <p className="font-mono text-2xs text-fg-subtle">{i.operationCode}</p>
      </div>
    ) },
    { key: 'itemCode', header: 'Applies to', sortable: true, render: (i) => <span className="font-mono text-2xs">{i.itemCode}</span> },
    { key: 'revision', header: 'Revision', align: 'center', width: '7rem', sortable: true, render: (i) => (
      <Badge tone="neutral" size="sm" dot={false}>{i.revision}</Badge>
    ) },
    { key: 'effectiveFrom', header: 'Effective from', sortable: true, width: '9rem', accessor: (i) => i.effectiveFrom, render: (i) => formatDate(i.effectiveFrom) },
    { key: 'approvedBy', header: 'Approved by', sortable: true },
    { key: 'steps', header: 'Steps', align: 'right', width: '6rem', accessor: (i) => i.steps.length, render: (i) => <span className="tabular text-fg-muted">{i.steps.length}</span> },
    { key: 'qualityCheckpoints', header: 'QC points', align: 'right', width: '7rem', accessor: (i) => i.qualityCheckpoints.length, render: (i) => <span className="tabular text-fg-muted">{i.qualityCheckpoints.length}</span> },
    { key: 'attachments', header: 'Attachments', width: '13rem', render: (i) => (
      <div className="flex flex-wrap gap-1">
        {i.attachments.map((a) => (
          <Badge key={a.name} tone={KIND_TONE[a.kind]} size="sm" dot={false}>{a.kind.toLowerCase()}</Badge>
        ))}
      </div>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (i) => (
      <Badge tone={i.status === 'APPROVED' ? 'success' : i.status === 'DRAFT' ? 'warning' : 'neutral'} size="sm" dot={i.status !== 'SUPERSEDED'}>
        {i.status === 'APPROVED' ? 'Approved' : i.status === 'DRAFT' ? 'Draft' : 'Superseded'}
      </Badge>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'work-instructions', 'Work instructions', columnsFromTable(columns), instructions)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Work instructions"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Instructions' }]}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-success">{approved.length}</span> approved instruction
        {approved.length === 1 ? '' : 's'} live on the floor
        {draft.length > 0 && <>, <span className="font-medium text-warning">{draft.length}</span> still in draft</>}. Only the
        approved revision reaches the station screen — that is the whole point of keeping them here rather than in a folder.
      </p>

      <DataTable
        rows={instructions}
        columns={columns}
        rowKey={(i) => i.uid}
        searchPlaceholder="Search code, operation or item…"
        onExport={doExport}
        emptyTitle="No work instructions"
        rowClassName={(i) => cn(i.status === 'SUPERSEDED' && 'opacity-60', i.status === 'DRAFT' && 'bg-warning/[0.03]')}
        rowActions={(i) => (
          <>
            {rowEdit.actions(i)}
            <MenuItem label="Open at the station" onClick={() => setViewing(i)} />
            <MenuItem
              label="Approve this revision"
              disabled={i.status !== 'DRAFT'}
              onClick={() => {
                const superseded = instructions.find((x) => x.operationCode === i.operationCode && x.status === 'APPROVED')
                if (superseded) update(superseded.uid, { status: 'SUPERSEDED' })
                update(i.uid, { status: 'APPROVED' })
                toast.success(
                  'Revision approved',
                  superseded
                    ? `${i.code} is now live; ${superseded.code} has been superseded and will disappear from the station screens.`
                    : `${i.code} is now live on every ${i.operationName} station.`,
                )
              }}
            />
            <MenuItem separatorBefore label="Print the instruction sheet" onClick={() => doExport('pdf')} />
          </>
        )}
      />

      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.operationName} — ${viewing.revision}` : ''}
        description={viewing ? `${viewing.code} · effective ${formatDate(viewing.effectiveFrom)} · approved by ${viewing.approvedBy}` : ''}
        width="max-w-2xl"
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
              <Button
                variant={acknowledged[viewing.uid] ? 'success' : 'primary'}
                onClick={() => {
                  setAcknowledged({ ...acknowledged, [viewing.uid]: true })
                  toast.success('Read and understood', `${viewing.code} acknowledged. The acknowledgement is stamped against your name and this revision.`)
                }}
              >
                {acknowledged[viewing.uid] ? 'Acknowledged' : 'I have read and understood'}
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-5">
            {viewing.safetyNotes.length > 0 && (
              <div className="rounded border border-danger/30 bg-danger/5 p-3">
                <p className="text-2xs font-semibold uppercase tracking-wide text-danger">Safety — read before starting</p>
                <ul className="mt-2 space-y-1">
                  {viewing.safetyNotes.map((n) => (
                    <li key={n} className="flex gap-2 text-xs text-fg">
                      <span className="text-danger">•</span>
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">How to do it</h3>
              <ol className="space-y-2">
                {viewing.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 rounded border border-border p-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-2xs font-semibold tabular text-brand-600">
                      {i + 1}
                    </span>
                    <span className="text-xs leading-relaxed text-fg">{s}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Machine settings</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {viewing.machineSettings.map((m) => (
                  <div key={m.label} className="flex items-center justify-between rounded border border-border bg-surface-2 px-3 py-2">
                    <span className="text-xs text-fg-muted">{m.label}</span>
                    <span className="font-mono text-xs font-medium text-fg">{m.value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">What quality will check</h3>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 text-2xs uppercase tracking-wide text-fg-subtle">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Parameter</th>
                      <th className="px-3 py-2 text-left font-medium">Specification</th>
                      <th className="px-3 py-2 text-left font-medium">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.qualityCheckpoints.map((q) => (
                      <tr key={q.parameter} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-fg">{q.parameter}</td>
                        <td className="px-3 py-2 font-mono text-fg-muted">{q.specification}</td>
                        <td className="px-3 py-2 text-fg-muted">{q.frequency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Attached</h3>
              <div className="space-y-1.5">
                {viewing.attachments.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => toast.info('Opening attachment', `${a.name} — in the live system this opens the document viewer at the station.`)}
                    className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="truncate text-xs text-fg">{a.name}</span>
                    <Badge tone={KIND_TONE[a.kind]} size="sm" dot={false}>{a.kind.toLowerCase()}</Badge>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </Drawer>

      <Card className="mt-4">
        <CardHeader title="Why these live in the system and not in a lever-arch file" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p><span className="font-medium text-fg">One live revision.</span> Approving a new revision supersedes the old one everywhere at once. Nobody is working from last year's photocopy.</p>
          <p><span className="font-medium text-fg">Acknowledgement is recorded.</span> When a revision changes a setting that matters, you can see who has read it and who has not.</p>
          <p><span className="font-medium text-fg">The QC table is the same one quality uses.</span> The operator sees the specification they will be measured against before they start, not after they fail.</p>
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
