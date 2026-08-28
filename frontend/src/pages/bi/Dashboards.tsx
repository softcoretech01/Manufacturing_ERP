import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import {
  KpiCard,
  MODULE_LABEL,
  ModuleChip,
  StatusBadge,
  formatMetric,
  useCanSeeFinancial,
  useCanSeePeople,
} from '@/components/bi/BiShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { dashboards as seedDashboards, dataSources as seedSources, kpiDefinitions, readingByCode } from '@/mock/bi'
import type { DashboardDefinition, DashboardRole, DataSource } from '@/types/bi'

const ROLE_LABEL: Record<DashboardRole, string> = {
  CEO: 'CEO',
  MANAGING_DIRECTOR: 'Managing Director',
  CFO: 'CFO',
  COO: 'COO',
  PLANT_HEAD: 'Plant head',
  PRODUCTION_MANAGER: 'Production manager',
  QUALITY_MANAGER: 'Quality manager',
  PURCHASE_MANAGER: 'Purchase manager',
  WAREHOUSE_MANAGER: 'Warehouse manager',
  SALES_MANAGER: 'Sales manager',
  HR_MANAGER: 'HR manager',
  MAINTENANCE_MANAGER: 'Maintenance manager',
  SUPERVISOR: 'Shift supervisor',
  OPERATOR: 'Operator',
}

/**
 * The dashboard library. Fourteen role dashboards, each a named set of KPIs with
 * its own refresh interval — a supervisor's screen refreshes every five minutes
 * because the shift is moving, while the CFO's refreshes hourly because the
 * ledger does not change faster than that.
 */
