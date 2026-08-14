import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import type { ContactPerson } from '@/types/masters'

export function ContactMasterPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [detail, setDetail] = useState<ContactPerson | null>(null)
  const [editTarget, setEditTarget] = useState<ContactPerson | null>(null)
  const [formOpen, setFormOpen] = useState(false)

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
    onError: (err: Error) => toast.error(err.message)
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ContactPerson> }) => api.updateContact(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      if (detail && detail.id === updated.id) setDetail(updated)
      setFormOpen(false)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact deleted')
      setDetail(null)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const create = (data: Partial<ContactPerson>) => createMutation.mutate(data)
  const update = (id: number, data: Partial<ContactPerson>) => updateMutation.mutate({ id, data })
  const remove = (id: number) => deleteMutation.mutate(id)

  const columns = useMemo<Column<ContactPerson>[]>(() => [
    {
      key: 'code',
      header: 'CONTACT',
      render: (s) => (
        <div className="font-medium text-fg">
          {s.name}
          <div className="font-mono text-2xs text-fg-muted">{s.code}</div>
        </div>
      ),
    },
    {
      key: 'partner',
      header: 'PARTNER',
      render: (s) => (
        <div>
          <div className="font-medium text-fg">{s.partner}</div>
          <Badge tone="neutral" size="sm" dot={false}>{s.partnerType.toLowerCase()}</Badge>
        </div>
      ),
    },
    {
      key: 'purpose',
      header: 'PURPOSE',
      render: (s) => <Badge tone="neutral" size="sm" dot={false}>{s.purpose.toLowerCase()}</Badge>,
    },
    {
      key: 'email',
      header: 'EMAIL / MOBILE',
      render: (s) => (
        <div className="text-xs text-fg-subtle">
          <div>{s.email}</div>
          <div>{s.mobile}</div>
        </div>
      ),
    },
    {
      key: 'hasPortalAccess',
      header: 'PORTAL',
      render: (s) => (
        s.hasPortalAccess ? <Badge tone="positive" size="sm" dot={false}>Access</Badge> : <span className="text-fg-muted">—</span>
      ),
    },
    {
      key: 'status',
      header: 'STATUS',
      render: (s) => (
        <Badge tone={s.status === 'ACTIVE' ? 'positive' : 'neutral'} dot>
          {s.status.toLowerCase()}
        </Badge>
      ),
      align: 'right',
    },
  ], [])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Contact Persons"
        icon={Users}
        actions={
          <Button onClick={() => { setEditTarget(null); setFormOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            New contact
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex-1 p-6 text-sm text-fg-muted">Loading...</div>
        ) : (
          <DataTable
            rows={contacts}
            rowKey={(s) => s.id.toString()}
            columns={columns}
            pageSize={10}
            rowActions={(s) => (
              <>
                <MenuItem label="Open" onClick={() => setDetail(s)} />
                <MenuItem label="Edit" onClick={() => { setEditTarget(s); setFormOpen(true) }} />
                <MenuItem
                  label={s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  danger={s.status === 'ACTIVE'}
                  onClick={() => update(s.id, { ...s, status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                />
                <MenuItem
                  label="Delete"
                  danger
                  onClick={() => {
                    if (confirm('Delete this contact?')) remove(s.id)
                  }}
                />
              </>
            )}
          />
        )}

        <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Contact'}>
          {detail && (
            <div className="space-y-6">
              <Card>
                <CardHeader title="Summary" />
                <CardBody className="p-0">
                  <DataGrid
                    data={[
                      { label: 'Contact Code', value: detail.code },
                      { label: 'Status', value: detail.status },
                      { label: 'Partner', value: detail.partner },
                      { label: 'Partner Type', value: detail.partnerType },
                      { label: 'Designation', value: detail.designation || '—' },
                      { label: 'Purpose', value: detail.purpose },
                      { label: 'Email', value: detail.email },
                      { label: 'Mobile', value: detail.mobile },
                      { label: 'Portal Access', value: detail.hasPortalAccess ? 'Yes' : 'No' },
                      { label: 'Created At', value: formatDate(detail.createdDate) },
                    ]}
                  />
                </CardBody>
              </Card>
            </div>
          )}
        </Drawer>

        <ContactForm 
          s={editTarget} 
          open={formOpen} 
          onClose={() => setFormOpen(false)} 
          onSave={(data) => editTarget ? update(editTarget.id, data) : create(data)} 
        />
      </div>
    </div>
  )
}

function ContactForm({ s, open, onClose, onSave }: { s?: ContactPerson | null; open: boolean; onClose: () => void; onSave: (data: Partial<ContactPerson>) => void }) {
  const [code, setCode] = useState(s?.code || '')
  const [name, setName] = useState(s?.name || '')
  const [partner, setPartner] = useState(s?.partner || '')
  const [partnerType, setPartnerType] = useState<ContactPerson['partnerType']>(s?.partnerType || 'CUSTOMER')
  const [designation, setDesignation] = useState(s?.designation || '')
  const [purpose, setPurpose] = useState<ContactPerson['purpose']>(s?.purpose || 'COMMERCIAL')
  const [email, setEmail] = useState(s?.email || '')
  const [mobile, setMobile] = useState(s?.mobile || '')
  const [hasPortalAccess, setHasPortalAccess] = useState(s?.hasPortalAccess || false)
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(s?.status || 'ACTIVE')
  
  const [codeError, setCodeError] = useState('')
  const [mobileError, setMobileError] = useState('')

  useEffect(() => {
    if (open) {
      if (!s) {
        api.getNextContactCode().then(res => setCode(res.nextCode)).catch(() => setCode('AUTO'))
      } else {
        setCode(s.code)
      }
      setName(s?.name || '')
      setPartner(s?.partner || '')
      setPartnerType(s?.partnerType || 'CUSTOMER')
      setDesignation(s?.designation || '')
      setPurpose(s?.purpose || 'COMMERCIAL')
      setEmail(s?.email || '')
      setMobile(s?.mobile || '')
      setHasPortalAccess(s?.hasPortalAccess || false)
      setStatus(s?.status || 'ACTIVE')
      setCodeError('')
      setMobileError('')
    }
  }, [s, open])

  const handleSave = () => {
    let valid = true
    if (s) {
      if (code.trim().length === 0 || code.trim().length > 20) {
        setCodeError('Contact code is required and must be up to 20 characters')
        valid = false
      } else {
        setCodeError('')
      }
    }
    
    if (!/^[0-9]{10}$/.test(mobile.trim())) {
      setMobileError('Mobile number must be exactly 10 digits')
      valid = false
    } else {
      setMobileError('')
    }

    if (valid) {
      onSave({
        code: s ? code.trim() : 'AUTO',
        name: name.trim(),
        status,
        partner: partner.trim(),
        partnerType,
        designation: designation.trim() || null,
        purpose,
        email: email.trim(),
        mobile: mobile.trim(),
        hasPortalAccess
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={s ? 'Edit Contact' : 'New Contact'}>
      <div className="grid grid-cols-2 gap-4 p-6">
        <Input 
          label="Contact Code" 
          value={code || 'Loading...'} 
          onChange={e => setCode(e.target.value)} 
          error={codeError}
          maxLength={20}
          disabled
        />
        <Input 
          label="Name" 
          value={name} 
          onChange={e => setName(e.target.value)} 
          maxLength={150}
          required 
        />
        <Input 
          label="Partner Name" 
          value={partner} 
          onChange={e => setPartner(e.target.value)} 
          maxLength={150}
          required 
        />
        <Select 
          label="Partner Type" 
          value={partnerType} 
          onChange={e => setPartnerType(e.target.value as ContactPerson['partnerType'])} 
          options={[
            { label: 'Customer', value: 'CUSTOMER' },
            { label: 'Supplier', value: 'SUPPLIER' },
            { label: 'Transporter', value: 'TRANSPORTER' },
          ]} 
        />
        <Input 
          label="Designation" 
          value={designation} 
          onChange={e => setDesignation(e.target.value)} 
          maxLength={100}
        />
        <Select 
          label="Purpose" 
          value={purpose} 
          onChange={e => setPurpose(e.target.value as ContactPerson['purpose'])} 
          options={[
            { label: 'Commercial', value: 'COMMERCIAL' },
            { label: 'Technical', value: 'TECHNICAL' },
            { label: 'Quality', value: 'QUALITY' },
            { label: 'Accounts', value: 'ACCOUNTS' },
            { label: 'Logistics', value: 'LOGISTICS' },
          ]} 
        />
        <Input 
          label="Email" 
          type="email"
          value={email} 
          onChange={e => setEmail(e.target.value)} 
          maxLength={150}
          required
        />
        <Input 
          label="Mobile" 
          value={mobile} 
          onChange={e => {
            const val = e.target.value.replace(/[^0-9]/g, '')
            if (val.length <= 10) setMobile(val)
          }} 
          placeholder="10 digits"
          error={mobileError}
          maxLength={10}
          required
        />
        <div className="flex items-center justify-between p-2 rounded border border-border">
          <span className="text-sm font-medium">Portal Access</span>
          <Switch checked={hasPortalAccess} onChange={setHasPortalAccess} />
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t border-border p-6">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </Modal>
  )
}
