import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { Transporter } from '@/types/masters'

export function TransporterMasterPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [detail, setDetail] = useState<Transporter | null>(null)
  const [editTarget, setEditTarget] = useState<Transporter | null>(null)
  const [formOpen, setFormOpen] = useState(false)

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
    onError: (err: Error) => toast.error(err.message)
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transporter> }) => api.updateTransporter(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['transporters'] })
      if (detail && detail.id === updated.id) setDetail(updated)
      setFormOpen(false)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteTransporter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transporters'] })
      setDetail(null)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const create = (data: Partial<Transporter>) => createMutation.mutate(data)
  const update = (id: number, data: Partial<Transporter>) => updateMutation.mutate({ id, data })
  const remove = (id: number) => deleteMutation.mutate(id)

  const columns = useMemo<Column<Transporter>[]>(() => [
    {
      key: 'code',
      header: 'TRANSPORTER',
      render: (s) => (
        <div className="font-medium text-fg">
          {s.name}
          <div className="font-mono text-2xs text-fg-muted">{s.code}</div>
        </div>
      ),
    },
    {
      key: 'transporterId',
      header: 'TRANSPORTER ID',
      render: (s) => <span className="font-mono text-xs text-fg-subtle">{s.transporterId}</span>,
    },
    {
      key: 'mode',
      header: 'MODE',
      render: (s) => <Badge tone="neutral" size="sm" dot={false}>{s.mode.toLowerCase()}</Badge>,
    },
    {
      key: 'isGta',
      header: 'GTA',
      render: (s) => s.isGta ? <Badge tone="warning" size="sm">GTA</Badge> : <span className="text-2xs text-fg-subtle">—</span>,
    },
    {
      key: 'fleetSize',
      header: 'FLEET SIZE',
      align: 'right',
      render: (s) => <span className="tabular">{s.fleetSize}</span>,
    },
    {
      key: 'contactMobile',
      header: 'CONTACT',
      render: (s) => s.contactMobile || <span className="text-2xs text-fg-subtle">—</span>,
    },
    {
      key: 'status',
      header: 'STATUS',
      render: (s) => (
        <Badge tone={s.status === 'ACTIVE' ? 'success' : s.status === 'DRAFT' ? 'neutral' : 'warning'} size="sm">
          {s.status.toLowerCase()}
        </Badge>
      ),
    },
  ], [])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Transporters"
        description="Carriers used for inbound and outbound movement."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditTarget(null); setFormOpen(true) }}>New transporter</Button>}
      />

      {isLoading ? (
        <div className="flex-1 p-6 text-sm text-fg-muted">Loading...</div>
      ) : (
        <DataTable
          rows={transporters}
          rowKey={(s) => s.id.toString()}
          columns={columns}
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
                  if (confirm('Delete this transporter?')) remove(s.id)
                }}
              />
            </>
          )}
        />
      )}

      {detail && (
        <Drawer open onClose={() => setDetail(null)} title={`${detail.code} — ${detail.name}`}>
          <div className="p-6">
            <Card>
              <CardHeader title="Identity" icon={<Building2 className="h-4 w-4" />} />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Transporter code', value: detail.code, mono: true },
                    { label: 'Name', value: detail.name },
                    { label: 'Transporter ID', value: detail.transporterId, mono: true },
                    { label: 'Mode', value: detail.mode },
                    { label: 'GTA', value: detail.isGta ? 'Yes' : 'No' },
                    { label: 'Fleet size', value: detail.fleetSize },
                    { label: 'Service zones', value: detail.serviceZones || '—' },
                    { label: 'Contact', value: detail.contactMobile || '—' },
                    { label: 'Effective from', value: formatDate(detail.effectiveFrom) },
                    { label: 'Status', value: detail.status },
                  ]}
                />
              </CardBody>
            </Card>
          </div>
        </Drawer>
      )}

      <TransporterForm 
        s={editTarget} 
        open={formOpen} 
        onClose={() => setFormOpen(false)} 
        onSave={(data) => editTarget ? update(editTarget.id, data) : create(data)} 
      />
    </div>
  )
}

