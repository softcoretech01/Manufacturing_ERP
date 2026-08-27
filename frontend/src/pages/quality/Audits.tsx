import { useMemo, useState, useEffect } from 'react'
import { ClipboardCheck, Plus, Trash2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, DetailBlock, DueChip, QmsStatusBadge, useQualityData } from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { overdueDays } from '@/lib/qmsFlow'
import { newUid } from '@/store/data'
import { auditsApi } from '@/api/audits'
import type { AuditFinding, AuditStatus, AuditType, FindingGrade, QualityAudit } from '@/types/quality'

/**
 * Audit management (Ch 19).
 *
 * An audit is only worth the findings that get closed, so the screen is built
 * around the finding rather than the audit: the score tells you how the day
 * went, the open findings tell you what still has to happen. An audit cannot be
 * closed while a non-conformity is open — that single rule is the difference
 * between an audit programme and a filing cabinet.
 */

const AUDIT_FLOW: Record<AuditStatus, AuditStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['REPORTED', 'CANCELLED'],
  REPORTED: ['ACTIONS_OPEN', 'CLOSED'],
  ACTIONS_OPEN: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

const STATUS_LABEL: Record<AuditStatus, string> = {
  PLANNED: 'Planned', IN_PROGRESS: 'In progress', REPORTED: 'Reported',
  ACTIONS_OPEN: 'Actions open', CLOSED: 'Closed', CANCELLED: 'Cancelled',
}

const TYPE_LABEL: Record<AuditType, string> = {
  INTERNAL: 'Internal', SUPPLIER: 'Supplier', CUSTOMER: 'Customer',
  ISO: 'ISO / certification', PROCESS: 'Process', PRODUCT: 'Product',
}

const GRADE_LABEL: Record<FindingGrade, string> = {
  MAJOR_NC: 'Major NC', MINOR_NC: 'Minor NC', OBSERVATION: 'Observation', CONFORMS: 'Conforms',
}

const GRADE_TONE: Record<FindingGrade, 'danger' | 'warning' | 'progress' | 'success'> = {
  MAJOR_NC: 'danger', MINOR_NC: 'warning', OBSERVATION: 'progress', CONFORMS: 'success',
}

const OPEN_STATES: AuditStatus[] = ['PLANNED', 'IN_PROGRESS', 'REPORTED', 'ACTIONS_OPEN']

/** A finding needing action is any non-conformity or observation not yet closed. */
const needsAction = (f: AuditFinding) => f.grade !== 'CONFORMS' && !f.closedOn

/**
 * The score the audit earned: conforming clauses over clauses examined, taken
 * from the auditor's checklist.
 *
 * It is deliberately NOT derived from the findings list. An audit examines
 * dozens of clauses and records only the exceptions plus a sample of what
 * conformed — 92% conformance and four recorded findings are entirely
 * consistent. Computing a score from the findings would report 25% for an audit
 * that passed, which is worse than no score.
 */
function scoreOf(a: QualityAudit): number | null {
  return a.scorePct
}

/** Of the findings actually written down, how many are settled. Not the score. */
function findingsSettled(a: QualityAudit): { settled: number; total: number } {
  const total = a.findings.length
  return { settled: a.findings.filter((f) => f.grade === 'CONFORMS' || f.closedOn).length, total }
}

function stepBlockers(a: QualityAudit, to: AuditStatus): string[] {
  const out: string[] = []
  if (to === 'IN_PROGRESS' && !(a.auditor ?? '').trim()) out.push('Name the auditor before the audit starts.')
  if (to === 'REPORTED') {
    if (!a.conductedOn) out.push('Record the date the audit was actually conducted.')
    if (!a.findings.length) out.push('An audit with no findings recorded — not even a conformity — has no report to issue.')
    const unactioned = a.findings.filter((f) => f.grade !== 'CONFORMS' && !(f.action ?? '').trim())
    if (unactioned.length) out.push(`${unactioned.length} finding(s) have no corrective action written against them.`)
    const unowned = a.findings.filter((f) => f.grade !== 'CONFORMS' && !(f.owner ?? '').trim())
    if (unowned.length) out.push(`${unowned.length} finding(s) have nobody accountable for closing them.`)
    if (a.scorePct === null) out.push('Record the checklist score — what proportion of the clauses examined conformed.')
  }
  if (to === 'CLOSED') {
    const open = a.findings.filter(needsAction)
    if (open.length) out.push(`${open.length} finding(s) are still open. An audit cannot be closed over an open non-conformity.`)
    if (!(a.reportRef ?? '').trim()) out.push('Record the report reference so the audit can be found again.')
  }
  if (to === 'CANCELLED' && (a.remarks ?? '').trim().length < 10) out.push('Cancelling a planned audit needs a recorded reason.')
  return out
}

