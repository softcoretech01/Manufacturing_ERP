import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { DueCell, HrStatusBadge, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { statutoryReturns as seedReturns } from '@/mock/hrms'
import type { StatutoryReturn } from '@/types/hrms'

const TABS = [
  { id: 'DUE', label: 'Due & overdue' },
  { id: 'FILED', label: 'Filed' },
  { id: 'ALL', label: 'All returns' },
]

/**
 * Statutory compliance — the returns and challans a factory owes, with the due
 * dates that carry penalties. The ordering here is deliberate: overdue first,
 * because late filing under most of these Acts attracts interest and a daily
 * penalty that nobody budgets for.
 */
export function StatutoryPage() {
  const toast = useToast()
  const canSeePay = useCanSeePay()
  const seed = useMemo(() => seedReturns, [])

  const crud = useCrud<StatutoryReturn>({
    key: 'hrms:statutory-return',
    seed,
    entity: 'Statutory return',
    titleOf: (r) => `${r.name} — ${r.period}`,
    fields: [
      { name: 'code', label: 'Return code', required: true, upper: true },
      { name: 'name', label: 'Return name', required: true, span: 2 },
      { name: 'act', label: 'Under which Act', required: true, span: 2 },
      { name: 'authority', label: 'Authority', required: true },
      { name: 'period', label: 'Period', required: true },
      {
        name: 'frequency',
        label: 'Frequency',
        type: 'select',
        required: true,
        options: [
          { value: 'MONTHLY', label: 'Monthly' },
          { value: 'QUARTERLY', label: 'Quarterly' },
          { value: 'HALF_YEARLY', label: 'Half yearly' },
          { value: 'ANNUAL', label: 'Annual' },
        ],
      },
      { name: 'dueOn', label: 'Due on', type: 'date', required: true },
      { name: 'employeeCount', label: 'Employees covered', type: 'number' },
      { name: 'amountPayable', label: 'Amount payable', type: 'number' },
      { name: 'challanNo', label: 'Challan number' },
      { name: 'acknowledgementNo', label: 'Acknowledgement number' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        paidOn: null,
        filedOn: null,
        preparedBy: null,
        status: 'PENDING' as const,
      }),
      code: v.code,
      name: v.name,
      act: v.act,
      authority: v.authority,
      period: v.period,
      frequency: v.frequency as StatutoryReturn['frequency'],
      dueOn: v.dueOn,
      employeeCount: Number(v.employeeCount) || 0,
      amountPayable: Number(v.amountPayable) || 0,
      challanNo: v.challanNo || null,
      acknowledgementNo: v.acknowledgementNo || null,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (r) =>
      r.status === 'FILED'
        ? `${r.name} for ${r.period} has been filed with ${r.authority}. A filed return is a statutory record — it cannot be deleted.`
        : r.status === 'PAID'
          ? `${r.name} has been paid under challan ${r.challanNo}. Delete would orphan the payment.`
          : undefined,
  })

  const returns = crud.rows
  const [tab, setTab] = useState('DUE')
  const [filing, setFiling] = useState<StatutoryReturn | null>(null)
  const [ack, setAck] = useState('')
  const [paying, setPaying] = useState<StatutoryReturn | null>(null)
  const [challan, setChallan] = useState('')

  const daysTo = (d: string) => Math.round((new Date(d).getTime() - Date.now()) / 86_400_000)

  const visible = returns.filter((r) => {
    if (tab === 'DUE') return r.status === 'PENDING' || r.status === 'PREPARED' || r.status === 'OVERDUE' || r.status === 'PAID'
    if (tab === 'FILED') return r.status === 'FILED'
    return true
  })

  const overdue = returns.filter((r) => r.status === 'OVERDUE' || (r.status !== 'FILED' && r.status !== 'NOT_DUE' && daysTo(r.dueOn) < 0))
  const dueSoon = returns.filter((r) => r.status !== 'FILED' && daysTo(r.dueOn) >= 0 && daysTo(r.dueOn) <= 15)
  const totalDue = returns
    .filter((r) => r.status !== 'FILED' && r.status !== 'NOT_DUE')
    .reduce((s, r) => s + r.amountPayable, 0)

  const columns: Column<StatutoryReturn>[] = [
    { key: 'code', header: 'Return', sortable: true, width: '16rem', render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{r.name}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{r.code} · {r.period}</p>
      </div>
    ) },
    { key: 'act', header: 'Under', sortable: true, render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{r.act}</p>
        <p className="truncate text-2xs text-fg-subtle">{r.authority}</p>
      </div>
    ) },
    { key: 'frequency', header: 'Frequency', sortable: true, width: '9rem', render: (r) => (
      <Badge tone="neutral" size="sm" dot={false}>{r.frequency.replace('_', ' ').toLowerCase()}</Badge>
    ) },
    { key: 'employeeCount', header: 'Covered', align: 'right', width: '7.5rem', sortable: true, render: (r) => (
      <span className="tabular text-xs">{r.employeeCount}</span>
    ) },
    ...(canSeePay
      ? [{
          key: 'amountPayable', header: 'Payable', align: 'right' as const, sortable: true, width: '11rem',
          render: (r: StatutoryReturn) => (
            r.amountPayable
              ? <span className="tabular text-xs font-medium text-fg">{formatCurrency(r.amountPayable)}</span>
              : <span className="text-2xs text-fg-subtle">nil — return only</span>
          ),
        }]
      : []),
    { key: 'dueOn', header: 'Due', sortable: true, width: '11rem', accessor: (r) => r.dueOn, render: (r) => (
      <div className="min-w-0">
        <p className="text-xs text-fg">{formatDate(r.dueOn)}</p>
        {r.status !== 'FILED' && r.status !== 'NOT_DUE' && <DueCell date={r.dueOn} />}
      </div>
    ) },
    { key: 'challanNo', header: 'Challan', sortable: true, width: '12rem', render: (r) => (
      r.challanNo ? (
        <div className="min-w-0">
          <p className="truncate font-mono text-2xs text-fg">{r.challanNo}</p>
          {r.paidOn && <p className="text-2xs text-fg-subtle">paid {formatDate(r.paidOn)}</p>}
        </div>
      ) : (
        <span className="text-2xs text-fg-subtle">not paid</span>
      )
    ) },
    { key: 'acknowledgementNo', header: 'Acknowledgement', sortable: true, width: '13rem', render: (r) => (
      r.acknowledgementNo ? (
        <div className="min-w-0">
          <p className="truncate font-mono text-2xs text-fg">{r.acknowledgementNo}</p>
          {r.filedOn && <p className="text-2xs text-fg-subtle">filed {formatDate(r.filedOn)}</p>}
        </div>
      ) : (
        <span className="text-2xs text-fg-subtle">not filed</span>
      )
    ) },
    { key: 'remarks', header: 'Note', render: (r) => (
      r.remarks ? <span className="text-2xs text-danger">{r.remarks}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (r) => <HrStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'statutory-returns', 'Statutory compliance register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Statutory compliance"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Statutory' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => crud.openCreate({ frequency: 'MONTHLY', authority: 'EPFO', period: '2026-08' })}
          >
            Add a return
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'DUE' ? overdue.length + dueSoon.length : undefined }))} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', overdue.length ? 'text-danger' : 'text-success')}>{overdue.length}</span> overdue ·{' '}
        <span className={cn('font-medium', dueSoon.length ? 'text-warning' : 'text-fg')}>{dueSoon.length}</span> due inside 15 days
        {canSeePay && <> · <span className="font-medium text-fg tabular">{formatCurrency(totalDue)}</span> payable in total</>}
        .
      </p>

      {overdue.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Overdue"
            description="Late filing under most of these Acts carries interest and a daily penalty"
          />
          <CardBody className="space-y-2">
            {overdue.map((r) => (
              <div key={r.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {r.name} for {r.period} — {-daysTo(r.dueOn)} days overdue
                  </p>
                  <p className="text-2xs text-fg-muted">
                    {r.act} · {r.authority}
                    {canSeePay && r.amountPayable ? ` · ${formatCurrency(r.amountPayable)}` : ''}
                    {r.remarks ? ` — ${r.remarks}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {!r.challanNo && r.amountPayable > 0 && (
                    <Button variant="outline" size="sm" onClick={() => { setPaying(r); setChallan('') }}>Pay the challan</Button>
                  )}
                  <Button variant="primary" size="sm" onClick={() => { setFiling(r); setAck('') }}>File the return</Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search return, Act, authority or period…"
        onExport={doExport}
        emptyTitle="No statutory returns"
        rowClassName={(r) => cn(
          (r.status === 'OVERDUE' || (r.status !== 'FILED' && r.status !== 'NOT_DUE' && daysTo(r.dueOn) < 0)) && 'bg-danger/[0.05]',
          r.status !== 'FILED' && daysTo(r.dueOn) >= 0 && daysTo(r.dueOn) <= 15 && 'bg-warning/[0.04]',
          r.status === 'NOT_DUE' && 'opacity-70',
        )}
        rowActions={(r) => (
          <>
            <MenuItem label="Edit the return" onClick={() => crud.openEdit(r)} />
            <MenuItem label="Delete the return" danger onClick={() => crud.askDelete(r)} />
            <MenuItem
              separatorBefore
              label="Prepare the return"
              disabled={r.status !== 'PENDING' && r.status !== 'OVERDUE'}
              onClick={() => {
                crud.update(r.uid, { status: 'PREPARED', preparedBy: 'Accounts' })
                toast.success(
                  'Return prepared',
                  `${r.name} for ${r.period} prepared from the payroll figures — ${r.employeeCount} employees${canSeePay ? `, ${formatCurrency(r.amountPayable)}` : ''}. Pay the challan next.`,
                )
              }}
            />
            <MenuItem
              label="Record the challan payment"
              disabled={!!r.challanNo || r.amountPayable === 0}
              onClick={() => { setPaying(r); setChallan('') }}
            />
            <MenuItem
              label="File the return"
              disabled={r.status === 'FILED'}
              onClick={() => { setFiling(r); setAck('') }}
            />
            <MenuItem label="Print the challan" onClick={() => doExport('pdf')} />
          </>
        )}
      />

      {/* Pay the challan --------------------------------------------------- */}
      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title={paying ? `Challan — ${paying.name}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!paying) return
                if (!challan.trim()) {
                  toast.error('Challan number required', 'The challan number is the proof of payment and is quoted on the return.')
                  return
                }
                crud.update(paying.uid, {
                  challanNo: challan.trim(),
                  paidOn: new Date().toISOString().slice(0, 10),
                  status: 'PAID',
                })
                toast.success(
                  'Challan recorded',
                  `${canSeePay ? formatCurrency(paying.amountPayable) : 'The amount'} paid under ${challan.trim()}. Paying is not filing — the return still has to be lodged.`,
                )
                setPaying(null)
              }}
            >
              Record payment
            </Button>
          </>
        }
      >
        {paying && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{paying.name} — {paying.period}</p>
              <p className="mt-1 text-fg-muted">
                {paying.authority} · {paying.employeeCount} employees
                {canSeePay && ` · ${formatCurrency(paying.amountPayable)}`} · due {formatDate(paying.dueOn)}
              </p>
            </div>
            <Input label="Challan number" value={challan} onChange={(e) => setChallan(e.target.value)} placeholder="ECR/2607/0044118" />
            <p className="text-2xs leading-relaxed text-fg-muted">
              Paying the challan and filing the return are two separate obligations. Money paid on time with a return filed late
              still attracts a penalty — which is exactly what happened to the Q1 TDS return on this list.
            </p>
          </div>
        )}
      </Modal>

      {/* File the return --------------------------------------------------- */}
      <Modal
        open={!!filing}
        onClose={() => setFiling(null)}
        title={filing ? `File ${filing.name}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setFiling(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!filing) return
                if (!ack.trim()) {
                  toast.error('Acknowledgement number required', 'Without it there is no evidence the return was actually lodged.')
                  return
                }
                if (filing.amountPayable > 0 && !filing.challanNo) {
                  toast.error(
                    'Challan not recorded',
                    `${filing.name} has ${canSeePay ? formatCurrency(filing.amountPayable) : 'an amount'} payable but no challan against it. The return will be rejected without the payment reference.`,
                  )
                  return
                }
                crud.update(filing.uid, {
                  acknowledgementNo: ack.trim(),
                  filedOn: new Date().toISOString().slice(0, 10),
                  status: 'FILED',
                  remarks: undefined,
                })
                const late = daysTo(filing.dueOn) < 0
                toast.success(
                  'Return filed',
                  late
                    ? `${filing.name} filed ${-daysTo(filing.dueOn)} days late under acknowledgement ${ack.trim()}. Expect a penalty notice — record it against the period when it arrives.`
                    : `${filing.name} filed on time under acknowledgement ${ack.trim()}.`,
                )
                setFiling(null)
              }}
            >
              File
            </Button>
          </>
        }
      >
        {filing && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{filing.name} — {filing.period}</p>
              <p className="mt-1 text-fg-muted">
                {filing.act} · {filing.authority} · due {formatDate(filing.dueOn)}
              </p>
              <p className="mt-1 text-2xs text-fg-muted">
                Challan: {filing.challanNo ?? <span className="text-danger">not recorded</span>}
              </p>
            </div>
            {daysTo(filing.dueOn) < 0 && (
              <p className="rounded border border-danger/30 bg-danger/5 p-2.5 text-2xs text-danger">
                This is {-daysTo(filing.dueOn)} days past the due date. Filing now stops the penalty accruing further but does not
                remove what has already accrued.
              </p>
            )}
            <Input label="Acknowledgement number" value={ack} onChange={(e) => setAck(e.target.value)} placeholder="ACK/EPFO/8841204" />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="What a factory in Tamil Nadu owes, and when" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-fg">PF (ECR)</span> — monthly, by the 15th. Employee 12% plus employer 12% on basic capped at ₹15,000 of wages. Late payment carries interest and damages.</p>
          <p><span className="font-medium text-fg">ESI</span> — monthly, by the 15th. Only for anybody at or below ₹21,000 gross. Employee 0.75%, employer 3.25%.</p>
          <p><span className="font-medium text-fg">Professional tax</span> — half-yearly to the local corporation. A small amount that is easy to forget entirely.</p>
          <p><span className="font-medium text-fg">TDS (Form 24Q)</span> — quarterly. Paying the challan monthly is not the same as filing the quarterly return; ₹200 a day applies to the return.</p>
          <p><span className="font-medium text-fg">Labour welfare fund</span> — annual, a token per employee, and still a prosecutable default if missed.</p>
          <p><span className="font-medium text-fg">Factories Act annual return</span> — no money, but it evidences headcount, hours and safety. Inspectors ask for it first.</p>
        </CardBody>
      </Card>
    </div>
  )
}
