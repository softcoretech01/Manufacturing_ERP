import { useMemo, useState } from 'react'
import { Award, HardHat, IdCard, Plus, ShieldCheck, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { useCollection } from '@/store/data'
import {
  GovernanceCard,
  LifecycleTrail,
  MasterActions,
  MasterStatusBadge,
  RevisionPanel,
  RulesCard,
  WhereUsedPanel,
} from '@/components/masters/MasterShell'
import { formatDate } from '@/lib/format'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Employee } from '@/types/masters'

const SKILL_TONE = { TRAINEE: 'neutral', OPERATOR: 'progress', SKILLED: 'success', EXPERT: 'brand' } as const

function EmployeeDetail({ e, onClose }: { e: Employee; onClose: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState('general')

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-3xl"
      title={`${e.employeeCode} — ${e.name}`}
      description={`${e.designation} · ${e.department}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MasterStatusBadge status={e.status} />
            {e.isShopFloor && <Badge tone="progress" size="sm">Shop floor</Badge>}
          </div>
          <MasterActions
            status={e.status}
            usageCount={e.whereUsed.filter((w) => w.isOpen).length}
            onEdit={() => toast.info('Edit', 'Personal data changes route through HR approval.')}
            onSubmit={() => toast.success('Submitted for approval')}
          />
        </div>
      }
    >
      <div className="space-y-4">
        <LifecycleTrail status={e.status} />

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'employment', label: 'Employment' },
            { id: 'skills', label: 'Skills', count: e.skills.length },
            { id: 'statutory', label: 'Statutory' },
            { id: 'whereused', label: 'Where used', count: e.whereUsed.length },
            { id: 'revisions', label: 'Revisions', count: e.revisions.length },
          ]}
        />

        {tab === 'general' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Personal" icon={<IdCard className="h-4 w-4" />} />
              <CardBody>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={e.name} size="lg" />
                  <div>
                    <p className="text-sm font-semibold text-fg">{e.name}</p>
                    <p className="text-2xs text-fg-muted">{e.designation}</p>
                  </div>
                </div>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Employee code', value: e.employeeCode, mono: true },
                    { label: 'Date of birth', value: formatDate(e.dateOfBirth) },
                    { label: 'Gender', value: e.gender === 'M' ? 'Male' : e.gender === 'F' ? 'Female' : 'Other' },
                    { label: 'Blood group', value: e.bloodGroup },
                    { label: 'Mobile', value: e.mobile },
                    { label: 'Email', value: e.email },
                  ]}
                />
              </CardBody>
            </Card>
            <GovernanceCard
              createdBy={e.createdBy}
              createdAt={e.createdAt}
              modifiedBy={e.modifiedBy}
              modifiedAt={e.modifiedAt}
              approvedBy={e.approvedBy}
              approvedAt={e.approvedAt}
              revision={e.revision}
              effectiveFrom={e.effectiveFrom}
              effectiveTo={e.effectiveTo}
            />
          </div>
        )}

        {tab === 'employment' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Employment" />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Designation', value: e.designation },
                    { label: 'Department', value: e.department },
                    { label: 'Grade', value: e.grade },
                    { label: 'Employment type', value: e.employmentType.toLowerCase() },
                    { label: 'Date of joining', value: formatDate(e.dateOfJoining) },
                    { label: 'Reports to', value: e.reportsTo },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Assignment" />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Plant', value: e.plantUid ?? '—' },
                    { label: 'Cost centre', value: e.costCentre },
                    { label: 'Default shift', value: e.shiftCode },
                    { label: 'Shop floor', value: e.isShopFloor ? 'Yes — badge and PIN issued' : 'No' },
                  ]}
                />
                {e.isShopFloor && (
                  <Alert tone="info" className="mt-3">
                    Shop-floor employees sign in with a badge scan or a six-digit PIN on the line
                    terminal. Every operation confirmation is attributed to them individually — a
                    shared login would make the production record worthless.
                  </Alert>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'skills' && (
          <Card>
            <CardHeader
              title="Skill matrix"
              icon={<Award className="h-4 w-4" />}
              description="Certification decides who may be scheduled on which operation"
              actions={<Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => toast.info('Add skill', 'Opens the skill certification form.')}>Add skill</Button>}
            />
            <CardBody className="space-y-2">
              {e.skills.length === 0 && (
                <p className="text-xs text-fg-muted">
                  No skills recorded. This employee cannot be scheduled on any certified operation.
                </p>
              )}
              {e.skills.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-fg">{s.skill}</p>
                    <p className="text-2xs text-fg-subtle">
                      {s.certifiedOn ? `Certified ${formatDate(s.certifiedOn)}` : 'Not certified'}
                    </p>
                  </div>
                  <Badge tone={SKILL_TONE[s.level]} size="sm" dot={false}>{s.level.toLowerCase()}</Badge>
                </div>
              ))}
              <Alert tone="tip" className="mt-2" title="Why this matters on the line">
                Production scheduling checks the skill matrix before assigning an operator to an
                operation. Someone who is not certified on the deep-draw press simply does not
                appear in the pick list — which is a safety control, not a convenience.
              </Alert>
            </CardBody>
          </Card>
        )}

        {tab === 'statutory' && (
          <Card>
            <CardHeader title="Statutory identifiers" icon={<ShieldCheck className="h-4 w-4" />} description="Masked — full values are visible only to payroll" />
            <CardBody>
              <DataGrid
                columns={2}
                items={[
                  { label: 'PF number', value: e.pfNumber ?? 'Not applicable', mono: true },
                  { label: 'UAN', value: e.uanNumber ?? '—', mono: true },
                  { label: 'ESI number', value: e.esiNumber ?? 'Not applicable', mono: true },
                  { label: 'Aadhaar', value: e.aadhaarMasked, mono: true },
                  { label: 'PAN', value: e.panMasked, mono: true },
                  { label: 'Bank account', value: e.bankAccountMasked, mono: true },
                ]}
              />
              <Alert tone="warning" className="mt-3" title="Field-level security applies here">
                Aadhaar, PAN and bank details are masked for everyone except payroll roles, and are
                never written to the audit log or an application log in full. Masking happens
                server-side — the full value is not sent to this screen and then hidden.
              </Alert>
            </CardBody>
          </Card>
        )}

        {tab === 'whereused' && <WhereUsedPanel entries={e.whereUsed} />}
        {tab === 'revisions' && <RevisionPanel revisions={e.revisions} />}
      </div>
    </Drawer>
  )
}

export function EmployeeMasterPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  
  const { data: list = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: api.getEmployees,
  })

  const updateMutation = useMutation({
    mutationFn: ({ uid, data }: { uid: string, data: any }) => api.updateEmployee(uid, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
  
  const removeMutation = useMutation({
    mutationFn: (uid: string) => api.deleteEmployee(uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createEmployee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setFormOpen(false)
      toast.success('Submitted for approval')
    },
    onError: (e: any) => toast.error('Failed to create', e.message),
  })

  const update = (uid: string, data: any) => updateMutation.mutate({ uid, data })
  const remove = (uid: string) => removeMutation.mutate(uid)

  const [tab, setTab] = useState('list')
  const [detail, setDetail] = useState<Employee | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  
  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formDob, setFormDob] = useState('')
  const [formGender, setFormGender] = useState('M')
  const [formMobile, setFormMobile] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formDesignation, setFormDesignation] = useState('')
  const [formDepartment, setFormDepartment] = useState('Production')
  const [formType, setFormType] = useState('PERMANENT')
  const [formDoj, setFormDoj] = useState('')
  const [formShift, setFormShift] = useState('SH-A')
  const [formShopFloor, setFormShopFloor] = useState(true)

  const [deptFilter, setDeptFilter] = useState('')

  const departments = useMemo(() => [...new Set(list.map((e: any) => e.department))].sort(), [list])
  const rows = deptFilter ? list.filter((e: any) => e.department === deptFilter) : list

  const shopFloor = list.filter((e: any) => e.isShopFloor)
  const noSkills = list.filter((e: any) => e.isShopFloor && e.skills?.length === 0)
  const pending = list.filter((e: any) => e.status !== 'ACTIVE' && e.status !== 'INACTIVE')

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'employees', 'Employees', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const columns: Column<Employee>[] = [
    {
      key: 'employeeCode',
      header: 'Employee',
      sortable: true,
      sticky: true,
      width: '240px',
      accessor: (e) => e.name,
      render: (e) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={e.name} size="xs" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-fg">{e.name}</p>
            <p className="truncate font-mono text-2xs text-fg-subtle">{e.employeeCode}</p>
          </div>
        </div>
      ),
    },
    { key: 'designation', header: 'Designation', sortable: true, width: '190px' },
    { key: 'department', header: 'Department', sortable: true, width: '150px', render: (e) => <Badge tone="neutral" size="sm" dot={false}>{e.department}</Badge> },
    { key: 'grade', header: 'Grade', width: '80px', render: (e) => <span className="font-mono text-2xs">{e.grade}</span> },
    {
      key: 'employmentType',
      header: 'Type',
      width: '130px',
      sortable: true,
      render: (e) => (
        <Badge tone={e.employmentType === 'PERMANENT' ? 'success' : e.employmentType === 'CONTRACT' ? 'warning' : 'neutral'} size="sm" dot={false}>
          {e.employmentType.toLowerCase()}
        </Badge>
      ),
    },
    { key: 'shiftCode', header: 'Shift', width: '90px', render: (e) => <span className="font-mono text-2xs">{e.shiftCode}</span> },
    {
      key: 'skills',
      header: 'Skills',
      width: '110px',
      align: 'right',
      accessor: (e) => e.skills.length,
      render: (e) =>
        e.skills.length === 0 ? (
          e.isShopFloor ? <Badge tone="warning" size="sm">None</Badge> : <span className="text-2xs text-fg-subtle">—</span>
        ) : (
          <span className="tabular">{e.skills.length}</span>
        ),
    },
    {
      key: 'isShopFloor',
      header: 'Shop floor',
      width: '110px',
      align: 'center',
      accessor: (e) => (e.isShopFloor ? 1 : 0),
      render: (e) => (e.isShopFloor ? <HardHat className="mx-auto h-3.5 w-3.5 text-progress" /> : null),
    },
    { key: 'status', header: 'Status', width: '130px', sortable: true, render: (e) => <MasterStatusBadge status={e.status} size="sm" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Employees"
        description="One employee record serves HR, payroll, shop-floor attribution and the skill matrix. It is not the same thing as a system user — a line operator has an employee record and a PIN, but no ERP login."
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }, { label: 'HR' }, { label: 'Employees' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => toast.info('Import employees')}>
              Import
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={async () => {
              try {
                const { nextCode } = await api.getNextEmployeeCode()
                setFormCode(nextCode)
              } catch (e) {
                console.error(e)
              }
              setFormOpen(true)
            }}>
              New employee
            </Button>
          </>
        }
      />

      {noSkills.length > 0 && (
        <Alert tone="warning" className="mb-4" title={`${noSkills.length} shop-floor employee has no certified skill`}>
          {noSkills.map((e) => e.name).join(', ')}. They cannot be scheduled on any certified
          operation until the skill matrix is filled in.
        </Alert>
      )}

      {tab === 'list' && (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(e) => e.uid}
          searchPlaceholder="Name, code, designation or department…"
          pageSize={20}
          onRowClick={setDetail}
          onExport={doExport}
          filterChips={deptFilter ? [{ key: 'd', label: 'Department', value: deptFilter, onRemove: () => setDeptFilter('') }] : []}
          onClearFilters={() => setDeptFilter('')}
          toolbar={
            <Select
              sizeVariant="sm"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]}
            />
          }
          rowActions={(e) => (
            <>
              <MenuItem label="Open" onClick={() => setDetail(e)} />
              <MenuItem label="Edit" onClick={() => setDetail(e)} />
              <MenuItem label="Skill matrix" onClick={() => setDetail(e)} />
              <MenuItem
                label="Issue shop-floor PIN"
                disabled={!e.isShopFloor}
                onClick={() => toast.success('Shop-floor PIN issued', `A new six-digit PIN was issued to ${e.name}.`)}
              />
              <MenuItem label="Print badge" disabled={!e.isShopFloor} onClick={() => toast.info('Print badge', `Queues a badge for ${e.name}.`)} />
              <MenuItem
                label={e.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                danger={e.status === 'ACTIVE'}
                separatorBefore
                disabled={e.whereUsed.some((w) => w.isOpen)}
                onClick={() => {
                  update(e.uid, { status: e.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
                  toast.success(e.status === 'ACTIVE' ? 'Deactivated' : 'Activated', e.name)
                }}
              />
              <MenuItem
                label={e.whereUsed.length ? `Delete — blocked (${e.whereUsed.length} refs)` : 'Delete'}
                danger
                disabled={e.whereUsed.length > 0}
                onClick={() => { remove(e.uid); toast.success('Deleted', `${e.employeeCode} — ${e.name}`) }}
              />
            </>
          )}
        />
      )}

      {tab === 'skills' && (
        <Card>
          <CardHeader title="Skill matrix" description="Who is certified on what — the input to production scheduling" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-56">Employee</th>
                    <th className="w-40">Department</th>
                    <th>Certified skills</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.filter((e) => e.isShopFloor || e.skills.length > 0).map((e) => (
                    <tr key={e.uid}>
                      <td>
                        <span className="flex items-center gap-2">
                          <Avatar name={e.name} size="xs" />
                          <span className="text-xs font-medium text-fg">{e.name}</span>
                        </span>
                      </td>
                      <td className="text-fg-muted">{e.department}</td>
                      <td>
                        {e.skills.length === 0 ? (
                          <Badge tone="warning" size="sm">No certified skill</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {e.skills.map((s, i) => (
                              <Badge key={i} tone={SKILL_TONE[s.level]} size="sm" dot={false}>
                                {s.skill} · {s.level.toLowerCase()}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      

      {detail && <EmployeeDetail e={detail} onClose={() => setDetail(null)} />}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title="New employee"
        description="Creates the HR record. A system login, if needed, is granted separately from Access Control."
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => {
              createMutation.mutate({
                name: formName,
                code: formCode || undefined, // If blank, API can use next-code logic or we'll let it fail validation if required. Actually we'll fetch next code.
                dateOfBirth: formDob ? new Date(formDob).toISOString() : undefined,
                gender: formGender,
                mobile: formMobile,
                email: formEmail,
                designation: formDesignation,
                department: formDepartment,
                employmentType: formType,
                dateOfJoining: formDoj ? new Date(formDoj).toISOString() : undefined,
                shiftCode: formShift,
                isShopFloor: formShopFloor,
              })
            }}>
              Submit for approval
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {/* Row 1 */}
          <Input label="Employee code" required placeholder="EMP-0011" className="font-mono" hint="Auto-numbered; override only for migration." value={formCode} onChange={(e) => setFormCode(e.target.value)} disabled />
          <Input label="Full name" required placeholder="Karthik Subramanian" value={formName} onChange={(e) => setFormName(e.target.value)} />
          
          {/* Row 2 */}
          <Select label="Department" required options={departments.map((d) => ({ value: d, label: d }))} value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)} />
          <Input label="Designation" required placeholder="Line Operator" value={formDesignation} onChange={(e) => setFormDesignation(e.target.value)} />
          
          {/* Row 3 */}
          <Select label="Employment type" required options={[{ value: 'PERMANENT', label: 'Permanent' }, { value: 'CONTRACT', label: 'Contract' }, { value: 'TRAINEE', label: 'Trainee' }, { value: 'APPRENTICE', label: 'Apprentice' }]} value={formType} onChange={(e) => setFormType(e.target.value)} />
          <Input label="Date of joining" type="date" required value={formDoj} onChange={(e) => setFormDoj(e.target.value)} />
          
          {/* Row 4 */}
          <Input label="Mobile" required placeholder="9840000000" value={formMobile} onChange={(e) => setFormMobile(e.target.value)} />
          <Input label="Email" type="email" placeholder="name@ssbindustries.co.in" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
          
          {/* Row 5 */}
          <Input label="Date of birth" type="date" required value={formDob} onChange={(e) => setFormDob(e.target.value)} />
          <Select label="Gender" required options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'O', label: 'Other' }]} value={formGender} onChange={(e) => setFormGender(e.target.value)} />
          
          {/* Row 6 */}
          <Select label="Default shift" options={[{ value: 'SH-A', label: 'Shift A — Morning' }, { value: 'SH-B', label: 'Shift B — Afternoon' }, { value: 'SH-C', label: 'Shift C — Night' }, { value: 'SH-GEN', label: 'General' }]} value={formShift} onChange={(e) => setFormShift(e.target.value)} />
          <Switch checked={formShopFloor} onChange={setFormShopFloor} label="Shop floor — issue badge and PIN" />
          
          {/* Row 7 */}
          <div className="md:col-span-2">
            <Alert tone="info">
              Statutory identifiers (Aadhaar, PAN, PF, ESI, bank) are captured on a separate
              payroll-only screen. They are not entered here because this form is visible to more
              people than payroll.
            </Alert>
          </div>
        </div>
      </Modal>
    </div>
  )
}
