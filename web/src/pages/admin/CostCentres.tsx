import { useState } from 'react'
import { Coins, Plus, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/format'
import { costCentres, users } from '@/mock/data'
import type { CostCentre } from '@/types'

export function CostCentresPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'cost-centres', 'Cost centres', columnsFromTable(columns), costCentres)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('list')
  const [open, setOpen] = useState(false)
  const [postable, setPostable] = useState(true)

  const totalBudget = costCentres.reduce((s, c) => s + (c.isPostable ? c.budget : 0), 0)
  const totalActual = costCentres.reduce((s, c) => s + (c.isPostable ? c.actual : 0), 0)

  const columns: Column<CostCentre>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      width: '120px',
      render: (c) => (
        <span className={c.parentUid ? 'pl-4 font-mono text-xs' : 'font-mono text-xs font-medium'}>{c.code}</span>
      ),
    },
    { key: 'name', header: 'Cost centre', sortable: true, render: (c) => <span className={c.parentUid ? 'text-fg-muted' : 'font-medium text-fg'}>{c.name}</span> },
    { key: 'type', header: 'Type', sortable: true, width: '120px', render: (c) => <Badge tone="neutral" size="sm" dot={false}>{c.type.toLowerCase()}</Badge> },
    { key: 'owner', header: 'Owner', width: '140px' },
    { key: 'budget', header: 'Budget', align: 'right', sortable: true, width: '120px', render: (c) => formatCurrency(c.budget) },
    { key: 'actual', header: 'Actual', align: 'right', sortable: true, width: '120px', render: (c) => formatCurrency(c.actual) },
    {
      key: 'variance',
      header: 'Variance',
      align: 'right',
      width: '110px',
      accessor: (c) => c.budget - c.actual,
      render: (c) => {
        const v = c.budget - c.actual
        return <span className={v < 0 ? 'font-medium text-danger tabular' : 'text-success tabular'}>{formatCurrency(v)}</span>
      },
    },
    {
      key: 'utilisation',
      header: 'Utilisation',
      width: '150px',
      accessor: (c) => (c.budget ? (c.actual / c.budget) * 100 : 0),
      render: (c) => {
        const pct = c.budget ? (c.actual / c.budget) * 100 : 0
        return <ProgressBar value={pct} showLabel tone={pct > 95 ? 'danger' : pct > 85 ? 'warning' : 'success'} />
      },
    },
    {
      key: 'isPostable',
      header: 'Postable',
      align: 'center',
      width: '90px',
      accessor: (c) => (c.isPostable ? 1 : 0),
      render: (c) => (c.isPostable ? <Badge tone="success" size="sm">Yes</Badge> : <Badge tone="neutral" size="sm">Roll-up</Badge>),
    },
  ]

  const chartData = costCentres
    .filter((c) => c.isPostable)
    .map((c) => ({ name: c.code.replace('CC-', ''), budget: Math.round(c.budget / 100000), actual: Math.round(c.actual / 100000), pct: (c.actual / c.budget) * 100 }))

  return (
    <div>
      <PageHeader
        title="Cost centres"
        description="Where cost is incurred. Every cost-bearing transaction line is assignable to a cost centre, defaulting from the department, warehouse or item category in that order."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Cost centres' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New cost centre</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[{ id: 'list', label: 'Cost centres', count: costCentres.length }, { id: 'budget', label: 'Budget vs actual' }]} />}
      />

      {costCentres.some((c) => c.isPostable && c.actual / c.budget > 0.9) && (
        <Alert tone="warning" className="mb-4" title="Cost centres approaching budget">
          {costCentres.filter((c) => c.isPostable && c.actual / c.budget > 0.9).map((c) => `${c.code} (${Math.round((c.actual / c.budget) * 100)}%)`).join(', ')} —
          approvers see this consumption in their decision context before authorising further spend.
        </Alert>
      )}

      {tab === 'list' && (
        <DataTable
          rows={costCentres}
          columns={columns}
          rowKey={(c) => c.uid}
          searchPlaceholder="Code, name or owner…"
          onExport={doExport}
          pageSize={20}
          rowActions={(c) => (
            <>
              <MenuItem label="Edit" onClick={() => toast.info('Edit cost centre', `${c.code} — ${c.name}.`)} />
              <MenuItem label="View postings" onClick={() => toast.info('View postings', `Ledger postings booked against ${c.code}.`)} />
              <MenuItem label="Budget history" onClick={() => toast.info('Budget history', `Budget revisions for ${c.code} across financial years.`)} />
              <MenuItem label="Deactivate" danger disabled={c.actual > 0} onClick={() => toast.success('Cost centre deactivated', `${c.code} can no longer receive postings.`)} />
            </>
          )}
        />
      )}

      {tab === 'budget' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Budget vs actual by cost centre" description="₹ lakh, FY26-27 to date" />
            <CardBody className="h-80 pl-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 6, fontSize: 11 }}
                    formatter={(v: number) => [`₹${v} L`, '']}
                  />
                  <Bar dataKey="budget" name="Budget" fill="rgb(var(--border-strong))" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} maxBarSize={26}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.pct > 95 ? '#ef4444' : d.pct > 85 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Utilisation ranking" />
            <CardBody className="space-y-3">
              {[...costCentres].filter((c) => c.isPostable).sort((a, b) => b.actual / b.budget - a.actual / a.budget).map((c) => {
                const pct = (c.actual / c.budget) * 100
                return (
                  <div key={c.uid}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-fg-subtle">{c.code}</span>
                        <span className="text-fg">{c.name}</span>
                        <span className="text-fg-subtle">· {c.owner}</span>
                      </span>
                      <span className="shrink-0 text-fg-muted tabular">
                        {formatCurrency(c.actual)} / {formatCurrency(c.budget)}
                      </span>
                    </div>
                    <ProgressBar value={pct} showLabel tone={pct > 95 ? 'danger' : pct > 85 ? 'warning' : 'success'} />
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New cost centre"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { toast.success('Cost centre created'); setOpen(false) }}>Create</Button></>}>
        <div className="space-y-3.5">
          <Input label="Code" required placeholder="CC-TOOL" />
          <Input label="Name" required placeholder="Tool Room" />
          <Select label="Type" required options={['PRODUCTION', 'SERVICE', 'ADMIN', 'SALES', 'QUALITY', 'MAINTENANCE', 'UTILITY'].map((v) => ({ value: v, label: v }))} />
          <Select label="Parent cost centre" options={[{ value: '', label: '— top level —' }, ...costCentres.filter((c) => !c.isPostable).map((c) => ({ value: c.uid, label: `${c.code} — ${c.name}` }))]}
            hint="Hierarchies must not contain cycles — this is validated on save." />
          <Select label="Owner" options={users.filter((u) => u.status === 'ACTIVE').map((u) => ({ value: u.uid, label: u.fullName }))} />
          <Input label="Annual budget (₹)" type="number" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valid from" type="date" />
            <Input label="Valid to" type="date" hint="Blank = perpetual" />
          </div>
          <Switch checked={postable} onChange={setPostable} label="Postable — transactions may be booked directly here" />
        </div>
      </Modal>
    </div>
  )
}
