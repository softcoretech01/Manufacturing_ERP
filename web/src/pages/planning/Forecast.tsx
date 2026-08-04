import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, PlanStatusBadge } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { forecastAccuracy } from '@/lib/planFlow'
import { newUid } from '@/store/data'
import { usePlanningData } from './usePlanningData'
import type { ForecastLine, ForecastMethod } from '@/types/planning'

/**
 * Sales forecast (Ch 5).
 *
 * A forecast is only worth planning against if somebody measures it afterwards,
 * so every closed period keeps its actual next to the number that was promised
 * and the screen reports the error. A method and a base quantity are captured
 * rather than a bare number — "13,000 last year plus 15% for the season" can be
 * argued with; "14,950" cannot.
 */

const METHODS: ForecastMethod[] = ['MANUAL', 'HISTORICAL_AVERAGE', 'SEASONAL', 'GROWTH_PERCENT']
const METHOD_LABEL: Record<ForecastMethod, string> = {
  MANUAL: 'Manual',
  HISTORICAL_AVERAGE: 'Historical average',
  SEASONAL: 'Seasonal',
  GROWTH_PERCENT: 'Growth percentage',
}

interface FormState {
  productCode: string
  period: string
  method: ForecastMethod
  baseQty: string
  factorPct: string
  confidencePct: string
  market: ForecastLine['market']
  remarks: string
}

const emptyForm: FormState = {
  productCode: '',
  period: '',
  method: 'SEASONAL',
  baseQty: '',
  factorPct: '0',
  confidencePct: '75',
  market: 'DOMESTIC',
  remarks: '',
}

