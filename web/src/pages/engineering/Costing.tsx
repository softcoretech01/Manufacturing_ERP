import { useMemo, useState, useEffect } from 'react'
import { Calculator, RotateCcw } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ChartTip } from '@/components/engineering/EngShell'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate } from '@/lib/format'
import { NO_SIMULATION, rollUpCost, type CostContext, type MaterialCostLine, type Simulation } from '@/lib/engFlow'
import { api } from '@/lib/api'
import type { Bom, EngProduct, EngWorkCentre, Routing, Tool } from '@/types/engineering'
import type { Item } from '@/types/master'

/**
 * Cost roll-up and simulation (Ch 16).
 *
 * The standard cost is not typed anywhere — it is built from the structure: the
 * BOM priced from the item master, sub-assemblies rolled from their own
 * structures, and the routing charged at each work centre's rates. The
 * simulation panel re-runs the same calculation with the inputs moved, so
 * "what happens if steel goes up 8%" is answered before it does.
 */

const BUCKET_META: { key: keyof CostContextBuckets; label: string; colour: string }[] = [
  { key: 'rawMaterial', label: 'Raw material & components', colour: '#3b82f6' },
  { key: 'packing', label: 'Packing', colour: '#8b5cf6' },
  { key: 'consumables', label: 'Consumables', colour: '#06b6d4' },
  { key: 'labour', label: 'Labour', colour: '#f59e0b' },
  { key: 'machine', label: 'Machine', colour: '#10b981' },
  { key: 'tooling', label: 'Tooling', colour: '#ec4899' },
  { key: 'overhead', label: 'Overhead', colour: '#64748b' },
]

type CostContextBuckets = ReturnType<typeof rollUpCost>['buckets']

const SOURCE_LABEL: Record<MaterialCostLine['source'], string> = {
  ROLLED: 'Rolled from its own BOM',
  STANDARD_COST: 'Item standard cost',
  LAST_PURCHASE: 'Last purchase rate',
  MISSING: 'No cost available',
}

