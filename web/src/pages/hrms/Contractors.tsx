import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { DueCell, GateChip, HrStatusBadge, Hours, useCanSeePay } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import {
  contractorBills as seedBills,
  contractorLabour as seedLabour,
  contractors as seedContractors,
} from '@/mock/hrms'
import type { Contractor, ContractorBill, ContractorLabourDay } from '@/types/hrms'

const RATE_BASIS_LABEL: Record<string, string> = {
  DAILY_WAGE: 'Daily wage',
  PIECE_RATE: 'Piece rate',
  MONTHLY: 'Monthly',
  HOURLY: 'Hourly',
}

const TABS = [
  { id: 'CONTRACTORS', label: 'Contractors' },
  { id: 'ATTENDANCE', label: 'Daily labour' },
  { id: 'BILLS', label: 'Bills' },
]

/**
 * Contractor labour. The principal employer carries the liability if a contractor
 * fails to pay PF, ESI or minimum wages, so compliance is not a nicety here — a
 * bill cannot be passed while compliance is open, and that block is the whole
 * point of the screen.
 */
export function ContractorsPage() {
  const toast = useToast()
  const canSeePay = useCanSeePay()
  const conSeed = useMemo(() => seedContractors, [])
  const labSeed = useMemo(() => seedLabour, [])
  const billSeed = useMemo(() => seedBills, [])

  const conCrud = useCrud<Contractor>({
    key: 'hrms:contractor',
    seed: conSeed,
    entity: 'Contractor',
    titleOf: (c) => `${c.name} (${c.code})`,
    fields: [
      { name: 'code', label: 'Contractor code', required: true, upper: true },
      { name: 'name', label: 'Contractor name', required: true, span: 2 },
      { name: 'contactPerson', label: 'Contact person', required: true },
      { name: 'mobile', label: 'Mobile', type: 'tel', required: true },
      { name: 'gstin', label: 'GSTIN', required: true, upper: true },
      { name: 'licenceNo', label: 'CLRA licence number', required: true, hint: 'Contract Labour (Regulation and Abolition) Act licence' },
      { name: 'licenceExpiresOn', label: 'Licence expires', type: 'date', required: true },
      { name: 'pfRegistrationNo', label: 'PF registration', required: true },
      { name: 'esiRegistrationNo', label: 'ESI registration', required: true },
      { name: 'workScope', label: 'Scope of work', type: 'textarea', span: 2, required: true },
      {
        name: 'rateBasis',
        label: 'Rate basis',
        type: 'select',
        required: true,
        options: Object.entries(RATE_BASIS_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'agreedRate', label: 'Agreed rate', type: 'number', required: true },
      { name: 'headcountDeployed', label: 'Headcount deployed', type: 'number' },
      { name: 'pfCompliant', label: 'PF compliance evidenced', type: 'switch' },
      { name: 'esiCompliant', label: 'ESI compliance evidenced', type: 'switch' },
      { name: 'wagesCompliant', label: 'Minimum wages evidenced', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (c) => ({
      code: c.code,
      name: c.name,
      contactPerson: c.contactPerson,
      mobile: c.mobile,
      gstin: c.gstin,
      licenceNo: c.licenceNo,
      licenceExpiresOn: c.licenceExpiresOn,
      pfRegistrationNo: c.pfRegistrationNo,
      esiRegistrationNo: c.esiRegistrationNo,
      workScope: c.workScope,
      rateBasis: c.rateBasis,
      agreedRate: String(c.agreedRate),
      headcountDeployed: String(c.headcountDeployed),
      pfCompliant: String(c.pfCompliant),
      esiCompliant: String(c.esiCompliant),
      wagesCompliant: String(c.wagesCompliant),
      isActive: String(c.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? { lastComplianceCheckOn: null }),
      code: v.code,
      name: v.name,
      contactPerson: v.contactPerson,
      mobile: v.mobile,
      gstin: v.gstin,
      licenceNo: v.licenceNo,
      licenceExpiresOn: v.licenceExpiresOn,
      pfRegistrationNo: v.pfRegistrationNo,
      esiRegistrationNo: v.esiRegistrationNo,
      workScope: v.workScope,
      rateBasis: v.rateBasis as Contractor['rateBasis'],
      agreedRate: Number(v.agreedRate) || 0,
      headcountDeployed: Number(v.headcountDeployed) || 0,
      pfCompliant: v.pfCompliant === 'true',
      esiCompliant: v.esiCompliant === 'true',
      wagesCompliant: v.wagesCompliant === 'true',
      isActive: v.isActive !== 'false',
    }),
    blockDelete: (c) =>
      c.headcountDeployed > 0
        ? `${c.name} has ${c.headcountDeployed} people deployed. Demobilise them first — as principal employer we are liable for anybody on site.`
        : undefined,
  })

  const contractors = conCrud.rows
  const { rows: labour, update: updateLabour } = useCollection<ContractorLabourDay>('hrms:contractor-labour', labSeed)
  const { rows: bills, update: updateBill } = useCollection<ContractorBill>('hrms:contractor-bill', billSeed)

  const [tab, setTab] = useState('CONTRACTORS')
  const [holding, setHolding] = useState<ContractorBill | null>(null)
  const [holdReason, setHoldReason] = useState('')

  const daysTo = (d: string) => Math.round((new Date(d).getTime() - Date.now()) / 86_400_000)
  const compliant = (c: Contractor) => c.pfCompliant && c.esiCompliant && c.wagesCompliant && daysTo(c.licenceExpiresOn) > 0
  const nonCompliant = contractors.filter((c) => c.isActive && !compliant(c))

  const uncertified = labour.filter((l) => l.status === 'RECORDED')
  const onHold = bills.filter((b) => b.status === 'ON_HOLD')
  const toApprove = bills.filter((b) => b.status === 'CERTIFIED')
  const totalDeployed = contractors.filter((c) => c.isActive).reduce((s, c) => s + c.headcountDeployed, 0)

  const conColumns: Column<Contractor>[] = [
    { key: 'code', header: 'Contractor', sortable: true, width: '16rem', render: (c) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{c.name}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{c.code} · {c.contactPerson}</p>
      </div>
    ) },
    { key: 'workScope', header: 'Scope', render: (c) => <span className="text-2xs text-fg-muted">{c.workScope}</span> },
    { key: 'headcountDeployed', header: 'Deployed', align: 'right', width: '8.5rem', sortable: true, render: (c) => (
      <span className="tabular text-xs font-medium text-fg">{c.headcountDeployed}</span>
    ) },
    { key: 'rateBasis', header: 'Rate', sortable: true, width: '12rem', render: (c) => (
      <div className="min-w-0">
        <p className="text-2xs text-fg-muted">{RATE_BASIS_LABEL[c.rateBasis]}</p>
        {canSeePay && (
          <p className="tabular text-xs text-fg">
            ₹{c.agreedRate.toLocaleString('en-IN')}
            {c.rateBasis === 'PIECE_RATE' ? '/unit' : c.rateBasis === 'HOURLY' ? '/hour' : c.rateBasis === 'MONTHLY' ? '/month' : '/day'}
          </p>
        )}
      </div>
    ) },
    { key: 'compliance', header: 'Compliance', width: '17rem', accessor: (c) => (compliant(c) ? 1 : 0), render: (c) => (
      <div className="flex flex-wrap gap-1">
        <GateChip ok={c.pfCompliant} label="PF" />
        <GateChip ok={c.esiCompliant} label="ESI" />
        <GateChip ok={c.wagesCompliant} label="wages" />
        <GateChip ok={daysTo(c.licenceExpiresOn) > 0} label="licence" />
      </div>
    ) },
    { key: 'licenceExpiresOn', header: 'CLRA licence', sortable: true, width: '11rem', accessor: (c) => c.licenceExpiresOn, render: (c) => (
      <div className="min-w-0">
        <p className="truncate font-mono text-2xs text-fg">{c.licenceNo}</p>
        <DueCell date={c.licenceExpiresOn} />
      </div>
    ) },
    { key: 'lastComplianceCheckOn', header: 'Last checked', sortable: true, width: '10rem', accessor: (c) => c.lastComplianceCheckOn ?? '', render: (c) => (
      c.lastComplianceCheckOn ? <span className="text-2xs">{formatDate(c.lastComplianceCheckOn)}</span> : <span className="text-2xs text-danger">never</span>
    ) },
    { key: 'gstin', header: 'GSTIN', defaultHidden: true, render: (c) => <span className="font-mono text-2xs">{c.gstin}</span> },
    { key: 'isActive', header: 'Status', align: 'center', width: '7.5rem', sortable: true, accessor: (c) => (c.isActive ? 1 : 0), render: (c) => (
      <HrStatusBadge status={c.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
    ) },
  ]

  const labColumns: Column<ContractorLabourDay>[] = [
    { key: 'attendanceDate', header: 'Date', sortable: true, width: '8.5rem', accessor: (l) => l.attendanceDate, render: (l) => formatDate(l.attendanceDate) },
    { key: 'labourName', header: 'Labour', sortable: true, width: '13rem', render: (l) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{l.labourName}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{l.labourId}</p>
      </div>
    ) },
    { key: 'contractorName', header: 'Contractor', sortable: true, render: (l) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{l.contractorName}</p>
        <p className="truncate text-2xs text-fg-subtle">{l.department}{l.workCentre ? ` · ${l.workCentre}` : ''}</p>
      </div>
    ) },
    { key: 'shiftCode', header: 'Shift', align: 'center', width: '6rem', sortable: true, render: (l) => (
      <span className="font-mono text-2xs text-fg-muted">{l.shiftCode.replace('SH-', '')}</span>
    ) },
    { key: 'hoursWorked', header: 'Hours', align: 'right', width: '7.5rem', sortable: true, render: (l) => <Hours hours={l.hoursWorked} /> },
    { key: 'unitsProduced', header: 'Units', align: 'right', width: '8rem', sortable: true, render: (l) => (
      l.unitsProduced ? <span className="tabular text-xs">{formatQty(l.unitsProduced)}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'rateBasis', header: 'Paid on', sortable: true, width: '10rem', render: (l) => (
      <span className="text-2xs text-fg-muted">{RATE_BASIS_LABEL[l.rateBasis]}</span>
    ) },
    ...(canSeePay
      ? [{
          key: 'amount', header: 'Amount', align: 'right' as const, sortable: true, width: '9.5rem',
          render: (l: ContractorLabourDay) => <span className="tabular text-xs font-medium text-fg">{formatCurrency(l.amount)}</span>,
        }]
      : []),
    { key: 'certifiedBy', header: 'Certified by', sortable: true, render: (l) => (
      l.certifiedBy ? <span className="text-xs">{l.certifiedBy}</span> : <span className="text-2xs text-warning">not certified</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (l) => <HrStatusBadge status={l.status} size="sm" /> },
  ]

  const billColumns: Column<ContractorBill>[] = [
    { key: 'docNo', header: 'Bill', sortable: true, width: '11.5rem', render: (b) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{b.docNo}</p>
        <p className="text-2xs text-fg-subtle">{b.period}</p>
      </div>
    ) },
    { key: 'contractorName', header: 'Contractor', sortable: true, render: (b) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{b.contractorName}</p>
        <p className="font-mono text-2xs text-fg-subtle">{b.contractorCode}</p>
      </div>
    ) },
    { key: 'labourDays', header: 'Labour days', align: 'right', width: '10rem', sortable: true, render: (b) => (
      <span className="tabular text-xs">{formatQty(b.labourDays)}</span>
    ) },
    { key: 'totalHours', header: 'Hours', align: 'right', width: '8.5rem', sortable: true, render: (b) => (
      <span className="tabular text-xs text-fg-muted">{formatQty(b.totalHours)}</span>
    ) },
    { key: 'unitsProduced', header: 'Units', align: 'right', width: '9rem', sortable: true, render: (b) => (
      b.unitsProduced ? <span className="tabular text-xs">{formatQty(b.unitsProduced)}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    ...(canSeePay
      ? [
          { key: 'grossAmount', header: 'Gross', align: 'right' as const, sortable: true, width: '10.5rem', render: (b: ContractorBill) => formatCurrency(b.grossAmount) },
          { key: 'esiDeduction', header: 'Deductions', align: 'right' as const, width: '10rem', render: (b: ContractorBill) => (
            <span className="tabular text-xs text-danger">{formatCurrency(b.pfDeduction + b.esiDeduction + b.otherDeduction)}</span>
          ) },
          { key: 'netPayable', header: 'Net payable', align: 'right' as const, sortable: true, width: '11rem', render: (b: ContractorBill) => (
            <span className={cn('tabular text-xs font-semibold', b.status === 'ON_HOLD' ? 'text-fg-subtle line-through' : 'text-fg')}>
              {formatCurrency(b.netPayable)}
            </span>
          ) },
        ]
      : []),
    { key: 'complianceVerified', header: 'Compliance', align: 'center', width: '11rem', accessor: (b) => (b.complianceVerified ? 1 : 0), render: (b) => (
      b.complianceVerified
        ? <Badge tone="success" size="sm" dot={false}>verified</Badge>
        : <Badge tone="danger" size="sm">not verified</Badge>
    ) },
    { key: 'holdReason', header: 'Why held', render: (b) => (
      b.holdReason ? <span className="text-2xs text-danger">{b.holdReason}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9.5rem', render: (b) => <HrStatusBadge status={b.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'CONTRACTORS'
          ? exportRows(format, 'contractors', 'Contractor register', columnsFromTable(conColumns), contractors)
          : tab === 'ATTENDANCE'
            ? exportRows(format, 'contractor-labour', 'Contractor labour attendance', columnsFromTable(labColumns), labour)
            : exportRows(format, 'contractor-bills', 'Contractor bills', columnsFromTable(billColumns), bills)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Contractor labour"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Contractors' }]}
        actions={
          tab === 'CONTRACTORS' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => conCrud.openCreate({ rateBasis: 'DAILY_WAGE', isActive: 'true', pfCompliant: 'false', esiCompliant: 'false', wagesCompliant: 'false' })}
            >
              Add a contractor
            </Button>
          ) : undefined
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg tabular">{totalDeployed}</span> contract workers on site across{' '}
        {contractors.filter((c) => c.isActive).length} contractors
        {nonCompliant.length > 0 && <> · <span className="font-medium text-danger">{nonCompliant.length}</span> with open compliance</>}
        {onHold.length > 0 && <> · <span className="font-medium text-danger">{onHold.length}</span> bill{onHold.length === 1 ? '' : 's'} on hold</>}
        {uncertified.length > 0 && <> · <span className="font-medium text-warning">{uncertified.length}</span> labour day{uncertified.length === 1 ? '' : 's'} uncertified</>}
      </p>

      {nonCompliant.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Compliance exposure"
            description="As principal employer we are liable for these, whatever the contract says"
          />
          <CardBody className="space-y-2">
            {nonCompliant.map((c) => {
              const issues = [
                !c.pfCompliant && 'PF contribution not evidenced',
                !c.esiCompliant && 'ESI contribution not evidenced',
                !c.wagesCompliant && 'minimum wages not evidenced',
                daysTo(c.licenceExpiresOn) <= 0 && `CLRA licence expired ${-daysTo(c.licenceExpiresOn)} days ago`,
              ].filter(Boolean)
              return (
                <div key={c.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">
                      {c.name} — {c.headcountDeployed} people on site
                    </p>
                    <p className="text-2xs text-fg-muted">{issues.join(' · ')}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => {
                        conCrud.update(c.uid, {
                          pfCompliant: true,
                          esiCompliant: true,
                          wagesCompliant: true,
                          lastComplianceCheckOn: new Date().toISOString().slice(0, 10),
                        })
                        toast.success(
                          'Compliance recorded',
                          `${c.name} — PF, ESI and wage evidence recorded today. Bills for this contractor can now be passed.`,
                        )
                      }}
                    >
                      Record evidence
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => conCrud.openEdit(c)}>Edit</Button>
                  </div>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      {tab === 'CONTRACTORS' ? (
        <DataTable
          rows={contractors}
          columns={conColumns}
          rowKey={(c) => c.uid}
          searchPlaceholder="Search contractor, code, contact or scope…"
          onExport={doExport}
          emptyTitle="No contractors"
          rowClassName={(c) => cn(!c.isActive && 'opacity-60', c.isActive && !compliant(c) && 'bg-danger/[0.04]')}
          rowActions={(c) => (
            <>
              <MenuItem label="Edit the contractor" onClick={() => conCrud.openEdit(c)} />
              <MenuItem label="Delete the contractor" danger onClick={() => conCrud.askDelete(c)} />
              <MenuItem
                separatorBefore
                label="Record compliance evidence"
                onClick={() => {
                  conCrud.update(c.uid, {
                    pfCompliant: true,
                    esiCompliant: true,
                    wagesCompliant: true,
                    lastComplianceCheckOn: new Date().toISOString().slice(0, 10),
                  })
                  toast.success('Compliance recorded', `${c.name} verified today.`)
                }}
              />
              <MenuItem label="See the daily labour" onClick={() => setTab('ATTENDANCE')} />
              <MenuItem label="See the bills" onClick={() => setTab('BILLS')} />
              <MenuItem
                separatorBefore
                label={c.isActive ? 'Demobilise the contractor' : 'Reactivate'}
                danger={c.isActive}
                onClick={() => {
                  if (c.isActive && c.headcountDeployed > 0) {
                    toast.error(
                      'People still on site',
                      `${c.name} has ${c.headcountDeployed} workers deployed. They have to be demobilised before the contractor can be closed — we remain liable for anybody on site.`,
                    )
                    return
                  }
                  conCrud.update(c.uid, { isActive: !c.isActive })
                  toast.success(c.isActive ? 'Contractor demobilised' : 'Contractor reactivated', `${c.name} updated.`)
                }}
              />
            </>
          )}
        />
      ) : tab === 'ATTENDANCE' ? (
        <DataTable
          rows={labour}
          columns={labColumns}
          rowKey={(l) => l.uid}
          searchPlaceholder="Search labour, contractor, department or work centre…"
          onExport={doExport}
          emptyTitle="No contractor attendance"
          rowClassName={(l) => cn(l.status === 'RECORDED' && 'bg-warning/[0.04]', l.status === 'DISPUTED' && 'bg-danger/[0.04]')}
          rowActions={(l) => (
            <>
              <MenuItem
                label="Edit — certify the day"
                onClick={() => {
                  updateLabour(l.uid, { certifiedBy: 'R. Vasanth', status: 'CERTIFIED' })
                  toast.success(
                    'Day certified',
                    `${l.labourName}'s ${l.hoursWorked} hours on ${formatDate(l.attendanceDate)} certified. Only certified days can be billed.`,
                  )
                }}
              />
              <MenuItem
                label="Delete the day"
                danger
                disabled={l.status === 'BILLED'}
                onClick={() => {
                  updateLabour(l.uid, { status: 'DISPUTED', certifiedBy: null })
                  toast.success('Day disputed', `${l.labourName}'s ${formatDate(l.attendanceDate)} marked disputed and excluded from billing.`)
                }}
              />
              <MenuItem
                separatorBefore
                label="Dispute the day"
                danger
                disabled={l.status === 'DISPUTED' || l.status === 'BILLED'}
                onClick={() => {
                  updateLabour(l.uid, { status: 'DISPUTED' })
                  toast.success('Disputed', `${l.labourName}'s day is disputed. The contractor is told and it drops out of the bill.`)
                }}
              />
            </>
          )}
        />
      ) : (
        <>
          {(onHold.length > 0 || toApprove.length > 0) && (
            <Card className="mb-4">
              <CardHeader title="Bills needing a decision" description="A bill cannot be approved while compliance is open" />
              <CardBody className="space-y-2">
                {[...onHold, ...toApprove].map((b) => {
                  const con = contractors.find((c) => c.code === b.contractorCode)
                  const canPass = b.complianceVerified && con && compliant(con)
                  return (
                    <div
                      key={b.uid}
                      className={cn('rounded border p-2.5', canPass ? 'border-border bg-surface-2' : 'border-danger/30 bg-danger/5')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg">
                            {b.docNo} — {b.contractorName}, {b.period}
                            {canSeePay && ` · ${formatCurrency(b.netPayable)}`}
                          </p>
                          <p className="mt-0.5 text-2xs text-fg-muted">
                            {formatQty(b.labourDays)} labour days, {formatQty(b.totalHours)} hours
                            {b.unitsProduced ? `, ${formatQty(b.unitsProduced)} units` : ''}
                          </p>
                          {!canPass && (
                            <p className="mt-1 text-2xs font-medium text-danger">
                              {b.holdReason ?? 'Contractor compliance is open — the bill cannot be passed.'}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            variant={canPass ? 'success' : 'outline'}
                            size="sm"
                            onClick={() => {
                              if (!canPass) {
                                toast.error(
                                  'Compliance is open',
                                  `${b.contractorName} has outstanding PF, ESI, wage or licence evidence. Passing this bill while that is open transfers the liability to us as principal employer.`,
                                )
                                return
                              }
                              updateBill(b.uid, { status: 'APPROVED', approvedBy: 'Meera Rajan' })
                              toast.success('Bill approved', `${b.docNo} approved for ${canSeePay ? formatCurrency(b.netPayable) : 'payment'}.`)
                            }}
                          >
                            Approve
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => { setHolding(b); setHoldReason(b.holdReason ?? '') }}>
                            Hold
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          )}

          <DataTable
            rows={bills}
            columns={billColumns}
            rowKey={(b) => b.uid}
            searchPlaceholder="Search bill, contractor or period…"
            onExport={doExport}
            emptyTitle="No contractor bills"
            rowClassName={(b) => cn(
              b.status === 'ON_HOLD' && 'bg-danger/[0.05]',
              b.status === 'CERTIFIED' && 'bg-warning/[0.03]',
              !b.complianceVerified && 'bg-danger/[0.02]',
            )}
            rowActions={(b) => {
              const con = contractors.find((c) => c.code === b.contractorCode)
              return (
                <>
                  <MenuItem
                    label="Edit — certify the bill"
                    disabled={b.status === 'PAID' || b.status === 'APPROVED'}
                    onClick={() => {
                      updateBill(b.uid, { status: 'CERTIFIED', certifiedBy: 'R. Vasanth' })
                      toast.success('Bill certified', `${b.docNo} certified against the labour days on record. It now needs approval.`)
                    }}
                  />
                  <MenuItem
                    label="Delete the bill"
                    danger
                    disabled={b.status === 'PAID' || b.status === 'APPROVED'}
                    onClick={() => {
                      updateBill(b.uid, { status: 'REJECTED', holdReason: 'Bill rejected by HR.' })
                      toast.success('Bill rejected', `${b.docNo} rejected. The contractor is asked to resubmit.`)
                    }}
                  />
                  <MenuItem
                    separatorBefore
                    label="Verify compliance for this bill"
                    disabled={b.complianceVerified}
                    onClick={() => {
                      if (!con || !compliant(con)) {
                        toast.error(
                          'Contractor compliance is open',
                          `${b.contractorName} has outstanding evidence. Record it on the contractor first — the bill check reads from there.`,
                        )
                        return
                      }
                      updateBill(b.uid, { complianceVerified: true, holdReason: null })
                      toast.success('Compliance verified', `${b.docNo} can now be approved.`)
                    }}
                  />
                  <MenuItem
                    label="Approve the bill"
                    disabled={b.status !== 'CERTIFIED' || !b.complianceVerified}
                    onClick={() => {
                      updateBill(b.uid, { status: 'APPROVED', approvedBy: 'Meera Rajan' })
                      toast.success('Bill approved', `${b.docNo} approved.`)
                    }}
                  />
                  <MenuItem
                    label="Mark paid"
                    disabled={b.status !== 'APPROVED'}
                    onClick={() => {
                      updateBill(b.uid, { status: 'PAID' })
                      toast.success('Bill paid', `${canSeePay ? formatCurrency(b.netPayable) : 'The bill'} paid to ${b.contractorName}.`)
                    }}
                  />
                  <MenuItem
                    label="Hold the bill"
                    danger
                    disabled={b.status === 'PAID' || b.status === 'ON_HOLD'}
                    onClick={() => { setHolding(b); setHoldReason('') }}
                  />
                </>
              )
            }}
          />
        </>
      )}

      {/* Hold a bill ------------------------------------------------------- */}
      <Modal
        open={!!holding}
        onClose={() => setHolding(null)}
        title={holding ? `Hold ${holding.docNo}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setHolding(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!holding) return
                if (!holdReason.trim()) {
                  toast.error('A reason is required', 'The contractor is told why, and the reason is what a labour inspector reads.')
                  return
                }
                updateBill(holding.uid, { status: 'ON_HOLD', holdReason: holdReason.trim(), complianceVerified: false })
                toast.success(
                  'Bill held',
                  `${holding.docNo} held and excluded from payment. ${holding.contractorName} is notified with the reason.`,
                )
                setHolding(null)
              }}
            >
              Hold the bill
            </Button>
          </>
        }
      >
        {holding && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {holding.contractorName}'s bill for {holding.period}
              {canSeePay && <> of <span className="font-medium text-fg">{formatCurrency(holding.netPayable)}</span></>} will be
              excluded from payment until the hold is released.
            </p>
            <Textarea
              label="Reason (required)"
              rows={3}
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="ESI compliance not evidenced for June, and the CLRA licence expired 18 days ago."
            />
          </div>
        )}
      </Modal>

      {conCrud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Why compliance blocks the bill" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">The liability is ours.</span> Under the Contract Labour Act the principal
            employer must pay what the contractor did not. Paying a bill while PF or wage evidence is missing means paying twice.
          </p>
          <p>
            <span className="font-medium text-fg">Withholding is the only real lever.</span> A contractor with an approved bill has
            no reason to produce evidence. One with a held bill produces it the same week.
          </p>
          <p>
            <span className="font-medium text-fg">The licence matters too.</span> Engaging contract labour under a lapsed CLRA
            licence is an offence for both parties, whatever the worker was paid.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
