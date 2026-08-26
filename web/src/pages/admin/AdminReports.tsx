import { Users, ShieldCheck, Warehouse, ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { NameCount, OrgCount } from '@/api/reports'
import { useAdminReports } from '@/hooks/useReports'

/**
 * Administration reports — read-only aggregates computed on the backend from the
 * same live records the operational screens use (users, roles, org structure,
 * audit log). The sanctioned cross-module reporting read (CLAUDE.md §3.3).
 */

function BarList({ items, empty }: { items: NameCount[]; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  if (items.length === 0) return <p className="px-4 py-6 text-center text-xs text-fg-subtle">{empty}</p>
  return (
    <div className="space-y-2 p-4">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-xs text-fg">{i.label.replace(/_/g, ' ').toLowerCase()}</span>
          <ProgressBar value={(i.count / max) * 100} tone="brand" className="flex-1" />
          <span className="w-12 shrink-0 text-right text-xs tabular text-fg-muted">{i.count}</span>
        </div>
      ))}
    </div>
  )
}

export function AdminReportsPage() {
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useAdminReports()

  const org = data?.organisation
  const orgRows: [string, OrgCount][] = org
    ? [
        ['Branches', org.branches],
        ['Plants', org.plants],
        ['Warehouses', org.warehouses],
        ['Departments', org.departments],
        ['Cost centres', org.cost_centres],
      ]
    : []

  return (
    <div>
      <PageHeader
        title="Administration reports"
        description="Live aggregates over users, roles, organisation structure and the audit trail. Every figure is computed from the same records the operational screens read."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & Ops' }, { label: 'Administration reports' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load reports">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}
      {isLoading && <p className="py-10 text-center text-sm text-fg-subtle">Loading reports…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Users" value={data.users.total} sub={`${data.users.active} active`} tone="brand" icon={<Users className="h-4 w-4" />} />
            <StatTile label="Roles" value={data.roles_total} sub="permission bundles" tone="neutral" icon={<ShieldCheck className="h-4 w-4" />} />
            <StatTile label="Warehouses" value={data.organisation.warehouses.active} sub={`${data.organisation.branches.active} branches`} tone="neutral" icon={<Warehouse className="h-4 w-4" />} />
            <StatTile label="Audit events" value={data.audit.total} sub={`${data.audit.last_7_days} in last 7 days`} tone="brand" icon={<ScrollText className="h-4 w-4" />} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section title="Organisation structure">
              <table className="grid-table">
                <thead><tr><th>Entity</th><th className="w-24 text-right">Active</th><th className="w-24 text-right">Total</th></tr></thead>
                <tbody>
                  {orgRows.map(([label, c]) => (
                    <tr key={label}>
                      <td className="text-xs text-fg">{label}</td>
                      <td className="text-right text-xs tabular text-fg">{c.active}</td>
                      <td className="text-right text-xs tabular text-fg-muted">{c.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Users by type">
              <BarList items={data.users.by_type} empty="No users." />
            </Section>
          </div>

          <Section title="Roles & access" className="mt-4">
            <table className="grid-table">
              <thead><tr><th>Code</th><th>Name</th><th className="w-32 text-right">Permissions</th><th className="w-24 text-right">Users</th></tr></thead>
              <tbody>
                {data.roles.map((r) => (
                  <tr key={r.code}>
                    <td className="font-mono text-xs font-medium">{r.code}</td>
                    <td className="text-xs text-fg">{r.name}</td>
                    <td className="text-right"><Badge tone="neutral" size="sm" dot={false}>{r.permission_count}</Badge></td>
                    <td className="text-right text-xs tabular text-fg-muted">{r.user_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Audit activity" className="mt-4">
            <div className="grid grid-cols-3 gap-3 p-4">
              <StatTile label="Total events" value={data.audit.total} tone="neutral" />
              <StatTile label="Last 7 days" value={data.audit.last_7_days} tone="brand" />
              <StatTile label="Distinct actors" value={data.audit.actors} tone="neutral" />
            </div>
            <div className="border-t border-border">
              <p className="px-4 pt-3 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">By action</p>
              <BarList items={data.audit.by_action} empty="No audit entries yet." />
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
