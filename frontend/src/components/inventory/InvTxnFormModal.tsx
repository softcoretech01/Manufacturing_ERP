import React, { useEffect, useState } from 'react'
import { Plus, Trash2, X, AlertTriangle, Edit2, Save } from 'lucide-react'
import { useWarehouses, useDepartments } from '@/hooks/useOrganisation'
import { InvLineItemAdder } from './InvLineItemAdder'
import { StockTxn, StockTxnLine } from '@/api/stockTxn'
import { InvAlertBanner } from './InvAlertBanner'
import { api } from '@/api/client'
import { useStockTxns } from '@/hooks/useStockTxn'

interface InvTxnFormModalProps {
  isOpen: boolean
  onClose: () => void
  txnType: 'STOCK_IN' | 'STOCK_OUT' | 'STOCK_RETURN' | 'STOCK_TRANSFER' | 'ADJUSTMENT'
  initialData?: StockTxn | null
  onPost: (data: StockTxn) => Promise<void>
  loading?: boolean
}

export const InvTxnFormModal: React.FC<InvTxnFormModalProps> = ({
  isOpen,
  onClose,
  txnType,
  initialData,
  onPost,
  loading = false
}) => {
  if (!isOpen) return null

  const { data: warehousesPage } = useWarehouses()
  const { data: departmentsPage } = useDepartments()
  const { data: stockOutsData } = useStockTxns(
    txnType === 'STOCK_RETURN' ? { txn_type: 'STOCK_OUT', status: 'POSTED' } : undefined
  )

  const warehouses = warehousesPage?.data ?? []
  const departments = departmentsPage?.data ?? []
  const stockOuts = Array.isArray(stockOutsData) ? stockOutsData : (stockOutsData as any)?.data ?? []

  const isEditMode = !!initialData

  const txnTypeLabels: Record<string, string> = {
    STOCK_OUT: 'Stock Out',
    STOCK_RETURN: 'Stock Return',
    STOCK_TRANSFER: 'Stock Transfer',
    ADJUSTMENT: 'Adjustment',
  }

  // Header State
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split('T')[0])
  const [srcWarehouse, setSrcWarehouse] = useState('')
  const [dstWarehouse, setDstWarehouse] = useState('')
  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [issuedTo, setIssuedTo] = useState('')
  const [referenceType, setReferenceType] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [remarks, setRemarks] = useState('')

  // Lines State
  const [lines, setLines] = useState<StockTxnLine[]>(initialData?.lines || [])
  const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<Partial<StockTxnLine>>({})

  // Validation / Error Banner state
  const [alertType, setAlertType] = useState<'CAUTION' | 'WARNING' | 'ERROR' | 'BLOCKING' | null>(null)
  const [alertMessage, setAlertMessage] = useState('')

  // Populate data on Edit
  useEffect(() => {
    if (initialData) {
      setTxnDate(initialData.txn_date)
      setSrcWarehouse(initialData.src_warehouse_uid || '')
      setDstWarehouse(initialData.dst_warehouse_uid || '')
      setDepartmentId(initialData.department_id || '')
      setIssuedTo(initialData.issued_to || '')
      setReferenceType(initialData.reference_type || '')
      setReferenceNo(initialData.reference_no || '')
      setRemarks(initialData.remarks || '')
      setLines(initialData.lines || [])
    } else {
      // Set defaults for new docs
      setTxnDate(new Date().toISOString().split('T')[0])
      setSrcWarehouse('')
      setDstWarehouse('')
      setDepartmentId('')
      setIssuedTo('')
      setReferenceType('')
      setReferenceNo('')
      setRemarks('')
      setLines([])
      setAlertType(null)
      setAlertMessage('')
    }
  }, [initialData, isOpen])

  // Subtotal & Tax calculations
  const subtotal = lines.reduce((acc, curr) => acc + (curr.quantity * curr.unit_price), 0)
  const taxTotal = lines.reduce((acc, curr) => acc + (curr.quantity * curr.unit_price * (curr.tax_rate / 100)), 0)
  const grandTotal = subtotal + taxTotal

  // Check validations
  const validate = (postAction: boolean = false): boolean => {
    setAlertType(null)
    setAlertMessage('')

    if (!txnDate) {
      setAlertType('ERROR')
      setAlertMessage('Transaction Date is required.')
      return false
    }

    if (txnType === 'STOCK_TRANSFER') {
      if (!srcWarehouse || !dstWarehouse) {
        setAlertType('ERROR')
        setAlertMessage('Both Source and Destination Stores are required for transfers.')
        return false
      }
      if (srcWarehouse === dstWarehouse) {
        setAlertType('BLOCKING')
        setAlertMessage('Source Store and Destination Store cannot be the same.')
        return false
      }
    } else if (txnType === 'STOCK_OUT' || txnType === 'STOCK_IN') {
      if (!srcWarehouse) {
        setAlertType('ERROR')
        setAlertMessage('Store is required.')
        return false
      }
    } else if (txnType === 'STOCK_RETURN') {
      if (!dstWarehouse && !srcWarehouse) {
        setAlertType('ERROR')
        setAlertMessage('Store is required to return stock.')
        return false
      }
      if (!referenceNo) {
        setAlertType('ERROR')
        setAlertMessage('Reference Stock Out document number is required.')
        return false
      }
    }

    if (lines.length === 0) {
      setAlertType('ERROR')
      setAlertMessage('At least one line item is required.')
      return false
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (!l.item_id) {
        setAlertType('ERROR')
        setAlertMessage(`Line ${i + 1}: Select a valid Item.`)
        return false
      }
      if (l.quantity <= 0) {
        setAlertType('BLOCKING')
        setAlertMessage(`Line ${i + 1}: Quantity must be greater than 0.`)
        return false
      }
      if (l.unit_price < 0) {
        setAlertType('BLOCKING')
        setAlertMessage(`Line ${i + 1}: Unit Price cannot be negative.`)
        return false
      }
      // Basic check: if it's missing entirely but was supposed to be there. 
      // (Full validation happens backend, but this helps catch empty batches on UI)
      if (!l.batch_no || l.batch_no.trim() === '') {
        // If the item was added with empty batch, let's just warn them.
        // It's better to let the backend throw 422 with exact item name if it's required,
        // unless we look up is_batch_tracked here. Since we don't have is_batch_tracked
        // in StockTxnLine easily accessible, we rely on InvLineItemAdder for new lines,
        // and backend for existing ones. But we can add a visual hint on the line item.
      }
    }

    return true
  }

  // Handle Post
  const handlePost = async () => {
    if (editingLineIdx !== null) {
      setAlertMessage('Please save your active line item edit (click the green save icon) before updating.')
      setAlertType('BLOCKING')
      return
    }

    if (!validate(true)) return
    const payload: StockTxn = {
      txn_type: txnType,
      txn_date: txnDate,
      src_warehouse_uid: srcWarehouse || null,
      dst_warehouse_uid: dstWarehouse || null,
      department_id: departmentId ? Number(departmentId) : null,
      issued_to: issuedTo || null,
      reference_type: referenceType || null,
      reference_no: referenceNo || null,
      remarks: remarks || null,
      lines: lines.map(l => ({
        item_id: l.item_id,
        batch_no: l.batch_no,
        expiry_date: l.expiry_date || null,
        mfg_date: l.mfg_date || null,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate,
        remarks: l.remarks || null
      }))
    }
    await onPost(payload)
  }

  const addLine = () => {
    setLines([
      ...lines,
      {
        item_id: 0,
        batch_no: '',
        quantity: 1,
        unit_price: 0,
        tax_rate: 0
      }
    ])
  }

  const removeLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx))
  }

  const updateLine = (idx: number, fields: Partial<StockTxnLine>) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...fields } : l)))
  }

  const startEditLine = (idx: number) => {
    setEditingLineIdx(idx)
    setEditValues(lines[idx])
  }

  const saveEditLine = () => {
    if (editingLineIdx !== null) {
      updateLine(editingLineIdx, editValues)
      setEditingLineIdx(null)
    }
  }

  const cancelEditLine = () => {
    setEditingLineIdx(null)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEditMode ? 'EDIT' : 'NEW'} {txnTypeLabels[txnType] || txnType.replaceAll('_', ' ')}
            </h2>
            {isEditMode && initialData?.document_no && (
              <p className="text-xs text-gray-500 mt-0.5">
                Document: <span className="font-semibold text-brand-600">{initialData.document_no}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {alertMessage && <InvAlertBanner type={alertType!} message={alertMessage} />}

          {/* Document Header fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50/50 border border-gray-200 rounded-lg p-4">
            {/* Txn Date */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Transaction Date *</label>
              <input
                type="date"
                value={txnDate}
                onChange={(e) => setTxnDate(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
              />
            </div>

            {/* Warehouse Selects based on type */}
            {txnType !== 'STOCK_RETURN' && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  {txnType === 'STOCK_TRANSFER' ? 'From Store *' : 'Store / Warehouse *'}
                </label>
                <select
                  value={srcWarehouse}
                  onChange={(e) => setSrcWarehouse(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">Select Store</option>
                  {warehouses.map((w: any) => (
                    <option key={w.uid} value={w.uid}>
                      {w.code} - {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {txnType === 'STOCK_TRANSFER' && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">To Store *</label>
                <select
                  value={dstWarehouse}
                  onChange={(e) => setDstWarehouse(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">Select Store</option>
                  {warehouses.map((w: any) => (
                    <option key={w.uid} value={w.uid}>
                      {w.code} - {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {txnType === 'STOCK_RETURN' && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Store / Warehouse *</label>
                <select
                  value={dstWarehouse || srcWarehouse}
                  onChange={(e) => {
                    setDstWarehouse(e.target.value)
                    setSrcWarehouse(e.target.value)
                  }}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">Select Store</option>
                  {warehouses.map((w: any) => (
                    <option key={w.uid} value={w.uid}>
                      {w.code} - {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Department */}
            {txnType === 'STOCK_OUT' && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Department</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">Select Department</option>
                  {departments.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Issued To */}
            {txnType === 'STOCK_OUT' && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Issued To</label>
                <input
                  type="text"
                  placeholder="Employee name or department lead..."
                  value={issuedTo}
                  onChange={(e) => setIssuedTo(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white text-gray-900"
                />
              </div>
            )}

            {/* Reference doc no */}
            {txnType !== 'STOCK_TRANSFER' && (
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  {txnType === 'STOCK_RETURN' ? 'Reference Stock Out *' : 'Reference Document'}
                </label>
                {txnType === 'STOCK_RETURN' ? (
                  <select
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white text-gray-900"
                  >
                    <option value="">Select Stock Out</option>
                    {stockOuts.map((so: StockTxn) => (
                      <option key={so.uid} value={so.document_no || ''}>
                        {so.document_no} ({so.txn_date})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. PO number, Job card..."
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white text-gray-900"
                  />
                )}
              </div>
            )}
          </div>

        {/* Items Section */}
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <div className="bg-slate-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-800 uppercase tracking-wider">Line Items</h3>
            </div>

            <div className="p-5 space-y-6">
              {/* Item Adder */}
              <InvLineItemAdder 
                onAdd={(line) => setLines([...lines, line])} 
                hidePrice={txnType !== 'STOCK_IN' && txnType !== 'ADJUSTMENT'}
              />

              {/* Data Grid for Added Lines */}
              {lines.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-600 w-16">S.No</th>
                        <th className="px-4 py-3 font-semibold text-slate-600">Item Name</th>
                        <th className="px-4 py-3 font-semibold text-slate-600">Batch / Lot</th>
                        <th className="px-4 py-3 font-semibold text-slate-600 text-right">Quantity</th>
                        {(txnType === 'STOCK_IN' || txnType === 'ADJUSTMENT') && (
                          <>
                            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Unit Price (₹)</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Total (₹)</th>
                          </>
                        )}
                        <th className="px-4 py-3 font-semibold text-slate-600 text-center w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l, idx) => {
                        const isEditing = editingLineIdx === idx
                        return (
                        <tr key={idx} className={`transition-colors ${isEditing ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3 font-medium text-slate-500">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800">{l.item_name}</div>
                            <div className="text-xs text-slate-500 font-mono">{l.item_code}</div>
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input 
                                type="text"
                                value={editValues.batch_no || ''}
                                onChange={(e) => setEditValues({...editValues, batch_no: e.target.value})}
                                className="w-full h-8 px-2 border border-slate-300 rounded text-xs bg-white text-slate-900 focus:ring-1 focus:ring-blue-500"
                                placeholder="Batch No"
                              />
                            ) : (
                              <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">
                                {l.batch_no || '-'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <input 
                                  type="number"
                                  min="1"
                                  value={editValues.quantity || 1}
                                  onChange={(e) => setEditValues({...editValues, quantity: Number(e.target.value)})}
                                  className="w-20 h-8 px-2 border border-slate-300 rounded text-xs text-right bg-white text-slate-900 focus:ring-1 focus:ring-blue-500"
                                />
                                <span className="text-xs text-slate-500 font-normal">{l.uom}</span>
                              </div>
                            ) : (
                              <>
                                <span className="font-bold text-slate-800">{l.quantity}</span> <span className="text-xs text-slate-500 font-normal">{l.uom}</span>
                              </>
                            )}
                          </td>
                          {(txnType === 'STOCK_IN' || txnType === 'ADJUSTMENT') && (
                            <>
                              <td className="px-4 py-3 text-right">
                                {isEditing ? (
                                  <input 
                                    type="number"
                                    min="0"
                                    value={editValues.unit_price || 0}
                                    onChange={(e) => setEditValues({...editValues, unit_price: Number(e.target.value)})}
                                    className="w-24 h-8 px-2 border border-slate-300 rounded text-xs text-right bg-white text-slate-900 focus:ring-1 focus:ring-blue-500 inline-block"
                                  />
                                ) : (
                                  <span className="font-medium text-slate-600">{l.unit_price.toFixed(2)}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-600">
                                {isEditing ? (
                                  ((editValues.quantity || 0) * (editValues.unit_price || 0)).toFixed(2)
                                ) : (
                                  (l.quantity * l.unit_price).toFixed(2)
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={saveEditLine}
                                  className="p-1.5 hover:bg-emerald-100 text-emerald-600 rounded transition-colors"
                                  title="Save"
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditLine}
                                  className="p-1.5 hover:bg-slate-200 text-slate-500 rounded transition-colors"
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditLine(idx)}
                                  className="p-1.5 hover:bg-blue-100 text-blue-500 rounded transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  className="p-1.5 hover:bg-red-100 text-red-500 rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm font-medium border-2 border-dashed border-slate-200 rounded-lg">
                  No items added yet. Use the form above to add line items.
                </div>
              )}
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Remarks</label>
            <textarea
              placeholder="Enter document level remarks / comments..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full border border-slate-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm h-20 bg-white text-slate-900"
            />
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end pt-2">
            <div className="w-full md:w-80 bg-white border-2 border-emerald-100 shadow-sm rounded-xl p-5 flex flex-col justify-center gap-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 font-semibold uppercase tracking-wider">Total Quantity</span>
                <span className="text-xl font-black text-emerald-700">
                  {lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0).toFixed(2)}
                </span>
              </div>
              {(txnType === 'STOCK_IN' || txnType === 'ADJUSTMENT') && (
                <div className="flex justify-between items-center border-t-2 border-slate-100 pt-4">
                  <span className="text-sm text-slate-600 font-semibold uppercase tracking-wider">Total Value</span>
                  <span className="text-2xl font-black text-slate-800 tracking-tight">
                    ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-md text-sm transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            <button
              onClick={handlePost}
              disabled={loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md text-sm transition-colors shadow-sm disabled:bg-indigo-300"
            >
              {loading ? 'Saving…' : isEditMode ? 'Update Transaction' : 'Post Transaction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
export default InvTxnFormModal
