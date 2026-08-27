import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { Checkbox, Input, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { IpRange, SecurityPolicy } from '@/api/security'
import { useSecurityPolicy, useUpdateSecurityPolicy } from '@/hooks/useSecurity'
import { useUsers } from '@/hooks/useIam'

/** Wired to the live backend security_policy. Saved settings are enforced by the
 *  server (password rules run at user-create and password-reset). */

const USER_TYPES = [
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'SHOPFLOOR', label: 'Shop floor' },
  { value: 'PORTAL_SUPPLIER', label: 'Portal — supplier' },
  { value: 'PORTAL_CUSTOMER', label: 'Portal — customer' },
  { value: 'SYSTEM', label: 'System / integration' },
]

type Form = Omit<SecurityPolicy, 'uid' | 'version'>

const BLANK: Form = {
  password_min_length: 8,
  password_require_upper: false,
  password_require_lower: true,
  password_require_number: true,
  password_require_symbol: false,
  password_expiry_days: 90,
  password_history_count: 3,
  block_identifiers_in_password: true,
  session_idle_minutes: 30,
  session_max_concurrent: 3,
  ip_allow_list: [],
  ip_deny_list: [],
  mfa_required_for: [],
}

/** Client-side mirror of the server password check (immediate feedback). */
function checkPassword(pw: string, f: Form): { ok: boolean; failures: string[] } {
  const failures: string[] = []
  if (pw.length < f.password_min_length) failures.push(`at least ${f.password_min_length} characters`)
  if (f.password_require_upper && !/[A-Z]/.test(pw)) failures.push('an uppercase letter')
  if (f.password_require_lower && !/[a-z]/.test(pw)) failures.push('a lowercase letter')
  if (f.password_require_number && !/\d/.test(pw)) failures.push('a number')
  if (f.password_require_symbol && !/[^A-Za-z0-9]/.test(pw)) failures.push('a symbol')
  return { ok: failures.length === 0, failures }
}

const CIDR_RE = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/