export function CostingPage() {
  const toast = useToast()
  
  const [products, setProducts] = useState<EngProduct[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [routings, setRoutings] = useState<Routing[]>([])
  const [workCentres, setWorkCentres] = useState<EngWorkCentre[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [items, setItems] = useState<Item[]>([])

  const [isLoading, setIsLoading] = useState(true)

  const [productCode, setProductCode] = useState('')
  const [sim, setSim] = useState<Simulation>(NO_SIMULATION)
  const [lotText, setLotText] = useState('')

  async function loadData() {
    try {
      const [ps, bs, rs, ws, ts, is] = await Promise.all([
        api.getEngProducts().catch(() => []),
        api.getBoms().catch(() => []),
        api.getRoutings().catch(() => []),
        api.getEngWorkCentres().catch(() => []),
        api.getEngTools().catch(() => []),
        api.getItems().catch(() => []),
      ])
      setProducts(ps)
      setBoms(bs)
      setRoutings(rs)
      setWorkCentres(ws)
      setTools(ts)
      setItems(is)
      if (ps.length > 0 && !productCode) {
        setProductCode(ps[0].code)
      }
    } catch (err) {
      toast.error('Error', 'Failed to load costing dependencies')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const ctx: CostContext = { boms, routings, workCentres, tools, items, products }

  const base = useMemo(
    () => (productCode ? rollUpCost(productCode, ctx, NO_SIMULATION) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productCode, boms, routings, workCentres, tools, products, items],
  )

  const activeSim: Simulation = { ...sim, lotSize: lotText.trim() ? Number(lotText) || null : null }
  const simulating = activeSim.materialPct !== 0 || activeSim.conversionPct !== 0 || activeSim.lotSize !== null

  const simulated = useMemo(
    () => (productCode && simulating ? rollUpCost(productCode, ctx, activeSim) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productCode, boms, routings, workCentres, tools, products, items, activeSim.materialPct, activeSim.conversionPct, activeSim.lotSize],
  )

  const shown = simulated ?? base
  const product = products.find((p) => p.code === productCode)

  const chartData = shown
    ? BUCKET_META.map((m) => ({ name: m.label, value: Number(shown.buckets[m.key].toFixed(2)), colour: m.colour })).filter((d) => d.value > 0)
    : []

  function resetSim() {
    setSim(NO_SIMULATION)
    setLotText('')
  }

  async function publish() {
    if (!base || !product) return
    if (base.total <= 0) {
      toast.error('Nothing to publish', 'The roll-up came back at zero — check the BOM and routing first.')
      return
    }
    try {
      const updatedProduct = { 
        ...product, 
        standardCost: base.total, 
        costRolledAt: new Date().toISOString() 
      }
      await api.updateEngProduct(product.uid, updatedProduct)
      
      toast.success(
        'Standard cost published',
        `${product.code} is now ₹${formatAmount(base.total)}. The unsimulated roll-up is published, not the simulation.`,
      )
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to publish standard cost')
    }
  }

  function exportMaterial(format: ExportFormat) {
    if (!shown) return
    const columns: ExportColumn<MaterialCostLine>[] = [
      { header: 'Component', value: (l) => l.itemCode },
      { header: 'Description', value: (l) => l.itemName },
      { header: 'Qty per', value: (l) => l.qtyPer },
      { header: 'Scrap %', value: (l) => l.scrapPct },
      { header: 'Effective qty', value: (l) => l.effectiveQty.toFixed(6) },
      { header: 'UoM', value: (l) => l.uom },
      { header: 'Unit cost', value: (l) => l.unitCost.toFixed(4) },
      { header: 'Amount', value: (l) => l.amount.toFixed(4) },
      { header: 'Cost source', value: (l) => SOURCE_LABEL[l.source] },
    ]
    const n = exportRows(format, `cost-rollup-${productCode}`, `Cost roll-up — ${productCode}`, columns, shown.materialLines)
    toast.success('Export ready', `${n} rows written.`)
  }

  const variance = product && product.standardCost > 0 && base ? base.total - product.standardCost : 0

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Cost roll-up" breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Costing' }]} />
        <Card className="p-8 text-center text-sm text-fg-muted">Loading costing data from live database...</Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Cost roll-up"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Costing' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Calculator className="h-4 w-4" />} disabled={!base || base.total <= 0} onClick={publish}>
            Publish as standard cost
          </Button>
        }
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3.5 sm:grid-cols-5">
          <Select
            label="Product"
            containerClassName="sm:col-span-2"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            options={[{ value: '', label: 'Select a product…' }, ...products.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <Input maxLength={255}
            label="Material price move (%)"
            type="number"
            step="0.5"
            value={sim.materialPct || ''}
            placeholder="0"
            hint="Applies to every bought-out component."
            onChange={(e) => setSim({ ...sim, materialPct: Number(e.target.value) || 0 })}
          />
          <Input maxLength={255}
            label="Labour & machine move (%)"
            type="number"
            step="0.5"
            value={sim.conversionPct || ''}
            placeholder="0"
            hint="Applies to every work centre rate."
            onChange={(e) => setSim({ ...sim, conversionPct: Number(e.target.value) || 0 })}
          />
          <Input maxLength={255}
            label="Lot size override"
            type="number"
            value={lotText}
            placeholder={base ? String(base.lotSize) : ''}
            hint="Setup is spread over this many pieces."
            onChange={(e) => setLotText(e.target.value)}
          />
        </CardBody>
        {simulating && (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-warning/5 px-4 py-2">
            <p className="text-xs text-warning">
              Simulating. Figures below are a what-if, not the published standard cost.
            </p>
            <Button variant="ghost" size="xs" icon={<RotateCcw className="h-3 w-3" />} onClick={resetSim}>
              Reset simulation
            </Button>
          </div>
        )}
      </Card>

      {!productCode || !base || !shown ? (
        <Card>
          <EmptyState title="Choose a product" description="The roll-up walks its BOM and routing and prices both." />
        </Card>
      ) : (
        <>
          {/* Headline ------------------------------------------------------ */}
          <div className="mb-4 grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title={`${shown.productCode} — ${shown.productName}`}
                description={
                  shown.bomDocNo
                    ? `${shown.bomDocNo} R${shown.bomRevision}${shown.routingDocNo ? ` · ${shown.routingDocNo} R${shown.routingRevision}` : ''} · costing lot ${shown.lotSize.toLocaleString('en-IN')}`
                    : 'No live bill of material'
                }
              />
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>Cost element</th>
                        <th className="text-right" style={{ width: '10rem' }}>Per unit</th>
                        <th className="text-right" style={{ width: '6rem' }}>Share</th>
                        {simulated && <th className="text-right" style={{ width: '10rem' }}>Was</th>}
                        {simulated && <th className="text-right" style={{ width: '8rem' }}>Change</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {BUCKET_META.map((m) => {
                        const value = shown.buckets[m.key]
                        const before = base.buckets[m.key]
                        return (
                          <tr key={m.key}>
                            <td>
                              <span className="flex items-center gap-2 text-xs text-fg">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.colour }} />
                                {m.label}
                              </span>
                            </td>
                            <td className="text-right tabular text-xs">₹{formatAmount(value)}</td>
                            <td className="text-right tabular text-2xs text-fg-subtle">
                              {shown.total > 0 ? `${((value / shown.total) * 100).toFixed(1)}%` : '—'}
                            </td>
                            {simulated && <td className="text-right tabular text-2xs text-fg-muted">₹{formatAmount(before)}</td>}
                            {simulated && (
                              <td className={`text-right tabular text-2xs ${value - before > 0.005 ? 'text-danger' : value - before < -0.005 ? 'text-success' : 'text-fg-subtle'}`}>
                                {Math.abs(value - before) < 0.005 ? '—' : `${value > before ? '+' : ''}₹${formatAmount(value - before)}`}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                      <tr>
                        <td className="text-xs font-medium text-fg-muted">Material subtotal</td>
                        <td className="text-right tabular text-xs text-fg-muted">₹{formatAmount(shown.materialTotal)}</td>
                        <td colSpan={simulated ? 3 : 1} />
                      </tr>
                      <tr>
                        <td className="text-xs font-medium text-fg-muted">Conversion subtotal</td>
                        <td className="text-right tabular text-xs text-fg-muted">₹{formatAmount(shown.conversionTotal)}</td>
                        <td colSpan={simulated ? 3 : 1} />
                      </tr>
                      <tr className="bg-surface-2">
                        <td className="text-sm font-semibold text-fg">Total manufacturing cost</td>
                        <td className="text-right text-base font-semibold tabular text-fg">₹{formatAmount(shown.total)}</td>
                        <td />
                        {simulated && <td className="text-right tabular text-xs text-fg-muted">₹{formatAmount(base.total)}</td>}
                        {simulated && (
                          <td className={`text-right text-xs font-semibold tabular ${shown.total > base.total ? 'text-danger' : 'text-success'}`}>
                            {shown.total > base.total ? '+' : ''}
                            {base.total > 0 ? `${(((shown.total - base.total) / base.total) * 100).toFixed(1)}%` : '—'}
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Where the cost sits" description="Per finished unit" />
              <CardBody className="h-64">
                {chartData.length === 0 ? (
                  <p className="text-xs text-fg-subtle">Nothing to chart — the roll-up is zero.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip prefix="₹" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                      <Bar dataKey="value" name="Cost" radius={[0, 3, 3, 0]} maxBarSize={18}>
                        {chartData.map((d) => (
                          <Cell key={d.name} fill={d.colour} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>

          {product && product.standardCost > 0 && Math.abs(variance) > 0.01 && (
            <Alert tone={Math.abs(variance) / product.standardCost > 0.05 ? 'warning' : 'info'} className="mb-4">
              The published standard cost is ₹{formatAmount(product.standardCost)} from{' '}
              {product.costRolledAt ? formatDate(product.costRolledAt) : 'an earlier roll-up'}. Rolling up today gives ₹
              {formatAmount(base.total)} — {variance > 0 ? 'up' : 'down'} ₹{formatAmount(Math.abs(variance))} (
              {((Math.abs(variance) / product.standardCost) * 100).toFixed(1)}%). Publishing updates it.
            </Alert>
          )}

          {shown.warnings.length > 0 && (
            <Alert tone="danger" className="mb-4" title="The roll-up is incomplete">
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {shown.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Material lines ------------------------------------------------ */}
          <Card className="mb-4">
            <CardHeader
              title={`Material (${shown.materialLines.length} components)`}
              description="Sub-assemblies are priced from their own structures, not from a stored figure"
              actions={
                <Button variant="ghost" size="sm" onClick={() => exportMaterial('xlsx')}>
                  Export
                </Button>
              }
            />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="text-right" style={{ width: '6.5rem' }}>Qty per</th>
                      <th className="text-right" style={{ width: '5.5rem' }}>Scrap</th>
                      <th className="text-right" style={{ width: '8rem' }}>Effective qty</th>
                      <th style={{ width: '4rem' }}>UoM</th>
                      <th className="text-right" style={{ width: '9rem' }}>Unit cost</th>
                      <th className="text-right" style={{ width: '9rem' }}>Amount</th>
                      <th style={{ width: '12rem' }}>Cost source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.materialLines.map((l) => (
                      <tr key={l.itemCode}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular text-xs">{l.qtyPer}</td>
                        <td className="text-right tabular text-2xs text-fg-muted">{l.scrapPct}%</td>
                        <td className="text-right tabular text-xs">{l.effectiveQty.toFixed(4)}</td>
                        <td className="text-2xs">{l.uom}</td>
                        <td className="text-right tabular text-xs">₹{formatAmount(l.unitCost, 4)}</td>
                        <td className="text-right tabular text-xs font-medium">₹{formatAmount(l.amount)}</td>
                        <td>
                          <Badge tone={l.source === 'ROLLED' ? 'progress' : l.source === 'MISSING' ? 'danger' : 'neutral'} size="sm" dot={false}>
                            {SOURCE_LABEL[l.source]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {!shown.materialLines.length && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-2xs text-fg-subtle">No components — this product has no live BOM.</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={6} className="text-right text-xs font-semibold text-fg">Material per unit</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">₹{formatAmount(shown.materialTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* Operation lines ----------------------------------------------- */}
          <Card>
            <CardHeader
              title={`Conversion (${shown.operationLines.length} operations)`}
              description={`Setup spread over a lot of ${shown.lotSize.toLocaleString('en-IN')}, plus run time at each centre's rates`}
            />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '3.5rem' }}>Seq</th>
                      <th>Operation</th>
                      <th style={{ width: '6rem' }}>Centre</th>
                      <th className="text-right" style={{ width: '5.5rem' }}>Setup</th>
                      <th className="text-right" style={{ width: '5rem' }}>Cycle</th>
                      <th className="text-right" style={{ width: '4rem' }}>Ops</th>
                      <th className="text-right" style={{ width: '7rem' }}>Labour</th>
                      <th className="text-right" style={{ width: '7rem' }}>Machine</th>
                      <th className="text-right" style={{ width: '7rem' }}>Tooling</th>
                      <th className="text-right" style={{ width: '7rem' }}>Overhead</th>
                      <th className="text-right" style={{ width: '7.5rem' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.operationLines.map((o) => (
                      <tr key={o.seq}>
                        <td className="text-2xs tabular text-fg-subtle">{o.seq}</td>
                        <td className="text-xs font-medium text-fg">{o.operationName}</td>
                        <td className="font-mono text-2xs">{o.workCentreCode}</td>
                        <td className="text-right tabular text-2xs">{o.setupMinutes} min</td>
                        <td className="text-right tabular text-2xs">{o.cycleSeconds} s</td>
                        <td className="text-right tabular text-2xs">{o.operators}</td>
                        <td className="text-right tabular text-xs">₹{formatAmount(o.labour, 3)}</td>
                        <td className="text-right tabular text-xs">₹{formatAmount(o.machine, 3)}</td>
                        <td className="text-right tabular text-xs">₹{formatAmount(o.tooling, 3)}</td>
                        <td className="text-right tabular text-xs">₹{formatAmount(o.overhead, 3)}</td>
                        <td className="text-right tabular text-xs font-medium">₹{formatAmount(o.total)}</td>
                      </tr>
                    ))}
                    {!shown.operationLines.length && (
                      <tr>
                        <td colSpan={11} className="py-6 text-center text-2xs text-fg-subtle">
                          No operations — this product has no live routing, so conversion cost is zero.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={10} className="text-right text-xs font-semibold text-fg">Conversion per unit</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">₹{formatAmount(shown.conversionTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardBody>
          </Card>

          <p className="mt-3 text-2xs text-fg-subtle">
            Conversion cost covers only this product's own routing. A sub-assembly's labour, machine and tooling are
            included in the material line for that sub-assembly and reported under their own headings above — which is
            why the material total is not the same as the sum of bought-out components.
          </p>
        </>
      )}
    </div>
  )
}
