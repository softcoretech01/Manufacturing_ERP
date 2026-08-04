import { useEffect, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Cloud,
  Mail,
  MessageSquare,
  Plug,
  Printer,
  ReceiptText,
  Webhook,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatTimeAgo } from '@/lib/format'
import { integrations } from '@/mock/data2'
import type { IntegrationConfig } from '@/types'

const CATEGORY_ICON: Record<IntegrationConfig['category'], typeof Plug> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: MessageSquare,
  STATUTORY: ReceiptText,
  STORAGE: Cloud,
  BANK: Building2,
  PRINTER: Printer,
}

/** Outbound webhooks are per company so an integration needs no code change. */
const WEBHOOKS = [
  { event: 'procurement.po.approved', url: 'https://erp-bridge.ssb.local/hooks/po', status: 'ACTIVE', lastCode: 200, deliveries: 1842 },
  { event: 'inventory.grn.posted', url: 'https://erp-bridge.ssb.local/hooks/grn', status: 'ACTIVE', lastCode: 200, deliveries: 964 },
  { event: 'dispatch.invoice.generated', url: 'https://ecom.ssb.in/api/erp/invoice', status: 'ACTIVE', lastCode: 200, deliveries: 421 },
  { event: 'production.order.completed', url: 'https://mes.ssb.local/hooks/prod', status: 'FAILING', lastCode: 502, deliveries: 88 },
  { event: 'quality.inspection.failed', url: 'https://qms.ssb.local/hooks/ncr', status: 'PAUSED', lastCode: 200, deliveries: 12 },
]

export function IntegrationsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('providers')
  const [config, setConfig] = useState<IntegrationConfig | null>(null)
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (config) setEnabled(config.status === 'CONNECTED')
  }, [config])

  const connected = integrations.filter((i) => i.status === 'CONNECTED')
  const errored = integrations.filter((i) => i.status === 'ERROR')

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="External providers and outbound webhooks. Credentials are held encrypted and are never returned by the API once saved — only overwritten."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & ops' }, { label: 'Integrations' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'providers', label: 'Providers', count: integrations.length },
              { id: 'webhooks', label: 'Outbound webhooks', count: WEBHOOKS.length },
            ]}
          />
        }
      />

      {errored.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${errored.length} integration(s) failing`}>
          {errored.map((i) => i.name).join(', ')}. Business transactions are never blocked by an
          integration failure — the work is committed and the outbound call retries. Persistent
          failures surface here and in the background job monitor.
        </Alert>
      )}

      {tab === 'providers' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((i) => {
            const Icon = CATEGORY_ICON[i.category] ?? Plug
            return (
              <Card key={i.uid}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-fg-subtle" />
                      {i.name}
                    </span>
                  }
                  description={i.provider}
                  actions={
                    <Badge tone={i.status === 'CONNECTED' ? 'success' : i.status === 'ERROR' ? 'danger' : 'neutral'} size="sm">
                      {i.status === 'NOT_CONFIGURED' ? 'Not set up' : i.status.toLowerCase()}
                    </Badge>
                  }
                />
                <CardBody className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Category</span>
                    <Badge tone="neutral" size="sm" dot={false}>{i.category.toLowerCase()}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Last tested</span>
                    <span className="text-fg">{i.lastTestedAt ? formatTimeAgo(i.lastTestedAt) : 'never'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">Settings</span>
                    <span className="text-fg tabular">{i.settings.length}</span>
                  </div>
                </CardBody>
                <CardFooter>
                  <Button variant="ghost" size="sm" onClick={() => toast.success('Connection test passed', `${i.provider} responded in 214 ms.`)}>
                    Test
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfig(i)}>
                    Configure
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="space-y-4">
          

          <Card>
            <CardHeader
              title="Configured endpoints"
              description="Per company. Adding an endpoint requires no code change."
              actions={<Button variant="outline" size="sm" onClick={() => toast.info('New webhook', 'Pick an event, give a URL and a signing secret.')}>Add endpoint</Button>}
            />
            <CardBody className="p-0">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-64">Event</th>
                    <th>Endpoint</th>
                    <th className="w-28">Status</th>
                    <th className="w-24">Last code</th>
                    <th className="w-28">Deliveries</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {WEBHOOKS.map((w) => (
                    <tr key={w.event}>
                      <td><span className="font-mono text-2xs text-fg">{w.event}</span></td>
                      <td><span className="truncate font-mono text-2xs text-fg-muted">{w.url}</span></td>
                      <td>
                        <Badge tone={w.status === 'ACTIVE' ? 'success' : w.status === 'FAILING' ? 'danger' : 'neutral'} size="sm">
                          {w.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td>
                        <span className={w.lastCode >= 400 ? 'font-mono text-2xs text-danger' : 'font-mono text-2xs text-success'}>
                          {w.lastCode}
                        </span>
                      </td>
                      <td className="tabular">{w.deliveries.toLocaleString('en-IN')}</td>
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => toast.success('Test event sent')}>Test</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Delivery guarantees" />
            <CardBody className="grid gap-3 md:grid-cols-2">
              {[
                ['At-least-once delivery', 'The receiver must be idempotent. Every payload carries an event uid — treat a repeat of the same uid as a duplicate, not a second event.'],
                ['Signed payloads', 'Each request carries an HMAC-SHA256 signature over the raw body using the endpoint secret. Verify it before trusting the content.'],
                ['Ordered per aggregate', 'Events for the same document are delivered in order. Events for different documents may interleave.'],
                ['Retry with backoff', '6 attempts over roughly 24 hours, then the endpoint is marked failing and an alert is raised. Nothing is dropped silently.'],
                ['Versioned, additive payloads', 'Fields are added, never removed or re-typed. A consumer written against v1 keeps working.'],
                ['Replayable', 'Any delivered event can be replayed from the outbox for a chosen window after an outage at the receiving end.'],
              ].map(([t, d]) => (
                <div key={t} className="rounded border border-border p-3">
                  <p className="text-sm font-medium text-fg">{t}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{d}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={!!config}
        onClose={() => setConfig(null)}
        title={config?.name}
        description={config?.provider}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfig(null)}>Cancel</Button>
            <Button variant="outline" onClick={() => toast.success('Connection test passed')}>Test connection</Button>
            <Button variant="primary" onClick={() => { toast.success('Settings saved'); setConfig(null) }}>Save</Button>
          </>
        }
      >
        {config && (
          <div className="space-y-3.5">
            {config.settings.map((s) => (
              <Input
                key={s.key}
                label={s.label}
                defaultValue={s.secret ? '' : s.value}
                type={s.secret ? 'password' : 'text'}
                placeholder={s.secret ? '•••••••• (unchanged)' : undefined}
                className="font-mono"
                hint={s.secret ? 'Write-only. Leave blank to keep the current value.' : undefined}
              />
            ))}
            <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
            {config.category === 'STATUTORY' && (
              <Alert tone="warning" title="Statutory provider">
                E-invoice and e-way bill calls go through a GSP. Credentials are issued per GSTIN
                and per environment — sandbox credentials will silently produce invalid IRNs if used
                against production.
              </Alert>
            )}
            {config.category === 'BANK' && (
              <Select
                label="Environment"
                options={[{ value: 'SANDBOX', label: 'Sandbox' }, { value: 'PROD', label: 'Production' }]}
                hint="Payment file generation is disabled entirely in sandbox."
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
