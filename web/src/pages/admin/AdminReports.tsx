import { useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/format'
import {
  can, delegationCycles, effectiveAccess, escalationState, isoDate, matrixCoverage,
  passwordAge, resolveApprover, sodConflicts, summariseLogs,
} from '@/lib/platformFlow'
import { roles, users, delegations, sodRules } from '@/mock/data'
import { PERMISSIONS as permissions } from '@/mock/permissions'
import { approvalRules, approvalTasks, auditEntries, backgroundJobs, integrations, notificationLogs } from '@/mock/data2'
import { securityPolicy, systemLogs } from '@/mock/platform'

/**
 * Administration and security reports (Volume 15, Ch 21).
 *
 * Every figure is computed from the same records the operational screens read,
 * so nothing here can disagree with them. The reports that matter are the ones
 * that find something: a matrix with a gap, a delegation that loops, a user who
 * holds two duties that should never sit together.
 */

type Tab = 'permissions' | 'workflow' | 'security' | 'activity' | 'platform'

export function AdminReportsPage() {
  const toast = useToast()
  const today = isoDate(new Date())
  const now = new Date().toISOString()
  const [tab, setTab] = useState<Tab>('permissions')

  /* ── permission matrix ──────────────────────────────────────── */

  const access = useMemo(() => users.map((u) => ({ user: u, acc: effectiveAccess(u, roles, permissions) })), [])

  const conflicts = useMemo(
    () =>
      access
        .map(({ user, acc }) => ({
          user,
          found: sodConflicts(acc, sodRules.filter((r) => r.isActive).map((r) => ({ code: r.uid, name: r.name, permissionA: r.permissionA, permissionB: r.permissionB, severity: r.severity }))),
        }))
        .filter((x) => x.found.length > 0),
    [access],
  )

  const privileged = useMemo(
    () => access.filter(({ acc }) => acc.sensitive.length > 0).sort((a, b) => b.acc.sensitive.length - a.acc.sensitive.length),
    [access],
  )

  /* ── workflow ───────────────────────────────────────────────── */

  const matrixIssues = useMemo(() => {
    const types = [...new Set(approvalRules.map((r) => r.documentType))]
    return types
      .map((dt) => ({ documentType: dt, ...matrixCoverage(dt, approvalRules) }))
      .filter((x) => x.gaps.length > 0 || x.overlaps.length > 0)
  }, [])

  const escalations = useMemo(
    () => approvalTasks.map((t) => escalationState(t, now)).sort((a, b) => a.minutesRemaining - b.minutesRemaining),
    [now],
  )

  const cycles = useMemo(() => delegationCycles(delegations, today), [today])

  const delegationView = useMemo(
    () =>
      delegations.map((d) => ({
        delegation: d,
        resolved: resolveApprover(d.fromUserUid, users, delegations, d.documentTypes[0] ?? 'ANY', today),
        isLive: d.status === 'ACTIVE' && d.validFrom <= today && d.validTo >= today,
      })),
    [today],
  )

  /* ── security ───────────────────────────────────────────────── */

  const security = useMemo(() => {
    const rows = users.map((u) => {
      const proxy = u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : null
      const age = passwordAge(proxy, securityPolicy.password, today)
      return {
        user: u,
        age,
        mfaGap: securityPolicy.mfaRequiredFor.includes(u.userType) && !u.mfaEnabled,
        dormant: u.status === 'ACTIVE' && (!u.lastLoginAt || (age.ageDays ?? 0) > 60),
      }
    })
    return {
      rows,
      mfaGaps: rows.filter((r) => r.mfaGap),
      expired: rows.filter((r) => r.age.expired),
      dormant: rows.filter((r) => r.dormant),
      suspended: users.filter((u) => u.status === 'SUSPENDED' || u.status === 'DEACTIVATED'),
    }
  }, [today])

  /* ── activity ───────────────────────────────────────────────── */

  const activity = useMemo(() => {
    const byUser = new Map<string, number>()
    for (const a of auditEntries) byUser.set(a.userName, (byUser.get(a.userName) ?? 0) + 1)
    const byAction = new Map<string, number>()
    for (const a of auditEntries) byAction.set(a.action, (byAction.get(a.action) ?? 0) + 1)
    return {
      total: auditEntries.length,
      byUser: [...byUser.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byAction: [...byAction.entries()].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
      exports: auditEntries.filter((a) => a.action.toUpperCase().includes('EXPORT')).length,
      configChanges: auditEntries.filter((a) => a.entityType?.toUpperCase().includes('PARAM') || a.action.toUpperCase().includes('CONFIG')).length,
    }
  }, [])

  /* ── platform ───────────────────────────────────────────────── */

  const platform = useMemo(() => {
    const logSummary = summariseLogs(systemLogs)
    return {
      logSummary,
      jobs: backgroundJobs,
      failedJobs: backgroundJobs.filter((j) => j.status === 'FAILED' || j.status === 'CANCELLED'),
      integrations,
      brokenIntegrations: integrations.filter((i) => i.status !== 'CONNECTED'),
      notifications: notificationLogs,
      failedNotifications: notificationLogs.filter((n) => n.status === 'FAILED' || n.status === 'BOUNCED'),
    }
  }, [])

  /* ── export ─────────────────────────────────────────────────── */

  function exportCurrent(format: ExportFormat) {
    let n = 0
    if (tab === 'permissions') {
      const cols: ExportColumn<(typeof access)[number]>[] = [
        { header: 'Login', value: (r) => r.user.loginId },
        { header: 'Name', value: (r) => r.user.fullName },
        { header: 'Type', value: (r) => r.user.userType },
        { header: 'Status', value: (r) => r.user.status },
        { header: 'Roles', value: (r) => r.user.roles.join(' | ') },
        { header: 'Permissions granted', value: (r) => r.acc.granted.size },
        { header: 'Permissions denied', value: (r) => r.acc.denied.size },
        { header: 'Sensitive permissions', value: (r) => r.acc.sensitive.length },
        { header: 'Row rule', value: (r) => r.user.rowRule },
      ]
      n = exportRows(format, 'permission-matrix', 'Permission matrix', cols, access)
    } else if (tab === 'workflow') {
      const cols: ExportColumn<(typeof escalations)[number]>[] = [
        { header: 'Document', value: (r) => r.task.documentNo },
        { header: 'Type', value: (r) => r.task.documentLabel },
        { header: 'Requester', value: (r) => r.task.requester },
        { header: 'Level', value: (r) => `${r.task.levelNo} of ${r.task.totalLevels}` },
        { header: 'Assigned', value: (r) => r.task.assignedAt },
        { header: 'Due', value: (r) => r.task.dueAt },
        { header: 'Hours waiting', value: (r) => r.hoursWaiting },
        { header: 'Severity', value: (r) => r.severity },
        { header: 'Status', value: (r) => r.task.status },
      ]
      n = exportRows(format, 'workflow-status', 'Workflow status', cols, escalations)
    } else if (tab === 'security') {
      const cols: ExportColumn<(typeof security.rows)[number]>[] = [
        { header: 'Login', value: (r) => r.user.loginId },
        { header: 'Name', value: (r) => r.user.fullName },
        { header: 'Status', value: (r) => r.user.status },
        { header: 'MFA enabled', value: (r) => (r.user.mfaEnabled ? 'Yes' : 'No') },
        { header: 'MFA required but off', value: (r) => (r.mfaGap ? 'Yes' : 'No') },
        { header: 'Credential age (days)', value: (r) => r.age.ageDays ?? '' },
        { header: 'Expired', value: (r) => (r.age.expired ? 'Yes' : 'No') },
        { header: 'Last sign-in', value: (r) => r.user.lastLoginAt ?? 'Never' },
      ]
      n = exportRows(format, 'security-report', 'Security report', cols, security.rows)
    } else if (tab === 'activity') {
      const cols: ExportColumn<(typeof auditEntries)[number]>[] = [
        { header: 'When', value: (a) => a.at },
        { header: 'User', value: (a) => a.userName },
        { header: 'Action', value: (a) => a.action },
        { header: 'Entity', value: (a) => a.entityType ?? '' },
        { header: 'Document', value: (a) => a.documentNo ?? '' },
        { header: 'IP', value: (a) => a.ipAddress ?? '' },
      ]
      n = exportRows(format, 'user-activity', 'User activity', cols, auditEntries)
    } else {
      const cols: ExportColumn<(typeof backgroundJobs)[number]>[] = [
        { header: 'Job', value: (j) => j.label },
        { header: 'Type', value: (j) => j.type },
        { header: 'Started', value: (j) => j.startedAt },
        { header: 'Status', value: (j) => j.status },
        { header: 'Duration (s)', value: (j) => j.durationSec ?? '' },
        { header: 'Triggered by', value: (j) => j.triggeredBy },
      ]
      n = exportRows(format, 'platform-status', 'Platform status', cols, backgroundJobs)
    }
    toast.success('Export ready', `${n} rows written.`)
  }

  const totalFindings =
    conflicts.length + matrixIssues.reduce((s, m) => s + m.gaps.length + m.overlaps.length, 0) +
    cycles.length + security.mfaGaps.length + platform.failedJobs.length + platform.brokenIntegrations.length

  return (
    <div>
      <PageHeader
        title="Administration reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Reports' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Download />} onClick={() => exportCurrent('xlsx')}>Excel</Button>
            <Button variant="outline" size="sm" icon={<FileText />} onClick={() => exportCurrent('pdf')}>PDF</Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'permissions', label: 'Permissions', count: conflicts.length },
              { id: 'workflow', label: 'Workflow', count: matrixIssues.length + cycles.length },
              { id: 'security', label: 'Security', count: security.mfaGaps.length },
              { id: 'activity', label: 'Activity' },
              { id: 'platform', label: 'Platform', count: platform.failedJobs.length + platform.brokenIntegrations.length },
            ]}
          />
        }
      />

      {totalFindings > 0 && (
        <Alert tone="warning" title={`${totalFindings} finding${totalFindings === 1 ? '' : 's'} across these reports`} className="mb-4">
          {[
            conflicts.length ? `${conflicts.length} segregation-of-duties conflict(s)` : null,
            matrixIssues.length ? `${matrixIssues.reduce((s, m) => s + m.gaps.length, 0)} approval gap(s)` : null,
            cycles.length ? `${cycles.length} delegation loop(s)` : null,
            security.mfaGaps.length ? `${security.mfaGaps.length} MFA gap(s)` : null,
            platform.failedJobs.length ? `${platform.failedJobs.length} failed job(s)` : null,
            platform.brokenIntegrations.length ? `${platform.brokenIntegrations.length} integration(s) not connected` : null,
          ].filter(Boolean).join(' · ')}.
        </Alert>
      )}

      {/* ─────────────── Permissions ─────────────── */}
      {tab === 'permissions' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Users" value={users.length} sub={`${roles.length} roles, ${permissions.length} permissions`} tone="brand" />
            <StatTile label="Duty conflicts" value={conflicts.length} sub={conflicts.length ? 'Users holding two duties that should be separate' : 'No conflicts'} tone={conflicts.length ? 'danger' : 'success'} />
            <StatTile label="Privileged users" value={privileged.length} sub="Holding at least one sensitive permission" tone={privileged.length > users.length / 2 ? 'warning' : 'brand'} />
            <StatTile label="Most permissive" value={access.length ? Math.max(...access.map((a) => a.acc.granted.size)) : 0} sub="Permissions held by one account" tone="neutral" />
          </div>

          {conflicts.length > 0 && (
            <Section title="Segregation of duties">
              <Card>
                <CardBody className="p-0">
                  <table className="grid-table">
                    <thead><tr><th style={{ width: '18rem' }}>User</th><th style={{ width: '11rem' }}>Severity</th><th>Conflict</th><th style={{ width: '26rem' }}>Permissions held</th></tr></thead>
                    <tbody>
                      {conflicts.flatMap(({ user, found }) =>
                        found.map((f) => (
                          <tr key={`${user.uid}-${f.rule.code}`} className="bg-danger/5">
                            <td><p className="text-xs text-fg">{user.fullName}</p><p className="font-mono text-2xs text-fg-subtle">{user.loginId}</p></td>
                            <td><Badge tone={f.rule.severity === 'BLOCK' ? 'danger' : 'warning'} size="sm">{f.rule.severity === 'BLOCK' ? 'blocking' : 'warning'}</Badge></td>
                            <td><p className="text-xs text-fg">{f.rule.name}</p><p className="font-mono text-3xs text-fg-subtle">{f.rule.code}</p></td>
                            <td><p className="font-mono text-2xs text-fg-muted">{f.rule.permissionA}<br />{f.rule.permissionB}</p></td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
              <p className="mt-2 text-2xs text-fg-subtle">
                Checked against effective permissions, not role names — a conflict assembled from two innocuous roles is exactly the one nobody spots.
              </p>
            </Section>
          )}

          <Section title="Permission matrix" className="mt-4">
            <Card>
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th style={{ width: '18rem' }}>User</th>
                        <th style={{ width: '12rem' }}>Type</th>
                        <th style={{ width: '11rem' }}>Status</th>
                        <th style={{ width: '18rem' }}>Roles</th>
                        <th className="text-right" style={{ width: '9rem' }}>Granted</th>
                        <th className="text-right" style={{ width: '9rem' }}>Denied</th>
                        <th className="text-right" style={{ width: '10rem' }}>Sensitive</th>
                        <th style={{ width: '13rem' }}>Data rule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {access.slice().sort((a, b) => b.acc.sensitive.length - a.acc.sensitive.length).map(({ user, acc }) => (
                        <tr key={user.uid} className={acc.sensitive.length > 3 ? 'bg-warning/5' : undefined}>
                          <td><p className="text-xs text-fg">{user.fullName}</p><p className="font-mono text-2xs text-fg-subtle">{user.loginId}</p></td>
                          <td><Badge tone="neutral" size="sm" dot={false}>{user.userType.replace(/_/g, ' ').toLowerCase()}</Badge></td>
                          <td><Badge tone={user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'danger' : 'neutral'} size="sm">{user.status.replace(/_/g, ' ').toLowerCase()}</Badge></td>
                          <td><p className="truncate text-2xs text-fg-muted">{user.roles.join(', ')}</p></td>
                          <td className="text-right text-xs tabular text-fg">{acc.granted.size}</td>
                          <td className="text-right text-xs tabular text-fg-muted">{acc.denied.size || '—'}</td>
                          <td className="text-right">
                            {acc.sensitive.length
                              ? <Badge tone={acc.sensitive.length > 3 ? 'danger' : 'warning'} size="sm">{acc.sensitive.length}</Badge>
                              : <span className="text-2xs text-fg-subtle">—</span>}
                          </td>
                          <td><span className="text-2xs text-fg-muted">{user.rowRule.replace(/_/g, ' ').toLowerCase()}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
            <p className="mt-2 text-2xs text-fg-subtle">
              Granted is after denials are applied. A denial on any one role removes the permission however many other roles grant it.
            </p>
          </Section>
        </>
      )}

      {/* ─────────────── Workflow ─────────────── */}
      {tab === 'workflow' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Pending approvals" value={escalations.filter((e) => e.task.status === 'PENDING').length} sub={`${escalations.filter((e) => e.severity === 'ESCALATED').length} escalated`} tone="brand" />
            <StatTile label="Overdue" value={escalations.filter((e) => e.isOverdue).length} sub="Past the committed decision time" tone={escalations.filter((e) => e.isOverdue).length ? 'danger' : 'success'} />
            <StatTile label="Matrix problems" value={matrixIssues.reduce((s, m) => s + m.gaps.length + m.overlaps.length, 0)} sub="Gaps and same-priority overlaps" tone={matrixIssues.length ? 'danger' : 'success'} />
            <StatTile label="Delegation loops" value={cycles.length} sub={cycles.length ? 'These resolve to nobody useful' : 'No loops'} tone={cycles.length ? 'danger' : 'success'} />
          </div>

          {matrixIssues.length > 0 && (
            <Section title="Approval matrix coverage">
              <Alert tone="danger" title="The matrix does not cover every value" className="mb-3">
                A gap means a document of that value hits no rule and cannot be submitted at all. These are usually off-by-one boundaries — one band ending at 100,000
                and the next starting at 100,001 leaves everything between them uncovered.
              </Alert>
              <Card>
                <CardBody className="p-0">
                  <table className="grid-table">
                    <thead><tr><th style={{ width: '18rem' }}>Document type</th><th style={{ width: '9rem' }}>Problem</th><th>Range</th><th>What it means</th></tr></thead>
                    <tbody>
                      {matrixIssues.flatMap((m) => [
                        ...m.gaps.map((g, i) => (
                          <tr key={`${m.documentType}-g${i}`} className="bg-danger/5">
                            <td className="text-xs text-fg">{m.documentType.replace(/_/g, ' ').toLowerCase()}</td>
                            <td><Badge tone="danger" size="sm">Gap</Badge></td>
                            <td className="text-xs tabular text-fg">{g.from.toLocaleString('en-IN')} — {g.to === null ? 'above' : g.to.toLocaleString('en-IN')}</td>
                            <td className="text-2xs text-fg-muted">A document in this range matches no rule and cannot be routed for approval.</td>
                          </tr>
                        )),
                        ...m.overlaps.map((o, i) => (
                          <tr key={`${m.documentType}-o${i}`} className="bg-warning/5">
                            <td className="text-xs text-fg">{m.documentType.replace(/_/g, ' ').toLowerCase()}</td>
                            <td><Badge tone="warning" size="sm">Overlap</Badge></td>
                            <td className="text-xs tabular text-fg">{o.from.toLocaleString('en-IN')} — {o.to === null ? 'above' : o.to.toLocaleString('en-IN')}</td>
                            <td className="text-2xs text-fg-muted">"{o.a.name}" and "{o.b.name}" both match at the same priority, so which one applies depends on ordering.</td>
                          </tr>
                        )),
                      ])}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </Section>
          )}

          {cycles.length > 0 && (
            <Section title="Delegation loops" className="mt-4">
              <Alert tone="danger" title="Delegations that come back round" className="mb-3">
                Two people covering each other while both are away means a task delegated by one lands with the other and comes straight back.
                The engine stops the walk rather than looping, but the task ends up with somebody who is also absent.
              </Alert>
              <Card>
                <CardBody className="p-0">
                  <table className="grid-table">
                    <thead><tr><th>Loop</th><th style={{ width: '13rem' }}>Valid to</th></tr></thead>
                    <tbody>
                      {cycles.map((cycle, i) => (
                        <tr key={i} className="bg-danger/5">
                          <td className="text-xs text-fg">{cycle.map((d) => d.fromUserName).join(' → ')} → {cycle[0].fromUserName}</td>
                          <td className="text-2xs tabular text-fg-muted">{formatDate(cycle[0].validTo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </Section>
          )}

          <Section title="Who actually receives each delegated task" className="mt-4">
            <Card>
              <CardBody className="p-0">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '16rem' }}>Delegated by</th><th style={{ width: '16rem' }}>Nominally to</th><th style={{ width: '16rem' }}>Actually lands with</th><th style={{ width: '9rem' }}>Hops</th><th style={{ width: '11rem' }}>Valid to</th><th style={{ width: '9rem' }}>Live</th></tr></thead>
                  <tbody>
                    {delegationView.map(({ delegation, resolved, isLive }) => (
                      <tr key={delegation.uid} className={!isLive ? 'opacity-60' : resolved.chain.length > 1 ? 'bg-warning/5' : undefined}>
                        <td className="text-xs text-fg">{delegation.fromUserName}</td>
                        <td className="text-2xs text-fg-muted">{delegation.toUserName}</td>
                        <td className="text-xs text-fg">{isLive ? resolved.effectiveName : '—'}</td>
                        <td className="text-2xs tabular text-fg-muted">{resolved.chain.length || '—'}</td>
                        <td className="text-2xs tabular text-fg-muted">{formatDate(delegation.validTo)}</td>
                        <td>{isLive ? <Badge tone="success" size="sm">Live</Badge> : <Badge tone="neutral" size="sm">{delegation.status.toLowerCase()}</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </Section>

          <Section title="Approval queue" className="mt-4">
            <Card>
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="grid-table">
                    <thead><tr><th style={{ width: '15rem' }}>Document</th><th style={{ width: '15rem' }}>Requester</th><th style={{ width: '9rem' }}>Level</th><th style={{ width: '12rem' }}>Waiting</th><th style={{ width: '13rem' }}>Time left</th><th style={{ width: '11rem' }}>Severity</th><th style={{ width: '11rem' }}>Status</th></tr></thead>
                    <tbody>
                      {escalations.map((e) => (
                        <tr key={e.task.uid} className={e.severity === 'ESCALATED' ? 'bg-danger/5' : e.severity === 'OVERDUE' ? 'bg-warning/5' : undefined}>
                          <td><p className="font-mono text-2xs text-fg">{e.task.documentNo}</p><p className="truncate text-3xs text-fg-subtle">{e.task.documentLabel}</p></td>
                          <td className="text-2xs text-fg-muted">{e.task.requester}</td>
                          <td className="text-2xs tabular text-fg-muted">{e.task.levelNo} of {e.task.totalLevels}</td>
                          <td className="text-2xs tabular text-fg-muted">{e.hoursWaiting} h</td>
                          <td className={cn('text-2xs', e.isOverdue ? 'text-danger' : 'text-fg-muted')}>{e.note}</td>
                          <td>
                            <Badge tone={e.severity === 'ESCALATED' ? 'danger' : e.severity === 'OVERDUE' ? 'warning' : e.severity === 'DUE_SOON' ? 'warning' : 'neutral'} size="sm">
                              {e.severity.replace(/_/g, ' ').toLowerCase()}
                            </Badge>
                          </td>
                          <td><Badge tone={e.task.status === 'PENDING' ? 'pending' : e.task.status === 'APPROVED' ? 'success' : 'danger'} size="sm">{e.task.status.replace(/_/g, ' ').toLowerCase()}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
            <p className="mt-2 text-2xs text-fg-subtle">
              Overdue is recomputed from the clock, not read from the stored flag — a snapshot written when the row was created reports a three-day-old task as on time.
            </p>
          </Section>
        </>
      )}

      {/* ─────────────── Security ─────────────── */}
      {tab === 'security' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="MFA gaps" value={security.mfaGaps.length} sub="Required by policy, not switched on" tone={security.mfaGaps.length ? 'danger' : 'success'} />
            <StatTile label="Credentials past expiry" value={security.expired.length} sub={`${securityPolicy.password.expiryDays}-day limit`} tone={security.expired.length ? 'warning' : 'success'} />
            <StatTile label="Dormant accounts" value={security.dormant.length} sub="Active but unused for 60 days or never" tone={security.dormant.length ? 'warning' : 'success'} />
            <StatTile label="Suspended or closed" value={security.suspended.length} sub="Should hold no live sessions" tone="neutral" />
          </div>

          {security.mfaGaps.length > 0 && (
            <Alert tone="danger" title={`${security.mfaGaps.length} account${security.mfaGaps.length === 1 ? '' : 's'} exempt from a requirement that is meant to apply`} className="mb-4">
              {security.mfaGaps.map((r) => r.user.fullName).join(', ')}. Until these are switched on, the MFA policy is a statement rather than a control.
            </Alert>
          )}

          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '18rem' }}>User</th>
                      <th style={{ width: '12rem' }}>Type</th>
                      <th style={{ width: '11rem' }}>Status</th>
                      <th style={{ width: '11rem' }}>MFA</th>
                      <th style={{ width: '14rem' }}>Credential age</th>
                      <th style={{ width: '12rem' }}>Last sign-in</th>
                      <th style={{ width: '11rem' }}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {security.rows.slice().sort((a, b) => Number(b.mfaGap) - Number(a.mfaGap) || Number(b.age.expired) - Number(a.age.expired)).map((r) => (
                      <tr key={r.user.uid} className={r.mfaGap ? 'bg-danger/5' : r.age.expired || r.dormant ? 'bg-warning/5' : undefined}>
                        <td><p className="text-xs text-fg">{r.user.fullName}</p><p className="font-mono text-2xs text-fg-subtle">{r.user.loginId}</p></td>
                        <td><Badge tone="neutral" size="sm" dot={false}>{r.user.userType.replace(/_/g, ' ').toLowerCase()}</Badge></td>
                        <td><Badge tone={r.user.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">{r.user.status.replace(/_/g, ' ').toLowerCase()}</Badge></td>
                        <td>{r.user.mfaEnabled ? <Badge tone="success" size="sm">On</Badge> : r.mfaGap ? <Badge tone="danger" size="sm">Required, off</Badge> : <Badge tone="neutral" size="sm">Off</Badge>}</td>
                        <td>
                          {r.age.ageDays === null ? <span className="text-2xs text-fg-subtle">Never used</span> : (
                            <div className="flex items-center gap-2">
                              <ProgressBar value={Math.min(100, (r.age.ageDays / Math.max(1, securityPolicy.password.expiryDays)) * 100)} tone={r.age.expired ? 'danger' : 'success'} className="w-14" />
                              <span className={cn('text-2xs tabular', r.age.expired ? 'text-danger' : 'text-fg-muted')}>{r.age.ageDays}d</span>
                            </div>
                          )}
                        </td>
                        <td className="text-2xs tabular text-fg-muted">{r.user.lastLoginAt ? formatDate(r.user.lastLoginAt.slice(0, 10)) : 'Never'}</td>
                        <td>
                          {r.mfaGap ? <Badge tone="danger" size="sm">Action needed</Badge>
                            : r.age.expired ? <Badge tone="warning" size="sm">Expired</Badge>
                            : r.dormant ? <Badge tone="warning" size="sm">Dormant</Badge>
                            : <Badge tone="success" size="sm">Compliant</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
          <p className="mt-2 text-2xs text-fg-subtle">
            Credential age uses the last sign-in as a stand-in, since the user record carries no password-change date. Treat it as an indication, not an audit.
          </p>
        </>
      )}

      {/* ─────────────── Activity ─────────────── */}
      {tab === 'activity' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Audit entries" value={activity.total} sub="Append-only; never edited or deleted" tone="brand" />
            <StatTile label="Distinct users" value={activity.byUser.length} sub="Who has touched anything" tone="neutral" />
            <StatTile label="Data exports" value={activity.exports} sub="Every export is recorded against a person" tone={activity.exports ? 'warning' : 'neutral'} />
            <StatTile label="Configuration changes" value={activity.configChanges} sub="Parameter and setup edits" tone={activity.configChanges ? 'warning' : 'neutral'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Busiest users" description="By recorded actions" />
              <CardBody className="space-y-2">
                {activity.byUser.slice(0, 8).map((u) => (
                  <div key={u.name}>
                    <p className="flex justify-between text-2xs"><span className="text-fg-muted">{u.name}</span><span className="tabular text-fg">{u.count}</span></p>
                    <ProgressBar value={activity.byUser[0] ? (u.count / activity.byUser[0].count) * 100 : 0} tone="brand" />
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="What is being done" description="By action type" />
              <CardBody className="space-y-2">
                {activity.byAction.slice(0, 8).map((a) => (
                  <div key={a.action}>
                    <p className="flex justify-between text-2xs"><span className="text-fg-muted">{a.action.toLowerCase()}</span><span className="tabular text-fg">{a.count}</span></p>
                    <ProgressBar value={activity.byAction[0] ? (a.count / activity.byAction[0].count) * 100 : 0} tone={a.action.toUpperCase().includes('DELETE') || a.action.toUpperCase().includes('EXPORT') ? 'warning' : 'success'} />
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          <Section title="Recent activity" className="mt-4">
            <Card>
              <CardBody className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  <table className="grid-table">
                    <thead><tr><th style={{ width: '13rem' }}>When</th><th style={{ width: '13rem' }}>User</th><th style={{ width: '11rem' }}>Action</th><th style={{ width: '13rem' }}>Entity</th><th style={{ width: '13rem' }}>Document</th><th style={{ width: '11rem' }}>From</th></tr></thead>
                    <tbody>
                      {auditEntries.slice().sort((a, b) => b.at.localeCompare(a.at)).map((a) => (
                        <tr key={a.uid}>
                          <td className="text-2xs tabular text-fg-muted">{formatDateTime(a.at)}</td>
                          <td className="text-xs text-fg">{a.userName}</td>
                          <td><Badge tone={a.action.toUpperCase().includes('DELETE') ? 'danger' : a.action.toUpperCase().includes('APPROVE') ? 'success' : 'neutral'} size="sm" dot={false}>{a.action.toLowerCase()}</Badge></td>
                          <td className="text-2xs text-fg-muted">{a.entityType ?? '—'}</td>
                          <td className="font-mono text-2xs text-fg-muted">{a.documentNo ?? '—'}</td>
                          <td className="font-mono text-2xs text-fg-subtle">{a.ipAddress ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </Section>
        </>
      )}

      {/* ─────────────── Platform ─────────────── */}
      {tab === 'platform' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Background jobs" value={platform.jobs.length} sub={`${platform.failedJobs.length} failed on their last run`} tone={platform.failedJobs.length ? 'danger' : 'success'} />
            <StatTile label="Integrations" value={platform.integrations.length} sub={`${platform.brokenIntegrations.length} not connected`} tone={platform.brokenIntegrations.length ? 'danger' : 'success'} />
            <StatTile label="Notifications sent" value={platform.notifications.length} sub={`${platform.failedNotifications.length} failed or bounced`} tone={platform.failedNotifications.length ? 'warning' : 'success'} />
            <StatTile label="Unseen errors" value={platform.logSummary.unacknowledged} sub={`${platform.logSummary.recurring.length} recurring fault(s)`} tone={platform.logSummary.unacknowledged ? 'danger' : 'success'} />
          </div>

          {platform.brokenIntegrations.length > 0 && (
            <Alert tone="danger" title={`${platform.brokenIntegrations.length} integration${platform.brokenIntegrations.length === 1 ? ' is' : 's are'} not connected`} className="mb-4">
              {platform.brokenIntegrations.map((i) => `${i.name} (${i.status.toLowerCase()})`).join(' · ')}.
              Postings destined for these are queued rather than lost, but the queue grows until somebody reconnects them.
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Background jobs" />
              <CardBody className="p-0">
                <table className="grid-table">
                  <thead><tr><th>Job</th><th style={{ width: '12rem' }}>Started</th><th style={{ width: '9rem' }}>Took</th><th style={{ width: '10rem' }}>Status</th></tr></thead>
                  <tbody>
                    {platform.jobs.map((j) => (
                      <tr key={j.uid} className={j.status === 'FAILED' || j.status === 'CANCELLED' ? 'bg-danger/5' : undefined}>
                        <td><p className="text-xs text-fg">{j.label}</p><p className="truncate text-3xs text-fg-subtle">{j.message}</p></td>
                        <td className="text-2xs tabular text-fg-muted">{formatDateTime(j.startedAt)}</td>
                        <td className="text-2xs tabular text-fg-muted">{j.durationSec === null ? '—' : `${j.durationSec}s`}</td>
                        <td><Badge tone={j.status === 'SUCCESS' ? 'success' : j.status === 'RUNNING' ? 'progress' : j.status === 'QUEUED' ? 'pending' : 'danger'} size="sm">{j.status.toLowerCase()}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Integrations" />
              <CardBody className="p-0">
                <table className="grid-table">
                  <thead><tr><th>Integration</th><th style={{ width: '11rem' }}>Category</th><th style={{ width: '12rem' }}>Last tested</th><th style={{ width: '11rem' }}>Status</th></tr></thead>
                  <tbody>
                    {platform.integrations.map((i) => (
                      <tr key={i.uid} className={i.status !== 'CONNECTED' ? 'bg-danger/5' : undefined}>
                        <td><p className="text-xs text-fg">{i.name}</p><p className="text-3xs text-fg-subtle">{i.provider}</p></td>
                        <td className="text-2xs text-fg-muted">{i.category.toLowerCase()}</td>
                        <td className="text-2xs tabular text-fg-muted">{i.lastTestedAt ? formatDateTime(i.lastTestedAt) : 'Never tested'}</td>
                        <td><Badge tone={i.status === 'CONNECTED' ? 'success' : i.status === 'ERROR' ? 'danger' : 'neutral'} size="sm">{i.status.replace(/_/g, ' ').toLowerCase()}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </div>

          {platform.logSummary.recurring.length > 0 && (
            <Section title="Recurring faults" className="mt-4">
              <Card>
                <CardBody className="p-0">
                  <table className="grid-table">
                    <thead><tr><th className="text-right" style={{ width: '7rem' }}>Times</th><th style={{ width: '13rem' }}>Source</th><th>Message</th><th style={{ width: '13rem' }}>Last seen</th></tr></thead>
                    <tbody>
                      {platform.logSummary.recurring.map((r) => (
                        <tr key={r.message} className={r.count >= 10 ? 'bg-danger/5' : 'bg-warning/5'}>
                          <td className="text-right"><Badge tone={r.count >= 10 ? 'danger' : 'warning'} size="sm">{r.count}×</Badge></td>
                          <td className="text-2xs text-fg-muted">{r.source}</td>
                          <td className="text-xs text-fg">{r.message}</td>
                          <td className="text-2xs tabular text-fg-muted">{formatDateTime(r.lastAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
