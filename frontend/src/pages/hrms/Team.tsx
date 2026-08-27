import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import {
  EmployeeCell,
  HrStatusBadge,
  Hours,
  LEAVE_TYPE_LABEL,
  PctChip,
  PunchCell,
  RatingCell,
  SkillLevelMeter,
  useCanSeeAppraisal,
} from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import {
  appraisals as seedAppraisals,
  attendance as seedAttendance,
  employeeSkills as seedSkills,
  hrEmployees as seedEmployees,
  incentiveEarnings as seedIncentives,
  leaveRequests as seedLeave,
  overtime as seedOvertime,
  roster as seedRoster,
} from '@/mock/hrms'
import type {
  Appraisal,
  AttendanceRecord,
  EmployeeSkill,
  HrEmployee,
  IncentiveEarning,
  LeaveRequest,
  OvertimeRecord,
  RosterEntry,
} from '@/types/hrms'

const TABS = [
  { id: 'APPROVALS', label: 'My approvals' },
  { id: 'TODAY', label: "Today's team" },
  { id: 'PERFORMANCE', label: 'Team performance' },
]

/**
 * Manager self service — the other side of employee self service. A supervisor's
 * whole HR job is four decisions: approve leave, approve an attendance
 * correction, approve overtime, and say who is rostered where. This screen puts
 * all four in one queue instead of four screens.
 */
