import { DomainAnalytics } from '@/components/bi/DomainAnalytics'
import { ageingRows, nonMoving, valueTrend } from '@/mock/inventory'
import { formatCompact } from '@/lib/format'

/**
 * Inventory analytics — value by category over time, and the ageing profile that
 * decides how much of it will need providing for. Stock value rising faster than
 * output is working capital going the wrong way, and that is the one thing this
 * screen exists to make obvious.
 */

/** The ageing table is one row per material group with a column per bucket; the
 *  chart wants the transpose, so sum each bucket down the groups. */
const BUCKETS: { key: keyof (typeof ageingRows)[number]; label: string }[] = [
  { key: 'b0_30', label: '0–30 days' },
  { key: 'b31_60', label: '31–60' },
  { key: 'b61_90', label: '61–90' },
  { key: 'b91_180', label: '91–180' },
  { key: 'b181_365', label: '181–365' },
  { key: 'b365plus', label: 'Over a year' },
]

export function BiInventoryPage() {
  const ageing = BUCKETS.map((b) => ({
    bucket: b.label,
    value: ageingRows.reduce((sum, r) => sum + (Number(r[b.key]) || 0), 0),
  }))
  const provision = ageingRows.reduce((sum, r) => sum + r.provision, 0)
  const stale = ageing.slice(3).reduce((sum, b) => sum + b.value, 0)

  return (
    <DomainAnalytics
      title="Inventory analytics"
      breadcrumbLabel="Inventory"
      kpiCodes={['SCM-INV', 'SCM-SLOW', 'SCM-ACC', 'SCM-SHORT']}
      filters={['period', 'plant']}
      modules={['INVENTORY', 'PROCUREMENT']}
      sourceNote={`Value is on-hand quantity at the current valuation rate — the same basis the stock valuation screen reports. ${formatCompact(provision)} is already provided against ageing stock.`}
      charts={[
        {
          title: 'Stock value by class',
          description: 'Raw material, work in progress and finished goods, in ₹ lakh',
          data: valueTrend as unknown as Record<string, string | number>[],
          xKey: 'month',
          bars: [
            { key: 'rawMaterial', name: 'Raw material', colour: '#f59e0b' },
            { key: 'wip', name: 'WIP', colour: '#0ea5e9' },
            { key: 'finishedGoods', name: 'Finished goods', colour: '#10b981' },
            { key: 'other', name: 'Other', colour: '#94a3b8' },
          ],
          suffix: ' L',
          drillTo: '/inventory/valuation',
          drillLabel: 'Valuation',
          financialOnly: true,
          reading:
            'Work in progress climbing while finished goods stays flat means the constraint has moved upstream — worth checking which operation is holding material.',
        },
        {
          title: 'Ageing profile',
          description: 'Stock value by age bucket — the right-hand bars are what attracts a provision',
          data: ageing as unknown as Record<string, string | number>[],
          xKey: 'bucket',
          bars: [{ key: 'value', name: 'Value' }],
          colourBy: (_row, i) => ['#10b981', '#22c55e', '#0ea5e9', '#f59e0b', '#ef4444', '#b91c1c'][Math.min(i, 5)],
          prefix: '₹',
          drillTo: '/inventory/ageing',
          drillLabel: 'Stock ageing',
          financialOnly: true,
          reading: `${formatCompact(stale)} sits past ninety days. Anything past a year is provided for in full, so the last bar is a cost already incurred and not yet taken.`,
        },
      ]}
      ranked={[
        {
          title: 'Stock that has stopped moving',
          description: 'Idle items with the reason and the recommended action, worst first',
          rows: nonMoving
            .slice()
            .sort((a, b) => b.value - a.value)
            .slice(0, 8)
            .map((n) => ({
              label: `${n.itemCode} — ${n.itemName}`,
              sub: `${n.daysIdle} days idle · ${n.provisionPct}% provided · ${n.reason} · ${n.recommendation}`,
              value: n.value,
              status: n.provisionPct >= 100 ? ('bad' as const) : n.daysIdle > 180 ? ('watch' as const) : ('good' as const),
            })),
          format: (n) => formatCompact(n),
          drillTo: '/inventory/ageing',
          drillLabel: 'Non-moving',
          financialOnly: true,
        },
      ]}
    />
  )
}
