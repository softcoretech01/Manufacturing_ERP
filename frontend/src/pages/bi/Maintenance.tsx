import { DomainAnalytics } from '@/components/bi/DomainAnalytics'
import { failureRisks, maintenanceTrend } from '@/mock/bi'
import { utilityLogs } from '@/mock/maintenance'
import { formatCompact } from '@/lib/format'

/**
 * Maintenance analytics — reliability against preventive compliance, which is
 * the relationship that matters here: PM compliance and downtime move together
 * with roughly a month's lag, so a schedule missed today is a breakdown next
 * month. The asset risk list turns that into a work list.
 */
export function BiMaintenancePage() {
  /** Utility logs are one row per asset per day; roll them up to energy by asset. */
  const byAsset = new Map<string, { label: string; kwh: number; hours: number; downtime: number }>()
  for (const log of utilityLogs) {
    const entry = byAsset.get(log.assetCode) ?? {
      label: log.assetName,
      kwh: 0,
      hours: 0,
      downtime: 0,
    }
    entry.kwh += log.energyKwh
    entry.hours += log.runningHours
    entry.downtime += log.downtimeMinutes
    byAsset.set(log.assetCode, entry)
  }
  const utilities = [...byAsset.values()]
    .sort((a, b) => b.kwh - a.kwh)
    .slice(0, 8)
    .map((u) => ({
      asset: u.label.length > 22 ? `${u.label.slice(0, 20)}…` : u.label,
      kwh: Math.round(u.kwh),
    }))

  const urgent = failureRisks.filter((f) => f.status === 'URGENT')
  const exposure = urgent.reduce((s, f) => s + f.estimatedImpact, 0)

  return (
    <DomainAnalytics
      title="Maintenance analytics"
      breadcrumbLabel="Maintenance"
      kpiCodes={['MNT-MTBF', 'MNT-MTTR', 'MNT-PM', 'PRD-DT']}
      filters={['period', 'plant', 'line']}
      modules={['MAINTENANCE', 'PRODUCTION']}
      sourceNote="Failure probability is modelled from run hours past the service interval and recent breakdown history. It is a prompt to schedule work, not a prediction of a date."
      charts={[
        {
          title: 'Reliability against preventive compliance',
          description: 'Downtime hours as bars; MTBF, MTTR and PM compliance as lines',
          data: maintenanceTrend as unknown as Record<string, string | number>[],
          xKey: 'month',
          bars: [{ key: 'downtimeHours', name: 'Downtime (h)', colour: '#ef4444' }],
          lines: [
            { key: 'mtbfHours', name: 'MTBF (h)', colour: '#10b981' },
            { key: 'pmCompliancePct', name: 'PM compliance %', colour: '#7c3aed', yAxis: 'right' },
            { key: 'mttrHours', name: 'MTTR (h)', colour: '#f59e0b', yAxis: 'right' },
          ],
          rightAxisDomain: [0, 100],
          drillTo: '/maintenance',
          drillLabel: 'Maintenance',
          reading:
            'Follow the PM compliance line and the downtime bars a month later — the dip in April shows up as the spike that follows. That lag is why compliance is worth watching as a leading indicator.',
        },
        {
          title: 'Energy by asset',
          description: 'Electrical units consumed over the logged period, heaviest first',
          data: utilities as unknown as Record<string, string | number>[],
          xKey: 'asset',
          bars: [{ key: 'kwh', name: 'kWh', colour: '#0ea5e9' }],
          suffix: ' kWh',
          drillTo: '/maintenance',
          drillLabel: 'Utilities',
          reading:
            'A compressor drawing more units with output flat is almost always a leak, and compressed-air leaks are the cheapest energy saving a plant has.',
        },
      ]}
      ranked={[
        {
          title: 'Assets most likely to fail',
          description:
            urgent.length > 0
              ? `${urgent.length} need work now — ${formatCompact(exposure)} of output at risk if they stop`
              : 'Modelled from hours past the service interval and breakdown history',
          rows: failureRisks
            .slice()
            .sort((a, b) => b.failureProbabilityPct - a.failureProbabilityPct)
            .map((f) => ({
              label: `${f.machineCode} — ${f.machineName}`,
              sub: `${f.criticality.toLowerCase()} criticality · ${f.runHoursSinceService.toLocaleString('en-IN')} h since service against a ${f.serviceIntervalHours.toLocaleString('en-IN')} h interval · ${f.breakdownsLast90Days} breakdowns in 90 days · ${f.recommendation}`,
              value: f.failureProbabilityPct,
              status:
                f.status === 'URGENT' ? ('bad' as const) : f.status === 'SCHEDULE_PM' ? ('watch' as const) : ('good' as const),
            })),
          format: (n) => `${n.toFixed(0)}%`,
          drillTo: '/bi/forecasts',
          drillLabel: 'Forecasts',
        },
      ]}
    />
  )
}