export function TeamPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeAppraisal = useCanSeeAppraisal()

  const empSeed = useMemo(() => seedEmployees, [])
  const attSeed = useMemo(() => seedAttendance, [])
  const leaveSeed = useMemo(() => seedLeave, [])
  const otSeed = useMemo(() => seedOvertime, [])
  const rosterSeed = useMemo(() => seedRoster, [])
  const skillSeed = useMemo(() => seedSkills, [])
  const incSeed = useMemo(() => seedIncentives, [])
  const apprSeed = useMemo(() => seedAppraisals, [])

  const { rows: employees } = useCollection<HrEmployee>('hrms:employee', empSeed)
  const { rows: attendance, update: updateAttendance } = useCollection<AttendanceRecord>('hrms:attendance', attSeed)
  const { rows: leave, update: updateLeave } = useCollection<LeaveRequest>('hrms:leave-request', leaveSeed)
  const { rows: overtime, update: updateOt } = useCollection<OvertimeRecord>('hrms:overtime', otSeed)
  const { rows: roster, update: updateRoster } = useCollection<RosterEntry>('hrms:roster', rosterSeed)
  const { rows: skills } = useCollection<EmployeeSkill>('hrms:employee-skill', skillSeed)
  const { rows: incentives } = useCollection<IncentiveEarning>('hrms:incentive-earning', incSeed)
  const { rows: appraisals } = useCollection<Appraisal>('hrms:appraisal', apprSeed)

  /** In the live product this is the signed-in manager's own reporting line. */
  const managers = [...new Set(employees.map((e) => e.reportsTo))].filter((m) => m !== 'Managing Director')
  const [manager, setManager] = useState(managers[0] ?? '')
  const [tab, setTab] = useState('APPROVALS')

  const team = employees.filter((e) => e.reportsTo === manager && e.status !== 'EXITED')
  const teamCodes = new Set(team.map((e) => e.employeeCode))

  const myLeave = leave.filter((l) => teamCodes.has(l.employeeCode) && l.status === 'PENDING_MANAGER')
  const myOt = overtime.filter((o) => teamCodes.has(o.employeeCode) && o.status === 'REQUESTED')
  const myPunches = attendance.filter(
    (a) => teamCodes.has(a.employeeCode) && (a.status === 'MISSED_PUNCH' || a.status === 'ABSENT') && !a.regularised,
  )
  const mySwaps = roster.filter((r) => teamCodes.has(r.employeeCode) && r.swapStatus === 'REQUESTED')
  const totalPending = myLeave.length + myOt.length + myPunches.length + mySwaps.length

  const todayTeam = attendance.filter((a) => teamCodes.has(a.employeeCode))
  const present = todayTeam.filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
  const absent = todayTeam.filter((a) => a.status === 'ABSENT')

  const teamColumns: Column<AttendanceRecord>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (a) => (
      <EmployeeCell name={a.employeeName} code={a.employeeCode} sub={a.workCentre ?? a.department} />
    ) },
    { key: 'shiftName', header: 'Shift', sortable: true, width: '11rem', render: (a) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{a.shiftName}</p>
        <p className="font-mono text-2xs text-fg-subtle">{a.shiftStart}–{a.shiftEnd}</p>
      </div>
    ) },
    { key: 'inTime', header: 'In', width: '8.5rem', render: (a) => <PunchCell time={a.inTime} lateMinutes={a.lateMinutes} source={a.inSource} /> },
    { key: 'outTime', header: 'Out', width: '8.5rem', render: (a) => <PunchCell time={a.outTime} source={a.outSource} /> },
    { key: 'workedMinutes', header: 'Worked', align: 'right', width: '7.5rem', sortable: true, render: (a) => <Hours minutes={a.workedMinutes} /> },
    { key: 'overtimeMinutes', header: 'Overtime', align: 'right', width: '8rem', sortable: true, render: (a) => (
      a.overtimeMinutes ? <Hours minutes={a.overtimeMinutes} /> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'certified', header: 'Certified for the job', width: '13rem', accessor: (a) => {
      const ok = skills.some((s) => s.employeeCode === a.employeeCode && s.status === 'CERTIFIED' && ['SKILLED', 'EXPERT', 'TRAINER'].includes(s.level))
      return ok ? 1 : 0
    }, render: (a) => {
      if (!a.workCentre) return <span className="text-2xs text-fg-subtle">off floor</span>
      const mine = skills.filter((s) => s.employeeCode === a.employeeCode)
      const ok = mine.some((s) => s.status === 'CERTIFIED' && ['SKILLED', 'EXPERT', 'TRAINER'].includes(s.level))
      const problem = mine.find((s) => s.status === 'EXPIRED' || s.status === 'EXPIRING')
      if (!ok) return <Badge tone="danger" size="sm">not certified alone</Badge>
      return problem ? (
        <Badge tone="warning" size="sm" dot={false}>certificate {problem.status.toLowerCase()}</Badge>
      ) : (
        <Badge tone="success" size="sm" dot={false}>certified</Badge>
      )
    } },
    { key: 'status', header: 'Status', sortable: true, width: '9.5rem', render: (a) => <HrStatusBadge status={a.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'team-attendance', `Team attendance — ${manager}`, columnsFromTable(teamColumns), todayTeam)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="My team"
        description="Manager self service — leave, attendance, overtime and roster in one queue"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'My team' }]}
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'APPROVALS' ? totalPending : undefined }))} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-surface-2/50 px-3 py-2">
        <span className="text-2xs font-medium text-fg-subtle">Viewing as</span>
        <Select
          sizeVariant="sm"
          containerClassName="w-56"
          value={manager}
          onChange={(e) => setManager(e.target.value)}
          options={managers.map((m) => ({ value: m, label: m }))}
        />
        <span className="text-2xs text-fg-subtle">
          {team.length} direct report{team.length === 1 ? '' : 's'} · in the live product this is the signed-in manager and cannot be changed
        </span>
      </div>

      {tab === 'APPROVALS' && (
        <>
          {totalPending === 0 ? (
            <Card>
              <CardBody className="py-10 text-center">
                <p className="text-sm font-medium text-fg">Nothing waiting on you</p>
                <p className="mt-1 text-xs text-fg-muted">
                  No leave, overtime, attendance correction or shift swap needs a decision from {manager} right now.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-4">
              {myLeave.length > 0 && (
                <Card>
                  <CardHeader title={`Leave — ${myLeave.length} to decide`} description="You judge whether the line can run without them; HR judges the entitlement afterwards" />
                  <CardBody className="space-y-2">
                    {myLeave.map((l) => {
                      const clash = leave.filter(
                        (x) => x.uid !== l.uid && teamCodes.has(x.employeeCode) && x.status === 'APPROVED' &&
                          new Date(x.fromDate) <= new Date(l.toDate) && new Date(x.toDate) >= new Date(l.fromDate),
                      )
                      return (
                        <div key={l.uid} className={cn('rounded border p-2.5', clash.length ? 'border-warning/30 bg-warning/5' : 'border-border bg-surface-2')}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-fg">
                                {l.employeeName} — {l.days} day{l.days === 1 ? '' : 's'} {LEAVE_TYPE_LABEL[l.leaveType].toLowerCase()},{' '}
                                {formatDate(l.fromDate)} to {formatDate(l.toDate)}
                              </p>
                              <p className="mt-0.5 text-2xs text-fg-muted">{l.reason}</p>
                              <p className="mt-1 text-2xs">
                                <span className={l.balanceAtApply >= l.days ? 'text-success' : 'text-danger'}>
                                  balance {l.balanceAtApply} against {l.days} needed
                                </span>
                                {!l.handoverTo && <span className="ml-2 text-warning">no handover named</span>}
                                {clash.length > 0 && (
                                  <span className="ml-2 text-warning">
                                    {clash.map((c) => c.employeeName.split(' ')[0]).join(', ')} already off then
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => {
                                  updateLeave(l.uid, {
                                    status: 'PENDING_HR',
                                    managerApprovedBy: manager,
                                    managerApprovedOn: new Date().toISOString().slice(0, 10),
                                  })
                                  toast.success('Approved', `${l.employeeName}'s leave has gone to HR for the entitlement check.`)
                                }}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  updateLeave(l.uid, {
                                    status: 'REJECTED',
                                    rejectionReason: clash.length
                                      ? `Cover not available — ${clash.map((c) => c.employeeName).join(', ')} already approved for the same dates.`
                                      : 'Cover not available for these dates.',
                                  })
                                  toast.success('Rejected', `${l.employeeName} is notified with the reason.`)
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </CardBody>
                </Card>
              )}

              {myOt.length > 0 && (
                <Card>
                  <CardHeader title={`Overtime — ${myOt.length} to decide`} description="Approve against what the attendance reader saw, not against the claim" />
                  <CardBody className="space-y-2">
                    {myOt.map((o) => {
                      const gap = o.claimedMinutes - o.systemMinutes
                      return (
                        <div key={o.uid} className={cn('rounded border p-2.5', gap > 15 ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface-2')}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-fg">
                                {o.employeeName} — {(o.claimedMinutes / 60).toFixed(1)} h claimed on {formatDate(o.otDate)}
                              </p>
                              <p className="mt-0.5 text-2xs text-fg-muted">{o.reason}</p>
                              <p className={cn('mt-1 text-2xs', gap > 15 ? 'font-medium text-danger' : 'text-success')}>
                                Reader recorded {(o.systemMinutes / 60).toFixed(1)} h
                                {gap > 15 ? ` — ${gap} minutes more is being claimed than it saw` : ' — the claim is supported'}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => {
                                  const amount = Math.round((o.systemMinutes / 60) * o.hourlyRate * o.rateMultiplier)
                                  updateOt(o.uid, {
                                    approvedMinutes: o.systemMinutes,
                                    amount,
                                    status: 'APPROVED',
                                    approvedBy: manager,
                                  })
                                  toast.success(
                                    'Approved against the punches',
                                    `${(o.systemMinutes / 60).toFixed(1)} h approved for ${o.employeeName} at twice the ordinary rate.`,
                                  )
                                }}
                              >
                                Approve {(o.systemMinutes / 60).toFixed(1)} h
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  updateOt(o.uid, { status: 'REJECTED', approvedMinutes: 0, amount: 0 })
                                  toast.success('Rejected', `${o.employeeName}'s claim rejected; nothing goes to payroll.`)
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </CardBody>
                </Card>
              )}

              {myPunches.length > 0 && (
                <Card>
                  <CardHeader title={`Attendance corrections — ${myPunches.length} to decide`} description="Left uncorrected these become absent days and short salaries" />
                  <CardBody className="space-y-2">
                    {myPunches.map((a) => (
                      <div key={a.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg">
                            {a.employeeName} — {a.status === 'MISSED_PUNCH' ? 'missed a punch' : 'absent with no leave'}
                          </p>
                          <p className="text-2xs text-fg-muted">
                            {a.shiftName} {a.shiftStart}–{a.shiftEnd} · {a.inTime ? `in ${a.inTime}` : 'no in punch'} ·{' '}
                            {a.outTime ? `out ${a.outTime}` : 'no out punch'}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => {
                              updateAttendance(a.uid, {
                                inTime: a.inTime ?? a.shiftStart,
                                outTime: a.outTime ?? a.shiftEnd,
                                inSource: 'MANUAL',
                                outSource: 'MANUAL',
                                workedMinutes: 450,
                                status: 'PRESENT',
                                regularised: true,
                                regularisedBy: manager,
                                regularisationReason: 'Supervisor confirms the employee worked the full shift; reader did not record the punch.',
                              })
                              toast.success(
                                'Regularised',
                                `${a.employeeName} marked present for the full shift, with your name against the correction.`,
                              )
                            }}
                          >
                            Confirm they worked
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => navigate('/hrms/attendance')}>
                            Open attendance
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              )}

              {mySwaps.length > 0 && (
                <Card>
                  <CardHeader title={`Shift swaps — ${mySwaps.length} to decide`} description="A swap is only safe if both shifts keep certified cover" />
                  <CardBody className="space-y-2">
                    {mySwaps.map((r) => (
                      <div key={r.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg">
                            {r.employeeName} wants to swap {formatDate(r.rosterDate)} with {r.swapWithEmployeeCode}
                          </p>
                          <p className="text-2xs text-fg-muted">{r.shiftCode} · {r.workCentre ?? 'off floor'}</p>
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
                              toast.success('Swap rejected', `${r.employeeName} stays on ${r.shiftCode}.`)
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
            </div>
          )}
        </>
      )}

      {tab === 'TODAY' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="card p-3">
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Present</p>
              <p className="mt-1 text-2xl font-semibold tabular text-fg">{present.length}</p>
              <p className="mt-1 text-2xs text-fg-muted">of {team.length} in the team</p>
            </div>
            <div className={cn('card p-3', absent.length && 'border-danger/30 bg-danger/[0.03]')}>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Absent</p>
              <p className={cn('mt-1 text-2xl font-semibold tabular', absent.length ? 'text-danger' : 'text-success')}>{absent.length}</p>
              <p className="mt-1 text-2xs text-fg-muted">
                {absent.length ? absent.map((a) => a.employeeName.split(' ')[0]).join(', ') : 'full attendance'}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Overtime today</p>
              <p className="mt-1 text-2xl font-semibold tabular text-fg">
                {(todayTeam.reduce((s, a) => s + a.overtimeMinutes, 0) / 60).toFixed(1)} h
              </p>
              <p className="mt-1 text-2xs text-fg-muted">across the team</p>
            </div>
          </div>

          <DataTable
            rows={todayTeam}
            columns={teamColumns}
            rowKey={(a) => a.uid}
            searchPlaceholder="Search employee or work centre…"
            onExport={doExport}
            emptyTitle="No attendance for your team today"
            rowClassName={(a) => cn(
              a.status === 'ABSENT' && 'bg-danger/[0.04]',
              a.lateMinutes > 0 && 'bg-warning/[0.03]',
            )}
            rowActions={(a) => (
              <>
                <MenuItem
                  label="Edit — regularise the punch"
                  onClick={() => {
                    updateAttendance(a.uid, {
                      inTime: a.inTime ?? a.shiftStart,
                      outTime: a.outTime ?? a.shiftEnd,
                      inSource: 'MANUAL',
                      outSource: 'MANUAL',
                      status: 'PRESENT',
                      lateMinutes: 0,
                      workedMinutes: 450,
                      regularised: true,
                      regularisedBy: manager,
                      regularisationReason: 'Regularised by the reporting manager from the team screen.',
                    })
                    toast.success('Regularised', `${a.employeeName} marked present for the full shift.`)
                  }}
                />
                <MenuItem
                  label="Delete the correction"
                  danger
                  disabled={!a.regularised}
                  onClick={() => {
                    updateAttendance(a.uid, { regularised: false, regularisedBy: null, regularisationReason: null })
                    toast.success('Correction removed', `${a.employeeName}'s record is back to what the reader saw.`)
                  }}
                />
                <MenuItem separatorBefore label="Open the employee" onClick={() => navigate('/hrms/employees')} />
                <MenuItem label="Open the roster" onClick={() => navigate('/hrms/shifts')} />
              </>
            )}
          />
        </>
      )}

      {tab === 'PERFORMANCE' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Team productivity this period" description="From the incentive calculation — the same numbers the operators see" />
            <CardBody className="space-y-2">
              {team.map((e) => {
                const inc = incentives.find((i) => i.employeeCode === e.employeeCode)
                if (!inc) {
                  return (
                    <div key={e.uid} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                      <EmployeeCell name={e.fullName} code={e.employeeCode} sub={e.designation} />
                      <span className="text-2xs text-fg-subtle">not on an incentive scheme</span>
                    </div>
                  )
                }
                const outputPct = (inc.unitsProduced / inc.targetUnits) * 100
                return (
                  <div key={e.uid} className="rounded border border-border p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <EmployeeCell name={e.fullName} code={e.employeeCode} sub={inc.workCentre ?? e.department} />
                      <div className="flex flex-wrap items-center gap-4 text-2xs">
                        <span className="text-fg-muted">
                          Output <PctChip value={outputPct} target={100} />
                        </span>
                        <span className="text-fg-muted">
                          Attendance <PctChip value={inc.attendancePct} target={95} />
                        </span>
                        <span className="text-fg-muted">
                          Rejection{' '}
                          <PctChip value={(inc.rejectedUnits / inc.unitsProduced) * 100} target={2} lowerIsBetter />
                        </span>
                        <HrStatusBadge status={inc.status} size="sm" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar
                        value={Math.min(100, outputPct)}
                        tone={outputPct >= 100 ? 'success' : outputPct >= 90 ? 'warning' : 'danger'}
                        className="flex-1"
                      />
                      <span className="w-32 shrink-0 text-right text-2xs tabular text-fg-muted">
                        {formatQty(inc.goodUnits)} good of {formatQty(inc.unitsProduced)}
                      </span>
                    </div>
                    {inc.disqualifiedReason && (
                      <p className="mt-1 text-2xs text-danger">{inc.disqualifiedReason}</p>
                    )}
                  </div>
                )
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Skills in the team" description="Who can cover what if somebody is off" />
            <CardBody className="space-y-2">
              {team.map((e) => {
                const mine = skills.filter((s) => s.employeeCode === e.employeeCode)
                return (
                  <div key={e.uid} className="rounded border border-border p-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <EmployeeCell name={e.fullName} code={e.employeeCode} sub={e.designation} />
                      {canSeeAppraisal && (() => {
                        const a = appraisals.find((x) => x.employeeCode === e.employeeCode)
                        return a ? <RatingCell rating={a.finalRating ?? a.managerRating} /> : null
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {mine.map((s) => (
                        <span key={s.uid} className="flex items-center gap-1.5" title={`${s.skillName} — ${s.status.toLowerCase()}`}>
                          <SkillLevelMeter level={s.level} compact />
                          <span className={cn('text-2xs', s.status === 'EXPIRED' ? 'text-danger' : s.status === 'EXPIRING' ? 'text-warning' : 'text-fg-muted')}>
                            {s.skillName}
                          </span>
                        </span>
                      ))}
                      {mine.length === 0 && <span className="text-2xs text-fg-subtle">no skills recorded</span>}
                    </div>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader title="Four decisions, one queue" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Leave</span> — you answer only whether the line can run without them. HR checks the entitlement afterwards, so you do not have to know the balance rules.</p>
          <p><span className="font-medium text-fg">Overtime</span> — the reader figure is shown beside the claim, so approving the right number takes no investigation.</p>
          <p><span className="font-medium text-fg">Attendance</span> — a missed punch you can confirm in five seconds saves an operator a day's pay and saves HR a query.</p>
          <p><span className="font-medium text-fg">Shift swaps</span> — the only one where the answer depends on certified cover, which is why the skill status travels with the request.</p>
        </CardBody>
      </Card>
    </div>
  )
}
