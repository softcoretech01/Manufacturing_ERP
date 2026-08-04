import { useState } from 'react'
import { Building2, FileText, Paperclip, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { Input, Select, Switch } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { branches, companies, registrations } from '@/mock/data'
import { useActiveContext } from '@/store/auth'

export function CompanyPage() {
  const toast = useToast()
  const { company } = useActiveContext()
  const [tab, setTab] = useState('details')
  const [regOpen, setRegOpen] = useState(false)
  const [showLakhCrore, setShowLakhCrore] = useState(true)

  const regs = registrations.filter((r) => r.companyUid === company.uid)
  const expiring = regs
    .filter((r) => r.validTo)
    .map((r) => ({ ...r, days: Math.ceil((new Date(r.validTo!).getTime() - Date.now()) / 86_400_000) }))
    .filter((r) => r.days <= 90)
    .sort((a, b) => a.days - b.days)

  return (
    <div>
      <PageHeader
        title={company.legalName}
        description={`${company.tradeName} · ${company.entityType.replace('_', ' ')} · ${company.code}`}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Company' }]}
        badge={<Badge tone="success">Active</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => toast.info('Company setup wizard', 'A guided walkthrough of legal identity, registrations, branding and defaults.')}>Setup wizard</Button>
            <Button variant="primary" size="sm" onClick={() => toast.success('Company saved')}>Save</Button>
          </>
        }
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'details', label: 'Details' },
            { id: 'statutory', label: 'Statutory registrations', count: regs.length },
            { id: 'branding', label: 'Branding & print' },
            { id: 'defaults', label: 'Defaults' },
          ]} />
        }
      />

      {expiring.some((r) => r.days <= 30) && (
        <Alert tone="danger" className="mb-4" title="Registration expiring imminently">
          {expiring.filter((r) => r.days <= 30).map((r) => `${r.type.replace(/_/g, ' ')} (${r.days} days)`).join(', ')}.
          Reminders are sent at 90, 60, 30 and 7 days.
        </Alert>
      )}

      {tab === 'details' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Legal identity" />
            <CardBody className="space-y-3.5">
              <Input label="Company code" required defaultValue={company.code} disabled readOnlyReason="Immutable after the first transaction is posted" />
              <Input label="Legal name" required defaultValue={company.legalName} />
              <Input label="Trade name" defaultValue={company.tradeName} />
              <Select label="Entity type" defaultValue={company.entityType}
                options={[{ value: 'PVT_LTD', label: 'Private Limited' }, { value: 'LTD', label: 'Public Limited' }, { value: 'LLP', label: 'LLP' }, { value: 'PARTNERSHIP', label: 'Partnership' }, { value: 'PROPRIETORSHIP', label: 'Proprietorship' }]} />
              <Input label="CIN" defaultValue={company.cin} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="PAN" required defaultValue={company.pan} hint="Format AAAAA9999A" />
                <Input label="TAN" defaultValue={company.tan} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Registered address" />
            <CardBody className="space-y-3.5">
              <Input label="Address line 1" required defaultValue={company.addressLine1} />
              <Input label="Address line 2" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="City" required defaultValue={company.city} />
                <Input label="PIN code" required defaultValue={company.pincode} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="State" required defaultValue={company.state}
                  options={[{ value: 'Tamil Nadu', label: 'Tamil Nadu (33)' }, { value: 'Karnataka', label: 'Karnataka (29)' }, { value: 'Delhi', label: 'Delhi (07)' }, { value: 'Maharashtra', label: 'Maharashtra (27)' }]} />
                <Select label="Country" required defaultValue="IN" options={[{ value: 'IN', label: 'India' }]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone" defaultValue={company.phone} />
                <Input label="Email" type="email" defaultValue={company.email} />
              </div>
              <Input label="Website" defaultValue={company.website} />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'statutory' && (
        <Card>
          <CardHeader
            title="Statutory registrations"
            description="Each with number, issuing authority, validity and an attachment. Expiry reminders fire at 90, 60, 30 and 7 days."
            actions={<Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setRegOpen(true)}>Add registration</Button>}
          />
          <table className="grid-table">
            <thead>
              <tr>
                <th>Type</th><th>Number</th><th>Issuing authority</th>
                <th className="w-28">Valid from</th><th className="w-28">Valid to</th>
                <th className="w-28">Status</th><th className="w-20">Document</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => {
                const days = r.validTo ? Math.ceil((new Date(r.validTo).getTime() - Date.now()) / 86_400_000) : null
                return (
                  <tr key={r.uid}>
                    <td className="text-xs font-medium text-fg">{r.type.replace(/_/g, ' ')}</td>
                    <td className="font-mono text-[11px]">{r.number}</td>
                    <td className="text-xs text-fg-muted">{r.authority}</td>
                    <td className="text-xs">{formatDate(r.validFrom)}</td>
                    <td className="text-xs">{r.validTo ? formatDate(r.validTo) : 'Perpetual'}</td>
                    <td>
                      {days === null ? <Badge tone="success" size="sm">Valid</Badge>
                        : days <= 7 ? <Badge tone="danger" size="sm">{days} days left</Badge>
                        : days <= 30 ? <Badge tone="danger" size="sm">{days} days left</Badge>
                        : days <= 90 ? <Badge tone="warning" size="sm">{days} days left</Badge>
                        : <Badge tone="success" size="sm">Valid</Badge>}
                    </td>
                    <td>
                      <Button size="xs" variant="ghost" icon={<Paperclip className="h-3 w-3" />} onClick={() => toast.info('Registration document', `Preview the ${r.type.replace(/_/g, ' ')} certificate (${r.number}).`)}>View</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="border-t border-border p-4">
            <Alert tone="info" title="GSTIN validation is three-part">
              Format alone catches almost nothing. Every GSTIN is validated for structure, for its
              embedded PAN matching the company PAN, and for its state code matching the address
              state.
            </Alert>
          </div>
        </Card>
      )}

      {tab === 'branding' && (
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { title: 'Company logo', hint: 'PNG or SVG, transparent background, min 512 px', preview: company.logoInitials },
            { title: 'Letterhead', hint: 'A4 header image used by every print template', preview: null },
            { title: 'Digital signature', hint: 'Authorised signatory image for invoices and challans', preview: null },
          ].map((b) => (
            <Card key={b.title}>
              <CardHeader title={b.title} />
              <CardBody>
                <div className="flex h-32 items-center justify-center rounded border-2 border-dashed border-border bg-surface-2">
                  {b.preview ? (
                    <span className="flex h-16 w-16 items-center justify-center rounded bg-brand-600 text-lg font-bold text-white">
                      {b.preview}
                    </span>
                  ) : (
                    <span className="text-xs text-fg-subtle">Not uploaded</span>
                  )}
                </div>
                <p className="mt-2 text-2xs text-fg-subtle">{b.hint}</p>
                <Button size="sm" variant="outline" className="mt-2 w-full" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => toast.info(`Upload ${b.title.toLowerCase()}`, b.hint)}>Upload</Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'defaults' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Financial defaults" />
            <CardBody className="space-y-3.5">
              <Select label="Base currency" defaultValue={company.baseCurrency} disabled
                options={[{ value: 'INR', label: 'INR — Indian Rupee' }]} />
              <Alert tone="warning">
                Base currency and financial-year start month are immutable after the first financial
                transaction — changing either would invalidate every posted amount.
              </Alert>
              <Select label="Financial year starts" defaultValue="4" disabled options={[{ value: '4', label: 'April' }]} />
              <div className="grid grid-cols-3 gap-3">
                <Input label="Qty precision" type="number" defaultValue={3} />
                <Input label="Rate precision" type="number" defaultValue={2} />
                <Input label="Amount precision" type="number" defaultValue={2} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Locale & display" />
            <CardBody className="space-y-3.5">
              <Select label="Timezone" defaultValue={company.timezone} options={[{ value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' }]} />
              <Select label="Locale" defaultValue="en-IN" options={[{ value: 'en-IN', label: 'English (India)' }]} />
              <Select label="Date format" defaultValue="dd-MMM-yyyy"
                options={[{ value: 'dd-MMM-yyyy', label: 'dd-MMM-yyyy (28-Jul-2026)' }, { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy' }, { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd' }]} />
              <Select label="Number format" defaultValue="IN"
                options={[{ value: 'IN', label: 'Indian — 12,45,678.00' }, { value: 'INTL', label: 'International — 1,245,678.00' }]} />
              <Switch checked={showLakhCrore} onChange={setShowLakhCrore} label="Show amounts in lakh/crore on dashboards" />
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={regOpen}
        onClose={() => setRegOpen(false)}
        title="Add statutory registration"
        footer={
          <>
            <Button variant="outline" onClick={() => setRegOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Registration added'); setRegOpen(false) }}>Add</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select label="Registration type" required
            options={['GSTIN', 'IEC', 'FACTORY_LICENCE', 'PCB_CONSENT', 'EPF', 'ESI', 'PT', 'UDYAM', 'ISO_9001', 'ISO_14001', 'BIS', 'FSSAI', 'LEGAL_METROLOGY', 'TRADE_LICENCE'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))} />
          <Input label="Registration number" required />
          <Input label="Issuing authority" required />
          <Select label="Applies to branch" options={[{ value: '', label: 'Company-wide' }, ...branches.filter((b) => b.companyUid === company.uid).map((b) => ({ value: b.uid, label: b.name }))]} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valid from" type="date" required />
            <Input label="Valid to" type="date" hint="Blank = perpetual" />
          </div>
          <div>
            <p className="field-label">Certificate document</p>
            <div className="flex h-20 items-center justify-center rounded border-2 border-dashed border-border text-xs text-fg-subtle">
              Drop a PDF here or click to browse
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
