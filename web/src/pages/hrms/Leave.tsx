import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { EmployeeCell, HrStatusBadge, LEAVE_TYPE_LABEL } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import {
  hrEmployees as seedEmployees,
  leaveBalances as seedBalances,
  leavePolicies as seedPolicies,
  leaveRequests as seedRequests,
} from '@/mock/hrms'
import type { HrEmployee, LeaveBalance, LeavePolicy, LeaveRequest, LeaveType } from '@/types/hrms'

const TABS = [
  { id: 'PENDING', label: 'To approve' },
  { id: 'ALL', label: 'All requests' },
  { id: 'BALANCE', label: 'Balances' },
  { id: 'POLICY', label: 'Policies' },
]

/**
 * Leave — request, two approvals, then attendance and payroll follow. The
 * balance check is what makes the approval meaningful: approving leave somebody
 * has not earned turns silently into loss of pay at the end of the month, which
 * is how a manager's kindness becomes a salary complaint.
 */
export function LeavePage() {
  const toast = useToast()
  const reqSeed = useMemo(() => seedRequests, [])
  const polSeed = useMemo(() => seedPolicies, [])
  const balSeed = useMemo(() => seedBalances, [])
  const empSeed = useMemo(() => seedEmployees, [])

  const crud = useCrud<LeaveRequest>({
    key: 'hrms:leave-request',
    seed: reqSeed,
    entity: 'Leave request',
    titleOf: (r) => `${r.docNo} — ${r.employeeName}`,
    fields: [
      { name: 'docNo', label: 'Request number', required: true, readOnly: true },
      { name: 'employeeCode', label: 'Employee code', required: true },
      { name: 'employeeName', label: 'Employee', required: true },
      { name: 'department', label: 'Department', required: true },
      {
        name: 'leaveType',
        label: 'Leave type',
        type: 'select',
        required: true,
        options: Object.entries(LEAVE_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'fromDate', label: 'From', type: 'date', required: true },
      { name: 'toDate', label: 'To', type: 'date', required: true },
      { name: 'days', label: 'Days', type: 'number', required: true },
      { name: 'contactDuringLeave', label: 'Contact while away', type: 'tel', required: true },
      { name: 'handoverTo', label: 'Handover to' },
      { name: 'reason', label: 'Reason', type: 'textarea', span: 2, required: true },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        docNo: v.docNo,
        appliedOn: new Date().toISOString().slice(0, 10),
        isHalfDay: false,
        documentAttached: false,
        managerApprovedBy: null,
        managerApprovedOn: null,
        hrApprovedBy: null,
        hrApprovedOn: null,
        rejectionReason: null,
        balanceAtApply: 0,
        status: 'DRAFT' as const,
      }),
      employeeCode: v.employeeCode,
      employeeName: v.employeeName,
      department: v.department,
      leaveType: v.leaveType as LeaveType,
      fromDate: v.fromDate,
      toDate: v.toDate,
      days: Number(v.days) || 1,
      contactDuringLeave: v.contactDuringLeave,
      handoverTo: v.handoverTo || null,
      reason: v.reason,
    }),
    blockDelete: (r) =>
      r.status === 'APPROVED'
        ? `${r.docNo} is approved and has already changed the attendance record and the leave balance. Cancel or withdraw it instead, which reverses both.`
        : undefined,
  })

  const requests = crud.rows
  const { rows: policies, update: updatePolicy } = useCollection<LeavePolicy>('hrms:leave-policy', polSeed)
  const { rows: employees } = useCollection<HrEmployee>('hrms:employee', empSeed)
  /** Balances are derived from the policy and the approved requests, not stored twice. */
  const storedBalances = useMemo(() => seedBalances as LeaveBalance[], [])

  const [tab, setTab] = useState('PENDING')
  const [deciding, setDeciding] = useState<LeaveRequest | null>(null)
  const [note, setNote] = useState('')
  const [applying, setApplying] = useState(false)
  const [form, setForm] = useState({
    employeeCode: '',
    leaveType: 'CASUAL' as LeaveType,
    fromDate: '',
    toDate: '',
    reason: '',
    contact: '',
    handover: '',
  })

  const pending = requests.filter((r) => r.status === 'PENDING_MANAGER' || r.status === 'PENDING_HR')
  const approved = requests.filter((r) => r.status === 'APPROVED')
  const visible = tab === 'PENDING' ? pending : requests

  /** Live closing balance: the stored figure less anything approved since. */
  function balanceOf(employeeCode: string, leaveType: LeaveType) {
    const stored = storedBalances.find((b) => b.employeeCode === employeeCode && b.leaveType === leaveType)
    if (!stored) return 0
    const takenSince = requests
      .filter((r) => r.employeeCode === employeeCode && r.leaveType === leaveType && r.status === 'APPROVED')
      .reduce((s, r) => s + r.days, 0)
    return Math.round((stored.opening + stored.accrued - Math.max(stored.availed, takenSince)) * 10) / 10
  }

  /** Everything that could stop this request being approved. */
  function checks(r: LeaveRequest) {
    const policy = policies.find((p) => p.leaveType === r.leaveType)
    const balance = balanceOf(r.employeeCode, r.leaveType)
    const noticeDays = Math.round((new Date(r.fromDate).getTime() - new Date(r.appliedOn).getTime()) / 86_400_000)
    const clashes = requests.filter(
      (x) =>
        x.uid !== r.uid &&
        x.department === r.department &&
        x.status === 'APPROVED' &&
        new Date(x.fromDate) <= new Date(r.toDate) &&
        new Date(x.toDate) >= new Date(r.fromDate),
    )
    return {
      policy,
      balance,
      balanceOk: r.leaveType === 'LOSS_OF_PAY' || balance >= r.days,
      noticeDays,
      noticeOk: !policy || noticeDays >= policy.minNoticeDays || r.leaveType === 'SICK',
      lengthOk: !policy || r.days <= policy.maxConsecutiveDays,
      documentOk: !policy?.requiresDocument || r.days <= (policy?.documentAfterDays ?? 0) || r.documentAttached,
      clashes,
    }
  }

  const columns: Column<LeaveRequest>[] = [
    { key: 'docNo', header: 'Request', sortable: true, width: '11rem', render: (r) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{r.docNo}</p>
        <p className="text-2xs text-fg-subtle">applied {formatDate(r.appliedOn)}</p>
      </div>
    ) },
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (r) => (
      <EmployeeCell name={r.employeeName} code={r.employeeCode} sub={r.department} />
    ) },
    { key: 'leaveType', header: 'Type', sortable: true, width: '9rem', render: (r) => (
      <Badge
        tone={r.leaveType === 'LOSS_OF_PAY' ? 'danger' : r.leaveType === 'SICK' ? 'warning' : 'neutral'}
        size="sm"
        dot={false}
      >
        {LEAVE_TYPE_LABEL[r.leaveType]}
      </Badge>
    ) },
    { key: 'fromDate', header: 'Dates', sortable: true, width: '12rem', accessor: (r) => r.fromDate, render: (r) => (
      <div className="min-w-0">
        <p className="text-xs text-fg">{formatDate(r.fromDate)} → {formatDate(r.toDate)}</p>
        <p className="text-2xs text-fg-subtle">{r.isHalfDay ? 'half day' : `${r.days} day${r.days === 1 ? '' : 's'}`}</p>
      </div>
    ) },
    { key: 'balance', header: 'Balance', align: 'right', width: '9.5rem', accessor: (r) => balanceOf(r.employeeCode, r.leaveType), render: (r) => {
      if (r.leaveType === 'LOSS_OF_PAY') return <span className="text-2xs text-fg-subtle">unpaid</span>
      const bal = balanceOf(r.employeeCode, r.leaveType)
      return (
        <span className={cn('tabular text-xs', bal >= r.days ? 'text-fg' : 'font-medium text-danger')}>
          {bal} left
        </span>
      )
    } },
    { key: 'notice', header: 'Notice given', align: 'right', width: '10rem', render: (r) => {
      const c = checks(r)
      return c.noticeOk ? (
        <span className="text-2xs text-fg-muted">{c.noticeDays} d</span>
      ) : (
        <span className="text-2xs font-medium text-warning">{c.noticeDays} d, policy wants {c.policy?.minNoticeDays}</span>
      )
    } },
    { key: 'handoverTo', header: 'Handover', sortable: true, render: (r) => (
      r.handoverTo ? <span className="text-xs">{r.handoverTo}</span> : <span className="text-2xs text-warning">nobody named</span>
    ) },
    { key: 'reason', header: 'Reason', render: (r) => <span className="text-2xs text-fg-muted">{r.reason}</span> },
    { key: 'approvals', header: 'Approvals', width: '11rem', render: (r) => (
      <div className="flex flex-wrap gap-1">
        <Badge tone={r.managerApprovedBy ? 'success' : 'neutral'} size="sm" dot={false}>
          {r.managerApprovedBy ? 'manager ✓' : 'manager'}
        </Badge>
        <Badge tone={r.hrApprovedBy ? 'success' : 'neutral'} size="sm" dot={false}>
          {r.hrApprovedBy ? 'HR ✓' : 'HR'}
        </Badge>
      </div>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '11rem', render: (r) => <HrStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'leave-register', 'Leave register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Approve at whichever level the request is currently sitting. */
  function approve(r: LeaveRequest, noteText: string) {
    const c = checks(r)
    if (!c.balanceOk && !noteText.trim()) {
      toast.error(
        'Balance is short — a note is required',
        `${r.employeeName} has ${c.balance} day${c.balance === 1 ? '' : 's'} of ${LEAVE_TYPE_LABEL[r.leaveType].toLowerCase()} leave against ${r.days} asked for. Approving anyway converts the excess to loss of pay, so the reason has to be written down.`,
      )
      return false
    }
    if (!c.documentOk) {
      toast.error(
        'Supporting document required',
        `${LEAVE_TYPE_LABEL[r.leaveType]} leave beyond ${c.policy?.documentAfterDays} days needs a medical certificate under the policy. Attach it before approving.`,
      )
      return false
    }

    if (r.status === 'PENDING_MANAGER') {
      crud.update(r.uid, {
        status: 'PENDING_HR',
        managerApprovedBy: 'Reporting manager',
        managerApprovedOn: new Date().toISOString().slice(0, 10),
      })
      toast.success('Approved by the manager', `${r.docNo} has moved to HR for the final approval.`)
      return true
    }

    const excess = Math.max(0, r.days - c.balance)
    crud.update(r.uid, {
      status: 'APPROVED',
      hrApprovedBy: 'HR Desk',
      hrApprovedOn: new Date().toISOString().slice(0, 10),
      reason: noteText.trim() ? `${r.reason} — Approver: ${noteText.trim()}` : r.reason,
    })
    toast.success(
      'Leave approved',
      excess > 0 && r.leaveType !== 'LOSS_OF_PAY'
        ? `${r.days} days approved, of which ${excess} exceed the balance and will be treated as loss of pay in this month's payroll.`
        : `${r.days} day${r.days === 1 ? '' : 's'} approved. The attendance record for those dates now shows leave, and the balance has been reduced.`,
    )
    return true
  }

  return (
    <div>
      <PageHeader
        title="Leave"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Leave' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setApplying(true)
              setForm({ employeeCode: employees[0]?.employeeCode ?? '', leaveType: 'CASUAL', fromDate: '', toDate: '', reason: '', contact: '', handover: '' })
            }}
          >
            Apply for leave
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'PENDING' ? pending.length : undefined }))} />}
      />

      {tab === 'PENDING' || tab === 'ALL' ? (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className={cn('font-medium', pending.length ? 'text-progress' : 'text-success')}>{pending.length}</span> awaiting
            a decision · <span className="font-medium text-fg tabular">{approved.length}</span> approved this period. Every request
            is checked against the balance, the notice period and the department's existing approved leave before it can be passed.
          </p>

          {pending.length > 0 && (
            <Card className="mb-4">
              <CardHeader title="Awaiting a decision" description="The checks are shown so nobody approves leave that becomes loss of pay by surprise" />
              <CardBody className="space-y-2">
                {pending.map((r) => {
                  const c = checks(r)
                  const clean = c.balanceOk && c.noticeOk && c.lengthOk && c.documentOk && c.clashes.length === 0
                  return (
                    <div key={r.uid} className={cn('rounded border p-3', clean ? 'border-border bg-surface-2' : 'border-warning/30 bg-warning/5')}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg">
                            {r.employeeName} — {r.days} day{r.days === 1 ? '' : 's'} {LEAVE_TYPE_LABEL[r.leaveType].toLowerCase()},{' '}
                            {formatDate(r.fromDate)} to {formatDate(r.toDate)}
                          </p>
                          <p className="mt-0.5 text-2xs text-fg-muted">{r.reason}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs">
                            <span className={c.balanceOk ? 'text-success' : 'text-danger'}>
                              {r.leaveType === 'LOSS_OF_PAY' ? 'unpaid — no balance needed' : `balance ${c.balance} of ${r.days} needed`}
                            </span>
                            <span className={c.noticeOk ? 'text-success' : 'text-warning'}>
                              notice {c.noticeDays} d{c.policy ? ` (policy ${c.policy.minNoticeDays} d)` : ''}
                            </span>
                            {!c.lengthOk && (
                              <span className="text-warning">
                                longer than the {c.policy?.maxConsecutiveDays}-day maximum for this type
                              </span>
                            )}
                            {!c.documentOk && <span className="text-danger">medical certificate not attached</span>}
                            {c.clashes.length > 0 && (
                              <span className="text-warning">
                                {c.clashes.length} other{c.clashes.length === 1 ? '' : 's'} in {r.department} already on leave then
                              </span>
                            )}
                            {!r.handoverTo && <span className="text-warning">no handover named</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button variant="success" size="sm" onClick={() => { setDeciding(r); setNote('') }}>
                            {r.status === 'PENDING_MANAGER' ? 'Manager approve' : 'HR approve'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              crud.update(r.uid, { status: 'REJECTED', rejectionReason: 'Not approved by the reporting manager' })
                              toast.success('Leave rejected', `${r.docNo} rejected. ${r.employeeName} is notified with the reason.`)
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

          <DataTable
            rows={visible}
            columns={columns}
            rowKey={(r) => r.uid}
            searchPlaceholder="Search request, employee, department or type…"
            onExport={doExport}
            emptyTitle="No leave requests"
            rowClassName={(r) => cn(
              (r.status === 'PENDING_MANAGER' || r.status === 'PENDING_HR') && 'bg-progress/[0.04]',
              r.status === 'REJECTED' && 'opacity-60',
              !checks(r).balanceOk && r.leaveType !== 'LOSS_OF_PAY' && 'bg-danger/[0.03]',
            )}
            rowActions={(r) => (
              <>
                <MenuItem label="Edit the request" onClick={() => crud.openEdit(r)} />
                <MenuItem label="Delete the request" danger onClick={() => crud.askDelete(r)} />
                <MenuItem
                  separatorBefore
                  label="Approve"
                  disabled={r.status !== 'PENDING_MANAGER' && r.status !== 'PENDING_HR'}
                  onClick={() => { setDeciding(r); setNote('') }}
                />
                <MenuItem
                  label="Reject"
                  danger
                  disabled={r.status !== 'PENDING_MANAGER' && r.status !== 'PENDING_HR'}
                  onClick={() => {
                    crud.update(r.uid, { status: 'REJECTED', rejectionReason: 'Not approved' })
                    toast.success('Leave rejected', `${r.docNo} rejected.`)
                  }}
                />
                <MenuItem
                  label="Attach the medical certificate"
                  disabled={r.documentAttached}
                  onClick={() => {
                    crud.update(r.uid, { documentAttached: true })
                    toast.success('Document attached', `Certificate recorded against ${r.docNo}. The policy check for this request is now satisfied.`)
                  }}
                />
                <MenuItem
                  separatorBefore
                  label="Cancel the approved leave"
                  danger
                  disabled={r.status !== 'APPROVED'}
                  onClick={() => {
                    crud.update(r.uid, { status: 'CANCELLED' })
                    toast.success(
                      'Leave cancelled',
                      `${r.days} day${r.days === 1 ? '' : 's'} returned to ${r.employeeName}'s balance and the attendance record for those dates reverted.`,
                    )
                  }}
                />
              </>
            )}
          />
        </>
      ) : tab === 'BALANCE' ? (
        <Card>
          <CardHeader
            title="Leave balances"
            description="Opening plus accrued less availed. Earned leave carries forward; casual leave lapses at the year end."
          />
          <CardBody className="space-y-2">
            {employees.filter((e) => e.status !== 'EXITED').map((e) => {
              const mine = (['CASUAL', 'SICK', 'EARNED', 'COMP_OFF'] as LeaveType[]).map((t) => ({
                type: t,
                policy: policies.find((p) => p.leaveType === t),
                balance: balanceOf(e.employeeCode, t),
              }))
              return (
                <div key={e.uid} className="rounded border border-border p-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <EmployeeCell name={e.fullName} code={e.employeeCode} sub={e.department} />
                    <span className="text-2xs text-fg-subtle">{e.employmentType.toLowerCase()}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    {mine.map((m) => {
                      const entitlement = m.policy?.annualEntitlement || 1
                      return (
                        <div key={m.type}>
                          <div className="mb-1 flex items-center justify-between text-2xs">
                            <span className="text-fg-muted">{LEAVE_TYPE_LABEL[m.type]}</span>
                            <span className={cn('font-medium tabular', m.balance <= 0 ? 'text-danger' : m.balance < 2 ? 'text-warning' : 'text-fg')}>
                              {m.balance}
                            </span>
                          </div>
                          <ProgressBar
                            value={Math.max(0, Math.min(100, (m.balance / entitlement) * 100))}
                            tone={m.balance <= 0 ? 'danger' : m.balance < 2 ? 'warning' : 'success'}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Leave policies" description="These rules are what every approval is checked against" />
          <CardBody className="space-y-2">
            {policies.map((p) => (
              <div key={p.uid} className={cn('rounded border p-3', p.isActive ? 'border-border' : 'border-border opacity-60')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">
                      {p.name}
                      {!p.isPaid && <Badge tone="danger" size="sm" dot={false} className="ml-1.5">unpaid</Badge>}
                    </p>
                    <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
                      {p.annualEntitlement > 0 ? `${p.annualEntitlement} days a year, accrued ${p.accrual.toLowerCase()}` : 'No annual entitlement — granted on an event'}
                      {' · '}notice {p.minNoticeDays} day{p.minNoticeDays === 1 ? '' : 's'}
                      {' · '}maximum {p.maxConsecutiveDays} consecutive
                      {p.carryForwardAllowed ? ` · carries forward up to ${p.maxCarryForward}` : ' · does not carry forward'}
                      {p.encashmentAllowed ? ` · encashable up to ${p.maxEncashment}` : ''}
                      {p.requiresDocument ? ` · document needed beyond ${p.documentAfterDays} days` : ''}
                    </p>
                    <p className="mt-1 text-2xs text-fg-subtle">
                      Applies to: {p.appliesTo.map((t) => t.toLowerCase()).join(', ')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updatePolicy(p.uid, { isActive: !p.isActive })
                      toast.success(
                        p.isActive ? 'Policy deactivated' : 'Policy activated',
                        `${p.name} ${p.isActive ? 'can no longer be applied for' : 'is available again'}. Existing approved leave is untouched.`,
                      )
                    }}
                  >
                    {p.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Approve ----------------------------------------------------------- */}
      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding ? `${deciding.status === 'PENDING_MANAGER' ? 'Manager approval' : 'HR approval'} — ${deciding.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeciding(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!deciding) return
                if (approve(deciding, note)) setDeciding(null)
              }}
            >
              Approve
            </Button>
          </>
        }
      >
        {deciding && (() => {
          const c = checks(deciding)
          return (
            <div className="space-y-3.5">
              <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                <p className="font-medium text-fg">
                  {deciding.employeeName} — {deciding.days} day{deciding.days === 1 ? '' : 's'}{' '}
                  {LEAVE_TYPE_LABEL[deciding.leaveType].toLowerCase()}
                </p>
                <p className="mt-1 text-fg-muted">
                  {formatDate(deciding.fromDate)} to {formatDate(deciding.toDate)} · contact{' '}
                  {deciding.contactDuringLeave} · handover to {deciding.handoverTo ?? 'nobody named'}
                </p>
                <p className="mt-1 text-2xs text-fg-muted">{deciding.reason}</p>
              </div>

              <div className="space-y-1.5">
                {[
                  { ok: c.balanceOk, text: deciding.leaveType === 'LOSS_OF_PAY' ? 'Unpaid leave — no balance is needed' : `Balance ${c.balance} against ${deciding.days} day${deciding.days === 1 ? '' : 's'} requested` },
                  { ok: c.noticeOk, text: `Notice ${c.noticeDays} day${c.noticeDays === 1 ? '' : 's'}${c.policy ? `, policy asks for ${c.policy.minNoticeDays}` : ''}` },
                  { ok: c.lengthOk, text: `Length ${deciding.days} day${deciding.days === 1 ? '' : 's'}${c.policy ? `, maximum ${c.policy.maxConsecutiveDays} consecutive` : ''}` },
                  { ok: c.documentOk, text: c.policy?.requiresDocument ? `Document ${deciding.documentAttached ? 'attached' : `needed beyond ${c.policy.documentAfterDays} days`}` : 'No document needed' },
                  { ok: c.clashes.length === 0, text: c.clashes.length ? `${c.clashes.length} other person in ${deciding.department} already approved for these dates` : `Nobody else in ${deciding.department} is on leave then` },
                ].map((chk, i) => (
                  <div key={i} className="flex items-start gap-2 text-2xs">
                    <span className={cn('mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full', chk.ok ? 'bg-success' : 'bg-danger')} />
                    <span className={chk.ok ? 'text-fg-muted' : 'text-danger'}>{chk.text}</span>
                  </div>
                ))}
              </div>

              {!c.balanceOk && deciding.leaveType !== 'LOSS_OF_PAY' && (
                <p className="rounded border border-danger/30 bg-danger/5 p-2.5 text-2xs text-danger">
                  Approving this will convert {deciding.days - c.balance} day
                  {deciding.days - c.balance === 1 ? '' : 's'} to loss of pay in this month's payroll. Tell the employee before
                  approving, and record the reason below.
                </p>
              )}

              <Textarea
                label={c.balanceOk ? 'Approver note (optional)' : 'Approver note (required — balance is short)'}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Discussed with the employee; the two excess days will be loss of pay."
              />
            </div>
          )
        })()}
      </Modal>

      {/* Apply ------------------------------------------------------------- */}
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
                const emp = employees.find((e) => e.employeeCode === form.employeeCode)
                if (!emp) {
                  toast.error('Choose an employee', 'Leave is applied against a person.')
                  return
                }
                if (!form.fromDate || !form.toDate) {
                  toast.error('Enter the dates', 'Both a from and a to date are needed.')
                  return
                }
                const days = Math.round((new Date(form.toDate).getTime() - new Date(form.fromDate).getTime()) / 86_400_000) + 1
                if (days <= 0) {
                  toast.error('Dates are the wrong way round', 'The to date has to be on or after the from date.')
                  return
                }
                if (!form.reason.trim()) {
                  toast.error('Enter a reason', 'The approver reads only this.')
                  return
                }
                const policy = policies.find((p) => p.leaveType === form.leaveType)
                if (policy && !policy.appliesTo.includes(emp.employmentType)) {
                  toast.error(
                    'Not available for this employment type',
                    `${policy.name} applies to ${policy.appliesTo.map((t) => t.toLowerCase()).join(', ')}. ${emp.fullName} is on ${emp.employmentType.toLowerCase()} terms.`,
                  )
                  return
                }
                const balance = balanceOf(emp.employeeCode, form.leaveType)
                crud.create({
                  uid: `lv-new-${Date.now().toString(36)}`,
                  docNo: `LV/2627/${String(420 + requests.length).padStart(4, '0')}`,
                  employeeCode: emp.employeeCode,
                  employeeName: emp.fullName,
                  department: emp.department,
                  leaveType: form.leaveType,
                  fromDate: form.fromDate,
                  toDate: form.toDate,
                  days,
                  isHalfDay: false,
                  reason: form.reason.trim(),
                  appliedOn: new Date().toISOString().slice(0, 10),
                  contactDuringLeave: form.contact || emp.mobile,
                  handoverTo: form.handover || null,
                  documentAttached: false,
                  managerApprovedBy: null,
                  managerApprovedOn: null,
                  hrApprovedBy: null,
                  hrApprovedOn: null,
                  rejectionReason: null,
                  balanceAtApply: balance,
                  status: 'PENDING_MANAGER',
                } as LeaveRequest)
                toast.success(
                  'Leave applied',
                  balance >= days || form.leaveType === 'LOSS_OF_PAY'
                    ? `${days} day${days === 1 ? '' : 's'} requested and sent to the reporting manager.`
                    : `${days} day${days === 1 ? '' : 's'} requested against a balance of ${balance}. The approver will see the shortfall and that the excess becomes loss of pay.`,
                )
                setApplying(false)
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Employee"
              value={form.employeeCode}
              onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
              options={employees.filter((e) => e.status !== 'EXITED').map((e) => ({ value: e.employeeCode, label: `${e.fullName} (${e.employeeCode})` }))}
            />
            <Select
              label="Leave type"
              value={form.leaveType}
              onChange={(e) => setForm({ ...form, leaveType: e.target.value as LeaveType })}
              options={policies.filter((p) => p.isActive).map((p) => ({ value: p.leaveType, label: p.name }))}
              hint={
                form.employeeCode
                  ? `Balance ${balanceOf(form.employeeCode, form.leaveType)} day${balanceOf(form.employeeCode, form.leaveType) === 1 ? '' : 's'}`
                  : undefined
              }
            />
            <Input label="From" type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} />
            <Input label="To" type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
            <Input label="Contact while away" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Defaults to the mobile on record" />
            <Input label="Handover to" value={form.handover} onChange={(e) => setForm({ ...form, handover: e.target.value })} placeholder="Who covers the work" />
          </div>
          <Textarea label="Reason" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Two approvals, and why both exist" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">The manager judges cover.</span> Can the line run without this person on those
            dates? That is a shop-floor question, and only the supervisor can answer it.
          </p>
          <p>
            <span className="font-medium text-fg">HR judges entitlement.</span> Is the balance there, is the notice right, is the
            certificate attached? Those are policy questions, and the answer has to be the same for everybody.
          </p>
          <p>
            <span className="font-medium text-fg">Then payroll follows automatically.</span> Approved paid leave keeps the salary
            whole; anything beyond the balance becomes loss of pay, which is why the shortfall is shown before approval and not
            after.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
