import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { DueCell, EmployeeCell, HrStatusBadge, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { trainingProgrammes as seedProgrammes, trainingRecords as seedRecords } from '@/mock/hrms'
import type { TrainingProgramme, TrainingRecord } from '@/types/hrms'

const CATEGORY_LABEL: Record<string, string> = {
  MACHINE: 'Machine',
  SAFETY: 'Safety',
  QUALITY: 'Quality',
  PROCESS: 'Process',
  STATUTORY: 'Statutory',
  BEHAVIOURAL: 'Behavioural',
  INDUCTION: 'Induction',
}

const MODE_LABEL: Record<string, string> = {
  INTERNAL: 'Internal',
  EXTERNAL: 'External',
  ON_THE_JOB: 'On the job',
  ONLINE: 'Online',
}

const TABS = [
  { id: 'CALENDAR', label: 'Training calendar' },
  { id: 'RECORDS', label: 'Attendance & results' },
]

/**
 * Training calendar and records. Two things make training real rather than
 * ceremonial: an assessment score against a pass mark, and an effectiveness
 * review afterwards asking whether the number the training was meant to move
 * actually moved. Without the second, training is an expense with a certificate.
 */
export function TrainingPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeePay = useCanSeePay()
  const progSeed = useMemo(() => seedProgrammes, [])
  const recSeed = useMemo(() => seedRecords, [])

  const progCrud = useCrud<TrainingProgramme>({
    key: 'hrms:training-programme',
    seed: progSeed,
    entity: 'Training programme',
    titleOf: (p) => `${p.title} (${p.code})`,
    fields: [
      { name: 'code', label: 'Programme code', required: true, upper: true },
      { name: 'title', label: 'Title', required: true, span: 2 },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        name: 'mode',
        label: 'Mode',
        type: 'select',
        required: true,
        options: Object.entries(MODE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'trainer', label: 'Trainer', required: true },
      { name: 'durationHours', label: 'Duration (hours)', type: 'number', required: true },
      { name: 'scheduledOn', label: 'Scheduled on', type: 'date', required: true },
      { name: 'venue', label: 'Venue', required: true },
      { name: 'targetDepartment', label: 'Target department', required: true },
      { name: 'seats', label: 'Seats', type: 'number', required: true },
      { name: 'passMarkPct', label: 'Pass mark %', type: 'number', hint: 'Zero means attendance only, no assessment' },
      { name: 'certificationValidMonths', label: 'Certification valid (months)', type: 'number' },
      { name: 'costPerHead', label: 'Cost per head', type: 'number' },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? { enrolled: 0, attended: 0, status: 'PLANNED' as const }),
      code: v.code,
      title: v.title,
      category: v.category as TrainingProgramme['category'],
      mode: v.mode as TrainingProgramme['mode'],
      trainer: v.trainer,
      durationHours: Number(v.durationHours) || 0,
      scheduledOn: v.scheduledOn,
      venue: v.venue,
      targetDepartment: v.targetDepartment,
      seats: Number(v.seats) || 0,
      passMarkPct: Number(v.passMarkPct) || 0,
      certificationValidMonths: v.certificationValidMonths ? Number(v.certificationValidMonths) : null,
      costPerHead: Number(v.costPerHead) || 0,
    }),
    blockDelete: (p) =>
      p.attended > 0
        ? `${p.title} has ${p.attended} attendance record${p.attended === 1 ? '' : 's'} against it, some carrying certifications. Cancel it instead — deleting would erase people's training history.`
        : undefined,
  })

  const programmes = progCrud.rows
  const { rows: records, update: updateRecord } = useCollection<TrainingRecord>('hrms:training-record', recSeed)

  const [tab, setTab] = useState('CALENDAR')
  const [scoring, setScoring] = useState<TrainingRecord | null>(null)
  const [score, setScore] = useState('')
  const [reviewing, setReviewing] = useState<TrainingRecord | null>(null)
  const [effect, setEffect] = useState<NonNullable<TrainingRecord['effectivenessRating']>>('IMPROVED')

  const upcoming = programmes.filter((p) => p.status === 'PLANNED' || p.status === 'OPEN')
  const completed = programmes.filter((p) => p.status === 'COMPLETED')
  const underEnrolled = upcoming.filter((p) => p.enrolled < p.seats * 0.6)

  const expiringCerts = records.filter(
    (r) => r.certificationExpiresOn && new Date(r.certificationExpiresOn).getTime() - Date.now() < 60 * 86_400_000 && r.status !== 'EXPIRED',
  )
  const expiredCerts = records.filter((r) => r.status === 'EXPIRED')
  const notReviewed = records.filter((r) => r.status === 'PASSED' && r.effectivenessRating === 'NOT_REVIEWED')
  const totalCost = programmes.reduce((s, p) => s + p.costPerHead * p.attended, 0)

  const completionPct = programmes.length
    ? (programmes.reduce((s, p) => s + p.attended, 0) / Math.max(1, programmes.reduce((s, p) => s + p.enrolled, 0))) * 100
    : 0

  const progColumns: Column<TrainingProgramme>[] = [
    { key: 'code', header: 'Programme', sortable: true, width: '17rem', render: (p) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{p.title}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{p.code} · {p.trainer}</p>
      </div>
    ) },
    { key: 'category', header: 'Category', sortable: true, width: '9.5rem', render: (p) => (
      <Badge
        tone={p.category === 'SAFETY' || p.category === 'STATUTORY' ? 'danger' : p.category === 'MACHINE' ? 'brand' : 'neutral'}
        size="sm"
        dot={false}
      >
        {CATEGORY_LABEL[p.category]}
      </Badge>
    ) },
    { key: 'mode', header: 'Mode', sortable: true, width: '9rem', render: (p) => (
      <span className="text-2xs text-fg-muted">{MODE_LABEL[p.mode]}</span>
    ) },
    { key: 'scheduledOn', header: 'Scheduled', sortable: true, width: '10.5rem', accessor: (p) => p.scheduledOn, render: (p) => (
      <div className="min-w-0">
        <p className="text-xs text-fg">{formatDate(p.scheduledOn)}</p>
        <p className="truncate text-2xs text-fg-subtle">{p.durationHours} h · {p.venue}</p>
      </div>
    ) },
    { key: 'targetDepartment', header: 'For', sortable: true },
    { key: 'enrolled', header: 'Enrolled', width: '11rem', sortable: true, accessor: (p) => p.enrolled, render: (p) => (
      <div className="flex items-center gap-2">
        <ProgressBar
          value={p.seats ? (p.enrolled / p.seats) * 100 : 0}
          tone={p.enrolled >= p.seats * 0.8 ? 'success' : p.enrolled >= p.seats * 0.6 ? 'warning' : 'danger'}
          className="w-14"
        />
        <span className="text-2xs tabular text-fg-muted">{p.enrolled}/{p.seats}</span>
      </div>
    ) },
    { key: 'attended', header: 'Attended', align: 'right', width: '8.5rem', sortable: true, render: (p) => (
      p.status === 'COMPLETED'
        ? <span className={cn('tabular text-xs', p.attended < p.enrolled ? 'text-warning' : 'text-success')}>{p.attended}</span>
        : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'passMarkPct', header: 'Pass mark', align: 'right', width: '9rem', render: (p) => (
      p.passMarkPct ? <span className="tabular text-xs">{p.passMarkPct}%</span> : <span className="text-2xs text-fg-subtle">attendance only</span>
    ) },
    { key: 'certificationValidMonths', header: 'Certificate', width: '10rem', render: (p) => (
      p.certificationValidMonths
        ? <span className="text-2xs text-fg-muted">valid {p.certificationValidMonths} months</span>
        : <span className="text-2xs text-fg-subtle">none</span>
    ) },
    ...(canSeePay
      ? [{
          key: 'costPerHead', header: 'Cost per head', align: 'right' as const, sortable: true, width: '11rem',
          render: (p: TrainingProgramme) => (p.costPerHead ? formatCurrency(p.costPerHead) : <span className="text-2xs text-success">internal</span>),
        }]
      : []),
    { key: 'status', header: 'Status', sortable: true, width: '9.5rem', render: (p) => <HrStatusBadge status={p.status} size="sm" /> },
  ]

  const recColumns: Column<TrainingRecord>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (r) => (
      <EmployeeCell name={r.employeeName} code={r.employeeCode} sub={r.department} />
    ) },
    { key: 'programmeTitle', header: 'Programme', sortable: true, render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{r.programmeTitle}</p>
        <p className="font-mono text-2xs text-fg-subtle">{r.programmeCode}</p>
      </div>
    ) },
    { key: 'attendedOn', header: 'Attended', sortable: true, width: '10rem', accessor: (r) => r.attendedOn ?? '', render: (r) => (
      r.attendedOn ? (
        <div className="min-w-0">
          <p className="text-xs text-fg">{formatDate(r.attendedOn)}</p>
          <p className="text-2xs text-fg-subtle">{r.hoursAttended} h</p>
        </div>
      ) : (
        <span className="text-2xs text-fg-subtle">not yet</span>
      )
    ) },
    { key: 'assessmentScore', header: 'Score', align: 'right', width: '8rem', sortable: true, render: (r) => (
      r.assessmentScore === null
        ? <span className="text-2xs text-fg-subtle">—</span>
        : <span className={cn('tabular text-xs font-medium', r.passed ? 'text-success' : 'text-danger')}>{r.assessmentScore}</span>
    ) },
    { key: 'certificateNo', header: 'Certificate', sortable: true, width: '12rem', render: (r) => (
      r.certificateNo ? <span className="font-mono text-2xs text-fg">{r.certificateNo}</span> : <span className="text-2xs text-fg-subtle">none issued</span>
    ) },
    { key: 'certificationExpiresOn', header: 'Expires', sortable: true, width: '10rem', accessor: (r) => r.certificationExpiresOn ?? '', render: (r) => (
      r.certificationExpiresOn ? <DueCell date={r.certificationExpiresOn} /> : <span className="text-2xs text-fg-subtle">no expiry</span>
    ) },
    { key: 'effectivenessRating', header: 'Did it work', width: '13rem', render: (r) => {
      if (r.status !== 'PASSED' && r.status !== 'ATTENDED' && r.status !== 'EXPIRED') return <span className="text-2xs text-fg-subtle">—</span>
      if (!r.effectivenessRating || r.effectivenessRating === 'NOT_REVIEWED') {
        return <Badge tone="warning" size="sm">not reviewed</Badge>
      }
      return (
        <div className="min-w-0">
          <Badge tone={r.effectivenessRating === 'SIGNIFICANT' ? 'success' : r.effectivenessRating === 'IMPROVED' ? 'brand' : 'danger'} size="sm" dot={false}>
            {r.effectivenessRating.replace(/_/g, ' ').toLowerCase()}
          </Badge>
          {r.effectivenessReviewedOn && <p className="mt-0.5 text-2xs text-fg-subtle">{formatDate(r.effectivenessReviewedOn)}</p>}
        </div>
      )
    } },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (r) => <HrStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'CALENDAR'
          ? exportRows(format, 'training-calendar', 'Training calendar', columnsFromTable(progColumns), programmes)
          : exportRows(format, 'training-records', 'Training records', columnsFromTable(recColumns), records)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Training"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Training' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/skills')}>Skill matrix</Button>
            {tab === 'CALENDAR' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => progCrud.openCreate({ category: 'MACHINE', mode: 'INTERNAL', seats: '12', passMarkPct: '70', certificationValidMonths: '24', scheduledOn: new Date().toISOString().slice(0, 10) })}
              >
                Schedule training
              </Button>
            )}
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg tabular">{upcoming.length}</span> programmes upcoming ·{' '}
        <span className="font-medium text-fg tabular">{completionPct.toFixed(0)}%</span> completion against enrolment
        {canSeePay && <> · <span className="font-medium text-fg tabular">{formatCurrency(totalCost)}</span> spent</>}
        {expiredCerts.length > 0 && <> · <span className="font-medium text-danger">{expiredCerts.length}</span> certification{expiredCerts.length === 1 ? '' : 's'} expired</>}
      </p>

      {(expiredCerts.length > 0 || expiringCerts.length > 0 || underEnrolled.length > 0 || notReviewed.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Needs attention" description="Expired certification is the one that stops somebody working" />
          <CardBody className="space-y-2">
            {expiredCerts.map((r) => (
              <div key={r.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {r.employeeName} — {r.programmeTitle} certification expired
                  </p>
                  <p className="text-2xs text-fg-muted">
                    Expired {r.certificationExpiresOn ? formatDate(r.certificationExpiresOn) : ''}. For a safety or statutory
                    programme this means they should not be on that operation until it is renewed.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/hrms/skills')}>Check the skill matrix</Button>
              </div>
            ))}
            {expiringCerts.map((r) => (
              <div key={r.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">{r.employeeName} — {r.programmeTitle}</p>
                  <p className="text-2xs text-fg-muted">
                    Certification expires {r.certificationExpiresOn ? formatDate(r.certificationExpiresOn) : ''} — book the
                    refresher now rather than after it lapses.
                  </p>
                </div>
              </div>
            ))}
            {underEnrolled.map((p) => (
              <div key={p.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">{p.title} is under-enrolled</p>
                  <p className="text-2xs text-fg-muted">
                    {p.enrolled} of {p.seats} seats taken for {formatDate(p.scheduledOn)}
                    {canSeePay && p.costPerHead > 0 && ` · an external trainer is usually charged on seats booked, not seats used`}
                  </p>
                </div>
              </div>
            ))}
            {notReviewed.length > 0 && (
              <div className="rounded border border-border bg-surface-2 p-2.5">
                <p className="text-xs font-medium text-fg">
                  {notReviewed.length} passed record{notReviewed.length === 1 ? '' : 's'} with no effectiveness review
                </p>
                <p className="text-2xs text-fg-muted">
                  Training without an effectiveness review is an expense with a certificate. The review asks one question: did the
                  number this was meant to move actually move?
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'CALENDAR' ? (
        <DataTable
          rows={programmes}
          columns={progColumns}
          rowKey={(p) => p.uid}
          searchPlaceholder="Search programme, trainer, category or department…"
          onExport={doExport}
          emptyTitle="No training programmes"
          rowClassName={(p) => cn(
            p.status === 'CANCELLED' && 'opacity-60',
            (p.status === 'PLANNED' || p.status === 'OPEN') && p.enrolled < p.seats * 0.6 && 'bg-warning/[0.03]',
            (p.category === 'SAFETY' || p.category === 'STATUTORY') && 'bg-danger/[0.02]',
          )}
          rowActions={(p) => (
            <>
              <MenuItem label="Edit the programme" onClick={() => progCrud.openEdit(p)} />
              <MenuItem label="Delete the programme" danger onClick={() => progCrud.askDelete(p)} />
              <MenuItem
                separatorBefore
                label="Open enrolment"
                disabled={p.status !== 'PLANNED'}
                onClick={() => {
                  progCrud.update(p.uid, { status: 'OPEN' })
                  toast.success('Enrolment open', `${p.title} is open for ${p.seats} seats. Supervisors can now nominate their people.`)
                }}
              />
              <MenuItem
                label="Mark completed"
                disabled={p.status !== 'OPEN' && p.status !== 'IN_PROGRESS'}
                onClick={() => {
                  progCrud.update(p.uid, { status: 'COMPLETED', attended: p.enrolled })
                  toast.success(
                    'Training completed',
                    `${p.title} closed with ${p.enrolled} attendees. ${p.passMarkPct ? 'Record the assessment scores next — a certificate is only issued above the pass mark.' : 'No assessment for this programme, so attendance is the record.'}`,
                  )
                }}
              />
              <MenuItem label="See attendance & results" onClick={() => setTab('RECORDS')} />
              <MenuItem
                separatorBefore
                label="Cancel the programme"
                danger
                disabled={p.status === 'COMPLETED' || p.status === 'CANCELLED'}
                onClick={() => {
                  progCrud.update(p.uid, { status: 'CANCELLED' })
                  toast.success('Programme cancelled', `${p.title} cancelled. Anybody enrolled is notified.`)
                }}
              />
            </>
          )}
        />
      ) : (
        <DataTable
          rows={records}
          columns={recColumns}
          rowKey={(r) => r.uid}
          searchPlaceholder="Search employee, programme or department…"
          onExport={doExport}
          emptyTitle="No training records"
          rowClassName={(r) => cn(
            r.status === 'FAILED' && 'bg-danger/[0.04]',
            r.status === 'EXPIRED' && 'bg-danger/[0.05]',
            r.status === 'ABSENT' && 'bg-warning/[0.04]',
          )}
          rowActions={(r) => (
            <>
              <MenuItem
                label="Edit — record the score"
                onClick={() => { setScoring(r); setScore(String(r.assessmentScore ?? '')) }}
              />
              <MenuItem
                label="Delete the record"
                danger
                disabled={!!r.certificateNo}
                onClick={() => {
                  updateRecord(r.uid, { status: 'ENROLLED', attendedOn: null, hoursAttended: 0, assessmentScore: null, passed: null })
                  toast.success('Record cleared', `${r.employeeName}'s attendance for ${r.programmeTitle} has been reset to enrolled.`)
                }}
              />
              <MenuItem
                separatorBefore
                label="Mark attended"
                disabled={r.status !== 'ENROLLED'}
                onClick={() => {
                  const prog = programmes.find((p) => p.code === r.programmeCode)
                  updateRecord(r.uid, {
                    status: 'ATTENDED',
                    attendedOn: new Date().toISOString().slice(0, 10),
                    hoursAttended: prog?.durationHours ?? 0,
                  })
                  toast.success('Attendance recorded', `${r.employeeName} attended ${r.programmeTitle}.`)
                }}
              />
              <MenuItem
                label="Record the assessment score"
                disabled={r.status === 'ENROLLED' || r.status === 'ABSENT'}
                onClick={() => { setScoring(r); setScore(String(r.assessmentScore ?? '')) }}
              />
              <MenuItem
                label="Review the effectiveness"
                disabled={r.status !== 'PASSED' && r.status !== 'EXPIRED'}
                onClick={() => { setReviewing(r); setEffect(r.effectivenessRating && r.effectivenessRating !== 'NOT_REVIEWED' ? r.effectivenessRating : 'IMPROVED') }}
              />
              <MenuItem label="Open the skill matrix" onClick={() => navigate('/hrms/skills')} />
            </>
          )}
        />
      )}

      {/* Assessment score --------------------------------------------------- */}
      <Modal
        open={!!scoring}
        onClose={() => setScoring(null)}
        title={scoring ? `Assessment — ${scoring.employeeName}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setScoring(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!scoring) return
                const val = Number(score)
                if (Number.isNaN(val) || val < 0 || val > 100) {
                  toast.error('Score is out of 100', 'Enter a value between 0 and 100.')
                  return
                }
                const prog = programmes.find((p) => p.code === scoring.programmeCode)
                const pass = val >= (prog?.passMarkPct ?? 0)
                const months = prog?.certificationValidMonths ?? null
                const expires = pass && months ? new Date(Date.now() + months * 30 * 86_400_000).toISOString().slice(0, 10) : null
                updateRecord(scoring.uid, {
                  assessmentScore: val,
                  passed: pass,
                  status: pass ? 'PASSED' : 'FAILED',
                  certificateNo: pass && months ? `CERT/${scoring.programmeCode.split('-')[1] ?? 'GEN'}/${String(400 + records.indexOf(scoring)).padStart(4, '0')}` : null,
                  certificationExpiresOn: expires,
                  effectivenessRating: pass ? 'NOT_REVIEWED' : null,
                })
                toast.success(
                  pass ? 'Passed' : 'Failed',
                  pass
                    ? `${scoring.employeeName} scored ${val} against a pass mark of ${prog?.passMarkPct}${expires ? `. Certificate issued, valid to ${formatDate(expires)}` : ''}.`
                    : `${scoring.employeeName} scored ${val} against a pass mark of ${prog?.passMarkPct}. No certificate is issued, and the skill matrix is not updated — they need the programme again.`,
                )
                setScoring(null)
              }}
            >
              Record score
            </Button>
          </>
        }
      >
        {scoring && (() => {
          const prog = programmes.find((p) => p.code === scoring.programmeCode)
          return (
            <div className="space-y-3.5">
              <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                <p className="font-medium text-fg">{scoring.programmeTitle}</p>
                <p className="mt-1 text-fg-muted">
                  {prog ? `${prog.durationHours} h · pass mark ${prog.passMarkPct}%` : ''}
                  {prog?.certificationValidMonths ? ` · certificate valid ${prog.certificationValidMonths} months` : ' · no certificate'}
                </p>
              </div>
              <Input
                label="Assessment score (out of 100)"
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                hint={`Below ${prog?.passMarkPct ?? 0} no certificate is issued and the skill matrix stays unchanged`}
              />
            </div>
          )
        })()}
      </Modal>

      {/* Effectiveness review ---------------------------------------------- */}
      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={reviewing ? `Did it work — ${reviewing.employeeName}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!reviewing) return
                updateRecord(reviewing.uid, {
                  effectivenessRating: effect,
                  effectivenessReviewedOn: new Date().toISOString().slice(0, 10),
                })
                toast.success(
                  'Effectiveness recorded',
                  effect === 'NO_CHANGE'
                    ? `${reviewing.programmeTitle} produced no measurable change for ${reviewing.employeeName}. Worth asking whether the programme or the trainer is the problem before booking it again.`
                    : `${reviewing.programmeTitle} recorded as ${effect.toLowerCase()} for ${reviewing.employeeName}. This is what justifies running it again.`,
                )
                setReviewing(null)
              }}
            >
              Record
            </Button>
          </>
        }
      >
        {reviewing && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{reviewing.programmeTitle}</p>
              <p className="mt-1 text-fg-muted">
                {reviewing.employeeName} attended {reviewing.attendedOn ? formatDate(reviewing.attendedOn) : ''} and scored{' '}
                {reviewing.assessmentScore}. The question now is whether their actual work changed.
              </p>
            </div>
            <Select
              label="Effect on the measure this training targeted"
              value={effect}
              onChange={(e) => setEffect(e.target.value as typeof effect)}
              options={[
                { value: 'SIGNIFICANT', label: 'Significant improvement' },
                { value: 'IMPROVED', label: 'Some improvement' },
                { value: 'NO_CHANGE', label: 'No measurable change' },
              ]}
              hint="For a welding programme this is the operator's defect rate; for safety it is incidents and near misses"
            />
          </div>
        )}
      </Modal>

      {progCrud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Training that counts, and training that only looks like it" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">An assessment with a pass mark.</span> Below it, no certificate and no change to
            the skill matrix — so the person still cannot be rostered onto the operation alone. Attendance alone proves nothing.
          </p>
          <p>
            <span className="font-medium text-fg">An expiry date.</span> Safety and statutory certification lapses. A plant with
            expired fire training is non-compliant whether or not anybody has noticed.
          </p>
          <p>
            <span className="font-medium text-fg">An effectiveness review.</span> Six weeks later, did the defect rate move? That
            single question separates a training budget from a training programme.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
