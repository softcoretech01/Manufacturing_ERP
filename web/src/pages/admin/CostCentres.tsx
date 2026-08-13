import { useState, useEffect } from 'react'
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
import { users } from '@/mock/data'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function CostCentresPage() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState('list')
  const [open, setOpen] = useState(false)
  
  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState('PRODUCTION')
  const [parentId, setParentId] = useState<string>('')
  const [owner, setOwner] = useState('')
  const [budget, setBudget] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [postable, setPostable] = useState(true)

  const { data: costCentres = [] } = useQuery({
    queryKey: ['costCentres'],
    queryFn: api.getCostCentres,
  })

  const createMutation = useMutation({
    mutationFn: api.createCostCentre,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costCentres'] })
      toast.success('Cost centre created')
      setOpen(false)
    },
    onError: (err: any) => {
      toast.error('Failed to create cost centre', err.message)
    },
  })

  const { data: nextCodeData } = useQuery({
    queryKey: ['costCentresNextCode'],
    queryFn: api.getNextCostCentreCode,
    enabled: open
  })

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'cost-centres', 'Cost centres', columnsFromTable(columns), costCentres)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName('')
      setType('PRODUCTION')
      setParentId('')
      setOwner('')
      setBudget('')
      setValidFrom('')
      setValidTo('')
      setPostable(true)
    }
  }, [open])

  const totalBudget = costCentres.reduce((s: number, c: any) => s + (c.isPostable ? c.budget : 0), 0)
  const totalActual = costCentres.reduce((s: number, c: any) => s + (c.isPostable ? c.actual : 0), 0)

  const columns: Column<any>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      width: '120px',
      render: (c) => (
        <span className={c.parentId ? 'pl-4 font-mono text-xs' : 'font-mono text-xs font-medium'}>{c.code}</span>
      ),
    },
    { key: 'name', header: 'Cost centre', sortable: true, render: (c) => <span className={c.parentId ? 'text-fg-muted' : 'font-medium text-fg'}>{c.name}</span> },
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
    .filter((c: any) => c.isPostable)
    .map((c: any) => ({ name: c.code.replace('CC-', ''), budget: Math.round(c.budget / 100000), actual: Math.round(c.actual / 100000), pct: (c.actual / c.budget) * 100 }))

  const handleCreate = () => {
    if (!name || !type) {
      toast.error('Validation error', 'Name and type are required')
      return
    }
    createMutation.mutate({
      code: nextCodeData?.nextCode || 'CC-0001',
      name,
      type,
      parentId: parentId ? parseInt(parentId) : null,
      owner,
      budget: budget ? parseFloat(budget) : 0,
      actual: 0,
      validFrom: validFrom || null,
      validTo: validTo || null,
      isPostable: postable
    })
  }

  return (
    <div>
      <PageHeader
        title="Cost centres"
        description="Where cost is incurred. Every cost-bearing transaction line is assignable to a cost centre, defaulting from the department, warehouse or item category in that order."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Cost centres' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New cost centre</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[{ id: 'list', label: 'Cost centres', count: costCentres.length }, { id: 'budget', label: 'Budget vs actual' }]} />}
      />

      {costCentres.some((c: any) => c.isPostable && c.actual / c.budget > 0.9) && (
        <Alert tone="warning" className="mb-4" title="Cost centres approaching budget">
          {costCentres.filter((c: any) => c.isPostable && c.actual / c.budget > 0.9).map((c: any) => `${c.code} (${Math.round((c.actual / c.budget) * 100)}%)`).join(', ')} —
          approvers see this consumption in their decision context before authorising further spend.
        </Alert>
      )}

      {tab === 'list' && (
        <DataTable
          rows={costCentres}
          columns={columns}
          rowKey={(c) => c.id}
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
                    {chartData.map((d: any, i: number) => (
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
              {[...costCentres].filter((c: any) => c.isPostable).sort((a: any, b: any) => b.actual / b.budget - a.actual / a.budget).map((c: any) => {
                const pct = (c.actual / c.budget) * 100
                return (
                  <div key={c.id}>
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
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={createMutation.isPending} onClick={handleCreate}>Create</Button></>}>
        <div className="grid grid-cols-2 gap-3.5">
          <Input label="Code" required value={nextCodeData?.nextCode || 'Loading...'} disabled />
          <Input label="Name" required placeholder="Tool Room" value={name} onChange={e => setName(e.target.value)} />
          <Select label="Type" required value={type} onChange={e => setType(e.target.value)} options={['PRODUCTION', 'SERVICE', 'ADMIN', 'SALES', 'QUALITY', 'MAINTENANCE', 'UTILITY'].map((v) => ({ value: v, label: v }))} />
          <Select label="Parent cost centre" value={parentId} onChange={e => setParentId(e.target.value)} options={[{ value: '', label: '— top level —' }, ...costCentres.filter((c: any) => !c.isPostable).map((c: any) => ({ value: c.id.toString(), label: `${c.code} — ${c.name}` }))]}
            hint="Hierarchies must not contain cycles — this is validated on save." />
          <Select label="Owner" value={owner} onChange={e => setOwner(e.target.value)} options={users.filter((u) => u.status === 'ACTIVE').map((u) => ({ value: u.uid, label: u.fullName }))} />
          <Input label="Annual budget (₹)" type="number" value={budget} onChange={e => setBudget(e.target.value)} />
          <Input label="Valid from" type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
          <Input label="Valid to" type="date" hint="Blank = perpetual" value={validTo} onChange={e => setValidTo(e.target.value)} />
          <div className="col-span-2">
            <Switch checked={postable} onChange={setPostable} label="Postable — transactions may be booked directly here" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
