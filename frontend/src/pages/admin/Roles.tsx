import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Power, RotateCcw, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, SearchInput, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { Permission } from '@/api/iam'
import { MODULE_LABELS } from '@/mock/permissions'
import {
  useRoles,
  usePermissions,
  useRolePermissions,
  useCreateRole,
  useDeactivateRole,
  useRestoreRole,
  useSetRolePermissions,
} from '@/hooks/useIam'

/** Live-wired against the FastAPI IAM module: real roles, real permission grants. */

const moduleLabel = (code: string) => MODULE_LABELS[code] ?? code

export function RolesPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const rolesQ = useRoles()
  const permsQ = usePermissions()
  const roles = rolesQ.data ?? []

  const [activeUid, setActiveUid] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

  // Default the selection to the first role once the list loads.
  useEffect(() => {
    if (!activeUid && roles.length) setActiveUid(roles[0].uid)
  }, [activeUid, roles])

  const activeRole = roles.find((r) => r.uid === activeUid) ?? null
  const rolePermsQ = useRolePermissions(activeUid ?? undefined)
  const setPermissions = useSetRolePermissions()
  const deactivateRole = useDeactivateRole()
  const restoreRole = useRestoreRole()

  // Seed the editable draft whenever the selected role's grants arrive.
  useEffect(() => {
    if (rolePermsQ.data) setDraft(new Set(rolePermsQ.data))
  }, [rolePermsQ.data, activeUid])

  // Group the permission catalogue: module → entities → actions.
  const byModule = useMemo(() => {
    const g: Record<string, { entities: string[]; actions: string[]; codes: Set<string> }> = {}
    for (const p of permsQ.data ?? []) {
      const m = (g[p.module] ??= { entities: [], actions: [], codes: new Set() })
      if (!m.entities.includes(p.entity)) m.entities.push(p.entity)
      if (!m.actions.includes(p.action)) m.actions.push(p.action)
      m.codes.add(p.code)
    }
    for (const m of Object.values(g)) {
      m.entities.sort()
      m.actions.sort()
    }
    return g
  }, [permsQ.data])

  const labelByCode = useMemo(() => {
    const m: Record<string, Permission> = {}
    for (const p of permsQ.data ?? []) m[p.code] = p
    return m
  }, [permsQ.data])

  const dirty = useMemo(() => {
    const base = new Set(rolePermsQ.data ?? [])
    if (base.size !== draft.size) return true
    for (const c of draft) if (!base.has(c)) return true
    return false
  }, [draft, rolePermsQ.data])

  const visibleRoles = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.code.toLowerCase().includes(search.toLowerCase()),
  )

  const toggle = (code: string) =>
    setDraft((s) => {
      const n = new Set(s)
      n.has(code) ? n.delete(code) : n.add(code)
      return n
    })

  const toggleModule = (moduleCode: string, on: boolean) =>
    setDraft((s) => {
      const n = new Set(s)
      for (const c of byModule[moduleCode].codes) on ? n.add(c) : n.delete(c)
      return n
    })

  function save() {
    if (!activeRole) return
    setPermissions.mutate(
      { uid: activeRole.uid, codes: [...draft] },
      {
        onSuccess: (codes) => {
          toast.success('Permissions saved', `${activeRole.name} now holds ${codes.length} permissions.`)
        },
        onError: (e) =>
          toast.error(
            'Save failed',
            e instanceof ProblemError ? e.problem.detail : 'Could not update permissions.',
          ),
      },
    )
  }

  function toggleActive() {
    if (!activeRole) return
    if (activeRole.is_active) {
      deactivateRole.mutate(
        { uid: activeRole.uid, version: activeRole.version },
        {
          onSuccess: () => toast.success('Role deactivated', `${activeRole.name} is now inactive.`),
          onError: (e) =>
            toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Could not deactivate.'),
        },
      )
    } else {
      restoreRole.mutate(activeRole.uid, {
        onSuccess: () => toast.success('Role restored', `${activeRole.name} is active again.`),
        onError: (e) =>
          toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Could not restore.'),
      })
    }
  }

  const sensitiveCount = [...draft].filter((c) => labelByCode[c]?.is_sensitive).length

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="A role is a named bundle of permissions. Assign roles to users — permissions are never granted to a user directly."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Roles' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New role
          </Button>
        }
      />

      {!companyUid && (
        <Alert tone="warning" title="Not signed in to the backend">
          Sign in first so the app has an API session, then roles will load.
        </Alert>
      )}
      {rolesQ.error && (
        <Alert tone="danger" title="Could not load roles">
          {rolesQ.error instanceof ProblemError ? rolesQ.error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => rolesQ.refetch()}>Retry</button>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* ── Role list ──────────────────────────────────────────────── */}
        <Card className="h-fit">
          <div className="border-b border-border p-2">
            <SearchInput sizeVariant="sm" placeholder="Filter roles…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-1.5">
            {rolesQ.isLoading && <p className="px-2 py-4 text-center text-xs text-fg-subtle">Loading…</p>}
            {!rolesQ.isLoading && visibleRoles.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-fg-subtle">No roles.</p>
            )}
            {visibleRoles.map((r) => (
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
                {!r.is_active && <Badge tone="neutral" size="sm">off</Badge>}
                <span className="shrink-0 text-2xs tabular opacity-70">{r.permission_count}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* ── Role editor ────────────────────────────────────────────── */}
        <div className="min-w-0">
          {!activeRole ? (
            <Card className="p-8 text-center text-sm text-fg-subtle">Select a role to edit its permissions.</Card>
          ) : (
            <>
              <Card className="mb-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-fg">{activeRole.name}</h2>
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{activeRole.code}</span>
                      <Badge tone={activeRole.is_active ? 'success' : 'neutral'} size="sm">
                        {activeRole.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">{activeRole.role_type}</span>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      {draft.size} permissions selected
                      {sensitiveCount > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-warning">
                          <ShieldAlert className="h-3 w-3" />
                          {sensitiveCount} sensitive
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={activeRole.is_active ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                      onClick={toggleActive}
                      loading={deactivateRole.isPending || restoreRole.isPending}
                    >
                      {activeRole.is_active ? 'Deactivate' : 'Restore'}
                    </Button>
                    <Button variant="primary" size="sm" onClick={save} loading={setPermissions.isPending} disabled={!dirty}>
                      {dirty ? 'Save changes' : 'Saved'}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                  <SearchInput sizeVariant="sm" containerClassName="w-56" placeholder="Filter permissions…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="xs" variant="ghost" onClick={() => setExpanded(new Set(Object.keys(byModule)))}>Expand all</Button>
                    <Button size="xs" variant="ghost" onClick={() => setExpanded(new Set())}>Collapse all</Button>
                  </div>
                </div>

                {permsQ.isLoading && <p className="px-3 py-6 text-center text-xs text-fg-subtle">Loading permissions…</p>}

                <div className="max-h-[62vh] overflow-auto">
                  {Object.entries(byModule).map(([moduleCode, mod]) => {
                    const open = expanded.has(moduleCode)
                    const entities = mod.entities.filter(
                      (e) =>
                        !filter ||
                        e.toLowerCase().includes(filter.toLowerCase()) ||
                        moduleCode.toLowerCase().includes(filter.toLowerCase()),
                    )
                    if (!entities.length) return null
                    const granted = [...mod.codes].filter((c) => draft.has(c)).length
                    const allOn = granted === mod.codes.size && granted > 0
                    return (
                      <div key={moduleCode} className="border-b border-border last:border-0">
                        <div className="flex items-center gap-2 bg-surface-2/60 px-3 py-1.5">
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
                            {moduleLabel(moduleCode)}
                            <span className="ml-1 font-normal text-fg-subtle">({granted}/{mod.codes.size})</span>
                          </button>
                          <button
                            className="ml-auto text-2xs text-brand-600 hover:underline"
                            onClick={() => toggleModule(moduleCode, !allOn)}
                          >
                            {allOn ? 'Clear all' : 'Select all'}
                          </button>
                        </div>

                        {open && (
                          <div className="overflow-x-auto">
                            <table className="grid-table">
                              <thead>
                                <tr>
                                  <th className="sticky left-0 z-10 min-w-[200px] bg-surface-2">Entity</th>
                                  {mod.actions.map((a) => (
                                    <th key={a} className="w-16 text-center text-[9px]" title={a}>{a.slice(0, 6)}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {entities.map((entity) => (
                                  <tr key={entity}>
                                    <td className="sticky left-0 z-10 bg-surface text-xs">{entity.replace(/_/g, ' ').toLowerCase()}</td>
                                    {mod.actions.map((a) => {
                                      const code = `${moduleCode}.${entity}.${a}`
                                      const exists = mod.codes.has(code)
                                      return (
                                        <td key={a} className="text-center">
                                          {exists ? (
                                            <input
                                              type="checkbox"
                                              checked={draft.has(code)}
                                              onChange={() => toggle(code)}
                                              disabled={!activeRole.is_active}
                                              className="h-3.5 w-3.5 accent-brand-600 disabled:opacity-40"
                                              title={code}
                                            />
                                          ) : (
                                            <span className="text-fg-subtle opacity-25">·</span>
                                          )}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <NewRoleModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(uid) => setActiveUid(uid)} />
    </div>
  )
}

/* ─────────────────────────── New role modal ─────────────────────────── */

function NewRoleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (uid: string) => void }) {
  const toast = useToast()
  const createRole = useCreateRole()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [roleType, setRoleType] = useState('INTERNAL')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setCode('')
      setName('')
      setRoleType('INTERNAL')
      setErrors({})
    }
  }, [open])

  function submit() {
    setErrors({})
    createRole.mutate(
      { code: code.trim().toUpperCase(), name: name.trim(), role_type: roleType },
      {
        onSuccess: (r) => {
          toast.success('Role created', `${r.name} (${r.code}) — grant it permissions next.`)
          onCreated(r.uid)
          onClose()
        },
        onError: (e) => {
          if (e instanceof ProblemError) {
            const fe: Record<string, string> = {}
            for (const x of e.problem.errors ?? []) fe[x.field] = x.message
            setErrors(fe)
            toast.error(e.problem.title || 'Create failed', e.problem.detail)
          } else {
            toast.error('Create failed', 'Unknown error.')
          }
        },
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="New role"
      description="Create a role, then tick the permissions it should grant."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={createRole.isPending} disabled={!code.trim() || !name.trim()}>
            Create role
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Code" required value={code} error={errors.code} maxLength={50}
          hint="Uppercase, no spaces. Immutable once saved." placeholder="STORE_KEEPER"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))} />
        <Input label="Name" required value={name} error={errors.name} maxLength={150}
          placeholder="Store Keeper" onChange={(e) => setName(e.target.value)} />
        <Select label="Role type" value={roleType} onChange={(e) => setRoleType(e.target.value)}
          options={[
            { value: 'INTERNAL', label: 'Internal' },
            { value: 'PORTAL', label: 'Portal (external)' },
            { value: 'AUDIT', label: 'Audit (read-only)' },
          ]} />
      </div>
    </Modal>
  )
}
