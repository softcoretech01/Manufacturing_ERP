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
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { EnterpriseCard, SectionHeading } from '@/components/ui'
import type { ContactPerson } from '@/types/masters'

export function ContactMasterPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: api.getContacts,
  })

  const createMutation = useMutation({
    mutationFn: api.createContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact created successfully')
      setFormOpen(false)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ContactPerson> }) => api.updateContact(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      if (viewTarget?.id === updated.id) setViewTarget(updated)
      toast.success('Contact updated successfully')
      setFormOpen(false)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact deleted')
      setViewTarget(null)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const [viewTarget, setViewTarget] = useState<ContactPerson | null>(null)
  const [editTarget, setEditTarget] = useState<ContactPerson | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filterText, setFilterText] = useState('')

  const filteredData = useMemo(() => {
    if (!filterText) return contacts
    const lower = filterText.toLowerCase()
    return contacts.filter(c => 
      c.name.toLowerCase().includes(lower) || 
      c.code.toLowerCase().includes(lower) ||
      c.partner.toLowerCase().includes(lower) ||
      c.email.toLowerCase().includes(lower)
    )
  }, [contacts, filterText])

  const columns = useMemo<Column<ContactPerson>[]>(() => [

    { key: 'sno', header: 'S.No', width: '60px', render: (_, i) => <span className="text-sm text-gray-500">{i + 1}</span> },
    { key: 'name', header: 'Contact Name', sortable: true, render: (c) => <span className="font-medium text-gray-900">{c.name}</span> },
    { key: 'partnerType', header: 'Partner Type', width: '120px', render: (c) => <Badge tone="neutral">{c.partnerType.toLowerCase()}</Badge> },
    { key: 'partner', header: 'Partner Name', sortable: true, width: '180px', render: (c) => <span className="text-sm truncate block max-w-full" title={c.partner}>{c.partner}</span> },
    { key: 'designation', header: 'Designation', width: '150px', render: (c) => <span className="text-sm truncate block max-w-full" title={c.designation || ''}>{c.designation || '—'}</span> },
    { key: 'phone', header: 'Phone', width: '120px', render: (c) => <span className="text-sm">{c.mobile || '—'}</span> },
    { key: 'email', header: 'Email', width: '200px', render: (c) => <span className="text-sm truncate block max-w-full" title={c.email}>{c.email || '—'}</span> },
  ], [])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Contact Persons"
        description="Manage individual contacts across all business partners."
        actions={
          <Button variant="primary" onClick={() => { setEditTarget(null); setFormOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            New Contact
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
        <div className="mb-4 w-72">
          <Input 
            icon={<Search className="h-4 w-4" />} 
            placeholder="Search contacts..." 
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
              rowKey={(c) => c.id.toString()}
              columns={columns}
              pageSize={15}
              rowActions={(c) => (
                <>
                  <MenuItem label="View" icon={<Eye className="h-4 w-4" />} onClick={() => setViewTarget(c)} />
                  <MenuItem label="Edit" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditTarget(c); setFormOpen(true) }} />
                  <MenuItem label="Delete" icon={<Trash2 className="h-4 w-4" />} danger onClick={() => {
                    if (confirm('Are you sure you want to delete this contact?')) deleteMutation.mutate(c.id)
                  }} />
                </>
              )}
            />
          </EnterpriseCard>
        )}

        {viewTarget && (
          <ContactViewDrawer 
            contact={viewTarget} 
            onClose={() => setViewTarget(null)} 
          />
        )}

        <ContactFormModal 
          contact={editTarget} 
          open={formOpen} 
          onClose={() => setFormOpen(false)}
          onSave={(data) => {
            if (editTarget) updateMutation.mutate({ id: editTarget.id, data })
            else createMutation.mutate(data)
          }}
        />
      </div>
    </div>
  )
}

