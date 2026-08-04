import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, INV_CHART_COLOURS, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ageingRows, nonMoving, valuationRows, valueTrend } from '@/mock/inventory'
import type { AgeingRow, NonMovingItem, ValuationRow } from '@/types/inventory'

const BUCKETS: { key: keyof AgeingRow; label: string }[] = [
  { key: 'b0_30', label: '0–30 d' },
  { key: 'b31_60', label: '31–60 d' },
  { key: 'b61_90', label: '61–90 d' },
  { key: 'b91_180', label: '91–180 d' },
  { key: 'b181_365', label: '181–365 d' },
  { key: 'b365plus', label: '> 365 d' },
]

export function ValuationPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const [view, setView] = useState<'movement' | 'ageing' | 'nonmoving'>('movement')

  const totals = useMemo(() => {
    const opening = valuationRows.reduce((s, r) => s + r.opening, 0)
    const receipts = valuationRows.reduce((s, r) => s + r.receipts, 0)
    const issues = valuationRows.reduce((s, r) => s + r.issues, 0)
    const adjustments = valuationRows.reduce((s, r) => s + r.adjustments, 0)
    const closing = valuationRows.reduce((s, r) => s + r.closing, 0)
    const ageingTotal = ageingRows.reduce((s, r) => s + BUCKETS.reduce((t, b) => t + (r[b.key] as number), 0), 0)
    const over180 = ageingRows.reduce((s, r) => s + r.b181_365 + r.b365plus, 0)
    const provision = ageingRows.reduce((s, r) => s + r.provision, 0)
    return { opening, receipts, issues, adjustments, closing, ageingTotal, over180, provision, nonMovingValue: nonMoving.reduce((s, n) => s + n.value, 0) }
  }, [])

  const reconciles = Math.abs(totals.opening + totals.receipts + totals.issues + totals.adjustments - totals.closing) < 1

  const movementColumns: Column<ValuationRow>[] = [
    { key: 'group', header: 'Group', sortable: true },
    { key: 'method', header: 'Method', width: '11rem', render: (r) => <span className="text-2xs text-fg-muted">{r.method}</span> },
    { key: 'quantity', header: 'Closing qty', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.quantity} /> },
    { key: 'opening', header: 'Opening', align: 'right', sortable: true, render: (r) => formatCurrency(r.opening) },
    { key: 'receipts', header: 'Receipts', align: 'right', sortable: true, render: (r) => <span className="text-success">{formatCurrency(r.receipts)}</span> },
    { key: 'issues', header: 'Issues', align: 'right', sortable: true, render: (r) => <span className="text-danger">{formatCurrency(r.issues)}</span> },
    { key: 'adjustments', header: 'Adjustments', align: 'right', render: (r) => <span className={cn(r.adjustments < 0 && 'text-danger')}>{r.adjustments ? formatCurrency(r.adjustments) : '—'}</span> },
    { key: 'closing', header: 'Closing', align: 'right', sortable: true, render: (r) => <span className="font-medium">{formatCurrency(r.closing)}</span> },
  ]

  const ageingColumns: Column<AgeingRow>[] = [
    { key: 'group', header: 'Group', sortable: true },
    ...BUCKETS.map((b) => ({
      key: String(b.key),
      header: b.label,
      align: 'right' as const,
      sortable: true,
      accessor: (r: AgeingRow) => r[b.key] as number,
      render: (r: AgeingRow) => {
        const v = r[b.key] as number
        return <span className={cn(b.key === 'b365plus' && v > 0 && 'text-danger', b.key === 'b181_365' && v > 0 && 'text-warning')}>{v ? formatCurrency(v) : '—'}</span>
      },
    })),
    { key: 'provision', header: 'Provision', align: 'right', sortable: true, render: (r) => <span className="font-medium text-warning">{formatCurrency(r.provision)}</span> },
  ]

  const nonMovingColumns: Column<NonMovingItem>[] = [
    { key: 'itemCode', header: 'Item', sortable: true, render: (n) => <ItemCell code={n.itemCode} name={n.itemName} /> },
    { key: 'itemClass', header: 'Class', width: '9rem', render: (n) => <span className="text-2xs text-fg-muted">{n.itemClass.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (n) => <QtyCell qty={n.quantity} uom={n.uom} /> },
    { key: 'value', header: 'Value', align: 'right', sortable: true, render: (n) => formatCurrency(n.value) },
    { key: 'lastMovementOn', header: 'Last movement', sortable: true, width: '8rem', accessor: (n) => n.lastMovementOn, render: (n) => formatDate(n.lastMovementOn) },
    { key: 'daysIdle', header: 'Idle', align: 'right', sortable: true, width: '6rem', render: (n) => (
      <span className={cn('tabular', n.daysIdle > 365 ? 'text-danger' : n.daysIdle > 180 ? 'text-warning' : 'text-fg-muted')}>{n.daysIdle} d</span>
    ) },
    { key: 'reason', header: 'Why it is not moving' },
    { key: 'recommendation', header: 'Recommendation', defaultHidden: true },
    { key: 'provisionPct', header: 'Provision', align: 'right', width: '7rem', sortable: true, render: (n) => (
      <Badge tone={n.provisionPct === 100 ? 'danger' : n.provisionPct > 0 ? 'warning' : 'neutral'} size="sm" dot={false}>{n.provisionPct}%</Badge>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        view === 'movement'
          ? exportRows(format, 'valuation-movement', 'Valuation movement', columnsFromTable(movementColumns), valuationRows)
          : view === 'ageing'
            ? exportRows(format, 'stock-ageing', 'Stock ageing', columnsFromTable(ageingColumns), ageingRows)
            : exportRows(format, 'non-moving-stock', 'Slow & non-moving stock', columnsFromTable(nonMovingColumns), nonMoving)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /**
   * Value is a separate permission from quantity. Rather than a dead end, show
   * the same analysis in quantities and point at what the user can still do.
   */
  if (!canSeeValue) {
    return (
      <div>
        <PageHeader
          title="Valuation & ageing"
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Valuation' }]}
          badge={<Badge tone="warning" size="sm">Value hidden for your role</Badge>}
        />

        <Card className="mb-4">
          <CardHeader
            title="You can see stock, but not what it cost"
            description="Viewing quantity and viewing value are two different permissions"
          />
          <CardBody className="space-y-2.5 text-xs leading-relaxed text-fg-muted">
            <p>
              This screen reports money: closing value, the movement from opening to closing, ageing value and provisions. Your
              role holds <span className="font-mono text-fg">INVENTORY.STOCK.VIEW</span> but not{' '}
              <span className="font-mono text-fg">INVENTORY.STOCK.VIEW_VALUE</span>, so those figures are not sent to your
              browser at all — they are absent from the response, not blanked out on screen.
            </p>
            <p>
              That is deliberate: a storekeeper works the bins all day and never needs to know the rate. It is normally held by
              Accounts, Costing, the CFO, the Factory Head and the Internal Auditor.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What you can still do here" description="The same questions, answered in quantities instead of rupees" />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            {[
              { t: 'Stock ageing by quantity', d: 'How long material has been sitting, bucket by bucket.', to: '/inventory/analysis' },
              { t: 'Slow, dead & non-moving', d: 'What has not moved, why, and what to do about it.', to: '/inventory/analysis' },
              { t: 'Stock enquiry', d: 'On hand, free, reserved and quarantined by item and bin.', to: '/inventory/stock' },
            ].map((x) => (
              <Link key={x.t} to={x.to} className="rounded border border-border p-3 transition-colors hover:border-border-strong hover:bg-surface-2">
                <p className="text-xs font-medium text-fg">{x.t}</p>
                <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{x.d}</p>
              </Link>
            ))}
          </CardBody>
        </Card>

        <p className="mt-3 text-2xs text-fg-subtle">
          If you need the value figures, ask an administrator to grant{' '}
          <span className="font-mono">INVENTORY.STOCK.VIEW_VALUE</span> — it is listed in the{' '}
          <Link to="/admin/permissions" className="text-brand-600 hover:underline">permission explorer</Link>.
        </p>
      </div>
    )
  }

  const pieData = valuationRows.map((r) => ({ name: r.group, value: Math.round(r.closing / 100_000) }))

  return (
    <div>
      <PageHeader
        title="Valuation, ageing & provisioning"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Valuation' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => toast.success('Reconciliation run', 'Stock ledger value compared to the GL stock accounts by determination group.')}>
              Reconcile to GL
            </Button>
            <Button variant="primary" size="sm" onClick={() => toast.success('Provision proposed', `${formatCurrency(totals.provision)} proposed by the ageing policy — Finance approves, the system never posts it silently.`)}>
              Propose provision
            </Button>
          </>
        }
        badge={
          reconciles
            ? <Badge tone="success" size="sm">Reconciles</Badge>
            : <Badge tone="danger" size="sm">Difference — close blocked</Badge>
        }
        tabs={
          <Tabs
            variant="pill"
            active={view}
            onChange={(v) => setView(v as typeof view)}
            tabs={[
              { id: 'movement', label: 'Movement', count: valuationRows.length },
              { id: 'ageing', label: 'Ageing', count: ageingRows.length },
              { id: 'nonmoving', label: 'Slow & non-moving', count: nonMoving.length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        Opening <span className="font-medium text-fg tabular">₹{formatCompact(totals.opening)}</span> + receipts{' '}
        <span className="font-medium text-success tabular">₹{formatCompact(totals.receipts)}</span> − issues{' '}
        <span className="font-medium text-danger tabular">₹{formatCompact(Math.abs(totals.issues))}</span> ± adjustments{' '}
        <span className="font-medium text-fg tabular">{formatCurrency(totals.adjustments)}</span> = closing{' '}
        <span className="font-medium text-fg tabular">₹{formatCompact(totals.closing)}</span> ·{' '}
        <span className={cn('font-medium', reconciles ? 'text-success' : 'text-danger')}>
          {reconciles ? 'reconciles to the GL to the rupee' : 'difference against the GL — period close is blocked'}
        </span>
      </p>

      {view === 'movement' && (
        <>
          <DataTable
            rows={valuationRows}
            columns={movementColumns}
            rowKey={(r) => r.uid}
            searchable={false}
            onExport={doExport}
            pageSize={20}
            emptyTitle="No valuation groups"
          />

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Value by class" description="Closing value trend, ₹ lakh" />
              <CardBody className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={valueTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                    <Tooltip content={<ChartTip prefix="₹" suffix=" L" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    <Bar dataKey="rawMaterial" name="Raw material" stackId="a" fill="#3b82f6" maxBarSize={30} />
                    <Bar dataKey="wip" name="WIP" stackId="a" fill="#f59e0b" maxBarSize={30} />
                    <Bar dataKey="finishedGoods" name="Finished goods" stackId="a" fill="#10b981" maxBarSize={30} />
                    <Bar dataKey="other" name="Other" stackId="a" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Closing value share" description="₹ lakh by group" />
              <CardBody className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={INV_CHART_COLOURS[i % INV_CHART_COLOURS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip prefix="₹" suffix=" L" />} />
                    <Legend wrapperStyle={{ fontSize: 9 }} iconSize={7} />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="Where the stock physically is" description="Everything below is valued, and the auditor will ask where it sits" />
            <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {valuationRows
                .filter((r) => ['At subcontractor', 'Goods in transit', 'Quarantine & rejected', 'Work in progress'].includes(r.group))
                .map((r) => (
                  <div key={r.uid} className="rounded border border-border p-3">
                    <p className="text-xs font-medium text-fg">{r.group}</p>
                    <p className="mt-1 text-lg font-semibold tabular text-fg">₹{formatCompact(r.closing)}</p>
                    <p className="mt-0.5 text-2xs text-fg-muted">{formatQty(r.quantity)} units · {r.method.toLowerCase()}</p>
                  </div>
                ))}
            </CardBody>
          </Card>
        </>
      )}

      {view === 'ageing' && (
        <>
          <DataTable
            rows={ageingRows}
            columns={ageingColumns}
            rowKey={(r) => r.uid}
            searchable={false}
            onExport={doExport}
            emptyTitle="No ageing data"
            rowClassName={(r) => cn(r.b365plus > 0 && 'bg-danger/[0.03]')}
          />
          <p className="mt-3 text-2xs text-fg-subtle">
            Buckets are computed from the receipt date of the batch or FIFO layer, not from the item's last movement — an item that
            moved last week can still hold stock received in January.
          </p>
          {ageingRows.filter((r) => r.note).map((r) => (
            <p key={r.uid} className="mt-2 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              <span className="font-medium">{r.group}:</span> {r.note}
            </p>
          ))}
        </>
      )}

      {view === 'nonmoving' && (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className="font-medium text-fg tabular">₹{formatCompact(totals.nonMovingValue)}</span> idle across{' '}
            <span className="font-medium text-fg">{nonMoving.length}</span> items ·{' '}
            <span className="font-medium text-fg tabular">₹{formatCompact(totals.over180)}</span> older than 180 days
            ({((totals.over180 / totals.ageingTotal) * 100).toFixed(1)}% of stock, target ≤ 5%) · provision proposed{' '}
            <span className="font-medium text-warning tabular">{formatCurrency(totals.provision)}</span>
          </p>
          <DataTable
            rows={nonMoving}
            columns={nonMovingColumns}
            rowKey={(n) => n.uid}
            searchPlaceholder="Search item, reason or recommendation…"
            onExport={doExport}
            emptyTitle="Nothing idle"
            rowClassName={(n) => cn(n.provisionPct === 100 && 'bg-danger/[0.03]')}
          />
          <Card className="mt-4">
            <CardHeader title="Disposition workflow" description="A non-moving list nobody acts on is a report, not a control" />
            <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-4">
              <p><span className="font-medium text-fg">Use.</span> Consume in another model or an economy range.</p>
              <p><span className="font-medium text-fg">Rework.</span> Convert to a saleable configuration where the cost justifies it.</p>
              <p><span className="font-medium text-fg">Sell / return.</span> To a converter, the scrap channel or back to the supplier.</p>
              <p><span className="font-medium text-fg">Write off.</span> With approval, a provision already held, and the accounting treatment stated.</p>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
