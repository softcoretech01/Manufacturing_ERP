import { useMemo, useState } from 'react'
import { Plus, Target } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { Drawer } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { newUid } from '@/store/data'
import { Amount, ChartTip, DetailBlock, inr, inrCompact, useFinanceData } from '@/components/finance/FinShell'
import { budgetStatus, money, type BudgetStatus } from '@/lib/finFlow'
import type { BudgetLine } from '@/types/finance'

/**
 * Budget and variance (Ch 16).
 *
 * Available is budget less actual **less committed** — a purchase order raised
 * is money already spent as far as headroom goes, and a budget that watches
 * only invoices reports room that does not exist. That is the single rule this
 * screen exists to enforce.
 */

const BLANK = (period: string): Partial<BudgetLine> => ({
  fiscalYear: '2026-27', period, budgetType: 'EXPENSE', level: 'COST_CENTRE',
  ownerCode: '', ownerName: '', accountCode: '', accountName: '',
  budgetAmount: 0, committedAmount: 0, version: 1,
})

export function BudgetsPage() {
  const toast = useToast()
  const fin = useFinanceData()
  const { budgets, accounts, journals, costCentres } = fin

  const periodsAvailable = useMemo(
    () => [...new Set(budgets.rows.filter((b) => !b.deletedAt).map((b) => b.period))].sort(),
    [budgets.rows],
  )
  const [period, setPeriod] = useState(() => periodsAvailable[periodsAvailable.length - 1] ?? new Date().toISOString().slice(0, 7))
  const [levelFilter, setLevelFilter] = useState<'ALL' | BudgetLine['level']>('ALL')
  const [editing, setEditing] = useState<Partial<BudgetLine> | null>(null)
  const [detail, setDetail] = useState<BudgetStatus | null>(null)

  const all = useMemo(() => budgetStatus(budgets.rows, accounts.rows, journals.rows), [budgets.rows, accounts.rows, journals.rows])
  const rows = useMemo(
    () => all.filter((b) => b.line.period === period && (levelFilter === 'ALL' || b.line.level === levelFilter)),
    [all, period, levelFilter],
  )

  const k = useMemo(() => {
    const budget = money(rows.reduce((s, b) => s + b.line.budgetAmount, 0))
    const actual = money(rows.reduce((s, b) => s + b.actual, 0))
    const committed = money(rows.reduce((s, b) => s + b.committed, 0))
    return {
      budget, actual, committed,
      available: money(budget - actual - committed),
      utilisation: budget > 0 ? ((actual + committed) / budget) * 100 : 0,
      overspent: rows.filter((b) => b.isOverspent),
      atRisk: rows.filter((b) => b.isAtRisk),
      chart: [...rows].sort((a, b) => b.line.budgetAmount - a.line.budgetAmount).slice(0, 10).map((b) => ({
        name: b.line.accountName.length > 18 ? `${b.line.accountName.slice(0, 17)}…` : b.line.accountName,
        budget: b.line.budgetAmount,
        spent: money(b.actual + b.committed),
        over: b.isOverspent,
      })),
    }
  }, [rows])

  function blockers(draft: Partial<BudgetLine>, uid?: string): string[] {
    const out: string[] = []
    if (!draft.accountCode) out.push('Choose the account being budgeted.')
    if ((draft.budgetAmount ?? 0) <= 0) out.push('A budget of nil is not a budget — enter the amount.')
    if ((draft.committedAmount ?? 0) < 0) out.push('Committed spend cannot be negative.')
    if (draft.level !== 'COMPANY' && !draft.ownerCode) out.push(`A ${(draft.level ?? '').toLowerCase().replace('_', ' ')} budget must name its owner.`)
    if (budgets.rows.some((b) => !b.deletedAt && b.uid !== uid && b.period === draft.period && b.accountCode === draft.accountCode && b.ownerCode === draft.ownerCode)) {
      out.push('This account is already budgeted for that owner and period — edit the existing line instead of adding a second.')
    }
    return out
  }

  function save() {
    if (!editing) return
    const b = blockers(editing, editing.uid)
    if (b.length) { toast.error(b[0]); return }
    const account = accounts.rows.find((a) => a.code === editing.accountCode)
    const owner = costCentres.rows.find((c) => c.code === editing.ownerCode)
    const payload = {
      ...editing,
      accountName: account?.name ?? editing.accountName ?? '',
      ownerName: owner?.name ?? editing.ownerName ?? '',
      budgetType: account?.accountType === 'INCOME' ? 'REVENUE' : editing.budgetType,
    } as BudgetLine
    if (editing.uid) { budgets.update(editing.uid, payload); toast.success('Budget line updated') }
    else { budgets.create({ ...(BLANK(period) as BudgetLine), ...payload, uid: newUid('bud') }); toast.success('Budget line added') }
    setEditing(null)
  }

  function remove(b: BudgetStatus) {
    if (b.actual > 0.005 || b.committed > 0.005) {
      toast.error('Spend has already been booked against this line. Revise the amount rather than deleting it, or the history stops making sense.')
      return
    }
    budgets.remove(b.line.uid)
    toast.success('Budget line removed')
  }

  /** Copy this period's budget forward, so the next month starts from something. */
  function copyForward() {
    const next = nextPeriod(period)
    if (budgets.rows.some((b) => !b.deletedAt && b.period === next)) { toast.error(`${next} already has budget lines.`); return }
    for (const b of rows) {
      budgets.create({ ...b.line, uid: newUid('bud'), period: next, committedAmount: 0, version: 1 })
    }
    toast.success(`${rows.length} line(s) copied into ${next} with committed spend cleared`)
    setPeriod(next)
  }

  const columns: Column<BudgetStatus>[] = [
    {
      key: 'account', header: 'Account', width: '20rem',
      render: (b) => (<><p className="truncate text-xs text-fg">{b.line.accountName}</p><p className="font-mono text-2xs text-fg-subtle">{b.line.accountCode}</p></>),
    },
    {
      key: 'owner', header: 'Owner', width: '14rem',
      render: (b) => (<><p className="text-2xs text-fg-muted">{b.line.ownerName || 'Company-wide'}</p><p className="font-mono text-3xs text-fg-subtle">{b.line.level.replace('_', ' ').toLowerCase()}</p></>),
    },
    { key: 'type', header: 'Type', width: '8rem', render: (b) => <Badge tone={b.line.budgetType === 'REVENUE' ? 'success' : b.line.budgetType === 'CAPITAL' ? 'progress' : 'neutral'} size="sm" dot={false}>{b.line.budgetType.toLowerCase()}</Badge> },
    { key: 'budget', header: 'Budget', width: '11rem', align: 'right', render: (b) => <Amount value={b.line.budgetAmount} className="text-xs" /> },
    { key: 'actual', header: 'Actual', width: '11rem', align: 'right', render: (b) => <Amount value={b.actual} className="text-xs" blankZero /> },
    { key: 'committed', header: 'Committed', width: '11rem', align: 'right', render: (b) => <Amount value={b.committed} className="text-xs text-fg-muted" blankZero /> },
    {
      key: 'available', header: 'Available', width: '11rem', align: 'right',
      render: (b) => <Amount value={b.available} className={cn('text-xs font-medium', b.isOverspent && 'text-danger')} />,
    },
    {
      key: 'util', header: 'Utilisation', width: '12rem',
      render: (b) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={Math.min(100, b.utilisationPct)} tone={b.isOverspent ? 'danger' : b.isAtRisk ? 'warning' : 'success'} className="w-16" />
          <span className={cn('text-2xs tabular', b.isOverspent ? 'text-danger' : b.isAtRisk ? 'text-warning' : 'text-fg-muted')}>{b.utilisationPct.toFixed(0)}%</span>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', width: '9rem',
      render: (b) => b.isOverspent ? <Badge tone="danger" size="sm">Overspent</Badge> : b.isAtRisk ? <Badge tone="warning" size="sm">At risk</Badge> : <Badge tone="success" size="sm">Within</Badge>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Budgets"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Budgets' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={copyForward} disabled={!rows.length}>Copy to {nextPeriod(period)}</Button>
            <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK(period))}>New budget line</Button>
          </>
        }
      />

      <Card className="mb-3">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40">
            {[...new Set([...periodsAvailable, period])].sort().map((p) => (<option key={p} value={p}>{p}</option>))}
          </Select>
          <Select label="Level" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)} className="w-44">
            <option value="ALL">Every level</option>
            <option value="COMPANY">Company</option>
            <option value="PLANT">Plant</option>
            <option value="DEPARTMENT">Department</option>
            <option value="COST_CENTRE">Cost centre</option>
            <option value="PROJECT">Project</option>
          </Select>
          <span className="ml-auto text-2xs text-fg-subtle">Available = budget − actual − committed. A raised purchase order counts as spent.</span>
        </CardBody>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Budgeted" value={`₹${inrCompact(k.budget)}`} sub={`${rows.length} lines for ${period}`} icon={<Target />} tone="brand" />
        <StatTile label="Actual" value={`₹${inrCompact(k.actual)}`} sub={`Plus ₹${inrCompact(k.committed)} committed`} tone="progress" />
        <StatTile label="Available" value={`₹${inrCompact(k.available)}`} sub={`${k.utilisation.toFixed(0)}% of the budget consumed`} tone={k.available < 0 ? 'danger' : k.utilisation >= 90 ? 'warning' : 'success'} />
        <StatTile label="Overspent lines" value={k.overspent.length} sub={k.atRisk.length ? `${k.atRisk.length} more above 90%` : 'Nothing else near its limit'} tone={k.overspent.length ? 'danger' : 'success'} />
      </div>

      {k.overspent.length > 0 && (
        <Alert tone="danger" title={`${k.overspent.length} budget line${k.overspent.length === 1 ? ' is' : 's are'} overspent`} className="mb-4">
          {k.overspent.slice(0, 3).map((b) => `${b.line.accountName} by ${inr(Math.abs(b.available))}`).join(' · ')}
          {k.overspent.length > 3 ? ` · and ${k.overspent.length - 3} more` : ''}.
          Either revise the budget or stop further commitment against these accounts.
        </Alert>
      )}

      {k.chart.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Budget against spend" description="Ten largest lines — a bar past its budget is a line already overspent" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={k.chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={52} />
                <YAxis tickFormatter={(v) => inrCompact(v as number)} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={54} />
                <Tooltip content={<ChartTip prefix="₹" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="budget" name="Budget" fill="#cbd5e1" maxBarSize={22} radius={[3, 3, 0, 0]} />
                <Bar dataKey="spent" name="Actual + committed" maxBarSize={22} radius={[3, 3, 0, 0]}>
                  {k.chart.map((c, i) => (<Cell key={i} fill={c.over ? '#ef4444' : '#3b82f6'} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(b) => b.line.uid}
        onRowClick={(b) => setDetail(b)}
        rowClassName={(b) => (b.isOverspent ? 'bg-danger/5' : b.isAtRisk ? 'bg-warning/5' : undefined)}
        rowActions={(b) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...b.line })} />
            <MenuItem label="Delete" danger onClick={() => remove(b)} />
          </>
        )}
        emptyTitle="No budget lines"
        emptyDescription={`Nothing budgeted for ${period}. Add a line, or copy the previous period forward.`}
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.line.accountCode} · ${detail.line.accountName}` : ''} width="max-w-lg">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral" size="sm" dot={false}>{detail.line.period}</Badge>
              <Badge tone="neutral" size="sm" dot={false}>{detail.line.level.replace('_', ' ').toLowerCase()}</Badge>
              {detail.isOverspent ? <Badge tone="danger" size="sm">Overspent</Badge> : detail.isAtRisk ? <Badge tone="warning" size="sm">At risk</Badge> : <Badge tone="success" size="sm">Within budget</Badge>}
            </div>

            <DetailBlock title="Where the budget has gone">
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="py-1 text-fg-muted">Budget</td><td className="py-1 text-right tabular text-fg">{inr(detail.line.budgetAmount)}</td></tr>
                  <tr><td className="py-1 text-fg-muted">Less: actual spend posted</td><td className="py-1 text-right tabular text-fg">{inr(detail.actual)}</td></tr>
                  <tr><td className="py-1 text-fg-muted">Less: committed on open orders</td><td className="py-1 text-right tabular text-fg">{inr(detail.committed)}</td></tr>
                  <tr className="border-t border-border">
                    <td className="py-1 font-medium text-fg">Available</td>
                    <td className="py-1 text-right"><Amount value={detail.available} className="font-semibold" /></td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-2">
                <ProgressBar value={Math.min(100, detail.utilisationPct)} tone={detail.isOverspent ? 'danger' : detail.isAtRisk ? 'warning' : 'success'} />
                <p className="mt-1 text-3xs text-fg-subtle">{detail.utilisationPct.toFixed(1)}% consumed{detail.utilisationPct > 100 ? ` — ${(detail.utilisationPct - 100).toFixed(1)}% over` : ''}</p>
              </div>
            </DetailBlock>

            <DetailBlock title="Owner">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-3xs uppercase tracking-wider text-fg-subtle">Owner</p><p className="mt-0.5 text-xs text-fg">{detail.line.ownerName || 'Company-wide'}</p></div>
                <div><p className="text-3xs uppercase tracking-wider text-fg-subtle">Code</p><p className="mt-0.5 font-mono text-xs text-fg">{detail.line.ownerCode || '—'}</p></div>
                <div><p className="text-3xs uppercase tracking-wider text-fg-subtle">Fiscal year</p><p className="mt-0.5 text-xs text-fg">{detail.line.fiscalYear}</p></div>
                <div><p className="text-3xs uppercase tracking-wider text-fg-subtle">Type</p><p className="mt-0.5 text-xs text-fg">{detail.line.budgetType.toLowerCase()}</p></div>
              </div>
            </DetailBlock>

            {detail.isOverspent && (
              <Alert tone="danger" title="Overspent">
                {inr(Math.abs(detail.available))} beyond the budget once committed orders are counted. Raising a further order against {detail.line.accountCode} should be blocked until the budget is revised.
              </Alert>
            )}
            {detail.isAtRisk && (
              <Alert tone="warning" title="Close to the limit">
                {inr(detail.available)} left of {inr(detail.line.budgetAmount)}. At the current rate this line will be exhausted before the period ends.
              </Alert>
            )}

            <div className="flex gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail.line }); setDetail(null) }}>Edit</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? 'Edit budget line' : 'New budget line'}
        width="max-w-lg"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Period" type="month" value={editing.period ?? period} onChange={(e) => setEditing({ ...editing, period: e.target.value })} />
              <Input label="Fiscal year" value={editing.fiscalYear ?? ''} onChange={(e) => setEditing({ ...editing, fiscalYear: e.target.value })} />
            </div>
            <Select
              label="Account"
              required
              value={editing.accountCode ?? ''}
              onChange={(e) => {
                const a = accounts.rows.find((x) => x.code === e.target.value)
                setEditing({ ...editing, accountCode: e.target.value, accountName: a?.name ?? '', budgetType: a?.accountType === 'INCOME' ? 'REVENUE' : 'EXPENSE' })
              }}
            >
              <option value="">Choose an account…</option>
              {accounts.rows
                .filter((a) => !a.isGroup && !a.deletedAt && (a.accountType === 'EXPENSE' || a.accountType === 'INCOME' || a.accountType === 'ASSET'))
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Level" value={editing.level ?? 'COST_CENTRE'} onChange={(e) => setEditing({ ...editing, level: e.target.value as BudgetLine['level'], ownerCode: e.target.value === 'COMPANY' ? '' : editing.ownerCode })}>
                <option value="COMPANY">Company</option>
                <option value="PLANT">Plant</option>
                <option value="DEPARTMENT">Department</option>
                <option value="COST_CENTRE">Cost centre</option>
                <option value="PROJECT">Project</option>
              </Select>
              <Select label="Type" value={editing.budgetType ?? 'EXPENSE'} onChange={(e) => setEditing({ ...editing, budgetType: e.target.value as BudgetLine['budgetType'] })}>
                <option value="EXPENSE">Expense</option>
                <option value="REVENUE">Revenue</option>
                <option value="CAPITAL">Capital</option>
                <option value="CASH_FLOW">Cash flow</option>
              </Select>
            </div>
            {editing.level === 'COST_CENTRE' ? (
              <Select
                label="Cost centre"
                required
                value={editing.ownerCode ?? ''}
                onChange={(e) => {
                  const c = costCentres.rows.find((x) => x.code === e.target.value)
                  setEditing({ ...editing, ownerCode: e.target.value, ownerName: c?.name ?? '' })
                }}
              >
                <option value="">Choose a cost centre…</option>
                {costCentres.rows.filter((c) => !c.deletedAt && c.isActive).map((c) => (<option key={c.uid} value={c.code}>{c.code} · {c.name}</option>))}
              </Select>
            ) : editing.level !== 'COMPANY' ? (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Owner code" required value={editing.ownerCode ?? ''} onChange={(e) => setEditing({ ...editing, ownerCode: e.target.value })} />
                <Input label="Owner name" value={editing.ownerName ?? ''} onChange={(e) => setEditing({ ...editing, ownerName: e.target.value })} />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Budget" type="number" required value={String(editing.budgetAmount ?? 0)} onChange={(e) => setEditing({ ...editing, budgetAmount: Number(e.target.value) })} />
              <Input label="Committed" type="number" value={String(editing.committedAmount ?? 0)} onChange={(e) => setEditing({ ...editing, committedAmount: Number(e.target.value) })} hint="Open purchase orders against this account" />
            </div>

            {(() => {
              const b = blockers(editing, editing.uid)
              return b.length ? <Alert tone="danger" title="Cannot save yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert> : null
            })()}
          </div>
        )}
      </Drawer>
    </div>
  )
}

/** Next calendar month as YYYY-MM. */
function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, (m ?? 1) - 1 + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
