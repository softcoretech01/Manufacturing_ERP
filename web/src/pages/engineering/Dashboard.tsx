import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calculator,
  ClipboardCheck,
  FileWarning,
  GitBranch,
  Layers,
  Plus,
  Wrench,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { ChangeTypeBadge, ChartTip, EngStatusBadge, LifecycleBadge, ToolLifeBar } from '@/components/engineering/EngShell'
import { cn } from '@/lib/cn'
import { formatAmount, formatDate } from '@/lib/format'
import {
  NO_SIMULATION,
  defaultBomFor,
  defaultRoutingFor,
  isLiveBom,
  releaseBlockers,
  rollUpCost,
  toolNeedsAttention,
} from '@/lib/engFlow'
import { useEngineeringCollection } from '@/store/engData'
import { useCollection } from '@/store/data'
import {
  boms as seedBoms,
  engChanges as seedChanges,
  engDocuments as seedDocs,
  engTrend,
  products as seedProducts,
  routings as seedRoutings,
  tools as seedTools,
  workCentres as seedWorkCentres,
} from '@/mock/engineering'
import { items as masterItems } from '@/mock/masters'
import type { Bom, EngChange, EngDocument, EngProduct, EngWorkCentre, Routing, Tool } from '@/types/engineering'
import { engineeringApi as api } from '@/api/engineering'

/**
 * Product engineering dashboard (Ch 21).
 *
 * Everything here is a question someone actually asks on a Monday: what is
 * waiting on me, what is blocked, and where has the standard cost drifted away
 * from what the structure now says. The tiles are the only KPI cards in the
 * portal — every other screen starts with its data.
 */

const OPEN_CHANGE_STATES: EngChange['status'][] = ['DRAFT', 'UNDER_REVIEW', 'PENDING_APPROVAL']

