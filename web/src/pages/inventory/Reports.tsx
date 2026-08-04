import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileSpreadsheet, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCanSeeValue } from '@/components/inventory/InvShell'
import { cn } from '@/lib/cn'

interface ReportDef {
  id: string
  name: string
  group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  columns: string
  filters: string
  /** Reports carrying stock value need INVENTORY.REPORT.VIEW_VALUE. */
  valued?: boolean
  /** Where the same data is already drillable in the portal. */
  to?: string
}

const GROUPS: Record<ReportDef['group'], string> = {
  A: 'Stock position',
  B: 'Movement',
  C: 'Traceability & quality',
  D: 'Counting & control',
  E: 'Valuation & finance',
  F: 'Planning',
}

/** Ch 14 §14.2 — the catalogue the module must ship, R-01 … R-26 plus planning. */
const REPORTS: ReportDef[] = [
  { id: 'R-01', name: 'Stock Summary', group: 'A', columns: 'Item, class, UOM, on hand, free, reserved, quarantine, value', filters: 'Plant, warehouse, class, item', valued: true, to: '/inventory/stock' },
  { id: 'R-02', name: 'Stock Detail (item × warehouse × bin × batch)', group: 'A', columns: '+ bin, batch, expiry, status, age', filters: '+ batch, status', valued: true, to: '/inventory/stock' },
  { id: 'R-03', name: 'Stock as on Date', group: 'A', columns: 'As R-01 at a past date, replayed from the ledger', filters: 'Date, plant, warehouse', valued: true },
  { id: 'R-04', name: 'Bin Card / Stock Ledger', group: 'A', columns: 'Date, document, movement type, in, out, balance, rate', filters: 'Item, location, date range', valued: true, to: '/inventory/ledger' },
  { id: 'R-05', name: 'Bin Contents & Occupancy', group: 'A', columns: 'Bin, item, batch, quantity, utilisation %, last movement', filters: 'Warehouse, zone', to: '/inventory/warehouses' },
  { id: 'R-06', name: 'Negative Stock Exceptions', group: 'A', columns: 'Item, location, quantity, document, actor, days open', filters: 'Warehouse' },

  { id: 'R-07', name: 'Receipt Register', group: 'B', columns: 'Date, source, document, supplier/order, item, batch, quantity, value, status', filters: 'Source, date, warehouse', valued: true, to: '/inventory/putaway' },
  { id: 'R-08', name: 'Material Issue Register', group: 'B', columns: 'Date, document, charge, order/cost centre, item, batch, quantity, value', filters: 'Charge type, order, item', valued: true, to: '/inventory/issues' },
  { id: 'R-09', name: 'Consumption vs BOM Variance', group: 'B', columns: 'Order, item, standard, issued, returned, net, variance %, reason', filters: 'Order, item, period', to: '/inventory/issues' },
  { id: 'R-10', name: 'Transfer Register', group: 'B', columns: 'Type, route, item, quantity, dispatched, received, short, GIT age', filters: 'Type, route, status', valued: true, to: '/inventory/transfers' },
  { id: 'R-11', name: 'Goods in Transit & Ageing', group: 'B', columns: 'Route, document, value, dispatched on, age, expected on', filters: 'Route, age band', valued: true, to: '/inventory/transfers' },
  { id: 'R-12', name: 'Movement Analysis by Type', group: 'B', columns: 'Movement type, count, quantity, value, by period', filters: 'Movement type, period', valued: true },

  { id: 'R-13', name: 'Batch Register & Balance', group: 'C', columns: 'Batch, item, supplier heat, received, remaining, expiry, status, QC', filters: 'Item, supplier, status', to: '/inventory/batches' },
  { id: 'R-14', name: 'Expiry & Near-expiry', group: 'C', columns: 'Batch, item, quantity, value, expiry, days left, proposed action', filters: 'Window (7/30/90 d)', valued: true, to: '/inventory/batches' },
  { id: 'R-15', name: 'Serial Register & Warranty', group: 'C', columns: 'Serial, item, batch, status, customer, dispatch date, warranty end', filters: 'Item, status, customer', to: '/inventory/batches' },
  { id: 'R-16', name: 'Forward / Backward Trace Pack', group: 'C', columns: 'Full genealogy with documents, MTCs and inspections (PDF pack)', filters: 'Serial, batch, heat, GRN, carton, invoice', to: '/inventory/batches' },
  { id: 'R-17', name: 'Quarantine Register & Ageing', group: 'C', columns: 'Lot, item, batch, quantity, days held, inspection reference', filters: 'Age band, supplier', valued: true, to: '/inventory/putaway' },

  { id: 'R-18', name: 'Count Plan & Coverage', group: 'D', columns: 'Class, planned, counted, coverage %, overdue', filters: 'Period, warehouse, class', to: '/inventory/counting' },
  { id: 'R-19', name: 'Count Variance', group: 'D', columns: 'Bin, item, batch, system, counted, variance, value, reason, root cause, counter, approver', filters: 'Count, warehouse, root cause', valued: true, to: '/inventory/counting' },
  { id: 'R-20', name: 'Inventory Accuracy Trend', group: 'D', columns: 'Period, bins counted, exact, accuracy %, value variance %', filters: 'Period, warehouse', to: '/inventory' },
  { id: 'R-21', name: 'Adjustment & Write-off Register', group: 'D', columns: 'Document, reason, root cause, quantity, value, raiser, approver', filters: 'Reason, period, raiser', valued: true, to: '/inventory/adjustments' },
  { id: 'R-22', name: 'Scrap Register with Defect Correlation', group: 'D', columns: 'Order, defect code, item, quantity, book value, recovery, shift', filters: 'Defect, order, shift', valued: true, to: '/inventory/adjustments' },

  { id: 'R-23', name: 'Stock Valuation', group: 'E', columns: 'Item, warehouse, method, quantity, rate, value, batch (optional)', filters: 'Plant, warehouse, class, date', valued: true, to: '/inventory/valuation' },
  { id: 'R-24', name: 'Valuation Movement', group: 'E', columns: 'Group, opening, receipts, issues, transfers, adjustments, revaluations, closing', filters: 'Period, plant', valued: true, to: '/inventory/valuation' },
  { id: 'R-25', name: 'Ageing & Non-moving with Provision', group: 'E', columns: 'Class, buckets, non-moving value, provision proposed/approved', filters: 'Bucket, class, warehouse', valued: true, to: '/inventory/valuation' },
  { id: 'R-26', name: 'GL Reconciliation', group: 'E', columns: 'Account group, ledger value, GL balance, difference, itemised documents', filters: 'Period, account group', valued: true, to: '/inventory/valuation' },

  { id: 'R-27', name: 'Reorder Status & Breach', group: 'F', columns: 'Item, free, on order, reorder level, coverage, suggested quantity, action', filters: 'Plant, class, action', to: '/inventory/replenishment' },
  { id: 'R-28', name: 'Shortage List', group: 'F', columns: 'Item, demand, party, required, available, gap, earliest cover, days late', filters: 'Demand type, period', to: '/inventory/replenishment' },
  { id: 'R-29', name: 'ABC-XYZ Classification & Change Log', group: 'F', columns: 'Item, ABC, XYZ, consumption value, volatility, previous class', filters: 'Class, period', to: '/inventory/replenishment' },
  { id: 'R-30', name: 'Reservation & Allocation Register', group: 'F', columns: 'Demand, item, quantity, priority, state, required, expires', filters: 'Item, state, demand type', to: '/inventory/replenishment' },
  { id: 'R-31', name: 'Inventory Turns & Days of Cover', group: 'F', columns: 'Class, consumption value, average stock, turns, days of cover', filters: 'Period, class', valued: true },
]

