import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import {
  DueCell,
  HrStatusBadge,
  Hours,
  LEAVE_TYPE_LABEL,
  SkillLevelMeter,
} from '@/components/hrms/HrmsShell'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import {
  attendance as seedAttendance,
  employeeSkills as seedSkills,
  hrEmployees as seedEmployees,
  leaveBalances as seedBalances,
  leavePolicies as seedPolicies,
  leaveRequests as seedRequests,
  overtime as seedOvertime,
  payslips as seedPayslips,
  roster as seedRoster,
  trainingRecords as seedTraining,
} from '@/mock/hrms'
import type {
  AttendanceRecord,
  EmployeeSkill,
  HrEmployee,
  LeavePolicy,
  LeaveRequest,
  LeaveType,
  OvertimeRecord,
  Payslip,
  RosterEntry,
  TrainingRecord,
} from '@/types/hrms'

const TABS = [
  { id: 'HOME', label: 'My page' },
  { id: 'LEAVE', label: 'My leave' },
  { id: 'PAY', label: 'My payslips' },
  { id: 'SKILLS', label: 'My skills & training' },
]

/**
 * Employee self service — one person's own record and nobody else's. This is how
 * most of the plant should reach a payslip: it needs no payroll permission,
 * because the scope is the signed-in employee rather than the register.
 */
