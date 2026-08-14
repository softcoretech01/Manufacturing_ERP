import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  Building2,
  FileCheck2,
  Landmark,
  MapPin,
  Package,
  Plus,
  Star,
  Upload,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, Avatar, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { AddressFormModal, ContactFormModal, BankAccountFormModal, ComplianceDocFormModal } from './SupplierForms'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import {
  GovernanceCard,
  LifecycleTrail,
  MasterActions,
  MasterStatusBadge,
  RevisionPanel,
  RulesCard,
  WhereUsedPanel,
} from '@/components/masters/MasterShell'
import { cn } from '@/lib/cn'
import { formatCurrency, formatDate, formatPercent } from '@/lib/format'
import type { Supplier } from '@/types/masters'

/* ─────────────────────────── GSTIN validation ─────────────────────────── */

const STATE_CODES: Record<string, string> = {
  '03': 'Punjab', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '19': 'West Bengal', '23': 'Madhya Pradesh', '24': 'Gujarat', '27': 'Maharashtra',
  '29': 'Karnataka', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '36': 'Telangana', '37': 'Andhra Pradesh',
}

/**
 * A GSTIN is not just 15 characters. It embeds the state code and the PAN, and
 * checking all three together catches the transcription errors that a length
 * check alone lets through.
 */
export function validateGstin(gstin: string, pan?: string): string[] {
  const errors: string[] = []
  const v = gstin.trim().toUpperCase()
  if (!v) return ['GSTIN is required for a registered supplier.']
  if (v.length !== 15) errors.push(`GSTIN must be exactly 15 characters — this is ${v.length}.`)
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v)) {
    errors.push('Structure is invalid. Expected 2 digits, 5 letters, 4 digits, 1 letter, 1 alphanumeric, "Z", 1 alphanumeric.')
  }
  const state = v.slice(0, 2)
  if (state && !STATE_CODES[state]) errors.push(`State code "${state}" is not a valid GST state code.`)
  if (pan && v.length >= 12) {
    const embedded = v.slice(2, 12)
    if (embedded !== pan.trim().toUpperCase()) {
      errors.push(`Characters 3–12 must equal the PAN. GSTIN carries "${embedded}" but the PAN field says "${pan.toUpperCase()}".`)
    }
  }
  return errors
}

/* ─────────────────────────── Rating ─────────────────────────── */

function RatingStars({ grade, score }: { grade: Supplier['ratingGrade']; score: number }) {
  const stars = grade === 'A' ? 4 : grade === 'B' ? 3 : grade === 'C' ? 2 : 1
  return (
    <span className="flex items-center gap-1.5" title={`Score ${score}/100`}>
      <span className="flex">
        {Array.from({ length: 4 }, (_, i) => (
          <Star
            key={i}
            className={cn('h-3 w-3', i < stars ? 'fill-warning text-warning' : 'text-border-strong')}
          />
        ))}
      </span>
      <Badge tone={grade === 'A' ? 'success' : grade === 'B' ? 'progress' : grade === 'C' ? 'warning' : 'danger'} size="sm" dot={false}>
        {grade}
      </Badge>
    </span>
  )
}

/* ─────────────────────────── Detail drawer ─────────────────────────── */

