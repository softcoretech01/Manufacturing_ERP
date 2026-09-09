import { useMemo, useState } from 'react'
import { CalendarRange, Eye, Pencil } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PlanStatusBadge } from '@/components/planning/PlanShell'
import {
  FilterBar,
  EMPTY_FILTERS,
  applyFilters,
  hasFilters,
  type FilterState,
} from '@/components/planning/PlanningKit'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import type { DemandLine, MpsLine } from '@/types/planning'

/**
 * Every master schedule, one row each.
 *
 * The MPS screen only ever showed the weekly grid for one product, so a planner
 * could not answer "what schedules exist" without picking products one at a
 * time. A schedule is not a row in `pp_mps` — it is the set of weekly buckets
 * built for one demand, so that is what a row here represents.
 */

export interface MpsSummary {
  /** Demand document the schedule was built for. The identity of the schedule. */
  demandDocNo: string
  docNo: string
  productCode: string
  productName: string
  uom: string
  scheduledQty: number
  demandQty: number
  requiredOn: string | null
  customer: string
  firstStart: string
  lastStart: string
  weeks: number
  status: string
  buckets: MpsLine[]
}

/** Group the buckets into one summary per demand. */
export function summariseMps(mps: MpsLine[], demand: DemandLine[]): MpsSummary[] {
  const byDemand = new Map<string, MpsLine[]>()
  for (const m of mps) {
    // Buckets with no demand link belong to an aggregate schedule; they are
    // grouped under the product so they are still reachable, never dropped.
    const key = m.demandDocNo || `product:${m.productCode}`
    const list = byDemand.get(key)
    if (list) list.push(m)
    else byDemand.set(key, [m])
  }

  return [...byDemand.entries()]
    .map(([key, buckets]) => {
      const sorted = [...buckets].sort((a, b) => a.bucket - b.bucket)
      const first = sorted[0]
      const demandDocNo = first.demandDocNo || ''
      const d = demand.find((x) => x.docNo === demandDocNo)
      return {
        demandDocNo,
        // An aggregate schedule has no demand document, so it is named by the
        // product it smooths rather than left blank.
        docNo: demandDocNo ? `MPS · ${demandDocNo}` : `MPS · ${first.productCode} (aggregate)`,
        productCode: first.productCode,
        productName: first.productName,
        uom: first.uom,
        scheduledQty: sorted.reduce((t, m) => t + m.plannedQty, 0),
        demandQty: d?.qty ?? sorted.reduce((t, m) => t + m.demandQty, 0),
        requiredOn: d?.requiredOn ?? null,
        customer: d?.customer ?? '—',
        firstStart: first.bucketStart,
        lastStart: sorted[sorted.length - 1].bucketStart,
        weeks: sorted.length,
        // The least-advanced bucket sets the schedule's status: one draft week
        // means the schedule as a whole is not yet released.
        status: sorted.some((m) => m.status === 'DRAFT')
          ? 'DRAFT'
          : sorted.every((m) => m.status === 'RELEASED')
            ? 'RELEASED'
            : 'APPROVED',
        buckets: sorted,
        _key: key,
      } as MpsSummary & { _key: string }
    })
    .sort((a, b) => (a.requiredOn ?? '9999').localeCompare(b.requiredOn ?? '9999'))
}

