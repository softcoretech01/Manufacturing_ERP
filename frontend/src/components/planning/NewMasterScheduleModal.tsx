import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarRange, Check, Search, Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { cn } from '@/lib/cn'
import { formatDate, formatQty } from '@/lib/format'
import { bucketIndex } from '@/lib/planFlow'
import type { DemandLine, MpsLine } from '@/types/planning'

/**
 * Build a master schedule for one demand document.
 *
 * Make-to-order: the planner picks the order, sees what it needs and by when,
 * and spreads that quantity across the weeks leading up to it. Every bucket
 * written carries `demandDocNo`, which is what lets the rest of the portal
 * answer "show me the schedule for this order" — and what lets MRP plan one
 * order without dragging in a schedule built for somebody else's.
 *
 * Two rules the form enforces, because getting either wrong is expensive:
 *
 * - Nothing may be scheduled *after* the required date. A schedule that
 *   finishes the week after the customer needs it is not a schedule, it is a
 *   late delivery agreed in advance.
 * - The distributed total is checked against the demand and the difference is
 *   shown at all times. Under-scheduling is allowed — a planner may deliberately
 *   cover part of an order — but never silently.
 */

interface Props {
  open: boolean
  onClose: () => void
  /** Open demand to choose from. Already-satisfied lines are filtered out here. */
  demand: DemandLine[]
  /** Week-start dates of the planning horizon. */
  starts: string[]
  /** Buckets already scheduled, so a second visit shows what exists. */
  existing: MpsLine[]
  onCreate: (line: Omit<MpsLine, 'uid' | 'createdAt' | 'version'>) => Promise<unknown>
  /** Called after a successful save — the caller navigates to the schedule. */
  onSaved: (demandDocNo: string) => void
  /** Pre-select this demand and skip the picker. */
  presetDemandDocNo?: string
}