export function EngineeringDashboardPage() {
  const navigate = useNavigate()
  const { rows: products } = useEngineeringCollection<EngProduct>('eng:products', useMemo(() => seedProducts, []))
  const { rows: boms } = useEngineeringCollection<Bom>('eng:boms', useMemo(() => seedBoms, []))
  const { rows: routings } = useEngineeringCollection<Routing>('eng:routings', useMemo(() => seedRoutings, []))
  const { rows: workCentres } = useEngineeringCollection<EngWorkCentre>('eng:workcentres', useMemo(() => seedWorkCentres, []))
  const { rows: tools } = useEngineeringCollection<Tool>('eng:tools', useMemo(() => seedTools, []))
  const { rows: changes } = useEngineeringCollection<EngChange>('eng:changes', useMemo(() => seedChanges, []))
  const { rows: documents } = useEngineeringCollection<EngDocument>('eng:documents', useMemo(() => seedDocs, []))

  const ctx = { boms, routings, workCentres, tools, items: masterItems, products }

  const kpis = useMemo(() => {
    const inProduction = products.filter((p) => p.lifecycle === 'PRODUCTION')
    const inDevelopment = products.filter((p) => ['CONCEPT', 'DESIGN', 'PROTOTYPE', 'TESTING'].includes(p.lifecycle))
    const openChanges = changes.filter((c) => OPEN_CHANGE_STATES.includes(c.status))
    const approvedNotApplied = changes.filter((c) => c.status === 'APPROVED')
    const pendingBoms = boms.filter((b) => b.status === 'PENDING_APPROVAL' || b.status === 'DRAFT')
    const pendingRoutings = routings.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'DRAFT')
    const pendingDocs = documents.filter((d) => d.status === 'PENDING_APPROVAL' || d.status === 'DRAFT')
    const toolsAtRisk = tools.filter(toolNeedsAttention)

    // Products whose published standard cost has drifted from the live structure.
    const drift = products
      .filter((p) => p.standardCost > 0)
      .map((p) => {
        const roll = rollUpCost(p.code, ctx, NO_SIMULATION)
        return { product: p, rolled: roll.total, delta: roll.total - p.standardCost, warnings: roll.warnings.length }
      })
      .filter((d) => Math.abs(d.delta) > 0.01)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

    // Products that cannot reach production, and why.
    const blocked = products
      .filter((p) => p.lifecycle !== 'PRODUCTION' && p.lifecycle !== 'ARCHIVED' && p.lifecycle !== 'OBSOLETE')
      .map((p) => ({ product: p, blockers: releaseBlockers(p, { boms, routings }) }))
      .filter((b) => b.blockers.length > 0)

    const missingStructure = products.filter(
      (p) => p.lifecycle === 'PRODUCTION' && (!defaultBomFor(p.code, boms) || !defaultRoutingFor(p.code, routings)),
    )

    return {
      inProduction,
      inDevelopment,
      openChanges,
      approvedNotApplied,
      pendingBoms,
      pendingRoutings,
      pendingDocs,
      toolsAtRisk,
      drift,
      blocked,
      missingStructure,
      liveBoms: boms.filter(isLiveBom).length,
      liveRoutings: routings.filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED').length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, boms, routings, workCentres, tools, changes, documents])

  const actionQueue = [
    { label: 'BOMs awaiting approval', count: kpis.pendingBoms.length, to: '/engineering/bom', icon: Boxes, tone: 'pending' as const },
    { label: 'Routings awaiting approval', count: kpis.pendingRoutings.length, to: '/engineering/routing', icon: ClipboardCheck, tone: 'pending' as const },
    { label: 'Changes waiting on a decision', count: kpis.openChanges.length, to: '/engineering/changes', icon: GitBranch, tone: 'progress' as const },
    { label: 'Approved changes not yet applied', count: kpis.approvedNotApplied.length, to: '/engineering/changes', icon: AlertTriangle, tone: 'danger' as const },
    { label: 'Products blocked from release', count: kpis.blocked.length, to: '/engineering/products', icon: Layers, tone: 'warning' as const },
    { label: 'Documents awaiting approval', count: kpis.pendingDocs.length, to: '/engineering/documents', icon: FileWarning, tone: 'progress' as const },
    { label: 'Tools near end of life or calibration', count: kpis.toolsAtRisk.length, to: '/engineering/tools', icon: Wrench, tone: 'warning' as const },
    { label: 'Products with a drifted standard cost', count: kpis.drift.length, to: '/engineering/costing', icon: Calculator, tone: 'warning' as const },
  ]

  /** Rolled cost of every product in production, split into material and conversion. */
  const costChart = useMemo(
    () =>
      kpis.inProduction.slice(0, 6).map((p) => {
        const roll = rollUpCost(p.code, ctx, NO_SIMULATION)
        return {
          name: p.code.replace(/^(FG|SF)-/, ''),
          Material: Number(roll.materialTotal.toFixed(2)),
          Conversion: Number(roll.conversionTotal.toFixed(2)),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kpis.inProduction, boms, routings, workCentres, tools],
  )

  return (
    <div>
      <PageHeader
        title="Product engineering"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/engineering/bom-explorer')}>
              Explode a BOM
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/engineering/products')}>
              New product
            </Button>
          </>
        }
      />

      {/* KPI row ------------------------------------------------------------ */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Products in production"
          value={kpis.inProduction.length}
          sub={`${kpis.inDevelopment.length} more in development`}
          icon={<Boxes />}
          tone="brand"
          onClick={() => navigate('/engineering/products')}
        />
        <StatTile
          label="Live structures"
          value={kpis.liveBoms}
          sub={`${kpis.liveRoutings} live routings`}
          icon={<Layers />}
          tone="progress"
          onClick={() => navigate('/engineering/bom')}
        />
        <StatTile
          label="Open engineering changes"
          value={kpis.openChanges.length}
          sub={kpis.approvedNotApplied.length ? `${kpis.approvedNotApplied.length} approved, not applied` : 'None waiting to be applied'}
          icon={<GitBranch />}
          tone={kpis.approvedNotApplied.length ? 'danger' : 'pending'}
          onClick={() => navigate('/engineering/changes')}
        />
        <StatTile
          label="Standard cost drift"
          value={kpis.drift.length}
          sub={kpis.drift.length ? `Largest ₹${formatAmount(Math.abs(kpis.drift[0].delta))} on ${kpis.drift[0].product.code}` : 'Every product matches its structure'}
          icon={<Calculator />}
          tone={kpis.drift.length ? 'warning' : 'success'}
          onClick={() => navigate('/engineering/costing')}
        />
      </div>

      {/* Action queue -------------------------------------------------------- */}
      <Section title="Needs attention">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {actionQueue.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className={cn(
                'card flex items-center gap-3 p-3 transition-colors hover:border-border-strong hover:bg-surface-2',
                a.count === 0 && 'opacity-55',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded [&>svg]:h-4 [&>svg]:w-4',
                  a.tone === 'danger' && 'bg-danger/10 text-danger',
                  a.tone === 'warning' && 'bg-warning/10 text-warning',
                  a.tone === 'pending' && 'bg-pending/10 text-pending',
                  a.tone === 'progress' && 'bg-progress/10 text-progress',
                )}
              >
                <a.icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold leading-none text-fg tabular">{a.count}</span>
                <span className="mt-1 block truncate text-xs text-fg-muted">{a.label}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            </Link>
          ))}
        </div>
      </Section>

      {/* Charts -------------------------------------------------------------- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Cost structure by product" description="Rolled up from the live BOM and routing, per finished unit" />
          <CardBody className="h-64">
            {!costChart.length ? (
              <p className="text-xs text-fg-subtle">No products are in production yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTip prefix="₹" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar dataKey="Material" stackId="a" fill="#3b82f6" maxBarSize={40} />
                  <Bar dataKey="Conversion" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Engineering throughput" description="Revisions raised and changes closed per month" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={26} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
                <Bar dataKey="bomRevisions" name="BOM rev" stackId="a" fill="#3b82f6" maxBarSize={22} />
                <Bar dataKey="routingRevisions" name="Routing rev" stackId="a" fill="#8b5cf6" maxBarSize={22} />
                <Bar dataKey="changesClosed" name="Changes closed" stackId="a" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Watch lists --------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Changes waiting on a decision"
            description="Requests under review and notices in the approval chain"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate('/engineering/changes')}>
                Open
              </Button>
            }
          />
          <CardBody className="p-0">
            {!kpis.openChanges.length && !kpis.approvedNotApplied.length ? (
              <p className="p-4 text-xs text-fg-subtle">Nothing is waiting. Every raised change has been decided and applied.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>Title</th>
                      <th style={{ width: '10rem' }}>Product</th>
                      <th style={{ width: '8rem' }}>Effective</th>
                      <th style={{ width: '10rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...kpis.approvedNotApplied, ...kpis.openChanges].map((c) => (
                      <tr key={c.uid} className={c.status === 'APPROVED' ? 'bg-danger/5' : undefined}>
                        <td>
                          <span className="flex items-center gap-1.5">
                            <ChangeTypeBadge type={c.changeType} />
                            <span className="font-mono text-2xs text-brand-600">{c.docNo}</span>
                          </span>
                        </td>
                        <td className="max-w-[18rem] truncate text-xs text-fg">{c.title}</td>
                        <td className="font-mono text-2xs text-fg-muted">{c.productCode}</td>
                        <td className="text-2xs text-fg-muted">{formatDate(c.effectiveFrom)}</td>
                        <td>
                          <EngStatusBadge status={c.status} size="sm" />
                          {c.status === 'APPROVED' && <p className="mt-0.5 text-2xs text-danger">Not yet applied</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Blocked from release" description="What each product still needs" />
            <CardBody className="space-y-2.5">
              {!kpis.blocked.length ? (
                <p className="text-xs text-fg-subtle">Every product in development is ready for its next step.</p>
              ) : (
                kpis.blocked.slice(0, 5).map(({ product, blockers }) => (
                  <Link key={product.uid} to="/engineering/products" className="block border-b border-border pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-2xs font-medium text-brand-600">{product.code}</p>
                        <p className="mt-0.5 text-2xs text-fg-muted">{blockers[0]}</p>
                        {blockers.length > 1 && <p className="text-2xs text-fg-subtle">and {blockers.length - 1} more</p>}
                      </div>
                      <LifecycleBadge state={product.lifecycle} size="sm" />
                    </div>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tool life" description="Nearest to replacement" />
            <CardBody className="space-y-2.5">
              {!tools.length ? (
                <p className="text-xs text-fg-subtle">No tools registered.</p>
              ) : (
                [...tools]
                  .filter((t) => t.lifeStrokes > 0 && t.status !== 'RETIRED')
                  .sort((a, b) => b.usedStrokes / b.lifeStrokes - a.usedStrokes / a.lifeStrokes)
                  .slice(0, 5)
                  .map((t) => (
                    <Link key={t.uid} to="/engineering/tools" className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-fg">{t.name}</p>
                        <p className="font-mono text-2xs text-fg-subtle">{t.code}</p>
                      </div>
                      <ToolLifeBar tool={t} />
                    </Link>
                  ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Work centre rates" description="Loaded cost of one hour" />
            <CardBody className="space-y-2.5">
              {workCentres.slice(0, 6).map((w) => {
                const loaded = (w.machineRatePerHour + w.labourRatePerHour) * (1 + w.overheadPct / 100)
                const max = Math.max(...workCentres.map((x) => (x.machineRatePerHour + x.labourRatePerHour) * (1 + x.overheadPct / 100)))
                return (
                  <div key={w.uid}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-mono text-2xs text-fg">{w.code}</span>
                      <span className="tabular text-2xs text-fg-muted">₹{formatAmount(loaded, 0)}/h</span>
                    </div>
                    <ProgressBar value={max > 0 ? (loaded / max) * 100 : 0} tone={loaded > max * 0.75 ? 'warning' : 'brand'} />
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Standard cost drift -------------------------------------------------- */}
      {kpis.drift.length > 0 && (
        <Section title="Standard cost drift" className="mt-6">
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ width: '9rem' }}>Lifecycle</th>
                      <th className="text-right" style={{ width: '10rem' }}>Published</th>
                      <th className="text-right" style={{ width: '10rem' }}>Rolled today</th>
                      <th className="text-right" style={{ width: '10rem' }}>Difference</th>
                      <th className="text-right" style={{ width: '7rem' }}>Change</th>
                      <th style={{ width: '7rem' }}>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.drift.map((d) => (
                      <tr key={d.product.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{d.product.name}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{d.product.code}</p>
                        </td>
                        <td><LifecycleBadge state={d.product.lifecycle} size="sm" /></td>
                        <td className="text-right tabular text-xs text-fg-muted">₹{formatAmount(d.product.standardCost)}</td>
                        <td className="text-right tabular text-xs font-medium text-fg">₹{formatAmount(d.rolled)}</td>
                        <td className={cn('text-right tabular text-xs font-medium', d.delta > 0 ? 'text-danger' : 'text-success')}>
                          {d.delta > 0 ? '+' : ''}₹{formatAmount(d.delta)}
                        </td>
                        <td className={cn('text-right tabular text-2xs', d.delta > 0 ? 'text-danger' : 'text-success')}>
                          {d.delta > 0 ? '+' : ''}
                          {((d.delta / d.product.standardCost) * 100).toFixed(1)}%
                        </td>
                        <td>
                          {d.warnings > 0 ? (
                            <Badge tone="warning" size="sm">{d.warnings}</Badge>
                          ) : (
                            <span className="text-2xs text-fg-subtle">none</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
          <p className="mt-2 text-2xs text-fg-subtle">
            The published standard cost is what finance values output at. When the structure moves and the cost is not
            republished, every production order posts a variance that nobody raised.
          </p>
        </Section>
      )}

      {kpis.missingStructure.length > 0 && (
        <Section title="In production without a complete structure" className="mt-6">
          <Card>
            <CardBody className="space-y-2">
              {kpis.missingStructure.map((p) => (
                <p key={p.uid} className="text-xs text-fg-muted">
                  <span className="font-mono text-fg">{p.code}</span> is released to production but has{' '}
                  {!defaultBomFor(p.code, boms) ? 'no live bill of material' : 'no live routing'} — planning and the shop
                  floor have nothing to work from.
                </p>
              ))}
            </CardBody>
          </Card>
        </Section>
      )}
    </div>
  )
}
