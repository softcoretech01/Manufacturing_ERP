import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { formatDate, formatQty } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { shopFloorApi, type ProductionEntryRow } from '@/api/shopfloor'

/**
 * Downtime — which this system does not record.
 *
 * There is no downtime event anywhere in the schema: no reason code, no start
 * and end time, no machine the stoppage belonged to. The single trace of
 * downtime is a `down_minutes` number on each production entry, which says how
 * many minutes the operator lost during that booking and nothing at all about
 * why.
 *
 * So this page shows exactly that number and nothing more. It does not
 * distribute the minutes across invented reasons, and it does not draw a
 * Pareto chart of causes nobody recorded. Everything a downtime screen is
 * normally for needs a model that has to be built first, and that is set out
 * below rather than simulated.
 */

export function DowntimePage() {
  const [entries, setEntries] = useState<ProductionEntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    shopFloorApi
      .entries({ limit: 500 })
      .then((rows) => {
        setEntries(rows)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'),
      )
      .finally(() => setLoading(false))
  }, [])

  const withDowntime = entries.filter((e) => e.downMinutes > 0 && !e.isReversal)
  const totalDown = withDowntime.reduce((s, e) => s + e.downMinutes, 0)
  const totalRun = entries.filter((e) => !e.isReversal).reduce((s, e) => s + e.runMinutes + e.setupMinutes, 0)

  return (
    <div>
      <PageHeader
        title="Downtime"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Downtime' }]}
      />

      {error && (
        <Alert tone="danger" title="Production entries could not be read" className="mb-4">
          {error}
        </Alert>
      )}

      <Alert tone="warning" title="Downtime is not recorded as events in this system" className="mb-4">
        Nothing in the schema holds a stoppage: there is no reason code, no start and end time, and no machine the stoppage
        belonged to. The only trace is a total minutes-lost figure typed onto a production entry. Everything below comes from
        that one number, and nothing on this page is estimated to fill the gap.
      </Alert>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Minutes recorded as lost</p>
            <p className="mt-1 text-xl font-semibold tabular text-fg">{formatQty(totalDown)}</p>
            <p className="mt-0.5 text-2xs text-fg-muted">across {withDowntime.length} entr{withDowntime.length === 1 ? 'y' : 'ies'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Minutes recorded as run</p>
            <p className="mt-1 text-xl font-semibold tabular text-fg">{formatQty(totalRun)}</p>
            <p className="mt-0.5 text-2xs text-fg-muted">setup plus run, from the same entries</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Availability</p>
            <p className="mt-1 text-xl font-semibold tabular text-fg-subtle">—</p>
            <p className="mt-0.5 text-2xs text-fg-muted">needs planned time, which is not held</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Entries carrying lost minutes"
          description="The whole of the downtime data in this system"
          actions={<Link to="/production/entry" className="text-2xs font-medium text-brand-600 hover:underline">Register</Link>}
        />
        <CardBody className="p-0">
          {loading ? (
            <p className="p-4 text-xs text-fg-muted">Loading…</p>
          ) : withDowntime.length ? (
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-36">Entry</th>
                    <th className="w-28">Date</th>
                    <th>Operation</th>
                    <th className="w-28">Machine</th>
                    <th className="w-28 text-right">Lost minutes</th>
                    <th className="w-28 text-right">Run minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {withDowntime.map((e) => (
                    <tr key={e.uid}>
                      <td className="font-mono text-2xs text-brand-600">{e.docNo}</td>
                      <td className="text-2xs">{e.businessDate ? formatDate(e.businessDate) : '—'}</td>
                      <td className="text-xs">{e.seq} · {e.operationName}</td>
                      <td className="font-mono text-2xs">{e.machineCode || '—'}</td>
                      <td className="text-right tabular text-warning">{formatQty(e.downMinutes)}</td>
                      <td className="text-right tabular text-2xs">{formatQty(e.runMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-xs text-fg-muted">
              No production entry carries any lost minutes. That means nobody has entered a downtime figure, not that the line
              has never stopped.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What a downtime module would need"
          description="Set out so it can be built, rather than approximated on this screen"
        />
        <CardBody className="space-y-2 text-xs leading-relaxed text-fg-muted">
          <p>
            <span className="font-medium text-fg">A downtime event table.</span> One row per stoppage, holding the machine or
            work centre, the reason code, the start and end times, who reported it and who cleared it. Minutes lost then follow
            from the times rather than being typed.
          </p>
          <p>
            <span className="font-medium text-fg">A downtime reason master.</span> The reason-code master already exists and is
            almost empty. It needs planned and unplanned categories, so a tool change is not counted against the line the same
            way a breakdown is.
          </p>
          <p>
            <span className="font-medium text-fg">A planned production calendar.</span> Availability is running time over
            planned time. Without a calendar saying which hours the plant intended to run, the denominator does not exist, and
            neither does availability or the OEE built on it.
          </p>
          <p>
            <span className="font-medium text-fg">A link to maintenance.</span> A breakdown recorded here should raise the
            maintenance job, so the same stoppage is not entered twice in two modules with different durations.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
