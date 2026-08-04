import { useMemo, useState } from 'react'
import {
  Ban,
  Download,
  KeyRound,
  Mail,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Upload,
  UserCog,
  UserX,
  Users as UsersIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader, DataRow } from '@/components/ui/Card'
import { Drawer, Modal, ConfirmDialog } from '@/components/ui/Modal'
import { MenuItem, MenuSeparator } from '@/components/ui/Menu'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { Checkbox, Field, Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { branches, companies, costCentres, plants, roles, users, warehouses } from '@/mock/data'
import { sessions } from '@/mock/data'
import type { User } from '@/types'

export function UsersPage() {
  const toast = useToast()
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<User | null>(null)
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<User | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [roleFilter, setRoleFilter] = useState<string>('')

  const rows = useMemo(
    () =>
      users.filter(
        (u) =>
          (!statusFilter || u.status === statusFilter) &&
          (!typeFilter || u.userType === typeFilter) &&
          (!roleFilter || u.roles.includes(roleFilter)),
      ),
    [statusFilter, typeFilter, roleFilter],
  )

  const columns: Column<User>[] = [
    {
      key: 'loginId',
      header: 'Login',
      sortable: true,
      width: '150px',
      render: (u) => (
        <div className="flex items-center gap-2">
          <Avatar name={u.fullName} size="sm" />
          <span className="font-mono text-xs text-fg">{u.loginId}</span>
        </div>
      ),
    },
    { key: 'fullName', header: 'Name', sortable: true, render: (u) => <span className="font-medium text-fg">{u.fullName}</span> },
    {
      key: 'userType',
      header: 'Type',
      sortable: true,
      width: '110px',
      render: (u) => (
        <Badge
          tone={u.userType === 'INTERNAL' ? 'brand' : u.userType === 'SHOPFLOOR' ? 'progress' : u.userType === 'SYSTEM' ? 'neutral' : 'warning'}
          size="sm"
          dot={false}
        >
          {u.userType.replace('PORTAL_', '').toLowerCase()}
        </Badge>
      ),
    },
    { key: 'department', header: 'Department', sortable: true, defaultHidden: true },
    { key: 'designation', header: 'Designation', sortable: true },
    {
      key: 'roles',
      header: 'Roles',
      accessor: (u) => u.roles.join(','),
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.slice(0, 2).map((r) => (
            <span key={r} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{r}</span>
          ))}
          {u.roles.length > 2 && <span className="text-[10px] text-fg-subtle">+{u.roles.length - 2}</span>}
        </div>
      ),
    },
    {
      key: 'mfaEnabled',
      header: 'MFA',
      align: 'center',
      width: '60px',
      accessor: (u) => (u.mfaEnabled ? 1 : 0),
      render: (u) =>
        u.mfaEnabled ? (
          <ShieldCheck className="mx-auto h-4 w-4 text-success" />
        ) : (
          <ShieldAlert className="mx-auto h-4 w-4 text-fg-subtle" />
        ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      sortable: true,
      width: '130px',
      render: (u) =>
        u.lastLoginAt ? (
          <span className="text-xs text-fg-muted" title={formatDateTime(u.lastLoginAt)}>
            {formatTimeAgo(u.lastLoginAt)}
          </span>
        ) : (
          <span className="text-xs text-fg-subtle">Never</span>
        ),
    },
    { key: 'status', header: 'Status', sortable: true, width: '140px', render: (u) => <StatusBadge status={u.status} size="sm" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Users"
        description="User lifecycle, roles, data scope and security. Users are never deleted — only deactivated."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Users' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => toast.info('Import users', 'Upload an .xlsx matching the user import template to bulk-create users.')}>Import</Button>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => toast.success('Export queued', 'Users will be exported as XLSX.')}>Export</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New user
            </Button>
          </>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(u) => u.uid}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        onRowClick={setDetail}
        searchPlaceholder="Name, login id or email…"
        onExport={(f) => toast.success(`Export queued`, `Users will be exported as ${f.toUpperCase()}.`)}
        onRefresh={() => toast.info('Refreshed')}
        filterChips={[
          ...(statusFilter ? [{ key: 's', label: 'Status', value: statusFilter, onRemove: () => setStatusFilter('') }] : []),
          ...(typeFilter ? [{ key: 't', label: 'Type', value: typeFilter, onRemove: () => setTypeFilter('') }] : []),
          ...(roleFilter ? [{ key: 'r', label: 'Role', value: roleFilter, onRemove: () => setRoleFilter('') }] : []),
        ]}
        onClearFilters={() => { setStatusFilter(''); setTypeFilter(''); setRoleFilter('') }}
        filterPanel={
          <>
            <Select sizeVariant="sm" containerClassName="w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              options={[{ value: '', label: 'All statuses' }, { value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }, { value: 'PENDING_ACTIVATION', label: 'Pending activation' }, { value: 'DEACTIVATED', label: 'Deactivated' }]} />
            <Select sizeVariant="sm" containerClassName="w-36" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              options={[{ value: '', label: 'All types' }, { value: 'INTERNAL', label: 'Internal' }, { value: 'SHOPFLOOR', label: 'Shop floor' }, { value: 'PORTAL_SUPPLIER', label: 'Portal — supplier' }, { value: 'PORTAL_CUSTOMER', label: 'Portal — customer' }]} />
            <Select sizeVariant="sm" containerClassName="w-40" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              options={[{ value: '', label: 'All roles' }, ...roles.map((r) => ({ value: r.code, label: r.name }))]} />
          </>
        }
        bulkActions={
          <>
            <Button size="xs" variant="outline" icon={<Mail className="h-3 w-3" />} onClick={() => toast.success(`Reset link sent to ${selected.length} users`)}>
              Send reset link
            </Button>
            <Button size="xs" variant="outline" icon={<ShieldCheck className="h-3 w-3" />} onClick={() => toast.success('MFA enforcement applied')}>
              Enforce MFA
            </Button>
            <Button size="xs" variant="danger" icon={<Ban className="h-3 w-3" />} onClick={() => toast.warning('Deactivation requires per-user approval reassignment')}>
              Deactivate
            </Button>
          </>
        }
        rowActions={(u) => (
          <>
            <MenuItem label="View details" onClick={() => setDetail(u)} />
            <MenuItem label="Edit" onClick={() => setEditing(u)} />
            <MenuSeparator />
            <MenuItem label="Send password reset" icon={<Mail />} onClick={() => toast.success('Reset link sent', `An email was sent to ${u.email}.`)} />
            <MenuItem label="Reset MFA" icon={<KeyRound />} onClick={() => toast.warning('MFA reset', 'The user is notified on their previous contact details too.')} />
            <MenuItem label="View sessions" icon={<Smartphone />} onClick={() => setDetail(u)} />
            <MenuSeparator />
            <MenuItem label="Impersonate" icon={<UserCog />} disabled={u.roles.includes('SYS_ADMIN')} onClick={() => toast.info('Impersonation started', 'Time-boxed to 60 minutes. Approvals are blocked.')} />
            <MenuItem label="Deactivate" icon={<Ban />} danger onClick={() => setConfirmDeactivate(u)} />
          </>
        )}
      />

      <UserDetailDrawer user={detail} onClose={() => setDetail(null)} onEdit={(u) => { setDetail(null); setEditing(u) }} />
      <UserEditModal target={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
        onConfirm={() => {
          toast.success('User deactivated', `${confirmDeactivate?.fullName}'s sessions were revoked immediately.`)
          setConfirmDeactivate(null)
        }}
        title={`Deactivate ${confirmDeactivate?.fullName}?`}
        confirmLabel="Deactivate user"
        message={
          <>
            All sessions are revoked immediately and the account can no longer sign in. The user
            record is retained — deactivation is reversible.
          </>
        }
      >
        <Alert tone="warning" title="2 pending approvals must be reassigned">
          This user is the current approver on PR/26-27/00318 and PO/26-27/00043. Choose where they go.
        </Alert>
        <Select label="Reassign pending approvals to" required className="mt-3"
          options={[{ value: '', label: 'Select a user…' }, ...users.filter((u) => u.status === 'ACTIVE').map((u) => ({ value: u.uid, label: `${u.fullName} (${u.designation})` })), { value: '__esc', label: 'Route to the escalation chain' }]} />
      </ConfirmDialog>
    </div>
  )
}

/* ─────────────────────────── Detail drawer ─────────────────────────── */

function UserDetailDrawer({ user, onClose, onEdit }: { user: User | null; onClose: () => void; onEdit: (u: User) => void }) {
  const toast = useToast()
  const [tab, setTab] = useState('overview')
  if (!user) return null

  const held = roles.filter((r) => user.roles.includes(r.code))
  const allowed = new Set(held.flatMap((r) => r.permissions))
  const denied = new Set(held.flatMap((r) => r.deniedPermissions))
  const userSessions = sessions.filter((s) => s.userUid === user.uid)

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-2.5">
          <Avatar name={user.fullName} size="md" />
          {user.fullName}
        </span>
      }
      description={`${user.loginId} · ${user.designation}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => onEdit(user)}>Edit user</Button>
        </>
      }
    >
      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'permissions', label: 'Permissions', count: allowed.size },
          { id: 'scope', label: 'Data scope' },
          { id: 'sessions', label: 'Sessions', count: userSessions.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Identity" />
            <CardBody className="divide-y divide-border/60 py-1">
              <DataRow label="Login ID" value={<span className="font-mono">{user.loginId}</span>} />
              <DataRow label="Email" value={user.email} />
              <DataRow label="Mobile" value={user.mobile} />
              <DataRow label="User type" value={user.userType.replace(/_/g, ' ')} />
              <DataRow label="Status" value={<StatusBadge status={user.status} size="sm" />} />
              <DataRow label="Employee code" value={user.employeeCode ?? '—'} />
              <DataRow label="Department" value={user.department} />
              <DataRow label="Reports to" value={user.reportsTo} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Security" />
            <CardBody className="divide-y divide-border/60 py-1">
              <DataRow label="Two-factor" value={user.mfaEnabled ? <Badge tone="success" size="sm">Enabled</Badge> : <Badge tone="warning" size="sm">Not enabled</Badge>} />
              <DataRow label="Last login" value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'} />
              <DataRow label="Row-level rule" value={user.rowRule.replace(/_/g, ' ')} />
              <DataRow label="Language / timezone" value={`${user.language} · ${user.timezone}`} />
              <DataRow label="Date / number format" value={`${user.dateFormat} · ${user.numberFormat === 'IN' ? 'Indian' : 'International'}`} />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'permissions' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Assigned roles" description="Effective permissions are the union of all roles, minus explicit denials." />
            <div className="divide-y divide-border">
              {held.map((r) => (
                <div key={r.uid} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{r.name}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">{r.description}</p>
                  </div>
                  <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{r.code}</span>
                </div>
              ))}
            </div>
          </Card>

          {denied.size > 0 && (
            <Alert tone="warning" title={`${denied.size} permissions explicitly denied`}>
              Deny always wins over allow. These cannot be granted by any other role this user holds.
            </Alert>
          )}

          <Card>
            <CardHeader title="Effective permissions" description={`${allowed.size} allowed, ${denied.size} denied`} />
            <div className="max-h-72 overflow-y-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Permission</th>
                    <th className="w-28">Granted by</th>
                    <th className="w-20">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {[...allowed].sort().slice(0, 60).map((code) => (
                    <tr key={code}>
                      <td className="font-mono text-[11px]">{code}</td>
                      <td>
                        <span className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px] text-fg-muted">
                          {held.find((r) => r.permissions.includes(code))?.code}
                        </span>
                      </td>
                      <td>{denied.has(code) ? <Badge tone="danger" size="sm">DENY</Badge> : <Badge tone="success" size="sm">ALLOW</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allowed.size > 60 && (
              <div className="border-t border-border px-4 py-2 text-2xs text-fg-subtle">
                Showing 60 of {allowed.size}. Export the full list from the User Access Rights report.
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'scope' && (
        <div className="space-y-4">
          <Alert tone="info" title="Data scope is enforced server-side">
            Every list query intersects with this scope. A user with no explicit scope inherits their
            primary branch only — never "all".
          </Alert>
          <ScopeCard title="Companies" all={companies.map((c) => ({ uid: c.uid, label: c.legalName }))} selected={user.scope.companies} />
          <ScopeCard title="Branches" all={branches.map((b) => ({ uid: b.uid, label: b.name }))} selected={user.scope.branches} />
          <ScopeCard title="Plants" all={plants.map((p) => ({ uid: p.uid, label: p.name }))} selected={user.scope.plants} />
          <ScopeCard title="Warehouses" all={warehouses.map((w) => ({ uid: w.uid, label: `${w.code} — ${w.name}` }))} selected={user.scope.warehouses} />
          <ScopeCard title="Cost centres" all={costCentres.map((c) => ({ uid: c.uid, label: `${c.code} — ${c.name}` }))} selected={user.scope.costCentres} />
        </div>
      )}

      {tab === 'sessions' && (
        <Card>
          <CardHeader title="Active sessions" description="Administrators can force-terminate any session." />
          <div className="divide-y divide-border">
            {userSessions.length === 0 && <div className="px-4 py-8 text-center text-xs text-fg-subtle">No active sessions.</div>}
            {userSessions.map((s) => (
              <div key={s.uid} className="flex items-center gap-3 px-4 py-2.5">
                <Smartphone className="h-4 w-4 shrink-0 text-fg-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-fg">{s.device}</p>
                  <p className="truncate text-2xs text-fg-subtle">
                    {s.channel} · {s.ipAddress} · {s.location}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xs text-fg-muted">{formatTimeAgo(s.lastActivityAt)}</p>
                  {s.isCurrent && <Badge tone="success" size="sm">Current</Badge>}
                </div>
                {!s.isCurrent && <Button variant="ghost" size="xs" onClick={() => toast.success('Session ended', `${user.fullName} was signed out of ${s.device}.`)}>Sign out</Button>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </Drawer>
  )
}

function ScopeCard({ title, all, selected }: { title: string; all: { uid: string; label: string }[]; selected: string[] }) {
  return (
    <Card>
      <CardHeader title={title} description={selected.length === 0 ? 'None assigned — inherits primary only' : `${selected.length} of ${all.length}`} />
      <CardBody className="flex flex-wrap gap-1.5">
        {all.map((o) => (
          <span
            key={o.uid}
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs',
              selected.includes(o.uid)
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-600'
                : 'border-border bg-surface-2 text-fg-subtle',
            )}
          >
            {o.label}
          </span>
        ))}
      </CardBody>
    </Card>
  )
}

/* ─────────────────────────── Edit modal ─────────────────────────── */

function UserEditModal({ target, onClose }: { target: User | 'new' | null; onClose: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState('basic')
  const isNew = target === 'new'
  const user = isNew || !target ? null : target
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user?.roles ?? [])
  const [mfaRequired, setMfaRequired] = useState(user?.mfaEnabled ?? false)
  const [forcePwChange, setForcePwChange] = useState(false)
  const [pinLogin, setPinLogin] = useState(user?.userType === 'SHOPFLOOR')

  if (!target) return null

  // Segregation of duties evaluation (V1-IAM-FR-028)
  const held = roles.filter((r) => selectedRoles.includes(r.code))
  const perms = new Set(held.flatMap((r) => r.permissions))
  const sodWarn = perms.has('PROCUREMENT.PO.CREATE') && perms.has('PROCUREMENT.PO.APPROVE')

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isNew ? 'New user' : `Edit user — ${user?.fullName}`}
      description={isNew ? 'The user will receive an activation link valid for 48 hours.' : user?.loginId}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { toast.success(isNew ? 'User created' : 'User updated', isNew ? 'An activation email has been sent.' : 'Permissions refresh within 60 seconds.'); onClose() }}>
            {isNew ? 'Create user' : 'Save changes'}
          </Button>
        </>
      }
    >
      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'basic', label: 'Basic' },
          { id: 'roles', label: 'Roles & permissions' },
          { id: 'scope', label: 'Data scope' },
          { id: 'security', label: 'Security' },
        ]}
      />

      {tab === 'basic' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Identity" />
            <CardBody className="space-y-3">
              <Input label="Login ID" required defaultValue={user?.loginId} readOnlyReason={!isNew ? 'Immutable once created' : undefined} disabled={!isNew} />
              <Select label="User type" required defaultValue={user?.userType}
                options={[{ value: 'INTERNAL', label: 'Internal' }, { value: 'SHOPFLOOR', label: 'Shop floor (PIN/badge)' }, { value: 'PORTAL_SUPPLIER', label: 'Portal — supplier' }, { value: 'PORTAL_CUSTOMER', label: 'Portal — customer' }, { value: 'SYSTEM', label: 'System / integration' }]} />
              <Input label="Link to employee" defaultValue={user?.employeeCode ?? ''} placeholder="🔍 Search employee master" hint="Name, department and reporting manager are then sourced from the employee master." />
              <Input label="Full name" required defaultValue={user?.fullName} />
              <Input label="Email" type="email" required defaultValue={user?.email} />
              <Input label="Mobile" defaultValue={user?.mobile} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Defaults & preferences" />
            <CardBody className="space-y-3">
              <Select label="Company" required defaultValue={user?.defaultCompanyUid} options={companies.map((c) => ({ value: c.uid, label: c.legalName }))} />
              <Select label="Branch" defaultValue={user?.defaultBranchUid ?? ''} options={[{ value: '', label: '— none —' }, ...branches.map((b) => ({ value: b.uid, label: b.name }))]} />
              <Select label="Plant" defaultValue={user?.defaultPlantUid ?? ''} options={[{ value: '', label: '— none —' }, ...plants.map((p) => ({ value: p.uid, label: p.name }))]} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Language" defaultValue={user?.language} options={[{ value: 'en-IN', label: 'English (India)' }, { value: 'hi-IN', label: 'हिन्दी' }, { value: 'ta-IN', label: 'தமிழ்' }]} />
                <Select label="Timezone" defaultValue={user?.timezone} options={[{ value: 'Asia/Kolkata', label: 'Asia/Kolkata' }]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Date format" defaultValue={user?.dateFormat} options={[{ value: 'dd-MMM-yyyy', label: 'dd-MMM-yyyy' }, { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy' }, { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd' }]} />
                <Select label="Number format" defaultValue={user?.numberFormat} options={[{ value: 'IN', label: 'Indian (12,34,567)' }, { value: 'INTL', label: 'International (1,234,567)' }]} />
              </div>
              <Select label="Row-level rule" defaultValue={user?.rowRule}
                options={[{ value: 'ALL', label: 'All records within scope' }, { value: 'OWN', label: 'Own records only' }, { value: 'TEAM', label: 'Own team' }, { value: 'DEPARTMENT', label: 'Own department' }, { value: 'ASSIGNED_TERRITORY', label: 'Assigned territory' }]} />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          {sodWarn && (
            <Alert tone="warning" title="Segregation of duties — warning">
              The selected roles grant both <span className="font-mono">PROCUREMENT.PO.CREATE</span> and{' '}
              <span className="font-mono">PROCUREMENT.PO.APPROVE</span>. Self-approval is blocked by the
              workflow engine, so this is a warning rather than a block.
            </Alert>
          )}
          <Card>
            <CardHeader title="Assign roles" description="Permissions are granted to roles, never directly to a user." />
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {roles.map((r) => (
                <label key={r.uid} className="flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-brand-600"
                    checked={selectedRoles.includes(r.code)}
                    onChange={() => setSelectedRoles((s) => (s.includes(r.code) ? s.filter((x) => x !== r.code) : [...s, r.code]))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fg">{r.name}</span>
                      <span className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px] text-fg-muted">{r.code}</span>
                      {r.roleType === 'AUDIT' && <Badge tone="neutral" size="sm">read-only</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-fg-muted">{r.description}</p>
                  </div>
                  <span className="shrink-0 text-2xs text-fg-subtle tabular">{r.permissions.length} perms</span>
                </label>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Effective permissions preview" description={`${perms.size} permissions from ${selectedRoles.length} roles`} />
            <CardBody>
              <div className="flex flex-wrap gap-1">
                {[...perms].sort().slice(0, 40).map((p) => (
                  <span key={p} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{p}</span>
                ))}
                {perms.size > 40 && <span className="text-2xs text-fg-subtle">+{perms.size - 40} more</span>}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'scope' && (
        <div className="space-y-4">
          <Alert tone="info">
            Preview: this user would see approximately <strong>12,480 of 31,206</strong> purchase documents.
          </Alert>
          {[
            { title: 'Companies', items: companies.map((c) => ({ uid: c.uid, label: c.legalName })), sel: user?.scope.companies ?? [] },
            { title: 'Branches', items: branches.map((b) => ({ uid: b.uid, label: b.name })), sel: user?.scope.branches ?? [] },
            { title: 'Plants', items: plants.map((p) => ({ uid: p.uid, label: p.name })), sel: user?.scope.plants ?? [] },
            { title: 'Warehouses', items: warehouses.map((w) => ({ uid: w.uid, label: `${w.code} — ${w.name}` })), sel: user?.scope.warehouses ?? [] },
            { title: 'Cost centres', items: costCentres.map((c) => ({ uid: c.uid, label: `${c.code} — ${c.name}` })), sel: user?.scope.costCentres ?? [] },
          ].map((g) => (
            <Card key={g.title}>
              <CardHeader title={g.title} />
              <CardBody className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((i) => (
                  <Checkbox key={i.uid} label={i.label} defaultChecked={g.sel.includes(i.uid)} />
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'security' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Authentication" />
            <CardBody className="space-y-3.5">
              <Switch checked={mfaRequired} onChange={setMfaRequired} label="Require two-factor authentication (TOTP)" />
              <Switch checked={forcePwChange} onChange={setForcePwChange} label="Force password change at next sign-in" />
              <Switch checked={pinLogin} onChange={setPinLogin} label="Allow shop-floor PIN / badge login" />
              <Field label="Badge code" hint="Printed on the employee ID card; scanned at kiosks.">
                <Input placeholder="EMP1147" defaultValue={user?.employeeCode ?? ''} />
              </Field>
              <Field label="Max concurrent sessions" hint="Portal users are limited to 1 regardless.">
                <Input type="number" defaultValue={3} />
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Account actions" />
            <CardBody className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start" icon={<Mail className="h-4 w-4" />} onClick={() => toast.success('Reset link sent', `An email was sent to ${user?.email ?? 'the user'}.`)}>Send password reset link</Button>
              <Button variant="outline" size="sm" className="w-full justify-start" icon={<KeyRound className="h-4 w-4" />} onClick={() => toast.warning('MFA reset', 'The user is notified on their previous contact details too.')}>Reset two-factor authentication</Button>
              <Button variant="outline" size="sm" className="w-full justify-start" icon={<Smartphone className="h-4 w-4" />} onClick={() => toast.success('All sessions revoked', 'The user must sign in again on every device.')}>Sign out of all devices</Button>
              <Button variant="danger" size="sm" className="w-full justify-start" icon={<Ban className="h-4 w-4" />} onClick={() => toast.warning('Account deactivated', `${user?.fullName ?? 'The user'}'s sessions were revoked immediately.`)}>Deactivate account</Button>
              <Alert tone="info" className="mt-3">
                An administrator can never read or set a working password. Resets always go to the user.
              </Alert>
            </CardBody>
          </Card>
        </div>
      )}
    </Modal>
  )
}
