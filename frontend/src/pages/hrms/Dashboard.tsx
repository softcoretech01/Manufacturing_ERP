import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import {
  DueCell,
  EMPLOYMENT_TYPE_LABEL,
  HrChartTip,
  HrStatusBadge,
  PctChip,
  useCanSeePay,
} from '@/components/hrms/HrmsShell'
import { formatCurrency, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import {
  PERIOD_LABEL,
  attendance as seedAttendance,
  attendanceTrend,
  attritionTrend,
  employeeSkills as seedSkills,
  headcountByDepartment,
  hrEmployees as seedEmployees,
  incentiveEarnings as seedIncentives,
  labourCostLines as seedLabour,
  leaveRequests as seedLeave,
  overtime as seedOvertime,
  payrollRuns as seedRuns,
  payrollTrend,
  productivityTrend,
  statutoryReturns as seedStatutory,
  trainingRecords as seedTraining,
} from '@/mock/hrms'
import type {
  AttendanceRecord,
  EmployeeSkill,
  HrEmployee,
  IncentiveEarning,
  LabourCostLine,
  LeaveRequest,
  OvertimeRecord,
  PayrollRun,
  StatutoryReturn,
  TrainingRecord,
} from '@/types/hrms'

/**
 * HR dashboard. The order answers a plant head's morning questions: is the crew
 * here, is anything about to become a compliance problem, what is labour costing,
 * and where are the skill and attrition risks.
 */
export function HrmsDashboardPage() {
  const canSeePay = useCanSeePay()

  const empSeed = useMemo(() => seedEmployees, [])
  const attSeed = useMemo(() => seedAttendance, [])
  const leaveSeed = useMemo(() => seedLeave, [])
  const otSeed = useMemo(() => seedOvertime, [])
  const runSeed = useMemo(() => seedRuns, [])
  const incSeed = useMemo(() => seedIncentives, [])
  const labSeed = useMemo(() => seedLabour, [])
  const skillSeed = useMemo(() => seedSkills, [])
  const trainSeed = useMemo(() => seedTraining, [])
  const statSeed = useMemo(() => seedStatutory, [])

  const { rows: employees } = useCollection<HrEmployee>('hrms:employee', empSeed)
  const { rows: attendance } = useCollection<AttendanceRecord>('hrms:attendance', attSeed)
  const { rows: leave } = useCollection<LeaveRequest>('hrms:leave-request', leaveSeed)
  const { rows: overtime } = useCollection<OvertimeRecord>('hrms:overtime', otSeed)
  const { rows: runs } = useCollection<PayrollRun>('hrms:payroll-run', runSeed)
  const { rows: incentives } = useCollection<IncentiveEarning>('hrms:incentive-earning', incSeed)
  const { rows: labourCost } = useCollection<LabourCostLine>('hrms:labour-cost', labSeed)
  const { rows: skills } = useCollection<EmployeeSkill>('hrms:employee-skill', skillSeed)
  const { rows: training } = useCollection<TrainingRecord>('hrms:training-record', trainSeed)
  const { rows: statutory } = useCollection<StatutoryReturn>('hrms:statutory-return', statSeed)

  /* ── Headline numbers ────────────────────────────────────────────────── */
  const onRoll = employees.filter((e) => e.status !== 'EXITED')
  const shopFloor = onRoll.filter((e) => e.isShopFloor)
  const newJoiners = onRoll.filter((e) => Date.now() - new Date(e.dateOfJoining).getTime() < 90 * 86_400_000)
  const onNotice = onRoll.filter((e) => e.status === 'NOTICE')

  const present = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
  const absent = attendance.filter((a) => a.status === 'ABSENT')
  const attendancePct = attendance.length ? (present.length / attendance.length) * 100 : 0
  const absenteeismPct = attendance.length ? (absent.length / attendance.length) * 100 : 0
  const exceptions = attendance.filter(
    (a) => (a.status === 'MISSED_PUNCH' || a.status === 'ABSENT') && !a.regularised,
  )

  const otMinutes = overtime.filter((o) => o.status === 'APPROVED' || o.status === 'PAID').reduce((s, o) => s + o.approvedMinutes, 0)
  const otPending = overtime.filter((o) => o.status === 'REQUESTED')
  const leavePending = leave.filter((l) => l.status === 'PENDING_MANAGER' || l.status === 'PENDING_HR')

  const currentRun = runs.find((r) => r.status !== 'PAID' && r.status !== 'CLOSED') ?? runs[0]
  const incentiveEarned = incentives.reduce((s, i) => s + i.earnedIncentive, 0)
  const incentiveDisqualified = incentives.filter((i) => i.status === 'DISQUALIFIED')

  const totalLabourCost = labourCost.reduce((s, l) => s + l.totalCost, 0)
  const totalUnits = labourCost.reduce((s, l) => s + l.unitsProduced, 0)
  const costPerBottle = totalUnits ? totalLabourCost / totalUnits : 0

  const certExpiring = skills.filter((s) => s.status === 'EXPIRING' || s.status === 'EXPIRED')
  const trainingDone = training.filter((t) => t.status === 'PASSED' || t.status === 'ATTENDED')
  const trainingPct = training.length ? (trainingDone.length / training.length) * 100 : 0

  const statutoryOverdue = statutory.filter(
    (r) => r.status === 'OVERDUE' || (r.status !== 'FILED' && r.status !== 'NOT_DUE' && new Date(r.dueOn).getTime() < Date.now()),
  )
  const statutoryDueSoon = statutory.filter(
    (r) => r.status !== 'FILED' && new Date(r.dueOn).getTime() >= Date.now() && new Date(r.dueOn).getTime() - Date.now() < 15 * 86_400_000,
  )

  /** Attrition over the trailing twelve months, annualised on current headcount. */
  const attritionPct = onRoll.length
    ? (attritionTrend.reduce((s, m) => s + m.exited, 0) / onRoll.length) * (12 / attritionTrend.length) * 100
    : 0

  const employmentMix = Object.entries(
    onRoll.reduce<Record<string, number>>((acc, e) => {
      acc[e.employmentType] = (acc[e.employmentType] ?? 0) + 1
      return acc
    }, {}),
  ).map(([type, count]) => ({ type: EMPLOYMENT_TYPE_LABEL[type] ?? type, count }))

  /** Anything with a date that is about to bite. */
  const milestones = onRoll
    .flatMap((e) => [
      e.confirmationDueOn && { employee: e, label: 'Probation confirmation', date: e.confirmationDueOn },
      e.contractEndOn && { employee: e, label: 'Contract ends', date: e.contractEndOn },
      e.exitDate && { employee: e, label: 'Last working day', date: e.exitDate },
    ])
    .filter((x): x is { employee: HrEmployee; label: string; date: string } => !!x)
    .filter((x) => new Date(x.date).getTime() - Date.now() < 60 * 86_400_000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div>
      <PageHeader
        title="HR & payroll"
        description={`Workforce at a glance · payroll period ${PERIOD_LABEL}`}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll' }]}
      />

      {/* Headline strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/hrms/employees" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">On roll</p>
          <p className="mt-1 text-2xl font-semibold tabular text-fg">{onRoll.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">
            {shopFloor.length} on the shop floor · {newJoiners.length} joined in 90 days
            {onNotice.length > 0 && <span className="text-danger"> · {onNotice.length} on notice</span>}
          </p>
        </Link>

        <Link to="/hrms/attendance" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Attendance today</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', attendancePct >= 95 ? 'text-success' : 'text-warning')}>
            {attendancePct.toFixed(1)}%
          </p>
          <div className="mt-2">
            <ProgressBar value={attendancePct} tone={attendancePct >= 95 ? 'success' : 'warning'} />
          </div>
          <p className="mt-1 text-2xs text-fg-muted">
            {present.length} present, {absent.length} absent · absenteeism {absenteeismPct.toFixed(1)}%
          </p>
        </Link>

        <Link to="/hrms/overtime" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Overtime approved</p>
          <p className="mt-1 text-2xl font-semibold tabular text-fg">{(otMinutes / 60).toFixed(1)} h</p>
          <p className="mt-1 text-2xs text-fg-muted">
            {otPending.length > 0 ? (
              <span className="text-warning">{otPending.length} claim{otPending.length === 1 ? '' : 's'} still open</span>
            ) : (
              'every claim decided'
            )}
          </p>
        </Link>

        {canSeePay ? (
          <Link to="/hrms/labour-cost" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Labour cost per bottle</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular', costPerBottle > 3.4 ? 'text-warning' : 'text-success')}>
              ₹{costPerBottle.toFixed(2)}
            </p>
            <p className="mt-1 text-2xs text-fg-muted">
              {formatCurrency(totalLabourCost)} over {formatQty(totalUnits)} units · target ₹3.20
            </p>
          </Link>
        ) : (
          <Link to="/hrms/skills" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Certifications at risk</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular', certExpiring.length ? 'text-warning' : 'text-success')}>
              {certExpiring.length}
            </p>
            <p className="mt-1 text-2xs text-fg-muted">expiring or expired — cannot be rostered alone</p>
          </Link>
        )}
      </div>

      {/* Needs attention */}
      {(statutoryOverdue.length > 0 || exceptions.length > 0 || leavePending.length > 0 || milestones.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Needs attention" description="Statutory exposure first, then anything that would produce a wrong salary" />
          <CardBody className="space-y-2">
            {statutoryOverdue.map((r) => (
              <Link
                key={r.uid}
                to="/hrms/statutory"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-danger/30 bg-danger/5 p-2.5 hover:bg-danger/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-medium">{r.name}</span> for {r.period} is overdue —{' '}
                  {Math.round((Date.now() - new Date(r.dueOn).getTime()) / 86_400_000)} days past the due date
                  {r.remarks ? `. ${r.remarks}` : ''}
                </span>
                <Badge tone="danger" size="sm">statutory</Badge>
              </Link>
            ))}
            {exceptions.length > 0 && (
              <Link
                to="/hrms/attendance"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-danger/30 bg-danger/5 p-2.5 hover:bg-danger/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-medium">{exceptions.length} attendance exception{exceptions.length === 1 ? '' : 's'}</span>{' '}
                  unregularised — each becomes an absent day and a short salary, and payroll cannot close over them
                </span>
                <Badge tone="danger" size="sm">payroll gate</Badge>
              </Link>
            )}
            {otPending.length > 0 && (
              <Link
                to="/hrms/overtime"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-warning/30 bg-warning/5 p-2.5 hover:bg-warning/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-medium">{otPending.length} overtime claim{otPending.length === 1 ? '' : 's'}</span> awaiting
                  approval — the payroll run is blocked until they are decided
                </span>
                <Badge tone="warning" size="sm">payroll gate</Badge>
              </Link>
            )}
            {leavePending.length > 0 && (
              <Link
                to="/hrms/leave"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-progress/30 bg-progress/5 p-2.5 hover:bg-progress/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-medium">{leavePending.length} leave request{leavePending.length === 1 ? '' : 's'}</span>{' '}
                  awaiting a decision
                </span>
                <Badge tone="progress" size="sm">approval</Badge>
              </Link>
            )}
            {statutoryDueSoon.map((r) => (
              <Link
                key={r.uid}
                to="/hrms/statutory"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-warning/30 bg-warning/5 p-2.5 hover:bg-warning/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-medium">{r.name}</span> due{' '}
                  {Math.round((new Date(r.dueOn).getTime() - Date.now()) / 86_400_000)} days from now
                  {canSeePay && r.amountPayable ? ` · ${formatCurrency(r.amountPayable)}` : ''}
                </span>
                <Badge tone="warning" size="sm">due soon</Badge>
              </Link>
            ))}
            {milestones.map((m) => (
              <Link
                key={`${m.employee.uid}-${m.label}`}
                to="/hrms/employees"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2.5 hover:bg-surface-2"
              >
                <span className="text-xs text-fg">
                  <span className="font-medium">{m.employee.fullName}</span> — {m.label.toLowerCase()}
                </span>
                <DueCell date={m.date} />
              </Link>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Payroll status */}
      {canSeePay && currentRun && (
        <Card className="mb-4">
          <CardHeader
            title={`Payroll — ${currentRun.period}`}
            description={`${currentRun.docNo} · ${currentRun.employeeCount} employees`}
            actions={<HrStatusBadge status={currentRun.status} />}
          />
          <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Gross</p>
              <p className="mt-0.5 text-base font-semibold tabular text-fg">{formatCurrency(currentRun.grossEarnings)}</p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Deductions</p>
              <p className="mt-0.5 text-base font-semibold tabular text-danger">{formatCurrency(currentRun.totalDeductions)}</p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Net payable</p>
              <p className="mt-0.5 text-base font-semibold tabular text-success">{formatCurrency(currentRun.netPayable)}</p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Incentive earned</p>
              <p className="mt-0.5 text-base font-semibold tabular text-fg">{formatCurrency(incentiveEarned)}</p>
              {incentiveDisqualified.length > 0 && (
                <p className="text-2xs text-danger">{incentiveDisqualified.length} earned nothing</p>
              )}
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Cost to company</p>
              <p className="mt-0.5 text-base font-semibold tabular text-fg">{formatCurrency(currentRun.totalCtc)}</p>
              <p className="text-2xs text-fg-subtle">
                incl. {formatCurrency(currentRun.employerPf + currentRun.employerEsi)} PF & ESI
              </p>
            </div>
          </CardBody>
          <CardBody className="border-t border-border pt-3">
            <Link to="/hrms/payroll" className="text-2xs font-medium text-brand-600 hover:underline">
              Open the payroll run →
            </Link>
          </CardBody>
        </Card>
      )}

      {/* Charts */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Headcount by department" description="Actual against sanctioned strength" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={headcountByDepartment} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="department" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<HrChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="permanent" name="Permanent" stackId="a" fill="#7c3aed" radius={[0, 0, 0, 0]} maxBarSize={30} />
                <Bar dataKey="contract" name="Contract" stackId="a" fill="#0ea5e9" maxBarSize={30} />
                <Bar dataKey="trainee" name="Trainee" stackId="a" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={30} />
                <Line type="monotone" dataKey="sanctioned" name="Sanctioned" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Attendance trend" description="Seven days — present, absent and on leave" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hrPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<HrChartTip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Area type="monotone" dataKey="present" name="Present" stroke="#10b981" strokeWidth={2} fill="url(#hrPresent)" />
                <Area type="monotone" dataKey="absent" name="Absent" stroke="#ef4444" strokeWidth={1.5} fill="transparent" />
                <Area type="monotone" dataKey="onLeave" name="On leave" stroke="#0ea5e9" strokeWidth={1.5} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {canSeePay && (
          <Card className="lg:col-span-2">
            <CardHeader title="Payroll cost trend" description="Gross with overtime and incentive separated, against headcount" />
            <CardBody className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={payrollTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={56} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<HrChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar dataKey="gross" name="Gross" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="overtime" name="Overtime" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="incentive" name="Incentive" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="right" type="monotone" dataKey="headcount" name="Headcount" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}

        <Card className={canSeePay ? '' : 'lg:col-span-2'}>
          <CardHeader title="Attrition" description={`${attritionPct.toFixed(1)}% annualised`} />
          <CardBody className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={attritionTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={26} />
                <Tooltip content={<HrChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="joined" name="Joined" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="exited" name="Exited" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={20} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Workforce quality */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Employment mix" description="Permanent against contract and trainee" />
          <CardBody className="space-y-2.5">
            {employmentMix.map((m) => (
              <div key={m.type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-fg-muted">{m.type}</span>
                  <span className="font-medium tabular text-fg">{m.count}</span>
                </div>
                <ProgressBar value={(m.count / onRoll.length) * 100} tone="brand" />
              </div>
            ))}
            <p className="pt-1 text-2xs leading-relaxed text-fg-muted">
              A rising contract share cuts payroll cost and raises the compliance exposure — the liability for a contractor's PF
              lands on us. See{' '}
              <Link to="/hrms/contractors" className="font-medium text-brand-600 hover:underline">contractor labour</Link>.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Skills & training" description="Availability of certified operators" />
          <CardBody className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-fg-muted">Training completion</span>
                <PctChip value={trainingPct} target={90} />
              </div>
              <ProgressBar value={trainingPct} tone={trainingPct >= 90 ? 'success' : 'warning'} />
            </div>
            <div className="grid gap-2 border-t border-border pt-3 text-2xs sm:grid-cols-2">
              <p className="text-fg-muted">
                Certified skills
                <span className="block text-base font-semibold tabular text-fg">
                  {skills.filter((s) => s.status === 'CERTIFIED').length}
                </span>
              </p>
              <p className="text-fg-muted">
                At risk
                <span className={cn('block text-base font-semibold tabular', certExpiring.length ? 'text-danger' : 'text-success')}>
                  {certExpiring.length}
                </span>
              </p>
            </div>
            {certExpiring.length > 0 && (
              <p className="text-2xs leading-relaxed text-fg-muted">
                An expired certification means the operator cannot be rostered onto that machine alone —{' '}
                <Link to="/hrms/skills" className="font-medium text-brand-600 hover:underline">the skill matrix</Link> shows who
                and what.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Labour productivity" description="Units per operator against cost per bottle" />
          <CardBody className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={productivityTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} />
                <YAxis yAxisId="right" orientation="right" domain={[3, 4]} hide />
                <Tooltip content={<HrChartTip />} />
                <Bar yAxisId="left" dataKey="unitsPerOperator" name="Units per operator" radius={[3, 3, 0, 0]} maxBarSize={22}>
                  {productivityTrend.map((p, i) => (
                    <Cell key={i} fill={p.labourCostPerBottle <= 3.4 ? '#10b981' : '#f59e0b'} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="labourCostPerBottle" name="Cost per bottle ₹" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="The chain this module runs" description="Each link feeds the next — break one and the cost per bottle stops being real" />
        <CardBody>
          <div className="flex flex-wrap items-center gap-1.5 text-2xs">
            {[
              ['Employees', '/hrms/employees'],
              ['Roster', '/hrms/shifts'],
              ['Attendance', '/hrms/attendance'],
              ['Overtime', '/hrms/overtime'],
              ['Leave', '/hrms/leave'],
              ['Incentives', '/hrms/incentives'],
              ['Payroll', '/hrms/payroll'],
              ['Labour cost', '/hrms/labour-cost'],
              ['Statutory', '/hrms/statutory'],
            ].map(([label, to], i, arr) => (
              <span key={label} className="flex items-center gap-1.5">
                <Link
                  to={to}
                  className="rounded border border-border bg-surface-2 px-2 py-1 font-medium text-fg hover:border-border-strong hover:bg-surface-3"
                >
                  {label}
                </Link>
                {i < arr.length - 1 && <span className="text-fg-subtle">→</span>}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-fg-muted">
            An unregularised punch becomes an absent day, which reduces a salary, which changes the labour cost on a production
            order, which changes the cost per bottle finance reports. That is why the payroll run refuses to calculate over an open
            attendance exception rather than warning about it.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
