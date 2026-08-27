import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Boxes,
  ClipboardCheck,
  IndianRupee,
  ShieldAlert,
  TrendingDown,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader, Section, StatTile } from '@/components/ui/Misc'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ChartTip, InvStatusBadge, useCanSeeValue } from '@/components/inventory/InvShell'
import { formatCompact, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useSession } from '@/api/session'
import { useMovements, useStockEnquiry } from '@/hooks/useStock'
import { useValuation, useReorder, useMovement, useAgeing } from '@/hooks/useAnalysis'
import { useCounts } from '@/hooks/useCount'
import type { MovementRow as LedgerRow } from '@/api/stock'

/**
 * Inventory dashboard — every figure is live from the stock engine and analysis
 * endpoints (valuation, reorder, ageing, movement, counts). No mock data: panels
 * that have no backend yet (batch expiry, put-away queue, job-work) are omitted
 * rather than faked.
 */
export function InventoryDashboardPage() {
  const navigate = useNavigate()
  const canSeeValue = useCanSeeValue()
  const companyUid = useSession((s) => s.companyUid)

  const valuationQ = useValuation()
  const reorderQ = useReorder()
  const movementQ = useMovement()
  const ageingQ = useAgeing()
  const countsQ = useCounts()
  const recentQ = useMovements()
  const stockQ = useStockEnquiry()

  const valuation = valuationQ.data
  const reorder = reorderQ.data ?? []
  const movement = movementQ.data
  const ageing = ageingQ.data
  const counts = countsQ.data ?? []
  const recent = recentQ.data ?? []
  const stockLines = stockQ.data ?? []

  const openCounts = useMemo(
    () => counts.filter((c) => !['APPROVED', 'CANCELLED'].includes(c.status)),
    [counts],
  )
  const skuCount = valuation?.items.length ?? stockLines.length
  const dead = movement?.counts.DEAD ?? 0
  const slow = movement?.counts.SLOW ?? 0

  // Stock value (or item count) by category — from the valuation breakdown.
  const byType = useMemo(() => {
    if (canSeeValue && valuation?.by_type.length) {
      return valuation.by_type.map((t) => ({ label: t.item_type, value: Number(t.value ?? 0) }))
    }
    const c: Record<string, number> = {}
    for (const it of valuation?.items ?? []) c[it.item_type] = (c[it.item_type] ?? 0) + 1
    return Object.entries(c).map(([label, value]) => ({ label, value }))
  }, [canSeeValue, valuation])

  // Ageing distribution — value per bucket when permitted, else quantity.
  const ageingData = useMemo(() => {
    if (!ageing) return []
    return ageing.labels.map((label, i) => ({
      label,
      value: canSeeValue
        ? Number(ageing.totals_value[i] ?? 0)
        : ageing.rows.reduce((s, r) => s + (r.buckets_qty[i] ?? 0), 0),
    }))
  }, [ageing, canSeeValue])

  const loading = valuationQ.isLoading || reorderQ.isLoading || movementQ.isLoading

  const recentCols: Column<LedgerRow>[] = [
    { key: 'business_date', header: 'Date', width: '96px', render: (m) => formatDate(m.business_date) },
    { key: 'document_no', header: 'Document', width: '150px', render: (m) => <span className="font-mono text-2xs text-brand-600">{m.document_no}</span> },
    { key: 'item_code', header: 'Item', render: (m) => <span className="text-xs">{m.item_code}</span> },
    { key: 'warehouse_code', header: 'WH', width: '80px', render: (m) => <span className="text-2xs text-fg-muted">{m.warehouse_code ?? '—'}</span> },
    { key: 'quantity', header: 'Qty', align: 'right', width: '100px', render: (m) => <span className={cn('tabular text-xs', m.direction === 'IN' ? 'text-success' : 'text-danger')}>{m.direction === 'IN' ? '+' : '−'}{formatQty(m.quantity)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Inventory & stores"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/stock')}>Stock enquiry</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/inventory/issues')}>New issue</Button>
          </>
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}

      {/* KPI row --------------------------------------------------------- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {canSeeValue && valuation?.total_value != null ? (
          <StatTile label="Closing stock value" value={`₹${formatCompact(valuation.total_value)}`} sub={`${skuCount} items on hand`} icon={<IndianRupee />} tone="brand" />
        ) : (
          <StatTile label="Items on hand" value={skuCount} sub={canSeeValue ? 'Awaiting valuation' : 'Value hidden for your role'} icon={<Boxes />} tone="brand" />
        )}
        <StatTile label="Below reorder" value={reorder.length} sub={reorder.length ? 'Need replenishment' : 'All above reorder level'} icon={<ShieldAlert />} tone={reorder.length ? 'warning' : 'success'} />
        <StatTile label="Dead stock" value={dead} sub={`${slow} slow-moving`} icon={<TrendingDown />} tone={dead ? 'warning' : 'success'} />
        <StatTile label="Open counts" value={openCounts.length} sub={`${counts.length} total counts`} icon={<ClipboardCheck />} tone={openCounts.length ? 'progress' : 'neutral'} />
      </div>

      {/* Charts --------------------------------------------------------- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={canSeeValue ? 'Stock value by category' : 'Items by category'} description={canSeeValue ? 'Closing value grouped by item type' : 'Item count grouped by type'} />
          <CardBody className="h-60">
            {byType.length === 0 ? (
              <p className="grid h-full place-content-center text-xs text-fg-subtle">{loading ? 'Loading…' : 'No stock yet.'}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => formatCompact(v as number)} />
                  <Tooltip content={<ChartTip prefix={canSeeValue ? '₹' : ''} />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Bar dataKey="value" name={canSeeValue ? 'Value' : 'Items'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={46} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Stock ageing" description={canSeeValue ? 'Value held in each age bucket' : 'Quantity held in each age bucket'} />
          <CardBody className="h-60">
            {ageingData.length === 0 ? (
              <p className="grid h-full place-content-center text-xs text-fg-subtle">{ageingQ.isLoading ? 'Loading…' : 'No stock yet.'}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageingData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => formatCompact(v as number)} />
                  <Tooltip content={<ChartTip prefix={canSeeValue ? '₹' : ''} />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Bar dataKey="value" name={canSeeValue ? 'Value' : 'Qty'} fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={46} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Reorder + recent movements ------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Reorder watch" description="Items below their reorder level"
            actions={<Button variant="ghost" size="sm" onClick={() => navigate('/inventory/reorder')}>Full report</Button>} />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead><tr><th>Item</th><th className="text-right">Available</th><th className="text-right">Reorder</th><th className="text-right">Suggested</th></tr></thead>
                <tbody>
                  {reorder.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-xs text-fg-subtle">{reorderQ.isLoading ? 'Loading…' : 'Everything is above its reorder level.'}</td></tr>
                  ) : reorder.slice(0, 8).map((r) => (
                    <tr key={r.item_code}>
                      <td className="max-w-[16rem]"><p className="truncate text-xs font-medium text-fg">{r.item_name}</p><p className="font-mono text-2xs text-fg-subtle">{r.item_code}</p></td>
                      <td className="text-right tabular text-danger">{formatQty(r.available)}</td>
                      <td className="text-right tabular text-fg-muted">{formatQty(r.reorder_level)}</td>
                      <td className="text-right tabular font-medium">{formatQty(r.suggested_order)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent movements" description="Latest postings through the stock ledger"
            actions={<Button variant="ghost" size="sm" onClick={() => navigate('/inventory/ledger')}>Ledger</Button>} />
          <CardBody className="p-0">
            <DataTable rows={recent.slice(0, 8)} columns={recentCols} rowKey={(m) => m.uid} loading={recentQ.isLoading}
              searchable={false} emptyTitle="No movements yet" />
          </CardBody>
        </Card>
      </div>

      {/* Recent counts ------------------------------------------------- */}
      <Section title="Recent counts" className="mt-6">
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead><tr><th>Count</th><th>Warehouse</th><th>Type</th><th>Counter</th><th className="text-right">Lines</th><th className="text-right">Variances</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>
                  {counts.length === 0 ? (
                    <tr><td colSpan={8} className="py-6 text-center text-xs text-fg-subtle">{countsQ.isLoading ? 'Loading…' : 'No counts recorded yet.'}</td></tr>
                  ) : counts.slice(0, 10).map((c) => (
                    <tr key={c.uid}>
                      <td className="font-mono text-2xs font-medium text-brand-600">{c.document_no}</td>
                      <td className="text-xs">{c.warehouse_code ?? '—'}</td>
                      <td className="text-2xs text-fg-muted">{c.count_type}</td>
                      <td className="text-xs">{c.counted_by_name ?? '—'}</td>
                      <td className="text-right tabular">{c.line_count}</td>
                      <td className={cn('text-right tabular', c.variance_lines ? 'text-warning' : '')}>{c.variance_lines}</td>
                      <td className="text-2xs text-fg-muted">{formatDate(c.count_date)}</td>
                      <td><InvStatusBadge status={c.status} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </Section>
    </div>
  )
}
