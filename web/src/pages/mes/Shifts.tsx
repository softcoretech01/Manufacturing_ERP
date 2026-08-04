import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Textarea } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { Duration, MesStatusBadge } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { shiftLogs as seedShifts } from '@/mock/mes'
import type { ShiftLog } from '@/types/mes'

const SHIFT_NAME: Record<string, string> = { A: 'A — morning', B: 'B — evening', C: 'C — night' }

/** Shift management — target against output, and the handover notes that matter. */
export function ShiftsPage() {
  const toast = useToast()
  const seed = useMemo(() => seedShifts, [])
  const { rows: logs, update } = useCollection<ShiftLog>('mes:shift', seed)
  const rowEdit = useRowEdit<ShiftLog>({
    key: 'mes:shift',
    seed,
    entity: 'Shift log',
    titleOf: (l) => `${SHIFT_NAME[l.shift]} · ${l.line} · ${formatDate(l.logDate)}`,
    blockDelete: (l) =>
      l.status === 'CLOSED'
        ? `A closed shift log is the handover record the next supervisor read. ${SHIFT_NAME[l.shift]} on ${formatDate(l.logDate)} cannot be deleted.`
        : undefined,
  })

  const [closeTarget, setCloseTarget] = useState<ShiftLog | null>(null)
  const [notes, setNotes] = useState('')

  const open = logs.filter((l) => l.status === 'OPEN')
  const efficiency = (l: ShiftLog) => (l.targetQty ? (l.actualQty / l.targetQty) * 100 : 0)
  const utilisation = (l: ShiftLog) => (l.runMinutes + l.downMinutes ? (l.runMinutes / (l.runMinutes + l.downMinutes)) * 100 : 0)

  const columns: Column<ShiftLog>[] = [
    { key: 'logDate', header: 'Date', sortable: true, width: '8rem', accessor: (l) => l.logDate, render: (l) => formatDate(l.logDate) },
    { key: 'shift', header: 'Shift', width: '9rem', sortable: true, render: (l) => <Badge tone="neutral" size="sm" dot={false}>{SHIFT_NAME[l.shift]}</Badge> },
    { key: 'line', header: 'Line', sortable: true, width: '7rem' },
    { key: 'supervisor', header: 'Supervisor', sortable: true },
    { key: 'targetQty', header: 'Target', align: 'right', sortable: true, render: (l) => <span className="tabular text-fg-muted">{formatQty(l.targetQty)}</span> },
    { key: 'actualQty', header: 'Made', width: '11rem', accessor: (l) => l.actualQty, render: (l) => (
      <div className="flex items-center gap-2">
        <ProgressBar value={Math.min(100, efficiency(l))} tone={efficiency(l) >= 100 ? 'success' : efficiency(l) >= 90 ? 'brand' : 'warning'} className="w-14" />
        <span className="text-2xs tabular text-fg">{formatQty(l.actualQty)}</span>
      </div>
    ) },
    { key: 'efficiency', header: 'Against target', align: 'right', width: '9rem', sortable: true, accessor: (l) => efficiency(l), render: (l) => (
      <span className={cn('tabular font-medium', efficiency(l) >= 100 ? 'text-success' : efficiency(l) >= 90 ? 'text-fg' : 'text-warning')}>
        {efficiency(l).toFixed(0)}%
      </span>
    ) },
    { key: 'scrapQty', header: 'Scrap', align: 'right', width: '6rem', sortable: true, render: (l) => (l.scrapQty ? <span className="tabular text-danger">{l.scrapQty}</span> : <span className="text-2xs text-success">none</span>) },
    { key: 'manpower', header: 'Manpower', align: 'center', width: '8rem', accessor: (l) => l.manpowerPresent, render: (l) => (
      <span className={cn('tabular text-2xs', l.manpowerPresent < l.manpowerPlanned ? 'text-warning' : 'text-fg-muted')}>
        {l.manpowerPresent}/{l.manpowerPlanned}
      </span>
    ) },
    { key: 'runMinutes', header: 'Run', width: '7rem', render: (l) => <Duration minutes={l.runMinutes} /> },
    { key: 'downMinutes', header: 'Down', width: '7rem', sortable: true, render: (l) => (l.downMinutes ? <span className="text-danger"><Duration minutes={l.downMinutes} /></span> : <span className="text-2xs text-success">none</span>) },
    { key: 'utilisation', header: 'Utilisation', align: 'right', width: '8rem', accessor: (l) => utilisation(l), render: (l) => <span className="tabular text-2xs">{utilisation(l).toFixed(0)}%</span> },
    { key: 'status', header: 'Status', sortable: true, width: '7rem', render: (l) => <MesStatusBadge status={l.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'shift-production', 'Shift production log', columnsFromTable(columns), logs)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Shift management"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Shifts' }]}
      />

      <p className="mb-3 text-xs text-fg-muted">
        Target, output and the handover note — the three things the next supervisor actually needs.{' '}
        <span className={cn('font-medium', open.length ? 'text-progress' : 'text-fg')}>{open.length}</span> shift
        {open.length === 1 ? '' : 's'} still open.
      </p>

      {open.length > 0 && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {open.map((l) => (
            <Card key={l.uid}>
              <CardHeader
                title={`${SHIFT_NAME[l.shift]} · ${l.line}`}
                description={`${l.supervisor} · ${formatDate(l.logDate)}`}
                actions={<Button variant="primary" size="sm" onClick={() => { setCloseTarget(l); setNotes(l.handoverNotes) }}>Close shift</Button>}
              />
              <CardBody className="space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Output against target</span>
                    <span className="tabular text-fg">{formatQty(l.actualQty)} / {formatQty(l.targetQty)}</span>
                  </div>
                  <ProgressBar value={Math.min(100, efficiency(l))} tone={efficiency(l) >= 95 ? 'success' : 'warning'} height="h-2" showLabel />
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-4">
                  <p className="text-fg-muted">Scrap <span className={cn('block font-medium tabular', l.scrapQty ? 'text-danger' : 'text-fg')}>{l.scrapQty}</span></p>
                  <p className="text-fg-muted">Rework <span className="block font-medium tabular text-fg">{l.reworkQty}</span></p>
                  <p className="text-fg-muted">Manpower <span className={cn('block font-medium tabular', l.manpowerPresent < l.manpowerPlanned ? 'text-warning' : 'text-fg')}>{l.manpowerPresent}/{l.manpowerPlanned}</span></p>
                  <p className="text-fg-muted">Down <span className={cn('block font-medium tabular', l.downMinutes > 60 ? 'text-danger' : 'text-fg')}>{l.downMinutes} min</span></p>
                </div>
                <div className="rounded border border-border bg-surface-2 p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Handover notes</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{l.handoverNotes || 'Nothing recorded yet.'}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <DataTable
        rows={logs}
        columns={columns}
        rowKey={(l) => l.uid}
        searchPlaceholder="Search date, shift, line or supervisor…"
        onExport={doExport}
        emptyTitle="No shift logs"
        rowClassName={(l) => cn(l.status === 'OPEN' && 'bg-progress/[0.04]', efficiency(l) < 90 && 'bg-warning/[0.03]')}
        rowActions={(l) => (
          <>
            {rowEdit.actions(l)}
            <MenuItem label="Close the shift" disabled={l.status === 'CLOSED'} onClick={() => { setCloseTarget(l); setNotes(l.handoverNotes) }} />
            <MenuItem label="Print the shift report" onClick={() => doExport('pdf')} />
          </>
        )}
      />

      <Modal
        open={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        title={closeTarget ? `Close ${SHIFT_NAME[closeTarget.shift]} — ${closeTarget.line}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!closeTarget) return
                if (!notes.trim()) {
                  toast.error('Handover notes required', 'The next shift inherits every problem this one leaves behind. Write them down.')
                  return
                }
                update(closeTarget.uid, { status: 'CLOSED', handoverNotes: notes.trim() })
                toast.success('Shift closed', `${formatQty(closeTarget.actualQty)} made against a target of ${formatQty(closeTarget.targetQty)}. The handover is on the next supervisor's screen.`)
                setCloseTarget(null)
              }}
            >
              Close shift
            </Button>
          </>
        }
      >
        {closeTarget && (
          <div className="space-y-3.5">
            <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 text-xs sm:grid-cols-3">
              <p className="text-fg-muted">Made <span className="block font-medium tabular text-fg">{formatQty(closeTarget.actualQty)}</span></p>
              <p className="text-fg-muted">Target <span className="block font-medium tabular text-fg">{formatQty(closeTarget.targetQty)}</span></p>
              <p className="text-fg-muted">Efficiency <span className={cn('block font-medium tabular', efficiency(closeTarget) >= 95 ? 'text-success' : 'text-warning')}>{efficiency(closeTarget).toFixed(0)}%</span></p>
            </div>
            <Textarea
              label="Handover notes (required)"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              hint="Machines left down, jobs part-finished, anything the next shift must not discover the hard way"
            />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Three shifts, one thread" description="Why the handover note is a required field and not a nicety" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p><span className="font-medium text-fg">A — morning</span> usually starts the order and sets the machines up. Setup problems found here cost the whole day if not written down.</p>
          <p><span className="font-medium text-fg">B — evening</span> inherits a running line. What it most needs to know is what is already broken and what has been bodged.</p>
          <p><span className="font-medium text-fg">C — night</span> runs with the fewest people and the least support. Anything left unclear at 22:00 stays unclear until 06:00.</p>
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
