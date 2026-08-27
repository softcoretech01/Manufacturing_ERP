import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCanSeeCost } from '@/components/mes/MesShell'
import { cn } from '@/lib/cn'

interface ReportDef {
  id: string
  name: string
  group: 'A' | 'B' | 'C' | 'D' | 'E'
  columns: string
  filters: string
  /** Reports carrying cost need PRODUCTION.REPORT.VIEW_VALUE. */
  valued?: boolean
  /** Where the same data is already drillable in the portal. */
  to?: string
}

const GROUPS: Record<ReportDef['group'], string> = {
  A: 'Output & orders',
  B: 'Machines & OEE',
  C: 'Quality & scrap',
  D: 'People & shifts',
  E: 'Traceability & cost',
}

/** The report catalogue this module ships — P-01 … P-24. */
const REPORTS: ReportDef[] = [
  { id: 'P-01', name: 'Daily Production Report', group: 'A', columns: 'Line, order, item, planned, made, scrap, rework, efficiency', filters: 'Date, line, shift', to: '/production/entry' },
  { id: 'P-02', name: 'Production Order Status', group: 'A', columns: 'Order, item, planned, made, balance, % complete, promised date, status', filters: 'Status, line, customer', to: '/production/orders' },
  { id: 'P-03', name: 'Work Order Progress', group: 'A', columns: 'Order, operation, work centre, machine, in, out, scrap, status', filters: 'Order, work centre, status', to: '/production/work-orders' },
  { id: 'P-04', name: 'Plan vs Actual by Line', group: 'A', columns: 'Line, planned quantity, actual, variance, variance %, reason', filters: 'Period, line', to: '/production' },
  { id: 'P-05', name: 'Hourly Output Trend', group: 'A', columns: 'Hour, planned, actual, scrap, cumulative gap', filters: 'Date, line, shift', to: '/production' },
  { id: 'P-06', name: 'Order Completion & Lead Time', group: 'A', columns: 'Order, released, completed, elapsed days, standard days, delay', filters: 'Period, item', to: '/production/orders' },

  { id: 'P-07', name: 'OEE by Machine', group: 'B', columns: 'Machine, availability, performance, quality, OEE, good pieces', filters: 'Date, line, work centre', to: '/production/oee' },
  { id: 'P-08', name: 'OEE Trend', group: 'B', columns: 'Period, availability, performance, quality, OEE', filters: 'Period, line', to: '/production/oee' },
  { id: 'P-09', name: 'Downtime Register', group: 'B', columns: 'Machine, reason, from, to, minutes, shift, corrective action', filters: 'Reason, machine, period', to: '/production/downtime' },
  { id: 'P-10', name: 'Downtime Pareto', group: 'B', columns: 'Reason, events, minutes lost, % of total, cumulative %', filters: 'Period, line', to: '/production/downtime' },
  { id: 'P-11', name: 'Machine Utilisation', group: 'B', columns: 'Machine, planned, run, idle, down, utilisation %, pieces per hour', filters: 'Period, work centre', to: '/production/machines' },
  { id: 'P-12', name: 'Capacity Load vs Available', group: 'B', columns: 'Work centre, load hours, available hours, load %, overload', filters: 'Period, work centre', to: '/production/queue' },

  { id: 'P-13', name: 'Scrap Register', group: 'C', columns: 'Record, operation, item, batch, pieces, reason, operator, decision', filters: 'Reason, operation, period', valued: true, to: '/production/scrap' },
  { id: 'P-14', name: 'Scrap Pareto by Defect', group: 'C', columns: 'Defect, pieces, % of total, cost, cumulative %', filters: 'Period, line, operation', valued: true, to: '/production/scrap' },
  { id: 'P-15', name: 'Rework Register & Recovery', group: 'C', columns: 'Order, defect, raised, repaired, scrapped, recovery %, cost', filters: 'Status, defect, period', valued: true, to: '/production/rework' },
  { id: 'P-16', name: 'First Pass Yield by Operation', group: 'C', columns: 'Operation, in, good first time, FPY %, scrap, rework', filters: 'Period, line', to: '/production/work-orders' },
  { id: 'P-17', name: 'Operation Yield Chain', group: 'C', columns: 'Sequence, operation, in, out, loss, cumulative yield', filters: 'Order, batch', to: '/production/traveller' },

  { id: 'P-18', name: 'Shift Production Log', group: 'D', columns: 'Date, shift, line, supervisor, target, made, scrap, manpower, handover', filters: 'Period, shift, line', to: '/production/shifts' },
  { id: 'P-19', name: 'Operator Performance', group: 'D', columns: 'Operator, skill, made, scrap, standard minutes, actual, efficiency', filters: 'Shift, work centre, period', to: '/production/labour' },
  { id: 'P-20', name: 'Labour Attendance & Coverage', group: 'D', columns: 'Work centre, planned, present, absent, coverage %, days worked', filters: 'Period, shift', to: '/production/labour' },
  { id: 'P-21', name: 'Skill Matrix & Certification', group: 'D', columns: 'Operator, skill level, certified operations, gaps', filters: 'Work centre, skill', to: '/production/labour' },

  { id: 'P-22', name: 'Batch Traveller Card', group: 'E', columns: 'Operation chain with machine, operator, tool, in/out, QC, timestamps', filters: 'Order, batch', to: '/production/traveller' },
  { id: 'P-23', name: 'Genealogy Trace Pack', group: 'E', columns: 'Backward to raw batches, forward to despatches and customers (PDF pack)', filters: 'Batch, serial, heat number', to: '/production/genealogy' },
  { id: 'P-24', name: 'Production Cost per Order', group: 'E', columns: 'Order, material, labour, machine hours, scrap loss, cost per piece', filters: 'Order, period, item', valued: true },
]

/** Production reports — the printed and scheduled outputs this module owes. */
export function MesReportsPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeCost()
  const [group, setGroup] = useState<'ALL' | ReportDef['group']>('ALL')
  const [q, setQ] = useState('')

  const visible = REPORTS.filter((r) => (group === 'ALL' ? true : r.group === group)).filter(
    (r) => !q.trim() || `${r.id} ${r.name} ${r.columns} ${r.filters}`.toLowerCase().includes(q.toLowerCase()),
  )

  const lockedCount = REPORTS.filter((r) => r.valued && !canSeeValue).length

  return (
    <div>
      <PageHeader
        title="Production reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Reports' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success('Schedule created', 'Scheduled reports are e-mailed with the recipient’s own permissions applied — a supervisor gets the quantities, the accountant gets the cost.')}
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
              {' '}· <span className="font-medium text-warning">{lockedCount}</span> carry cost and need{' '}
              <span className="font-mono">PRODUCTION.REPORT.VIEW_VALUE</span>, which your role does not hold
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
                  {locked ? 'cost locked' : GROUPS[r.group]}
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
                  <span className="text-2xs text-warning">Cost columns are absent for your role</span>
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
        <CardHeader title="A production report is only useful if it is trusted" description="Three rules every one of these follows" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">One source.</span> Every figure here is derived from booked production
            entries, downtime events and scrap records. Nothing is typed twice, so nothing can disagree.
          </p>
          <p>
            <span className="font-medium text-fg">The export matches the screen.</span> Column choices, filters and hidden
            columns carry through to Excel and PDF — including the ones your role is not allowed to see.
          </p>
          <p>
            <span className="font-medium text-fg">Every report drills down.</span> An OEE of 68% is an argument; the eleven
            downtime events behind it are a plan. Cards with a live view open the underlying screen.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
