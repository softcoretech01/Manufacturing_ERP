import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/api/masters'
import { Eye, Pencil, Trash2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { EnterpriseCard, SectionHeading } from '@/components/ui'
import { useMasterOptions } from '@/hooks/useMasterOptions'
import type { Supplier } from '@/types/masters'

export function SupplierMasterPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: api.getSuppliers,
  })

  const createMutation = useMutation({
    mutationFn: api.createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Supplier created successfully')
      setFormOpen(false)
    },
    onError: (err: any) => {
      const details = err?.problem?.errors || err?.problem?.detail || err?.response?.data || err.message;
      alert("Validation Error: " + JSON.stringify(details, null, 2));
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: Partial<Supplier> }) => api.updateSupplier(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      if (viewTarget?.id === updated.id) setViewTarget(updated)
      toast.success('Supplier updated successfully')
      setFormOpen(false)
    },
    onError: (err: any) => {
      const details = err?.problem?.errors || err?.problem?.detail || err?.response?.data || err.message;
      alert("Validation Error: " + JSON.stringify(details, null, 2));
    }
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Supplier deleted')
      setViewTarget(null)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const [viewTarget, setViewTarget] = useState<Supplier | null>(null)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filterText, setFilterText] = useState('')

  const filteredData = useMemo(() => {
    if (!filterText) return suppliers
    const lower = filterText.toLowerCase()
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(lower) || 
      s.code.toLowerCase().includes(lower) || 
      s.gstin?.toLowerCase().includes(lower)
    )
  }, [suppliers, filterText])

  const columns = useMemo<Column<Supplier>[]>(() => [
    { key: 'sno', header: 'S.No', width: '60px', render: (_, i) => <span className="text-sm text-gray-500">{i + 1}</span> },
    { key: 'name', header: 'Supplier Name', sortable: true, render: (s) => <span className="font-medium text-gray-900">{s.name}</span> },
    { key: 'type', header: 'Type', width: '120px', render: (s) => <Badge tone="neutral">{s.vendorType?.replace(/_/g, ' ').toLowerCase() || '—'}</Badge> },
    { key: 'phone', header: 'Phone', width: '130px', render: (s) => <span className="text-sm">{s.contacts?.[0]?.mobile || '—'}</span> },
    { key: 'email', header: 'Email', width: '200px', render: (s) => <span className="text-sm">{s.contacts?.[0]?.email || '—'}</span> },
    { key: 'city', header: 'City', width: '130px', render: (s) => <span className="text-sm">{s.addresses?.[0]?.city || '—'}</span> },
  ], [])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Suppliers"
        description="Manage supplier accounts and business details."
        actions={
          <Button variant="primary" onClick={() => { setEditTarget(null); setFormOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            New Supplier
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
        <div className="mb-4 w-72">
          <Input 
            icon={<Search className="h-4 w-4" />} 
            placeholder="Search suppliers..." 
            value={filterText} 
            onChange={(e) => setFilterText(e.target.value)} 
          />
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : (
          <EnterpriseCard className="mb-0">
            <DataTable
              rows={filteredData}
              rowKey={(s) => s.id?.toString() || s.code}
              columns={columns}
              pageSize={15}
              rowActions={(s) => (
                <>
                  <MenuItem label="View" icon={<Eye className="h-4 w-4" />} onClick={() => setViewTarget(s)} />
                  <MenuItem label="Edit" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditTarget(s); setFormOpen(true) }} />
                  <MenuItem label="Delete" icon={<Trash2 className="h-4 w-4" />} danger onClick={() => {
                    if (confirm('Are you sure you want to delete this supplier?')) deleteMutation.mutate(s.id as number)
                  }} />
                </>
              )}
            />
          </EnterpriseCard>
        )}

        {viewTarget && (
          <SupplierViewDrawer 
            supplier={viewTarget} 
            onClose={() => setViewTarget(null)} 
          />
        )}

        <SupplierFormModal 
          supplier={editTarget} 
          open={formOpen} 
          onClose={() => setFormOpen(false)}
          onSave={(data) => {
            if (editTarget) updateMutation.mutate({ id: editTarget.id as number, data })
            else createMutation.mutate(data)
          }}
        />
      </div>
    </div>
  )
}

