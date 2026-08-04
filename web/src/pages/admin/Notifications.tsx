import { useEffect, useState } from 'react'
import { Bell, Mail, MessageCircle, MessageSquare, Plus, Send, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { cn } from '@/lib/cn'
import { formatDateTime, formatTimeAgo } from '@/lib/format'
import { notificationLogs, notificationRules, notificationTemplates } from '@/mock/data2'
import type { NotificationLog, NotificationRule, NotificationTemplate } from '@/types'

const CHANNEL_META: Record<string, { icon: typeof Bell; label: string; tone: string }> = {
  IN_APP: { icon: Bell, label: 'In-app', tone: 'text-brand-600' },
  EMAIL: { icon: Mail, label: 'Email', tone: 'text-progress' },
  SMS: { icon: MessageSquare, label: 'SMS', tone: 'text-warning' },
  WHATSAPP: { icon: MessageCircle, label: 'WhatsApp', tone: 'text-success' },
  PUSH: { icon: Smartphone, label: 'Push', tone: 'text-pending' },
}

function ChannelChips({ channels }: { channels: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {channels.map((c) => {
        const m = CHANNEL_META[c]
        if (!m) return <Badge key={c} tone="neutral" size="sm" dot={false}>{c}</Badge>
        const Icon = m.icon
        return (
          <span
            key={c}
            title={m.label}
            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-2xs text-fg-muted"
          >
            <Icon className={cn('h-3 w-3', m.tone)} />
            {m.label}
          </span>
        )
      })}
    </div>
  )
}

/** Renders {{token}} placeholders with sample values so the preview is honest. */
function renderTemplate(body: string, vars: string[]) {
  const samples: Record<string, string> = {
    documentNo: 'PO/HO/2627/00184',
    documentType: 'Purchase order',
    amount: '₹ 7,45,000.00',
    requester: 'Anand Krishnan',
    approver: 'Meera Rajan',
    supplierName: 'Jindal Stainless Ltd',
    customerName: 'Hydro Retail Pvt Ltd',
    dueDate: '02-Aug-2026',
    level: 'Plant Head',
    reason: 'Rate exceeds last purchase price by 12%',
    link: 'https://erp.ssb.local/po/01J…',
    itemCode: 'RM-SS304-0.5',
    quantity: '2,400.000 KG',
    userName: 'Anand Krishnan',
    otp: '482913',
  }
  let out = body
  for (const v of vars) out = out.replaceAll(`{{${v}}}`, samples[v] ?? `‹${v}›`)
  return out.replace(/\{\{(\w+)\}\}/g, (_, k) => samples[k] ?? `‹${k}›`)
}

export function NotificationsPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'notifications', 'Notifications', columnsFromTable(ruleColumns), notificationRules)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('rules')
  const [rule, setRule] = useState<NotificationRule | null>(null)
  const [ruleMandatory, setRuleMandatory] = useState(false)
  const [template, setTemplate] = useState<NotificationTemplate | null>(null)
  const [testOpen, setTestOpen] = useState(false)

  useEffect(() => {
    if (rule) setRuleMandatory(rule.isMandatory)
  }, [rule])

  const failed = notificationLogs.filter((l) => l.status === 'FAILED' || l.status === 'BOUNCED')
  const delivered = notificationLogs.filter((l) => l.status === 'DELIVERED' || l.status === 'READ')
  const deliveryRate = Math.round((delivered.length / (notificationLogs.length || 1)) * 100)

  const ruleColumns: Column<NotificationRule>[] = [
    {
      key: 'eventLabel',
      header: 'Event',
      sortable: true,
      sticky: true,
      width: '240px',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{r.eventLabel}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{r.eventName}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortable: true, width: '120px', render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.category.toLowerCase()}</Badge> },
    {
      key: 'recipient',
      header: 'Recipients',
      width: '200px',
      accessor: (r) => r.recipientRule,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{r.recipientRule.replace(/_/g, ' ').toLowerCase()}</p>
          {r.recipientValue && <p className="truncate font-mono text-2xs text-fg-subtle">{r.recipientValue}</p>}
        </div>
      ),
    },
    { key: 'channels', header: 'Channels', width: '230px', accessor: (r) => r.channels.join(), render: (r) => <ChannelChips channels={r.channels} /> },
    {
      key: 'urgency',
      header: 'Urgency',
      width: '110px',
      sortable: true,
      render: (r) => (
        <Badge tone={r.urgency === 'CRITICAL' ? 'danger' : r.urgency === 'HIGH' ? 'warning' : r.urgency === 'LOW' ? 'neutral' : 'progress'} size="sm">
          {r.urgency.toLowerCase()}
        </Badge>
      ),
    },
    { key: 'condition', header: 'Condition', defaultHidden: true, render: (r) => <span className="font-mono text-2xs text-fg-muted">{r.condition ?? '—'}</span> },
    {
      key: 'isActive',
      header: 'Status',
      width: '130px',
      accessor: (r) => (r.isActive ? 1 : 0),
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={r.isActive ? 'success' : 'neutral'} size="sm">{r.isActive ? 'Active' : 'Off'}</Badge>
          {r.isMandatory && <Badge tone="brand" size="sm" dot={false}>locked</Badge>}
        </div>
      ),
    },
  ]

  const templateColumns: Column<NotificationTemplate>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '190px', render: (t) => <span className="font-mono text-2xs font-medium">{t.code}</span> },
    { key: 'name', header: 'Template', sortable: true },
    {
      key: 'channel',
      header: 'Channel',
      width: '120px',
      sortable: true,
      render: (t) => <ChannelChips channels={[t.channel]} />,
    },
    { key: 'language', header: 'Lang', width: '80px', render: (t) => <span className="font-mono text-2xs uppercase">{t.language}</span> },
    { key: 'subject', header: 'Subject', render: (t) => <span className="truncate text-2xs text-fg-muted">{t.subject || '—'}</span> },
    { key: 'version', header: 'Ver', align: 'right', width: '60px', render: (t) => <span className="tabular">v{t.version}</span> },
    {
      key: 'approval',
      header: 'Provider approval',
      width: '150px',
      accessor: (t) => t.whatsappApprovalStatus ?? '',
      render: (t) =>
        t.whatsappApprovalStatus ? (
          <Badge tone={t.whatsappApprovalStatus === 'APPROVED' ? 'success' : t.whatsappApprovalStatus === 'PENDING' ? 'pending' : 'danger'} size="sm">
            {t.whatsappApprovalStatus.toLowerCase()}
          </Badge>
        ) : (
          <span className="text-2xs text-fg-subtle">n/a</span>
        ),
    },
    {
      key: 'isActive',
      header: '',
      width: '90px',
      accessor: (t) => (t.isActive ? 1 : 0),
      render: (t) => <Badge tone={t.isActive ? 'success' : 'neutral'} size="sm">{t.isActive ? 'Active' : 'Draft'}</Badge>,
    },
  ]

  const logColumns: Column<NotificationLog>[] = [
    { key: 'sentAt', header: 'When', sortable: true, width: '160px', render: (l) => <span title={formatDateTime(l.sentAt)}>{formatTimeAgo(l.sentAt)}</span> },
    { key: 'eventName', header: 'Event', width: '210px', render: (l) => <span className="font-mono text-2xs">{l.eventName}</span> },
    { key: 'recipient', header: 'Recipient', width: '200px' },
    { key: 'channel', header: 'Channel', width: '110px', render: (l) => <ChannelChips channels={[l.channel]} /> },
    { key: 'subject', header: 'Subject', render: (l) => <span className="truncate text-xs">{l.subject}</span> },
    { key: 'attempts', header: 'Tries', align: 'right', width: '70px' },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      sortable: true,
      render: (l) => (
        <Badge
          tone={
            l.status === 'READ' || l.status === 'DELIVERED'
              ? 'success'
              : l.status === 'SENT'
                ? 'progress'
                : l.status === 'QUEUED'
                  ? 'pending'
                  : 'danger'
          }
          size="sm"
        >
          {l.status.toLowerCase()}
        </Badge>
      ),
    },
    { key: 'error', header: 'Error', render: (l) => <span className="truncate text-2xs text-danger">{l.error ?? ''}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="One rule set drives in-app, email, SMS, WhatsApp and push. Rules and templates are data — adding a notification never requires a code change."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Platform services' }, { label: 'Notifications' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Send className="h-4 w-4" />} onClick={() => setTestOpen(true)}>
              Send test
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRule(notificationRules[0])}>
              New rule
            </Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'rules', label: 'Rules', count: notificationRules.length },
              { id: 'templates', label: 'Templates', count: notificationTemplates.length },
              { id: 'logs', label: 'Delivery log', count: notificationLogs.length },
              { id: 'channels', label: 'Channels' },
            ]}
          />
        }
      />

      {failed.length > 0 && (
        <Alert
          tone="warning"
          className="mb-4"
          title={`${failed.length} notification${failed.length > 1 ? 's' : ''} failed to deliver`}
          action={<Button size="sm" variant="outline" onClick={() => toast.success('Requeued')}>Retry all</Button>}
        >
          Delivery failure never blocks the business transaction. The document is committed; the
          notification retries with exponential backoff and lands here if it exhausts its attempts.
        </Alert>
      )}

      {tab === 'rules' && (
        <DataTable
          rows={notificationRules}
          columns={ruleColumns}
          rowKey={(r) => r.uid}
          searchPlaceholder="Event, category or recipient…"
          pageSize={20}
          onExport={doExport}
          onRowClick={setRule}
          rowActions={(r) => (
            <>
              <MenuItem label="Edit rule" onClick={() => setRule(r)} />
              <MenuItem label="Send test" onClick={() => setTestOpen(true)} />
              <MenuItem label="View deliveries" onClick={() => setTab('logs')} />
              <MenuItem
                label={r.isActive ? 'Disable' : 'Enable'}
                danger={r.isActive}
                disabled={r.isMandatory}
                separatorBefore
                onClick={() => toast.success(r.isActive ? 'Rule disabled' : 'Rule enabled', `${r.eventLabel} notifications are now ${r.isActive ? 'off' : 'on'}.`)}
              />
            </>
          )}
        />
      )}

      {tab === 'templates' && (
        <DataTable
          rows={notificationTemplates}
          columns={templateColumns}
          rowKey={(t) => t.uid}
          searchPlaceholder="Code, name or subject…"
          onRowClick={setTemplate}
          onExport={doExport}
          rowActions={(t) => (
            <>
              <MenuItem label="Edit" onClick={() => setTemplate(t)} />
              <MenuItem label="Preview" onClick={() => setTemplate(t)} />
              <MenuItem label="Duplicate for another language" onClick={() => toast.info('Duplicate template', `Create a copy of ${t.code} in another language for localisation.`)} />
              <MenuItem label="Version history" onClick={() => toast.info('Version history', `${t.code} is at v${t.version}. Earlier versions are retained and viewable here.`)} />
            </>
          )}
        />
      )}

      {tab === 'logs' && (
        <DataTable
          rows={notificationLogs}
          columns={logColumns}
          rowKey={(l) => l.uid}
          searchPlaceholder="Recipient, event or subject…"
          onExport={doExport}
          rowClassName={(l) => (l.status === 'FAILED' || l.status === 'BOUNCED' ? 'bg-danger/[0.03]' : undefined)}
        />
      )}

      {tab === 'channels' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(CHANNEL_META).map(([key, m]) => {
            const Icon = m.icon
            const sent = notificationLogs.filter((l) => l.channel === key).length
            const rules = notificationRules.filter((r) => r.channels.includes(key)).length
            return (
              <Card key={key}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Icon className={cn('h-4 w-4', m.tone)} />
                      {m.label}
                    </span>
                  }
                  actions={<Badge tone={key === 'WHATSAPP' ? 'warning' : 'success'} size="sm">{key === 'WHATSAPP' ? 'Template gated' : 'Connected'}</Badge>}
                />
                <CardBody className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Rules using it</span>
                    <span className="font-medium text-fg tabular">{rules}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Sent (24 h)</span>
                    <span className="font-medium text-fg tabular">{sent}</span>
                  </div>
                  <p className="pt-1 text-2xs text-fg-subtle">
                    {key === 'IN_APP' && 'Always on. The only channel that cannot be disabled — it is the system of record for what a user was told.'}
                    {key === 'EMAIL' && 'SMTP relay with DKIM signing. Bounces are fed back and mark the address undeliverable.'}
                    {key === 'SMS' && 'DLT-registered sender and template ids are mandatory in India; unregistered content is rejected by the operator.'}
                    {key === 'WHATSAPP' && 'Business API templates must be pre-approved by Meta before they can be sent. Free-form replies are only allowed inside a 24-hour session window.'}
                    {key === 'PUSH' && 'Delivered to the mobile app. Silently dropped if the device token has expired — the in-app copy still exists.'}
                  </p>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {/* Rule editor */}
      <Modal
        open={!!rule}
        onClose={() => setRule(null)}
        size="lg"
        title="Notification rule"
        description={rule?.eventLabel}
        footer={
          <>
            <Button variant="outline" onClick={() => setRule(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Rule saved'); setRule(null) }}>Save rule</Button>
          </>
        }
      >
        {rule && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3.5">
              <Input label="Event" defaultValue={rule.eventName} readOnly className="font-mono" hint="Emitted by the owning module through the outbox." />
              <Select
                label="Recipient rule"
                defaultValue={rule.recipientRule}
                options={[
                  { value: 'DOCUMENT_OWNER', label: 'Document owner / requester' },
                  { value: 'CURRENT_APPROVER', label: 'Current approver' },
                  { value: 'ROLE', label: 'Everyone holding a role' },
                  { value: 'USER', label: 'Named users' },
                  { value: 'DEPARTMENT', label: 'Department members' },
                  { value: 'SUPPLIER_CONTACT', label: 'Supplier contact' },
                  { value: 'CUSTOMER_CONTACT', label: 'Customer contact' },
                  { value: 'EXPRESSION', label: 'Expression' },
                ]}
              />
              <Input label="Recipient value" defaultValue={rule.recipientValue} />
              <Select
                label="Urgency"
                defaultValue={rule.urgency}
                options={[
                  { value: 'LOW', label: 'Low — batched into the digest' },
                  { value: 'NORMAL', label: 'Normal' },
                  { value: 'HIGH', label: 'High — delivered immediately' },
                  { value: 'CRITICAL', label: 'Critical — bypasses quiet hours' },
                ]}
              />
              <Input label="Condition" defaultValue={rule.condition ?? ''} className="font-mono" placeholder="document.amount > 100000" hint="Optional. Blank means always notify." />
            </div>
            <div className="space-y-3.5">
              <div>
                <p className="field-label">Channels</p>
                <div className="space-y-2 rounded border border-border p-3">
                  {Object.entries(CHANNEL_META).map(([key, m]) => (
                    <Switch
                      key={key}
                      checked={rule.channels.includes(key)}
                      disabled={key === 'IN_APP'}
                      onChange={() => toast.info('Channel toggled')}
                      label={
                        <span className="flex items-center gap-1.5">
                          <m.icon className={cn('h-3.5 w-3.5', m.tone)} />
                          {m.label}
                          {key === 'IN_APP' && <span className="text-2xs text-fg-subtle">always on</span>}
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>
              <Select
                label="Template"
                defaultValue={rule.templateCode}
                options={notificationTemplates.map((t) => ({ value: t.code, label: `${t.code} — ${t.name}` }))}
              />
              <Switch checked={ruleMandatory} onChange={setRuleMandatory} label="Mandatory — users cannot opt out" />
              <Alert tone="info">
                Mandatory rules cover statutory and audit-relevant events. Everything else respects
                the recipient's own notification preferences and quiet hours.
              </Alert>
            </div>
          </div>
        )}
      </Modal>

      {/* Template preview */}
      <Modal
        open={!!template}
        onClose={() => setTemplate(null)}
        size="lg"
        title={template?.name}
        description={template ? `${template.code} · ${CHANNEL_META[template.channel]?.label} · v${template.version}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setTemplate(null)}>Close</Button>
            <Button variant="primary" onClick={() => { toast.success('Template saved as v' + ((template?.version ?? 1) + 1)); setTemplate(null) }}>
              Save new version
            </Button>
          </>
        }
      >
        {template && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3.5">
              <Input label="Subject" defaultValue={template.subject} />
              <Textarea label="Body" rows={10} defaultValue={template.body} className="font-mono text-xs" />
              <div>
                <p className="field-label">Variables</p>
                <div className="flex flex-wrap gap-1">
                  {template.variables.map((v) => (
                    <span key={v} className="kbd">{`{{${v}}}`}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="field-label">Preview with sample data</p>
                <div className="rounded border border-border bg-surface-2 p-3">
                  {template.subject && <p className="mb-2 border-b border-border pb-2 text-sm font-semibold text-fg">{renderTemplate(template.subject, template.variables)}</p>}
                  <p className="whitespace-pre-wrap text-xs text-fg-muted">{renderTemplate(template.body, template.variables)}</p>
                </div>
              </div>
              {template.channel === 'SMS' && (
                <Alert tone="warning" title="SMS length">
                  {renderTemplate(template.body, template.variables).length} characters — messages
                  over 160 are billed as multiple segments and must match the DLT-registered
                  template exactly.
                </Alert>
              )}
              {template.channel === 'WHATSAPP' && (
                <Alert tone={template.whatsappApprovalStatus === 'APPROVED' ? 'info' : 'warning'} title="Meta template approval">
                  Status: {template.whatsappApprovalStatus ?? 'not submitted'}. Editing the body
                  resets approval and the template cannot be sent until Meta re-approves it.
                </Alert>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Send test notification"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Test sent', 'Delivered to your own address only.'); setTestOpen(false) }}>
              Send test
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select label="Template" options={notificationTemplates.map((t) => ({ value: t.code, label: `${t.code} — ${t.name}` }))} />
          <Select label="Channel" options={Object.entries(CHANNEL_META).map(([k, m]) => ({ value: k, label: m.label }))} />
          <Alert tone="info">
            Test sends always go to your own registered address or number and are tagged
            <span className="font-mono"> [TEST] </span>. Recipients configured on the rule are
            never contacted.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
