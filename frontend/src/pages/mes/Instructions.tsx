import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { ProblemError } from '@/api/client'
import { productionApi, type WorkOrderRow } from '@/api/production'

/**
 * Work instructions — which this system does not hold.
 *
 * An operator at a station should be able to open the method sheet for the
 * operation in front of them: the standard, the tooling, the quality checks,
 * the photographs, the revision it is at. None of that is stored anywhere.
 * There is no document table, no attachment table and no instruction model, so
 * there is nothing to display and nothing to version.
 *
 * What does exist is the operation itself: its code, its work centre, its
 * standard times, its tooling and whether it is a quality checkpoint. Those are
 * listed here, because they are the skeleton a real instruction would hang on,
 * and because they are true.
 */

export function InstructionsPage() {
  const [work, setWork] = useState<WorkOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    productionApi
      .getWorkOrders()
      .then((rows) => {
        setWork(rows)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'),
      )
      .finally(() => setLoading(false))
  }, [])

  /** One row per distinct operation, not per work order. */
  const operations = (() => {
    const map = new Map<string, WorkOrderRow>()
    for (const w of work) if (!map.has(w.operationCode)) map.set(w.operationCode, w)
    return [...map.values()].sort((a, b) => a.seq - b.seq)
  })()

  return (
    <div>
      <PageHeader
        title="Work instructions"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Work instructions' }]}
      />

      <Alert tone="warning" title="No work instruction is stored in this system" className="mb-4">
        There is no document table, no attachment table and no instruction model anywhere in the schema, so there is nothing
        to open at a station and nothing to version. This page does not show sample method sheets; it shows what the routing
        actually knows about each operation, which is all that exists today.
      </Alert>

      {error && (
        <Alert tone="danger" title="Operations could not be read" className="mb-4">
          {error}
        </Alert>
      )}

      <Card className="mb-4">
        <CardHeader
          title="Operations on the floor"
          description="From the routing, through the released work orders"
          actions={<Link to="/engineering/routing" className="text-2xs font-medium text-brand-600 hover:underline">Routings</Link>}
        />
        <CardBody className="p-0">
          {loading ? (
            <p className="p-4 text-xs text-fg-muted">Loading…</p>
          ) : operations.length ? (
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-24">Code</th>
                    <th>Operation</th>
                    <th className="w-24">Work centre</th>
                    <th className="w-24">Tooling</th>
                    <th className="w-28">Skill</th>
                    <th className="w-20 text-right">Operators</th>
                    <th className="w-28 text-right">Setup</th>
                    <th className="w-28 text-right">Run</th>
                    <th className="w-28">Quality gate</th>
                    <th className="w-32">Instruction</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.map((o) => (
                    <tr key={o.operationCode}>
                      <td className="font-mono text-2xs font-medium text-brand-600">{o.operationCode}</td>
                      <td className="text-xs">{o.operationName}</td>
                      <td className="font-mono text-2xs">{o.workCentreCode}</td>
                      <td className="font-mono text-2xs">{o.toolCode || '—'}</td>
                      <td className="text-2xs">{o.skill || '—'}</td>
                      <td className="text-right tabular">{o.operators}</td>
                      <td className="text-right tabular text-2xs">{o.setupMinutesStd} min</td>
                      <td className="text-right tabular text-2xs">{o.runMinutesStd} min</td>
                      <td className="text-2xs">{o.qcCheckpoint ? 'inspection point' : '—'}</td>
                      <td className="text-2xs text-fg-subtle">none held</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-xs text-fg-muted">
              No order has been released, so no operation is on the floor to describe.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What a work-instruction module would need"
          description="So it can be built rather than mocked up"
        />
        <CardBody className="space-y-2 text-xs leading-relaxed text-fg-muted">
          <p>
            <span className="font-medium text-fg">A document store.</span> Files with a content type, a size and somewhere to
            put them. The rest of the ERP has the same gap: there is no attachment table at all, so nothing anywhere can carry
            a drawing or a photograph.
          </p>
          <p>
            <span className="font-medium text-fg">Instructions attached to the operation, not the order.</span> The method for
            deep drawing does not change because a different order is running, so an instruction belongs to the routing
            operation and is inherited by every work order that uses it.
          </p>
          <p>
            <span className="font-medium text-fg">Revisions with an effective date.</span> An instruction that changes must
            not silently change what an in-flight order was made to. Routings already work this way, and instructions should
            follow the same revision model rather than invent a second one.
          </p>
          <p>
            <span className="font-medium text-fg">Acknowledgement.</span> On a controlled process, an operator confirms they
            have read the current revision before starting. That needs a row per operator per revision, which is also where
            training records would hang.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
