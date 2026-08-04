import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ClipboardCheck, FileWarning, Gauge, IndianRupee, PackageX, Ruler, ShieldAlert, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { ChartTip, DispositionBadge, GradeBadge, NcrStatusBadge, SeverityBadge, StageBadge, useQualityData } from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { formatAmount, formatCompact, formatDate } from '@/lib/format'
import {
  acceptanceRate,
  calibrationBlocks,
  capaClosureDays,
  copq,
  firstPassYield,
  instrumentStatus,
  overdueDays,
  paretoOf,
  ppm,
  rejectionPct,
  scoreSupplier,
} from '@/lib/qmsFlow'
import { qualityTrend } from '@/mock/quality'

/**
 * Quality dashboard (Ch 4 and 21).
 *
 * Everything is computed off the same records the rest of the portal reads, so
 * the dashboard cannot disagree with the screen you click into. These are the
 * only KPI cards in the portal.
 */

export function QualityDashboardPage() {
  const navigate = useNavigate()
  const { inspections, ncrs, capas, complaints, instruments, supplierQuality, audits } = useQualityData()

  const kpis = useMemo(() => {
    const done = inspections.rows.filter((i) => i.status === 'COMPLETED')
    const incoming = done.filter((i) => i.stage === 'IQC')
    const openInspections = inspections.rows.filter((i) => i.status !== 'COMPLETED' && i.status !== 'CANCELLED')
    const blockedByCalibration = openInspections.filter((i) => calibrationBlocks(i, instruments.rows).length > 0)

    const openNcrs = ncrs.rows.filter((n) => !['CLOSED', 'CANCELLED'].includes(n.status))
    const capaStats = capaClosureDays(capas.rows)
    const openComplaints = complaints.rows.filter((c) => !['CLOSED', 'REJECTED'].includes(c.status))

    const dueInstruments = instruments.rows.filter((i) => ['DUE', 'OVERDUE'].includes(instrumentStatus(i)))
    const overdueInstruments = instruments.rows.filter((i) => instrumentStatus(i) === 'OVERDUE')

    const internalRejected = done.filter((i) => i.stage !== 'IQC').reduce((s, i) => s + i.rejectedQty, 0)
    const internalInspected = done.filter((i) => i.stage !== 'IQC').reduce((s, i) => s + i.lotSize, 0)
    const supplierRejected = incoming.reduce((s, i) => s + i.rejectedQty, 0)
    const supplierInspected = incoming.reduce((s, i) => s + i.lotSize, 0)

    const openFindings = audits.rows.flatMap((a) => a.findings).filter((f) => f.grade !== 'CONFORMS' && !f.closedOn)

    return {
      fpy: firstPassYield(inspections.rows),
      acceptance: acceptanceRate(inspections.rows),
      incomingAcceptance: acceptanceRate(incoming),
      rejection: rejectionPct(inspections.rows),
      internalPpm: ppm(internalRejected, internalInspected),
      supplierPpm: ppm(supplierRejected, supplierInspected),
      openInspections,
      blockedByCalibration,
      openNcrs,
      overdueNcrs: openNcrs.filter((n) => overdueDays(n.dueOn, n.closedOn) > 0),
      criticalNcrs: openNcrs.filter((n) => n.severity === 'CRITICAL'),
      capaStats,
      openComplaints,
      dueInstruments,
      overdueInstruments,
      openFindings,
      copq: copq(ncrs.rows, complaints.rows),
      pareto: paretoOf(inspections.rows),
      suppliers: supplierQuality.rows.map(scoreSupplier).sort((a, b) => a.score - b.score),
    }
  }, [inspections.rows, ncrs.rows, capas.rows, complaints.rows, instruments.rows, supplierQuality.rows, audits.rows])

  const actionQueue = [
    { label: 'Inspections waiting on a result', count: kpis.openInspections.length, to: '/quality/inspections', icon: ClipboardCheck, tone: 'pending' as const },
    { label: 'Inspections blocked by calibration', count: kpis.blockedByCalibration.length, to: '/quality/inspections', icon: ShieldAlert, tone: 'danger' as const },
    { label: 'Critical non-conformances open', count: kpis.criticalNcrs.length, to: '/quality/ncr', icon: AlertTriangle, tone: 'danger' as const },
    { label: 'NCRs past their due date', count: kpis.overdueNcrs.length, to: '/quality/ncr', icon: FileWarning, tone: 'warning' as const },
    { label: 'CAPAs overdue', count: kpis.capaStats.overdue, to: '/quality/capa', icon: TrendingUp, tone: 'warning' as const },
    { label: 'Instruments due or overdue', count: kpis.dueInstruments.length, to: '/quality/calibration', icon: Ruler, tone: 'warning' as const },
    { label: 'Customer complaints open', count: kpis.openComplaints.length, to: '/quality/ncr', icon: PackageX, tone: 'progress' as const },
    { label: 'Audit findings still open', count: kpis.openFindings.length, to: '/quality/ncr', icon: Gauge, tone: 'progress' as const },
  ]

  const paretoChart = kpis.pareto.slice(0, 8).map((p) => ({ name: p.code, Quantity: p.qty, Cumulative: Number(p.cumulativePct.toFixed(1)) }))

  return (
    <div>
      <PageHeader
        title="Quality"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/quality/plans')}>Inspection plans</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/quality/inspections')}>Open inspections</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="First pass yield" value={`${kpis.fpy.fpyPct.toFixed(1)}%`} sub={`${kpis.fpy.passed} of ${kpis.fpy.total} lots accepted outright`} icon={<ClipboardCheck />} tone={kpis.fpy.fpyPct >= 95 ? 'success' : kpis.fpy.fpyPct >= 90 ? 'warning' : 'danger'} onClick={() => navigate('/quality/inspections')} />
        <StatTile label="Incoming acceptance" value={`${kpis.incomingAcceptance.toFixed(1)}%`} sub={`Supplier PPM ${Math.round(kpis.supplierPpm).toLocaleString('en-IN')}`} icon={<PackageX />} tone={kpis.incomingAcceptance >= 95 ? 'success' : 'warning'} onClick={() => navigate('/quality/suppliers')} />
        <StatTile label="Internal PPM" value={Math.round(kpis.internalPpm).toLocaleString('en-IN')} sub={`Rejection ${kpis.rejection.toFixed(2)}% of quantity inspected`} icon={<AlertTriangle />} tone={kpis.internalPpm > 5000 ? 'danger' : kpis.internalPpm > 2000 ? 'warning' : 'success'} onClick={() => navigate('/quality/defects')} />
        <StatTile label="Cost of poor quality" value={`₹${formatCompact(kpis.copq.total)}`} sub={`Scrap ₹${formatCompact(kpis.copq.scrap)} · rework ₹${formatCompact(kpis.copq.rework)} · complaints ₹${formatCompact(kpis.copq.complaints)}`} icon={<IndianRupee />} tone={kpis.copq.total > 100_000 ? 'danger' : 'warning'} onClick={() => navigate('/quality/ncr')} />
      </div>

      <Section title="Needs attention">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {actionQueue.map((a) => (
            <Link key={a.label} to={a.to} className={cn('card flex items-center gap-3 p-3 transition-colors hover:border-border-strong hover:bg-surface-2', a.count === 0 && 'opacity-55')}>
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded [&>svg]:h-4 [&>svg]:w-4', a.tone === 'danger' && 'bg-danger/10 text-danger', a.tone === 'warning' && 'bg-warning/10 text-warning', a.tone === 'pending' && 'bg-pending/10 text-pending', a.tone === 'progress' && 'bg-progress/10 text-progress')}>
                <a.icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold leading-none text-fg tabular">{a.count}</span>
                <span className="mt-1 block truncate text-xs text-fg-muted">{a.label}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            </Link>
          ))}
        </div>
      </Section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Quality trend" description="First pass yield and incoming acceptance against internal and supplier PPM" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={qualityTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" domain={[85, 100]} unit="%" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={42} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
                <Bar yAxisId="r" dataKey="internalPpm" name="Internal PPM" fill="#f59e0b" maxBarSize={18} radius={[2, 2, 0, 0]} />
                <Bar yAxisId="r" dataKey="supplierPpm" name="Supplier PPM" fill="#94a3b8" maxBarSize={18} radius={[2, 2, 0, 0]} />
                <Line yAxisId="l" type="monotone" dataKey="fpyPct" name="FPY %" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="l" type="monotone" dataKey="incomingAcceptPct" name="Incoming accept %" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Defect Pareto" description="The vital few, in red" />
          <CardBody className="h-64">
            {!paretoChart.length ? (<p className="text-xs text-fg-subtle">No defects recorded.</p>) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={26} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <ReferenceLine yAxisId="r" y={80} stroke="#ef4444" strokeDasharray="4 3" />
                  <Bar yAxisId="l" dataKey="Quantity" radius={[2, 2, 0, 0]} maxBarSize={24}>
                    {paretoChart.map((c, i) => (<Cell key={c.name} fill={kpis.pareto[i]?.isVital ? '#ef4444' : '#94a3b8'} />))}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="Cumulative" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Open non-conformances" description="What is still live, worst first" actions={<Button variant="ghost" size="sm" onClick={() => navigate('/quality/ncr')}>Open</Button>} />
          <CardBody className="p-0">
            {!kpis.openNcrs.length ? (<p className="p-4 text-xs text-fg-subtle">Nothing open. Every non-conformance has been closed through a CAPA.</p>) : (
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th>NCR</th><th>Issue</th><th style={{ width: '6.5rem' }}>Severity</th><th className="text-right" style={{ width: '8rem' }}>Cost</th><th style={{ width: '8rem' }}>Due</th><th style={{ width: '11rem' }}>Status</th></tr></thead>
                  <tbody>
                    {kpis.openNcrs.map((n) => (
                      <tr key={n.uid} className={overdueDays(n.dueOn, n.closedOn) > 0 ? 'bg-danger/5' : undefined}>
                        <td className="font-mono text-2xs font-medium text-brand-600">{n.docNo}</td>
                        <td><p className="max-w-[18rem] truncate text-xs text-fg">{n.title}</p><p className="font-mono text-2xs text-fg-subtle">{n.itemCode}</p></td>
                        <td><SeverityBadge severity={n.severity} /></td>
                        <td className="text-right tabular text-xs">{n.costImpact ? `₹${formatAmount(n.costImpact)}` : '—'}</td>
                        <td className={cn('text-2xs', overdueDays(n.dueOn, n.closedOn) > 0 ? 'text-danger' : 'text-fg-muted')}>{formatDate(n.dueOn)}</td>
                        <td><NcrStatusBadge status={n.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Calibration" description="Instruments due or past due" />
            <CardBody className="space-y-2.5">
              {!kpis.dueInstruments.length ? (<p className="text-xs text-fg-subtle">Every instrument is inside its calibration interval.</p>) : (
                kpis.dueInstruments.slice(0, 5).map((i) => (
                  <Link key={i.uid} to="/quality/calibration" className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{i.name}</p><p className="font-mono text-2xs text-fg-subtle">{i.code} · due {formatDate(i.nextDueOn)}</p></div>
                    <Badge tone={instrumentStatus(i) === 'OVERDUE' ? 'danger' : 'warning'} size="sm">{instrumentStatus(i) === 'OVERDUE' ? 'Overdue' : 'Due'}</Badge>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Weakest suppliers" description="By computed score" />
            <CardBody className="space-y-2.5">
              {kpis.suppliers.slice(0, 4).map((s) => (
                <Link key={s.supplierCode} to="/quality/suppliers" className="block border-b border-border pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{s.supplierName}</p><p className="font-mono text-2xs text-fg-subtle">{s.supplierCode} · {Math.round(s.ppm).toLocaleString('en-IN')} PPM</p></div>
                    <GradeBadge grade={s.grade} />
                  </div>
                  <ProgressBar className="mt-1.5" value={s.score} tone={s.score >= 90 ? 'success' : s.score >= 75 ? 'brand' : s.score >= 60 ? 'warning' : 'danger'} showLabel />
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="CAPA" description="Closure performance" />
            <CardBody>
              <p className="text-2xl font-semibold tabular text-fg">{kpis.capaStats.avgDays === null ? '—' : `${kpis.capaStats.avgDays.toFixed(0)}d`}</p>
              <p className="mt-1 text-2xs text-fg-muted">average from raising to closure · {kpis.capaStats.open} open, {kpis.capaStats.overdue} overdue</p>
              <Link to="/quality/capa" className="mt-2 inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">Open the CAPA register <ArrowRight className="h-3 w-3" /></Link>
            </CardBody>
          </Card>
        </div>
      </div>

      {kpis.blockedByCalibration.length > 0 && (
        <Section title="Blocked by calibration" className="mt-6">
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th>Inspection</th><th style={{ width: '7.5rem' }}>Stage</th><th>Item</th><th style={{ width: '11rem' }}>Disposition</th><th>Instrument out of calibration</th></tr></thead>
                  <tbody>
                    {kpis.blockedByCalibration.map((i) => (
                      <tr key={i.uid}>
                        <td className="font-mono text-2xs font-medium text-brand-600">{i.docNo}</td>
                        <td><StageBadge stage={i.stage} /></td>
                        <td className="text-xs">{i.itemCode}</td>
                        <td><DispositionBadge disposition={i.disposition} /></td>
                        <td className="text-2xs text-danger">{calibrationBlocks(i, instruments.rows).map((b) => `${b.instrumentCode} (${b.status.toLowerCase()})`).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
          <p className="mt-2 text-2xs text-fg-subtle">
            A reading taken with an instrument past its calibration date is not evidence. These inspections cannot be
            approved until the instrument is recalibrated and the affected checks retaken.
          </p>
        </Section>
      )}
    </div>
  )
}
