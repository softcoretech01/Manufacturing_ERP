import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { EmployeeCell, HrChartTip, Hours, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { PERIOD_LABEL, labourCostLines as seedLines, productivityTrend } from '@/mock/hrms'
import type { LabourCostLine } from '@/types/hrms'

const ALLOCATION_LABEL: Record<string, string> = {
  PRODUCTION_ORDER: 'Production order',
  WORK_ORDER: 'Work order',
  COST_CENTRE: 'Cost centre',
  INDIRECT: 'Indirect',
}

/**
 * Labour cost allocation — the bridge between HR and manufacturing costing.
 * Payroll produces a total; this decides which batch, machine and product
 * carried it. Cost that lands as "indirect" is cost nobody can act on, so the
 * screen counts it deliberately.
 */
export function LabourCostPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeePay = useCanSeePay()
  const seed = useMemo(() => seedLines, [])

  const crud = useCrud<LabourCostLine>({
    key: 'hrms:labour-cost',
    seed,
    entity: 'Labour cost line',
    titleOf: (l) => `${l.employeeName} — ${l.period}`,
    fields: [
      { name: 'employeeCode', label: 'Employee code', required: true, readOnly: true },
      { name: 'employeeName', label: 'Employee', required: true, readOnly: true },
      { name: 'costCentre', label: 'Cost centre', required: true },
      { name: 'productionOrderNo', label: 'Production order' },
      { name: 'workOrderNo', label: 'Work order' },
      { name: 'batchNo', label: 'Batch' },
      { name: 'machine', label: 'Machine' },
      { name: 'regularHours', label: 'Regular hours', type: 'number', required: true },
      { name: 'overtimeHours', label: 'Overtime hours', type: 'number' },
      { name: 'idleHours', label: 'Idle hours', type: 'number', hint: 'Paid but not producing — waiting on material or a stopped machine' },
      { name: 'hourlyRate', label: 'Hourly rate', type: 'number', required: true },
      { name: 'unitsProduced', label: 'Units produced', type: 'number' },
      {
        name: 'allocation',
        label: 'Allocate to',
        type: 'select',
        required: true,
        options: Object.entries(ALLOCATION_LABEL).map(([value, label]) => ({ value, label })),
      },
    ],
    fromForm: (v, existing) => {
      const reg = Number(v.regularHours) || 0
      const ot = Number(v.overtimeHours) || 0
      const rate = Number(v.hourlyRate) || 0
      const regularCost = Math.round(reg * rate)
      const overtimeCost = Math.round(ot * rate * 2)
      const incentiveCost = existing?.incentiveCost ?? 0
      const total = regularCost + overtimeCost + incentiveCost
      const units = Number(v.unitsProduced) || 0
      return {
        ...(existing ?? { period: '', postedToFinance: false, journalNo: null, itemCode: null, itemName: null, department: '' }),
        costCentre: v.costCentre,
        productionOrderNo: v.productionOrderNo || null,
        workOrderNo: v.workOrderNo || null,
        batchNo: v.batchNo || null,
        machine: v.machine || null,
        regularHours: reg,
        overtimeHours: ot,
        idleHours: Number(v.idleHours) || 0,
        hourlyRate: rate,
        overtimeRate: Math.round(rate * 2 * 100) / 100,
        regularCost,
        overtimeCost,
        totalCost: total,
        unitsProduced: units,
        costPerUnit: units ? Math.round((total / units) * 100) / 100 : 0,
        allocation: v.allocation as LabourCostLine['allocation'],
      }
    },
    blockDelete: (l) =>
      l.postedToFinance
        ? `${l.employeeName}'s labour cost for ${l.period} has been posted to finance under ${l.journalNo}. Reverse the journal in finance instead — deleting here would leave the two ledgers disagreeing.`
        : undefined,
  })

  const lines = crud.rows
  const [allocation, setAllocation] = useState('all')

  const visible = lines.filter((l) => (allocation === 'all' ? true : l.allocation === allocation))

  const totalCost = lines.reduce((s, l) => s + l.totalCost, 0)
  const directCost = lines.filter((l) => l.allocation === 'PRODUCTION_ORDER' || l.allocation === 'WORK_ORDER').reduce((s, l) => s + l.totalCost, 0)
  const indirectCost = lines.filter((l) => l.allocation === 'INDIRECT' || l.allocation === 'COST_CENTRE').reduce((s, l) => s + l.totalCost, 0)
  const totalUnits = lines.reduce((s, l) => s + l.unitsProduced, 0)
  const costPerBottle = totalUnits ? totalCost / totalUnits : 0
  const idleHours = lines.reduce((s, l) => s + l.idleHours, 0)
  const idleCost = lines.reduce((s, l) => s + l.idleHours * l.hourlyRate, 0)
  const unposted = lines.filter((l) => !l.postedToFinance)

  const columns: Column<LabourCostLine>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (l) => (
      <EmployeeCell name={l.employeeName} code={l.employeeCode} sub={l.department} />
    ) },
    { key: 'chargedTo', header: 'Charged to', sortable: true, accessor: (l) => l.productionOrderNo ?? l.costCentre, render: (l) => (
      <div className="min-w-0">
        <p className="truncate font-mono text-2xs text-fg">
          {l.productionOrderNo ?? l.costCentre}
        </p>
        <p className="truncate text-2xs text-fg-subtle">
          {l.workOrderNo ? `${l.workOrderNo} · ` : ''}
          {l.itemName ?? ALLOCATION_LABEL[l.allocation]}
        </p>
      </div>
    ) },
    { key: 'machine', header: 'Machine', sortable: true, width: '8.5rem', render: (l) => (
      l.machine ? <span className="font-mono text-2xs text-fg">{l.machine}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'regularHours', header: 'Regular', align: 'right', width: '8rem', sortable: true, render: (l) => <Hours hours={l.regularHours} /> },
    { key: 'overtimeHours', header: 'Overtime', align: 'right', width: '8rem', sortable: true, render: (l) => (
      l.overtimeHours ? <span className="text-warning"><Hours hours={l.overtimeHours} /></span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'idleHours', header: 'Idle', align: 'right', width: '7rem', sortable: true, render: (l) => (
      l.idleHours ? <span className="tabular text-xs text-danger">{l.idleHours} h</span> : <span className="text-2xs text-success">none</span>
    ) },
    ...(canSeePay
      ? [
          { key: 'hourlyRate', header: 'Rate', align: 'right' as const, sortable: true, width: '8rem', render: (l: LabourCostLine) => (
            <span className="tabular text-2xs text-fg-muted">₹{l.hourlyRate.toFixed(2)}</span>
          ) },
          { key: 'regularCost', header: 'Regular cost', align: 'right' as const, sortable: true, width: '10rem', render: (l: LabourCostLine) => formatCurrency(l.regularCost) },
          { key: 'overtimeCost', header: 'Overtime cost', align: 'right' as const, sortable: true, width: '10.5rem', render: (l: LabourCostLine) => (
            l.overtimeCost ? <span className="tabular text-xs text-warning">{formatCurrency(l.overtimeCost)}</span> : <span className="text-2xs text-fg-subtle">—</span>
          ) },
          { key: 'incentiveCost', header: 'Incentive', align: 'right' as const, sortable: true, width: '9rem', render: (l: LabourCostLine) => (
            l.incentiveCost ? <span className="tabular text-xs text-success">{formatCurrency(l.incentiveCost)}</span> : <span className="text-2xs text-fg-subtle">—</span>
          ) },
          { key: 'totalCost', header: 'Total', align: 'right' as const, sortable: true, width: '10rem', render: (l: LabourCostLine) => (
            <span className="tabular text-xs font-semibold text-fg">{formatCurrency(l.totalCost)}</span>
          ) },
        ]
      : []),
    { key: 'unitsProduced', header: 'Units', align: 'right', width: '8rem', sortable: true, render: (l) => (
      l.unitsProduced ? <span className="tabular text-xs">{formatQty(l.unitsProduced)}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    ...(canSeePay
      ? [{
          key: 'costPerUnit', header: 'Cost per unit', align: 'right' as const, sortable: true, width: '11rem',
          render: (l: LabourCostLine) => (
            l.costPerUnit
              ? <span className={cn('tabular text-xs font-medium', l.costPerUnit > 3.5 ? 'text-warning' : 'text-fg')}>₹{l.costPerUnit.toFixed(2)}</span>
              : <span className="text-2xs text-fg-subtle">no output</span>
          ),
        }]
      : []),
    { key: 'allocation', header: 'Allocation', sortable: true, width: '11rem', render: (l) => (
      <Badge
        tone={l.allocation === 'PRODUCTION_ORDER' || l.allocation === 'WORK_ORDER' ? 'success' : l.allocation === 'INDIRECT' ? 'warning' : 'neutral'}
        size="sm"
        dot={false}
      >
        {ALLOCATION_LABEL[l.allocation]}
      </Badge>
    ) },
    { key: 'postedToFinance', header: 'Posted', align: 'center', width: '10rem', accessor: (l) => (l.postedToFinance ? 1 : 0), render: (l) => (
      l.postedToFinance
        ? <span className="font-mono text-2xs text-success">{l.journalNo}</span>
        : <Badge tone="warning" size="sm">not posted</Badge>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'labour-cost', `Labour cost allocation — ${PERIOD_LABEL}`, columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  if (!canSeePay) {
    return (
      <div>
        <PageHeader
          title="Labour cost allocation"
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Labour cost' }]}
        />
        <Card>
          <CardHeader title="This screen is cost-only" description="It shows individual pay rates by implication" />
          <CardBody className="space-y-3 text-xs leading-relaxed text-fg-muted">
            <p>
              An hourly rate against a named employee is that person's salary divided by their hours, so this screen sits behind{' '}
              <span className="font-mono text-fg">HRMS.PAYROLL.VIEW</span> for the same reason the payslips do.
            </p>
            <p>
              The quantity side of the same story is open:{' '}
              <Link to="/hrms/incentives" className="font-medium text-brand-600 hover:underline">incentive gates</Link>,{' '}
              <Link to="/production/oee" className="font-medium text-brand-600 hover:underline">OEE</Link> and{' '}
              <Link to="/hrms/attendance" className="font-medium text-brand-600 hover:underline">attendance</Link> together show
              productivity without exposing anybody's pay.
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Labour cost allocation"
        description={`${PERIOD_LABEL} · feeds manufacturing costing in finance`}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Labour cost' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            disabled={unposted.length === 0}
            onClick={() => {
              for (const [i, l] of unposted.entries()) {
                crud.update(l.uid, { postedToFinance: true, journalNo: `JV/2627/0${460 + i}` })
              }
              toast.success(
                'Posted to finance',
                `${unposted.length} line${unposted.length === 1 ? '' : 's'} posted, ${formatCurrency(unposted.reduce((s, l) => s + l.totalCost, 0))} of labour cost now sitting against the production orders it belongs to.`,
              )
            }}
          >
            Post to finance
          </Button>
        }
      />

      {/* Headline cost figures */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-3.5">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Total labour cost</p>
          <p className="mt-1 text-xl font-semibold tabular text-fg">{formatCurrency(totalCost)}</p>
          <p className="mt-1 text-2xs text-fg-muted">across {lines.length} shop-floor employees</p>
        </div>
        <div className="card p-3.5">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Labour cost per bottle</p>
          <p className={cn('mt-1 text-xl font-semibold tabular', costPerBottle > 3.4 ? 'text-warning' : 'text-success')}>
            ₹{costPerBottle.toFixed(2)}
          </p>
          <p className="mt-1 text-2xs text-fg-muted">over {formatQty(totalUnits)} good units · target ₹3.20</p>
        </div>
        <div className="card p-3.5">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Direct vs indirect</p>
          <p className="mt-1 text-xl font-semibold tabular text-fg">
            {totalCost ? ((directCost / totalCost) * 100).toFixed(0) : 0}%
          </p>
          <p className="mt-1 text-2xs text-fg-muted">
            {formatCurrency(indirectCost)} indirect — cost nobody can act on
          </p>
        </div>
        <div className={cn('card p-3.5', idleHours > 0 && 'border-warning/30 bg-warning/[0.03]')}>
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Idle time paid</p>
          <p className={cn('mt-1 text-xl font-semibold tabular', idleHours ? 'text-warning' : 'text-success')}>
            {idleHours} h
          </p>
          <p className="mt-1 text-2xs text-fg-muted">{formatCurrency(idleCost)} — waiting on material or a stopped machine</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select
          sizeVariant="sm"
          containerClassName="w-52"
          value={allocation}
          onChange={(e) => setAllocation(e.target.value)}
          options={[{ value: 'all', label: 'All allocations' }, ...Object.entries(ALLOCATION_LABEL).map(([value, label]) => ({ value, label }))]}
        />
        {unposted.length > 0 && (
          <p className="text-xs text-warning">
            <span className="font-medium">{unposted.length}</span> line{unposted.length === 1 ? '' : 's'} not yet posted to finance —{' '}
            {formatCurrency(unposted.reduce((s, l) => s + l.totalCost, 0))} of cost sitting in HR and not in the product cost.
          </p>
        )}
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(l) => l.uid}
        searchPlaceholder="Search employee, order, batch or machine…"
        onExport={doExport}
        emptyTitle="No labour cost lines"
        rowClassName={(l) => cn(
          l.allocation === 'INDIRECT' && 'bg-warning/[0.03]',
          l.idleHours > 4 && 'bg-danger/[0.03]',
          !l.postedToFinance && 'bg-progress/[0.02]',
        )}
        rowActions={(l) => (
          <>
            <MenuItem label="Edit the allocation" onClick={() => crud.openEdit(l)} />
            <MenuItem label="Delete the line" danger onClick={() => crud.askDelete(l)} />
            <MenuItem
              separatorBefore
              label="Post to finance"
              disabled={l.postedToFinance}
              onClick={() => {
                if (!l.productionOrderNo && l.allocation === 'PRODUCTION_ORDER') {
                  toast.error(
                    'No production order on the line',
                    'The allocation says production order but none is named. Either name it or change the allocation to cost centre.',
                  )
                  return
                }
                crud.update(l.uid, { postedToFinance: true, journalNo: `JV/2627/0${470 + lines.indexOf(l)}` })
                toast.success('Posted', `${formatCurrency(l.totalCost)} posted against ${l.productionOrderNo ?? l.costCentre}.`)
              }}
            />
            <MenuItem label="Open the production order" onClick={() => navigate('/production/orders')} />
            <MenuItem label="Open the employee" onClick={() => navigate('/hrms/employees')} />
          </>
        )}
      />

      <Card className="mt-4">
        <CardHeader
          title="Labour productivity"
          description="Units per operator and per labour hour, against the labour cost per bottle they produce"
        />
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={productivityTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
              <YAxis yAxisId="right" orientation="right" domain={[3, 4]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
              <Tooltip content={<HrChartTip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
              <Line yAxisId="left" type="monotone" dataKey="unitsPerOperator" name="Units per operator" stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="left" type="monotone" dataKey="operatorEfficiencyPct" name="Operator efficiency %" stroke="#0ea5e9" strokeWidth={1.5} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="labourCostPerBottle" name="Labour cost per bottle ₹" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Four places labour cost can land, and what each is worth knowing" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Production order</span> — the useful one. Cost lands on the batch, so the cost per bottle for that order is real.</p>
          <p><span className="font-medium text-fg">Work order</span> — finer still. It tells you which operation is expensive, which is where a process improvement pays back.</p>
          <p><span className="font-medium text-fg">Cost centre</span> — for people who support production without touching a batch: packing supervisors, storekeepers.</p>
          <p><span className="font-medium text-fg">Indirect</span> — maintenance, idle time, anything not attributable. Necessary, but every rupee here is a rupee no product carries, so it deserves watching rather than ignoring.</p>
        </CardBody>
      </Card>
    </div>
  )
}
