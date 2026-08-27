import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Copy,
  Database,
  FileSpreadsheet,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { SearchInput } from '@/components/ui/Input'
import { formatTimeAgo } from '@/lib/format'
import { cn } from '@/lib/cn'
import { SIMPLE_MASTERS } from '@/mock/masterRegistry'
import { customers, duplicateCandidates, employees, importRuns, items, machines, suppliers } from '@/mock/masters'

/** The masters that have a purpose-built screen rather than the generic one. */
const RICH_MASTERS = [
  { code: 'SUPPLIER', title: 'Suppliers', route: '/masters/supplier', category: 'Business Partner', count: suppliers.length, pending: suppliers.filter((s) => s.status !== 'ACTIVE' && s.status !== 'INACTIVE').length },
  { code: 'CUSTOMER', title: 'Customers', route: '/masters/customer', category: 'Business Partner', count: customers.length, pending: customers.filter((c) => c.status !== 'ACTIVE' && c.status !== 'INACTIVE').length },
  { code: 'ITEM', title: 'Items / Products', route: '/masters/item', category: 'Product', count: items.length, pending: items.filter((i) => i.status !== 'ACTIVE' && i.status !== 'INACTIVE').length },
  { code: 'EMPLOYEE', title: 'Employees', route: '/masters/employee', category: 'HR', count: employees.length, pending: employees.filter((e) => e.status !== 'ACTIVE' && e.status !== 'INACTIVE').length },
  { code: 'MACHINE', title: 'Machines', route: '/masters/machine', category: 'Production', count: machines.length, pending: machines.filter((m) => m.status !== 'ACTIVE' && m.status !== 'INACTIVE').length },
]

const CATEGORY_ORDER = ['Business Partner', 'Product', 'Raw Material', 'Production', 'Quality', 'HR', 'Finance & Tax', 'Reference', 'Geography']

