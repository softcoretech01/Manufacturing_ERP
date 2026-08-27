import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { newUid } from '@/store/data'
import {
  CategoryBadge, CriticalityBadge, DetailBlock, DueChip, Field, MaintStatusBadge,
  duration, hours, inr, useMaintenanceData,
} from '@/components/maintenance/MaintShell'
import {
  ASSET_CATEGORY_LABEL, assetSubtree, assetTree, coverState, daysBetween, isoDate,
  maintenanceCost, pmDue, reliabilityOf, woCost, type AssetNode,
} from '@/lib/maintFlow'
import type { AssetCategory, AssetStatus, Criticality, MaintAsset } from '@/types/maintenance'

/**
 * Asset register and hierarchy (Ch 5–6).
 *
 * The register is shown as the tree it is. A press, its hydraulic power unit
 * and the pump inside that are three assets with three failure histories, and
 * flattening them into one list is how a plant loses track of which pump was
 * changed when.
 */

type Tab = 'tree' | 'list'

const BLANK = (): Partial<MaintAsset> => ({
  code: '', name: '', category: 'PRODUCTION_MACHINE', parentCode: null,
  manufacturer: '', model: '', serialNumber: '',
  plant: 'PLANT-01', department: 'Production', productionLine: '', workCentre: '', location: '',
  installedOn: isoDate(new Date()), commissionedOn: null, warrantyUntil: null,
  amcVendor: '', amcUntil: null, financeAssetCode: null,
  purchaseCost: 0, expectedLifeYears: 15, criticality: 'B', status: 'INSTALLED',
  runningHours: 0, cycleCount: 0, ratedPowerKw: 0, requiresCalibration: false,
  photoRef: '', documents: [], criticalComponents: [], remarks: '', version: 1,
})