const BLANK = (): Partial<QualityAudit> => ({
  docNo: '', auditType: 'INTERNAL', title: '', scope: '', auditee: '', auditor: '',
  plannedOn: new Date().toISOString().slice(0, 10), conductedOn: null,
  status: 'PLANNED', findings: [], scorePct: null, reportRef: '', remarks: '', version: 1,
})

const BLANK_FINDING = (): AuditFinding => ({
  uid: newUid('af'), clause: '', area: '', grade: 'MINOR_NC', description: '',
  action: '', owner: '', dueOn: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), closedOn: null,
})

export function AuditsPage() {
  const toast = useToast()
  const [rows, setRows] = useState<QualityAudit[]>([])

  const fetchAudits = async () => {
    try {
      const data = await auditsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch audits')
    }
  }

  useEffect(() => {
    fetchAudits()
  }, [])

  const [tab, setTab] = useState('open')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<QualityAudit> | null>(null)
  const [advancing, setAdvancing] = useState<{ audit: QualityAudit; to: AuditStatus } | null>(null)

  const live = useMemo(() => rows.filter((a) => !a.deletedAt), [rows])
  const detail = live.find((a) => String((a as any).id ?? a.uid) === openUid) ?? null

  /** Every open finding across every audit, which is the real work list. */
  const openFindings = useMemo(
    () => live.flatMap((a) => a.findings.filter(needsAction).map((f) => ({ audit: a, finding: f }))),
    [live],
  )

  const filtered = useMemo(() => {
    if (tab === 'open') return live.filter((a) => OPEN_STATES.includes(a.status))
    if (tab === 'findings') return live.filter((a) => a.findings.some(needsAction))
    if (tab === 'closed') return live.filter((a) => a.status === 'CLOSED' || a.status === 'CANCELLED')
    return live
  }, [live, tab])

  const k = useMemo(() => {
    const conducted = live.filter((a) => a.conductedOn)
    const scores = conducted.map(scoreOf).filter((s): s is number => s !== null)
    const majors = openFindings.filter((x) => x.finding.grade === 'MAJOR_NC')
    const overdue = openFindings.filter((x) => overdueDays(x.finding.dueOn, x.finding.closedOn) > 0)

    const byType = (Object.keys(TYPE_LABEL) as AuditType[])
      .map((t) => {
        const of = live.filter((a) => a.auditType === t)
        const s = of.map(scoreOf).filter((x): x is number => x !== null)
        return { type: TYPE_LABEL[t], count: of.length, score: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0 }
      })
      .filter((r) => r.count > 0)

    return {
      total: live.length,
      planned: live.filter((a) => a.status === 'PLANNED').length,
      open: live.filter((a) => OPEN_STATES.includes(a.status)).length,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      openFindings: openFindings.length,
      majors: majors.length,
      overdue: overdue.length,
      byType,
      // Closure rate over every finding ever raised — the number that says
      // whether the audit programme actually changes anything.
      closureRate: (() => {
        const all = live.flatMap((a) => a.findings.filter((f) => f.grade !== 'CONFORMS'))
        return all.length ? Math.round((all.filter((f) => f.closedOn).length / all.length) * 100) : null
      })(),
    }
  }, [live, openFindings])

  /* ── actions ────────────────────────────────────────────────── */

  function advance(a: QualityAudit, to: AuditStatus) {
    const b = stepBlockers(a, to)
    if (b.length) { toast.error(b[0]); return }
    auditsApi.update((a as any).id, { ...a, status: to }).then(() => {
      fetchAudits()
      toast.success(`${a.docNo} → ${STATUS_LABEL[to]}`)
      setAdvancing(null)
    }).catch((e: any) => toast.error('Error', e.message))
  }

  function closeFinding(a: QualityAudit, findingUid: string) {
    const findings = a.findings.map((f) =>
      f.uid === findingUid ? { ...f, closedOn: f.closedOn ? null : new Date().toISOString().slice(0, 10) } : f,
    )
    const wasOpen = a.findings.find((f) => f.uid === findingUid)?.closedOn === null
    let newStatus = a.status
    let statusMsg = ''
    if (wasOpen && !findings.some(needsAction) && a.status === 'ACTIONS_OPEN' && (a.reportRef ?? '').trim()) {
      newStatus = 'CLOSED'
      statusMsg = 'Last finding closed — the audit is now closed'
    } else {
      statusMsg = wasOpen ? 'Finding closed' : 'Finding reopened'
    }
    
    auditsApi.update((a as any).id, { ...a, findings, status: newStatus }).then(() => {
      fetchAudits()
      toast.success(statusMsg)
    }).catch((e: any) => toast.error('Error', e.message))
  }

  async function save() {
    if (!editing) return
    const problems: string[] = []
    if (!(editing.title ?? '').trim()) problems.push('Give the audit a title.')
    if (!(editing.auditee ?? '').trim()) problems.push('Who is being audited?')
    if (!(editing.scope ?? '').trim()) problems.push('State the scope — what was examined and what was not.')
    if (!editing.plannedOn) problems.push('When is it planned for?')
    const bad = (editing.findings ?? []).filter((f) => f.grade !== 'CONFORMS' && !(f.description ?? '').trim())
    if (bad.length) problems.push('Every non-conformity needs a description.')
    if (problems.length) { toast.error(problems[0]); return }

    const payload = { ...editing } as QualityAudit
    try {
      if (editing.docNo) {
        await auditsApi.update((editing as any).id, payload)
        toast.success(`${editing.docNo} updated`)
      } else {
        await auditsApi.create({ ...(BLANK() as QualityAudit), ...payload } as any)
        toast.success('Audit scheduled')
      }
      fetchAudits()
      setEditing(null)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save')
    }
  }

  function removeRow(a: QualityAudit) {
    if (a.status !== 'PLANNED') { toast.error('This audit has been conducted. Cancel it with a reason rather than deleting the evidence.'); return }
    auditsApi.remove((a as any).id).then(() => {
      fetchAudits()
      if (openUid === String((a as any).id ?? a.uid)) setOpenUid(null)
      toast.success(`${a.docNo} removed`)
    }).catch((e: any) => toast.error('Error', e.message))
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<QualityAudit>[] = [
    {
      key: 'doc', header: 'Audit', width: '22rem',
      render: (a) => (<><p className="truncate text-xs text-fg">{a.title}</p><p className="font-mono text-2xs text-fg-subtle">{a.docNo}</p></>),
    },
    { key: 'type', header: 'Type', width: '10rem', render: (a) => <Badge tone={a.auditType === 'ISO' ? 'brand' : a.auditType === 'SUPPLIER' ? 'warning' : 'neutral'} size="sm" dot={false}>{TYPE_LABEL[a.auditType]}</Badge> },
    { key: 'auditee', header: 'Auditee', width: '16rem', render: (a) => <p className="truncate text-2xs text-fg-muted">{a.auditee}</p> },
    { key: 'auditor', header: 'Auditor', width: '13rem', render: (a) => <p className="truncate text-2xs text-fg-muted">{a.auditor || '—'}</p> },
    {
      key: 'when', header: 'Date', width: '9rem',
      render: (a) => (<><p className="text-2xs tabular text-fg-muted">{formatDate(a.conductedOn ?? a.plannedOn)}</p><p className="text-3xs text-fg-subtle">{a.conductedOn ? 'conducted' : 'planned'}</p></>),
    },
    {
      key: 'score', header: 'Score', width: '11rem',
      render: (a) => {
        const s = scoreOf(a)
        if (s === null) return <span className="text-2xs text-fg-subtle">—</span>
        return (
          <div className="flex items-center gap-2">
            <ProgressBar value={s} tone={s >= 90 ? 'success' : s >= 70 ? 'warning' : 'danger'} className="w-12" />
            <span className={cn('text-2xs tabular', s >= 90 ? 'text-success' : s >= 70 ? 'text-warning' : 'text-danger')}>{s}%</span>
          </div>
        )
      },
    },
    {
      key: 'findings', header: 'Findings', width: '13rem',
      render: (a) => {
        const major = a.findings.filter((f) => f.grade === 'MAJOR_NC' && !f.closedOn).length
        const minor = a.findings.filter((f) => f.grade === 'MINOR_NC' && !f.closedOn).length
        const obs = a.findings.filter((f) => f.grade === 'OBSERVATION' && !f.closedOn).length
        const st = findingsSettled(a)
        if (!major && !minor && !obs) return <span className="text-2xs text-success">{st.total ? `All ${st.total} settled` : 'None recorded'}</span>
        return (
          <div className="flex flex-wrap gap-1">
            {major > 0 && <Badge tone="danger" size="sm" dot={false}>{major} major</Badge>}
            {minor > 0 && <Badge tone="warning" size="sm" dot={false}>{minor} minor</Badge>}
            {obs > 0 && <Badge tone="progress" size="sm" dot={false}>{obs} obs</Badge>}
          </div>
        )
      },
    },
    {
      key: 'due', header: 'Oldest due', width: '9rem',
      render: (a) => {
        const open = a.findings.filter(needsAction)
        if (!open.length) return <span className="text-2xs text-fg-subtle">—</span>
        const worst = Math.max(...open.map((f) => overdueDays(f.dueOn, f.closedOn)))
        return <DueChip days={worst} />
      },
    },
    { key: 'status', header: 'Status', width: '11rem', render: (a) => <QmsStatusBadge status={a.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Audits"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'Audits' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>Schedule an audit</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: k.open },
              { id: 'findings', label: 'With open findings', count: live.filter((a) => a.findings.some(needsAction)).length },
              { id: 'closed', label: 'Closed', count: live.filter((a) => a.status === 'CLOSED' || a.status === 'CANCELLED').length },
              { id: 'all', label: 'All', count: live.length },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open audits" value={k.open} sub={`${k.planned} planned, not yet started`} icon={<ClipboardCheck />} tone={k.open ? 'brand' : 'success'} />
        <StatTile label="Average score" value={k.avgScore === null ? '—' : `${k.avgScore}%`} sub="Conforming clauses over clauses examined" tone={k.avgScore === null ? 'neutral' : k.avgScore >= 90 ? 'success' : k.avgScore >= 70 ? 'warning' : 'danger'} />
        <StatTile label="Open findings" value={k.openFindings} sub={`${k.majors} major · ${k.overdue} past due`} tone={k.majors ? 'danger' : k.openFindings ? 'warning' : 'success'} />
        <StatTile label="Closure rate" value={k.closureRate === null ? '—' : `${k.closureRate}%`} sub="Findings closed of all ever raised" tone={k.closureRate !== null && k.closureRate >= 80 ? 'success' : 'warning'} />
      </div>

      {k.majors > 0 && (
        <Alert tone="danger" title={`${k.majors} major non-conformit${k.majors === 1 ? 'y is' : 'ies are'} open`} className="mb-4">
          A major non-conformity is a system failure, not a lapse. Until each is closed the affected audit cannot be signed off, and a certification audit will find it again.
        </Alert>
      )}

      {openFindings.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Every open finding" description="Across all audits — the actual work list, ordered by how late it is" />
          <CardBody className="p-0">
            <div className="max-h-72 overflow-y-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: '9rem' }}>Audit</th>
                    <th style={{ width: '7rem' }}>Clause</th>
                    <th style={{ width: '8rem' }}>Grade</th>
                    <th>Finding</th>
                    <th style={{ width: '11rem' }}>Owner</th>
                    <th style={{ width: '9rem' }}>Due</th>
                    <th style={{ width: '6rem' }} className="text-right">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {[...openFindings]
                    .sort((a, b) => overdueDays(b.finding.dueOn, b.finding.closedOn) - overdueDays(a.finding.dueOn, a.finding.closedOn))
                    .map(({ audit, finding }) => (
                      <tr key={finding.uid} className={overdueDays(finding.dueOn, finding.closedOn) > 0 ? 'bg-danger/5' : undefined}>
                        <td>
                          <button type="button" onClick={() => setOpenUid(audit.uid)} className="font-mono text-2xs text-brand-600 hover:underline">{audit.docNo}</button>
                        </td>
                        <td className="font-mono text-2xs text-fg-muted">{finding.clause}</td>
                        <td><Badge tone={GRADE_TONE[finding.grade]} size="sm" dot={false}>{GRADE_LABEL[finding.grade]}</Badge></td>
                        <td><p className="truncate text-xs text-fg-muted" title={finding.description}>{finding.description}</p></td>
                        <td className="text-2xs text-fg-muted">{finding.owner || '—'}</td>
                        <td><DueChip days={overdueDays(finding.dueOn, finding.closedOn)} /></td>
                        <td className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => closeFinding(audit, finding.uid)}>Close</Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {k.byType.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Score by audit type" description="Where the system is weakest" />
          <CardBody className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={k.byType} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="type" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTip suffix="%" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="score" name="Average score" maxBarSize={38} radius={[3, 3, 0, 0]}>
                  {k.byType.map((r, i) => (<Cell key={i} fill={r.score >= 90 ? '#10b981' : r.score >= 70 ? '#f59e0b' : '#ef4444'} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(a) => String((a as any).id ?? a.uid)}
        searchable
        searchPlaceholder="Search by title, auditee, auditor or number"
        onRowClick={(a) => setOpenUid(String((a as any).id ?? a.uid))}
        rowClassName={(a) => (a.findings.some((f) => f.grade === 'MAJOR_NC' && !f.closedOn) ? 'bg-danger/5' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, `audits-${tab}`, 'Audit register', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(a) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...a, findings: a.findings.map((f) => ({ ...f })) })} />
            {AUDIT_FLOW[a.status].map((to) => (
              <MenuItem key={to} label={STATUS_LABEL[to]} onClick={() => setAdvancing({ audit: a, to })} />
            ))}
            <MenuItem label="Delete" danger onClick={() => removeRow(a)} />
          </>
        )}
        emptyTitle="No audits"
        emptyDescription="Schedule one to start the programme."
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.docNo} · ${detail.title}` : ''} width="max-w-2xl">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <QmsStatusBadge status={detail.status} size="md" />
              <Badge tone="neutral" size="sm" dot={false}>{TYPE_LABEL[detail.auditType]}</Badge>
              {(() => {
                const s = scoreOf(detail)
                return s === null ? null : <Badge tone={s >= 90 ? 'success' : s >= 70 ? 'warning' : 'danger'} size="sm" dot={false}>{s}% of clauses conformed</Badge>
              })()}
            </div>

            <DetailBlock title="Scope">
              <p className="text-xs leading-relaxed text-fg-muted">{detail.scope}</p>
            </DetailBlock>

            <DetailBlock title="Detail">
              <DataGrid columns={2} items={[
                { label: 'Auditee', value: detail.auditee },
                { label: 'Auditor', value: detail.auditor || 'Not assigned' },
                { label: 'Planned', value: formatDate(detail.plannedOn) },
                { label: 'Conducted', value: detail.conductedOn ? formatDate(detail.conductedOn) : 'Not yet' },
                { label: 'Report reference', value: detail.reportRef || '—', mono: !!detail.reportRef },
                { label: 'Checklist score', value: detail.scorePct === null ? 'Not recorded' : `${detail.scorePct}% of clauses conformed` },
                { label: 'Findings', value: `${detail.findings.length} recorded · ${detail.findings.filter(needsAction).length} open` },
              ]} />
            </DetailBlock>

            <DetailBlock title={`Findings (${detail.findings.length})`}>
              {detail.findings.length === 0 ? (
                <p className="text-2xs text-fg-subtle">Nothing recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.findings.map((f) => (
                    <div key={f.uid} className={cn('rounded border p-2.5', f.closedOn ? 'border-border bg-surface-2 opacity-70' : f.grade === 'MAJOR_NC' ? 'border-danger/40' : 'border-border')}>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge tone={GRADE_TONE[f.grade]} size="sm" dot={false}>{GRADE_LABEL[f.grade]}</Badge>
                        {f.clause && <span className="font-mono text-2xs text-fg-subtle">{f.clause}</span>}
                        {f.area && <span className="text-2xs text-fg-muted">{f.area}</span>}
                        <span className="ml-auto">
                          {f.closedOn
                            ? <Badge tone="success" size="sm">Closed {formatDate(f.closedOn)}</Badge>
                            : f.grade === 'CONFORMS'
                              ? <Badge tone="success" size="sm" dot={false}>No action needed</Badge>
                              : <DueChip days={overdueDays(f.dueOn, f.closedOn)} />}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-fg">{f.description}</p>
                      {f.action && (
                        <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
                          <span className="text-fg-subtle">Action:</span> {f.action}
                          {f.owner ? ` — ${f.owner}` : ''}{f.dueOn ? `, by ${formatDate(f.dueOn)}` : ''}
                        </p>
                      )}
                      {f.grade !== 'CONFORMS' && (
                        <div className="mt-1.5">
                          <Button variant="ghost" size="sm" onClick={() => closeFinding(detail, f.uid)}>
                            {f.closedOn ? 'Reopen' : 'Mark closed'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </DetailBlock>

            {detail.remarks && (
              <DetailBlock title="Remarks"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>
            )}

            {AUDIT_FLOW[detail.status].length > 0 && (
              <DetailBlock title="Next step">
                <div className="flex flex-wrap gap-2">
                  {AUDIT_FLOW[detail.status].map((to) => {
                    const b = stepBlockers(detail, to)
                    return (
                      <Button key={to} variant={to === 'CANCELLED' ? 'outline' : 'primary'} size="sm" onClick={() => setAdvancing({ audit: detail, to })} disabled={b.length > 0} title={b[0]}>
                        {STATUS_LABEL[to]}
                      </Button>
                    )
                  })}
                </div>
                {(() => {
                  const all = AUDIT_FLOW[detail.status].flatMap((to) => stepBlockers(detail, to).map((x) => `${STATUS_LABEL[to]}: ${x}`))
                  return all.length ? (
                    <Alert tone="info" title="Outstanding before the next step" className="mt-2">
                      <ul className="list-disc space-y-0.5 pl-4">{all.map((x) => (<li key={x}>{x}</li>))}</ul>
                    </Alert>
                  ) : null
                })()}
              </DetailBlock>
            )}

            <div className="flex gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail, findings: detail.findings.map((f) => ({ ...f })) }); setOpenUid(null) }}>Edit</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.docNo}` : 'Schedule an audit'}
        width="max-w-3xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Select label="Type" value={editing.auditType ?? 'INTERNAL'} onChange={(e) => setEditing({ ...editing, auditType: e.target.value as AuditType })}>
                {(Object.keys(TYPE_LABEL) as AuditType[]).map((t) => (<option key={t} value={t}>{TYPE_LABEL[t]}</option>))}
              </Select>
              <Input label="Planned on" type="date" value={editing.plannedOn ?? ''} onChange={(e) => setEditing({ ...editing, plannedOn: e.target.value })} />
              <Input label="Conducted on" type="date" value={editing.conductedOn ?? ''} onChange={(e) => setEditing({ ...editing, conductedOn: e.target.value || null })} hint="Leave blank until it happens" />
            </div>
            <Input label="Title" required value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <Textarea label="Scope" required rows={2} value={editing.scope ?? ''} onChange={(e) => setEditing({ ...editing, scope: e.target.value })} hint="What was examined, and what was deliberately not" />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Auditee" required value={editing.auditee ?? ''} onChange={(e) => setEditing({ ...editing, auditee: e.target.value })} />
              <Input label="Auditor" value={editing.auditor ?? ''} onChange={(e) => setEditing({ ...editing, auditor: e.target.value })} />
              <Input label="Report reference" value={editing.reportRef ?? ''} onChange={(e) => setEditing({ ...editing, reportRef: e.target.value })} />
            </div>
            <Input
              label="Checklist score %"
              type="number"
              value={editing.scorePct === null || editing.scorePct === undefined ? '' : String(editing.scorePct)}
              onChange={(e) => setEditing({ ...editing, scorePct: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
              hint="Clauses that conformed, over clauses examined. From the auditor's checklist, not from the findings below — an audit records only the exceptions."
              className="w-48"
            />

            <div className="rounded border border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-3xs uppercase tracking-wider text-fg-subtle">Findings ({(editing.findings ?? []).length})</p>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Plus />}
                  onClick={() => setEditing({ ...editing, findings: [...(editing.findings ?? []), BLANK_FINDING()] })}
                >
                  Add a finding
                </Button>
              </div>
              {(editing.findings ?? []).length === 0 ? (
                <p className="text-2xs text-fg-subtle">None yet. Record a conformity too — an audit that only lists failures cannot produce a score.</p>
              ) : (
                <div className="space-y-2">
                  {(editing.findings ?? []).map((f, i) => (
                    <div key={f.uid} className="rounded border border-border bg-surface p-2.5">
                      <div className="mb-2 grid grid-cols-4 gap-2">
                        <Input
                          label="Clause" sizeVariant="sm" value={f.clause}
                          onChange={(e) => setEditing({ ...editing, findings: (editing.findings ?? []).map((x, j) => (j === i ? { ...x, clause: e.target.value } : x)) })}
                        />
                        <Input
                          label="Area" sizeVariant="sm" value={f.area}
                          onChange={(e) => setEditing({ ...editing, findings: (editing.findings ?? []).map((x, j) => (j === i ? { ...x, area: e.target.value } : x)) })}
                        />
                        <Select
                          label="Grade" value={f.grade}
                          onChange={(e) => setEditing({ ...editing, findings: (editing.findings ?? []).map((x, j) => (j === i ? { ...x, grade: e.target.value as FindingGrade } : x)) })}
                        >
                          {(Object.keys(GRADE_LABEL) as FindingGrade[]).map((g) => (<option key={g} value={g}>{GRADE_LABEL[g]}</option>))}
                        </Select>
                        <div className="flex items-end justify-end">
                          <Button
                            variant="ghost" size="sm" icon={<Trash2 />}
                            className="text-danger hover:bg-danger/10"
                            onClick={() => setEditing({ ...editing, findings: (editing.findings ?? []).filter((_, j) => j !== i) })}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        label="What was found" rows={2} value={f.description}
                        onChange={(e) => setEditing({ ...editing, findings: (editing.findings ?? []).map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
                      />
                      {f.grade !== 'CONFORMS' && (
                        <>
                          <Textarea
                            label="Corrective action" rows={2} value={f.action} className="mt-2"
                            onChange={(e) => setEditing({ ...editing, findings: (editing.findings ?? []).map((x, j) => (j === i ? { ...x, action: e.target.value } : x)) })}
                          />
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <Input
                              label="Owner" sizeVariant="sm" value={f.owner}
                              onChange={(e) => setEditing({ ...editing, findings: (editing.findings ?? []).map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)) })}
                            />
                            <Input
                              label="Due" type="date" sizeVariant="sm" value={f.dueOn}
                              onChange={(e) => setEditing({ ...editing, findings: (editing.findings ?? []).map((x, j) => (j === i ? { ...x, dueOn: e.target.value } : x)) })}
                            />
                            <Input
                              label="Closed on" type="date" sizeVariant="sm" value={f.closedOn ?? ''}
                              onChange={(e) => setEditing({ ...editing, findings: (editing.findings ?? []).map((x, j) => (j === i ? { ...x, closedOn: e.target.value || null } : x)) })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(editing.findings ?? []).length > 0 && (
                <p className="mt-2 text-3xs text-fg-subtle">
                  {(editing.findings ?? []).filter((f) => f.grade !== 'CONFORMS' && !f.closedOn).length} of {(editing.findings ?? []).length} recorded findings still open.
                  These are the exceptions, not the whole checklist — the score above is entered separately.
                </p>
              )}
            </div>

            <Textarea label="Remarks" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />
          </div>
        )}
      </Drawer>

      {/* ── advance ──────────────────────────────────────────── */}
      <Modal
        open={!!advancing}
        onClose={() => setAdvancing(null)}
        title={advancing ? `${advancing.audit.docNo} → ${STATUS_LABEL[advancing.to]}` : ''}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdvancing(null)}>Cancel</Button>
            <Button
              variant="primary" size="sm"
              onClick={() => advancing && advance(advancing.audit, advancing.to)}
              disabled={!!advancing && stepBlockers(advancing.audit, advancing.to).length > 0}
            >
              Confirm
            </Button>
          </>
        }
      >
        {advancing && (() => {
          const b = stepBlockers(advancing.audit, advancing.to)
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                {advancing.to === 'CLOSED'
                  ? 'Closing records that every non-conformity has been actioned and verified. It cannot be undone without reopening the findings.'
                  : advancing.to === 'REPORTED'
                    ? 'Issuing the report fixes the findings as written. Corrective actions and owners must already be in place.'
                    : `Moving ${advancing.audit.docNo} to ${STATUS_LABEL[advancing.to].toLowerCase()}.`}
              </p>
              {b.length > 0 ? (
                <Alert tone="danger" title="Not yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert>
              ) : (
                <Alert tone="tip" title="Ready">Everything this step requires is in place.</Alert>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
