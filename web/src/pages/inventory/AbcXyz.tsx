import { useMemo } from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ClassChip, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency } from '@/lib/format'
import { cn } from '@/lib/cn'
import { stockPositions } from '@/mock/inventory'
import type { StockPosition } from '@/types/inventory'

/** Annual consumption value — the number ABC actually ranks on. */
const annualValue = (p: StockPosition) => p.avgDailyDemand * 300 * p.rate

const POLICY: Record<string, string> = {
  AX: 'Continuous review · tight buffer · count monthly · 98% service level',
  AY: 'Continuous review · seasonal buffer · count monthly · 98% service level',
  AZ: 'Review every order · large buffer or make-to-order · count monthly',
  BX: 'Periodic review · standard buffer · count quarterly · 95% service level',
  BY: 'Periodic review · seasonal buffer · count quarterly · 95% service level',
  BZ: 'Min/max · generous buffer · count quarterly',
  CX: 'Simple min/max · order in bulk · count half-yearly · 90% service level',
  CY: 'Simple min/max · order in bulk · count half-yearly',
  CZ: 'Simple min/max · order on demand · count half-yearly',
}

export function AbcXyzPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()

  const ranked = useMemo(() => [...stockPositions].sort((a, b) => annualValue(b) - annualValue(a)), [])
  const grandTotal = ranked.reduce((s, p) => s + annualValue(p), 0)

  const classTotals = ['A', 'B', 'C'].map((c) => {
    const items = ranked.filter((p) => p.abcClass === c)
    const value = items.reduce((s, p) => s + annualValue(p), 0)
    return { klass: c, items: items.length, value, share: grandTotal ? (value / grandTotal) * 100 : 0 }
  })

  const matrix = ['A', 'B', 'C'].map((abc) => ({
    abc,
    cells: ['X', 'Y', 'Z'].map((xyz) => ({ xyz, items: ranked.filter((p) => p.abcClass === abc && p.xyzClass === xyz) })),
  }))

  const columns: Column<StockPosition>[] = [
    { key: 'rank', header: '#', width: '3.5rem', accessor: (p) => ranked.indexOf(p) + 1, render: (p) => <span className="tabular text-2xs text-fg-subtle">{ranked.indexOf(p) + 1}</span> },
    { key: 'abcClass', header: 'Class', width: '6.5rem', accessor: (p) => `${p.abcClass}/${p.xyzClass}`, render: (p) => <ClassChip abc={p.abcClass} xyz={p.xyzClass} /> },
    { key: 'itemCode', header: 'Item', sortable: true, render: (p) => <ItemCell code={p.itemCode} name={p.itemName} /> },
    { key: 'onHand', header: 'On hand', align: 'right', sortable: true, render: (p) => <QtyCell qty={p.onHand} uom={p.uom} /> },
    { key: 'avgDailyDemand', header: 'Daily use', align: 'right', sortable: true, render: (p) => <QtyCell qty={p.avgDailyDemand} tone="muted" /> },
    ...(canSeeValue
      ? [
          { key: 'annual', header: 'Annual consumption', align: 'right' as const, sortable: true, accessor: annualValue, render: (p: StockPosition) => formatCurrency(annualValue(p)) },
          { key: 'share', header: 'Share', align: 'right' as const, accessor: (p: StockPosition) => (annualValue(p) / grandTotal) * 100, render: (p: StockPosition) => <span className="tabular text-2xs">{((annualValue(p) / grandTotal) * 100).toFixed(1)}%</span> },
        ]
      : []),
    { key: 'policy', header: 'Stocking policy', render: (p) => <span className="text-2xs text-fg-muted">{POLICY[`${p.abcClass}${p.xyzClass}`]}</span> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'abc-xyz', 'ABC / XYZ classification', columnsFromTable(columns), ranked)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="ABC / XYZ analysis"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'ABC / XYZ' }]}
      />

      <p className="mb-4 text-xs leading-relaxed text-fg-muted">
        <span className="font-medium text-fg">ABC</span> ranks items by how much money flows through them in a year —
        A ≈ 70% of consumption value, B ≈ 20%, C ≈ 10%. <span className="font-medium text-fg">XYZ</span> ranks how predictable
        that demand is — X steady, Y seasonal, Z erratic. Together they decide how often you count an item, how much buffer it
        deserves and how closely you watch it.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {classTotals.map((c) => (
          <Card key={c.klass}>
            <CardBody className="py-3">
              <div className="flex items-center justify-between gap-2">
                <ClassChip abc={c.klass} />
                <span className="text-2xs text-fg-muted">{c.items} item{c.items === 1 ? '' : 's'}</span>
              </div>
              <p className="mt-2 text-xl font-semibold tabular text-fg">
                {canSeeValue ? `₹${formatCompact(c.value)}` : `${c.items}`}
              </p>
              <p className="mt-0.5 text-2xs text-fg-muted">
                {canSeeValue ? `${c.share.toFixed(1)}% of annual consumption value` : 'items in this class'} ·{' '}
                {c.klass === 'A' ? 'count monthly' : c.klass === 'B' ? 'count quarterly' : 'count half-yearly'}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <CardHeader title="Policy grid" description="Where each item sits, and the policy that follows from it" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="w-32">Value class</th>
                  <th>X — steady demand</th>
                  <th>Y — seasonal</th>
                  <th>Z — erratic</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.abc}>
                    <td className="align-top">
                      <ClassChip abc={row.abc} />
                      <p className="mt-1 text-2xs text-fg-subtle">
                        {row.abc === 'A' ? 'High value — watch closely' : row.abc === 'B' ? 'Medium value' : 'Low value — keep it simple'}
                      </p>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.xyz} className="align-top">
                        {cell.items.length === 0 ? (
                          <span className="text-2xs text-fg-subtle">—</span>
                        ) : (
                          <>
                            {cell.items.map((i) => (
                              <p key={i.uid} className="truncate text-2xs text-fg">
                                <span className="font-mono text-fg-subtle">{i.itemCode}</span> {i.itemName}
                              </p>
                            ))}
                            <p className="mt-1 text-2xs italic text-fg-subtle">{POLICY[`${row.abc}${cell.xyz}`]}</p>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <DataTable
        rows={ranked}
        columns={columns}
        rowKey={(p) => p.uid}
        searchPlaceholder="Search item or class…"
        onExport={doExport}
        emptyTitle="No items"
        rowClassName={(p) => cn(p.abcClass === 'A' && 'bg-brand-500/[0.03]')}
      />
    </div>
  )
}
