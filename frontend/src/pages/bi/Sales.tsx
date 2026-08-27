import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DomainAnalytics } from '@/components/bi/DomainAnalytics'
import { dispatchTrend, regionSales, transporterScores } from '@/mock/bi'
import { formatCompact } from '@/lib/format'

/**
 * Sales and customer analytics.
 *
 * The CRM module is not built yet, so there is no order book, no pipeline and no
 * customer master to report against. Rather than invent one, this screen uses
 * dispatched value as the proxy and says so on the screen. A fabricated pipeline
 * on an executive dashboard is worse than an honest gap, because someone will
 * make a decision on it.
 */
export function BiSalesPage() {
  return (
    <DomainAnalytics
      title="Sales & customer analytics"
      breadcrumbLabel="Sales"
      kpiCodes={['CUS-OTD', 'CUS-EXP', 'CUS-RET', 'FIN-REV']}
      filters={['period', 'region', 'productFamily']}
      modules={['DISPATCH', 'FINANCE']}
      sourceNote="Order and customer figures are derived from dispatch, because the CRM feed has no source system yet — see Data sources."
      charts={[
        {
          title: 'Dispatch trend',
          description: 'Planned, dispatched and delivered cartons over the week',
          data: dispatchTrend as unknown as Record<string, string | number>[],
          xKey: 'day',
          bars: [{ key: 'dispatched', name: 'Dispatched', colour: '#7c3aed' }],
          lines: [
            { key: 'planned', name: 'Planned', colour: '#64748b' },
            { key: 'delivered', name: 'Delivered', colour: '#10b981' },
          ],
          suffix: ' cartons',
          drillTo: '/dispatch/tracking',
          drillLabel: 'Tracking',
          reading:
            'The gap between planned and dispatched is a loading or availability problem and belongs to the plant. The gap between dispatched and delivered is transit and belongs to the transporter.',
        },
        {
          title: 'Delivery performance by transporter',
          description: 'On-time percentage against the damage rate on the right axis',
          data: transporterScores as unknown as Record<string, string | number>[],
          xKey: 'transporter',
          bars: [{ key: 'onTimePct', name: 'On time %' }],
          colourBy: (row) =>
            Number(row.onTimePct) >= 95 ? '#10b981' : Number(row.onTimePct) >= 88 ? '#f59e0b' : '#ef4444',
          lines: [{ key: 'damagePct', name: 'Damage %', colour: '#ef4444', yAxis: 'right' }],
          rightAxisDomain: [0, 1],
          suffix: '%',
          drillTo: '/dispatch/transporters',
          drillLabel: 'Scorecard',
          reading:
            'The cheapest carrier per kilogram is often the dearest once claims and re-deliveries are counted — read this chart next to the freight rate before renewing a contract.',
        },
      ]}
      ranked={[
        {
          title: 'Dispatch by region',
          description: 'Value, growth and service level, from dispatched value',
          rows: regionSales.map((r) => ({
            label: r.region,
            sub: `${r.orders} orders · ${r.customers} customers · ${r.onTimePct.toFixed(1)}% on time`,
            value: r.revenue,
            pct: r.growthPct,
            status: r.growthPct < 0 ? ('bad' as const) : r.onTimePct < 90 ? ('watch' as const) : ('good' as const),
          })),
          format: (n) => formatCompact(n),
          drillTo: '/dispatch/shipments',
          drillLabel: 'Shipments',
          financialOnly: true,
        },
      ]}
    >
      <Card className="mb-4 border-warning/40">
        <CardHeader
          title="What this screen cannot tell you"
          description="Stated plainly, so nobody reads a gap as a zero"
        />
        <CardBody>
          <ul className="space-y-1.5 text-xs leading-relaxed text-fg-muted">
            <li>
              <span className="font-medium text-fg">No order book or pipeline.</span> Enquiries, quotations and sales
              orders live in CRM, which is not built. Everything above is measured after dispatch, so it is history, not
              forward demand.
            </li>
            <li>
              <span className="font-medium text-fg">Revenue is dispatched value, not invoiced value.</span> They differ
              by credit notes, rate revisions and goods dispatched but not yet billed.
            </li>
            <li>
              <span className="font-medium text-fg">Customer counts are per region, not per account.</span> Win rate,
              churn and customer lifetime value need the customer master and will stay blank until it exists.
            </li>
          </ul>
        </CardBody>
      </Card>
    </DomainAnalytics>
  )
}
