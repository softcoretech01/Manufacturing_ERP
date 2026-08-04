import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { HrChartTip, HrStatusBadge, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import {
  attendance as seedAttendance,
  incentiveEarnings as seedIncentives,
  overtime as seedOvertime,
  payrollRuns as seedRuns,
  payrollTrend,
  payslips as seedPayslips,
} from '@/mock/hrms'
import type {
  AttendanceRecord,
  IncentiveEarning,
  OvertimeRecord,
  PayrollRun,
  PayrollStatus,
  Payslip,
} from '@/types/hrms'

/** The order the run must move through — no step can be skipped. */
const FLOW: PayrollStatus[] = ['DRAFT', 'ATTENDANCE_LOCKED', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CLOSED']

/**
 * Payroll run — the month's salary, and the four gates that have to be clear
 * before it can be calculated. Every gate exists because of a specific way
 * payroll goes wrong: an unregularised punch becomes an absent day, an
 * unapproved overtime claim either gets paid without authority or gets missed
 * entirely, and both are discovered on payday when it is too late.
 */
export function PayrollPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeePay = useCanSeePay()
  const seed = useMemo(() => seedRuns, [])
  const slipSeed = useMemo(() => seedPayslips, [])
  const attSeed = useMemo(() => seedAttendance, [])
  const otSeed = useMemo(() => seedOvertime, [])
  const incSeed = useMemo(() => seedIncentives, [])

  const crud = useCrud<PayrollRun>({
    key: 'hrms:payroll-run',
    seed,
    entity: 'Payroll run',
    titleOf: (r) => `${r.docNo} — ${r.period}`,
    fields: [
      { name: 'docNo', label: 'Run number', required: true, readOnly: true },
      { name: 'period', label: 'Period', required: true, hint: 'YYYY-MM' },
      { name: 'periodStart', label: 'Period start', type: 'date', required: true },
      { name: 'periodEnd', label: 'Period end', type: 'date', required: true },
      { name: 'plant', label: 'Plant', required: true },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        docNo: v.docNo,
        status: 'DRAFT' as PayrollStatus,
        employeeCount: 0,
        attendanceLocked: false,
        leaveLocked: false,
        overtimeApproved: false,
        incentiveApproved: false,
        grossEarnings: 0,
        totalDeductions: 0,
        netPayable: 0,
        employerPf: 0,
        employerEsi: 0,
        totalCtc: 0,
        calculatedOn: null,
        approvedBy: null,
        approvedOn: null,
        paidOn: null,
        bankAdviceNo: null,
        journalNo: null,
      }),
      period: v.period,
      periodStart: v.periodStart,
      periodEnd: v.periodEnd,
      plant: v.plant,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (r) =>
      r.status === 'PAID' || r.status === 'CLOSED'
        ? `${r.docNo} has been paid. A paid payroll run is the source of the salary register, the PF return and the TDS filing — it cannot be deleted.`
        : r.status === 'APPROVED'
          ? `${r.docNo} is approved and waiting to be paid. Reverse the approval first.`
          : undefined,
  })

  const runs = crud.rows
  const { rows: payslips, update: updateSlip } = useCollection<Payslip>('hrms:payslip', slipSeed)
  const { rows: attendance } = useCollection<AttendanceRecord>('hrms:attendance', attSeed)
  const { rows: overtime, update: updateOt } = useCollection<OvertimeRecord>('hrms:overtime', otSeed)
  const { rows: incentives } = useCollection<IncentiveEarning>('hrms:incentive-earning', incSeed)

  const [confirming, setConfirming] = useState<{ run: PayrollRun; to: PayrollStatus } | null>(null)

  const current = runs.find((r) => r.status !== 'PAID' && r.status !== 'CLOSED') ?? runs[0]

  /** Live gate state, recomputed from the underlying records rather than trusted. */
  function gates(run: PayrollRun) {
    const openExceptions = attendance.filter(
      (a) => (a.status === 'MISSED_PUNCH' || a.status === 'ABSENT') && !a.regularised,
    )
    const openOt = overtime.filter((o) => o.status === 'REQUESTED')
    const openInc = incentives.filter((i) => i.status === 'CALCULATED')
    return [
      {
        key: 'attendance',
        label: 'Attendance regularised',
        ok: openExceptions.length === 0,
        detail:
          openExceptions.length === 0
            ? 'No unregularised punches in the period'
            : `${openExceptions.length} record${openExceptions.length === 1 ? '' : 's'} unregularised — each becomes an absent day and a short salary`,
        to: '/hrms/attendance',
      },
      {
        key: 'leave',
        label: 'Leave approved',
        ok: run.leaveLocked,
        detail: run.leaveLocked ? 'All leave for the period is decided' : 'Leave still pending a decision would post as absence',
        to: '/hrms/leave',
      },
      {
        key: 'overtime',
        label: 'Overtime approved',
        ok: openOt.length === 0,
        detail:
          openOt.length === 0
            ? 'Every overtime claim is decided'
            : `${openOt.length} claim${openOt.length === 1 ? '' : 's'} still open — they would either be paid without authority or missed`,
        to: '/hrms/overtime',
      },
      {
        key: 'incentive',
        label: 'Incentives approved',
        ok: openInc.length === 0,
        detail:
          openInc.length === 0
            ? 'The incentive run is approved'
            : `${openInc.length} incentive line${openInc.length === 1 ? '' : 's'} not yet approved`,
        to: '/hrms/incentives',
      },
    ]
  }

  const allGatesOk = current ? gates(current).every((g) => g.ok) : false
  const heldSlips = payslips.filter((p) => p.status === 'HELD')

  const columns: Column<PayrollRun>[] = [
    { key: 'docNo', header: 'Run', sortable: true, width: '11rem', render: (r) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{r.docNo}</p>
        <p className="text-2xs text-fg-subtle">{r.plant}</p>
      </div>
    ) },
    { key: 'period', header: 'Period', sortable: true, width: '11rem', render: (r) => (
      <div className="min-w-0">
        <p className="text-xs font-medium text-fg">{r.period}</p>
        <p className="text-2xs text-fg-subtle">{formatDate(r.periodStart)} → {formatDate(r.periodEnd)}</p>
      </div>
    ) },
    { key: 'employeeCount', header: 'Employees', align: 'right', width: '8.5rem', sortable: true, render: (r) => (
      <span className="tabular text-xs">{r.employeeCount}</span>
    ) },
    { key: 'gates', header: 'Gates', width: '10rem', render: (r) => {
      const g = gates(r)
      const done = g.filter((x) => x.ok).length
      return (
        <div className="flex items-center gap-2">
          <ProgressBar value={(done / g.length) * 100} tone={done === g.length ? 'success' : 'warning'} className="w-14" />
          <span className={cn('text-2xs tabular', done === g.length ? 'text-success' : 'text-warning')}>{done}/{g.length}</span>
        </div>
      )
    } },
    ...(canSeePay
      ? [
          { key: 'grossEarnings', header: 'Gross', align: 'right' as const, sortable: true, width: '10.5rem', render: (r: PayrollRun) => formatCurrency(r.grossEarnings) },
          { key: 'totalDeductions', header: 'Deductions', align: 'right' as const, sortable: true, width: '10rem', render: (r: PayrollRun) => (
            <span className="tabular text-xs text-danger">{formatCurrency(r.totalDeductions)}</span>
          ) },
          { key: 'netPayable', header: 'Net payable', align: 'right' as const, sortable: true, width: '11rem', render: (r: PayrollRun) => (
            <span className="tabular text-xs font-semibold text-fg">{formatCurrency(r.netPayable)}</span>
          ) },
          { key: 'totalCtc', header: 'Total cost', align: 'right' as const, sortable: true, width: '11rem', defaultHidden: true, render: (r: PayrollRun) => formatCurrency(r.totalCtc) },
        ]
      : []),
    { key: 'calculatedOn', header: 'Calculated', sortable: true, width: '9.5rem', accessor: (r) => r.calculatedOn ?? '', render: (r) => (
      r.calculatedOn ? <span className="text-2xs">{formatDate(r.calculatedOn)}</span> : <span className="text-2xs text-fg-subtle">not yet</span>
    ) },
    { key: 'approvedBy', header: 'Approved by', sortable: true, render: (r) => (
      r.approvedBy ? (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{r.approvedBy}</p>
          <p className="text-2xs text-fg-subtle">{r.approvedOn ? formatDate(r.approvedOn) : ''}</p>
        </div>
      ) : (
        <span className="text-2xs text-fg-subtle">—</span>
      )
    ) },
    { key: 'bankAdviceNo', header: 'Bank advice', sortable: true, width: '11rem', render: (r) => (
      r.bankAdviceNo ? <span className="font-mono text-2xs">{r.bankAdviceNo}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'journalNo', header: 'Journal', sortable: true, width: '10rem', defaultHidden: true, render: (r) => (
      r.journalNo ? <span className="font-mono text-2xs">{r.journalNo}</span> : <span className="text-2xs text-fg-subtle">not posted</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '11rem', render: (r) => <HrStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'payroll-runs', 'Payroll runs', columnsFromTable(columns), runs)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Recompute the run totals from the payslips it owns. */
  function recalculate(run: PayrollRun) {
    const mine = payslips.filter((p) => p.payrollRunNo === run.docNo && p.status !== 'HELD')
    crud.update(run.uid, {
      employeeCount: payslips.filter((p) => p.payrollRunNo === run.docNo).length,
      grossEarnings: mine.reduce((s, p) => s + p.grossEarnings, 0),
      totalDeductions: mine.reduce((s, p) => s + p.totalDeductions, 0),
      netPayable: mine.reduce((s, p) => s + p.netPay, 0),
      employerPf: mine.reduce((s, p) => s + p.employerPf, 0),
      employerEsi: mine.reduce((s, p) => s + p.employerEsi, 0),
      totalCtc: mine.reduce((s, p) => s + p.grossEarnings + p.employerPf + p.employerEsi, 0),
      status: 'CALCULATED',
      calculatedOn: new Date().toISOString(),
      attendanceLocked: true,
      leaveLocked: true,
      overtimeApproved: true,
      incentiveApproved: true,
    })
  }

  return (
    <div>
      <PageHeader
        title="Payroll"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Payroll' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/payslips')}>Payslips</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/salary-structures')}>Salary structures</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({
                docNo: `PR/2608/08`,
                period: '2026-08',
                periodStart: '2026-08-01',
                periodEnd: '2026-08-31',
                plant: 'Chennai — Unit 1',
              })}
            >
              New payroll run
            </Button>
          </>
        }
      />

      {!canSeePay ? (
        <Card>
          <CardHeader title="Payroll is restricted" description="Your role can see people and attendance, but not what they are paid" />
          <CardBody className="space-y-3 text-xs leading-relaxed text-fg-muted">
            <p>
              Salary figures, payroll totals and statutory contributions all sit behind{' '}
              <span className="font-mono text-fg">HRMS.PAYROLL.VIEW</span>. This is the tightest permission in the product, because
              a colleague's salary being readable is the single most damaging HR data leak — and unlike most data, it cannot be
              un-seen.
            </p>
            <p>
              What you can still reach: <Link to="/hrms/attendance" className="font-medium text-brand-600 hover:underline">attendance</Link>,{' '}
              <Link to="/hrms/leave" className="font-medium text-brand-600 hover:underline">leave</Link>,{' '}
              <Link to="/hrms/skills" className="font-medium text-brand-600 hover:underline">the skill matrix</Link> and{' '}
              <Link to="/hrms/training" className="font-medium text-brand-600 hover:underline">training</Link> — everything needed
              to run a shift, none of it commercially sensitive.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {current && (
            <Card className="mb-4">
              <CardHeader
                title={`Current run — ${current.period}`}
                description={`${current.docNo} · ${current.plant} · ${current.employeeCount} employees`}
                actions={<HrStatusBadge status={current.status} />}
              />
              <CardBody className="space-y-4">
                {/* The four gates */}
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                    Gates before calculation
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {gates(current).map((g) => (
                      <Link
                        key={g.key}
                        to={g.to}
                        className={cn(
                          'rounded border p-2.5 transition-colors',
                          g.ok ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5 hover:bg-danger/10',
                        )}
                      >
                        <p className={cn('flex items-center gap-1.5 text-xs font-medium', g.ok ? 'text-success' : 'text-danger')}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', g.ok ? 'bg-success' : 'bg-danger')} />
                          {g.label}
                        </p>
                        <p className="mt-1 text-2xs leading-snug text-fg-muted">{g.detail}</p>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                {current.status !== 'DRAFT' && (
                  <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-fg-subtle">Gross earnings</p>
                      <p className="mt-0.5 text-lg font-semibold tabular text-fg">{formatCurrency(current.grossEarnings)}</p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-fg-subtle">Deductions</p>
                      <p className="mt-0.5 text-lg font-semibold tabular text-danger">{formatCurrency(current.totalDeductions)}</p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-fg-subtle">Net payable</p>
                      <p className="mt-0.5 text-lg font-semibold tabular text-success">{formatCurrency(current.netPayable)}</p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-fg-subtle">Total cost to company</p>
                      <p className="mt-0.5 text-lg font-semibold tabular text-fg">{formatCurrency(current.totalCtc)}</p>
                      <p className="text-2xs text-fg-subtle">
                        includes {formatCurrency(current.employerPf + current.employerEsi)} employer PF & ESI
                      </p>
                    </div>
                  </div>
                )}

                {current.remarks && (
                  <p className="rounded border border-warning/30 bg-warning/5 p-2.5 text-2xs text-warning">{current.remarks}</p>
                )}

                {heldSlips.length > 0 && (
                  <p className="rounded border border-border bg-surface-2 p-2.5 text-2xs text-fg-muted">
                    <span className="font-medium text-fg">{heldSlips.length} payslip held</span> — excluded from the net payable
                    above. {heldSlips.map((p) => p.employeeName).join(', ')}: {heldSlips[0].holdReason}
                  </p>
                )}

                {/* Actions along the flow */}
                <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                  <Button
                    variant={allGatesOk ? 'primary' : 'outline'}
                    size="sm"
                    disabled={current.status !== 'DRAFT' && current.status !== 'ATTENDANCE_LOCKED' && current.status !== 'CALCULATED'}
                    onClick={() => {
                      if (!allGatesOk) {
                        const open = gates(current).filter((g) => !g.ok)
                        toast.error(
                          'Gates are not clear',
                          `${open.map((g) => g.label.toLowerCase()).join(', ')} — clear ${open.length === 1 ? 'it' : 'them'} first. Calculating over an open gate produces a payroll somebody has to correct by hand.`,
                        )
                        return
                      }
                      recalculate(current)
                      toast.success(
                        'Payroll calculated',
                        `${payslips.filter((p) => p.payrollRunNo === current.docNo).length} payslips built from the locked attendance, approved overtime and approved incentives.`,
                      )
                    }}
                  >
                    {current.status === 'CALCULATED' ? 'Recalculate' : 'Calculate payroll'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={current.status !== 'CALCULATED'}
                    onClick={() => setConfirming({ run: current, to: 'PENDING_APPROVAL' })}
                  >
                    Send for approval
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={current.status !== 'PENDING_APPROVAL'}
                    onClick={() => setConfirming({ run: current, to: 'APPROVED' })}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={current.status !== 'APPROVED'}
                    onClick={() => setConfirming({ run: current, to: 'PAID' })}
                  >
                    Generate bank advice & pay
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/hrms/payslips')}>
                    Review the payslips
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          <DataTable
            rows={runs}
            columns={columns}
            rowKey={(r) => r.uid}
            searchPlaceholder="Search run, period or plant…"
            onExport={doExport}
            emptyTitle="No payroll runs"
            rowClassName={(r) => cn(
              r.status === 'CALCULATED' && 'bg-progress/[0.04]',
              r.status === 'PENDING_APPROVAL' && 'bg-warning/[0.04]',
            )}
            rowActions={(r) => (
              <>
                <MenuItem label="Edit the run" onClick={() => crud.openEdit(r)} />
                <MenuItem label="Delete the run" danger onClick={() => crud.askDelete(r)} />
                <MenuItem
                  separatorBefore
                  label="Calculate the payroll"
                  disabled={r.status !== 'DRAFT' && r.status !== 'ATTENDANCE_LOCKED'}
                  onClick={() => {
                    if (!gates(r).every((g) => g.ok)) {
                      toast.error('Gates are not clear', 'Clear the open gates before calculating.')
                      return
                    }
                    recalculate(r)
                    toast.success('Payroll calculated', `${r.docNo} calculated.`)
                  }}
                />
                <MenuItem
                  label="Approve the run"
                  disabled={r.status !== 'PENDING_APPROVAL'}
                  onClick={() => setConfirming({ run: r, to: 'APPROVED' })}
                />
                <MenuItem
                  label="Reverse the approval"
                  disabled={r.status !== 'APPROVED'}
                  onClick={() => {
                    crud.update(r.uid, { status: 'CALCULATED', approvedBy: null, approvedOn: null })
                    toast.success('Approval reversed', `${r.docNo} is back at calculated. Nothing has been paid, so no reversal entry is needed.`)
                  }}
                />
                <MenuItem label="Open the payslips" onClick={() => navigate('/hrms/payslips')} />
                <MenuItem label="Open the statutory returns" onClick={() => navigate('/hrms/statutory')} />
                <MenuItem label="Print the salary register" onClick={() => doExport('pdf')} />
              </>
            )}
          />

          <Card className="mt-4">
            <CardHeader title="Payroll cost trend" description="Gross, with overtime and incentive shown separately against headcount" />
            <CardBody className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={payrollTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={58} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<HrChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar dataKey="gross" name="Gross" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="overtime" name="Overtime" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="incentive" name="Incentive" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={30} />
                  <Line yAxisId="right" type="monotone" dataKey="headcount" name="Headcount" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </>
      )}

      {/* Stage confirmation ------------------------------------------------- */}
      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={
          confirming
            ? confirming.to === 'PENDING_APPROVAL'
              ? `Send ${confirming.run.docNo} for approval`
              : confirming.to === 'APPROVED'
                ? `Approve ${confirming.run.docNo}`
                : `Pay ${confirming.run.docNo}`
            : ''
        }
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button
              variant={confirming?.to === 'PAID' ? 'primary' : 'success'}
              onClick={() => {
                if (!confirming) return
                const { run, to } = confirming
                if (to === 'PENDING_APPROVAL') {
                  crud.update(run.uid, { status: 'PENDING_APPROVAL' })
                  toast.success('Sent for approval', `${run.docNo} is with the approver. Nothing can be edited while it sits there.`)
                } else if (to === 'APPROVED') {
                  crud.update(run.uid, {
                    status: 'APPROVED',
                    approvedBy: 'Meera Rajan',
                    approvedOn: new Date().toISOString().slice(0, 10),
                  })
                  toast.success('Payroll approved', `${formatCurrency(run.netPayable)} approved for payment to ${run.employeeCount} employees.`)
                } else {
                  const advice = `BA/${run.period.replace('-', '')}/${String(runs.length).padStart(4, '0')}`
                  const journal = `JV/2627/0${500 + runs.length}`
                  crud.update(run.uid, {
                    status: 'PAID',
                    paidOn: new Date().toISOString().slice(0, 10),
                    bankAdviceNo: advice,
                    journalNo: journal,
                  })
                  for (const p of payslips.filter((x) => x.payrollRunNo === run.docNo && x.status !== 'HELD')) {
                    updateSlip(p.uid, { status: 'PAID' })
                  }
                  for (const o of overtime.filter((x) => x.status === 'APPROVED')) {
                    updateOt(o.uid, { status: 'PAID' })
                  }
                  toast.success(
                    'Payroll paid',
                    `Bank advice ${advice} generated for ${formatCurrency(run.netPayable)}, and journal ${journal} posted to finance. Payslips are released to the employees.`,
                  )
                }
                setConfirming(null)
              }}
            >
              {confirming?.to === 'PENDING_APPROVAL' ? 'Send' : confirming?.to === 'APPROVED' ? 'Approve' : 'Generate & pay'}
            </Button>
          </>
        }
      >
        {confirming && (
          <div className="space-y-3.5">
            <DataGrid
              items={[
                { label: 'Period', value: confirming.run.period },
                { label: 'Employees', value: String(confirming.run.employeeCount) },
                { label: 'Gross earnings', value: formatCurrency(confirming.run.grossEarnings) },
                { label: 'Deductions', value: formatCurrency(confirming.run.totalDeductions) },
                { label: 'Net payable', value: formatCurrency(confirming.run.netPayable) },
                { label: 'Employer PF & ESI', value: formatCurrency(confirming.run.employerPf + confirming.run.employerEsi) },
              ]}
            />
            {confirming.to === 'PAID' && (
              <p className="rounded border border-warning/30 bg-warning/5 p-2.5 text-2xs text-warning">
                This generates the bank advice, posts the payroll journal to finance and releases the payslips. Once paid the run
                can only be corrected by an adjustment in the next period — there is no going back inside a paid month.
              </p>
            )}
            {confirming.to === 'APPROVED' && (
              <p className="rounded border border-border bg-surface-2 p-2.5 text-2xs text-fg-muted">
                Approval is the last point at which a figure can still be changed without an adjustment entry. It is worth
                spot-checking a few payslips first — particularly anybody with loss of pay or a large overtime claim.
              </p>
            )}
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Seven stages, and why the order cannot change" />
        <CardBody className="space-y-2">
          {[
            ['Draft', 'The period exists but nothing is locked. Attendance and leave are still moving.'],
            ['Attendance locked', 'No further punches or regularisations for the period. This is the point of no return for the input data.'],
            ['Calculated', 'Payslips built from the locked inputs. Recalculating is safe and expected — figures often move once somebody spots an error.'],
            ['Pending approval', 'With the approver. Nothing can be edited, so what is approved is what was reviewed.'],
            ['Approved', 'Authorised for payment. The last stage at which a correction costs nothing.'],
            ['Paid', 'Bank advice out, journal posted, payslips released. Corrections now need an adjustment in the next period.'],
            ['Closed', 'Statutory returns filed against it. The run is history and feeds only reports.'],
          ].map(([stage, why], i) => (
            <div key={stage} className="flex gap-3 rounded border border-border p-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-2xs font-semibold tabular text-brand-600">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-fg">{stage}</p>
                <p className="text-2xs leading-relaxed text-fg-muted">{why}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
