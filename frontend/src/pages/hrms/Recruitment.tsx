import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { HrStatusBadge, PayCell, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { candidates as seedCandidates, requisitions as seedReq } from '@/mock/hrms'
import type { Candidate, CandidateStage, ManpowerRequisition } from '@/types/hrms'

const SOURCE_LABEL: Record<string, string> = {
  REFERRAL: 'Referral',
  JOB_PORTAL: 'Job portal',
  WALK_IN: 'Walk-in',
  CAMPUS: 'Campus',
  CONSULTANT: 'Consultant',
  INTERNAL: 'Internal',
}

/** The pipeline in order, with the columns the board draws. */
const PIPELINE: { stage: CandidateStage; label: string }[] = [
  { stage: 'APPLIED', label: 'Applied' },
  { stage: 'SCREENING', label: 'Screening' },
  { stage: 'INTERVIEW_1', label: 'Interview 1' },
  { stage: 'INTERVIEW_2', label: 'Interview 2' },
  { stage: 'PRACTICAL_TEST', label: 'Practical' },
  { stage: 'SELECTED', label: 'Selected' },
  { stage: 'OFFERED', label: 'Offered' },
  { stage: 'JOINED', label: 'Joined' },
]

const PRACTICAL_PASS_MARK = 60

const TABS = [
  { id: 'BOARD', label: 'Pipeline board' },
  { id: 'LIST', label: 'All candidates' },
]

/**
 * Candidate pipeline — application through to joining. For a shop-floor hire the
 * practical test is the gate that actually matters: an interview tells you
 * whether somebody can describe deep drawing, and the practical tells you
 * whether they can do it. A candidate cannot be selected below the pass mark.
 */
export function RecruitmentPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeePay = useCanSeePay()
  const seed = useMemo(() => seedCandidates, [])
  const reqSeed = useMemo(() => seedReq, [])

  const crud = useCrud<Candidate>({
    key: 'hrms:candidate',
    seed,
    entity: 'Candidate',
    titleOf: (c) => `${c.fullName} (${c.candidateNo})`,
    fields: [
      { name: 'candidateNo', label: 'Candidate number', required: true, readOnly: true },
      { name: 'fullName', label: 'Full name', required: true },
      { name: 'requisitionNo', label: 'Against requisition', required: true },
      { name: 'designation', label: 'Applying for', required: true },
      { name: 'department', label: 'Department', required: true },
      {
        name: 'source',
        label: 'Source',
        type: 'select',
        required: true,
        options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'appliedOn', label: 'Applied on', type: 'date', required: true },
      { name: 'experienceYears', label: 'Experience (years)', type: 'number' },
      { name: 'currentCtc', label: 'Current CTC (monthly)', type: 'number' },
      { name: 'expectedCtc', label: 'Expected CTC (monthly)', type: 'number' },
      { name: 'mobile', label: 'Mobile', type: 'tel', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'interviewScore', label: 'Interview score', type: 'number' },
      { name: 'practicalScore', label: 'Practical score', type: 'number', hint: `Pass mark is ${PRACTICAL_PASS_MARK}` },
      { name: 'panelRemarks', label: 'Panel remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        candidateNo: v.candidateNo,
        stage: 'APPLIED' as CandidateStage,
        offeredCtc: null,
        offerIssuedOn: null,
        joiningDate: null,
        rejectionReason: null,
      }),
      fullName: v.fullName,
      requisitionNo: v.requisitionNo,
      designation: v.designation,
      department: v.department,
      source: v.source as Candidate['source'],
      appliedOn: v.appliedOn,
      experienceYears: Number(v.experienceYears) || 0,
      currentCtc: v.currentCtc ? Number(v.currentCtc) : null,
      expectedCtc: v.expectedCtc ? Number(v.expectedCtc) : null,
      mobile: v.mobile,
      email: v.email,
      interviewScore: v.interviewScore ? Number(v.interviewScore) : null,
      practicalScore: v.practicalScore ? Number(v.practicalScore) : null,
      panelRemarks: v.panelRemarks || null,
    }),
    blockDelete: (c) =>
      c.stage === 'JOINED'
        ? `${c.fullName} has joined. The employee record references this candidate, so the recruitment history stays.`
        : undefined,
  })

  const candidates = crud.rows
  const { rows: requisitions, update: updateReq } = useCollection<ManpowerRequisition>('hrms:requisition', reqSeed)

  const [tab, setTab] = useState('BOARD')
  const [requisition, setRequisition] = useState('all')
  const [offering, setOffering] = useState<Candidate | null>(null)
  const [offer, setOffer] = useState({ ctc: '', joining: '' })
  const [scoring, setScoring] = useState<Candidate | null>(null)
  const [scores, setScores] = useState({ interview: '', practical: '', remarks: '' })

  const reqNos = [...new Set(candidates.map((c) => c.requisitionNo))]
  const visible = candidates.filter((c) => (requisition === 'all' ? true : c.requisitionNo === requisition))

  const live = visible.filter((c) => !['JOINED', 'REJECTED', 'DECLINED'].includes(c.stage))
  const joined = visible.filter((c) => c.stage === 'JOINED')
  const declined = visible.filter((c) => c.stage === 'DECLINED')

  /**
   * Acceptance rate is measured over offers actually issued — accepted or joined
   * against everyone who was ever sent an offer. Counting candidates still in
   * interview would flatter the number.
   */
  const offersIssued = visible.filter((c) => c.offerIssuedOn)
  const offersAccepted = offersIssued.filter((c) => c.stage === 'OFFER_ACCEPTED' || c.stage === 'JOINED')
  const offerAcceptance = offersIssued.length ? (offersAccepted.length / offersIssued.length) * 100 : 0

  /** Shop-floor posts need the practical; office posts do not have one. */
  const needsPractical = (c: Candidate) =>
    /operator|welder|polish|packing|driver|technician/i.test(c.designation)

  const columns: Column<Candidate>[] = [
    { key: 'candidateNo', header: 'Candidate', sortable: true, width: '13rem', render: (c) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{c.fullName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{c.candidateNo}</p>
      </div>
    ) },
    { key: 'designation', header: 'Applying for', sortable: true, render: (c) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{c.designation}</p>
        <p className="truncate text-2xs text-fg-subtle">{c.department} · {c.requisitionNo}</p>
      </div>
    ) },
    { key: 'source', header: 'Source', sortable: true, width: '9rem', render: (c) => (
      <Badge tone={c.source === 'REFERRAL' ? 'success' : c.source === 'CONSULTANT' ? 'warning' : 'neutral'} size="sm" dot={false}>
        {SOURCE_LABEL[c.source]}
      </Badge>
    ) },
    { key: 'experienceYears', header: 'Experience', align: 'right', width: '8rem', sortable: true, render: (c) => (
      <span className="tabular text-xs">{c.experienceYears} yr</span>
    ) },
    { key: 'interviewScore', header: 'Interview', align: 'right', width: '7.5rem', sortable: true, render: (c) => (
      c.interviewScore === null
        ? <span className="text-2xs text-fg-subtle">—</span>
        : <span className={cn('tabular text-xs', c.interviewScore >= 70 ? 'text-success' : 'text-warning')}>{c.interviewScore}</span>
    ) },
    { key: 'practicalScore', header: 'Practical', align: 'right', width: '8rem', sortable: true, render: (c) => {
      if (!needsPractical(c)) return <span className="text-2xs text-fg-subtle">not applicable</span>
      if (c.practicalScore === null) return <span className="text-2xs text-warning">not tested</span>
      return (
        <span className={cn('tabular text-xs font-medium', c.practicalScore >= PRACTICAL_PASS_MARK ? 'text-success' : 'text-danger')}>
          {c.practicalScore}
        </span>
      )
    } },
    ...(canSeePay
      ? [
          { key: 'expectedCtc', header: 'Expected', align: 'right' as const, sortable: true, width: '9rem', render: (c: Candidate) => <PayCell amount={c.expectedCtc} /> },
          { key: 'offeredCtc', header: 'Offered', align: 'right' as const, sortable: true, width: '9rem', render: (c: Candidate) => <PayCell amount={c.offeredCtc} bold /> },
        ]
      : []),
    { key: 'appliedOn', header: 'Applied', sortable: true, width: '8.5rem', accessor: (c) => c.appliedOn, render: (c) => (
      <div className="min-w-0">
        <p className="text-xs text-fg">{formatDate(c.appliedOn)}</p>
        <p className="text-2xs text-fg-subtle">
          {Math.round((Date.now() - new Date(c.appliedOn).getTime()) / 86_400_000)} d in pipeline
        </p>
      </div>
    ) },
    { key: 'joiningDate', header: 'Joining', sortable: true, width: '9rem', accessor: (c) => c.joiningDate ?? '', render: (c) => (
      c.joiningDate ? <span className="text-xs">{formatDate(c.joiningDate)}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'panelRemarks', header: 'Panel remarks', render: (c) => (
      c.panelRemarks ? <span className="text-2xs text-fg-muted">{c.panelRemarks}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'stage', header: 'Stage', sortable: true, width: '10rem', render: (c) => <HrStatusBadge status={c.stage} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'candidate-pipeline', 'Candidate pipeline', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Move a candidate on one stage, enforcing the practical-test gate. */
  function advance(c: Candidate) {
    const idx = PIPELINE.findIndex((p) => p.stage === c.stage)
    const next = PIPELINE[idx + 1]
    if (!next) return

    if (next.stage === 'SELECTED' && needsPractical(c)) {
      if (c.practicalScore === null) {
        toast.error(
          'Practical test not recorded',
          `${c.fullName} is applying for a ${c.designation.toLowerCase()}. Record the practical score before selecting — an interview alone does not show whether somebody can run the machine.`,
        )
        return
      }
      if (c.practicalScore < PRACTICAL_PASS_MARK) {
        toast.error(
          'Below the practical pass mark',
          `${c.fullName} scored ${c.practicalScore} against a pass mark of ${PRACTICAL_PASS_MARK}. Selecting anyway would put an uncertified operator on a critical machine.`,
        )
        return
      }
    }

    if (next.stage === 'OFFERED') {
      setOffering(c)
      setOffer({ ctc: String(c.expectedCtc ?? ''), joining: '' })
      return
    }

    crud.update(c.uid, { stage: next.stage })
    toast.success('Moved on', `${c.fullName} is now at ${next.label.toLowerCase()}.`)
  }

  return (
    <div>
      <PageHeader
        title="Recruitment"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Recruitment' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/requisitions')}>Requisitions</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({
                candidateNo: `CND/2627/${String(197 + candidates.length).padStart(4, '0')}`,
                source: 'WALK_IN',
                appliedOn: new Date().toISOString().slice(0, 10),
                requisitionNo: reqNos[0] ?? '',
              })}
            >
              Add a candidate
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-56"
          value={requisition}
          onChange={(e) => setRequisition(e.target.value)}
          options={[{ value: 'all', label: 'All requisitions' }, ...reqNos.map((r) => ({ value: r, label: r }))]}
        />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg tabular">{live.length}</span> live in the pipeline ·{' '}
          <span className="font-medium text-success tabular">{joined.length}</span> joined ·{' '}
          offer acceptance <span className={cn('font-medium tabular', offerAcceptance >= 70 ? 'text-success' : 'text-warning')}>{offerAcceptance.toFixed(0)}%</span>
          {declined.length > 0 && <>, <span className="font-medium text-danger">{declined.length}</span> declined</>}
        </p>
      </div>

      {tab === 'BOARD' ? (
        <Card>
          <CardHeader
            title="Pipeline"
            description="Practical test before selection for any shop-floor post — the gate is enforced, not advisory"
          />
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE.map((col) => {
                const inCol = visible.filter((c) => c.stage === col.stage)
                return (
                  <div key={col.stage} className="rounded-lg border border-border bg-surface-2/50 p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{col.label}</p>
                      <span className="rounded bg-surface-3 px-1.5 text-2xs tabular text-fg-muted">{inCol.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {inCol.map((c) => (
                        <div key={c.uid} className="rounded border border-border bg-surface p-2">
                          <p className="truncate text-xs font-medium text-fg">{c.fullName}</p>
                          <p className="truncate text-2xs text-fg-subtle">
                            {c.designation} · {c.experienceYears} yr
                          </p>
                          {needsPractical(c) && c.practicalScore !== null && (
                            <p className={cn('mt-0.5 text-2xs', c.practicalScore >= PRACTICAL_PASS_MARK ? 'text-success' : 'text-danger')}>
                              practical {c.practicalScore}
                            </p>
                          )}
                          <div className="mt-1.5 flex gap-1">
                            <Button variant="outline" size="sm" className="h-6 px-1.5 text-2xs" onClick={() => advance(c)}>
                              Move on
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-2xs"
                              onClick={() => { setScoring(c); setScores({ interview: String(c.interviewScore ?? ''), practical: String(c.practicalScore ?? ''), remarks: c.panelRemarks ?? '' }) }}
                            >
                              Score
                            </Button>
                          </div>
                        </div>
                      ))}
                      {inCol.length === 0 && <p className="py-2 text-center text-2xs text-fg-subtle">empty</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>
      ) : (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(c) => c.uid}
          searchPlaceholder="Search candidate, designation, requisition or source…"
          onExport={doExport}
          emptyTitle="No candidates"
          rowClassName={(c) => cn(
            c.stage === 'REJECTED' || c.stage === 'DECLINED' ? 'opacity-60' : '',
            c.stage === 'OFFER_ACCEPTED' && 'bg-success/[0.04]',
            needsPractical(c) && c.practicalScore !== null && c.practicalScore < PRACTICAL_PASS_MARK && 'bg-danger/[0.04]',
          )}
          rowActions={(c) => (
            <>
              <MenuItem label="Edit the candidate" onClick={() => crud.openEdit(c)} />
              <MenuItem label="Delete the candidate" danger onClick={() => crud.askDelete(c)} />
              <MenuItem
                separatorBefore
                label="Record interview & practical scores"
                onClick={() => { setScoring(c); setScores({ interview: String(c.interviewScore ?? ''), practical: String(c.practicalScore ?? ''), remarks: c.panelRemarks ?? '' }) }}
              />
              <MenuItem
                label="Move to the next stage"
                disabled={['JOINED', 'REJECTED', 'DECLINED'].includes(c.stage)}
                onClick={() => advance(c)}
              />
              <MenuItem
                label="Mark joined"
                disabled={c.stage !== 'OFFER_ACCEPTED'}
                onClick={() => {
                  crud.update(c.uid, { stage: 'JOINED', joiningDate: new Date().toISOString().slice(0, 10) })
                  const req = requisitions.find((r) => r.docNo === c.requisitionNo)
                  if (req) {
                    const filled = req.filledPositions + 1
                    updateReq(req.uid, {
                      filledPositions: filled,
                      status: filled >= req.positions ? 'CLOSED' : 'IN_PROGRESS',
                    })
                  }
                  toast.success(
                    'Joined',
                    `${c.fullName} joined as ${c.designation}. ${c.requisitionNo} now shows one more position filled — create the employee record next.`,
                  )
                  navigate('/hrms/employees')
                }}
              />
              <MenuItem
                separatorBefore
                label="Reject the candidate"
                danger
                disabled={['JOINED', 'REJECTED', 'DECLINED'].includes(c.stage)}
                onClick={() => {
                  const reason =
                    needsPractical(c) && c.practicalScore !== null && c.practicalScore < PRACTICAL_PASS_MARK
                      ? `Practical test score ${c.practicalScore} against a pass mark of ${PRACTICAL_PASS_MARK}`
                      : 'Not selected by the panel'
                  crud.update(c.uid, { stage: 'REJECTED', rejectionReason: reason })
                  toast.success('Candidate rejected', `${c.fullName} rejected — ${reason.toLowerCase()}.`)
                }}
              />
            </>
          )}
        />
      )}

      {/* Scores ------------------------------------------------------------ */}
      <Modal
        open={!!scoring}
        onClose={() => setScoring(null)}
        title={scoring ? `Scores — ${scoring.fullName}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setScoring(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!scoring) return
                const iv = scores.interview ? Number(scores.interview) : null
                const pr = scores.practical ? Number(scores.practical) : null
                if ((iv !== null && (iv < 0 || iv > 100)) || (pr !== null && (pr < 0 || pr > 100))) {
                  toast.error('Scores are out of 100', 'Enter a value between 0 and 100.')
                  return
                }
                crud.update(scoring.uid, {
                  interviewScore: iv,
                  practicalScore: pr,
                  panelRemarks: scores.remarks.trim() || null,
                })
                toast.success(
                  'Scores recorded',
                  pr !== null && pr < PRACTICAL_PASS_MARK
                    ? `${scoring.fullName} is below the practical pass mark, so they cannot be selected without the mark being reconsidered.`
                    : `Scores saved against ${scoring.fullName}.`,
                )
                setScoring(null)
              }}
            >
              Save scores
            </Button>
          </>
        }
      >
        {scoring && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{scoring.fullName} — {scoring.designation}</p>
              <p className="mt-1 text-fg-muted">
                {scoring.experienceYears} years' experience, from {SOURCE_LABEL[scoring.source].toLowerCase()}
                {canSeePay && scoring.expectedCtc ? ` · expects ₹${scoring.expectedCtc.toLocaleString('en-IN')}` : ''}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Interview score (out of 100)" type="number" value={scores.interview} onChange={(e) => setScores({ ...scores, interview: e.target.value })} />
              <Input
                label={needsPractical(scoring) ? `Practical score (pass mark ${PRACTICAL_PASS_MARK})` : 'Practical score (not applicable)'}
                type="number"
                value={scores.practical}
                onChange={(e) => setScores({ ...scores, practical: e.target.value })}
                hint={needsPractical(scoring) ? 'A shop-floor hire cannot be selected below the pass mark' : 'This post has no practical component'}
              />
            </div>
            <Textarea label="Panel remarks" rows={3} value={scores.remarks} onChange={(e) => setScores({ ...scores, remarks: e.target.value })} placeholder="Strong on buffing wheel setup. Will need two weeks alongside a trainer before running solo." />
          </div>
        )}
      </Modal>

      {/* Offer ------------------------------------------------------------- */}
      <Modal
        open={!!offering}
        onClose={() => setOffering(null)}
        title={offering ? `Offer — ${offering.fullName}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setOffering(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!offering) return
                const ctc = Number(offer.ctc)
                if (!ctc || ctc <= 0) {
                  toast.error('Enter the offered CTC', 'The offer letter cannot be issued without it.')
                  return
                }
                if (!offer.joining) {
                  toast.error('Enter a joining date', 'The requisition is tracked against a required-by date, so the joining date matters.')
                  return
                }
                const req = requisitions.find((r) => r.docNo === offering.requisitionNo)
                if (req && ctc > req.budgetedCtc * 1.1) {
                  toast.error(
                    'Above the approved budget',
                    `${offering.requisitionNo} was approved at ₹${req.budgetedCtc.toLocaleString('en-IN')} a month. An offer of ₹${ctc.toLocaleString('en-IN')} is more than 10% over — the requisition needs re-approval at the higher figure first.`,
                  )
                  return
                }
                crud.update(offering.uid, {
                  stage: 'OFFERED',
                  offeredCtc: ctc,
                  offerIssuedOn: new Date().toISOString().slice(0, 10),
                  joiningDate: offer.joining,
                })
                toast.success(
                  'Offer issued',
                  `${offering.fullName} offered ₹${ctc.toLocaleString('en-IN')} a month with a joining date of ${formatDate(offer.joining)}.`,
                )
                setOffering(null)
              }}
            >
              Issue the offer
            </Button>
          </>
        }
      >
        {offering && (() => {
          const req = requisitions.find((r) => r.docNo === offering.requisitionNo)
          return (
            <div className="space-y-3.5">
              <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                <p className="font-medium text-fg">{offering.fullName} — {offering.designation}</p>
                <p className="mt-1 text-fg-muted">
                  Interview {offering.interviewScore ?? '—'}
                  {needsPractical(offering) && ` · practical ${offering.practicalScore ?? 'not tested'}`}
                  {canSeePay && offering.currentCtc ? ` · currently on ₹${offering.currentCtc.toLocaleString('en-IN')}` : ''}
                </p>
              </div>
              {canSeePay && req && (
                <p className="rounded border border-border p-2.5 text-2xs text-fg-muted">
                  {offering.requisitionNo} was approved at{' '}
                  <span className="font-medium text-fg">₹{req.budgetedCtc.toLocaleString('en-IN')}</span> a month. Anything more
                  than 10% above that needs the requisition re-approved, because it changes the payroll commitment that was signed off.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Offered monthly CTC" type="number" value={offer.ctc} onChange={(e) => setOffer({ ...offer, ctc: e.target.value })} />
                <Input label="Joining date" type="date" value={offer.joining} onChange={(e) => setOffer({ ...offer, joining: e.target.value })} />
              </div>
            </div>
          )
        })()}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why the practical test is a hard gate" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">An interview tests description, not skill.</span> A candidate can explain deep
            drawing convincingly and still not be able to set a die. On a critical machine that difference is scrap and injury.
          </p>
          <p>
            <span className="font-medium text-fg">It protects the operator too.</span> Somebody placed on a machine they cannot
            run gets blamed for the output. The test is the honest place to find that out.
          </p>
          <p>
            <span className="font-medium text-fg">It links to the skill matrix.</span> A practical score becomes the first
            certification entry, which is what decides whether they can be rostered onto the operation alone.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
