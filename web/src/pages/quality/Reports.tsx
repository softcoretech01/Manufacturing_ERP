import { useMemo, useState, useEffect } from 'react'
import { Download, FileText } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, GradeBadge, QmsStatusBadge, SeverityBadge, StageBadge } from '@/components/quality/QmsShell'
import { inspectionsApi } from '@/api/inspections'
import { ncrsApi } from '@/api/ncrs'
import { capasApi } from '@/api/capas'
import { complaintsApi } from '@/api/complaints'
import { auditsApi } from '@/api/audits'
import { instrumentsApi } from '@/api/instruments'
import { supplierQualityApi } from '@/api/supplierQuality'
import type { Inspection, Ncr, Capa, Complaint, QualityAudit, Instrument, SupplierQualityRecord, InspectionStage } from '@/types/quality'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import {
  CAUSE_CATEGORIES, CAUSE_LABEL, STAGE_LABEL, acceptanceRate, capaClosureDays, copq,
  firstPassYield, instrumentStatus, overdueDays, paretoOf, ppm, rejectionPct, scoreSupplier,
} from '@/lib/qmsFlow'


/**
 * Quality reports (Ch 20).
 *
 * One place that answers the questions a quality review actually asks, from the
 * same records the operational screens write. Nothing here is a separate
 * calculation — a number that disagreed with the screen it came from would be
 * worse than no report. Every table exports.
 */

type Tab = 'summary' | 'stage' | 'defects' | 'suppliers' | 'actions' | 'cost'

const STAGES: InspectionStage[] = ['IQC', 'FIRST_PIECE', 'IPQC', 'FQC', 'OQA']

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const pct = (n: number) => `${n.toFixed(1)}%`

