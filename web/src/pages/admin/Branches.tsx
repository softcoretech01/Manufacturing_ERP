import { GitBranch, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { HowItWorks, useCrud, type CrudField } from '@/components/crud/CrudKit'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { branches as seedBranches, plants, warehouses } from '@/mock/data'
import { useActiveContext } from '@/store/auth'
import type { Branch } from '@/types'

const STATES = [
  { code: '33', name: 'Tamil Nadu' },
  { code: '29', name: 'Karnataka' },
  { code: '07', name: 'Delhi' },
  { code: '27', name: 'Maharashtra' },
  { code: '24', name: 'Gujarat' },
  { code: '36', name: 'Telangana' },
]

const BRANCH_TYPES = [
  { value: 'HEAD_OFFICE', label: 'Head office' },
  { value: 'FACTORY', label: 'Factory' },
  { value: 'DEPOT', label: 'Depot' },
  { value: 'SALES_OFFICE', label: 'Sales office' },
  { value: 'WAREHOUSE_ONLY', label: 'Warehouse only' },
]

export function BranchesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { company } = useActiveContext()

  const fields: CrudField[] = [
    { name: 'code', label: 'Branch code', required: true, upper: true, maxLength: 8, placeholder: 'MUM', hint: 'Short code used on documents.' },
    { name: 'name', label: 'Branch name', required: true, placeholder: 'Mumbai Depot' },
    { name: 'branchType', label: 'Branch type', type: 'select', required: true, options: BRANCH_TYPES },
    { name: 'stateCode', label: 'State', type: 'select', required: true, options: STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` })) },
    { name: 'hasSeparateGstin', label: 'This branch has its own GST registration', type: 'switch', span: 2, hint: 'Turn on when the branch files GST separately from head office.' },
    {
      name: 'gstin',
      label: 'GSTIN',
      upper: true,
      maxLength: 15,
      span: 2,
      required: true,
      placeholder: '33AABCS1234K1ZP',
      showIf: (v) => v.hasSeparateGstin === 'true',
      hint: 'Checked three ways: format, the PAN inside it, and the state code.',
      validate: (v, values) => {
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v))
          return 'Not a valid GSTIN. It should be 15 characters, like 33AABCS1234K1ZP.'
        if (v.slice(2, 12) !== company.pan) return `The PAN inside this GSTIN (${v.slice(2, 12)}) is not the company PAN (${company.pan}).`
        if (v.slice(0, 2) !== values.stateCode) return `This GSTIN belongs to state ${v.slice(0, 2)}, but you selected state ${values.stateCode}.`
        return undefined
      },
    },
    { name: 'city', label: 'City', required: true },
    { name: 'pincode', label: 'PIN code', required: true, maxLength: 6, validate: (v) => (/^[1-9][0-9]{5}$/.test(v) ? undefined : 'A PIN code is 6 digits and cannot start with 0.') },
    { name: 'contactPerson', label: 'Contact person' },
    { name: 'phone', label: 'Phone', type: 'tel', placeholder: '+91 98400 12345' },
  ]

  const crud = useCrud<Branch>({
    key: 'admin:branch',
    seed: seedBranches,
    entity: 'Branch',
    fields,
    titleOf: (b) => `${b.code} — ${b.name}`,
    defaults: { branchType: 'FACTORY', stateCode: '33', hasSeparateGstin: 'false' },
    toForm: (b) => ({
      code: b.code,
      name: b.name,
      branchType: b.branchType,
      stateCode: b.stateCode,
      hasSeparateGstin: String(b.hasSeparateGstin),
      gstin: b.gstin ?? '',
      city: b.city,
      pincode: b.pincode,
      contactPerson: b.contactPerson,
      phone: b.phone,
    }),
    fromForm: (v, existing) => ({
      companyUid: existing?.companyUid ?? company.uid,
      code: v.code,
      name: v.name,
      branchType: v.branchType as Branch['branchType'],
      stateCode: v.stateCode,
      state: STATES.find((s) => s.code === v.stateCode)?.name ?? '',
      hasSeparateGstin: v.hasSeparateGstin === 'true',
      gstin: v.hasSeparateGstin === 'true' ? v.gstin : null,
      city: v.city,
      pincode: v.pincode,
      contactPerson: v.contactPerson ?? '',
      phone: v.phone ?? '',
      isActive: existing?.isActive ?? true,
    }),
    blockDelete: (b) => {
      const p = plants.filter((x) => x.branchUid === b.uid).length
      const w = warehouses.filter((x) => x.branchUid === b.uid).length
      if (p || w) return `${b.name} still has ${p} plants and ${w} warehouses attached. Move or delete those first.`
      return undefined
    },
  })

  const rows = crud.rows.filter((b) => b.companyUid === company.uid)

  const columns: Column<Branch>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '80px', render: (b) => <span className="font-mono text-xs font-medium">{b.code}</span> },
    { key: 'name', header: 'Branch', sortable: true, render: (b) => <span className="font-medium text-fg">{b.name}</span> },
    { key: 'branchType', header: 'Type', sortable: true, width: '130px', render: (b) => <Badge tone="neutral" size="sm" dot={false}>{b.branchType.replace(/_/g, ' ').toLowerCase()}</Badge> },
    {
      key: 'gstin',
      header: 'GSTIN',
      width: '170px',
      render: (b) => (b.gstin ? <span className="font-mono text-[11px]">{b.gstin}</span> : <span className="text-xs text-fg-subtle">Uses head office</span>),
    },
    { key: 'city', header: 'City', sortable: true, width: '130px' },
    { key: 'state', header: 'State', sortable: true, width: '130px', render: (b) => `${b.state} (${b.stateCode})` },
    { key: 'pincode', header: 'PIN', width: '80px', defaultHidden: true },
    { key: 'contactPerson', header: 'Contact', defaultHidden: true },
    { key: 'phone', header: 'Phone', defaultHidden: true },
    {
      key: 'plants',
      header: 'Plants',
      align: 'right',
      width: '70px',
      accessor: (b) => plants.filter((p) => p.branchUid === b.uid).length,
    },
    {
      key: 'warehouses',
      header: 'Stores',
      align: 'right',
      width: '70px',
      accessor: (b) => warehouses.filter((w) => w.branchUid === b.uid).length,
    },
    {
      key: 'isActive',
      header: 'Status',
      width: '90px',
      accessor: (b) => (b.isActive ? 'Active' : 'Inactive'),
      render: (b) => <Badge tone={b.isActive ? 'success' : 'neutral'} size="sm">{b.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'branches', 'Branches', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows saved as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Branches"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Branches' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => crud.openCreate()}>
            Add branch
          </Button>
        }
      />

      <HowItWorks>
        A branch is one of your registered business addresses. Add a branch here before you can create
        plants or stores under it. If a branch has its own GST number, stock moved to or from it counts
        as a sale between locations and needs a tax invoice — so tick that box only when it is true.
      </HowItWorks>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(b) => b.uid}
        searchPlaceholder="Branch name, code, GSTIN or city…"
        onExport={doExport}
        onRowClick={crud.openEdit}
        emptyTitle="No branches yet"
        emptyDescription="Add your first branch to start building the organisation."
        emptyAction={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => crud.openCreate()}>
            Add branch
          </Button>
        }
        rowActions={(b) => (
          <>
            <MenuItem label="Edit" icon={<Pencil />} onClick={() => crud.openEdit(b)} />
            <MenuItem label="View plants" onClick={() => navigate('/admin/plants')} />
            <MenuItem label="View warehouses" onClick={() => navigate('/admin/warehouses')} />
            <MenuItem
              label={b.isActive ? 'Deactivate' : 'Activate'}
              icon={<Power />}
              separatorBefore
              onClick={() => {
                crud.update(b.uid, { isActive: !b.isActive } as Partial<Branch>)
                toast.success(b.isActive ? 'Branch deactivated' : 'Branch activated', `${b.name} is now ${b.isActive ? 'inactive' : 'active'}.`)
              }}
            />
            <MenuItem label="Delete" icon={<Trash2 />} danger onClick={() => crud.askDelete(b)} />
          </>
        )}
      />

      {crud.dialogs}
    </div>
  )
}
