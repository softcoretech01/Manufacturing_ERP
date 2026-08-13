import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column, type FilterChip } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { cn } from '@/lib/cn'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useAuditLog, useAuditFilters } from '@/hooks/useIam'
import type { AuditEntry } from '@/api/iam'

/**
 * Audit trail (SRS V1-AUD). Read-only over the real `core_audit_log` — the app DB
 * user has no UPDATE/DELETE on that table (CLAUDE.md §5.3). Every module writes
 * here: logins, workflow decisions, IAM changes, numbering, org edits.
 */

const ACTION_TONE: Record<string, 'success' | 'progress' | 'pending' | 'danger' | 'warning' | 'neutral' | 'brand'> = {
  CREATE: 'success', UPDATE: 'progress', SUBMIT: 'pending', APPROVE: 'success',
  REJECT: 'danger', CANCEL: 'danger', DELETE: 'danger', RETURN: 'warning', AMEND: 'warning',
  LOGIN: 'neutral', LOGOUT: 'neutral', LOGIN_FAILED: 'danger', EXPORT: 'warning',
  PERMISSION_CHANGE: 'danger', REOPEN: 'danger', UNMASK: 'danger', IMPERSONATE: 'danger',
}
const SENSITIVE = new Set(['DELETE', 'PERMISSION_CHANGE', 'REOPEN', 'UNMASK', 'IMPERSONATE', 'EXPORT', 'CANCEL', 'REJECT'])

interface Change { field: string; old: unknown; new: unknown }

function diffOf(a: AuditEntry): Change[] {
  const oldV = a.old_values ?? {}
  const newV = a.new_values ?? {}
  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)])
  return [...keys].map((field) => ({ field, old: oldV[field], new: newV[field] }))
}

