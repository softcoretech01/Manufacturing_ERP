import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCanSeeAppraisal, useCanSeePay } from '@/components/hrms/HrmsShell'
import { cn } from '@/lib/cn'

interface ReportDef {
  id: string
  name: string
  group: 'A' | 'B' | 'C' | 'D' | 'E'
  columns: string
  filters: string
  /** Needs HRMS.PAYROLL.VIEW. */
  paid?: boolean
  /** Needs HRMS.APPRAISAL.VIEW. */
  appraisal?: boolean
  to?: string
}

const GROUPS: Record<ReportDef['group'], string> = {
  A: 'People',
  B: 'Attendance & leave',
  C: 'Payroll & statutory',
  D: 'Performance & learning',
  E: 'Workforce cost',
}

/** The report catalogue this module ships — H-01 … H-26. */
const REPORTS: ReportDef[] = [
  { id: 'H-01', name: 'Employee Register', group: 'A', columns: 'Code, name, designation, department, grade, type, joined, status', filters: 'Department, type, status, plant', to: '/hrms/employees' },
  { id: 'H-02', name: 'Headcount & Sanction Report', group: 'A', columns: 'Unit, level, sanctioned, actual, vacancies, over-sanction', filters: 'Plant, department, level', to: '/hrms/organisation' },
  { id: 'H-03', name: 'Department Strength', group: 'A', columns: 'Department, permanent, contract, trainee, total, sanctioned', filters: 'Plant, period', to: '/hrms' },
  { id: 'H-04', name: 'New Joiners & Confirmations Due', group: 'A', columns: 'Employee, joined, probation ends, confirmation status, reviewer', filters: 'Period, department', to: '/hrms/employees' },
  { id: 'H-05', name: 'Attrition Analysis', group: 'A', columns: 'Period, joined, exited, attrition %, reason, department, tenure at exit', filters: 'Period, department, reason', to: '/hrms' },
  { id: 'H-06', name: 'Recruitment Funnel', group: 'A', columns: 'Requisition, applied, screened, interviewed, offered, joined, offer acceptance %', filters: 'Period, department, source', to: '/hrms/recruitment' },

  { id: 'H-07', name: 'Daily Attendance Register', group: 'B', columns: 'Date, employee, shift, in, out, worked, late, overtime, status', filters: 'Date, department, shift, status', to: '/hrms/attendance' },
  { id: 'H-08', name: 'Shift Attendance Summary', group: 'B', columns: 'Shift, headcount, present, absent, late, overtime hours', filters: 'Period, shift, plant', to: '/hrms/attendance' },
  { id: 'H-09', name: 'Overtime Register', group: 'B', columns: 'Employee, date, claimed, system, approved, rate, amount, production order', filters: 'Period, department, approver', paid: true, to: '/hrms/overtime' },
  { id: 'H-10', name: 'Late Coming & Early Exit', group: 'B', columns: 'Employee, occurrences, total late minutes, shift, trend', filters: 'Period, department, threshold', to: '/hrms/attendance' },
  { id: 'H-11', name: 'Absenteeism Report', group: 'B', columns: 'Employee, days absent, absenteeism %, without leave, pattern', filters: 'Period, department', to: '/hrms/attendance' },
  { id: 'H-12', name: 'Leave Register & Balance', group: 'B', columns: 'Employee, type, opening, accrued, availed, encashed, closing', filters: 'Period, type, department', to: '/hrms/leave' },
  { id: 'H-13', name: 'Attendance Exception Report', group: 'B', columns: 'Employee, date, exception, regularised by, reason', filters: 'Period, exception type, department', to: '/hrms/attendance' },

  { id: 'H-14', name: 'Salary Register', group: 'C', columns: 'Employee, days paid, earnings by component, deductions, net pay, bank', filters: 'Period, department, structure', paid: true, to: '/hrms/payslips' },
  { id: 'H-15', name: 'Payslip', group: 'C', columns: 'Full earnings and deductions breakdown with employer contributions', filters: 'Employee, period', paid: true, to: '/hrms/payslips' },
  { id: 'H-16', name: 'Bank Advice', group: 'C', columns: 'Employee, bank, account, IFSC, net payable', filters: 'Period, bank', paid: true, to: '/hrms/payroll' },
  { id: 'H-17', name: 'PF (ECR) Report', group: 'C', columns: 'UAN, member, PF wages, employee 12%, employer 12%, EPS, EDLI', filters: 'Period', paid: true, to: '/hrms/statutory' },
  { id: 'H-18', name: 'ESI Contribution Report', group: 'C', columns: 'ESI number, member, ESI wages, employee 0.75%, employer 3.25%, days', filters: 'Period', paid: true, to: '/hrms/statutory' },
  { id: 'H-19', name: 'Professional Tax Report', group: 'C', columns: 'Employee, gross slab, PT deducted, corporation', filters: 'Period, location', paid: true, to: '/hrms/statutory' },
  { id: 'H-20', name: 'TDS Report (Form 24Q annexure)', group: 'C', columns: 'Employee, PAN, taxable income, exemptions, tax deducted, challan', filters: 'Quarter, regime', paid: true, to: '/hrms/statutory' },
  { id: 'H-21', name: 'Payroll Cost & Journal', group: 'C', columns: 'Cost centre, gross, employer PF, employer ESI, total cost, journal', filters: 'Period, cost centre, plant', paid: true, to: '/hrms/payroll' },

  { id: 'H-22', name: 'KPI Achievement', group: 'D', columns: 'Employee, KPI, target, actual, weight, score, band', filters: 'Cycle, department, role', appraisal: true, to: '/hrms/performance' },
  { id: 'H-23', name: 'Appraisal Summary', group: 'D', columns: 'Employee, self, manager, HR, final rating, band, increment, promotion', filters: 'Cycle, department, band', appraisal: true, to: '/hrms/performance' },
  { id: 'H-24', name: 'Skill Matrix & Gap Report', group: 'D', columns: 'Skill, criticality, required, certified, gap, expiring, expired', filters: 'Work centre, criticality', to: '/hrms/skills' },
  { id: 'H-25', name: 'Training Report & Effectiveness', group: 'D', columns: 'Programme, enrolled, attended, passed, average score, effectiveness, cost', filters: 'Period, category, department', to: '/hrms/training' },

  { id: 'H-26', name: 'Incentive Register', group: 'E', columns: 'Employee, scheme, units, target, gates met, gross, earned, disqualified reason', filters: 'Period, scheme, department', paid: true, to: '/hrms/incentives' },
  { id: 'H-27', name: 'Labour Cost by Department', group: 'E', columns: 'Department, cost centre, regular, overtime, incentive, total, per unit', filters: 'Period, cost centre', paid: true, to: '/hrms/labour-cost' },
  { id: 'H-28', name: 'Labour Cost per Bottle', group: 'E', columns: 'Production order, batch, item, hours, cost, units, cost per unit', filters: 'Period, order, item', paid: true, to: '/hrms/labour-cost' },
  { id: 'H-29', name: 'Labour Productivity', group: 'E', columns: 'Period, units per operator, units per labour hour, efficiency %, utilisation %', filters: 'Period, work centre, shift', to: '/hrms/labour-cost' },
  { id: 'H-30', name: 'Contractor Bill & Compliance', group: 'E', columns: 'Contractor, labour days, hours, gross, deductions, net, PF/ESI/wage evidence', filters: 'Period, contractor, status', paid: true, to: '/hrms/contractors' },
]

