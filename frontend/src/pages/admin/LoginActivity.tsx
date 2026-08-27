import { useMemo, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { LoginEvent } from '@/api/iam'
import { useLoginActivity } from '@/hooks/useIam'

/** Wired to the audit log. The auth flow records LOGIN on a successful sign-in and
 * LOGOUT on sign-out. (LOGIN_FAILED auditing is a follow-up — a failed request
 * rolls back, so it needs a separate commit.) */

const actionTone = (a: string): 'success' | 'neutral' | 'danger' =>
  a === 'LOGIN' ? 'success' : a === 'LOGIN_FAILED' ? 'danger' : 'neutral'

export function LoginActivityPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useLoginActivity()
  const events = useMemo(() => data ?? [], [data])
  const [action, setAction] = useState('')

  const rows = action ? events.filter((e) => e.action === action) : events

  const columns: Column<LoginEvent>[] = [
    { key: 'occurred_at', header: 'Time', sortable: true, width: '170px', render: (e) => formatDateTime(e.occurred_at) },
    {
      key: 'actor_name',
      header: 'User',
      sortable: true,
      render: (e) => (
        <span className="flex items-center gap-2">
          <Avatar name={e.actor_name} size="sm" />
          <span className="text-sm text-fg">{e.actor_name}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Event',
      sortable: true,
      width: '150px',
      render: (e) => (
        <Badge tone={actionTone(e.action)} size="sm" dot={false}>
          {e.action === 'LOGIN' ? <LogIn className="mr-1 h-3 w-3" /> : e.action === 'LOGOUT' ? <LogOut className="mr-1 h-3 w-3" /> : null}
          {e.action.replace('_', ' ').toLowerCase()}
        </Badge>
      ),
    },
    { key: 'ip_address', header: 'IP address', width: '140px', render: (e) => <span className="font-mono text-[11px]">{e.ip_address ?? '—'}</span> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'login-activity', 'Login activity', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Login activity"
        description="Sign-in and sign-out events from the append-only audit log."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Login activity' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load login activity">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(e) => e.uid}
        loading={isLoading}
        searchPlaceholder="User or IP…"
        onExport={doExport}
        emptyTitle="No login activity yet"
        emptyDescription="Sign-in and sign-out events will appear here."
        filterPanel={
          <Select sizeVariant="sm" containerClassName="w-44" value={action} onChange={(e) => setAction(e.target.value)}
            options={[{ value: '', label: 'All events' }, { value: 'LOGIN', label: 'Login' }, { value: 'LOGOUT', label: 'Logout' }, { value: 'LOGIN_FAILED', label: 'Failed login' }]} />
        }
      />
    </div>
  )
}
