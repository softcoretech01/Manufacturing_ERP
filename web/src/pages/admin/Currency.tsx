import { useState } from 'react'
import { Coins, Download, Plus, RefreshCw } from 'lucide-react'
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
import { currencies, exchangeRates } from '@/mock/data'
import type { Currency, ExchangeRate } from '@/types'

export function CurrencyPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'currency-exchange-rates', 'Currency & exchange rates', columnsFromTable(rateColumns), exchangeRates)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('rates')
  const [open, setOpen] = useState(false)

  const currencyColumns: Column<Currency>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (c) => <span className="font-mono text-xs font-medium">{c.code}</span> },
    { key: 'name', header: 'Currency', sortable: true },
    { key: 'symbol', header: 'Symbol', width: '80px', render: (c) => <span className="text-base">{c.symbol}</span> },
    { key: 'decimals', header: 'Decimals', align: 'right', width: '90px' },
    { key: 'isBase', header: '', width: '100px', accessor: (c) => (c.isBase ? 1 : 0), render: (c) => (c.isBase ? <Badge tone="brand" size="sm">Base</Badge> : null) },
  ]

  const rateColumns: Column<ExchangeRate>[] = [
    { key: 'pair', header: 'Pair', accessor: (r) => `${r.from}/${r.to}`, width: '110px', render: (r) => <span className="font-mono text-xs font-medium">{r.from} → {r.to}</span> },
    {
      key: 'rateType',
      header: 'Rate type',
      sortable: true,
      width: '120px',
      render: (r) => (
        <Badge tone={r.rateType === 'CUSTOMS' ? 'warning' : 'neutral'} size="sm" dot={false}>
          {r.rateType.toLowerCase()}
        </Badge>
      ),
    },
    { key: 'rate', header: 'Rate', align: 'right', sortable: true, width: '130px', render: (r) => <span className="font-mono text-xs">{r.rate.toFixed(4)}</span> },
    { key: 'effectiveDate', header: 'Effective', sortable: true, width: '130px', render: (r) => formatDate(r.effectiveDate) },
    { key: 'source', header: 'Source', render: (r) => <span className="text-xs text-fg-muted">{r.source}</span> },
  ]

  const trend = Array.from({ length: 20 }, (_, i) => ({
    d: `${i + 9} Jul`,
    usd: 87.4 + Math.sin(i / 3) * 0.9 + i * 0.03,
    eur: 94.2 + Math.cos(i / 4) * 1.1 + i * 0.04,
  }))

  return (
    <div>
      <PageHeader
        title="Currency & exchange rates"
        description="Rates are maintained per pair, per date, per rate type. A missing rate blocks the transaction rather than silently defaulting to 1."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Currency & rates' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => toast.success('Rates imported', '6 rates updated from the RBI reference feed.')}>
              Import today's rates
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Add rate</Button>
          </>
        }
        tabs={<Tabs active={tab} onChange={setTab} tabs={[{ id: 'rates', label: 'Exchange rates', count: exchangeRates.length }, { id: 'currencies', label: 'Currencies', count: currencies.length }, { id: 'trend', label: 'Rate history' }]} />}
      />

      <Alert tone="info" className="mb-4" title="Why the customs rate is separate">
        Indian import duty is computed on a rate notified by CBIC, not on the market rate. The system
        keeps <span className="font-mono">CUSTOMS</span> as a distinct rate type so import costing uses
        the correct figure and does not drift with the market.
      </Alert>

      {tab === 'rates' && (
        <DataTable
          rows={exchangeRates}
          columns={rateColumns}
          rowKey={(r) => r.uid}
          searchPlaceholder="Currency pair or source…"
          onExport={doExport}
        />
      )}

      {tab === 'currencies' && (
        <DataTable rows={currencies} columns={currencyColumns} rowKey={(c) => c.code} searchPlaceholder="Currency code or name…" />
      )}

      {tab === 'trend' && (
        <Card>
          <CardHeader title="Rate history" description="Average rate against INR, last 20 days" />
          <CardBody className="h-80 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 6, fontSize: 11 }}
                  formatter={(v: number) => [`₹${v.toFixed(4)}`, '']}
                />
                <Line type="monotone" dataKey="usd" name="USD/INR" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="eur" name="EUR/INR" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add exchange rate"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { toast.success('Rate added'); setOpen(false) }}>Add rate</Button></>}>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Select label="From currency" required defaultValue="USD" options={currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} />
            <Select label="To currency" required defaultValue="INR" options={currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} />
          </div>
          <Select label="Rate type" required defaultValue="AVERAGE"
            options={[{ value: 'AVERAGE', label: 'Average — general transactions' }, { value: 'BUYING', label: 'Buying — bank buying rate' }, { value: 'SELLING', label: 'Selling — bank selling rate' }, { value: 'CUSTOMS', label: 'Customs — CBIC notified rate for import duty' }]} />
          <Input label="Rate" type="number" step="0.00000001" required placeholder="88.42000000" hint="Stored to 8 decimal places." />
          <Input label="Effective date" type="date" required />
          <Input label="Source" placeholder="RBI reference / HDFC Bank / CBIC notification" />
          <Alert tone="info">
            Rate lookup resolves to the latest rate on or before the document date. If none exists, the
            transaction is blocked with a clear message.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
