import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Select } from '@/components/ui/Input'
import { formatQty, formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useMovement } from '@/hooks/useAnalysis'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { MovementRow } from '@/api/analysis'

/** Fast / slow / dead stock (SRS Vol 4 Ch 10) — classifies items by how recently
 *  they were consumed, from the ledger. Dead stock ties up cash and space. */
const CLASS_TONE: Record<string, 'success' | 'warning' | 'danger'> = { FAST: 'success', SLOW: 'warning', DEAD: 'danger' }

export function StockMovementPage() {
  const [warehouse, setWarehouse] = useState('')
  const warehouses = useWarehouses().data?.data ?? []
  const { data, isLoading, error } = useMovement(warehouse || undefined)
  const rows = data?.rows ?? []

  const columns: Column<MovementRow>[] = [
    { key: 'class', header: 'Class', width: '80px', render: (r) => <Badge tone={CLASS_TONE[r.movement_class] ?? 'neutral'} size="sm">{r.movement_class.toLowerCase()}</Badge> },
    { key: 'item', header: 'Item', sortable: true, sticky: true, width: '260px', accessor: (r) => r.item_code,
      render: (r) => <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{r.item_name}</p><p className="truncate font-mono text-2xs text-fg-subtle">{r.item_code}</p></div> },
    { key: 'on_hand', header: 'On hand', align: 'right', sortable: true, width: '120px', accessor: (r) => r.on_hand, render: (r) => <span className="tabular text-xs">{formatQty(r.on_hand)} <span className="text-2xs text-fg-subtle">{r.uom}</span></span> },
    { key: 'value', header: 'Value', align: 'right', sortable: true, width: '140px', accessor: (r) => r.value ?? 0, render: (r) => <span className="tabular text-xs">{r.value == null ? '—' : formatCurrency(r.value)}</span> },
    { key: 'last', header: 'Last issued', align: 'right', sortable: true, width: '130px', accessor: (r) => r.last_issue_days ?? 99999, render: (r) => <span className={r.last_issue_days == null || r.last_issue_days > 180 ? 'tabular text-2xs text-danger' : 'tabular text-2xs text-fg-muted'}>{r.last_issue_days == null ? 'never' : `${r.last_issue_days} d ago`}</span> },
    { key: 'issues', header: 'Issues', align: 'right', width: '90px', render: (r) => <span className="tabular text-2xs text-fg-muted">{r.issues}</span> },
  ]

  return (
    <div>
      <PageHeader title="Fast, slow & dead stock"
        description="Items classed by how recently they were consumed. Dead stock — no issues in a long time — is cash and space you can free up."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Movement analysis' }]} />
      {error && <Alert tone="danger" title="Could not load movement analysis">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      <Card className="mb-4"><CardBody className="flex flex-wrap items-center gap-3">
        <Select label="Warehouse" containerClassName="w-56" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
          options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
        {data && <div className="ml-auto flex gap-2 self-end pb-1">
          <Badge tone="success" size="sm">Fast: {data.counts.FAST}</Badge>
          <Badge tone="warning" size="sm">Slow: {data.counts.SLOW}</Badge>
          <Badge tone="danger" size="sm">Dead: {data.counts.DEAD}</Badge>
        </div>}
      </CardBody></Card>

      <DataTable
          density="comfortable" rows={rows} columns={columns} rowKey={(r) => r.item_code} loading={isLoading} searchPlaceholder="Item…" emptyTitle="No stock to classify" />
      <p className="mt-2 text-2xs text-fg-subtle">Fast ≤ 60 days since last issue · Slow 60–180 · Dead over 180 days or never issued.</p>
    </div>
  )
}