export function MpsList({
  mps,
  demand,
  onOpen,
  onNew,
  onExportDone,
}: {
  mps: MpsLine[]
  demand: DemandLine[]
  onOpen: (row: MpsSummary) => void
  onNew: () => void
  onExportDone: (n: number) => void
}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const rows = useMemo(() => summariseMps(mps, demand), [mps, demand])

  const filtered = applyFilters(rows, filters, (r) => ({
    text: [r.demandDocNo, r.productCode, r.productName, r.customer],
    date: r.requiredOn,
    status: r.status,
  }))

  const columns: Column<MpsSummary>[] = [
    {
      key: 'sno', header: 'S.No', width: '4.5rem', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-muted">{i + 1}</span>,
    },
    {
      key: 'demandDocNo', header: 'Demand No', width: '14rem', sortable: true,
      render: (r) =>
        r.demandDocNo ? (
          <span className="block truncate font-mono text-[12px] font-medium text-brand-600" title={r.demandDocNo}>
            {r.demandDocNo}
          </span>
        ) : (
          <span className="text-[12px] text-fg-subtle" title="Aggregate schedule — smooths all demand for the product">
            Aggregate
          </span>
        ),
    },
    {
      key: 'productCode', header: 'Product', width: '16rem', sortable: true,
      render: (r) => (
        <>
          <p className="truncate text-xs font-medium text-fg" title={r.productName}>{r.productName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{r.productCode}</p>
        </>
      ),
    },
    { key: 'customer', header: 'Customer', width: '13rem', sortable: true },
    {
      key: 'scheduledQty', header: 'Scheduled Qty', align: 'right', width: '9rem', sortable: true,
      accessor: (r) => r.scheduledQty,
      render: (r) => (
        <span className="tabular-nums font-medium text-fg">
          {r.scheduledQty.toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'demandQty', header: 'Demand Qty', align: 'right', width: '9rem', sortable: true,
      accessor: (r) => r.demandQty,
      render: (r) => <span className="tabular-nums text-fg-muted">{r.demandQty.toLocaleString('en-IN')}</span>,
    },
    {
      key: 'cover', header: 'Cover', width: '8rem', align: 'center', sortable: true,
      accessor: (r) => (r.demandQty > 0 ? r.scheduledQty / r.demandQty : 0),
      // Never colour alone: the words carry the state as well (CLAUDE.md §7).
      render: (r) => {
        if (r.demandQty <= 0) return <span className="text-[12px] text-fg-subtle">—</span>
        const pct = Math.round((r.scheduledQty / r.demandQty) * 100)
        const tone = pct >= 100 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger'
        return (
          <span className={`text-[12px] font-medium tabular-nums ${tone}`}>
            {pct}% {pct >= 100 ? 'covered' : 'short'}
          </span>
        )
      },
    },
    {
      key: 'requiredOn', header: 'Required Date', width: '8.5rem', sortable: true,
      accessor: (r) => r.requiredOn ?? '',
      render: (r) => (r.requiredOn ? formatDate(r.requiredOn) : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'period', header: 'Schedule Period', width: '14rem',
      accessor: (r) => r.firstStart,
      render: (r) => (
        <span className="whitespace-nowrap text-[12px] text-fg-muted">
          {formatDate(r.firstStart)} – {formatDate(r.lastStart)}
          <span className="ml-1 text-fg-subtle">({r.weeks} wk)</span>
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', width: '7.5rem', sortable: true,
      render: (r) => <PlanStatusBadge status={r.status} size="sm" />,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        value={filters}
        onChange={setFilters}
        searchPlaceholder="Demand number, product or customer…"
        dateLabel="Required"
        statuses={[
          { value: 'DRAFT', label: 'Draft' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'RELEASED', label: 'Released' },
        ]}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.demandDocNo || `product:${r.productCode}`}
        searchable={false}
        density="comfortable"
        onRowClick={onOpen}
        onExport={(f: ExportFormat) =>
          onExportDone(
            exportRows(f, 'master-schedules', 'Master schedules', columnsFromTable(columns), filtered),
          )
        }
        emptyTitle={hasFilters(filters) ? 'No schedules match these filters' : 'No master schedules yet'}
        emptyDescription={
          hasFilters(filters)
            ? 'Nothing matches the current search and date range. Clear the filters to see every schedule.'
            : 'Build one from an open demand — it spreads the ordered quantity across the weeks before it is due.'
        }
        emptyAction={
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-700"
          >
            <CalendarRange className="h-3.5 w-3.5" aria-hidden />
            New master schedule
          </button>
        }
        rowActions={(r) => (
          <>
            <MenuItem label="View schedule" icon={<Eye />} onClick={() => onOpen(r)} />
            <MenuItem label="Edit weeks" icon={<Pencil />} onClick={() => onOpen(r)} />
          </>
        )}
      />
    </div>
  )
}

export default MpsList
