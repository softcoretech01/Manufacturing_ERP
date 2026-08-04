import { useMemo, useState } from 'react'
import { Fingerprint, Lock, ScrollText, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column, type FilterChip } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { cn } from '@/lib/cn'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { auditEntries } from '@/mock/data2'
import type { AuditEntry } from '@/types'

const ACTION_TONE: Record<string, 'success' | 'progress' | 'pending' | 'danger' | 'warning' | 'neutral' | 'brand'> = {
  CREATE: 'success',
  UPDATE: 'progress',
  SUBMIT: 'pending',
  APPROVE: 'success',
  REJECT: 'danger',
  CANCEL: 'danger',
  DELETE: 'danger',
  AMEND: 'warning',
  LOGIN: 'neutral',
  LOGOUT: 'neutral',
  EXPORT: 'warning',
  PERMISSION_CHANGE: 'danger',
  PERIOD_REOPEN: 'danger',
  OVERRIDE: 'danger',
}

/** Actions that a reviewer should always look at, regardless of who did them. */
const SENSITIVE = new Set(['DELETE', 'PERMISSION_CHANGE', 'PERIOD_REOPEN', 'OVERRIDE', 'EXPORT', 'CANCEL'])

export function AuditPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'audit-trail', 'Audit trail', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [user, setUser] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [detail, setDetail] = useState<AuditEntry | null>(null)

  const entities = useMemo(() => [...new Set(auditEntries.map((a) => a.entityType))].sort(), [])
  const actions = useMemo(() => [...new Set(auditEntries.map((a) => a.action))].sort(), [])
  const usersList = useMemo(() => [...new Set(auditEntries.map((a) => a.userName))].sort(), [])

  const rows = auditEntries.filter((a) => {
    if (entity && a.entityType !== entity) return false
    if (action && a.action !== action) return false
    if (user && a.userName !== user) return false
    if (fromDate && a.at < fromDate) return false
    return true
  })

  const chips: FilterChip[] = [
    ...(entity ? [{ key: 'e', label: 'Entity', value: entity, onRemove: () => setEntity('') }] : []),
    ...(action ? [{ key: 'a', label: 'Action', value: action, onRemove: () => setAction('') }] : []),
    ...(user ? [{ key: 'u', label: 'User', value: user, onRemove: () => setUser('') }] : []),
    ...(fromDate ? [{ key: 'd', label: 'From', value: fromDate, onRemove: () => setFromDate('') }] : []),
  ]

  const sensitiveCount = auditEntries.filter((a) => SENSITIVE.has(a.action)).length

  const columns: Column<AuditEntry>[] = [
    { key: 'at', header: 'When', sortable: true, width: '150px', sticky: true, render: (a) => <span title={formatDateTime(a.at)}>{formatTimeAgo(a.at)}</span> },
    {
      key: 'userName',
      header: 'Who',
      sortable: true,
      width: '180px',
      render: (a) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar name={a.userName} size="xs" />
          <div className="min-w-0">
            <p className="truncate text-xs text-fg">{a.userName}</p>
            <p className="truncate font-mono text-2xs text-fg-subtle">{a.roleCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      width: '150px',
      render: (a) => (
        <Badge tone={ACTION_TONE[a.action] ?? 'neutral'} size="sm">
          {a.action.replace(/_/g, ' ').toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'entity',
      header: 'On what',
      width: '230px',
      accessor: (a) => a.entityLabel,
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{a.entityLabel}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{a.documentNo ?? a.entityType}</p>
        </div>
      ),
    },
    {
      key: 'changes',
      header: 'Changed',
      accessor: (a) => a.changes.length,
      render: (a) =>
        a.changes.length === 0 ? (
          <span className="text-2xs text-fg-subtle">—</span>
        ) : (
          <span className="truncate text-2xs text-fg-muted">
            {a.changes.slice(0, 3).map((c) => c.field).join(', ')}
            {a.changes.length > 3 && ` +${a.changes.length - 3}`}
          </span>
        ),
    },
    { key: 'reasonCode', header: 'Reason', width: '150px', render: (a) => (a.reasonCode ? <Badge tone="warning" size="sm" dot={false}>{a.reasonCode}</Badge> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'channel', header: 'Channel', width: '100px', defaultHidden: true, render: (a) => <span className="text-2xs text-fg-muted">{a.channel}</span> },
    { key: 'ipAddress', header: 'From', width: '130px', defaultHidden: true, render: (a) => <span className="font-mono text-2xs">{a.ipAddress}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Append-only. The application database user has no UPDATE or DELETE privilege on this table — not as a policy, as a grant."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & ops' }, { label: 'Audit trail' }]}
        badge={<Badge tone="brand"><span className="flex items-center gap-1"><Lock className="h-3 w-3" /> immutable</span></Badge>}
      />

      <Alert tone="info" className="mb-4" title="What is captured on every row">
        Who, when, from which IP and device, which entity and document, what action, the before and
        after values of only the fields that actually changed, the reason code where one is
        mandated, and the request correlation id that ties the row to the application log and the
        distributed trace.
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.uid}
        searchPlaceholder="Document no, entity, user or correlation id…"
        pageSize={25}
        onRowClick={setDetail}
        onExport={doExport}
        filterChips={chips}
        onClearFilters={() => { setEntity(''); setAction(''); setUser(''); setFromDate('') }}
        rowClassName={(a) => (SENSITIVE.has(a.action) ? 'bg-danger/[0.03]' : undefined)}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select sizeVariant="sm" value={entity} onChange={(e) => setEntity(e.target.value)} options={[{ value: '', label: 'All entities' }, ...entities.map((e) => ({ value: e, label: e }))]} />
            <Select sizeVariant="sm" value={action} onChange={(e) => setAction(e.target.value)} options={[{ value: '', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: a }))]} />
            <Select sizeVariant="sm" value={user} onChange={(e) => setUser(e.target.value)} options={[{ value: '', label: 'All users' }, ...usersList.map((u) => ({ value: u, label: u }))]} />
            <Input type="date" sizeVariant="sm" aria-label="From date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
        }
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.action.replace(/_/g, ' ')} — ${detail.entityLabel}` : undefined}
        description={detail?.documentNo ?? undefined}
        width="max-w-2xl"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['User', detail.userName],
                ['Role at the time', detail.roleCode],
                ['When', formatDateTime(detail.at)],
                ['Channel', detail.channel],
                ['IP address', detail.ipAddress],
                ['Correlation id', detail.correlationId],
              ].map(([l, v]) => (
                <div key={l} className="rounded border border-border p-2.5">
                  <p className="text-2xs uppercase tracking-wide text-fg-subtle">{l}</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-fg">{v}</p>
                </div>
              ))}
            </div>

            <div className="rounded border border-border p-2.5">
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">User agent</p>
              <p className="mt-0.5 break-all text-2xs text-fg-muted">{detail.userAgent}</p>
            </div>

            {(detail.reasonCode || detail.comments) && (
              <Alert tone="warning" title={detail.reasonCode ? `Reason: ${detail.reasonCode}` : 'Comment'}>
                {detail.comments ?? 'No further comment recorded.'}
              </Alert>
            )}

            {detail.changes.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-fg">
                  Field changes ({detail.changes.length})
                </p>
                <div className="overflow-hidden rounded border border-border">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th className="w-40">Field</th>
                        <th>Before</th>
                        <th>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.changes.map((c, i) => (
                        <tr key={i}>
                          <td className="font-mono text-2xs text-fg">{c.field}</td>
                          <td className={cn('text-2xs', c.old == null ? 'text-fg-subtle' : 'text-danger line-through')}>
                            {c.old ?? '—'}
                          </td>
                          <td className={cn('text-2xs', c.new == null ? 'text-fg-subtle' : 'text-success')}>
                            {c.new ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-2xs text-fg-subtle">
                  Only changed fields are stored. Unchanged fields are absent rather than repeated —
                  that keeps the diff readable and the table small enough to keep for eight years.
                </p>
              </div>
            )}

            {SENSITIVE.has(detail.action) && (
              <Alert tone="danger" title="Sensitive action">
                This class of action is reviewed as part of the periodic access review. It cannot be
                performed without a reason code, and the entry cannot be amended or removed by
                anyone, including a system administrator.
              </Alert>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
