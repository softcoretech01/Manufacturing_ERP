import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { HrStatusBadge, ORG_LEVEL_LABEL } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { cn } from '@/lib/cn'
import { orgNodes as seedOrg } from '@/mock/hrms'
import type { OrgNode } from '@/types/hrms'

const TABS = [
  { id: 'TREE', label: 'Structure' },
  { id: 'TABLE', label: 'Headcount table' },
]

/**
 * Organisation structure — six levels from company down to production line, each
 * carrying a sanctioned headcount and a cost centre. The sanctioned figure is
 * what makes a manpower requisition arguable: a department already over its
 * sanction has to justify the post, not merely want it.
 */
export function OrganisationPage() {
  const toast = useToast()
  const seed = useMemo(() => seedOrg, [])

  const crud = useCrud<OrgNode>({
    key: 'hrms:org-node',
    seed,
    entity: 'Organisation unit',
    titleOf: (n) => `${n.name} (${n.code})`,
    fields: [
      { name: 'code', label: 'Unit code', required: true, upper: true },
      { name: 'name', label: 'Unit name', required: true, span: 2 },
      {
        name: 'level',
        label: 'Level',
        type: 'select',
        required: true,
        options: Object.entries(ORG_LEVEL_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'parentCode', label: 'Reports into', hint: 'Leave blank only for the company itself' },
      { name: 'costCentre', label: 'Cost centre', required: true, upper: true },
      { name: 'headEmployeeCode', label: 'Head — employee code' },
      { name: 'headName', label: 'Head — name' },
      { name: 'sanctionedHeadcount', label: 'Sanctioned headcount', type: 'number', required: true },
      { name: 'actualHeadcount', label: 'Actual headcount', type: 'number', required: true },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (n) => ({
      code: n.code,
      name: n.name,
      level: n.level,
      parentCode: n.parentCode ?? '',
      costCentre: n.costCentre,
      headEmployeeCode: n.headEmployeeCode ?? '',
      headName: n.headName ?? '',
      sanctionedHeadcount: String(n.sanctionedHeadcount),
      actualHeadcount: String(n.actualHeadcount),
      isActive: String(n.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? {}),
      code: v.code,
      name: v.name,
      level: v.level as OrgNode['level'],
      parentCode: v.parentCode || null,
      costCentre: v.costCentre,
      headEmployeeCode: v.headEmployeeCode || null,
      headName: v.headName || null,
      sanctionedHeadcount: Number(v.sanctionedHeadcount) || 0,
      actualHeadcount: Number(v.actualHeadcount) || 0,
      isActive: v.isActive !== 'false',
    }),
    blockDelete: (n) => {
      const children = seed.filter((x) => x.parentCode === n.code)
      if (children.length) {
        return `${n.name} has ${children.length} unit${children.length === 1 ? '' : 's'} reporting into it. Move or delete those first — an orphaned department cannot be costed.`
      }
      if (n.actualHeadcount > 0) {
        return `${n.name} still has ${n.actualHeadcount} people in it. Transfer them before removing the unit.`
      }
      return undefined
    },
  })

  const nodes = crud.rows
  const [tab, setTab] = useState('TREE')

  const roots = nodes.filter((n) => !n.parentCode)
  const childrenOf = (code: string) => nodes.filter((n) => n.parentCode === code)

  const overSanction = nodes.filter((n) => n.actualHeadcount > n.sanctionedHeadcount)
  const vacantHeads = nodes.filter((n) => !n.headEmployeeCode && n.level !== 'COMPANY' && n.level !== 'LINE')
  const totalGap = nodes
    .filter((n) => n.level === 'DEPARTMENT')
    .reduce((s, n) => s + Math.max(0, n.sanctionedHeadcount - n.actualHeadcount), 0)

  const fillPct = (n: OrgNode) => (n.sanctionedHeadcount ? (n.actualHeadcount / n.sanctionedHeadcount) * 100 : 0)

  const columns: Column<OrgNode>[] = [
    { key: 'code', header: 'Unit', sortable: true, width: '15rem', render: (n) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{n.name}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{n.code}</p>
      </div>
    ) },
    { key: 'level', header: 'Level', sortable: true, width: '9rem', render: (n) => (
      <Badge tone="neutral" size="sm" dot={false}>{ORG_LEVEL_LABEL[n.level]}</Badge>
    ) },
    { key: 'parentCode', header: 'Reports into', sortable: true, width: '11rem', render: (n) => (
      n.parentCode ? <span className="font-mono text-2xs text-fg-muted">{n.parentCode}</span> : <span className="text-2xs text-fg-subtle">top level</span>
    ) },
    { key: 'headName', header: 'Head', sortable: true, render: (n) => (
      n.headEmployeeCode ? (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{n.headName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{n.headEmployeeCode}</p>
        </div>
      ) : (
        <span className="text-2xs text-warning">{n.headName ?? 'vacant'}</span>
      )
    ) },
    { key: 'costCentre', header: 'Cost centre', sortable: true, width: '9rem', render: (n) => (
      <span className="font-mono text-2xs text-fg-muted">{n.costCentre}</span>
    ) },
    { key: 'sanctionedHeadcount', header: 'Sanctioned', align: 'right', sortable: true, width: '8rem', render: (n) => (
      <span className="tabular text-xs text-fg-muted">{n.sanctionedHeadcount}</span>
    ) },
    { key: 'actualHeadcount', header: 'Actual', align: 'right', sortable: true, width: '7rem', render: (n) => (
      <span className={cn('tabular text-xs font-medium', n.actualHeadcount > n.sanctionedHeadcount ? 'text-danger' : 'text-fg')}>
        {n.actualHeadcount}
      </span>
    ) },
    { key: 'fill', header: 'Against sanction', width: '12rem', sortable: true, accessor: (n) => fillPct(n), render: (n) => (
      <div className="flex items-center gap-2">
        <ProgressBar
          value={Math.min(100, fillPct(n))}
          tone={fillPct(n) > 100 ? 'danger' : fillPct(n) >= 90 ? 'success' : 'warning'}
          className="w-16"
        />
        <span className={cn('text-2xs tabular', fillPct(n) > 100 ? 'font-medium text-danger' : 'text-fg-muted')}>
          {fillPct(n).toFixed(0)}%
        </span>
      </div>
    ) },
    { key: 'gap', header: 'Vacancies', align: 'right', width: '8rem', sortable: true, accessor: (n) => n.sanctionedHeadcount - n.actualHeadcount, render: (n) => {
      const gap = n.sanctionedHeadcount - n.actualHeadcount
      if (gap === 0) return <span className="text-2xs text-success">full</span>
      return (
        <span className={cn('tabular text-xs', gap > 0 ? 'text-warning' : 'font-medium text-danger')}>
          {gap > 0 ? gap : `+${-gap} over`}
        </span>
      )
    } },
    { key: 'isActive', header: 'Status', align: 'center', width: '7.5rem', sortable: true, accessor: (n) => (n.isActive ? 1 : 0), render: (n) => (
      <HrStatusBadge status={n.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'organisation-structure', 'Organisation structure & headcount', columnsFromTable(columns), nodes)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** One row of the tree, drawn recursively. */
  function TreeNode({ node, depth }: { node: OrgNode; depth: number }) {
    const kids = childrenOf(node.code)
    const pct = fillPct(node)
    return (
      <>
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 rounded border p-2.5',
            pct > 100 ? 'border-danger/30 bg-danger/[0.03]' : !node.headEmployeeCode && node.level !== 'COMPANY' && node.level !== 'LINE' ? 'border-warning/30 bg-warning/[0.03]' : 'border-border',
          )}
          style={{ marginLeft: `${depth * 1.25}rem` }}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand-500/10 text-[9px] font-semibold uppercase text-brand-600">
            {ORG_LEVEL_LABEL[node.level].slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-fg">{node.name}</p>
            <p className="truncate text-2xs text-fg-subtle">
              <span className="font-mono">{node.code}</span> · {node.costCentre} ·{' '}
              {node.headEmployeeCode ? node.headName : <span className="text-warning">head vacant</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn('text-2xs tabular', pct > 100 ? 'font-medium text-danger' : 'text-fg-muted')}>
              {node.actualHeadcount}/{node.sanctionedHeadcount}
            </span>
            <ProgressBar value={Math.min(100, pct)} tone={pct > 100 ? 'danger' : pct >= 90 ? 'success' : 'warning'} className="w-14" />
            <Button variant="ghost" size="sm" onClick={() => crud.openEdit(node)}>Edit</Button>
          </div>
        </div>
        {kids.map((k) => (
          <TreeNode key={k.uid} node={k} depth={depth + 1} />
        ))}
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Organisation structure"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Organisation' }]}
        actions={
          <Button variant="primary" size="sm" onClick={() => crud.openCreate({ level: 'DEPARTMENT', isActive: 'true', parentCode: 'PLANT-1' })}>
            Add a unit
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg tabular">{nodes.length}</span> units ·{' '}
        <span className={cn('font-medium tabular', totalGap ? 'text-warning' : 'text-success')}>{totalGap}</span> sanctioned
        vacancies across departments
        {overSanction.length > 0 && <>, <span className="font-medium text-danger">{overSanction.length}</span> unit{overSanction.length === 1 ? '' : 's'} over sanction</>}
        {vacantHeads.length > 0 && <>, <span className="font-medium text-warning">{vacantHeads.length}</span> without a head</>}
        .
      </p>

      {(overSanction.length > 0 || vacantHeads.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Structural gaps" description="Both of these end up as an argument at appraisal time if left alone" />
          <CardBody className="space-y-2">
            {overSanction.map((n) => (
              <div key={n.uid} className="rounded border border-danger/30 bg-danger/5 p-2.5">
                <p className="text-xs font-medium text-fg">{n.name} is over sanction</p>
                <p className="text-2xs text-fg-muted">
                  {n.actualHeadcount} people against a sanction of {n.sanctionedHeadcount}. Either the sanction is stale or the
                  extra heads are being carried without a budget line.
                </p>
              </div>
            ))}
            {vacantHeads.map((n) => (
              <div key={n.uid} className="rounded border border-warning/30 bg-warning/5 p-2.5">
                <p className="text-xs font-medium text-fg">{n.name} has no head</p>
                <p className="text-2xs text-fg-muted">
                  {n.actualHeadcount} people with nobody formally accountable. Leave approvals and appraisals for this unit have
                  no owner.
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === 'TREE' ? (
        <Card>
          <CardHeader
            title="Reporting structure"
            description="Company → division → plant → department → section → line. Every level carries a cost centre."
          />
          <CardBody className="space-y-1.5">
            {roots.map((r) => (
              <TreeNode key={r.uid} node={r} depth={0} />
            ))}
          </CardBody>
        </Card>
      ) : (
        <DataTable
          rows={nodes}
          columns={columns}
          rowKey={(n) => n.uid}
          searchPlaceholder="Search unit, code, head or cost centre…"
          onExport={doExport}
          emptyTitle="No organisation units"
          rowClassName={(n) => cn(
            !n.isActive && 'opacity-60',
            n.actualHeadcount > n.sanctionedHeadcount && 'bg-danger/[0.04]',
            !n.headEmployeeCode && n.level !== 'COMPANY' && n.level !== 'LINE' && 'bg-warning/[0.03]',
          )}
          rowActions={(n) => (
            <>
              <MenuItem label="Edit the unit" onClick={() => crud.openEdit(n)} />
              <MenuItem label="Delete the unit" danger onClick={() => crud.askDelete(n)} />
              <MenuItem
                separatorBefore
                label="Raise the sanction to actual"
                disabled={n.actualHeadcount <= n.sanctionedHeadcount}
                onClick={() => {
                  crud.update(n.uid, { sanctionedHeadcount: n.actualHeadcount })
                  toast.success(
                    'Sanction updated',
                    `${n.name} sanctioned at ${n.actualHeadcount}. The extra heads now sit inside an approved budget line instead of outside one.`,
                  )
                }}
              />
              <MenuItem
                label={n.isActive ? 'Close the unit' : 'Reopen the unit'}
                onClick={() => {
                  if (n.isActive && n.actualHeadcount > 0) {
                    toast.error('Cannot close', `${n.name} still has ${n.actualHeadcount} people. Transfer them first.`)
                    return
                  }
                  crud.update(n.uid, { isActive: !n.isActive })
                  toast.success(n.isActive ? 'Unit closed' : 'Unit reopened', `${n.name} ${n.isActive ? 'closed' : 'reopened'}.`)
                }}
              />
            </>
          )}
        />
      )}

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why the sanctioned headcount matters" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">It makes a vacancy real.</span> A manpower requisition against an unfilled
            sanction is administration. One that pushes a department over its sanction is a decision, and should be argued.
          </p>
          <p>
            <span className="font-medium text-fg">It is the denominator for cost.</span> Labour cost per bottle only means
            something set against a planned crew size, which is what the sanction records.
          </p>
          <p>
            <span className="font-medium text-fg">It carries the cost centre down.</span> A production line inherits its cost
            centre from the section above it, which is how payroll ends up allocated to the right place with no extra typing.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
