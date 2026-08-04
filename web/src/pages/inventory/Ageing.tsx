import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, INV_CHART_COLOURS, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ageingRows, stockBalances } from '@/mock/inventory'
import type { AgeingRow, StockBalance } from '@/types/inventory'

const BUCKETS: { key: keyof AgeingRow; label: string; from: number; to: number }[] = [
  { key: 'b0_30', label: '0–30 days', from: 0, to: 30 },
  { key: 'b31_60', label: '31–60 days', from: 31, to: 60 },
  { key: 'b61_90', label: '61–90 days', from: 61, to: 90 },
  { key: 'b91_180', label: '91–180 days', from: 91, to: 180 },
  { key: 'b181_365', label: '181–365 days', from: 181, to: 365 },
  { key: 'b365plus', label: 'Above 365 days', from: 366, to: 99_999 },
]

/** Stock ageing — how long material has been sitting, counted from batch receipt. */
export function StockAgeingPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()

  const totals = useMemo(() => {
    const grand = ageingRows.reduce((s, r) => s + BUCKETS.reduce((t, b) => t + (r[b.key] as number), 0), 0)
    const over180 = ageingRows.reduce((s, r) => s + r.b181_365 + r.b365plus, 0)
    return { grand, over180, provision: ageingRows.reduce((s, r) => s + r.provision, 0) }
  }, [])

  const chart = BUCKETS.map((b) => ({
    bucket: b.label.replace(' days', ''),
    value: Math.round(ageingRows.reduce((s, r) => s + (r[b.key] as number), 0) / 100_000),
  }))

  const groupColumns: Column<AgeingRow>[] = [
    { key: 'group', header: 'Stock group', sortable: true },
    ...BUCKETS.map((b) => ({
      key: String(b.key),
      header: b.label.replace(' days', ' d'),
      align: 'right' as const,
      sortable: true,
      accessor: (r: AgeingRow) => r[b.key] as number,
      render: (r: AgeingRow) => {
        const v = r[b.key] as number
        if (!v) return <span className="text-fg-subtle">—</span>
        return <span className={cn(b.key === 'b365plus' && 'text-danger', b.key === 'b181_365' && 'text-warning')}>{canSeeValue ? formatCurrency(v) : '•'}</span>
      },
    })),
    { key: 'provision', header: 'Provision', align: 'right', sortable: true, render: (r) => (canSeeValue ? <span className="font-medium text-warning">{formatCurrency(r.provision)}</span> : <span className="text-fg-subtle">—</span>) },
  ]

  /** Batch-level detail so a number can be traced to the actual material. */
  const detailRows = stockBalances.filter((b) => b.quantity > 0)
  const detailColumns: Column<StockBalance>[] = [
    { key: 'itemCode', header: 'Item', sortable: true, render: (b) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{b.itemName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{b.itemCode}</p>
      </div>
    ) },
    { key: 'batchNo', header: 'Batch', width: '11rem', render: (b) => <span className="font-mono text-2xs">{b.batchNo ?? '—'}</span> },
    { key: 'warehouseCode', header: 'Location', width: '10rem', render: (b) => <span className="font-mono text-2xs">{b.warehouseCode}{b.bin ? ` · ${b.bin}` : ''}</span> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (b) => <span className="tabular">{formatQty(b.quantity)} <span className="text-2xs text-fg-subtle">{b.uom}</span></span> },
    { key: 'ageDays', header: 'Age', align: 'right', width: '6.5rem', sortable: true, render: (b) => (
      <span className={cn('tabular', b.ageDays > 365 ? 'text-danger' : b.ageDays > 180 ? 'text-warning' : 'text-fg-muted')}>{b.ageDays} d</span>
    ) },
    { key: 'bucket', header: 'Bucket', width: '10rem', accessor: (b) => BUCKETS.find((x) => b.ageDays >= x.from && b.ageDays <= x.to)?.label ?? '', render: (b) => (
      <span className="text-2xs text-fg-muted">{BUCKETS.find((x) => b.ageDays >= x.from && b.ageDays <= x.to)?.label ?? '—'}</span>
    ) },
    ...(canSeeValue
      ? [{ key: 'value', header: 'Value', align: 'right' as const, sortable: true, accessor: (b: StockBalance) => b.quantity * b.rate, render: (b: StockBalance) => formatCurrency(b.quantity * b.rate) }]
      : []),
    { key: 'action', header: 'Suggested action', render: (b) => (
      <span className="text-2xs text-fg-muted">
        {b.ageDays > 365 ? 'Propose write-off' : b.ageDays > 180 ? 'Review with planning — provision applies' : b.ageDays > 90 ? 'Consume next' : 'Normal'}
      </span>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'stock-ageing', 'Stock ageing', columnsFromTable(groupColumns), ageingRows)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function doExportDetail(format: ExportFormat) {
    try {
      const n = exportRows(format, 'stock-ageing-detail', 'Stock ageing — batch detail', columnsFromTable(detailColumns), detailRows)
      toast.success('Export ready', `${n} batch rows written.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock ageing"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Stock ageing' }]}
      />

      <p className="mb-3 text-xs text-fg-muted">
        Age is counted from the date the <span className="font-medium text-fg">batch was received</span>, not from the item's
        last movement — so a fast-moving item can still be sitting on old stock.
        {canSeeValue && (
          <>
            {' '}Total <span className="font-medium text-fg tabular">₹{formatCompact(totals.grand)}</span> · older than 180 days{' '}
            <span className="font-medium text-warning tabular">₹{formatCompact(totals.over180)}</span>{' '}
            ({((totals.over180 / totals.grand) * 100).toFixed(1)}%, target ≤ 5%) · provision proposed{' '}
            <span className="font-medium text-warning tabular">{formatCurrency(totals.provision)}</span>
          </>
        )}
      </p>

      {canSeeValue && (
        <Card className="mb-4">
          <CardHeader title="Where the value is sitting" description="Stock value by age bucket, ₹ lakh" />
          <CardBody className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                <Tooltip content={<ChartTip prefix="₹" suffix=" L" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="value" name="Stock value" radius={[3, 3, 0, 0]} maxBarSize={54}>
                  {chart.map((_, i) => (
                    <Cell key={i} fill={i >= 4 ? '#ef4444' : i === 3 ? '#f59e0b' : INV_CHART_COLOURS[0]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader title="Ageing by stock group" description="The summary Finance reports on" />
        <CardBody className="p-0">
          <DataTable rows={ageingRows} columns={groupColumns} rowKey={(r) => r.uid} searchable={false} onExport={doExport} className="border-0" emptyTitle="No ageing data" />
        </CardBody>
      </Card>

      {ageingRows.filter((r) => r.note).map((r) => (
        <p key={r.uid} className="mb-4 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          <span className="font-medium">{r.group}:</span> {r.note}
        </p>
      ))}

      <Card>
        <CardHeader title="Batch detail" description="Every batch behind the buckets above, with the action it needs" />
        <CardBody className="p-0">
          <DataTable
            rows={detailRows}
            columns={detailColumns}
            rowKey={(b) => b.uid}
            searchPlaceholder="Search item, batch or location…"
            onExport={doExportDetail}
            className="border-0"
            emptyTitle="No stock"
            rowClassName={(b) => cn(b.ageDays > 365 && 'bg-danger/[0.03]', b.ageDays > 180 && b.ageDays <= 365 && 'bg-warning/[0.03]')}
          />
        </CardBody>
      </Card>
    </div>
  )
}
