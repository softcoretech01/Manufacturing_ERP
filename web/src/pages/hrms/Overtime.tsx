import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { EmployeeCell, HrStatusBadge, Hours, PayCell, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { overtime as seedOvertime } from '@/mock/hrms'
import type { OvertimeRecord } from '@/types/hrms'

/** Statutory weekly overtime ceiling under the Factories Act. */
const WEEKLY_OT_CEILING_HOURS = 12

const TABS = [
  { id: 'REQUESTED', label: 'To approve' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'ALL', label: 'All claims' },
]

/**
 * Overtime — a claim against what the attendance system actually saw. The gap
 * between the two is the whole point of this screen: approving a claim the
 * biometric reader cannot support is how overtime bills quietly double, and the
 * Factories Act ceiling of twelve hours a week is a legal limit rather than a
 * guideline.
 */
export function OvertimePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeePay = useCanSeePay()
  const seed = useMemo(() => seedOvertime, [])

  const crud = useCrud<OvertimeRecord>({
    key: 'hrms:overtime',
    seed,
    entity: 'Overtime claim',
    titleOf: (o) => `${o.docNo} — ${o.employeeName}`,
    fields: [
      { name: 'docNo', label: 'Claim number', required: true, readOnly: true },
      { name: 'otDate', label: 'Date', type: 'date', required: true },
      { name: 'employeeCode', label: 'Employee code', required: true },
      { name: 'employeeName', label: 'Employee', required: true },
      { name: 'department', label: 'Department', required: true },
      { name: 'shiftCode', label: 'Shift', required: true },
      { name: 'claimedMinutes', label: 'Minutes claimed', type: 'number', required: true },
      { name: 'systemMinutes', label: 'Minutes the system saw', type: 'number', readOnly: true, hint: 'From the attendance punches — not editable' },
      { name: 'productionOrderNo', label: 'Against production order', hint: 'Leaving this blank books the cost as indirect' },
      { name: 'workCentre', label: 'Work centre' },
      { name: 'hourlyRate', label: 'Hourly rate', type: 'number' },
      { name: 'reason', label: 'Reason', type: 'textarea', span: 2, required: true },
    ],
    fromForm: (v, existing) => {
      const claimed = Number(v.claimedMinutes) || 0
      const rate = Number(v.hourlyRate) || 0
      return {
        ...(existing ?? {
          docNo: v.docNo,
          approvedMinutes: 0,
          rateMultiplier: 2,
          requestedBy: v.employeeName,
          approvedBy: null,
          status: 'REQUESTED' as const,
          systemMinutes: 0,
        }),
        otDate: v.otDate,
        employeeCode: v.employeeCode,
        employeeName: v.employeeName,
        department: v.department,
        shiftCode: v.shiftCode,
        claimedMinutes: claimed,
        productionOrderNo: v.productionOrderNo || null,
        workCentre: v.workCentre || null,
        hourlyRate: rate,
        reason: v.reason,
        // Amount always follows from approved minutes × rate × multiplier.
        amount: Math.round(((existing?.approvedMinutes ?? 0) / 60) * rate * (existing?.rateMultiplier ?? 2)),
      }
    },
    blockDelete: (o) =>
      o.status === 'PAID'
        ? `${o.docNo} has been paid through payroll. A paid overtime claim is part of the salary record and the statutory register.`
        : undefined,
  })

  const claims = crud.rows
  const [tab, setTab] = useState('REQUESTED')
  const [approving, setApproving] = useState<OvertimeRecord | null>(null)
  const [approve, setApprove] = useState({ minutes: '', note: '' })

  const visible = claims.filter((o) => {
    if (tab === 'REQUESTED') return o.status === 'REQUESTED'
    if (tab === 'APPROVED') return o.status === 'APPROVED' || o.status === 'PAID'
    return true
  })

  const pending = claims.filter((o) => o.status === 'REQUESTED')
  const overClaimed = claims.filter((o) => o.claimedMinutes > o.systemMinutes + 15)
  const approvedMinutes = claims
    .filter((o) => o.status === 'APPROVED' || o.status === 'PAID')
    .reduce((s, o) => s + o.approvedMinutes, 0)
  const approvedCost = claims
    .filter((o) => o.status === 'APPROVED' || o.status === 'PAID')
    .reduce((s, o) => s + o.amount, 0)

  /** Approved overtime this week for one person, against the statutory ceiling. */
  function weeklyMinutes(employeeCode: string, excludeUid?: string) {
    return claims
      .filter(
        (o) =>
          o.employeeCode === employeeCode &&
          o.uid !== excludeUid &&
          (o.status === 'APPROVED' || o.status === 'PAID') &&
          Date.now() - new Date(o.otDate).getTime() < 7 * 86_400_000,
      )
      .reduce((s, o) => s + o.approvedMinutes, 0)
  }

  const columns: Column<OvertimeRecord>[] = [
    { key: 'docNo', header: 'Claim', sortable: true, width: '11rem', render: (o) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{o.docNo}</p>
        <p className="text-2xs text-fg-subtle">{formatDate(o.otDate)}</p>
      </div>
    ) },
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (o) => (
      <EmployeeCell name={o.employeeName} code={o.employeeCode} sub={o.department} />
    ) },
    { key: 'shiftCode', header: 'Shift', align: 'center', width: '6rem', sortable: true, render: (o) => (
      <span className="font-mono text-2xs text-fg-muted">{o.shiftCode.replace('SH-', '')}</span>
    ) },
    { key: 'claimedMinutes', header: 'Claimed', align: 'right', width: '7.5rem', sortable: true, render: (o) => <Hours minutes={o.claimedMinutes} /> },
    { key: 'systemMinutes', header: 'System saw', align: 'right', width: '9rem', sortable: true, render: (o) => (
      <span className={cn(o.claimedMinutes > o.systemMinutes + 15 && 'text-warning')}>
        <Hours minutes={o.systemMinutes} />
      </span>
    ) },
    { key: 'gap', header: 'Gap', align: 'right', width: '7.5rem', sortable: true, accessor: (o) => o.claimedMinutes - o.systemMinutes, render: (o) => {
      const gap = o.claimedMinutes - o.systemMinutes
      if (gap <= 0) return <span className="text-2xs text-success">supported</span>
      return (
        <span className={cn('tabular text-xs', gap > 60 ? 'font-medium text-danger' : 'text-warning')}>
          +{gap} min
        </span>
      )
    } },
    { key: 'approvedMinutes', header: 'Approved', align: 'right', width: '8.5rem', sortable: true, render: (o) => (
      o.approvedMinutes ? <Hours minutes={o.approvedMinutes} /> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'weekly', header: 'This week', align: 'right', width: '9rem', accessor: (o) => weeklyMinutes(o.employeeCode), render: (o) => {
      const mins = weeklyMinutes(o.employeeCode)
      const hours = mins / 60
      return (
        <span className={cn('tabular text-2xs', hours >= WEEKLY_OT_CEILING_HOURS ? 'font-medium text-danger' : hours >= 10 ? 'text-warning' : 'text-fg-muted')}>
          {hours.toFixed(1)}/{WEEKLY_OT_CEILING_HOURS} h
        </span>
      )
    } },
    { key: 'productionOrderNo', header: 'Charged to', sortable: true, render: (o) => (
      o.productionOrderNo ? (
        <div className="min-w-0">
          <p className="truncate font-mono text-2xs text-fg">{o.productionOrderNo}</p>
          <p className="truncate text-2xs text-fg-subtle">{o.workCentre}</p>
        </div>
      ) : (
        <span className="text-2xs text-warning">indirect</span>
      )
    ) },
    ...(canSeePay
      ? [{
          key: 'amount', header: 'Amount', align: 'right' as const, sortable: true, width: '9rem',
          render: (o: OvertimeRecord) => (o.amount ? <PayCell amount={o.amount} /> : <span className="text-2xs text-fg-subtle">—</span>),
        }]
      : []),
    { key: 'reason', header: 'Reason', render: (o) => <span className="text-2xs text-fg-muted">{o.reason}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '8.5rem', render: (o) => <HrStatusBadge status={o.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'overtime-register', 'Overtime register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Overtime"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Overtime' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/attendance')}>Attendance</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({
                docNo: `OT/2607/${String(414 + claims.length).padStart(4, '0')}`,
                otDate: new Date().toISOString().slice(0, 10),
                shiftCode: 'SH-A',
              })}
            >
              Raise a claim
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'REQUESTED' ? pending.length : undefined }))} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', pending.length ? 'text-progress' : 'text-success')}>{pending.length}</span> claim
        {pending.length === 1 ? '' : 's'} to approve ·{' '}
        <span className="font-medium text-fg tabular">{(approvedMinutes / 60).toFixed(1)}</span> hours approved
        {canSeePay && <> costing <span className="font-medium text-fg tabular">₹{approvedCost.toLocaleString('en-IN')}</span></>}
        {overClaimed.length > 0 && (
          <>
            {' '}· <span className="font-medium text-warning">{overClaimed.length}</span> claim
            {overClaimed.length === 1 ? '' : 's'} above what the punches support
          </>
        )}
        . Payroll for this period cannot be sent for approval while any claim is open.
      </p>

      {pending.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Claims to approve"
            description="The system figure comes from the attendance punches — approve against that, not against the claim"
          />
          <CardBody className="space-y-2">
            {pending.map((o) => {
              const gap = o.claimedMinutes - o.systemMinutes
              const weekly = weeklyMinutes(o.employeeCode)
              const wouldExceed = (weekly + o.systemMinutes) / 60 > WEEKLY_OT_CEILING_HOURS
              return (
                <div
                  key={o.uid}
                  className={cn('rounded border p-3', gap > 60 || wouldExceed ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface-2')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-fg">
                        {o.employeeName} — {(o.claimedMinutes / 60).toFixed(1)} h claimed on {formatDate(o.otDate)}
                      </p>
                      <p className="mt-0.5 text-2xs text-fg-muted">{o.reason}</p>
                      <p className="mt-1 text-2xs">
                        {gap > 15 ? (
                          <span className="font-medium text-danger">
                            The punches support only {(o.systemMinutes / 60).toFixed(1)} h — {gap} minutes more is being claimed
                            than the reader saw.
                          </span>
                        ) : (
                          <span className="text-success">
                            Supported by the punches ({(o.systemMinutes / 60).toFixed(1)} h recorded).
                          </span>
                        )}
                        {wouldExceed && (
                          <span className="ml-1 font-medium text-danger">
                            Approving this takes {o.employeeName.split(' ')[0]} past the {WEEKLY_OT_CEILING_HOURS}-hour weekly
                            statutory ceiling.
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => { setApproving(o); setApprove({ minutes: String(o.systemMinutes), note: '' }) }}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          crud.update(o.uid, { status: 'REJECTED', approvedMinutes: 0, amount: 0 })
                          toast.success(
                            'Claim rejected',
                            `${o.docNo} rejected. ${o.employeeName} is notified, and nothing is added to payroll.`,
                          )
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
        rowKey={(o) => o.uid}
        searchPlaceholder="Search claim, employee, department or production order…"
        onExport={doExport}
        emptyTitle="No overtime claims"
        rowClassName={(o) => cn(
          o.status === 'REQUESTED' && 'bg-progress/[0.04]',
          o.claimedMinutes > o.systemMinutes + 60 && 'bg-danger/[0.04]',
          o.status === 'REJECTED' && 'opacity-60',
        )}
        rowActions={(o) => (
          <>
            <MenuItem label="Edit the claim" onClick={() => crud.openEdit(o)} />
            <MenuItem label="Delete the claim" danger onClick={() => crud.askDelete(o)} />
            <MenuItem
              separatorBefore
              label="Approve the claim"
              disabled={o.status !== 'REQUESTED'}
              onClick={() => { setApproving(o); setApprove({ minutes: String(o.systemMinutes), note: '' }) }}
            />
            <MenuItem
              label="Reject the claim"
              danger
              disabled={o.status !== 'REQUESTED'}
              onClick={() => {
                crud.update(o.uid, { status: 'REJECTED', approvedMinutes: 0, amount: 0 })
                toast.success('Claim rejected', `${o.docNo} rejected.`)
              }}
            />
            <MenuItem label="Open the attendance day" onClick={() => navigate('/hrms/attendance')} />
            <MenuItem label="See where the cost lands" onClick={() => navigate('/hrms/labour-cost')} />
          </>
        )}
      />

      <Modal
        open={!!approving}
        onClose={() => setApproving(null)}
        title={approving ? `Approve ${approving.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setApproving(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!approving) return
                const mins = Number(approve.minutes)
                if (Number.isNaN(mins) || mins <= 0) {
                  toast.error('Enter the minutes to approve', 'Normally this is what the punches support.')
                  return
                }
                if (mins > approving.claimedMinutes) {
                  toast.error(
                    'More than was claimed',
                    `${approving.employeeName} claimed ${approving.claimedMinutes} minutes. Approving more than the claim is not a correction, it is a gift.`,
                  )
                  return
                }
                if (mins > approving.systemMinutes && !approve.note.trim()) {
                  toast.error(
                    'Above the punches — a note is required',
                    `The reader saw ${approving.systemMinutes} minutes. Approving ${mins} needs a written reason, because the payment is not supported by the attendance record.`,
                  )
                  return
                }
                const weekly = weeklyMinutes(approving.employeeCode, approving.uid)
                if ((weekly + mins) / 60 > WEEKLY_OT_CEILING_HOURS) {
                  toast.error(
                    'Statutory ceiling exceeded',
                    `${approving.employeeName} already has ${(weekly / 60).toFixed(1)} approved overtime hours this week. Adding ${(mins / 60).toFixed(1)} would breach the ${WEEKLY_OT_CEILING_HOURS}-hour limit under the Factories Act. Reduce the hours or move the work to another operator.`,
                  )
                  return
                }
                const amount = Math.round((mins / 60) * approving.hourlyRate * approving.rateMultiplier)
                crud.update(approving.uid, {
                  approvedMinutes: mins,
                  amount,
                  status: 'APPROVED',
                  approvedBy: 'Meera Rajan',
                  reason: approve.note.trim() ? `${approving.reason} — Approver: ${approve.note.trim()}` : approving.reason,
                })
                toast.success(
                  'Overtime approved',
                  `${(mins / 60).toFixed(1)} hours approved at ${approving.rateMultiplier}× the ordinary rate${canSeePay ? `, ₹${amount.toLocaleString('en-IN')}` : ''}. It will be picked up by the next payroll run.`,
                )
                setApproving(null)
              }}
            >
              Approve
            </Button>
          </>
        }
      >
        {approving && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{approving.employeeName} — {formatDate(approving.otDate)}</p>
              <p className="mt-1 text-fg-muted">{approving.reason}</p>
              <div className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-3">
                <p className="text-2xs text-fg-muted">Claimed <span className="block font-medium tabular text-fg">{(approving.claimedMinutes / 60).toFixed(1)} h</span></p>
                <p className="text-2xs text-fg-muted">Punches show <span className="block font-medium tabular text-fg">{(approving.systemMinutes / 60).toFixed(1)} h</span></p>
                <p className="text-2xs text-fg-muted">
                  This week
                  <span className={cn('block font-medium tabular', weeklyMinutes(approving.employeeCode, approving.uid) / 60 >= 10 ? 'text-warning' : 'text-fg')}>
                    {(weeklyMinutes(approving.employeeCode, approving.uid) / 60).toFixed(1)} of {WEEKLY_OT_CEILING_HOURS} h
                  </span>
                </p>
              </div>
            </div>

            <Input
              label="Minutes to approve"
              type="number"
              value={approve.minutes}
              onChange={(e) => setApprove({ ...approve, minutes: e.target.value })}
              hint={`Paid at ${approving.rateMultiplier}× the ordinary rate${canSeePay ? ` — ₹${approving.hourlyRate}/hour becomes ₹${approving.hourlyRate * approving.rateMultiplier}/hour` : ''}`}
            />
            {Number(approve.minutes) > approving.systemMinutes && (
              <Textarea
                label="Reason for approving above the punches (required)"
                rows={3}
                value={approve.note}
                onChange={(e) => setApprove({ ...approve, note: e.target.value })}
                placeholder="Reader at gate 2 was down; the supervisor's shift log confirms the operator was on the line until 16:00."
              />
            )}
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Three checks, and why each exists" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Claim against punches.</span> The reader is the neutral witness. A claim well
            above it is either a genuine reader failure — which is worth knowing — or an inflated claim.
          </p>
          <p>
            <span className="font-medium text-fg">The weekly ceiling.</span> Twelve hours a week is a statutory limit, not a
            target. Breaching it is a Factories Act exposure and a fatigue risk on a press.
          </p>
          <p>
            <span className="font-medium text-fg">The charge line.</span> Overtime booked to a production order lands in the cost
            of that batch. Left blank it becomes indirect cost, which is where overtime goes to hide.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
