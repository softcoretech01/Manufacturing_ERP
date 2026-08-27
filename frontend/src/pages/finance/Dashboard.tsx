import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Banknote, Calculator, CalendarCheck, IndianRupee, Landmark, Receipt, Scale, TrendingUp, Wallet } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Amount, ChartTip, ReconcileBadge, VarianceChip, inr, inrCompact, useFinanceData } from '@/components/finance/FinShell'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import {
  accountBalance, ageing, balanceSheet, budgetStatus, closeReadiness, costVariance, gstReturn,
  money, profitAndLoss, reconcileSubledger, trialBalance,
} from '@/lib/finFlow'
import { financeTrend } from '@/mock/finance'

/**
 * Finance dashboard (Ch 4).
 *
 * Every figure comes from the same postings the statements read, so nothing
 * here can disagree with the trial balance. The integrity checks sit at the top
 * because a dashboard reporting a healthy margin off books that do not balance
 * is worse than no dashboard.
 */

export function FinanceDashboardPage() {
  const navigate = useNavigate()
  const fin = useFinanceData()
  const { accounts, journals, documents, budgets, periods, actualCosts, cards, assets } = fin

  const today = new Date().toISOString().slice(0, 10)
  const period = periods.rows.find((p) => p.status === 'OPEN') ?? periods.rows[periods.rows.length - 1]

  const k = useMemo(() => {
    const pl = profitAndLoss(accounts.rows, journals.rows, '2026-04-01', today)
    const bs = balanceSheet(accounts.rows, journals.rows, today, '2026-04-01')
    const tb = trialBalance(accounts.rows, journals.rows, today)

    const ar = ageing(documents.rows, 'CUSTOMER')
    const ap = ageing(documents.rows, 'SUPPLIER')
    const arTotal = money(ar.reduce((s, r) => s + r.total, 0))
    const apTotal = money(ap.reduce((s, r) => s + r.total, 0))
    const arOverdue = money(ar.reduce((s, r) => s + r.total - r.buckets['Not due'], 0))
    const apOverdue = money(ap.reduce((s, r) => s + r.total - r.buckets['Not due'], 0))

    const cash = money(['1100', '1110', '1120'].reduce((s, c) => s + accountBalance(c, journals.rows, accounts.rows, today), 0))
    const inventory = money(['1300', '1310', '1320', '1330'].reduce((s, c) => s + accountBalance(c, journals.rows, accounts.rows, today), 0))
    const wip = accountBalance('1310', journals.rows, accounts.rows, today)

    const currentAssets = money(cash + arTotal + inventory)
    const currentLiabilities = money(apTotal + Math.abs(accountBalance('2300', journals.rows, accounts.rows, today)) + Math.abs(accountBalance('2310', journals.rows, accounts.rows, today)))

    const arCheck = reconcileSubledger('1200', 'CUSTOMER', accounts.rows, journals.rows, documents.rows)
    const apCheck = reconcileSubledger('2100', 'SUPPLIER', accounts.rows, journals.rows, documents.rows)
    const unposted = journals.rows.filter((j) => j.status === 'DRAFT' || j.status === 'PENDING_APPROVAL')

    const budgetRows = budgetStatus(budgets.rows, accounts.rows, journals.rows)
    const overspent = budgetRows.filter((b) => b.isOverspent)

    const gst = gstReturn(documents.rows, today.slice(0, 7))
    const readiness = period ? closeReadiness(period, accounts.rows, journals.rows, documents.rows) : null

    const variances = actualCosts.rows
      .map((a) => { const c = cards.rows.find((x) => x.productCode === a.productCode); return c ? { actual: a, v: costVariance(a, c) } : null })
      .filter(Boolean) as { actual: (typeof actualCosts.rows)[number]; v: ReturnType<typeof costVariance> }[]
    const totalVariance = money(variances.reduce((s, x) => s + x.v.totalVariance, 0))

    return {
      pl, bs, tb, ar, ap, arTotal, apTotal, arOverdue, apOverdue, cash, inventory, wip,
      workingCapital: money(currentAssets - currentLiabilities),
      currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 0,
      arCheck, apCheck, unposted, budgetRows, overspent, gst, readiness, variances, totalVariance,
      assetNbv: money(assets.rows.reduce((s, a) => s + a.cost - a.accumulatedDepreciation, 0)),
    }
  }, [accounts.rows, journals.rows, documents.rows, budgets.rows, periods.rows, actualCosts.rows, cards.rows, assets.rows, today, period])

  const booksHealthy = k.tb.isBalanced && k.bs.isBalanced && k.arCheck.reconciles && k.apCheck.reconciles

  const actionQueue = [
    { label: 'Journals not yet posted', count: k.unposted.length, to: '/finance/journals', icon: Receipt, tone: 'warning' as const },
    { label: 'Overdue from customers', count: k.ar.filter((r) => r.oldestDays > 0).length, to: '/finance/receivables', icon: Banknote, tone: 'danger' as const },
    { label: 'Overdue to suppliers', count: k.ap.filter((r) => r.oldestDays > 0).length, to: '/finance/payables', icon: Landmark, tone: 'warning' as const },
    { label: 'Budget lines overspent', count: k.overspent.length, to: '/finance/budgets', icon: TrendingUp, tone: 'danger' as const },
    { label: 'Batches with an adverse variance', count: k.variances.filter((x) => x.v.totalVariance > 0).length, to: '/finance/costing', icon: Calculator, tone: 'warning' as const },
    { label: 'Period-close blockers', count: k.readiness?.blockers.length ?? 0, to: '/finance/close', icon: CalendarCheck, tone: 'danger' as const },
  ]

  return (
    <div>
      <PageHeader
        title="Finance"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/finance/statements')}>Statements</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/finance/journals')}>Journals</Button>
          </>
        }
      />

      <Card className={cn('mb-4', booksHealthy ? 'border-success/40' : 'border-danger/40')}>
        <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-fg"><Scale className="h-4 w-4" /> Integrity</span>
          <span className="inline-flex items-center gap-2 text-xs text-fg-muted">Trial balance <ReconcileBadge ok={k.tb.isBalanced} /></span>
          <span className="inline-flex items-center gap-2 text-xs text-fg-muted">Balance sheet <ReconcileBadge ok={k.bs.isBalanced} /></span>
          <span className="inline-flex items-center gap-2 text-xs text-fg-muted">Receivables subledger <ReconcileBadge ok={k.arCheck.reconciles} /></span>
          <span className="inline-flex items-center gap-2 text-xs text-fg-muted">Payables subledger <ReconcileBadge ok={k.apCheck.reconciles} /></span>
          <span className="ml-auto text-2xs text-fg-subtle">
            {booksHealthy ? 'Every control reconciles. The statements can be relied on.' : 'One or more controls are out — fix before reporting.'}
          </span>
        </CardBody>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Revenue this year" value={`₹${inrCompact(k.pl.totalIncome)}`} sub={`Gross margin ${k.pl.totalIncome > 0 ? ((k.pl.grossProfit / k.pl.totalIncome) * 100).toFixed(1) : '0'}%`} icon={<IndianRupee />} tone="brand" onClick={() => navigate('/finance/statements')} />
        <StatTile label="Net profit" value={`₹${inrCompact(k.pl.netProfit)}`} sub={`EBITDA ₹${inrCompact(k.pl.ebitda)}`} icon={<TrendingUp />} tone={k.pl.netProfit >= 0 ? 'success' : 'danger'} onClick={() => navigate('/finance/statements')} />
        <StatTile label="Cash & bank" value={`₹${inrCompact(k.cash)}`} sub={`Working capital ₹${inrCompact(k.workingCapital)} · current ratio ${k.currentRatio.toFixed(2)}`} icon={<Wallet />} tone={k.cash > 0 ? 'success' : 'danger'} onClick={() => navigate('/finance/banking')} />
        <StatTile label="Receivable / payable" value={`₹${inrCompact(k.arTotal)}`} sub={`₹${inrCompact(k.apTotal)} payable · ₹${inrCompact(k.arOverdue)} overdue in`} icon={<Banknote />} tone={k.arOverdue > 0 ? 'warning' : 'success'} onClick={() => navigate('/finance/receivables')} />
      </div>

      <Section title="Needs attention">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {actionQueue.map((a) => (
            <Link key={a.label} to={a.to} className={cn('card flex items-center gap-3 p-3 transition-colors hover:border-border-strong hover:bg-surface-2', a.count === 0 && 'opacity-55')}>
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded [&>svg]:h-4 [&>svg]:w-4', a.tone === 'danger' && 'bg-danger/10 text-danger', a.tone === 'warning' && 'bg-warning/10 text-warning')}>
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
          <CardHeader title="Revenue, cost and profit" description="Last six months" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={financeTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => inrCompact(v as number)} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ChartTip prefix="₹" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" maxBarSize={26} radius={[3, 3, 0, 0]} />
                <Bar dataKey="expense" name="Expenditure" fill="#94a3b8" maxBarSize={26} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cash flow" description="Money in against money out" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financeTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => inrCompact(v as number)} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ChartTip prefix="₹" />} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
                <Area type="monotone" dataKey="cashIn" name="In" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                <Area type="monotone" dataKey="cashOut" name="Out" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Ageing" description="Receivable and payable side by side" actions={<Button variant="ghost" size="sm" onClick={() => navigate('/finance/receivables')}>Open</Button>} />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead><tr><th>Party</th><th style={{ width: '6rem' }}>Side</th><th className="text-right" style={{ width: '11rem' }}>Not due</th><th className="text-right" style={{ width: '11rem' }}>Overdue</th><th className="text-right" style={{ width: '12rem' }}>Total</th><th className="text-right" style={{ width: '7rem' }}>Oldest</th></tr></thead>
                <tbody>
                  {[...k.ar.map((r) => ({ r, side: 'Receivable' })), ...k.ap.map((r) => ({ r, side: 'Payable' }))]
                    .sort((a, b) => b.r.total - a.r.total).slice(0, 8)
                    .map(({ r, side }) => (
                      <tr key={`${side}-${r.partyCode}`} className={r.oldestDays > 60 ? 'bg-danger/5' : undefined}>
                        <td><p className="max-w-[16rem] truncate text-xs text-fg">{r.partyName}</p><p className="font-mono text-2xs text-fg-subtle">{r.partyCode}</p></td>
                        <td><Badge tone={side === 'Receivable' ? 'success' : 'warning'} size="sm" dot={false}>{side}</Badge></td>
                        <td className="text-right text-xs tabular text-fg-muted">{inr(r.buckets['Not due'], { blankZero: true })}</td>
                        <td className="text-right text-xs tabular">{inr(r.total - r.buckets['Not due'], { blankZero: true })}</td>
                        <td className="text-right"><Amount value={r.total} className="text-xs font-medium" /></td>
                        <td className="text-right text-xs tabular">{r.oldestDays > 0 ? <span className={r.oldestDays > 60 ? 'text-danger' : 'text-warning'}>{r.oldestDays}d</span> : <span className="text-2xs text-success">Current</span>}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="GST this period" description={today.slice(0, 7)} />
            <CardBody>
              <p className={cn('text-2xl font-semibold tabular', k.gst.netPayable > 0 ? 'text-danger' : 'text-success')}>₹{inrCompact(k.gst.netPayable)}</p>
              <p className="mt-1 text-2xs text-fg-muted">payable in cash · {inr(k.gst.creditCarriedForward)} credit carried forward</p>
              <div className="mt-2 space-y-1 text-2xs text-fg-muted">
                <p className="flex justify-between"><span>Output tax</span><span className="tabular">{inr(k.gst.outward.cgst + k.gst.outward.sgst + k.gst.outward.igst)}</span></p>
                <p className="flex justify-between"><span>Input credit</span><span className="tabular">{inr(k.gst.inward.cgst + k.gst.inward.sgst + k.gst.inward.igst)}</span></p>
              </div>
              <Link to="/finance/tax" className="mt-2 inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">Open the return <ArrowRight className="h-3 w-3" /></Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Manufacturing variance" description="Actual against standard, all costed batches" />
            <CardBody>
              <p className={cn('text-2xl font-semibold tabular', k.totalVariance > 0 ? 'text-danger' : 'text-success')}>₹{inrCompact(Math.abs(k.totalVariance))}</p>
              <p className="mt-1 text-2xs text-fg-muted">{k.totalVariance > 0 ? 'adverse' : 'favourable'} across {k.variances.length} batches</p>
              <div className="mt-2 space-y-1.5">
                {k.variances.slice(0, 3).map((x) => (
                  <div key={x.actual.uid} className="flex items-center justify-between gap-2 text-2xs">
                    <span className="truncate font-mono text-fg-muted">{x.actual.productionOrderNo}</span>
                    <VarianceChip value={x.v.totalVariance} />
                  </div>
                ))}
              </div>
              <Link to="/finance/costing" className="mt-2 inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">Open the analysis <ArrowRight className="h-3 w-3" /></Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Balance sheet" description={`As at ${formatDate(today)}`} />
            <CardBody className="space-y-1.5 text-xs">
              <p className="flex justify-between"><span className="text-fg-muted">Assets</span><span className="font-medium tabular text-fg">{inr(k.bs.totalAssets)}</span></p>
              <p className="flex justify-between"><span className="text-fg-muted">Liabilities</span><span className="font-medium tabular text-fg">{inr(k.bs.totalLiabilities)}</span></p>
              <p className="flex justify-between"><span className="text-fg-muted">Equity</span><span className="font-medium tabular text-fg">{inr(k.bs.totalEquity)}</span></p>
              <p className="flex justify-between border-t border-border pt-1.5"><span className="text-fg-muted">Net fixed assets</span><span className="font-medium tabular text-fg">{inr(k.assetNbv)}</span></p>
              <p className="flex justify-between"><span className="text-fg-muted">Inventory & WIP</span><span className="font-medium tabular text-fg">{inr(k.inventory)}</span></p>
            </CardBody>
          </Card>
        </div>
      </div>

      {k.overspent.length > 0 && (
        <Section title="Budgets overspent" className="mt-6">
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th>Account</th><th style={{ width: '10rem' }}>Owner</th><th className="text-right" style={{ width: '11rem' }}>Budget</th><th className="text-right" style={{ width: '11rem' }}>Actual</th><th className="text-right" style={{ width: '11rem' }}>Committed</th><th className="text-right" style={{ width: '11rem' }}>Available</th><th style={{ width: '11rem' }}>Utilisation</th></tr></thead>
                  <tbody>
                    {k.overspent.map((b) => (
                      <tr key={b.line.uid} className="bg-danger/5">
                        <td className="text-xs text-fg">{b.line.accountName}</td>
                        <td className="font-mono text-2xs text-fg-muted">{b.line.ownerCode || 'company'}</td>
                        <td className="text-right text-xs tabular">{inr(b.line.budgetAmount)}</td>
                        <td className="text-right text-xs tabular">{inr(b.actual)}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{inr(b.committed, { blankZero: true })}</td>
                        <td className="text-right"><Amount value={b.available} className="text-xs font-medium" /></td>
                        <td><div className="flex items-center gap-2"><ProgressBar value={Math.min(100, b.utilisationPct)} tone="danger" className="w-16" /><span className="text-2xs tabular text-danger">{b.utilisationPct.toFixed(0)}%</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </Section>
      )}

      {k.readiness && k.readiness.blockers.length > 0 && (
        <Section title={`Period ${k.readiness.period} cannot be closed`} className="mt-6">
          <Card>
            <CardBody>
              <ul className="list-disc space-y-1 pl-4 text-xs text-fg-muted">
                {k.readiness.blockers.map((b) => (<li key={b}><AlertTriangle className="mr-1 inline h-3 w-3 text-danger" />{b}</li>))}
              </ul>
              <Link to="/finance/close" className="mt-2 inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">Open the close checklist <ArrowRight className="h-3 w-3" /></Link>
            </CardBody>
          </Card>
        </Section>
      )}
    </div>
  )
}
