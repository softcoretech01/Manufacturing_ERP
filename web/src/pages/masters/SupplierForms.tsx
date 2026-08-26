import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Switch, Field } from '@/components/ui/Input'
import { Address, ContactPerson, BankAccount, ComplianceDoc } from '@/types/masters'

export function AddressFormModal({ open, onClose, onSave }: { open: boolean, onClose: () => void, onSave: (address: Address) => void }) {
  const [type, setType] = useState<any>('REGISTERED')
  const [label, setLabel] = useState('')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [pincode, setPincode] = useState('')
  const [country, setCountry] = useState('India')
  const [gstin, setGstin] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    if (open) {
      setType('REGISTERED')
      setLabel('')
      setLine1('')
      setLine2('')
      setCity('')
      setState('')
      setStateCode('')
      setPincode('')
      setCountry('India')
      setGstin('')
      setIsDefault(false)
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Add Address" footer={<button className="btn-primary" onClick={() => onSave({ uid: crypto.randomUUID(), type, label, line1, line2, city, state, stateCode, pincode, country, gstin, isDefault, isActive: true })}>Save</button>}>
      <div className="space-y-4">
        <Select label="Type" value={type} onChange={e => setType(e.target.value)} options={[
          { label: 'Registered', value: 'REGISTERED' },
          { label: 'Billing', value: 'BILLING' },
          { label: 'Shipping', value: 'SHIPPING' },
          { label: 'Works', value: 'WORKS' },
        ]} />
        <Input label="Label" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Head Office" />
        <Input label="Line 1" value={line1} onChange={e => setLine1(e.target.value)} />
        <Input label="Line 2" value={line2} onChange={e => setLine2(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="City" value={city} onChange={e => setCity(e.target.value)} />
          <Input label="State" value={state} onChange={e => setState(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="State Code" value={stateCode} onChange={e => setStateCode(e.target.value)} placeholder="e.g. 29" />
          <Input label="Pincode" value={pincode} onChange={e => setPincode(e.target.value)} />
        </div>
        <Input label="Country" value={country} onChange={e => setCountry(e.target.value)} />
        <Input label="GSTIN" value={gstin} onChange={e => setGstin(e.target.value)} />
        <Field label="Set as default address">
          <Switch checked={isDefault} onChange={setIsDefault} />
        </Field>
      </div>
    </Modal>
  )
}

export function ContactFormModal({ open, onClose, onSave }: { open: boolean, onClose: () => void, onSave: (contact: ContactPerson) => void }) {
  const [name, setName] = useState('')
  const [designation, setDesignation] = useState('')
  const [department, setDepartment] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [landline, setLandline] = useState('')
  const [purpose, setPurpose] = useState<any>('COMMERCIAL')
  const [isPrimary, setIsPrimary] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setDesignation('')
      setDepartment('')
      setEmail('')
      setMobile('')
      setLandline('')
      setPurpose('COMMERCIAL')
      setIsPrimary(false)
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Add Contact" footer={<button className="btn-primary" onClick={() => onSave({ uid: crypto.randomUUID(), name, designation, department, email, mobile, landline, purpose, isPrimary, isActive: true })}>Save</button>}>
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Designation" value={designation} onChange={e => setDesignation(e.target.value)} />
          <Input label="Department" value={department} onChange={e => setDepartment(e.target.value)} />
        </div>
        <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Mobile" value={mobile} onChange={e => setMobile(e.target.value)} />
          <Input label="Landline" value={landline} onChange={e => setLandline(e.target.value)} />
        </div>
        <Select label="Purpose" value={purpose} onChange={e => setPurpose(e.target.value)} options={[
          { label: 'Commercial', value: 'COMMERCIAL' },
          { label: 'Technical', value: 'TECHNICAL' },
          { label: 'Quality', value: 'QUALITY' },
          { label: 'Accounts', value: 'ACCOUNTS' },
          { label: 'Logistics', value: 'LOGISTICS' },
        ]} />
        <Field label="Set as primary contact">
          <Switch checked={isPrimary} onChange={setIsPrimary} />
        </Field>
      </div>
    </Modal>
  )
}

export function BankAccountFormModal({ open, onClose, onSave }: { open: boolean, onClose: () => void, onSave: (bank: BankAccount) => void }) {
  const [bankName, setBankName] = useState('')
  const [branchName, setBranchName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [accountType, setAccountType] = useState<any>('CURRENT')
  const [swift, setSwift] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [isPrimary, setIsPrimary] = useState(false)

  useEffect(() => {
    if (open) {
      setBankName('')
      setBranchName('')
      setAccountNumber('')
      setIfsc('')
      setAccountType('CURRENT')
      setSwift('')
      setCurrency('INR')
      setIsPrimary(false)
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Add Bank Account" footer={<button className="btn-primary" onClick={() => onSave({ uid: crypto.randomUUID(), bankName, branchName, accountNumber, ifsc, accountType, swift, currency, isPrimary, isVerified: false })}>Save</button>}>
      <div className="space-y-4">
        <Input label="Bank Name" value={bankName} onChange={e => setBankName(e.target.value)} />
        <Input label="Branch Name" value={branchName} onChange={e => setBranchName(e.target.value)} />
        <Input label="Account Number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
        <Input label="IFSC Code" value={ifsc} onChange={e => setIfsc(e.target.value)} />
        <Select label="Account Type" value={accountType} onChange={e => setAccountType(e.target.value)} options={[
          { label: 'Current', value: 'CURRENT' },
          { label: 'Savings', value: 'SAVINGS' },
          { label: 'Cash Credit (CC)', value: 'CC' },
          { label: 'Overdraft (OD)', value: 'OD' },
        ]} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="SWIFT (optional)" value={swift} onChange={e => setSwift(e.target.value)} />
          <Input label="Currency" value={currency} onChange={e => setCurrency(e.target.value)} />
        </div>
        <Field label="Set as primary account">
          <Switch checked={isPrimary} onChange={setIsPrimary} />
        </Field>
      </div>
    </Modal>
  )
}

export function ComplianceDocFormModal({ open, onClose, onSave }: { open: boolean, onClose: () => void, onSave: (doc: ComplianceDoc) => void }) {
  const [type, setType] = useState('')
  const [documentNo, setDocumentNo] = useState('')
  const [issuedBy, setIssuedBy] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')

  useEffect(() => {
    if (open) {
      setType('')
      setDocumentNo('')
      setIssuedBy('')
      setValidFrom('')
      setValidTo('')
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Add Compliance Document" footer={<button className="btn-primary" onClick={() => onSave({ uid: crypto.randomUUID(), type, documentNo, issuedBy, validFrom, validTo, status: 'VALID', fileName: null })}>Save</button>}>
      <div className="space-y-4">
        <Input label="Document Type" value={type} onChange={e => setType(e.target.value)} placeholder="e.g. ISO 9001:2015" />
        <Input label="Document No" value={documentNo} onChange={e => setDocumentNo(e.target.value)} />
        <Input label="Issued By" value={issuedBy} onChange={e => setIssuedBy(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Valid From" type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
          <Input label="Valid To" type="date" value={validTo} onChange={e => setValidTo(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
