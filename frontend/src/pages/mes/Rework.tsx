import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { formatDate, formatQty } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { productionApi, type WorkOrderRow } from '@/api/production'
import { shopFloorApi, type ProductionEntryRow, type ScrapResult } from '@/api/shopfloor'

/**
 * Rework — a quantity, not yet a process.
 *
 * Pieces can be booked as rework: the work order and the production entry both
 * carry a rework quantity, and a scrap note can be dispositioned REWORK. Those
 * are real and are shown here.
 *
 * What does not exist is the rework itself. There is no rework order, no repair
 * routing, no inspection after repair, and nowhere for a repaired piece to
 * rejoin the route. So a piece booked as rework leaves the good count and then
 * stops — it is held out of output and nothing brings it back.
 *
 * That is a gap in the model, not in this screen, and inventing a routing-back
 * process here would hide it. The quantities at risk are listed instead.
 */

export function ReworkPage() {
  const [entries, setEntries] = useState<ProductionEntryRow[]>([])
  const [work, setWork] = useState<WorkOrderRow[]>([])
  const [scrap, setScrap] = useState<ScrapResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      shopFloorApi.entries({ limit: 500 }),
      productionApi.getWorkOrders(),
      shopFloorApi.scrap({ disposition: 'REWORK' }),
    ])
      .then(([e, w, s]) => {
        setEntries(e)
        setWork(w)
        setScrap(s)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'),
      )
      .finally(() => setLoading(false))
  }, [])

  const bookedRework = entries.filter((e) => e.reworkQty > 0 && !e.isReversal)
  const heldOnOrders = work.filter((w) => w.reworkQty > 0)
  const totalBooked = bookedRework.reduce((s, e) => s + e.reworkQty, 0)
  const totalHeld = heldOnOrders.reduce((s, w) => s + w.reworkQty, 0)
  const dispositioned = scrap?.records ?? []

  const nothing = !bookedRework.length && !heldOnOrders.length && !dispositioned.length

  return (
    <div>
      <PageHeader
        title="Rework"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Rework' }]}
      />

      {error && (
        <Alert tone="danger" title="Rework could not be read" className="mb-4">
          {error}
        </Alert>
      )}

      <Alert tone="warning" title="Rework is recorded as a quantity, but there is no rework process" className="mb-4">
        A piece can be booked as rework and a scrap note can be marked for rework. Nothing then happens to it. There is no
        rework order, no repair routing, no inspection after repair and no way for a repaired piece to rejoin the route — so
        the quantity leaves good output and stays out. The figures below are what is currently in that state.
      </Alert>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Booked as rework</p>
            <p className="mt-1 text-xl font-semibold tabular text-warning">{formatQty(totalBooked)}</p>
            <p className="mt-0.5 text-2xs text-fg-muted">on {bookedRework.length} production entr{bookedRework.length === 1 ? 'y' : 'ies'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Held on work orders</p>
            <p className="mt-1 text-xl font-semibold tabular text-warning">{formatQty(totalHeld)}</p>
            <p className="mt-0.5 text-2xs text-fg-muted">across {heldOnOrders.length} operation{heldOnOrders.length === 1 ? '' : 's'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Scrap notes marked for rework</p>
            <p className="mt-1 text-xl font-semibold tabular text-fg">{dispositioned.length}</p>
            <p className="mt-0.5 text-2xs text-fg-muted">{formatQty(dispositioned.reduce((s, r) => s + r.qty, 0))} pieces</p>
          </CardBody>
        </Card>
      </div>

      {loading && <p className="mb-4 text-xs text-fg-muted">Loading…</p>}

      {nothing && !loading && (
        <Alert tone="info" title="Nothing is currently in rework">
          No entry, work order or scrap note carries a rework quantity.
        </Alert>
      )}

      {dispositioned.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Scrap notes sent to rework"
            description="Decided for rework, with nowhere for the repair to be recorded"
            actions={<Link to="/production/scrap" className="text-2xs font-medium text-brand-600 hover:underline">Scrap</Link>}
          />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-32">Scrap note</th>
                    <th className="w-28">Date</th>
                    <th>Item</th>
                    <th>Operation</th>
                    <th className="w-24 text-right">Quantity</th>
                    <th className="w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dispositioned.map((r) => (
                    <tr key={r.uid}>
                      <td className="font-mono text-2xs text-brand-600">{r.docNo}</td>
                      <td className="text-2xs">{r.businessDate ? formatDate(r.businessDate) : '—'}</td>
                      <td className="font-mono text-2xs">{r.itemCode}</td>
                      <td className="text-xs">{r.operationName || '—'}</td>
                      <td className="text-right tabular text-warning">{formatQty(r.qty)}</td>
                      <td><Badge tone="neutral" size="sm">{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {heldOnOrders.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Operations holding rework quantity" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-36">Work order</th>
                    <th>Operation</th>
                    <th className="w-24">Work centre</th>
                    <th className="w-24 text-right">Good</th>
                    <th className="w-24 text-right">Rework</th>
                    <th className="w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {heldOnOrders.map((w) => (
                    <tr key={w.uid}>
                      <td className="font-mono text-2xs text-brand-600">{w.docNo}</td>
                      <td className="text-xs">{w.seq} · {w.operationName}</td>
                      <td className="font-mono text-2xs">{w.workCentreCode}</td>
                      <td className="text-right tabular text-success">{formatQty(w.producedQty)}</td>
                      <td className="text-right tabular text-warning">{formatQty(w.reworkQty)}</td>
                      <td className="text-2xs">{w.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="What a rework module would need"
          description="Written down so the decisions get made by someone who runs the plant"
        />
        <CardBody className="space-y-2 text-xs leading-relaxed text-fg-muted">
          <p>
            <span className="font-medium text-fg">A rework order.</span> Its own document, raised from the scrap note or the
            entry, carrying the quantity, the defect, the operation it came off and the decision to repair.
          </p>
          <p>
            <span className="font-medium text-fg">A repair routing.</span> Which operations a repair actually goes through —
            usually not the full route, and sometimes an operation that exists for nothing else.
          </p>
          <p>
            <span className="font-medium text-fg">A re-entry rule.</span> Where a repaired piece rejoins: back into the
            operation it failed at, forward to the next one, or into a separate lot that is tracked apart. This is a plant
            decision and cannot be guessed from the schema.
          </p>
          <p>
            <span className="font-medium text-fg">Inspection after repair.</span> A repaired piece should be re-inspected
            before it counts as good, otherwise rework becomes a way of turning scrap into output on paper.
          </p>
          <p>
            <span className="font-medium text-fg">Cost treatment.</span> Whether the repair labour and material land on the
            original order, on a variance account, or on the work centre that caused the defect.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
