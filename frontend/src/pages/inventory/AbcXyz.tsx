import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Select } from '@/components/ui/Input'
import { formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useAbcXyz } from '@/hooks/useAnalysis'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { AbcRow } from '@/api/analysis'

/** ABC / XYZ analysis (SRS Vol 4 Ch 10). ABC ranks items by value (Pareto);
 *  XYZ classes demand steadiness from consumption in the ledger. */
const ABC_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = { A: 'danger', B: 'warning', C: 'neutral' }

export function AbcXyzPage() {
  const [warehouse, setWarehouse] = useState('')
  const warehouses = useWarehouses().data?.data ?? []
  const { data, isLoading, error } = useAbcXyz(warehouse || undefined)
  const rows = data?.rows ?? []

  const columns: Column<AbcRow>[] = [
    { key: 'abc', header: 'ABC', width: '60px', render: (r) => <Badge tone={ABC_TONE[r.abc_class] ?? 'neutral'} size="sm">{r.abc_class}</Badge> },
    { key: 'xyz', header: 'XYZ', width: '60px', render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.xyz_class}</Badge> },
    { key: 'item', header: 'Item', sortable: true, sticky: true, width: '240px', accessor: (r) => r.item_code,
      render: (r) => <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{r.item_name}</p><p className="truncate font-mono text-2xs text-fg-subtle">{r.item_code}</p></div> },
    { key: 'value', header: 'Value', align: 'right', sortable: true, width: '140px', accessor: (r) => r.value ?? 0, render: (r) => <span className="tabular text-xs">{r.value == null ? '—' : formatCurrency(r.value)}</span> },
    { key: 'cum', header: 'Cumulative', align: 'right', width: '140px', render: (r) => (
      <span className="flex items-center justify-end gap-2">
        <span className="h-1 w-16 overflow-hidden rounded-full bg-surface-3"><span className="block h-full bg-brand-500" style={{ width: `${r.cumulative_pct}%` }} /></span>
        <span className="tabular text-2xs text-fg-muted">{r.cumulative_pct}%</span>
      </span>
    ) },
  ]

  return (
    <div>
      <PageHeader title="ABC / XYZ analysis"
        description="ABC ranks items by inventory value (Pareto: A ≈ top 80% of value); XYZ classes demand steadiness (X steady → Z erratic) from ledger consumption."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'ABC / XYZ' }]} />
      {error && <Alert tone="danger" title="Could not load ABC/XYZ">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      <Card className="mb-4"><CardBody className="flex flex-wrap items-center gap-3">
        <Select label="Warehouse" containerClassName="w-56" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
          options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
        {data && <div className="ml-auto flex gap-2 self-end pb-1">
          <Badge tone="danger" size="sm">A: {data.abc_counts.A}</Badge>
          <Badge tone="warning" size="sm">B: {data.abc_counts.B}</Badge>
          <Badge tone="neutral" size="sm">C: {data.abc_counts.C}</Badge>
        </div>}
      </CardBody></Card>

      <DataTable rows={rows} columns={columns} rowKey={(r) => r.item_code} loading={isLoading} searchPlaceholder="Item…" emptyTitle="No items to classify" />
      <p className="mt-2 text-2xs text-fg-subtle">XYZ needs consumption history — items with no issues yet show as Z. Post issues and it fills in.</p>
    </div>
  )
}
