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
import type { Transporter } from '@/types/masters'

export function TransporterMasterPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: transporters = [], isLoading } = useQuery({
    queryKey: ['transporters'],
    queryFn: api.getTransporters,
  })

  const createMutation = useMutation({
    mutationFn: api.createTransporter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporters'] })
      toast.success('Transporter created successfully')
      setFormOpen(false)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transporter> }) => api.updateTransporter(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['transporters'] })
      if (viewTarget?.id === updated.id) setViewTarget(updated)
      toast.success('Transporter updated successfully')
      setFormOpen(false)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteTransporter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporters'] })
      toast.success('Transporter deleted')
      setViewTarget(null)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const [viewTarget, setViewTarget] = useState<Transporter | null>(null)
  const [editTarget, setEditTarget] = useState<Transporter | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filterText, setFilterText] = useState('')

  const filteredData = useMemo(() => {
    if (!filterText) return transporters
    const lower = filterText.toLowerCase()
    return transporters.filter(t => 
      t.name.toLowerCase().includes(lower) || 
      t.code.toLowerCase().includes(lower) ||
      t.transporterId.toLowerCase().includes(lower)
    )
  }, [transporters, filterText])

  const parseExtras = (t: Transporter) => {
    try {
      if (t.serviceZones && t.serviceZones.startsWith('{')) {
        return JSON.parse(t.serviceZones)
      }
    } catch (e) {}
    return {
      email: '',
      addressLine1: '',
      city: '',
      gstin: '',
      pan: '',
      vehicleType: '',
      vehicleNumber: '',
      remarks: t.serviceZones || ''
    }
  }

  const columns = useMemo<Column<Transporter>[]>(() => [
    { key: 'sno', header: 'S.No', width: '60px', render: (_, i) => <span className="text-sm text-gray-500">{i + 1}</span> },
    { key: 'name', header: 'Transporter Name', sortable: true, render: (t) => <span className="font-medium text-gray-900">{t.name}</span> },
    { key: 'type', header: 'Type', width: '120px', render: (t) => <Badge tone="neutral">{t.mode.toLowerCase()}</Badge> },
    { key: 'phone', header: 'Phone', width: '130px', render: (t) => <span className="text-sm">{t.contactMobile || '—'}</span> },
    { key: 'city', header: 'City', width: '130px', render: (t) => <span className="text-sm">{parseExtras(t).city || '—'}</span> },
    { key: 'vehicleType', header: 'Vehicle Type', width: '150px', render: (t) => <span className="text-sm">{parseExtras(t).vehicleType || '—'}</span> },
  ], [])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Transporters"
        description="Manage transportation and logistics partners."
        actions={
          <Button variant="primary" onClick={() => { setEditTarget(null); setFormOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            New Transporter
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
        <div className="mb-4 w-72">
          <Input 
            icon={<Search className="h-4 w-4" />} 
            placeholder="Search transporters..." 
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
              rowKey={(t) => t.id.toString()}
              columns={columns}
              pageSize={15}
              rowActions={(t) => (
                <>
                  <MenuItem label="View" icon={<Eye className="h-4 w-4" />} onClick={() => setViewTarget(t)} />
                  <MenuItem label="Edit" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditTarget(t); setFormOpen(true) }} />
                  <MenuItem label="Delete" icon={<Trash2 className="h-4 w-4" />} danger onClick={() => {
                    if (confirm('Are you sure you want to delete this transporter?')) deleteMutation.mutate(t.id)
                  }} />
                </>
              )}
            />
          </EnterpriseCard>
        )}

        {viewTarget && (
          <TransporterViewDrawer 
            transporter={viewTarget} 
            extras={parseExtras(viewTarget)}
            onClose={() => setViewTarget(null)} 
          />
        )}

        <TransporterFormModal 
          transporter={editTarget} 
          extras={editTarget ? parseExtras(editTarget) : null}
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