export function QualityReportsPage() {
  const toast = useToast()

  const [inspectionsRows, setInspectionsRows] = useState<Inspection[]>([])
  const [ncrsRows, setNcrsRows] = useState<Ncr[]>([])
  const [capasRows, setCapasRows] = useState<Capa[]>([])
  const [complaintsRows, setComplaintsRows] = useState<Complaint[]>([])
  const [auditsRows, setAuditsRows] = useState<QualityAudit[]>([])
  const [instrumentsRows, setInstrumentsRows] = useState<Instrument[]>([])
  const [supplierQualityRows, setSupplierQualityRows] = useState<SupplierQualityRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<Tab>('summary')
  const [stageFilter, setStageFilter] = useState<InspectionStage | 'ALL'>('ALL')

  useEffect(() => {
    Promise.all([
      inspectionsApi.getAll(),
      ncrsApi.getAll(),
      capasApi.getAll(),
      complaintsApi.getAll(),
      auditsApi.getAll(),
      instrumentsApi.getAll(),
      supplierQualityApi.getAll(),
    ]).then(([i, n, c, cm, a, inst, sq]) => {
      setInspectionsRows(i)
      setNcrsRows(n)
      setCapasRows(c)
      setComplaintsRows(cm)
      setAuditsRows(a)
      setInstrumentsRows(inst)
      setSupplierQualityRows(sq)
      setLoading(false)
    }).catch((err) => {
      console.error(err)
      toast.error('Failed to load quality reports')
      setLoading(false)
    })
  }, [])

  const liveInspections = useMemo(() => inspectionsRows.filter((i) => !i.deletedAt), [inspectionsRows])
  const liveNcrs = useMemo(() => ncrsRows.filter((n) => !n.deletedAt), [ncrsRows])
  const liveCapas = useMemo(() => capasRows.filter((c) => !c.deletedAt), [capasRows])
  const liveComplaints = useMemo(() => complaintsRows.filter((c) => !c.deletedAt), [complaintsRows])
  const liveAudits = useMemo(() => auditsRows.filter((a) => !a.deletedAt), [auditsRows])

  /* ── the numbers, all derived from the operational records ──── */

  const summary = useMemo(() => {
    const done = liveInspections.filter((i) => i.status === 'COMPLETED')
    const fpy = firstPassYield(liveInspections)
    const inspected = done.reduce((s, i) => s + i.lotSize, 0)
    const rejected = done.reduce((s, i) => s + i.rejectedQty, 0)
    const cost = copq(liveNcrs, liveComplaints)
    const capaStats = capaClosureDays(liveCapas)

    return {
      inspections: done.length,
      pending: liveInspections.filter((i) => i.status !== 'COMPLETED' && i.status !== 'CANCELLED').length,
      fpy,
      acceptance: acceptanceRate(liveInspections),
      rejection: rejectionPct(liveInspections),
      ppm: ppm(rejected, inspected),
      inspected,
      rejected,
      cost,
      capaStats,
      ncrOpen: liveNcrs.filter((n) => n.status !== 'CLOSED' && n.status !== 'CANCELLED').length,
      complaintsOpen: liveComplaints.filter((c) => !['CLOSED', 'REJECTED'].includes(c.status)).length,
      auditFindingsOpen: liveAudits.flatMap((a) => a.findings.filter((f) => f.grade !== 'CONFORMS' && !f.closedOn)).length,
      instrumentsOverdue: instrumentsRows.filter((x) => !x.deletedAt && instrumentStatus(x) === 'OVERDUE').length,
    }
  }, [liveInspections, liveNcrs, liveCapas, liveComplaints, liveAudits, instrumentsRows])

  /** Yield and rejection broken down by the stage that caught it. */
  const byStage = useMemo(
    () =>
      STAGES.map((stage) => {
        const of = liveInspections.filter((i) => i.stage === stage && i.status === 'COMPLETED')
        const inspected = of.reduce((s, i) => s + i.lotSize, 0)
        const rejected = of.reduce((s, i) => s + i.rejectedQty, 0)
        const accepted = of.filter((i) => i.disposition === 'ACCEPTED').length
        return {
          stage,
          label: STAGE_LABEL[stage],
          lots: of.length,
          inspected,
          rejected,
          fpyPct: of.length ? (accepted / of.length) * 100 : 0,
          rejectionPct: inspected > 0 ? (rejected / inspected) * 100 : 0,
          ppm: ppm(rejected, inspected),
        }
      }).filter((r) => r.lots > 0),
    [liveInspections],
  )

  const pareto = useMemo(
    () => paretoOf(stageFilter === 'ALL' ? liveInspections : liveInspections.filter((i) => i.stage === stageFilter)),
    [liveInspections, stageFilter],
  )

  const scoredSuppliers = useMemo(
    () => supplierQualityRows.filter((r) => !r.deletedAt).map(scoreSupplier).sort((a, b) => b.score - a.score),
    [supplierQualityRows],
  )

  /** Every action item across NCR, CAPA, complaints and audits, in one list. */
  const actions = useMemo(() => {
    const out: { source: string; ref: string; what: string; owner: string; dueOn: string; overdue: number; status: string }[] = []
    for (const n of liveNcrs) {
      if (n.status === 'CLOSED' || n.status === 'CANCELLED') continue
      out.push({ source: 'NCR', ref: n.docNo, what: n.description, owner: n.owner || n.raisedBy, dueOn: n.dueOn, overdue: overdueDays(n.dueOn, n.closedOn), status: n.status })
    }
    for (const c of liveCapas) {
      if (c.status === 'CLOSED' || c.status === 'CANCELLED') continue
      out.push({ source: 'CAPA', ref: c.docNo, what: c.correctiveAction || c.title, owner: c.owner, dueOn: c.dueOn, overdue: overdueDays(c.dueOn, c.closedOn), status: c.status })
    }
    for (const c of liveComplaints) {
      if (['CLOSED', 'REJECTED'].includes(c.status)) continue
      out.push({ source: 'Complaint', ref: c.docNo, what: `${c.customerName} — ${c.complaintType}`, owner: c.owner, dueOn: c.dueOn, overdue: overdueDays(c.dueOn, c.closedOn), status: c.status })
    }
    for (const a of liveAudits) {
      for (const f of a.findings) {
        if (f.grade === 'CONFORMS' || f.closedOn) continue
        out.push({ source: 'Audit', ref: `${a.docNo} · ${f.clause}`, what: f.action || f.description, owner: f.owner, dueOn: f.dueOn, overdue: overdueDays(f.dueOn, f.closedOn), status: f.grade })
      }
    }
    return out.sort((a, b) => b.overdue - a.overdue || a.dueOn.localeCompare(b.dueOn))
  }, [liveNcrs, liveCapas, liveComplaints, liveAudits])

  /** Cost of poor quality broken out by where it was incurred. */
  const costRows = useMemo(() => {
    const c = summary.cost
    const inspectionEffort = liveInspections.filter((i) => i.status === 'COMPLETED').length * 350 // notional cost per inspection
    return [
      { head: 'Internal failure — scrap', value: c.scrap, kind: 'Failure' },
      { head: 'Internal failure — rework', value: c.rework, kind: 'Failure' },
      { head: 'External failure — customer complaints', value: c.complaints, kind: 'Failure' },
      { head: 'Appraisal — inspection effort', value: inspectionEffort, kind: 'Appraisal' },
    ]
  }, [summary.cost, liveInspections])

  const costTotal = costRows.reduce((s, r) => s + r.value, 0)
  const failureTotal = costRows.filter((r) => r.kind === 'Failure').reduce((s, r) => s + r.value, 0)

  const causeMix = useMemo(() => {
    const diagnosed = [...liveNcrs.filter((n) => n.causeCategory), ...liveComplaints.filter((c) => c.causeCategory)]
    return CAUSE_CATEGORIES.map((cause) => ({
      label: CAUSE_LABEL[cause],
      count: diagnosed.filter((x) => x.causeCategory === cause).length,
    })).filter((r) => r.count > 0)
  }, [liveNcrs, liveComplaints])

  const liveQualityTrend = useMemo(() => {
    const months = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthLabel = d.toLocaleString('en-US', { month: 'short' })
      const year = d.getFullYear()
      const monthIndex = d.getMonth()
      
      const isSameMonth = (dateStr: string) => {
        const dt = new Date(dateStr)
        return dt.getFullYear() === year && dt.getMonth() === monthIndex
      }
      
      const inspThisMonth = liveInspections.filter(x => x.createdAt && isSameMonth(x.createdAt))
      const fpy = firstPassYield(inspThisMonth)
      
      const iqcThisMonth = inspThisMonth.filter(x => x.stage === 'IQC')
      const iqcAcceptance = iqcThisMonth.length > 0 ? (iqcThisMonth.filter(x => x.disposition === 'ACCEPTED').length / iqcThisMonth.length) * 100 : 0
      
      const inspInspected = inspThisMonth.reduce((s, x) => s + x.lotSize, 0)
      const inspRejected = inspThisMonth.reduce((s, x) => s + x.rejectedQty, 0)
      const internalPpm = ppm(inspRejected, inspInspected)
      
      const complaintsThisMonth = liveComplaints.filter(x => x.loggedOn && isSameMonth(x.loggedOn))
      
      const supplierPpm = iqcThisMonth.length > 0 ? ppm(iqcThisMonth.reduce((s, x) => s + x.rejectedQty, 0), iqcThisMonth.reduce((s, x) => s + x.lotSize, 0)) : 0
      
      months.push({
        month: monthLabel,
        fpyPct: fpy.fpyPct || 0,
        incomingAcceptPct: iqcAcceptance,
        internalPpm: internalPpm,
        supplierPpm: supplierPpm,
        complaints: complaintsThisMonth.length
      })
    }
    return months
  }, [liveInspections, liveComplaints])

  /* ── export ─────────────────────────────────────────────────── */

  const exportCurrent = (format: ExportFormat) => {
    let n = 0
    if (tab === 'stage') {
      const cols: ExportColumn<(typeof byStage)[number]>[] = [
        { header: 'Stage', value: (r) => r.label },
        { header: 'Lots', value: (r) => r.lots },
        { header: 'Units inspected', value: (r) => r.inspected },
        { header: 'Units rejected', value: (r) => r.rejected },
        { header: 'First pass yield %', value: (r) => r.fpyPct.toFixed(2) },
        { header: 'Rejection %', value: (r) => r.rejectionPct.toFixed(2) },
        { header: 'PPM', value: (r) => Math.round(r.ppm) },
      ]
      n = exportRows(format, 'quality-by-stage', 'Quality by inspection stage', cols, byStage)
    } else if (tab === 'defects') {
      const cols: ExportColumn<(typeof pareto)[number]>[] = [
        { header: 'Defect code', value: (r) => r.code },
        { header: 'Defect', value: (r) => r.name },
        { header: 'Severity', value: (r) => r.severity },
        { header: 'Quantity', value: (r) => r.qty },
        { header: 'Share %', value: (r) => r.pct.toFixed(2) },
        { header: 'Cumulative %', value: (r) => r.cumulativePct.toFixed(2) },
        { header: 'Vital few', value: (r) => (r.isVital ? 'Yes' : 'No') },
      ]
      n = exportRows(format, 'defect-pareto', 'Defect Pareto', cols, pareto)
    } else if (tab === 'suppliers') {
      const cols: ExportColumn<(typeof suppliers)[number]>[] = [
        { header: 'Supplier code', value: (r) => r.supplierCode },
        { header: 'Supplier', value: (r) => r.supplierName },
        { header: 'Lot acceptance %', value: (r) => r.lotAcceptancePct.toFixed(1) },
        { header: 'PPM', value: (r) => Math.round(r.ppm) },
        { header: 'Document compliance %', value: (r) => r.documentCompliancePct.toFixed(1) },
        { header: 'NCR closure %', value: (r) => r.ncrClosurePct.toFixed(1) },
        { header: 'CAPA response days', value: (r) => r.capaResponseDays },
        { header: 'Score', value: (r) => r.score.toFixed(1) },
        { header: 'Grade', value: (r) => r.grade },
      ]
      n = exportRows(format, 'supplier-scorecard', 'Supplier quality scorecard', cols, scoredSuppliers)
    } else if (tab === 'actions') {
      const cols: ExportColumn<(typeof actions)[number]>[] = [
        { header: 'Source', value: (r) => r.source },
        { header: 'Reference', value: (r) => r.ref },
        { header: 'Action', value: (r) => r.what },
        { header: 'Owner', value: (r) => r.owner },
        { header: 'Due', value: (r) => r.dueOn },
        { header: 'Days overdue', value: (r) => r.overdue },
        { header: 'Status', value: (r) => r.status },
      ]
      n = exportRows(format, 'open-quality-actions', 'Open quality actions', cols, actions)
    } else if (tab === 'cost') {
      const cols: ExportColumn<(typeof costRows)[number]>[] = [
        { header: 'Head', value: (r) => r.head },
        { header: 'Category', value: (r) => r.kind },
        { header: 'Amount', value: (r) => Math.round(r.value) },
      ]
      n = exportRows(format, 'cost-of-poor-quality', 'Cost of poor quality', cols, costRows)
    } else {
      const rows = byStage
      const cols: ExportColumn<(typeof byStage)[number]>[] = [
        { header: 'Stage', value: (r) => r.label },
        { header: 'Lots', value: (r) => r.lots },
        { header: 'First pass yield %', value: (r) => r.fpyPct.toFixed(2) },
        { header: 'PPM', value: (r) => Math.round(r.ppm) },
      ]
      n = exportRows(format, 'quality-summary', 'Quality summary', cols, rows)
    }
    toast.success('Export ready', `${n} rows written.`)
  }

  return (
    <div>
      <PageHeader
        title="Quality reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'Reports' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Download />} onClick={() => exportCurrent('xlsx')}>Excel</Button>
            <Button variant="outline" size="sm" icon={<FileText />} onClick={() => exportCurrent('pdf')}>PDF</Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'summary', label: 'Summary' },
              { id: 'stage', label: 'By stage', count: byStage.length },
              { id: 'defects', label: 'Defect Pareto', count: pareto.length },
              { id: 'suppliers', label: 'Suppliers', count: scoredSuppliers.length },
              { id: 'actions', label: 'Open actions', count: actions.length },
              { id: 'cost', label: 'Cost of quality' },
            ]}
          />
        }
      />

      {/* ─────────────────────── Summary ─────────────────────── */}
      {tab === 'summary' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="First pass yield" value={pct(summary.fpy.fpyPct)} sub={`${summary.fpy.passed} of ${summary.fpy.total} lots passed outright`} tone={summary.fpy.fpyPct >= 95 ? 'success' : summary.fpy.fpyPct >= 90 ? 'warning' : 'danger'} />
            <StatTile label="Rejection PPM" value={Math.round(summary.ppm).toLocaleString('en-IN')} sub={`${summary.rejected.toLocaleString('en-IN')} rejected of ${summary.inspected.toLocaleString('en-IN')} inspected`} tone={summary.ppm > 5000 ? 'danger' : summary.ppm > 2000 ? 'warning' : 'success'} />
            <StatTile label="Cost of poor quality" value={inr(costTotal)} sub={`${inr(failureTotal)} of it failure cost`} tone="warning" />
            <StatTile label="Open actions" value={actions.length} sub={`${actions.filter((a) => a.overdue > 0).length} past their due date`} tone={actions.filter((a) => a.overdue > 0).length ? 'danger' : 'success'} />
          </div>

          {summary.instrumentsOverdue > 0 && (
            <Alert tone="danger" title={`${summary.instrumentsOverdue} instrument${summary.instrumentsOverdue === 1 ? ' is' : 's are'} overdue for calibration`} className="mb-4">
              Every reading taken on an overdue instrument is unverifiable, which puts the results in this report in question until they are recalled.
            </Alert>
          )}

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Yield and acceptance" description="Six months — first pass yield against incoming acceptance" />
              <CardBody className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={liveQualityTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[88, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<ChartTip suffix="%" />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    <Line type="monotone" dataKey="fpyPct" name="First pass yield" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="incomingAcceptPct" name="Incoming acceptance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Defect rate" description="Internal against supplier PPM, with complaints overlaid" />
              <CardBody className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={liveQualityTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="l" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={26} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    <Bar yAxisId="l" dataKey="internalPpm" name="Internal PPM" fill="#f59e0b" maxBarSize={22} radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="l" dataKey="supplierPpm" name="Supplier PPM" fill="#94a3b8" maxBarSize={22} radius={[3, 3, 0, 0]} />
                    <Line yAxisId="r" type="monotone" dataKey="complaints" name="Complaints" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </div>

          <Section title="Where quality stands">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard title="Inspection" rows={[
                { label: 'Lots completed', value: String(summary.inspections) },
                { label: 'Awaiting inspection', value: String(summary.pending) },
                { label: 'Acceptance rate', value: pct(summary.acceptance), note: 'including accepted with deviation' },
                { label: 'Rejection', value: pct(summary.rejection) },
              ]} />
              <MetricCard title="Non-conformance" rows={[
                { label: 'NCRs open', value: String(summary.ncrOpen) },
                { label: 'CAPAs open', value: String(summary.capaStats.open) },
                { label: 'CAPAs overdue', value: String(summary.capaStats.overdue), tone: summary.capaStats.overdue ? 'danger' : undefined },
                { label: 'Average closure', value: summary.capaStats.avgDays === null ? '—' : `${summary.capaStats.avgDays.toFixed(0)} days` },
              ]} />
              <MetricCard title="External and system" rows={[
                { label: 'Complaints open', value: String(summary.complaintsOpen) },
                { label: 'Audit findings open', value: String(summary.auditFindingsOpen) },
                { label: 'Instruments overdue', value: String(summary.instrumentsOverdue), tone: summary.instrumentsOverdue ? 'danger' : undefined },
                { label: 'Suppliers blocked', value: String(scoredSuppliers.filter((s) => s.grade === 'BLOCKED').length) },
              ]} />
            </div>
          </Section>

          {causeMix.length > 0 && (
            <Card className="mt-4">
              <CardHeader title="Root causes across NCRs and complaints" description="Where the failures actually come from" />
              <CardBody className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={causeMix} dataKey="count" nameKey="label" innerRadius={44} outerRadius={72} paddingAngle={2}>
                      {causeMix.map((_, i) => (<Cell key={i} fill={['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#64748b'][i % 6]} />))}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* ─────────────────────── By stage ─────────────────────── */}
      {tab === 'stage' && (
        <>
          <Alert tone="info" title="Reading this table" className="mb-4">
            A defect caught at incoming costs the price of the material. The same defect caught at outgoing costs the price of the finished bottle plus the work put into it.
            Rejection concentrated at the late stages is the expensive pattern, whatever the total yield says.
          </Alert>

          <Card className="mb-4">
            <CardHeader title="First pass yield by stage" />
            <CardBody className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={byStage} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={42} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar yAxisId="l" dataKey="fpyPct" name="First pass yield %" maxBarSize={38} radius={[3, 3, 0, 0]}>
                    {byStage.map((r, i) => (<Cell key={i} fill={r.fpyPct >= 95 ? '#10b981' : r.fpyPct >= 90 ? '#f59e0b' : '#ef4444'} />))}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="ppm" name="PPM" stroke="#64748b" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '12rem' }}>Stage</th>
                      <th className="text-right" style={{ width: '7rem' }}>Lots</th>
                      <th className="text-right" style={{ width: '11rem' }}>Inspected</th>
                      <th className="text-right" style={{ width: '11rem' }}>Rejected</th>
                      <th style={{ width: '14rem' }}>First pass yield</th>
                      <th className="text-right" style={{ width: '10rem' }}>Rejection</th>
                      <th className="text-right" style={{ width: '10rem' }}>PPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byStage.map((r) => (
                      <tr key={r.stage}>
                        <td><StageBadge stage={r.stage} /></td>
                        <td className="text-right text-xs tabular text-fg">{r.lots}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{r.inspected.toLocaleString('en-IN')}</td>
                        <td className="text-right text-xs tabular text-fg">{r.rejected.toLocaleString('en-IN')}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={r.fpyPct} tone={r.fpyPct >= 95 ? 'success' : r.fpyPct >= 90 ? 'warning' : 'danger'} className="w-16" />
                            <span className={cn('text-2xs tabular', r.fpyPct >= 95 ? 'text-success' : r.fpyPct >= 90 ? 'text-warning' : 'text-danger')}>{pct(r.fpyPct)}</span>
                          </div>
                        </td>
                        <td className="text-right text-xs tabular text-fg">{pct(r.rejectionPct)}</td>
                        <td className={cn('text-right text-xs tabular', r.ppm > 5000 ? 'text-danger' : 'text-fg-muted')}>{Math.round(r.ppm).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2">
                      <td className="text-xs font-semibold text-fg">All stages</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{summary.inspections}</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{summary.inspected.toLocaleString('en-IN')}</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{summary.rejected.toLocaleString('en-IN')}</td>
                      <td className="text-xs font-semibold tabular text-fg">{pct(summary.fpy.fpyPct)}</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{pct(summary.rejection)}</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{Math.round(summary.ppm).toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {/* ─────────────────────── Defect Pareto ─────────────────────── */}
      {tab === 'defects' && (
        <>
          <Card className="mb-3">
            <CardBody className="flex flex-wrap items-end gap-3">
              <Select label="Stage" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as InspectionStage | 'ALL')} className="w-48">
                <option value="ALL">Every stage</option>
                {STAGES.map((s) => (<option key={s} value={s}>{STAGE_LABEL[s]}</option>))}
              </Select>
              <span className="ml-auto text-2xs text-fg-subtle">
                {pareto.filter((r) => r.isVital).length} of {pareto.length} defect types account for the first 80% of the loss
              </span>
            </CardBody>
          </Card>

          {pareto.length === 0 ? (
            <Alert tone="tip" title="No defects recorded">Nothing has been rejected at this stage.</Alert>
          ) : (
            <>
              <Card className="mb-4">
                <CardHeader title="Pareto" description="Bars are quantity, the line is the running cumulative — the vital few sit left of 80%" />
                <CardBody className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={pareto} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={54} />
                      <YAxis yAxisId="l" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} />
                      <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={42} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                      <Bar yAxisId="l" dataKey="qty" name="Quantity" maxBarSize={30} radius={[3, 3, 0, 0]}>
                        {pareto.map((r, i) => (<Cell key={i} fill={r.isVital ? '#ef4444' : '#cbd5e1'} />))}
                      </Bar>
                      <Line yAxisId="r" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="p-0">
                  <div className="overflow-x-auto">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th style={{ width: '9rem' }}>Code</th>
                          <th>Defect</th>
                          <th style={{ width: '8rem' }}>Severity</th>
                          <th className="text-right" style={{ width: '9rem' }}>Quantity</th>
                          <th className="text-right" style={{ width: '9rem' }}>Share</th>
                          <th style={{ width: '14rem' }}>Cumulative</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pareto.map((r) => (
                          <tr key={r.code} className={r.isVital ? 'bg-danger/5' : undefined}>
                            <td className="font-mono text-2xs text-fg-muted">{r.code}</td>
                            <td>
                              <p className="text-xs text-fg">{r.name}</p>
                              {r.isVital && <p className="text-3xs text-danger">Vital few — worth a CAPA</p>}
                            </td>
                            <td><SeverityBadge severity={r.severity} /></td>
                            <td className="text-right text-xs tabular text-fg">{r.qty.toLocaleString('en-IN')}</td>
                            <td className="text-right text-xs tabular text-fg-muted">{pct(r.pct)}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <ProgressBar value={r.cumulativePct} tone={r.isVital ? 'danger' : 'brand'} className="w-16" />
                                <span className="text-2xs tabular text-fg-muted">{pct(r.cumulativePct)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}

      {/* ─────────────────────── Suppliers ─────────────────────── */}
      {tab === 'suppliers' && (
        <>
          <Alert tone="info" title="How the score is built" className="mb-4">
            Lot acceptance 35%, PPM 30%, document compliance 15%, NCR closure 10%, CAPA response 10%.
            A supplier above 5,000 PPM is capped at conditional however good the paperwork — a grade earnable with documentation while the material keeps failing is worse than no grade.
          </Alert>

          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '18rem' }}>Supplier</th>
                      <th className="text-right" style={{ width: '10rem' }}>Lot acceptance</th>
                      <th className="text-right" style={{ width: '9rem' }}>PPM</th>
                      <th className="text-right" style={{ width: '10rem' }}>Documents</th>
                      <th className="text-right" style={{ width: '10rem' }}>NCR closure</th>
                      <th className="text-right" style={{ width: '10rem' }}>CAPA response</th>
                      <th style={{ width: '13rem' }}>Score</th>
                      <th style={{ width: '9rem' }}>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoredSuppliers.map((s) => (
                      <tr key={s.supplierCode} className={s.grade === 'BLOCKED' ? 'bg-danger/5' : undefined}>
                        <td>
                          <p className="text-xs text-fg">{s.supplierName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{s.supplierCode}</p>
                          <p className="mt-0.5 text-3xs text-fg-subtle">{s.reasons[0]}</p>
                        </td>
                        <td className="text-right text-xs tabular text-fg">{pct(s.lotAcceptancePct)}</td>
                        <td className={cn('text-right text-xs tabular', s.ppm > 5000 ? 'text-danger' : 'text-fg-muted')}>{Math.round(s.ppm).toLocaleString('en-IN')}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{pct(s.documentCompliancePct)}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{pct(s.ncrClosurePct)}</td>
                        <td className={cn('text-right text-xs tabular', s.capaResponseDays > 7 ? 'text-warning' : 'text-fg-muted')}>{s.capaResponseDays} d</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={s.score} tone={s.score >= 90 ? 'success' : s.score >= 75 ? 'brand' : s.score >= 60 ? 'warning' : 'danger'} className="w-16" />
                            <span className="text-2xs tabular text-fg">{s.score.toFixed(0)}</span>
                          </div>
                        </td>
                        <td><GradeBadge grade={s.grade} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {/* ─────────────────────── Open actions ─────────────────────── */}
      {tab === 'actions' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Open actions" value={actions.length} sub="Across NCR, CAPA, complaints and audits" tone={actions.length ? 'warning' : 'success'} />
            <StatTile label="Overdue" value={actions.filter((a) => a.overdue > 0).length} sub="Past the date committed" tone={actions.filter((a) => a.overdue > 0).length ? 'danger' : 'success'} />
            <StatTile label="Oldest" value={actions.length ? `${Math.max(...actions.map((a) => a.overdue))} d` : '—'} sub="Days past due on the worst one" tone="danger" />
            <StatTile label="Unassigned" value={actions.filter((a) => !a.owner.trim()).length} sub="Nobody accountable" tone={actions.filter((a) => !a.owner.trim()).length ? 'danger' : 'success'} />
          </div>

          {actions.length === 0 ? (
            <Alert tone="tip" title="Nothing open">Every non-conformity, CAPA, complaint and audit finding has been closed.</Alert>
          ) : (
            <Card>
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th style={{ width: '8rem' }}>Source</th>
                        <th style={{ width: '15rem' }}>Reference</th>
                        <th>What has to happen</th>
                        <th style={{ width: '12rem' }}>Owner</th>
                        <th style={{ width: '9rem' }}>Due</th>
                        <th style={{ width: '9rem' }}>Overdue</th>
                        <th style={{ width: '12rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actions.map((a, i) => (
                        <tr key={`${a.ref}-${i}`} className={a.overdue > 0 ? 'bg-danger/5' : undefined}>
                          <td>
                            <Badge tone={a.source === 'NCR' ? 'warning' : a.source === 'CAPA' ? 'brand' : a.source === 'Complaint' ? 'danger' : 'progress'} size="sm" dot={false}>{a.source}</Badge>
                          </td>
                          <td className="font-mono text-2xs text-fg-muted">{a.ref}</td>
                          <td><p className="truncate text-xs text-fg-muted" title={a.what}>{a.what}</p></td>
                          <td className={cn('text-2xs', a.owner.trim() ? 'text-fg-muted' : 'text-danger')}>{a.owner.trim() || 'Unassigned'}</td>
                          <td className="text-2xs tabular text-fg-muted">{a.dueOn ? formatDate(a.dueOn) : '—'}</td>
                          <td>{a.overdue > 0 ? <Badge tone="danger" size="sm">{a.overdue} d</Badge> : <span className="text-2xs text-success">On time</span>}</td>
                          <td><QmsStatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* ─────────────────────── Cost of quality ─────────────────────── */}
      {tab === 'cost' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total cost of quality" value={inr(costTotal)} sub="Failure plus appraisal" tone="warning" />
            <StatTile label="Failure cost" value={inr(failureTotal)} sub={`${costTotal > 0 ? ((failureTotal / costTotal) * 100).toFixed(0) : 0}% of the total`} tone="danger" />
            <StatTile label="Internal failure" value={inr(summary.cost.scrap + summary.cost.rework)} sub="Scrap and rework caught in-house" tone="warning" />
            <StatTile label="External failure" value={inr(summary.cost.complaints)} sub="Reached the customer" tone={summary.cost.complaints > 0 ? 'danger' : 'success'} />
          </div>

          <Alert tone="info" title="Why the split matters" className="mb-4">
            Appraisal is what you spend to find defects; failure is what they cost once made. Failure running well above appraisal says the money is in the wrong place —
            more inspection is cheaper than more scrap, and both are dearer than not making the defect.
          </Alert>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Where the money went" />
              <CardBody className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costRows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `${((v as number) / 1000).toFixed(0)}K`} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="head" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={150} />
                    <Tooltip content={<ChartTip prefix="₹" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Bar dataKey="value" name="Cost" maxBarSize={22} radius={[0, 3, 3, 0]}>
                      {costRows.map((r, i) => (<Cell key={i} fill={r.kind === 'Failure' ? '#ef4444' : '#3b82f6'} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Breakdown" />
              <CardBody className="p-0">
                <table className="grid-table">
                  <thead><tr><th>Head</th><th style={{ width: '9rem' }}>Category</th><th className="text-right" style={{ width: '12rem' }}>Amount</th><th className="text-right" style={{ width: '8rem' }}>Share</th></tr></thead>
                  <tbody>
                    {costRows.map((r) => (
                      <tr key={r.head}>
                        <td className="text-xs text-fg">{r.head}</td>
                        <td><Badge tone={r.kind === 'Failure' ? 'danger' : 'brand'} size="sm" dot={false}>{r.kind}</Badge></td>
                        <td className="text-right text-xs tabular text-fg">{inr(r.value)}</td>
                        <td className="text-right text-2xs tabular text-fg-muted">{costTotal > 0 ? pct((r.value / costTotal) * 100) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2">
                      <td className="text-xs font-semibold text-fg">Total</td>
                      <td />
                      <td className="text-right text-xs font-semibold tabular text-fg">{inr(costTotal)}</td>
                      <td className="text-right text-2xs font-semibold tabular text-fg">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ title, rows }: { title: string; rows: { label: string; value: string; note?: string; tone?: 'danger' }[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-fg-muted">
              {r.label}
              {r.note && <span className="block text-3xs text-fg-subtle">{r.note}</span>}
            </span>
            <span className={cn('text-sm font-medium tabular', r.tone === 'danger' ? 'text-danger' : 'text-fg')}>{r.value}</span>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}
