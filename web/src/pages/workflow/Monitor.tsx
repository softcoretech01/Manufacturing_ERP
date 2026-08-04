import { useMemo, useState } from 'react'
import { AlertTriangle, GaugeCircle, RefreshCw, Timer, UserCog, Zap } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type Column, type FilterChip } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, Avatar, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDateTime, formatTimeAgo } from '@/lib/format'
import { approvalTasks } from '@/mock/data2'
import { users } from '@/mock/data'
import type { ApprovalTask } from '@/types'

/** Hours a task has been sitting with its current approver. */
function ageHours(t: ApprovalTask) {
  return Math.max(0, Math.round((Date.now() - new Date(t.assignedAt).getTime()) / 3_600_000))
}

function slaTone(t: ApprovalTask): 'success' | 'warning' | 'danger' {
  if (t.isOverdue) return 'danger'
  const remaining = (new Date(t.dueAt).getTime() - Date.now()) / 3_600_000
  return remaining < 8 ? 'warning' : 'success'
}

export function WorkflowMonitorPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'workflow-monitor', 'Workflow monitor', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('instances')
  const [docType, setDocType] = useState('')
  const [slaFilter, setSlaFilter] = useState('')
  const [approver, setApprover] = useState('')
  const [detail, setDetail] = useState<ApprovalTask | null>(null)
  const [reassign, setReassign] = useState<ApprovalTask | null>(null)

  const docTypes = useMemo(
    () => [...new Set(approvalTasks.map((t) => t.documentType))].sort(),
    [],
  )
  const approvers = useMemo(
    () => [...new Set(approvalTasks.map((t) => t.requester))].sort(),
    [],
  )

  const rows = approvalTasks.filter((t) => {
    if (docType && t.documentType !== docType) return false
    if (approver && t.requester !== approver) return false
    if (slaFilter === 'overdue' && !t.isOverdue) return false
    if (slaFilter === 'at-risk' && slaTone(t) !== 'warning') return false
    if (slaFilter === 'stalled' && ageHours(t) < 48) return false
    return true
  })

  const chips: FilterChip[] = [
    ...(docType ? [{ key: 'dt', label: 'Type', value: docType, onRemove: () => setDocType('') }] : []),
    ...(slaFilter ? [{ key: 'sla', label: 'SLA', value: slaFilter, onRemove: () => setSlaFilter('') }] : []),
    ...(approver ? [{ key: 'ap', label: 'Requester', value: approver, onRemove: () => setApprover('') }] : []),
  ]

  const overdue = approvalTasks.filter((t) => t.isOverdue)
  const stalled = approvalTasks.filter((t) => ageHours(t) >= 48)
  const avgAge = Math.round(approvalTasks.reduce((s, t) => s + ageHours(t), 0) / (approvalTasks.length || 1))

  const byType = docTypes.map((dt) => {
    const set = approvalTasks.filter((t) => t.documentType === dt)
    return {
      type: dt,
      total: set.length,
      overdue: set.filter((t) => t.isOverdue).length,
      avgAge: Math.round(set.reduce((s, t) => s + ageHours(t), 0) / (set.length || 1)),
    }
  })

  const bottlenecks = useMemo(() => {
    const map = new Map<string, { level: string; count: number; overdue: number; totalAge: number }>()
    for (const t of approvalTasks) {
      const key = `${t.documentLabel} · ${t.levelName}`
      const e = map.get(key) ?? { level: key, count: 0, overdue: 0, totalAge: 0 }
      e.count += 1
      if (t.isOverdue) e.overdue += 1
      e.totalAge += ageHours(t)
      map.set(key, e)
    }
    return [...map.values()]
      .map((e) => ({ ...e, avgAge: Math.round(e.totalAge / e.count) }))
      .sort((a, b) => b.avgAge - a.avgAge)
  }, [])

  const columns: Column<ApprovalTask>[] = [
    {
      key: 'documentNo',
      header: 'Document',
      sortable: true,
      width: '190px',
      sticky: true,
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium text-fg">{t.documentNo}</p>
          <p className="truncate text-2xs text-fg-subtle">{t.documentLabel}</p>
        </div>
      ),
    },
    { key: 'subject', header: 'Subject', render: (t) => <span className="truncate text-xs">{t.subject}</span> },
    {
      key: 'amount',
      header: 'Value',
      align: 'right',
      sortable: true,
      width: '120px',
      accessor: (t) => t.amount ?? 0,
      render: (t) => (t.amount == null ? <span className="text-fg-subtle">—</span> : formatCurrency(t.amount, t.currency)),
    },
    {
      key: 'level',
      header: 'Stage',
      width: '160px',
      accessor: (t) => t.levelNo,
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{t.levelName}</p>
          <ProgressBar value={(t.levelNo - 1) / t.totalLevels} max={1} height="h-1" className="mt-1" tone="brand" />
          <p className="mt-0.5 text-2xs text-fg-subtle">
            level {t.levelNo} of {t.totalLevels}
          </p>
        </div>
      ),
    },
    { key: 'requester', header: 'Raised by', width: '150px', render: (t) => (
      <span className="flex items-center gap-1.5">
        <Avatar name={t.requester} size="xs" />
        <span className="truncate text-xs">{t.requester}</span>
      </span>
    ) },
    {
      key: 'age',
      header: 'Waiting',
      align: 'right',
      sortable: true,
      width: '110px',
      accessor: (t) => ageHours(t),
      render: (t) => {
        const h = ageHours(t)
        return (
          <span className={h >= 48 ? 'font-medium text-danger tabular' : 'text-fg-muted tabular'}>
            {h < 24 ? `${h} h` : `${Math.round(h / 24)} d`}
          </span>
        )
      },
    },
    {
      key: 'sla',
      header: 'SLA',
      width: '130px',
      accessor: (t) => (t.isOverdue ? 0 : new Date(t.dueAt).getTime()),
      render: (t) => {
        const tone = slaTone(t)
        return (
          <Badge tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'success'} size="sm">
            {t.isOverdue ? 'Breached' : tone === 'warning' ? 'At risk' : 'On track'}
          </Badge>
        )
      },
    },
    { key: 'status', header: 'Status', width: '130px', render: (t) => <StatusBadge status={t.status === 'PENDING' ? 'PENDING_APPROVAL' : t.status} size="sm" /> },
    {
      key: 'warnings',
      header: '',
      width: '48px',
      align: 'center',
      accessor: (t) => t.warnings.length,
      render: (t) =>
        t.warnings.length > 0 ? (
          <span title={t.warnings.join('\n')} className="inline-flex text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Workflow monitor"
        description="Every approval currently in flight across the company. Administrators can see, escalate and reassign work that is stuck — approving it is still the approver's job."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Workflow' }, { label: 'Monitor' }]}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => toast.success('Refreshed')}>
            Refresh
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'instances', label: 'In flight', count: approvalTasks.length },
              { id: 'bottlenecks', label: 'Bottlenecks' },
              { id: 'throughput', label: 'Throughput' },
            ]}
          />
        }
      />

      {overdue.length > 0 && (
        <Alert
          tone="danger"
          className="mb-4"
          title={`${overdue.length} approval${overdue.length > 1 ? 's have' : ' has'} breached its SLA`}
          action={
            <Button size="sm" variant="danger" onClick={() => toast.success('Escalation sent', 'Escalation notices dispatched to the configured escalation path.')}>
              Escalate all
            </Button>
          }
        >
          Escalation follows the path configured on the approval rule — it does not auto-approve.
          Nothing is ever approved by the passage of time.
        </Alert>
      )}

      {tab === 'instances' && (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(t) => t.uid}
          searchPlaceholder="Document no, subject or requester…"
          filterChips={chips}
          onClearFilters={() => { setDocType(''); setSlaFilter(''); setApprover('') }}
          onRowClick={setDetail}
          onExport={doExport}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                sizeVariant="sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                options={[{ value: '', label: 'All document types' }, ...docTypes.map((d) => ({ value: d, label: d }))]}
              />
              <Select
                sizeVariant="sm"
                value={slaFilter}
                onChange={(e) => setSlaFilter(e.target.value)}
                options={[
                  { value: '', label: 'Any SLA state' },
                  { value: 'overdue', label: 'Breached' },
                  { value: 'at-risk', label: 'At risk (< 8 h)' },
                  { value: 'stalled', label: 'Stalled > 48 h' },
                ]}
              />
              <Select
                sizeVariant="sm"
                value={approver}
                onChange={(e) => setApprover(e.target.value)}
                options={[{ value: '', label: 'Any requester' }, ...approvers.map((a) => ({ value: a, label: a }))]}
              />
            </div>
          }
          rowClassName={(t) => (t.isOverdue ? 'bg-danger/[0.03]' : undefined)}
          rowActions={(t) => (
            <>
              <MenuItem label="Open document" onClick={() => setDetail(t)} />
              <MenuItem label="Reassign approver" icon={<UserCog className="h-3.5 w-3.5" />} onClick={() => setReassign(t)} />
              <MenuItem label="Send reminder" onClick={() => toast.success('Reminder sent')} />
              <MenuItem label="Escalate now" onClick={() => toast.success('Escalated')} />
              <MenuItem label="Force close" danger onClick={() => toast.warning('Approval force-closed', `${t.documentNo} was force-closed and the action recorded on the audit trail.`)} />
            </>
          )}
          emptyTitle="Nothing in flight"
          emptyDescription="No approvals match the current filters."
        />
      )}

      {tab === 'bottlenecks' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Slowest approval stages" description="Average wait time by document type and level" />
            <CardBody className="space-y-3">
              {bottlenecks.map((b) => (
                <div key={b.level}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-fg">{b.level}</span>
                    <span className="shrink-0 text-fg-muted tabular">
                      {b.avgAge} h avg · {b.count} waiting
                      {b.overdue > 0 && <span className="ml-1.5 text-danger">· {b.overdue} breached</span>}
                    </span>
                  </div>
                  <ProgressBar
                    value={b.avgAge}
                    max={Math.max(72, ...bottlenecks.map((x) => x.avgAge))}
                    tone={b.overdue > 0 ? 'danger' : b.avgAge > 24 ? 'warning' : 'success'}
                  />
                </div>
              ))}
            </CardBody>
          </Card>

          
        </div>
      )}

      {tab === 'throughput' && (
        <Card>
          <CardHeader title="Load by document type" description="Pending count and breach count" />
          <CardBody className="h-80 pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byType} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="type" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 6, fontSize: 11 }}
                />
                <Bar dataKey="total" name="Pending" radius={[3, 3, 0, 0]} maxBarSize={40}>
                  {byType.map((d, i) => (
                    <Cell key={i} fill={d.overdue > 0 ? '#f59e0b' : '#3b82f6'} />
                  ))}
                </Bar>
                <Bar dataKey="overdue" name="Breached" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.documentNo}
        description={detail?.subject}
        width="max-w-xl"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-2xs text-fg-subtle">Administrators may route work, not decide it.</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setReassign(detail); setDetail(null) }}>
                Reassign
              </Button>
              <Button variant="secondary" size="sm" onClick={() => toast.success('Reminder sent')}>
                Send reminder
              </Button>
            </div>
          </div>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.status === 'PENDING' ? 'PENDING_APPROVAL' : detail.status} />
              {detail.isOverdue && <Badge tone="danger">SLA breached</Badge>}
              <span className="text-xs text-fg-muted">
                waiting {ageHours(detail)} h · due {formatDateTime(detail.dueAt)}
              </span>
            </div>

            {detail.warnings.length > 0 && (
              <Alert tone="warning" title="Flags raised on this document">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {detail.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold text-fg">Decision context</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {detail.context.map((c, i) => (
                  <div
                    key={i}
                    className={
                      c.tone === 'danger'
                        ? 'rounded border border-danger/30 bg-danger/5 p-2.5'
                        : c.tone === 'warning'
                          ? 'rounded border border-warning/30 bg-warning/5 p-2.5'
                          : 'rounded border border-border p-2.5'
                    }
                  >
                    <p className="text-2xs uppercase tracking-wide text-fg-subtle">{c.label}</p>
                    <p className="mt-0.5 text-sm text-fg">{c.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-fg">Approval trail</p>
              <ol className="space-y-0">
                {detail.history.map((h, i) => (
                  <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    <span className="absolute left-[7px] top-4 h-full w-px bg-border last:hidden" />
                    <span
                      className={
                        'relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-surface ' +
                        (h.status === 'APPROVED'
                          ? 'bg-success'
                          : h.status === 'REJECTED'
                            ? 'bg-danger'
                            : h.status === 'PENDING'
                              ? 'bg-pending'
                              : h.status === 'RETURNED'
                                ? 'bg-warning'
                                : 'bg-border-strong')
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-fg">
                        L{h.levelNo} · {h.levelName}
                      </p>
                      <p className="text-2xs text-fg-muted">
                        {h.actor}
                        {h.at && ` · ${formatTimeAgo(h.at)}`}
                        {!h.at && h.status === 'UPCOMING' && ' · not yet reached'}
                      </p>
                      {h.comments && <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-2xs text-fg-muted">{h.comments}</p>}
                    </div>
                    <Badge
                      tone={
                        h.status === 'APPROVED'
                          ? 'success'
                          : h.status === 'REJECTED'
                            ? 'danger'
                            : h.status === 'PENDING'
                              ? 'pending'
                              : h.status === 'RETURNED'
                                ? 'warning'
                                : 'neutral'
                      }
                      size="sm"
                    >
                      {h.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={!!reassign}
        onClose={() => setReassign(null)}
        title="Reassign approver"
        description={reassign ? `${reassign.documentNo} · ${reassign.levelName}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setReassign(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                toast.success('Reassigned', 'The new approver has been notified and the trail records who reassigned it.')
                setReassign(null)
              }}
            >
              Reassign
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select
            label="New approver"
            required
            options={users
              .filter((u) => u.status === 'ACTIVE' && u.uid !== reassign?.requesterUid)
              .map((u) => ({ value: u.uid, label: `${u.fullName} — ${u.designation}` }))}
            hint="Only users holding a role with the required approval permission are listed."
          />
          <Select
            label="Reason code"
            required
            options={[
              { value: 'ABSENT', label: 'Approver absent / on leave' },
              { value: 'LEFT', label: 'Approver has left the organisation' },
              { value: 'SLA', label: 'SLA breach — administrative escalation' },
              { value: 'CONFLICT', label: 'Conflict of interest' },
              { value: 'WRONG', label: 'Routed to the wrong approver' },
            ]}
          />
          <Textarea label="Justification" rows={3} required placeholder="Recorded on the audit trail against your name." />
          <Alert tone="warning">
            Reassignment is an administrative override. It is written to the audit log with your
            user id, the original approver and this justification.
          </Alert>
        </div>
      </Modal>

      <p className="mt-4 flex items-center gap-1.5 text-2xs text-fg-subtle">
        <Zap className="h-3 w-3" />
        Instances are polled every 30 seconds; document state changes push over WebSocket.
      </p>
    </div>
  )
}
