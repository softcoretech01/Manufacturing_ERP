import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { Currency, ExchangeRate } from '@/api/organisation'
import { useCompanies, useCurrencies, useExchangeRates, useCreateExchangeRate } from '@/hooks/useOrganisation'

/** Wired to the live FastAPI backend. Currencies are seeded reference data (read
 * only); exchange rates are maintained per pair / date / rate type. */

const RATE_TYPES = [
  { value: 'AVERAGE', label: 'Average — general transactions' },
  { value: 'BUYING', label: 'Buying — bank buying rate' },
  { value: 'SELLING', label: 'Selling — bank selling rate' },
  { value: 'CUSTOMS', label: 'Customs — CBIC notified rate for import duty' },
]

const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6']

export function CurrencyPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const currenciesQ = useCurrencies()
  const ratesQ = useExchangeRates({ page_size: 200 })
  const { data: companyPage } = useCompanies({ page_size: 5 })

  const currencyList = currenciesQ.data ?? []
  const rates = ratesQ.data?.data ?? []
  const baseCode = companyPage?.data?.[0]?.base_currency_code ?? 'INR'

  const [tab, setTab] = useState('rates')
  const [open, setOpen] = useState(false)

  const currencyColumns: Column<Currency>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (c) => <span className="font-mono text-xs font-medium">{c.code}</span> },
    { key: 'name', header: 'Currency', sortable: true },
    { key: 'symbol', header: 'Symbol', width: '80px', render: (c) => <span className="text-base">{c.symbol ?? '—'}</span> },
    { key: 'decimal_places', header: 'Decimals', align: 'right', width: '90px' },
    { key: 'use_indian_format', header: 'Format', width: '110px', accessor: (c) => (c.use_indian_format ? 1 : 0), render: (c) => <span className="text-xs text-fg-muted">{c.use_indian_format ? 'Indian (1,23,456)' : 'International'}</span> },
    { key: 'code_base', header: '', width: '90px', accessor: (c) => (c.code === baseCode ? 1 : 0), render: (c) => (c.code === baseCode ? <Badge tone="brand" size="sm">Base</Badge> : null) },
  ]

  const rateColumns: Column<ExchangeRate>[] = [
    { key: 'pair', header: 'Pair', accessor: (r) => `${r.from_currency_code}/${r.to_currency_code}`, width: '130px', render: (r) => <span className="font-mono text-xs font-medium">{r.from_currency_code} → {r.to_currency_code}</span> },
    { key: 'rate_type', header: 'Rate type', sortable: true, width: '120px', render: (r) => <Badge tone={r.rate_type === 'CUSTOMS' ? 'warning' : 'neutral'} size="sm" dot={false}>{r.rate_type.toLowerCase()}</Badge> },
    { key: 'rate', header: 'Rate', align: 'right', sortable: true, width: '150px', render: (r) => <span className="font-mono text-xs">{Number(r.rate).toFixed(6)}</span> },
    { key: 'effective_date', header: 'Effective', sortable: true, width: '130px', render: (r) => formatDate(r.effective_date) },
    { key: 'source', header: 'Source', render: (r) => <span className="text-xs text-fg-muted">{r.source ?? '—'}</span> },
  ]

  // Real rate history: pivot the stored rates into one line per pair over time.
  const { trendData, pairs } = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    const pairSet = new Set<string>()
    for (const r of rates) {
      const pair = `${r.from_currency_code}/${r.to_currency_code}`
      pairSet.add(pair)
      const row = byDate.get(r.effective_date) ?? { d: r.effective_date }
      row[pair] = Number(r.rate)
      byDate.set(r.effective_date, row)
    }
    const data = [...byDate.values()].sort((a, b) => String(a.d).localeCompare(String(b.d)))
    return { trendData: data, pairs: [...pairSet] }
  }, [rates])

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'exchange-rates', 'Exchange rates', columnsFromTable(rateColumns), rates)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Currency & exchange rates"
        description="Rates are maintained per pair, per date, per rate type. A missing rate blocks the transaction rather than silently defaulting to 1."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Currency & rates' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Add rate</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[{ id: 'rates', label: 'Exchange rates', count: rates.length }, { id: 'currencies', label: 'Currencies', count: currencyList.length }, { id: 'trend', label: 'Rate history' }]} />}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {(currenciesQ.error || ratesQ.error) && (
        <Alert tone="danger" title="Could not load currency data">
          {(currenciesQ.error ?? ratesQ.error) instanceof ProblemError ? (currenciesQ.error as ProblemError).problem?.detail : 'Is the backend running?'}
        </Alert>
      )}

      <Alert tone="info" className="mb-4" title="Why the customs rate is separate">
        Indian import duty is computed on a rate notified by CBIC, not the market rate. The system keeps{' '}
        <span className="font-mono">CUSTOMS</span> as a distinct rate type so import costing uses the correct
        figure and does not drift with the market.
      </Alert>

      {tab === 'rates' && (
        <DataTable
          rows={rates}
          columns={rateColumns}
          rowKey={(r) => r.uid}
          loading={ratesQ.isLoading}
          searchPlaceholder="Currency pair or source…"
          onExport={doExport}
          emptyTitle="No exchange rates yet"
          emptyDescription="Add a rate for a currency pair. Costing and valuation resolve to the latest rate on or before the document date."
          emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Add rate</Button>}
        />
      )}

      {tab === 'currencies' && (
        <DataTable rows={currencyList} columns={currencyColumns} rowKey={(c) => c.uid} loading={currenciesQ.isLoading} searchPlaceholder="Currency code or name…" />
      )}

      {tab === 'trend' && (
        <Card>
          <CardHeader title="Rate history" description={`Stored rates over time (${pairs.length} pair${pairs.length === 1 ? '' : 's'})`} />
          <CardBody className="h-80 pl-0">
            {trendData.length < 2 ? (
              <p className="flex h-full items-center justify-center px-4 text-center text-xs text-fg-subtle">
                Add at least two dated rates for a pair to see its history.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} tickFormatter={(d) => formatDate(String(d))} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={54} />
                  <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [Number(v).toFixed(6), '']} />
                  {pairs.map((pair, i) => (
                    <Line key={pair} type="monotone" dataKey={pair} name={pair} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      )}

      <AddRateModal open={open} onClose={() => setOpen(false)} currencies={currencyList} baseCode={baseCode} />
    </div>
  )
}

/* ─────────────────────────── Add rate modal ─────────────────────────── */
function AddRateModal({ open, onClose, currencies, baseCode }: { open: boolean; onClose: () => void; currencies: Currency[]; baseCode: string }) {
  const toast = useToast()
  const createRate = useCreateExchangeRate()
  const [form, setForm] = useState({ from_currency_code: 'USD', to_currency_code: baseCode, rate_type: 'AVERAGE', rate: '', effective_date: '', source: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  const opts = currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))

  function submit() {
    const e: Record<string, string> = {}
    if (form.from_currency_code === form.to_currency_code) e.to_currency_code = 'From and to currencies must differ.'
    if (!form.rate || Number(form.rate) <= 0) e.rate = 'Rate must be greater than 0.'
    if (!form.effective_date) e.effective_date = 'Effective date is required.'
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    createRate.mutate(
      {
        from_currency_code: form.from_currency_code,
        to_currency_code: form.to_currency_code,
        rate_type: form.rate_type,
        rate: Number(form.rate),
        effective_date: form.effective_date,
        source: form.source.trim() || null,
      },
      {
        onSuccess: (r) => { toast.success('Rate added', `${r.from_currency_code} → ${r.to_currency_code} @ ${Number(r.rate).toFixed(4)}`); onClose() },
        onError: (err) => {
          if (err instanceof ProblemError) {
            const fe: Record<string, string> = {}
            for (const x of err.problem.errors ?? []) fe[x.field] = x.message
            setErrors(fe)
            toast.error(err.problem.title || 'Failed', err.problem.detail)
          } else toast.error('Failed', 'Unknown error.')
        },
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add exchange rate"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} loading={createRate.isPending}>Add rate</Button></>}
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Select label="From currency" required value={form.from_currency_code} onChange={(e) => set({ from_currency_code: e.target.value })} options={opts} />
          <Select label="To currency" required value={form.to_currency_code} error={errors.to_currency_code} onChange={(e) => set({ to_currency_code: e.target.value })} options={opts} />
        </div>
        <Select label="Rate type" required value={form.rate_type} onChange={(e) => set({ rate_type: e.target.value })} options={RATE_TYPES} />
        <Input label="Rate" type="number" step="0.00000001" min={0} required value={form.rate} error={errors.rate}
          placeholder="88.42000000" hint="Stored to 8 decimal places." onChange={(e) => set({ rate: e.target.value })} />
        <Input label="Effective date" type="date" required value={form.effective_date} error={errors.effective_date} onChange={(e) => set({ effective_date: e.target.value })} />
        <Input label="Source" value={form.source} maxLength={50} placeholder="RBI reference / HDFC Bank / CBIC notification" onChange={(e) => set({ source: e.target.value })} />
        <Alert tone="info">
          Rate lookup resolves to the latest rate on or before the document date. If none exists, the
          transaction is blocked with a clear message — never defaulted to 1.
        </Alert>
      </div>
    </Modal>
  )
}
