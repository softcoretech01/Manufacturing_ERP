import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Landmark, Plus } from 'lucide-react'
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
import type { Bank } from '@/types/masters'
import * as api from '@/api/masters'

export function BankMasterPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [detail, setDetail] = useState<Bank | null>(null)
  const [editTarget, setEditTarget] = useState<Bank | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ['banks'],
    queryFn: api.getBanks,
  })

  const createMutation = useMutation({
    mutationFn: api.createBank,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] })
      toast.success('Bank created successfully')
      setFormOpen(false)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Bank> }) => api.updateBank(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['banks'] })
      if (detail && detail.id === updated.id) setDetail(updated)
      setFormOpen(false)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteBank,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] })
      toast.success('Bank deleted')
      setDetail(null)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const create = (data: Partial<Bank>) => createMutation.mutate(data)
  const update = (id: number, data: Partial<Bank>) => updateMutation.mutate({ id, data })
  const remove = (id: number) => deleteMutation.mutate(id)

  const columns = useMemo<Column<Bank>[]>(() => [
    {
      key: 'code',
      header: 'BANK',
      render: (s) => (
        <div className="font-medium text-fg">
          {s.name}
          <div className="font-mono text-2xs text-fg-muted">{s.code}</div>
        </div>
      ),
    },
    {
      key: 'bankType',
      header: 'TYPE',
      render: (s) => <Badge tone="neutral" size="sm" dot={false}>{s.bankType.toLowerCase()}</Badge>,
    },
    {
      key: 'ifscPrefix',
      header: 'IFSC PREFIX',
      render: (s) => <span className="font-mono text-xs text-fg-subtle">{s.ifscPrefix || '—'}</span>,
    },
    {
      key: 'swift',
      header: 'SWIFT/BIC',
      render: (s) => <span className="font-mono text-xs text-fg-subtle">{s.swift || '—'}</span>,
    },
    {
      key: 'supportsNeft',
      header: 'NEFT / RTGS',
      render: (s) => (
        s.supportsNeft ? <Badge tone="positive" size="sm" dot={false}>Yes</Badge> : <span className="text-fg-muted">—</span>
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
        title="Banks"
        icon={Landmark}
        actions={
          <Button onClick={() => { setEditTarget(null); setFormOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            New bank
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex-1 p-6 text-sm text-fg-muted">Loading...</div>
        ) : (
          <DataTable
            rows={banks}
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
                    if (confirm('Delete this bank?')) remove(s.id)
                  }}
                />
              </>
            )}
          />
        )}

        <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Bank'}>
          {detail && (
            <div className="space-y-6">
              <Card>
                <CardHeader title="Summary" />
                <CardBody className="p-0">
                  <DataGrid
                    data={[
                      { label: 'Bank Code', value: detail.code },
                      { label: 'Type', value: detail.bankType },
                      { label: 'Status', value: detail.status },
                      { label: 'IFSC Prefix', value: detail.ifscPrefix },
                      { label: 'SWIFT/BIC', value: detail.swift },
                      { label: 'NEFT Supported', value: detail.supportsNeft ? 'Yes' : 'No' },
                      { label: 'Created At', value: formatDate(detail.createdDate) },
                    ]}
                  />
                </CardBody>
              </Card>
            </div>
          )}
        </Drawer>

        <BankForm 
          s={editTarget} 
          open={formOpen} 
          onClose={() => setFormOpen(false)} 
          onSave={(data) => editTarget ? update(editTarget.id, data) : create(data)} 
        />
      </div>
    </div>
  )
}

function BankForm({ s, open, onClose, onSave }: { s?: Bank | null; open: boolean; onClose: () => void; onSave: (data: Partial<Bank>) => void }) {
  const [code, setCode] = useState(s?.code || '')
  const [name, setName] = useState(s?.name || '')
  const [bankType, setBankType] = useState<Bank['bankType']>(s?.bankType || 'PUBLIC')
  const [ifscPrefix, setIfscPrefix] = useState(s?.ifscPrefix || '')
  const [swift, setSwift] = useState(s?.swift || '')
  const [supportsNeft, setSupportsNeft] = useState(s?.supportsNeft || false)
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(s?.status || 'ACTIVE')
  
  const [codeError, setCodeError] = useState('')
  const [ifscError, setIfscError] = useState('')
  const [swiftError, setSwiftError] = useState('')

  useEffect(() => {
    if (open) {
      setCode(s?.code || '')
      setName(s?.name || '')
      setBankType(s?.bankType || 'PUBLIC')
      setIfscPrefix(s?.ifscPrefix || '')
      setSwift(s?.swift || '')
      setSupportsNeft(s?.supportsNeft || false)
      setStatus(s?.status || 'ACTIVE')
      setCodeError('')
      setIfscError('')
      setSwiftError('')
    }
  }, [s, open])

  const handleSave = () => {
    let valid = true
    if (code.trim().length === 0 || code.trim().length > 20) {
      setCodeError('Bank code is required and must be up to 20 characters')
      valid = false
    } else {
      setCodeError('')
    }
    
    if (ifscPrefix && !/^[A-Za-z]{4}$/.test(ifscPrefix)) {
      setIfscError('IFSC prefix must be exactly 4 letters')
      valid = false
    } else {
      setIfscError('')
    }

    if (swift && !/^[A-Za-z0-9]{8,11}$/.test(swift)) {
      setSwiftError('SWIFT code must be 8 to 11 alphanumeric characters')
      valid = false
    } else {
      setSwiftError('')
    }

    if (valid) {
      onSave({
        code: code.trim(),
        name: name.trim(),
        status,
        bankType,
        ifscPrefix: ifscPrefix.trim() || null,
        swift: swift.trim() || null,
        supportsNeft
      })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={s ? 'Edit Bank' : 'New Bank'}>
      <div className="grid grid-cols-2 gap-4 p-6">
        <Input 
          label="Bank Code" 
          value={code} 
          onChange={e => setCode(e.target.value)} 
          error={codeError}
          maxLength={20}
          required 
          disabled={!!s} // Prevent changing unique code of existing banks
        />
        <Input 
          label="Bank Name" 
          value={name} 
          onChange={e => setName(e.target.value)} 
          maxLength={150}
          required 
        />
        <Select 
          label="Type" 
          value={bankType} 
          onChange={e => setBankType(e.target.value as Bank['bankType'])} 
          options={[
            { label: 'Public Sector', value: 'PUBLIC' },
            { label: 'Private Sector', value: 'PRIVATE' },
            { label: 'Foreign Bank', value: 'FOREIGN' },
            { label: 'Cooperative Bank', value: 'COOPERATIVE' },
            { label: 'Payments Bank', value: 'PAYMENTS' },
          ]} 
        />
        <Input 
          label="IFSC Prefix" 
          value={ifscPrefix} 
          onChange={e => setIfscPrefix(e.target.value)} 
          placeholder="4 letters (e.g. SBIN)"
          error={ifscError}
          maxLength={4}
        />
        <Input 
          label="SWIFT / BIC" 
          value={swift} 
          onChange={e => setSwift(e.target.value)} 
          placeholder="8 or 11 characters"
          error={swiftError}
          maxLength={11}
        />
        
        <div className="flex items-center justify-between p-2 rounded border border-border">
          <span className="text-sm font-medium">NEFT / RTGS Supported</span>
          <Switch checked={supportsNeft} onChange={setSupportsNeft} />
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t border-border p-6">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </Modal>
  )
}
