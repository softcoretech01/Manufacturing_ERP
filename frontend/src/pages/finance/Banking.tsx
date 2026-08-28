import { useMemo, useState } from 'react'
import { Banknote, Check, Link2, Plus, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
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
import { formatDate } from '@/lib/format'
import { Amount, DetailBlock, ReconcileBadge, inr, inrCompact, useFinanceData } from '@/components/finance/FinShell'
import { accountBalance, money, reconcileBank } from '@/lib/finFlow'
import type { BankAccountRec, BankStatementLine, Journal, JournalLine } from '@/types/finance'

/**
 * Banking and reconciliation (Ch 12).
 *
 * Reconciliation is not an assertion that the bank and the books agree — they
 * almost never do on any given day. It is the explanation of the gap: cheques
 * we have written that the bank has not seen, and charges the bank has taken
 * that we have not recorded. What must come to zero is the residual once both
 * are accounted for.
 */

type Tab = 'accounts' | 'reconcile'

const BLANK_ACCOUNT = (): Partial<BankAccountRec> => ({
  code: '', accountCode: '', bankName: '', accountNumber: '', ifsc: '', branch: '',
  accountType: 'CURRENT', limit: 0, openingBalance: 0, isActive: true, version: 1,
})

export function BankingPage() {
  const toast = useToast()
  const fin = useFinanceData()
  const { bankAccounts, statement, accounts, journals } = fin

  const live = bankAccounts.rows.filter((b) => !b.deletedAt)
  const [tab, setTab] = useState<Tab>('accounts')
  const [activeCode, setActiveCode] = useState(() => live[0]?.code ?? '')
  const [editing, setEditing] = useState<Partial<BankAccountRec> | null>(null)
  const [detail, setDetail] = useState<BankAccountRec | null>(null)
  const [matching, setMatching] = useState<BankStatementLine | null>(null)
  const [posting, setPosting] = useState<BankStatementLine | null>(null)
  const [postTo, setPostTo] = useState('')
  const [postNarration, setPostNarration] = useState('')

  const active = live.find((b) => b.code === activeCode) ?? live[0]

  const recs = useMemo(
    () => live.map((b) => ({
      account: b,
      rec: reconcileBank(b.code, b.accountCode, statement.rows, accounts.rows, journals.rows),
      book: accountBalance(b.accountCode, journals.rows, accounts.rows),
      // No statement imported is not the same as a nil bank balance, and
      // reporting it as reconciled would be a lie the close relies on.
      hasStatement: statement.rows.some((l) => !l.deletedAt && l.bankAccountCode === b.code),
    })),
    [live, statement.rows, accounts.rows, journals.rows],
  )
  const activeRec = recs.find((r) => r.account.code === active?.code)

  const lines = useMemo(
    () => statement.rows.filter((l) => !l.deletedAt && l.bankAccountCode === active?.code).sort((a, b) => a.date.localeCompare(b.date)),
    [statement.rows, active?.code],
  )

  /** Vouchers that touch this bank ledger and are not yet matched to a line. */
  const candidates = useMemo(() => {
    if (!active) return []
    const taken = new Set(statement.rows.filter((l) => !l.deletedAt && l.matchedVoucherNo).map((l) => l.matchedVoucherNo as string))
    return journals.rows
      .filter((j) => !j.deletedAt && j.status === 'POSTED' && !taken.has(j.voucherNo))
      .map((j) => ({ journal: j, amount: money(j.lines.filter((l) => l.accountCode === active.accountCode).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) }))
      .filter((c) => Math.abs(c.amount) > 0.005)
      .sort((a, b) => b.journal.date.localeCompare(a.journal.date))
  }, [journals.rows, statement.rows, active])

  /**
   * Suggested matches: same amount, same direction, within a week. Anything the
   * rule is not sure about is left for a human rather than guessed.
   */
  function suggestionsFor(line: BankStatementLine) {
    const want = money(line.deposit - line.withdrawal)
    return candidates
      .map((c) => {
        const dayGap = Math.abs(new Date(c.journal.date).getTime() - new Date(line.date).getTime()) / 86_400_000
        const amountMatch = Math.abs(c.amount - want) < 0.005
        const refMatch = !!line.reference && (c.journal.voucherNo.includes(line.reference) || line.description.toLowerCase().includes(c.journal.sourceDocNo.toLowerCase()) && !!c.journal.sourceDocNo)
        const score = (amountMatch ? 60 : 0) + (refMatch ? 25 : 0) + Math.max(0, 15 - dayGap * 2)
        return { ...c, dayGap, amountMatch, refMatch, score: Math.round(score) }
      })
      .filter((c) => c.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }

  function match(line: BankStatementLine, voucherNo: string) {
    statement.update(line.uid, { matchedVoucherNo: voucherNo, matchedAt: new Date().toISOString() })
    toast.success(`Matched to ${voucherNo}`)
    setMatching(null)
  }

  function unmatch(line: BankStatementLine) {
    statement.update(line.uid, { matchedVoucherNo: null, matchedAt: null })
    toast.success('Match removed')
  }

  /** Auto-match everything the rule is certain about, and say what it left. */
  function autoMatch() {
    if (!active) return
    let done = 0
    const used = new Set<string>()
    for (const line of lines.filter((l) => !l.matchedVoucherNo)) {
      const best = suggestionsFor(line).filter((s) => s.amountMatch && !used.has(s.journal.voucherNo))
      if (best.length === 1 || (best.length > 1 && best[0].score - best[1].score >= 15)) {
        used.add(best[0].journal.voucherNo)
        statement.update(line.uid, { matchedVoucherNo: best[0].journal.voucherNo, matchedAt: new Date().toISOString() })
        done += 1
      }
    }
    const left = lines.filter((l) => !l.matchedVoucherNo).length - done
    toast.success(done ? `${done} line${done === 1 ? '' : 's'} matched · ${left} left for you` : 'Nothing could be matched with certainty')
  }

  /**
   * A statement line with no voucher is money the bank moved that the books do
   * not know about — a charge, interest, a direct credit. Posting it writes the
   * journal and matches the line in one action, because doing one without the
   * other is what leaves reconciliations permanently out.
   */
  function postUnrecorded() {
    if (!posting || !active) return
    const contra = accounts.rows.find((a) => a.code === postTo)
    if (!contra) { toast.error('Choose the account to post the other side to.'); return }
    const bank = accounts.rows.find((a) => a.code === active.accountCode)
    if (!bank) { toast.error('The bank ledger account is missing from the chart.'); return }

    const value = money(posting.deposit - posting.withdrawal)
    const voucherNo = `BNK-${String(journals.rows.length + 1).padStart(4, '0')}`
    const line = (acc: typeof contra, debit: number, credit: number): JournalLine => ({
      uid: newUid('jl'), accountCode: acc.code, accountName: acc.name,
      debit: money(debit), credit: money(credit), costCentre: '', profitCentre: '',
      partyType: null, partyCode: '', narration: postNarration || posting.description,
    })

    const journal: Journal = {
      uid: newUid('jv'),
      voucherNo,
      voucherType: value >= 0 ? 'RECEIPT' : 'PAYMENT',
      date: posting.date,
      period: posting.date.slice(0, 7),
      narration: postNarration || posting.description,
      currency: 'INR',
      exchangeRate: 1,
      lines: value >= 0
        ? [line(bank, value, 0), line(contra, 0, value)]
        : [line(contra, -value, 0), line(bank, 0, -value)],
      status: 'POSTED',
      sourceType: 'BANK_STATEMENT',
      sourceDocNo: posting.reference || posting.description,
      isAuto: false,
      reversalOf: null,
      reversedBy: null,
      createdBy: 'You',
      createdAt: new Date().toISOString(),
      approvedBy: 'You',
      postedAt: new Date().toISOString(),
      version: 1,
    }

    journals.create(journal)
    statement.update(posting.uid, { matchedVoucherNo: voucherNo, matchedAt: new Date().toISOString() })
    toast.success(`${voucherNo} posted and matched — the reconciliation is now ${inr(Math.abs(money(activeRec ? activeRec.rec.difference : 0)))} closer`)
    setPosting(null); setPostTo(''); setPostNarration('')
  }

  function saveAccount() {
    if (!editing) return
    if (!editing.code?.trim() || !editing.bankName?.trim()) { toast.error('A code and a bank name are required.'); return }
    if (!editing.accountCode || !accounts.rows.some((a) => a.code === editing.accountCode && !a.isGroup)) {
      toast.error('Link the bank to a posting account in the chart — without it nothing can reconcile.'); return
    }
    if (bankAccounts.rows.some((b) => b.code === editing.code && b.uid !== editing.uid && !b.deletedAt)) { toast.error('That code is already in use.'); return }
    if (editing.uid) bankAccounts.update(editing.uid, editing as BankAccountRec)
    else bankAccounts.create({ ...(BLANK_ACCOUNT() as BankAccountRec), ...(editing as BankAccountRec), uid: newUid('bank') })
    toast.success('Bank account saved')
    setEditing(null)
  }

  function removeAccount(b: BankAccountRec) {
    if (statement.rows.some((l) => !l.deletedAt && l.bankAccountCode === b.code)) {
      toast.error('Statement lines exist for this account. Deactivate it instead.'); return
    }
    bankAccounts.remove(b.uid)
    toast.success(`${b.code} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const accountColumns: Column<(typeof recs)[number]>[] = [
    {
      key: 'bank', header: 'Account', width: '20rem',
      render: (r) => (<><p className="text-xs text-fg">{r.account.bankName}</p><p className="font-mono text-2xs text-fg-subtle">{r.account.code} · {r.account.accountNumber}</p></>),
    },
    { key: 'type', header: 'Type', width: '7rem', render: (r) => <Badge tone={r.account.accountType === 'CC' || r.account.accountType === 'OD' ? 'warning' : 'brand'} size="sm" dot={false}>{r.account.accountType}</Badge> },
    { key: 'branch', header: 'Branch / IFSC', width: '13rem', render: (r) => (<><p className="text-2xs text-fg-muted">{r.account.branch}</p><p className="font-mono text-3xs text-fg-subtle">{r.account.ifsc}</p></>) },
    { key: 'ledger', header: 'Ledger', width: '9rem', render: (r) => <span className="font-mono text-2xs text-fg-muted">{r.account.accountCode}</span> },
    { key: 'book', header: 'Per books', width: '12rem', align: 'right', render: (r) => <Amount value={r.book} className="text-xs" /> },
    {
      key: 'bankBal', header: 'Per bank', width: '12rem', align: 'right',
      render: (r) => r.hasStatement ? <Amount value={r.rec.bankBalance} className="text-xs" /> : <span className="text-2xs text-fg-subtle">No statement</span>,
    },
    {
      key: 'limit', header: 'Headroom', width: '11rem', align: 'right',
      render: (r) => r.account.limit > 0
        ? <span className="text-xs tabular text-fg-muted">{inr(money(r.account.limit + Math.min(0, r.book)))}</span>
        : <span className="text-2xs text-fg-subtle">—</span>,
    },
    {
      key: 'rec', header: 'Reconciliation', width: '13rem',
      render: (r) => r.hasStatement
        ? <ReconcileBadge ok={r.rec.reconciles} label={r.rec.reconciles ? 'Explained' : `Out ${inr(Math.abs(r.rec.difference))}`} />
        : <Badge tone="neutral" size="sm">Not reconciled</Badge>,
    },
  ]

  const statementColumns: Column<BankStatementLine>[] = [
    { key: 'date', header: 'Date', width: '7rem', render: (l) => <span className="text-2xs tabular text-fg-muted">{formatDate(l.date)}</span> },
    {
      key: 'desc', header: 'Narration', width: '24rem',
      render: (l) => (<><p className="truncate text-xs text-fg">{l.description}</p>{l.reference && <p className="font-mono text-3xs text-fg-subtle">{l.reference}</p>}</>),
    },
    { key: 'deposit', header: 'Deposit', width: '10rem', align: 'right', render: (l) => <span className="text-xs tabular text-success">{inr(l.deposit, { blankZero: true })}</span> },
    { key: 'withdrawal', header: 'Withdrawal', width: '10rem', align: 'right', render: (l) => <span className="text-xs tabular text-danger">{inr(l.withdrawal, { blankZero: true })}</span> },
    { key: 'balance', header: 'Balance', width: '11rem', align: 'right', render: (l) => <Amount value={l.balance} className="text-xs text-fg-muted" /> },
    {
      key: 'match', header: 'Matched to', width: '13rem',
      render: (l) => l.matchedVoucherNo
        ? <span className="inline-flex items-center gap-1 font-mono text-2xs text-success"><Check className="h-3 w-3" />{l.matchedVoucherNo}</span>
        : <Badge tone="warning" size="sm">Unmatched</Badge>,
    },
  ]

  const totalBook = money(recs.reduce((s, r) => s + r.book, 0))
  const withStatement = recs.filter((r) => r.hasStatement)
  const totalBank = money(withStatement.reduce((s, r) => s + r.rec.bankBalance, 0))
  const allReconcile = withStatement.length > 0 && withStatement.every((r) => r.rec.reconciles)

  return (
    <div>
      <PageHeader
        title="Banking"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Banking' }]}
        actions={
          tab === 'accounts'
            ? <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK_ACCOUNT())}>New bank account</Button>
            : <Button variant="primary" size="sm" icon={<Link2 />} onClick={autoMatch}>Auto-match</Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'accounts', label: 'Accounts', count: live.length },
              { id: 'reconcile', label: 'Reconciliation', count: recs.reduce((s, r) => s + r.rec.unmatchedStatementLines, 0) },
            ]}
          />
        }
      />

      {tab === 'accounts' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Cash at bank" value={`₹${inrCompact(totalBook)}`} sub="Per the books, across every account" icon={<Banknote />} tone={totalBook >= 0 ? 'success' : 'danger'} />
            <StatTile
              label="Per the statements"
              value={withStatement.length ? `₹${inrCompact(totalBank)}` : '—'}
              sub={withStatement.length ? `Across ${withStatement.length} account(s) with a statement imported` : 'No statements imported yet'}
              tone="brand"
            />
            <StatTile label="Sanctioned limits" value={`₹${inrCompact(money(live.reduce((s, b) => s + b.limit, 0)))}`} sub="Cash credit and overdraft" tone="progress" />
            <StatTile
              label="Reconciliation"
              value={withStatement.length === 0 ? 'No statements' : allReconcile ? 'All explained' : 'Attention'}
              sub={
                withStatement.length === 0
                  ? 'Import a statement to reconcile'
                  : allReconcile
                    ? `Every gap accounted for on ${withStatement.length} account(s)`
                    : `${withStatement.filter((r) => !r.rec.reconciles).length} account(s) out`
              }
              tone={withStatement.length === 0 ? 'neutral' : allReconcile ? 'success' : 'danger'}
            />
          </div>

          <DataTable
            rows={recs}
            columns={accountColumns}
            rowKey={(r) => r.account.uid}
            onRowClick={(r) => setDetail(r.account)}
            rowActions={(r) => (
              <>
                <MenuItem label="Edit" onClick={() => setEditing({ ...r.account })} />
                <MenuItem label="Reconcile" onClick={() => { setActiveCode(r.account.code); setTab('reconcile') }} />
                <MenuItem label="Delete" danger onClick={() => removeAccount(r.account)} />
              </>
            )}
            emptyTitle={'No bank accounts'}
            emptyDescription={'Add one and link it to a ledger account.'}
          />
        </>
      )}

      {tab === 'reconcile' && active && activeRec && !activeRec.hasStatement && (
        <Alert tone="info" title={`No statement has been imported for ${active.bankName}`} className="mb-4">
          The books carry {inr(activeRec.book)} on this account. Until a statement is loaded there is nothing to reconcile against, and the account must not be signed off at period close.
        </Alert>
      )}

      {tab === 'reconcile' && active && activeRec && (
        <>
          <Card className="mb-3">
            <CardBody className="flex flex-wrap items-end gap-3">
              <Select label="Bank account" value={activeCode} onChange={(e) => setActiveCode(e.target.value)} className="w-72">
                {live.map((b) => (<option key={b.uid} value={b.code}>{b.bankName} · {b.accountNumber}</option>))}
              </Select>
              <div className="ml-auto flex flex-wrap items-center gap-4 text-2xs">
                <span className="text-fg-muted">{lines.length} statement lines · <span className={activeRec.rec.unmatchedStatementLines ? 'text-warning' : 'text-success'}>{activeRec.rec.unmatchedStatementLines} unmatched</span></span>
                {activeRec.hasStatement
                  ? <ReconcileBadge ok={activeRec.rec.reconciles} label={activeRec.rec.reconciles ? 'Fully explained' : `Residual ${inr(Math.abs(activeRec.rec.difference))}`} />
                  : <Badge tone="neutral" size="sm">No statement imported</Badge>}
              </div>
            </CardBody>
          </Card>

          {activeRec.hasStatement && (
          <Card className="mb-4">
            <CardHeader title="How the two balances agree" description="Book balance, adjusted for what each side has not yet seen" />
            <CardBody className="p-0">
              <table className="grid-table">
                <tbody>
                  <ReconRow label="Balance as per the books" value={activeRec.rec.bookBalance} />
                  <ReconRow label="Less: cheques issued but not presented" value={-activeRec.rec.unpresented} hint="Posted by us, the bank has not seen them" muted />
                  <ReconRow label="Add: credits in our books not yet on the statement" value={0} hint="Nil this period" muted />
                  <ReconRow label="Adjusted book balance" value={money(activeRec.rec.bookBalance - activeRec.rec.unpresented)} bold />
                  <ReconRow label="Balance as per the bank statement" value={activeRec.rec.bankBalance} />
                  <ReconRow label="Less: charges and credits not yet recorded" value={-activeRec.rec.unrecorded} hint={`${activeRec.rec.unmatchedStatementLines} unmatched statement line(s)`} muted />
                  <ReconRow label="Adjusted bank balance" value={money(activeRec.rec.bankBalance - activeRec.rec.unrecorded)} bold />
                  <ReconRow label="Residual difference" value={activeRec.rec.difference} bold tone={activeRec.rec.reconciles ? 'success' : 'danger'} />
                </tbody>
              </table>
            </CardBody>
          </Card>
          )}

          {activeRec.hasStatement && !activeRec.rec.reconciles && (
            <Alert tone="warning" title="The reconciliation does not close" className="mb-4">
              A residual of {inr(Math.abs(activeRec.rec.difference))} remains after allowing for unpresented cheques and unrecorded bank items.
              Match the outstanding statement lines below, or post the ones the books have never seen.
            </Alert>
          )}
          {activeRec.hasStatement && activeRec.rec.unrecorded !== 0 && (
            <Alert tone="info" title="The bank has moved money we have not recorded" className="mb-4">
              {inr(Math.abs(activeRec.rec.unrecorded))} {activeRec.rec.unrecorded < 0 ? 'taken' : 'credited'} across {activeRec.rec.unmatchedStatementLines} line(s) — typically charges or interest.
              Use <strong>Post to ledger</strong> on the line to raise the entry and match it in one step.
            </Alert>
          )}

          <Section title="Statement lines">
            <DataTable
              rows={lines}
              columns={statementColumns}
              rowKey={(l) => l.uid}
              rowClassName={(l) => (l.matchedVoucherNo ? '' : 'bg-warning/5')}
              rowActions={(l) => (
                l.matchedVoucherNo
                  ? <MenuItem label="Remove match" icon={<Unlink />} onClick={() => unmatch(l)} />
                  : (
                    <>
                      <MenuItem label="Match to a voucher" icon={<Link2 />} onClick={() => setMatching(l)} />
                      <MenuItem label="Post to ledger" onClick={() => { setPosting(l); setPostTo(''); setPostNarration(l.description) }} />
                    </>
                  )
              )}
              emptyTitle={'No statement lines'}
            emptyDescription={'Import a statement to begin reconciling.'}
            />
          </Section>
        </>
      )}

      {/* ── match ────────────────────────────────────────────── */}
      <Modal open={!!matching} onClose={() => setMatching(null)} title="Match this line to a voucher" size="lg">
        {matching && (
          <div className="space-y-3">
            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg">{matching.description}</p>
              <p className="mt-1 text-2xs text-fg-muted">
                {formatDate(matching.date)} · {matching.deposit > 0 ? `deposit ${inr(matching.deposit)}` : `withdrawal ${inr(matching.withdrawal)}`}
                {matching.reference ? ` · ${matching.reference}` : ''}
              </p>
            </div>

            {(() => {
              const s = suggestionsFor(matching)
              if (!s.length) return <Alert tone="info" title="Nothing close enough to suggest">No posted voucher against this bank ledger is near this amount or date. If the books never recorded it, close this and use <strong>Post to ledger</strong> instead.</Alert>
              return (
                <div className="space-y-1.5">
                  {s.map((c) => (
                    <button
                      key={c.journal.uid}
                      type="button"
                      onClick={() => match(matching, c.journal.voucherNo)}
                      className="flex w-full items-center gap-3 rounded border border-border p-2.5 text-left transition-colors hover:border-brand-400 hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-fg">{c.journal.narration}</span>
                        <span className="block font-mono text-2xs text-fg-subtle">{c.journal.voucherNo} · {formatDate(c.journal.date)}{c.journal.sourceDocNo ? ` · ${c.journal.sourceDocNo}` : ''}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <Amount value={c.amount} className="block text-xs font-medium" />
                        <span className="mt-0.5 flex items-center justify-end gap-1">
                          {c.amountMatch && <Badge tone="success" size="sm" dot={false}>Amount</Badge>}
                          {c.dayGap <= 3 && <Badge tone="brand" size="sm" dot={false}>{c.dayGap === 0 ? 'Same day' : `${Math.round(c.dayGap)}d`}</Badge>}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </Modal>

      {/* ── post unrecorded ──────────────────────────────────── */}
      <Modal
        open={!!posting}
        onClose={() => setPosting(null)}
        title="Post this bank item to the ledger"
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setPosting(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={postUnrecorded} disabled={!postTo}>Post and match</Button></>}
      >
        {posting && active && (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">
              The bank {posting.deposit > 0 ? 'credited' : 'debited'} {inr(posting.deposit > 0 ? posting.deposit : posting.withdrawal)} on {formatDate(posting.date)} and the books have no entry for it.
              Posting here raises a balanced voucher and marks the line reconciled.
            </p>
            <Select label="Other side of the entry" required value={postTo} onChange={(e) => setPostTo(e.target.value)}>
              <option value="">Choose an account…</option>
              {accounts.rows
                .filter((a) => !a.isGroup && !a.deletedAt && a.isActive && a.code !== active.accountCode)
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
            </Select>
            <Textarea label="Narration" rows={2} value={postNarration} onChange={(e) => setPostNarration(e.target.value)} />
            {postTo && (
              <div className="rounded border border-border bg-surface-2 p-3">
                <p className="mb-1.5 text-3xs uppercase tracking-wider text-fg-subtle">The entry that will be posted</p>
                {(() => {
                  const value = money(posting.deposit - posting.withdrawal)
                  const bank = accounts.rows.find((a) => a.code === active.accountCode)
                  const other = accounts.rows.find((a) => a.code === postTo)
                  const rows = value >= 0
                    ? [{ a: bank, dr: value, cr: 0 }, { a: other, dr: 0, cr: value }]
                    : [{ a: other, dr: -value, cr: 0 }, { a: bank, dr: 0, cr: -value }]
                  return (
                    <table className="w-full text-xs">
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td className="py-0.5 text-fg">{r.a?.code} · {r.a?.name}</td>
                            <td className="py-0.5 text-right tabular text-fg">{r.dr ? inr(r.dr) : ''}</td>
                            <td className="py-0.5 text-right tabular text-fg">{r.cr ? inr(r.cr) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── account detail ───────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.bankName} · ${detail.accountNumber}` : ''} width="max-w-lg">
        {detail && (() => {
          const r = recs.find((x) => x.account.uid === detail.uid)
          return (
            <div className="space-y-4">
              <DetailBlock title="Bank">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code" value={detail.code} />
                  <Field label="Type" value={detail.accountType} />
                  <Field label="Branch" value={detail.branch || '—'} />
                  <Field label="IFSC" value={detail.ifsc || '—'} />
                  <Field label="Ledger account" value={detail.accountCode} />
                  <Field label="Sanctioned limit" value={detail.limit ? inr(detail.limit) : '—'} />
                </div>
              </DetailBlock>
              {r && (
                <DetailBlock title="Position">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Per books" value={inr(r.book)} />
                    <Field label="Per bank" value={inr(r.rec.bankBalance)} />
                    <Field label="Unpresented" value={inr(r.rec.unpresented)} />
                    <Field label="Unrecorded" value={inr(r.rec.unrecorded)} />
                  </div>
                  <div className="mt-3"><ReconcileBadge ok={r.rec.reconciles} label={r.rec.reconciles ? 'Fully explained' : `Residual ${inr(Math.abs(r.rec.difference))}`} /></div>
                </DetailBlock>
              )}
              {detail.limit > 0 && r && (
                <Alert tone={r.book < -detail.limit ? 'danger' : 'info'} title="Facility">
                  {r.book < 0
                    ? `Drawn ${inr(Math.abs(r.book))} of a ${inr(detail.limit)} limit — ${inr(money(detail.limit + r.book))} of headroom.`
                    : `The account is in credit; the full ${inr(detail.limit)} limit is unused.`}
                </Alert>
              )}
              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail }); setDetail(null) }}>Edit</Button>
                <Button variant="outline" size="sm" onClick={() => { setActiveCode(detail.code); setTab('reconcile'); setDetail(null) }}>Reconcile</Button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── account form ─────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.code}` : 'New bank account'}
        width="max-w-lg"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={saveAccount}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Code" required value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="HDFC-CA" />
              <Select label="Type" value={editing.accountType ?? 'CURRENT'} onChange={(e) => setEditing({ ...editing, accountType: e.target.value as BankAccountRec['accountType'] })}>
                <option value="CURRENT">Current</option>
                <option value="CC">Cash credit</option>
                <option value="OD">Overdraft</option>
                <option value="SAVINGS">Savings</option>
              </Select>
            </div>
            <Input label="Bank" required value={editing.bankName ?? ''} onChange={(e) => setEditing({ ...editing, bankName: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Account number" value={editing.accountNumber ?? ''} onChange={(e) => setEditing({ ...editing, accountNumber: e.target.value })} />
              <Input label="IFSC" value={editing.ifsc ?? ''} onChange={(e) => setEditing({ ...editing, ifsc: e.target.value.toUpperCase() })} />
            </div>
            <Input label="Branch" value={editing.branch ?? ''} onChange={(e) => setEditing({ ...editing, branch: e.target.value })} />
            <Select
              label="Ledger account"
              required
              value={editing.accountCode ?? ''}
              onChange={(e) => setEditing({ ...editing, accountCode: e.target.value })}
              hint="Where the postings land in the chart of accounts"
            >
              <option value="">Choose an account…</option>
              {accounts.rows.filter((a) => !a.isGroup && !a.deletedAt && a.accountType === 'ASSET').map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Sanctioned limit" type="number" value={String(editing.limit ?? 0)} onChange={(e) => setEditing({ ...editing, limit: Number(e.target.value) })} hint="Nil for a plain current account" />
              <Input label="Opening balance" type="number" value={String(editing.openingBalance ?? 0)} onChange={(e) => setEditing({ ...editing, openingBalance: Number(e.target.value) })} />
            </div>
            <Switch label="Active" checked={editing.isActive !== false} onChange={(v) => setEditing({ ...editing, isActive: v })} />
          </div>
        )}
      </Drawer>
    </div>
  )
}

function ReconRow({ label, value, hint, bold, muted, tone }: { label: string; value: number; hint?: string; bold?: boolean; muted?: boolean; tone?: 'success' | 'danger' }) {
  return (
    <tr className={cn(bold && 'bg-surface-2')}>
      <td>
        <p className={cn('text-xs', bold ? 'font-semibold text-fg' : muted ? 'text-fg-muted' : 'text-fg')}>{label}</p>
        {hint && <p className="text-3xs text-fg-subtle">{hint}</p>}
      </td>
      <td className="text-right" style={{ width: '14rem' }}>
        <Amount value={value} className={cn('text-xs', bold && 'font-semibold', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger')} />
      </td>
    </tr>
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
