import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { EMPLOYMENT_TYPE_LABEL, HrStatusBadge, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { salaryComponents as seedComponents, salaryStructures as seedStructures } from '@/mock/hrms'
import type { ComponentKind, SalaryComponent, SalaryStructure } from '@/types/hrms'

const KIND_LABEL: Record<ComponentKind, string> = {
  EARNING: 'Earning',
  DEDUCTION: 'Deduction',
  EMPLOYER_CONTRIBUTION: 'Employer contribution',
}

const BASIS_LABEL: Record<string, string> = {
  FIXED: 'Fixed amount',
  PERCENT_OF_BASIC: '% of basic',
  PERCENT_OF_GROSS: '% of gross',
  FORMULA: 'Formula',
  ATTENDANCE_BASED: 'Attendance based',
  STATUTORY: 'Statutory rule',
}

const TABS = [
  { id: 'STRUCTURES', label: 'Salary structures' },
  { id: 'COMPONENTS', label: 'Components' },
]

/**
 * Salary structures and components. The component definition is where the real
 * logic lives: whether something is taxable, whether it counts towards PF wages,
 * and whether it prorates when somebody is absent. Those three flags decide the
 * whole payslip, and getting one wrong shows up as a statutory shortfall months
 * later rather than as a wrong number today.
 */
export function SalaryStructuresPage() {
  const toast = useToast()
  const canSeePay = useCanSeePay()
  const structSeed = useMemo(() => seedStructures, [])
  const compSeed = useMemo(() => seedComponents, [])

  const structCrud = useCrud<SalaryStructure>({
    key: 'hrms:salary-structure',
    seed: structSeed,
    entity: 'Salary structure',
    titleOf: (s) => `${s.name} (${s.code})`,
    fields: [
      { name: 'code', label: 'Structure code', required: true, upper: true },
      { name: 'name', label: 'Structure name', required: true },
      { name: 'grade', label: 'Applies to grades', required: true },
      { name: 'monthlyCtc', label: 'Reference monthly CTC', type: 'number', required: true, hint: 'The template figure — each employee carries their own' },
      { name: 'effectiveFrom', label: 'Effective from', type: 'date', required: true },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (s) => ({
      code: s.code,
      name: s.name,
      grade: s.grade,
      monthlyCtc: String(s.monthlyCtc),
      effectiveFrom: s.effectiveFrom,
      isActive: String(s.isActive),
    }),
    fromForm: (v, existing) => {
      const ctc = Number(v.monthlyCtc) || 0
      // The split follows one rule so a change to CTC always reproduces cleanly.
      const basic = Math.round(ctc * 0.5)
      const hra = Math.round(basic * 0.4)
      const conv = 1_600
      const spl = Math.max(0, ctc - basic - hra - conv)
      return {
        ...(existing ?? { appliesTo: ['PERMANENT'] as SalaryStructure['appliesTo'], employeeCount: 0 }),
        code: v.code,
        name: v.name,
        grade: v.grade,
        monthlyCtc: ctc,
        effectiveFrom: v.effectiveFrom,
        isActive: v.isActive !== 'false',
        lines: [
          { componentCode: 'BASIC', componentName: 'Basic', kind: 'EARNING' as const, amount: basic },
          { componentCode: 'HRA', componentName: 'House rent allowance', kind: 'EARNING' as const, amount: hra },
          { componentCode: 'CONV', componentName: 'Conveyance', kind: 'EARNING' as const, amount: conv },
          { componentCode: 'SPL', componentName: 'Special allowance', kind: 'EARNING' as const, amount: spl },
        ],
      }
    },
    blockDelete: (s) =>
      s.employeeCount > 0
        ? `${s.name} is assigned to ${s.employeeCount} employee${s.employeeCount === 1 ? '' : 's'}. Move them to another structure first — a payslip cannot be built without one.`
        : undefined,
  })

  const compCrud = useCrud<SalaryComponent>({
    key: 'hrms:salary-component',
    seed: compSeed,
    entity: 'Component',
    titleOf: (c) => `${c.name} (${c.code})`,
    fields: [
      { name: 'code', label: 'Component code', required: true, upper: true },
      { name: 'name', label: 'Component name', required: true },
      {
        name: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        name: 'basis',
        label: 'Calculated as',
        type: 'select',
        required: true,
        options: Object.entries(BASIS_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'percentValue', label: 'Percentage', type: 'number', showIf: (v) => v.basis?.startsWith('PERCENT') || v.basis === 'STATUTORY' },
      { name: 'formula', label: 'Formula', showIf: (v) => v.basis === 'FORMULA' || v.basis === 'ATTENDANCE_BASED' || v.basis === 'STATUTORY', span: 2 },
      { name: 'sequence', label: 'Order on the payslip', type: 'number', required: true },
      { name: 'isTaxable', label: 'Taxable', type: 'switch' },
      { name: 'partOfPfWages', label: 'Counts towards PF wages', type: 'switch' },
      { name: 'partOfEsiWages', label: 'Counts towards ESI wages', type: 'switch' },
      { name: 'prorateOnAttendance', label: 'Prorates when absent', type: 'switch' },
      { name: 'showOnPayslip', label: 'Shows on the payslip', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (c) => ({
      code: c.code,
      name: c.name,
      kind: c.kind,
      basis: c.basis,
      percentValue: c.percentValue === null ? '' : String(c.percentValue),
      formula: c.formula ?? '',
      sequence: String(c.sequence),
      isTaxable: String(c.isTaxable),
      partOfPfWages: String(c.partOfPfWages),
      partOfEsiWages: String(c.partOfEsiWages),
      prorateOnAttendance: String(c.prorateOnAttendance),
      showOnPayslip: String(c.showOnPayslip),
      isActive: String(c.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? {}),
      code: v.code,
      name: v.name,
      kind: v.kind as ComponentKind,
      basis: v.basis as SalaryComponent['basis'],
      percentValue: v.percentValue ? Number(v.percentValue) : null,
      formula: v.formula || null,
      sequence: Number(v.sequence) || 99,
      isTaxable: v.isTaxable === 'true',
      partOfPfWages: v.partOfPfWages === 'true',
      partOfEsiWages: v.partOfEsiWages === 'true',
      prorateOnAttendance: v.prorateOnAttendance === 'true',
      showOnPayslip: v.showOnPayslip !== 'false',
      isActive: v.isActive !== 'false',
    }),
    blockDelete: (c) =>
      c.basis === 'STATUTORY'
        ? `${c.name} is a statutory component. It cannot be deleted — deactivate it only if the establishment genuinely stops being covered by that Act.`
        : undefined,
  })

  const structures = structCrud.rows
  const components = compCrud.rows
  const [tab, setTab] = useState('STRUCTURES')

  const activeStructures = structures.filter((s) => s.isActive)
  const assigned = structures.reduce((s, x) => s + x.employeeCount, 0)
  const unassignedStructures = structures.filter((s) => s.isActive && s.employeeCount === 0)

  const earnings = components.filter((c) => c.kind === 'EARNING' && c.isActive)
  const deductions = components.filter((c) => c.kind === 'DEDUCTION' && c.isActive)
  const pfWageComponents = components.filter((c) => c.partOfPfWages && c.isActive)

  const structColumns: Column<SalaryStructure>[] = [
    { key: 'code', header: 'Structure', sortable: true, width: '14rem', render: (s) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{s.name}</p>
        <p className="font-mono text-2xs text-fg-subtle">{s.code}</p>
      </div>
    ) },
    { key: 'grade', header: 'Grades', sortable: true, width: '11rem', render: (s) => (
      <span className="font-mono text-2xs text-fg-muted">{s.grade}</span>
    ) },
    { key: 'appliesTo', header: 'Employment types', render: (s) => (
      <div className="flex flex-wrap gap-1">
        {s.appliesTo.map((t) => (
          <Badge key={t} tone="neutral" size="sm" dot={false}>{EMPLOYMENT_TYPE_LABEL[t]}</Badge>
        ))}
      </div>
    ) },
    ...(canSeePay
      ? [{
          key: 'monthlyCtc', header: 'Reference CTC', align: 'right' as const, sortable: true, width: '11rem',
          render: (s: SalaryStructure) => formatCurrency(s.monthlyCtc),
        }]
      : []),
    { key: 'lines', header: 'Composition', width: '18rem', render: (s) => {
      if (!canSeePay) return <span className="text-2xs text-fg-subtle">restricted</span>
      const total = s.lines.reduce((a, l) => a + l.amount, 0) || 1
      return (
        <div className="min-w-0">
          <div className="flex h-2 overflow-hidden rounded-full">
            {s.lines.map((l, i) => (
              <span
                key={l.componentCode}
                title={`${l.componentName} — ${formatCurrency(l.amount)}`}
                className={cn('h-full', ['bg-brand-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500'][i % 4])}
                style={{ width: `${(l.amount / total) * 100}%` }}
              />
            ))}
          </div>
          <p className="mt-1 truncate text-2xs text-fg-subtle">
            {s.lines.map((l) => `${l.componentCode} ${Math.round((l.amount / total) * 100)}%`).join(' · ')}
          </p>
        </div>
      )
    } },
    { key: 'employeeCount', header: 'On this structure', align: 'right', width: '11rem', sortable: true, render: (s) => (
      s.employeeCount
        ? <span className="tabular text-xs font-medium text-fg">{s.employeeCount}</span>
        : <span className="text-2xs text-warning">nobody</span>
    ) },
    { key: 'effectiveFrom', header: 'Effective from', sortable: true, width: '10rem', accessor: (s) => s.effectiveFrom, render: (s) => formatDate(s.effectiveFrom) },
    { key: 'isActive', header: 'Status', align: 'center', width: '7.5rem', sortable: true, accessor: (s) => (s.isActive ? 1 : 0), render: (s) => (
      <HrStatusBadge status={s.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
    ) },
  ]

  const compColumns: Column<SalaryComponent>[] = [
    { key: 'sequence', header: '#', align: 'right', width: '4rem', sortable: true, render: (c) => (
      <span className="tabular text-2xs text-fg-subtle">{c.sequence}</span>
    ) },
    { key: 'code', header: 'Component', sortable: true, width: '15rem', render: (c) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{c.name}</p>
        <p className="font-mono text-2xs text-fg-subtle">{c.code}</p>
      </div>
    ) },
    { key: 'kind', header: 'Kind', sortable: true, width: '12rem', render: (c) => (
      <Badge
        tone={c.kind === 'EARNING' ? 'success' : c.kind === 'DEDUCTION' ? 'danger' : 'progress'}
        size="sm"
        dot={false}
      >
        {KIND_LABEL[c.kind]}
      </Badge>
    ) },
    { key: 'basis', header: 'Calculated as', sortable: true, width: '11rem', render: (c) => (
      <span className="text-2xs text-fg-muted">{BASIS_LABEL[c.basis]}</span>
    ) },
    { key: 'formula', header: 'Rule', render: (c) => (
      c.formula
        ? <span className="font-mono text-2xs text-fg-muted">{c.formula}</span>
        : c.percentValue !== null
          ? <span className="font-mono text-2xs text-fg-muted">{c.percentValue}%</span>
          : <span className="text-2xs text-fg-subtle">a fixed amount per structure</span>
    ) },
    { key: 'isTaxable', header: 'Taxable', align: 'center', width: '7rem', accessor: (c) => (c.isTaxable ? 1 : 0), render: (c) => (
      c.isTaxable ? <Badge tone="warning" size="sm" dot={false}>yes</Badge> : <span className="text-2xs text-fg-subtle">no</span>
    ) },
    { key: 'partOfPfWages', header: 'PF wages', align: 'center', width: '8rem', accessor: (c) => (c.partOfPfWages ? 1 : 0), render: (c) => (
      c.partOfPfWages ? <Badge tone="brand" size="sm" dot={false}>counts</Badge> : <span className="text-2xs text-fg-subtle">no</span>
    ) },
    { key: 'partOfEsiWages', header: 'ESI wages', align: 'center', width: '8.5rem', accessor: (c) => (c.partOfEsiWages ? 1 : 0), render: (c) => (
      c.partOfEsiWages ? <Badge tone="brand" size="sm" dot={false}>counts</Badge> : <span className="text-2xs text-fg-subtle">no</span>
    ) },
    { key: 'prorateOnAttendance', header: 'Prorates', align: 'center', width: '8rem', accessor: (c) => (c.prorateOnAttendance ? 1 : 0), render: (c) => (
      c.prorateOnAttendance ? <Badge tone="neutral" size="sm" dot={false}>on absence</Badge> : <span className="text-2xs text-fg-subtle">full</span>
    ) },
    { key: 'isActive', header: 'Status', align: 'center', width: '7.5rem', sortable: true, accessor: (c) => (c.isActive ? 1 : 0), render: (c) => (
      <HrStatusBadge status={c.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'STRUCTURES'
          ? exportRows(format, 'salary-structures', 'Salary structures', columnsFromTable(structColumns), structures)
          : exportRows(format, 'salary-components', 'Salary components', columnsFromTable(compColumns), components)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Salary structures"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Salary structures' }]}
        actions={
          tab === 'STRUCTURES' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => structCrud.openCreate({ isActive: 'true', effectiveFrom: new Date().toISOString().slice(0, 10) })}
            >
              Add a structure
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => compCrud.openCreate({ kind: 'EARNING', basis: 'FIXED', sequence: '10', showOnPayslip: 'true', isActive: 'true' })}
            >
              Add a component
            </Button>
          )
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      {tab === 'STRUCTURES' ? (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className="font-medium text-fg tabular">{activeStructures.length}</span> active structures covering{' '}
            <span className="font-medium text-fg tabular">{assigned}</span> employees
            {unassignedStructures.length > 0 && (
              <>
                {' '}· <span className="font-medium text-warning">{unassignedStructures.length}</span> structure
                {unassignedStructures.length === 1 ? '' : 's'} with nobody on {unassignedStructures.length === 1 ? 'it' : 'them'}
              </>
            )}
            . A structure is a template — the split follows one rule so changing the CTC always reproduces cleanly.
          </p>

          <DataTable
            rows={structures}
            columns={structColumns}
            rowKey={(s) => s.uid}
            searchPlaceholder="Search structure, code or grade…"
            onExport={doExport}
            emptyTitle="No salary structures"
            rowClassName={(s) => cn(!s.isActive && 'opacity-60', s.isActive && s.employeeCount === 0 && 'bg-warning/[0.03]')}
            rowActions={(s) => (
              <>
                <MenuItem label="Edit the structure" onClick={() => structCrud.openEdit(s)} />
                <MenuItem label="Delete the structure" danger onClick={() => structCrud.askDelete(s)} />
                <MenuItem
                  separatorBefore
                  label={s.isActive ? 'Deactivate' : 'Activate'}
                  onClick={() => {
                    if (s.isActive && s.employeeCount > 0) {
                      toast.error('Cannot deactivate', `${s.employeeCount} employee${s.employeeCount === 1 ? '' : 's'} are on ${s.name}. Move them first.`)
                      return
                    }
                    structCrud.update(s.uid, { isActive: !s.isActive })
                    toast.success(s.isActive ? 'Structure deactivated' : 'Structure activated', `${s.name} updated.`)
                  }}
                />
                <MenuItem
                  label="Duplicate as a new revision"
                  onClick={() => {
                    structCrud.create({
                      ...s,
                      uid: `ss-copy-${Date.now().toString(36)}`,
                      code: `${s.code}-R2`,
                      name: `${s.name} (revised)`,
                      employeeCount: 0,
                      isActive: false,
                      effectiveFrom: new Date().toISOString().slice(0, 10),
                    } as SalaryStructure)
                    toast.success('Revision created', `${s.code}-R2 created as an inactive draft. Edit the CTC, then activate it and move people across.`)
                  }}
                />
              </>
            )}
          />
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className="font-medium text-success tabular">{earnings.length}</span> earnings ·{' '}
            <span className="font-medium text-danger tabular">{deductions.length}</span> deductions ·{' '}
            <span className="font-medium text-brand-600 tabular">{pfWageComponents.length}</span> component
            {pfWageComponents.length === 1 ? '' : 's'} count towards PF wages. Those three flags on the right decide the whole
            payslip.
          </p>

          <DataTable
            rows={[...components].sort((a, b) => a.sequence - b.sequence)}
            columns={compColumns}
            rowKey={(c) => c.uid}
            searchPlaceholder="Search component, code or rule…"
            onExport={doExport}
            emptyTitle="No components"
            rowClassName={(c) => cn(
              !c.isActive && 'opacity-60',
              c.basis === 'STATUTORY' && 'bg-brand-500/[0.03]',
            )}
            rowActions={(c) => (
              <>
                <MenuItem label="Edit the component" onClick={() => compCrud.openEdit(c)} />
                <MenuItem label="Delete the component" danger onClick={() => compCrud.askDelete(c)} />
                <MenuItem
                  separatorBefore
                  label={c.isActive ? 'Deactivate' : 'Activate'}
                  onClick={() => {
                    compCrud.update(c.uid, { isActive: !c.isActive })
                    toast.success(
                      c.isActive ? 'Component deactivated' : 'Component activated',
                      c.isActive
                        ? `${c.name} will not appear on payslips from the next run. Historic payslips are untouched.`
                        : `${c.name} will be included in the next payroll calculation.`,
                    )
                  }}
                />
              </>
            )}
          />
        </>
      )}

      {structCrud.dialogs}
      {compCrud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Three flags that decide everything" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Counts towards PF wages.</span> Basic does; house rent allowance does not. Get
            this wrong and the PF contribution is short every month, which surfaces as an EPFO demand with interest years later.
          </p>
          <p>
            <span className="font-medium text-fg">Counts towards ESI wages.</span> Almost everything does, including overtime —
            which is why a month of heavy overtime can push somebody over the ₹21,000 ceiling and out of ESI mid-year.
          </p>
          <p>
            <span className="font-medium text-fg">Prorates when absent.</span> Basic and allowances reduce with days paid. The
            attendance allowance does not prorate at all — it is lost entirely on the first day of absence, which is the point of it.
          </p>
        </CardBody>
        <CardBody className="border-t border-border pt-3 text-xs text-fg-muted">
          The payslips built from these rules are on{' '}
          <Link to="/hrms/payslips" className="font-medium text-brand-600 hover:underline">the payslip screen</Link>, and the
          contributions they generate feed{' '}
          <Link to="/hrms/statutory" className="font-medium text-brand-600 hover:underline">statutory compliance</Link>.
        </CardBody>
      </Card>
    </div>
  )
}
