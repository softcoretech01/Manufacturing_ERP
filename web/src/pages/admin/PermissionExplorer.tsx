import { useMemo, useState } from 'react'
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
import { roles, users } from '@/mock/data'
import { MODULE_LABELS, PERMISSIONS } from '@/mock/permissions'
import type { Permission } from '@/types'

/**
 * "Who can do X?" and its inverse (V1-IAM-FR-026). This is the artefact an IT
 * auditor asks for, so it must be a first-class screen, not a report export.
 */
export function PermissionExplorerPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'permission-explorer', 'Permission explorer', columnsFromTable(columns), filtered)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [mode, setMode] = useState('by-permission')
  const [q, setQ] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [selectedCode, setSelectedCode] = useState('PROCUREMENT.PO.APPROVE')
  const [selectedUser, setSelectedUser] = useState('usr-01')

  const filtered = useMemo(
    () =>
      PERMISSIONS.filter(
        (p) =>
          (!moduleFilter || p.module === moduleFilter) &&
          (!q || p.code.toLowerCase().includes(q.toLowerCase()) || p.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [q, moduleFilter],
  )

  const holdersOf = (code: string) => {
    const grantingRoles = roles.filter((r) => r.permissions.includes(code) && !r.deniedPermissions.includes(code))
    const holders = users.filter((u) => {
      const held = roles.filter((r) => u.roles.includes(r.code))
      if (held.some((r) => r.deniedPermissions.includes(code))) return false
      return held.some((r) => r.permissions.includes(code))
    })
    return { grantingRoles, holders }
  }

  const { grantingRoles, holders } = holdersOf(selectedCode)

  const user = users.find((u) => u.uid === selectedUser)!
  const userRoles = roles.filter((r) => user.roles.includes(r.code))
  const userAllowed = [...new Set(userRoles.flatMap((r) => r.permissions))].sort()
  const userDenied = new Set(userRoles.flatMap((r) => r.deniedPermissions))

  const columns: Column<Permission>[] = [
    { key: 'code', header: 'Permission', sortable: true, render: (p) => <span className="font-mono text-[11px]">{p.code}</span> },
    { key: 'name', header: 'Description', sortable: true },
    { key: 'module', header: 'Module', sortable: true, width: '150px', render: (p) => MODULE_LABELS[p.module] ?? p.module },
    {
      key: 'holders',
      header: 'Roles',
      align: 'right',
      width: '80px',
      accessor: (p) => holdersOf(p.code).grantingRoles.length,
      render: (p) => <span className="tabular">{holdersOf(p.code).grantingRoles.length}</span>,
    },
    {
      key: 'users',
      header: 'Users',
      align: 'right',
      width: '80px',
      accessor: (p) => holdersOf(p.code).holders.length,
      render: (p) => <span className="tabular">{holdersOf(p.code).holders.length}</span>,
    },
    {
      key: 'isSensitive',
      header: 'Sensitive',
      align: 'center',
      width: '90px',
      accessor: (p) => (p.isSensitive ? 1 : 0),
      render: (p) => (p.isSensitive ? <ShieldAlert className="mx-auto h-4 w-4 text-danger" /> : null),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Permission explorer"
        description="Answer “who can approve POs above ₹10 lakh?” and its inverse — “what can this user actually do?”"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Permission explorer' }]}
        actions={
          <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => toast.success('Export queued', 'User Access Rights report will be emailed.')}>
            Export access rights
          </Button>
        }
        tabs={
          <Tabs
            active={mode}
            onChange={setMode}
            tabs={[
              { id: 'by-permission', label: 'By permission — who can do X?' },
              { id: 'by-user', label: 'By user — what can they do?' },
              { id: 'catalogue', label: 'Full catalogue', count: PERMISSIONS.length },
            ]}
          />
        }
      />

      {mode === 'by-permission' && (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card className="h-fit">
            <div className="border-b border-border p-2 space-y-2">
              <SearchInput sizeVariant="sm" placeholder="Search permission code…" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select sizeVariant="sm" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
                options={[{ value: '', label: 'All modules' }, ...Object.entries(MODULE_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
            </div>
            <div className="max-h-[64vh] overflow-y-auto p-1.5">
              {filtered.slice(0, 200).map((p) => (
                <button
                  key={p.code}
                  onClick={() => setSelectedCode(p.code)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                    p.code === selectedCode ? 'bg-brand-500/10' : 'hover:bg-surface-3',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-mono text-[11px]', p.code === selectedCode ? 'text-brand-600' : 'text-fg')}>
                      {p.code}
                    </span>
                    <span className="block truncate text-[10px] text-fg-subtle">{p.name}</span>
                  </span>
                  {p.isSensitive && <ShieldAlert className="h-3 w-3 shrink-0 text-danger" />}
                </button>
              ))}
              {filtered.length > 200 && (
                <p className="px-2 py-2 text-2xs text-fg-subtle">Showing 200 of {filtered.length}. Refine the search.</p>
              )}
            </div>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card>
              <CardBody>
                <p className="font-mono text-sm font-medium text-fg">{selectedCode}</p>
                <p className="mt-1 text-xs text-fg-muted">{PERMISSIONS.find((p) => p.code === selectedCode)?.name}</p>
                {PERMISSIONS.find((p) => p.code === selectedCode)?.isSensitive && (
                  <Alert tone="danger" className="mt-3" title="Sensitive permission">
                    Granting this requires explicit confirmation, and every use is written to the
                    privileged-action log.
                  </Alert>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Granted by roles" description={`${grantingRoles.length} roles grant this permission`} />
              {grantingRoles.length === 0 ? (
                <EmptyState icon={<Search className="h-5 w-5" />} title="No role grants this permission" />
              ) : (
                <div className="divide-y divide-border">
                  {grantingRoles.map((r) => (
                    <div key={r.uid} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-fg">{r.name}</p>
                        <p className="truncate text-2xs text-fg-subtle">{r.description}</p>
                      </div>
                      <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{r.code}</span>
                      <span className="w-12 shrink-0 text-right text-2xs text-fg-muted tabular">{r.userCount} users</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Users who effectively hold it" description={`${holders.length} users, after applying denials`} icon={<Users className="h-4 w-4" />} />
              {holders.length === 0 ? (
                <EmptyState icon={<Users className="h-5 w-5" />} title="Nobody currently holds this permission" />
              ) : (
                <div className="divide-y divide-border">
                  {holders.map((u) => (
                    <div key={u.uid} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={u.fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{u.fullName}</p>
                        <p className="truncate text-2xs text-fg-subtle">{u.designation}</p>
                      </div>
                      <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                        via {roles.find((r) => u.roles.includes(r.code) && r.permissions.includes(selectedCode))?.code}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {mode === 'by-user' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="flex flex-wrap items-end gap-3">
              <Select label="User" containerClassName="w-72" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
                options={users.map((u) => ({ value: u.uid, label: `${u.fullName} — ${u.designation}` }))} />
              <div className="flex flex-wrap gap-1.5 pb-1">
                {userRoles.map((r) => (
                  <Badge key={r.uid} tone="brand" size="sm">{r.code}</Badge>
                ))}
              </div>
              <div className="ml-auto flex gap-4 pb-1 text-xs">
                <span className="text-fg-muted">Allowed <strong className="text-success tabular">{userAllowed.length}</strong></span>
                <span className="text-fg-muted">Denied <strong className="text-danger tabular">{userDenied.size}</strong></span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Effective permissions" description="Union of all held roles, minus explicit denials. Deny always wins." />
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="grid-table">
                <thead>
                  <tr><th>Permission</th><th className="w-56">Description</th><th className="w-32">Granted by</th><th className="w-24">Effect</th></tr>
                </thead>
                <tbody>
                  {userAllowed.map((code) => {
                    const isDenied = userDenied.has(code)
                    return (
                      <tr key={code}>
                        <td className="font-mono text-[11px]">{code}</td>
                        <td className="text-xs text-fg-muted">{PERMISSIONS.find((p) => p.code === code)?.name}</td>
                        <td>
                          <span className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px] text-fg-muted">
                            {userRoles.find((r) => r.permissions.includes(code))?.code}
                          </span>
                        </td>
                        <td>{isDenied ? <Badge tone="danger" size="sm">DENY</Badge> : <Badge tone="success" size="sm">ALLOW</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {mode === 'catalogue' && (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(p) => p.code}
          pageSize={50}
          searchPlaceholder="Permission code or description…"
          searchValue={q}
          onSearchChange={setQ}
          onExport={doExport}
          filterPanel={
            <Select sizeVariant="sm" containerClassName="w-48" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
              options={[{ value: '', label: 'All modules' }, ...Object.entries(MODULE_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
          }
          onRowClick={(p) => { setSelectedCode(p.code); setMode('by-permission') }}
        />
      )}
    </div>
  )
}
