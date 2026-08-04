import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCanSeeFreight } from '@/components/dispatch/DispatchShell'
import { cn } from '@/lib/cn'

interface ReportDef {
  id: string
  name: string
  group: 'A' | 'B' | 'C' | 'D'
  columns: string
  filters: string
  /** Reports carrying freight or invoice value need DISPATCH.REPORT.VIEW_VALUE. */
  valued?: boolean
  to?: string
}

const GROUPS: Record<ReportDef['group'], string> = {
  A: 'Packing',
  B: 'Dispatch',
  C: 'Logistics',
  D: 'Export',
}

/** The report catalogue this module ships — D-01 … D-22. */
const REPORTS: ReportDef[] = [
  { id: 'D-01', name: 'Packing Order Register', group: 'A', columns: 'Order, customer, product, quantity, cartons planned/packed, supervisor, status', filters: 'Period, customer, status, warehouse', to: '/dispatch/packing-orders' },
  { id: 'D-02', name: 'Carton Register', group: 'A', columns: 'Carton, barcode, order, product, batch, quantity, weight, dimensions, operator, pallet', filters: 'Order, customer, date, operator', to: '/dispatch/cartons' },
  { id: 'D-03', name: 'Pallet Register', group: 'A', columns: 'Pallet, SSCC, type, customer, destination, cartons, weight, stack height, shipment', filters: 'Type, customer, status', to: '/dispatch/pallets' },
  { id: 'D-04', name: 'Packing Material Consumption', group: 'A', columns: 'Order, material, category, standard, issued, consumed, variance, value', filters: 'Order, category, period', valued: true, to: '/dispatch/packing-materials' },
  { id: 'D-05', name: 'Packing Efficiency', group: 'A', columns: 'Supervisor, shift, cartons packed, bottles, cartons per hour, accuracy %', filters: 'Period, supervisor, line', to: '/dispatch' },
  { id: 'D-06', name: 'Label Print Log', group: 'A', columns: 'Format, level, standard, customer, copies printed, last printed', filters: 'Level, standard, period', to: '/dispatch/labels' },

  { id: 'D-07', name: 'Dispatch Register', group: 'B', columns: 'Plan, customer, route, cartons, pallets, weight, vehicle, transporter, status', filters: 'Period, route, customer, status', to: '/dispatch/planning' },
  { id: 'D-08', name: 'Pending Dispatch', group: 'B', columns: 'Order, customer, cartons ready, promised date, days waiting, blocking reason', filters: 'Customer, priority, age', to: '/dispatch/planning' },
  { id: 'D-09', name: 'Pick List & Short Pick Report', group: 'B', columns: 'Pick list, plan, item, bin, batch, required, picked, gap, picker, short reason', filters: 'Method, warehouse, picker, status', to: '/dispatch/pick-lists' },
  { id: 'D-10', name: 'Vehicle Loading Report', group: 'B', columns: 'Sheet, vehicle, driver, cartons planned/loaded, weighbridge, variance, seal, photos', filters: 'Period, vehicle, bay', to: '/dispatch/loading' },
  { id: 'D-11', name: 'Shipment Register', group: 'B', columns: 'Shipment, type, challan, invoice, e-way bill, customer, vehicle, cartons, weight, value', filters: 'Type, period, customer, region', valued: true, to: '/dispatch/shipments' },
  { id: 'D-12', name: 'Delivery Schedule', group: 'B', columns: 'Promised date, customer, shipment, cartons, route, vehicle, status', filters: 'Date range, region, customer', to: '/dispatch/tracking' },
  { id: 'D-13', name: 'Vehicle Utilisation', group: 'B', columns: 'Vehicle, trips, capacity, weight carried, utilisation %, idle days, papers expiry', filters: 'Period, transporter, type', to: '/dispatch/vehicles' },

  { id: 'D-14', name: 'Freight Cost Analysis', group: 'C', columns: 'Charge type, shipment, customer, route, basis, quantity, rate, amount, allocation', filters: 'Period, transporter, charge type, allocation', valued: true, to: '/dispatch/freight' },
  { id: 'D-15', name: 'Transporter Performance', group: 'C', columns: 'Transporter, trips, on-time %, damage %, average transit, freight per kg, score', filters: 'Period, route', valued: true, to: '/dispatch/transporters' },
  { id: 'D-16', name: 'Route Performance', group: 'C', columns: 'Region, route, cartons, weight, value, on-time %, average transit days', filters: 'Period, region', valued: true, to: '/dispatch/transporters' },
  { id: 'D-17', name: 'Delivery Performance & Transit Delay', group: 'C', columns: 'Shipment, promised, delivered, hours late, delay reason, transporter', filters: 'Period, transporter, region', to: '/dispatch/tracking' },
  { id: 'D-18', name: 'POD Pending & Ageing', group: 'C', columns: 'Shipment, customer, delivered on, days outstanding, dispatched quantity, value', filters: 'Age band, customer', valued: true, to: '/dispatch/pod' },
  { id: 'D-19', name: 'Return & Reverse Logistics Register', group: 'C', columns: 'Return, type, customer, product, batch, claimed, received, disposition, credit note, value', filters: 'Type, period, disposition, customer', valued: true, to: '/dispatch/returns' },

  { id: 'D-20', name: 'Export Shipment Register', group: 'D', columns: 'Export, shipment, container, size, incoterm, vessel, ETD, ETA, HS code, FOB value', filters: 'Period, country, customer, incoterm', valued: true, to: '/dispatch/exports' },
  { id: 'D-21', name: 'Container Tracking', group: 'D', columns: 'Container, seal, stuffing date, vessel, voyage, POL, POD, ETD, ETA, status', filters: 'Status, vessel, port', to: '/dispatch/exports' },
  { id: 'D-22', name: 'Export Documentation Status', group: 'D', columns: 'Export shipment, document, number, issued on, issuer, dependency, status', filters: 'Shipment, document type, status', to: '/dispatch/export-documents' },
  { id: 'D-23', name: 'Customs Clearance Report', group: 'D', columns: 'Container, shipping bill, filed on, assessed, cleared, days at port, demurrage', filters: 'Period, port, status', valued: true, to: '/dispatch/exports' },
]