export function InventoryReportsPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const [group, setGroup] = useState<'ALL' | ReportDef['group']>('ALL')
  const [q, setQ] = useState('')

  const visible = REPORTS.filter((r) => (group === 'ALL' ? true : r.group === group)).filter(
    (r) => !q.trim() || `${r.id} ${r.name} ${r.columns} ${r.filters}`.toLowerCase().includes(q.toLowerCase()),
  )

  const lockedCount = REPORTS.filter((r) => r.valued && !canSeeValue).length

  return (
    <div>
      <PageHeader
        title="Inventory reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Reports' }]}
        actions={
          <Button variant="outline" size="sm" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => toast.success('Schedule created', 'Scheduled reports are delivered by e-mail with the same permission checks applied to the recipient.')}>
            Schedule a report
          </Button>
        }
        tabs={
          <Tabs
            variant="pill"
            active={group}
            onChange={(v) => setGroup(v as typeof group)}
            tabs={[
              { id: 'ALL', label: 'All', count: REPORTS.length },
              ...(Object.keys(GROUPS) as ReportDef['group'][]).map((g) => ({
                id: g,
                label: GROUPS[g],
                count: REPORTS.filter((r) => r.group === g).length,
              })),
            ]}
          />
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput containerClassName="w-72" sizeVariant="sm" placeholder="Search report, column or filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg">{visible.length}</span> of {REPORTS.length} reports
          {lockedCount > 0 && (
            <>
              {' '}· <span className="font-medium text-warning">{lockedCount}</span> need{' '}
              <span className="font-mono">INVENTORY.REPORT.VIEW_VALUE</span>, which your role does not hold
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const locked = !!r.valued && !canSeeValue
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-2xs text-fg-subtle">{r.id}</p>
                  <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                </div>
                {locked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-warning" />
                ) : (
                  <Badge tone="neutral" size="sm" dot={false}>{GROUPS[r.group]}</Badge>
                )}
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-fg-muted">
                <span className="font-medium text-fg-subtle">Columns:</span> {r.columns}
              </p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
                <span className="font-medium text-fg-subtle">Filters:</span> {r.filters}
              </p>
              <div className="mt-3 flex items-center gap-2">
                {locked ? (
                  <span className="text-2xs text-warning">Value columns are absent for your role</span>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Download className="h-3.5 w-3.5" />}
                      onClick={(e) => {
                        e.preventDefault()
                        toast.success('Report queued', `${r.id} ${r.name} — Excel, PDF and CSV all carry exactly the columns you can see.`)
                      }}
                    >
                      Run
                    </Button>
                    {r.to && <span className="text-2xs text-fg-subtle">Live view available</span>}
                  </>
                )}
              </div>
            </>
          )

          return r.to && !locked ? (
            <Link key={r.id} to={r.to} className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
              {body}
            </Link>
          ) : (
            <div key={r.id} className={cn('card p-3.5', locked && 'opacity-70')}>
              {body}
            </div>
          )
        })}
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Every report obeys the same three rules"
          description="They are not decoration — they are what makes a report trustworthy enough to act on"
        />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Drillable.</span> Every figure opens the rows behind it. A number you cannot
            drill into is a number nobody will defend in a meeting.
          </p>
          <p>
            <span className="font-medium text-fg">Permission-scoped.</span> Value columns are absent — not blanked — for roles
            without the permission, in the screen, in the export and in the API.
          </p>
          <p>
            <span className="font-medium text-fg">Exportable as seen.</span> Excel, PDF and CSV carry the columns and filters you
            are looking at, so the file matches the screen it came from.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