export function BiDashboardsPage() {
  const toast = useToast()
  const canSeeFinancial = useCanSeeFinancial()
  const canSeePeople = useCanSeePeople()
  const seed = useMemo(() => seedDashboards, [])
  const sourceSeed = useMemo(() => seedSources, [])

  const crud = useCrud<DashboardDefinition>({
    key: 'bi:dashboard',
    seed,
    entity: 'Dashboard',
    titleOf: (d) => `${d.name} (${d.code})`,
    fields: [
      { name: 'code', label: 'Dashboard code', required: true, upper: true },
      { name: 'name', label: 'Dashboard name', required: true },
      {
        name: 'role',
        label: 'Role',
        type: 'select',
        required: true,
        options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'description', label: 'What it is for', type: 'textarea', span: 2, required: true },
      { name: 'refreshMinutes', label: 'Refresh every (minutes)', type: 'number', required: true, hint: 'Match the pace of the data — a ledger dashboard refreshing every minute just costs load' },
      { name: 'isDefault', label: 'Default landing dashboard', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (d) => ({
      code: d.code,
      name: d.name,
      role: d.role,
      description: d.description,
      refreshMinutes: String(d.refreshMinutes),
      isDefault: String(d.isDefault),
      isActive: String(d.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? {
        kpiCodes: [],
        lastRefreshedAt: new Date().toISOString(),
        modules: [],
        viewCount: 0,
        version: 1,
        updatedBy: 'S. Ganapathy',
        updatedOn: new Date().toISOString().slice(0, 10),
      }),
      code: v.code,
      name: v.name,
      role: v.role as DashboardRole,
      description: v.description,
      refreshMinutes: Number(v.refreshMinutes) || 30,
      isDefault: v.isDefault === 'true',
      isActive: v.isActive !== 'false',
      // Any edit is a new version — dashboard changes are audited.
      version: (existing?.version ?? 0) + 1,
      updatedBy: 'S. Ganapathy',
      updatedOn: new Date().toISOString().slice(0, 10),
    }),
    blockDelete: (d) =>
      d.isDefault
        ? `${d.name} is the default landing dashboard. Make another one default first, or users signing in will land nowhere.`
        : d.viewCount > 500
          ? `${d.name} has been opened ${d.viewCount.toLocaleString('en-IN')} times. Deactivate it instead so the access history stays meaningful.`
          : undefined,
  })

  const dashboards = crud.rows
  const { rows: sources } = useCollection<DataSource>('bi:data-source', sourceSeed)

  const [viewing, setViewing] = useState<DashboardDefinition | null>(null)
  const [editing, setEditing] = useState<DashboardDefinition | null>(null)
  const [pickKpi, setPickKpi] = useState('')

  /** A dashboard is only as fresh as its worst feed. */
  function healthOf(d: DashboardDefinition) {
    const mine = sources.filter((s) => d.modules.includes(s.module))
    const bad = mine.filter((s) => s.status !== 'HEALTHY')
    return { total: mine.length, bad }
  }

  const withProblems = dashboards.filter((d) => d.isActive && healthOf(d).bad.length > 0)

  const columns: Column<DashboardDefinition>[] = [
    { key: 'code', header: 'Dashboard', sortable: true, width: '16rem', render: (d) => (
      <button type="button" onClick={() => setViewing(d)} className="text-left">
        <p className="truncate text-xs font-medium text-brand-600 hover:underline">{d.name}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{d.code}</p>
      </button>
    ) },
    { key: 'role', header: 'Role', sortable: true, width: '12rem', render: (d) => (
      <Badge tone="neutral" size="sm" dot={false}>{ROLE_LABEL[d.role]}</Badge>
    ) },
    { key: 'description', header: 'What it is for', render: (d) => <span className="text-2xs text-fg-muted">{d.description}</span> },
    { key: 'kpiCodes', header: 'KPIs', align: 'right', width: '6.5rem', sortable: true, accessor: (d) => d.kpiCodes.length, render: (d) => (
      <span className="tabular text-xs">{d.kpiCodes.length}</span>
    ) },
    { key: 'modules', header: 'Feeds from', width: '16rem', render: (d) => (
      <div className="flex flex-wrap gap-1">
        {d.modules.slice(0, 4).map((m) => (
          <ModuleChip key={m} module={m} />
        ))}
        {d.modules.length > 4 && <span className="text-2xs text-fg-subtle">+{d.modules.length - 4}</span>}
      </div>
    ) },
    { key: 'health', header: 'Feed health', width: '11rem', accessor: (d) => healthOf(d).bad.length, render: (d) => {
      const h = healthOf(d)
      return h.bad.length === 0 ? (
        <Badge tone="success" size="sm" dot={false}>all healthy</Badge>
      ) : (
        <span className="text-2xs font-medium text-warning" title={h.bad.map((s) => `${s.name}: ${s.status}`).join('\n')}>
          {h.bad.length} of {h.total} degraded
        </span>
      )
    } },
    { key: 'refreshMinutes', header: 'Refresh', align: 'right', width: '8rem', sortable: true, render: (d) => (
      <span className="tabular text-2xs text-fg-muted">every {d.refreshMinutes} min</span>
    ) },
    { key: 'lastRefreshedAt', header: 'Last refreshed', sortable: true, width: '11rem', accessor: (d) => d.lastRefreshedAt, render: (d) => (
      <span className="text-2xs">{formatDateTime(d.lastRefreshedAt)}</span>
    ) },
    { key: 'viewCount', header: 'Opened', align: 'right', width: '8rem', sortable: true, render: (d) => (
      <span className="tabular text-xs text-fg-muted">{d.viewCount.toLocaleString('en-IN')}</span>
    ) },
    { key: 'version', header: 'Version', align: 'center', width: '10rem', sortable: true, render: (d) => (
      <div className="min-w-0">
        <p className="tabular text-2xs text-fg">v{d.version}</p>
        <p className="truncate text-2xs text-fg-subtle">{d.updatedBy}, {formatDate(d.updatedOn)}</p>
      </div>
    ) },
    { key: 'isActive', header: 'Status', align: 'center', width: '8rem', sortable: true, accessor: (d) => (d.isActive ? 1 : 0), render: (d) => (
      d.isDefault ? <Badge tone="brand" size="sm" dot={false}>default</Badge> : d.isActive ? <Badge tone="success" size="sm" dot={false}>active</Badge> : <Badge tone="neutral" size="sm" dot={false}>inactive</Badge>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'bi-dashboards', 'Dashboard library', columnsFromTable(columns), dashboards)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Dashboards"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Dashboards' }]}
        actions={
          <>
            <Link to="/bi">
              <Button variant="outline" size="sm">Executive view</Button>
            </Link>
            <Button
              variant="primary"
              size="sm"
              onClick={() => crud.openCreate({ role: 'SUPERVISOR', refreshMinutes: '30', isActive: 'true' })}
            >
              New dashboard
            </Button>
          </>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg tabular">{dashboards.filter((d) => d.isActive).length}</span> active dashboards across{' '}
        {new Set(dashboards.map((d) => d.role)).size} roles ·{' '}
        <span className="font-medium text-fg tabular">
          {dashboards.reduce((s, d) => s + d.viewCount, 0).toLocaleString('en-IN')}
        </span>{' '}
        opens recorded
        {withProblems.length > 0 && (
          <>
            {' '}· <span className="font-medium text-warning">{withProblems.length}</span> reading from a feed that is not healthy
          </>
        )}
      </p>

      {withProblems.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Dashboards on unhealthy feeds"
            description="These still render, which is exactly the problem — the numbers look current and are not"
          />
          <CardBody className="space-y-2">
            {withProblems.map((d) => {
              const h = healthOf(d)
              return (
                <div key={d.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">{d.name}</p>
                    <p className="text-2xs text-fg-muted">
                      {h.bad.map((s) => `${s.name} is ${s.status.toLowerCase()}`).join('; ')}
                    </p>
                  </div>
                  <Link to="/bi/data-sources" className="shrink-0 text-2xs font-medium text-brand-600 hover:underline">
                    Open the feeds →
                  </Link>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={dashboards}
        columns={columns}
        rowKey={(d) => d.uid}
        searchPlaceholder="Search dashboard, code, role or purpose…"
        onExport={doExport}
        emptyTitle="No dashboards"
        rowClassName={(d) => cn(!d.isActive && 'opacity-60', d.isDefault && 'bg-brand-500/[0.03]', healthOf(d).bad.length > 0 && 'bg-warning/[0.03]')}
        rowActions={(d) => (
          <>
            <MenuItem label="Edit the dashboard" onClick={() => crud.openEdit(d)} />
            <MenuItem label="Delete the dashboard" danger onClick={() => crud.askDelete(d)} />
            <MenuItem separatorBefore label="Open the KPI layout" onClick={() => { setEditing(d); setPickKpi('') }} />
            <MenuItem label="Preview it" onClick={() => setViewing(d)} />
            <MenuItem
              label="Make it the default"
              disabled={d.isDefault}
              onClick={() => {
                for (const other of dashboards.filter((x) => x.isDefault)) crud.update(other.uid, { isDefault: false })
                crud.update(d.uid, { isDefault: true })
                toast.success('Default set', `${d.name} is now where users land when they open analytics.`)
              }}
            />
            <MenuItem
              label="Refresh now"
              onClick={() => {
                crud.update(d.uid, { lastRefreshedAt: new Date().toISOString() })
                toast.success('Refreshed', `${d.name} re-read all ${d.modules.length} feeds.`)
              }}
            />
            <MenuItem
              label={d.isActive ? 'Deactivate' : 'Activate'}
              onClick={() => {
                if (d.isActive && d.isDefault) {
                  toast.error('Cannot deactivate the default', 'Make another dashboard the default first.')
                  return
                }
                crud.update(d.uid, { isActive: !d.isActive })
                toast.success(d.isActive ? 'Deactivated' : 'Activated', `${d.name} updated.`)
              }}
            />
          </>
        )}
      />

      {/* KPI layout editor -------------------------------------------------- */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `KPI layout — ${editing.name}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setEditing(null); toast.success('Layout saved', 'The dashboard now shows those KPIs in that order.') }}>
              Done
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              KPIs appear in this order. A dashboard with more than about nine cards stops being read, so the ordering matters more
              than the count.
            </p>

            <div className="space-y-1.5">
              {editing.kpiCodes.map((code, i) => {
                const def = kpiDefinitions.find((k) => k.code === code)
                const reading = readingByCode[code]
                if (!def) return null
                return (
                  <div key={code} className="flex items-center gap-2 rounded border border-border p-2">
                    <span className="w-5 shrink-0 text-center text-2xs tabular text-fg-subtle">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-fg">{def.name}</p>
                      <p className="truncate text-2xs text-fg-subtle">
                        {MODULE_LABEL[def.module]} · target {formatMetric(def.target, def.format, def.unit)}
                      </p>
                    </div>
                    {reading && <StatusBadge status={reading.status} />}
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-2xs"
                        disabled={i === 0}
                        onClick={() => {
                          const next = [...editing.kpiCodes]
                          ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                          crud.update(editing.uid, { kpiCodes: next })
                          setEditing({ ...editing, kpiCodes: next })
                        }}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-2xs"
                        disabled={i === editing.kpiCodes.length - 1}
                        onClick={() => {
                          const next = [...editing.kpiCodes]
                          ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                          crud.update(editing.uid, { kpiCodes: next })
                          setEditing({ ...editing, kpiCodes: next })
                        }}
                      >
                        ↓
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-2xs text-danger"
                        onClick={() => {
                          const next = editing.kpiCodes.filter((c) => c !== code)
                          const mods = [...new Set(next.map((c) => kpiDefinitions.find((k) => k.code === c)?.module).filter(Boolean))]
                          crud.update(editing.uid, { kpiCodes: next, modules: mods as DashboardDefinition['modules'] })
                          setEditing({ ...editing, kpiCodes: next })
                          toast.success('Removed', `${def.name} taken off ${editing.name}.`)
                        }}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                )
              })}
              {editing.kpiCodes.length === 0 && (
                <p className="rounded border border-dashed border-border py-6 text-center text-xs text-fg-muted">
                  No KPIs on this dashboard yet.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <Select
                label="Add a KPI"
                sizeVariant="sm"
                containerClassName="flex-1 min-w-[16rem]"
                value={pickKpi}
                onChange={(e) => setPickKpi(e.target.value)}
                options={[
                  { value: '', label: 'Choose a KPI…' },
                  ...kpiDefinitions
                    .filter((k) => k.isActive && !editing.kpiCodes.includes(k.code))
                    .map((k) => ({ value: k.code, label: `${k.name} — ${MODULE_LABEL[k.module]}` })),
                ]}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!pickKpi) {
                    toast.error('Choose a KPI', 'Pick one from the list first.')
                    return
                  }
                  if (editing.kpiCodes.length >= 12) {
                    toast.error(
                      'That is too many for one screen',
                      'Twelve cards is already past what anybody scans. Split this into two role dashboards instead.',
                    )
                    return
                  }
                  const def = kpiDefinitions.find((k) => k.code === pickKpi)!
                  const next = [...editing.kpiCodes, pickKpi]
                  const mods = [...new Set([...editing.modules, def.module])]
                  crud.update(editing.uid, { kpiCodes: next, modules: mods })
                  setEditing({ ...editing, kpiCodes: next, modules: mods })
                  setPickKpi('')
                  toast.success('KPI added', `${def.name} added. ${MODULE_LABEL[def.module]} is now one of this dashboard's feeds.`)
                }}
              >
                Add
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Preview ------------------------------------------------------------ */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        description={viewing ? `${ROLE_LABEL[viewing.role]} · refreshes every ${viewing.refreshMinutes} minutes` : ''}
        width="max-w-3xl"
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
              <Button variant="primary" onClick={() => { setEditing(viewing); setViewing(null) }}>Edit the layout</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-fg-muted">{viewing.description}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              {viewing.kpiCodes.map((code) => {
                const reading = readingByCode[code]
                if (!reading) return null
                const hidden =
                  (reading.sensitivity === 'FINANCIAL' && !canSeeFinancial) || (reading.sensitivity === 'PEOPLE' && !canSeePeople)
                if (hidden) {
                  return (
                    <div key={code} className="card border-dashed p-3 opacity-70">
                      <p className="text-2xs uppercase tracking-wide text-fg-subtle">{reading.name}</p>
                      <p className="mt-1 text-lg font-semibold text-fg-subtle">restricted</p>
                      <p className="mt-1 text-[10px] text-fg-muted">
                        This card is blank for roles without the {reading.sensitivity.toLowerCase()} permission — the rest of the
                        dashboard still works.
                      </p>
                    </div>
                  )
                }
                return <KpiCard key={code} reading={reading} size="sm" />
              })}
            </div>

            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Feeds</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {viewing.modules.map((m) => {
                  const src = sources.find((s) => s.module === m)
                  return (
                    <span key={m} className="flex items-center gap-1">
                      <ModuleChip module={m} />
                      {src && src.status !== 'HEALTHY' && (
                        <Badge tone="warning" size="sm" dot={false}>{src.status.toLowerCase()}</Badge>
                      )}
                    </span>
                  )
                })}
              </div>
              <p className="mt-2 text-2xs text-fg-muted">
                Version {viewing.version}, last changed by {viewing.updatedBy} on {formatDate(viewing.updatedOn)}. Every change to
                a dashboard bumps the version and is written to the access log.
              </p>
            </div>
          </div>
        )}
      </Drawer>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why fourteen dashboards rather than one with filters" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Different questions.</span> A CFO wants margin and cash. A supervisor wants
            output against target for the next four hours. Those are not the same screen with a filter on it.
          </p>
          <p>
            <span className="font-medium text-fg">Different refresh rates.</span> Five minutes on the shop floor, an hour on the
            ledger. One dashboard would have to pick the fastest, which costs load for no benefit.
          </p>
          <p>
            <span className="font-medium text-fg">Different permissions.</span> Row scope and masked fields are set per role. An
            operator dashboard with revenue filtered out is still one careless change away from showing it.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
