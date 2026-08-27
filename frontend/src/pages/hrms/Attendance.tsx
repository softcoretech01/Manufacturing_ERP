import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import {
  EmployeeCell,
  HrChartTip,
  HrStatusBadge,
  Hours,
  PUNCH_SOURCE_LABEL,
  PunchCell,
} from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { attendance as seedAttendance, attendanceTrend } from '@/mock/hrms'
import type { AttendanceRecord, PunchSource } from '@/types/hrms'

const TABS = [
  { id: 'TODAY', label: "Today's attendance" },
  { id: 'EXCEPTIONS', label: 'Exceptions' },
  { id: 'SHOPFLOOR', label: 'Shop floor' },
]

/**
 * Daily attendance — the input payroll is built on, which is why the exceptions
 * matter more than the totals. A missed punch left unregularised becomes an
 * absent day and a wrong salary; the screen makes that queue impossible to miss
 * and refuses to let payroll close over it.
 */
export function AttendancePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const seed = useMemo(() => seedAttendance, [])

  const crud = useCrud<AttendanceRecord>({
    key: 'hrms:attendance',
    seed,
    entity: 'Attendance record',
    titleOf: (a) => `${a.employeeName} — ${formatDate(a.attendanceDate)}`,
    fields: [
      { name: 'attendanceDate', label: 'Date', type: 'date', required: true },
      { name: 'employeeCode', label: 'Employee code', required: true, readOnly: true },
      { name: 'employeeName', label: 'Employee', required: true, readOnly: true },
      { name: 'shiftCode', label: 'Shift', required: true },
      { name: 'inTime', label: 'In time', hint: 'HH:MM in 24-hour clock' },
      { name: 'outTime', label: 'Out time' },
      { name: 'breakMinutes', label: 'Break (minutes)', type: 'number' },
      { name: 'overtimeMinutes', label: 'Overtime (minutes)', type: 'number' },
      { name: 'regularisationReason', label: 'Reason for the correction', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {}),
      attendanceDate: v.attendanceDate,
      shiftCode: v.shiftCode,
      inTime: v.inTime || null,
      outTime: v.outTime || null,
      breakMinutes: Number(v.breakMinutes) || 0,
      overtimeMinutes: Number(v.overtimeMinutes) || 0,
      regularisationReason: v.regularisationReason || null,
      // Any hand edit is a regularisation, and is recorded as one.
      regularised: true,
      regularisedBy: 'HR Desk',
      inSource: (existing?.inSource ?? 'MANUAL') as PunchSource,
    }),
    blockDelete: () =>
      'An attendance record is never deleted — it is the evidence behind a salary payment and a statutory register. Correct it with a regularisation instead, which keeps both the original punch and the correction.',
  })

  const records = crud.rows
  const [tab, setTab] = useState('TODAY')
  const [department, setDepartment] = useState('all')
  const [fixing, setFixing] = useState<AttendanceRecord | null>(null)
  const [fix, setFix] = useState({ inTime: '', outTime: '', reason: '' })

  const departments = [...new Set(records.map((r) => r.department))].sort()

  const isException = (r: AttendanceRecord) =>
    (r.status === 'MISSED_PUNCH' || r.status === 'ABSENT' || r.status === 'LATE' || r.status === 'EARLY_EXIT') && !r.regularised

  const visible = records
    .filter((r) => (department === 'all' ? true : r.department === department))
    .filter((r) => {
      if (tab === 'EXCEPTIONS') return isException(r)
      if (tab === 'SHOPFLOOR') return r.isShopFloor
      return true
    })

  const present = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
  const absent = records.filter((r) => r.status === 'ABSENT')
  const onLeave = records.filter((r) => r.status === 'ON_LEAVE')
  const exceptions = records.filter(isException)
  const late = records.filter((r) => r.lateMinutes > 0)
  const totalOt = records.reduce((s, r) => s + r.overtimeMinutes, 0)
  const attendancePct = records.length ? (present.length / records.length) * 100 : 0

  const columns: Column<AttendanceRecord>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (r) => (
      <EmployeeCell name={r.employeeName} code={r.employeeCode} sub={r.department} />
    ) },
    { key: 'shiftName', header: 'Shift', sortable: true, width: '11rem', render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{r.shiftName}</p>
        <p className="font-mono text-2xs text-fg-subtle">{r.shiftStart}–{r.shiftEnd}</p>
      </div>
    ) },
    { key: 'inTime', header: 'In', width: '8.5rem', sortable: true, accessor: (r) => r.inTime ?? '', render: (r) => (
      <PunchCell time={r.inTime} lateMinutes={r.lateMinutes} source={r.inSource} />
    ) },
    { key: 'outTime', header: 'Out', width: '8.5rem', sortable: true, accessor: (r) => r.outTime ?? '', render: (r) => (
      <PunchCell time={r.outTime} source={r.outSource} />
    ) },
    { key: 'workedMinutes', header: 'Worked', align: 'right', width: '7.5rem', sortable: true, render: (r) => <Hours minutes={r.workedMinutes} /> },
    { key: 'breakMinutes', header: 'Break', align: 'right', width: '6.5rem', defaultHidden: true, render: (r) => <Hours minutes={r.breakMinutes} /> },
    { key: 'lateMinutes', header: 'Late by', align: 'right', width: '7.5rem', sortable: true, render: (r) => (
      r.lateMinutes ? <span className="tabular text-xs text-warning">{r.lateMinutes} min</span> : <span className="text-2xs text-success">on time</span>
    ) },
    { key: 'overtimeMinutes', header: 'Overtime', align: 'right', width: '8rem', sortable: true, render: (r) => (
      r.overtimeMinutes ? <Hours minutes={r.overtimeMinutes} /> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'workCentre', header: 'Work centre', sortable: true, render: (r) => (
      r.workCentre ? <span className="text-xs">{r.workCentre}</span> : <span className="text-2xs text-fg-subtle">off floor</span>
    ) },
    { key: 'regularised', header: 'Corrected', align: 'center', width: '9rem', accessor: (r) => (r.regularised ? 1 : 0), render: (r) => (
      r.regularised ? (
        <span title={r.regularisationReason ?? undefined}>
          <Badge tone="brand" size="sm" dot={false}>
            by {r.regularisedBy}
          </Badge>
        </span>
      ) : (
        <span className="text-2xs text-fg-subtle">as punched</span>
      )
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9.5rem', render: (r) => <HrStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'daily-attendance', 'Daily attendance register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Attendance' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/overtime')}>Overtime</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/shifts')}>Shifts & roster</Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'EXCEPTIONS' ? exceptions.length : undefined }))} />}
      />

      {/* Today at a glance */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-3">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Present</p>
          <p className="mt-1 text-2xl font-semibold tabular text-fg">{present.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">
            of {records.length} on roll ·{' '}
            <span className={cn('font-medium', attendancePct >= 95 ? 'text-success' : 'text-warning')}>
              {attendancePct.toFixed(1)}%
            </span>
          </p>
        </div>
        <div className={cn('card p-3', absent.length && 'border-danger/30 bg-danger/[0.03]')}>
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Absent</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', absent.length ? 'text-danger' : 'text-success')}>{absent.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">unplanned, without leave</p>
        </div>
        <div className="card p-3">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">On leave</p>
          <p className="mt-1 text-2xl font-semibold tabular text-progress">{onLeave.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">approved and planned</p>
        </div>
        <div className={cn('card p-3', late.length && 'border-warning/30 bg-warning/[0.03]')}>
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Late</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', late.length ? 'text-warning' : 'text-success')}>{late.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">
            beyond the shift grace period
          </p>
        </div>
        <div className={cn('card p-3', exceptions.length && 'border-danger/30 bg-danger/[0.03]')}>
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">To regularise</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', exceptions.length ? 'text-danger' : 'text-success')}>{exceptions.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">payroll cannot close over these</p>
        </div>
      </div>

      {exceptions.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Exceptions to regularise"
            description="Each of these becomes a wrong salary if it reaches payroll uncorrected"
          />
          <CardBody className="space-y-2">
            {exceptions.map((r) => (
              <div key={r.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {r.employeeName} — {r.status === 'MISSED_PUNCH' ? 'missed a punch' : r.status === 'ABSENT' ? 'absent with no leave' : r.status === 'LATE' ? `late by ${r.lateMinutes} minutes` : 'left early'}
                  </p>
                  <p className="text-2xs text-fg-muted">
                    {r.shiftName} {r.shiftStart}–{r.shiftEnd} ·{' '}
                    {r.inTime ? `in at ${r.inTime}` : 'no in punch'} ·{' '}
                    {r.outTime ? `out at ${r.outTime}` : 'no out punch'}
                    {r.workCentre ? ` · ${r.workCentre}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { setFixing(r); setFix({ inTime: r.inTime ?? '', outTime: r.outTime ?? '', reason: '' }) }}
                  >
                    Regularise
                  </Button>
                  {r.status === 'ABSENT' && (
                    <Button variant="outline" size="sm" onClick={() => navigate('/hrms/leave')}>
                      Apply leave instead
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-52"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          options={[{ value: 'all', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]}
        />
        <p className="text-xs text-fg-muted">
          {formatDate(records[0]?.attendanceDate ?? new Date().toISOString())} ·{' '}
          <span className="font-medium text-fg tabular">{Math.round(totalOt / 60)}</span> overtime hours across the plant today
        </p>
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search employee, code, department, shift or work centre…"
        onExport={doExport}
        emptyTitle="No attendance records"
        rowClassName={(r) => cn(
          r.status === 'ABSENT' && 'bg-danger/[0.04]',
          r.status === 'MISSED_PUNCH' && 'bg-danger/[0.05]',
          r.lateMinutes > 0 && 'bg-warning/[0.03]',
          r.status === 'ON_LEAVE' && 'opacity-70',
        )}
        rowActions={(r) => (
          <>
            <MenuItem label="Edit the record" onClick={() => crud.openEdit(r)} />
            <MenuItem label="Delete the record" danger onClick={() => crud.askDelete(r)} />
            <MenuItem
              separatorBefore
              label="Regularise the punch"
              disabled={r.status === 'PRESENT' && !r.lateMinutes}
              onClick={() => { setFixing(r); setFix({ inTime: r.inTime ?? '', outTime: r.outTime ?? '', reason: '' }) }}
            />
            <MenuItem
              label="Approve the overtime"
              disabled={r.overtimeMinutes === 0}
              onClick={() => navigate('/hrms/overtime')}
            />
            <MenuItem label="Open the employee" onClick={() => navigate('/hrms/employees')} />
          </>
        )}
      />

      <Card className="mt-4">
        <CardHeader title="Seven-day attendance trend" description="Present against absent and on leave, with overtime hours behind it" />
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={attendanceTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="attPresent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} />
              <Tooltip content={<HrChartTip />} />
              <Area type="monotone" dataKey="present" name="Present" stroke="#10b981" strokeWidth={2} fill="url(#attPresent)" />
              <Area type="monotone" dataKey="absent" name="Absent" stroke="#ef4444" strokeWidth={1.5} fill="transparent" />
              <Area type="monotone" dataKey="onLeave" name="On leave" stroke="#0ea5e9" strokeWidth={1.5} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Regularisation ---------------------------------------------------- */}
      <Modal
        open={!!fixing}
        onClose={() => setFixing(null)}
        title={fixing ? `Regularise — ${fixing.employeeName}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setFixing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!fixing) return
                if (!fix.reason.trim()) {
                  toast.error(
                    'A reason is required',
                    'A regularisation changes what somebody is paid. Without a written reason it cannot be defended at an audit or in a dispute.',
                  )
                  return
                }
                if (!fix.inTime && !fix.outTime) {
                  toast.error('Enter at least one punch', 'Give the in time, the out time, or both.')
                  return
                }
                // Recompute worked minutes and status from the corrected punches.
                const toMin = (t: string) => {
                  const [h, m] = t.split(':').map(Number)
                  return h * 60 + m
                }
                const shiftStart = toMin(fixing.shiftStart)
                const inMin = fix.inTime ? toMin(fix.inTime) : shiftStart
                const outMin = fix.outTime ? toMin(fix.outTime) : toMin(fixing.shiftEnd)
                const spanned = (outMin - inMin + 1_440) % 1_440
                const worked = Math.max(0, spanned - fixing.breakMinutes)
                const lateMinutes = Math.max(0, inMin - shiftStart - 10)

                crud.update(fixing.uid, {
                  inTime: fix.inTime || fixing.inTime,
                  outTime: fix.outTime || fixing.outTime,
                  inSource: 'MANUAL',
                  outSource: 'MANUAL',
                  workedMinutes: worked,
                  lateMinutes,
                  status: worked >= 240 ? (lateMinutes > 0 ? 'LATE' : 'PRESENT') : 'HALF_DAY',
                  regularised: true,
                  regularisedBy: 'HR Desk',
                  regularisationReason: fix.reason.trim(),
                })
                toast.success(
                  'Regularised',
                  `${fixing.employeeName} now shows ${Math.floor(worked / 60)}h ${worked % 60}m worked. The original punch and this correction are both kept in the audit trail.`,
                )
                setFixing(null)
              }}
            >
              Regularise
            </Button>
          </>
        }
      >
        {fixing && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{fixing.employeeName} — {formatDate(fixing.attendanceDate)}</p>
              <p className="mt-1 text-fg-muted">
                {fixing.shiftName}, scheduled {fixing.shiftStart}–{fixing.shiftEnd}. As punched:{' '}
                {fixing.inTime ? `in ${fixing.inTime}` : 'no in punch'},{' '}
                {fixing.outTime ? `out ${fixing.outTime}` : 'no out punch'}
                {fixing.inSource ? ` (${PUNCH_SOURCE_LABEL[fixing.inSource]})` : ''}.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Corrected in time" value={fix.inTime} onChange={(e) => setFix({ ...fix, inTime: e.target.value })} placeholder="06:00" />
              <Input label="Corrected out time" value={fix.outTime} onChange={(e) => setFix({ ...fix, outTime: e.target.value })} placeholder="14:00" />
            </div>
            <Textarea
              label="Reason (required)"
              rows={3}
              value={fix.reason}
              onChange={(e) => setFix({ ...fix, reason: e.target.value })}
              placeholder="Biometric reader at gate 2 was down between 13:40 and 14:20. Out time confirmed by the shift supervisor's log."
            />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Six ways to punch, one register" description="The method matters because each fails differently" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-fg">Fingerprint</span> is the shop-floor default. It fails on wet or cut hands, which is exactly what a packing shift produces.</p>
          <p><span className="font-medium text-fg">Face recognition</span> works with gloves on and is faster at a gate, but struggles in direct afternoon sun.</p>
          <p><span className="font-medium text-fg">RFID card</span> never fails, and is the easiest to abuse — one person can carry two cards, so it pairs with a supervisor check.</p>
          <p><span className="font-medium text-fg">Mobile GPS</span> is for field staff. The position is stamped with the punch so a claim from the wrong place is visible.</p>
          <p><span className="font-medium text-fg">QR</span> is used for contract labour, where issuing biometrics for a two-week deployment is not worth it.</p>
          <p><span className="font-medium text-fg">Entered by hand</span> is always a regularisation, always needs a reason, and always shows as such on the register.</p>
        </CardBody>
      </Card>
    </div>
  )
}
