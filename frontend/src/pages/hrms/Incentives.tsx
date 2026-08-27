import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import {
  EmployeeCell,
  GateChip,
  HrStatusBadge,
  INCENTIVE_MODEL_LABEL,
  PctChip,
  useCanSeePay,
} from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { PERIOD_LABEL, incentiveEarnings as seedEarnings, incentiveSchemes as seedSchemes } from '@/mock/hrms'
import type { IncentiveEarning, IncentiveModel, IncentiveScheme } from '@/types/hrms'

const TABS = [
  { id: 'EARNINGS', label: 'This period' },
  { id: 'SCHEMES', label: 'Schemes' },
]

/**
 * Production incentives. The four gates are the whole design: output, attendance,
 * quality and OEE all have to be cleared before anything is earned. An incentive
 * that pays on volume alone rewards an operator for running fast and scrapping
 * heavily, which costs more than the incentive saves.
 */
export function IncentivesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeePay = useCanSeePay()
  const earnSeed = useMemo(() => seedEarnings, [])
  const schemeSeed = useMemo(() => seedSchemes, [])

  const schemeCrud = useCrud<IncentiveScheme>({
    key: 'hrms:incentive-scheme',
    seed: schemeSeed,
    entity: 'Incentive scheme',
    titleOf: (s) => `${s.name} (${s.code})`,
    fields: [
      { name: 'code', label: 'Scheme code', required: true, upper: true },
      { name: 'name', label: 'Scheme name', required: true, span: 2 },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        options: Object.entries(INCENTIVE_MODEL_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'appliesTo', label: 'Applies to', required: true },
      { name: 'qualifyingOutputPct', label: 'Qualifying output %', type: 'number', required: true, hint: 'Nothing is earned below this share of target' },
      { name: 'minAttendancePct', label: 'Minimum attendance %', type: 'number', required: true },
      { name: 'maxRejectionPct', label: 'Maximum rejection %', type: 'number', required: true },
      { name: 'maxReworkPct', label: 'Maximum rework %', type: 'number', required: true },
      { name: 'minOeePct', label: 'Minimum OEE %', type: 'number', hint: 'Zero switches the OEE gate off for this scheme' },
      { name: 'ratePerUnit', label: 'Rate per good unit', type: 'number' },
      { name: 'teamBonus', label: 'Team bonus', type: 'number', showIf: (v) => v.model === 'TEAM' || v.model === 'DEPARTMENT' || v.model === 'PRODUCTIVITY_BONUS' },
      { name: 'monthlyCap', label: 'Monthly cap per person', type: 'number', required: true },
      { name: 'effectiveFrom', label: 'Effective from', type: 'date', required: true },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (s) => ({
      code: s.code,
      name: s.name,
      model: s.model,
      appliesTo: s.appliesTo,
      qualifyingOutputPct: String(s.qualifyingOutputPct),
      minAttendancePct: String(s.minAttendancePct),
      maxRejectionPct: String(s.maxRejectionPct),
      maxReworkPct: String(s.maxReworkPct),
      minOeePct: String(s.minOeePct),
      ratePerUnit: String(s.ratePerUnit),
      teamBonus: String(s.teamBonus),
      monthlyCap: String(s.monthlyCap),
      effectiveFrom: s.effectiveFrom,
      isActive: String(s.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? { participantCount: 0 }),
      code: v.code,
      name: v.name,
      model: v.model as IncentiveModel,
      appliesTo: v.appliesTo,
      qualifyingOutputPct: Number(v.qualifyingOutputPct) || 0,
      minAttendancePct: Number(v.minAttendancePct) || 0,
      maxRejectionPct: Number(v.maxRejectionPct) || 0,
      maxReworkPct: Number(v.maxReworkPct) || 0,
      minOeePct: Number(v.minOeePct) || 0,
      ratePerUnit: Number(v.ratePerUnit) || 0,
      teamBonus: Number(v.teamBonus) || 0,
      monthlyCap: Number(v.monthlyCap) || 0,
      effectiveFrom: v.effectiveFrom,
      isActive: v.isActive !== 'false',
    }),
    blockDelete: (s) =>
      s.participantCount > 0
        ? `${s.name} has ${s.participantCount} participant${s.participantCount === 1 ? '' : 's'} with earnings calculated against it. Deactivate it instead — deleting would orphan the earnings.`
        : undefined,
  })

  const schemes = schemeCrud.rows
  const { rows: earnings, update: updateEarning } = useCollection<IncentiveEarning>('hrms:incentive-earning', earnSeed)

  const [tab, setTab] = useState('EARNINGS')

  const qualified = earnings.filter((e) => e.status !== 'DISQUALIFIED')
  const disqualified = earnings.filter((e) => e.status === 'DISQUALIFIED')
  const notApproved = earnings.filter((e) => e.status === 'CALCULATED')
  const totalEarned = earnings.reduce((s, e) => s + e.earnedIncentive, 0)
  const totalForgone = earnings.reduce((s, e) => s + (e.grossIncentive - e.earnedIncentive), 0)

  const earnColumns: Column<IncentiveEarning>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (e) => (
      <EmployeeCell name={e.employeeName} code={e.employeeCode} sub={e.workCentre ?? e.department} />
    ) },
    { key: 'schemeName', header: 'Scheme', sortable: true, render: (e) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{e.schemeName}</p>
        <p className="text-2xs text-fg-subtle">{INCENTIVE_MODEL_LABEL[e.model]}</p>
      </div>
    ) },
    { key: 'unitsProduced', header: 'Produced', align: 'right', width: '9rem', sortable: true, render: (e) => (
      <div>
        <p className="tabular text-xs text-fg">{formatQty(e.unitsProduced)}</p>
        <p className="tabular text-2xs text-fg-subtle">target {formatQty(e.targetUnits)}</p>
      </div>
    ) },
    { key: 'output', header: 'Output', align: 'right', width: '8rem', sortable: true, accessor: (e) => (e.unitsProduced / e.targetUnits) * 100, render: (e) => {
      const scheme = schemes.find((s) => s.code === e.schemeCode)
      return <PctChip value={(e.unitsProduced / e.targetUnits) * 100} target={scheme?.qualifyingOutputPct ?? 90} />
    } },
    { key: 'goodUnits', header: 'Good', align: 'right', width: '8rem', sortable: true, render: (e) => (
      <span className="tabular text-xs text-success">{formatQty(e.goodUnits)}</span>
    ) },
    { key: 'quality', header: 'Rejection / rework', align: 'right', width: '12rem', render: (e) => {
      const rej = (e.rejectedUnits / e.unitsProduced) * 100
      const rew = (e.reworkUnits / e.unitsProduced) * 100
      const scheme = schemes.find((s) => s.code === e.schemeCode)
      const ok = rej <= (scheme?.maxRejectionPct ?? 99) && rew <= (scheme?.maxReworkPct ?? 99)
      return (
        <span className={cn('tabular text-2xs', ok ? 'text-success' : 'font-medium text-danger')}>
          {rej.toFixed(1)}% / {rew.toFixed(1)}%
        </span>
      )
    } },
    { key: 'attendancePct', header: 'Attendance', align: 'right', width: '9rem', sortable: true, render: (e) => {
      const scheme = schemes.find((s) => s.code === e.schemeCode)
      return <PctChip value={e.attendancePct} target={scheme?.minAttendancePct ?? 90} />
    } },
    { key: 'oeePct', header: 'OEE', align: 'right', width: '7.5rem', sortable: true, render: (e) => {
      const scheme = schemes.find((s) => s.code === e.schemeCode)
      if (!scheme?.minOeePct) return <span className="text-2xs text-fg-subtle">no gate</span>
      return <PctChip value={e.oeePct} target={scheme.minOeePct} />
    } },
    { key: 'gates', header: 'Gates', width: '17rem', render: (e) => (
      <div className="flex flex-wrap gap-1">
        <GateChip ok={e.outputGateMet} label="output" />
        <GateChip ok={e.attendanceGateMet} label="attendance" />
        <GateChip ok={e.qualityGateMet} label="quality" />
        <GateChip ok={e.oeeGateMet} label="OEE" />
      </div>
    ) },
    ...(canSeePay
      ? [
          { key: 'grossIncentive', header: 'Would earn', align: 'right' as const, sortable: true, width: '10rem', render: (e: IncentiveEarning) => (
            <span className="tabular text-xs text-fg-muted">{formatCurrency(e.grossIncentive)}</span>
          ) },
          { key: 'earnedIncentive', header: 'Earned', align: 'right' as const, sortable: true, width: '10rem', render: (e: IncentiveEarning) => (
            e.earnedIncentive
              ? <span className="tabular text-xs font-semibold text-success">{formatCurrency(e.earnedIncentive)}</span>
              : <span className="tabular text-xs font-medium text-danger">nil</span>
          ) },
        ]
      : []),
    { key: 'disqualifiedReason', header: 'Why nil', render: (e) => (
      e.disqualifiedReason ? <span className="text-2xs text-danger">{e.disqualifiedReason}</span> : <span className="text-2xs text-success">all gates cleared</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (e) => <HrStatusBadge status={e.status} size="sm" /> },
  ]

  const schemeColumns: Column<IncentiveScheme>[] = [
    { key: 'code', header: 'Scheme', sortable: true, width: '16rem', render: (s) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{s.name}</p>
        <p className="font-mono text-2xs text-fg-subtle">{s.code}</p>
      </div>
    ) },
    { key: 'model', header: 'Model', sortable: true, width: '11rem', render: (s) => (
      <Badge tone={s.model === 'TEAM' ? 'progress' : s.model === 'PER_UNIT' ? 'brand' : 'neutral'} size="sm" dot={false}>
        {INCENTIVE_MODEL_LABEL[s.model]}
      </Badge>
    ) },
    { key: 'appliesTo', header: 'Applies to', sortable: true },
    { key: 'qualifyingOutputPct', header: 'Output gate', align: 'right', width: '9rem', render: (s) => (
      <span className="tabular text-2xs text-fg-muted">≥ {s.qualifyingOutputPct}%</span>
    ) },
    { key: 'minAttendancePct', header: 'Attendance gate', align: 'right', width: '11rem', render: (s) => (
      <span className="tabular text-2xs text-fg-muted">≥ {s.minAttendancePct}%</span>
    ) },
    { key: 'quality', header: 'Quality gate', align: 'right', width: '11rem', render: (s) => (
      <span className="tabular text-2xs text-fg-muted">≤ {s.maxRejectionPct}% / {s.maxReworkPct}%</span>
    ) },
    { key: 'minOeePct', header: 'OEE gate', align: 'right', width: '8.5rem', render: (s) => (
      s.minOeePct ? <span className="tabular text-2xs text-fg-muted">≥ {s.minOeePct}%</span> : <span className="text-2xs text-fg-subtle">off</span>
    ) },
    ...(canSeePay
      ? [
          { key: 'ratePerUnit', header: 'Rate', align: 'right' as const, width: '9rem', render: (s: IncentiveScheme) => (
            s.model === 'PER_UNIT'
              ? <span className="tabular text-xs">₹{s.ratePerUnit.toFixed(2)}/unit</span>
              : <span className="tabular text-xs">{formatCurrency(s.teamBonus)}</span>
          ) },
          { key: 'monthlyCap', header: 'Monthly cap', align: 'right' as const, sortable: true, width: '10rem', render: (s: IncentiveScheme) => formatCurrency(s.monthlyCap) },
        ]
      : []),
    { key: 'participantCount', header: 'Participants', align: 'right', width: '10rem', sortable: true, render: (s) => (
      <span className="tabular text-xs">{s.participantCount}</span>
    ) },
    { key: 'isActive', header: 'Status', align: 'center', width: '7.5rem', sortable: true, accessor: (s) => (s.isActive ? 1 : 0), render: (s) => (
      <HrStatusBadge status={s.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'EARNINGS'
          ? exportRows(format, 'incentive-register', `Incentive register — ${PERIOD_LABEL}`, columnsFromTable(earnColumns), earnings)
          : exportRows(format, 'incentive-schemes', 'Incentive schemes', columnsFromTable(schemeColumns), schemes)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Production incentives"
        description={PERIOD_LABEL}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Incentives' }]}
        actions={
          tab === 'EARNINGS' ? (
            <Button
              variant="primary"
              size="sm"
              disabled={notApproved.length === 0}
              onClick={() => {
                for (const e of notApproved) updateEarning(e.uid, { status: 'APPROVED' })
                toast.success(
                  'Incentives approved',
                  `${notApproved.length} line${notApproved.length === 1 ? '' : 's'} approved. The payroll incentive gate is now clear.`,
                )
              }}
            >
              Approve the incentive run
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => schemeCrud.openCreate({ model: 'PER_UNIT', qualifyingOutputPct: '90', minAttendancePct: '90', maxRejectionPct: '2', maxReworkPct: '3', minOeePct: '0', isActive: 'true', effectiveFrom: new Date().toISOString().slice(0, 10) })}
            >
              Add a scheme
            </Button>
          )
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      {tab === 'EARNINGS' ? (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className="font-medium text-success tabular">{qualified.length}</span> of {earnings.length} cleared every gate
            {canSeePay && <> · <span className="font-medium text-fg tabular">{formatCurrency(totalEarned)}</span> earned</>}
            {disqualified.length > 0 && (
              <>
                {' '}· <span className="font-medium text-danger">{disqualified.length}</span> earned nothing
                {canSeePay && <>, forgoing <span className="font-medium text-danger tabular">{formatCurrency(totalForgone)}</span></>}
              </>
            )}
            {notApproved.length > 0 && <> · <span className="font-medium text-warning">{notApproved.length}</span> not yet approved</>}
          </p>

          {disqualified.length > 0 && (
            <Card className="mb-4">
              <CardHeader
                title="Earned nothing this period"
                description="Each of these is a conversation worth having — the gate that failed usually points at a fixable cause"
              />
              <CardBody className="space-y-2">
                {disqualified.map((e) => (
                  <div key={e.uid} className="rounded border border-danger/30 bg-danger/5 p-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg">
                          {e.employeeName} — {e.schemeName}
                          {canSeePay && <span className="ml-1.5 text-fg-muted">({formatCurrency(e.grossIncentive)} forgone)</span>}
                        </p>
                        <p className="mt-0.5 text-2xs text-fg-muted">{e.disqualifiedReason}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <GateChip ok={e.outputGateMet} label="output" />
                        <GateChip ok={e.attendanceGateMet} label="attendance" />
                        <GateChip ok={e.qualityGateMet} label="quality" />
                        <GateChip ok={e.oeeGateMet} label="OEE" />
                      </div>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <DataTable
            rows={earnings}
            columns={earnColumns}
            rowKey={(e) => e.uid}
            searchPlaceholder="Search employee, scheme or work centre…"
            onExport={doExport}
            emptyTitle="No incentive earnings calculated"
            rowClassName={(e) => cn(
              e.status === 'DISQUALIFIED' && 'bg-danger/[0.04]',
              e.status === 'CALCULATED' && 'bg-warning/[0.03]',
            )}
            rowActions={(e) => (
              <>
                <MenuItem
                  label="Edit — recalculate the gates"
                  onClick={() => {
                    const scheme = schemes.find((s) => s.code === e.schemeCode)
                    if (!scheme) return
                    const rej = (e.rejectedUnits / e.unitsProduced) * 100
                    const rew = (e.reworkUnits / e.unitsProduced) * 100
                    const outputGateMet = (e.unitsProduced / e.targetUnits) * 100 >= scheme.qualifyingOutputPct
                    const attendanceGateMet = e.attendancePct >= scheme.minAttendancePct
                    const qualityGateMet = rej <= scheme.maxRejectionPct && rew <= scheme.maxReworkPct
                    const oeeGateMet = scheme.minOeePct === 0 || e.oeePct >= scheme.minOeePct
                    const all = outputGateMet && attendanceGateMet && qualityGateMet && oeeGateMet
                    const gross = scheme.model === 'TEAM' ? scheme.teamBonus : Math.round(e.goodUnits * scheme.ratePerUnit)
                    updateEarning(e.uid, {
                      outputGateMet,
                      attendanceGateMet,
                      qualityGateMet,
                      oeeGateMet,
                      grossIncentive: gross,
                      earnedIncentive: all ? Math.min(gross, scheme.monthlyCap) : 0,
                      status: all ? 'CALCULATED' : 'DISQUALIFIED',
                      disqualifiedReason: all ? null : e.disqualifiedReason,
                    })
                    toast.success(
                      'Recalculated',
                      all
                        ? `${e.employeeName} now clears every gate${canSeePay ? ` and earns ${formatCurrency(Math.min(gross, scheme.monthlyCap))}` : ''}.`
                        : `${e.employeeName} still misses a gate, so the earning stays nil.`,
                    )
                  }}
                />
                <MenuItem
                  label="Delete the earning line"
                  danger
                  disabled={e.status === 'PAID'}
                  onClick={() => {
                    updateEarning(e.uid, { earnedIncentive: 0, grossIncentive: 0, status: 'DISQUALIFIED', disqualifiedReason: 'Line removed by HR.' })
                    toast.success('Line removed', `${e.employeeName}'s incentive for this period is now nil.`)
                  }}
                />
                <MenuItem
                  separatorBefore
                  label="Approve this line"
                  disabled={e.status !== 'CALCULATED'}
                  onClick={() => {
                    updateEarning(e.uid, { status: 'APPROVED' })
                    toast.success('Approved', `${e.employeeName}'s incentive is approved and will appear on the payslip.`)
                  }}
                />
                <MenuItem label="Open the scheme" onClick={() => setTab('SCHEMES')} />
                <MenuItem label="See the production figures" onClick={() => navigate('/production/oee')} />
              </>
            )}
          />
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            <span className="font-medium text-fg tabular">{schemes.filter((s) => s.isActive).length}</span> active schemes covering{' '}
            <span className="font-medium text-fg tabular">{schemes.reduce((s, x) => s + x.participantCount, 0)}</span> participants.
            Every scheme carries four gates, and the OEE gate can be switched off by setting it to zero.
          </p>

          <DataTable
            rows={schemes}
            columns={schemeColumns}
            rowKey={(s) => s.uid}
            searchPlaceholder="Search scheme, code or department…"
            onExport={doExport}
            emptyTitle="No incentive schemes"
            rowClassName={(s) => cn(!s.isActive && 'opacity-60')}
            rowActions={(s) => (
              <>
                <MenuItem label="Edit the scheme" onClick={() => schemeCrud.openEdit(s)} />
                <MenuItem label="Delete the scheme" danger onClick={() => schemeCrud.askDelete(s)} />
                <MenuItem
                  separatorBefore
                  label={s.isActive ? 'Deactivate' : 'Activate'}
                  onClick={() => {
                    schemeCrud.update(s.uid, { isActive: !s.isActive })
                    toast.success(
                      s.isActive ? 'Scheme deactivated' : 'Scheme activated',
                      s.isActive
                        ? `${s.name} will not be calculated from the next period. Earnings already approved are untouched.`
                        : `${s.name} will be included in the next incentive calculation.`,
                    )
                  }}
                />
                <MenuItem label="See this period's earnings" onClick={() => setTab('EARNINGS')} />
              </>
            )}
          />
        </>
      )}

      {schemeCrud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why four gates and not one" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Output alone</span> rewards speed. An operator paid per unit will run the press faster than the die wants and scrap the difference.</p>
          <p><span className="font-medium text-fg">Quality caps</span> take the incentive away entirely above the rejection limit. A partial incentive for poor quality still rewards it.</p>
          <p><span className="font-medium text-fg">Attendance</span> stops a high performer earning a full incentive on three-quarters of the month. It is also the gate operators understand most readily.</p>
          <p><span className="font-medium text-fg">OEE</span> catches the case where the operator is fine but the machine was stopped — the incentive should not pay for time the line was down, nor punish the operator for it, which is why the gate sits at a realistic 70%.</p>
        </CardBody>
      </Card>
    </div>
  )
}
