import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { PlanStatusBadge } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { addDays, iso, plantHoursOn, workingDaysInBucket } from '@/lib/planFlow'
import { newUid } from '@/store/data'
import { usePlanningData } from './usePlanningData'
import type { CalendarDay, CalendarDayType } from '@/types/planning'

/**
 * Production calendar (Ch 10).
 *
 * Only the exceptions are stored. Everything else follows the standing rule —
 * Monday to Saturday, two shifts, Sunday off — so the calendar stays a page of
 * decisions rather than 365 rows a year that nobody maintains.
 *
 * Every date the plan touches reads from here: MRP's bucket capacity, CRP's
 * available hours and the scheduler's day-by-day walk all skip a closed day.
 */

const DAY_TYPES: CalendarDayType[] = ['WORKING', 'WEEKLY_OFF', 'HOLIDAY', 'SHUTDOWN', 'OVERTIME']
const DEFAULT_HOURS: Record<CalendarDayType, number> = {
  WORKING: 16,
  WEEKLY_OFF: 0,
  HOLIDAY: 0,
  SHUTDOWN: 0,
  OVERTIME: 24,
}

interface FormState {
  date: string
  dayType: CalendarDayType
  hours: string
  shifts: string
  reason: string
  plant: string
}

const WEEKS_SHOWN = 12

