import { useMemo, useState } from 'react'
import { Download, Scale } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { Amount, AccountTypeBadge, ReconcileBadge, inr, useFinanceData } from '@/components/finance/FinShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { balanceSheet, profitAndLoss, trialBalance, type StatementGroup, type TrialBalanceRow } from '@/lib/finFlow'

/**
 * Trial balance, profit & loss and balance sheet (Ch 20).
 *
 * All three are derived from postings at the moment they are opened, never
 * maintained alongside them. That is why the balance checks at the foot are
 * worth reading: if they ever fail, a posting rule is wrong, and the statement
 * says so instead of hiding the difference.
 */

export function StatementsPage() {
  const toast = useToast()
  const { accounts, journals, periods } = useFinanceData()

  const openPeriod = periods.rows.find((p) => p.status === 'OPEN') ?? periods.rows[periods.rows.length - 1]
  const [asOf, setAsOf] = useState(() => openPeriod?.endDate ?? new Date().toISOString().slice(0, 10))
  const [from, setFrom] = useState('2026-04-01')
  const [tab, setTab] = useState('tb')

  const tb = useMemo(() => trialBalance(accounts.rows, journals.rows, asOf), [accounts.rows, journals.rows, asOf])
  const pl = useMemo(() => profitAndLoss(accounts.rows, journals.rows, from, asOf), [accounts.rows, journals.rows, from, asOf])
  const bs = useMemo(() => balanceSheet(accounts.rows, journals.rows, asOf, from), [accounts.rows, journals.rows, asOf, from])

  function exportTb(format: ExportFormat) {
    const cols: ExportColumn<TrialBalanceRow>[] = [
      { header: 'Code', value: (r) => r.accountCode },
      { header: 'Account', value: (r) => r.accountName },
      { header: 'Type', value: (r) => r.accountType },
      { header: 'Category', value: (r) => r.category },
      { header: 'Debit', value: (r) => (r.debitBalance ? r.debitBalance.toFixed(2) : '') },
      { header: 'Credit', value: (r) => (r.creditBalance ? r.creditBalance.toFixed(2) : '') },
    ]
    const n = exportRows(format, 'trial-balance', `Trial balance as at ${asOf}`, cols, tb.rows)
    toast.success('Export ready', `${n} rows written.`)
  }

  const StatementTable = ({ groups, total, totalLabel }: { groups: StatementGroup[]; total: number; totalLabel: string }) => (
    <div className="overflow-x-auto">
      <table className="grid-table">
        <tbody>
          {groups.map((g) => (
            <>
              <tr key={g.category} className="bg-surface-2">
                <td className="text-xs font-semibold text-fg">{g.category}</td>
                <td className="text-right text-xs font-semibold tabular text-fg">{inr(g.total)}</td>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.accountCode}>
                  <td className="pl-8 text-xs text-fg-muted">
                    <span className="font-mono text-2xs text-fg-subtle">{r.accountCode}</span> {r.accountName}
                  </td>
                  <td className="text-right"><Amount value={r.amount} className="text-xs" /></td>
                </tr>
              ))}
            </>
          ))}
          {!groups.length && (
            <tr><td colSpan={2} className="py-6 text-center text-2xs text-fg-subtle">Nothing posted in this range.</td></tr>
          )}
          <tr className="border-t-2 border-border-strong bg-surface-2">
            <td className="text-sm font-semibold text-fg">{totalLabel}</td>
            <td className="text-right text-sm font-semibold tabular text-fg">{inr(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Financial statements"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Statements' }]}
        actions={<Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportTb('xlsx')}>Export</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'tb', label: 'Trial balance', count: tb.rows.length },
          { id: 'pl', label: 'Profit & loss' },
          { id: 'bs', label: 'Balance sheet' },
        ]} />}
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3.5 sm:grid-cols-4">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} hint="Applies to the profit & loss." />
          <Input label="As at" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <Select
            label="Jump to a period end"
            value=""
            onChange={(e) => { const p = periods.rows.find((x) => x.period === e.target.value); if (p) { setFrom(p.startDate); setAsOf(p.endDate) } }}
            options={[{ value: '', label: 'Choose a period…' }, ...periods.rows.map((p) => ({ value: p.period, label: `${p.period} (${p.status.replace('_', ' ').toLowerCase()})` }))]}
          />
          <div className="flex items-end pb-1">
            <span className="inline-flex items-center gap-2 text-xs text-fg-muted">
              <Scale className="h-3.5 w-3.5" />
              <ReconcileBadge ok={tb.isBalanced && bs.isBalanced} label={tb.isBalanced && bs.isBalanced ? 'Books balance' : 'Books are out'} />
            </span>
          </div>
        </CardBody>
      </Card>

      {(!tb.isBalanced || !bs.isBalanced) && (
        <Alert tone="danger" className="mb-4" title="The books do not balance">
          {!tb.isBalanced && <p>Trial balance is out by {inr(Math.abs(tb.difference))} — debits {inr(tb.totalDebit)} against credits {inr(tb.totalCredit)}.</p>}
          {!bs.isBalanced && <p>Balance sheet is out by {inr(Math.abs(bs.difference))}. Assets do not equal liabilities plus equity.</p>}
          <p className="mt-1">Every journal balances on posting, so a difference here means a posting rule is wrong rather than an entry being mistyped.</p>
        </Alert>
      )}

      {tab === 'tb' && (
        <Card>
          <CardHeader title={`Trial balance as at ${formatDate(asOf)}`} description={`${tb.rows.length} accounts with a balance or movement`} />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: '6rem' }}>Code</th>
                    <th>Account</th>
                    <th style={{ width: '8rem' }}>Type</th>
                    <th style={{ width: '12rem' }}>Category</th>
                    <th className="text-right" style={{ width: '11rem' }}>Debit</th>
                    <th className="text-right" style={{ width: '11rem' }}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {tb.rows.map((r) => (
                    <tr key={r.accountCode}>
                      <td className="font-mono text-2xs text-brand-600">{r.accountCode}</td>
                      <td className="text-xs text-fg">{r.accountName}</td>
                      <td><AccountTypeBadge type={r.accountType} /></td>
                      <td className="text-2xs text-fg-muted">{r.category}</td>
                      <td className="text-right text-xs tabular">{r.debitBalance ? inr(r.debitBalance) : <span className="text-fg-subtle">—</span>}</td>
                      <td className="text-right text-xs tabular">{r.creditBalance ? inr(r.creditBalance) : <span className="text-fg-subtle">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border-strong bg-surface-2">
                    <td colSpan={4} className="text-right text-xs font-semibold text-fg">Totals</td>
                    <td className="text-right text-sm font-semibold tabular text-fg">{inr(tb.totalDebit)}</td>
                    <td className="text-right text-sm font-semibold tabular text-fg">{inr(tb.totalCredit)}</td>
                  </tr>
                  <tr className="bg-surface-2">
                    <td colSpan={4} className="text-right text-2xs text-fg-muted">Difference</td>
                    <td colSpan={2} className={cn('text-right text-xs font-medium tabular', tb.isBalanced ? 'text-success' : 'text-danger')}>
                      {tb.isBalanced ? 'Nil — the books balance' : inr(tb.difference)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'pl' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Income" description={`${formatDate(from)} to ${formatDate(asOf)}`} />
            <CardBody className="p-0"><StatementTable groups={pl.income} total={pl.totalIncome} totalLabel="Total income" /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Expenditure" description={`${formatDate(from)} to ${formatDate(asOf)}`} />
            <CardBody className="p-0"><StatementTable groups={pl.expense} total={pl.totalExpense} totalLabel="Total expenditure" /></CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <tbody>
                    {[
                      ['Total income', pl.totalIncome, false],
                      ['Cost of goods sold', pl.totalIncome - pl.grossProfit, false],
                      ['Gross profit', pl.grossProfit, true],
                      ['Operating expenditure', pl.totalExpense - (pl.totalIncome - pl.grossProfit), false],
                      ['EBITDA', pl.ebitda, true],
                      ['Depreciation', pl.depreciation, false],
                      ['Net profit', pl.netProfit, true],
                    ].map(([label, value, strong]) => (
                      <tr key={String(label)} className={strong ? 'bg-surface-2' : undefined}>
                        <td className={cn('text-fg', strong ? 'text-sm font-semibold' : 'text-xs text-fg-muted')}>{label}</td>
                        <td className="text-right">
                          <Amount value={value as number} className={strong ? 'text-sm font-semibold' : 'text-xs'} />
                        </td>
                        <td className="w-24 text-right text-2xs text-fg-subtle tabular">
                          {pl.totalIncome > 0 ? `${(((value as number) / pl.totalIncome) * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'bs' && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Assets" description={`As at ${formatDate(asOf)}`} />
              <CardBody className="p-0"><StatementTable groups={bs.assets} total={bs.totalAssets} totalLabel="Total assets" /></CardBody>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader title="Liabilities" />
                <CardBody className="p-0"><StatementTable groups={bs.liabilities} total={bs.totalLiabilities} totalLabel="Total liabilities" /></CardBody>
              </Card>
              <Card>
                <CardHeader title="Equity" description="Including profit for the period, carried forward" />
                <CardBody className="p-0">
                  <div className="overflow-x-auto">
                    <table className="grid-table">
                      <tbody>
                        {bs.equity.flatMap((g) => g.rows).map((r) => (
                          <tr key={r.accountCode}>
                            <td className="text-xs text-fg-muted"><span className="font-mono text-2xs text-fg-subtle">{r.accountCode}</span> {r.accountName}</td>
                            <td className="text-right"><Amount value={r.amount} className="text-xs" /></td>
                          </tr>
                        ))}
                        <tr>
                          <td className="text-xs text-fg-muted">Profit for the period</td>
                          <td className="text-right"><Amount value={bs.retainedEarnings} className="text-xs" /></td>
                        </tr>
                        <tr className="border-t-2 border-border-strong bg-surface-2">
                          <td className="text-sm font-semibold text-fg">Total equity</td>
                          <td className="text-right text-sm font-semibold tabular text-fg">{inr(bs.totalEquity)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>

          <Card className="mt-4">
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-fg-muted">
                  <span className="font-medium text-fg">{inr(bs.totalAssets)}</span> of assets against{' '}
                  <span className="font-medium text-fg">{inr(bs.totalLiabilities)}</span> of liabilities and{' '}
                  <span className="font-medium text-fg">{inr(bs.totalEquity)}</span> of equity.
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-sm font-semibold tabular', bs.isBalanced ? 'text-success' : 'text-danger')}>
                    {bs.isBalanced ? 'Balanced' : `Out by ${inr(Math.abs(bs.difference))}`}
                  </span>
                  <ReconcileBadge ok={bs.isBalanced} />
                </div>
              </div>
              <p className="mt-2 text-2xs text-fg-subtle">
                The identity is not asserted here — it falls out of every journal balancing. Moving income and expense
                into retained earnings only relabels part of that equality, so a failure means a posting rule is wrong.
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
