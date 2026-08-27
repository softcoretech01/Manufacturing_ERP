import { DomainAnalytics } from '@/components/bi/DomainAnalytics'
import { scrapPareto } from '@/mock/bi'
import { qualityTrend } from '@/mock/quality'

/**
 * Quality analytics — yield and defect rate over time, with the defect Pareto
 * underneath. PPM is plotted on its own axis because it moves in thousands while
 * yield moves in single percentage points; sharing an axis would flatten yield
 * into a straight line and hide the thing being measured.
 */
export function BiQualityPage() {
  const top = scrapPareto[0]
  const eighty = scrapPareto.findIndex((p) => p.cumulativePct >= 80)
  const vitalFew = eighty === -1 ? scrapPareto.length : eighty + 1
  const totalScrap = scrapPareto.reduce((s, p) => s + p.value, 0)

  return (
    <DomainAnalytics
      title="Quality analytics"
      breadcrumbLabel="Quality"
      kpiCodes={['QLT-FPY', 'QLT-PPM', 'QLT-CAPA', 'QLT-COMP', 'PRD-SCRAP']}
      filters={['period', 'plant', 'line', 'productFamily']}
      modules={['QUALITY', 'PRODUCTION']}
      sourceNote="First pass yield counts units that clear every operation first time, so it is always lower than the pass rate of any single inspection. Do not compare the two."
      charts={[
        {
          title: 'Yield against defect rate',
          description: 'First pass yield as bars, internal and supplier PPM on the right axis',
          data: qualityTrend as unknown as Record<string, string | number>[],
          xKey: 'month',
          bars: [{ key: 'fpyPct', name: 'First pass yield %', colour: '#10b981' }],
          lines: [
            { key: 'internalPpm', name: 'Internal PPM', colour: '#ef4444', yAxis: 'right' },
            { key: 'supplierPpm', name: 'Supplier PPM', colour: '#f59e0b', yAxis: 'right' },
          ],
          drillTo: '/quality',
          drillLabel: 'Quality module',
          reading:
            'Internal and supplier PPM rising together points at incoming material. Internal rising alone points at process, and the two need different corrective actions.',
        },
        {
          title: 'Defects by type',
          description: 'Pieces rejected by reason, ranked, with the cumulative share as a line',
          data: scrapPareto as unknown as Record<string, string | number>[],
          xKey: 'label',
          bars: [{ key: 'value', name: 'Pieces' }],
          colourBy: (_r, i) => (i < vitalFew ? (i === 0 ? '#ef4444' : '#f59e0b') : '#94a3b8'),
          lines: [{ key: 'cumulativePct', name: 'Cumulative %', colour: '#7c3aed', yAxis: 'right' }],
          rightAxisDomain: [0, 100],
          suffix: ' pcs',
          drillTo: '/production/scrap',
          drillLabel: 'Scrap register',
          reading: top
            ? `${vitalFew} of ${scrapPareto.length} defect types account for 80% of the loss, led by ${top.label.toLowerCase()}. Working the grey tail before the coloured head is the commonest waste of a quality team's week.`
            : 'No scrap recorded in the period.',
        },
      ]}
      ranked={[
        {
          title: 'Rejection reasons in full',
          description: 'Every reason with its share and running total — the tail is here so nothing is hidden',
          rows: scrapPareto.map((p) => ({
            label: p.label,
            sub: `${totalScrap ? ((p.value / totalScrap) * 100).toFixed(1) : '0.0'}% of scrap · ${p.cumulativePct.toFixed(1)}% cumulative`,
            value: p.value,
            status: p.cumulativePct <= 80 ? ('bad' as const) : ('good' as const),
          })),
          format: (n) => `${n.toLocaleString('en-IN')} pcs`,
          drillTo: '/quality/ncr',
          drillLabel: 'NCRs',
        },
      ]}
    />
  )
}
