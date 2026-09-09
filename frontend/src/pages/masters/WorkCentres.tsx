import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Eye, MoreHorizontal, Download, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows } from '@/lib/export'
import { formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { engineeringApi } from '@/api/engineering'
import type { EngWorkCentre } from '@/types/engineering'

/**
 * Work centres, as Masters sees them.
 *
 * **Read-only on purpose.** A work centre is defined by what it can make, and
 * engineering routings point at it, so Product Engineering owns the record and
 * this screen reads it. Masters does not keep a second copy — two masters with
 * the same name is the defect that cost this project most in Inventory.
 *
 * Three tables called WorkCentre exist on the server. `ERP_Master.WorkCentre`
 * is empty, `admin_erp.WorkCentre` exists only to feed the Machine form's
 * plant/line/centre lookup, and `ERP_Product.EngineeringWorkCentre` is the one
 * with the capacity attributes that planning and costing actually use. This
 * screen shows that last one.
 */
export function WorkCentresPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const [search, setSearch] = useState('')
  const [plantFilter, setPlantFilter] = useState('')
  const [viewRecord, setViewRecord] = useState<EngWorkCentre | null>(null)

  const wcQ = useQuery({
    queryKey: ['masters:work-centres', companyUid],
    queryFn: engineeringApi.getEngWorkCentres,
    enabled: !!companyUid,
  })

  const plants = useMemo(
    () => [...new Set((wcQ.data ?? []).map((w) => w.plant).filter(Boolean))].sort(),
    [wcQ.data],
  )

  const rows = useMemo(() => {
    let list = (wcQ.data ?? []).filter((w) => !w.deletedAt)
    if (plantFilter) list = list.filter((w) => w.plant === plantFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (w) => w.code.toLowerCase().includes(q) || w.name.toLowerCase().includes(q),
      )
    }
    return list
  }, [wcQ.data, search, plantFilter])

  /** Available hours a week, at the centre's OEE target — the number capacity
   *  planning loads operations against. */
  const effectiveHours = (w: EngWorkCentre) =>
    (w.hoursPerDay ?? 0) * 6 * ((w.oeeTargetPct ?? 100) / 100)

  const columns: Column<EngWorkCentre>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'code', header: 'Work Centre', width: '250px', sortable: true, className: 'cell-stack',
      accessor: (w) => `${w.code} ${w.name}`,
      render: (w) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg" title={w.name}>{w.name}</p>
          <p className="truncate font-mono text-[12px] text-fg-subtle" title={String(w.code ?? "")}>{w.code}</p>
        </div>
      ),
    },
    {
      key: 'plant', header: 'Plant', width: '190px', sortable: true,
      accessor: (w) => w.plant ?? '',
      render: (w) => <span className="text-[14px] text-fg-muted">{w.plant || '—'}</span>,
    },
    {
      key: 'shiftPattern', header: 'Shift Pattern', width: '150px', defaultHidden: true,
      accessor: (w) => w.shiftPattern ?? '',
      render: (w) => <span className="text-[14px] text-fg-muted">{w.shiftPattern || '—'}</span>,
    },
    {
      key: 'hoursPerDay', header: 'Hours / Day', width: '130px', align: 'right', sortable: true,
      accessor: (w) => w.hoursPerDay,
      render: (w) => <span className="text-[14px] tabular-nums text-fg">{w.hoursPerDay ?? 0}</span>,
    },
    {
      key: 'oeeTargetPct', header: 'OEE Target', width: '130px', align: 'right',
      accessor: (w) => w.oeeTargetPct,
      render: (w) => (
        <span className="text-[14px] tabular-nums text-fg-muted">{w.oeeTargetPct ?? 0}%</span>
      ),
    },
    {
      key: 'effective', header: 'Effective Hrs', width: '150px', align: 'right', sortable: true,
      accessor: (w) => effectiveHours(w),
      render: (w) => (
        <span className="text-[14px] font-semibold tabular-nums text-brand-600">
          {effectiveHours(w).toFixed(1)}
        </span>
      ),
    },
    {
      key: 'machineRatePerHour', header: 'Rate / Hr', width: '135px', align: 'right', defaultHidden: true,
      accessor: (w) => w.machineRatePerHour,
      render: (w) => (
        <span className="text-[14px] tabular-nums text-fg-muted">{formatCurrency(w.machineRatePerHour ?? 0)}</span>
      ),
    },
    {
      key: 'isActive', header: 'Status', width: '110px', align: 'center',
      accessor: (w) => (w.isActive ? 'Active' : 'Inactive'),
      render: (w) => (
        <Badge tone={w.isActive ? 'success' : 'neutral'} size="sm">
          {w.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: 'Actions', width: '110px', align: 'center', className: 'col-flex',
      render: (w) => (
        <div className="flex items-center justify-center gap-0.5">
          <IconButton
            icon={Eye} variant="ghost" size="sm" title="View"
            aria-label={`View ${w.code}`} onClick={() => setViewRecord(w)}
          />
          <Menu trigger={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" title="More actions" aria-label="More actions" />}>
            <MenuItem
              label="Edit in Product Engineering"
              icon={<ExternalLink />}
              onClick={() => navigate('/engineering/work-centres')}
            />
            <MenuItem label="View capacity load" onClick={() => navigate('/planning/capacity')} />
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        title="Work Centres"
        description="Where operations are performed, with the hours and rates planning and costing load against."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Masters' }, { label: 'Work Centres' }]}
        actions={
          <Button variant="outline" icon={<ExternalLink className="h-4 w-4" />}
            onClick={() => navigate('/engineering/work-centres')}>
            Manage in Product Engineering
          </Button>
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load work centres.</Alert>}
      {wcQ.error && (
        <Alert tone="danger" title="Could not load work centres">
          {wcQ.error instanceof ProblemError ? wcQ.error.problem.detail : 'Unable to load work centre data.'}
        </Alert>
      )}

      <Alert tone="info" title="Owned by Product Engineering">
        A work centre is defined by what it can make, and routings point at it, so the record lives
        in Product Engineering. This screen reads it — there is deliberately no second copy here.
      </Alert>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="wc-search" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Search</label>
          <input
            id="wc-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or name…"
            className="h-9 w-64 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="wc-plant" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Plant</label>
          <select
            id="wc-plant" value={plantFilter} onChange={(e) => setPlantFilter(e.target.value)}
            className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          >
            <option value="">All plants</option>
            {plants.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setSearch(''); setPlantFilter('') }}>
            Clear Filters
          </Button>
          <Button
            size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => {
              const n = exportRows('csv', 'work-centres', 'Work centres', columnsFromTable(columns), rows)
              toast.success('Export ready', `${n} rows written.`)
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <DataTable
        density="comfortable"
        searchable={false}
        rows={rows}
        columns={columns}
        rowKey={(w) => w.uid}
        loading={wcQ.isLoading}
        emptyTitle="No work centres"
        emptyDescription="Work centres are created in Product Engineering."
      />

      {viewRecord && (
        <Modal
          open
          onClose={() => setViewRecord(null)}
          title={`${viewRecord.code} — ${viewRecord.name}`}
          size="2xl"
          footer={<Button variant="secondary" onClick={() => setViewRecord(null)}>Close</Button>}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {([
              ['Code', viewRecord.code],
              ['Name', viewRecord.name],
              ['Plant', viewRecord.plant || '—'],
              ['Shift Pattern', viewRecord.shiftPattern || '—'],
              ['Hours per Day', String(viewRecord.hoursPerDay ?? 0)],
              ['OEE Target', `${viewRecord.oeeTargetPct ?? 0}%`],
              ['Effective Hours / Week', effectiveHours(viewRecord).toFixed(1)],
              ['Machine Rate / Hour', formatCurrency(viewRecord.machineRatePerHour ?? 0)],
              ['Labour Rate / Hour', formatCurrency(viewRecord.labourRatePerHour ?? 0)],
              ['Overhead', `${viewRecord.overheadPct ?? 0}%`],
              ['Machines', viewRecord.machineCodes?.length ? viewRecord.machineCodes.join(', ') : '—'],
              ['Status', viewRecord.isActive ? 'Active' : 'Inactive'],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <p className="text-2xs font-medium uppercase tracking-wider text-fg-muted">{label}</p>
                <p className="mt-0.5 text-sm font-medium text-fg">{value}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

export default WorkCentresPage
