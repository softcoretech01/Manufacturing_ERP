import React, { useEffect, useState } from 'react'
import { Plus, Trash2, X, FileText, CheckCircle2 } from 'lucide-react'
import { useWarehouses } from '@/hooks/useOrganisation'
import { StockTxn, StockTxnLine, stockTxn } from '@/api/stockTxn'
import { InvLineItemAdder } from './InvLineItemAdder'
import { InvAlertBanner } from './InvAlertBanner'
import { useQuery } from '@tanstack/react-query'

interface StockInFormModalProps {
  isOpen: boolean
  onClose: () => void
  initialData?: StockTxn | null
  grnRefNo?: string
  onPost: (data: StockTxn) => Promise<void>
  loading?: boolean
}

export const StockInFormModal: React.FC<StockInFormModalProps> = ({
  isOpen,
  onClose,
  initialData,
  grnRefNo,
  onPost,
  loading = false
}) => {
  if (!isOpen) return null

  const { data: warehousesPage } = useWarehouses()
  const warehouses = warehousesPage?.data ?? []

  // Header State
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split('T')[0])
  const [dstWarehouse, setDstWarehouse] = useState('')
  const [referenceType, setReferenceType] = useState('GRN')
  const [referenceNo, setReferenceNo] = useState('')
  const [remarks, setRemarks] = useState('')

  // Lines State
  const [lines, setLines] = useState<any[]>([])

  // Validation / Error Banner state
  const [alertType, setAlertType] = useState<'CAUTION' | 'WARNING' | 'ERROR' | 'BLOCKING' | null>(null)
  const [alertMessage, setAlertMessage] = useState('')

  // Query Eligible GRNs
  const { data: eligibleGrns = [], isLoading: isLoadingGrns } = useQuery({
    queryKey: ['eligibleGrns'],
    queryFn: () => stockTxn.getEligibleGrns().then(res => res.data),
    enabled: referenceType === 'GRN'
  })

  // Query GRN Details when referenceNo changes
  const { data: grnDetails, isLoading: isLoadingGrnDetails } = useQuery({
    queryKey: ['grnDetails', referenceNo],
    queryFn: () => stockTxn.getGrnDetails(referenceNo).then(res => res.data),
    enabled: referenceType === 'GRN' && !!referenceNo
  })

  // Populate data on Edit or from pending GRN
  useEffect(() => {
    if (initialData) {
      setTxnDate(initialData.txn_date)
      setDstWarehouse(initialData.dst_warehouse_uid || '')
      setReferenceType(initialData.reference_type || 'MANUAL')
      setReferenceNo(initialData.reference_no || '')
      setRemarks(initialData.remarks || '')
      
      const populated = (initialData.lines || []).map(l => ({
        ...l,
        grnAcceptedQty: 0,
        poRemainingQty: 999999, // In edit mode we might not have it immediately without another query
        acceptedQty: l.quantity,
      }))
      setLines(populated)
    } else {
      setTxnDate(new Date().toISOString().split('T')[0])
      setDstWarehouse('')
      setReferenceType(grnRefNo ? 'GRN' : 'MANUAL')
      setReferenceNo(grnRefNo || '')
      setRemarks('')
      setLines([])
      setAlertType(null)
      setAlertMessage('')
    }
  }, [initialData, isOpen, grnRefNo])

  // Populate from GRN details
  useEffect(() => {
    if (grnDetails && !initialData) {
      const selectedGrn = eligibleGrns.find(g => g.doc_no === referenceNo)
      if (selectedGrn && selectedGrn.warehouse) {
        const wh = warehouses.find(w => w.name === selectedGrn.warehouse || w.code === selectedGrn.warehouse)
        if (wh) setDstWarehouse(wh.uid)
      }
      
      setRemarks(`Stock In against GRN: ${referenceNo}, PO: ${grnDetails.po_no}`)
      
      const newLines = grnDetails.lines.map((l: any) => ({
        item_id: 0, 
        item_code: l.itemCode,
        item_name: l.itemName,
        uom: l.uom,
        batch_no: l.batchNo || '',
        mfg_date: l.mfgDate || '',
        expiry_date: l.expiryDate || '',
        grnAcceptedQty: l.grnAcceptedQty,
        poRemainingQty: l.poRemainingQty,
        acceptedQty: Math.min(l.grnAcceptedQty, l.poRemainingQty), 
        unit_price: l.rate,
        tax_rate: l.taxPct
      }))
      setLines(newLines)
    }
  }, [grnDetails, initialData, eligibleGrns, referenceNo])

  // Check validations
  const validate = (): boolean => {
    setAlertType(null)
    setAlertMessage('')

    if (!txnDate) {
      setAlertType('ERROR'); setAlertMessage('Receipt Date is required.'); return false
    }
    if (!dstWarehouse) {
      setAlertType('ERROR'); setAlertMessage('Destination Store is required.'); return false
    }
    if (lines.length === 0) {
      setAlertType('ERROR'); setAlertMessage('At least one line item is required.'); return false
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (l.acceptedQty <= 0) {
        setAlertType('BLOCKING'); setAlertMessage(`Line ${i + 1}: Accepted Quantity must be greater than 0.`); return false
      }
      if (l.unit_price < 0) {
        setAlertType('BLOCKING'); setAlertMessage(`Line ${i + 1}: Unit Price cannot be negative.`); return false
      }
      if (referenceType === 'GRN') {
        if (l.acceptedQty > l.poRemainingQty) {
          setAlertType('BLOCKING'); setAlertMessage(`Line ${i + 1}: Cannot accept ${l.acceptedQty}. Only ${l.poRemainingQty} remaining on PO.`); return false
        }
      }
    }

    return true
  }

  const buildPayload = (): StockTxn => {
    return {
      txn_type: 'STOCK_IN',
      txn_date: txnDate,
      dst_warehouse_uid: dstWarehouse,
      reference_type: referenceType,
      reference_no: referenceNo || null,
      remarks: remarks || null,
      lines: lines.map(l => ({
        item_id: l.item_id || 0, 
        item_code: l.item_code,
        batch_no: l.batch_no,
        expiry_date: l.expiry_date || null,
        mfg_date: l.mfg_date || null,
        quantity: l.acceptedQty,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate,
        remarks: l.remarks || null
      }))
    }
  }

  const handlePost = async () => {
    if (!validate()) return
    await onPost(buildPayload())
  }

  const addLine = () => {
    setLines([...lines, { item_id: 0, item_code: '', batch_no: '', acceptedQty: 1, unit_price: 0, tax_rate: 0 }])
  }

  const removeLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx))
  }

  const updateLine = (idx: number, fields: any) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...fields } : l)))
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {initialData ? 'Edit Stock In' : 'New Stock In'}
              </h2>
              <p className="text-xs text-gray-500">Receive goods into inventory and update stock balances.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {alertMessage && <InvAlertBanner type={alertType!} message={alertMessage} />}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Source Type</label>
              <select
                value={referenceType}
                onChange={(e) => { setReferenceType(e.target.value); setReferenceNo(''); setLines([]); }}
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-1 focus:ring-emerald-500 text-sm bg-white"
                disabled={!!initialData}
              >
                <option value="GRN">Goods Receipt Note (GRN)</option>
                <option value="MANUAL">Manual Entry</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Reference Number {referenceType === 'GRN' && '*'}</label>
              {referenceType === 'GRN' ? (
                <select
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-1 focus:ring-emerald-500 text-sm bg-white"
                  disabled={!!initialData || isLoadingGrns}
                >
                  <option value="">Select Eligible GRN</option>
                  {eligibleGrns.map((g: any) => (
                    <option key={g.doc_no} value={g.doc_no}>
                      {g.doc_no} - {g.supplier_name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. Challan No"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-1 focus:ring-emerald-500 text-sm bg-white"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Receipt Date *</label>
              <input
                type="date"
                value={txnDate}
                onChange={(e) => setTxnDate(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-1 focus:ring-emerald-500 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Destination Store *</label>
              <select
                value={dstWarehouse}
                onChange={(e) => setDstWarehouse(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:ring-1 focus:ring-emerald-500 text-sm bg-white"
              >
                <option value="">Select Store</option>
                {warehouses.map((w: any) => (
                  <option key={w.uid} value={w.uid}>
                    {w.code} - {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Line Items
                {isLoadingGrnDetails && <span className="text-xs text-emerald-600 font-normal ml-2">Loading details...</span>}
              </h3>
            </div>

            <div className="p-4 space-y-6">
              {referenceType === 'MANUAL' && (
                <div className="mb-6">
                  <InvLineItemAdder 
                    onAdd={(line) => setLines([...lines, { 
                      ...line, 
                      acceptedQty: line.quantity // StockIn uses acceptedQty
                    }])} 
                  />
                </div>
              )}

              <div className="divide-y divide-gray-100 border border-slate-200 rounded-lg overflow-hidden">
                {lines.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    {referenceType === 'GRN' ? 'Select a GRN to populate line items.' : 'No items added. Use the form above to add line items.'}
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">S.No</th>
                        <th className="px-4 py-3">Item Details</th>
                        <th className="px-4 py-3">Batch/Lot</th>
                        {referenceType === 'GRN' && <th className="px-4 py-3 text-right">PO Remaining</th>}
                        {referenceType === 'GRN' && <th className="px-4 py-3 text-right">GRN Accepted</th>}
                        <th className="px-4 py-3 text-right">Qty to Stock</th>
                        <th className="px-4 py-3 text-right">Unit Price (₹)</th>
                        <th className="px-4 py-3 text-right">Total (₹)</th>
                        <th className="px-4 py-3 w-10 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 font-medium text-slate-500">{idx + 1}</td>
                          <td className="px-4 py-3 align-top">
                            <div>
                              <div className="font-semibold text-gray-900">{l.item_name}</div>
                              <div className="text-xs font-mono text-gray-500">{l.item_code}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <input
                              type="text"
                              placeholder="Batch No"
                              value={l.batch_no}
                              onChange={(e) => updateLine(idx, { batch_no: e.target.value })}
                              className="w-full h-8 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 text-sm bg-white"
                            />
                          </td>
                          {referenceType === 'GRN' && (
                            <td className="px-4 py-3 align-top text-right font-medium text-gray-600">
                              {l.poRemainingQty} {l.uom}
                            </td>
                          )}
                          {referenceType === 'GRN' && (
                            <td className="px-4 py-3 align-top text-right font-medium text-gray-600">
                              {l.grnAcceptedQty} {l.uom}
                            </td>
                          )}
                          <td className="px-4 py-3 align-top">
                            <div className="flex justify-end items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={l.acceptedQty}
                                onChange={(e) => updateLine(idx, { acceptedQty: Number(e.target.value) })}
                                className="w-24 h-8 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 text-sm font-bold text-right bg-white text-emerald-700"
                              />
                              <span className="text-xs text-gray-500">{l.uom || 'UOM'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-right">
                            <input
                              type="number"
                              min="0"
                              value={l.unit_price}
                              onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) })}
                              className="w-24 h-8 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 text-sm text-right bg-white"
                            />
                          </td>
                          <td className="px-4 py-3 align-top text-right font-bold text-emerald-600">
                            {(l.acceptedQty * l.unit_price).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 align-top text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-colors"
                              title="Remove Line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-700 mb-2">Internal Remarks</label>
              <textarea
                placeholder="Enter document level remarks / comments..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-3 focus:ring-1 focus:ring-emerald-500 text-sm h-24 bg-white"
              />
            </div>
            
            <div className="w-full md:w-80 bg-white border-2 border-emerald-100 shadow-md rounded-xl p-5 flex flex-col justify-center gap-4">
              <div className="flex justify-between items-center">
                <span className="text-base text-slate-600 font-semibold uppercase tracking-wider">Total Quantity</span>
                <span className="text-2xl font-black text-emerald-700">
                  {lines.reduce((sum, l) => sum + (Number(l.acceptedQty) || 0), 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center border-t-2 border-slate-100 pt-4">
                <span className="text-base text-slate-600 font-semibold uppercase tracking-wider">Total Value</span>
                <span className="text-3xl font-black text-slate-800 tracking-tight">
                  ₹{lines.reduce((sum, l) => sum + ((Number(l.acceptedQty) || 0) * (Number(l.unit_price) || 0)), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md text-sm transition-colors shadow-sm flex items-center gap-2 disabled:bg-emerald-300"
            >
              <CheckCircle2 className="w-4 h-4" />
              Add to Stock
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