export function MasterOverviewPage() {
  const [tab, setTab] = useState('dashboard')
  const [q, setQ] = useState('')

  const all = useMemo(() => {
    const simple = SIMPLE_MASTERS.map((m) => ({
      code: m.code,
      title: m.title,
      route: m.route,
      category: m.category,
      count: m.rows.length,
      pending: m.rows.filter((r) => r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL' || r.status === 'SUBMITTED').length,
      rich: false,
      approval: m.requiresApproval,
    }))
    const rich = RICH_MASTERS.map((m) => ({ ...m, rich: true, approval: true }))
    return [...rich, ...simple]
  }, [])

  const filtered = all.filter(
    (m) => !q || m.title.toLowerCase().includes(q.toLowerCase()) || m.code.toLowerCase().includes(q.toLowerCase()),
  )

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const m of filtered) {
      const list = map.get(m.category) ?? []
      list.push(m)
      map.set(m.category, list)
    }
    return [...map.entries()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 99) % 100 - ((CATEGORY_ORDER.indexOf(b[0]) + 99) % 100),
    )
  }, [filtered])

  const totalRecords = all.reduce((s, m) => s + m.count, 0)
  const totalPending = all.reduce((s, m) => s + m.pending, 0)
  const openDuplicates = duplicateCandidates.filter((d) => d.status === 'OPEN')
  const openImports = importRuns.filter((r) => r.status === 'DRY_RUN_COMPLETE' || r.status === 'VALIDATING')

  const byCategory = CATEGORY_ORDER.map((c) => ({
    name: c,
    value: all.filter((m) => m.category === c).reduce((s, m) => s + m.count, 0),
  })).filter((d) => d.value > 0)

  const PIE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#64748b']

  /** Data-quality signals worth acting on rather than a vanity score. */
  const quality = [
    { label: 'Suppliers with an expired compliance document', value: suppliers.filter((s) => s.complianceDocs.some((d) => d.status === 'EXPIRED')).length, tone: 'danger' as const, to: '/masters/supplier' },
    { label: 'Suppliers with a document expiring in 45 days', value: suppliers.filter((s) => s.complianceDocs.some((d) => d.status === 'EXPIRING')).length, tone: 'warning' as const, to: '/masters/supplier' },
    { label: 'Customers over their credit limit', value: customers.filter((c) => c.creditUsed > c.creditLimit).length, tone: 'danger' as const, to: '/masters/customer' },
    { label: 'Sellable items with no selling price', value: items.filter((i) => i.isSold && i.sellingPrice === 0).length, tone: 'warning' as const, to: '/masters/item' },
    { label: 'Items with no reorder level set', value: items.filter((i) => i.isPurchased && !i.reorderLevel).length, tone: 'warning' as const, to: '/masters/item' },
    { label: 'Machines past their preventive maintenance date', value: machines.filter((m) => m.nextPmOn && new Date(m.nextPmOn) < new Date()).length, tone: 'danger' as const, to: '/masters/machine' },
    { label: 'Unverified bank accounts on active partners', value: suppliers.filter((s) => s.bankAccounts.some((b) => !b.isVerified)).length, tone: 'warning' as const, to: '/masters/supplier' },
    { label: 'Open duplicate candidates', value: openDuplicates.length, tone: 'warning' as const, to: '/masters/duplicates' },
  ].filter((q) => q.value > 0)

  return (
    <div>




      {tab === 'catalogue' && (
        <div className="space-y-4">
          <SearchInput
            placeholder="Search masters…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="max-w-md"
          />

          {grouped.map(([category, masters]) => (
            <Card key={category}>
              <CardHeader
                title={category}
                description={`${masters.length} masters · ${masters.reduce((s, m) => s + m.count, 0).toLocaleString('en-IN')} records`}
              />
              <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {masters.map((m) => (
                  <Link
                    key={m.code}
                    to={m.route}
                    className="group rounded border border-border p-3 transition-colors hover:border-brand-500/50 hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium text-fg group-hover:text-brand-600">{m.title}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    </div>
                    <p className="mt-0.5 font-mono text-2xs text-fg-subtle">{m.code}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-fg tabular">{m.count.toLocaleString('en-IN')}</span>
                      <span className="text-2xs text-fg-subtle">records</span>
                      {m.pending > 0 && <Badge tone="warning" size="sm" dot={false}>{m.pending} pending</Badge>}
                      {m.rich && <Badge tone="brand" size="sm" dot={false}>full screen</Badge>}
                      {!m.rich && m.approval && <Badge tone="progress" size="sm" dot={false}>approval</Badge>}
                    </div>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-brand/10 p-2 text-brand"><Database className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Total Records</p>
                    <p className="text-xl font-semibold text-fg tabular">{totalRecords.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-warning/10 p-2 text-warning"><ClipboardCheck className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Pending Approvals</p>
                    <p className="text-xl font-semibold text-fg tabular">{totalPending.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-danger/10 p-2 text-danger"><AlertTriangle className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Quality Exceptions</p>
                    <p className="text-xl font-semibold text-fg tabular">{quality.length}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-progress/10 p-2 text-progress"><Copy className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Open Duplicates</p>
                    <p className="text-xl font-semibold text-fg tabular">{openDuplicates.length}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
            <CardHeader
              title="Data quality exceptions"
              description="Specific, actionable problems — not a score. A score tells you something is wrong; this tells you what."
            />
            <CardBody className="space-y-2">
              {quality.length === 0 && (
                <p className="py-6 text-center text-sm text-fg-muted">
                  No data-quality exceptions outstanding.
                </p>
              )}
              {quality.map((qq) => (
                <Link
                  key={qq.label}
                  to={qq.to}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded border p-3 transition-colors hover:bg-surface-2',
                    qq.tone === 'danger' ? 'border-danger/30 bg-danger/[0.03]' : 'border-warning/30 bg-warning/[0.03]',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <AlertTriangle className={cn('h-4 w-4 shrink-0', qq.tone === 'danger' ? 'text-danger' : 'text-warning')} />
                    <span className="truncate text-sm text-fg">{qq.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={cn('text-sm font-semibold tabular', qq.tone === 'danger' ? 'text-danger' : 'text-warning')}>
                      {qq.value}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-fg-subtle" />
                  </span>
                </Link>
              ))}
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Records by category" />
              <CardBody className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={78} paddingAngle={2}>
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={PIE[i % PIE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 6, fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Completeness by master" description="Mandatory fields populated" />
              <CardBody className="space-y-2.5">
                {[
                  ['Supplier', 94],
                  ['Customer', 88],
                  ['Item', 91],
                  ['Employee', 97],
                  ['Machine', 82],
                ].map(([label, pct]) => (
                  <div key={label as string}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="text-fg-muted">{label as string}</span>
                      <span className="text-fg tabular">{pct as number}%</span>
                    </div>
                    <ProgressBar value={pct as number} tone={(pct as number) >= 95 ? 'success' : (pct as number) >= 85 ? 'warning' : 'danger'} />
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Recent imports" description="Nothing commits until the dry run is accepted" />
            <CardBody className="space-y-2">
              {importRuns.map((r) => (
                <Link key={r.uid} to="/masters/import" className="block rounded border border-border p-3 transition-colors hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-fg">{r.fileName}</span>
                    <Badge
                      tone={r.status === 'COMMITTED' ? 'success' : r.status === 'FAILED' ? 'danger' : 'pending'}
                      size="sm"
                    >
                      {r.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-2xs text-fg-subtle">
                    {r.masterName} · {r.rowsTotal} rows · {r.startedBy} · {formatTimeAgo(r.startedAt)}
                  </p>
                  {r.rowsError > 0 && (
                    <p className="mt-1 text-2xs text-danger">
                      {r.rowsError} error row{r.rowsError > 1 ? 's' : ''}
                      {r.rowsWarning > 0 && `, ${r.rowsWarning} warning${r.rowsWarning > 1 ? 's' : ''}`}
                    </p>
                  )}
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Governance"
              description="What the framework guarantees on every master"
            />
            <CardBody className="space-y-2.5">
              {[
                ['Soft delete only', 'No master row is ever physically removed. Deletion sets a stamp and the record disappears from selection, not from history.'],
                ['Effective dating', 'A record is valid for a window. Documents resolve the version that applied on their own date, not today’s.'],
                ['Revision with diff', 'An approved master is versioned rather than edited. Every revision keeps its own before-and-after.'],
                ['Where-used enforcement', 'Deactivation is blocked while an open transaction references the record. The check runs server-side.'],
                ['Duplicate detection', 'Configurable match fields warn before saving and feed the duplicate review queue.'],
                ['Import with dry run', 'Every import validates first and reports row-level errors. Nothing is written until the result is accepted.'],
              ].map(([t, d]) => (
                <div key={t} className="flex items-start gap-2.5 rounded border border-border p-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div>
                    <p className="text-xs font-medium text-fg">{t}</p>
                    <p className="mt-0.5 text-2xs text-fg-muted">{d}</p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
