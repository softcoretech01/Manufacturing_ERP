import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Input, SearchInput, Select, Switch, Textarea } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { roles, users } from '@/mock/data'
import { ALL_ACTIONS, MODULE_LABELS, PERMISSION_ENTITIES } from '@/mock/permissions'
import type { Role } from '@/types'

export function RolesPage() {
  const toast = useToast()
  const [activeUid, setActiveUid] = useState(roles[4].uid) // PURCH_HEAD
  const [tab, setTab] = useState('permissions')
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['PROCUREMENT', 'SYSTEM']))
  const [cloneOpen, setCloneOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeOverride, setActiveOverride] = useState<Record<string, boolean>>({})

  const role = roles.find((r) => r.uid === activeUid)!
  const holders = users.filter((u) => u.roles.includes(role.code))

  const visibleRoles = roles.filter(
    (r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()),
  )

  const entitiesByModule = useMemo(() => {
    const g: Record<string, typeof PERMISSION_ENTITIES> = {}
    for (const e of PERMISSION_ENTITIES) (g[e.module] ??= []).push(e)
    return g
  }, [])

  const has = (code: string) => role.permissions.includes(code)
  const denied = (code: string) => role.deniedPermissions.includes(code)

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="A role is a named bundle of permissions plus field-level policies. Permissions are never granted directly to a user."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Roles' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => setCloneOpen(true)}>
              Clone role
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => toast.info('New role', 'Create a role from a blank permission set, or clone an existing one to start from its grants.')}>New role</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* ── Role list ────────────────────────────────────────────────── */}
        <Card className="h-fit">
          <div className="border-b border-border p-2">
            <SearchInput sizeVariant="sm" placeholder="Filter roles…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-1.5">
            {(['SYSTEM', 'INTERNAL', 'AUDIT', 'PORTAL'] as const).map((type) => {
              const group = visibleRoles.filter((r) => r.roleType === type)
              if (!group.length) return null
              return (
                <div key={type} className="mb-2">
                  <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                    {type.toLowerCase()}
                  </p>
                  {group.map((r) => (
                    <button
                      key={r.uid}
                      onClick={() => setActiveUid(r.uid)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                        r.uid === activeUid ? 'bg-brand-500/10 text-brand-600' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{r.name}</span>
                        <span className="block truncate font-mono text-[10px] opacity-70">{r.code}</span>
                      </span>
                      <span className="shrink-0 text-2xs tabular opacity-70">{r.userCount}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </Card>

        {/* ── Role editor ──────────────────────────────────────────────── */}
        <div className="min-w-0">
          <Card className="mb-4">
            <CardBody>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-fg">{role.name}</h2>
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{role.code}</span>
                    {role.isSystem && <Badge tone="neutral" size="sm" dot={false}><Lock className="mr-0.5 h-2.5 w-2.5" />system</Badge>}
                    <Badge tone={role.isActive ? 'success' : 'neutral'} size="sm">{role.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-xs text-fg-muted">{role.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={activeOverride[role.uid] ?? role.isActive} onChange={(v) => setActiveOverride((s) => ({ ...s, [role.uid]: v }))} disabled={role.isSystem} label="Active" />
                  <Button variant="primary" size="sm" disabled={role.isSystem} onClick={() => toast.success('Role saved', `${role.userCount} users refresh within 60 seconds.`)}>
                    Save
                  </Button>
                </div>
              </div>
              {role.isSystem && (
                <Alert tone="info" className="mt-3">
                  System roles are seeded and cannot be edited or deleted. Clone this role to create an
                  editable variant.
                </Alert>
              )}
              {role.userCount > 0 && (
                <Alert tone="warning" className="mt-3" title={`Changing this role affects ${role.userCount} users`}>
                  Their effective permissions refresh within 60 seconds — no re-login is required.
                </Alert>
              )}
            </CardBody>
          </Card>

          <Tabs
            className="mb-4"
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'permissions', label: 'Permissions', count: role.permissions.length },
              { id: 'denied', label: 'Explicit denials', count: role.deniedPermissions.length },
              { id: 'fields', label: 'Field policies', count: role.fieldPolicies.length },
              { id: 'holders', label: 'Users', count: holders.length },
            ]}
          />

          {tab === 'permissions' && (
            <Card>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <SearchInput sizeVariant="sm" containerClassName="w-56" placeholder="Filter permissions…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="xs" variant="ghost" onClick={() => setExpanded(new Set(Object.keys(entitiesByModule)))}>Expand all</Button>
                  <Button size="xs" variant="ghost" onClick={() => setExpanded(new Set())}>Collapse all</Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[240px] bg-surface-2">Module / entity</th>
                      {ALL_ACTIONS.map((a) => (
                        <th key={a} className="w-16 text-center text-[9px]">{a.slice(0, 6)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(entitiesByModule).map(([moduleCode, entities]) => {
                      const open = expanded.has(moduleCode)
                      const matching = entities.filter(
                        (e) => !filter || e.label.toLowerCase().includes(filter.toLowerCase()) || moduleCode.toLowerCase().includes(filter.toLowerCase()),
                      )
                      if (!matching.length) return null
                      return (
                        <>
                          <tr key={moduleCode} className="bg-surface-2/60">
                            <td colSpan={ALL_ACTIONS.length + 1} className="sticky left-0">
                              <button
                                onClick={() =>
                                  setExpanded((s) => {
                                    const n = new Set(s)
                                    n.has(moduleCode) ? n.delete(moduleCode) : n.add(moduleCode)
                                    return n
                                  })
                                }
                                className="flex items-center gap-1.5 text-xs font-semibold text-fg"
                              >
                                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                {MODULE_LABELS[moduleCode] ?? moduleCode}
                                <span className="ml-1 font-normal text-fg-subtle">
                                  ({entities.reduce((s, e) => s + e.actions.filter((a) => has(`${e.module}.${e.entity}.${a}`)).length, 0)} granted)
                                </span>
                              </button>
                            </td>
                          </tr>
                          {open &&
                            matching.map((e) => (
                              <tr key={`${moduleCode}.${e.entity}`}>
                                <td className="sticky left-0 z-10 bg-surface pl-7 text-xs">{e.label}</td>
                                {ALL_ACTIONS.map((a) => {
                                  const code = `${e.module}.${e.entity}.${a}`
                                  const applicable = e.actions.includes(a)
                                  const isDenied = denied(code)
                                  return (
                                    <td key={a} className="text-center">
                                      {!applicable ? (
                                        <span className="text-fg-subtle opacity-25">·</span>
                                      ) : isDenied ? (
                                        <span title="Explicitly denied — deny wins over allow" className="text-danger">⛔</span>
                                      ) : (
                                        <input
                                          type="checkbox"
                                          defaultChecked={has(code)}
                                          disabled={role.isSystem}
                                          className="h-3.5 w-3.5 accent-brand-600 disabled:opacity-50"
                                          title={code}
                                        />
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-border px-3 py-2 text-2xs">
                <span className="text-fg-muted">
                  Selected: <strong className="text-fg tabular">{role.permissions.length}</strong> permissions
                </span>
                <span className="flex items-center gap-1 text-warning">
                  <ShieldAlert className="h-3 w-3" />
                  {role.permissions.filter((p) => ['IMPERSONATE', 'RESTORE', 'OVERRIDE', 'GRANT', 'RELEASE', 'REOPEN'].some((s) => p.endsWith(s))).length} sensitive permissions selected
                </span>
              </div>
            </Card>
          )}

          {tab === 'denied' && (
            <Card>
              <CardHeader
                title="Explicit denials"
                description="Deny always wins over allow. Denials let a broad role be reused with a narrow carve-out."
                actions={<Button size="xs" variant="outline" icon={<Plus className="h-3 w-3" />} disabled={role.isSystem} onClick={() => toast.info('Add denial', 'Pick a permission to explicitly deny for this role — deny always wins over allow.')}>Add denial</Button>}
              />
              {role.deniedPermissions.length === 0 ? (
                <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No explicit denials" description="This role grants without carve-outs." />
              ) : (
                <table className="grid-table">
                  <thead><tr><th>Permission</th><th className="w-32">Effect</th><th className="w-20" /></tr></thead>
                  <tbody>
                    {role.deniedPermissions.slice(0, 30).map((p) => (
                      <tr key={p}>
                        <td className="font-mono text-[11px]">{p}</td>
                        <td><Badge tone="danger" size="sm">DENY</Badge></td>
                        <td className="text-right"><Button size="xs" variant="ghost" disabled={role.isSystem} onClick={() => toast.success('Denial removed', `${p} is no longer explicitly denied for this role.`)}>Remove</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {role.deniedPermissions.length > 30 && (
                <div className="border-t border-border px-4 py-2 text-2xs text-fg-subtle">
                  Showing 30 of {role.deniedPermissions.length}.
                </div>
              )}
            </Card>
          )}

          {tab === 'fields' && (
            <Card>
              <CardHeader
                title="Field-level policies"
                description="Applied at serialisation, not in the UI. A hidden field is omitted from the payload entirely."
                actions={<Button size="xs" variant="outline" icon={<Plus className="h-3 w-3" />} disabled={role.isSystem} onClick={() => toast.info('Add field policy', 'Define an entity, field and access level (hidden / read-only) applied at serialisation.')}>Add policy</Button>}
              />
              {role.fieldPolicies.length === 0 ? (
                <EmptyState icon={<Eye className="h-5 w-5" />} title="No field policies" description="This role sees every field its permissions allow." />
              ) : (
                <table className="grid-table">
                  <thead><tr><th>Entity</th><th>Field</th><th className="w-32">Access</th><th>Condition</th><th className="w-20" /></tr></thead>
                  <tbody>
                    {role.fieldPolicies.map((p, i) => (
                      <tr key={i}>
                        <td className="font-mono text-[11px]">{p.entity}</td>
                        <td className="font-mono text-[11px]">{p.field}</td>
                        <td>
                          <Badge tone={p.access === 'HIDDEN' ? 'danger' : p.access === 'READ_ONLY' ? 'warning' : 'success'} size="sm" dot={false}>
                            {p.access === 'HIDDEN' ? <EyeOff className="mr-1 h-2.5 w-2.5" /> : <Eye className="mr-1 h-2.5 w-2.5" />}
                            {p.access.replace('_', ' ').toLowerCase()}
                          </Badge>
                        </td>
                        <td className="text-xs text-fg-subtle">{p.condition ?? '—'}</td>
                        <td className="text-right"><Button size="xs" variant="ghost" disabled={role.isSystem} onClick={() => toast.info('Edit field policy', `${p.entity}.${p.field} — ${p.access.replace('_', ' ').toLowerCase()}.`)}>Edit</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="border-t border-border px-4 py-2.5">
                <Alert tone="info">
                  Example in effect: a <span className="font-mono">STORE_OPR</span> fetching a purchase order
                  receives a payload with no <span className="font-mono">rate</span>,{' '}
                  <span className="font-mono">amount</span> or <span className="font-mono">total_amount</span>{' '}
                  keys present, and <span className="font-mono">meta.masked_fields</span> listing them.
                </Alert>
              </div>
            </Card>
          )}

          {tab === 'holders' && (
            <Card>
              <CardHeader title="Users holding this role" description={`${holders.length} users`} />
              {holders.length === 0 ? (
                <EmptyState icon={<Users className="h-5 w-5" />} title="No users hold this role" />
              ) : (
                <div className="divide-y divide-border">
                  {holders.map((u) => (
                    <div key={u.uid} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={u.fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{u.fullName}</p>
                        <p className="truncate text-2xs text-fg-subtle">{u.designation} · {u.department}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {u.roles.filter((r) => r !== role.code).map((r) => (
                          <span key={r} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[9px] text-fg-subtle">{r}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        size="sm"
        title="Clone role"
        description={`Create an editable copy of ${role.name}.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setCloneOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Role cloned', 'The copy is editable and holds no users yet.'); setCloneOpen(false) }}>
              Create clone
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Code" required defaultValue={`${role.code}_COPY`} hint="Uppercase, no spaces. Immutable once saved." />
          <Input label="Name" required defaultValue={`${role.name} (copy)`} />
          <Textarea label="Description" defaultValue={role.description} />
          <Select label="Role type" defaultValue={role.roleType}
            options={[{ value: 'INTERNAL', label: 'Internal' }, { value: 'PORTAL', label: 'Portal (external)' }, { value: 'AUDIT', label: 'Audit (read-only)' }]} />
          <Alert tone="info">
            {role.permissions.length} permissions and {role.fieldPolicies.length} field policies will be copied.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
