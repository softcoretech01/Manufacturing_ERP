import { useState, useEffect, useMemo } from 'react'
import { Eye, Edit, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatCurrency } from '@/lib/format'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import { ProcurementToolbar } from '@/components/procurement/ProcurementToolbar'
import * as api from '@/api/procurement'
import { getSuppliers } from '@/api/masters'
import { useDocDetail } from '@/hooks/useDocDetail'
import { useItemLookup } from '@/hooks/useItemLookup'
import {
  ProcModal, ModalFooter, Section, FieldGrid, Field,
  LineItemsTable, RowActions, qty as fmtQty,
} from '@/components/procurement/ProcKit'

export function RfqPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [prs, setPrs] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const detail = useDocDetail<any>(api.getRfq)
  const lookup = useItemLookup()

  const [form, setForm] = useState<any>({
    title: '',
    category: '',
    buyer: '',
    quoteDueBy: '',
    prRefs: [],
    lines: [],
    suppliers: []
  })

  const fetchList = () => {
    setLoading(true)
    api.getRfqs().then(res => {
      setData(res || [])
      setLoading(false)
    }).catch(() => {
      toast.error('Error', 'Failed to load RFQs')
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchList()
    // Keep every PR so a saved reference can always be resolved to its document
    // number in View; the New-RFQ dropdown filters to APPROVED at point of choice.
    api.getRequisitions()
      .then(res => setPrs(res || []))
      .catch(() => toast.error('Error', 'Could not load purchase requisitions'))
    getSuppliers()
      .then(setSuppliers)
      .catch(() => toast.error('Error', 'Could not load suppliers'))
  }, [])

  /** Show the referenced PR by its document number, not its internal id. */
  const prLabel = (refs?: string[]) => {
    if (!refs || refs.length === 0) return null
    return refs
      .map((ref) => prs.find((p) => String(p.uid ?? p.id) === String(ref))?.docNo || ref)
      .join(', ')
  }

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const q = search.toLowerCase()
      if (search && !(
        d.docNo?.toLowerCase().includes(q) ||
        d.title?.toLowerCase().includes(q) ||
        (prLabel(d.prRefs) || '').toLowerCase().includes(q) ||
        (d.suppliers || []).some((s: any) => (s.supplierName || '').toLowerCase().includes(q))
      )) return false
      if (dateFrom && new Date(d.docDate) < new Date(dateFrom)) return false
      if (dateTo && new Date(d.docDate) > new Date(dateTo)) return false
      return true
    })
  }, [data, search, dateFrom, dateTo])

  const handleResetFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    fetchList()
  }

  const handleOpenForm = async (rfqRow?: any) => {
    const rfq = rfqRow ? await detail.load(rfqRow) : undefined
    if (rfq) {
      setEditing(rfq)
      setForm({
        title: rfq.title || '',
        category: rfq.category || '',
        buyer: rfq.buyer || '',
        quoteDueBy: rfq.quoteDueBy ? new Date(rfq.quoteDueBy).toISOString().split('T')[0] : '',
        prRefs: rfq.prRefs || [],
        lines: rfq.lines || [],
        suppliers: rfq.suppliers || []
      })
    } else {
      setEditing(null)
      setForm({
        title: '',
        category: '',
        buyer: '',
        quoteDueBy: '',
        prRefs: [],
        lines: [],
        suppliers: []
      })
    }
    setFormOpen(true)
  }

  const handleView = async (rfq: any) => {
    setEditing(rfq)
    setViewOpen(true)
    setEditing(await detail.load(rfq))
  }

  const handlePrSelect = async (prUid: string) => {
    if (!prUid) {
      setForm({ ...form, prRefs: [], lines: [] })
      return
    }
    try {
      const fullPr = await api.getRequisition(prUid)
      if (fullPr && fullPr.lines) {
        const newLines = fullPr.lines.map((l: any) => ({
          itemCode: l.itemUid || l.itemCode,
          itemName: l.itemName,
          uom: l.uom,
          qty: l.qty,
          requiredBy: l.requiredBy,
          specification: l.remarks
        }))
        setForm({ ...form, prRefs: [prUid], lines: newLines, category: fullPr.department || fullPr.itemType || '' })
      } else {
        toast.error('Error', 'No items found in selected PR')
        setForm({ ...form, prRefs: [prUid], lines: [], category: fullPr?.department || fullPr?.itemType || '' })
      }
    } catch (err) {
      console.error(err)
      toast.error('Error', 'Failed to load PR details')
    }
  }

  const handleSupplierAdd = (supUid: string) => {
    if (!supUid) return
    if (form.suppliers.some((s: any) => s.supplierUid === supUid)) return

    const sup = suppliers.find(s => s.uid === supUid || s.id === supUid)
    if (sup) {
      setForm({
        ...form, suppliers: [...form.suppliers, {
          supplierUid: sup.uid || sup.id,
          supplierName: sup.name
        }]
      })
    }
  }

  const handleLineChange = (index: number, field: string, value: string | number) => {
    const newLines = [...form.lines]
    newLines[index] = { ...newLines[index], [field]: value }
    setForm({ ...form, lines: newLines })
  }

  const handleSave = async () => {
    if (form.lines.length === 0) return toast.error('Validation', 'At least one item is required')
    if (!form.category) return toast.error('Validation', 'Category is required')
    if (!form.quoteDueBy) return toast.error('Validation', 'Quote Due By date is required')



    if (!form.quoteDueBy) return toast.error('Validation', 'Quotation Due Date is required')
    if (!form.suppliers || form.suppliers.length === 0) return toast.error('Validation', 'Select at least one supplier')

    const today = new Date().toISOString().slice(0, 10)
    const nowIso = new Date().toISOString()

    try {
      const payload = {
        docNo: editing?.docNo && editing.docNo !== 'null' ? editing.docNo : null,
        docDate: editing?.docDate ? String(editing.docDate).slice(0, 10) : today,
        status: editing?.status || 'OPEN',
        plant: editing?.plant || 'DEFAULT',
        title: form.title || `RFQ - ${form.category || 'General'}`,
        category: form.category || 'General',
        buyer: form.buyer || '',
        quoteDueBy: String(form.quoteDueBy).slice(0, 10),
        prRefs: form.prRefs,
        lines: form.lines.map((l: any) => ({
          itemCode: String(l.itemCode ?? l.itemUid ?? ''),
          itemName: l.itemName || '',
          uom: l.uom || '',
          qty: Number(l.qty) || 0,
          requiredBy: l.requiredBy ? String(l.requiredBy).slice(0, 10) : today,
          specification: l.specification || l.remarks || null,
        })),
        // Carry the response fields through an edit. The update rewrites the
        // supplier rows wholesale, so dropping these would blank out who had
        // already quoted (the backend re-derives them as a safety net).
        suppliers: form.suppliers.map((s: any) => ({
          supplierUid: String(s.supplierUid),
          supplierName: s.supplierName || '',
          invitedAt: s.invitedAt || nowIso,
          respondedAt: s.respondedAt || null,
          responseStatus: s.responseStatus || 'PENDING',
          quotationUid: s.quotationUid || null,
        })),
      }

      if (editing) {
        await api.updateRfq(editing.uid || editing.id, payload)
        toast.success('Success', 'RFQ updated')
      } else {
        await api.createRfq(payload)
        toast.success('Success', 'RFQ created successfully')
      }
      setFormOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to save RFQ')
    }
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'RFQ Number', width: '160px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'title', header: 'Title' },
    { key: 'category', header: 'Category', width: '150px', render: (r) => r.category || '-' },
    { key: 'quoteDueBy', header: 'Quote Due By', render: (r) => r.quoteDueBy ? formatDate(r.quoteDueBy) : '-', width: '130px' },
    { key: 'suppliers', header: 'Suppliers', align: 'center' as const, render: (r) => r.suppliers?.length || 0, width: '80px' },
    { key: 'items', header: 'Items', align: 'center' as const, render: (r) => r.lines?.length || 0, width: '72px' },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'Action',
      width: '120px',
      className: 'col-flex',
      render: (r) => (
        <RowActions
          onView={() => handleView(r)}
          // Once quotes are in or the RFQ is closed, it is no longer editable.
          onEdit={r.status === 'OPEN' ? () => handleOpenForm(r) : undefined}
        />
      ),
    },
  ]

  return (
    <div className="flex h-full w-full flex-col flex-1">
      <PageHeader
        title="Request for Quotation (RFQ)"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'RFQs' }]}
        actions={
          <Button variant="primary" onClick={() => handleOpenForm()}>
            <Plus className="mr-2 h-4 w-4" /> New RFQ
          </Button>
        }
      />

      <ProcurementToolbar
        search={search} onSearchChange={setSearch}
        dateFrom={dateFrom} onDateFromChange={setDateFrom}
        dateTo={dateTo} onDateToChange={setDateTo}
        onReset={handleResetFilters}
        searchHint="RFQ number, PR number or supplier" dateLabel="RFQ date"
      />

      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">
        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">
          <DataTable searchable={false} rows={filteredData} rowKey={(r) => r.uid || r.id || r.docNo || String(Math.random())} columns={columns} loading={loading} />
        </div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.docNo}` : 'New Request for Quotation'} size="xl">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Reference PR" />
            <CardBody>
              <Select label="Select Approved PR to automatically load items" value={form.prRefs[0] || ''} onChange={e => handlePrSelect(e.target.value)}>
                <option value="">-- Select PR --</option>
                {prs.filter(pr => {
                  if (editing && form.prRefs.includes(pr.uid || pr.id)) return true;
                  if (pr.status !== 'APPROVED') return false;
                  const prIdStr = String(pr.uid || pr.id);
                  return !data.some(rfq => rfq.prRefs?.some((ref: any) => String(ref) === prIdStr || String(ref) === pr.docNo));
                }).map((pr, idx) => <option key={pr.uid || pr.id || idx} value={pr.uid || pr.id}>{pr.docNo} - {pr.department || pr.itemType}</option>)}
              </Select>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="RFQ Details" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Input label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
              <Input type="date" label="Quote Due By" value={form.quoteDueBy} onChange={e => setForm({ ...form, quoteDueBy: e.target.value })} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Items" />
            <CardBody className="p-0 overflow-x-auto">
              <table className="grid-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-12 col-center">S.No</th>
                    <th className="w-44">Category</th>
                    <th>Item</th>
                    <th className="col-right w-28">Quantity</th>
                    <th className="w-24">UOM</th>
                    <th className="w-36">Required Date</th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="col-center">{i + 1}</td>
                      <td className="text-fg-muted">{lookup.categoryOf(l.itemCode) || '-'}</td>
                      <td className="font-medium text-fg">{l.itemName}</td>
                      <td className="col-right tabular-nums">{fmtQty(l.qty)}</td>
                      <td>{l.uom}</td>
                      <td>{l.requiredBy ? formatDate(l.requiredBy) : '-'}</td>
                    </tr>
                  ))}
                  {form.lines.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-fg-muted py-6">
                      Select an approved PR to load its items.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Select Suppliers" />
            <CardBody>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-2">
                {suppliers.map((s, idx) => {
                  const supUid = s.uid || s.id;
                  // Saved supplierUid comes back from the database as a string while
                  // the master list may hold a number â€” compare as strings, or the
                  // suppliers already on the RFQ never appear ticked when editing.
                  const isChecked = form.suppliers.some(
                    (fs: any) => String(fs.supplierUid) === String(supUid));
                  return (
                    <label key={supUid || idx} className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-brand-600 rounded border-border-strong focus:ring-brand-500"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleSupplierAdd(supUid);
                          } else {
                            const newSups = form.suppliers.filter(
                              (fs: any) => String(fs.supplierUid) !== String(supUid));
                            setForm({ ...form, suppliers: newSups });
                          }
                        }}
                      />
                      <span className="text-sm font-medium text-fg">{s.name}</span>
                    </label>
                  );
                })}
              </div>
              {suppliers.length === 0 && (
                <div className="text-sm text-fg-muted text-center py-4">No suppliers available.</div>
              )}
            </CardBody>
          </Card>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>{editing ? 'Update RFQ' : 'Create RFQ'}</Button>
          </div>
        </div>
      </Modal>

      <ProcModal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={`Request for Quotation ${editing?.docNo ?? ''}`.trim()}
        width="wide"
        footer={<ModalFooter onCancel={() => setViewOpen(false)} cancelLabel="Close" />}
      >
        {editing && (
          <>
            <Section title="RFQ Information">
              <FieldGrid>
                <Field label="RFQ Number" mono value={editing.docNo} />
                <Field label="RFQ Date" value={formatDate(editing.docDate)} />
                <Field label="Reference PR" mono value={prLabel(editing.prRefs)} />
                <Field label="Quotation Due Date" value={editing.quoteDueBy ? formatDate(editing.quoteDueBy) : null} />
                <Field label="Category" value={editing.category} />
                <Field label="Title" value={editing.title} />
                <Field label="Buyer" value={editing.buyer} />
                <Field label="Status" value={<ProcStatusBadge status={editing.status} />} />
                <Field label="Awarded To" value={editing.awardedTo} />
                <Field label="Remarks" span value={editing.remarks} />
              </FieldGrid>
            </Section>

            <Section title="Items">
              <LineItemsTable
                rows={editing.lines || []}
                empty="This RFQ has no items."
                columns={[
                  { key: 'itemType', header: 'Type', width: '130px', render: (l) =>
                      lookup.itemTypeOf(l.itemCode) || <span className="text-fg-subtle">—</span> },
                  { key: 'category', header: 'Category', width: '160px', render: (l) =>
                      lookup.categoryOf(l.itemCode) || <span className="text-fg-subtle">—</span> },
                  { key: 'itemName', header: 'Item', render: (l) => <span className="font-medium text-fg">{l.itemName}</span> },
                  { key: 'qty', header: 'Quantity', align: 'right', width: '110px', render: (l) => fmtQty(l.qty) },
                  { key: 'uom', header: 'UOM', align: 'center', width: '80px' },
                  { key: 'requiredBy', header: 'Required Date', width: '140px', render: (l) =>
                      l.requiredBy ? formatDate(l.requiredBy) : '—' },
                ]}
              />
            </Section>

            <Section title="Suppliers">
              <LineItemsTable
                rows={editing.suppliers || []}
                empty="No suppliers invited."
                columns={[
                  { key: 'supplierName', header: 'Supplier', render: (s) =>
                      s.supplierName || suppliers.find(x => String(x.uid || x.id) === String(s.supplierUid))?.name || s.supplierUid },
                  // A supplier counts as having quoted the moment a quotation
                  // exists for them; the backend keeps responseStatus in step
                  // with that. Anything that is not an outstanding invitation
                  // reads as Quoted, so a new response value cannot silently
                  // fall back to showing "Pending".
                  { key: 'responseStatus', header: 'Quotation Status', width: '190px', render: (s) =>
                      <ProcStatusBadge
                        status={!s.responseStatus || s.responseStatus === 'PENDING' || s.responseStatus === 'INVITED'
                          ? 'PENDING' : 'QUOTED'}
                        size="sm" /> },
                  { key: 'respondedAt', header: 'Quoted On', width: '150px', render: (s) =>
                      s.respondedAt ? formatDate(s.respondedAt) : <span className="text-fg-subtle">—</span> },
                ]}
              />
            </Section>
          </>
        )}
      </ProcModal>
    </div>
  )
}
