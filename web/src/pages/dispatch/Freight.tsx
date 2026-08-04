import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import {
  CHARGE_TYPE_LABEL,
  DispatchChartTip,
  DispatchStatusBadge,
  useCanSeeFreight,
} from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { freightCharges as seedFreight } from '@/mock/dispatch'
import type { FreightCharge } from '@/types/dispatch'

const ALLOCATE_LABEL: Record<string, string> = {
  SHIPMENT: 'This shipment',
  CUSTOMER: 'The customer',
  PRODUCT: 'The product',
  SALES_ORDER: 'The sales order',
}

const BASIS_LABEL: Record<string, string> = {
  PER_TRIP: 'Per trip',
  PER_KG: 'Per kg',
  PER_CARTON: 'Per carton',
  PER_KM: 'Per km',
  ACTUAL: 'Actual',
}

const TABS = [
  { id: 'ALL', label: 'All charges' },
  { id: 'OPEN', label: 'Not yet approved' },
  { id: 'DISPUTED', label: 'Disputed' },
  { id: 'AVOIDABLE', label: 'Avoidable' },
]

/**
 * Freight and logistics cost — eight charge types, and the dimension each one is
 * charged to. Allocation is the point: freight booked to "shipment" tells you
 * nothing next quarter, while freight allocated to a customer or a product tells
 * you which orders are actually profitable once delivery is paid for.
 */
