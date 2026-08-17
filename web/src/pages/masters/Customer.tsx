import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '@/api/masters'
import { AlertTriangle, CreditCard, Landmark, MapPin, Plus, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, Avatar, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GovernanceCard,
  LifecycleTrail,
  MasterActions,
  MasterStatusBadge,
  RevisionPanel,
  RulesCard,
  WhereUsedPanel,
} from '@/components/masters/MasterShell'
import { validateGstin } from './Supplier'
import { formatCompact, formatCurrency, formatDate } from '@/lib/format'
import type { Customer } from '@/types/masters'

function CustomerDetail({ c, onClose, onEdit }: { c: Customer; onClose: () => void; onEdit: (c: Customer) => void }) {
  const toast = useToast()
  const [tab, setTab] = useState('general')
  const utilisation = c.creditLimit ? (c.creditUsed / c.creditLimit) * 100 : 0
  const overLimit = c.creditUsed > c.creditLimit

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-4xl"
      title={`${c.code} — ${c.name}`}
      description={`${c.customerType.toLowerCase()} · ${c.group} · ${c.territory}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MasterStatusBadge status={c.status} />
            {c.creditHold && <Badge tone="danger">Credit hold</Badge>}
          </div>
          <MasterActions
            status={c.status}
            usageCount={c.whereUsed.filter((w) => w.isOpen).length}
            onEdit={() => onEdit(c)}
            onSubmit={() => toast.success('Submitted for approval')}
          />
        </div>
      }
    >
      <div className="space-y-4">
        <LifecycleTrail status={c.status} />

        {c.creditHold && (
          <Alert tone="danger" title="This customer is on credit hold">
            New sales orders cannot be confirmed and dispatch is blocked. Outstanding{' '}
            {formatCurrency(c.outstandingAmount)} against a limit of {formatCurrency(c.creditLimit)},
            of which {formatCurrency(c.overdueAmount)} is overdue.
          </Alert>
        )}
        {overLimit && !c.creditHold && (
          <Alert tone="warning" title="Credit limit exceeded">
            Exposure is {formatCurrency(c.creditUsed)} against a limit of {formatCurrency(c.creditLimit)}.
            The next order will require a credit override with a reason.
          </Alert>
        )}

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'addresses', label: 'Addresses', count: c.addresses.length },
            { id: 'contacts', label: 'Contacts', count: c.contacts.length },
            { id: 'credit', label: 'Credit & terms' },
            { id: 'whereused', label: 'Where used', count: c.whereUsed.length },
            { id: 'revisions', label: 'Revisions', count: c.revisions.length },
          ]}
        />

        {tab === 'general' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Identity" />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Customer code', value: c.code, mono: true },
                    { label: 'Trade name', value: c.name },
                    { label: 'Legal name', value: c.legalName },
                    { label: 'Customer type', value: c.customerType.toLowerCase() },
                    { label: 'Group', value: c.group },
                    { label: 'Category', value: c.category },
                    { label: 'GSTIN', value: c.gstin || '— overseas —', mono: true },
                    { label: 'PAN', value: c.pan || '—', mono: true },
                    { label: 'Territory', value: c.territory },
                    { label: 'Sales person', value: c.salesPerson },
                  ]}
                />
              </CardBody>
            </Card>
            <GovernanceCard
              createdBy={c.createdBy}
              createdAt={c.createdAt}
              modifiedBy={c.modifiedBy}
              modifiedAt={c.modifiedAt}
              approvedBy={c.approvedBy}
              approvedAt={c.approvedAt}
              revision={c.revision}
              effectiveFrom={c.effectiveFrom}
              effectiveTo={c.effectiveTo}
            />
          </div>
        )}

        {tab === 'addresses' && (
          <Card>
            <CardHeader
              title="Addresses"
              description="Ship-to addresses in a different state change the place of supply, and therefore the tax"
              actions={<Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => toast.info('Add address', 'Opens the address form.')}>Add address</Button>}
            />
            <CardBody className="space-y-2">
              {c.addresses.map((a) => (
                <div key={a.uid} className="rounded border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-fg-subtle" />
                      <span className="text-xs font-medium text-fg">{a.label}</span>
                      <Badge tone={a.type === 'BILLING' ? 'brand' : 'neutral'} size="sm" dot={false}>{a.type.toLowerCase()}</Badge>
                      {a.isDefault && <Badge tone="brand" size="sm">Default</Badge>}
                    </span>
                    {a.gstin && <span className="font-mono text-2xs text-fg-muted">{a.gstin}</span>}
                  </div>
                  <p className="mt-1.5 text-xs text-fg-muted">
                    {a.line1}, {a.city}, {a.state} {a.pincode}, {a.country}
                  </p>
                  {a.type === 'SHIPPING' && a.stateCode && a.stateCode !== c.addresses.find((x) => x.type === 'BILLING')?.stateCode && (
                    <p className="mt-1 text-2xs text-warning">
                      Different state from the billing address — supplies to this location attract IGST.
                    </p>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {tab === 'contacts' && (
          <Card>
            <CardHeader title="Contacts" actions={<Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => toast.info('Add contact', 'Opens the contact form.')}>Add contact</Button>} />
            <CardBody className="space-y-2">
              {c.contacts.map((p) => (
                <div key={p.uid} className="flex items-start gap-3 rounded border border-border p-3">
                  <Avatar name={p.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-fg">{p.name}</span>
                      {p.isPrimary && <Badge tone="brand" size="sm">Primary</Badge>}
                      <Badge tone="neutral" size="sm" dot={false}>{p.purpose.toLowerCase()}</Badge>
                    </div>
                    <p className="text-2xs text-fg-subtle">{p.designation}</p>
                    <p className="mt-1 text-2xs text-fg-muted">{p.email} · {p.mobile}</p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {tab === 'credit' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Credit exposure" icon={<CreditCard className="h-4 w-4" />} />
              <CardBody className="space-y-4">
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-fg-muted">Utilisation</span>
                    <span className="text-fg tabular">
                      {formatCurrency(c.creditUsed)} of {formatCurrency(c.creditLimit)}
                    </span>
                  </div>
                  <ProgressBar
                    value={Math.min(utilisation, 100)}
                    showLabel
                    tone={utilisation > 100 ? 'danger' : utilisation > 85 ? 'warning' : 'success'}
                  />
                </div>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Currency', value: c.currency },
                    { label: 'Price list', value: c.priceListCode },
                    { label: 'Payment terms', value: c.paymentTermsCode },
                    { label: 'Credit days', value: `${c.creditDays} days` },
                    { label: 'Total outstanding', value: formatCurrency(c.outstandingAmount) },
                    {
                      label: 'Overdue',
                      value: (
                        <span className={c.overdueAmount > 0 ? 'font-medium text-danger' : 'text-fg'}>
                          {formatCurrency(c.overdueAmount)}
                        </span>
                      ),
                    },
                  ]}
                />
              </CardBody>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Bank accounts" icon={<Landmark className="h-4 w-4" />} />
                <CardBody className="space-y-2">
                  {c.bankAccounts.length === 0 && (
                    <p className="text-xs text-fg-muted">
                      No bank account on file. Required before a refund or credit note can be settled.
                    </p>
                  )}
                  {c.bankAccounts.map((b) => (
                    <div key={b.uid} className="rounded border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-fg">{b.bankName}</span>
                        <Badge tone={b.isVerified ? 'success' : 'warning'} size="sm">
                          {b.isVerified ? 'Verified' : 'Unverified'}
                        </Badge>
                      </div>
                      <p className="mt-1 font-mono text-2xs text-fg-muted">
                        A/c {b.accountNumber} · {b.ifsc || b.swift} · {b.currency}
                      </p>
                    </div>
                  ))}
                </CardBody>
              </Card>

              <RulesCard
                title="Credit control rules"
                rules={[
                  'Order confirmation checks the limit against outstanding plus the value of the new order, not outstanding alone.',
                  'Exceeding the limit blocks confirmation; releasing it requires a credit override with a reason code.',
                  'Any invoice overdue beyond the grace period puts the account on automatic hold.',
                  'Credit hold blocks new orders and dispatch, but never blocks a return or a credit note.',
                ]}
              />
            </div>
          </div>
        )}

        {tab === 'whereused' && <WhereUsedPanel entries={c.whereUsed} />}
        {tab === 'revisions' && <RevisionPanel revisions={c.revisions} />}
      </div>
    </Drawer>
  )
}

function CustomerForm({ c, open, onClose }: { c?: Customer; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('general')
  const [isSaved, setIsSaved] = useState(!!c)
  
  // Form State
  const [name, setName] = useState(c?.name || '')
  const [legalName, setLegalName] = useState(c?.legalName || '')
  const [type, setType] = useState(c?.customerType || 'DOMESTIC')
  const [pan, setPan] = useState(c?.pan || '')
  const [gstin, setGstin] = useState(c?.gstin || '')
  const [territory, setTerritory] = useState(c?.territory || '')
  const [currency, setCurrency] = useState(c?.currency || 'INR')
  const [priceListCode, setPriceListCode] = useState(c?.priceListCode || 'PL-DIST-2026')
  const [paymentTermsCode, setPaymentTermsCode] = useState(c?.paymentTermsCode || 'PT-30D')
  const [limit, setLimit] = useState(c?.creditLimit || 0)
  const [requiresLc, setRequiresLc] = useState(false)
  const [notes, setNotes] = useState(c?.description || '')

  const [addresses, setAddresses] = useState<any[]>(c?.addresses || [])
  const [contacts, setContacts] = useState<any[]>(c?.contacts || [])
  const [addingAddress, setAddingAddress] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  
  // Temporary form states
  const [addrForm, setAddrForm] = useState({ label: 'HQ', line1: '', city: '', state: '', pincode: '' })
  const [contactForm, setContactForm] = useState({ name: '', designation: '', email: '', mobile: '' })

  const overseas = type === 'EXPORT'
  const gstErrors = overseas ? [] : validateGstin(gstin, pan)
  
  const createMutation = useMutation({
    mutationFn: api.createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Submitted for approval')
      onClose()
    },
    onError: (err) => toast.error('Creation failed', err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Customer> }) => api.updateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Updated successfully')
      onClose()
    },
    onError: (err) => toast.error('Update failed', err.message),
  })

  function handleSubmit() {
    const payload = {
      ...(c || {}),
      name,
      shortName: name.substring(0, 50),
      legalName,
      customerType: type as any,
      group: c?.group || 'General Trade', // default required field
      salesPerson: c?.salesPerson || 'System Administrator', // default required field
      pan,
      gstin,
      territory,
      currency,
      priceListCode,
      paymentTermsCode,
      creditLimit: limit,
      description: notes,
      addresses: addresses.map(a => ({ ...a, uid: a.uid || `adr-${Date.now()}-${Math.random().toString().slice(2, 6)}` })),
      contacts: contacts.map(c2 => ({ ...c2, uid: c2.uid || `cnt-${Date.now()}-${Math.random().toString().slice(2, 6)}`, department: c2.department || 'General', purpose: c2.purpose || 'COMMERCIAL' })),
    }

    if (c) {
      updateMutation.mutate({ id: c.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={c ? `Edit customer` : `New customer`}
      description="Credit limit and payment terms require finance approval before the customer can be sold to."
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-fg-muted">
            {!isSaved && "Save general information to add addresses and contacts."}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {!isSaved ? (
              <Button
                variant="primary"
                disabled={!overseas && gstErrors.length > 0}
                onClick={() => {
                  toast.success('General information saved');
                  setIsSaved(true);
                }}
              >
                Save general info
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { toast.success('Saved as draft'); onClose() }}>Save draft</Button>
                <Button 
                  variant="primary" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={handleSubmit}
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Submitting...' : 'Finish & Submit'}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'addresses', label: 'Addresses', disabled: !isSaved, count: addresses.length },
            { id: 'contacts', label: 'Contacts', disabled: !isSaved, count: contacts.length },
            ...(c ? [
              { id: 'credit', label: 'Credit & terms' },
              { id: 'whereused', label: 'Where used', count: c.whereUsed?.length || 0 },
              { id: 'revisions', label: 'Revisions', count: c.revisions?.length || 0 },
            ] : []),
          ]}
        />
        
        {tab === 'general' && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-3.5">
              <Input label="Trade name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Hydro Retail" />
              <Input label="Legal name" value={legalName} onChange={(e) => setLegalName(e.target.value)} required placeholder="Hydro Retail Private Limited" />
              <Select
                label="Customer type"
                required
                value={type}
                onChange={(e) => {
                  setType(e.target.value as Customer['customerType'])
                  if (e.target.value === 'EXPORT') setCurrency('USD')
                  else setCurrency('INR')
                }}
                options={[
                  { value: 'DOMESTIC', label: 'Domestic' },
                  { value: 'EXPORT', label: 'Export' },
                  { value: 'OEM', label: 'OEM' },
                  { value: 'DISTRIBUTOR', label: 'Distributor' },
                  { value: 'RETAIL', label: 'Retail' },
                  { value: 'ECOMMERCE', label: 'E-commerce' },
                ]}
              />
              <Input label="Territory" value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="South India" />
            </div>
            
            <div className="space-y-3.5">
              <Input
                label="PAN"
                required={!overseas}
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                maxLength={10}
                placeholder="AAFCH9911L"
                className="font-mono uppercase"
              />
              <div>
                <Input
                  label="GSTIN"
                  required={!overseas}
                  disabled={overseas}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  maxLength={15}
                  placeholder="29AAFCH9911L1ZM"
                  className="font-mono uppercase"
                  hint={overseas ? 'Not applicable to an export customer.' : undefined}
                />
                {!overseas && gstin && gstErrors.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {gstErrors.map((e, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-2xs text-danger">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Select
                label="Currency"
                required
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: 'INR', label: 'INR — Indian Rupee' },
                  { value: 'USD', label: 'USD — US Dollar' },
                  { value: 'EUR', label: 'EUR — Euro' },
                  { value: 'GBP', label: 'GBP — Pound Sterling' },
                ]}
              />
              <Select
                label="Price list"
                required
                value={priceListCode}
                onChange={(e) => setPriceListCode(e.target.value)}
                options={[
                  { value: 'PL-DIST-2026', label: 'Distributor 2026' },
                  { value: 'PL-OEM-2026', label: 'OEM 2026' },
                  { value: 'PL-RETAIL-2026', label: 'Retail 2026' },
                  { value: 'PL-ECOM-2026', label: 'E-commerce 2026' },
                  { value: 'PL-EXP-EUR-2026', label: 'Export EUR 2026' },
                ]}
              />
            </div>

            <div className="space-y-3.5">
              <Select
                label="Payment terms"
                required
                value={paymentTermsCode}
                onChange={(e) => setPaymentTermsCode(e.target.value)}
                options={[
                  { value: 'PT-COD', label: 'Cash on delivery' },
                  { value: 'PT-15D', label: 'Net 15 days' },
                  { value: 'PT-30D', label: 'Net 30 days' },
                  { value: 'PT-45D', label: 'Net 45 days' },
                  { value: 'PT-LC60', label: 'LC at 60 days sight' },
                ]}
              />
              <Input
                label="Credit limit (₹)"
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                hint={limit > 5000000 ? 'Above ₹50 lakh this needs the finance head, not the sales manager.' : undefined}
              />
              {overseas && (
                <div className="space-y-2.5 rounded border border-border p-3">
                  <Switch checked={requiresLc} onChange={setRequiresLc} label="Requires letter of credit" />
                  {requiresLc && (
                    <p className="text-2xs text-fg-subtle">
                      Dispatch will be blocked until an LC is recorded against the sales order and
                      confirmed by the bank.
                    </p>
                  )}
                </div>
              )}
              <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything an approver should know." />
            </div>
          </div>
        )}

        {tab === 'credit' && (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded border border-dashed border-border p-6 text-center">
            <h3 className="text-sm font-medium text-fg">Credit settings</h3>
            <p className="mt-1 text-xs text-fg-muted">Financial terms are set on the General tab.</p>
          </div>
        )}


        {tab === 'addresses' && (
          <div className="space-y-4">
            {addresses.map((a, i) => (
              <div key={i} className="flex justify-between rounded border border-border p-4">
                <div>
                  <h4 className="font-medium text-fg">{a.label}</h4>
                  <p className="text-xs text-fg-muted">{a.line1}, {a.city}, {a.state} - {a.pincode}</p>
                </div>
              </div>
            ))}
            
            {addingAddress ? (
              <div className="rounded border border-border p-4 space-y-4 bg-surface-2">
                <h4 className="font-medium text-fg">New Address</h4>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Label (e.g. HQ, Warehouse)" value={addrForm.label} onChange={(e) => setAddrForm({...addrForm, label: e.target.value})} />
                  <Input label="Line 1" value={addrForm.line1} onChange={(e) => setAddrForm({...addrForm, line1: e.target.value})} />
                  <Input label="City" value={addrForm.city} onChange={(e) => setAddrForm({...addrForm, city: e.target.value})} />
                  <Input label="State" value={addrForm.state} onChange={(e) => setAddrForm({...addrForm, state: e.target.value})} />
                  <Input label="Pincode" value={addrForm.pincode} onChange={(e) => setAddrForm({...addrForm, pincode: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAddingAddress(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={() => {
                    setAddresses([...addresses, { ...addrForm, type: 'BILLING', country: 'India' }])
                    setAddingAddress(false)
                    setAddrForm({ label: 'HQ', line1: '', city: '', state: '', pincode: '' })
                  }}>Save address</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddingAddress(true)}>
                Add address
              </Button>
            )}
          </div>
        )}

        {tab === 'contacts' && (
          <div className="space-y-4">
            {contacts.map((c, i) => (
              <div key={i} className="flex justify-between rounded border border-border p-4">
                <div>
                  <h4 className="font-medium text-fg">{c.name}</h4>
                  <p className="mt-1 text-2xs text-fg-muted">{c.email} · {c.mobile}</p>
                </div>
              </div>
            ))}

            {addingContact ? (
              <div className="rounded border border-border p-4 space-y-4 bg-surface-2">
                <h4 className="font-medium text-fg">New Contact</h4>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Name" value={contactForm.name} onChange={(e) => setContactForm({...contactForm, name: e.target.value})} />
                  <Input label="Designation" value={contactForm.designation} onChange={(e) => setContactForm({...contactForm, designation: e.target.value})} />
                  <Input label="Email" value={contactForm.email} onChange={(e) => setContactForm({...contactForm, email: e.target.value})} />
                  <Input label="Mobile" maxLength={10} value={contactForm.mobile} onChange={(e) => setContactForm({...contactForm, mobile: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAddingContact(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={() => {
                    setContacts([...contacts, { ...contactForm, isPrimary: contacts.length === 0 }])
                    setAddingContact(false)
                    setContactForm({ name: '', designation: '', email: '', mobile: '' })
                  }}>Save contact</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddingContact(true)}>
                Add contact
              </Button>
            )}
          </div>
        )}

        {tab === 'whereused' && (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded border border-dashed border-border p-6 text-center">
            <h3 className="text-sm font-medium text-fg">Where Used</h3>
            <p className="mt-1 text-xs text-fg-muted">{c?.whereUsed?.length ? `Used in ${c.whereUsed.length} documents.` : 'Not used anywhere yet.'}</p>
          </div>
        )}

        {tab === 'revisions' && (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded border border-dashed border-border p-6 text-center">
            <h3 className="text-sm font-medium text-fg">Revisions</h3>
            <p className="mt-1 text-xs text-fg-muted">{c?.revisions?.length ? `${c.revisions.length} revisions found.` : 'No revisions yet.'}</p>
          </div>
        )}

      </div>
    </Modal>
  )
}

export function CustomerMasterPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>()

  const { data: list = [], isLoading, isError } = useQuery({
    queryKey: ['customers'],
    queryFn: api.getCustomers,
  })
  
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Customer> }) => api.updateCustomer(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
    onError: (err) => toast.error('Update failed', err.message),
  })

  const removeMutation = useMutation({
    mutationFn: (id: number) => api.deleteCustomer(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
    onError: (err) => toast.error('Delete failed', err.message),
  })

  function update(id: number, data: Partial<Customer>) {
    updateMutation.mutate({ id, data })
  }
  function remove(id: number) {
    removeMutation.mutate(id)
  }

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'customers', 'Customers', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('list')
  const [detail, setDetail] = useState<Customer | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    if (filter === 'hold') return list.filter((c) => c.creditHold)
    if (filter === 'over') return list.filter((c) => c.creditUsed > c.creditLimit)
    if (filter === 'overdue') return list.filter((c) => c.overdueAmount > 0)
    if (filter === 'pending') return list.filter((c) => c.status !== 'ACTIVE' && c.status !== 'INACTIVE')
    return list
  }, [filter, list])

  const onHold = list.filter((c) => c.creditHold)
  const overdue = list.filter((c) => c.overdueAmount > 0)
  const totalOutstanding = list.reduce((s, c) => s + c.outstandingAmount, 0)

  const columns: Column<Customer>[] = [
    {
      key: 'code',
      header: 'Customer',
      sortable: true,
      sticky: true,
      width: '250px',
      accessor: (c) => c.name,
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{c.name}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{c.code}</p>
        </div>
      ),
    },
    { key: 'customerType', header: 'Type', sortable: true, width: '130px', render: (c) => <Badge tone="neutral" size="sm" dot={false}>{c.customerType.toLowerCase()}</Badge> },
    { key: 'group', header: 'Group', width: '150px', render: (c) => <span className="truncate text-xs text-fg-muted">{c.group}</span> },
    { key: 'territory', header: 'Territory', width: '130px', defaultHidden: true },
    { key: 'gstin', header: 'GSTIN', width: '160px', render: (c) => <span className="font-mono text-2xs">{c.gstin || <span className="text-fg-subtle">overseas</span>}</span> },
    { key: 'creditLimit', header: 'Credit limit', align: 'right', sortable: true, width: '130px', render: (c) => formatCurrency(c.creditLimit, c.currency) },
    {
      key: 'utilisation',
      header: 'Utilisation',
      width: '150px',
      accessor: (c) => (c.creditLimit ? (c.creditUsed / c.creditLimit) * 100 : 0),
      render: (c) => {
        const pct = c.creditLimit ? (c.creditUsed / c.creditLimit) * 100 : 0
        return <ProgressBar value={Math.min(pct, 100)} showLabel tone={pct > 100 ? 'danger' : pct > 85 ? 'warning' : 'success'} />
      },
    },
    {
      key: 'overdueAmount',
      header: 'Overdue',
      align: 'right',
      sortable: true,
      width: '130px',
      render: (c) =>
        c.overdueAmount > 0 ? (
          <span className="font-medium text-danger tabular">{formatCurrency(c.overdueAmount)}</span>
        ) : (
          <span className="text-2xs text-fg-subtle">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '160px',
      sortable: true,
      render: (c) => (
        <div className="flex flex-wrap items-center gap-1">
          <MasterStatusBadge status={c.status} size="sm" />
          {c.creditHold && <Badge tone="danger" size="sm">Hold</Badge>}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Read by CRM, sales orders, dispatch, invoicing and receivables. Credit limit and payment terms are finance-controlled, not sales-controlled."
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }, { label: 'Business Partners' }, { label: 'Customers' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => toast.info('Import customers')}>
              Import
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingCustomer(undefined); setFormOpen(true) }}>
              New customer
            </Button>
          </>
        }
      />

      {onHold.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${onHold.length} customer on credit hold`}>
          {onHold.map((c) => `${c.name} (${formatCurrency(c.overdueAmount)} overdue)`).join(', ')}.
          New orders and dispatch are blocked. Releasing the hold is a finance decision recorded on
          the audit trail.
        </Alert>
      )}

      {tab === 'list' && (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(c) => String(c.id)}
          searchPlaceholder="Name, code, GSTIN or territory…"
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
                { value: '', label: 'All customers' },
                { value: 'pending', label: 'Awaiting approval' },
                { value: 'hold', label: 'On credit hold' },
                { value: 'over', label: 'Over credit limit' },
                { value: 'overdue', label: 'With overdue balance' },
              ]}
            />
          }
          rowClassName={(c) => (c.creditHold ? 'bg-danger/[0.03]' : undefined)}
          rowActions={(c) => (
            <>
              <MenuItem label="Open" onClick={() => setDetail(c)} />
              <MenuItem label="Edit" onClick={() => { setEditingCustomer(c); setFormOpen(true) }} />
              <MenuItem label="Ledger & ageing" onClick={() => navigate('/inventory/ledger')} />
              <MenuItem label={`Where used (${c.whereUsed.length})`} onClick={() => setDetail(c)} />
              <MenuItem
                label={c.creditHold ? 'Release credit hold' : 'Place on credit hold'}
                danger={!c.creditHold}
                separatorBefore
                onClick={() => {
                  update(c.id, { creditHold: !c.creditHold })
                  toast.success(c.creditHold ? 'Credit hold released' : 'Placed on credit hold', c.name)
                }}
              />
              <MenuItem
                label={c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                danger={c.status === 'ACTIVE'}
                disabled={c.whereUsed.some((w) => w.isOpen)}
                onClick={() => {
                  update(c.id, { status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
                  toast.success(c.status === 'ACTIVE' ? 'Deactivated' : 'Activated', c.name)
                }}
              />
              <MenuItem
                label={c.whereUsed.length ? `Delete — blocked (${c.whereUsed.length} refs)` : 'Delete'}
                danger
                disabled={c.whereUsed.length > 0}
                onClick={() => { remove(c.id); toast.success('Deleted', `${c.code} — ${c.name}`) }}
              />
            </>
          )}
        />
      )}

      

      {detail && <CustomerDetail c={detail} onClose={() => setDetail(null)} onEdit={(c) => {
        setEditingCustomer(c)
        setFormOpen(true)
        setDetail(null)
      }} />}
      <CustomerForm key={editingCustomer?.id || 'new'} c={editingCustomer} open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
