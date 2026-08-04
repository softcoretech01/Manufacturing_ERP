import { DomainAnalytics } from '@/components/bi/DomainAnalytics'
import { financeTrend } from '@/mock/bi'
import { standardCostCards } from '@/mock/finance'

/**
 * Financial analytics — the P&L shape, cash movement, and where the cost of a
 * bottle actually sits. The whole screen is money, so it is gated on
 * BI.FINANCIAL.VIEW: without it the KPI row masks and both charts refuse,
 * rather than showing a half-truth.
 */
export function BiFinancePage() {
  /** Cost element mix, averaged across the standard cost cards. Material is
   *  ~60% of a stainless bottle, which is why coil price dominates margin. */
  const elements = (['material', 'labour', 'machine', 'overhead', 'packing'] as const).map((key) => ({
    element: key.charAt(0).toUpperCase() + key.slice(1),
    value:
      standardCostCards.length
        ? Math.round((standardCostCards.reduce((s, c) => s + c[key], 0) / standardCostCards.length) * 100) / 100
        : 0,
  }))
  const cardTotal = elements.reduce((s, e) => s + e.value, 0)

  return (
    <DomainAnalytics
      title="Financial analytics"
      breadcrumbLabel="Finance"
      kpiCodes={['FIN-REV', 'FIN-GM', 'FIN-CF', 'FIN-BUD', 'FIN-CPB']}
      filters={['period', 'plant']}
      modules={['FINANCE', 'PRODUCTION', 'INVENTORY']}
      sourceNote="Revenue and profit come from the posted ledger. Cost per bottle divides works cost by good bottles confirmed in production, so it moves with yield as well as with spend."
      charts={[
        {
          title: 'Revenue, expense and profit',
          description: 'Monthly P&L shape — profit is the line, not a bar, because it is a residual',
          data: financeTrend as unknown as Record<string, string | number>[],
          xKey: 'month',
          bars: [
            { key: 'revenue', name: 'Revenue', colour: '#10b981' },
            { key: 'expense', name: 'Expense', colour: '#f59e0b' },
          ],
          lines: [{ key: 'profit', name: 'Profit', colour: '#7c3aed' }],
          prefix: '₹',
          drillTo: '/finance',
          drillLabel: 'Finance module',
          financialOnly: true,
          reading:
            'Revenue and expense moving together with profit flat means volume growth at an unchanged margin — worth checking whether price or cost is the constraint.',
        },
        {
          title: 'Cash in against cash out',
          description: 'Collections and payments — profit and cash are not the same thing',
          data: financeTrend as unknown as Record<string, string | number>[],
          xKey: 'month',
          bars: [
            { key: 'cashIn', name: 'Cash in', colour: '#0ea5e9' },
            { key: 'cashOut', name: 'Cash out', colour: '#ef4444' },
          ],
          prefix: '₹',
          drillTo: '/finance/banking',
          drillLabel: 'Banking',
          financialOnly: true,
          reading:
            'A profitable month with cash out ahead of cash in is receivables stretching or stock building. Both show up here a month before they show up in the bank.',
        },
      ]}
      ranked={[
        {
          title: 'Standard cost per bottle by element',
          description: `Averaged across ${standardCostCards.length} cost cards — ₹${cardTotal.toFixed(2)} a bottle in total`,
          rows: elements
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((e) => ({
              label: e.element,
              sub: `${cardTotal ? ((e.value / cardTotal) * 100).toFixed(1) : '0.0'}% of standard cost`,
              value: e.value,
              status:
                e.element === 'Material' ? ('watch' as const) : ('good' as const),
            })),
          format: (n) => `₹${n.toFixed(2)}`,
          drillTo: '/finance/costing',
          drillLabel: 'Costing',
          financialOnly: true,
        },
      ]}
    />
  )
}
