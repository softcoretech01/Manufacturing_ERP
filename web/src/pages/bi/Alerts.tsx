import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Check } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input, Textarea } from '@/components/ui/Input'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { PageHeader, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ModuleChip, SeverityBadge, SourceNote, formatMetric } from '@/components/bi/BiShell'
import { alertEvents as seedEvents, alertRules as seedRules, readingByCode } from '@/mock/bi'
import { useCollection } from '@/store/data'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { AlertEvent, AlertRule } from '@/types/bi'

/**
 * Alerts and exceptions.
 *
 * Two things make an alert system fail. It fires on a single blip, so people
 * learn to ignore it; or it fires again every five minutes about something
 * already being dealt with. Both are handled explicitly here — every rule has a
 * consecutive-breach count and a cooldown, and both are shown on the rule rather
 * than buried in configuration.
 *
 * Each rule is also evaluated against the current reading, so you can see what
 * would fire right now without waiting for it to happen.
 */

const CHANNEL_LABEL: Record<string, string> = {
  IN_APP: 'In app',
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  PUSH: 'Push',
}

/** Does the live reading breach this rule as it stands? */
function evaluate(rule: AlertRule) {
  const reading = readingByCode[rule.metricCode]
  if (!reading) return { value: null as number | null, breaching: false, reason: 'No reading for this metric' }
  const v = reading.value
  const breaching =
    rule.operator === 'BELOW'
      ? v < rule.threshold
      : rule.operator === 'ABOVE'
        ? v > rule.threshold
        : Math.abs(((v - (reading.previousValue ?? v)) / (reading.previousValue || 1)) * 100) > rule.threshold
  return {
    value: v,
    breaching,
    reason: breaching
      ? `${formatMetric(v, rule.format)} is ${rule.operator === 'BELOW' ? 'below' : rule.operator === 'ABOVE' ? 'above' : 'moving more than'} ${formatMetric(rule.threshold, rule.format)}`
      : `${formatMetric(v, rule.format)} is within the threshold`,
  }
}

