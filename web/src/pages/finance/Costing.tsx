import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DataGrid } from '@/components/ui/Card'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { Amount, ChartTip, DetailBlock, FinStatusBadge, ReconcileBadge, VarianceChip, inr, useFinanceData } from '@/components/finance/FinShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { costVariance, unitCost, type CostVariance } from '@/lib/finFlow'
import type { ActualCostRecord, StandardCostCard } from '@/types/finance'

/**
 * Manufacturing cost accounting and variance analysis (Ch 10 to 13, 25).
 *
 * The gap between what a batch should have cost and what it did, split eight
 * ways. The split is only worth anything if it is exhaustive, so the screen
 * shows the eight parts adding back to the whole — a decomposition that does
 * not reconcile is a decomposition nobody should act on.
 */

export function CostingPage() {
  const toast = useToast()
  const { actualCosts, cards } = useFinanceData()

  const [tab, setTab] = useState('variance')
  const [detail, setDetail] = useState<ActualCostRecord | null>(null)
  const [productFilter, setProductFilter] = useState('ALL')

  const variances = useMemo(
    () =>
      actualCosts.rows
        .map((a) => {
          const card = cards.rows.find((c) => c.productCode === a.productCode)
          return card ? { actual: a, card, variance: costVariance(a, card) } : null
        })
        .filter(Boolean) as { actual: ActualCostRecord; card: StandardCostCard; variance: CostVariance }[],
    [actualCosts.rows, cards.rows],
  )

  const filtered = variances.filter((v) => productFilter === 'ALL' || v.actual.productCode === productFilter)
  const products = [...new Set(actualCosts.rows.map((a) => a.productCode))]

  const totals = useMemo(() => {
    const t = { standard: 0, actual: 0, variance: 0 }
    for (const v of filtered) { t.standard += v.variance.standardCost; t.actual += v.variance.actualCost; t.variance += v.variance.totalVariance }
    return t
  }, [filtered])

  /** Each variance head summed across the batches on screen. */
  const byHead = useMemo(() => {
    const labels = filtered[0]?.variance.lines.map((l) => l.label) ?? []
    return labels.map((label) => ({
      name: label,
      value: Number(filtered.reduce((s, v) => s + (v.variance.lines.find((l) => l.label === label)?.variance ?? 0), 0).toFixed(2)),
    }))
  }, [filtered])

  const allReconcile = filtered.every((v) => v.variance.reconciles)
  const drifted = filtered.filter((v) => Math.abs(v.variance.cardDrift) > 0.005)

  const varianceColumns: Column<(typeof variances)[number]>[] = [
    { key: 'order', header: 'Production order', sortable: true, width: '12rem', accessor: (v) => v.actual.productionOrderNo, render: (v) => <span className="font-mono text-xs font-medium text-brand-600">{v.actual.productionOrderNo}</span> },
    { key: 'product', header: 'Product', sortable: true, accessor: (v) => v.actual.productCode, render: (v) => (<><p className="text-xs font-medium text-fg">{v.actual.productName}</p><p className="font-mono text-2xs text-fg-subtle">{v.actual.productCode} · {v.actual.batchNo}</p></>) },
    { key: 'output', header: 'Output', align: 'right', sortable: true, width: '7rem', accessor: (v) => v.actual.outputQty, render: (v) => v.actual.outputQty.toLocaleString('en-IN') },
    { key: 'scrap', header: 'Scrap', align: 'right', width: '6rem', accessor: (v) => v.actual.scrapQty, render: (v) => (v.actual.scrapQty ? <span className="text-danger">{v.actual.scrapQty}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'standard', header: 'Standard', align: 'right', sortable: true, width: '11rem', accessor: (v) => v.variance.standardCost, render: (v) => inr(v.variance.standardCost) },
    { key: 'actual', header: 'Actual', align: 'right', sortable: true, width: '11rem', accessor: (v) => v.variance.actualCost, render: (v) => inr(v.variance.actualCost) },
    { key: 'variance', header: 'Variance', align: 'right', sortable: true, width: '11rem', accessor: (v) => v.variance.totalVariance, render: (v) => <VarianceChip value={v.variance.totalVariance} /> },
    { key: 'pct', header: 'On standard', align: 'right', width: '8rem', accessor: (v) => (v.variance.standardCost ? (v.variance.totalVariance / v.variance.standardCost) * 100 : 0), render: (v) => { const p = v.variance.standardCost ? (v.variance.totalVariance / v.variance.standardCost) * 100 : 0; return <span className={cn('text-xs tabular', Math.abs(p) > 5 ? 'text-danger' : Math.abs(p) > 2 ? 'text-warning' : 'text-fg-muted')}>{p > 0 ? '+' : ''}{p.toFixed(1)}%</span> } },
    { key: 'unit', header: 'Unit cost', align: 'right', width: '9rem', accessor: (v) => unitCost(v.actual).total, render: (v) => inr(unitCost(v.actual).total) },
    { key: 'reconciles', header: 'Check', width: '8rem', accessor: (v) => (v.variance.reconciles ? 'ok' : 'gap'), render: (v) => <ReconcileBadge ok={v.variance.reconciles} label={v.variance.reconciles ? 'Adds up' : 'Gap'} /> },
    { key: 'status', header: 'Status', width: '7.5rem', accessor: (v) => v.actual.status, render: (v) => <FinStatusBadge status={v.actual.status} /> },
  ]

  const cardColumns: Column<StandardCostCard>[] = [
    { key: 'productCode', header: 'Product', sortable: true, render: (c) => (<><p className="text-xs font-medium text-fg">{c.productName}</p><p className="font-mono text-2xs text-fg-subtle">{c.productCode}</p></>) },
    { key: 'effectiveFrom', header: 'Effective', width: '8rem', accessor: (c) => c.effectiveFrom, render: (c) => formatDate(c.effectiveFrom) },
    { key: 'material', header: 'Material', align: 'right', width: '9rem', accessor: (c) => c.material, render: (c) => inr(c.material) },
    { key: 'labour', header: 'Labour', align: 'right', width: '8rem', accessor: (c) => c.labour, render: (c) => inr(c.labour) },
    { key: 'machine', header: 'Machine', align: 'right', width: '8rem', accessor: (c) => c.machine, render: (c) => inr(c.machine) },
    { key: 'overhead', header: 'Overhead', align: 'right', width: '8rem', accessor: (c) => c.overhead, render: (c) => inr(c.overhead) },
    { key: 'packing', header: 'Packing', align: 'right', width: '8rem', accessor: (c) => c.packing, render: (c) => inr(c.packing) },
    { key: 'total', header: 'Standard cost', align: 'right', sortable: true, width: '11rem', accessor: (c) => c.total, render: (c) => <span className="text-xs font-medium tabular">{inr(c.total)}</span> },
    { key: 'inputs', header: 'Standard inputs', width: '20rem', render: (c) => <span className="text-2xs text-fg-muted">{c.stdMaterialQty} × {inr(c.stdMaterialRate)} · {c.stdLabourHours} h × {inr(c.stdLabourRate)} · {c.stdMachineHours} h × {inr(c.stdMachineRate)}</span> },
  ]

  const detailVariance = detail ? variances.find((v) => v.actual.uid === detail.uid) : null

  return (
    <div>
      <PageHeader
        title="Cost accounting"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Costing' }]}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'variance', label: 'Variance analysis', count: variances.length },
          { id: 'cards', label: 'Standard cost cards', count: cards.rows.length },
        ]} />}
      />

      {tab === 'variance' && (
        <>
          <Card className="mb-4">
            <CardBody className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <Select label="Product" containerClassName="w-56" value={productFilter} onChange={(e) => setProductFilter(e.target.value)} options={[{ value: 'ALL', label: 'Every product' }, ...products.map((p) => ({ value: p, label: p }))]} />
              <div><p className="text-2xs uppercase tracking-wide text-fg-muted">Standard</p><p className="text-lg font-semibold tabular text-fg">{inr(totals.standard)}</p></div>
              <div><p className="text-2xs uppercase tracking-wide text-fg-muted">Actual</p><p className="text-lg font-semibold tabular text-fg">{inr(totals.actual)}</p></div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-fg-muted">Total variance</p>
                <p className={cn('text-lg font-semibold tabular', totals.variance > 0 ? 'text-danger' : 'text-success')}>
                  {inr(Math.abs(totals.variance))} {totals.variance > 0 ? 'adverse' : 'favourable'}
                </p>
              </div>
              <div className="ml-auto"><ReconcileBadge ok={allReconcile} label={allReconcile ? 'Every split adds up' : 'A split does not add up'} /></div>
            </CardBody>
          </Card>

          {drifted.length > 0 && (
            <Alert tone="warning" className="mb-4">
              {drifted.length} cost card{drifted.length === 1 ? '' : 's'} carry a headline total that differs from the sum
              of their own components — {drifted.map((v) => `${v.actual.productCode} by ${inr(Math.abs(v.variance.cardDrift))}`).join(', ')}.
              Variances are measured against the components, so the analysis stands, but the card needs republishing.
            </Alert>
          )}

          <Card className="mb-4">
            <CardHeader title="Where the variance sits" description="Each head summed across the batches on screen; adverse to the right of zero" />
            <CardBody className="h-60">
              {!byHead.length ? (<p className="text-xs text-fg-subtle">Nothing to chart.</p>) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byHead} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Bar dataKey="value" name="Variance" radius={[0, 3, 3, 0]} maxBarSize={18}>
                      {byHead.map((h) => (<Cell key={h.name} fill={h.value > 0 ? '#ef4444' : '#10b981'} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>

          <DataTable
            rows={filtered}
            columns={varianceColumns}
            rowKey={(v) => v.actual.uid}
            searchPlaceholder="Search order, product or batch…"
            onExport={(f: ExportFormat) => {
              const cols: ExportColumn<(typeof variances)[number]>[] = [
                { header: 'Order', value: (v) => v.actual.productionOrderNo }, { header: 'Product', value: (v) => v.actual.productCode },
                { header: 'Batch', value: (v) => v.actual.batchNo }, { header: 'Output', value: (v) => v.actual.outputQty },
                { header: 'Standard', value: (v) => v.variance.standardCost.toFixed(2) }, { header: 'Actual', value: (v) => v.variance.actualCost.toFixed(2) },
                { header: 'Total variance', value: (v) => v.variance.totalVariance.toFixed(2) },
                ...(filtered[0]?.variance.lines.map((l) => ({ header: l.label, value: (v: (typeof variances)[number]) => (v.variance.lines.find((x) => x.label === l.label)?.variance ?? 0).toFixed(2) })) ?? []),
                { header: 'Unit cost', value: (v) => unitCost(v.actual).total.toFixed(2) },
              ]
              const n = exportRows(f, 'cost-variance', 'Cost variance analysis', cols, filtered)
              toast.success('Export ready', `${n} rows written.`)
            }}
            onRowClick={(v) => setDetail(v.actual)}
            rowClassName={(v) => (v.variance.totalVariance > v.variance.standardCost * 0.05 ? 'bg-danger/5' : undefined)}
            emptyTitle="No costed batches"
            emptyDescription="A production order appears here once its actual consumption is recorded."
            rowActions={(v) => (
              <>
                <MenuItem label="Open the breakdown" onClick={() => setDetail(v.actual)} />
                <MenuItem
                  label={v.actual.status === 'SETTLED' ? 'Already settled' : 'Settle to the ledger'}
                  separatorBefore
                  disabled={v.actual.status === 'SETTLED'}
                  onClick={() => {
                    actualCosts.update(v.actual.uid, { status: 'SETTLED', version: v.actual.version + 1 })
                    toast.success('Settled', `${v.actual.productionOrderNo} closed at ${inr(v.variance.actualCost)}, a variance of ${inr(Math.abs(v.variance.totalVariance))} ${v.variance.totalVariance > 0 ? 'adverse' : 'favourable'}.`)
                  }}
                />
              </>
            )}
          />
        </>
      )}

      {tab === 'cards' && (
        <DataTable
          rows={cards.rows}
          columns={cardColumns}
          rowKey={(c) => c.uid}
          searchPlaceholder="Search product…"
          onExport={(f) => {
            const cols: ExportColumn<StandardCostCard>[] = [
              { header: 'Product', value: (c) => c.productCode }, { header: 'Name', value: (c) => c.productName },
              { header: 'Material', value: (c) => c.material.toFixed(2) }, { header: 'Labour', value: (c) => c.labour.toFixed(2) },
              { header: 'Machine', value: (c) => c.machine.toFixed(2) }, { header: 'Overhead', value: (c) => c.overhead.toFixed(2) },
              { header: 'Packing', value: (c) => c.packing.toFixed(2) }, { header: 'Total', value: (c) => c.total.toFixed(2) },
            ]
            const n = exportRows(f, 'standard-cost-cards', 'Standard cost cards', cols, cards.rows)
            toast.success('Export ready', `${n} rows written.`)
          }}
          emptyTitle="No cost cards"
          emptyDescription="Published from the engineering roll-up."
        />
      )}

      {/* Breakdown ---------------------------------------------------------- */}
      <Drawer
        open={!!detailVariance}
        onClose={() => setDetail(null)}
        title={detailVariance?.actual.productionOrderNo}
        description={detailVariance ? `${detailVariance.actual.productName} · batch ${detailVariance.actual.batchNo}` : ''}
        width="max-w-4xl"
      >
        {detailVariance && (
          <div className="space-y-5">
            <DataGrid columns={3} items={[
              { label: 'Good output', value: `${detailVariance.actual.outputQty.toLocaleString('en-IN')} units` },
              { label: 'Scrapped', value: `${detailVariance.actual.scrapQty} units` },
              { label: 'Reworked', value: `${detailVariance.actual.reworkQty.toLocaleString('en-IN')} units` },
              { label: 'Standard for the output', value: inr(detailVariance.variance.standardCost) },
              { label: 'Actual', value: inr(detailVariance.variance.actualCost) },
              { label: 'Variance', value: `${inr(Math.abs(detailVariance.variance.totalVariance))} ${detailVariance.variance.totalVariance > 0 ? 'adverse' : 'favourable'}` },
            ]} />

            <DetailBlock title="Variance, split eight ways">
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead><tr><th>Head</th><th className="text-right" style={{ width: '11rem' }}>Standard</th><th className="text-right" style={{ width: '11rem' }}>Actual</th><th className="text-right" style={{ width: '11rem' }}>Variance</th><th>How it is worked out</th></tr></thead>
                  <tbody>
                    {detailVariance.variance.lines.map((l) => (
                      <tr key={l.label} className={Math.abs(l.variance) > detailVariance.variance.standardCost * 0.01 ? (l.isFavourable ? 'bg-success/5' : 'bg-danger/5') : undefined}>
                        <td className="text-xs font-medium text-fg">{l.label}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{inr(l.standard)}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{inr(l.actual)}</td>
                        <td className="text-right"><VarianceChip value={l.variance} /></td>
                        <td className="text-2xs text-fg-subtle">{l.formula}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={3} className="text-right text-xs font-semibold text-fg">Sum of the eight</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">{inr(detailVariance.variance.lines.reduce((s, l) => s + l.variance, 0))}</td>
                      <td />
                    </tr>
                    <tr className="bg-surface-2">
                      <td colSpan={3} className="text-right text-xs font-semibold text-fg">Actual less standard</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">{inr(detailVariance.variance.totalVariance)}</td>
                      <td>
                        <span className={cn('text-2xs font-medium', detailVariance.variance.reconciles ? 'text-success' : 'text-danger')}>
                          {detailVariance.variance.reconciles ? 'The parts add back to the whole' : `Gap of ${inr(detailVariance.variance.reconciliationGap)}`}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title="Cost per unit">
              {(() => {
                const u = unitCost(detailVariance.actual)
                const parts: [string, number][] = [
                  ['Material', u.material], ['Labour', u.labour], ['Machine', u.machine],
                  ['Overhead', u.overhead], ['Packing', u.packing], ['Quality', u.quality], ['Freight inward', u.freight],
                ]
                return (
                  <div className="overflow-x-auto rounded border border-border">
                    <table className="grid-table">
                      <tbody>
                        {parts.map(([label, value]) => (
                          <tr key={label}>
                            <td className="text-xs text-fg-muted">{label}</td>
                            <td className="text-right text-xs tabular">{inr(value)}</td>
                            <td className="w-20 text-right text-2xs text-fg-subtle tabular">{u.total > 0 ? `${((value / u.total) * 100).toFixed(1)}%` : '—'}</td>
                          </tr>
                        ))}
                        <tr className="bg-surface-2">
                          <td className="text-xs font-semibold text-fg">Total per unit</td>
                          <td className="text-right text-sm font-semibold tabular text-fg">{inr(u.total)}</td>
                          <td className="text-right text-2xs text-fg-subtle">of {inr(u.batchTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </DetailBlock>

            <DetailBlock title="Inputs consumed">
              <DataGrid columns={2} items={[
                { label: 'Material', value: `${detailVariance.actual.actualMaterialQty.toLocaleString('en-IN')} at ${inr(detailVariance.actual.actualMaterialRate)} (standard ${inr(detailVariance.card.stdMaterialRate)})` },
                { label: 'Labour', value: `${detailVariance.actual.actualLabourHours} h at ${inr(detailVariance.actual.actualLabourRate)} (standard ${inr(detailVariance.card.stdLabourRate)})` },
                { label: 'Machine', value: `${detailVariance.actual.actualMachineHours} h at ${inr(detailVariance.actual.actualMachineRate)} (standard ${inr(detailVariance.card.stdMachineRate)})` },
                { label: 'Overhead & packing', value: inr(detailVariance.actual.actualOverhead + detailVariance.actual.actualPacking) },
                { label: 'Quality cost', value: inr(detailVariance.actual.qualityCost) },
                { label: 'Freight inward', value: inr(detailVariance.actual.freightInward) },
              ]} />
            </DetailBlock>
          </div>
        )}
      </Drawer>
    </div>
  )
}
