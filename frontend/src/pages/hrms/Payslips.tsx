import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { EmployeeCell, HrStatusBadge, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/cn'
import { PERIOD_LABEL, payslips as seedPayslips } from '@/mock/hrms'
import type { Payslip } from '@/types/hrms'

/**
 * Payslips — one per employee per period, and the only screen where the whole
 * salary calculation is visible in one place. Every figure here is derived: days
 * paid from attendance, overtime from approved claims, incentive from the
 * approved incentive run, PF and ESI from the statutory rules. Nothing on a
 * payslip is typed by hand, which is why a wrong payslip always means a wrong
 * input somewhere upstream.
 */
export function PayslipsPage() {
  const toast = useToast()
  const canSeePay = useCanSeePay()
  const seed = useMemo(() => seedPayslips, [])

  const crud = useCrud<Payslip>({
    key: 'hrms:payslip',
    seed,
    entity: 'Payslip',
    titleOf: (p) => `${p.employeeName} — ${p.period}`,
    fields: [
      { name: 'employeeCode', label: 'Employee code', required: true, readOnly: true },
      { name: 'employeeName', label: 'Employee', required: true, readOnly: true },
      { name: 'period', label: 'Period', required: true, readOnly: true },
      { name: 'daysPaid', label: 'Days paid', type: 'number', required: true },
      { name: 'daysAbsent', label: 'Days absent', type: 'number' },
      { name: 'leaveDays', label: 'Leave days', type: 'number' },
      { name: 'overtimeHours', label: 'Overtime hours', type: 'number' },
      { name: 'holdReason', label: 'Hold reason', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {}),
      daysPaid: Number(v.daysPaid) || 0,
      daysAbsent: Number(v.daysAbsent) || 0,
      leaveDays: Number(v.leaveDays) || 0,
      overtimeHours: Number(v.overtimeHours) || 0,
      holdReason: v.holdReason || null,
    }),
    blockDelete: (p) =>
      p.status === 'PAID'
        ? `${p.employeeName}'s payslip for ${p.period} has been paid. It is the evidence behind a bank transfer, a PF contribution and a TDS deduction — it cannot be deleted.`
        : undefined,
  })

  const payslips = crud.rows
  const [department, setDepartment] = useState('all')
  const [viewing, setViewing] = useState<Payslip | null>(null)
  const [holding, setHolding] = useState<Payslip | null>(null)
  const [holdReason, setHoldReason] = useState('')

  const departments = [...new Set(payslips.map((p) => p.department))].sort()
  const visible = payslips.filter((p) => (department === 'all' ? true : p.department === department))

  const held = payslips.filter((p) => p.status === 'HELD')
  const payable = visible.filter((p) => p.status !== 'HELD')
  const totalNet = payable.reduce((s, p) => s + p.netPay, 0)
  const withLop = visible.filter((p) => p.daysAbsent > 0)
  const withOt = visible.filter((p) => p.overtimeHours > 0)

  const columns: Column<Payslip>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '15rem', render: (p) => (
      <button type="button" onClick={() => setViewing(p)} className="text-left">
        <p className="truncate text-xs font-medium text-brand-600 hover:underline">{p.employeeName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{p.employeeCode} · {p.department}</p>
      </button>
    ) },
    { key: 'designation', header: 'Role', sortable: true, render: (p) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{p.designation}</p>
        <p className="text-2xs text-fg-subtle">grade {p.grade}</p>
      </div>
    ) },
    { key: 'daysPaid', header: 'Days paid', align: 'right', width: '9rem', sortable: true, render: (p) => (
      <div>
        <p className="tabular text-xs text-fg">{p.daysPaid} / {p.daysInMonth}</p>
        {p.daysAbsent > 0 && <p className="tabular text-2xs text-danger">{p.daysAbsent} LOP</p>}
      </div>
    ) },
    { key: 'leaveDays', header: 'Leave', align: 'right', width: '6.5rem', sortable: true, render: (p) => (
      p.leaveDays ? <span className="tabular text-xs text-progress">{p.leaveDays}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'overtimeHours', header: 'Overtime', align: 'right', width: '8rem', sortable: true, render: (p) => (
      p.overtimeHours ? <span className="tabular text-xs text-warning">{p.overtimeHours} h</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'grossEarnings', header: 'Gross', align: 'right', sortable: true, width: '10rem', render: (p) => (
      <span className="tabular text-xs text-fg">{formatCurrency(p.grossEarnings)}</span>
    ) },
    { key: 'incentiveAmount', header: 'Incentive', align: 'right', sortable: true, width: '9rem', render: (p) => (
      p.incentiveAmount ? <span className="tabular text-xs text-success">{formatCurrency(p.incentiveAmount)}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'totalDeductions', header: 'Deductions', align: 'right', sortable: true, width: '10rem', render: (p) => (
      <span className="tabular text-xs text-danger">{formatCurrency(p.totalDeductions)}</span>
    ) },
    { key: 'netPay', header: 'Net pay', align: 'right', sortable: true, width: '11rem', render: (p) => (
      <span className={cn('tabular text-xs font-semibold', p.status === 'HELD' ? 'text-fg-subtle line-through' : 'text-fg')}>
        {formatCurrency(p.netPay)}
      </span>
    ) },
    { key: 'bankAccountMasked', header: 'Bank account', width: '10rem', defaultHidden: true, render: (p) => (
      <span className="font-mono text-2xs text-fg-muted">{p.bankAccountMasked}</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '8.5rem', render: (p) => <HrStatusBadge status={p.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'salary-register', `Salary register — ${PERIOD_LABEL}`, columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  if (!canSeePay) {
    return (
      <div>
        <PageHeader
          title="Payslips"
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Payslips' }]}
        />
        <Card>
          <CardHeader title="Payslips are restricted" description="This screen shows what every employee is paid" />
          <CardBody className="space-y-3 text-xs leading-relaxed text-fg-muted">
            <p>
              The salary register needs <span className="font-mono text-fg">HRMS.PAYROLL.VIEW</span>. An employee can always see
              their own payslip through <Link to="/hrms/self-service" className="font-medium text-brand-600 hover:underline">employee self service</Link> —
              that route shows one person's own record and nobody else's, which is the correct way for most of the plant to reach a payslip.
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Payslips"
        description={`Salary register for ${PERIOD_LABEL}`}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Payslips' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => doExport('xlsx')}>Salary register</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const toRelease = payslips.filter((p) => p.status === 'DRAFT')
                if (!toRelease.length) {
                  toast.info('Nothing to release', 'Every payslip has already been released or is held.')
                  return
                }
                for (const p of toRelease) crud.update(p.uid, { status: 'RELEASED' })
                toast.success(
                  'Payslips released',
                  `${toRelease.length} payslip${toRelease.length === 1 ? '' : 's'} released. Employees can now see them in self service.`,
                )
              }}
            >
              Release all payslips
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-52"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          options={[{ value: 'all', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]}
        />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg tabular">{payable.length}</span> payslips totalling{' '}
          <span className="font-medium text-fg tabular">{formatCurrency(totalNet)}</span> net
          {held.length > 0 && <>, <span className="font-medium text-danger">{held.length}</span> held</>}
          {withLop.length > 0 && <> · <span className="font-medium text-warning">{withLop.length}</span> with loss of pay</>}
          {withOt.length > 0 && <> · <span className="font-medium text-warning">{withOt.length}</span> with overtime</>}
        </p>
      </div>

      {(held.length > 0 || withLop.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Worth checking before approval" description="These are the payslips an employee is most likely to query" />
          <CardBody className="space-y-2">
            {held.map((p) => (
              <div key={p.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">{p.employeeName} — payslip held</p>
                  <p className="text-2xs text-fg-muted">{p.holdReason}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    crud.update(p.uid, { status: 'RELEASED', holdReason: null })
                    toast.success('Hold released', `${p.employeeName}'s payslip for ${p.period} is released and will be included in the next bank advice.`)
                  }}
                >
                  Release the hold
                </Button>
              </div>
            ))}
            {withLop.map((p) => (
              <div key={p.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {p.employeeName} — {p.daysAbsent} day{p.daysAbsent === 1 ? '' : 's'} loss of pay
                  </p>
                  <p className="text-2xs text-fg-muted">
                    Paid for {p.daysPaid} of {p.daysInMonth} days, so gross is reduced to {formatCurrency(p.grossEarnings)}.
                    Attendance allowance is also lost — that is usually what the query is about.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setViewing(p)}>See the payslip</Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(p) => p.uid}
        searchPlaceholder="Search employee, code, department or designation…"
        onExport={doExport}
        emptyTitle="No payslips"
        rowClassName={(p) => cn(
          p.status === 'HELD' && 'bg-danger/[0.04]',
          p.daysAbsent > 0 && 'bg-warning/[0.03]',
        )}
        rowActions={(p) => (
          <>
            <MenuItem label="Edit the payslip" onClick={() => crud.openEdit(p)} />
            <MenuItem label="Delete the payslip" danger onClick={() => crud.askDelete(p)} />
            <MenuItem separatorBefore label="Open the payslip" onClick={() => setViewing(p)} />
            <MenuItem
              label="Release to the employee"
              disabled={p.status !== 'DRAFT' && p.status !== 'HELD'}
              onClick={() => {
                crud.update(p.uid, { status: 'RELEASED', holdReason: null })
                toast.success('Released', `${p.employeeName} can now see their ${p.period} payslip in self service.`)
              }}
            />
            <MenuItem
              label="Hold the payslip"
              danger
              disabled={p.status === 'PAID' || p.status === 'HELD'}
              onClick={() => { setHolding(p); setHoldReason('') }}
            />
            <MenuItem label="Print the payslip" onClick={() => doExport('pdf')} />
          </>
        )}
      />

      {/* The payslip itself ------------------------------------------------- */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.employeeName} — ${viewing.period}` : ''}
        description={viewing ? `${viewing.employeeCode} · ${viewing.designation} · ${viewing.department}` : ''}
        width="max-w-xl"
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
              <Button variant="primary" onClick={() => doExport('pdf')}>Print</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 text-xs sm:grid-cols-4">
              <p className="text-fg-muted">Days paid <span className="block font-medium tabular text-fg">{viewing.daysPaid}/{viewing.daysInMonth}</span></p>
              <p className="text-fg-muted">Absent <span className={cn('block font-medium tabular', viewing.daysAbsent ? 'text-danger' : 'text-fg')}>{viewing.daysAbsent}</span></p>
              <p className="text-fg-muted">Leave <span className="block font-medium tabular text-fg">{viewing.leaveDays}</span></p>
              <p className="text-fg-muted">Overtime <span className="block font-medium tabular text-fg">{viewing.overtimeHours} h</span></p>
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Earnings</h3>
              <div className="overflow-hidden rounded border border-border">
                {viewing.earnings.map((e) => (
                  <div key={e.code} className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs last:border-0">
                    <span className="text-fg-muted">
                      {e.name}
                      <span className="ml-1.5 font-mono text-2xs text-fg-subtle">{e.code}</span>
                    </span>
                    <span className="tabular text-fg">{formatCurrency(e.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-surface-2 px-3 py-2 text-xs font-semibold">
                  <span className="text-fg">Gross earnings</span>
                  <span className="tabular text-fg">{formatCurrency(viewing.grossEarnings)}</span>
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Deductions</h3>
              <div className="overflow-hidden rounded border border-border">
                {viewing.deductions.map((d) => (
                  <div key={d.code} className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs last:border-0">
                    <span className="text-fg-muted">
                      {d.name}
                      <span className="ml-1.5 font-mono text-2xs text-fg-subtle">{d.code}</span>
                    </span>
                    <span className="tabular text-danger">{formatCurrency(d.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-surface-2 px-3 py-2 text-xs font-semibold">
                  <span className="text-fg">Total deductions</span>
                  <span className="tabular text-danger">{formatCurrency(viewing.totalDeductions)}</span>
                </div>
              </div>
            </section>

            <div className="flex items-center justify-between rounded border border-success/30 bg-success/5 px-3 py-3">
              <div>
                <p className="text-xs font-semibold text-fg">Net pay</p>
                <p className="text-2xs text-fg-muted">to {viewing.bankAccountMasked}</p>
              </div>
              <p className="text-xl font-semibold tabular text-success">{formatCurrency(viewing.netPay)}</p>
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Employer contributions — not deducted from the employee
              </h3>
              <div className="grid gap-2 rounded border border-border bg-surface-2 p-3 text-xs sm:grid-cols-3">
                <p className="text-fg-muted">Employer PF <span className="block font-medium tabular text-fg">{formatCurrency(viewing.employerPf)}</span></p>
                <p className="text-fg-muted">Employer ESI <span className="block font-medium tabular text-fg">{formatCurrency(viewing.employerEsi)}</span></p>
                <p className="text-fg-muted">
                  Total cost
                  <span className="block font-medium tabular text-fg">
                    {formatCurrency(viewing.grossEarnings + viewing.employerPf + viewing.employerEsi)}
                  </span>
                </p>
              </div>
              <p className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
                The employer's PF and ESI never appear as a deduction, but they are real cost — which is why the cost-to-company
                figure is always higher than the gross an employee sees.
              </p>
            </section>

            {viewing.holdReason && (
              <p className="rounded border border-danger/30 bg-danger/5 p-2.5 text-2xs text-danger">
                <span className="font-medium">Held:</span> {viewing.holdReason}
              </p>
            )}
          </div>
        )}
      </Drawer>

      {/* Hold -------------------------------------------------------------- */}
      <Modal
        open={!!holding}
        onClose={() => setHolding(null)}
        title={holding ? `Hold ${holding.employeeName}'s payslip` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setHolding(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!holding) return
                if (!holdReason.trim()) {
                  toast.error('A reason is required', 'Withholding somebody\'s salary is a serious step and has to be justified in writing.')
                  return
                }
                crud.update(holding.uid, { status: 'HELD', holdReason: holdReason.trim() })
                toast.success(
                  'Payslip held',
                  `${holding.employeeName}'s ${formatCurrency(holding.netPay)} is excluded from the bank advice. The run total drops by that amount.`,
                )
                setHolding(null)
              }}
            >
              Hold the payslip
            </Button>
          </>
        }
      >
        {holding && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {holding.employeeName}'s net pay of{' '}
              <span className="font-medium text-fg">{formatCurrency(holding.netPay)}</span> will be excluded from this period's
              bank advice. The payslip stays on record and can be released later.
            </p>
            <Textarea
              label="Reason (required)"
              rows={3}
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="On notice — full and final settlement pending, so the monthly payslip is held."
            />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Nothing on a payslip is typed by hand" description="Every line traces back to a record somewhere else" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Days paid</span> come from attendance, after regularisation. Absence without approved leave reduces the gross proportionally and forfeits the attendance allowance.</p>
          <p><span className="font-medium text-fg">Overtime</span> is the approved minutes only, at twice the ordinary rate. A claim that was never approved does not appear.</p>
          <p><span className="font-medium text-fg">Incentive</span> comes from the approved incentive run, which is zero for anybody who missed a gate.</p>
          <p><span className="font-medium text-fg">PF and ESI</span> follow the statutory rules — PF on basic capped at ₹15,000 of wages, ESI only while gross stays at or below ₹21,000.</p>
        </CardBody>
      </Card>
    </div>
  )
}
