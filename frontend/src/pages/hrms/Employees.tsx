import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import {
  DueCell,
  EMPLOYMENT_TYPE_LABEL,
  EmployeeCell,
  HrStatusBadge,
  PayCell,
  RoleCell,
  SkillLevelMeter,
  useCanSeePay,
} from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { employeeSkills as seedSkills, hrEmployees as seedEmployees } from '@/mock/hrms'
import type { EmployeeSkill, EmploymentType, HrEmployee } from '@/types/hrms'

const TABS = [
  { id: 'ACTIVE', label: 'On roll' },
  { id: 'SHOPFLOOR', label: 'Shop floor' },
  { id: 'ATTENTION', label: 'Needs attention' },
  { id: 'ALL', label: 'Everyone' },
]

/**
 * Employee register — the HR view of the person, which is the master record plus
 * the fields only HR and payroll need. Statutory identifiers are held masked and
 * salary sits behind its own permission, because a colleague being able to read
 * a payslip figure casually is the most common real HR data leak.
 */
export function EmployeesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeePay = useCanSeePay()
  const seed = useMemo(() => seedEmployees, [])
  const skillSeed = useMemo(() => seedSkills, [])

  const crud = useCrud<HrEmployee>({
    key: 'hrms:employee',
    seed,
    entity: 'Employee',
    titleOf: (e) => `${e.fullName} (${e.employeeCode})`,
    fields: [
      { name: 'employeeCode', label: 'Employee code', required: true, readOnly: true, hint: 'Issued by the numbering engine' },
      { name: 'fullName', label: 'Full name', required: true },
      { name: 'designation', label: 'Designation', required: true },
      { name: 'department', label: 'Department', required: true },
      { name: 'grade', label: 'Grade', required: true },
      {
        name: 'employmentType',
        label: 'Employment type',
        type: 'select',
        required: true,
        options: Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'reportsTo', label: 'Reports to', required: true },
      { name: 'dateOfJoining', label: 'Date of joining', type: 'date', required: true },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
      { name: 'mobile', label: 'Mobile', type: 'tel', required: true },
      { name: 'email', label: 'Work email', type: 'email', required: true },
      { name: 'emergencyContact', label: 'Emergency contact', type: 'tel' },
      { name: 'plant', label: 'Plant', required: true },
      { name: 'costCentre', label: 'Cost centre', required: true },
      { name: 'workCentre', label: 'Work centre', hint: 'Shop-floor staff only' },
      { name: 'shiftCode', label: 'Shift', required: true },
      { name: 'bankName', label: 'Bank' },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        employeeCode: v.employeeCode,
        section: null,
        confirmationDueOn: null,
        contractEndOn: null,
        gender: 'M' as const,
        productionLine: null,
        isShopFloor: false,
        pfNumber: null,
        esiNumber: null,
        uanNumber: null,
        panMasked: 'not captured',
        aadhaarMasked: 'not captured',
        bankAccountMasked: 'not captured',
        taxRegime: 'NEW' as const,
        salaryStructureCode: 'SS-STAFF',
        monthlyCtc: 0,
        status: 'PROBATION' as const,
        exitDate: null,
        exitReason: null,
      }),
      fullName: v.fullName,
      designation: v.designation,
      department: v.department,
      grade: v.grade,
      employmentType: v.employmentType as EmploymentType,
      reportsTo: v.reportsTo,
      dateOfJoining: v.dateOfJoining,
      dateOfBirth: v.dateOfBirth,
      mobile: v.mobile,
      email: v.email,
      emergencyContact: v.emergencyContact,
      plant: v.plant,
      costCentre: v.costCentre,
      workCentre: v.workCentre || null,
      shiftCode: v.shiftCode,
      bankName: v.bankName,
    }),
    blockDelete: (e) =>
      e.status !== 'EXITED'
        ? `${e.fullName} is still on roll. An employee is never deleted — run the exit process, which keeps the payroll history, the statutory record and the attendance trail intact.`
        : undefined,
  })

  const employees = crud.rows
  const { rows: skills } = useCollection<EmployeeSkill>('hrms:employee-skill', skillSeed)

  const [tab, setTab] = useState('ACTIVE')
  const [department, setDepartment] = useState('all')
  const [viewing, setViewing] = useState<HrEmployee | null>(null)

  const departments = [...new Set(employees.map((e) => e.department))].sort()

  const daysTo = (d: string | null) => (d ? Math.round((new Date(d).getTime() - Date.now()) / 86_400_000) : null)
  /** Confirmation due, contract expiring or on notice — anything HR must act on. */
  const needsAttention = (e: HrEmployee) => {
    const conf = daysTo(e.confirmationDueOn)
    const cont = daysTo(e.contractEndOn)
    return e.status === 'NOTICE' || (conf !== null && conf < 30) || (cont !== null && cont < 45)
  }

  const visible = employees
    .filter((e) => (department === 'all' ? true : e.department === department))
    .filter((e) => {
      if (tab === 'ACTIVE') return e.status !== 'EXITED'
      if (tab === 'SHOPFLOOR') return e.isShopFloor
      if (tab === 'ATTENTION') return needsAttention(e)
      return true
    })

  const onRoll = employees.filter((e) => e.status !== 'EXITED')
  const attention = employees.filter(needsAttention)
  const shopFloor = onRoll.filter((e) => e.isShopFloor)
  const totalCtc = onRoll.reduce((s, e) => s + e.monthlyCtc, 0)

  const columns: Column<HrEmployee>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (e) => (
      <button type="button" onClick={() => setViewing(e)} className="text-left">
        <p className="truncate text-xs font-medium text-brand-600 hover:underline">{e.fullName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{e.employeeCode}</p>
      </button>
    ) },
    { key: 'designation', header: 'Role', sortable: true, render: (e) => <RoleCell designation={e.designation} department={e.department} /> },
    { key: 'grade', header: 'Grade', align: 'center', width: '5.5rem', sortable: true },
    { key: 'employmentType', header: 'Type', sortable: true, width: '9rem', render: (e) => (
      <Badge
        tone={e.employmentType === 'PERMANENT' ? 'success' : e.employmentType === 'CONTRACT' ? 'warning' : 'neutral'}
        size="sm"
        dot={false}
      >
        {EMPLOYMENT_TYPE_LABEL[e.employmentType]}
      </Badge>
    ) },
    { key: 'reportsTo', header: 'Reports to', sortable: true, defaultHidden: true },
    { key: 'shiftCode', header: 'Shift', align: 'center', width: '6.5rem', sortable: true, render: (e) => (
      <span className="font-mono text-2xs text-fg-muted">{e.shiftCode.replace('SH-', '')}</span>
    ) },
    { key: 'workCentre', header: 'Work centre', sortable: true, render: (e) => (
      e.workCentre ? <span className="text-xs">{e.workCentre}</span> : <span className="text-2xs text-fg-subtle">off floor</span>
    ) },
    { key: 'dateOfJoining', header: 'Joined', sortable: true, width: '9rem', accessor: (e) => e.dateOfJoining, render: (e) => (
      <div className="min-w-0">
        <p className="text-xs text-fg">{formatDate(e.dateOfJoining)}</p>
        <p className="text-2xs text-fg-subtle">
          {Math.floor((Date.now() - new Date(e.dateOfJoining).getTime()) / 31_536_000_000)} yr service
        </p>
      </div>
    ) },
    { key: 'milestone', header: 'Next milestone', width: '11rem', render: (e) => (
      e.status === 'NOTICE' ? (
        <span className="text-2xs font-medium text-danger">leaves {formatDate(e.exitDate ?? '')}</span>
      ) : e.confirmationDueOn ? (
        <DueCell date={e.confirmationDueOn} label="confirm" />
      ) : e.contractEndOn ? (
        <DueCell date={e.contractEndOn} label="contract ends" />
      ) : (
        <span className="text-2xs text-fg-subtle">—</span>
      )
    ) },
    ...(canSeePay
      ? [{
          key: 'monthlyCtc', header: 'Monthly CTC', align: 'right' as const, sortable: true, width: '10rem',
          render: (e: HrEmployee) => <PayCell amount={e.monthlyCtc} />,
        }]
      : []),
    { key: 'skills', header: 'Certified skills', width: '13rem', render: (e) => {
      const mine = skills.filter((s) => s.employeeCode === e.employeeCode)
      if (!mine.length) return <span className="text-2xs text-fg-subtle">none recorded</span>
      const best = mine.reduce((a, b) => (a.level === 'TRAINER' || a.level === 'EXPERT' ? a : b))
      return (
        <div className="min-w-0">
          <SkillLevelMeter level={best.level} compact />
          <p className="truncate text-2xs text-fg-subtle">{mine.length} skill{mine.length === 1 ? '' : 's'} · {best.skillName}</p>
        </div>
      )
    } },
    { key: 'mobile', header: 'Contact', defaultHidden: true, render: (e) => <span className="font-mono text-2xs">{e.mobile}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '8.5rem', render: (e) => <HrStatusBadge status={e.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'employee-register', 'Employee register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Employees' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/organisation')}>Organisation</Button>
            <Button variant="primary" size="sm" onClick={() => crud.openCreate({ employeeCode: `EMP-${String(21 + employees.length).padStart(4, '0')}`, employmentType: 'PROBATION', plant: 'Chennai — Unit 1', shiftCode: 'SH-GEN', costCentre: 'CC-ADMIN' })}>
              Add an employee
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'ATTENTION' ? attention.length : undefined }))} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-52"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          options={[{ value: 'all', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]}
        />
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg tabular">{onRoll.length}</span> on roll ·{' '}
          <span className="font-medium text-fg tabular">{shopFloor.length}</span> on the shop floor
          {attention.length > 0 && <>, <span className="font-medium text-warning">{attention.length}</span> needing HR action</>}
          {canSeePay && <> · monthly payroll commitment <span className="font-medium text-fg tabular">₹{totalCtc.toLocaleString('en-IN')}</span></>}
        </p>
      </div>

      {attention.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Needs HR action" description="A confirmation missed or a contract allowed to lapse becomes an industrial-relations problem" />
          <CardBody className="space-y-2">
            {attention.map((e) => (
              <div key={e.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">{e.fullName} — {e.designation}</p>
                  <p className="text-2xs text-fg-muted">
                    {e.status === 'NOTICE'
                      ? `On notice, last working day ${formatDate(e.exitDate ?? '')}. ${e.exitReason ?? ''}`
                      : e.confirmationDueOn
                        ? `Probation confirmation due ${formatDate(e.confirmationDueOn)} — an unconfirmed employee stays on probation terms by default.`
                        : `Contract ends ${formatDate(e.contractEndOn ?? '')} — renew or release before the date, not after.`}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {e.status === 'PROBATION' && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => {
                        crud.update(e.uid, { status: 'ACTIVE', employmentType: 'PERMANENT', confirmationDueOn: null })
                        toast.success('Confirmed', `${e.fullName} confirmed as permanent. Earned leave and gratuity accrual start from the confirmation date.`)
                      }}
                    >
                      Confirm
                    </Button>
                  )}
                  {e.contractEndOn && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const next = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
                        crud.update(e.uid, { contractEndOn: next })
                        toast.success('Contract renewed', `${e.fullName}'s contract extended to ${formatDate(next)}.`)
                      }}
                    >
                      Renew
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setViewing(e)}>Open</Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(e) => e.uid}
        searchPlaceholder="Search name, code, designation, department or work centre…"
        onExport={doExport}
        emptyTitle="No employees match this filter"
        rowClassName={(e) => cn(
          e.status === 'EXITED' && 'opacity-60',
          e.status === 'NOTICE' && 'bg-danger/[0.04]',
          e.status === 'PROBATION' && 'bg-warning/[0.03]',
        )}
        rowActions={(e) => (
          <>
            <MenuItem label="Edit the employee" onClick={() => crud.openEdit(e)} />
            <MenuItem label="Delete the employee" danger onClick={() => crud.askDelete(e)} />
            <MenuItem separatorBefore label="Open the full record" onClick={() => setViewing(e)} />
            <MenuItem
              label="Confirm from probation"
              disabled={e.status !== 'PROBATION'}
              onClick={() => {
                crud.update(e.uid, { status: 'ACTIVE', employmentType: 'PERMANENT', confirmationDueOn: null })
                toast.success('Confirmed', `${e.fullName} is now permanent.`)
              }}
            />
            <MenuItem label="View attendance" onClick={() => navigate('/hrms/attendance')} />
            <MenuItem label="View payslips" onClick={() => navigate('/hrms/payslips')} />
            <MenuItem label="View skills" onClick={() => navigate('/hrms/skills')} />
            <MenuItem
              separatorBefore
              label="Start the exit process"
              danger
              disabled={e.status === 'EXITED' || e.status === 'NOTICE'}
              onClick={() => {
                const last = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
                crud.update(e.uid, { status: 'NOTICE', exitDate: last, exitReason: 'Resignation accepted — notice period running' })
                toast.success(
                  'Exit started',
                  `${e.fullName} is on notice to ${formatDate(last)}. Full and final settlement, gratuity and the PF exit date all follow from this.`,
                )
              }}
            />
          </>
        )}
      />

      {/* Full record ------------------------------------------------------- */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.fullName ?? ''}
        description={viewing ? `${viewing.employeeCode} · ${viewing.designation} · ${viewing.department}` : ''}
        width="max-w-2xl"
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
              <Button variant="primary" onClick={() => { crud.openEdit(viewing); setViewing(null) }}>Edit</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded border border-border bg-surface-2 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-semibold text-brand-600">
                {viewing.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{viewing.fullName}</p>
                <p className="truncate text-2xs text-fg-muted">
                  {viewing.designation} · {viewing.department} · grade {viewing.grade}
                </p>
              </div>
              <HrStatusBadge status={viewing.status} />
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Employment</h3>
              <DataGrid
                items={[
                  { label: 'Employee code', value: viewing.employeeCode, mono: true },
                  { label: 'Employment type', value: EMPLOYMENT_TYPE_LABEL[viewing.employmentType] },
                  { label: 'Reports to', value: viewing.reportsTo },
                  { label: 'Date of joining', value: formatDate(viewing.dateOfJoining) },
                  { label: 'Confirmation due', value: viewing.confirmationDueOn ? formatDate(viewing.confirmationDueOn) : 'confirmed' },
                  { label: 'Contract ends', value: viewing.contractEndOn ? formatDate(viewing.contractEndOn) : 'not on contract' },
                  { label: 'Plant', value: viewing.plant },
                  { label: 'Cost centre', value: viewing.costCentre, mono: true },
                  { label: 'Shift', value: viewing.shiftCode, mono: true },
                  { label: 'Work centre', value: viewing.workCentre ?? 'off floor' },
                  { label: 'Production line', value: viewing.productionLine ?? '—' },
                ]}
              />
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Contact</h3>
              <DataGrid
                items={[
                  { label: 'Mobile', value: viewing.mobile, mono: true },
                  { label: 'Work email', value: viewing.email },
                  { label: 'Emergency contact', value: viewing.emergencyContact, mono: true },
                  { label: 'Date of birth', value: formatDate(viewing.dateOfBirth) },
                ]}
              />
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Statutory & payroll</h3>
              {canSeePay ? (
                <DataGrid
                  items={[
                    { label: 'Salary structure', value: viewing.salaryStructureCode, mono: true },
                    { label: 'Monthly CTC', value: `₹${viewing.monthlyCtc.toLocaleString('en-IN')}` },
                    { label: 'Tax regime', value: viewing.taxRegime === 'OLD' ? 'Old regime' : 'New regime' },
                    { label: 'PF number', value: viewing.pfNumber ?? 'not applicable', mono: true },
                    { label: 'UAN', value: viewing.uanNumber ?? '—', mono: true },
                    { label: 'ESI number', value: viewing.esiNumber ?? 'above the ESI wage ceiling', mono: true },
                    { label: 'PAN', value: viewing.panMasked, mono: true },
                    { label: 'Aadhaar', value: viewing.aadhaarMasked, mono: true },
                    { label: 'Bank', value: viewing.bankName },
                    { label: 'Account', value: viewing.bankAccountMasked, mono: true },
                  ]}
                />
              ) : (
                <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">
                  Salary and statutory identifiers need <span className="font-mono text-fg">HRMS.PAYROLL.VIEW</span>. Even with it,
                  PAN, Aadhaar and the bank account are only ever shown masked — the unmasked value never leaves the server.
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Skills & certification</h3>
              <div className="space-y-1.5">
                {skills.filter((s) => s.employeeCode === viewing.employeeCode).map((s) => (
                  <div key={s.uid} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-fg">{s.skillName}</p>
                      <p className="text-2xs text-fg-subtle">
                        {s.certifiedOn ? `certified ${formatDate(s.certifiedOn)}` : 'not certified'}
                        {s.unitsPerHour ? ` · ${s.unitsPerHour}/hr, ${s.defectRatePct}% defects` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <SkillLevelMeter level={s.level} compact />
                      <HrStatusBadge status={s.status} size="sm" />
                    </div>
                  </div>
                ))}
                {skills.filter((s) => s.employeeCode === viewing.employeeCode).length === 0 && (
                  <p className="py-3 text-center text-xs text-fg-muted">No skills recorded against this employee yet.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </Drawer>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why an employee is never deleted" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Payroll history has to survive.</span> Twelve months of payslips, PF
            contributions and TDS all reference this record. Deleting it would orphan a statutory filing.
          </p>
          <p>
            <span className="font-medium text-fg">Production records name them.</span> Every production entry, scrap record and
            carton carries an operator name. A traceability trail that ends in a missing employee is not a trail.
          </p>
          <p>
            <span className="font-medium text-fg">The exit process is the correct route.</span> It sets a last working day, drives
            the full and final settlement, closes the PF membership and releases the seat back to the sanctioned headcount.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
