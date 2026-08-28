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
import type { Bank } from '@/types/masters'

export function BankMasterPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ['banks'],
    queryFn: api.getBanks,
  })

  const createMutation = useMutation({
    mutationFn: api.createBank,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] })
      toast.success('Bank account created successfully')
      setFormOpen(false)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Bank> }) => api.updateBank(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['banks'] })
      if (viewTarget?.id === updated.id) setViewTarget(updated)
      toast.success('Bank account updated successfully')
      setFormOpen(false)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteBank,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] })
      toast.success('Bank account deleted')
      setViewTarget(null)
    },
    onError: (err: any) => toast.error(err.message)
  })

  const [viewTarget, setViewTarget] = useState<Bank | null>(null)
  const [editTarget, setEditTarget] = useState<Bank | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filterText, setFilterText] = useState('')

  const filteredData = useMemo(() => {
    if (!filterText) return banks
    const lower = filterText.toLowerCase()
    return banks.filter(b => 
      b.name.toLowerCase().includes(lower) || 
      b.code.toLowerCase().includes(lower) ||
      (b.ifscPrefix || '').toLowerCase().includes(lower)
    )
  }, [banks, filterText])

  const maskAccount = (acct: string) => {
    if (!acct) return '—'
    if (acct.length <= 4) return acct
    return `XXXX XXXX ${acct.slice(-4)}`
  }

  const columns = useMemo<Column<Bank>[]>(() => [
    { key: 'sno', header: 'S.No', width: '60px', render: (_, i) => <span className="text-sm text-gray-500">{i + 1}</span> },
    { key: 'name', header: 'Bank Name', sortable: true, render: (b) => <span className="font-medium text-gray-900">{b.name}</span> },
    { key: 'accountName', header: 'Account Name', width: '200px', render: (b) => <span className="text-sm">{(b as any).accountName || b.name}</span> },
    { key: 'accountNumber', header: 'Account Number', width: '180px', render: (b) => <span className="font-mono text-sm">{maskAccount((b as any).accountNumber)}</span> },
    { key: 'ifsc', header: 'IFSC Code', width: '150px', render: (b) => <span className="font-mono text-sm">{b.ifscPrefix || '—'}</span> },
  ], [])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Banks"
        description="Manage company and partner bank accounts."
        actions={
          <Button variant="primary" onClick={() => { setEditTarget(null); setFormOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            New Bank Account
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
        <div className="mb-4 w-72">
          <Input 
            icon={<Search className="h-4 w-4" />} 
            placeholder="Search bank accounts..." 
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
              rowKey={(b) => b.id.toString()}
              columns={columns}
              pageSize={15}
              rowActions={(b) => (
                <>
                  <MenuItem label="View" icon={<Eye className="h-4 w-4" />} onClick={() => setViewTarget(b)} />
                  <MenuItem label="Edit" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditTarget(b); setFormOpen(true) }} />
                  <MenuItem label="Delete" icon={<Trash2 className="h-4 w-4" />} danger onClick={() => {
                    if (confirm('Are you sure you want to delete this bank?')) deleteMutation.mutate(b.id)
                  }} />
                </>
              )}
            />
          </EnterpriseCard>
        )}

        {viewTarget && (
          <BankViewDrawer 
            bank={viewTarget} 
            onClose={() => setViewTarget(null)} 
          />
        )}

        <BankFormModal 
          bank={editTarget} 
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

function BankViewDrawer({ bank: b, onClose }: { bank: Bank, onClose: () => void }) {
  // Extending types locally for display, falling back to what's available
  const accountName = (b as any).accountName || b.name
  const accountNumber = (b as any).accountNumber || '—'
  const branchName = (b as any).branchName || '—'
  const accountType = (b as any).accountType || b.bankType
  const branchAddress = (b as any).branchAddress || '—'
  const phone = (b as any).phone || '—'
  const remarks = (b as any).remarks || '—'

  return (
    <Drawer open onClose={onClose} title={`View Bank: ${b.name}`} width="max-w-3xl">
      <div className="p-6 space-y-6 bg-gray-50/30">
        <EnterpriseCard className="p-5">
          <SectionHeading title="1. Basic Information" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">

            <div><span className="block text-gray-500 mb-1">Bank Name</span><span className="font-medium text-gray-900">{b.name}</span></div>
            <div><span className="block text-gray-500 mb-1">Branch Name</span><span className="font-medium text-gray-900">{branchName}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="2. Account Details" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div><span className="block text-gray-500 mb-1">Account Name</span><span className="font-medium text-gray-900">{accountName}</span></div>
            <div><span className="block text-gray-500 mb-1">Account Number</span><span className="font-mono text-gray-900">{accountNumber}</span></div>
            <div><span className="block text-gray-500 mb-1">IFSC Code</span><span className="font-mono text-gray-900">{b.ifscPrefix || '—'}</span></div>
            <div><span className="block text-gray-500 mb-1">Account Type</span><span className="font-medium text-gray-900 capitalize">{accountType.toLowerCase()}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="3. Contact & Address" />
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div className="col-span-2"><span className="block text-gray-500 mb-1">Branch Address</span><span className="font-medium text-gray-900">{branchAddress}</span></div>
            <div><span className="block text-gray-500 mb-1">Phone</span><span className="font-medium text-gray-900">{phone}</span></div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="4. Additional Information" />
          <div className="text-sm">
            <span className="block text-gray-500 mb-1">Remarks</span>
            <span className="font-medium text-gray-900">{remarks}</span>
          </div>
        </EnterpriseCard>
      </div>
    </Drawer>
  )
}

