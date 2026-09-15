import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { shopFloorApi, type EffectivenessResult } from '@/api/shopfloor'

/**
 * Overall equipment effectiveness — or as much of it as the data supports.
 *
 * OEE is availability times performance times quality. Two of those three can
 * be measured here from rows the floor posted, and one cannot: availability
 * needs running time over planned time, and this system records neither
 * reason-coded downtime nor a planned production calendar.
 *
 * So this page publishes quality and performance, and says plainly that
 * availability and therefore OEE are not available. It does not multiply the
 * two factors it has and call the result OEE — that would flatter the line by
 * exactly the amount of downtime nobody is recording.
 */

const EMPTY: EffectivenessResult = {
  from: null,
  workCentres: [],
  overall: {
    qualityPct: null,
    performancePct: null,
    availabilityPct: null,
    oeePct: null,
    goodQty: 0,
    runMinutes: 0,
    standardMinutes: 0,
  },
  cannotCompute: [],
}

export function OeePage() {
  const [data, setData] = useState<EffectivenessResult>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    shopFloorApi
      .effectiveness()
      .then((res) => {
        setData(res)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.')
        setData(EMPTY)
      })
      .finally(() => setLoading(false))
  }, [])

  /** Over 100% means the standard or the time capture is wrong, not that the line is fast. */
  const suspect = data.workCentres.filter((w) => (w.performancePct ?? 0) > 100)

  return (
    <div>
      <PageHeader
        title="Equipment effectiveness"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Effectiveness' }]}
      />

      {error && (
        <Alert tone="danger" title="Effectiveness could not be calculated" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && <p className="mb-4 text-xs text-fg-muted">Reading the entries…</p>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Factor label="Quality" value={data.overall.qualityPct} note="good over everything booked" />
        <Factor label="Performance" value={data.overall.performancePct} note="standard time over actual time" warn={(data.overall.performancePct ?? 0) > 100} />
        <Factor label="Availability" value={null} note="cannot be measured" />
        <Factor label="OEE" value={null} note="needs all three factors" />
      </div>

      {suspect.length > 0 && (
        <Alert tone="warning" title="Performance is reading above 100%" className="mb-4">
          {suspect.map((w) => `${w.workCentreCode} at ${w.performancePct}%`).join(', ')}. A line cannot beat its own standard
          by this margin. Either the routing standard is set far too high, or the minutes on the production entries are being
          under-recorded. The figure is shown as calculated rather than capped, because capping it would hide the problem.
        </Alert>
      )}

      <Card className="mb-4">
        <CardHeader
          title="By work centre"
          description="Every figure below is computed from the production entries, not stored"
          actions={<Link to="/production/entry" className="text-2xs font-medium text-brand-600 hover:underline">Entries</Link>}
        />
        <CardBody className="p-0">
          {data.workCentres.length ? (
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Work centre</th>
                    <th className="w-20 text-right">Entries</th>
                    <th className="w-28 text-right">Good</th>
                    <th className="w-24 text-right">Scrap</th>
                    <th className="w-28 text-right">Standard</th>
                    <th className="w-28 text-right">Actual</th>
                    <th className="w-24 text-right">Quality</th>
                    <th className="w-28 text-right">Performance</th>
                    <th className="w-28 text-right">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workCentres.map((w) => (
                    <tr key={w.workCentreCode}>
                      <td className="font-mono text-2xs">{w.workCentreCode}</td>
                      <td className="text-right tabular">{w.entries}</td>
                      <td className="text-right tabular text-success">{formatQty(w.goodQty)}</td>
                      <td className="text-right tabular text-danger">{formatQty(w.scrapQty)}</td>
                      <td className="text-right tabular text-2xs">{w.standardMinutes} min</td>
                      <td className="text-right tabular text-2xs">{w.runMinutes} min</td>
                      <td className={cn('text-right tabular', (w.qualityPct ?? 100) < 95 && 'text-warning')}>
                        {w.qualityPct === null ? '—' : `${w.qualityPct}%`}
                      </td>
                      <td className={cn('text-right tabular', (w.performancePct ?? 0) > 100 && 'text-warning')}>
                        {w.performancePct === null ? '—' : `${w.performancePct}%`}
                      </td>
                      <td className="text-right text-2xs text-fg-subtle">not measured</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-xs text-fg-muted">
              Nothing has been booked yet, so there is nothing to measure. Effectiveness is calculated from production entries.
            </p>
          )}
        </CardBody>
      </Card>

      {data.cannotCompute.length > 0 && (
        <Card>
          <CardHeader title="What is missing, and what it would take" />
          <CardBody className="space-y-3">
            {data.cannotCompute.map((c) => (
              <div key={c.factor} className="rounded border border-border bg-surface-2 px-3 py-2">
                <p className="text-xs font-medium text-fg">{c.factor}</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-fg-muted">{c.reason}</p>
                <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">Needs: {c.needs}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function Factor({
  label,
  value,
  note,
  warn = false,
}: {
  label: string
  value: number | null
  note: string
  warn?: boolean
}) {
  return (
    <Card>
      <CardBody>
        <p className="text-2xs uppercase tracking-wide text-fg-subtle">{label}</p>
        <p
          className={cn(
            'mt-1 text-xl font-semibold tabular',
            value === null ? 'text-fg-subtle' : warn ? 'text-warning' : 'text-fg',
          )}
        >
          {value === null ? '—' : `${value}%`}
        </p>
        <p className="mt-0.5 text-2xs text-fg-muted">{note}</p>
      </CardBody>
    </Card>
  )
}
