import { useState } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Coins,
  Download,
  Factory,
  GitBranch,
  ListTree,
  Settings2,
  Warehouse as WarehouseIcon,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataRow } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { formatCompact, formatCurrency, formatDate } from '@/lib/format'
import {
  branches,
  companies,
  costCentres,
  departments,
  plants,
  productionLines,
  registrations,
  warehouses,
  workCentres,
} from '@/mock/data'

type NodeKind = 'company' | 'branch' | 'plant' | 'line' | 'workcentre' | 'warehouse'
interface Selection {
  kind: NodeKind
  uid: string
}

export function OrganisationExplorerPage() {
  const toast = useToast()
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(['cmp-01', 'brn-01', 'plt-01', 'wh-group-brn-01']),
  )
  const [sel, setSel] = useState<Selection>({ kind: 'plant', uid: 'plt-01' })

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div>
      <PageHeader
        title="Organisation structure"
        description="Company → branch → plant → line → work centre, and the warehouse hierarchy beneath each branch. Every transaction is posted against this skeleton."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Structure explorer' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => toast.success('Export queued', 'Organisation Structure report — the artefact given to auditors.')}>
              Export structure
            </Button>
            <Button variant="primary" size="sm" icon={<Settings2 className="h-4 w-4" />} onClick={() => toast.info('Company setup wizard', 'A guided walkthrough for standing up a new company, branch and plant structure.')}>Company setup wizard</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* ── Tree ─────────────────────────────────────────────────────── */}
        <Card className="h-fit">
          <CardHeader title="Hierarchy" description="Click any node to inspect it" />
          <div className="max-h-[70vh] overflow-y-auto p-2 text-sm">
            {companies.map((c) => {
              const cBranches = branches.filter((b) => b.companyUid === c.uid)
              const open = expanded.has(c.uid)
              return (
                <div key={c.uid}>
                  <TreeRow
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    label={c.legalName}
                    meta={c.code}
                    depth={0}
                    expandable
                    expanded={open}
                    onToggle={() => toggle(c.uid)}
                    active={sel.kind === 'company' && sel.uid === c.uid}
                    onClick={() => setSel({ kind: 'company', uid: c.uid })}
                  />
                  {open &&
                    cBranches.map((b) => {
                      const bOpen = expanded.has(b.uid)
                      const bPlants = plants.filter((p) => p.branchUid === b.uid)
                      const bWarehouses = warehouses.filter((w) => w.branchUid === b.uid)
                      return (
                        <div key={b.uid}>
                          <TreeRow
                            icon={<GitBranch className="h-3.5 w-3.5" />}
                            label={b.name}
                            meta={b.gstin ?? b.code}
                            depth={1}
                            expandable
                            expanded={bOpen}
                            onToggle={() => toggle(b.uid)}
                            active={sel.kind === 'branch' && sel.uid === b.uid}
                            onClick={() => setSel({ kind: 'branch', uid: b.uid })}
                          />
                          {bOpen && (
                            <>
                              {bPlants.map((p) => {
                                const pOpen = expanded.has(p.uid)
                                const pLines = productionLines.filter((l) => l.plantUid === p.uid)
                                const shared = workCentres.filter((w) => w.plantUid === p.uid && !w.lineUid)
                                return (
                                  <div key={p.uid}>
                                    <TreeRow
                                      icon={<Factory className="h-3.5 w-3.5" />}
                                      label={p.name}
                                      meta={p.code}
                                      depth={2}
                                      expandable
                                      expanded={pOpen}
                                      onToggle={() => toggle(p.uid)}
                                      active={sel.kind === 'plant' && sel.uid === p.uid}
                                      onClick={() => setSel({ kind: 'plant', uid: p.uid })}
                                    />
                                    {pOpen && (
                                      <>
                                        {pLines.map((l) => {
                                          const lOpen = expanded.has(l.uid)
                                          const lwc = workCentres.filter((w) => w.lineUid === l.uid)
                                          return (
                                            <div key={l.uid}>
                                              <TreeRow
                                                icon={<Wrench className="h-3.5 w-3.5" />}
                                                label={l.name}
                                                meta={l.status}
                                                depth={3}
                                                expandable={lwc.length > 0}
                                                expanded={lOpen}
                                                onToggle={() => toggle(l.uid)}
                                                active={sel.kind === 'line' && sel.uid === l.uid}
                                                onClick={() => setSel({ kind: 'line', uid: l.uid })}
                                                tone={l.status === 'MAINTENANCE' ? 'warning' : l.status === 'IDLE' ? 'neutral' : 'success'}
                                              />
                                              {lOpen &&
                                                lwc.map((w) => (
                                                  <TreeRow
                                                    key={w.uid}
                                                    icon={<span className="text-[10px]">·</span>}
                                                    label={w.name}
                                                    meta={w.code}
                                                    depth={4}
                                                    active={sel.kind === 'workcentre' && sel.uid === w.uid}
                                                    onClick={() => setSel({ kind: 'workcentre', uid: w.uid })}
                                                  />
                                                ))}
                                            </div>
                                          )
                                        })}
                                        {shared.map((w) => (
                                          <TreeRow
                                            key={w.uid}
                                            icon={<Wrench className="h-3.5 w-3.5" />}
                                            label={`${w.name} (shared)`}
                                            meta={w.code}
                                            depth={3}
                                            active={sel.kind === 'workcentre' && sel.uid === w.uid}
                                            onClick={() => setSel({ kind: 'workcentre', uid: w.uid })}
                                          />
                                        ))}
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                              {bWarehouses.length > 0 && (
                                <>
                                  <TreeRow
                                    icon={<WarehouseIcon className="h-3.5 w-3.5" />}
                                    label="Warehouses"
                                    meta={String(bWarehouses.length)}
                                    depth={2}
                                    expandable
                                    expanded={expanded.has(`wh-group-${b.uid}`)}
                                    onToggle={() => toggle(`wh-group-${b.uid}`)}
                                  />
                                  {expanded.has(`wh-group-${b.uid}`) &&
                                    bWarehouses.map((w) => (
                                      <TreeRow
                                        key={w.uid}
                                        icon={<span className="text-[10px]">·</span>}
                                        label={`${w.code} — ${w.name}`}
                                        meta={w.isSystemManaged ? 'system' : ''}
                                        depth={3}
                                        active={sel.kind === 'warehouse' && sel.uid === w.uid}
                                        onClick={() => setSel({ kind: 'warehouse', uid: w.uid })}
                                      />
                                    ))}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </Card>

        {/* ── Detail pane ──────────────────────────────────────────────── */}
        <div className="min-w-0">
          <DetailPane sel={sel} />
        </div>
      </div>
    </div>
  )
}

function TreeRow({
  icon,
  label,
  meta,
  depth,
  expandable,
  expanded,
  onToggle,
  onClick,
  active,
  tone,
}: {
  icon: React.ReactNode
  label: string
  meta?: string
  depth: number
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  onClick?: () => void
  active?: boolean
  tone?: 'success' | 'warning' | 'neutral'
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded px-1 py-1 transition-colors',
        active ? 'bg-brand-500/10' : 'hover:bg-surface-3',
      )}
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
        <span className={cn('truncate text-xs', active ? 'font-medium text-brand-600' : 'text-fg')}>{label}</span>
      </button>
      {meta && (
        <span
          className={cn(
            'shrink-0 truncate font-mono text-[9px]',
            tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-fg-subtle',
          )}
        >
          {meta}
        </span>
      )}
    </div>
  )
}

function DetailPane({ sel }: { sel: Selection }) {
  const toast = useToast()
  if (sel.kind === 'company') {
    const c = companies.find((x) => x.uid === sel.uid)!
    const regs = registrations.filter((r) => r.companyUid === c.uid)
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title={c.legalName} description={`${c.tradeName} · ${c.entityType.replace('_', ' ')}`}
            actions={<Button size="sm" variant="outline" onClick={() => toast.info('Edit company', `${c.legalName} (${c.code}) — edit the company master.`)}>Edit</Button>} />
          <CardBody className="grid gap-x-8 sm:grid-cols-2">
            <DataRow label="Code" value={c.code} mono />
            <DataRow label="CIN" value={c.cin} mono />
            <DataRow label="PAN" value={c.pan} mono />
            <DataRow label="TAN" value={c.tan} mono />
            <DataRow label="Base currency" value={c.baseCurrency} />
            <DataRow label="FY start" value="April" />
            <DataRow label="Address" value={`${c.addressLine1}, ${c.city}`} />
            <DataRow label="State" value={`${c.state} (${c.stateCode})`} />
            <DataRow label="Phone" value={c.phone} />
            <DataRow label="Email" value={c.email} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Statutory registrations" description={`${regs.length} registrations`} />
          <table className="grid-table">
            <thead><tr><th>Type</th><th>Number</th><th className="w-32">Valid to</th><th className="w-24">Status</th></tr></thead>
            <tbody>
              {regs.map((r) => {
                const days = r.validTo ? Math.ceil((new Date(r.validTo).getTime() - Date.now()) / 86400000) : null
                return (
                  <tr key={r.uid}>
                    <td className="text-xs">{r.type.replace(/_/g, ' ')}</td>
                    <td className="font-mono text-[11px]">{r.number}</td>
                    <td className="text-xs">{r.validTo ? formatDate(r.validTo) : 'Perpetual'}</td>
                    <td>
                      {days === null ? <Badge tone="success" size="sm">Valid</Badge>
                        : days <= 7 ? <Badge tone="danger" size="sm">{days}d left</Badge>
                        : days <= 90 ? <Badge tone="warning" size="sm">{days}d left</Badge>
                        : <Badge tone="success" size="sm">Valid</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>
    )
  }

  if (sel.kind === 'branch') {
    const b = branches.find((x) => x.uid === sel.uid)!
    const bPlants = plants.filter((p) => p.branchUid === b.uid)
    const bWh = warehouses.filter((w) => w.branchUid === b.uid)
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title={b.name} description={b.branchType.replace(/_/g, ' ')}
            actions={<Button size="sm" variant="outline" onClick={() => toast.info('Edit branch', `${b.name} (${b.code}) — edit the branch master.`)}>Edit</Button>} />
          <CardBody className="grid gap-x-8 sm:grid-cols-2">
            <DataRow label="Code" value={b.code} mono />
            <DataRow label="Type" value={b.branchType.replace(/_/g, ' ')} />
            <DataRow label="GSTIN" value={b.gstin ?? '— uses head office GSTIN —'} mono />
            <DataRow label="Separate registration" value={b.hasSeparateGstin ? 'Yes' : 'No'} />
            <DataRow label="City" value={b.city} />
            <DataRow label="State" value={`${b.state} (${b.stateCode})`} />
            <DataRow label="Contact" value={b.contactPerson} />
            <DataRow label="Phone" value={b.phone} />
            <DataRow label="Plants" value={String(bPlants.length)} />
            <DataRow label="Warehouses" value={String(bWh.length)} />
          </CardBody>
        </Card>
        {b.hasSeparateGstin && (
          <Alert tone="warning" title="This branch holds its own GST registration">
            Stock movements between this branch and another branch with a different GSTIN are branch
            transfers under GST — they generate a tax invoice or delivery challan and an e-way bill
            where the threshold is crossed. They cannot be posted as a plain internal transfer.
          </Alert>
        )}
      </div>
    )
  }

  if (sel.kind === 'plant') {
    const p = plants.find((x) => x.uid === sel.uid)!
    const lines = productionLines.filter((l) => l.plantUid === p.uid)
    const wc = workCentres.filter((w) => w.plantUid === p.uid)
    const wh = warehouses.filter((w) => w.plantUid === p.uid)
    const branch = branches.find((b) => b.uid === p.branchUid)
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title={p.name} description={`${branch?.name} · Plant head ${p.plantHead}`}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => toast.info('Add line', `Add a production line to ${p.name}.`)}>Add line</Button>
                <Button size="sm" variant="outline" onClick={() => toast.info('Edit plant', `${p.name} (${p.code}) — edit the plant master.`)}>Edit</Button>
              </>
            } />
          <CardBody className="grid gap-x-8 sm:grid-cols-2">
            <DataRow label="Code" value={p.code} mono />
            <DataRow label="Branch" value={branch?.name ?? '—'} />
            <DataRow label="Plant head" value={p.plantHead} />
            <DataRow label="Factory licence" value={p.factoryLicence} mono />
            <DataRow label="Licence valid to" value={formatDate(p.factoryLicenceValidTo)} />
            <DataRow label="Shift pattern" value={p.shiftPattern} />
            <DataRow label="Installed capacity" value={`${p.installedCapacityPerDay.toLocaleString('en-IN')} ${p.capacityUom}/day`} />
            <DataRow label="City" value={`${p.city}, ${p.state}`} />
            <DataRow label="Production lines" value={String(lines.length)} />
            <DataRow label="Work centres" value={String(wc.length)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Production lines" description={`${lines.length} lines`} />
          <table className="grid-table">
            <thead><tr><th>Line</th><th className="w-28">Type</th><th className="w-32">Capacity range</th><th className="w-28 text-right">Rated/hr</th><th className="w-28">Status</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.uid}>
                  <td className="text-xs"><span className="font-mono text-[10px] text-fg-subtle">{l.code}</span> {l.name}</td>
                  <td className="text-xs">{l.lineType}</td>
                  <td className="text-xs tabular">{l.minCapacityMl}–{l.maxCapacityMl} ml</td>
                  <td className="text-right text-xs tabular">{l.ratedOutputPerHour}</td>
                  <td><StatusBadge status={l.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="Work centres" description="Capacity and rates used by routing and finite-capacity planning" />
          <table className="grid-table">
            <thead><tr><th>Work centre</th><th className="w-24">Type</th><th className="w-24 text-right">Cap/hr</th><th className="w-24 text-right">Efficiency</th><th className="w-28 text-right">M/c hr rate</th><th className="w-24">Bottleneck</th></tr></thead>
            <tbody>
              {wc.map((w) => (
                <tr key={w.uid}>
                  <td className="text-xs"><span className="font-mono text-[10px] text-fg-subtle">{w.code}</span> {w.name}</td>
                  <td className="text-xs">{w.type}</td>
                  <td className="text-right text-xs tabular">{w.capacityPerHour}</td>
                  <td className="text-right text-xs tabular">{w.efficiencyPct}%</td>
                  <td className="text-right text-xs tabular">{formatCurrency(w.machineHourRate)}</td>
                  <td>{w.isBottleneck && <Badge tone="danger" size="sm">Bottleneck</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="Default warehouses" description={`${wh.length} stores linked to this plant`} />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {wh.map((w) => (
              <div key={w.uid} className="rounded border border-border bg-surface-2 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-fg">{w.code}</span>
                  <span className="text-xs text-fg-muted tabular">{formatCompact(w.stockValue)}</span>
                </div>
                <p className="mt-0.5 truncate text-2xs text-fg-subtle">{w.name}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    )
  }

  if (sel.kind === 'line') {
    const l = productionLines.find((x) => x.uid === sel.uid)!
    const lwc = workCentres.filter((w) => w.lineUid === l.uid)
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title={l.name} description={`${l.lineType} line`} actions={<Button size="sm" variant="outline" onClick={() => toast.info('Edit line', `${l.name} (${l.code}) — edit the production line.`)}>Edit</Button>} />
          <CardBody className="grid gap-x-8 sm:grid-cols-2">
            <DataRow label="Code" value={l.code} mono />
            <DataRow label="Status" value={<StatusBadge status={l.status} size="sm" />} />
            <DataRow label="Capacity range" value={`${l.minCapacityMl}–${l.maxCapacityMl} ml`} />
            <DataRow label="Standard cycle time" value={`${l.cycleTimeSec} s`} />
            <DataRow label="Rated output" value={`${l.ratedOutputPerHour}/hr`} />
            <DataRow label="Work centres" value={String(lwc.length)} />
          </CardBody>
        </Card>
        {l.status === 'MAINTENANCE' && (
          <Alert tone="warning" title="Line is under maintenance">
            Capacity planning excludes this line until it returns to RUNNING. Open production orders
            scheduled on it will be flagged for rescheduling.
          </Alert>
        )}
      </div>
    )
  }

  if (sel.kind === 'workcentre') {
    const w = workCentres.find((x) => x.uid === sel.uid)!
    return (
      <Card>
        <CardHeader title={w.name} description={`${w.type} work centre`} actions={<Button size="sm" variant="outline" onClick={() => toast.info('Edit work centre', `${w.name} (${w.code}) — edit the work centre.`)}>Edit</Button>} />
        <CardBody className="grid gap-x-8 sm:grid-cols-2">
          <DataRow label="Code" value={w.code} mono />
          <DataRow label="Type" value={w.type} />
          <DataRow label="Capacity" value={`${w.capacityPerHour}/hr`} />
          <DataRow label="Efficiency" value={`${w.efficiencyPct}%`} />
          <DataRow label="Machine hour rate" value={formatCurrency(w.machineHourRate)} />
          <DataRow label="Bottleneck" value={w.isBottleneck ? 'Yes' : 'No'} />
        </CardBody>
        {w.isBottleneck && (
          <CardBody className="border-t border-border pt-3">
            <Alert tone="warning" title="Flagged as a bottleneck">
              Finite-capacity scheduling anchors the plan to this resource. Effective capacity is{' '}
              {Math.round(w.capacityPerHour * (w.efficiencyPct / 100))}/hr after efficiency.
            </Alert>
          </CardBody>
        )}
      </Card>
    )
  }

  const w = warehouses.find((x) => x.uid === sel.uid)!
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`${w.code} — ${w.name}`} description={w.warehouseType.replace(/_/g, ' ')}
          actions={<Button size="sm" variant="outline" onClick={() => toast.info('Edit warehouse', `${w.code} — ${w.name}.`)}>Edit</Button>} />
        <CardBody className="grid gap-x-8 sm:grid-cols-2">
          <DataRow label="Type" value={w.warehouseType.replace(/_/g, ' ')} />
          <DataRow label="Storekeeper" value={w.storekeeper} />
          <DataRow label="Bin managed" value={w.isBinManaged ? `Yes — ${w.binCount} bins` : 'No'} />
          <DataRow label="Batch mandatory" value={w.isBatchMandatory ? 'Yes' : 'No'} />
          <DataRow label="Negative stock" value={w.allowNegativeStock ? 'Permitted' : 'Rejected'} />
          <DataRow label="Valuation" value={w.valuationMethod.replace('_', ' ')} />
          <DataRow label="Stock value" value={formatCurrency(w.stockValue)} />
          <DataRow label="System managed" value={w.isSystemManaged ? 'Yes' : 'No'} />
        </CardBody>
      </Card>
      {w.isSystemManaged && (
        <Alert tone="info" title="System-managed warehouse">
          Postings into this store come only from transfer or subcontract documents. Manual entry is
          not permitted.
        </Alert>
      )}
      {w.warehouseType === 'QUARANTINE' && (
        <Alert tone="warning" title="Quarantine stock is not available">
          Stock here cannot be issued, allocated, reserved or sold. It moves out only via a QC
          decision document.
        </Alert>
      )}
    </div>
  )
}