function SupplierDetail({ s, onClose, onEdit, onSubmit, onUpdate }: { s: Supplier; onClose: () => void; onEdit: () => void; onSubmit: () => void; onUpdate: (s: Supplier) => Promise<any> }) {
  const toast = useToast()
  const [tab, setTab] = useState('general')
  const [addressOpen, setAddressOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  const [docOpen, setDocOpen] = useState(false)

  const expired = s.complianceDocs.filter((d) => d.status === 'EXPIRED')
  const expiring = s.complianceDocs.filter((d) => d.status === 'EXPIRING')

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-4xl"
      title={`${s.code} — ${s.name}`}
      description={`${s.vendorType.replace(/_/g, ' ').toLowerCase()} · ${s.category}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MasterStatusBadge status={s.status} />
            {s.isBlacklisted && <Badge tone="danger">Blacklisted</Badge>}
            {s.isApprovedVendor && <Badge tone="success" size="sm">Approved vendor</Badge>}
          </div>
          <MasterActions
            status={s.status}
            usageCount={s.whereUsed.filter((w) => w.isOpen).length}
            onEdit={onEdit}
            onSubmit={onSubmit}
          />
        </div>
      }
    >
      <div className="space-y-4">
        <LifecycleTrail status={s.status} />

        {s.isBlacklisted && (
          <Alert tone="danger" title="This supplier is blacklisted">
            {s.blacklistReason} — no new purchase order can be raised against them. Existing open
            orders are unaffected and must be closed or cancelled deliberately.
          </Alert>
        )}
        {expired.length > 0 && (
          <Alert tone="danger" title={`${expired.length} compliance document has expired`}>
            {expired.map((d) => d.type).join(', ')}. Goods receipt is blocked until a current
            document is on file.
          </Alert>
        )}
        {expiring.length > 0 && expired.length === 0 && (
          <Alert tone="warning" title={`${expiring.length} document expiring within 45 days`}>
            {expiring.map((d) => `${d.type} (${formatDate(d.validTo)})`).join(', ')}. The supplier
            contact has been notified automatically.
          </Alert>
        )}

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'addresses', label: 'Addresses', count: s.addresses.length },
            { id: 'contacts', label: 'Contacts', count: s.contacts.length },
            { id: 'financial', label: 'Financial' },
            { id: 'compliance', label: 'Compliance', count: s.complianceDocs.length },
            { id: 'performance', label: 'Performance' },
            { id: 'whereused', label: 'Where used', count: s.whereUsed.length },
            { id: 'revisions', label: 'Revisions', count: s.revisions.length },
          ]}
        />

        {tab === 'general' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Identity" icon={<Building2 className="h-4 w-4" />} />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Supplier code', value: s.code, mono: true },
                    { label: 'Trade name', value: s.name },
                    { label: 'Legal name', value: s.legalName },
                    { label: 'Vendor type', value: s.vendorType.replace(/_/g, ' ').toLowerCase() },
                    { label: 'Category', value: s.category },
                    { label: 'GSTIN', value: s.gstin || '— overseas —', mono: true },
                    { label: 'GST registration', value: s.gstRegistrationType.toLowerCase() },
                    { label: 'PAN', value: s.pan || '—', mono: true },
                    { label: 'MSME', value: s.msmeNumber ? `${s.msmeCategory} · ${s.msmeNumber}` : 'Not registered' },
                  ]}
                />
              </CardBody>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Supplied categories" icon={<Package className="h-4 w-4" />} />
                <CardBody className="flex flex-wrap gap-1.5">
                  {s.suppliedCategories.map((c) => (
                    <Badge key={c} tone="neutral" size="sm" dot={false}>{c}</Badge>
                  ))}
                </CardBody>
              </Card>

              {s.msmeCategory && (
                <Alert tone="info" title="MSME payment protection applies">
                  Under the MSMED Act payment to a registered {s.msmeCategory?.toLowerCase()}{' '}
                  enterprise must be made within 45 days. The system blocks a longer payment term on
                  this supplier and flags any invoice approaching the limit.
                </Alert>
              )}

              <GovernanceCard
                createdBy={s.createdBy}
                createdAt={s.createdAt}
                modifiedBy={s.modifiedBy}
                modifiedAt={s.modifiedAt}
                approvedBy={s.approvedBy}
                approvedAt={s.approvedAt}
                revision={s.revision}
                effectiveFrom={s.effectiveFrom}
                effectiveTo={s.effectiveTo}
              />
            </div>
          </div>
        )}

        {tab === 'addresses' && (
          <Card>
            <CardHeader
              title="Addresses"
              description="A separate GSTIN per state is a separate registration, not a second address line"
              actions={<Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddressOpen(true)}>Add address</Button>}
            />
            <CardBody className="space-y-2">
              {s.addresses.map((a, i) => (
                <div key={i} className="rounded border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-fg-subtle" />
                      <span className="text-xs font-medium text-fg">{a.label}</span>
                      <Badge tone="neutral" size="sm" dot={false}>{a.type.toLowerCase()}</Badge>
                      {a.isDefault && <Badge tone="brand" size="sm">Default</Badge>}
                    </span>
                    {a.gstin && <span className="font-mono text-2xs text-fg-muted">{a.gstin}</span>}
                  </div>
                  <p className="mt-1.5 text-xs text-fg-muted">
                    {a.line1}
                    {a.line2 && `, ${a.line2}`}, {a.city}, {a.state} {a.pincode}, {a.country}
                  </p>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {tab === 'contacts' && (
          <Card>
            <CardHeader
              title="Contact persons"
              actions={<Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setContactOpen(true)}>Add contact</Button>}
            />
            <CardBody className="space-y-2">
              {s.contacts.map((c, i) => (
                <div key={i} className="flex items-start gap-3 rounded border border-border p-3">
                  <Avatar name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-fg">{c.name}</span>
                      {c.isPrimary && <Badge tone="brand" size="sm">Primary</Badge>}
                      <Badge tone="neutral" size="sm" dot={false}>{c.purpose.toLowerCase()}</Badge>
                    </div>
                    <p className="text-2xs text-fg-subtle">{c.designation}</p>
                    <p className="mt-1 text-2xs text-fg-muted">
                      {c.email} · {c.mobile}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {tab === 'financial' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Commercial terms" />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Currency', value: s.currency },
                    { label: 'Payment terms', value: s.paymentTermsCode },
                    { label: 'Credit days', value: `${s.creditDays} days` },
                    { label: 'Credit limit', value: formatCurrency(s.creditLimit, s.currency) },
                  ]}
                />
                {s.msmeCategory && s.creditDays > 45 && (
                  <Alert tone="danger" className="mt-3" title="Payment term exceeds the MSME limit">
                    {s.creditDays} days is longer than the 45-day statutory maximum for a registered
                    MSME supplier.
                  </Alert>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Bank accounts"
                icon={<Landmark className="h-4 w-4" />}
                description="Verified by penny-drop before any payment can be released"
              />
              <CardBody className="space-y-2">
                {s.bankAccounts.length === 0 && (
                  <p className="text-xs text-fg-muted">No bank account on file — payment cannot be released.</p>
                )}
                {s.bankAccounts.map((b, i) => (
                  <div key={i} className="rounded border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-fg">{b.bankName}</span>
                      {b.isVerified ? (
                        <Badge tone="success" size="sm">Verified</Badge>
                      ) : (
                        <Badge tone="warning" size="sm">Unverified</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-2xs text-fg-subtle">{b.branchName}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-2xs text-fg-muted">
                      <span>A/c {b.accountNumber}</span>
                      {b.ifsc && <span>IFSC {b.ifsc}</span>}
                      {b.swift && <span>SWIFT {b.swift}</span>}
                      <span>{b.currency}</span>
                    </div>
                    {!b.isVerified && (
                      <p className="mt-1.5 text-2xs text-warning">
                        A payment run will skip this account until it is verified.
                      </p>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'compliance' && (
          <Card>
            <CardHeader
              title="Compliance documents"
              icon={<FileCheck2 className="h-4 w-4" />}
              description="Expiry is watched daily and notified to the supplier and the buyer"
              actions={<Button variant="outline" size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => toast.info('Upload compliance document', 'Opens the document upload form.')}>Upload</Button>}
            />
            <CardBody className="p-0">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th className="w-48">Number</th>
                    <th className="w-40">Issued by</th>
                    <th className="w-32">Valid to</th>
                    <th className="w-28">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.complianceDocs.map((d, i) => (
                    <tr key={i}>
                      <td className="font-medium text-fg">{d.type}</td>
                      <td><span className="font-mono text-2xs">{d.documentNo}</span></td>
                      <td className="text-fg-muted">{d.issuedBy}</td>
                      <td>{formatDate(d.validTo)}</td>
                      <td>
                        <Badge tone={d.status === 'VALID' ? 'success' : d.status === 'EXPIRING' ? 'warning' : 'danger'} size="sm">
                          {d.status.toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}

        {tab === 'performance' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Supplier rating" description="Recomputed after every completed purchase cycle" />
              <CardBody className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-fg-muted">Overall score</span>
                  <span className="flex items-center gap-3">
                    <span className="text-2xl font-semibold text-fg tabular">{s.rating}</span>
                    <RatingStars grade={s.ratingGrade} score={s.rating} />
                  </span>
                </div>
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-fg-muted">On-time delivery</span>
                    <span className="text-fg tabular">{formatPercent(s.onTimeDeliveryPct)}</span>
                  </div>
                  <ProgressBar value={s.onTimeDeliveryPct} tone={s.onTimeDeliveryPct >= 90 ? 'success' : s.onTimeDeliveryPct >= 80 ? 'warning' : 'danger'} />
                </div>
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-fg-muted">Quality acceptance</span>
                    <span className="text-fg tabular">{formatPercent(s.qualityAcceptancePct)}</span>
                  </div>
                  <ProgressBar value={s.qualityAcceptancePct} tone={s.qualityAcceptancePct >= 97 ? 'success' : s.qualityAcceptancePct >= 92 ? 'warning' : 'danger'} />
                </div>
                <p className="text-2xs text-fg-subtle">
                  Grade A ≥ 85, B ≥ 70, C ≥ 55, D below. A supplier who drops to D is automatically
                  removed from the approved vendor list and requires re-qualification.
                </p>
              </CardBody>
            </Card>

            <RulesCard
              title="Evaluation rules"
              rules={[
                'On-time delivery is measured against the promised date on the purchase order, not the revised date.',
                'Quality acceptance counts accepted quantity over received quantity across all GRNs in the period.',
                'A single critical quality escalation caps the grade at C for the rest of the financial year.',
                'The rating is advisory for sourcing decisions and blocking for automatic PO release above the configured value.',
              ]}
            />
          </div>
        )}

        {tab === 'whereused' && <WhereUsedPanel entries={s.whereUsed} />}
        {tab === 'revisions' && <RevisionPanel revisions={s.revisions} />}
      </div>
      
      <AddressFormModal open={addressOpen} onClose={() => setAddressOpen(false)} onSave={async (a) => {
        try {
          await onUpdate({ ...s, addresses: [...s.addresses, a] })
          setAddressOpen(false)
        } catch(e) {
          toast.error("Failed to add address")
        }
      }} />
      <ContactFormModal open={contactOpen} onClose={() => setContactOpen(false)} onSave={async (c) => {
        try {
          await onUpdate({ ...s, contacts: [...s.contacts, c] })
          setContactOpen(false)
        } catch(e) {
          toast.error("Failed to add contact")
        }
      }} />
      <BankAccountFormModal open={bankOpen} onClose={() => setBankOpen(false)} onSave={async (b) => {
        try {
          await onUpdate({ ...s, bankAccounts: [...s.bankAccounts, b] })
          setBankOpen(false)
        } catch(e) {
          toast.error("Failed to add bank account")
        }
      }} />
      <ComplianceDocFormModal open={docOpen} onClose={() => setDocOpen(false)} onSave={async (d) => {
        try {
          await onUpdate({ ...s, complianceDocs: [...s.complianceDocs, d] })
          setDocOpen(false)
        } catch(e) {
          toast.error("Failed to add document")
        }
      }} />
    </Drawer>
  )
}

/* ─────────────────────────── New supplier form ─────────────────────────── */

function SupplierForm({ s, open, onClose, onSave }: { s?: Supplier | null; open: boolean; onClose: () => void; onSave: (data: Partial<Supplier>) => Promise<any> }) {
  const toast = useToast()
  
  const [name, setName] = useState(s?.name || '')
  const [legalName, setLegalName] = useState(s?.legalName || '')
  const [vendorType, setVendorType] = useState<any>(s?.vendorType || 'MANUFACTURER')
  const [category, setCategory] = useState(s?.category || '')
  const [currency, setCurrency] = useState(s?.currency || 'INR')
  const [paymentTermsCode, setPaymentTermsCode] = useState(s?.paymentTermsCode || 'PT-30D')
  const [creditLimit, setCreditLimit] = useState(s?.creditLimit || 0)
  const [msmeNumber, setMsmeNumber] = useState(s?.msmeNumber || '')
  const [notes, setNotes] = useState(s?.description || '')

  const [gstin, setGstin] = useState(s?.gstin || '')
  const [pan, setPan] = useState(s?.pan || '')
  const [regType, setRegType] = useState<any>(s?.gstRegistrationType || 'REGULAR')
  const [isMsme, setIsMsme] = useState(!!s?.msmeCategory)
  const [creditDays, setCreditDays] = useState(s?.creditDays || 30)

  useEffect(() => {
    if (open) {
      setName(s?.name || '')
      setLegalName(s?.legalName || '')
      setVendorType(s?.vendorType || 'MANUFACTURER')
      setCategory(s?.category || '')
      setCurrency(s?.currency || 'INR')
      setPaymentTermsCode(s?.paymentTermsCode || 'PT-30D')
      setCreditLimit(s?.creditLimit || 0)
      setMsmeNumber(s?.msmeNumber || '')
      setNotes(s?.description || '')
      setGstin(s?.gstin || '')
      setPan(s?.pan || '')
      setRegType(s?.gstRegistrationType || 'REGULAR')
      setIsMsme(!!s?.msmeCategory)
      setCreditDays(s?.creditDays || 30)
    }
  }, [s, open])

  const gstErrors = regType === 'REGULAR' || regType === 'COMPOSITION' ? validateGstin(gstin, pan) : []
  const stateName = gstin.length >= 2 ? STATE_CODES[gstin.slice(0, 2)] : undefined
  const msmeBreach = isMsme && creditDays > 45

  const handleSubmit = async (status: 'DRAFT' | 'PENDING_APPROVAL') => {
    try {
      const payload: Partial<Supplier> = {
        name,
        shortName: name.substring(0, 50),
        legalName,
        vendorType,
        gstRegistrationType: regType,
        pan: pan || undefined,
        gstin: gstin || undefined,
        category,
        currency,
        paymentTermsCode,
        creditDays,
        creditLimit,
        msmeCategory: isMsme ? 'MICRO' : undefined,
        msmeNumber: isMsme ? msmeNumber : undefined,
        description: notes,
        status: status,
      }

      if (s) {
        payload.code = s.code
        payload.revision = s.revision
        payload.version = s.version
        payload.effectiveFrom = s.effectiveFrom
        payload.companyUid = s.companyUid
      } else {
        payload.effectiveFrom = new Date().toISOString()
        payload.companyUid = 'C01' // Mock company UID
      }

      await onSave(payload)
      toast.success(status === 'DRAFT' ? 'Saved as draft' : 'Submitted for approval')
      onClose()
    } catch (e) {
      toast.error('Failed to save supplier', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={s ? `Edit supplier` : `New supplier`}
      description="Saved as a draft and routed for approval. A supplier cannot receive a purchase order until approved."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => handleSubmit('DRAFT')}>Save draft</Button>
          <Button
            variant="primary"
            disabled={gstErrors.length > 0 || msmeBreach}
            onClick={() => handleSubmit('PENDING_APPROVAL')}
          >
            Submit for approval
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3.5">
          <Input label="Trade name" required placeholder="Jindal Stainless" value={name} onChange={e => setName(e.target.value)} />
          <Input label="Legal name" required placeholder="Jindal Stainless Limited" hint="As printed on the GST certificate — used on the purchase order." value={legalName} onChange={e => setLegalName(e.target.value)} />
          <Select
            label="Vendor type"
            required
            value={vendorType}
            onChange={e => setVendorType(e.target.value)}
            options={[
              { value: 'MANUFACTURER', label: 'Manufacturer' },
              { value: 'TRADER', label: 'Trader' },
              { value: 'SERVICE', label: 'Service provider' },
              { value: 'JOB_WORK', label: 'Job work' },
              { value: 'TRANSPORTER', label: 'Transporter' },
            ]}
          />
          <Select
            label="GST registration type"
            required
            value={regType}
            onChange={(e) => setRegType(e.target.value)}
            options={[
              { value: 'REGULAR', label: 'Regular' },
              { value: 'COMPOSITION', label: 'Composition' },
              { value: 'UNREGISTERED', label: 'Unregistered' },
              { value: 'SEZ', label: 'SEZ' },
              { value: 'OVERSEAS', label: 'Overseas' },
            ]}
          />
          <Input
            label="PAN"
            required={regType !== 'OVERSEAS'}
            value={pan}
            onChange={(e) => setPan(e.target.value.toUpperCase())}
            placeholder="AAACJ4323N"
            maxLength={10}
            className="font-mono uppercase"
          />
          <div>
            <Input
              label="GSTIN"
              required={regType === 'REGULAR' || regType === 'COMPOSITION'}
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="06AAACJ4323N1ZP"
              maxLength={15}
              className="font-mono uppercase"
              error={gstin && gstErrors.length ? `${gstErrors.length} problem${gstErrors.length > 1 ? 's' : ''}` : undefined}
              hint={stateName ? `State code ${gstin.slice(0, 2)} → ${stateName}` : undefined}
            />
            {gstin && gstErrors.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {gstErrors.map((e, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-2xs text-danger">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            )}
            {gstin && gstErrors.length === 0 && (
              <p className="mt-1.5 text-2xs text-success">
                Structure, embedded PAN and state code all check out.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3.5">
          <Input label="Category" placeholder="Raw Material — Steel" value={category} onChange={e => setCategory(e.target.value)} />
          <Select
            label="Currency"
            required
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            options={[
              { value: 'INR', label: 'INR — Indian Rupee' },
              { value: 'USD', label: 'USD — US Dollar' },
              { value: 'EUR', label: 'EUR — Euro' },
            ]}
          />
          <Select
            label="Payment terms"
            required
            value={paymentTermsCode}
            onChange={e => setPaymentTermsCode(e.target.value)}
            options={[
              { value: 'PT-COD', label: 'Cash on delivery' },
              { value: 'PT-15D', label: 'Net 15 days' },
              { value: 'PT-30D', label: 'Net 30 days' },
              { value: 'PT-45D', label: 'Net 45 days' },
              { value: 'PT-60D', label: 'Net 60 days' },
            ]}
          />
          <Input
            label="Credit days"
            type="number"
            required
            value={creditDays}
            onChange={(e) => setCreditDays(Number(e.target.value))}
            error={msmeBreach ? 'Exceeds the 45-day MSME statutory limit' : undefined}
          />
          <Input label="Credit limit (₹)" type="number" value={creditLimit} onChange={e => setCreditLimit(Number(e.target.value))} />
          <div className="space-y-2.5 rounded border border-border p-3">
            <Switch checked={isMsme} onChange={setIsMsme} label="Registered MSME supplier" />
            {isMsme && (
              <Input label="Udyam registration number" placeholder="UDYAM-TN-02-0044118" className="font-mono" value={msmeNumber} onChange={e => setMsmeNumber(e.target.value)} />
            )}
            {msmeBreach && (
              <p className="text-2xs text-danger">
                The MSMED Act caps payment to a registered MSME at 45 days. Reduce the credit days
                before submitting.
              </p>
            )}
          </div>
          <Textarea label="Notes" rows={2} placeholder="Anything an approver should know." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}

/* ─────────────────────────── Page ─────────────────────────── */

export function SupplierMasterPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: list = [], isLoading, error } = useQuery({
    queryKey: ['suppliers'],
    queryFn: api.getSuppliers,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Supplier> }) => api.updateSupplier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })

  const createMutation = useMutation({
    mutationFn: api.createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })

  const create = (data: Partial<Supplier>) => createMutation.mutateAsync(data)

  const update = (uid: string | number, data: Partial<Supplier>) => updateMutation.mutate({ id: uid as number, data })
  const remove = (uid: string | number) => deleteMutation.mutate(uid as number)

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'suppliers', 'Suppliers', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('list')
  const [detail, setDetail] = useState<Supplier | null>(null)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    if (filter === 'blacklisted') return list.filter((s) => s.isBlacklisted)
    if (filter === 'pending') return list.filter((s) => s.status === 'PENDING_APPROVAL' || s.status === 'DRAFT')
    if (filter === 'expired') return list.filter((s) => s.complianceDocs.some((d) => d.status === 'EXPIRED'))
    if (filter === 'msme') return list.filter((s) => !!s.msmeCategory)
    return list
  }, [filter, list])

  const expiredDocs = list.filter((s) => s.complianceDocs.some((d) => d.status === 'EXPIRED'))
  const blacklisted = list.filter((s) => s.isBlacklisted)
  const pending = list.filter((s) => s.status === 'PENDING_APPROVAL' || s.status === 'DRAFT')

  const columns: Column<Supplier>[] = [
    {
      key: 'code',
      header: 'Supplier',
      sortable: true,
      sticky: true,
      width: '250px',
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">
            {s.name}
            {s.isBlacklisted && <Ban className="ml-1.5 inline h-3 w-3 text-danger" />}
          </p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{s.code}</p>
        </div>
      ),
      accessor: (s) => s.name,
    },
    { key: 'vendorType', header: 'Type', sortable: true, width: '130px', render: (s) => <Badge tone="neutral" size="sm" dot={false}>{s.vendorType.replace(/_/g, ' ').toLowerCase()}</Badge> },
    { key: 'category', header: 'Category', width: '180px', render: (s) => <span className="truncate text-xs text-fg-muted">{s.category}</span> },
    { key: 'gstin', header: 'GSTIN', width: '160px', render: (s) => <span className="font-mono text-2xs">{s.gstin || <span className="text-fg-subtle">overseas</span>}</span> },
    {
      key: 'msme',
      header: 'MSME',
      width: '100px',
      defaultHidden: true,
      accessor: (s) => s.msmeCategory ?? '',
      render: (s) => (s.msmeCategory ? <Badge tone="progress" size="sm" dot={false}>{s.msmeCategory.toLowerCase()}</Badge> : <span className="text-2xs text-fg-subtle">—</span>),
    },
    { key: 'creditDays', header: 'Terms', align: 'right', width: '100px', sortable: true, render: (s) => <span className="tabular">{s.creditDays} d</span> },
    { key: 'creditLimit', header: 'Credit limit', align: 'right', sortable: true, width: '140px', render: (s) => formatCurrency(s.creditLimit, s.currency) },
    {
      key: 'rating',
      header: 'Rating',
      width: '140px',
      sortable: true,
      accessor: (s) => s.rating,
      render: (s) => (s.rating === 0 ? <span className="text-2xs text-fg-subtle">not rated</span> : <RatingStars grade={s.ratingGrade} score={s.rating} />),
    },
    {
      key: 'compliance',
      header: 'Compliance',
      width: '130px',
      accessor: (s) => s.complianceDocs.filter((d) => d.status === 'EXPIRED').length,
      render: (s) => {
        const exp = s.complianceDocs.filter((d) => d.status === 'EXPIRED').length
        const soon = s.complianceDocs.filter((d) => d.status === 'EXPIRING').length
        if (exp) return <Badge tone="danger" size="sm">{exp} expired</Badge>
        if (soon) return <Badge tone="warning" size="sm">{soon} expiring</Badge>
        return <Badge tone="success" size="sm">Current</Badge>
      },
    },
    { key: 'status', header: 'Status', width: '140px', sortable: true, render: (s) => <MasterStatusBadge status={s.status} size="sm" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Used by RFQ, purchase orders, goods receipt, quality inspection, supplier evaluation and accounts payable. A change here is felt in six modules, which is why it is approval-controlled."
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }, { label: 'Business Partners' }, { label: 'Suppliers' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => toast.info('Import suppliers', 'Download the template, fill it, dry-run, then commit.')}>
              Import
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditTarget(null); setFormOpen(true) }}>
              New supplier
            </Button>
          </>
        }
      />

      {expiredDocs.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${expiredDocs.length} supplier has an expired compliance document`}>
          {expiredDocs.map((s) => s.name).join(', ')}. Goods receipt against these suppliers is
          blocked until a current document is uploaded — that is a control, not an inconvenience.
        </Alert>
      )}

      {tab === 'list' && (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(s) => s.id}
          searchPlaceholder="Name, code, GSTIN or category…"
          pageSize={20}
          onRowClick={setDetail}
          onExport={doExport}
          filterChips={filter ? [{ key: 'f', label: 'Filter', value: filter, onRemove: () => setFilter('') }] : []}
          onClearFilters={() => setFilter('')}
          toolbar={
            <Select
              sizeVariant="sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              options={[
                { value: '', label: 'All suppliers' },
                { value: 'pending', label: 'Awaiting approval' },
                { value: 'expired', label: 'Expired documents' },
                { value: 'blacklisted', label: 'Blacklisted' },
                { value: 'msme', label: 'MSME registered' },
              ]}
            />
          }
          rowClassName={(s) => (s.isBlacklisted ? 'bg-danger/[0.03]' : undefined)}
          rowActions={(s) => (
            <>
              <MenuItem label="Open" onClick={() => setDetail(s)} />
              <MenuItem label="Edit" onClick={() => setDetail(s)} />
              <MenuItem label="Supplier evaluation" onClick={() => navigate('/procurement/evaluation')} />
              <MenuItem label={`Where used (${s.whereUsed.length})`} onClick={() => setDetail(s)} />
              <MenuItem
                label={s.isBlacklisted ? 'Remove from blacklist' : 'Blacklist'}
                danger={!s.isBlacklisted}
                separatorBefore
                onClick={() => {
                  update(s.id, { ...s, isBlacklisted: !s.isBlacklisted, isApprovedVendor: s.isBlacklisted })
                  toast.success(s.isBlacklisted ? 'Removed from blacklist' : 'Blacklisted', s.name)
                }}
              />
              <MenuItem
                label={s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                danger={s.status === 'ACTIVE'}
                disabled={s.whereUsed.length > 0 && s.whereUsed.some((w) => w.isOpen)}
                onClick={() => {
                  update(s.id, { ...s, status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
                  toast.success(s.status === 'ACTIVE' ? 'Deactivated' : 'Activated', s.name)
                }}
              />
              <MenuItem
                label={s.whereUsed.length ? `Delete — blocked (${s.whereUsed.length} refs)` : 'Delete'}
                danger
                disabled={s.whereUsed.length > 0}
                onClick={() => {
                  remove(s.id)
                  toast.success('Deleted', `${s.code} — ${s.name}`)
                }}
              />
            </>
          )}
        />
      )}

      

      {detail && <SupplierDetail 
        s={detail} 
        onClose={() => setDetail(null)} 
        onEdit={() => { setEditTarget(detail); setFormOpen(true) }} 
        onSubmit={() => {
          update(detail.id, { ...detail, status: 'PENDING_APPROVAL' })
          toast.success('Submitted for approval', `${detail.code} — ${detail.name}`)
          setDetail(null)
        }}
        onUpdate={async (updatedS) => {
          await update(updatedS.id, updatedS)
          setDetail(updatedS)
        }}
      />}
      <SupplierForm 
        s={editTarget} 
        open={formOpen} 
        onClose={() => setFormOpen(false)} 
        onSave={(data) => editTarget ? update(editTarget.id, data) : create(data)} 
      />
    </div>
  )
}