export function SelfServicePage() {
  const toast = useToast()
  const empSeed = useMemo(() => seedEmployees, [])
  const attSeed = useMemo(() => seedAttendance, [])
  const leaveSeed = useMemo(() => seedRequests, [])
  const slipSeed = useMemo(() => seedPayslips, [])
  const skillSeed = useMemo(() => seedSkills, [])
  const trainSeed = useMemo(() => seedTraining, [])
  const rosterSeed = useMemo(() => seedRoster, [])
  const otSeed = useMemo(() => seedOvertime, [])
  const polSeed = useMemo(() => seedPolicies, [])

  const { rows: employees } = useCollection<HrEmployee>('hrms:employee', empSeed)
  const { rows: attendance } = useCollection<AttendanceRecord>('hrms:attendance', attSeed)
  const { rows: leaveRequests, create: createLeave } = useCollection<LeaveRequest>('hrms:leave-request', leaveSeed)
  const { rows: payslips } = useCollection<Payslip>('hrms:payslip', slipSeed)
  const { rows: skills } = useCollection<EmployeeSkill>('hrms:employee-skill', skillSeed)
  const { rows: training } = useCollection<TrainingRecord>('hrms:training-record', trainSeed)
  const { rows: roster } = useCollection<RosterEntry>('hrms:roster', rosterSeed)
  const { rows: overtime, create: createOt } = useCollection<OvertimeRecord>('hrms:overtime', otSeed)
  const { rows: policies } = useCollection<LeavePolicy>('hrms:leave-policy', polSeed)

  /**
   * In the live product this comes from the signed-in session. Here it is a
   * picker so the screen can be shown from any demo login — the point being that
   * whichever person is selected, only their own data appears.
   */
  const [me, setMe] = useState(employees.find((e) => e.isShopFloor)?.employeeCode ?? employees[0]?.employeeCode ?? '')
  const employee = employees.find((e) => e.employeeCode === me)

  const [tab, setTab] = useState('HOME')
  const [applying, setApplying] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ type: 'CASUAL' as LeaveType, from: '', to: '', reason: '' })
  const [claiming, setClaiming] = useState(false)
  const [otForm, setOtForm] = useState({ date: '', minutes: '', reason: '' })

  const myAttendance = attendance.filter((a) => a.employeeCode === me)
  const myLeave = leaveRequests.filter((l) => l.employeeCode === me)
  const mySlips = payslips.filter((p) => p.employeeCode === me && (p.status === 'RELEASED' || p.status === 'PAID'))
  const mySkills = skills.filter((s) => s.employeeCode === me)
  const myTraining = training.filter((t) => t.employeeCode === me)
  const myRoster = roster.filter((r) => r.employeeCode === me)
  const myOt = overtime.filter((o) => o.employeeCode === me)

  const today = myAttendance[0]
  const pendingLeave = myLeave.filter((l) => l.status === 'PENDING_MANAGER' || l.status === 'PENDING_HR')
  const expiringCerts = mySkills.filter((s) => s.status === 'EXPIRING' || s.status === 'EXPIRED')

  function balanceOf(type: LeaveType) {
    const stored = seedBalances.find((b) => b.employeeCode === me && b.leaveType === type)
    if (!stored) return 0
    const taken = myLeave.filter((l) => l.leaveType === type && l.status === 'APPROVED').reduce((s, l) => s + l.days, 0)
    return Math.round((stored.opening + stored.accrued - Math.max(stored.availed, taken)) * 10) / 10
  }

  if (!employee) {
    return (
      <div>
        <PageHeader title="Employee self service" breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Self service' }]} />
        <Card><CardBody className="py-10 text-center text-sm text-fg-muted">No employee record found.</CardBody></Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Employee self service"
        description="Your own record — nobody else's"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Self service' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => { setClaiming(true); setOtForm({ date: new Date().toISOString().slice(0, 10), minutes: '', reason: '' }) }}>
              Claim overtime
            </Button>
            <Button variant="primary" size="sm" onClick={() => { setApplying(true); setLeaveForm({ type: 'CASUAL', from: '', to: '', reason: '' }) }}>
              Apply for leave
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      {/* Demo-only identity picker. */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-surface-2/50 px-3 py-2">
        <span className="text-2xs font-medium text-fg-subtle">Viewing as</span>
        <Select
          sizeVariant="sm"
          containerClassName="w-64"
          value={me}
          onChange={(e) => setMe(e.target.value)}
          options={employees.filter((e) => e.status !== 'EXITED').map((e) => ({ value: e.employeeCode, label: `${e.fullName} — ${e.designation}` }))}
        />
        <span className="text-2xs text-fg-subtle">
          In the live product this is the signed-in user and cannot be changed. Whoever is selected, only their own records appear.
        </span>
      </div>

      {tab === 'HOME' && (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Me" />
              <CardBody>
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-semibold text-brand-600">
                    {employee.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{employee.fullName}</p>
                    <p className="truncate text-2xs text-fg-muted">{employee.designation} · {employee.department}</p>
                  </div>
                </div>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Employee code', value: employee.employeeCode, mono: true },
                    { label: 'Reports to', value: employee.reportsTo },
                    { label: 'Shift', value: employee.shiftCode, mono: true },
                    { label: 'Joined', value: formatDate(employee.dateOfJoining) },
                    { label: 'Work centre', value: employee.workCentre ?? 'off floor' },
                  ]}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Today" description={today ? today.shiftName : 'no attendance record'} />
              <CardBody className="space-y-3">
                {today ? (
                  <>
                    <div className="flex items-center justify-between">
                      <HrStatusBadge status={today.status} />
                      <span className="text-2xs text-fg-muted">
                        scheduled {today.shiftStart}–{today.shiftEnd}
                      </span>
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <p className="text-fg-muted">In <span className="block font-mono font-medium text-fg">{today.inTime ?? 'no punch'}</span></p>
                      <p className="text-fg-muted">Out <span className="block font-mono font-medium text-fg">{today.outTime ?? 'no punch'}</span></p>
                      <p className="text-fg-muted">Worked <span className="block font-medium text-fg"><Hours minutes={today.workedMinutes} /></span></p>
                      <p className="text-fg-muted">Overtime <span className="block font-medium text-fg"><Hours minutes={today.overtimeMinutes} /></span></p>
                    </div>
                    {today.lateMinutes > 0 && (
                      <p className="rounded border border-warning/30 bg-warning/5 p-2 text-2xs text-warning">
                        Marked late by {today.lateMinutes} minutes. If the reader was at fault, ask your supervisor to regularise it
                        before payroll closes.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-fg-muted">Nothing recorded for today yet.</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Leave balance" description="As at today" />
              <CardBody className="space-y-2.5">
                {(['CASUAL', 'SICK', 'EARNED', 'COMP_OFF'] as LeaveType[]).map((t) => {
                  const policy = policies.find((p) => p.leaveType === t)
                  const bal = balanceOf(t)
                  const entitlement = policy?.annualEntitlement || 1
                  return (
                    <div key={t}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-fg-muted">{LEAVE_TYPE_LABEL[t]}</span>
                        <span className={cn('font-medium tabular', bal <= 0 ? 'text-danger' : bal < 2 ? 'text-warning' : 'text-fg')}>
                          {bal} day{bal === 1 ? '' : 's'}
                        </span>
                      </div>
                      <ProgressBar
                        value={Math.max(0, Math.min(100, (bal / entitlement) * 100))}
                        tone={bal <= 0 ? 'danger' : bal < 2 ? 'warning' : 'success'}
                      />
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          </div>

          {(pendingLeave.length > 0 || expiringCerts.length > 0) && (
            <Card className="mb-4">
              <CardHeader title="Waiting on something" />
              <CardBody className="space-y-2">
                {pendingLeave.map((l) => (
                  <div key={l.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-progress/30 bg-progress/5 p-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-fg">
                        {l.days} day{l.days === 1 ? '' : 's'} {LEAVE_TYPE_LABEL[l.leaveType].toLowerCase()} leave —{' '}
                        {formatDate(l.fromDate)} to {formatDate(l.toDate)}
                      </p>
                      <p className="text-2xs text-fg-muted">
                        {l.status === 'PENDING_MANAGER' ? 'With your reporting manager' : 'Approved by your manager, now with HR'}
                      </p>
                    </div>
                    <HrStatusBadge status={l.status} size="sm" />
                  </div>
                ))}
                {expiringCerts.map((s) => (
                  <div key={s.uid} className="rounded border border-warning/30 bg-warning/5 p-2.5">
                    <p className="text-xs font-medium text-fg">{s.skillName} certification {s.status === 'EXPIRED' ? 'has expired' : 'expires soon'}</p>
                    <p className="text-2xs text-fg-muted">
                      {s.certificationExpiresOn ? `${s.status === 'EXPIRED' ? 'Expired' : 'Expires'} ${formatDate(s.certificationExpiresOn)}. ` : ''}
                      Ask your supervisor to book the refresher — without it you cannot be rostered onto this operation alone.
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="My shifts" description="The next three days" />
            <CardBody className="grid gap-2 sm:grid-cols-3">
              {myRoster.map((r) => (
                <div key={r.uid} className="rounded border border-border p-2.5">
                  <p className="text-xs font-medium text-fg">{formatDate(r.rosterDate)}</p>
                  <p className="mt-0.5 font-mono text-2xs text-fg-muted">{r.shiftCode}</p>
                  <p className="truncate text-2xs text-fg-subtle">{r.workCentre ?? 'off floor'}</p>
                  <div className="mt-1.5"><HrStatusBadge status={r.status} size="sm" /></div>
                </div>
              ))}
              {myRoster.length === 0 && (
                <p className="col-span-full py-3 text-center text-xs text-fg-muted">Nothing rostered yet.</p>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {tab === 'LEAVE' && (
        <Card>
          <CardHeader
            title="My leave"
            description="Everything applied for, and where it has reached"
            actions={<Button variant="primary" size="sm" onClick={() => { setApplying(true); setLeaveForm({ type: 'CASUAL', from: '', to: '', reason: '' }) }}>Apply</Button>}
          />
          <CardBody className="space-y-2">
            {myLeave.map((l) => (
              <div key={l.uid} className="flex flex-wrap items-start justify-between gap-3 rounded border border-border p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {LEAVE_TYPE_LABEL[l.leaveType]} · {l.days} day{l.days === 1 ? '' : 's'} ·{' '}
                    {formatDate(l.fromDate)} to {formatDate(l.toDate)}
                  </p>
                  <p className="mt-0.5 text-2xs text-fg-muted">{l.reason}</p>
                  <p className="mt-1 text-2xs text-fg-subtle">
                    Applied {formatDate(l.appliedOn)}
                    {l.managerApprovedBy ? ` · manager approved ${l.managerApprovedOn ? formatDate(l.managerApprovedOn) : ''}` : ''}
                    {l.hrApprovedBy ? ` · HR approved ${l.hrApprovedOn ? formatDate(l.hrApprovedOn) : ''}` : ''}
                  </p>
                  {l.rejectionReason && (
                    <p className="mt-1 text-2xs text-danger">Not approved — {l.rejectionReason}</p>
                  )}
                </div>
                <HrStatusBadge status={l.status} size="sm" />
              </div>
            ))}
            {myLeave.length === 0 && <p className="py-6 text-center text-xs text-fg-muted">No leave applied for.</p>}
          </CardBody>
        </Card>
      )}

      {tab === 'PAY' && (
        <>
          <Card className="mb-4">
            <CardHeader
              title="My payslips"
              description="Only released payslips appear — a payslip being prepared is not visible until payroll releases it"
            />
            <CardBody className="space-y-2">
              {mySlips.map((p) => (
                <div key={p.uid} className="rounded border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-fg">{p.period}</p>
                      <p className="mt-0.5 text-2xs text-fg-muted">
                        {p.daysPaid} of {p.daysInMonth} days paid
                        {p.daysAbsent ? ` · ${p.daysAbsent} day loss of pay` : ''}
                        {p.overtimeHours ? ` · ${p.overtimeHours} h overtime` : ''}
                        {p.incentiveAmount ? ` · incentive ${formatCurrency(p.incentiveAmount)}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular text-success">{formatCurrency(p.netPay)}</p>
                      <p className="text-2xs text-fg-subtle">to {p.bankAccountMasked}</p>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 border-t border-border pt-2 text-2xs sm:grid-cols-3">
                    <p className="text-fg-muted">Gross <span className="block font-medium tabular text-fg">{formatCurrency(p.grossEarnings)}</span></p>
                    <p className="text-fg-muted">Deductions <span className="block font-medium tabular text-danger">{formatCurrency(p.totalDeductions)}</span></p>
                    <p className="text-fg-muted">
                      Employer PF & ESI
                      <span className="block font-medium tabular text-fg">{formatCurrency(p.employerPf + p.employerEsi)}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => toast.success('Payslip downloaded', `${p.period} payslip saved as a PDF.`)}>
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toast.info(
                          'Query raised',
                          `Your query on the ${p.period} payslip has gone to HR with the payslip attached. Most queries are about loss of pay or the attendance allowance — both come from the attendance record.`,
                        )
                      }
                    >
                      Raise a query
                    </Button>
                  </div>
                </div>
              ))}
              {mySlips.length === 0 && (
                <p className="py-6 text-center text-xs text-fg-muted">
                  No released payslips yet. A payslip appears here once payroll releases it.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="My overtime claims" />
            <CardBody className="space-y-2">
              {myOt.map((o) => (
                <div key={o.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">
                      {formatDate(o.otDate)} — {(o.claimedMinutes / 60).toFixed(1)} h claimed
                      {o.approvedMinutes ? `, ${(o.approvedMinutes / 60).toFixed(1)} h approved` : ''}
                    </p>
                    <p className="text-2xs text-fg-muted">{o.reason}</p>
                    {o.claimedMinutes > o.systemMinutes + 15 && o.status === 'REQUESTED' && (
                      <p className="mt-0.5 text-2xs text-warning">
                        The attendance reader recorded {(o.systemMinutes / 60).toFixed(1)} h. Your supervisor will approve against
                        that unless there is a note explaining the difference.
                      </p>
                    )}
                  </div>
                  <HrStatusBadge status={o.status} size="sm" />
                </div>
              ))}
              {myOt.length === 0 && <p className="py-6 text-center text-xs text-fg-muted">No overtime claimed.</p>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === 'SKILLS' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="My skills" description="What you are certified to run, and until when" />
            <CardBody className="space-y-2">
              {mySkills.map((s) => (
                <div key={s.uid} className="rounded border border-border p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-fg">{s.skillName}</p>
                    <HrStatusBadge status={s.status} size="sm" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <SkillLevelMeter level={s.level} />
                    {s.certificationExpiresOn && <DueCell date={s.certificationExpiresOn} label="expires" />}
                  </div>
                  {s.unitsPerHour && (
                    <p className="mt-1 text-2xs text-fg-subtle">
                      Your observed output is {s.unitsPerHour} an hour at a {s.defectRatePct}% defect rate.
                    </p>
                  )}
                </div>
              ))}
              {mySkills.length === 0 && <p className="py-6 text-center text-xs text-fg-muted">No skills recorded yet.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="My training" description="Attended, passed, and what is booked" />
            <CardBody className="space-y-2">
              {myTraining.map((t) => (
                <div key={t.uid} className="rounded border border-border p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-fg">{t.programmeTitle}</p>
                    <HrStatusBadge status={t.status} size="sm" />
                  </div>
                  <p className="mt-0.5 text-2xs text-fg-muted">
                    {t.attendedOn ? `Attended ${formatDate(t.attendedOn)}, ${t.hoursAttended} h` : 'Not attended yet'}
                    {t.assessmentScore !== null ? ` · scored ${t.assessmentScore}` : ''}
                    {t.certificateNo ? ` · ${t.certificateNo}` : ''}
                  </p>
                  {t.certificationExpiresOn && (
                    <div className="mt-1"><DueCell date={t.certificationExpiresOn} label="certificate expires" /></div>
                  )}
                </div>
              ))}
              {myTraining.length === 0 && <p className="py-6 text-center text-xs text-fg-muted">No training records yet.</p>}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Apply for leave --------------------------------------------------- */}
      <Modal
        open={applying}
        onClose={() => setApplying(false)}
        title="Apply for leave"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setApplying(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!leaveForm.from || !leaveForm.to) {
                  toast.error('Enter the dates', 'Both a from and a to date are needed.')
                  return
                }
                const days = Math.round((new Date(leaveForm.to).getTime() - new Date(leaveForm.from).getTime()) / 86_400_000) + 1
                if (days <= 0) {
                  toast.error('Dates are the wrong way round', 'The to date has to be on or after the from date.')
                  return
                }
                if (!leaveForm.reason.trim()) {
                  toast.error('Enter a reason', 'Your manager reads only this.')
                  return
                }
                const policy = policies.find((p) => p.leaveType === leaveForm.type)
                if (policy && !policy.appliesTo.includes(employee.employmentType)) {
                  toast.error(
                    'Not available to you',
                    `${policy.name} applies to ${policy.appliesTo.map((t) => t.toLowerCase()).join(', ')} employees, and you are on ${employee.employmentType.toLowerCase()} terms.`,
                  )
                  return
                }
                if (policy && days > policy.maxConsecutiveDays) {
                  toast.error(
                    'Longer than the policy allows',
                    `${policy.name} allows at most ${policy.maxConsecutiveDays} consecutive days. Split the request or speak to HR.`,
                  )
                  return
                }
                const bal = balanceOf(leaveForm.type)
                createLeave({
                  uid: `lv-ess-${Date.now().toString(36)}`,
                  docNo: `LV/2627/${String(430 + leaveRequests.length).padStart(4, '0')}`,
                  employeeCode: employee.employeeCode,
                  employeeName: employee.fullName,
                  department: employee.department,
                  leaveType: leaveForm.type,
                  fromDate: leaveForm.from,
                  toDate: leaveForm.to,
                  days,
                  isHalfDay: false,
                  reason: leaveForm.reason.trim(),
                  appliedOn: new Date().toISOString().slice(0, 10),
                  contactDuringLeave: employee.mobile,
                  handoverTo: null,
                  documentAttached: false,
                  managerApprovedBy: null,
                  managerApprovedOn: null,
                  hrApprovedBy: null,
                  hrApprovedOn: null,
                  rejectionReason: null,
                  balanceAtApply: bal,
                  status: 'PENDING_MANAGER',
                } as LeaveRequest)
                toast.success(
                  'Leave applied',
                  bal >= days || leaveForm.type === 'LOSS_OF_PAY'
                    ? `${days} day${days === 1 ? '' : 's'} sent to ${employee.reportsTo} for approval.`
                    : `${days} day${days === 1 ? '' : 's'} sent for approval, but your balance is ${bal}. The excess would be loss of pay if approved — worth discussing first.`,
                )
                setApplying(false)
                setTab('LEAVE')
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select
            label="Leave type"
            value={leaveForm.type}
            onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value as LeaveType })}
            options={policies.filter((p) => p.isActive).map((p) => ({ value: p.leaveType, label: p.name }))}
            hint={`Your balance: ${balanceOf(leaveForm.type)} day${balanceOf(leaveForm.type) === 1 ? '' : 's'}`}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="From" type="date" value={leaveForm.from} onChange={(e) => setLeaveForm({ ...leaveForm, from: e.target.value })} />
            <Input label="To" type="date" value={leaveForm.to} onChange={(e) => setLeaveForm({ ...leaveForm, to: e.target.value })} />
          </div>
          <Textarea label="Reason" rows={3} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
          <p className="text-2xs text-fg-muted">
            It goes to {employee.reportsTo} first, then to HR. Both approvals are needed before the attendance record changes.
          </p>
        </div>
      </Modal>

      {/* Claim overtime ---------------------------------------------------- */}
      <Modal
        open={claiming}
        onClose={() => setClaiming(false)}
        title="Claim overtime"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setClaiming(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                const mins = Number(otForm.minutes)
                if (!otForm.date) {
                  toast.error('Enter the date', 'Which day was the overtime worked?')
                  return
                }
                if (!mins || mins <= 0) {
                  toast.error('Enter the minutes', 'How much overtime are you claiming?')
                  return
                }
                if (!otForm.reason.trim()) {
                  toast.error('Enter a reason', 'Your supervisor needs to know what the extra time was for.')
                  return
                }
                const att = attendance.find((a) => a.employeeCode === me && a.attendanceDate === otForm.date)
                const systemMinutes = att?.overtimeMinutes ?? 0
                createOt({
                  uid: `ot-ess-${Date.now().toString(36)}`,
                  docNo: `OT/2607/${String(420 + overtime.length).padStart(4, '0')}`,
                  otDate: otForm.date,
                  employeeCode: employee.employeeCode,
                  employeeName: employee.fullName,
                  department: employee.department,
                  shiftCode: employee.shiftCode,
                  claimedMinutes: mins,
                  systemMinutes,
                  approvedMinutes: 0,
                  reason: otForm.reason.trim(),
                  productionOrderNo: null,
                  workCentre: employee.workCentre,
                  rateMultiplier: 2,
                  hourlyRate: Math.round((employee.monthlyCtc / 27 / 8) * 100) / 100,
                  amount: 0,
                  requestedBy: employee.fullName,
                  approvedBy: null,
                  status: 'REQUESTED',
                } as OvertimeRecord)
                toast.success(
                  'Overtime claimed',
                  systemMinutes >= mins - 15
                    ? `${(mins / 60).toFixed(1)} h claimed and sent for approval. The attendance reader supports it.`
                    : `${(mins / 60).toFixed(1)} h claimed, but the reader recorded ${(systemMinutes / 60).toFixed(1)} h for that day. Your supervisor will need an explanation for the difference.`,
                )
                setClaiming(false)
                setTab('PAY')
              }}
            >
              Claim
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Date worked" type="date" value={otForm.date} onChange={(e) => setOtForm({ ...otForm, date: e.target.value })} />
            <Input label="Minutes claimed" type="number" value={otForm.minutes} onChange={(e) => setOtForm({ ...otForm, minutes: e.target.value })} />
          </div>
          <Textarea
            label="What the extra time was for"
            rows={3}
            value={otForm.reason}
            onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })}
            placeholder="Bottom welding backlog after the polishing machine breakdown."
          />
          <p className="text-2xs text-fg-muted">
            Overtime is paid at twice the ordinary rate, and only for minutes your supervisor approves. Claims well above what the
            attendance reader saw need an explanation.
          </p>
        </div>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="What self service is for" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">It needs no payroll permission.</span> The scope is one signed-in person, so an
            operator can see their own payslip without anybody being able to see the register.
          </p>
          <p>
            <span className="font-medium text-fg">It removes the queue at the HR desk.</span> Leave balance, shift roster, payslip
            and certificate expiry are the four things people actually walk over to ask about.
          </p>
          <p>
            <span className="font-medium text-fg">It tells people the rule before they break it.</span> A leave application that
            exceeds the balance says so at the point of applying, rather than surfacing as a short salary a month later. Managers
            see the other side of this on{' '}
            <Link to="/hrms/team" className="font-medium text-brand-600 hover:underline">the team screen</Link>.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