export function FreightPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeFreight()
  const seed = useMemo(() => seedFreight, [])

  const crud = useCrud<FreightCharge>({
    key: 'dispatch:freight',
    seed,
    entity: 'Freight charge',
    titleOf: (f) => `${CHARGE_TYPE_LABEL[f.chargeType]} on ${f.shipmentNo}`,
    fields: [
      { name: 'docNo', label: 'Charge number', required: true, readOnly: true },
      { name: 'shipmentNo', label: 'Shipment', required: true },
      { name: 'customer', label: 'Customer', required: true },
      { name: 'transporter', label: 'Billed by', required: true },
      { name: 'route', label: 'Route', required: true },
      {
        name: 'chargeType',
        label: 'Charge type',
        type: 'select',
        required: true,
        options: Object.entries(CHARGE_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        name: 'basis',
        label: 'Charged on',
        type: 'select',
        required: true,
        options: Object.entries(BASIS_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true, hint: 'Kilograms, cartons, kilometres or 1 for a whole trip' },
      { name: 'rate', label: 'Rate', type: 'number', required: true },
      {
        name: 'allocateTo',
        label: 'Allocate the cost to',
        type: 'select',
        required: true,
        options: Object.entries(ALLOCATE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'billNo', label: 'Transporter bill number' },
      { name: 'billDate', label: 'Bill date', type: 'date' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? { docNo: v.docNo, approvedBy: null, status: 'ESTIMATED' as const }),
      shipmentNo: v.shipmentNo,
      customer: v.customer,
      transporter: v.transporter,
      route: v.route,
      chargeType: v.chargeType as FreightCharge['chargeType'],
      basis: v.basis as FreightCharge['basis'],
      quantity: Number(v.quantity) || 0,
      rate: Number(v.rate) || 0,
      // Amount is always derived — a hand-typed total is how reconciliations break.
      amount: Math.round((Number(v.quantity) || 0) * (Number(v.rate) || 0)),
      allocateTo: v.allocateTo as FreightCharge['allocateTo'],
      billNo: v.billNo || null,
      billDate: v.billDate || null,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (f) =>
      f.status === 'PAID'
        ? `${f.docNo} has been paid against bill ${f.billNo}. A paid charge is a financial record — raise a debit note instead.`
        : undefined,
  })

  const charges = crud.rows
  const [tab, setTab] = useState('ALL')
  const [groupBy, setGroupBy] = useState<'chargeType' | 'transporter' | 'customer' | 'route'>('chargeType')

  /** Demurrage and a disputed surcharge are avoidable cost, not cost of doing business. */
  const isAvoidable = (f: FreightCharge) => f.chargeType === 'DEMURRAGE' || f.status === 'DISPUTED'

  const visible = charges.filter((f) => {
    if (tab === 'OPEN') return f.status === 'ESTIMATED' || f.status === 'ACTUAL'
    if (tab === 'DISPUTED') return f.status === 'DISPUTED'
    if (tab === 'AVOIDABLE') return isAvoidable(f)
    return true
  })

  const total = charges.reduce((s, f) => s + f.amount, 0)
  const unapproved = charges.filter((f) => f.status === 'ESTIMATED' || f.status === 'ACTUAL')
  const disputed = charges.filter((f) => f.status === 'DISPUTED')
  const avoidable = charges.filter(isAvoidable).reduce((s, f) => s + f.amount, 0)

  const grouped = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of charges) {
      const key =
        groupBy === 'chargeType' ? CHARGE_TYPE_LABEL[f.chargeType]
        : groupBy === 'transporter' ? f.transporter
        : groupBy === 'customer' ? f.customer
        : f.route
      map.set(key, (map.get(key) ?? 0) + f.amount)
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
  }, [charges, groupBy])

  const columns: Column<FreightCharge>[] = [
    { key: 'docNo', header: 'Charge', sortable: true, width: '11.5rem', render: (f) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{f.docNo}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{f.shipmentNo}</p>
      </div>
    ) },
    { key: 'chargeType', header: 'Charge type', sortable: true, width: '11rem', render: (f) => (
      <Badge tone={f.chargeType === 'DEMURRAGE' ? 'danger' : f.chargeType === 'FREIGHT' ? 'brand' : 'neutral'} size="sm" dot={false}>
        {CHARGE_TYPE_LABEL[f.chargeType]}
      </Badge>
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (f) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{f.customer}</p>
        <p className="truncate text-2xs text-fg-subtle">{f.route}</p>
      </div>
    ) },
    { key: 'transporter', header: 'Billed by', sortable: true, width: '12rem' },
    { key: 'basis', header: 'Charged on', sortable: true, width: '8.5rem', render: (f) => (
      <span className="text-2xs text-fg-muted">{BASIS_LABEL[f.basis]}</span>
    ) },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, width: '7.5rem', render: (f) => (
      <span className="tabular text-2xs text-fg-muted">{f.quantity.toLocaleString('en-IN')}</span>
    ) },
    ...(canSeeValue
      ? [
          { key: 'rate', header: 'Rate', align: 'right' as const, sortable: true, width: '8rem', render: (f: FreightCharge) => formatCurrency(f.rate) },
          { key: 'amount', header: 'Amount', align: 'right' as const, sortable: true, width: '9.5rem', render: (f: FreightCharge) => (
            <span className={cn('tabular text-xs font-medium', isAvoidable(f) && 'text-danger')}>{formatCurrency(f.amount)}</span>
          ) },
        ]
      : []),
    { key: 'allocateTo', header: 'Charged to', sortable: true, width: '10rem', render: (f) => (
      <Badge tone={f.allocateTo === 'SHIPMENT' ? 'neutral' : 'progress'} size="sm" dot={false}>{ALLOCATE_LABEL[f.allocateTo]}</Badge>
    ) },
    { key: 'billNo', header: 'Bill', sortable: true, width: '11rem', render: (f) => (
      f.billNo ? (
        <div className="min-w-0">
          <p className="truncate font-mono text-2xs text-fg">{f.billNo}</p>
          {f.billDate && <p className="text-2xs text-fg-subtle">{formatDate(f.billDate)}</p>}
        </div>
      ) : (
        <span className="text-2xs text-fg-subtle">not billed</span>
      )
    ) },
    { key: 'remarks', header: 'Note', render: (f) => (
      f.remarks ? <span className="text-2xs text-fg-muted">{f.remarks}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (f) => <DispatchStatusBadge status={f.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'freight-charges', 'Freight & logistics cost', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  if (!canSeeValue) {
    return (
      <div>
        <PageHeader
          title="Freight & logistics cost"
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Freight' }]}
        />
        <Card>
          <CardHeader title="This screen is cost-only" description="Your role can see quantities but not what they cost" />
          <CardBody className="space-y-3 text-xs leading-relaxed text-fg-muted">
            <p>
              Freight rates are commercial terms negotiated with each transporter, so the whole of this screen sits behind{' '}
              <span className="font-mono text-fg">DISPATCH.FREIGHT.VIEW</span>. Somebody confirming cartons onto a vehicle has no
              need to know what the trip costs, and rates leaking to a transporter's competitor is a real commercial risk.
            </p>
            <p>
              What you can still reach without it: <Link to="/dispatch/shipments" className="font-medium text-brand-600 hover:underline">shipments</Link>{' '}
              and their weights, <Link to="/dispatch/tracking" className="font-medium text-brand-600 hover:underline">tracking</Link>,{' '}
              <Link to="/dispatch/transporters" className="font-medium text-brand-600 hover:underline">transporter on-time and damage performance</Link>{' '}
              — all of which are quantity and quality measures rather than money.
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Freight & logistics cost"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Freight' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => crud.openCreate({
              docNo: `FRT/2607/${String(290 + charges.length).padStart(4, '0')}`,
              chargeType: 'FREIGHT',
              basis: 'PER_KG',
              allocateTo: 'SHIPMENT',
              quantity: '1',
            })}
          >
            Add a charge
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'DISPUTED' ? disputed.length : undefined }))} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg tabular">{formatCurrency(total)}</span> of logistics cost recorded ·{' '}
        <span className={cn('font-medium', unapproved.length ? 'text-warning' : 'text-success')}>{unapproved.length}</span> charge
        {unapproved.length === 1 ? '' : 's'} not yet approved
        {avoidable > 0 && (
          <>
            {' '}· <span className="font-medium text-danger tabular">{formatCurrency(avoidable)}</span> of it avoidable
          </>
        )}
        .
      </p>

      {avoidable > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Avoidable cost"
            description="Demurrage and disputed charges — money spent because something else went wrong"
          />
          <CardBody className="space-y-2">
            {charges.filter(isAvoidable).map((f) => (
              <div key={f.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {CHARGE_TYPE_LABEL[f.chargeType]} — {formatCurrency(f.amount)} on {f.shipmentNo}
                  </p>
                  <p className="text-2xs text-fg-muted">{f.remarks ?? `${f.transporter} · ${f.route}`}</p>
                </div>
                {f.status === 'DISPUTED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      crud.update(f.uid, { status: 'APPROVED', approvedBy: 'S. Ganapathy' })
                      toast.success('Dispute settled', `${f.docNo} accepted at ${formatCurrency(f.amount)} and released for payment.`)
                    }}
                  >
                    Accept and release
                  </Button>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader
          title="Where the logistics money goes"
          description="Change the grouping to see the same cost from a different angle"
          actions={
            <Select
              sizeVariant="sm"
              containerClassName="w-44"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              options={[
                { value: 'chargeType', label: 'By charge type' },
                { value: 'transporter', label: 'By transporter' },
                { value: 'customer', label: 'By customer' },
                { value: 'route', label: 'By route' },
              ]}
            />
          }
        />
        <CardBody className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grouped} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<DispatchChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
              <Bar dataKey="amount" name="Cost" radius={[0, 3, 3, 0]} maxBarSize={20}>
                {grouped.map((g, i) => (
                  <Cell key={i} fill={g.name === 'Demurrage' ? '#ef4444' : i === 0 ? '#8b5cf6' : '#06b6d4'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(f) => f.uid}
        searchPlaceholder="Search charge, shipment, transporter, customer or bill…"
        onExport={doExport}
        emptyTitle="No freight charges"
        rowClassName={(f) => cn(
          f.status === 'DISPUTED' && 'bg-danger/[0.05]',
          f.chargeType === 'DEMURRAGE' && 'bg-danger/[0.03]',
          f.status === 'ESTIMATED' && 'bg-warning/[0.03]',
        )}
        rowActions={(f) => (
          <>
            <MenuItem label="Edit the charge" onClick={() => crud.openEdit(f)} />
            <MenuItem label="Delete the charge" danger onClick={() => crud.askDelete(f)} />
            <MenuItem
              separatorBefore
              label="Approve for payment"
              disabled={f.status === 'APPROVED' || f.status === 'PAID'}
              onClick={() => {
                if (!f.billNo) {
                  toast.error('No transporter bill', `${f.docNo} has no bill number against it. An estimate cannot be approved for payment — enter the bill first.`)
                  return
                }
                crud.update(f.uid, { status: 'APPROVED', approvedBy: 'S. Ganapathy' })
                toast.success('Approved', `${formatCurrency(f.amount)} approved against bill ${f.billNo}. Finance can now pay it.`)
              }}
            />
            <MenuItem
              label="Mark paid"
              disabled={f.status !== 'APPROVED'}
              onClick={() => {
                crud.update(f.uid, { status: 'PAID' })
                toast.success('Marked paid', `${formatCurrency(f.amount)} paid to ${f.transporter}, allocated to ${ALLOCATE_LABEL[f.allocateTo].toLowerCase()}.`)
              }}
            />
            <MenuItem
              label="Dispute the charge"
              danger
              disabled={f.status === 'PAID' || f.status === 'DISPUTED'}
              onClick={() => {
                crud.update(f.uid, { status: 'DISPUTED' })
                toast.success('Charge disputed', `${f.docNo} held. ${f.transporter} is notified and payment is stopped until a corrected bill arrives.`)
              }}
            />
          </>
        )}
      />

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Allocating the cost is the whole point" description="The same rupee tells you different things depending on where it lands" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">This shipment</span> — the default. Accurate, but it answers no question beyond "what did that trip cost".</p>
          <p><span className="font-medium text-fg">The customer</span> — reveals which customers are expensive to serve. A customer with a 4% margin and 6% delivery cost is losing money.</p>
          <p><span className="font-medium text-fg">The product</span> — a 1000 ml bottle costs more to move than a 500 ml one. Allocating here is what makes per-unit landed cost real.</p>
          <p><span className="font-medium text-fg">The sales order</span> — for export, where freight and insurance are a large part of the CIF price and belong on that order.</p>
        </CardBody>
      </Card>
    </div>
  )
}
