import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { MesStatusBadge, OperationCell } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { shopFloorApi, type WipLotRow, type WipResult } from '@/api/shopfloor'

/**
 * Work in progress — what is sitting between operations right now.
 *
 * There is no WIP table. A work order that has been fed but not finished is
 * holding pieces, and how many it holds is what came into it less everything
 * booked out of it as good, scrap or rework. That subtraction is done on the
 * server so this screen and any report agree on the figure.
 *
 * Age is only shown for an operation that has actually started. An operation
 * that is queued has no clock to read, and a zero there would read as "just
 * arrived" when the truth is "nobody has touched it".
 */

const STATE_HELP: Record<string, string> = {
  READY: 'Sitting at the station, ready for the operator to start.',
  RUNNING: 'On a machine right now.',
  QUEUED: 'Waiting on the operation in front of it.',
  PAUSED: 'Started, then stopped. The pieces are still at the station.',
  HOLD: 'Held by a supervisor. Nothing moves until the hold is lifted.',
  QC_HOLD: 'Stopped by inspection — cannot move until quality decides.',
}

const EMPTY: WipResult = { lots: [], byWorkCentre: [], totals: { lots: 0, qty: 0 } }

export function WipPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState<WipResult>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    shopFloorApi
      .wip()
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

  const columns: Column<WipLotRow>[] = [
    { key: 'docNo', header: 'Work order', sortable: true, width: '11rem', render: (l) => (
      <div>
        <p className="font-mono text-2xs font-medium text-brand-600">{l.docNo}</p>
        <p className="font-mono text-2xs text-fg-subtle">{l.orderDocNo}</p>
      </div>
    ) },
    { key: 'productCode', header: 'Product', sortable: true, render: (l) => (
      <div>
        <p className="font-mono text-2xs text-fg">{l.productCode}</p>
        <p className="truncate text-2xs text-fg-subtle" title={l.productName}>{l.productName}</p>
      </div>
    ) },
    { key: 'operationName', header: 'Operation', width: '14rem', render: (l) => (
      <OperationCell sequence={l.seq} name={l.operationName} workCentre={l.workCentreCode} />
    ) },
    { key: 'machineCode', header: 'Machine', width: '8rem', sortable: true, render: (l) => <span className="font-mono text-2xs">{l.machineCode || '—'}</span> },
    { key: 'batchNo', header: 'Batch', width: '9rem', render: (l) => <span className="font-mono text-2xs">{l.batchNo || '—'}</span> },
    { key: 'inputQty', header: 'Came in', align: 'right', sortable: true, render: (l) => <span className="tabular">{formatQty(l.inputQty)}</span> },
    { key: 'heldQty', header: 'Held here', align: 'right', sortable: true, render: (l) => <span className="tabular font-medium text-fg">{formatQty(l.heldQty)}</span> },
    { key: 'producedQty', header: 'Booked good', align: 'right', defaultHidden: true, render: (l) => <span className="tabular text-success">{formatQty(l.producedQty)}</span> },
    { key: 'scrapQty', header: 'Booked scrap', align: 'right', defaultHidden: true, render: (l) => <span className="tabular text-danger">{formatQty(l.scrapQty)}</span> },
    { key: 'ageHours', header: 'Waiting', align: 'right', width: '7rem', sortable: true, accessor: (l) => l.ageHours ?? -1, render: (l) => (
      l.ageHours === null
        ? <span className="text-2xs text-fg-subtle">not started</span>
        : <span className={cn('tabular text-2xs', l.ageHours > 24 && 'text-warning')}>{l.ageHours} h</span>
    ) },
    { key: 'state', header: 'State', width: '8rem', sortable: true, render: (l) => <MesStatusBadge status={l.state} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'work-in-progress', 'Work in progress', columnsFromTable(columns), data.lots)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const states = [...new Set(data.lots.map((l) => l.state))]

  return (
    <div>
      <PageHeader
        title="Work in progress"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Work in progress' }]}
      />

      {error && (
        <Alert tone="danger" title="Work in progress could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

      <p className="mb-4 text-xs text-fg-muted">
        Derived from the work orders themselves, not from a separate register: what came into an operation less everything booked
        out of it is what it is still holding. <span className="font-medium text-fg tabular">{formatQty(data.totals.qty)}</span>{' '}
        across <span className="font-medium text-fg">{data.totals.lots}</span> lot{data.totals.lots === 1 ? '' : 's'}.
      </p>

      {data.byWorkCentre.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="By work centre" description="Where the floor is holding stock between operations" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Work centre</th>
                    <th className="w-24 text-right">Lots</th>
                    <th className="w-32 text-right">Quantity held</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byWorkCentre.map((w) => (
                    <tr
                      key={w.workCentreCode}
                      className="cursor-pointer"
                      onClick={() => navigate(`/production/queue`)}
                    >
                      <td className="font-mono text-2xs">{w.workCentreCode}</td>
                      <td className="text-right tabular">{w.lots}</td>
                      <td className="text-right tabular font-medium">{formatQty(w.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={data.lots}
        columns={columns}
        rowKey={(l) => l.uid}
        loading={loading}
        searchPlaceholder="Search work order, product, operation or batch…"
        onExport={doExport}
        emptyTitle="Nothing is in progress"
        emptyDescription="Every released operation has either finished or has not been fed yet, so no lot is waiting between stations."
      />

      {states.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="What each state means" />
          <CardBody className="grid gap-2 text-xs leading-relaxed text-fg-muted sm:grid-cols-2">
            {states.map((s) => (
              <p key={s}>
                <span className="font-medium text-fg">{s}</span> — {STATE_HELP[s] ?? 'Set by the server as the operation moves.'}
              </p>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
