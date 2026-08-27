import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Textarea } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import {
  DueCell,
  EMPLOYMENT_TYPE_LABEL,
  HrStatusBadge,
  PayCell,
  useCanSeePay,
} from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { candidates as seedCandidates, orgNodes as seedOrg, requisitions as seedReq } from '@/mock/hrms'
import type { Candidate, EmploymentType, ManpowerRequisition, OrgNode } from '@/types/hrms'

const REASON_LABEL: Record<string, string> = {
  REPLACEMENT: 'Replacement',
  EXPANSION: 'Expansion',
  NEW_LINE: 'New line',
  SEASONAL: 'Seasonal',
  SKILL_GAP: 'Skill gap',
}

const TABS = [
  { id: 'OPEN', label: 'Open' },
  { id: 'APPROVAL', label: 'Awaiting approval' },
  { id: 'CLOSED', label: 'Closed' },
  { id: 'ALL', label: 'All' },
]

/**
 * Manpower requisitions — a request for a head, with the sanction check that
 * makes it arguable. A replacement against an existing vacancy is routine; a new
 * post that pushes a department past its sanctioned strength is a budget
 * decision, and this screen says which one you are looking at.
 */
export function RequisitionsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeePay = useCanSeePay()
  const seed = useMemo(() => seedReq, [])
  const orgSeed = useMemo(() => seedOrg, [])
  const candSeed = useMemo(() => seedCandidates, [])

  const crud = useCrud<ManpowerRequisition>({
    key: 'hrms:requisition',
    seed,
    entity: 'Requisition',
    titleOf: (r) => r.docNo,
    fields: [
      { name: 'docNo', label: 'Requisition number', required: true, readOnly: true },
      { name: 'department', label: 'Department', required: true },
      { name: 'designation', label: 'Designation', required: true },
      { name: 'grade', label: 'Grade', required: true },
      {
        name: 'employmentType',
        label: 'Employment type',
        type: 'select',
        required: true,
        options: Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'positions', label: 'Positions', type: 'number', required: true },
      {
        name: 'reason',
        label: 'Reason',
        type: 'select',
        required: true,
        options: Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'replacingEmployeeCode', label: 'Replacing (employee code)', showIf: (v) => v.reason === 'REPLACEMENT' },
      { name: 'requiredBy', label: 'Required by', type: 'date', required: true },
      { name: 'budgetedCtc', label: 'Budgeted monthly CTC', type: 'number', required: true },
      { name: 'raisedBy', label: 'Raised by', required: true },
      {
        name: 'justification',
        label: 'Justification',
        type: 'textarea',
        span: 2,
        required: true,
        hint: 'What breaks if this post is not filled? The approver reads only this.',
      },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        docNo: v.docNo,
        raisedOn: new Date().toISOString().slice(0, 10),
        filledPositions: 0,
        approvedBy: null,
        status: 'DRAFT' as const,
      }),
      department: v.department,
      designation: v.designation,
      grade: v.grade,
      employmentType: v.employmentType as EmploymentType,
      positions: Number(v.positions) || 1,
      reason: v.reason as ManpowerRequisition['reason'],
      replacingEmployeeCode: v.reason === 'REPLACEMENT' ? v.replacingEmployeeCode || null : null,
      requiredBy: v.requiredBy,
      budgetedCtc: Number(v.budgetedCtc) || 0,
      raisedBy: v.raisedBy,
      justification: v.justification,
    }),
    blockDelete: (r) =>
      r.filledPositions > 0
        ? `${r.docNo} has ${r.filledPositions} position${r.filledPositions === 1 ? '' : 's'} already filled. Close it instead — the joiners reference it.`
        : r.status === 'POSTED' || r.status === 'IN_PROGRESS'
          ? `${r.docNo} is live with candidates against it. Close it first so the candidates are not orphaned.`
          : undefined,
  })

  const requisitions = crud.rows
  const { rows: org } = useCollection<OrgNode>('hrms:org-node', orgSeed)
  const { rows: candidates } = useCollection<Candidate>('hrms:candidate', candSeed)

  const [tab, setTab] = useState('OPEN')
  const [approving, setApproving] = useState<ManpowerRequisition | null>(null)
  const [note, setNote] = useState('')

  const visible = requisitions.filter((r) => {
    if (tab === 'OPEN') return r.status === 'APPROVED' || r.status === 'POSTED' || r.status === 'IN_PROGRESS'
    if (tab === 'APPROVAL') return r.status === 'PENDING_APPROVAL' || r.status === 'DRAFT'
    if (tab === 'CLOSED') return r.status === 'CLOSED' || r.status === 'REJECTED'
    return true
  })

  const pending = requisitions.filter((r) => r.status === 'PENDING_APPROVAL')
  const openPositions = requisitions
    .filter((r) => r.status !== 'CLOSED' && r.status !== 'REJECTED' && r.status !== 'DRAFT')
    .reduce((s, r) => s + (r.positions - r.filledPositions), 0)
  const overdue = requisitions.filter(
    (r) => r.status !== 'CLOSED' && r.status !== 'REJECTED' && new Date(r.requiredBy).getTime() < Date.now(),
  )

  /**
   * Would approving this push the department past its sanctioned strength? A
   * replacement fills a seat that already exists, so it does not.
   */
  function sanctionCheck(r: ManpowerRequisition) {
    const node = org.find((n) => n.name === r.department)
    if (!node) return { known: false, within: true, headroom: 0, node: null }
    const headroom = node.sanctionedHeadcount - node.actualHeadcount
    const needed = r.reason === 'REPLACEMENT' ? 0 : r.positions
    return { known: true, within: needed <= headroom, headroom, node }
  }

  const columns: Column<ManpowerRequisition>[] = [
    { key: 'docNo', header: 'Requisition', sortable: true, width: '12rem', render: (r) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{r.docNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{formatDate(r.raisedOn)} · {r.raisedBy}</p>
      </div>
    ) },
    { key: 'designation', header: 'Post', sortable: true, render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{r.designation}</p>
        <p className="truncate text-2xs text-fg-subtle">{r.department} · grade {r.grade}</p>
      </div>
    ) },
    { key: 'employmentType', header: 'Type', sortable: true, width: '8.5rem', render: (r) => (
      <Badge tone={r.employmentType === 'PERMANENT' ? 'success' : 'neutral'} size="sm" dot={false}>
        {EMPLOYMENT_TYPE_LABEL[r.employmentType]}
      </Badge>
    ) },
    { key: 'reason', header: 'Why', sortable: true, width: '9.5rem', render: (r) => (
      <Badge tone={r.reason === 'REPLACEMENT' ? 'neutral' : r.reason === 'SKILL_GAP' ? 'warning' : 'brand'} size="sm" dot={false}>
        {REASON_LABEL[r.reason]}
      </Badge>
    ) },
    { key: 'positions', header: 'Filled', width: '11rem', sortable: true, accessor: (r) => r.filledPositions, render: (r) => (
      <div className="flex items-center gap-2">
        <ProgressBar
          value={r.positions ? (r.filledPositions / r.positions) * 100 : 0}
          tone={r.filledPositions >= r.positions ? 'success' : 'brand'}
          className="w-14"
        />
        <span className="text-2xs tabular text-fg-muted">{r.filledPositions}/{r.positions}</span>
      </div>
    ) },
    { key: 'sanction', header: 'Against sanction', width: '13rem', render: (r) => {
      const c = sanctionCheck(r)
      if (!c.known) return <span className="text-2xs text-fg-subtle">no sanction on record</span>
      if (r.reason === 'REPLACEMENT') return <span className="text-2xs text-success">replaces an existing seat</span>
      return c.within ? (
        <span className="text-2xs text-success">within sanction ({c.headroom} free)</span>
      ) : (
        <span className="text-2xs font-medium text-danger">
          exceeds sanction by {r.positions - c.headroom}
        </span>
      )
    } },
    { key: 'requiredBy', header: 'Required by', sortable: true, width: '10rem', accessor: (r) => r.requiredBy, render: (r) => (
      <div className="min-w-0">
        <p className="text-xs text-fg">{formatDate(r.requiredBy)}</p>
        {r.status !== 'CLOSED' && r.status !== 'REJECTED' && <DueCell date={r.requiredBy} />}
      </div>
    ) },
    ...(canSeePay
      ? [{
          key: 'budgetedCtc', header: 'Budget / month', align: 'right' as const, sortable: true, width: '11rem',
          render: (r: ManpowerRequisition) => <PayCell amount={r.budgetedCtc * r.positions} />,
        }]
      : []),
    { key: 'candidates', header: 'Pipeline', align: 'right', width: '8rem', accessor: (r) => candidates.filter((c) => c.requisitionNo === r.docNo).length, render: (r) => {
      const mine = candidates.filter((c) => c.requisitionNo === r.docNo)
      const live = mine.filter((c) => c.stage !== 'REJECTED' && c.stage !== 'DECLINED' && c.stage !== 'JOINED')
      if (!mine.length) return <span className="text-2xs text-warning">nobody yet</span>
      return <span className="text-2xs tabular text-fg-muted">{live.length} live of {mine.length}</span>
    } },
    { key: 'justification', header: 'Justification', render: (r) => <span className="text-2xs text-fg-muted">{r.justification}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (r) => <HrStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'manpower-requisitions', 'Manpower requisition register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Manpower requisitions"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Requisitions' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/recruitment')}>Candidate pipeline</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({
                docNo: `MRQ/2627/${String(48 + requisitions.length).padStart(4, '0')}`,
                reason: 'REPLACEMENT',
                employmentType: 'PERMANENT',
                positions: '1',
                raisedBy: 'Meera Rajan',
              })}
            >
              Raise a requisition
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'APPROVAL' ? pending.length : undefined }))} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', openPositions ? 'text-warning' : 'text-success')}>{openPositions}</span> position
        {openPositions === 1 ? '' : 's'} still to fill ·{' '}
        <span className={cn('font-medium', pending.length ? 'text-progress' : 'text-fg')}>{pending.length}</span> awaiting approval
        {overdue.length > 0 && <>, <span className="font-medium text-danger">{overdue.length}</span> already past the required-by date</>}
        .
      </p>

      {pending.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Awaiting approval" description="The sanction check is shown so the decision is not taken blind" />
          <CardBody className="space-y-2">
            {pending.map((r) => {
              const c = sanctionCheck(r)
              return (
                <div
                  key={r.uid}
                  className={cn('rounded border p-3', c.within ? 'border-border bg-surface-2' : 'border-danger/30 bg-danger/5')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-fg">
                        {r.docNo} — {r.positions} × {r.designation}, {r.department}
                      </p>
                      <p className="mt-0.5 text-2xs text-fg-muted">{r.justification}</p>
                      <p className="mt-1 text-2xs">
                        {r.reason === 'REPLACEMENT' ? (
                          <span className="text-success">
                            Replaces {r.replacingEmployeeCode ?? 'an existing seat'} — within the current sanction.
                          </span>
                        ) : c.within ? (
                          <span className="text-success">
                            {c.node?.name} has {c.headroom} sanctioned seat{c.headroom === 1 ? '' : 's'} free.
                          </span>
                        ) : (
                          <span className="font-medium text-danger">
                            {c.node?.name} has only {c.headroom} free against {r.positions} asked for — approving this needs the
                            sanction raised first.
                          </span>
                        )}
                        {canSeePay && ` · ₹${(r.budgetedCtc * r.positions).toLocaleString('en-IN')} per month added to payroll.`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button variant="success" size="sm" onClick={() => { setApproving(r); setNote('') }}>Approve</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          crud.update(r.uid, { status: 'REJECTED' })
                          toast.success('Requisition rejected', `${r.docNo} rejected. The department head is notified with the reason.`)
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
        searchPlaceholder="Search requisition, designation, department or raiser…"
        onExport={doExport}
        emptyTitle="No requisitions"
        rowClassName={(r) => cn(
          r.status === 'PENDING_APPROVAL' && 'bg-progress/[0.04]',
          r.status !== 'CLOSED' && r.status !== 'REJECTED' && new Date(r.requiredBy).getTime() < Date.now() && 'bg-danger/[0.04]',
        )}
        rowActions={(r) => (
          <>
            <MenuItem label="Edit the requisition" onClick={() => crud.openEdit(r)} />
            <MenuItem label="Delete the requisition" danger onClick={() => crud.askDelete(r)} />
            <MenuItem
              separatorBefore
              label="Submit for approval"
              disabled={r.status !== 'DRAFT'}
              onClick={() => {
                crud.update(r.uid, { status: 'PENDING_APPROVAL' })
                toast.success('Submitted', `${r.docNo} is with the approver. The sanction check travels with it.`)
              }}
            />
            <MenuItem
              label="Approve"
              disabled={r.status !== 'PENDING_APPROVAL'}
              onClick={() => { setApproving(r); setNote('') }}
            />
            <MenuItem
              label="Post the vacancy"
              disabled={r.status !== 'APPROVED'}
              onClick={() => {
                crud.update(r.uid, { status: 'POSTED' })
                toast.success('Vacancy posted', `${r.positions} × ${r.designation} posted. Applications now attach to ${r.docNo}.`)
                navigate('/hrms/recruitment')
              }}
            />
            <MenuItem label="Open the candidate pipeline" onClick={() => navigate('/hrms/recruitment')} />
            <MenuItem
              separatorBefore
              label="Close the requisition"
              disabled={r.status === 'CLOSED' || r.status === 'REJECTED'}
              onClick={() => {
                crud.update(r.uid, { status: 'CLOSED' })
                toast.success(
                  'Requisition closed',
                  r.filledPositions >= r.positions
                    ? `${r.docNo} closed — all ${r.positions} positions filled.`
                    : `${r.docNo} closed with ${r.positions - r.filledPositions} position${r.positions - r.filledPositions === 1 ? '' : 's'} unfilled. The seats stay in the sanction.`,
                )
              }}
            />
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
                const c = sanctionCheck(approving)
                if (!c.within && !note.trim()) {
                  toast.error(
                    'Over sanction — a note is required',
                    'Approving beyond the sanctioned headcount has to be justified in writing. It becomes the audit record for the extra cost.',
                  )
                  return
                }
                crud.update(approving.uid, {
                  status: 'APPROVED',
                  approvedBy: 'Managing Director',
                  justification: note.trim() ? `${approving.justification} — Approver: ${note.trim()}` : approving.justification,
                })
                toast.success(
                  'Requisition approved',
                  `${approving.docNo} approved for ${approving.positions} position${approving.positions === 1 ? '' : 's'}. It can now be posted.`,
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
              <p className="font-medium text-fg">
                {approving.positions} × {approving.designation}, {approving.department}
              </p>
              <p className="mt-1 text-fg-muted">
                {REASON_LABEL[approving.reason]} · required by {formatDate(approving.requiredBy)}
                {canSeePay && ` · ₹${(approving.budgetedCtc * approving.positions).toLocaleString('en-IN')} per month`}
              </p>
              <p className="mt-1.5 text-2xs text-fg-muted">{approving.justification}</p>
            </div>

            {(() => {
              const c = sanctionCheck(approving)
              return c.within ? (
                <p className="rounded border border-success/30 bg-success/5 p-2.5 text-2xs text-success">
                  Within sanction — {c.node?.name ?? 'the department'} has {c.headroom} approved seat
                  {c.headroom === 1 ? '' : 's'} free.
                </p>
              ) : (
                <p className="rounded border border-danger/30 bg-danger/5 p-2.5 text-2xs text-danger">
                  This takes {c.node?.name ?? 'the department'} past its sanctioned strength of{' '}
                  {c.node?.sanctionedHeadcount}. Approving anyway is allowed, but the reason is recorded against the requisition
                  and shows on the headcount report.
                </p>
              )
            })()}

            <Textarea
              label={sanctionCheck(approving).within ? 'Approver note (optional)' : 'Approver note (required — over sanction)'}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Second polishing line was commissioned in June and the sanction has not caught up. Raising the sanction separately."
            />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Five reasons for a requisition, and what each one implies" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-fg">Replacement</span> fills a seat that already exists in the sanction. Routine, and should be fast — the cost was already budgeted.</p>
          <p><span className="font-medium text-fg">Expansion</span> adds a seat. It needs the sanction raised, so it is a budget decision rather than an HR one.</p>
          <p><span className="font-medium text-fg">New line</span> comes with its own sanction from the capital approval, so the headcount usually arrives with the machine.</p>
          <p><span className="font-medium text-fg">Seasonal</span> should be contract or temporary. Filling a seasonal peak with permanent heads is how a plant ends up overstaffed in the off season.</p>
          <p><span className="font-medium text-fg">Skill gap</span> is the one worth reading carefully — sometimes the answer is training an existing operator rather than hiring.</p>
        </CardBody>
      </Card>
    </div>
  )
}
