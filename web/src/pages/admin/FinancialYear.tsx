import { useState } from 'react'
import { AlertTriangle, CalendarRange, Check, Lock, LockOpen, Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { accountingPeriods, financialYears } from '@/mock/data'
import { useActiveContext } from '@/store/auth'

const MODULES = ['INVENTORY', 'PURCHASE', 'SALES', 'PRODUCTION', 'PAYROLL', 'FINANCE'] as const

const BLOCKERS: Record<string, { label: string; count: number; ok: boolean }[]> = {
  FINANCE: [
    { label: 'All GRNs approved', count: 0, ok: true },
    { label: 'GRNs without a supplier invoice', count: 14, ok: false },
    { label: 'All sales invoices posted', count: 0, ok: true },
    { label: 'Production confirmations unposted', count: 3, ok: false },
    { label: 'Stock ledger reconciled to balances', count: 0, ok: true },
    { label: 'Open physical counts', count: 0, ok: true },
    { label: 'Unreconciled bank entries', count: 22, ok: false },
    { label: 'Foreign currency revaluation posted', count: 0, ok: true },
  ],
  PRODUCTION: [
    { label: 'Open production orders in the period', count: 4, ok: false },
    { label: 'Unconfirmed operations', count: 11, ok: false },
    { label: 'WIP reconciled', count: 0, ok: true },
    { label: 'Scrap and rework booked', count: 0, ok: true },
  ],
  INVENTORY: [
    { label: 'Pending GRN inspections', count: 0, ok: true },
    { label: 'Unposted material issues', count: 0, ok: true },
    { label: 'Stock ledger reconciled', count: 0, ok: true },
  ],
}

export function FinancialYearPage() {
  const toast = useToast()
  const { company } = useActiveContext()
  const [tab, setTab] = useState('periods')
  const [closeTarget, setCloseTarget] = useState<{ period: string; module: string } | null>(null)
  const [reopenTarget, setReopenTarget] = useState<{ period: string; module: string } | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const fys = financialYears.filter((f) => f.companyUid === company.uid)
  const current = fys.find((f) => f.isCurrent)!

  const blockers = closeTarget ? (BLOCKERS[closeTarget.module] ?? []) : []
  const unresolved = blockers.filter((b) => !b.ok)

  return (
    <div>
      <PageHeader
        title="Financial year & period control"
        description="Periods close per module, in a configurable dependency order — inventory before finance, always. Multiple years may be open simultaneously."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Financial year' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>New financial year</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[{ id: 'periods', label: 'Period control' }, { id: 'years', label: 'Financial years', count: fys.length }]} />}
      />

      <Alert tone="info" className="mb-4" title="Why multiple years stay open">
        Indian practice closes audit months after year end, so a new year must be able to begin before
        the previous one is closed. Back-dated postings into an open prior period require the
        POST_BACKDATED permission and appear in the Back-dated Postings exception report.
      </Alert>

      {tab === 'periods' && (
        <Card>
          <CardHeader title={`Period status — ${current.code}`} description="Click a cell to close or reopen that module for that period." />
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[160px] bg-surface-2">Period</th>
                  <th className="w-28">Dates</th>
                  {MODULES.map((m) => (
                    <th key={m} className="w-32 text-center text-[10px]">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accountingPeriods.map((p) => (
                  <tr key={p.uid}>
                    <td className="sticky left-0 z-10 bg-surface text-xs font-medium text-fg">{p.name}</td>
                    <td className="text-2xs text-fg-subtle">
                      {formatDate(p.startDate).slice(0, 6)} – {formatDate(p.endDate).slice(0, 6)}
                    </td>
                    {MODULES.map((m) => {
                      const st = p.moduleStatus[m]
                      return (
                        <td key={m} className="text-center">
                          <button
                            onClick={() =>
                              st === 'CLOSED'
                                ? setReopenTarget({ period: p.name, module: m })
                                : setCloseTarget({ period: p.name, module: m })
                            }
                            className={cn(
                              'inline-flex w-full items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors',
                              st === 'CLOSED' && 'bg-neutral/10 text-neutral hover:bg-neutral/20',
                              st === 'CLOSING' && 'bg-warning/10 text-warning hover:bg-warning/20',
                              st === 'OPEN' && 'bg-success/10 text-success hover:bg-success/20',
                            )}
                          >
                            {st === 'CLOSED' ? <Lock className="h-2.5 w-2.5" /> : st === 'CLOSING' ? <AlertTriangle className="h-2.5 w-2.5" /> : <LockOpen className="h-2.5 w-2.5" />}
                            {st === 'CLOSED' ? 'Closed' : st === 'CLOSING' ? 'Closing' : 'Open'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'years' && (
        <Card>
          <table className="grid-table">
            <thead>
              <tr><th className="w-32">Code</th><th className="w-36">Start</th><th className="w-36">End</th><th className="w-32">Status</th><th className="w-28">Current</th><th>Periods</th><th className="w-32" /></tr>
            </thead>
            <tbody>
              {fys.map((f) => (
                <tr key={f.uid}>
                  <td className="font-mono text-xs font-medium">{f.code}</td>
                  <td className="text-xs">{formatDate(f.startDate)}</td>
                  <td className="text-xs">{formatDate(f.endDate)}</td>
                  <td><StatusBadge status={f.status} size="sm" /></td>
                  <td>{f.isCurrent && <Badge tone="brand" size="sm">Current</Badge>}</td>
                  <td className="text-xs text-fg-muted">12 monthly periods</td>
                  <td className="text-right">
                    {f.status === 'OPEN' && <Button size="xs" variant="outline" onClick={() => toast.success(`${f.code} closed`, 'Stock and opening balances carried forward; financial-year document series reset.')}>Close year</Button>}
                    {f.status === 'CLOSED' && <Button size="xs" variant="ghost" onClick={() => toast.warning(`${f.code} reopened`, 'CFO and auditor roles have been notified.')}>Reopen</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border p-4">
            <Alert tone="warning" title="Financial year rules">
              Years must not overlap and must be contiguous. The FY start month is immutable after the
              first year is created. Closing a year carries forward stock, opening balances and resets
              financial-year document series.
            </Alert>
          </div>
        </Card>
      )}

      {/* ── Close dialog with the pre-close checklist ──────────────────── */}
      <Modal
        open={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        title={`Close ${closeTarget?.module} — ${closeTarget?.period}`}
        description="Closing is blocked until each blocker is resolved or explicitly waived with a reason."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={unresolved.length > 0}
              onClick={() => { toast.success(`${closeTarget?.module} closed for ${closeTarget?.period}`); setCloseTarget(null) }}
            >
              Close period
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {blockers.length === 0 ? (
            <Alert tone="info">No pre-close checklist configured for this module in the prototype.</Alert>
          ) : (
            <>
              <div className="rounded border border-border">
                {blockers.map((b, i) => (
                  <div key={i} className={cn('flex items-center gap-3 px-3 py-2', i > 0 && 'border-t border-border')}>
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white', b.ok ? 'bg-success' : 'bg-danger')}>
                      {b.ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                    </span>
                    <span className="flex-1 text-xs text-fg">{b.label}</span>
                    <span className={cn('text-xs tabular', b.ok ? 'text-fg-subtle' : 'font-medium text-danger')}>
                      {b.ok ? 'clear' : `${b.count} items`}
                    </span>
                    {!b.ok && (
                      <>
                        <Button size="xs" variant="ghost" onClick={() => toast.info('View blocker items', `${b.count} ${b.label.toLowerCase()}.`)}>View</Button>
                        <Button size="xs" variant="outline" onClick={() => toast.success('Blocker waived', 'A waiver reason is recorded to the audit log and the period-close report.')}>Waive</Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {unresolved.length > 0 && (
                <Alert tone="danger" title={`${unresolved.length} blockers must be resolved or waived`}>
                  Every waiver captures a reason, is written to the audit log, and appears in the
                  period-close report.
                </Alert>
              )}
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!reopenTarget}
        onClose={() => setReopenTarget(null)}
        onConfirm={() => { toast.warning('Period reopened', 'CFO and auditor roles have been notified.'); setReopenTarget(null) }}
        title={`Reopen ${reopenTarget?.module} for ${reopenTarget?.period}?`}
        confirmLabel="Reopen period"
        message={
          <>
            Reopening a closed period is audited with your reason, notifies the CFO and auditor roles,
            and must be re-closed before any statutory return for that period is filed.
          </>
        }
      >
        <Select label="Reason code" required className="mb-3"
          options={[{ value: '', label: 'Select a reason…' }, { value: 'AUDIT_ADJUSTMENT', label: 'Audit adjustment' }, { value: 'MISSED_ENTRY', label: 'Missed entry' }, { value: 'CORRECTION', label: 'Error correction' }, { value: 'STATUTORY', label: 'Statutory requirement' }]} />
        <Textarea label="Justification" required placeholder="Explain why this period must be reopened…" />
      </ConfirmDialog>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New financial year"
        footer={<><Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { toast.success('Financial year created', '12 accounting periods were created automatically.'); setNewOpen(false) }}>Create</Button></>}>
        <div className="space-y-3.5">
          <Input label="Code" required defaultValue="FY28-29" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start date" type="date" required defaultValue="2028-04-01" />
            <Input label="End date" type="date" required defaultValue="2029-03-31" />
          </div>
          <Select label="Period type" defaultValue="MONTHLY"
            options={[{ value: 'MONTHLY', label: 'Monthly (12 periods)' }, { value: '445', label: '4-4-5 (12 periods)' }, { value: 'CUSTOM', label: 'Custom' }]} />
          <Select label="Initial status" defaultValue="FUTURE"
            options={[{ value: 'FUTURE', label: 'Future — not yet postable' }, { value: 'OPEN', label: 'Open — postable immediately' }]} />
          <Alert tone="info">
            Financial years must not overlap and must be contiguous. Document series with a
            financial-yearly reset will roll over automatically on the start date.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
