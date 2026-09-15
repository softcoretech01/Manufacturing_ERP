import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import {
  shopFloorApi,
  type EffectivenessResult,
  type IntegrityResult,
  type ProductionEntryRow,
  type ScrapResult,
  type WipResult,
} from '@/api/shopfloor'

/**
 * Production reports — each one a download of rows that already exist.
 *
 * There is no report definition language here and no stored report. Each entry
 * below reads one of the shop-floor projections and writes it out, so a report
 * can never disagree with the screen it came from.
 *
 * The data-integrity report is the odd one out and the most useful: it looks
 * for work orders whose quantities do not match the entries behind them. The
 * current code cannot create that state, so anything it finds predates the
 * present rules and needs a person to decide what to do about it.
 */

export function MesReportsPage() {
  const toast = useToast()
  const [entries, setEntries] = useState<ProductionEntryRow[]>([])
  const [scrap, setScrap] = useState<ScrapResult | null>(null)
  const [wip, setWip] = useState<WipResult | null>(null)
  const [effectiveness, setEffectiveness] = useState<EffectivenessResult | null>(null)
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      shopFloorApi.entries({ limit: 1000 }),
      shopFloorApi.scrap({ limit: 1000 }),
      shopFloorApi.wip(),
      shopFloorApi.effectiveness(),
      shopFloorApi.integrity(),
    ])
      .then(([e, s, w, eff, i]) => {
        setEntries(e)
        setScrap(s)
        setWip(w)
        setEffectiveness(eff)
        setIntegrity(i)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'),
      )
      .finally(() => setLoading(false))
  }, [])

  function download(format: ExportFormat, name: string, title: string, columns: any[], rows: any[]) {
    if (!rows.length) {
      toast.warning('Nothing to export', `${title} has no rows.`)
      return
    }
    try {
      const n = exportRows(format, name, title, columns, rows)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const reports = [
    {
      name: 'production-register',
      title: 'Production register',
      description: 'Every booking, with operator, machine, shift, quantities and minutes.',
      count: entries.length,
      to: '/production/entry',
      columns: [
        { header: 'Entry', value: (e: ProductionEntryRow) => e.docNo },
        { header: 'Date', value: (e: ProductionEntryRow) => (e.businessDate ? formatDate(e.businessDate) : '') },
        { header: 'Work order', value: (e: ProductionEntryRow) => e.workOrderDocNo },
        { header: 'Order', value: (e: ProductionEntryRow) => e.orderDocNo },
        { header: 'Operation', value: (e: ProductionEntryRow) => e.operationName },
        { header: 'Work centre', value: (e: ProductionEntryRow) => e.workCentreCode },
        { header: 'Machine', value: (e: ProductionEntryRow) => e.machineCode ?? '' },
        { header: 'Operator', value: (e: ProductionEntryRow) => e.operatorName ?? '' },
        { header: 'Shift', value: (e: ProductionEntryRow) => e.shiftCode ?? '' },
        { header: 'Good', value: (e: ProductionEntryRow) => formatQty(e.goodQty) },
        { header: 'Scrap', value: (e: ProductionEntryRow) => formatQty(e.scrapQty) },
        { header: 'Rework', value: (e: ProductionEntryRow) => formatQty(e.reworkQty) },
        { header: 'Run minutes', value: (e: ProductionEntryRow) => String(e.runMinutes) },
        { header: 'Status', value: (e: ProductionEntryRow) => e.status },
      ],
      rows: entries,
    },
    {
      name: 'scrap-register',
      title: 'Scrap register',
      description: 'Scrap notes with reason, decision and value at the cost recorded on them.',
      count: scrap?.records.length ?? 0,
      to: '/production/scrap',
      columns: [
        { header: 'Scrap note', value: (r: any) => r.docNo },
        { header: 'Date', value: (r: any) => (r.businessDate ? formatDate(r.businessDate) : '') },
        { header: 'Order', value: (r: any) => r.orderDocNo },
        { header: 'Item', value: (r: any) => r.itemCode },
        { header: 'Quantity', value: (r: any) => formatQty(r.qty) },
        { header: 'Value', value: (r: any) => formatCurrency(r.value) },
        { header: 'Reason', value: (r: any) => r.defectName || r.reason || r.defectCode || '' },
        { header: 'Decision', value: (r: any) => r.disposition },
        { header: 'Status', value: (r: any) => r.status },
      ],
      rows: scrap?.records ?? [],
    },
    {
      name: 'work-in-progress',
      title: 'Work in progress',
      description: 'What each open operation is still holding, and for how long.',
      count: wip?.lots.length ?? 0,
      to: '/production/wip',
      columns: [
        { header: 'Work order', value: (l: any) => l.docNo },
        { header: 'Order', value: (l: any) => l.orderDocNo },
        { header: 'Product', value: (l: any) => l.productCode },
        { header: 'Operation', value: (l: any) => `${l.seq} ${l.operationName}` },
        { header: 'Work centre', value: (l: any) => l.workCentreCode },
        { header: 'Came in', value: (l: any) => formatQty(l.inputQty) },
        { header: 'Held', value: (l: any) => formatQty(l.heldQty) },
        { header: 'Waiting (h)', value: (l: any) => (l.ageHours === null ? 'not started' : String(l.ageHours)) },
        { header: 'State', value: (l: any) => l.state },
      ],
      rows: wip?.lots ?? [],
    },
    {
      name: 'effectiveness',
      title: 'Quality and performance',
      description: 'Per work centre. Availability is absent, because it cannot be measured here.',
      count: effectiveness?.workCentres.length ?? 0,
      to: '/production/oee',
      columns: [
        { header: 'Work centre', value: (w: any) => w.workCentreCode },
        { header: 'Entries', value: (w: any) => String(w.entries) },
        { header: 'Good', value: (w: any) => formatQty(w.goodQty) },
        { header: 'Scrap', value: (w: any) => formatQty(w.scrapQty) },
        { header: 'Standard minutes', value: (w: any) => String(w.standardMinutes) },
        { header: 'Actual minutes', value: (w: any) => String(w.runMinutes) },
        { header: 'Quality %', value: (w: any) => (w.qualityPct === null ? '' : String(w.qualityPct)) },
        { header: 'Performance %', value: (w: any) => (w.performancePct === null ? '' : String(w.performancePct)) },
        { header: 'Availability %', value: () => 'not measured' },
      ],
      rows: effectiveness?.workCentres ?? [],
    },
  ]

  const issues =
    (integrity?.quantitiesWithoutEntries.length ?? 0) +
    (integrity?.overIssuedComponents.length ?? 0) +
    (integrity?.componentsNotInInventory.length ?? 0)

  return (
    <div>
      <PageHeader
        title="Production reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Reports' }]}
      />

      {error && (
        <Alert tone="danger" title="Reports could not be prepared" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && <p className="mb-4 text-xs text-fg-muted">Reading the floor…</p>}

      <p className="mb-4 text-xs text-fg-muted">
        Each report writes out rows that already exist on a screen, so a report can never disagree with the screen it came
        from. Nothing here is summarised in a way the underlying page does not also show.
      </p>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.name}>
            <CardHeader
              title={r.title}
              description={r.description}
              actions={<Link to={r.to} className="text-2xs font-medium text-brand-600 hover:underline">Open</Link>}
            />
            <CardBody>
              <p className="mb-3 text-xs text-fg-muted">
                <span className={cn('font-medium tabular', r.count ? 'text-fg' : 'text-fg-subtle')}>{r.count}</span> row
                {r.count === 1 ? '' : 's'} available.
              </p>
              <div className="flex flex-wrap gap-2">
                {(['xlsx', 'csv', 'pdf'] as ExportFormat[]).map((f) => (
                  <Button
                    key={f}
                    variant="outline"
                    size="xs"
                    disabled={!r.count}
                    onClick={() => download(f, r.name, r.title, r.columns, r.rows)}
                  >
                    {f === 'xlsx' ? 'Excel' : f.toUpperCase()}
                  </Button>
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Data integrity ------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Data integrity"
          description="Where the floor's own figures disagree with the bookings behind them"
        />
        <CardBody className="space-y-3">
          {integrity?.clean && (
            <Alert tone="tip" title="Everything reconciles">
              Every work order's produced and scrap quantities equal the entries booked against it, no component has been
              issued beyond its requirement, and every component on an open order exists in the inventory master.
            </Alert>
          )}

          {!integrity?.clean && integrity && (
            <Alert tone="warning" title={`${issues} discrepanc${issues === 1 ? 'y' : 'ies'} found`}>
              These are reported, not corrected. A production record is never rewritten to make a report balance.
            </Alert>
          )}

          {integrity && integrity.quantitiesWithoutEntries.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-fg">
                Work orders carrying a quantity with no booking behind it
              </p>
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th className="w-36">Work order</th>
                      <th>Operation</th>
                      <th className="w-20 text-right">Entries</th>
                      <th className="w-28 text-right">On the order</th>
                      <th className="w-28 text-right">From entries</th>
                      <th className="w-28 text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrity.quantitiesWithoutEntries.map((r) => (
                      <tr key={r.docNo}>
                        <td className="font-mono text-2xs text-brand-600">{r.docNo}</td>
                        <td className="text-xs">{r.seq} · {r.operationName}</td>
                        <td className="text-right tabular">{r.entries}</td>
                        <td className="text-right tabular">{formatQty(r.workOrderProduced)}</td>
                        <td className="text-right tabular">{formatQty(r.entriesGood)}</td>
                        <td className="text-right tabular text-warning">{formatQty(r.goodDifference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-fg-muted">
                The current code refuses to complete an operation with nothing booked against it, so these rows were written
                before that rule existed. They are left as they are; correcting them would mean inventing bookings.
              </p>
            </div>
          )}

          {integrity && integrity.componentsNotInInventory.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-fg">Components on open orders that inventory has never heard of</p>
              <ul className="space-y-1">
                {integrity.componentsNotInInventory.map((c) => (
                  <li key={`${c.orderDocNo}-${c.itemCode}`} className="text-2xs text-fg-muted">
                    <span className="font-mono text-fg">{c.itemCode}</span> on {c.orderDocNo} — it cannot be issued, so the
                    order cannot finish.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {integrity && integrity.overIssuedComponents.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-fg">Components issued beyond their requirement</p>
              <ul className="space-y-1">
                {integrity.overIssuedComponents.map((c) => (
                  <li key={`${c.orderDocNo}-${c.itemCode}`} className="text-2xs text-fg-muted">
                    <span className="font-mono text-fg">{c.itemCode}</span> on {c.orderDocNo} — {formatQty(c.issuedQty)} issued
                    against {formatQty(c.requiredQty)} required, an excess of {formatQty(c.excessQty)}.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