export function BiAlertsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('events')

  const rules = useCollection<AlertRule>('bi.alertRules', seedRules)
  const events = useCollection<AlertEvent>('bi.alertEvents', seedEvents)

  const [editing, setEditing] = useState<AlertRule | null>(null)
  const [draft, setDraft] = useState({ threshold: '', consecutiveBreaches: '', cooldownMinutes: '', recipients: '' })
  const [resolving, setResolving] = useState<AlertEvent | null>(null)
  const [resolveNote, setResolveNote] = useState('')

  const evaluated = useMemo(
    () => rules.rows.map((r) => ({ ...r, ...evaluate(r) })),
    [rules.rows],
  )

  const wouldFire = evaluated.filter((r) => r.isActive && r.breaching)
  const openEvents = events.rows.filter((e) => e.status === 'OPEN')
  const ackEvents = events.rows.filter((e) => e.status === 'ACKNOWLEDGED')
  const muted = rules.rows.filter((r) => !r.isActive)

  function openEdit(r: AlertRule) {
    setEditing(r)
    setDraft({
      threshold: String(r.threshold),
      consecutiveBreaches: String(r.consecutiveBreaches),
      cooldownMinutes: String(r.cooldownMinutes),
      recipients: r.recipients.join(', '),
    })
  }

  const draftThreshold = Number(draft.threshold)
  const draftBreaches = Number(draft.consecutiveBreaches)
  const draftCooldown = Number(draft.cooldownMinutes)
  const draftRecipients = draft.recipients
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const draftValid =
    Number.isFinite(draftThreshold) &&
    Number.isInteger(draftBreaches) &&
    draftBreaches >= 1 &&
    Number.isInteger(draftCooldown) &&
    draftCooldown >= 0 &&
    draftRecipients.length > 0

  function saveRule() {
    if (!editing || !draftValid) return
    rules.update(editing.uid, {
      threshold: draftThreshold,
      consecutiveBreaches: draftBreaches,
      cooldownMinutes: draftCooldown,
      recipients: draftRecipients,
    })
    toast.success(`${editing.code} updated`)
    setEditing(null)
  }

  function toggleRule(r: AlertRule) {
    rules.update(r.uid, { isActive: !r.isActive })
    toast.info(r.isActive ? `${r.name} muted — nothing will be sent` : `${r.name} armed`)
  }

  /** Firing a rule by hand produces a real event, so the test is the thing. */
  function fireNow(r: AlertRule & { value: number | null; breaching: boolean; reason: string }) {
    const now = new Date().toISOString()
    events.create({
      uid: `alr-${r.code.toLowerCase()}-${events.all.length + 1}`,
      ruleCode: r.code,
      ruleName: r.name,
      module: r.module,
      severity: r.severity,
      firedAt: now,
      metricValue: r.value ?? 0,
      threshold: r.threshold,
      format: r.format,
      message: `${r.name}: ${r.reason}`,
      channelsSent: r.channels,
      drillTo: readingByCode[r.metricCode]?.drillTo ?? null,
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null,
      status: 'OPEN',
    })
    rules.update(r.uid, { firedCount: r.firedCount + 1, lastFiredAt: now })
    toast.success(`Sent to ${r.recipients.length} recipients over ${r.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}`)
    setTab('events')
  }

  function acknowledge(e: AlertEvent) {
    events.update(e.uid, {
      status: 'ACKNOWLEDGED',
      acknowledgedBy: 'You',
      acknowledgedAt: new Date().toISOString(),
    })
    toast.info('Acknowledged — it stays open until somebody says what was done')
  }

  function resolve() {
    if (!resolving || resolveNote.trim().length < 5) return
    events.update(resolving.uid, {
      status: 'RESOLVED',
      resolvedAt: new Date().toISOString(),
      message: `${resolving.message} — resolved: ${resolveNote.trim()}`,
      acknowledgedBy: resolving.acknowledgedBy ?? 'You',
      acknowledgedAt: resolving.acknowledgedAt ?? new Date().toISOString(),
    })
    toast.success('Closed')
    setResolving(null)
    setResolveNote('')
  }

  function suppress(e: AlertEvent) {
    events.update(e.uid, { status: 'SUPPRESSED' })
    toast.info('Suppressed — it stays in the log, it just stops asking')
  }

  const ruleColumns: Column<(typeof evaluated)[number]>[] = [
    {
      key: 'name',
      header: 'Rule',
      render: (r) => (
        <div>
          <p className={cn('text-xs font-medium', r.isActive ? 'text-fg' : 'text-fg-subtle line-through')}>{r.name}</p>
          <p className="font-mono text-2xs text-fg-subtle">
            {r.code} · {r.metricCode}
          </p>
        </div>
      ),
    },
    { key: 'module', header: 'Source', render: (r) => <ModuleChip module={r.module} /> },
    {
      key: 'threshold',
      header: 'Fires when',
      render: (r) => (
        <p className="text-2xs text-fg">
          {r.operator === 'BELOW' ? 'Falls below' : r.operator === 'ABOVE' ? 'Rises above' : 'Moves more than'}{' '}
          <span className="tabular font-medium">{formatMetric(r.threshold, r.format)}</span>
          <span className="text-fg-subtle">
            {' '}
            for {r.consecutiveBreaches} {r.consecutiveBreaches === 1 ? 'reading' : 'readings running'}
          </span>
        </p>
      ),
    },
    {
      key: 'value',
      header: 'Right now',
      render: (r) => (
        <div>
          <Badge tone={!r.isActive ? 'neutral' : r.breaching ? 'danger' : 'success'}>
            {!r.isActive ? 'Muted' : r.breaching ? 'Breaching' : 'Within limits'}
          </Badge>
          <p className="mt-0.5 max-w-[14rem] text-2xs leading-snug text-fg-subtle">{r.reason}</p>
        </div>
      ),
    },
    { key: 'severity', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
    {
      key: 'channels',
      header: 'Who hears about it',
      render: (r) => (
        <div>
          <p className="text-2xs text-fg">{r.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}</p>
          <p className="max-w-[14rem] truncate text-2xs text-fg-subtle">{r.recipients.join(', ')}</p>
        </div>
      ),
    },
    {
      key: 'cooldownMinutes',
      header: 'Repeat guard',
      align: 'right',
      render: (r) => (
        <div className="text-right">
          <p className="tabular text-2xs text-fg">
            {r.cooldownMinutes >= 60 ? `${Math.round(r.cooldownMinutes / 60)} h` : `${r.cooldownMinutes} min`} quiet
          </p>
          <p className="text-2xs text-fg-subtle">
            {r.firedCount} fired · {r.lastFiredAt ? formatDateTime(r.lastFiredAt) : 'never'}
          </p>
        </div>
      ),
    },
  ]

  const eventColumns: Column<AlertEvent>[] = [
    {
      key: 'firedAt',
      header: 'Fired',
      render: (e) => (
        <div>
          <p className="text-xs text-fg">{formatDateTime(e.firedAt)}</p>
          <p className="font-mono text-2xs text-fg-subtle">{e.ruleCode}</p>
        </div>
      ),
    },
    { key: 'severity', header: 'Severity', render: (e) => <SeverityBadge severity={e.severity} /> },
    {
      key: 'message',
      header: 'What happened',
      render: (e) => (
        <div>
          <p className="max-w-[26rem] text-xs leading-snug text-fg">{e.message}</p>
          <p className="text-2xs text-fg-subtle">
            Read {formatMetric(e.metricValue, e.format)} against a threshold of {formatMetric(e.threshold, e.format)}
          </p>
        </div>
      ),
    },
    { key: 'module', header: 'Source', render: (e) => <ModuleChip module={e.module} /> },
    {
      key: 'channelsSent',
      header: 'Sent by',
      render: (e) => <p className="text-2xs text-fg-muted">{e.channelsSent.map((c) => CHANNEL_LABEL[c]).join(', ')}</p>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <div>
          <Badge
            tone={
              e.status === 'OPEN'
                ? 'danger'
                : e.status === 'ACKNOWLEDGED'
                  ? 'warning'
                  : e.status === 'RESOLVED'
                    ? 'success'
                    : 'neutral'
            }
          >
            {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
          </Badge>
          {e.acknowledgedBy && (
            <p className="mt-0.5 text-2xs text-fg-subtle">
              {e.acknowledgedBy} · {e.acknowledgedAt ? formatDateTime(e.acknowledgedAt) : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'drillTo',
      header: '',
      render: (e) =>
        e.drillTo ? (
          <Link to={e.drillTo} className="text-2xs font-medium text-brand-600 hover:underline">
            Go and look →
          </Link>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Alerts & exceptions"
        description="Threshold rules with a breach count and a cooldown, and every alert they have raised"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Alerts' }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open alerts"
          value={String(openEvents.length)}
          sub={openEvents.length ? 'Nobody has picked these up yet' : 'Nothing waiting'}
          icon={<Bell size={16} />}
          tone={openEvents.length ? 'danger' : 'success'}
        />
        <StatTile label="Being dealt with" value={String(ackEvents.length)} sub="Acknowledged, not yet closed" tone="warning" />
        <StatTile
          label="Rules breaching now"
          value={String(wouldFire.length)}
          sub={wouldFire.length ? wouldFire.slice(0, 2).map((r) => r.code).join(', ') : 'Every armed rule is within limits'}
          tone={wouldFire.length ? 'warning' : 'success'}
        />
        <StatTile
          label="Muted rules"
          value={String(muted.length)}
          sub={muted.length ? 'These will not notify anybody' : 'Every rule is armed'}
          icon={<BellOff size={16} />}
          tone={muted.length ? 'neutral' : 'success'}
        />
      </div>

      <Tabs
        variant="pill"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'events', label: 'Alerts raised', count: events.rows.length },
          { id: 'rules', label: 'Rules', count: rules.rows.length },
        ]}
      />

      {tab === 'events' && (
        <div className="mt-4">
          <DataTable
            rows={[...events.rows].sort((a, b) => (a.firedAt < b.firedAt ? 1 : -1))}
            columns={eventColumns}
            rowKey={(e) => e.uid}
            dense
            emptyTitle="Nothing has fired"
            emptyDescription="No rule has breached its threshold for long enough to raise an alert."
            rowActions={(e) => (
              <>
                <MenuItem label="Acknowledge" disabled={e.status !== 'OPEN'} onClick={() => acknowledge(e)} />
                <MenuItem
                  label="Close with a note"
                  disabled={e.status === 'RESOLVED'}
                  onClick={() => {
                    setResolving(e)
                    setResolveNote('')
                  }}
                />
                <MenuItem
                  separatorBefore
                  label="Suppress this one"
                  disabled={e.status === 'RESOLVED' || e.status === 'SUPPRESSED'}
                  onClick={() => suppress(e)}
                />
              </>
            )}
          />
        </div>
      )}

      {tab === 'rules' && (
        <div className="mt-4">
          <Card className="mb-4">
            <CardBody className="text-2xs leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">Right now</span> evaluates each rule against the current reading. A
              rule showing as breaching has not necessarily fired — it fires only after it has breached for the number
              of readings set on the rule, which is what stops a single bad shift paging the plant head at midnight.
            </CardBody>
          </Card>

          <DataTable
            rows={evaluated}
            columns={ruleColumns}
            rowKey={(r) => r.uid}
            dense
            searchable
            searchPlaceholder="Search rules by name, code or metric…"
            emptyTitle="No alert rules"
            rowActions={(r) => (
              <>
                <MenuItem label="Edit threshold and recipients" onClick={() => openEdit(r)} />
                <MenuItem
                  label="Fire it now"
                  disabled={!r.isActive || r.value === null}
                  onClick={() => fireNow(r)}
                />
                <MenuItem
                  separatorBefore
                  label={r.isActive ? 'Mute this rule' : 'Arm this rule'}
                  danger={r.isActive}
                  onClick={() => toggleRule(r)}
                />
              </>
            )}
          />
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? editing.name : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveRule} disabled={!draftValid}>
              Save the rule
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <p className="rounded border border-border bg-surface-2 px-3 py-2 text-2xs leading-relaxed text-fg-muted">
              Watches <span className="font-mono text-fg">{editing.metricCode}</span> and fires when it{' '}
              {editing.operator === 'BELOW' ? 'falls below' : editing.operator === 'ABOVE' ? 'rises above' : 'moves by more than'}{' '}
              the threshold. Current reading:{' '}
              <span className="tabular font-medium text-fg">
                {readingByCode[editing.metricCode]
                  ? formatMetric(readingByCode[editing.metricCode].value, editing.format)
                  : 'not available'}
              </span>
              .
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Threshold"
                value={draft.threshold}
                onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
                inputMode="decimal"
              />
              <Input
                label="Breaches before firing"
                hint="1 fires on the first bad reading"
                value={draft.consecutiveBreaches}
                onChange={(e) => setDraft({ ...draft, consecutiveBreaches: e.target.value })}
                inputMode="numeric"
              />
              <Input
                label="Cooldown (minutes)"
                hint="Quiet period before it may fire again"
                value={draft.cooldownMinutes}
                onChange={(e) => setDraft({ ...draft, cooldownMinutes: e.target.value })}
                inputMode="numeric"
              />
            </div>
            <Input
              label="Recipients"
              hint="Comma separated — at least one, or the alert goes nowhere"
              value={draft.recipients}
              onChange={(e) => setDraft({ ...draft, recipients: e.target.value })}
            />
            <p className="text-2xs text-fg-subtle">
              Sent over {editing.channels.map((c) => CHANNEL_LABEL[c]).join(', ')} · fired {editing.firedCount} times so
              far
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title="Close this alert"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolving(null)}>
              Cancel
            </Button>
            <Button onClick={resolve} disabled={resolveNote.trim().length < 5}>
              <Check size={14} /> Close it
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-fg-muted">
          {resolving?.message}
        </p>
        <Textarea
          label="What was done about it?"
          value={resolveNote}
          onChange={(e) => setResolveNote(e.target.value)}
          rows={3}
          placeholder="Compressor belt replaced on the morning shift, line back to rate by 10:20"
        />
        <p className="mt-2 text-2xs text-fg-subtle">
          The note is kept with the alert. An alert closed with no explanation teaches the next person nothing.
        </p>
      </Modal>

      <SourceNote
        modules={['PRODUCTION', 'QUALITY', 'INVENTORY', 'PROCUREMENT', 'DISPATCH', 'MAINTENANCE', 'FINANCE', 'HRMS']}
        note="Rules read the same metric layer the dashboards use, so an alert and the dashboard behind it can never disagree."
      />
    </div>
  )
}
