import { useMemo, useState } from 'react'
import { CalendarCheck, Check, Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/format'
import { Amount, FinStatusBadge, ReconcileBadge, inr, inrCompact, useFinanceData } from '@/components/finance/FinShell'
import { balanceSheet, closeReadiness, money, profitAndLoss, trialBalance } from '@/lib/finFlow'
import type { FiscalPeriod } from '@/types/finance'

/**
 * Period close (Ch 19).
 *
 * A close is a promise that the numbers for a month will not move again, so
 * the checklist is not decoration. A soft close stops new postings and can be
 * lifted; a hard close needs every blocker cleared and every item signed, and
 * reopening one demands a reason that is kept.
 */

export function PeriodClosePage() {
  const toast = useToast()
  const fin = useFinanceData()
  const { periods, accounts, journals, documents } = fin

  const rows = useMemo(
    () => periods.rows.filter((p) => !p.deletedAt).sort((a, b) => b.period.localeCompare(a.period)),
    [periods.rows],
  )
  const [selectedUid, setSelectedUid] = useState<string | null>(() => rows.find((p) => p.status === 'OPEN')?.uid ?? rows[0]?.uid ?? null)
  const [reopening, setReopening] = useState<FiscalPeriod | null>(null)
  const [reopenReason, setReopenReason] = useState('')
  const [confirmClose, setConfirmClose] = useState<{ period: FiscalPeriod; hard: boolean } | null>(null)

  const selected = rows.find((p) => p.uid === selectedUid) ?? rows[0] ?? null

  const readiness = useMemo(
    () => (selected ? closeReadiness(selected, accounts.rows, journals.rows, documents.rows) : null),
    [selected, accounts.rows, journals.rows, documents.rows],
  )

  const figures = useMemo(() => {
    if (!selected) return null
    const pl = profitAndLoss(accounts.rows, journals.rows, selected.startDate, selected.endDate)
    const bs = balanceSheet(accounts.rows, journals.rows, selected.endDate)
    const tb = trialBalance(accounts.rows, journals.rows, selected.endDate)
    const inPeriod = journals.rows.filter((j) => !j.deletedAt && j.period === selected.period)
    return {
      pl, bs, tb,
      journalCount: inPeriod.length,
      unposted: inPeriod.filter((j) => j.status === 'DRAFT' || j.status === 'PENDING_APPROVAL'),
      postedValue: money(inPeriod.filter((j) => j.status === 'POSTED').flatMap((j) => j.lines).reduce((s, l) => s + (l.debit || 0), 0)),
    }
  }, [selected, accounts.rows, journals.rows, documents.rows])

  function toggleChecklist(period: FiscalPeriod, key: string) {
    if (period.status !== 'OPEN') { toast.error('The period is closed. Reopen it before changing the checklist.'); return }
    const checklist = period.checklist.map((c) =>
      c.key === key
        ? { ...c, done: !c.done, doneBy: c.done ? null : 'You', doneAt: c.done ? null : new Date().toISOString() }
        : c,
    )
    periods.update(period.uid, { checklist })
  }

  function signAll(period: FiscalPeriod) {
    if (period.status !== 'OPEN') { toast.error('The period is closed.'); return }
    const now = new Date().toISOString()
    periods.update(period.uid, { checklist: period.checklist.map((c) => (c.done ? c : { ...c, done: true, doneBy: 'You', doneAt: now })) })
    toast.success('Every checklist item signed')
  }

  function close(period: FiscalPeriod, hard: boolean) {
    const r = closeReadiness(period, accounts.rows, journals.rows, documents.rows)
    if (hard && !r.canHardClose) { toast.error(r.blockers[0] ?? 'Sign off every checklist item before a hard close.'); return }
    if (!hard && !r.canSoftClose) { toast.error(r.blockers[0] ?? 'Post or discard the outstanding journals first.'); return }
    periods.update(period.uid, {
      status: hard ? 'CLOSED' : 'SOFT_CLOSED',
      closedBy: 'You',
      closedAt: new Date().toISOString(),
    })
    toast.success(hard ? `${period.period} closed. The numbers are final.` : `${period.period} soft closed — no new postings, but it can still be reopened.`)
    setConfirmClose(null)
  }

  function reopen() {
    if (!reopening) return
    if (reopenReason.trim().length < 10) { toast.error('Give a reason of at least ten characters — a reopened period is audited.'); return }
    periods.update(reopening.uid, {
      status: 'OPEN',
      reopenedBy: 'You',
      reopenReason: reopenReason.trim(),
      closedBy: null,
      closedAt: null,
    })
    toast.success(`${reopening.period} reopened. The reason is recorded against the period.`)
    setReopening(null)
    setReopenReason('')
  }

  const columns: Column<FiscalPeriod>[] = [
    { key: 'period', header: 'Period', width: '9rem', render: (p) => (<><p className="text-xs font-medium text-fg">{p.period}</p><p className="text-2xs text-fg-subtle">{p.fiscalYear}</p></>) },
    { key: 'dates', header: 'Dates', width: '14rem', render: (p) => <span className="text-2xs tabular text-fg-muted">{formatDate(p.startDate)} — {formatDate(p.endDate)}</span> },
    { key: 'status', header: 'Status', width: '9rem', render: (p) => <FinStatusBadge status={p.status} /> },
    {
      key: 'checklist', header: 'Checklist', width: '14rem',
      render: (p) => {
        const done = p.checklist.filter((c) => c.done).length
        return (
          <div className="flex items-center gap-2">
            <ProgressBar value={p.checklist.length ? (done / p.checklist.length) * 100 : 0} tone={done === p.checklist.length ? 'success' : 'warning'} className="w-14" />
            <span className="text-2xs tabular text-fg-muted">{done}/{p.checklist.length}</span>
          </div>
        )
      },
    },
    {
      key: 'blockers', header: 'Blockers', width: '10rem',
      render: (p) => {
        const r = closeReadiness(p, accounts.rows, journals.rows, documents.rows)
        return r.blockers.length ? <Badge tone="danger" size="sm">{r.blockers.length}</Badge> : <Badge tone="success" size="sm">Clear</Badge>
      },
    },
    {
      key: 'closed', header: 'Closed', width: '15rem',
      render: (p) => p.closedAt
        ? (<><p className="text-2xs text-fg-muted">{formatDateTime(p.closedAt)}</p><p className="text-3xs text-fg-subtle">by {p.closedBy}</p></>)
        : <span className="text-2xs text-fg-subtle">—</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Period close"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Period close' }]}
        actions={
          selected && selected.status === 'OPEN' ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirmClose({ period: selected, hard: false })} disabled={!readiness?.canSoftClose}>Soft close</Button>
              <Button variant="primary" size="sm" icon={<Lock />} onClick={() => setConfirmClose({ period: selected, hard: true })} disabled={!readiness?.canHardClose}>Close {selected.period}</Button>
            </>
          ) : selected ? (
            <Button variant="outline" size="sm" icon={<Unlock />} onClick={() => { setReopening(selected); setReopenReason('') }}>Reopen {selected.period}</Button>
          ) : null
        }
      />

      {selected && readiness && figures && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={`${selected.period} status`}
              value={selected.status === 'OPEN' ? 'Open' : selected.status === 'SOFT_CLOSED' ? 'Soft closed' : 'Closed'}
              sub={selected.closedAt ? `by ${selected.closedBy} on ${formatDate(selected.closedAt.slice(0, 10))}` : `${formatDate(selected.startDate)} — ${formatDate(selected.endDate)}`}
              icon={<CalendarCheck />}
              tone={selected.status === 'OPEN' ? 'brand' : selected.status === 'CLOSED' ? 'neutral' : 'warning'}
            />
            <StatTile label="Checklist" value={`${readiness.checklistDone}/${readiness.checklistTotal}`} sub={readiness.checklistDone === readiness.checklistTotal ? 'Every item signed' : `${readiness.checklistTotal - readiness.checklistDone} still to sign`} tone={readiness.checklistDone === readiness.checklistTotal ? 'success' : 'warning'} />
            <StatTile label="Blockers" value={readiness.blockers.length} sub={readiness.blockers.length ? 'Must be cleared before a hard close' : 'The ledger is in a closable state'} tone={readiness.blockers.length ? 'danger' : 'success'} />
            <StatTile label="Profit for the period" value={`₹${inrCompact(figures.pl.netProfit)}`} sub={`On revenue of ₹${inrCompact(figures.pl.totalIncome)}`} tone={figures.pl.netProfit >= 0 ? 'success' : 'danger'} />
          </div>

          {readiness.blockers.length > 0 ? (
            <Alert tone="danger" title={`${selected.period} cannot be closed yet`} className="mb-4">
              <ul className="list-disc space-y-0.5 pl-4">{readiness.blockers.map((b) => (<li key={b}>{b}</li>))}</ul>
            </Alert>
          ) : (
            <Alert tone="tip" title="The ledger is ready" className="mb-4">
              The trial balance agrees, the balance sheet balances, every control account reconciles to its subledger and nothing is left unposted.
              {readiness.canHardClose ? ' The period can be closed.' : ` Sign the remaining ${readiness.checklistTotal - readiness.checklistDone} checklist item(s) to close it.`}
            </Alert>
          )}
          {readiness.warnings.map((w) => (<Alert key={w} tone="warning" title="Not yet signed" className="mb-4">{w}</Alert>))}

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Close checklist"
                description="Each item is signed by a person, with the time kept"
                actions={selected.status === 'OPEN' ? <Button variant="ghost" size="sm" onClick={() => signAll(selected)}>Sign all</Button> : undefined}
              />
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {selected.checklist.map((c) => (
                    <li key={c.key}>
                      <button
                        type="button"
                        onClick={() => toggleChecklist(selected, c.key)}
                        disabled={selected.status !== 'OPEN'}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                          selected.status === 'OPEN' ? 'hover:bg-surface-2' : 'cursor-not-allowed opacity-70',
                        )}
                      >
                        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', c.done ? 'border-success bg-success text-white' : 'border-border-strong')}>
                          {c.done && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-xs', c.done ? 'text-fg-muted line-through' : 'text-fg')}>{c.label}</span>
                          {c.done && c.doneBy && <span className="block text-3xs text-fg-subtle">signed by {c.doneBy}{c.doneAt ? ` · ${formatDateTime(c.doneAt)}` : ''}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="The period's numbers" description="As they will be frozen" />
              <CardBody className="space-y-1.5 text-xs">
                <Line label="Revenue" value={figures.pl.totalIncome} />
                <Line label="Cost of goods sold" value={money(figures.pl.totalIncome - figures.pl.grossProfit)} />
                <Line label="Gross profit" value={figures.pl.grossProfit} bold />
                <Line label="EBITDA" value={figures.pl.ebitda} />
                <Line label="Depreciation" value={figures.pl.depreciation} />
                <Line label="Net profit" value={figures.pl.netProfit} bold />
                <div className="!mt-3 space-y-1.5 border-t border-border pt-2">
                  <Line label="Total assets" value={figures.bs.totalAssets} />
                  <Line label="Liabilities and equity" value={money(figures.bs.totalLiabilities + figures.bs.totalEquity)} />
                </div>
                <div className="!mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <ReconcileBadge ok={figures.tb.isBalanced} label={figures.tb.isBalanced ? 'Trial balance agrees' : `TB out ${inr(Math.abs(figures.tb.difference))}`} />
                  <ReconcileBadge ok={figures.bs.isBalanced} label={figures.bs.isBalanced ? 'Balance sheet balances' : `BS out ${inr(Math.abs(figures.bs.difference))}`} />
                </div>
                <p className="!mt-2 text-2xs text-fg-subtle">
                  {figures.journalCount} journals in the period · {inr(figures.postedValue)} posted
                  {figures.unposted.length ? ` · ${figures.unposted.length} still unposted` : ''}
                </p>
              </CardBody>
            </Card>
          </div>

          {figures.unposted.length > 0 && (
            <Section title="Journals blocking the close" className="mb-4">
              <Card>
                <CardBody className="p-0">
                  <table className="grid-table">
                    <thead><tr><th style={{ width: '9rem' }}>Voucher</th><th style={{ width: '8rem' }}>Date</th><th>Narration</th><th style={{ width: '10rem' }}>Status</th><th className="text-right" style={{ width: '12rem' }}>Value</th></tr></thead>
                    <tbody>
                      {figures.unposted.map((j) => (
                        <tr key={j.uid}>
                          <td className="font-mono text-2xs text-fg">{j.voucherNo}</td>
                          <td className="text-2xs tabular text-fg-muted">{formatDate(j.date)}</td>
                          <td><p className="truncate text-xs text-fg-muted">{j.narration}</p></td>
                          <td><FinStatusBadge status={j.status} /></td>
                          <td className="text-right"><Amount value={money(j.lines.reduce((s, l) => s + (l.debit || 0), 0))} className="text-xs" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </Section>
          )}

          {selected.reopenReason && (
            <Alert tone="warning" title="This period has been reopened" className="mb-4">
              {selected.reopenReason}{selected.reopenedBy ? ` — ${selected.reopenedBy}` : ''}
            </Alert>
          )}
        </>
      )}

      <Section title="All periods">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(p) => p.uid}
          onRowClick={(p) => setSelectedUid(p.uid)}
          rowClassName={(p) => (p.uid === selected?.uid ? 'bg-brand-500/5' : undefined)}
          rowActions={(p) => (
            <>
              <MenuItem label="Edit" onClick={() => setSelectedUid(p.uid)} />
              {p.status === 'OPEN'
                ? <MenuItem label="Close period" onClick={() => { setSelectedUid(p.uid); setConfirmClose({ period: p, hard: true }) }} />
                : <MenuItem label="Reopen" onClick={() => { setSelectedUid(p.uid); setReopening(p); setReopenReason('') }} />}
              <MenuItem
                label="Delete"
                danger
                onClick={() => {
                  if (journals.rows.some((j) => !j.deletedAt && j.period === p.period)) { toast.error('Journals exist in this period; it cannot be removed.'); return }
                  periods.remove(p.uid); toast.success(`${p.period} removed`)
                }}
              />
            </>
          )}
          emptyTitle="No periods"
          emptyDescription="Define the fiscal calendar first."
        />
      </Section>

      {/* ── confirm close ────────────────────────────────────── */}
      <Modal
        open={!!confirmClose}
        onClose={() => setConfirmClose(null)}
        title={confirmClose ? `${confirmClose.hard ? 'Close' : 'Soft close'} ${confirmClose.period.period}` : ''}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClose(null)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => confirmClose && close(confirmClose.period, confirmClose.hard)}>
              {confirmClose?.hard ? 'Close the period' : 'Soft close'}
            </Button>
          </>
        }
      >
        {confirmClose && (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">
              {confirmClose.hard
                ? 'No further postings will be accepted in this period and the reported figures become final. Reopening it later is possible but is recorded against the period and shows in the audit trail.'
                : 'New postings will be blocked, but the period can be reopened without a recorded reason. Use this while the close is being reviewed.'}
            </p>
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="flex justify-between py-0.5"><span className="text-fg-muted">Profit for the period</span><Amount value={figures?.pl.netProfit ?? 0} className="font-medium" /></p>
              <p className="flex justify-between py-0.5"><span className="text-fg-muted">Total assets</span><Amount value={figures?.bs.totalAssets ?? 0} /></p>
              <p className="flex justify-between py-0.5"><span className="text-fg-muted">Checklist signed</span><span className="tabular text-fg">{readiness?.checklistDone}/{readiness?.checklistTotal}</span></p>
              <p className="flex justify-between py-0.5"><span className="text-fg-muted">Blockers</span><span className={cn('tabular', readiness?.blockers.length ? 'text-danger' : 'text-success')}>{readiness?.blockers.length ?? 0}</span></p>
            </div>
          </div>
        )}
      </Modal>

      {/* ── reopen ───────────────────────────────────────────── */}
      <Modal
        open={!!reopening}
        onClose={() => setReopening(null)}
        title={reopening ? `Reopen ${reopening.period}` : ''}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setReopening(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={reopen}>Reopen</Button></>}
      >
        <div className="space-y-3">
          <Alert tone="warning" title="Reopening changes reported figures">
            Anything already filed or circulated from this period may no longer match. The reason below is kept against the period and appears in the audit trail.
          </Alert>
          <Textarea
            label="Reason"
            required
            rows={3}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="Supplier invoice for March received late; needs to be accrued in the correct period."
            hint="At least ten characters"
          />
        </div>
      </Modal>
    </div>
  )
}

function Line({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <p className={cn('flex justify-between', bold && 'border-t border-border pt-1.5')}>
      <span className="text-fg-muted">{label}</span>
      <Amount value={value} className={cn(bold && 'font-semibold')} />
    </p>
  )
}