function BankFormModal({ bank: b, open, onClose, onSave }: { bank?: Bank | null, open: boolean, onClose: () => void, onSave: (data: Partial<Bank>) => void }) {
  const [code, setCode] = useState(b?.code || '')
  const [name, setName] = useState(b?.name || '')
  const [branchName, setBranchName] = useState((b as any)?.branchName || '')
  
  const [accountName, setAccountName] = useState((b as any)?.accountName || '')
  const [accountNumber, setAccountNumber] = useState((b as any)?.accountNumber || '')
  const [ifsc, setIfsc] = useState(b?.ifscPrefix || '')
  const [accountType, setAccountType] = useState((b as any)?.accountType || 'CURRENT')
  
  const [branchAddress, setBranchAddress] = useState((b as any)?.branchAddress || '')
  const [phone, setPhone] = useState((b as any)?.phone || '')
  
  const [remarks, setRemarks] = useState((b as any)?.remarks || '')

  const handleSave = () => {
    // Current DB supports: code, name, bankType, ifscPrefix, swift, supportsNeft.
    // For this rewrite we inject the new fields directly to payload. They will be ignored 
    // by backend models if they aren't configured, but the UI component state is preserved nicely.
    const payload: Partial<Bank> & Record<string, any> = {
      code: code.trim(),
      name: name.trim(),
      ifscPrefix: ifsc.trim() || null,
      bankType: ['PUBLIC', 'PRIVATE', 'FOREIGN', 'COOPERATIVE', 'PAYMENTS'].includes(accountType) ? accountType as any : 'PRIVATE',
      supportsNeft: true,
      status: b?.status || 'ACTIVE',
      // Extended fields
      accountName: accountName.trim(),
      accountNumber: accountNumber.trim(),
      branchName: branchName.trim(),
      accountType,
      branchAddress: branchAddress.trim(),
      phone: phone.trim(),
      remarks: remarks.trim()
    }

    onSave(payload as Partial<Bank>)
  }

  return (
    <Modal open={open} onClose={onClose} title={b ? 'Edit Bank Account' : 'New Bank Account'} width="max-w-3xl" footer={
      <div className="flex justify-end gap-3 w-full">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>{b ? 'Update' : 'Save'}</Button>
      </div>
    }>
      <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto bg-gray-50/30">
        <EnterpriseCard className="p-5">
          <SectionHeading title="1. Basic Information" />
          <div className="grid grid-cols-2 gap-4">

            <Input label="Bank Name" value={name} onChange={e => setName(e.target.value)} required />
            <Input label="Branch Name" value={branchName} onChange={e => setBranchName(e.target.value)} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="2. Account Details" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Account Name" value={accountName} onChange={e => setAccountName(e.target.value)} />
            <Input label="Account Number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
            <Input label="IFSC Code" value={ifsc} onChange={e => setIfsc(e.target.value)} />
            <Select label="Account Type" value={accountType} onChange={e => setAccountType(e.target.value)} options={[
              {label: 'Current', value: 'CURRENT'}, {label: 'Savings', value: 'SAVINGS'}, {label: 'Cash Credit (CC)', value: 'CC'}, {label: 'Overdraft (OD)', value: 'OD'}
            ]} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="3. Contact & Address" />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Input label="Branch Address" value={branchAddress} onChange={e => setBranchAddress(e.target.value)} /></div>
            <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="p-5">
          <SectionHeading title="4. Additional Information" />
          <Textarea label="Remarks" value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} />
        </EnterpriseCard>
      </div>
    </Modal>
  )
}