export function AssetsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const m = useMaintenanceData()
  const { rows, create, update, remove } = m.assets
  const today = isoDate(new Date())
  const from = isoDate(new Date(Date.now() - 89 * 86_400_000))

  const [tab, setTab] = useState<Tab>('tree')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'ALL'>('ALL')
  const [criticalityFilter, setCriticalityFilter] = useState<Criticality | 'ALL'>('ALL')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['PLANT-01', 'BLD-PROD', 'BLD-UTIL', 'LINE-DD', 'LINE-FIN', 'LINE-ASY']))
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<MaintAsset> | null>(null)

  const live = useMemo(() => rows.filter((a) => !a.deletedAt), [rows])
  const detail = live.find((a) => a.uid === openUid) ?? null

  const tree = useMemo(() => assetTree(live), [live])

  const matches = (a: MaintAsset) => {
    const q = query.trim().toLowerCase()
    return (
      (categoryFilter === 'ALL' || a.category === categoryFilter) &&
      (criticalityFilter === 'ALL' || a.criticality === criticalityFilter) &&
      (!q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.manufacturer.toLowerCase().includes(q) || a.serialNumber.toLowerCase().includes(q))
    )
  }

  const filtering = query.trim().length > 0 || categoryFilter !== 'ALL' || criticalityFilter !== 'ALL'

  /** Flatten the tree, honouring the expanded set unless a filter is active. */
  const visibleNodes = useMemo(() => {
    const out: AssetNode[] = []
    const walk = (nodes: AssetNode[]) => {
      for (const n of nodes) {
        out.push(n)
        if (n.children.length && (filtering || expanded.has(n.asset.code))) walk(n.children)
      }
    }
    walk(tree)
    return filtering ? out.filter((n) => matches(n.asset)) : out
  }, [tree, expanded, filtering, query, categoryFilter, criticalityFilter])

  const listRows = useMemo(() => live.filter(matches), [live, query, categoryFilter, criticalityFilter])

  const k = useMemo(() => {
    const classA = live.filter((a) => a.criticality === 'A')
    const covered = live.filter((a) => coverState(a, today).covered)
    const expiring = live.filter((a) => {
      const c = coverState(a, today)
      return c.covered && c.expiresIn !== null && c.expiresIn <= 60
    })
    return {
      total: live.length,
      classA: classA.length,
      down: live.filter((a) => a.status === 'BREAKDOWN' || a.status === 'UNDER_MAINTENANCE').length,
      covered: covered.length,
      expiring: expiring.length,
      grossBlock: live.reduce((s, a) => s + a.purchaseCost, 0),
      needCalibration: live.filter((a) => a.requiresCalibration).length,
    }
  }, [live, today])

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  /* ── validation ─────────────────────────────────────────────── */

  function blockers(draft: Partial<MaintAsset>, uid?: string): string[] {
    const out: string[] = []
    if (!draft.code?.trim()) out.push('An asset code is required.')
    if (!draft.name?.trim()) out.push('Give the asset a name.')
    if (draft.code && live.some((a) => a.code === draft.code && a.uid !== uid)) out.push(`Code ${draft.code} is already in use.`)
    if (draft.parentCode) {
      if (!live.some((a) => a.code === draft.parentCode)) out.push('The parent asset does not exist.')
      if (draft.parentCode === draft.code) out.push('An asset cannot be its own parent.')
      // A parent inside its own subtree would create a loop.
      if (uid && draft.code && assetSubtree(draft.code, live).includes(draft.parentCode)) {
        out.push(`${draft.parentCode} sits under ${draft.code}. Making it the parent would create a loop.`)
      }
    }
    if ((draft.purchaseCost ?? 0) < 0) out.push('Purchase cost cannot be negative.')
    if ((draft.expectedLifeYears ?? 0) <= 0) out.push('Expected life must be at least a year.')
    if (draft.commissionedOn && draft.installedOn && draft.commissionedOn < draft.installedOn) {
      out.push('An asset cannot be commissioned before it was installed.')
    }
    if ((draft.runningHours ?? 0) < 0 || (draft.cycleCount ?? 0) < 0) out.push('Meters cannot run backwards.')
    return out
  }

  /** What stops an asset being removed — the where-used check. */
  function removeBlockers(a: MaintAsset): string[] {
    const out: string[] = []
    const children = live.filter((x) => x.parentCode === a.code)
    if (children.length) out.push(`${children.length} asset(s) sit under this one and would be orphaned.`)
    const wos = m.workOrders.rows.filter((w) => !w.deletedAt && w.assetCode === a.code)
    if (wos.length) out.push(`${wos.length} work order(s) reference this asset. Its history would be lost.`)
    const plans = m.plans.rows.filter((p) => !p.deletedAt && p.assetCode === a.code)
    if (plans.length) out.push(`${plans.length} maintenance plan(s) cover this asset.`)
    const brks = m.breakdowns.rows.filter((b) => !b.deletedAt && b.assetCode === a.code)
    if (brks.length) out.push(`${brks.length} breakdown record(s) belong to this asset.`)
    return out
  }

  function save() {
    if (!editing) return
    const b = blockers(editing, editing.uid)
    if (b.length) { toast.error(b[0]); return }
    if (editing.uid) { update(editing.uid, editing as MaintAsset); toast.success(`${editing.code} updated`) }
    else { create({ ...(BLANK() as MaintAsset), ...(editing as MaintAsset), uid: newUid('ast') }); toast.success(`${editing.code} added to the register`) }
    setEditing(null)
  }

  function removeAsset(a: MaintAsset) {
    const b = removeBlockers(a)
    if (b.length) { toast.error(b[0]); return }
    remove(a.uid)
    if (openUid === a.uid) setOpenUid(null)
    toast.success(`${a.code} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const treeColumns: Column<AssetNode>[] = [
    {
      key: 'asset', header: 'Asset', width: '28rem', sortable: false,
      render: (n) => (
        <div className="flex items-center gap-1" style={{ paddingLeft: filtering ? 0 : `${n.depth * 1.1}rem` }}>
          {n.children.length > 0 && !filtering ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(n.asset.code) }}
              className="rounded p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-fg"
              aria-label={expanded.has(n.asset.code) ? 'Collapse' : 'Expand'}
            >
              <ChevronRight className={cn('h-3 w-3 transition-transform', expanded.has(n.asset.code) && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-xs text-fg">{n.asset.name}</span>
            <span className="font-mono text-2xs text-fg-subtle">{n.asset.code}{n.children.length ? ` · ${n.children.length} below` : ''}</span>
          </span>
        </div>
      ),
    },
    { key: 'category', header: 'Category', width: '12rem', render: (n) => <CategoryBadge category={n.asset.category} /> },
    { key: 'criticality', header: 'Class', width: '7rem', render: (n) => <CriticalityBadge criticality={n.asset.criticality} /> },
    { key: 'status', header: 'Status', width: '11rem', render: (n) => <MaintStatusBadge status={n.asset.status} /> },
    {
      key: 'meter', header: 'Meter', width: '12rem', align: 'right',
      render: (n) => (
        <>
          {n.asset.runningHours > 0 && <p className="text-xs tabular text-fg">{n.asset.runningHours.toLocaleString('en-IN')} h</p>}
          {n.asset.cycleCount > 0 && <p className="text-2xs tabular text-fg-subtle">{n.asset.cycleCount.toLocaleString('en-IN')} cycles</p>}
          {n.asset.runningHours === 0 && n.asset.cycleCount === 0 && <span className="text-2xs text-fg-subtle">—</span>}
        </>
      ),
    },
    {
      key: 'cover', header: 'Warranty / AMC', width: '12rem',
      render: (n) => {
        const c = coverState(n.asset, today)
        if (!c.covered) return <span className="text-2xs text-fg-subtle">Not covered</span>
        return (
          <span className="inline-flex items-center gap-1.5">
            <Badge tone={c.expiresIn !== null && c.expiresIn <= 60 ? 'warning' : 'success'} size="sm" dot={false}>{c.kind === 'WARRANTY' ? 'Warranty' : 'AMC'}</Badge>
            <span className="text-3xs text-fg-subtle">{c.expiresIn}d left</span>
          </span>
        )
      },
    },
  ]

  const listColumns: Column<MaintAsset>[] = [
    { key: 'asset', header: 'Asset', width: '22rem', render: (a) => (<><p className="truncate text-xs text-fg">{a.name}</p><p className="font-mono text-2xs text-fg-subtle">{a.code}</p></>) },
    { key: 'make', header: 'Make / model', width: '16rem', render: (a) => (<><p className="truncate text-2xs text-fg-muted">{a.manufacturer || '—'}</p><p className="text-3xs text-fg-subtle">{a.model}</p></>) },
    { key: 'serial', header: 'Serial', width: '13rem', render: (a) => <span className="font-mono text-2xs text-fg-muted">{a.serialNumber || '—'}</span> },
    { key: 'where', header: 'Where', width: '14rem', render: (a) => (<><p className="text-2xs text-fg-muted">{a.department}</p><p className="text-3xs text-fg-subtle">{a.productionLine || a.location || '—'}</p></>) },
    { key: 'category', header: 'Category', width: '12rem', render: (a) => <CategoryBadge category={a.category} /> },
    { key: 'criticality', header: 'Class', width: '7rem', render: (a) => <CriticalityBadge criticality={a.criticality} /> },
    { key: 'status', header: 'Status', width: '11rem', render: (a) => <MaintStatusBadge status={a.status} /> },
    { key: 'cost', header: 'Purchase cost', width: '12rem', align: 'right', render: (a) => <span className="text-xs tabular text-fg">{a.purchaseCost ? inr(a.purchaseCost) : '—'}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Asset register"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Assets' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>New asset</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[{ id: 'tree', label: 'Hierarchy', count: live.length }, { id: 'list', label: 'Flat list', count: listRows.length }]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Assets on the register" value={k.total} sub={`${k.classA} class A — a stoppage stops the line`} tone="brand" />
        <StatTile label="Down or in maintenance" value={k.down} sub={k.down ? 'Not available to production' : 'Everything is available'} tone={k.down ? 'danger' : 'success'} />
        <StatTile label="Under warranty or AMC" value={k.covered} sub={k.expiring ? `${k.expiring} expiring within 60 days` : 'None expiring soon'} tone={k.expiring ? 'warning' : 'success'} />
        <StatTile label="Gross block" value={`₹${(k.grossBlock / 1e7).toFixed(2)} Cr`} sub={`${k.needCalibration} assets need calibration`} tone="progress" />
      </div>

      <Card className="mb-3">
        <CardBody className="flex flex-wrap items-center gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by code, name, make or serial" leftIcon={<Search />} className="w-72" aria-label="Search assets" />
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as AssetCategory | 'ALL')} className="w-48" aria-label="Filter by category">
            <option value="ALL">Every category</option>
            {(Object.keys(ASSET_CATEGORY_LABEL) as AssetCategory[]).map((c) => (<option key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</option>))}
          </Select>
          <Select value={criticalityFilter} onChange={(e) => setCriticalityFilter(e.target.value as Criticality | 'ALL')} className="w-44" aria-label="Filter by criticality">
            <option value="ALL">Every class</option>
            <option value="A">Class A — stops the line</option>
            <option value="B">Class B — slows the line</option>
            <option value="C">Class C — no line impact</option>
          </Select>
          {filtering ? (
            <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setCategoryFilter('ALL'); setCriticalityFilter('ALL') }}>Clear</Button>
          ) : tab === 'tree' ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set(live.map((a) => a.code)))}>Expand all</Button>
              <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>Collapse all</Button>
            </>
          ) : null}
          <span className="ml-auto text-2xs text-fg-subtle">
            {filtering ? `${tab === 'tree' ? visibleNodes.length : listRows.length} match` : 'Sub-assemblies carry their own failure history'}
          </span>
        </CardBody>
      </Card>

      {tab === 'tree' ? (
        <DataTable
          rows={visibleNodes}
          columns={treeColumns}
          rowKey={(n) => n.asset.uid}
          onRowClick={(n) => setOpenUid(n.asset.uid)}
          rowClassName={(n) => (n.asset.status === 'BREAKDOWN' ? 'bg-danger/5' : n.asset.status === 'UNDER_MAINTENANCE' ? 'bg-warning/5' : undefined)}
          rowActions={(n) => (
            <>
              <MenuItem label="Edit" onClick={() => setEditing({ ...n.asset })} />
              <MenuItem label="Work orders" onClick={() => navigate('/maintenance/work-orders')} />
              <MenuItem label="Delete" danger onClick={() => removeAsset(n.asset)} />
            </>
          )}
          emptyTitle="No assets match"
          emptyDescription="Change the search or the filters."
        />
      ) : (
        <DataTable
          rows={listRows}
          columns={listColumns}
          rowKey={(a) => a.uid}
          onRowClick={(a) => setOpenUid(a.uid)}
          onExport={(f: ExportFormat) => { const n = exportRows(f, 'asset-register', 'Asset register', columnsFromTable(listColumns), listRows); toast.success('Export ready', `${n} rows written.`) }}
          rowActions={(a) => (
            <>
              <MenuItem label="Edit" onClick={() => setEditing({ ...a })} />
              <MenuItem label="Delete" danger onClick={() => removeAsset(a)} />
            </>
          )}
          emptyTitle="No assets match"
          emptyDescription="Change the search or the filters."
        />
      )}

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.code} · ${detail.name}` : ''} width="max-w-3xl">
        {detail && (() => {
          const cover = coverState(detail, today)
          const rel = reliabilityOf(detail, m.breakdowns.rows, from, today)
          const myWos = m.workOrders.rows.filter((w) => !w.deletedAt && w.assetCode === detail.code)
          const myPlans = m.plans.rows.filter((p) => !p.deletedAt && p.assetCode === detail.code)
          const myBreakdowns = m.breakdowns.rows.filter((b) => !b.deletedAt && b.assetCode === detail.code)
          const children = live.filter((a) => a.parentCode === detail.code)
          const spend = maintenanceCost(myWos, from, today)
          const lifetimeSpend = myWos.reduce((s, w) => s + woCost(w).total, 0)

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <MaintStatusBadge status={detail.status} size="md" />
                <CriticalityBadge criticality={detail.criticality} showMeaning />
                <CategoryBadge category={detail.category} />
                {detail.requiresCalibration && <Badge tone="progress" size="sm" dot={false}>Calibration required</Badge>}
              </div>

              <DetailBlock title="Identity">
                <DataGrid columns={3} items={[
                  { label: 'Manufacturer', value: detail.manufacturer || '—' },
                  { label: 'Model', value: detail.model || '—' },
                  { label: 'Serial number', value: detail.serialNumber || '—', mono: true },
                  { label: 'Plant / department', value: `${detail.plant} · ${detail.department}` },
                  { label: 'Line / work centre', value: `${detail.productionLine || '—'} · ${detail.workCentre || '—'}` },
                  { label: 'Location', value: detail.location || '—' },
                ]} />
              </DetailBlock>

              <DetailBlock title="Life and cover">
                <DataGrid columns={3} items={[
                  { label: 'Installed', value: formatDate(detail.installedOn) },
                  { label: 'Commissioned', value: detail.commissionedOn ? formatDate(detail.commissionedOn) : 'Not yet' },
                  { label: 'Age', value: `${(daysBetween(detail.installedOn, today) / 365.25).toFixed(1)} years of ${detail.expectedLifeYears}` },
                  { label: 'Purchase cost', value: detail.purchaseCost ? inr(detail.purchaseCost) : '—' },
                  { label: 'Warranty', value: detail.warrantyUntil ? formatDate(detail.warrantyUntil) : 'None' },
                  { label: 'AMC', value: detail.amcUntil ? `${detail.amcVendor} to ${formatDate(detail.amcUntil)}` : 'None' },
                ]} />
                {cover.covered ? (
                  <Alert tone={cover.expiresIn !== null && cover.expiresIn <= 60 ? 'warning' : 'tip'} className="mt-2" title={cover.kind === 'WARRANTY' ? 'Under warranty' : 'Under AMC'}>
                    {cover.expiresIn} days of cover left. Any repair after that date is chargeable, so plan the work while it is still free.
                  </Alert>
                ) : (
                  <Alert tone="info" className="mt-2" title="Not under cover">Repairs are chargeable in full.</Alert>
                )}
              </DetailBlock>

              <DetailBlock title="Meters">
                <DataGrid columns={3} items={[
                  { label: 'Running hours', value: detail.runningHours ? hours(detail.runningHours) : '—' },
                  { label: 'Cycles', value: detail.cycleCount ? detail.cycleCount.toLocaleString('en-IN') : '—' },
                  { label: 'Rated power', value: detail.ratedPowerKw ? `${detail.ratedPowerKw} kW` : '—' },
                ]} />
              </DetailBlock>

              <DetailBlock title="Reliability — last 90 days">
                <DataGrid columns={4} items={[
                  { label: 'Failures', value: String(rel.failures) },
                  { label: 'Downtime', value: duration(rel.downtimeMinutes) },
                  { label: 'MTBF', value: rel.mtbfHours === null ? 'No failures' : hours(rel.mtbfHours) },
                  { label: 'MTTR', value: rel.mttrHours === null ? 'No repair closed' : hours(rel.mttrHours) },
                ]} />
                <p className={cn('mt-2 text-xs font-medium', rel.availabilityPct >= 98 ? 'text-success' : rel.availabilityPct >= 95 ? 'text-warning' : 'text-danger')}>
                  {rel.availabilityPct.toFixed(1)}% available
                </p>
              </DetailBlock>

              <DetailBlock title="Maintenance spend">
                <DataGrid columns={3} items={[
                  { label: 'Last 90 days', value: inr(spend.total) },
                  { label: 'All recorded work', value: inr(lifetimeSpend) },
                  { label: 'As a share of cost', value: detail.purchaseCost > 0 ? `${((lifetimeSpend / detail.purchaseCost) * 100).toFixed(1)}%` : '—' },
                ]} />
              </DetailBlock>

              {myPlans.length > 0 && (
                <DetailBlock title={`Maintenance plans (${myPlans.length})`}>
                  <div className="space-y-1.5">
                    {myPlans.map((p) => {
                      const due = pmDue(p, detail, today)
                      return (
                        <div key={p.uid} className={cn('flex items-center gap-2 rounded border p-2', due.isOverdue ? 'border-danger/40 bg-danger/5' : 'border-border')}>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-fg">{p.name}</span>
                            <span className="block text-3xs text-fg-subtle">{p.code} · {due.basis}</span>
                          </span>
                          {due.isOverdue ? <Badge tone="danger" size="sm">Overdue</Badge> : due.isDue ? <Badge tone="warning" size="sm">Due</Badge> : <Badge tone="success" size="sm">In interval</Badge>}
                        </div>
                      )
                    })}
                  </div>
                </DetailBlock>
              )}

              {children.length > 0 && (
                <DetailBlock title={`Sub-assemblies (${children.length})`}>
                  <div className="flex flex-wrap gap-1.5">
                    {children.map((c) => (
                      <button key={c.uid} type="button" onClick={() => setOpenUid(c.uid)} className="rounded border border-border px-2 py-1 text-2xs text-fg-muted transition-colors hover:border-brand-400 hover:text-fg">
                        {c.code} · {c.name}
                      </button>
                    ))}
                  </div>
                </DetailBlock>
              )}

              {detail.criticalComponents.length > 0 && (
                <DetailBlock title="Critical components">
                  <div className="flex flex-wrap gap-1.5">
                    {detail.criticalComponents.map((c) => (<Badge key={c} tone="warning" size="sm" dot={false}>{c}</Badge>))}
                  </div>
                </DetailBlock>
              )}

              {detail.documents.length > 0 && (
                <DetailBlock title="Documents">
                  <div className="space-y-1">
                    {detail.documents.map((doc, i) => (
                      <p key={i} className="flex items-baseline gap-2 text-2xs">
                        <Badge tone="neutral" size="sm" dot={false}>{doc.kind.toLowerCase()}</Badge>
                        <span className="text-fg">{doc.title}</span>
                        <span className="ml-auto font-mono text-3xs text-fg-subtle">{doc.ref}</span>
                      </p>
                    ))}
                  </div>
                </DetailBlock>
              )}

              {myBreakdowns.length > 0 && (
                <DetailBlock title={`Failure history (${myBreakdowns.length})`}>
                  <div className="space-y-1.5">
                    {myBreakdowns.slice(0, 5).map((b) => (
                      <div key={b.uid} className="rounded border border-border p-2">
                        <p className="flex items-baseline gap-2">
                          <span className="font-mono text-2xs text-fg">{b.docNo}</span>
                          <span className="text-3xs text-fg-subtle">{formatDate(b.reportedAt.slice(0, 10))}</span>
                          <span className="ml-auto"><MaintStatusBadge status={b.status} /></span>
                        </p>
                        <p className="mt-0.5 truncate text-2xs text-fg-muted">{b.symptoms}</p>
                        {b.rootCause && <p className="mt-0.5 text-3xs text-fg-subtle"><span className="text-fg-muted">Cause:</span> {b.rootCause.slice(0, 120)}{b.rootCause.length > 120 ? '…' : ''}</p>}
                      </div>
                    ))}
                  </div>
                </DetailBlock>
              )}

              {detail.remarks && <DetailBlock title="Notes"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>}

              {(() => {
                const rb = removeBlockers(detail)
                return rb.length > 0 ? (
                  <Alert tone="info" title="What depends on this asset">
                    <ul className="list-disc space-y-0.5 pl-4">{rb.map((x) => (<li key={x}>{x}</li>))}</ul>
                  </Alert>
                ) : (
                  <Alert tone="tip" title="Nothing depends on this asset">It can be removed without losing any history.</Alert>
                )
              })()}

              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail }); setOpenUid(null) }}>Edit</Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/maintenance/work-orders')}>Work orders</Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/maintenance/pm')}>Plans</Button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.code}` : 'New asset'}
        width="max-w-2xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Asset code" required value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="MC-PRESS-02" />
              <Select label="Category" value={editing.category ?? 'PRODUCTION_MACHINE'} onChange={(e) => setEditing({ ...editing, category: e.target.value as AssetCategory })}>
                {(Object.keys(ASSET_CATEGORY_LABEL) as AssetCategory[]).map((c) => (<option key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</option>))}
              </Select>
            </div>
            <Input label="Name" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Select
              label="Sits under"
              value={editing.parentCode ?? ''}
              onChange={(e) => setEditing({ ...editing, parentCode: e.target.value || null })}
              hint="Its parent in the hierarchy. Leave blank for a top-level asset."
            >
              <option value="">Top level</option>
              {live
                .filter((a) => a.uid !== editing.uid && !(editing.code && assetSubtree(editing.code, live).includes(a.code)))
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
            </Select>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Manufacturer" value={editing.manufacturer ?? ''} onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })} />
              <Input label="Model" value={editing.model ?? ''} onChange={(e) => setEditing({ ...editing, model: e.target.value })} />
              <Input label="Serial number" value={editing.serialNumber ?? ''} onChange={(e) => setEditing({ ...editing, serialNumber: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Department" value={editing.department ?? ''} onChange={(e) => setEditing({ ...editing, department: e.target.value })} />
              <Input label="Production line" value={editing.productionLine ?? ''} onChange={(e) => setEditing({ ...editing, productionLine: e.target.value })} />
              <Input label="Work centre" value={editing.workCentre ?? ''} onChange={(e) => setEditing({ ...editing, workCentre: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Installed on" type="date" value={editing.installedOn ?? ''} onChange={(e) => setEditing({ ...editing, installedOn: e.target.value })} />
              <Input label="Commissioned on" type="date" value={editing.commissionedOn ?? ''} onChange={(e) => setEditing({ ...editing, commissionedOn: e.target.value || null })} />
              <Input label="Location" value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Select label="Criticality" value={editing.criticality ?? 'B'} onChange={(e) => setEditing({ ...editing, criticality: e.target.value as Criticality })} hint="Drives work order priority">
                <option value="A">A — stops the line</option>
                <option value="B">B — slows the line</option>
                <option value="C">C — no line impact</option>
              </Select>
              <Select label="Status" value={editing.status ?? 'INSTALLED'} onChange={(e) => setEditing({ ...editing, status: e.target.value as AssetStatus })}>
                {['INSTALLED', 'COMMISSIONED', 'RUNNING', 'IDLE', 'UNDER_MAINTENANCE', 'BREAKDOWN', 'SHUTDOWN', 'DECOMMISSIONED'].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
                ))}
              </Select>
              <Input label="Rated power (kW)" type="number" value={String(editing.ratedPowerKw ?? 0)} onChange={(e) => setEditing({ ...editing, ratedPowerKw: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Purchase cost" type="number" value={String(editing.purchaseCost ?? 0)} onChange={(e) => setEditing({ ...editing, purchaseCost: Number(e.target.value) })} />
              <Input label="Expected life (years)" type="number" value={String(editing.expectedLifeYears ?? 15)} onChange={(e) => setEditing({ ...editing, expectedLifeYears: Number(e.target.value) })} />
              <Input label="Finance asset code" value={editing.financeAssetCode ?? ''} onChange={(e) => setEditing({ ...editing, financeAssetCode: e.target.value || null })} hint="Links to the fixed-asset register" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Running hours" type="number" value={String(editing.runningHours ?? 0)} onChange={(e) => setEditing({ ...editing, runningHours: Number(e.target.value) })} hint="Drives hour-based plans" />
              <Input label="Cycle count" type="number" value={String(editing.cycleCount ?? 0)} onChange={(e) => setEditing({ ...editing, cycleCount: Number(e.target.value) })} hint="Drives cycle-based plans" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Warranty until" type="date" value={editing.warrantyUntil ?? ''} onChange={(e) => setEditing({ ...editing, warrantyUntil: e.target.value || null })} />
              <Input label="AMC vendor" value={editing.amcVendor ?? ''} onChange={(e) => setEditing({ ...editing, amcVendor: e.target.value })} />
              <Input label="AMC until" type="date" value={editing.amcUntil ?? ''} onChange={(e) => setEditing({ ...editing, amcUntil: e.target.value || null })} />
            </div>
            <Switch label="Requires calibration" checked={!!editing.requiresCalibration} onChange={(v) => setEditing({ ...editing, requiresCalibration: v })} />
            <Textarea label="Notes" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />

            {(() => {
              const b = blockers(editing, editing.uid)
              return b.length ? <Alert tone="danger" title="Cannot save yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert> : null
            })()}
          </div>
        )}
      </Drawer>
    </div>
  )
}