function TransporterViewDrawer({ transporter: t, extras, onClose }: { transporter: Transporter, extras: any, onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} title={`View Transporter: ${t.name}`} width="max-w-3xl">
      <div className="p-6 space-y-6 bg-gray-50/30">
        <EnterpriseCard className="p-5">
          <SectionHeading title="1. Basic Information" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">

            <div><span className="block text-gray-500 mb-1">Transporter Name</span><span className="font-medium text-gray-900">{t.name}</span></div>
            <div><span className="block text-gray-500 mb-1">Transporter Type (Mode)</span><span className="font-medium text-gray-900 capitalize">{t.mode.toLowerCase()}</span></div>
            <div><span className="block text-gray-500 mb-1">Transporter ID</span><span className="font-mono text-gray-900">{t.transporterId}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="2. Contact Details" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div><span className="block text-gray-500 mb-1">Phone</span><span className="font-medium text-gray-900">{t.contactMobile || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Email</span><span className="font-medium text-gray-900">{extras.email || '—'}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="3. Tax & Legal" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">

            <div><span className="block text-gray-500 mb-1">GTA Status</span><span className="font-medium text-gray-900">{t.isGta ? 'Yes' : 'No'}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="4. Address Details" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div className="col-span-2"><span className="block text-gray-500 mb-1">Address Line 1</span><span className="font-medium text-gray-900">{extras.addressLine1 || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">City</span><span className="font-medium text-gray-900">{extras.city || '—'}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="5. Vehicle Info" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div><span className="block text-gray-500 mb-1">Vehicle Type</span><span className="font-medium text-gray-900">{extras.vehicleType || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Vehicle Number</span><span className="font-mono text-gray-900">{extras.vehicleNumber || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Fleet Size</span><span className="font-medium text-gray-900">{t.fleetSize}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="6. Additional Information" />
          <div className="text-sm">
            <span className="block text-gray-500 mb-1">Remarks</span>
            <span className="font-medium text-gray-900">{extras.remarks || '—'}</span>
          </div>
        </EnterpriseCard>
      </div>
    </Drawer>
  )
}

function TransporterFormModal({ transporter: t, extras, open, onClose, onSave }: { transporter?: Transporter | null, extras: any, open: boolean, onClose: () => void, onSave: (data: Partial<Transporter>) => void }) {
  const [code, setCode] = useState(t?.code || '')
  const [name, setName] = useState(t?.name || '')
  const [mode, setMode] = useState(t?.mode || 'ROAD')
  const [transporterId, setTransporterId] = useState(t?.transporterId || '')
  
  const [phone, setPhone] = useState(t?.contactMobile || '')
  const [email, setEmail] = useState(extras?.email || '')
  
  const [gstin, setGstin] = useState(extras?.gstin || '')
  const [pan, setPan] = useState(extras?.pan || '')
  const [isGta, setIsGta] = useState(t?.isGta || false)
  
  const [addressLine1, setAddressLine1] = useState(extras?.addressLine1 || '')
  const [city, setCity] = useState(extras?.city || '')
  
  const [vehicleType, setVehicleType] = useState(extras?.vehicleType || '')
  const [vehicleNumber, setVehicleNumber] = useState(extras?.vehicleNumber || '')
  const [fleetSize, setFleetSize] = useState(t?.fleetSize?.toString() || '0')
  
  const [remarks, setRemarks] = useState(extras?.remarks || '')

  const handleSave = () => {
    // Pack the extended fields into serviceZones as a JSON string to avoid breaking backend DB
    const extendedData = {
      email,
      addressLine1,
      city,
      gstin,
      pan,
      vehicleType,
      vehicleNumber,
      remarks
    }

    const payload: Partial<Transporter> = {
      code,
      name,
      mode,
      transporterId: transporterId.toUpperCase() || 'NA',
      contactMobile: phone || null,
      isGta,
      fleetSize: parseInt(fleetSize) || 0,
      serviceZones: JSON.stringify(extendedData), // Encoded extra fields
      status: t?.status || 'ACTIVE',
      effectiveFrom: t?.effectiveFrom || new Date().toISOString().split('T')[0]
    }

    onSave(payload)
  }

  return (
    <Modal open={open} onClose={onClose} title={t ? 'Edit Transporter' : 'New Transporter'} width="max-w-4xl" footer={
      <div className="flex justify-end gap-3 w-full">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>{t ? 'Update' : 'Save'}</Button>
      </div>
    }>
      <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto bg-gray-50/30">
        <EnterpriseCard className="p-5">
          <SectionHeading title="1. Basic Information" />
          <div className="grid grid-cols-2 gap-4">

            <Input label="Transporter Name" value={name} onChange={e => setName(e.target.value)} required />
            <Select label="Transporter Type (Mode)" value={mode} onChange={e => setMode(e.target.value)} required options={[
              {label: 'Road', value: 'ROAD'}, {label: 'Rail', value: 'RAIL'}, {label: 'Sea', value: 'SEA'}, {label: 'Air', value: 'AIR'}
            ]} />
            <Input label="Transporter ID" value={transporterId} onChange={e => setTransporterId(e.target.value)} required />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="2. Contact Details" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="3. Tax & Legal" />
          <div className="grid grid-cols-2 gap-4">

            <div className="flex items-center gap-2 h-10 mt-6">
              <input type="checkbox" checked={isGta} onChange={e => setIsGta(e.target.checked)} className="rounded border-gray-300" />
              <span className="text-sm">Goods Transport Agency (GTA)</span>
            </div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="4. Address Details" />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Input label="Address Line 1" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} /></div>
            <Input label="City" value={city} onChange={e => setCity(e.target.value)} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="5. Vehicle Info" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Vehicle Type" value={vehicleType} onChange={e => setVehicleType(e.target.value)} />
            <Input label="Vehicle Number" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} />
            <Input label="Fleet Size" type="number" value={fleetSize} onChange={e => setFleetSize(e.target.value)} />
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