/** HR, payroll and workforce reports. */
export function HrmsReportsPage() {
  const toast = useToast()
  const canSeePay = useCanSeePay()
  const canSeeAppraisal = useCanSeeAppraisal()
  const [group, setGroup] = useState<'ALL' | ReportDef['group']>('ALL')
  const [q, setQ] = useState('')

  const locked = (r: ReportDef) => (!!r.paid && !canSeePay) || (!!r.appraisal && !canSeeAppraisal)

  const visible = REPORTS.filter((r) => (group === 'ALL' ? true : r.group === group)).filter(
    (r) => !q.trim() || `${r.id} ${r.name} ${r.columns} ${r.filters}`.toLowerCase().includes(q.toLowerCase()),
  )
  const lockedCount = REPORTS.filter(locked).length

  return (
    <div>
      <PageHeader
        title="HR reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Reports' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.success(
                'Schedule created',
                "Scheduled reports are e-mailed with the recipient's own permissions applied — a supervisor gets attendance, the accountant gets the salary register, and neither gets the other.",
              )
            }
          >
            Schedule a report
          </Button>
        }
        tabs={
          <Tabs
            variant="pill"
            active={group}
            onChange={(v) => setGroup(v as typeof group)}
            tabs={[
              { id: 'ALL', label: 'All', count: REPORTS.length },
              ...(Object.keys(GROUPS) as ReportDef['group'][]).map((g) => ({
                id: g,
                label: GROUPS[g],
                count: REPORTS.filter((r) => r.group === g).length,
              })),
            ]}
          />
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput containerClassName="w-72" sizeVariant="sm" placeholder="Search report, column or filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg">{visible.length}</span> of {REPORTS.length} reports
          {lockedCount > 0 && (
            <>
              {' '}· <span className="font-medium text-warning">{lockedCount}</span> restricted — salary needs{' '}
              <span className="font-mono">HRMS.PAYROLL.VIEW</span> and ratings need{' '}
              <span className="font-mono">HRMS.APPRAISAL.VIEW</span>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const isLocked = locked(r)
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-2xs text-fg-subtle">{r.id}</p>
                  <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                </div>
                <Badge tone={isLocked ? 'warning' : 'neutral'} size="sm" dot={false}>
                  {isLocked ? (r.paid ? 'pay locked' : 'rating locked') : GROUPS[r.group]}
                </Badge>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-fg-muted">
                <span className="font-medium text-fg-subtle">Columns:</span> {r.columns}
              </p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
                <span className="font-medium text-fg-subtle">Filters:</span> {r.filters}
              </p>
              <div className="mt-3 flex items-center gap-2">
                {isLocked ? (
                  <span className="text-2xs text-warning">
                    {r.paid ? 'Salary columns are absent for your role' : 'Appraisal ratings are absent for your role'}
                  </span>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        toast.success('Report queued', `${r.id} ${r.name} — Excel, PDF and CSV all carry exactly the columns you can see on screen.`)
                      }}
                    >
                      Run
                    </Button>
                    {r.to && <span className="text-2xs text-fg-subtle">Live view available</span>}
                  </>
                )}
              </div>
            </>
          )

          return r.to && !isLocked ? (
            <Link key={r.id} to={r.to} className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
              {body}
            </Link>
          ) : (
            <div key={r.id} className={cn('card p-3.5', isLocked && 'opacity-70')}>
              {body}
            </div>
          )
        })}
      </div>

      <Card className="mt-4">
        <CardHeader title="HR reporting has two locks, not one" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Pay.</span> Salary, statutory contributions, incentive amounts and freight of any
            kind. The tightest permission in the product, because a colleague's salary cannot be un-seen.
          </p>
          <p>
            <span className="font-medium text-fg">Ratings.</span> Appraisal scores, bands and increments sit behind a separate
            permission. A supervisor needs attendance and skills to run a shift; they do not need last year's ratings.
          </p>
          <p>
            <span className="font-medium text-fg">Everything else is open.</span> Attendance, leave balances, the skill matrix and
            training are what the floor actually runs on, and treating them as confidential just moves the conversation to
            WhatsApp.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
