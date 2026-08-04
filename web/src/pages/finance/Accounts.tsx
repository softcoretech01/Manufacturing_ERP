import { useMemo, useState } from 'react'
import { ChevronRight, Landmark, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader, Section, StatTile } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { newUid } from '@/store/data'
import { AccountTypeBadge, Amount, DetailBlock, inr, useFinanceData } from '@/components/finance/FinShell'
import { ACCOUNT_TYPE_LABEL, accountBalance, money, trialBalance } from '@/lib/finFlow'
import { NORMAL_BALANCE, type Account, type AccountType, type CostCentre, type ProfitCentre } from '@/types/finance'

/**
 * Chart of accounts, cost centres and profit centres (Ch 5–6).
 *
 * The chart is a tree, so it is shown as one — a flat list of sixty accounts
 * tells you nothing about which group a balance rolls into. Group rows carry
 * the sum of their children; only leaf accounts can be posted to, which is the
 * rule that keeps the trial balance from double counting.
 */

type Tab = 'chart' | 'cost' | 'profit'

interface TreeNode {
  account: Account
  children: TreeNode[]
  depth: number
  /** Own balance for a leaf, rolled-up balance for a group. */
  balance: number
}

function buildTree(accounts: Account[], balanceOf: (code: string) => number): TreeNode[] {
  const live = accounts.filter((a) => !a.deletedAt)
  const byParent = new Map<string, Account[]>()
  for (const a of live) {
    const key = a.parentCode ?? '__root__'
    byParent.set(key, [...(byParent.get(key) ?? []), a])
  }

  const build = (parent: string, depth: number): TreeNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((account) => {
        const children = build(account.code, depth + 1)
        const balance = account.isGroup
          ? money(children.reduce((s, c) => s + c.balance, 0))
          : balanceOf(account.code)
        return { account, children, depth, balance }
      })

  return build('__root__', 0)
}

function flatten(nodes: TreeNode[], expanded: Set<string>): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n)
      if (n.children.length && expanded.has(n.account.code)) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

const BLANK_ACCOUNT = (): Partial<Account> => ({
  code: '', name: '', accountType: 'EXPENSE', category: '', parentCode: null,
  isGroup: false, isControl: false, controlOf: null, requiresCostCentre: false,
  openingBalance: 0, currency: 'INR', isActive: true, remarks: '', version: 1,
})

