import { useEffect, useMemo, useState } from 'react'
import { Download, Search, ShieldAlert, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { SearchInput, Select } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { ProblemError } from '@/api/client'
import type { Permission } from '@/api/iam'
import { useAccessMatrix } from '@/hooks/useIam'

/** "Who can do X?" and its inverse (V1-IAM-FR-026) — wired to the live access
 * matrix (real permissions, roles and users). Grants are ALLOW-only in this
 * system, so a permission held via any role is effective. */

const MODULE_LABELS: Record<string, string> = {
  SYSTEM: 'System administration',
  INVENTORY: 'Inventory & Stores',
}
const modLabel = (m: string) => MODULE_LABELS[m] ?? m

export function PermissionExplorerPage() {
  const toast = useToast()
  const { data, isLoading, error, refetch } = useAccessMatrix()

  const permissions = useMemo(() => data?.permissions ?? [], [data])
  const roles = useMemo(() => data?.roles ?? [], [data])
  const usersList = useMemo(() => data?.users ?? [], [data])
  const rolesByCode = useMemo(() => new Map(roles.map((r) => [r.code, r])), [roles])
  const modules = useMemo(() => [...new Set(permissions.map((p) => p.module))], [permissions])

  const [mode, setMode] = useState('by-permission')
  const [q, setQ] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedCode && permissions.length) setSelectedCode(permissions[0].code)
    if (!selectedUser && usersList.length) setSelectedUser(usersList[0].uid)
  }, [permissions, usersList, selectedCode, selectedUser])

  const filtered = useMemo(
    () =>
      permissions.filter(
        (p) =>
          (!moduleFilter || p.module === moduleFilter) &&
          (!q || p.code.toLowerCase().includes(q.toLowerCase()) || p.label.toLowerCase().includes(q.toLowerCase())),
      ),
    [permissions, q, moduleFilter],
  )

  const rolesGranting = (code: string) => roles.filter((r) => r.codes.includes(code))
  const usersHolding = (code: string) =>
    usersList.filter((u) => u.roles.some((rc) => rolesByCode.get(rc)?.codes.includes(code)))

  const selectedPerm = permissions.find((p) => p.code === selectedCode) ?? null
  const grantingRoles = selectedCode ? rolesGranting(selectedCode) : []
  const holders = selectedCode ? usersHolding(selectedCode) : []

  const user = usersList.find((u) => u.uid === selectedUser) ?? null
  const userRoles = user ? user.roles.map((rc) => rolesByCode.get(rc)).filter(Boolean) : []
  const userEffective = useMemo(() => {
    const set = new Set<string>()
    for (const r of userRoles) for (const c of r!.codes) set.add(c)
    return [...set].sort()
  }, [userRoles])

  const columns: Column<Permission>[] = [
    { key: 'code', header: 'Permission', sortable: true, render: (p) => <span className="font-mono text-[11px]">{p.code}</span> },
    { key: 'label', header: 'Description', sortable: true },
    { key: 'module', header: 'Module', sortable: true, width: '170px', render: (p) => modLabel(p.module) },
    { key: 'roles', header: 'Roles', align: 'right', width: '80px', accessor: (p) => rolesGranting(p.code).length, render: (p) => <span className="tabular">{rolesGranting(p.code).length}</span> },
    { key: 'users', header: 'Users', align: 'right', width: '80px', accessor: (p) => usersHolding(p.code).length, render: (p) => <span className="tabular">{usersHolding(p.code).length}</span> },
    { key: 'is_sensitive', header: 'Sensitive', align: 'center', width: '90px', accessor: (p) => (p.is_sensitive ? 1 : 0), render: (p) => (p.is_sensitive ? <ShieldAlert className="mx-auto h-4 w-4 text-danger" /> : null) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'permission-explorer', 'Permission explorer', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Permission explorer"
        description="Answer “who can do X?” and its inverse — “what can this user actually do?” Live data from the access-control backend."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Permission explorer' }]}
        actions={<Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => doExport('xlsx')} disabled={!filtered.length}>Export access rights</Button>}
        tabs={
          <Tabs active={mode} onChange={setMode} tabs={[
            { id: 'by-permission', label: 'By permission — who can do X?' },
            { id: 'by-user', label: 'By user — what can they do?' },
            { id: 'catalogue', label: 'Full catalogue', count: permissions.length },
          ]} />
        }
      />

      {error && (
        <Alert tone="danger" title="Could not load the access matrix">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}
      {isLoading && <p className="py-10 text-center text-sm text-fg-subtle">Loading access matrix…</p>}

      {!isLoading && mode === 'by-permission' && (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card className="h-fit">
            <div className="space-y-2 border-b border-border p-2">
              <SearchInput sizeVariant="sm" placeholder="Search permission code…" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select sizeVariant="sm" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
                options={[{ value: '', label: 'All modules' }, ...modules.map((m) => ({ value: m, label: modLabel(m) }))]} />
            </div>
            <div className="max-h-[64vh] overflow-y-auto p-1.5">
              {filtered.map((p) => (
                <button key={p.code} onClick={() => setSelectedCode(p.code)}
                  className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors', p.code === selectedCode ? 'bg-brand-500/10' : 'hover:bg-surface-3')}>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-mono text-[11px]', p.code === selectedCode ? 'text-brand-600' : 'text-fg')}>{p.code}</span>
                    <span className="block truncate text-[10px] text-fg-subtle">{p.label}</span>
                  </span>
                  {p.is_sensitive && <ShieldAlert className="h-3 w-3 shrink-0 text-danger" />}
                </button>
              ))}
              {!filtered.length && <p className="px-2 py-4 text-center text-2xs text-fg-subtle">No permissions match.</p>}
            </div>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card>
              <CardBody>
                <p className="font-mono text-sm font-medium text-fg">{selectedCode ?? '—'}</p>
                <p className="mt-1 text-xs text-fg-muted">{selectedPerm?.label}</p>
                {selectedPerm?.is_sensitive && (
                  <Alert tone="danger" className="mt-3" title="Sensitive permission">
                    Granting this should require explicit confirmation and privileged-action logging.
                  </Alert>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Granted by roles" description={`${grantingRoles.length} role(s) grant this permission`} />
              {grantingRoles.length === 0 ? (
                <EmptyState icon={<Search className="h-5 w-5" />} title="No role grants this permission" />
              ) : (
                <div className="divide-y divide-border">
                  {grantingRoles.map((r) => (
                    <div key={r.uid} className="flex items-center gap-3 px-4 py-2.5">
                      <p className="min-w-0 flex-1 truncate text-sm text-fg">{r.name}</p>
                      <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{r.code}</span>
                      <span className="w-16 shrink-0 text-right text-2xs text-fg-muted tabular">{r.codes.length} perms</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Users who hold it" description={`${holders.length} user(s), via their roles`} icon={<Users className="h-4 w-4" />} />
              {holders.length === 0 ? (
                <EmptyState icon={<Users className="h-5 w-5" />} title="Nobody currently holds this permission" />
              ) : (
                <div className="divide-y divide-border">
                  {holders.map((u) => (
                    <div key={u.uid} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={u.full_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{u.full_name}</p>
                        <p className="truncate text-2xs text-fg-subtle">{u.login_id}</p>
                      </div>
                      <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                        via {u.roles.find((rc) => rolesByCode.get(rc)?.codes.includes(selectedCode ?? ''))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {!isLoading && mode === 'by-user' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="flex flex-wrap items-end gap-3">
              <Select label="User" containerClassName="w-72" value={selectedUser ?? ''} onChange={(e) => setSelectedUser(e.target.value)}
                options={usersList.map((u) => ({ value: u.uid, label: `${u.full_name} — ${u.login_id}` }))} />
              <div className="flex flex-wrap gap-1.5 pb-1">
                {userRoles.map((r) => <Badge key={r!.uid} tone="brand" size="sm">{r!.code}</Badge>)}
                {!userRoles.length && <span className="pb-1 text-xs text-fg-subtle">No roles assigned</span>}
              </div>
              <div className="ml-auto pb-1 text-xs text-fg-muted">Effective permissions <strong className="text-success tabular">{userEffective.length}</strong></div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Effective permissions" description="Union of all held roles (ALLOW-only)." />
            {userEffective.length === 0 ? (
              <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="This user holds no permissions" description="Assign a role on the Users page." />
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="grid-table">
                  <thead><tr><th>Permission</th><th className="w-64">Description</th><th className="w-32">Granted by</th></tr></thead>
                  <tbody>
                    {userEffective.map((code) => (
                      <tr key={code}>
                        <td className="font-mono text-[11px]">{code}</td>
                        <td className="text-xs text-fg-muted">{permissions.find((p) => p.code === code)?.label}</td>
                        <td><span className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px] text-fg-muted">{userRoles.find((r) => r!.codes.includes(code))?.code}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {!isLoading && mode === 'catalogue' && (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(p) => p.code}
          searchPlaceholder="Permission code or description…"
          searchValue={q}
          onSearchChange={setQ}
          onExport={doExport}
          filterPanel={
            <Select sizeVariant="sm" containerClassName="w-48" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
              options={[{ value: '', label: 'All modules' }, ...modules.map((m) => ({ value: m, label: modLabel(m) }))]} />
          }
          onRowClick={(p) => { setSelectedCode(p.code); setMode('by-permission') }}
        />
      )}
    </div>
  )
}