const fmtVal = (v: unknown): string =>
  v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function AuditPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [detail, setDetail] = useState<AuditEntry | null>(null)

  const filtersQ = useAuditFilters()
  const opts = filtersQ.data ?? { entities: [], actions: [], actors: [] }
  const params = useMemo(
    () => ({ entity_type: entity || undefined, action: action || undefined, actor: actor || undefined, from_date: fromDate || undefined, limit: 500 }),
    [entity, action, actor, fromDate],
  )
  const auditQ = useAuditLog(params)
  const rows = auditQ.data ?? []

  const chips: FilterChip[] = [
    ...(entity ? [{ key: 'e', label: 'Entity', value: entity, onRemove: () => setEntity('') }] : []),
    ...(action ? [{ key: 'a', label: 'Action', value: action, onRemove: () => setAction('') }] : []),
    ...(actor ? [{ key: 'u', label: 'User', value: actor, onRemove: () => setActor('') }] : []),
    ...(fromDate ? [{ key: 'd', label: 'From', value: fromDate, onRemove: () => setFromDate('') }] : []),
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'audit-trail', 'Audit trail', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const columns: Column<AuditEntry>[] = [
    { key: 'occurred_at', header: 'When', sortable: true, width: '150px', sticky: true, render: (a) => <span title={formatDateTime(a.occurred_at)}>{formatTimeAgo(a.occurred_at)}</span> },
    {
      key: 'actor_name', header: 'Who', sortable: true, width: '180px',
      render: (a) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar name={a.actor_name} size="xs" />
          <span className="truncate text-xs text-fg">{a.actor_name}</span>
        </div>
      ),
    },
    { key: 'action', header: 'Action', sortable: true, width: '150px', render: (a) => <Badge tone={ACTION_TONE[a.action] ?? 'neutral'} size="sm">{a.action.replace(/_/g, ' ').toLowerCase()}</Badge> },
    {
      key: 'entity', header: 'On what', width: '240px', accessor: (a) => a.document_no ?? a.entity_type,
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{a.document_no ?? a.entity_type}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{a.entity_type}{a.entity_uid ? ` · ${a.entity_uid.slice(0, 8)}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'changes', header: 'Changed', accessor: (a) => diffOf(a).length,
      render: (a) => {
        const ch = diffOf(a)
        return ch.length === 0 ? <span className="text-2xs text-fg-subtle">—</span> : (
          <span className="truncate text-2xs text-fg-muted">{ch.slice(0, 3).map((c) => c.field).join(', ')}{ch.length > 3 && ` +${ch.length - 3}`}</span>
        )
      },
    },
    { key: 'reason', header: 'Reason', width: '150px', render: (a) => (a.reason ? <Badge tone="warning" size="sm" dot={false}>{a.reason.slice(0, 20)}</Badge> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'channel', header: 'Channel', width: '100px', defaultHidden: true, render: (a) => <span className="text-2xs text-fg-muted">{a.channel}</span> },
    { key: 'ip_address', header: 'From', width: '130px', defaultHidden: true, render: (a) => <span className="font-mono text-2xs">{a.ip_address ?? '—'}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Append-only. The application database user has no UPDATE or DELETE privilege on this table — not as a policy, as a grant."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & ops' }, { label: 'Audit trail' }]}
        badge={<Badge tone="brand"><span className="flex items-center gap-1"><Lock className="h-3 w-3" /> immutable</span></Badge>}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {auditQ.error && (
        <Alert tone="danger" title="Could not load the audit trail">
          {auditQ.error instanceof ProblemError ? auditQ.error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => auditQ.refetch()}>Retry</button>
        </Alert>
      )}

      <Alert tone="info" className="mb-4" title="What is captured on every row">
        Who, when, from which IP and device, which entity and document, what action, the before and
        after values of only the fields that actually changed, the reason where one is mandated, and
        the request correlation id that ties the row to the application log and the distributed trace.
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.uid}
        loading={auditQ.isLoading}
        searchPlaceholder="Document no, entity, user or correlation id…"
        pageSize={25}
        onRowClick={setDetail}
        onExport={doExport}
        filterChips={chips}
        onClearFilters={() => { setEntity(''); setAction(''); setActor(''); setFromDate('') }}
        rowClassName={(a) => (SENSITIVE.has(a.action) ? 'bg-danger/[0.03]' : undefined)}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select sizeVariant="sm" value={entity} onChange={(e) => setEntity(e.target.value)} options={[{ value: '', label: 'All entities' }, ...opts.entities.map((e) => ({ value: e, label: e }))]} />
            <Select sizeVariant="sm" value={action} onChange={(e) => setAction(e.target.value)} options={[{ value: '', label: 'All actions' }, ...opts.actions.map((a) => ({ value: a, label: a }))]} />
            <Select sizeVariant="sm" value={actor} onChange={(e) => setActor(e.target.value)} options={[{ value: '', label: 'All users' }, ...opts.actors.map((u) => ({ value: u, label: u }))]} />
            <Input type="date" sizeVariant="sm" aria-label="From date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
        }
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.action.replace(/_/g, ' ')} — ${detail.document_no ?? detail.entity_type}` : undefined}
        description={detail?.entity_uid ?? undefined}
        width="max-w-2xl"
      >
        {detail && (() => {
          const changes = diffOf(detail)
          return (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['User', detail.actor_name],
                  ['When', formatDateTime(detail.occurred_at)],
                  ['Channel', detail.channel],
                  ['IP address', detail.ip_address ?? '—'],
                  ['Entity', detail.entity_type],
                  ['Correlation id', detail.correlation_id],
                ].map(([l, v]) => (
                  <div key={l} className="rounded border border-border p-2.5">
                    <p className="text-2xs uppercase tracking-wide text-fg-subtle">{l}</p>
                    <p className="mt-0.5 break-all font-mono text-xs text-fg">{v}</p>
                  </div>
                ))}
              </div>

              {detail.user_agent && (
                <div className="rounded border border-border p-2.5">
                  <p className="text-2xs uppercase tracking-wide text-fg-subtle">User agent</p>
                  <p className="mt-0.5 break-all text-2xs text-fg-muted">{detail.user_agent}</p>
                </div>
              )}

              {detail.reason && (
                <Alert tone="warning" title="Reason">{detail.reason}</Alert>
              )}

              {changes.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-fg">Field changes ({changes.length})</p>
                  <div className="overflow-hidden rounded border border-border">
                    <table className="grid-table">
                      <thead><tr><th className="w-40">Field</th><th>Before</th><th>After</th></tr></thead>
                      <tbody>
                        {changes.map((c, i) => (
                          <tr key={i}>
                            <td className="font-mono text-2xs text-fg">{c.field}</td>
                            <td className={cn('text-2xs', c.old == null ? 'text-fg-subtle' : 'text-danger line-through')}>{fmtVal(c.old)}</td>
                            <td className={cn('text-2xs', c.new == null ? 'text-fg-subtle' : 'text-success')}>{fmtVal(c.new)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-2xs text-fg-subtle">Only changed fields are stored — unchanged fields are absent rather than repeated.</p>
                </div>
              )}

              {SENSITIVE.has(detail.action) && (
                <Alert tone="danger" title="Sensitive action">
                  This class of action is reviewed in the periodic access review, and the entry cannot be amended or removed by anyone, including a system administrator.
                </Alert>
              )}
            </div>
          )
        })()}
      </Drawer>
    </div>
  )
}
