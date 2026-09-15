import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatCurrency, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { shopFloorApi, type ScrapResult, type ScrapRow } from '@/api/shopfloor'

/**
 * Scrap — what was rejected, why, and what was decided about it.
 *
 * Every row is a scrap document the floor posted, either from a production
 * entry or against material. The value shown is the unit cost recorded on the
 * document at the time it was posted, not a figure recomputed now: a report
 * that re-costs a posted document would disagree with the ledger behind it.
 */

const DISPOSITION_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  REWORK: 'warning',
  SCRAP: 'danger',
  HOLD: 'neutral',
  DISPOSE: 'danger',
}

const EMPTY: ScrapResult = { records: [], totals: { documents: 0, qty: 0, value: 0 }, byReason: [] }

export function ScrapPage() {
  const toast = useToast()
  const [data, setData] = useState<ScrapResult>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [disposition, setDisposition] = useState('')

  async function load(filter: string) {
    setLoading(true)
    try {
      setData(await shopFloorApi.scrap(filter ? { disposition: filter } : undefined))
      setError(null)
    } catch (err) {
      setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.')
      setData(EMPTY)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(disposition)
  }, [disposition])

  const dispositions = useMemo(
    () => [...new Set(data.records.map((r) => r.disposition).filter(Boolean))].sort(),
    [data.records],
  )

  const columns: Column<ScrapRow>[] = [
    { key: 'docNo', header: 'Scrap note', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'businessDate', header: 'Date', sortable: true, width: '8.5rem', accessor: (r) => r.businessDate ?? '', render: (r) => (r.businessDate ? formatDate(r.businessDate) : '—') },
    { key: 'source', header: 'Raised by', width: '7rem', sortable: true, render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.source || '—'}</Badge> },
    { key: 'orderDocNo', header: 'Order', sortable: true, width: '11rem', render: (r) => (
      <div>
        <p className="font-mono text-2xs text-fg">{r.orderDocNo || '—'}</p>
        <p className="truncate text-2xs text-fg-subtle" title={r.operationName}>{r.operationName || 'material'}</p>
      </div>
    ) },
    { key: 'itemCode', header: 'Item', sortable: true, render: (r) => (
      <div>
        <p className="font-mono text-2xs text-fg">{r.itemCode}</p>
        <p className="truncate text-2xs text-fg-subtle" title={r.itemName}>{r.itemName}</p>
      </div>
    ) },
    { key: 'qty', header: 'Quantity', align: 'right', sortable: true, render: (r) => <span className="tabular font-medium text-danger">{formatQty(r.qty)}</span> },
    { key: 'value', header: 'Value', align: 'right', sortable: true, render: (r) => <span className="tabular">{formatCurrency(r.value)}</span> },
    { key: 'reason', header: 'Reason', render: (r) => (
      <span className="text-xs">{r.defectName || r.reason || r.defectCode || <span className="text-fg-subtle">not classified</span>}</span>
    ) },
    { key: 'disposition', header: 'Decision', width: '8rem', sortable: true, render: (r) => (
      r.disposition
        ? <Badge tone={DISPOSITION_TONE[r.disposition] ?? 'neutral'} size="sm">{r.disposition}</Badge>
        : <span className="text-2xs text-fg-subtle">undecided</span>
    ) },
    { key: 'status', header: 'Status', width: '7rem', sortable: true },
    { key: 'workCentreCode', header: 'Work centre', width: '7rem', defaultHidden: true },
    { key: 'batchNo', header: 'Batch', width: '9rem', defaultHidden: true, render: (r) => <span className="font-mono text-2xs">{r.batchNo || '—'}</span> },
    { key: 'inventoryDocNo', header: 'Inventory document', defaultHidden: true, render: (r) => <span className="font-mono text-2xs">{r.inventoryDocNo || '—'}</span> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'scrap-register', 'Scrap register', columnsFromTable(columns), data.records)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const unclassified = data.records.filter((r) => !r.defectName && !r.defectCode && !r.reason).length

  return (
    <div>
      <PageHeader
        title="Scrap"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Scrap' }]}
      />

      {error && (
        <Alert tone="danger" title="The scrap register could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Scrap notes</p>
            <p className="mt-1 text-xl font-semibold tabular text-fg">{data.totals.documents}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Quantity written off</p>
            <p className="mt-1 text-xl font-semibold tabular text-danger">{formatQty(data.totals.qty)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Value at recorded cost</p>
            <p className="mt-1 text-xl font-semibold tabular text-fg">{formatCurrency(data.totals.value)}</p>
          </CardBody>
        </Card>
      </div>

      {data.byReason.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="By reason" description="Largest first — where the losses actually come from" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Reason</th>
                    <th className="w-28 text-right">Notes</th>
                    <th className="w-32 text-right">Quantity</th>
                    <th className="w-32 text-right">Value</th>
                    <th className="w-24 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byReason.map((r) => (
                    <tr key={r.reason}>
                      <td className="text-xs">{r.reason}</td>
                      <td className="text-right tabular">{r.count}</td>
                      <td className="text-right tabular text-danger">{formatQty(r.qty)}</td>
                      <td className="text-right tabular">{formatCurrency(r.value)}</td>
                      <td className="text-right tabular text-2xs text-fg-muted">
                        {data.totals.qty > 0 ? `${((r.qty / data.totals.qty) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {unclassified > 0 && (
        <Alert tone="warning" title="Some scrap carries no reason" className="mb-4">
          {unclassified} of {data.totals.documents} scrap note{unclassified === 1 ? '' : 's'} {unclassified === 1 ? 'has' : 'have'} no
          defect code or reason recorded, so {unclassified === 1 ? 'it does' : 'they do'} not appear in the breakdown above. The
          reason has to be entered where the scrap is booked; it cannot be worked out afterwards.
        </Alert>
      )}

      <DataTable
        rows={data.records}
        columns={columns}
        rowKey={(r) => r.uid}
        loading={loading}
        searchPlaceholder="Search scrap note, order, item or reason…"
        onExport={doExport}
        toolbar={
          <Select
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
            options={[
              { value: '', label: 'Every decision' },
              ...dispositions.map((d) => ({ value: d, label: d })),
            ]}
          />
        }
        emptyTitle="No scrap recorded"
        emptyDescription="Scrap is written here when it is booked on a production entry, or raised directly against material."
      />
    </div>
  )
}