function ContactViewDrawer({ contact: c, onClose }: { contact: ContactPerson, onClose: () => void }) {
  const department = (c as any).department || '—'
  const landline = (c as any).landline || '—'

  return (
    <Drawer open onClose={onClose} title={`View Contact: ${c.name}`} width="max-w-2xl">
      <div className="p-6 space-y-6 bg-gray-50/30">
        <EnterpriseCard className="p-5">
          <SectionHeading title="1. Basic Information" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">

            <div><span className="block text-gray-500 mb-1">Contact Name</span><span className="font-medium text-gray-900">{c.name}</span></div>
            <div><span className="block text-gray-500 mb-1">Partner Type</span><span className="font-medium text-gray-900 capitalize">{c.partnerType.toLowerCase()}</span></div>
            <div><span className="block text-gray-500 mb-1">Partner Name</span><span className="font-medium text-gray-900">{c.partner}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="2. Role Details" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div><span className="block text-gray-500 mb-1">Designation</span><span className="font-medium text-gray-900">{c.designation || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Department</span><span className="font-medium text-gray-900">{department}</span></div>
            <div><span className="block text-gray-500 mb-1">Purpose</span><span className="font-medium text-gray-900 capitalize">{c.purpose.toLowerCase()}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="3. Contact Information" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div><span className="block text-gray-500 mb-1">Phone</span><span className="font-medium text-gray-900">{c.mobile || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Email</span><span className="font-medium text-gray-900">{c.email || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Landline</span><span className="font-medium text-gray-900">{landline}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="4. System Access" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div><span className="block text-gray-500 mb-1">Portal Access</span><span className="font-medium text-gray-900">{c.hasPortalAccess ? 'Enabled' : 'Disabled'}</span></div>
          </div>
        </EnterpriseCard>
      </div>
    </Drawer>
  )
}

function ContactFormModal({ contact: c, open, onClose, onSave }: { contact?: ContactPerson | null, open: boolean, onClose: () => void, onSave: (data: Partial<ContactPerson>) => void }) {
  const [code, setCode] = useState(c?.code || '')
  const [name, setName] = useState(c?.name || '')
  const [partnerType, setPartnerType] = useState(c?.partnerType || 'CUSTOMER')
  const [partner, setPartner] = useState(c?.partner || '')
  
  const [designation, setDesignation] = useState(c?.designation || '')
  const [department, setDepartment] = useState((c as any)?.department || '')
  const [purpose, setPurpose] = useState(c?.purpose || 'COMMERCIAL')
  
  const [phone, setPhone] = useState(c?.mobile || '')
  const [email, setEmail] = useState(c?.email || '')
  const [landline, setLandline] = useState((c as any)?.landline || '')
  
  const [hasPortalAccess, setHasPortalAccess] = useState(c?.hasPortalAccess || false)

  const handleSave = () => {
    const payload: Partial<ContactPerson> & Record<string, any> = {
      code,
      name,
      partnerType: partnerType as any,
      partner,
      designation,
      purpose: purpose as any,
      mobile: phone,
      email,
      hasPortalAccess,
      status: c?.status || 'ACTIVE',
      // Extended fields
      department,
      landline
    }

    onSave(payload as Partial<ContactPerson>)
  }

  // Ideally, 'Partner Name' would be a dynamic dropdown fetching from the /customers or /suppliers API based on partnerType.
  // For now we use a free text Input to ensure the user can save without waiting for those APIs to load.

  return (
    <Modal open={open} onClose={onClose} title={c ? 'Edit Contact' : 'New Contact'} width="max-w-2xl" footer={
      <div className="flex justify-end gap-3 w-full">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>{c ? 'Update' : 'Save'}</Button>
      </div>
    }>
      <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto bg-gray-50/30">
        <EnterpriseCard className="p-5">
          <SectionHeading title="1. Basic Information" />
          <div className="grid grid-cols-2 gap-4">

            <Input label="Contact Name" value={name} onChange={e => setName(e.target.value)} required />
            <Select label="Partner Type" value={partnerType} onChange={e => setPartnerType(e.target.value)} required options={[
              {label: 'Customer', value: 'CUSTOMER'}, {label: 'Supplier', value: 'SUPPLIER'}, {label: 'Transporter', value: 'TRANSPORTER'}
            ]} />
            <Input label="Partner Name" value={partner} onChange={e => setPartner(e.target.value)} required placeholder="e.g. Acme Corp" />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="2. Role Details" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Designation" value={designation} onChange={e => setDesignation(e.target.value)} />
            <Input label="Department" value={department} onChange={e => setDepartment(e.target.value)} />
            <Select label="Purpose" value={purpose} onChange={e => setPurpose(e.target.value)} required options={[
              {label: 'Commercial', value: 'COMMERCIAL'}, {label: 'Technical', value: 'TECHNICAL'}, 
              {label: 'Quality', value: 'QUALITY'}, {label: 'Accounts', value: 'ACCOUNTS'}, {label: 'Logistics', value: 'LOGISTICS'}
            ]} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="3. Contact Information" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} required />
            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input label="Landline" value={landline} onChange={e => setLandline(e.target.value)} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="4. System Access" />
          <div className="flex items-center gap-2 h-10">
            <input type="checkbox" checked={hasPortalAccess} onChange={e => setHasPortalAccess(e.target.checked)} className="rounded border-gray-300" />
            <span className="text-sm font-medium text-gray-700">Grant Portal Access</span>
          </div>
        </EnterpriseCard>
      </div>
    </Modal>
  )
}