export function ChartOfAccountsPage() {
  const toast = useToast()
  const fin = useFinanceData()
  const { accounts, journals, costCentres, profitCentres } = fin

  const [tab, setTab] = useState<Tab>('chart')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<AccountType | 'ALL'>('ALL')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['1000', '2000', '3000', '4000', '5000']))
  const [selected, setSelected] = useState<Account | null>(null)
  const [editing, setEditing] = useState<Partial<Account> | null>(null)
  const [ccEditing, setCcEditing] = useState<Partial<CostCentre> | null>(null)
  const [pcEditing, setPcEditing] = useState<Partial<ProfitCentre> | null>(null)

  const balanceOf = useMemo(() => {
    const cache = new Map<string, number>()
    return (code: string) => {
      if (!cache.has(code)) cache.set(code, accountBalance(code, journals.rows, accounts.rows))
      return cache.get(code) as number
    }
  }, [accounts.rows, journals.rows])

  const tree = useMemo(() => buildTree(accounts.rows, balanceOf), [accounts.rows, balanceOf])
  const tb = useMemo(() => trialBalance(accounts.rows, journals.rows), [accounts.rows, journals.rows])

  const searching = query.trim().length > 0 || typeFilter !== 'ALL'
  const visible = useMemo(() => {
    if (!searching) return flatten(tree, expanded)
    const q = query.trim().toLowerCase()
    return flatten(tree, new Set(accounts.rows.map((a) => a.code))).filter(
      (n) =>
        !n.account.isGroup &&
        (typeFilter === 'ALL' || n.account.accountType === typeFilter) &&
        (!q || n.account.code.toLowerCase().includes(q) || n.account.name.toLowerCase().includes(q) || n.account.category.toLowerCase().includes(q)),
    )
  }, [tree, expanded, searching, query, typeFilter, accounts.rows])

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  /* ── validation ─────────────────────────────────────────────── */

  function accountBlockers(draft: Partial<Account>, existingUid?: string): string[] {
    const out: string[] = []
    if (!draft.code?.trim()) out.push('A code is required.')
    if (!draft.name?.trim()) out.push('A name is required.')
    if (draft.code && accounts.rows.some((a) => a.code === draft.code && a.uid !== existingUid && !a.deletedAt)) {
      out.push(`Code ${draft.code} is already used by another account.`)
    }
    if (draft.parentCode) {
      const parent = accounts.rows.find((a) => a.code === draft.parentCode)
      if (!parent) out.push('The parent account does not exist.')
      else if (!parent.isGroup) out.push(`${parent.code} ${parent.name} is a posting account, so it cannot have children.`)
      else if (parent.accountType !== draft.accountType) out.push(`The parent is ${ACCOUNT_TYPE_LABEL[parent.accountType]}; a child must be of the same type.`)
      else if (draft.code && parent.code === draft.code) out.push('An account cannot be its own parent.')
    }
    if (draft.isGroup && Math.abs(draft.openingBalance ?? 0) > 0.005) out.push('A group account holds no balance of its own — its opening balance must be nil.')
    if (draft.isGroup && draft.isControl) out.push('A control account must be a posting account, not a group.')
    if (draft.isControl && !draft.controlOf) out.push('A control account must say which subledger it controls.')
    return out
  }

  /** What stops an account being deactivated — the where-used check. */
  function deactivateBlockers(a: Account): string[] {
    const out: string[] = []
    const used = journals.rows.filter((j) => !j.deletedAt && j.lines.some((l) => l.accountCode === a.code)).length
    const bal = balanceOf(a.code)
    const kids = accounts.rows.filter((x) => x.parentCode === a.code && !x.deletedAt && x.isActive).length
    if (Math.abs(bal) > 0.005) out.push(`The account carries a balance of ${inr(bal)}. Clear it first.`)
    if (kids) out.push(`${kids} active child account${kids === 1 ? '' : 's'} would be orphaned.`)
    if (a.isControl) out.push('Control accounts are required by the subledger reconciliation and cannot be deactivated.')
    if (used) out.push(`${used} journal${used === 1 ? '' : 's'} already posted here — the account stays for history, but you may deactivate it once the balance is nil.`)
    return out
  }

  function saveAccount() {
    if (!editing) return
    const blockers = accountBlockers(editing, editing.uid)
    if (blockers.length) { toast.error(blockers[0]); return }

    if (editing.uid) {
      accounts.update(editing.uid, editing as Account)
      toast.success(`${editing.code} updated`)
    } else {
      accounts.create({ ...(BLANK_ACCOUNT() as Account), ...(editing as Account), uid: newUid('acc') })
      toast.success(`${editing.code} ${editing.name} added to the chart`)
    }
    setEditing(null)
  }

  function toggleActive(a: Account) {
    if (a.isActive) {
      const blockers = deactivateBlockers(a)
      const hard = blockers.filter((b) => !b.includes('journal'))
      if (hard.length) { toast.error(hard[0]); return }
    }
    accounts.update(a.uid, { isActive: !a.isActive })
    toast.success(`${a.code} ${a.isActive ? 'deactivated' : 'reactivated'}`)
  }

  function removeAccount(a: Account) {
    const used = journals.rows.some((j) => !j.deletedAt && j.lines.some((l) => l.accountCode === a.code))
    if (used) { toast.error('This account has postings against it. Deactivate it instead — deleting would orphan the ledger.'); return }
    if (accounts.rows.some((x) => x.parentCode === a.code && !x.deletedAt)) { toast.error('Remove or reparent the child accounts first.'); return }
    accounts.remove(a.uid)
    if (selected?.uid === a.uid) setSelected(null)
    toast.success(`${a.code} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const chartColumns: Column<TreeNode>[] = [
    {
      key: 'code', header: 'Account', width: '26rem', sortable: false,
      render: (n) => (
        <div className="flex items-center gap-1" style={{ paddingLeft: searching ? 0 : `${n.depth * 1.1}rem` }}>
          {n.children.length > 0 && !searching ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(n.account.code) }}
              className="rounded p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-fg"
              aria-label={expanded.has(n.account.code) ? 'Collapse' : 'Expand'}
            >
              <ChevronRight className={cn('h-3 w-3 transition-transform', expanded.has(n.account.code) && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="min-w-0">
            <span className={cn('block truncate text-xs', n.account.isGroup ? 'font-semibold text-fg' : 'text-fg')}>{n.account.name}</span>
            <span className="font-mono text-2xs text-fg-subtle">{n.account.code}{n.account.isGroup ? ' · group' : ''}</span>
          </span>
        </div>
      ),
    },
    { key: 'type', header: 'Type', width: '8rem', render: (n) => <AccountTypeBadge type={n.account.accountType} /> },
    { key: 'category', header: 'Category', width: '11rem', render: (n) => <span className="text-2xs text-fg-muted">{n.account.category || '—'}</span> },
    { key: 'normal', header: 'Normal', width: '6rem', render: (n) => <span className="text-2xs text-fg-muted">{NORMAL_BALANCE[n.account.accountType] === 'DEBIT' ? 'Dr' : 'Cr'}</span> },
    {
      key: 'flags', header: 'Flags', width: '10rem',
      render: (n) => (
        <div className="flex flex-wrap gap-1">
          {n.account.isControl && <Badge tone="brand" size="sm" dot={false}>Control</Badge>}
          {n.account.requiresCostCentre && <Badge tone="neutral" size="sm" dot={false}>Cost centre</Badge>}
          {!n.account.isActive && <Badge tone="danger" size="sm" dot={false}>Inactive</Badge>}
        </div>
      ),
    },
    {
      key: 'balance', header: 'Balance', width: '12rem', align: 'right',
      render: (n) => {
        const shown = NORMAL_BALANCE[n.account.accountType] === 'CREDIT' ? -n.balance : n.balance
        return (
          <span className="inline-flex items-baseline gap-1">
            <Amount value={shown} className={cn('text-xs', n.account.isGroup && 'font-semibold')} blankZero />
            {Math.abs(n.balance) > 0.005 && <span className="text-3xs text-fg-subtle">{n.balance > 0 ? 'Dr' : 'Cr'}</span>}
          </span>
        )
      },
    },
  ]

  const summary = useMemo(() => {
    const live = accounts.rows.filter((a) => !a.deletedAt)
    return {
      total: live.length,
      posting: live.filter((a) => !a.isGroup).length,
      control: live.filter((a) => a.isControl).length,
      inactive: live.filter((a) => !a.isActive).length,
    }
  }, [accounts.rows])

  return (
    <div>
      <PageHeader
        title="Chart of accounts"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Chart of accounts' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => {
              if (tab === 'chart') setEditing(BLANK_ACCOUNT())
              else if (tab === 'cost') setCcEditing({ code: '', name: '', centreType: 'PRODUCTION', plant: '', manager: '', workCentreCode: null, isActive: true, version: 1 })
              else setPcEditing({ code: '', name: '', channel: 'DOMESTIC', manager: '', isActive: true, version: 1 })
            }}
          >
            {tab === 'chart' ? 'New account' : tab === 'cost' ? 'New cost centre' : 'New profit centre'}
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'chart', label: 'Accounts', count: summary.posting },
              { id: 'cost', label: 'Cost centres', count: costCentres.rows.filter((c) => !c.deletedAt).length },
              { id: 'profit', label: 'Profit centres', count: profitCentres.rows.filter((p) => !p.deletedAt).length },
            ]}
          />
        }
      />

      {tab === 'chart' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Posting accounts" value={summary.posting} sub={`${summary.total} rows including groups`} icon={<Landmark />} tone="brand" />
            <StatTile label="Control accounts" value={summary.control} sub="Reconciled to their subledgers" tone="progress" />
            <StatTile label="Trial balance" value={tb.isBalanced ? 'Balanced' : 'Out'} sub={tb.isBalanced ? `${inr(tb.totalDebit)} each side` : `Out by ${inr(Math.abs(tb.difference))}`} tone={tb.isBalanced ? 'success' : 'danger'} />
            <StatTile label="Inactive" value={summary.inactive} sub="Kept for history, closed to new postings" tone={summary.inactive ? 'warning' : 'neutral'} />
          </div>

          <Card className="mb-3">
            <CardBody className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by code, name or category"
                leftIcon={<Search />}
                className="w-72"
                aria-label="Search accounts"
              />
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as AccountType | 'ALL')} className="w-44" aria-label="Filter by type">
                <option value="ALL">All types</option>
                {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (<option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>))}
              </Select>
              {searching ? (
                <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setTypeFilter('ALL') }}>Clear</Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set(accounts.rows.map((a) => a.code)))}>Expand all</Button>
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>Collapse all</Button>
                </>
              )}
              <span className="ml-auto text-2xs text-fg-subtle">
                {searching ? `${visible.length} posting accounts match` : 'Group balances are the sum of their children'}
              </span>
            </CardBody>
          </Card>

          <DataTable
            rows={visible}
            columns={chartColumns}
            rowKey={(n) => n.account.uid}
            onRowClick={(n) => setSelected(n.account)}
            rowActions={(n) => (
              <>
                <MenuItem label="Edit" onClick={() => setEditing({ ...n.account })} />
                <MenuItem label={n.account.isActive ? 'Deactivate' : 'Reactivate'} onClick={() => toggleActive(n.account)} />
                <MenuItem label="Delete" danger onClick={() => removeAccount(n.account)} />
              </>
            )}
            emptyTitle={'No accounts match'}
            emptyDescription={'Change the search or the type filter.'}
          />
        </>
      )}

      {tab === 'cost' && (
        <CostCentreTab
          rows={costCentres.rows.filter((c) => !c.deletedAt)}
          onEdit={(c) => setCcEditing({ ...c })}
          onDelete={(c) => {
            const used = journals.rows.some((j) => !j.deletedAt && j.lines.some((l) => l.costCentre === c.code))
            if (used) { toast.error('Postings already carry this cost centre. Deactivate it instead.'); return }
            costCentres.remove(c.uid); toast.success(`${c.code} removed`)
          }}
          spendOf={(code) =>
            money(journals.rows.filter((j) => j.status === 'POSTED' && !j.deletedAt)
              .flatMap((j) => j.lines).filter((l) => l.costCentre === code)
              .reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0))
          }
        />
      )}

      {tab === 'profit' && (
        <ProfitCentreTab
          rows={profitCentres.rows.filter((p) => !p.deletedAt)}
          onEdit={(p) => setPcEditing({ ...p })}
          onDelete={(p) => { profitCentres.remove(p.uid); toast.success(`${p.code} removed`) }}
          resultOf={(code) => {
            const lines = journals.rows.filter((j) => j.status === 'POSTED' && !j.deletedAt).flatMap((j) => j.lines).filter((l) => l.profitCentre === code)
            let income = 0
            let expense = 0
            for (const l of lines) {
              const acc = accounts.rows.find((a) => a.code === l.accountCode)
              if (!acc) continue
              const raw = (l.debit || 0) - (l.credit || 0)
              if (acc.accountType === 'INCOME') income += -raw
              if (acc.accountType === 'EXPENSE') expense += raw
            }
            return { income: money(income), expense: money(expense), profit: money(income - expense) }
          }}
        />
      )}

      {/* ── account detail ───────────────────────────────────── */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.code} · ${selected.name}` : ''} width="max-w-2xl">
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <AccountTypeBadge type={selected.accountType} />
              {selected.isGroup && <Badge tone="neutral" size="sm" dot={false}>Group</Badge>}
              {selected.isControl && <Badge tone="brand" size="sm" dot={false}>Control · {selected.controlOf}</Badge>}
              <Badge tone={selected.isActive ? 'success' : 'danger'} size="sm">{selected.isActive ? 'Active' : 'Inactive'}</Badge>
            </div>

            <DetailBlock title="Position">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Opening" value={inr(selected.openingBalance)} />
                <Field label="Movement" value={inr(money(balanceOf(selected.code) - selected.openingBalance))} />
                <Field label="Closing" value={`${inr(Math.abs(balanceOf(selected.code)))} ${balanceOf(selected.code) >= 0 ? 'Dr' : 'Cr'}`} />
                <Field label="Normal balance" value={NORMAL_BALANCE[selected.accountType] === 'DEBIT' ? 'Debit' : 'Credit'} />
                <Field label="Category" value={selected.category || '—'} />
                <Field label="Parent" value={selected.parentCode ?? 'Top level'} />
              </div>
            </DetailBlock>

            {selected.remarks && (
              <DetailBlock title="Notes"><p className="text-xs leading-relaxed text-fg-muted">{selected.remarks}</p></DetailBlock>
            )}

            <DetailBlock title="Posting rules">
              <ul className="list-disc space-y-1 pl-4 text-2xs text-fg-muted">
                <li>{selected.isGroup ? 'Group account — cannot be posted to; its balance is the sum of its children.' : 'Posting account — journals may be raised against it.'}</li>
                {selected.requiresCostCentre && <li>Every line posted here must carry a cost centre, so the charge can be attributed.</li>}
                {selected.isControl && <li>Control account — its balance must equal the {selected.controlOf === 'SUPPLIER' ? 'payables' : 'receivables'} subledger at all times.</li>}
                <li>Balances are shown debit-positive; a {NORMAL_BALANCE[selected.accountType] === 'CREDIT' ? 'credit' : 'debit'} balance is normal for this type.</li>
              </ul>
            </DetailBlock>

            {(() => {
              const blockers = deactivateBlockers(selected)
              return blockers.length > 0 ? (
                <Alert tone="info" title="Where this account is used">
                  <ul className="list-disc space-y-0.5 pl-4">{blockers.map((b) => (<li key={b}>{b}</li>))}</ul>
                </Alert>
              ) : (
                <Alert tone="tip" title="Not referenced">Nothing depends on this account; it can be deactivated or removed.</Alert>
              )
            })()}

            <div className="flex gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => { setEditing({ ...selected }); setSelected(null) }}>Edit</Button>
              <Button variant="outline" size="sm" onClick={() => toggleActive(selected)}>{selected.isActive ? 'Deactivate' : 'Reactivate'}</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── account form ─────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.code}` : 'New account'}
        width="max-w-lg"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={saveAccount}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Code" required value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="5240" />
              <Select
                label="Type"
                required
                value={editing.accountType}
                onChange={(e) => setEditing({ ...editing, accountType: e.target.value as AccountType, parentCode: null })}
              >
                {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (<option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>))}
              </Select>
            </div>
            <Input label="Name" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Parent"
                value={editing.parentCode ?? ''}
                onChange={(e) => setEditing({ ...editing, parentCode: e.target.value || null })}
                hint="Only groups of the same type may be a parent"
              >
                <option value="">Top level</option>
                {accounts.rows
                  .filter((a) => a.isGroup && !a.deletedAt && a.accountType === editing.accountType && a.uid !== editing.uid)
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
              </Select>
              <Input label="Category" value={editing.category ?? ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="Manufacturing Overhead" />
            </div>
            <Input
              label="Opening balance"
              type="number"
              value={String(editing.openingBalance ?? 0)}
              onChange={(e) => setEditing({ ...editing, openingBalance: Number(e.target.value) })}
              hint="Debit positive, credit negative"
              disabled={editing.isGroup}
            />
            <div className="space-y-2 rounded border border-border bg-surface-2 p-3">
              <Switch
                label="Group account"
                checked={!!editing.isGroup}
                onChange={(v) => setEditing({ ...editing, isGroup: v, isControl: v ? false : editing.isControl, openingBalance: v ? 0 : editing.openingBalance })}
              />
              <Switch
                label="Require a cost centre"
                checked={!!editing.requiresCostCentre}
                onChange={(v) => setEditing({ ...editing, requiresCostCentre: v })}
                disabled={!!editing.isGroup}
              />
              <Switch
                label="Control account"
                checked={!!editing.isControl}
                onChange={(v) => setEditing({ ...editing, isControl: v, controlOf: v ? (editing.controlOf ?? 'CUSTOMER') : null })}
                disabled={!!editing.isGroup}
              />
              {editing.isControl && (
                <Select label="Controls" value={editing.controlOf ?? 'CUSTOMER'} onChange={(e) => setEditing({ ...editing, controlOf: e.target.value as Account['controlOf'] })}>
                  <option value="CUSTOMER">Customer subledger</option>
                  <option value="SUPPLIER">Supplier subledger</option>
                </Select>
              )}
              <Switch label="Active" checked={editing.isActive !== false} onChange={(v) => setEditing({ ...editing, isActive: v })} />
            </div>
            <Textarea label="Notes" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />

            {(() => {
              const b = accountBlockers(editing, editing.uid)
              return b.length > 0 ? (
                <Alert tone="danger" title="Cannot save yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert>
              ) : null
            })()}
          </div>
        )}
      </Drawer>

      {/* ── cost centre form ─────────────────────────────────── */}
      <Drawer
        open={!!ccEditing}
        onClose={() => setCcEditing(null)}
        title={ccEditing?.uid ? `Edit ${ccEditing.code}` : 'New cost centre'}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCcEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!ccEditing?.code?.trim() || !ccEditing.name?.trim()) { toast.error('A code and a name are required.'); return }
                if (costCentres.rows.some((c) => c.code === ccEditing.code && c.uid !== ccEditing.uid && !c.deletedAt)) { toast.error('That code is already in use.'); return }
                if (ccEditing.uid) costCentres.update(ccEditing.uid, ccEditing as CostCentre)
                else costCentres.create({ ...(ccEditing as CostCentre), uid: newUid('cc') })
                toast.success('Cost centre saved'); setCcEditing(null)
              }}
            >Save</Button>
          </>
        }
      >
        {ccEditing && (
          <div className="space-y-3">
            <Input label="Code" required value={ccEditing.code ?? ''} onChange={(e) => setCcEditing({ ...ccEditing, code: e.target.value })} />
            <Input label="Name" required value={ccEditing.name ?? ''} onChange={(e) => setCcEditing({ ...ccEditing, name: e.target.value })} />
            <Select label="Type" value={ccEditing.centreType ?? 'PRODUCTION'} onChange={(e) => setCcEditing({ ...ccEditing, centreType: e.target.value as CostCentre['centreType'] })} hint="Production centres absorb overhead into WIP; service centres are apportioned to them">
              <option value="PRODUCTION">Production</option>
              <option value="SERVICE">Service</option>
              <option value="ADMIN">Administration</option>
              <option value="SALES">Sales</option>
            </Select>
            <Input label="Manager" value={ccEditing.manager ?? ''} onChange={(e) => setCcEditing({ ...ccEditing, manager: e.target.value })} />
            <Input label="Plant" value={ccEditing.plant ?? ''} onChange={(e) => setCcEditing({ ...ccEditing, plant: e.target.value })} />
            <Input label="Work centre" value={ccEditing.workCentreCode ?? ''} onChange={(e) => setCcEditing({ ...ccEditing, workCentreCode: e.target.value || null })} hint="The shop-floor work centre this mirrors, where there is one" />
            <Switch label="Active" checked={ccEditing.isActive !== false} onChange={(v) => setCcEditing({ ...ccEditing, isActive: v })} />
          </div>
        )}
      </Drawer>

      {/* ── profit centre form ───────────────────────────────── */}
      <Drawer
        open={!!pcEditing}
        onClose={() => setPcEditing(null)}
        title={pcEditing?.uid ? `Edit ${pcEditing.code}` : 'New profit centre'}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPcEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!pcEditing?.code?.trim() || !pcEditing.name?.trim()) { toast.error('A code and a name are required.'); return }
                if (pcEditing.uid) profitCentres.update(pcEditing.uid, pcEditing as ProfitCentre)
                else profitCentres.create({ ...(pcEditing as ProfitCentre), uid: newUid('pc') })
                toast.success('Profit centre saved'); setPcEditing(null)
              }}
            >Save</Button>
          </>
        }
      >
        {pcEditing && (
          <div className="space-y-3">
            <Input label="Code" required value={pcEditing.code ?? ''} onChange={(e) => setPcEditing({ ...pcEditing, code: e.target.value })} />
            <Input label="Name" required value={pcEditing.name ?? ''} onChange={(e) => setPcEditing({ ...pcEditing, name: e.target.value })} />
            <Select label="Channel" value={pcEditing.channel ?? 'DOMESTIC'} onChange={(e) => setPcEditing({ ...pcEditing, channel: e.target.value as ProfitCentre['channel'] })}>
              <option value="DOMESTIC">Domestic</option>
              <option value="EXPORT">Export</option>
              <option value="OEM">OEM</option>
              <option value="RETAIL">Retail</option>
              <option value="ECOMMERCE">E-commerce</option>
            </Select>
            <Input label="Manager" value={pcEditing.manager ?? ''} onChange={(e) => setPcEditing({ ...pcEditing, manager: e.target.value })} />
            <Switch label="Active" checked={pcEditing.isActive !== false} onChange={(v) => setPcEditing({ ...pcEditing, isActive: v })} />
          </div>
        )}
      </Drawer>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xs uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="mt-0.5 text-xs tabular text-fg">{value}</p>
    </div>
  )
}

/* ── cost centres ─────────────────────────────────────────────── */

function CostCentreTab({
  rows, onEdit, onDelete, spendOf,
}: {
  rows: CostCentre[]
  onEdit: (c: CostCentre) => void
  onDelete: (c: CostCentre) => void
  spendOf: (code: string) => number
}) {
  const columns: Column<CostCentre>[] = [
    { key: 'code', header: 'Cost centre', width: '18rem', render: (c) => (<><p className="text-xs text-fg">{c.name}</p><p className="font-mono text-2xs text-fg-subtle">{c.code}</p></>) },
    { key: 'type', header: 'Type', width: '9rem', render: (c) => <Badge tone={c.centreType === 'PRODUCTION' ? 'brand' : c.centreType === 'SERVICE' ? 'progress' : 'neutral'} size="sm" dot={false}>{c.centreType.toLowerCase()}</Badge> },
    { key: 'manager', header: 'Manager', width: '12rem', render: (c) => <span className="text-2xs text-fg-muted">{c.manager || '—'}</span> },
    { key: 'plant', header: 'Plant / work centre', width: '13rem', render: (c) => (<><p className="text-2xs text-fg-muted">{c.plant || '—'}</p>{c.workCentreCode && <p className="font-mono text-3xs text-fg-subtle">{c.workCentreCode}</p>}</>) },
    { key: 'spend', header: 'Charged this year', width: '13rem', align: 'right', render: (c) => <Amount value={spendOf(c.code)} className="text-xs" blankZero /> },
    { key: 'active', header: 'Status', width: '7rem', render: (c) => <Badge tone={c.isActive ? 'success' : 'neutral'} size="sm">{c.isActive ? 'Active' : 'Inactive'}</Badge> },
  ]
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(c) => c.uid}
      rowActions={(c) => (<><MenuItem label="Edit" onClick={() => onEdit(c)} /><MenuItem label="Delete" danger onClick={() => onDelete(c)} /></>)}
      emptyTitle={'No cost centres'}
            emptyDescription={'Add one to start attributing overhead.'}
    />
  )
}

/* ── profit centres ───────────────────────────────────────────── */

function ProfitCentreTab({
  rows, onEdit, onDelete, resultOf,
}: {
  rows: ProfitCentre[]
  onEdit: (p: ProfitCentre) => void
  onDelete: (p: ProfitCentre) => void
  resultOf: (code: string) => { income: number; expense: number; profit: number }
}) {
  const columns: Column<ProfitCentre>[] = [
    { key: 'code', header: 'Profit centre', width: '18rem', render: (p) => (<><p className="text-xs text-fg">{p.name}</p><p className="font-mono text-2xs text-fg-subtle">{p.code}</p></>) },
    { key: 'channel', header: 'Channel', width: '11rem', render: (p) => <Badge tone="neutral" size="sm" dot={false}>{p.channel.toLowerCase()}</Badge> },
    { key: 'manager', header: 'Manager', width: '12rem', render: (p) => <span className="text-2xs text-fg-muted">{p.manager || '—'}</span> },
    { key: 'income', header: 'Income', width: '12rem', align: 'right', render: (p) => <Amount value={resultOf(p.code).income} className="text-xs" blankZero /> },
    { key: 'expense', header: 'Cost', width: '12rem', align: 'right', render: (p) => <Amount value={resultOf(p.code).expense} className="text-xs" blankZero /> },
    {
      key: 'profit', header: 'Result', width: '12rem', align: 'right',
      render: (p) => { const r = resultOf(p.code); return <Amount value={r.profit} className={cn('text-xs font-medium', r.profit < 0 && 'text-danger')} blankZero /> },
    },
    { key: 'active', header: 'Status', width: '7rem', render: (p) => <Badge tone={p.isActive ? 'success' : 'neutral'} size="sm">{p.isActive ? 'Active' : 'Inactive'}</Badge> },
  ]
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(p) => p.uid}
      rowActions={(p) => (<><MenuItem label="Edit" onClick={() => onEdit(p)} /><MenuItem label="Delete" danger onClick={() => onDelete(p)} /></>)}
      emptyTitle={'No profit centres'}
            emptyDescription={'Add one to report a segment result.'}
    />
  )
}
