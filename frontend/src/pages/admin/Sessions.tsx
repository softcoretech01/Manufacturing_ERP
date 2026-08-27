import { useState } from 'react'
import { LogOut, Monitor, Smartphone, Tablet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody } from '@/components/ui/Card'
import { MenuItem } from '@/components/ui/Menu'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { Session } from '@/api/iam'
import { useSessions, useRevokeSession } from '@/hooks/useIam'

/** Active sessions are wired to the live DB-backed refresh-token sessions.
 * The device-registry and session-policy tabs are previews of subsystems that
 * do not have a backend yet (shop-floor device management, policy engine). */

const statusTone = (s: string): 'success' | 'neutral' | 'danger' =>
  s === 'ACTIVE' ? 'success' : s === 'REVOKED' ? 'danger' : 'neutral'

export function SessionsPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useSessions()
  const revoke = useRevokeSession()
  const sessions = data ?? []
  const [tab, setTab] = useState('sessions')

  function revokeSession(s: Session) {
    revoke.mutate(s.uid, {
      onSuccess: () => toast.success('Session revoked', `${s.user_name}'s session was terminated.`),
      onError: (e) => toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Could not revoke.'),
    })
  }

  const columns: Column<Session>[] = [
    {
      key: 'user_name',
      header: 'User',
      sortable: true,
      render: (s) => (
        <span className="flex items-center gap-2">
          <Avatar name={s.user_name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm text-fg">{s.user_name}</span>
            <span className="block truncate font-mono text-2xs text-fg-subtle">{s.user_login}</span>
          </span>
        </span>
      ),
    },
    { key: 'ip_address', header: 'IP address', width: '130px', render: (s) => <span className="font-mono text-[11px]">{s.ip_address ?? '—'}</span> },
    { key: 'issued_at', header: 'Started', sortable: true, width: '150px', render: (s) => formatDateTime(s.issued_at) },
    { key: 'expires_at', header: 'Expires', sortable: true, width: '130px', render: (s) => <span className="text-xs text-fg-muted">{formatTimeAgo(s.expires_at)}</span> },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '120px',
      accessor: (s) => s.status,
      render: (s) => (
        <span className="flex items-center gap-1.5">
          <Badge tone={statusTone(s.status)} size="sm">{s.status.toLowerCase()}</Badge>
          {s.is_current && <Badge tone="brand" size="sm">this session</Badge>}
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Sessions & devices"
        description="Live login sessions across the company. Device registry and session policy are previews of subsystems that are not built yet."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Sessions & devices' }]}
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'sessions', label: 'Active sessions', count: sessions.filter((s) => s.status === 'ACTIVE').length },
            { id: 'devices', label: 'Device registry' },
            { id: 'policy', label: 'Session policy' },
          ]} />
        }
      />

      {tab === 'sessions' && (
        <>
          {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
          {error && (
            <Alert tone="danger" title="Could not load sessions">
              {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
              <button className="underline" onClick={() => refetch()}>Retry</button>
            </Alert>
          )}
          <DataTable
            rows={sessions}
            columns={columns}
            rowKey={(s) => s.uid}
            loading={isLoading}
            searchPlaceholder="User or IP…"
            emptyTitle="No sessions"
            emptyDescription="Sessions appear here as users sign in."
            rowActions={(s) => (
              <MenuItem
                label="Revoke session"
                icon={<LogOut />}
                danger
                disabled={s.is_current || s.status !== 'ACTIVE'}
                onClick={() => revokeSession(s)}
              />
            )}
          />
          <p className="mt-2 text-2xs text-fg-subtle">
            Revoking a session invalidates its refresh token immediately; the user must sign in again.
            Your own current session cannot be revoked here.
          </p>
        </>
      )}

      {tab === 'devices' && (
        <Card>
          <CardBody className="py-10 text-center">
            <div className="mx-auto mb-3 flex w-fit gap-2 text-fg-subtle">
              <Smartphone className="h-5 w-5" /><Tablet className="h-5 w-5" /><Monitor className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-fg">Device registry — not yet available</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
              Registering shop-floor handhelds and kiosks for PIN/badge login needs the shop-floor
              device subsystem (a device master + kiosk auth), which isn't built yet. It will live here
              once that module lands.
            </p>
          </CardBody>
        </Card>
      )}

      {tab === 'policy' && (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-sm font-medium text-fg">Session policy — not yet available</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
              Idle timeout, absolute lifetime and concurrency limits need a policy store that the auth
              service reads and enforces. Today the backend uses fixed token lifetimes (15-min access,
              rotating refresh). Configurable policy is a future enhancement.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