function SupplierViewDrawer({ supplier: s, onClose }: { supplier: Supplier, onClose: () => void }) {
  const contact = s.contacts?.[0]
  const address = s.addresses?.[0]

  return (
    <Drawer open onClose={onClose} title={`View Supplier: ${s.name}`} width="max-w-3xl">
      <div className="p-6 space-y-6 bg-gray-50/30">
        <EnterpriseCard className="p-5">
          <SectionHeading title="1. Basic Information" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">

            <div><span className="block text-gray-500 mb-1">Supplier Name</span><span className="font-medium text-gray-900">{s.name}</span></div>
            <div><span className="block text-gray-500 mb-1">Supplier Type</span><span className="font-medium text-gray-900 capitalize">{s.vendorType?.replace(/_/g, ' ').toLowerCase() || '—'}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="2. Contact Details" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div><span className="block text-gray-500 mb-1">Phone</span><span className="font-medium text-gray-900">{contact?.mobile || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Email</span><span className="font-medium text-gray-900">{contact?.email || '—'}</span></div>

          </div>
        </EnterpriseCard>


        <EnterpriseCard className="p-5">
          <SectionHeading title="4. Address Details" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div className="col-span-2"><span className="block text-gray-500 mb-1">Address Line 1</span><span className="font-medium text-gray-900">{address?.line1 || '—'}</span></div>
            <div className="col-span-2"><span className="block text-gray-500 mb-1">Address Line 2</span><span className="font-medium text-gray-900">{address?.line2 || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Country</span><span className="font-medium text-gray-900">{address?.country || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">State</span><span className="font-medium text-gray-900">{address?.state || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">City</span><span className="font-medium text-gray-900">{address?.city || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Pincode</span><span className="font-medium text-gray-900">{address?.pincode || '—'}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="5. Business Info" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div><span className="block text-gray-500 mb-1">Payment Terms</span><span className="font-medium text-gray-900">{s.paymentTermsCode || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Credit Limit</span><span className="font-medium text-gray-900">{s.creditLimit}</span></div>
            <div><span className="block text-gray-500 mb-1">Currency</span><span className="font-medium text-gray-900">{s.currency || '—'}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="6. Additional Information" />
          <div className="text-sm">
            <span className="block text-gray-500 mb-1">Remarks</span>
            <span className="font-medium text-gray-900">{s.description || '—'}</span>
          </div>
        </EnterpriseCard>
      </div>
    </Drawer>
  )
}

function SupplierFormModal({ supplier: s, open, onClose, onSave }: { supplier?: Supplier | null, open: boolean, onClose: () => void, onSave: (data: Partial<Supplier>) => void }) {
  const contact = s?.contacts?.[0]
  const address = s?.addresses?.[0]

  const [code, setCode] = useState(s?.code || '')
  const [name, setName] = useState(s?.name || '')
  const [vendorType, setVendorType] = useState(s?.vendorType || 'MANUFACTURER')
  const [phone, setPhone] = useState(contact?.mobile || '')
  const [email, setEmail] = useState(contact?.email || '')

  const [gstin, setGstin] = useState(s?.gstin || '')
  const [pan, setPan] = useState(s?.pan || '')
  const [line1, setLine1] = useState(address?.line1 || '')
  const [line2, setLine2] = useState(address?.line2 || '')
  const [country, setCountry] = useState(address?.country || 'India')
  const [state, setState] = useState(address?.state || '')
  const [city, setCity] = useState(address?.city || '')
  const [pincode, setPincode] = useState(address?.pincode || '')
  const [paymentTermsCode, setPaymentTermsCode] = useState(s?.paymentTermsCode || '')
  const [creditLimit, setCreditLimit] = useState(s?.creditLimit?.toString() || '0')
  const [currency, setCurrency] = useState(s?.currency || 'INR')
  const [remarks, setRemarks] = useState(s?.description || '')
  const paymentTermOptions = useMasterOptions('PAYMENT_TERMS')
  const currencyOptions = useMasterOptions('CURRENCY')

  const handleSave = () => {
    // Construct the payload matching the backend requirements
    const payload: Partial<Supplier> = {
      code,
      name,
      legalName: name, // Default legalName to name if not separate
      shortName: name.substring(0, 50),
      vendorType: vendorType as any,
      category: s?.category || 'Standard',
      gstin: gstin || null,
      pan: pan || null,
      currency,
      paymentTermsCode,
      creditLimit: parseFloat(creditLimit) || 0,
      description: remarks || null,
      gstRegistrationType: gstin ? 'REGULAR' : 'UNREGISTERED',
      creditDays: s?.creditDays || 0,
      status: s?.status || 'PENDING_APPROVAL',
      effectiveFrom: s?.effectiveFrom || new Date().toISOString(),
      companyUid: s?.companyUid || 'cmp-01',
      revision: s?.revision || 1,
      version: s?.version || 1,
      addresses: [{
        uid: address?.uid || '',
        type: 'REGISTERED',
        label: 'Primary',
        line1,
        line2,
        city,
        state,
        stateCode: '',
        pincode,
        country,
        gstin: gstin || null,
        isDefault: true,
        isActive: true
      }],
      contacts: [{
        uid: contact?.uid || '',
        name: name,
        designation: 'Primary Contact',
        department: 'General',
        email,
        mobile: phone,
        landline: '',
        isPrimary: true,
        purpose: 'COMMERCIAL',
        isActive: true
      }]
    }

    onSave(payload)
  }

  return (
    <Modal open={open} onClose={onClose} title={s ? 'Edit Supplier' : 'New Supplier'} width="max-w-4xl" footer={
      <div className="flex justify-end gap-3 w-full">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>{s ? 'Update' : 'Save'}</Button>
      </div>
    }>
      <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto bg-gray-50/30">
        <EnterpriseCard className="p-5">
          <SectionHeading title="1. Basic Information" />
          <div className="grid grid-cols-2 gap-4">

            <Input label="Supplier Name" value={name} onChange={e => setName(e.target.value)} required />
            <Select label="Supplier Type" value={vendorType} onChange={e => setVendorType(e.target.value)} required options={[
              {label: 'Manufacturer', value: 'MANUFACTURER'}, {label: 'Trader', value: 'TRADER'}, {label: 'Service', value: 'SERVICE'}, {label: 'Job Work', value: 'JOB_WORK'}, {label: 'Transporter', value: 'TRANSPORTER'}
            ]} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="2. Contact Details" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} required />
            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />

          </div>
        </EnterpriseCard>


        <EnterpriseCard className="p-5">
          <SectionHeading title="4. Address Details" />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Input label="Address Line 1" value={line1} onChange={e => setLine1(e.target.value)} required /></div>
            <div className="col-span-2"><Input label="Address Line 2" value={line2} onChange={e => setLine2(e.target.value)} /></div>
            <Input label="Country" value={country} onChange={e => setCountry(e.target.value)} required />
            <Input label="State" value={state} onChange={e => setState(e.target.value)} required />
            <Input label="City" value={city} onChange={e => setCity(e.target.value)} required />
            <Input label="Pincode" value={pincode} onChange={e => setPincode(e.target.value)} required />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="5. Business Info" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Payment Terms" value={paymentTermsCode} onChange={e => setPaymentTermsCode(e.target.value)} options={[{ value: '', label: '— select —' }, ...paymentTermOptions]} />
            <Input label="Credit Limit" type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
            <Select label="Currency" value={currency} onChange={e => setCurrency(e.target.value)} options={currencyOptions} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="6. Additional Information" />
          <Textarea label="Remarks" value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} />
        </EnterpriseCard>
      </div>
    </Modal>
  )
}