/** Packing, dispatch and logistics reports. */
export function DispatchReportsPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeFreight()
  const [group, setGroup] = useState<'ALL' | ReportDef['group']>('ALL')
  const [q, setQ] = useState('')

  const visible = REPORTS.filter((r) => (group === 'ALL' ? true : r.group === group)).filter(
    (r) => !q.trim() || `${r.id} ${r.name} ${r.columns} ${r.filters}`.toLowerCase().includes(q.toLowerCase()),
  )

  const lockedCount = REPORTS.filter((r) => r.valued && !canSeeValue).length

  return (
    <div>
      <PageHeader
        title="Dispatch reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Reports' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.success(
                'Schedule created',
                "Scheduled reports are e-mailed with the recipient's own permissions applied — a loading supervisor gets cartons and weights, finance gets the freight cost.",
              )
            }
          >
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
              {' '}· <span className="font-medium text-warning">{lockedCount}</span> carry freight or invoice value and need{' '}
              <span className="font-mono">DISPATCH.REPORT.VIEW_VALUE</span>, which your role does not hold
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
                <Badge tone={locked ? 'warning' : 'neutral'} size="sm" dot={false}>
                  {locked ? 'value locked' : GROUPS[r.group]}
                </Badge>
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
                      onClick={(e) => {
                        e.preventDefault()
                        toast.success('Report queued', `${r.id} ${r.name} — Excel, PDF and CSV all carry exactly the columns you can see on screen.`)
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
        <CardHeader title="What makes a dispatch report worth acting on" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Everything ties to a carton number.</span> The carton created at packing is the
            same one on the loading sheet, the challan and the shortage claim. No report here invents its own identifier.
          </p>
          <p>
            <span className="font-medium text-fg">Cost and quantity are separated.</span> Freight rates are commercial terms, so
            the value columns sit behind their own permission and drop out of the export as well as the screen.
          </p>
          <p>
            <span className="font-medium text-fg">Every report drills down.</span> "On-time delivery 91%" is a talking point; the
            four late shipments and their delay reasons are something you can act on.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
