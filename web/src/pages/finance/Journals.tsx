import { useMemo, useState } from 'react'
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { Amount, DetailBlock, FinStatusBadge, VoucherBadge, inr, useFinanceData } from '@/components/finance/FinShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/format'
import { VOUCHER_LABEL, accountLedger, buildReversal, checkJournal, money } from '@/lib/finFlow'
import { newUid } from '@/store/data'
import type { Journal, JournalLine, VoucherType } from '@/types/finance'

/**
 * Journals and the general ledger (Ch 6).
 *
 * The only way into the ledger. Nothing posts unless it balances, the account
 * exists and is a posting account, a control account carries its party, and
 * the period is open — so the trial balance can be trusted without anyone
 * checking it.
 */

const MANUAL_TYPES: VoucherType[] = ['JOURNAL', 'CONTRA', 'ACCRUAL', 'RECEIPT', 'PAYMENT']

interface LineEntry {
  accountCode: string
  side: 'DR' | 'CR'
  amount: string
  costCentre: string
  profitCentre: string
  partyCode: string
  narration: string
}

const emptyLine = (): LineEntry => ({ accountCode: '', side: 'DR', amount: '', costCentre: '', profitCentre: '', partyCode: '', narration: '' })

export function JournalsPage() {
  const toast = useToast()
  const { journals, accounts, costCentres, profitCentres, periods } = useFinanceData()
  const { rows, create, update, remove } = journals

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<Journal | null>(null)
  const [ledgerFor, setLedgerFor] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ voucherType: 'JOURNAL' as VoucherType, date: new Date().toISOString().slice(0, 10), narration: '', lines: [emptyLine(), emptyLine()] })
  const [errors, setErrors] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Journal | null>(null)
  const [reversing, setReversing] = useState<Journal | null>(null)

  const live = detail ? rows.find((r) => r.uid === detail.uid) ?? detail : null
  const postingAccounts = accounts.rows.filter((a) => !a.isGroup && a.isActive && !a.deletedAt)

  const counts = {
    all: rows.length,
    draft: rows.filter((j) => j.status === 'DRAFT' || j.status === 'PENDING_APPROVAL').length,
    posted: rows.filter((j) => j.status === 'POSTED').length,
    manual: rows.filter((j) => !j.isAuto).length,
    reversed: rows.filter((j) => j.status === 'REVERSED' || j.reversalOf).length,
  }

  const filtered = rows.filter((j) => {
    if (tab === 'draft') return j.status === 'DRAFT' || j.status === 'PENDING_APPROVAL'
    if (tab === 'posted') return j.status === 'POSTED'
    if (tab === 'manual') return !j.isAuto
    if (tab === 'reversed') return j.status === 'REVERSED' || !!j.reversalOf
    return true
  }).sort((a, b) => b.date.localeCompare(a.date) || b.voucherNo.localeCompare(a.voucherNo))

  const totalOf = (j: Journal) => money(j.lines.reduce((s, l) => s + (l.debit || 0), 0))

  const columns: Column<Journal>[] = [
    { key: 'voucherNo', header: 'Voucher', sortable: true, width: '12rem', render: (j) => <span className="font-mono text-xs font-medium text-brand-600">{j.voucherNo}</span> },
    { key: 'voucherType', header: 'Type', sortable: true, width: '8rem', accessor: (j) => VOUCHER_LABEL[j.voucherType], render: (j) => <VoucherBadge type={j.voucherType} /> },
    { key: 'date', header: 'Date', sortable: true, width: '8rem', accessor: (j) => j.date, render: (j) => formatDate(j.date) },
    { key: 'period', header: 'Period', width: '6.5rem', render: (j) => <span className="font-mono text-2xs text-fg-muted">{j.period}</span> },
    { key: 'narration', header: 'Narration', render: (j) => (<><p className="max-w-[24rem] truncate text-xs text-fg">{j.narration}</p>{j.sourceDocNo && <p className="font-mono text-2xs text-fg-subtle">{j.sourceDocNo}</p>}</>) },
    { key: 'lineCount', header: 'Lines', align: 'right', width: '5rem', accessor: (j) => j.lines.length },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true, width: '11rem', accessor: (j) => totalOf(j), render: (j) => inr(totalOf(j)) },
    { key: 'isAuto', header: 'Origin', width: '7rem', accessor: (j) => (j.isAuto ? 'Automatic' : 'Manual'), render: (j) => <span className="text-2xs text-fg-muted">{j.isAuto ? 'Automatic' : 'Manual'}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (j) => <FinStatusBadge status={j.status} /> },
  ]

  /* ── The form, checked live ────────────────────────────────────────── */

  const draftJournal = useMemo(() => ({
    lines: form.lines.map((l, i) => ({
      uid: `tmp-${i}`,
      accountCode: l.accountCode,
      accountName: postingAccounts.find((a) => a.code === l.accountCode)?.name ?? '',
      debit: l.side === 'DR' ? Number(l.amount) || 0 : 0,
      credit: l.side === 'CR' ? Number(l.amount) || 0 : 0,
      costCentre: l.costCentre,
      profitCentre: l.profitCentre,
      partyType: null,
      partyCode: l.partyCode,
      narration: l.narration,
    } as JournalLine)),
    date: form.date,
    period: form.date.slice(0, 7),
  }), [form, postingAccounts])

  const liveCheck = useMemo(() => checkJournal(draftJournal, accounts.rows, periods.rows), [draftJournal, accounts.rows, periods.rows])

  const setLine = (i: number, patch: Partial<LineEntry>) => setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))

  /** Puts the running difference on the next empty line — the usual shortcut. */
  const balanceLine = (i: number) => {
    const diff = money(liveCheck.totalDebit - liveCheck.totalCredit)
    if (Math.abs(diff) < 0.005) { toast.success('Already balanced', 'Debits and credits agree.'); return }
    setLine(i, { side: diff > 0 ? 'CR' : 'DR', amount: String(Math.abs(diff)) })
  }

  function openCreate() {
    setForm({ voucherType: 'JOURNAL', date: new Date().toISOString().slice(0, 10), narration: '', lines: [emptyLine(), emptyLine()] })
    setErrors([])
    setFormOpen(true)
  }

  function save(post: boolean) {
    if (!form.narration.trim()) { setErrors(['A narration is required — it is what the auditor reads.']); return }
    if (liveCheck.problems.length) { setErrors(liveCheck.problems); return }
    setErrors([])

    const seq = rows.length + 1
    const voucherNo = `${form.voucherType === 'CONTRA' ? 'CV' : 'JV'}/26-27/${String(seq).padStart(5, '0')}`
    create({
      uid: newUid('fj'),
      voucherNo,
      voucherType: form.voucherType,
      date: form.date,
      period: form.date.slice(0, 7),
      narration: form.narration.trim(),
      currency: 'INR',
      exchangeRate: 1,
      lines: draftJournal.lines.map((l, i) => ({ ...l, uid: `fjl-${Date.now().toString(36)}-${i}` })),
      status: post ? 'POSTED' : 'DRAFT',
      sourceType: '',
      sourceDocNo: '',
      isAuto: false,
      reversalOf: null,
      reversedBy: null,
      createdBy: 'K. Raman',
      createdAt: new Date().toISOString(),
      approvedBy: post ? 'K. Raman' : null,
      postedAt: post ? new Date().toISOString() : null,
      version: 1,
    } as Journal)
    toast.success(post ? 'Journal posted' : 'Draft saved', `${voucherNo} for ${inr(liveCheck.totalDebit)}${post ? ' is in the ledger.' : ' — post it when you are ready.'}`)
    setFormOpen(false)
  }

  function post(j: Journal) {
    const check = checkJournal(j, accounts.rows, periods.rows)
    if (check.problems.length) { toast.error('Cannot post', check.problems[0]); return }
    update(j.uid, { status: 'POSTED', approvedBy: 'K. Raman', postedAt: new Date().toISOString(), version: j.version + 1 })
    toast.success('Posted', `${j.voucherNo} is in the ledger and can no longer be edited — correct it with a reversal.`)
  }

  function reverse(j: Journal) {
    const seq = rows.length + 1
    const voucherNo = `RV/26-27/${String(seq).padStart(5, '0')}`
    const today = new Date().toISOString().slice(0, 10)
    const rev = buildReversal(j, voucherNo, today, today.slice(0, 7))
    create({ ...rev, uid: newUid('fj') })
    update(j.uid, { status: 'REVERSED', reversedBy: voucherNo, version: j.version + 1 })
    toast.success('Reversed', `${voucherNo} reverses ${j.voucherNo}. Both stay in the ledger — the audit trail is the point.`)
    setReversing(null)
    setDetail(null)
  }

  const ledger = useMemo(
    () => (ledgerFor ? accountLedger(ledgerFor, journals.rows, accounts.rows) : []),
    [ledgerFor, journals.rows, accounts.rows],
  )
  const ledgerAccount = accounts.rows.find((a) => a.code === ledgerFor)

  return (
    <div>
      <PageHeader
        title="Journals & general ledger"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Journals' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>New journal</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'draft', label: 'Unposted', count: counts.draft },
          { id: 'posted', label: 'Posted', count: counts.posted },
          { id: 'manual', label: 'Manual', count: counts.manual },
          { id: 'reversed', label: 'Reversals', count: counts.reversed },
        ]} />}
      />

      {counts.draft > 0 && tab === 'all' && (
        <Alert tone="warning" className="mb-4">
          {counts.draft} journal{counts.draft === 1 ? '' : 's'} still unposted. A period cannot be closed while any
          remain, because the statements would be missing them.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(j) => j.uid}
        searchPlaceholder="Search voucher, narration or source document…"
        onExport={(f) => { const n = exportRows(f, 'journals', 'Journal register', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        onRowClick={setDetail}
        rowClassName={(j) => (j.status === 'DRAFT' || j.status === 'PENDING_APPROVAL' ? 'bg-warning/5' : j.status === 'REVERSED' ? 'opacity-60' : undefined)}
        emptyTitle="No journals"
        emptyDescription="Every operational document posts one automatically; a manual entry starts here."
        rowActions={(j) => (
          <>
            <MenuItem label="Edit" disabled={j.status !== 'DRAFT'} onClick={() => setDetail(j)} />
            <MenuItem label="Post to the ledger" icon={<Check />} separatorBefore disabled={j.status !== 'DRAFT' && j.status !== 'PENDING_APPROVAL'} onClick={() => post(j)} />
            <MenuItem label="Reverse" icon={<RotateCcw />} disabled={j.status !== 'POSTED'} onClick={() => setReversing(j)} />
            <MenuItem label={j.status === 'POSTED' ? 'Delete — blocked (posted)' : 'Delete'} icon={<Trash2 />} danger separatorBefore disabled={j.status === 'POSTED' || j.status === 'REVERSED'} onClick={() => setConfirmDelete(j)} />
          </>
        )}
      />

      {/* Voucher detail ---------------------------------------------------- */}
      <Drawer
        open={!!live}
        onClose={() => setDetail(null)}
        title={live?.voucherNo}
        description={live?.narration}
        width="max-w-4xl"
        footer={live && (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-2xs text-fg-subtle">
              {live.isAuto ? 'Posted automatically' : `Raised by ${live.createdBy}`}
              {live.postedAt && ` · ${formatDateTime(live.postedAt)}`}
            </span>
            <div className="flex gap-2">
              {(live.status === 'DRAFT' || live.status === 'PENDING_APPROVAL') && <Button variant="success" size="sm" onClick={() => post(live)}>Post</Button>}
              {live.status === 'POSTED' && <Button variant="outline" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setReversing(live)}>Reverse</Button>}
            </div>
          </div>
        )}
      >
        {live && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <VoucherBadge type={live.voucherType} />
              <FinStatusBadge status={live.status} size="md" />
              {live.reversalOf && <span className="text-2xs text-fg-muted">Reverses {live.reversalOf}</span>}
              {live.reversedBy && <span className="text-2xs text-danger">Reversed by {live.reversedBy}</span>}
            </div>

            <DataGrid columns={3} items={[
              { label: 'Date', value: formatDate(live.date) },
              { label: 'Period', value: live.period, mono: true },
              { label: 'Currency', value: `${live.currency} @ ${live.exchangeRate}` },
              { label: 'Source', value: live.sourceDocNo || 'Manual entry', mono: !!live.sourceDocNo },
              { label: 'Raised by', value: live.createdBy },
              { label: 'Approved by', value: live.approvedBy ?? 'Not approved' },
            ]} />

            <DetailBlock title={`Entries (${live.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '6rem' }}>Code</th>
                      <th>Account</th>
                      <th style={{ width: '7rem' }}>Cost centre</th>
                      <th style={{ width: '7rem' }}>Party</th>
                      <th className="text-right" style={{ width: '10rem' }}>Debit</th>
                      <th className="text-right" style={{ width: '10rem' }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.lines.map((l) => (
                      <tr key={l.uid} className="cursor-pointer" onClick={() => { setLedgerFor(l.accountCode); setDetail(null) }}>
                        <td className="font-mono text-2xs text-brand-600">{l.accountCode}</td>
                        <td><p className="text-xs text-fg">{l.accountName}</p>{l.narration && <p className="text-2xs text-fg-subtle">{l.narration}</p>}</td>
                        <td className="text-2xs text-fg-muted">{l.costCentre || '—'}</td>
                        <td className="font-mono text-2xs text-fg-muted">{l.partyCode || '—'}</td>
                        <td className="text-right text-xs tabular">{l.debit ? inr(l.debit) : <span className="text-fg-subtle">—</span>}</td>
                        <td className="text-right text-xs tabular">{l.credit ? inr(l.credit) : <span className="text-fg-subtle">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={4} className="text-right text-xs font-semibold text-fg">Totals</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">{inr(money(live.lines.reduce((s, l) => s + l.debit, 0)))}</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">{inr(money(live.lines.reduce((s, l) => s + l.credit, 0)))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-1.5 text-2xs text-fg-subtle">Click any line to open that account's ledger.</p>
            </DetailBlock>
          </div>
        )}
      </Drawer>

      {/* Account ledger ---------------------------------------------------- */}
      <Drawer
        open={!!ledgerFor}
        onClose={() => setLedgerFor(null)}
        title={ledgerAccount ? `${ledgerAccount.code} — ${ledgerAccount.name}` : ''}
        description={ledgerAccount ? `${ledgerAccount.accountType.toLowerCase()} · ${ledgerAccount.category}` : ''}
        width="max-w-5xl"
      >
        {ledgerFor && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
              <span className="text-fg-muted">Entries <span className="font-semibold text-fg tabular">{ledger.length}</span></span>
              <span className="text-fg-muted">Debits <span className="font-semibold text-fg tabular">{inr(money(ledger.reduce((s, e) => s + e.debit, 0)))}</span></span>
              <span className="text-fg-muted">Credits <span className="font-semibold text-fg tabular">{inr(money(ledger.reduce((s, e) => s + e.credit, 0)))}</span></span>
              <span className="ml-auto text-fg-muted">
                Closing <span className="font-semibold text-fg tabular">{ledger.length ? inr(Math.abs(ledger[ledger.length - 1].runningBalance)) : '0.00'} {ledger.length && ledger[ledger.length - 1].runningBalance < 0 ? 'Cr' : 'Dr'}</span>
              </span>
            </div>
            <div className="overflow-x-auto rounded border border-border">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: '8rem' }}>Date</th>
                    <th style={{ width: '11rem' }}>Voucher</th>
                    <th>Narration</th>
                    <th className="text-right" style={{ width: '10rem' }}>Debit</th>
                    <th className="text-right" style={{ width: '10rem' }}>Credit</th>
                    <th className="text-right" style={{ width: '12rem' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e, i) => (
                    <tr key={`${e.voucherNo}-${i}`}>
                      <td className="text-2xs text-fg-muted">{formatDate(e.date)}</td>
                      <td className="font-mono text-2xs text-brand-600">{e.voucherNo}</td>
                      <td className="max-w-[22rem] truncate text-xs text-fg">{e.narration}</td>
                      <td className="text-right text-xs tabular">{e.debit ? inr(e.debit) : <span className="text-fg-subtle">—</span>}</td>
                      <td className="text-right text-xs tabular">{e.credit ? inr(e.credit) : <span className="text-fg-subtle">—</span>}</td>
                      <td className="text-right text-xs tabular">{inr(Math.abs(e.runningBalance))} <span className="text-2xs text-fg-subtle">{e.runningBalance < 0 ? 'Cr' : 'Dr'}</span></td>
                    </tr>
                  ))}
                  {!ledger.length && <tr><td colSpan={6} className="py-6 text-center text-2xs text-fg-subtle">Nothing posted to this account.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>

      {/* New journal --------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New journal"
        size="full"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => save(false)}>Save draft</Button>
            <Button variant="primary" disabled={!liveCheck.isBalanced} onClick={() => save(true)}>Post to the ledger</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-4">
          <Select label="Voucher type" value={form.voucherType} onChange={(e) => setForm({ ...form, voucherType: e.target.value as VoucherType })} options={MANUAL_TYPES.map((t) => ({ value: t, label: VOUCHER_LABEL[t] }))} />
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} hint={`Posts to period ${form.date.slice(0, 7)}`} />
          <Textarea label="Narration" required containerClassName="sm:col-span-2" rows={2} value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} />
        </div>

        {errors.length > 0 && (
          <Alert tone="danger" className="mt-3" title="This journal cannot be posted">
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{errors.map((e) => (<li key={e}>{e}</li>))}</ul>
          </Alert>
        )}

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Entries ({form.lines.length})</p>
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addLine}>Add line</Button>
          </div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="grid-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '16rem' }}>Account *</th>
                  <th style={{ width: '5.5rem' }}>Side</th>
                  <th className="text-right" style={{ width: '9rem' }}>Amount *</th>
                  <th style={{ minWidth: '9rem' }}>Cost centre</th>
                  <th style={{ minWidth: '9rem' }}>Profit centre</th>
                  <th style={{ minWidth: '8rem' }}>Party</th>
                  <th style={{ minWidth: '11rem' }}>Narration</th>
                  <th style={{ width: '5rem' }} />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((l, i) => {
                  const account = postingAccounts.find((a) => a.code === l.accountCode)
                  return (
                    <tr key={i}>
                      <td>
                        <select value={l.accountCode} aria-label={`Account on line ${i + 1}`} onChange={(e) => setLine(i, { accountCode: e.target.value })} className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none">
                          <option value="">Select an account…</option>
                          {postingAccounts.map((a) => (<option key={a.uid} value={a.code}>{a.code} — {a.name}</option>))}
                        </select>
                      </td>
                      <td>
                        <select value={l.side} aria-label={`Side on line ${i + 1}`} onChange={(e) => setLine(i, { side: e.target.value as 'DR' | 'CR' })} className="h-7 w-full rounded border border-border bg-surface px-1 text-xs text-fg focus:border-brand-500 focus:outline-none">
                          <option value="DR">Dr</option><option value="CR">Cr</option>
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.01" min={0} value={l.amount} aria-label={`Amount on line ${i + 1}`} onChange={(e) => setLine(i, { amount: e.target.value })} className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none" />
                      </td>
                      <td>
                        <select value={l.costCentre} aria-label={`Cost centre on line ${i + 1}`} onChange={(e) => setLine(i, { costCentre: e.target.value })} className={cn('h-7 w-full rounded border bg-surface px-1 text-xs text-fg focus:border-brand-500 focus:outline-none', account?.requiresCostCentre && !l.costCentre ? 'border-danger' : 'border-border')}>
                          <option value="">{account?.requiresCostCentre ? 'Required' : 'None'}</option>
                          {costCentres.rows.map((c) => (<option key={c.uid} value={c.code}>{c.code}</option>))}
                        </select>
                      </td>
                      <td>
                        <select value={l.profitCentre} aria-label={`Profit centre on line ${i + 1}`} onChange={(e) => setLine(i, { profitCentre: e.target.value })} className="h-7 w-full rounded border border-border bg-surface px-1 text-xs text-fg focus:border-brand-500 focus:outline-none">
                          <option value="">None</option>
                          {profitCentres.rows.map((c) => (<option key={c.uid} value={c.code}>{c.code}</option>))}
                        </select>
                      </td>
                      <td>
                        <input value={l.partyCode} aria-label={`Party on line ${i + 1}`} placeholder={account?.isControl ? 'Required' : '—'} onChange={(e) => setLine(i, { partyCode: e.target.value })} className={cn('h-7 w-full rounded border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none', account?.isControl && !l.partyCode ? 'border-danger' : 'border-border')} />
                      </td>
                      <td>
                        <input value={l.narration} aria-label={`Narration on line ${i + 1}`} onChange={(e) => setLine(i, { narration: e.target.value })} className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none" />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" title="Balance this line against the difference" aria-label={`Balance line ${i + 1}`} onClick={() => balanceLine(i)} className="text-2xs text-brand-600 hover:underline">=</button>
                          <button type="button" onClick={() => removeLine(i)} aria-label={`Remove line ${i + 1}`} className="text-fg-subtle hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2">
                  <td colSpan={2} className="text-right text-xs font-semibold text-fg">Totals</td>
                  <td className="text-right text-xs font-semibold tabular text-fg">
                    <span className="block">Dr {inr(liveCheck.totalDebit)}</span>
                    <span className="block">Cr {inr(liveCheck.totalCredit)}</span>
                  </td>
                  <td colSpan={5} className={cn('text-xs font-medium', liveCheck.isBalanced ? 'text-success' : 'text-danger')}>
                    {liveCheck.isBalanced ? 'Balanced' : `Out by ${inr(Math.abs(liveCheck.difference))} — use the “=” button on an empty line to take up the difference`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {liveCheck.problems.length > 0 && (
          <Alert tone="warning" className="mt-3">
            <ul className="list-disc space-y-0.5 pl-4">{liveCheck.problems.map((p) => (<li key={p}>{p}</li>))}</ul>
          </Alert>
        )}
      </Modal>

      <Modal
        open={!!reversing}
        onClose={() => setReversing(null)}
        title="Reverse this journal?"
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setReversing(null)}>Cancel</Button><Button variant="primary" onClick={() => reversing && reverse(reversing)}>Post the reversal</Button></>}
      >
        {reversing && (
          <div className="space-y-2 text-sm text-fg-muted">
            <p><span className="font-medium text-fg">{reversing.voucherNo}</span> — {reversing.narration}</p>
            <p className="text-xs">
              A contra journal is posted today with every debit and credit swapped, for {inr(money(reversing.lines.reduce((s, l) => s + l.debit, 0)))}.
              Both entries stay in the ledger. A posted journal is never deleted or edited — the trail is the point.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete journal"
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (confirmDelete) { remove(confirmDelete.uid); toast.success('Deleted', `${confirmDelete.voucherNo} was soft-deleted.`) } setConfirmDelete(null) }}>Delete</Button></>}
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.voucherNo} will be marked deleted, not physically removed. It has not been posted.</p>
      </Modal>
    </div>
  )
}