export function SecurityPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data: policy, isLoading, error, refetch } = useSecurityPolicy()
  const update = useUpdateSecurityPolicy()

  const [tab, setTab] = useState('password')
  const [form, setForm] = useState<Form>(BLANK)
  const [testPw, setTestPw] = useState('')

  useEffect(() => {
    if (policy) {
      const { uid: _u, version: _v, ...rest } = policy
      setForm(rest)
    }
  }, [policy])

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }))
  const pwCheck = useMemo(() => (testPw ? checkPassword(testPw, form) : null), [testPw, form])

  function save() {
    if (!policy) return
    update.mutate(
      { version: policy.version, ...form },
      {
        onSuccess: () => toast.success('Security policy saved', 'New passwords are checked against it immediately.'),
        onError: (e) =>
          toast.error(
            'Save failed',
            e instanceof ProblemError ? e.problem.detail : 'Could not save the policy.',
          ),
      },
    )
  }

  const toggleMfa = (t: string) =>
    set({
      mfa_required_for: form.mfa_required_for.includes(t)
        ? form.mfa_required_for.filter((x) => x !== t)
        : [...form.mfa_required_for, t],
    })

  return (
    <div>
      <PageHeader
        title="Security policy"
        description="Password strength, session limits, network allow/deny and MFA requirements. Enforced server-side."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & Ops' }, { label: 'Security policy' }]}
        badge={policy && <Badge tone="success">Live</Badge>}
        actions={<Button variant="primary" size="sm" icon={<ShieldCheck className="h-4 w-4" />} onClick={save} loading={update.isPending} disabled={!policy}>Save policy</Button>}
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'password', label: 'Passwords & sessions' },
            { id: 'network', label: 'Network & MFA', count: form.ip_allow_list.length + form.ip_deny_list.length },
            { id: 'compliance', label: 'MFA coverage' },
          ]} />
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load the security policy">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}
      {isLoading && <p className="py-10 text-center text-sm text-fg-subtle">Loading policy…</p>}

      {policy && tab === 'password' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Password policy" description="Enforced at user-create and password-reset." />
            <CardBody className="space-y-3.5">
              <Input label="Minimum length" type="number" min={4} max={64} value={form.password_min_length}
                onChange={(e) => set({ password_min_length: Number(e.target.value) })} />
              <div className="space-y-2.5">
                <Switch checked={form.password_require_lower} onChange={(v) => set({ password_require_lower: v })} label="Require a lowercase letter" />
                <Switch checked={form.password_require_upper} onChange={(v) => set({ password_require_upper: v })} label="Require an uppercase letter" />
                <Switch checked={form.password_require_number} onChange={(v) => set({ password_require_number: v })} label="Require a number" />
                <Switch checked={form.password_require_symbol} onChange={(v) => set({ password_require_symbol: v })} label="Require a symbol" />
                <Switch checked={form.block_identifiers_in_password} onChange={(v) => set({ block_identifiers_in_password: v })} label="Block login id / name inside the password" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Expiry (days, 0 = never)" type="number" min={0} max={365} value={form.password_expiry_days}
                  onChange={(e) => set({ password_expiry_days: Number(e.target.value) })} />
                <Input label="No-reuse history" type="number" min={0} max={24} value={form.password_history_count}
                  onChange={(e) => set({ password_history_count: Number(e.target.value) })} />
              </div>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Sessions" />
              <CardBody className="grid grid-cols-2 gap-3">
                <Input label="Idle timeout (min)" type="number" min={1} max={240} value={form.session_idle_minutes}
                  onChange={(e) => set({ session_idle_minutes: Number(e.target.value) })} />
                <Input label="Max concurrent" type="number" min={1} max={50} value={form.session_max_concurrent}
                  onChange={(e) => set({ session_max_concurrent: Number(e.target.value) })} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Test a password" description="Checks against the (unsaved) settings above." />
              <CardBody className="space-y-2.5">
                <Input label="Sample password" value={testPw} onChange={(e) => setTestPw(e.target.value)} placeholder="Type to test…" />
                {pwCheck && (
                  pwCheck.ok ? (
                    <p className="flex items-center gap-1.5 text-xs text-success"><Check className="h-3.5 w-3.5" /> Accepted by this policy.</p>
                  ) : (
                    <p className="flex items-start gap-1.5 text-xs text-danger"><X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Must contain {pwCheck.failures.join(', ')}.</p>
                  )
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {policy && tab === 'network' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <IpListCard title="IP allow-list" description="If any range is set, only these may reach the app." tone="allow"
            ranges={form.ip_allow_list} onChange={(r) => set({ ip_allow_list: r })} onError={toast.error} />
          <IpListCard title="IP deny-list" description="These ranges are always blocked." tone="deny"
            ranges={form.ip_deny_list} onChange={(r) => set({ ip_deny_list: r })} onError={toast.error} />
          <Card className="lg:col-span-2">
            <CardHeader title="Two-factor authentication" description="User types that must have MFA enabled." />
            <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {USER_TYPES.map((t) => (
                <Checkbox key={t.value} label={t.label} checked={form.mfa_required_for.includes(t.value)} onChange={() => toggleMfa(t.value)} />
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {policy && tab === 'compliance' && <MfaCoverage requiredFor={form.mfa_required_for} />}
    </div>
  )
}

/* ─────────────────────────── IP list editor ─────────────────────────── */
function IpListCard({
  title, description, tone, ranges, onChange, onError,
}: {
  title: string; description: string; tone: 'allow' | 'deny'
  ranges: IpRange[]; onChange: (r: IpRange[]) => void; onError: (t: string, d?: string) => void
}) {
  const [cidr, setCidr] = useState('')
  const [label, setLabel] = useState('')

  function add() {
    if (!CIDR_RE.test(cidr.trim())) { onError('Invalid range', 'Enter a valid IPv4 CIDR, e.g. 10.20.0.0/16.'); return }
    onChange([...ranges, { cidr: cidr.trim(), label: label.trim() || undefined }])
    setCidr(''); setLabel('')
  }

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-3">
        {ranges.length === 0 ? (
          <p className="text-xs text-fg-subtle">No ranges — {tone === 'allow' ? 'access is not IP-restricted.' : 'nothing blocked.'}</p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border">
            {ranges.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                <span className="font-mono text-xs text-fg">{r.cidr}</span>
                {r.label && <span className="text-2xs text-fg-subtle">· {r.label}</span>}
                <Button size="xs" variant="ghost" className="ml-auto" onClick={() => onChange(ranges.filter((_, x) => x !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Input label="CIDR" sizeVariant="sm" value={cidr} placeholder="10.20.0.0/16" onChange={(e) => setCidr(e.target.value)} />
          <Input label="Label" sizeVariant="sm" value={label} placeholder="HQ LAN" onChange={(e) => setLabel(e.target.value)} />
          <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={add}>Add</Button>
        </div>
      </CardBody>
    </Card>
  )
}

/* ─────────────────────────── MFA coverage ─────────────────────────── */
function MfaCoverage({ requiredFor }: { requiredFor: string[] }) {
  const usersQ = useUsers()
  const users = usersQ.data ?? []
  const subject = users.filter((u) => requiredFor.includes(u.user_type))

  return (
    <Card>
      <CardHeader
        title="Who the MFA requirement applies to"
        description={`${subject.length} of ${users.length} users fall under the current MFA-required types.`}
      />
      {requiredFor.length === 0 ? (
        <CardBody><Alert tone="info">No user types require MFA yet. Turn some on under Network & MFA.</Alert></CardBody>
      ) : usersQ.isLoading ? (
        <CardBody><p className="text-center text-xs text-fg-subtle">Loading users…</p></CardBody>
      ) : (
        <table className="grid-table">
          <thead><tr><th>User</th><th className="w-40">Type</th><th className="w-40">MFA required</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const req = requiredFor.includes(u.user_type)
              return (
                <tr key={u.uid}>
                  <td className="text-xs"><span className="text-fg">{u.full_name}</span> <span className="font-mono text-2xs text-fg-subtle">{u.login_id}</span></td>
                  <td><Badge tone="neutral" size="sm" dot={false}>{u.user_type.replace(/_/g, ' ').toLowerCase()}</Badge></td>
                  <td>{req ? <Badge tone="warning" size="sm">Required</Badge> : <span className="text-2xs text-fg-subtle">—</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className={cn('border-t border-border p-3')}>
        <Alert tone="info">
          Per-user MFA <em>enrollment</em> status (who has actually turned it on) is tracked once the
          authentication module ships; this view shows who the policy <em>applies</em> to.
        </Alert>
      </div>
    </Card>
  )
}
