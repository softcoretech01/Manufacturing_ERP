import { useMemo, useState } from 'react'
import {
  Play, AlertTriangle, AlertCircle, Info, PackageX, ShoppingCart, Factory, Clock,
  Search, Target,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { usePlanningData } from './usePlanningData'
import { MrpBuyMakeGrid, buildBuyMake } from '@/components/planning/MrpBuyMake'
import { Tabs } from '@/components/ui/Tabs'
import { InfoStrip } from '@/components/ui/InfoStrip'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import {
  useLatestMrpRun,
  useRunMrp,
  useConvertToPurchaseRequisition,
  useConvertToProductionOrder,
} from '@/hooks/useMrp'
import type { MrpException, MrpPlannedOrder, MrpItemPlan, MrpShortage } from '@/api/mrp'

/**
 * Material Requirements Planning.
 *
 * Reads a **stored run** from the server rather than recomputing in the browser.
 * That is the whole point of the change: a plan now survives a refresh, two
 * planners see the same numbers, and every run is a document that can be
 * compared with the one before it.
 */

const qty = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

const SEVERITY_ICON = {
  ERROR: AlertCircle,
  WARNING: AlertTriangle,
  INFO: Info,
} as const

const SEVERITY_TONE = { ERROR: 'danger', WARNING: 'warning', INFO: 'neutral' } as const

export function MrpPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const [tab, setTab] = useState('buy')
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'ERROR' | 'WARNING' | 'INFO'>('ALL')

  const { data: run, isLoading, error } = useLatestMrpRun()
  const runMrp = useRunMrp()
  const toPr = useConvertToPurchaseRequisition()
  const toPo = useConvertToProductionOrder()
  const [selected, setSelected] = useState<string[]>([])
  // Selection is per grid: a buyer ticking three materials must not find three
  // production orders selected on the next tab.
  const [buySel, setBuySel] = useState<string[]>([])
  const [makeSel, setMakeSel] = useState<string[]>([])
  // Run-for-one-demand picker (make-to-order).
  const [runForOpen, setRunForOpen] = useState(false)
  const [runForSearch, setRunForSearch] = useState('')
  const { demand } = usePlanningData()

  /** Open demand, newest requirement first — what a scoped run can be built on. */
  const runnableDemand = useMemo(() => {
    const q = runForSearch.trim().toLowerCase()
    return demand.rows
      .filter((d) => d.status === 'OPEN' && d.qty - (d.qtyPlanned ?? 0) > 0)
      .filter((d) =>
        !q ||
        [d.docNo, d.productCode, d.productName, d.customer].some((v) =>
          (v ?? '').toLowerCase().includes(q),
        ),
      )
      .sort((a, b) => a.requiredOn.localeCompare(b.requiredOn))
  }, [demand.rows, runForSearch])

  const exceptions = useMemo(
    () => (run?.exceptions ?? []).filter((e) => severityFilter === 'ALL' || e.severity === severityFilter),
    [run, severityFilter],
  )

  async function doRun(demandDocNo?: string) {
    try {
      const r = await runMrp.mutateAsync(demandDocNo ? { demand_doc_no: demandDocNo } : {})
      toast.success(
        'MRP complete',
        `${r.run_no} — ${r.stats.items_planned} items, ${r.stats.purchase_orders} to buy, ` +
          `${r.stats.production_orders} to make` +
          (demandDocNo ? ` for ${demandDocNo}.` : '.'),
      )
      setRunForOpen(false)
    } catch (e) {
      if (e instanceof ProblemError) toast.error(e.problem.title || 'MRP failed', e.problem.detail)
      else toast.error('MRP failed', e instanceof Error ? e.message : 'Unexpected error.')
    }
  }

  /*
   * One row per item, joining the proposals to the time-phased plan that
   * explains them. Recomputed only when the run changes — a buyer switching
   * tabs should not trigger a rebuild of both grids.
   */
  const buyRows = useMemo(
    () => (run ? buildBuyMake(run.plans, run.planned_orders, 'PURCHASE') : []),
    [run],
  )
  const makeRows = useMemo(
    () => (run ? buildBuyMake(run.plans, run.planned_orders, 'PRODUCTION') : []),
    [run],
  )

  const selectedOrders = useMemo(
    () => (run?.planned_orders ?? []).filter((o) => selected.includes(o.uid)),
    [run, selected],
  )
  // A row is an item, and an item can hold several proposals; converting the
  // row converts every open proposal under it, which is what a buyer means by
  // "raise this one".
  const selectedBuys = useMemo(
    () =>
      buyRows
        .filter((r) => buySel.includes(r.key))
        .flatMap((r) => r.orders.filter((o) => !o.converted_to_doc_no)),
    [buyRows, buySel],
  )
  const selectedMakes = useMemo(
    () =>
      makeRows
        .filter((r) => makeSel.includes(r.key))
        .flatMap((r) => r.orders.filter((o) => !o.converted_to_doc_no)),
    [makeRows, makeSel],
  )

  function reportError(fallback: string, e: unknown) {
    if (e instanceof ProblemError) toast.error(e.problem.title || fallback, e.problem.detail)
    else toast.error(fallback, e instanceof Error ? e.message : 'Unexpected error.')
  }

  /** One requisition covering every selected buy — a buyer works a document,
   *  not a row at a time. */
  async function convertBuys() {
    try {
      const r = await toPr.mutateAsync({ planned_order_uids: selectedBuys.map((o) => o.uid) })
      toast.success(
        'Requisition raised',
        `${r.document_no} — ${r.lines} line(s) sent to Procurement as a draft.`,
      )
      setBuySel([])
    } catch (e) {
      reportError('Could not raise the requisition', e)
    }
  }

  /** Production orders are raised one at a time: each carries its own BOM and
   *  routing snapshot, and a failure on one must not roll back the others. */
  async function convertMakes() {
    let made = 0
    for (const o of selectedMakes) {
      try {
        const r = await toPo.mutateAsync({ planned_order_uid: o.uid })
        made += 1
        toast.success(
          'Production order raised',
          `${r.document_no} — ${r.components} components, ${r.operations} operations from ${r.bom}.`,
        )
      } catch (e) {
        reportError(`Could not raise an order for ${o.item_code}`, e)
      }
    }
    if (made) setMakeSel([])
  }


  const shortageColumns: Column<MrpShortage>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'item', header: 'Item', width: '280px',
      accessor: (s) => `${s.item_name} ${s.item_code}`,
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-fg" title={String(s.item_name ?? "")}>{s.item_name}</p>
          <p className="truncate font-mono text-[12px] text-fg-subtle" title={String(s.item_code ?? "")}>{s.item_code}</p>
        </div>
      ),
    },
    {
      key: 'short_qty', header: 'Short By', width: '150px', align: 'right', sortable: true,
      accessor: (s) => s.short_qty,
      render: (s) => (
        <span className="text-[14px] font-semibold tabular-nums text-danger">
          {qty(s.short_qty)} <span className="text-2xs font-normal text-fg-muted">{s.uom}</span>
        </span>
      ),
    },
    {
      key: 'required_on', header: 'Required On', width: '150px', sortable: true,
      accessor: (s) => s.required_on,
      render: (s) => <span className="text-[13px] tabular-nums">{formatDate(s.required_on)}</span>,
    },
    {
      key: 'lead_time_days', header: 'Lead Time', width: '130px', align: 'right',
      render: (s) => <span className="text-[13px] tabular-nums text-fg-muted">{s.lead_time_days} d</span>,
    },
    {
      key: 'days_late', header: 'Days Late', width: '130px', align: 'right', sortable: true,
      accessor: (s) => s.days_late,
      render: (s) => <span className="text-[14px] font-semibold tabular-nums text-danger">{s.days_late}</span>,
    },
    {
      key: 'value', header: 'Value at Risk', width: '150px', align: 'right', sortable: true,
      accessor: (s) => s.value,
      render: (s) => <span className="text-[14px] tabular-nums text-fg">{money(s.value)}</span>,
    },
  ]

  const planColumns: Column<MrpItemPlan>[] = [
    {
      key: 'item', header: 'Item', width: '260px', sticky: true,
      accessor: (p) => `${p.item_name} ${p.item_code}`,
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-fg" title={String(p.item_name ?? "")}>{p.item_name}</p>
          <p className="truncate font-mono text-[12px] text-fg-subtle">
            {p.item_code} · level {p.llc} · {p.is_manufactured ? 'make' : 'buy'}
          </p>
        </div>
      ),
    },
    {
      key: 'opening_stock', header: 'On Hand', width: '120px', align: 'right',
      accessor: (p) => p.opening_stock,
      render: (p) => <span className="text-[13px] tabular-nums text-fg">{qty(p.opening_stock)}</span>,
    },
    {
      key: 'safety_stock', header: 'Safety', width: '110px', align: 'right',
      render: (p) => <span className="text-[13px] tabular-nums text-fg-muted">{qty(p.safety_stock)}</span>,
    },
    {
      key: 'total_gross', header: 'Gross Req', width: '130px', align: 'right', sortable: true,
      accessor: (p) => p.total_gross,
      render: (p) => <span className="text-[14px] tabular-nums text-fg">{qty(p.total_gross)}</span>,
    },
    {
      key: 'total_planned', header: 'Planned', width: '130px', align: 'right', sortable: true,
      accessor: (p) => p.total_planned,
      render: (p) => (
        <span className="text-[14px] font-semibold tabular-nums text-brand-600">{qty(p.total_planned)}</span>
      ),
    },
    {
      key: 'lead_time_days', header: 'Lead Time', width: '120px', align: 'right',
      render: (p) => <span className="text-[13px] tabular-nums text-fg-muted">{p.lead_time_days} d</span>,
    },
    {
      key: 'first_late_bucket', header: 'First Late Week', width: '150px', align: 'center',
      accessor: (p) => p.first_late_bucket ?? 999,
      render: (p) => p.first_late_bucket == null
        ? <span className="text-fg-subtle">—</span>
        : <Badge tone="danger" size="sm">Week {p.first_late_bucket + 1}</Badge>,
    },
  ]

  const exceptionColumns: Column<MrpException>[] = [
    {
      key: 'severity', header: 'Severity', width: '130px', sortable: true,
      accessor: (e) => e.severity,
      render: (e) => {
        const Icon = SEVERITY_ICON[e.severity] ?? Info
        return (
          <span className="inline-flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 ${e.severity === 'ERROR' ? 'text-danger' : e.severity === 'WARNING' ? 'text-warning' : 'text-fg-muted'}`} aria-hidden />
            <Badge tone={SEVERITY_TONE[e.severity] ?? 'neutral'} size="sm" dot={false}>{e.severity}</Badge>
          </span>
        )
      },
    },
    {
      key: 'type', header: 'Type', width: '190px', sortable: true,
      accessor: (e) => e.type,
      render: (e) => (
        <span className="font-mono text-[12px] text-fg-muted">{e.type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'item_code', header: 'Item', width: '160px',
      accessor: (e) => e.item_code,
      render: (e) => <span className="font-mono text-[12px] text-fg">{e.item_code || '—'}</span>,
    },
    {
      key: 'message', header: 'What happened', render: (e) => (
        <span className="text-[13px] text-fg">{e.message}</span>
      ),
    },
    {
      key: 'action', header: 'What to do', width: '280px', render: (e) => (
        <span className="text-[13px] text-fg-muted">{e.action || '—'}</span>
      ),
    },
  ]

  const s = run?.stats

  return (
    <div className="flex h-full flex-col gap-4 pb-4">
      <PageHeader
        title="MRP"
        description="Material requirements, calculated on the server and stored as a run."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'MRP' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={<Target className="h-4 w-4" />}
              disabled={runMrp.isPending}
              onClick={() => setRunForOpen(true)}
            >
              Run for a demand
            </Button>
            <Button
              variant="primary"
              icon={<Play className="h-4 w-4" />}
              loading={runMrp.isPending}
              onClick={() => doRun()}
            >
              Run MRP
            </Button>
          </div>
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load the plan.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load the plan">
          {error instanceof ProblemError ? error.problem.detail : 'Unable to reach the planning service.'}
        </Alert>
      )}

      {!isLoading && !run && !error && (
        <Alert tone="info" title="MRP has not been run yet">
          There is no plan to show. Run MRP to calculate one — it reads demand, the master schedule,
          bills of material, stock and open purchase orders, and stores the result as a document.
        </Alert>
      )}

      {run && (
        <>
          <InfoStrip
            lead={
              <span className="font-mono text-[12px] font-semibold text-brand-600">{run.run_no}</span>
            }
            items={[
              // Scope first: a single-order plan and a whole-order-book plan
              // look identical otherwise, and mistaking one for the other means
              // under-buying.
              ...(run.demand_doc_no
                ? [{
                    label: 'For',
                    value: run.demand_doc_no,
                    icon: <Target className="h-3.5 w-3.5" aria-hidden />,
                  }]
                : [{ label: 'Scope', value: 'All open demand' }]),
              { label: 'Run', value: formatDate(run.run_at) },
              ...(run.run_by_name ? [{ label: 'by', value: run.run_by_name }] : []),
              { label: 'Horizon', value: `${run.horizon} wk from ${formatDate(run.first_bucket_start)}` },
              { label: 'Buy', value: s!.purchase_orders, icon: <ShoppingCart className="h-3.5 w-3.5" aria-hidden /> },
              { label: 'Make', value: s!.production_orders, icon: <Factory className="h-3.5 w-3.5" aria-hidden /> },
              { label: 'Late', value: s!.late_orders, icon: <Clock className="h-3.5 w-3.5" aria-hidden />, alert: s!.late_orders > 0 },
              { label: 'Buy value', value: money(s!.purchase_value) },
            ]}
          />

          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'buy', label: 'What to buy', count: buyRows.length },
              { id: 'make', label: 'What to make', count: makeRows.length },
              { id: 'shortages', label: 'Shortages', count: run.shortages.length },
              { id: 'exceptions', label: 'Warnings', count: run.exceptions.length },
              { id: 'plan', label: 'Calculation details', count: run.plans.length },
            ]}
          />

          {tab === 'buy' && (
            <MrpBuyMakeGrid
              rows={buyRows}
              type="PURCHASE"
              selected={buySel}
              onSelectedChange={setBuySel}
              loading={isLoading}
              onExported={(n) => toast.success('Export ready', `${n} rows written.`)}
              bulkActions={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ShoppingCart className="h-3.5 w-3.5" />}
                  disabled={selectedBuys.length === 0 || toPr.isPending}
                  loading={toPr.isPending}
                  onClick={convertBuys}
                >
                  Create purchase requisition ({selectedBuys.length})
                </Button>
              }
            />
          )}

          {tab === 'make' && (
            <MrpBuyMakeGrid
              rows={makeRows}
              type="PRODUCTION"
              selected={makeSel}
              onSelectedChange={setMakeSel}
              loading={isLoading}
              onExported={(n) => toast.success('Export ready', `${n} rows written.`)}
              bulkActions={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Factory className="h-3.5 w-3.5" />}
                  disabled={selectedMakes.length === 0 || toPo.isPending}
                  loading={toPo.isPending}
                  onClick={convertMakes}
                >
                  Create production order ({selectedMakes.length})
                </Button>
              }
            />
          )}


          {tab === 'shortages' && (
            <>
              {run.shortages.length > 0 && (
                <Alert tone="danger" title={`${run.shortages.length} shortages cannot be covered in time`}>
                  Each of these had to be released before today to arrive when it is needed. Expedite,
                  split the lot, or move the demand date out.
                </Alert>
              )}
              <DataTable
                density="comfortable" searchable={false}
                rows={run.shortages} columns={shortageColumns}
                rowKey={(s2) => `${s2.item_code}-${s2.required_on}`}
                loading={isLoading}
                emptyTitle="No shortages"
                emptyDescription="Every planned order can still be released in time."
              />
            </>
          )}

          {tab === 'exceptions' && (
            <>
              <div className="flex items-center gap-2">
                {(['ALL', 'ERROR', 'WARNING', 'INFO'] as const).map((t) => (
                  <Button
                    key={t} size="sm"
                    variant={severityFilter === t ? 'primary' : 'outline'}
                    onClick={() => setSeverityFilter(t)}
                  >
                    {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
                  </Button>
                ))}
              </div>
              <DataTable
                density="comfortable" searchable={false}
                rows={exceptions} columns={exceptionColumns} rowKey={(e) => e.uid}
                loading={isLoading}
                emptyTitle="No exceptions"
                emptyDescription="The run completed with nothing needing a decision."
              />
            </>
          )}

          {tab === 'plan' && (
            <>
              <Alert tone="info" title="Item summary">
                Totals across the {run.horizon}-week horizon. Level is the BOM depth — level 0 is a
                finished product, and everything below it was raised by the level above.
              </Alert>
              <DataTable
                density="comfortable" searchable={false}
                rows={run.plans} columns={planColumns} rowKey={(p) => p.item_code}
                loading={isLoading}
                onExport={(f: ExportFormat) => {
                  const n = exportRows(f, 'mrp-plan', 'Time-phased plan', columnsFromTable(planColumns), run.plans)
                  toast.success('Export ready', `${n} rows written.`)
                }}
                emptyTitle="Nothing planned"
                emptyDescription="No item had a requirement in this horizon."
              />
            </>
          )}
        </>
      )}

      {/*
        * Run for one demand.
        *
        * Deliberately a separate action from "Run MRP" rather than a filter on
        * it: the two produce different documents answering different questions,
        * and a planner who mistakes a single-order plan for the whole order book
        * will under-buy. The run header records which it was.
        */}
      <Modal
        open={runForOpen}
        onClose={() => setRunForOpen(false)}
        size="lg"
        title="Run MRP for one demand"
        description="Plans this order alone. Stock and open purchase orders still net off, so what comes back is what must be bought and made on top of what you already have."
      >
        <div className="flex flex-col gap-3">
          <Input
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="Search document, product or customer…"
            value={runForSearch}
            onChange={(e) => setRunForSearch(e.target.value)}
          />
          {runnableDemand.length === 0 ? (
            <Alert tone="info" title="No open demand">
              Every demand line is closed or already satisfied. Add demand on the Demand
              screen, then run the plan against it.
            </Alert>
          ) : (
            <ul className="flex max-h-[46vh] flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {runnableDemand.map((d) => (
                <li key={d.uid}>
                  <button
                    type="button"
                    disabled={runMrp.isPending}
                    onClick={() => doRun(d.docNo)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
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
                        {(d.qty - (d.qtyPlanned ?? 0)).toLocaleString('en-IN')} {d.uom}
                      </span>
                      <span className="block text-[11px] text-fg-muted">
                        by {formatDate(d.requiredOn)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default MrpPage