export function CalendarPage() {
  const toast = useToast()
  const { calendar, starts } = usePlanningData()
  const { rows, create, update, remove } = calendar

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarDay | null>(null)
  const [form, setForm] = useState<FormState>({ date: '', dayType: 'HOLIDAY', hours: '0', shifts: '0', reason: '', plant: 'Chennai — Unit 1' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<CalendarDay | null>(null)

  /** The horizon rendered as a grid, exceptions and defaults together. */
  const grid = useMemo(
    () =>
      Array.from({ length: WEEKS_SHOWN }, (_, w) => ({
        week: w,
        start: starts[w],
        workingDays: workingDaysInBucket(starts[w], rows),
        days: Array.from({ length: 7 }, (_, d) => {
          const date = iso(addDays(starts[w], d))
          const entry = rows.find((r) => r.date === date && !r.deletedAt)
          return { date, entry, hours: plantHoursOn(date, rows) }
        }),
      })),
    [starts, rows],
  )

  const totalHours = grid.reduce((s, w) => s + w.days.reduce((t, d) => t + d.hours, 0), 0)
  const closedDays = grid.flatMap((w) => w.days).filter((d) => d.hours === 0 && new Date(d.date).getDay() !== 0).length

  const columns: Column<CalendarDay>[] = [
    { key: 'date', header: 'Date', sortable: true, width: '9rem', accessor: (c) => c.date, render: (c) => formatDate(c.date) },
    { key: 'day', header: 'Day', width: '6.5rem', accessor: (c) => new Date(c.date).toLocaleDateString('en-IN', { weekday: 'short' }), render: (c) => <span className="text-xs text-fg-muted">{new Date(c.date).toLocaleDateString('en-IN', { weekday: 'long' })}</span> },
    { key: 'dayType', header: 'Type', sortable: true, width: '9rem', render: (c) => <PlanStatusBadge status={c.dayType} size="sm" /> },
    { key: 'hours', header: 'Hours', align: 'right', sortable: true, width: '6rem', accessor: (c) => c.hours, render: (c) => (c.hours ? `${c.hours} h` : <span className="text-2xs text-danger">closed</span>) },
    { key: 'shifts', header: 'Shifts', align: 'right', width: '5.5rem', accessor: (c) => c.shifts },
    { key: 'reason', header: 'Reason' },
    { key: 'plant', header: 'Plant', width: '12rem' },
  ]

  function openCreate() {
    setEditing(null)
    setForm({ date: '', dayType: 'HOLIDAY', hours: '0', shifts: '0', reason: '', plant: 'Chennai — Unit 1' })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(c: CalendarDay) {
    setEditing(c)
    setForm({ date: c.date, dayType: c.dayType, hours: String(c.hours), shifts: String(c.shifts), reason: c.reason, plant: c.plant })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.date) e.date = 'A date is required.'
    else if (rows.some((c) => c.date === form.date && c.uid !== editing?.uid)) e.date = `${formatDate(form.date)} already has an exception.`
    if (Number(form.hours) < 0 || Number(form.hours) > 24) e.hours = 'Hours must be between 0 and 24.'
    if (!form.reason.trim()) e.reason = 'Say why — a closed day with no reason gets questioned every year.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save() {
    if (!validate()) return
    const patch = {
      date: form.date,
      dayType: form.dayType,
      hours: Number(form.hours) || 0,
      shifts: Number(form.shifts) || 0,
      reason: form.reason.trim(),
      plant: form.plant,
    }
    if (editing) {
      update(editing.uid, { ...patch, version: editing.version + 1 })
      toast.success('Calendar updated', `${formatDate(patch.date)} is now ${patch.hours ? `${patch.hours} hours` : 'closed'}.`)
    } else {
      create({ ...patch, uid: newUid('cal'), version: 1 } as CalendarDay)
      toast.success('Exception added', `${formatDate(patch.date)} — every schedule and capacity figure re-computes from it.`)
    }
    setFormOpen(false)
  }

  function setType(dayType: CalendarDayType) {
    setForm((f) => ({ ...f, dayType, hours: String(DEFAULT_HOURS[dayType]), shifts: String(DEFAULT_HOURS[dayType] / 8) }))
  }

  return (
    <div>
      <PageHeader
        title="Production calendar"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Calendar' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add exception
          </Button>
        }
      />

      <Alert tone="info" className="mb-4">
        The standing rule is Monday to Saturday, two shifts of eight hours, Sunday off. Only the days that differ are
        stored — {rows.length} exception{rows.length === 1 ? '' : 's'} over the horizon, giving{' '}
        <span className="font-semibold text-fg">{totalHours} plant hours</span> across the next {WEEKS_SHOWN} weeks with{' '}
        {closedDays} working day{closedDays === 1 ? '' : 's'} lost to holidays and shutdown.
      </Alert>

      <Card className="mb-4">
        <CardHeader title="Next twelve weeks" description="Green is open, red is closed, amber is an extra shift" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th style={{ width: '9rem' }}>Week</th>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <th key={d} className="text-center" style={{ minWidth: '5.5rem' }}>{d}</th>
                  ))}
                  <th className="text-right" style={{ width: '7rem' }}>Working days</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((w) => (
                  <tr key={w.start}>
                    <td>
                      <p className="text-xs font-medium text-fg">W{w.week + 1}</p>
                      <p className="text-2xs text-fg-subtle">{formatDate(w.start)}</p>
                    </td>
                    {w.days.map((d) => (
                      <td key={d.date} className="px-1 text-center">
                        <button
                          type="button"
                          onClick={() => (d.entry ? openEdit(d.entry) : (setEditing(null), setForm({ date: d.date, dayType: 'HOLIDAY', hours: '0', shifts: '0', reason: '', plant: 'Chennai — Unit 1' }), setErrors({}), setFormOpen(true)))}
                          title={d.entry ? `${d.entry.dayType.replace('_', ' ').toLowerCase()} — ${d.entry.reason}` : `${d.hours} hours`}
                          className={cn(
                            'w-full rounded px-1 py-1 text-[10px] font-medium transition-colors',
                            d.hours === 0
                              ? 'bg-danger/10 text-danger hover:bg-danger/20'
                              : d.hours > 16
                                ? 'bg-warning/15 text-warning hover:bg-warning/25'
                                : 'bg-success/10 text-success hover:bg-success/20',
                          )}
                        >
                          <span className="block">{Number(d.date.slice(8, 10))}</span>
                          <span className="block text-[9px] font-normal opacity-80">{d.hours === 0 ? 'off' : `${d.hours}h`}</span>
                        </button>
                      </td>
                    ))}
                    <td className="text-right tabular text-xs font-medium">{w.workingDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <DataTable
        rows={[...rows].sort((a, b) => a.date.localeCompare(b.date))}
        columns={columns}
        rowKey={(c) => c.uid}
        searchPlaceholder="Search date, type or reason…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'production-calendar', 'Production calendar exceptions', columnsFromTable(columns), rows)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={openEdit}
        emptyTitle="No exceptions"
        emptyDescription="Every day follows the standing rule."
        rowActions={(c) => (
          <>
            <MenuItem label="Edit" onClick={() => openEdit(c)} />
            <MenuItem label="Delete" icon={<Trash2 />} danger separatorBefore onClick={() => setConfirmDelete(c)} />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${formatDate(editing.date)}` : 'Add a calendar exception'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Add exception'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Date" type="date" required value={form.date} error={errors.date} disabled={!!editing} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label="Day type" value={form.dayType} onChange={(e) => setType(e.target.value as CalendarDayType)} options={DAY_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ').toLowerCase() }))} />
          <Input label="Plant hours" type="number" min={0} max={24} value={form.hours} error={errors.hours} hint="Zero closes the plant for the day." onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          <Input label="Shifts" type="number" min={0} max={3} value={form.shifts} onChange={(e) => setForm({ ...form, shifts: e.target.value })} />
          <Input label="Reason" required containerClassName="sm:col-span-2" value={form.reason} error={errors.reason} placeholder="Ganesh Chaturthi" onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Select label="Plant" containerClassName="sm:col-span-2" value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })} options={['Chennai — Unit 1', 'Hosur — Unit 2'].map((p) => ({ value: p, label: p }))} />
        </div>

        <Alert tone={Number(form.hours) === 0 ? 'warning' : 'info'} className="mt-4">
          {Number(form.hours) === 0
            ? 'Closing this day pushes every operation scheduled across it out by a day and reduces that week’s available capacity.'
            : `${form.hours} hours makes this a ${Number(form.hours) > 16 ? 'longer than normal' : 'normal'} day. Capacity planning and the schedule board both re-compute immediately.`}
        </Alert>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete calendar exception"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${formatDate(confirmDelete.date)} goes back to the standing rule.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete && formatDate(confirmDelete.date)} reverts to the standing rule — open unless it is a Sunday.
          Schedules that ran across it will shift.
        </p>
      </Modal>
    </div>
  )
}