export function NewMasterScheduleModal({
  open,
  onClose,
  demand,
  starts,
  existing,
  onCreate,
  onSaved,
  presetDemandDocNo,
}: Props) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string | null>(presetDemandDocNo ?? null)
  const [qty, setQty] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  const openDemand = useMemo(
    () =>
      demand
        .filter((d) => d.status === 'OPEN' && d.qty - (d.qtyPlanned ?? 0) > 0)
        .sort((a, b) => a.requiredOn.localeCompare(b.requiredOn)),
    [demand],
  )

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return openDemand
    return openDemand.filter((d) =>
      [d.docNo, d.productCode, d.productName, d.customer].some((v) =>
        (v ?? '').toLowerCase().includes(q),
      ),
    )
  }, [openDemand, search])

  const selected = openDemand.find((d) => d.docNo === picked) ?? null
  const outstanding = selected ? selected.qty - (selected.qtyPlanned ?? 0) : 0

  /**
   * The last week the product can be built and still arrive on time. Buckets
   * after it are disabled rather than hidden, so the planner can see why the
   * runway is as short as it is.
   */
  const dueBucket = selected ? bucketIndex(selected.requiredOn, starts) : -1
  const lastUsable = dueBucket >= 0 ? dueBucket : starts.length - 1

  const alreadyScheduled = useMemo(() => {
    if (!selected) return 0
    return existing
      .filter((m) => m.demandDocNo === selected.docNo)
      .reduce((t, m) => t + m.plannedQty, 0)
  }, [existing, selected])

  const entered = useMemo(
    () => Object.values(qty).reduce((t, v) => t + (Number(v) || 0), 0),
    [qty],
  )
  const remaining = outstanding - alreadyScheduled - entered

  const reset = () => {
    setPicked(presetDemandDocNo ?? null)
    setQty({})
    setSearch('')
  }

  const close = () => {
    reset()
    onClose()
  }

  /** Spread the outstanding quantity evenly over the weeks still available. */
  const levelLoad = () => {
    if (!selected) return
    const target = outstanding - alreadyScheduled
    if (target <= 0) return
    const weeks = lastUsable + 1
    // Whole units only, with the rounding remainder added to the last week so
    // the buckets always sum to exactly the demand.
    const per = Math.floor(target / weeks)
    const next: Record<number, string> = {}
    for (let b = 0; b <= lastUsable; b++) next[b] = String(per)
    next[lastUsable] = String(per + (target - per * weeks))
    setQty(next)
  }

  const save = async () => {
    if (!selected) return
    const buckets = Object.entries(qty)
      .map(([b, v]) => ({ bucket: Number(b), qty: Number(v) || 0 }))
      .filter((x) => x.qty > 0)

    if (!buckets.length) {
      toast.error('Nothing to schedule', 'Enter a quantity in at least one week.')
      return
    }
    const late = buckets.filter((x) => x.bucket > lastUsable)
    if (late.length) {
      toast.error(
        'Scheduled after the required date',
        `${late.length} week(s) fall after ${formatDate(selected.requiredOn)}.`,
      )
      return
    }

    setSaving(true)
    try {
      for (const b of buckets) {
        await onCreate({
          docNo: `MPS/${selected.docNo}/${String(b.bucket + 1).padStart(2, '0')}`,
          productCode: selected.productCode,
          productName: selected.productName,
          uom: selected.uom,
          bucket: b.bucket,
          bucketStart: starts[b.bucket],
          demandQty: b.qty,
          plannedQty: b.qty,
          isFirm: selected.isFirm,
          status: 'DRAFT',
          remarks: `Scheduled for ${selected.docNo} (${selected.customer}).`,
          demandDocNo: selected.docNo,
        } as Omit<MpsLine, 'uid' | 'createdAt' | 'version'>)
      }
      toast.success(
        'Schedule saved',
        `${buckets.length} week(s) totalling ${formatQty(entered)} ${selected.uom} for ${selected.docNo}.`,
      )
      const doc = selected.docNo
      reset()
      onSaved(doc)
    } catch (e) {
      // Show what the server actually said. A generic "request failed" here
      // sent us hunting through the network tab for "Item FG-SS-750-BLK does
      // not exist", which the planner needed to see in the first place.
      toast.error(
        'Could not save the schedule',
        e instanceof ProblemError
          ? e.problem.detail || e.problem.title
          : e instanceof Error
            ? e.message
            : 'The server rejected the request.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="New master schedule"
      description={
        selected
          ? `Spread ${selected.docNo} across the weeks before it is due.`
          : 'Choose the demand this schedule will cover.'
      }
      footer={
        <div className="flex w-full items-center gap-2">
          {selected && !presetDemandDocNo && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => {
                setPicked(null)
                setQty({})
              }}
            >
              Choose another
            </Button>
          )}
          <span className="ml-auto" />
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Check className="h-4 w-4" />}
            disabled={!selected || entered <= 0 || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save schedule'}
          </Button>
        </div>
      }
    >
      {!selected ? (
        <div className="flex flex-col gap-3">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="Search document, product or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {matches.length === 0 ? (
            <Alert tone="info" title="No open demand">
              Every demand line is either closed or already fully planned. Add demand
              first, then come back to schedule it.
            </Alert>
          ) : (
            <ul className="flex max-h-[46vh] flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {matches.map((d) => {
                const left = d.qty - (d.qtyPlanned ?? 0)
                return (
                  <li key={d.uid}>
                    <button
                      type="button"
                      onClick={() => setPicked(d.docNo)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-fg">
                          {d.productName}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-fg-subtle">
                          {d.docNo} · {d.productCode} · {d.customer}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[13px] font-semibold tabular-nums text-fg">
                          {formatQty(left)} {d.uom}
                        </span>
                        <span className="block text-[11px] text-fg-muted">
                          by {formatDate(d.requiredOn)}
                        </span>
                      </span>
                      {d.isFirm && (
                        <Badge tone="brand" size="sm">
                          Firm
                        </Badge>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* ── What was selected ───────────────────────────────────────── */}
          <div className="grid gap-3 rounded-xl border border-border bg-surface-2 p-3 sm:grid-cols-4">
            <Fact label="Demand" value={selected.docNo} mono />
            <Fact label="Product" value={`${selected.productName} (${selected.productCode})`} />
            <Fact
              label="Outstanding"
              value={`${formatQty(outstanding)} ${selected.uom}`}
            />
            <Fact label="Required by" value={formatDate(selected.requiredOn)} />
          </div>

          {dueBucket < 0 && (
            <Alert tone="warning" title="Required date is outside the horizon">
              {formatDate(selected.requiredOn)} falls before the current week or beyond
              the last one shown, so every week below is offered. Check the date before
              scheduling.
            </Alert>
          )}

          {alreadyScheduled > 0 && (
            <Alert tone="info" title="Already partly scheduled">
              {formatQty(alreadyScheduled)} {selected.uom} is on an existing schedule for
              this demand. The weeks below add to it.
            </Alert>
          )}

          {/* ── Weekly distribution ─────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-fg">Planned production by week</h3>
            <Button
              variant="ghost"
              size="sm"
              icon={<Wand2 className="h-3.5 w-3.5" />}
              onClick={levelLoad}
              className="ml-auto"
            >
              Level the load
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="grid-table">
              <thead>
                <tr>
                  {starts.map((s, b) => (
                    <th key={s} className="col-center" style={{ minWidth: '6.5rem' }}>
                      W{b + 1}
                      <span className="block font-mono text-[10px] font-normal text-fg-subtle">
                        {formatDate(s)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {starts.map((s, b) => {
                    const tooLate = b > lastUsable
                    return (
                      <td key={s} className="col-flex col-center">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          disabled={tooLate}
                          value={qty[b] ?? ''}
                          onChange={(e) => setQty((q) => ({ ...q, [b]: e.target.value }))}
                          title={
                            tooLate
                              ? `After ${formatDate(selected.requiredOn)} — too late for this demand`
                              : `Week of ${formatDate(s)}`
                          }
                          className={cn(
                            'h-9 w-full rounded-md border bg-surface px-2 text-center text-[13px] tabular-nums',
                            'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
                            tooLate
                              ? 'cursor-not-allowed border-dashed border-border bg-surface-3 text-fg-subtle'
                              : 'border-border text-fg',
                          )}
                        />
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── The running total, always visible ───────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3 text-[13px]">
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-fg-muted">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden />
              Scheduled now{' '}
              <b className="tabular-nums text-fg">
                {formatQty(entered)} {selected.uom}
              </b>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-fg-muted">
              Outstanding demand{' '}
              <b className="tabular-nums text-fg">{formatQty(outstanding - alreadyScheduled)}</b>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-fg-muted">
              {remaining === 0 ? 'Fully covered' : remaining > 0 ? 'Still to schedule' : 'Over-scheduled by'}{' '}
              <b
                className={cn(
                  'tabular-nums',
                  remaining === 0 ? 'text-success' : remaining > 0 ? 'text-warning' : 'text-danger',
                )}
              >
                {formatQty(Math.abs(remaining))}
              </b>
            </span>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p
        className={cn('truncate text-[13px] font-medium text-fg', mono && 'font-mono')}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

export default NewMasterScheduleModal
