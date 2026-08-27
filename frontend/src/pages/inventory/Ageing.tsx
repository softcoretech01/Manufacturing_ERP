import { useState } from 'react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Select } from '@/components/ui/Input'
import { formatQty, formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useAgeing } from '@/hooks/useAnalysis'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { AgeingRow } from '@/api/analysis'

/** Stock ageing (SRS Vol 4 Ch 9) — current on-hand distributed into age buckets by
 *  FIFO over the ledger. Old stock is the first thing a materials manager hunts. */
export function StockAgeingPage() {
  const [warehouse, setWarehouse] = useState('')
  const warehouses = useWarehouses().data?.data ?? []
  const { data, isLoading, error } = useAgeing(warehouse || undefined)
  const rows = data?.rows ?? []
  const labels = data?.labels ?? []

  const columns: Column<AgeingRow>[] = [
    { key: 'item', header: 'Item', sortable: true, sticky: true, width: '240px', accessor: (r) => r.item_code,
      render: (r) => <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{r.item_name}</p><p className="truncate font-mono text-2xs text-fg-subtle">{r.item_code} · {r.uom}</p></div> },
    ...labels.map((lbl, i) => ({
      key: `b${i}`, header: `${lbl} d`, align: 'right' as const, width: '100px',
      render: (r: AgeingRow) => { const q = r.buckets_qty[i]; return q ? <span className={i >= 3 ? 'tabular text-2xs font-medium text-danger' : 'tabular text-2xs'}>{formatQty(q)}</span> : <span className="text-2xs text-fg-subtle">—</span> },
    })),
    { key: 'oldest', header: 'Oldest', align: 'right', sortable: true, width: '100px', accessor: (r) => r.oldest_days, render: (r) => <span className={r.oldest_days > 90 ? 'tabular text-2xs font-medium text-danger' : 'tabular text-2xs text-fg-muted'}>{r.oldest_days} d</span> },
    { key: 'on_hand', header: 'On hand', align: 'right', width: '110px', render: (r) => <span className="tabular text-xs">{formatQty(r.on_hand)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Stock ageing"
        description="Current on-hand split into age buckets by FIFO over the ledger — the older the layer, the higher the write-off risk."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock ageing' }]} />
      {error && <Alert tone="danger" title="Could not load ageing">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      <Card className="mb-4"><CardBody className="flex flex-wrap items-center gap-3">
        <Select label="Warehouse" containerClassName="w-56" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
          options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
        {data?.total_value != null && <span className="ml-auto self-end pb-1 rounded bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600">Total {formatCurrency(data.total_value)}</span>}
      </CardBody></Card>

      <DataTable rows={rows} columns={columns} rowKey={(r) => r.item_code} loading={isLoading}
        searchPlaceholder="Item…" emptyTitle="No stock to age" />
      <p className="mt-2 text-2xs text-fg-subtle">Buckets are days since receipt of the on-hand layer (FIFO). Layers over 90 days are highlighted.</p>
    </div>
  )
}
