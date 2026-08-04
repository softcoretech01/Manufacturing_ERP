import { DomainAnalytics } from '@/components/bi/DomainAnalytics'
import { priceTrend, spendTrend, supplierSpend } from '@/mock/bi'
import { formatCompact } from '@/lib/format'

/**
 * Procurement analytics — spend against budget, the coil price series that drives
 * material cost, and where the spend concentrates. The price chart matters most:
 * a standard cost card that has not followed the market makes every purchase look
 * like a buying failure when it is really a costing lag.
 */
export function BiProcurementPage() {
  const bySupplier = supplierSpend
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  return (
    <DomainAnalytics
      title="Procurement analytics"
      breadcrumbLabel="Procurement"
      kpiCodes={['SCM-OTIF', 'SCM-PRICE', 'SCM-SHORT', 'SCM-INV']}
      filters={['period', 'plant']}
      modules={['PROCUREMENT', 'INVENTORY']}
      sourceNote="Price movement is the weighted rate actually paid on purchase orders, not a published index — so it reflects what this plant negotiated."
      charts={[
        {
          title: 'Spend against budget',
          description: 'Monthly purchase value with the budget line behind it',
          data: spendTrend as unknown as Record<string, string | number>[],
          xKey: 'month',
          bars: [{ key: 'spend', name: 'Spend', colour: '#f59e0b' }],
          lines: [{ key: 'budget', name: 'Budget', colour: '#64748b' }],
          prefix: '₹',
          drillTo: '/procurement/analytics',
          drillLabel: 'Procurement',
          financialOnly: true,
          reading:
            'Spend above budget two months running is usually volume rather than price. Check the price chart beside this before opening a renegotiation.',
        },
        {
          title: 'Raw material price movement',
          description: 'Rate per kg for the two stainless grades, per piece for lids',
          data: priceTrend as unknown as Record<string, string | number>[],
          xKey: 'month',
          lines: [
            { key: 'ss304', name: 'SS 304 (₹/kg)', colour: '#7c3aed' },
            { key: 'ss316', name: 'SS 316 (₹/kg)', colour: '#0ea5e9' },
            { key: 'lid', name: 'Lid (₹/pc)', colour: '#10b981' },
          ],
          prefix: '₹',
          drillTo: '/procurement/analytics',
          drillLabel: 'Price history',
          financialOnly: true,
          reading:
            'SS 304 is the grade the bottle body uses, so its line is the one that moves cost per bottle. Roughly ₹1.60 of bottle cost for every ₹10/kg on the coil.',
        },
      ]}
      ranked={[
        {
          title: 'Spend by supplier',
          description: 'Where the purchase value goes — concentration is a lever on price and a risk on supply',
          rows: bySupplier.map((s) => ({
            label: s.supplierName,
            sub: `${s.sharePct.toFixed(1)}% of spend · ${s.onTimePct.toFixed(1)}% on time · ${s.rejectionPct.toFixed(1)}% rejected · grade ${s.grade}`,
            value: s.value,
            status: s.onTimePct < 80 ? ('bad' as const) : s.onTimePct < 92 ? ('watch' as const) : ('good' as const),
          })),
          format: (n) => formatCompact(n),
          drillTo: '/procurement/evaluation',
          drillLabel: 'Supplier evaluation',
          financialOnly: true,
        },
      ]}
    />
  )
}
