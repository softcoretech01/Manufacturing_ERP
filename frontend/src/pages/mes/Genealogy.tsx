import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { formatDate, formatQty } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { productionApi, type WorkOrderRow } from '@/api/production'
import { shopFloorApi, type ProductionEntryRow } from '@/api/shopfloor'

/**
 * Genealogy — what can and cannot be traced today.
 *
 * A finished bottle should be traceable back through every operation to the
 * coil it was pressed from. Half of that chain exists: the traveller ties an
 * order to its operations, its entries, its machines and its operators, and the
 * stock ledger ties the material issue to the order.
 *
 * The other half does not. A batch number is free text typed onto a work order,
 * with no batch master behind it and no link from an issued component batch to
 * the output batch it went into. There are no serial numbers. So a batch can be
 * followed forward through one order, and no further.
 *
 * Nothing here builds a parent-child tree out of that. The batches that exist
 * are listed as they are, and the missing links are named.
 */

export function GenealogyPage() {
  const [work, setWork] = useState<WorkOrderRow[]>([])
  const [entries, setEntries] = useState<ProductionEntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([productionApi.getWorkOrders(), shopFloorApi.entries({ limit: 500 })])
      .then(([w, e]) => {
        setWork(w)
        setEntries(e)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'),
      )
      .finally(() => setLoading(false))
  }, [])

  /** Batch numbers that actually appear, with what is known about each. */
  const batches = (() => {
    const map = new Map<
      string,
      { orders: Set<string>; products: Set<string>; operations: number; good: number; scrap: number; machines: Set<string>; operators: Set<string>; first: string | null; last: string | null }
    >()
    for (const w of work) {
      if (!w.batchNo) continue
      const b = map.get(w.batchNo) ?? {
        orders: new Set<string>(), products: new Set<string>(), operations: 0, good: 0, scrap: 0,
        machines: new Set<string>(), operators: new Set<string>(), first: null, last: null,
      }
      b.orders.add(w.orderDocNo)
      b.products.add(w.productCode)
      b.operations += 1
      if (w.machineCode) b.machines.add(w.machineCode)
      if (w.operatorName) b.operators.add(w.operatorName)
      map.set(w.batchNo, b)
    }
    for (const e of entries) {
      if (!e.batchNo || e.isReversal) continue
      const b = map.get(e.batchNo)
      if (!b) continue
      b.good += e.goodQty
      b.scrap += e.scrapQty
      if (e.businessDate) {
        if (!b.first || e.businessDate < b.first) b.first = e.businessDate
        if (!b.last || e.businessDate > b.last) b.last = e.businessDate
      }
    }
    return [...map.entries()].map(([batchNo, b]) => ({
      batchNo,
      orders: [...b.orders],
      products: [...b.products],
      operations: b.operations,
      good: b.good,
      scrap: b.scrap,
      machines: [...b.machines],
      operators: [...b.operators],
      first: b.first,
      last: b.last,
    }))
  })()

  return (
    <div>
      <PageHeader
        title="Genealogy"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Genealogy' }]}
      />

      {error && (
        <Alert tone="danger" title="Batch data could not be read" className="mb-4">
          {error}
        </Alert>
      )}

      <Alert tone="warning" title="A batch can be traced through one order, and no further" className="mb-4">
        The batch number on a work order is free text with no batch master behind it, and nothing records which issued
        component batch went into which output batch. There are no serial numbers. So the chain from a finished bottle back to
        the coil it was pressed from cannot be followed, and no tree is drawn here to suggest otherwise.
      </Alert>

      <Card className="mb-4">
        <CardHeader
          title="Batches that exist"
          description="Every distinct batch number on a work order, with what is genuinely known about it"
        />
        <CardBody className="p-0">
          {loading ? (
            <p className="p-4 text-xs text-fg-muted">Loading…</p>
          ) : batches.length ? (
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-32">Batch</th>
                    <th className="w-36">Order</th>
                    <th className="w-36">Product</th>
                    <th className="w-20 text-right">Operations</th>
                    <th className="w-24 text-right">Good</th>
                    <th className="w-24 text-right">Scrap</th>
                    <th>Machines</th>
                    <th>Operators</th>
                    <th className="w-28">Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.batchNo}>
                      <td className="font-mono text-2xs font-medium text-brand-600">{b.batchNo}</td>
                      <td className="font-mono text-2xs">
                        {b.orders.map((o) => (
                          <Link key={o} to={`/production/traveller?order=${encodeURIComponent(o)}`} className="block hover:underline">
                            {o}
                          </Link>
                        ))}
                      </td>
                      <td className="font-mono text-2xs">{b.products.join(', ')}</td>
                      <td className="text-right tabular">{b.operations}</td>
                      <td className="text-right tabular text-success">{formatQty(b.good)}</td>
                      <td className="text-right tabular text-danger">{formatQty(b.scrap)}</td>
                      <td className="font-mono text-2xs">{b.machines.join(', ') || '—'}</td>
                      <td className="text-2xs">{b.operators.join(', ') || '—'}</td>
                      <td className="text-2xs text-fg-muted">
                        {b.first ? formatDate(b.first) : '—'}
                        {b.last && b.last !== b.first ? ` → ${formatDate(b.last)}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-xs text-fg-muted">
              No work order carries a batch number, so there is nothing to trace.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="What can be traced today" />
          <CardBody className="space-y-2 text-xs leading-relaxed text-fg-muted">
            <p>
              <span className="font-medium text-fg">Order to operations.</span> The traveller shows every operation an order
              went through, in sequence, with the quantity that passed between them.
            </p>
            <p>
              <span className="font-medium text-fg">Operation to person and machine.</span> Each production entry names the
              operator, the machine and the shift, and the entries sit under their operation on the traveller.
            </p>
            <p>
              <span className="font-medium text-fg">Order to material.</span> The material issue posts to the stock ledger
              under the order's document number, so what was consumed against an order is on the ledger.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What is missing" />
          <CardBody className="space-y-2 text-xs leading-relaxed text-fg-muted">
            <p>
              <span className="font-medium text-fg">A batch master.</span> The batch table exists but holds no rows, and work
              orders carry batch numbers that are not in it. Until a batch is a record, it cannot be linked to anything.
            </p>
            <p>
              <span className="font-medium text-fg">Batch on the issue.</span> The material issue draws from stock without
              naming which component batch it took, so the input batch of a lot is unknown even though the quantity is exact.
            </p>
            <p>
              <span className="font-medium text-fg">Serial numbers.</span> The item master has a serial-tracked flag and
              nothing implements it. A bottle cannot be traced individually.
            </p>
            <p>
              <span className="font-medium text-fg">The link itself.</span> A parent-child table saying which input batches
              went into which output batch is what makes a recall possible. It does not exist, and it cannot be reconstructed
              from what is stored.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
