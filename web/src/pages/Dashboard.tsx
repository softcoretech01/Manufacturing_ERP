import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  Factory,
  GaugeCircle,
  KeyRound,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { formatCompact, formatCurrency, formatDate, formatTimeAgo } from '@/lib/format'
import { useCurrentUser, usePermissions } from '@/store/auth'
import { registrations, roles, users, warehouses } from '@/mock/data'
import { approvalTasks, auditEntries, backgroundJobs, licenseInfo } from '@/mock/data2'
import { cn } from '@/lib/cn'

const CHART_COLOURS = ['#2F5BFF', '#10B981', '#F59E0B', '#E53935', '#5B3DF5', '#0EA5E9']

export function DashboardPage() {
  const user = useCurrentUser()
  const { roles: heldRoles, allowed } = usePermissions()
  const [range, setRange] = useState('30d')

  const pending = approvalTasks.filter((t) => t.status === 'PENDING')
  const overdue = pending.filter((t) => t.isOverdue)
  const activeUsers = users.filter((u) => u.status === 'ACTIVE').length
  const runningJobs = backgroundJobs.filter((j) => j.status === 'RUNNING').length
  const failedJobs = backgroundJobs.filter((j) => j.status === 'FAILED')

  const expiringRegs = registrations
    .filter((r) => r.validTo)
    .map((r) => ({ ...r, days: Math.ceil((new Date(r.validTo!).getTime() - Date.now()) / 86_400_000) }))
    .filter((r) => r.days <= 90)
    .sort((a, b) => a.days - b.days)

  const approvalTrend = [
    { day: 'Mon', raised: 18, approved: 14, overdue: 2 },
    { day: 'Tue', raised: 24, approved: 21, overdue: 3 },
    { day: 'Wed', raised: 16, approved: 18, overdue: 1 },
    { day: 'Thu', raised: 29, approved: 22, overdue: 4 },
    { day: 'Fri', raised: 31, approved: 27, overdue: 3 },
    { day: 'Sat', raised: 12, approved: 11, overdue: 1 },
    { day: 'Sun', raised: 4, approved: 4, overdue: 0 },
  ]

  const roleDistribution = roles
    .filter((r) => r.userCount > 0)
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, 6)
    .map((r) => ({ name: r.code, value: r.userCount }))

  return (
    <div>
      <PageHeader
        title={`Good ${greeting()}, ${user?.fullName.split(' ')[0] ?? 'there'}`}
        description={
          <>
            {heldRoles.map((r) => r.name).join(' · ')} — {allowed.size} effective permissions
          </>
        }
        actions={
          <Tabs
            variant="pill"
            tabs={[
              { id: '7d', label: '7 days' },
              { id: '30d', label: '30 days' },
              { id: '90d', label: '90 days' },
            ]}
            active={range}
            onChange={setRange}
          />
        }
      />

      {/* ── Critical alerts ────────────────────────────────────────────── */}
      {(overdue.length > 0 || failedJobs.length > 0 || expiringRegs.some((r) => r.days <= 30)) && (
        <div className="mb-4 grid gap-2 lg:grid-cols-3">
          {overdue.length > 0 && (
            <Alert tone="danger" title={`${overdue.length} approvals overdue`}
              action={<Link to="/workflow/inbox"><Button size="xs" variant="danger">Review</Button></Link>}>
              Oldest is {overdue[0].documentNo}, {Math.abs(Math.round((Date.now() - new Date(overdue[0].dueAt).getTime()) / 86_400_000))} days past SLA.
            </Alert>
          )}
          {expiringRegs.some((r) => r.days <= 30) && (
            <Alert tone="warning" title="Statutory registration expiring"
              action={<Link to="/admin/company"><Button size="xs" variant="outline">Open</Button></Link>}>
              {expiringRegs[0].type.replace(/_/g, ' ')} expires in {expiringRegs[0].days} days.
            </Alert>
          )}
          {failedJobs.length > 0 && (
            <Alert tone="danger" title={`${failedJobs.length} background job failed`}
              action={<Link to="/admin/jobs"><Button size="xs" variant="outline">Diagnose</Button></Link>}>
              {failedJobs[0].label} — {failedJobs[0].message}
            </Alert>
          )}
        </div>
      )}

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Pending approvals" value={pending.length}
          sub={`${overdue.length} overdue`} tone={overdue.length ? 'danger' : 'pending'}
          icon={<ClipboardCheck />} delta={{ value: -12.4, label: 'vs last week' }}
        />
        <StatTile label="Active users" value={activeUsers} sub={`of ${users.length} total`} tone="brand" icon={<Users />} />
        <StatTile
          label="Stock value" value={formatCompact(warehouses.reduce((s, w) => s + w.stockValue, 0))}
          sub="all warehouses" tone="success" icon={<Boxes />} delta={{ value: 4.8, label: 'MoM' }}
        />
        <StatTile label="Running jobs" value={runningJobs} sub={`${failedJobs.length} failed`} tone={failedJobs.length ? 'warning' : 'neutral'} icon={<GaugeCircle />} />
        <StatTile label="Audit entries today" value={auditEntries.filter((a) => new Date(a.at).toDateString() === new Date().toDateString()).length} sub="all modules" tone="neutral" icon={<ScrollText />} />
        <StatTile
          label="Licence usage" value={`${Math.round((licenseInfo.usedUsers / licenseInfo.namedUsers) * 100)}%`}
          sub={`${licenseInfo.usedUsers} of ${licenseInfo.namedUsers} users`} tone="brand" icon={<KeyRound />}
        />
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Approval throughput"
            description="Documents raised vs approved, with SLA breaches"
            icon={<Activity className="h-4 w-4" />}
            actions={<Button variant="ghost" size="xs" iconRight={<ArrowUpRight className="h-3 w-3" />}>Report</Button>}
          />
          <CardBody className="h-64 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={approvalTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="raised" name="Raised" fill="#2F5BFF" radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="approved" name="Approved" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="overdue" name="SLA breach" fill="#E53935" radius={[3, 3, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Users by role" description="Top 6 roles by headcount" icon={<ShieldCheck className="h-4 w-4" />} />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={roleDistribution} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={44} outerRadius={72} paddingAngle={2}>
                  {roleDistribution.map((_, i) => (
                    <Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* ── Work queues ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="My approval queue"
            description={`${pending.length} awaiting your decision`}
            icon={<ClipboardCheck className="h-4 w-4" />}
            actions={<Link to="/workflow/inbox"><Button variant="ghost" size="xs" iconRight={<ArrowUpRight className="h-3 w-3" />}>Open inbox</Button></Link>}
          />
          <div className="divide-y divide-border">
            {pending.slice(0, 5).map((t) => (
              <Link key={t.uid} to="/workflow/inbox" className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', t.isOverdue ? 'bg-danger' : 'bg-pending')} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs font-medium text-fg">{t.documentNo}</span>
                    <span className="text-2xs text-fg-subtle">
                      L{t.levelNo} of {t.totalLevels} · {t.levelName}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{t.subject}</p>
                  {t.warnings.length > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-2xs text-warning">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {t.warnings[0]}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {t.amount !== null && (
                    <p className="text-xs font-medium text-fg tabular">{formatCurrency(t.amount)}</p>
                  )}
                  <p className={cn('mt-0.5 text-2xs', t.isOverdue ? 'font-medium text-danger' : 'text-fg-subtle')}>
                    {t.isOverdue ? 'Overdue' : `Due ${formatDate(t.dueAt)}`}
                  </p>
                </div>
              </Link>
            ))}
            {pending.length === 0 && (
              <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="Inbox zero" description="Nothing is waiting on you." />
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Compliance watch" description="Registrations expiring in 90 days" icon={<ShieldCheck className="h-4 w-4" />} />
            <div className="divide-y divide-border">
              {expiringRegs.slice(0, 5).map((r) => (
                <div key={r.uid} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-fg">{r.type.replace(/_/g, ' ')}</p>
                    <p className="truncate font-mono text-[10px] text-fg-subtle">{r.number}</p>
                  </div>
                  <Badge tone={r.days <= 7 ? 'danger' : r.days <= 30 ? 'warning' : 'pending'} size="sm">
                    {r.days}d
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="System health" icon={<Database className="h-4 w-4" />} />
            <CardBody className="space-y-3">
              {[
                { label: 'API p95 latency', value: '218 ms', pct: 22, tone: 'success' as const, target: '≤ 300 ms' },
                { label: 'DB pool utilisation', value: '38%', pct: 38, tone: 'success' as const, target: '≤ 80%' },
                { label: 'Notification queue', value: '12', pct: 12, tone: 'success' as const, target: '≤ 1,000' },
                { label: 'Licence — named users', value: `${licenseInfo.usedUsers}/${licenseInfo.namedUsers}`, pct: 43, tone: 'brand' as const, target: '' },
                { label: 'Storage used', value: '1.4 TB / 2 TB', pct: 70, tone: 'warning' as const, target: '' },
              ].map((m) => (
                <div key={m.label}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-xs text-fg-muted">{m.label}</span>
                    <span className="text-xs font-medium text-fg tabular">{m.value}</span>
                  </div>
                  <ProgressBar value={m.pct} tone={m.tone} />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ── Recent activity ─────────────────────────────────────────────── */}
      <Section title="Recent activity" description="Live audit stream across all modules" className="mt-5"
        actions={<Link to="/admin/audit"><Button variant="ghost" size="xs" iconRight={<ArrowUpRight className="h-3 w-3" />}>Full audit trail</Button></Link>}>
        <Card>
          <div className="divide-y divide-border">
            {auditEntries.slice(0, 6).map((a) => (
              <div key={a.uid} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 shrink-0">
                  <Badge tone={auditTone(a.action)} size="sm" dot={false}>{a.action}</Badge>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-fg">
                    <span className="font-medium">{a.userName}</span>{' '}
                    <span className="text-fg-muted">{verbFor(a.action)}</span>{' '}
                    <span className="font-mono">{a.documentNo ?? a.entityLabel}</span>
                  </p>
                  {a.comments && <p className="mt-0.5 line-clamp-1 text-2xs text-fg-subtle">{a.comments}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xs text-fg-subtle">{formatTimeAgo(a.at)}</p>
                  <p className="text-[10px] text-fg-subtle">{a.channel}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Section>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

function verbFor(action: string) {
  const map: Record<string, string> = {
    CREATE: 'created', UPDATE: 'updated', DELETE: 'deleted', SUBMIT: 'submitted',
    APPROVE: 'approved', REJECT: 'rejected', CANCEL: 'cancelled', CLOSE: 'closed',
    EXPORT: 'exported', UNMASK: 'unmasked a field on', PERMISSION_CHANGE: 'changed permissions on',
    CONFIG_CHANGE: 'reconfigured', LOGIN_FAILED: 'failed to sign in to',
  }
  return map[action] ?? action.toLowerCase()
}

function auditTone(action: string) {
  if (['APPROVE', 'CREATE'].includes(action)) return 'success' as const
  if (['REJECT', 'CANCEL', 'DELETE', 'LOGIN_FAILED'].includes(action)) return 'danger' as const
  if (['PERMISSION_CHANGE', 'CONFIG_CHANGE', 'UNMASK'].includes(action)) return 'warning' as const
  return 'neutral' as const
}

function ChartTooltip({ active, payload, label, suffix = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-pop">
      <p className="mb-1 text-2xs font-medium text-fg">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-2xs text-fg-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color ?? p.fill }} />
          {p.name}: <span className="font-medium text-fg tabular">{p.value}{suffix}</span>
        </p>
      ))}
    </div>
  )
}