function TransporterForm({ s, open, onClose, onSave }: { s?: Transporter | null; open: boolean; onClose: () => void; onSave: (data: Partial<Transporter>) => void }) {
  const [name, setName] = useState(s?.name || '')
  const [transporterId, setTransporterId] = useState(s?.transporterId || '')
  const [mode, setMode] = useState(s?.mode || 'ROAD')
  const [isGta, setIsGta] = useState(s?.isGta || false)
  const [fleetSize, setFleetSize] = useState(s?.fleetSize?.toString() || '0')
  const [serviceZones, setServiceZones] = useState(s?.serviceZones || '')
  const [contactMobile, setContactMobile] = useState(s?.contactMobile || '')
  const [transporterIdError, setTransporterIdError] = useState('')
  const [mobileError, setMobileError] = useState('')

  useEffect(() => {
    if (open) {
      setName(s?.name || '')
      setTransporterId(s?.transporterId || '')
      setMode(s?.mode || 'ROAD')
      setIsGta(s?.isGta || false)
      setFleetSize(s?.fleetSize?.toString() || '0')
      setServiceZones(s?.serviceZones || '')
      setContactMobile(s?.contactMobile || '')
      setTransporterIdError('')
      setMobileError('')
    }
  }, [s, open])

  const handleSave = () => {
    let valid = true
    if (transporterId.length === 0 || transporterId.length > 15 || !/^[A-Za-z0-9]+$/.test(transporterId)) {
      setTransporterIdError('Transporter ID must be up to 15 alphanumeric characters')
      valid = false
    } else {
      setTransporterIdError('')
    }
    
    if (contactMobile && !/^\d{10}$/.test(contactMobile)) {
      setMobileError('Mobile number must be exactly 10 digits')
      valid = false
    } else {
      setMobileError('')
    }

    if (valid) {
      onSave({
        name,
        transporterId: transporterId.toUpperCase(),
        mode,
        isGta,
        fleetSize: parseInt(fleetSize) || 0,
        serviceZones: serviceZones || null,
        contactMobile: contactMobile || null,
        status: s?.status || 'ACTIVE',
        effectiveFrom: s?.effectiveFrom || new Date().toISOString().split('T')[0]
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={s ? 'Edit Transporter' : 'New Transporter'} footer={<Button variant="primary" onClick={handleSave}>Save</Button>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input label="Name" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <Input 
          label="Transporter ID" 
          value={transporterId} 
          onChange={e => {
            const val = e.target.value
            setTransporterId(val)
            if (val.length > 0 && val.length <= 15 && /^[A-Za-z0-9]+$/.test(val)) setTransporterIdError('')
          }} 
          placeholder="Up to 15 alphanumeric chars" 
          error={transporterIdError}
          maxLength={15}
          required 
        />
        <Select label="Mode" value={mode} onChange={e => setMode(e.target.value)} options={[
          { label: 'Road', value: 'ROAD' },
          { label: 'Rail', value: 'RAIL' },
          { label: 'Air', value: 'AIR' },
          { label: 'Sea', value: 'SEA' },
          { label: 'Courier', value: 'COURIER' },
        ]} />
        <Input label="Fleet Size" type="number" value={fleetSize} onChange={e => setFleetSize(e.target.value)} />
        <Input label="Service Zones" value={serviceZones} onChange={e => setServiceZones(e.target.value)} />
        <Input 
          label="Contact Mobile" 
          value={contactMobile} 
          onChange={e => {
            setContactMobile(e.target.value)
            if (e.target.value.length === 10) setMobileError('')
          }} 
          error={mobileError}
          maxLength={10}
        />
        <div className="flex items-center justify-between p-2 rounded border border-border">
          <span className="text-sm font-medium">GTA (Reverse Charge)</span>
          <Switch checked={isGta} onChange={setIsGta} />
        </div>
      </div>
    </Modal>
  )
}