export function ForecastPage() {
  const toast = useToast()
  const { forecast, products } = usePlanningData()
  const { rows, create, update, remove } = forecast

  const [tab, setTab] = useState('open')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ForecastLine | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<ForecastLine | null>(null)

  const closed = rows.filter((r) => r.actualQty !== null)
  const accuracy = useMemo(() => forecastAccuracy(rows), [rows])

  const counts = {
    open: rows.filter((r) => r.actualQty === null).length,
    closed: closed.length,
    draft: rows.filter((r) => r.status === 'DRAFT').length,
    all: rows.length,
  }

  const filtered = rows
    .filter((r) => {
      if (tab === 'open') return r.actualQty === null
      if (tab === 'closed') return r.actualQty !== null
      if (tab === 'draft') return r.status === 'DRAFT'
      return true
    })
    .sort((a, b) => a.period.localeCompare(b.period) || a.productCode.localeCompare(b.productCode))

  /** Forecast against actual by period, for the chart. */
  const chart = useMemo(() => {
    const byPeriod = new Map<string, { period: string; Forecast: number; Actual: number }>()
    for (const r of rows) {
      const e = byPeriod.get(r.period) ?? { period: r.period, Forecast: 0, Actual: 0 }
      e.Forecast += r.forecastQty
      e.Actual += r.actualQty ?? 0
      byPeriod.set(r.period, e)
    }
    return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period))
  }, [rows])

  const derived = Math.round((Number(form.baseQty) || 0) * (1 + (Number(form.factorPct) || 0) / 100))

  const columns: Column<ForecastLine>[] = [
    { key: 'period', header: 'Period', sortable: true, width: '7rem', render: (r) => <span className="font-mono text-xs">{r.period}</span> },
    {
      key: 'productCode',
      header: 'Product',
      sortable: true,
      render: (r) => (
        <>
          <p className="text-xs font-medium text-fg">{r.productName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{r.productCode}</p>
        </>
      ),
    },
    { key: 'market', header: 'Market', width: '6rem', render: (r) => <span className="text-xs text-fg-muted">{r.market.toLowerCase()}</span> },
    { key: 'method', header: 'Method', sortable: true, width: '11rem', accessor: (r) => METHOD_LABEL[r.method], render: (r) => <span className="text-xs text-fg-muted">{METHOD_LABEL[r.method]}</span> },
    { key: 'baseQty', header: 'Base', align: 'right', width: '7rem', accessor: (r) => r.baseQty, render: (r) => r.baseQty.toLocaleString('en-IN') },
    { key: 'factorPct', header: 'Factor', align: 'right', width: '6rem', accessor: (r) => r.factorPct, render: (r) => `${r.factorPct > 0 ? '+' : ''}${r.factorPct}%` },
    { key: 'forecastQty', header: 'Forecast', align: 'right', sortable: true, width: '8rem', accessor: (r) => r.forecastQty, render: (r) => <span className="font-medium">{r.forecastQty.toLocaleString('en-IN')}</span> },
    { key: 'actualQty', header: 'Actual', align: 'right', sortable: true, width: '8rem', accessor: (r) => r.actualQty ?? 0, render: (r) => (r.actualQty === null ? <span className="text-2xs text-fg-subtle">open</span> : r.actualQty.toLocaleString('en-IN')) },
    {
      key: 'error',
      header: 'Error',
      align: 'right',
      width: '7rem',
      accessor: (r) => (r.actualQty ? ((r.forecastQty - r.actualQty) / r.actualQty) * 100 : 0),
      render: (r) => {
        if (r.actualQty === null || r.actualQty === 0) return <span className="text-2xs text-fg-subtle">—</span>
        const err = ((r.forecastQty - r.actualQty) / r.actualQty) * 100
        return (
          <span className={cn('tabular text-xs', Math.abs(err) > 10 ? 'text-danger' : Math.abs(err) > 5 ? 'text-warning' : 'text-success')}>
            {err > 0 ? '+' : ''}
            {err.toFixed(1)}%
          </span>
        )
      },
    },
    {
      key: 'confidencePct',
      header: 'Confidence',
      align: 'right',
      width: '7.5rem',
      accessor: (r) => r.confidencePct,
      render: (r) => (
        <span className={cn('tabular text-xs', r.confidencePct < 60 ? 'text-warning' : 'text-fg-muted')}>{r.confidencePct}%</span>
      ),
    },
    { key: 'status', header: 'Status', width: '7.5rem', render: (r) => <PlanStatusBadge status={r.status} size="sm" /> },
  ]

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, productCode: products.rows[0]?.code ?? '', period: new Date().toISOString().slice(0, 7) })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(r: ForecastLine) {
    setEditing(r)
    setForm({
      productCode: r.productCode,
      period: r.period,
      method: r.method,
      baseQty: String(r.baseQty),
      factorPct: String(r.factorPct),
      confidencePct: String(r.confidencePct),
      market: r.market,
      remarks: r.remarks,
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.productCode) e.productCode = 'Choose the product.'
    if (!/^\d{4}-\d{2}$/.test(form.period)) e.period = 'Use a month in the form 2026-08.'
    else if (rows.some((r) => r.period === form.period && r.productCode === form.productCode && r.market === form.market && r.uid !== editing?.uid))
      e.period = 'A forecast already exists for this product, market and month.'
    if (!(Number(form.baseQty) > 0)) e.baseQty = 'The base quantity must be greater than zero.'
    if (Number(form.confidencePct) < 0 || Number(form.confidencePct) > 100) e.confidencePct = 'Confidence is a percentage between 0 and 100.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save() {
    if (!validate()) return
    const product = products.rows.find((p) => p.code === form.productCode)
    const patch = {
      productCode: form.productCode,
      productName: product?.name ?? form.productCode,
      uom: product?.baseUom ?? 'NOS',
      period: form.period,
      method: form.method,
      baseQty: Number(form.baseQty),
      factorPct: Number(form.factorPct) || 0,
      forecastQty: derived,
      confidencePct: Number(form.confidencePct) || 0,
      market: form.market,
      remarks: form.remarks.trim(),
    }
    if (editing) {
      update(editing.uid, { ...patch, version: editing.version + 1 })
      toast.success('Forecast updated', `${patch.productCode} ${patch.period} is now ${derived.toLocaleString('en-IN')}.`)
    } else {
      const next = rows.length + 1
      create({
        ...patch,
        uid: newUid('fcl'),
        docNo: `FC/26-27/${String(next).padStart(4, '0')}`,
        actualQty: null,
        version: 1,
        status: 'DRAFT',
        createdBy: 'A. Lakshmi',
        createdAt: new Date().toISOString(),
      } as ForecastLine)
      toast.success('Forecast added', `${patch.productCode} ${patch.period} at ${derived.toLocaleString('en-IN')} ${patch.uom}.`)
    }
    setFormOpen(false)
  }

  return (
    <div>
      <PageHeader
        title="Sales forecast"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Forecast' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New forecast line
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open periods', count: counts.open },
              { id: 'closed', label: 'Closed & measured', count: counts.closed },
              { id: 'draft', label: 'Draft', count: counts.draft },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />

      {accuracy.mapePct !== null && (
        <Alert tone={accuracy.mapePct > 15 ? 'warning' : 'info'} className="mb-4">
          Across {accuracy.periods} closed period{accuracy.periods === 1 ? '' : 's'} the mean absolute error is{' '}
          <span className="font-semibold text-fg">{accuracy.mapePct.toFixed(1)}%</span> with a bias of{' '}
          <span className="font-semibold text-fg">
            {accuracy.biasPct !== null && accuracy.biasPct > 0 ? '+' : ''}
            {accuracy.biasPct?.toFixed(1)}%
          </span>
          . {accuracy.biasPct !== null && accuracy.biasPct > 3
            ? 'A positive bias means the forecast has been running high — stock builds up.'
            : accuracy.biasPct !== null && accuracy.biasPct < -3
              ? 'A negative bias means the forecast has been running low — expect expediting.'
              : 'The bias is small, so the error is noise rather than a systematic lean.'}
        </Alert>
      )}

      <Card className="mb-4">
        <CardHeader title="Forecast against actual" description="All products, by month" />
        <CardBody className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
              <Bar dataKey="Forecast" fill="#3b82f6" maxBarSize={34} radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search product, period or method…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'forecast', 'Sales forecast', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={openEdit}
        emptyTitle="No forecast"
        emptyDescription="Forecast lines feed the master production schedule for periods with no firm orders."
        rowActions={(r) => (
          <>
            <MenuItem label="Edit" onClick={() => openEdit(r)} />
            <MenuItem
              label={r.status === 'DRAFT' ? 'Approve' : 'Return to draft'}
              separatorBefore
              onClick={() => {
                update(r.uid, { status: r.status === 'DRAFT' ? 'APPROVED' : 'DRAFT' })
                toast.success('Updated', `${r.productCode} ${r.period} is now ${r.status === 'DRAFT' ? 'approved' : 'a draft'}.`)
              }}
            />
            <MenuItem label="Delete" icon={<Trash2 />} danger separatorBefore onClick={() => setConfirmDelete(r)} />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit forecast — ${editing.productCode} ${editing.period}` : 'New forecast line'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Add forecast'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Product"
            required
            containerClassName="sm:col-span-2"
            value={form.productCode}
            error={errors.productCode}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
            options={[{ value: '', label: 'Select a product…' }, ...products.rows.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <Input label="Period" type="month" required value={form.period} error={errors.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
          <Select label="Market" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value as ForecastLine['market'] })} options={(['DOMESTIC', 'EXPORT', 'OEM'] as const).map((m) => ({ value: m, label: m.toLowerCase() }))} />
          <Select label="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as ForecastMethod })} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          <Input label="Confidence (%)" type="number" value={form.confidencePct} error={errors.confidencePct} hint="Below 60% the line is flagged for review." onChange={(e) => setForm({ ...form, confidencePct: e.target.value })} />
          <Input
            label="Base quantity"
            type="number"
            required
            value={form.baseQty}
            error={errors.baseQty}
            hint="The comparable prior period, or the number the method starts from."
            onChange={(e) => setForm({ ...form, baseQty: e.target.value })}
          />
          <Input label="Factor (%)" type="number" value={form.factorPct} hint="Growth or seasonal uplift applied to the base." onChange={(e) => setForm({ ...form, factorPct: e.target.value })} />
          <Textarea label="Remarks" containerClassName="sm:col-span-2" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>

        <Alert tone="info" className="mt-4">
          {Number(form.baseQty || 0).toLocaleString('en-IN')} × ({form.factorPct || 0}% applied) ={' '}
          <span className="font-semibold text-fg">{derived.toLocaleString('en-IN')}</span> units forecast. The base and
          the factor are stored, not just the answer, so the number can be challenged.
        </Alert>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete forecast line"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${confirmDelete.productCode} ${confirmDelete.period} was soft-deleted.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.productCode} {confirmDelete?.period} will be marked deleted, not physically removed — the
          accuracy history stays intact.
        </p>
      </Modal>
    </div>
  )
}
