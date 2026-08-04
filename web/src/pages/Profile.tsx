import { useState } from 'react'
import {
  KeyRound,
  LogOut,
  Monitor,
  Shield,
  ShieldCheck,
  Smartphone,
  UserCog,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardFooter, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, Avatar, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatDateTime, formatTimeAgo } from '@/lib/format'
import { branches, companies, daysAgo, daysAhead, plants, roles, sessions } from '@/mock/data'
import { useActiveContext, useCurrentUser, usePermissions } from '@/store/auth'
import { useUi } from '@/store/ui'

/** Password strength is scored client-side for feedback only; the server re-scores. */
function scorePassword(pw: string) {
  let score = 0
  if (pw.length >= 12) score += 30
  else if (pw.length >= 8) score += 15
  if (/[a-z]/.test(pw)) score += 15
  if (/[A-Z]/.test(pw)) score += 15
  if (/\d/.test(pw)) score += 15
  if (/[^A-Za-z0-9]/.test(pw)) score += 20
  if (/(.)\1\1/.test(pw)) score -= 15
  return Math.max(0, Math.min(100, score))
}

export function ProfilePage() {
  const toast = useToast()
  const user = useCurrentUser()
  const { company, branch, plant, fy } = useActiveContext()
  const { roles: heldRoles, allowed, denied } = usePermissions()
  const { density, setDensity, theme, setTheme } = useUi()

  const [tab, setTab] = useState('overview')
  const [pwOpen, setPwOpen] = useState(false)
  const [mfaOpen, setMfaOpen] = useState(false)
  const [newPw, setNewPw] = useState('')

  if (!user) return null

  const mySessions = sessions.filter((s) => s.userUid === user.uid)
  const strength = scorePassword(newPw)

  return (
    <div>
      <PageHeader
        title="My profile"
        description="Your identity, access and preferences. Roles and scope are granted by an administrator and are shown here read-only."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'My profile' }]}
        badge={<StatusBadge status={user.status} />}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'access', label: 'My access', count: allowed.size },
              { id: 'security', label: 'Security' },
              { id: 'preferences', label: 'Preferences' },
            ]}
          />
        }
      />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Identity" icon={<UserCog className="h-4 w-4" />} />
            <CardBody>
              <div className="mb-4 flex items-center gap-3">
                <Avatar name={user.fullName} size="lg" />
                <div className="min-w-0">
                  <p className="text-base font-semibold text-fg">{user.fullName}</p>
                  <p className="text-xs text-fg-muted">
                    {user.designation} · {user.department}
                  </p>
                </div>
              </div>
              <DataGrid
                columns={2}
                items={[
                  { label: 'Login id', value: user.loginId, mono: true },
                  { label: 'Employee code', value: user.employeeCode ?? '—', mono: true },
                  { label: 'Email', value: user.email },
                  { label: 'Mobile', value: user.mobile },
                  { label: 'User type', value: user.userType },
                  { label: 'Reports to', value: user.reportsTo || '—' },
                  { label: 'Locale', value: `${user.language} · ${user.timezone}` },
                  { label: 'Last login', value: formatTimeAgo(user.lastLoginAt) },
                ]}
              />
            </CardBody>
            <CardFooter>
              <span className="text-2xs text-fg-subtle">
                Name, email and mobile are sourced from the HR employee record — raise an HR change
                request to amend them.
              </span>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader title="Working context" description="Applies to every document you create" />
            <CardBody className="space-y-1">
              <DataGrid
                columns={1}
                items={[
                  { label: 'Company', value: company.tradeName },
                  { label: 'Branch', value: branch?.name ?? '—' },
                  { label: 'Plant', value: plant?.name ?? '—' },
                  { label: 'Financial year', value: fy.code },
                ]}
              />
              <p className="pt-2 text-2xs text-fg-subtle">
                Switch context from the header. Documents are stamped with the context active at
                the moment of creation and cannot be moved between companies afterwards.
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'access' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Roles held" description="Permissions come from roles, never directly" />
            <CardBody className="space-y-2">
              {heldRoles.map((r) => (
                <div key={r.uid} className="rounded border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg">{r.name}</span>
                    <Badge tone={r.roleType === 'SYSTEM' ? 'brand' : 'neutral'} size="sm" dot={false}>
                      {r.roleType.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-0.5 font-mono text-2xs text-fg-subtle">{r.code}</p>
                  <p className="mt-1 text-xs text-fg-muted">{r.description}</p>
                  <p className="mt-1.5 text-2xs text-fg-subtle">
                    {r.permissions.length} permissions
                    {r.deniedPermissions.length > 0 && ` · ${r.deniedPermissions.length} denials`}
                  </p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title="Effective permissions"
              description={`${allowed.size} granted${denied.size ? `, ${denied.size} explicitly denied` : ''}`}
              actions={
                <Button variant="outline" size="sm" onClick={() => toast.info('Export queued', 'Your effective permission set will be emailed as XLSX.')}>
                  Export
                </Button>
              }
            />
            <CardBody>
              {denied.size > 0 && (
                <Alert tone="warning" className="mb-3" title="Explicit denials apply to you">
                  A denial always beats a grant. Even though a role grants these, you cannot perform
                  them: {[...denied].slice(0, 6).join(', ')}
                  {denied.size > 6 && ` +${denied.size - 6} more`}.
                </Alert>
              )}
              <div className="max-h-96 overflow-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Permission</th>
                      <th>Effective</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...allowed].sort().map((p) => (
                      <tr key={p}>
                        <td className="font-mono text-2xs">{p}</td>
                        <td className="w-24">
                          {denied.has(p) ? (
                            <Badge tone="danger" size="sm">Denied</Badge>
                          ) : (
                            <Badge tone="success" size="sm">Allowed</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Password" icon={<KeyRound className="h-4 w-4" />} />
            <CardBody className="space-y-1">
              <DataGrid
                columns={1}
                items={[
                  { label: 'Last changed', value: formatDate(daysAgo(41)) },
                  { label: 'Expires', value: formatDate(daysAhead(49)) },
                  { label: 'Policy', value: 'Min 12 chars, 3 of 4 character classes, last 5 reused blocked' },
                ]}
              />
            </CardBody>
            <CardFooter>
              <span className="text-2xs text-fg-subtle">Changing your password signs out all other sessions.</span>
              <Button size="sm" onClick={() => setPwOpen(true)}>Change password</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader title="Two-factor authentication" icon={<ShieldCheck className="h-4 w-4" />} />
            <CardBody>
              <div className="flex items-start gap-3">
                <Shield className={user.mfaEnabled ? 'mt-0.5 h-5 w-5 text-success' : 'mt-0.5 h-5 w-5 text-warning'} />
                <div>
                  <p className="text-sm font-medium text-fg">
                    {user.mfaEnabled ? 'Enabled — authenticator app' : 'Not enabled'}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {user.mfaEnabled
                      ? 'A six-digit code is required at every login from an unrecognised device.'
                      : 'Two-factor is mandatory for any role that can approve financial documents.'}
                  </p>
                </div>
              </div>
            </CardBody>
            <CardFooter>
              <span className="text-2xs text-fg-subtle">Recovery codes are shown once at setup.</span>
              <Button size="sm" variant={user.mfaEnabled ? 'outline' : 'primary'} onClick={() => setMfaOpen(true)}>
                {user.mfaEnabled ? 'Reconfigure' : 'Enable 2FA'}
              </Button>
            </CardFooter>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title="Active sessions"
              description="Anything you do not recognise should be revoked immediately"
              actions={
                <Button variant="outline" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => toast.success('Other sessions revoked')}>
                  Sign out everywhere else
                </Button>
              }
            />
            <CardBody className="space-y-2">
              {mySessions.length === 0 && <p className="text-xs text-fg-muted">No other active sessions.</p>}
              {mySessions.map((s) => (
                <div key={s.uid} className="flex items-center justify-between gap-3 rounded border border-border p-2.5">
                  <div className="flex items-center gap-2.5">
                    {s.channel === 'MOBILE' || s.channel === 'KIOSK' ? (
                      <Smartphone className="h-4 w-4 text-fg-subtle" />
                    ) : (
                      <Monitor className="h-4 w-4 text-fg-subtle" />
                    )}
                    <div>
                      <p className="text-xs font-medium text-fg">
                        {s.device} · {s.location}
                      </p>
                      <p className="text-2xs text-fg-subtle">
                        {s.ipAddress} · started {formatDateTime(s.startedAt)} · last seen {formatTimeAgo(s.lastActivityAt)}
                      </p>
                    </div>
                  </div>
                  {s.isCurrent ? (
                    <Badge tone="success" size="sm">This device</Badge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => toast.success('Session revoked')}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'preferences' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Appearance" />
            <CardBody className="space-y-3.5">
              <Select
                label="Theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                options={[
                  { value: 'system', label: 'Match system' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
              <Select
                label="Table density"
                value={density}
                onChange={(e) => setDensity(e.target.value as 'comfortable' | 'compact')}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact — more rows per screen' },
                ]}
                hint="Shop-floor terminals default to comfortable for gloved operation."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notifications" description="Mandatory notifications cannot be switched off" />
            <CardBody className="space-y-3">
              {[
                ['Approval requests assigned to me', true, true],
                ['My document was approved or rejected', true, true],
                ['Approval overdue escalations', true, true],
                ['Daily digest email', true, false],
                ['Stock and reorder alerts', false, false],
                ['Maintenance due reminders', false, false],
              ].map(([label, on, mandatory]) => (
                <div key={label as string} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-fg">
                    {label as string}
                    {(mandatory as boolean) && (
                      <span className="ml-2 text-2xs text-fg-subtle">mandatory</span>
                    )}
                  </span>
                  <Switch checked={on as boolean} disabled={mandatory as boolean} onChange={() => toast.success('Preference saved')} />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Change password"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={strength < 60}
              onClick={() => {
                toast.success('Password changed', 'All other sessions have been signed out.')
                setPwOpen(false)
                setNewPw('')
              }}
            >
              Change password
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input label="Current password" type="password" required autoComplete="current-password" />
          <div>
            <Input
              label="New password"
              type="password"
              required
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
            {newPw && (
              <div className="mt-2">
                <ProgressBar
                  value={strength}
                  showLabel
                  tone={strength >= 80 ? 'success' : strength >= 60 ? 'warning' : 'danger'}
                />
                <p className="mt-1 text-2xs text-fg-subtle">
                  {strength >= 80 ? 'Strong' : strength >= 60 ? 'Acceptable' : 'Too weak — needs length and character variety'}
                </p>
              </div>
            )}
          </div>
          <Input label="Confirm new password" type="password" required autoComplete="new-password" />
          <Alert tone="info">
            The last 5 passwords cannot be reused, and the new password must differ from the current
            one by more than a trailing digit.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={mfaOpen}
        onClose={() => setMfaOpen(false)}
        title="Two-factor authentication"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setMfaOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Two-factor enabled'); setMfaOpen(false) }}>
              Verify and enable
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="flex justify-center">
            <div className="grid h-40 w-40 grid-cols-8 gap-px rounded border border-border bg-surface-3 p-2">
              {Array.from({ length: 64 }, (_, i) => (
                <span key={i} className={(i * 7 + (i % 5)) % 3 === 0 ? 'bg-fg' : 'bg-transparent'} />
              ))}
            </div>
          </div>
          <p className="text-center text-xs text-fg-muted">
            Scan with Google Authenticator, Microsoft Authenticator or Authy.
          </p>
          <Input label="Enter the 6-digit code" required inputMode="numeric" maxLength={6} placeholder="000000" className="text-center font-mono tracking-[0.4em]" />
          <Alert tone="warning" title="Save your recovery codes">
            Ten single-use recovery codes are issued once when you enable two-factor. Store them
            offline — support cannot retrieve them for you.
          </Alert>
        </div>
      </Modal>

      <p className="mt-4 text-2xs text-fg-subtle">
        Roles held: {heldRoles.map((r) => r.code).join(', ') || '—'} · defined in{' '}
        {roles.length} role definitions · company {companies.length}, branches {branches.length},
        plants {plants.length}
      </p>
    </div>
  )
}
