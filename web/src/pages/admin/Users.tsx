import { useEffect, useMemo, useState } from 'react'
import { Ban, KeyRound, Pencil, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { collectErrors } from '@/lib/validate'
import { useSession } from '@/api/session'
import type { User } from '@/api/iam'
import {
  useUsers,
  useRoles,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
  useRestoreUser,
  useSetUserRoles,
  useResetPassword,
} from '@/hooks/useIam'

/** Live-wired against the FastAPI IAM module: create users, assign roles, reset. */

const USER_TYPES = [
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'SHOPFLOOR', label: 'Shop floor' },
  { value: 'PORTAL_SUPPLIER', label: 'Portal — supplier' },
  { value: 'PORTAL_CUSTOMER', label: 'Portal — customer' },
  { value: 'SYSTEM', label: 'System / integration' },
]

const statusTone = (s: string): 'success' | 'neutral' | 'warning' =>
  s === 'ACTIVE' ? 'success' : s === 'DEACTIVATED' ? 'neutral' : 'warning'

export function UsersPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const currentUserUid = useSession((s) => s.userUid)

  const usersQ = useUsers()
  const rows = usersQ.data ?? []

  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)

  const deactivateUser = useDeactivateUser()
  const restoreUser = useRestoreUser()

  function toggleActive(u: User) {
    const onError = (e: unknown) =>
      toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Could not change status.')
    if (u.status === 'ACTIVE') {
      deactivateUser.mutate(
        { uid: u.uid, version: u.version },
        { onSuccess: () => toast.success('User deactivated', `${u.full_name} can no longer sign in.`), onError },
      )
    } else {
      restoreUser.mutate(u.uid, {
        onSuccess: () => toast.success('User restored', `${u.full_name} is active again.`),
        onError,
      })
    }
    setConfirmToggle(null)
  }

  const columns: Column<User>[] = [
    {
      key: 'login_id',
      header: 'Login',
      sortable: true,
      width: '170px',
      render: (u) => (
        <div className="flex items-center gap-2">
          <Avatar name={u.full_name} size="sm" />
          <span className="font-mono text-xs text-fg">{u.login_id}</span>
        </div>
      ),
    },
    { key: 'full_name', header: 'Name', sortable: true, render: (u) => <span className="font-medium text-fg">{u.full_name}</span> },
    { key: 'email', header: 'Email', sortable: true, render: (u) => <span className="text-xs text-fg-muted">{u.email}</span> },
    {
      key: 'user_type',
      header: 'Type',
      width: '110px',
      render: (u) => <Badge tone="neutral" size="sm" dot={false}>{u.user_type.replace('PORTAL_', '').toLowerCase()}</Badge>,
    },
    {
      key: 'roles',
      header: 'Roles',
      accessor: (u) => u.roles.join(','),
      render: (u) =>
        u.roles.length ? (
          <div className="flex flex-wrap gap-1">
            {u.roles.slice(0, 3).map((r) => (
              <span key={r} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{r}</span>
            ))}
            {u.roles.length > 3 && <span className="text-[10px] text-fg-subtle">+{u.roles.length - 3}</span>}
          </div>
        ) : (
          <span className="text-xs text-fg-subtle">No roles</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '120px',
      accessor: (u) => u.status,
      render: (u) => <Badge tone={statusTone(u.status)} size="sm">{u.status.replace(/_/g, ' ').toLowerCase()}</Badge>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Users"
        description="Add users, assign roles and manage access. Users are never deleted — only deactivated."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Users' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New user
          </Button>
        }
      />

      {!companyUid && (
        <Alert tone="warning" title="Not signed in to the backend">
          Your API session has expired or is missing.{' '}
          <a href="/login" className="font-medium underline">Sign in again</a> to load users.
        </Alert>
      )}
      {usersQ.error && (
        <Alert tone="danger" title="Could not load users">
          {usersQ.error instanceof ProblemError ? usersQ.error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => usersQ.refetch()}>Retry</button>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(u) => u.uid}
        loading={usersQ.isLoading}
        searchPlaceholder="Name, login id or email…"
        onRowClick={(u) => setEditing(u)}
        emptyTitle="No users yet"
        emptyDescription="Add your first user and assign them a role."
        emptyAction={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New user
          </Button>
        }
        rowActions={(u) => (
          <>
            <MenuItem label="Edit" icon={<Pencil />} onClick={() => setEditing(u)} />
            <MenuItem label="Reset password" icon={<KeyRound />} separatorBefore onClick={() => setResetting(u)} />
            <MenuItem
              label={u.status === 'ACTIVE' ? 'Deactivate' : 'Restore'}
              icon={u.status === 'ACTIVE' ? <Ban /> : <RotateCcw />}
              danger={u.status === 'ACTIVE'}
              separatorBefore
              onClick={() => (u.status === 'ACTIVE' ? setConfirmToggle(u) : toggleActive(u))}
            />
          </>
        )}
      />

      <UserEditModal target={editing} onClose={() => setEditing(null)} />

      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />

      <ConfirmDialog
        open={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={() => confirmToggle && toggleActive(confirmToggle)}
        title={`Deactivate ${confirmToggle?.full_name}?`}
        confirmLabel="Deactivate user"
        tone="danger"
        loading={deactivateUser.isPending}
        message={
          confirmToggle?.uid === currentUserUid
            ? 'You cannot deactivate your own account.'
            : 'The account can no longer sign in. The user record is retained — deactivation is reversible.'
        }
      />
    </div>
  )
}

/* ─────────────────────────── Create / edit modal ─────────────────────────── */

function UserEditModal({ target, onClose }: { target: User | 'new' | null; onClose: () => void }) {
  const toast = useToast()
  const isNew = target === 'new'
  const user = isNew || !target ? null : target

  const rolesQ = useRoles()
  const allRoles = rolesQ.data ?? []
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const setUserRoles = useSetUserRoles()

  const [loginId, setLoginId] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [userType, setUserType] = useState('INTERNAL')
  const [roleCodes, setRoleCodes] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!target) return
    setErrors({})
    setPassword('')
    if (user) {
      setLoginId(user.login_id)
      setEmail(user.email)
      setFullName(user.full_name)
      setUserType(user.user_type)
      setRoleCodes(new Set(user.roles))
    } else {
      setLoginId('')
      setEmail('')
      setFullName('')
      setUserType('INTERNAL')
      setRoleCodes(new Set())
    }
  }, [target, user])

  const roleUidsFor = (codes: Set<string>) => allRoles.filter((r) => codes.has(r.code)).map((r) => r.uid)

  const busy = createUser.isPending || updateUser.isPending || setUserRoles.isPending

  function handleError(e: unknown, fallback: string) {
    if (e instanceof ProblemError) {
      const fe: Record<string, string> = {}
      for (const x of e.problem.errors ?? []) fe[x.field] = x.message
      setErrors(fe)
      toast.error(e.problem.title || fallback, e.problem.detail)
    } else {
      toast.error(fallback, 'Unknown error.')
    }
  }

  function submit() {
    setErrors({})
    // Level-1 (client) format checks that mirror the server rules.
    const fmt = collectErrors({ email: ['email', email] })
    if (isNew && loginId.trim() && !/^[A-Za-z0-9._@-]{3,80}$/.test(loginId.trim())) {
      fmt.login_id = 'Letters, digits and . _ - @ only (no spaces), 3–80 chars.'
    }
    if (Object.keys(fmt).length) {
      setErrors(fmt)
      return
    }
    if (isNew) {
      createUser.mutate(
        {
          login_id: loginId.trim(),
          email: email.trim(),
          full_name: fullName.trim(),
          password,
          user_type: userType,
          role_uids: roleUidsFor(roleCodes),
        },
        {
          onSuccess: (u) => {
            toast.success('User created', `${u.full_name} can now sign in as ${u.login_id}.`)
            onClose()
          },
          onError: (e) => handleError(e, 'Create failed'),
        },
      )
    } else if (user) {
      // Save profile, then reconcile roles (two endpoints: profile + role set).
      updateUser.mutate(
        {
          uid: user.uid,
          body: { version: user.version, full_name: fullName.trim(), email: email.trim(), user_type: userType },
        },
        {
          onSuccess: () => {
            const before = new Set(user.roles)
            const changed = before.size !== roleCodes.size || [...roleCodes].some((c) => !before.has(c))
            if (!changed) {
              toast.success('User updated', `${fullName} saved.`)
              onClose()
              return
            }
            setUserRoles.mutate(
              { uid: user.uid, roleUids: roleUidsFor(roleCodes) },
              {
                onSuccess: () => {
                  toast.success('User updated', `${fullName} saved with ${roleCodes.size} roles.`)
                  onClose()
                },
                onError: (e) => handleError(e, 'Saving roles failed'),
              },
            )
          },
          onError: (e) => handleError(e, 'Update failed'),
        },
      )
    }
  }

  if (!target) return null

  const canSubmit = isNew
    ? loginId.trim() && email.trim() && fullName.trim() && password.length >= 8
    : fullName.trim() && email.trim()

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'New user' : `Edit ${user?.full_name}`}
      description={isNew ? 'Set a starting password — the user can change it after signing in.' : user?.login_id}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!canSubmit}>
            {isNew ? 'Create user' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* autoComplete off/new-password stops the browser password manager from
            injecting the signed-in admin's own credentials into this create form. */}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Login ID" required value={loginId} error={errors.login_id} maxLength={80}
            autoComplete="off" disabled={!isNew} readOnlyReason={!isNew ? 'Immutable once created' : undefined}
            placeholder="ravi" onChange={(e) => setLoginId(e.target.value.trim())} />
          <Input label="Full name" required value={fullName} error={errors.full_name} maxLength={150}
            autoComplete="off" placeholder="Ravi Kumar" onChange={(e) => setFullName(e.target.value)} />
          <Input label="Email" type="email" required value={email} error={errors.email} maxLength={150}
            autoComplete="off" placeholder="ravi@company.com" onChange={(e) => setEmail(e.target.value)} />
          <Select label="User type" value={userType} onChange={(e) => setUserType(e.target.value)} options={USER_TYPES} />
          {isNew && (
            <Input label="Starting password" type="password" required containerClassName="sm:col-span-2"
              autoComplete="new-password" value={password} error={errors.password} maxLength={200}
              hint="At least 8 characters. The user should change it after first sign-in."
              onChange={(e) => setPassword(e.target.value)} />
          )}
        </div>

        <div>
          <p className="field-label mb-1.5">Roles</p>
          {rolesQ.isLoading ? (
            <p className="text-xs text-fg-subtle">Loading roles…</p>
          ) : allRoles.length === 0 ? (
            <Alert tone="info">No roles exist yet. Create a role first, then assign it here.</Alert>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-[12px] border border-border divide-y divide-border">
              {allRoles.map((r) => (
                <label key={r.uid} className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={roleCodes.has(r.code)}
                    onChange={() =>
                      setRoleCodes((s) => {
                        const n = new Set(s)
                        n.has(r.code) ? n.delete(r.code) : n.add(r.code)
                        return n
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fg">{r.name}</span>
                      <span className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px] text-fg-muted">{r.code}</span>
                      {!r.is_active && <Badge tone="neutral" size="sm">inactive</Badge>}
                    </span>
                  </span>
                  <span className="shrink-0 text-2xs tabular text-fg-subtle">{r.permission_count} perms</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ─────────────────────────── Reset password ─────────────────────────── */

function ResetPasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const toast = useToast()
  const resetPassword = useResetPassword()
  const [pw, setPw] = useState('')

  useEffect(() => {
    setPw('')
  }, [user])

  if (!user) return null

  function submit() {
    resetPassword.mutate(
      { uid: user!.uid, password: pw },
      {
        onSuccess: () => {
          toast.success('Password reset', `${user!.full_name} can sign in with the new password.`)
          onClose()
        },
        onError: (e) =>
          toast.error('Reset failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Reset password — ${user.full_name}`}
      description={user.login_id}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={resetPassword.isPending} disabled={pw.length < 8}>
            Set new password
          </Button>
        </>
      }
    >
      <Input label="New password" type="password" required value={pw} maxLength={200}
        hint="At least 8 characters." onChange={(e) => setPw(e.target.value)} />
    </Modal>
  )
}
