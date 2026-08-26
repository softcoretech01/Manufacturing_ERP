import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Coins,
  Download,
  Factory,
  GitBranch,
  ListTree,
  Pencil,
  Settings2,
  Warehouse as WarehouseIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataRow, EmptyState } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { useOrgStructure } from '@/hooks/useOrganisation'
import { useSession } from '@/api/session'
import type {
  OrgStructure,
  StructureBranch,
  StructurePlant,
  StructureUnit,
  StructureWarehouse,
} from '@/api/organisation'
import { CompanySetupWizard } from './CompanySetupWizard'

/** Live organisation structure — company → branch → plant → warehouse, plus
 *  departments and cost centres, all from the backend `/structure` read model. */

type NodeKind = 'company' | 'branch' | 'plant' | 'warehouse' | 'department' | 'cost_centre'
interface Selection {
  kind: NodeKind
  uid: string
}

// Each editable kind maps to the master screen that owns it.
const EDIT_ROUTE: Partial<Record<NodeKind, string>> = {
  company: '/admin/company',
  branch: '/admin/branches',
  plant: '/admin/plants',
  warehouse: '/admin/warehouses',
  department: '/admin/departments',
  cost_centre: '/admin/cost-centres',
}

export function OrganisationExplorerPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useOrgStructure()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [seeded, setSeeded] = useState(false)
  const [sel, setSel] = useState<Selection | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  // Seed the initial expansion (company + groups + first branch) ONCE when the
  // data first lands. Previously this was a fallback used only while `expanded`
  // was empty, so the first toggle discarded every default and collapsed the
  // whole tree to the company row. Seeding into state keeps the defaults and lets
  // the user toggle from there.
  useEffect(() => {
    if (seeded || !data?.company) return
    const s = new Set<string>([data.company.uid, 'group:departments', 'group:cost_centres'])
    if (data.branches[0]) s.add(data.branches[0].uid)
    setExpanded(s)
    setSeeded(true)
  }, [seeded, data])

  const eff = expanded

  function doExport(format: ExportFormat) {
    if (!data) return
    try {
      const rows = flatten(data)
      const columns: ExportColumn<FlatRow>[] = [
        { header: 'Level', value: (r) => r.level },
        { header: 'Type', value: (r) => r.type },
        { header: 'Code', value: (r) => r.code },
        { header: 'Name', value: (r) => r.name },
        { header: 'Parent', value: (r) => r.parent ?? '' },
        { header: 'Detail', value: (r) => r.detail ?? '' },
        { header: 'Status', value: (r) => r.status },
      ]
      const n = exportRows(format, 'organisation-structure', 'Organisation structure', columns, rows)
      toast.success('Export ready', `${n} rows saved as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Organisation structure"
        description="Company → branch → plant → warehouse, plus departments and cost centres. Live from the backend."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Structure explorer' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => doExport('xlsx')} disabled={!data}>
              Export structure
            </Button>
            <Button variant="primary" size="sm" icon={<Settings2 className="h-4 w-4" />} onClick={() => setWizardOpen(true)}>
              Company setup wizard
            </Button>
          </>
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load the structure">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* ── Tree ─────────────────────────────────────────────────────── */}
        <Card className="h-fit">
          <CardHeader title="Hierarchy" description="Click any node to inspect it" />
          <div className="max-h-[70vh] overflow-y-auto p-2 text-sm">
            {isLoading && <p className="px-2 py-6 text-center text-xs text-fg-subtle">Loading structure…</p>}
            {!isLoading && !data?.company && (
              <p className="px-2 py-6 text-center text-xs text-fg-subtle">No company found.</p>
            )}
            {data?.company && (
              <Tree
                data={data}
                expanded={eff}
                onToggle={toggle}
                sel={sel}
                onSelect={setSel}
              />
            )}
          </div>
        </Card>

        {/* ── Detail pane ──────────────────────────────────────────────── */}
        <div className="min-w-0">
          {data ? (
            <DetailPane sel={sel} data={data} />
          ) : (
            <Card className="p-8 text-center text-sm text-fg-subtle">Loading…</Card>
          )}
        </div>
      </div>

      <CompanySetupWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  )
}

/* ─────────────────────────── Tree ─────────────────────────── */
function Tree({
  data,
  expanded,
  onToggle,
  sel,
  onSelect,
}: {
  data: OrgStructure
  expanded: Set<string>
  onToggle: (id: string) => void
  sel: Selection | null
  onSelect: (s: Selection) => void
}) {
  const c = data.company!
  const isOpen = (id: string) => expanded.has(id)
  const active = (kind: NodeKind, uid: string) => sel?.kind === kind && sel.uid === uid

  return (
    <div>
      {/* Company */}
      <Row
        depth={0}
        label={c.legal_name}
        meta={c.code}
        icon={<Building2 className="h-4 w-4" />}
        expandable
        expanded={isOpen(c.uid)}
        active={active('company', c.uid)}
        onToggle={() => onToggle(c.uid)}
        onClick={() => onSelect({ kind: 'company', uid: c.uid })}
      />
      {isOpen(c.uid) && (
        <>
          {data.branches.map((b) => (
            <BranchNode key={b.uid} branch={b} depth={1} expanded={expanded} onToggle={onToggle} sel={sel} onSelect={onSelect} />
          ))}

          {/* Departments group */}
          <GroupNode
            id="group:departments"
            label="Departments"
            count={data.departments.length}
            icon={<ListTree className="h-4 w-4" />}
            expanded={isOpen('group:departments')}
            onToggle={() => onToggle('group:departments')}
          />
          {isOpen('group:departments') &&
            data.departments.map((d) => (
              <Row key={d.uid} depth={2} label={d.name} meta={d.code} icon={<ListTree className="h-3.5 w-3.5" />}
                active={active('department', d.uid)} onClick={() => onSelect({ kind: 'department', uid: d.uid })} />
            ))}

          {/* Cost centres group */}
          <GroupNode
            id="group:cost_centres"
            label="Cost centres"
            count={data.cost_centres.length}
            icon={<Coins className="h-4 w-4" />}
            expanded={isOpen('group:cost_centres')}
            onToggle={() => onToggle('group:cost_centres')}
          />
          {isOpen('group:cost_centres') &&
            data.cost_centres.map((cc) => (
              <Row key={cc.uid} depth={2} label={cc.name} meta={cc.code} icon={<Coins className="h-3.5 w-3.5" />}
                active={active('cost_centre', cc.uid)} onClick={() => onSelect({ kind: 'cost_centre', uid: cc.uid })} />
            ))}
        </>
      )}
    </div>
  )
}

function BranchNode({
  branch,
  depth,
  expanded,
  onToggle,
  sel,
  onSelect,
}: {
  branch: StructureBranch
  depth: number
  expanded: Set<string>
  onToggle: (id: string) => void
  sel: Selection | null
  onSelect: (s: Selection) => void
}) {
  const open = expanded.has(branch.uid)
  const hasChildren = branch.plants.length > 0 || branch.warehouses.length > 0
  return (
    <>
      <Row
        depth={depth}
        label={branch.name}
        meta={branch.code}
        icon={<GitBranch className="h-4 w-4" />}
        expandable={hasChildren}
        expanded={open}
        active={sel?.kind === 'branch' && sel.uid === branch.uid}
        dim={!branch.is_active}
        onToggle={() => onToggle(branch.uid)}
        onClick={() => onSelect({ kind: 'branch', uid: branch.uid })}
      />
      {open && (
        <>
          {branch.plants.map((p) => (
            <PlantNode key={p.uid} plant={p} depth={depth + 1} expanded={expanded} onToggle={onToggle} sel={sel} onSelect={onSelect} />
          ))}
          {branch.warehouses.map((w) => (
            <Row key={w.uid} depth={depth + 1} label={w.name} meta={w.code} icon={<WarehouseIcon className="h-3.5 w-3.5" />}
              dim={!w.is_active} active={sel?.kind === 'warehouse' && sel.uid === w.uid}
              onClick={() => onSelect({ kind: 'warehouse', uid: w.uid })} />
          ))}
        </>
      )}
    </>
  )
}

function PlantNode({
  plant,
  depth,
  expanded,
  onToggle,
  sel,
  onSelect,
}: {
  plant: StructurePlant
  depth: number
  expanded: Set<string>
  onToggle: (id: string) => void
  sel: Selection | null
  onSelect: (s: Selection) => void
}) {
  const open = expanded.has(plant.uid)
  return (
    <>
      <Row
        depth={depth}
        label={plant.name}
        meta={plant.code}
        icon={<Factory className="h-4 w-4" />}
        expandable={plant.warehouses.length > 0}
        expanded={open}
        dim={!plant.is_active}
        active={sel?.kind === 'plant' && sel.uid === plant.uid}
        onToggle={() => onToggle(plant.uid)}
        onClick={() => onSelect({ kind: 'plant', uid: plant.uid })}
      />
      {open &&
        plant.warehouses.map((w) => (
          <Row key={w.uid} depth={depth + 1} label={w.name} meta={w.code} icon={<WarehouseIcon className="h-3.5 w-3.5" />}
            dim={!w.is_active} active={sel?.kind === 'warehouse' && sel.uid === w.uid}
            onClick={() => onSelect({ kind: 'warehouse', uid: w.uid })} />
        ))}
    </>
  )
}

function GroupNode({ id, label, count, icon, expanded, onToggle }: { id: string; label: string; count: number; icon: ReactNode; expanded: boolean; onToggle: () => void }) {
  return (
    <Row depth={1} label={label} meta={String(count)} icon={icon} expandable={count > 0} expanded={expanded} onToggle={onToggle} onClick={onToggle} muted />
  )
}

function Row({
  depth,
  label,
  meta,
  icon,
  expandable,
  expanded,
  active,
  dim,
  muted,
  onToggle,
  onClick,
}: {
  depth: number
  label: string
  meta?: string
  icon: ReactNode
  expandable?: boolean
  expanded?: boolean
  active?: boolean
  dim?: boolean
  muted?: boolean
  onToggle?: () => void
  onClick?: () => void
}) {
  return (
    <div
      className={cn('group flex items-center gap-1 rounded px-1 py-1 transition-colors', active ? 'bg-brand-500/10' : 'hover:bg-surface-3')}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
    >
      <button
        onClick={onToggle}
        className={cn('shrink-0 rounded p-0.5 text-fg-subtle', !expandable && 'invisible')}
        tabIndex={expandable ? 0 : -1}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <span className={cn('shrink-0', active ? 'text-brand-600' : 'text-fg-subtle')}>{icon}</span>
        <span className={cn('truncate text-xs', muted ? 'font-semibold uppercase tracking-wide text-fg-subtle' : active ? 'font-medium text-brand-600' : dim ? 'text-fg-subtle line-through' : 'text-fg')}>
          {label}
        </span>
      </button>
      {meta && <span className="shrink-0 font-mono text-[10px] text-fg-subtle">{meta}</span>}
    </div>
  )
}

/* ─────────────────────────── Detail pane ─────────────────────────── */
function DetailPane({ sel, data }: { sel: Selection | null; data: OrgStructure }) {
  const navigate = useNavigate()

  const found = useMemo(() => (sel ? findNode(data, sel) : null), [sel, data])

  if (!sel || !found) {
    return (
      <Card>
        <EmptyState icon={<ListTree className="h-5 w-5" />} title="Select a node" description="Pick anything in the tree to see its details." />
      </Card>
    )
  }

  const route = EDIT_ROUTE[sel.kind]
  const title = 'legal_name' in found ? found.legal_name : found.name
  const code = found.code

  return (
    <Card>
      <CardHeader
        title={title}
        description={`${label(sel.kind)} · ${code}`}
        actions={
          route && (
            <Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(route)}>
              Edit in {label(sel.kind)} screen
            </Button>
          )
        }
      />
      <CardBody className="divide-y divide-border/60 py-1">{detailRows(sel.kind, found)}</CardBody>
    </Card>
  )
}

function label(kind: NodeKind): string {
  return {
    company: 'Company',
    branch: 'Branch',
    plant: 'Plant',
    warehouse: 'Warehouse',
    department: 'Department',
    cost_centre: 'Cost centre',
  }[kind]
}

type AnyNode =
  | OrgStructure['company']
  | StructureBranch
  | StructurePlant
  | StructureWarehouse
  | StructureUnit

function detailRows(kind: NodeKind, node: NonNullable<AnyNode>) {
  const n = node as unknown as Record<string, unknown>
  const status = 'is_active' in n ? (n.is_active ? <Badge tone="success" size="sm">Active</Badge> : <Badge tone="neutral" size="sm">Inactive</Badge>) : null
  const rows: [string, ReactNode][] = [['Code', <span key="c" className="font-mono">{String(n.code)}</span>]]
  if (kind === 'company') {
    rows.push(['Legal name', String(n.legal_name)], ['Trade name', (n.trade_name as string) || '—'], ['GST state code', (n.gst_state_code as string) || '—'])
  } else if (kind === 'branch') {
    rows.push(['Name', String(n.name)], ['Type', String(n.branch_type).replace(/_/g, ' ').toLowerCase()], ['Status', status])
  } else if (kind === 'plant') {
    rows.push(
      ['Name', String(n.name)],
      ['Capacity / day', n.installed_capacity_per_day != null ? Number(n.installed_capacity_per_day).toLocaleString('en-IN') : '—'],
      ['Warehouses', String((n.warehouses as unknown[] | undefined)?.length ?? 0)],
      ['Status', status],
    )
  } else if (kind === 'warehouse') {
    rows.push(['Name', String(n.name)], ['Type', String(n.warehouse_type).replace(/_/g, ' ').toLowerCase()], ['Status', status])
  } else {
    rows.push(['Name', String(n.name)], ['Type', String(n.type).replace(/_/g, ' ').toLowerCase()], ['Level', String(n.level)], ['Status', status])
  }
  return rows.map(([k, v]) => <DataRow key={k} label={k} value={v} />)
}

/* ─────────────────────────── helpers ─────────────────────────── */
function findNode(data: OrgStructure, sel: Selection): NonNullable<AnyNode> | null {
  if (sel.kind === 'company') return data.company
  if (sel.kind === 'department') return data.departments.find((d) => d.uid === sel.uid) ?? null
  if (sel.kind === 'cost_centre') return data.cost_centres.find((c) => c.uid === sel.uid) ?? null
  for (const b of data.branches) {
    if (sel.kind === 'branch' && b.uid === sel.uid) return b
    for (const w of b.warehouses) if (sel.kind === 'warehouse' && w.uid === sel.uid) return w
    for (const p of b.plants) {
      if (sel.kind === 'plant' && p.uid === sel.uid) return p
      for (const w of p.warehouses) if (sel.kind === 'warehouse' && w.uid === sel.uid) return w
    }
  }
  return null
}

interface FlatRow {
  level: number
  type: string
  code: string
  name: string
  parent: string | null
  detail: string | null
  status: string
}

function flatten(data: OrgStructure): FlatRow[] {
  const rows: FlatRow[] = []
  const st = (a: boolean) => (a ? 'Active' : 'Inactive')
  if (data.company) rows.push({ level: 0, type: 'Company', code: data.company.code, name: data.company.legal_name, parent: null, detail: data.company.gst_state_code ?? null, status: 'Active' })
  for (const b of data.branches) {
    rows.push({ level: 1, type: 'Branch', code: b.code, name: b.name, parent: data.company?.code ?? null, detail: b.branch_type, status: st(b.is_active) })
    for (const w of b.warehouses) rows.push({ level: 2, type: 'Warehouse', code: w.code, name: w.name, parent: b.code, detail: w.warehouse_type, status: st(w.is_active) })
    for (const p of b.plants) {
      rows.push({ level: 2, type: 'Plant', code: p.code, name: p.name, parent: b.code, detail: p.installed_capacity_per_day != null ? `${p.installed_capacity_per_day}/day` : null, status: st(p.is_active) })
      for (const w of p.warehouses) rows.push({ level: 3, type: 'Warehouse', code: w.code, name: w.name, parent: p.code, detail: w.warehouse_type, status: st(w.is_active) })
    }
  }
  for (const d of data.departments) rows.push({ level: 1, type: 'Department', code: d.code, name: d.name, parent: data.company?.code ?? null, detail: d.type, status: st(d.is_active) })
  for (const c of data.cost_centres) rows.push({ level: 1, type: 'Cost centre', code: c.code, name: c.name, parent: data.company?.code ?? null, detail: c.type, status: st(c.is_active) })
  return rows
}
