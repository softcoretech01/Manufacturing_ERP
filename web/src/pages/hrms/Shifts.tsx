import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { EmployeeCell, HrStatusBadge, Hours, SHIFT_TYPE_LABEL } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { employeeSkills as seedSkills, roster as seedRoster, shifts as seedShifts } from '@/mock/hrms'
import type { EmployeeSkill, RosterEntry, Shift } from '@/types/hrms'

const TABS = [
  { id: 'ROSTER', label: 'Roster' },
  { id: 'SHIFTS', label: 'Shift definitions' },
]

/**
 * Shifts and roster. The shift definition carries the numbers attendance is
 * judged against — grace period, half-day threshold, allowances — so changing a
 * timing here changes what counts as late tomorrow. The roster then places
 * people, and refuses a swap that would leave an operation without a certified
 * operator.
 */
export function ShiftsPage() {
  const toast = useToast()
  const shiftSeed = useMemo(() => seedShifts, [])
  const rosterSeed = useMemo(() => seedRoster, [])
  const skillSeed = useMemo(() => seedSkills, [])

  const shiftCrud = useCrud<Shift>({
    key: 'hrms:shift',
    seed: shiftSeed,
    entity: 'Shift',
    titleOf: (s) => `${s.name} (${s.code})`,
    fields: [
      { name: 'code', label: 'Shift code', required: true, upper: true },
      { name: 'name', label: 'Shift name', required: true },
      {
        name: 'shiftType',
        label: 'Type',
        type: 'select',
        required: true,
        options: Object.entries(SHIFT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'startTime', label: 'Start time', required: true, hint: 'HH:MM, 24-hour' },
      { name: 'endTime', label: 'End time', required: true },
      { name: 'breakMinutes', label: 'Break (minutes)', type: 'number', required: true },
      { name: 'graceMinutes', label: 'Grace before late (minutes)', type: 'number', required: true, hint: 'Arriving inside this is not a late mark' },
      { name: 'halfDayMinutes', label: 'Half-day threshold (minutes)', type: 'number', required: true },
      { name: 'fullDayMinutes', label: 'Full-day minutes', type: 'number', required: true },
      { name: 'shiftAllowance', label: 'Shift allowance (monthly)', type: 'number' },
      { name: 'nightAllowance', label: 'Night allowance (per night)', type: 'number' },
      { name: 'rotationCycleDays', label: 'Rotation cycle (days)', type: 'number' },
      { name: 'isRotational', label: 'Rotational', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (s) => ({
      code: s.code,
      name: s.name,
      shiftType: s.shiftType,
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: String(s.breakMinutes),
      graceMinutes: String(s.graceMinutes),
      halfDayMinutes: String(s.halfDayMinutes),
      fullDayMinutes: String(s.fullDayMinutes),
      shiftAllowance: String(s.shiftAllowance),
      nightAllowance: String(s.nightAllowance),
      rotationCycleDays: String(s.rotationCycleDays),
      isRotational: String(s.isRotational),
      isActive: String(s.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? { weeklyOffDays: ['Sunday'], headcount: 0 }),
      code: v.code,
      name: v.name,
      shiftType: v.shiftType as Shift['shiftType'],
      startTime: v.startTime,
      endTime: v.endTime,
      breakMinutes: Number(v.breakMinutes) || 0,
      graceMinutes: Number(v.graceMinutes) || 0,
      halfDayMinutes: Number(v.halfDayMinutes) || 0,
      fullDayMinutes: Number(v.fullDayMinutes) || 0,
      shiftAllowance: Number(v.shiftAllowance) || 0,
      nightAllowance: Number(v.nightAllowance) || 0,
      rotationCycleDays: Number(v.rotationCycleDays) || 0,
      isRotational: v.isRotational === 'true',
      isActive: v.isActive !== 'false',
    }),
    blockDelete: (s) =>
      s.headcount > 0
        ? `${s.name} has ${s.headcount} people rostered onto it. Move them to another shift first — attendance is judged against the shift timings, so a missing shift breaks the day's calculation.`
        : undefined,
  })

  const shifts = shiftCrud.rows
  const { rows: roster, update: updateRoster } = useCollection<RosterEntry>('hrms:roster', rosterSeed)
  const { rows: skills } = useCollection<EmployeeSkill>('hrms:employee-skill', skillSeed)

  const [tab, setTab] = useState('ROSTER')
  const [rosterDate, setRosterDate] = useState(roster[0]?.rosterDate ?? '')
  const [moving, setMoving] = useState<RosterEntry | null>(null)
  const [moveTo, setMoveTo] = useState('')

  const dates = [...new Set(roster.map((r) => r.rosterDate))].sort()
  const dayRoster = roster.filter((r) => r.rosterDate === rosterDate)
  const swapRequests = roster.filter((r) => r.swapStatus === 'REQUESTED')

  const activeShifts = shifts.filter((s) => s.isActive)
  const nightShift = shifts.find((s) => s.shiftType === 'NIGHT')

  /** Certified-and-current operators rostered onto each work centre today. */
  const coverage = useMemo(() => {
    const map = new Map<string, { rostered: number; certified: number }>()
    for (const r of dayRoster) {
      if (!r.workCentre) continue
      const cur = map.get(r.workCentre) ?? { rostered: 0, certified: 0 }
      const ok = skills.some(
        (s) => s.employeeCode === r.employeeCode && s.status === 'CERTIFIED' && ['SKILLED', 'EXPERT', 'TRAINER'].includes(s.level),
      )
      map.set(r.workCentre, { rostered: cur.rostered + 1, certified: cur.certified + (ok ? 1 : 0) })
    }
    return [...map.entries()].map(([workCentre, v]) => ({ workCentre, ...v }))
  }, [dayRoster, skills])

  const uncovered = coverage.filter((c) => c.certified === 0)

  const rosterColumns: Column<RosterEntry>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (r) => (
      <EmployeeCell name={r.employeeName} code={r.employeeCode} sub={r.department} />
    ) },
    { key: 'shiftCode', header: 'Shift', sortable: true, width: '12rem', render: (r) => {
      const s = shifts.find((x) => x.code === r.shiftCode)
      return (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{s?.name ?? r.shiftCode}</p>
          <p className="font-mono text-2xs text-fg-subtle">{s ? `${s.startTime}–${s.endTime}` : ''}</p>
        </div>
      )
    } },
    { key: 'workCentre', header: 'Work centre', sortable: true, render: (r) => (
      r.workCentre ? <span className="text-xs">{r.workCentre}</span> : <span className="text-2xs text-fg-subtle">off floor</span>
    ) },
    { key: 'certified', header: 'Certified for it', width: '12rem', accessor: (r) => {
      const ok = skills.some((s) => s.employeeCode === r.employeeCode && s.status === 'CERTIFIED' && ['SKILLED', 'EXPERT', 'TRAINER'].includes(s.level))
      return ok ? 1 : 0
    }, render: (r) => {
      if (!r.workCentre) return <span className="text-2xs text-fg-subtle">—</span>
      const mine = skills.filter((s) => s.employeeCode === r.employeeCode)
      const ok = mine.some((s) => s.status === 'CERTIFIED' && ['SKILLED', 'EXPERT', 'TRAINER'].includes(s.level))
      const expiring = mine.some((s) => s.status === 'EXPIRING' || s.status === 'EXPIRED')
      return ok ? (
        <Badge tone={expiring ? 'warning' : 'success'} size="sm" dot={false}>
          {expiring ? 'certified, expiring' : 'certified'}
        </Badge>
      ) : (
        <Badge tone="danger" size="sm">not certified alone</Badge>
      )
    } },
    { key: 'swapStatus', header: 'Swap', sortable: true, width: '11rem', render: (r) => (
      r.swapStatus === 'NONE'
        ? <span className="text-2xs text-fg-subtle">—</span>
        : (
          <div className="min-w-0">
            <HrStatusBadge status={r.swapStatus} size="sm" />
            {r.swapWithEmployeeCode && <p className="mt-0.5 truncate font-mono text-2xs text-fg-subtle">with {r.swapWithEmployeeCode}</p>}
          </div>
        )
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '8.5rem', render: (r) => <HrStatusBadge status={r.status} size="sm" /> },
  ]

  const shiftColumns: Column<Shift>[] = [
    { key: 'code', header: 'Shift', sortable: true, width: '13rem', render: (s) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{s.name}</p>
        <p className="font-mono text-2xs text-fg-subtle">{s.code}</p>
      </div>
    ) },
    { key: 'shiftType', header: 'Type', sortable: true, width: '9rem', render: (s) => (
      <Badge tone={s.shiftType === 'NIGHT' ? 'progress' : s.shiftType === 'GENERAL' ? 'neutral' : 'brand'} size="sm" dot={false}>
        {SHIFT_TYPE_LABEL[s.shiftType]}
      </Badge>
    ) },
    { key: 'timing', header: 'Timing', width: '10rem', render: (s) => (
      <span className="font-mono text-xs text-fg">{s.startTime}–{s.endTime}</span>
    ) },
    { key: 'breakMinutes', header: 'Break', align: 'right', width: '7rem', render: (s) => <Hours minutes={s.breakMinutes} /> },
    { key: 'graceMinutes', header: 'Grace', align: 'right', width: '7rem', sortable: true, render: (s) => (
      <span className="tabular text-xs">{s.graceMinutes} min</span>
    ) },
    { key: 'halfDayMinutes', header: 'Half day below', align: 'right', width: '10rem', render: (s) => <Hours minutes={s.halfDayMinutes} /> },
    { key: 'fullDayMinutes', header: 'Full day', align: 'right', width: '8rem', render: (s) => <Hours minutes={s.fullDayMinutes} /> },
    { key: 'shiftAllowance', header: 'Shift allowance', align: 'right', width: '11rem', sortable: true, render: (s) => (
      s.shiftAllowance ? <span className="tabular text-xs">₹{s.shiftAllowance.toLocaleString('en-IN')}/mo</span> : <span className="text-2xs text-fg-subtle">none</span>
    ) },
    { key: 'nightAllowance', header: 'Night allowance', align: 'right', width: '11rem', defaultHidden: true, render: (s) => (
      s.nightAllowance ? <span className="tabular text-xs">₹{s.nightAllowance}/night</span> : <span className="text-2xs text-fg-subtle">none</span>
    ) },
    { key: 'isRotational', header: 'Rotation', width: '9.5rem', accessor: (s) => (s.isRotational ? 1 : 0), render: (s) => (
      s.isRotational
        ? <span className="text-2xs text-fg-muted">every {s.rotationCycleDays} days</span>
        : <span className="text-2xs text-fg-subtle">fixed</span>
    ) },
    { key: 'headcount', header: 'On this shift', align: 'right', width: '10rem', sortable: true, render: (s) => (
      <span className="tabular text-xs font-medium text-fg">{s.headcount}</span>
    ) },
    { key: 'isActive', header: 'Status', align: 'center', width: '7.5rem', sortable: true, accessor: (s) => (s.isActive ? 1 : 0), render: (s) => (
      <HrStatusBadge status={s.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'ROSTER'
          ? exportRows(format, 'shift-roster', `Shift roster — ${rosterDate}`, columnsFromTable(rosterColumns), dayRoster)
          : exportRows(format, 'shift-definitions', 'Shift definitions', columnsFromTable(shiftColumns), shifts)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Shifts & roster"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Shifts' }]}
        actions={
          tab === 'SHIFTS' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => shiftCrud.openCreate({ shiftType: 'MORNING', breakMinutes: '30', graceMinutes: '10', halfDayMinutes: '240', fullDayMinutes: '450', isActive: 'true' })}
            >
              Add a shift
            </Button>
          ) : undefined
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      {tab === 'ROSTER' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Select
              sizeVariant="sm"
              containerClassName="w-44"
              value={rosterDate}
              onChange={(e) => setRosterDate(e.target.value)}
              options={dates.map((d) => ({ value: d, label: formatDate(d) }))}
            />
            <p className="text-xs text-fg-muted">
              <span className="font-medium text-fg tabular">{dayRoster.length}</span> people rostered
              {swapRequests.length > 0 && <>, <span className="font-medium text-warning">{swapRequests.length}</span> swap request{swapRequests.length === 1 ? '' : 's'} pending</>}
              {uncovered.length > 0 && <>, <span className="font-medium text-danger">{uncovered.length}</span> work centre{uncovered.length === 1 ? '' : 's'} without a certified operator</>}
            </p>
          </div>

          {(uncovered.length > 0 || swapRequests.length > 0) && (
            <Card className="mb-4">
              <CardHeader title="Roster problems" description="A shift that starts without certified cover produces scrap, not output" />
              <CardBody className="space-y-2">
                {uncovered.map((c) => (
                  <div key={c.workCentre} className="rounded border border-danger/30 bg-danger/5 p-2.5">
                    <p className="text-xs font-medium text-fg">{c.workCentre} has no certified operator</p>
                    <p className="text-2xs text-fg-muted">
                      {c.rostered} rostered, none of them certified at skilled level or above. Either move a certified operator in
                      or pair the shift with a trainer.
                    </p>
                  </div>
                ))}
                {swapRequests.map((r) => (
                  <div key={r.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-fg">
                        {r.employeeName} wants to swap {formatDate(r.rosterDate)} with {r.swapWithEmployeeCode}
                      </p>
                      <p className="text-2xs text-fg-muted">
                        {r.shiftCode} · {r.workCentre ?? 'off floor'} — a swap needs both people to agree and the supervisor to
                        approve, so the certified cover is checked before it is allowed.
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => {
                          updateRoster(r.uid, { swapStatus: 'APPROVED', status: 'CHANGED' })
                          toast.success('Swap approved', `${r.employeeName} and ${r.swapWithEmployeeCode} have swapped for ${formatDate(r.rosterDate)}.`)
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateRoster(r.uid, { swapStatus: 'REJECTED', status: 'CONFIRMED' })
                          toast.success('Swap rejected', `${r.employeeName} stays on ${r.shiftCode} for ${formatDate(r.rosterDate)}.`)
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {coverage.length > 0 && (
            <Card className="mb-4">
              <CardHeader title="Certified cover by work centre" description="Rostered against certified at skilled level or above" />
              <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {coverage.map((c) => (
                  <div
                    key={c.workCentre}
                    className={cn(
                      'rounded border p-2.5',
                      c.certified === 0 ? 'border-danger/30 bg-danger/5' : c.certified < c.rostered ? 'border-warning/30 bg-warning/5' : 'border-border',
                    )}
                  >
                    <p className="truncate text-xs font-medium text-fg">{c.workCentre}</p>
                    <p className={cn('mt-0.5 text-2xs', c.certified === 0 ? 'font-medium text-danger' : 'text-fg-muted')}>
                      {c.certified} certified of {c.rostered} rostered
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <DataTable
            rows={dayRoster}
            columns={rosterColumns}
            rowKey={(r) => r.uid}
            searchPlaceholder="Search employee, department, shift or work centre…"
            onExport={doExport}
            emptyTitle="Nothing rostered for this date"
            rowClassName={(r) => cn(
              r.swapStatus === 'REQUESTED' && 'bg-warning/[0.04]',
              r.workCentre && !skills.some((s) => s.employeeCode === r.employeeCode && s.status === 'CERTIFIED' && ['SKILLED', 'EXPERT', 'TRAINER'].includes(s.level)) && 'bg-danger/[0.03]',
            )}
            rowActions={(r) => (
              <>
                <MenuItem label="Edit — move to another shift" onClick={() => { setMoving(r); setMoveTo(r.shiftCode) }} />
                <MenuItem
                  label="Delete from the roster"
                  danger
                  onClick={() => {
                    updateRoster(r.uid, { status: 'CHANGED', workCentre: null })
                    toast.success('Removed from the roster', `${r.employeeName} taken off ${formatDate(r.rosterDate)}. The day now shows no work centre against them.`)
                  }}
                />
                <MenuItem
                  separatorBefore
                  label="Approve the swap"
                  disabled={r.swapStatus !== 'REQUESTED'}
                  onClick={() => {
                    updateRoster(r.uid, { swapStatus: 'APPROVED', status: 'CHANGED' })
                    toast.success('Swap approved', `${r.employeeName} swapped for ${formatDate(r.rosterDate)}.`)
                  }}
                />
                <MenuItem
                  label="Confirm the roster line"
                  disabled={r.status === 'CONFIRMED'}
                  onClick={() => {
                    updateRoster(r.uid, { status: 'CONFIRMED' })
                    toast.success('Confirmed', `${r.employeeName} confirmed on ${r.shiftCode} for ${formatDate(r.rosterDate)}.`)
                  }}
                />
              </>
            )}
          />
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className="font-medium text-fg tabular">{activeShifts.length}</span> active shifts covering{' '}
            <span className="font-medium text-fg tabular">{activeShifts.reduce((s, x) => s + x.headcount, 0)}</span> people
            {nightShift && <> · night shift carries ₹{nightShift.nightAllowance}/night plus ₹{nightShift.shiftAllowance.toLocaleString('en-IN')} a month</>}
            . These timings are what attendance is judged against, so a change here changes what counts as late tomorrow.
          </p>

          <DataTable
            rows={shifts}
            columns={shiftColumns}
            rowKey={(s) => s.uid}
            searchPlaceholder="Search shift, code or type…"
            onExport={doExport}
            emptyTitle="No shifts defined"
            rowClassName={(s) => cn(!s.isActive && 'opacity-60')}
            rowActions={(s) => (
              <>
                <MenuItem label="Edit the shift" onClick={() => shiftCrud.openEdit(s)} />
                <MenuItem label="Delete the shift" danger onClick={() => shiftCrud.askDelete(s)} />
                <MenuItem
                  separatorBefore
                  label={s.isActive ? 'Deactivate the shift' : 'Activate the shift'}
                  onClick={() => {
                    if (s.isActive && s.headcount > 0) {
                      toast.error('Cannot deactivate', `${s.name} still has ${s.headcount} people on it. Move them first.`)
                      return
                    }
                    shiftCrud.update(s.uid, { isActive: !s.isActive })
                    toast.success(s.isActive ? 'Shift deactivated' : 'Shift activated', `${s.name} ${s.isActive ? 'will no longer be offered on the roster' : 'is available again'}.`)
                  }}
                />
              </>
            )}
          />
        </>
      )}

      {/* Move to another shift --------------------------------------------- */}
      <Modal
        open={!!moving}
        onClose={() => setMoving(null)}
        title={moving ? `Move ${moving.employeeName}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setMoving(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!moving) return
                if (moveTo === moving.shiftCode) {
                  toast.error('Nothing changed', 'Pick a different shift.')
                  return
                }
                const target = shifts.find((s) => s.code === moveTo)
                if (!target?.isActive) {
                  toast.error('Shift not active', 'An inactive shift cannot take people — attendance would have nothing to judge against.')
                  return
                }
                updateRoster(moving.uid, { shiftCode: moveTo, status: 'CHANGED' })
                toast.success(
                  'Moved',
                  `${moving.employeeName} is on ${target.name} (${target.startTime}–${target.endTime}) for ${formatDate(moving.rosterDate)}. Their late and overtime marks for that day now measure against these timings.`,
                )
                setMoving(null)
              }}
            >
              Move
            </Button>
          </>
        }
      >
        {moving && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {moving.employeeName} is currently on{' '}
              <span className="font-medium text-fg">{shifts.find((s) => s.code === moving.shiftCode)?.name ?? moving.shiftCode}</span>{' '}
              for {formatDate(moving.rosterDate)}
              {moving.workCentre ? `, at ${moving.workCentre}` : ''}.
            </p>
            <Select
              label="Move to"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              options={activeShifts.map((s) => ({ value: s.code, label: `${s.name} (${s.startTime}–${s.endTime})` }))}
            />
          </div>
        )}
      </Modal>

      {shiftCrud.dialogs}

      <Card className="mt-4">
        <CardHeader title="What the shift definition actually controls" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Grace period</span> decides who is marked late. Ten minutes on a shop-floor shift is normal; a general shift usually gets fifteen.</p>
          <p><span className="font-medium text-fg">Half-day threshold</span> decides what a short day is worth. Below it the day is paid at half, which is a real salary consequence of a timing change.</p>
          <p><span className="font-medium text-fg">Full-day minutes</span> is the denominator for overtime — anything beyond it, and approved, is paid at twice the rate.</p>
          <p><span className="font-medium text-fg">Allowances</span> are earned by being on the shift, so they follow the roster rather than the employee master. Move somebody to nights and the night allowance follows.</p>
        </CardBody>
      </Card>
    </div>
  )
}
