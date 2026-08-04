import { useMemo, useState } from 'react'
import { KeyRound, Plus, Shield, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Switch } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import { useCollection } from '@/store/data'
import { checkPassword, ipAllowed, isoDate, passwordAge } from '@/lib/platformFlow'
import { securityPolicy as seedPolicy } from '@/mock/platform'
import { users } from '@/mock/data'
import type { MfaMethod, SecurityPolicy } from '@/types/platform'
import type { User } from '@/types'

/**
 * Security policy (Volume 15, Ch 19).
 *
 * A policy screen that only stores settings is a form. This one shows what the
 * settings actually do: type a password and see whether it would be accepted,
 * type an address and see whether it would be let through, and see which users
 * the policy currently fails.
 */

export function SecurityPage() {
  const toast = useToast()
  const store = useCollection<SecurityPolicy>('plat:security', useMemo(() => [seedPolicy], []))
  const policy = store.rows[0] ?? seedPolicy
  const today = isoDate(new Date())

  const [tab, setTab] = useState('password')
  const [testPassword, setTestPassword] = useState('')
  const [testIp, setTestIp] = useState('10.20.5.17')
  const [addingRange, setAddingRange] = useState<'ALLOW' | 'DENY' | null>(null)
  const [rangeCidr, setRangeCidr] = useState('')
  const [rangeLabel, setRangeLabel] = useState('')

  const set = (patch: Partial<SecurityPolicy>) => store.update(policy.uid, patch)
  const setPassword = (patch: Partial<SecurityPolicy['password']>) => set({ password: { ...policy.password, ...patch } })
  const setSession = (patch: Partial<SecurityPolicy['session']>) => set({ session: { ...policy.session, ...patch } })

  /** A sample user, so the "would this be accepted" test is realistic. */
  const sampleUser = users[0]
  const check = useMemo(
    () => (testPassword ? checkPassword(testPassword, policy.password, { loginId: sampleUser.loginId, fullName: sampleUser.fullName }) : null),
    [testPassword, policy.password, sampleUser],
  )
  const ipCheck = useMemo(() => (testIp.trim() ? ipAllowed(testIp.trim(), policy) : null), [testIp, policy])

  /** Where each user stands against the policy as it is now. */
  const compliance = useMemo(
    () =>
      users.map((u) => {
        // Last login stands in for the last password change, which the user
        // record does not carry — flagged rather than silently assumed equal.
        const proxy = u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : null
        const age = passwordAge(proxy, policy.password, today)
        const mfaRequired = policy.mfaRequiredFor.includes(u.userType)
        return {
          user: u,
          age,
          mfaRequired,
          mfaGap: mfaRequired && !u.mfaEnabled,
          neverLoggedIn: !u.lastLoginAt,
          issues: [
            mfaRequired && !u.mfaEnabled ? 'MFA is required for this user type but is not switched on.' : null,
            age.expired ? `Password is ${age.ageDays} days old against a ${policy.password.expiryDays}-day limit.` : null,
            u.status === 'ACTIVE' && !u.lastLoginAt ? 'Active but has never signed in.' : null,
          ].filter(Boolean) as string[],
        }
      }),
    [policy, today],
  )

  const k = useMemo(() => ({
    mfaGaps: compliance.filter((c) => c.mfaGap).length,
    expired: compliance.filter((c) => c.age.expired).length,
    neverIn: compliance.filter((c) => c.neverLoggedIn && c.user.status === 'ACTIVE').length,
    withIssues: compliance.filter((c) => c.issues.length > 0).length,
    ranges: policy.ipAllowList.length + policy.ipDenyList.length,
  }), [compliance, policy])

  function addRange() {
    if (!rangeCidr.trim()) { toast.error('Enter a CIDR range, e.g. 10.20.0.0/16.'); return }
    if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(rangeCidr.trim())) { toast.error('That is not a valid IPv4 CIDR range.'); return }
    if (addingRange === 'ALLOW') {
      set({ ipAllowList: [...policy.ipAllowList, { cidr: rangeCidr.trim(), label: rangeLabel.trim() || 'Unnamed', appliesTo: 'INTERNAL' }] })
    } else {
      set({ ipDenyList: [...policy.ipDenyList, { cidr: rangeCidr.trim(), label: rangeLabel.trim() || 'Unnamed', reason: rangeLabel.trim() || 'Blocked' }] })
    }
    toast.success(`${rangeCidr.trim()} added to the ${addingRange === 'ALLOW' ? 'allow' : 'deny'} list`)
    setAddingRange(null); setRangeCidr(''); setRangeLabel('')
  }

  const complianceColumns: Column<(typeof compliance)[number]>[] = [
    { key: 'user', header: 'User', width: '18rem', render: (c) => (<><p className="text-xs text-fg">{c.user.fullName}</p><p className="font-mono text-2xs text-fg-subtle">{c.user.loginId}</p></>) },
    { key: 'type', header: 'Type', width: '13rem', render: (c) => <Badge tone="neutral" size="sm" dot={false}>{c.user.userType.replace(/_/g, ' ').toLowerCase()}</Badge> },
    { key: 'status', header: 'Status', width: '11rem', render: (c) => <Badge tone={c.user.status === 'ACTIVE' ? 'success' : c.user.status === 'SUSPENDED' ? 'danger' : 'neutral'} size="sm">{c.user.status.replace(/_/g, ' ').toLowerCase()}</Badge> },
    {
      key: 'mfa', header: 'MFA', width: '12rem',
      render: (c) => c.user.mfaEnabled
        ? <Badge tone="success" size="sm">On</Badge>
        : c.mfaRequired ? <Badge tone="danger" size="sm">Required, off</Badge> : <Badge tone="neutral" size="sm">Off</Badge>,
    },
    {
      key: 'age', header: 'Credential age', width: '14rem',
      render: (c) => c.age.ageDays === null
        ? <span className="text-2xs text-fg-subtle">Never signed in</span>
        : (
          <div className="flex items-center gap-2">
            <ProgressBar value={Math.min(100, (c.age.ageDays / Math.max(1, policy.password.expiryDays)) * 100)} tone={c.age.expired ? 'danger' : c.age.ageDays > policy.password.expiryDays * 0.8 ? 'warning' : 'success'} className="w-14" />
            <span className={cn('text-2xs tabular', c.age.expired ? 'text-danger' : 'text-fg-muted')}>{c.age.ageDays}d</span>
          </div>
        ),
    },
    { key: 'lastIn', header: 'Last sign-in', width: '11rem', render: (c) => <span className="text-2xs tabular text-fg-muted">{c.user.lastLoginAt ? formatDate(c.user.lastLoginAt.slice(0, 10)) : '—'}</span> },
    {
      key: 'issues', header: 'Against policy', width: '24rem',
      render: (c) => c.issues.length === 0
        ? <Badge tone="success" size="sm">Compliant</Badge>
        : <ul className="space-y-0.5">{c.issues.map((i) => (<li key={i} className="text-2xs text-danger">{i}</li>))}</ul>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Security policy"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Security' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'password', label: 'Passwords & sessions' },
              { id: 'network', label: 'Network & MFA', count: k.ranges },
              { id: 'compliance', label: 'Who fails the policy', count: k.withIssues },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Users failing policy" value={k.withIssues} sub={`of ${users.length} accounts`} icon={<ShieldAlert />} tone={k.withIssues ? 'danger' : 'success'} />
        <StatTile label="MFA gaps" value={k.mfaGaps} sub={k.mfaGaps ? 'Required by policy but not switched on' : 'Everyone required has it on'} tone={k.mfaGaps ? 'danger' : 'success'} />
        <StatTile label="Credentials past expiry" value={k.expired} sub={`Limit is ${policy.password.expiryDays} days`} tone={k.expired ? 'warning' : 'success'} />
        <StatTile label="Never signed in" value={k.neverIn} sub="Active accounts that have never been used" tone={k.neverIn ? 'warning' : 'success'} />
      </div>

      {/* ─────────────── Passwords & sessions ─────────────── */}
      {tab === 'password' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Password rules" description="Applied at every change and at first sign-in" />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Minimum length" type="number" value={String(policy.password.minLength)} onChange={(e) => setPassword({ minLength: Number(e.target.value) })} />
                <Input label="Expires after (days)" type="number" value={String(policy.password.expiryDays)} onChange={(e) => setPassword({ expiryDays: Number(e.target.value) })} hint="Nil means never" />
              </div>
              <div className="space-y-2 rounded border border-border bg-surface-2 p-3">
                <Switch label="Require a capital letter" checked={policy.password.requireUpper} onChange={(v) => setPassword({ requireUpper: v })} />
                <Switch label="Require a small letter" checked={policy.password.requireLower} onChange={(v) => setPassword({ requireLower: v })} />
                <Switch label="Require a digit" checked={policy.password.requireDigit} onChange={(v) => setPassword({ requireDigit: v })} />
                <Switch label="Require a symbol" checked={policy.password.requireSymbol} onChange={(v) => setPassword({ requireSymbol: v })} />
                <Switch label="Reject passwords containing the user's own name or login" checked={policy.password.disallowUserInfo} onChange={(v) => setPassword({ disallowUserInfo: v })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="No reuse of last" type="number" value={String(policy.password.historyCount)} onChange={(e) => setPassword({ historyCount: Number(e.target.value) })} hint="passwords" />
                <Input label="Lock after" type="number" value={String(policy.password.lockoutThreshold)} onChange={(e) => setPassword({ lockoutThreshold: Number(e.target.value) })} hint="failed attempts" />
                <Input label="Lock for (minutes)" type="number" value={String(policy.password.lockoutMinutes)} onChange={(e) => setPassword({ lockoutMinutes: Number(e.target.value) })} />
              </div>
              <Input
                label="Banned words"
                value={policy.password.bannedWords.join(', ')}
                onChange={(e) => setPassword({ bannedWords: e.target.value.split(',').map((w) => w.trim()).filter(Boolean) })}
                hint="Comma separated. Matched anywhere in the password, case-insensitively."
              />
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Try a password" description="Exactly the check a user's new password goes through" />
              <CardBody className="space-y-3">
                <Input
                  label="Password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  placeholder="Type something to see whether it would be accepted"
                  hint={`Checked against the policy above, for ${sampleUser.fullName} (${sampleUser.loginId})`}
                />
                {check && (
                  <>
                    <div>
                      <p className="mb-1 flex justify-between text-2xs">
                        <span className="text-fg-muted">Strength</span>
                        <span className={cn('font-medium', check.strength >= 65 ? 'text-success' : check.strength >= 45 ? 'text-warning' : 'text-danger')}>
                          {check.strengthLabel} · {check.strength}/100
                        </span>
                      </p>
                      <ProgressBar value={check.strength} tone={check.strength >= 65 ? 'success' : check.strength >= 45 ? 'warning' : 'danger'} />
                    </div>
                    {check.ok
                      ? <Alert tone="tip" title="Would be accepted">It satisfies every rule in the policy.</Alert>
                      : (
                        <Alert tone="danger" title={`Would be rejected — ${check.failures.length} rule${check.failures.length === 1 ? '' : 's'} not met`}>
                          <ul className="list-disc space-y-0.5 pl-4">{check.failures.map((f) => (<li key={f}>{f}</li>))}</ul>
                        </Alert>
                      )}
                    <p className="text-3xs text-fg-subtle">
                      Strength and compliance are different things: a password can satisfy every rule and still be weak, which is why both are shown.
                    </p>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Sessions" />
              <CardBody className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Idle timeout (min)" type="number" value={String(policy.session.idleTimeoutMinutes)} onChange={(e) => setSession({ idleTimeoutMinutes: Number(e.target.value) })} />
                  <Input label="Absolute limit (h)" type="number" value={String(policy.session.absoluteTimeoutHours)} onChange={(e) => setSession({ absoluteTimeoutHours: Number(e.target.value) })} />
                  <Input label="Concurrent sessions" type="number" value={String(policy.session.maxConcurrentSessions)} onChange={(e) => setSession({ maxConcurrentSessions: Number(e.target.value) })} />
                </div>
                <Switch
                  label="Re-authenticate before an approval or a payment release"
                  checked={policy.session.reauthForSensitive}
                  onChange={(v) => setSession({ reauthForSensitive: v })}
                />
                <p className="text-3xs text-fg-subtle">
                  An idle timeout shorter than a shift break means people are signed out mid-task; longer than one means an unattended terminal stays open.
                  {policy.session.idleTimeoutMinutes > 60 && ' 60 minutes or more is generous for a shop-floor terminal.'}
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* ─────────────── Network & MFA ─────────────── */}
      {tab === 'network' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader title="Multi-factor authentication" />
              <CardBody className="space-y-3">
                <div>
                  <p className="mb-1.5 text-2xs text-fg-muted">Required for these user types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['INTERNAL', 'PORTAL_SUPPLIER', 'PORTAL_CUSTOMER', 'SYSTEM', 'SHOPFLOOR'].map((t) => {
                      const on = policy.mfaRequiredFor.includes(t)
                      return (
                        <button
                          key={t} type="button"
                          onClick={() => set({ mfaRequiredFor: on ? policy.mfaRequiredFor.filter((x) => x !== t) : [...policy.mfaRequiredFor, t] })}
                          className={cn('rounded border px-2 py-1 text-2xs transition-colors', on ? 'border-brand-400 bg-brand-500/10 text-brand-600' : 'border-border text-fg-muted hover:border-border-strong')}
                        >{t.replace(/_/g, ' ').toLowerCase()}</button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-2xs text-fg-muted">Methods offered</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['TOTP', 'SMS', 'EMAIL'] as MfaMethod[]).map((m) => {
                      const on = policy.mfaMethods.includes(m)
                      return (
                        <button
                          key={m} type="button"
                          onClick={() => set({ mfaMethods: on ? policy.mfaMethods.filter((x) => x !== m) : [...policy.mfaMethods, m] })}
                          className={cn('rounded border px-2 py-1 text-2xs transition-colors', on ? 'border-brand-400 bg-brand-500/10 text-brand-600' : 'border-border text-fg-muted hover:border-border-strong')}
                        >{m}</button>
                      )
                    })}
                  </div>
                </div>
                {k.mfaGaps > 0 && (
                  <Alert tone="danger" title={`${k.mfaGaps} user${k.mfaGaps === 1 ? '' : 's'} required to use MFA do not have it on`}>
                    The requirement is set but not enforced on those accounts. Until it is, the policy is a statement rather than a control.
                  </Alert>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Encryption" />
              <CardBody>
                <DataGrid columns={2} items={[
                  { label: 'At rest', value: policy.encryptionAtRest },
                  { label: 'In transit', value: `${policy.tlsMinimum} minimum` },
                  { label: 'Passwords', value: 'Hashed, never stored or logged' },
                  { label: 'Secrets', value: 'Held in the secret store, not in configuration' },
                ]} />
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Try an address" description="Deny is evaluated first, then allow" />
              <CardBody className="space-y-3">
                <Input label="IP address" value={testIp} onChange={(e) => setTestIp(e.target.value)} placeholder="10.20.5.17" />
                {ipCheck && (
                  <Alert tone={ipCheck.allowed ? 'tip' : 'danger'} title={ipCheck.allowed ? 'Would be allowed' : 'Would be refused'}>
                    {ipCheck.reason}
                  </Alert>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Allowed ranges"
                description={policy.ipAllowList.length ? 'Only these may connect' : 'Empty — anywhere may connect'}
                actions={<Button variant="ghost" size="sm" icon={<Plus />} onClick={() => { setAddingRange('ALLOW'); setRangeCidr(''); setRangeLabel('') }}>Add</Button>}
              />
              <CardBody className="space-y-1">
                {policy.ipAllowList.length === 0 ? (
                  <Alert tone="warning" title="No allow-list">With nothing here, the application accepts connections from any address on the internet.</Alert>
                ) : policy.ipAllowList.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded border border-border p-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-fg">{a.cidr}</span>
                      <span className="block text-3xs text-fg-subtle">{a.label} · {a.appliesTo.toLowerCase()}</span>
                    </span>
                    <button type="button" aria-label="Remove" onClick={() => set({ ipAllowList: policy.ipAllowList.filter((_, j) => j !== i) })} className="rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Denied ranges"
                description="Checked before the allow-list, so a denial always wins"
                actions={<Button variant="ghost" size="sm" icon={<Plus />} onClick={() => { setAddingRange('DENY'); setRangeCidr(''); setRangeLabel('') }}>Add</Button>}
              />
              <CardBody className="space-y-1">
                {policy.ipDenyList.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">Nothing is explicitly blocked.</p>
                ) : policy.ipDenyList.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded border border-danger/40 bg-danger/5 p-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-fg">{a.cidr}</span>
                      <span className="block text-3xs text-fg-subtle">{a.reason}</span>
                    </span>
                    <button type="button" aria-label="Remove" onClick={() => set({ ipDenyList: policy.ipDenyList.filter((_, j) => j !== i) })} className="rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* ─────────────── Compliance ─────────────── */}
      {tab === 'compliance' && (
        <>
          <Alert tone="info" title="How credential age is measured here" className="mb-4">
            The user record does not carry a last-password-change date, so the last sign-in stands in for it. That makes this an indication rather than an audit —
            the real check belongs against the credential store. Everything else on this screen is exact.
          </Alert>

          <DataTable
            rows={compliance.slice().sort((a, b) => b.issues.length - a.issues.length)}
            columns={complianceColumns}
            rowKey={(c) => c.user.uid}
            searchable
            searchPlaceholder="Search by name or login"
            rowClassName={(c) => (c.mfaGap ? 'bg-danger/5' : c.issues.length ? 'bg-warning/5' : undefined)}
            emptyTitle="No users"
            emptyDescription="Nothing to check the policy against."
          />
        </>
      )}

      {/* ── add a range ──────────────────────────────────────── */}
      <Modal
        open={!!addingRange}
        onClose={() => setAddingRange(null)}
        title={addingRange === 'ALLOW' ? 'Allow a range' : 'Deny a range'}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setAddingRange(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={addRange}>Add</Button></>}
      >
        <div className="space-y-3">
          <Input label="CIDR range" required value={rangeCidr} onChange={(e) => setRangeCidr(e.target.value)} placeholder="10.20.0.0/16" autoFocus hint="IPv4. A /32 is a single address." />
          <Input label={addingRange === 'ALLOW' ? 'Label' : 'Reason'} value={rangeLabel} onChange={(e) => setRangeLabel(e.target.value)} placeholder={addingRange === 'ALLOW' ? 'Chennai plant LAN' : 'Repeated credential-stuffing attempts'} />
          {addingRange === 'ALLOW' && policy.ipAllowList.length === 0 && (
            <Alert tone="warning" title="This switches the allow-list on">
              With no allow-list, any address may connect. Adding the first range immediately refuses everything outside it — make sure this range covers the people who need to sign in.
            </Alert>
          )}
        </div>
      </Modal>
    </div>
  )
}
