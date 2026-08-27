import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { Duration, EfficiencyChip } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { operatorStats as seedOperators } from '@/mock/mes'
import type { OperatorStat, Shift } from '@/types/mes'

const SHIFTS: { id: string; label: string }[] = [
  { id: 'all', label: 'All shifts' },
  { id: 'A', label: 'Shift A' },
  { id: 'B', label: 'Shift B' },
  { id: 'C', label: 'Shift C' },
]

/**
 * Labour tracking — who is on the floor, what they made, and how their time
 * compared with the standard for the work. Efficiency here is a conversation
 * starter, not a stick: a low figure usually means the machine stopped.
 */
export function LabourPage() {
  const toast = useToast()
  const seed = useMemo(() => seedOperators, [])
  const { rows: operators, update } = useCollection<OperatorStat>('mes:operator', seed)
  const rowEdit = useRowEdit<OperatorStat>({
    key: 'mes:operator',
    seed: seed,
    entity: 'Operator',
    titleOf: (r) => r.employeeCode,
  })

  const [shift, setShift] = useState('all')
  const [workCentre, setWorkCentre] = useState('all')
  const [assignTarget, setAssignTarget] = useState<OperatorStat | null>(null)
  const [assignTo, setAssignTo] = useState({ workCentre: '', shift: 'A' as Shift })

  const workCentres = [...new Set(operators.map((o) => o.workCentre))]
  const filtered = operators.filter(
    (o) => (shift === 'all' ? true : o.shift === shift) && (workCentre === 'all' ? true : o.workCentre === workCentre),
  )

  const efficiency = (o: OperatorStat) => (o.actualMinutes ? (o.standardMinutes / o.actualMinutes) * 100 : 0)
  const quality = (o: OperatorStat) => (o.producedQty + o.scrapQty ? (o.producedQty / (o.producedQty + o.scrapQty)) * 100 : 100)

  const present = filtered.filter((o) => o.present)
  const absent = filtered.filter((o) => !o.present)
  const totalProduced = present.reduce((s, o) => s + o.producedQty, 0)
  const avgEfficiency = present.length ? present.reduce((s, o) => s + efficiency(o), 0) / present.length : 0

  const columns: Column<OperatorStat>[] = [
    { key: 'employeeCode', header: 'Operator', sortable: true, width: '14rem', render: (o) => (
      <div className="flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', o.present ? 'bg-success' : 'bg-fg-subtle')} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{o.name}</p>
          <p className="font-mono text-2xs text-fg-subtle">{o.employeeCode}</p>
        </div>
      </div>
    ) },
    { key: 'skill', header: 'Skill', sortable: true, width: '8rem', render: (o) => (
      <Badge tone={o.skill === 'Expert' ? 'success' : o.skill === 'Skilled' ? 'brand' : 'neutral'} size="sm" dot={false}>{o.skill}</Badge>
    ) },
    { key: 'workCentre', header: 'Work centre', sortable: true },
    { key: 'shift', header: 'Shift', align: 'center', width: '5.5rem', sortable: true },
    { key: 'present', header: 'Today', align: 'center', width: '7rem', sortable: true, accessor: (o) => (o.present ? 1 : 0), render: (o) => (
      o.present ? <Badge tone="success" size="sm">Present</Badge> : <Badge tone="neutral" size="sm" dot={false}>Absent</Badge>
    ) },
    { key: 'producedQty', header: 'Made', align: 'right', sortable: true, render: (o) => <span className="tabular font-medium text-fg">{formatQty(o.producedQty)}</span> },
    { key: 'scrapQty', header: 'Scrap', align: 'right', width: '6rem', sortable: true, render: (o) => (o.scrapQty ? <span className="tabular text-danger">{o.scrapQty}</span> : <span className="text-2xs text-success">none</span>) },
    { key: 'quality', header: 'Right first time', align: 'right', width: '9.5rem', sortable: true, accessor: (o) => quality(o), render: (o) => (
      <span className={cn('tabular text-2xs', quality(o) >= 98 ? 'text-success' : quality(o) >= 95 ? 'text-fg' : 'text-warning')}>{quality(o).toFixed(1)}%</span>
    ) },
    { key: 'standardMinutes', header: 'Standard', width: '7rem', render: (o) => <Duration minutes={o.standardMinutes} /> },
    { key: 'actualMinutes', header: 'Actual', width: '7rem', render: (o) => <Duration minutes={o.actualMinutes} /> },
    { key: 'efficiency', header: 'Efficiency', align: 'right', width: '8rem', sortable: true, accessor: (o) => efficiency(o), render: (o) => <EfficiencyChip standard={o.standardMinutes} actual={o.actualMinutes} /> },
    { key: 'attendanceDays', header: 'Days this month', align: 'right', width: '9rem', sortable: true, defaultHidden: true },
    { key: 'certifiedFor', header: 'Certified for', render: (o) => (
      <span className="text-2xs text-fg-muted">{o.certifiedFor.join(', ') || '—'}</span>
    ) },
    { key: 'incentiveEligible', header: 'Incentive', align: 'center', width: '8rem', accessor: (o) => (o.incentiveEligible ? 1 : 0), render: (o) => (
      o.incentiveEligible ? <Badge tone="success" size="sm" dot={false}>Eligible</Badge> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'labour-tracking', 'Operator performance', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Labour tracking"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Labour' }]}
        tabs={<Tabs variant="pill" active={shift} onChange={setShift} tabs={SHIFTS} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-52"
          value={workCentre}
          onChange={(e) => setWorkCentre(e.target.value)}
          options={[{ value: 'all', label: 'All work centres' }, ...workCentres.map((w) => ({ value: w, label: w }))]}
        />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-success">{present.length}</span> present,{' '}
          <span className={cn('font-medium', absent.length ? 'text-warning' : 'text-fg')}>{absent.length}</span> absent ·{' '}
          <span className="font-medium text-fg tabular">{formatQty(totalProduced)}</span> pieces made · average efficiency{' '}
          <span className={cn('font-medium tabular', avgEfficiency >= 95 ? 'text-success' : 'text-warning')}>{avgEfficiency.toFixed(0)}%</span>
        </p>
      </div>

      {absent.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Not on the floor today" description="Cover these before the shift target slips" />
          <CardBody className="flex flex-wrap gap-2">
            {absent.map((o) => (
              <span key={o.uid} className="rounded border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-2xs text-fg">
                <span className="font-medium">{o.name}</span> · {o.workCentre} · shift {o.shift}
              </span>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(o) => o.uid}
        searchPlaceholder="Search name, code, skill or work centre…"
        onExport={doExport}
        emptyTitle="No operators match this filter"
        rowClassName={(o) => cn(!o.present && 'opacity-60', o.present && efficiency(o) < 85 && 'bg-warning/[0.03]')}
        rowActions={(o) => (
          <>
            {rowEdit.actions(o)}
            <MenuItem
              label={o.present ? 'Mark absent' : 'Mark present'}
              onClick={() => {
                update(o.uid, { present: !o.present })
                toast.success(o.present ? 'Marked absent' : 'Marked present', `${o.name} — ${o.workCentre}, shift ${o.shift}.`)
              }}
            />
            <MenuItem
              label="Assign to another work centre"
              onClick={() => { setAssignTarget(o); setAssignTo({ workCentre: o.workCentre, shift: o.shift }) }}
            />
            <MenuItem
              separatorBefore
              label="Print the performance card"
              onClick={() => doExport('pdf')}
            />
          </>
        )}
      />

      <Modal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        title={assignTarget ? `Assign ${assignTarget.name}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!assignTarget) return
                if (assignTo.workCentre === assignTarget.workCentre && assignTo.shift === assignTarget.shift) {
                  toast.error('Nothing changed', 'Pick a different work centre or shift.')
                  return
                }
                update(assignTarget.uid, { workCentre: assignTo.workCentre, shift: assignTo.shift })
                toast.success('Operator reassigned', `${assignTarget.name} now on ${assignTo.workCentre}, shift ${assignTo.shift}.`)
                setAssignTarget(null)
              }}
            >
              Assign
            </Button>
          </>
        }
      >
        {assignTarget && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              Certified for <span className="font-medium text-fg">{assignTarget.certifiedFor.join(', ') || 'nothing recorded'}</span>.
              Moving an operator to a centre they are not certified for is allowed but shows on the shift report.
            </p>
            <Select
              label="Work centre"
              value={assignTo.workCentre}
              onChange={(e) => setAssignTo({ ...assignTo, workCentre: e.target.value })}
              options={workCentres.map((w) => ({ value: w, label: w }))}
            />
            <Select
              label="Shift"
              value={assignTo.shift}
              onChange={(e) => setAssignTo({ ...assignTo, shift: e.target.value as Shift })}
              options={[
                { value: 'A', label: 'A — morning' },
                { value: 'B', label: 'B — evening' },
                { value: 'C', label: 'C — night' },
              ]}
            />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="How efficiency is worked out" description="Standard minutes for the work, divided by the minutes actually taken" />
        <CardBody className="space-y-3">
          <div className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
            <p><span className="font-medium text-fg">Above 100%</span> means the job was done faster than the routing standard. Two shifts of this usually means the standard is wrong, not that the operator is heroic.</p>
            <p><span className="font-medium text-fg">85–100%</span> is the normal band. Small variations come from setup, material and machine condition.</p>
            <p><span className="font-medium text-fg">Below 85%</span> is worth asking about — but check downtime first. An operator waiting on a broken machine still books the time.</p>
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Today, by skill level</p>
            <div className="space-y-2">
              {['Expert', 'Skilled', 'Semi-skilled', 'Trainee'].map((s) => {
                const group = present.filter((o) => o.skill === s)
                if (!group.length) return null
                const eff = group.reduce((sum, o) => sum + efficiency(o), 0) / group.length
                return (
                  <div key={s} className="flex items-center gap-3 text-xs">
                    <span className="w-24 shrink-0 text-fg-muted">{s}</span>
                    <ProgressBar value={Math.min(120, eff)} max={120} tone={eff >= 95 ? 'success' : 'warning'} className="flex-1" />
                    <span className="w-20 shrink-0 text-right tabular text-fg">{eff.toFixed(0)}% · {group.length} on</span>
                  </div>
                )
              })}
            </div>
          </div>
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
