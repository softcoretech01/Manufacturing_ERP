import { CalendarRange, Factory, Network, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { PlanStatusBadge } from '@/components/planning/PlanShell'
import { WorkflowTracker } from '@/components/planning/WorkflowTracker'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import { demandProgress, demandWorkflow } from '@/lib/demandProgress'
import type { DemandLine, MpsLine, ProductionOrder } from '@/types/planning'

/**
 * Everything about one demand, on one screen.
 *
 * A planner's questions are "what did the customer order", "how much of it have
 * we committed to build", and "where is it now". Answering those used to mean
 * opening the Demand list, then MPS, then MRP, then Production Orders, and
 * holding four numbers in your head.
 *
 * A drawer rather than a page because it is a read: the planner keeps their
 * place in the list, and closing it returns them to the same scroll position
 * and the same filters.
 */

export function DemandViewDrawer({
  demand,
  mps,
  orders,
  mrpPlanned,
  onClose,
  onEdit,
  onSchedule,
  onOpenMrp,
  onOpenOrders,
}: {
  /** Null closes the drawer. The row is passed whole — never an index. */
  demand: DemandLine | null
  mps: MpsLine[]
  orders: ProductionOrder[]
  /** Un-converted MRP proposals pegged to this demand. */
  mrpPlanned?: number
  onClose: () => void
  onEdit: (d: DemandLine) => void
  onSchedule: (d: DemandLine) => void
  onOpenMrp: (d: DemandLine) => void
  onOpenOrders: (d: DemandLine) => void
}) {
  if (!demand) return null

  const progress = demandProgress(demand, mps, orders)
  const steps = demandWorkflow(demand, progress, { mrpPlanned })
  const buckets = mps
    .filter((m) => m.demandDocNo === demand.docNo)
    .sort((a, b) => a.bucket - b.bucket)

  const qty = (n: number) => `${n.toLocaleString('en-IN')} ${demand.uom}`

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-2.5">
          <span className="font-mono text-[15px] font-semibold text-brand-600">{demand.docNo}</span>
          <PlanStatusBadge status={demand.status} size="sm" />
          {demand.isFirm && <Badge tone="brand" size="sm">Firm</Badge>}
        </span>
      }
      description={`${demand.customer} · required by ${formatDate(demand.requiredOn)}`}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<CalendarRange className="h-3.5 w-3.5" />}
            onClick={() => onSchedule(demand)}
          >
            {progress.scheduled > 0 ? 'View schedule' : 'Build schedule'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Network className="h-3.5 w-3.5" />}
            onClick={() => onOpenMrp(demand)}
          >
            Run MRP
          </Button>
          {progress.orders.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              icon={<Factory className="h-3.5 w-3.5" />}
              onClick={() => onOpenOrders(demand)}
            >
              {progress.orders.length} production order(s)
            </Button>
          )}
          <span className="ml-auto" />
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => onEdit(demand)}
          >
            Edit
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* ── Where it has got to ─────────────────────────────────────── */}
        <Section title="Progress">
          <WorkflowTracker steps={steps} />
        </Section>

        {/* ── What was ordered ────────────────────────────────────────── */}
        <Section title="Demand information">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Fact label="Product" value={demand.productName} sub={demand.productCode} />
            <Fact label="Demand quantity" value={qty(demand.qty)} />
            <Fact label="Customer" value={demand.customer} sub={demand.market.toLowerCase()} />
            <Fact label="Required by" value={formatDate(demand.requiredOn)} />
            <Fact label="Source" value={demand.source.replace(/_/g, ' ').toLowerCase()} />
            <Fact label="Commitment" value={demand.isFirm ? 'Firm order' : 'Planned / forecast'} />
          </dl>
          {demand.remarks && (
            <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[13px] text-fg-muted">
              {demand.remarks}
            </p>
          )}
        </Section>

        {/* ── How much is covered ─────────────────────────────────────── */}
        <Section title="Planning summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Outstanding" value={qty(progress.outstanding)} />
            <Tile
              label="Scheduled"
              value={qty(progress.scheduled)}
              tone={progress.scheduled >= progress.outstanding ? 'success' : 'warning'}
            />
            <Tile label="On production order" value={qty(progress.ordered)} />
            <Tile
              label="Produced"
              value={qty(progress.produced)}
              tone={progress.produced > 0 ? 'success' : undefined}
            />
          </div>
          {progress.remaining > 0 && (
            <p className="mt-3 text-[13px] text-warning">
              {qty(progress.remaining)} is not yet on the master schedule.
            </p>
          )}
        </Section>

        {/* ── The schedule itself ─────────────────────────────────────── */}
        {buckets.length > 0 && (
          <Section title={`Weekly schedule (${buckets.length} weeks)`}>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: '4.5rem' }}>Week</th>
                    <th style={{ width: '8.5rem' }}>Starting</th>
                    <th className="col-right" style={{ width: '8rem' }}>Planned</th>
                    <th style={{ width: '7rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((m) => (
                    <tr key={m.uid}>
                      <td className="tabular-nums">W{m.bucket + 1}</td>
                      <td>{formatDate(m.bucketStart)}</td>
                      <td className="col-right tabular-nums">
                        {m.plannedQty.toLocaleString('en-IN')}
                      </td>
                      <td><PlanStatusBadge status={m.status} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ── What is being built ─────────────────────────────────────── */}
        {progress.orders.length > 0 && (
          <Section title={`Production orders (${progress.orders.length})`}>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ width: '11rem' }}>Order</th>
                    <th className="col-right" style={{ width: '7.5rem' }}>Quantity</th>
                    <th className="col-right" style={{ width: '7.5rem' }}>Produced</th>
                    <th style={{ width: '8.5rem' }}>Finish by</th>
                    <th style={{ width: '8rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.orders.map((o) => (
                    <tr key={o.uid}>
                      <td className="font-mono text-[12px] text-brand-600">{o.docNo}</td>
                      <td className="col-right tabular-nums">{o.qty.toLocaleString('en-IN')}</td>
                      <td className="col-right tabular-nums">
                        {o.producedQty.toLocaleString('en-IN')}
                      </td>
                      <td>{o.plannedFinish ? formatDate(o.plannedFinish) : '—'}</td>
                      <td><PlanStatusBadge status={o.status} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </Drawer>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="truncate text-[13px] font-medium text-fg" title={value}>
        {value}
      </dd>
      {sub && <dd className="truncate font-mono text-[11px] text-fg-subtle">{sub}</dd>}
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate text-[15px] font-semibold tabular-nums',
          tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-fg',
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

export default DemandViewDrawer
