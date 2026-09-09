import React from 'react'
import { X, Calendar, FileText, MapPin, ClipboardList } from 'lucide-react'
import { StockTxn } from '@/api/stockTxn'
import { InvStatusBadge } from './InvStatusBadge'

interface InvTxnViewModalProps {
  isOpen: boolean
  onClose: () => void
  txn: StockTxn | null
  loading?: boolean
}

export const InvTxnViewModal: React.FC<InvTxnViewModalProps> = ({
  isOpen,
  onClose,
  txn,
  loading = false
}) => {
  if (!isOpen || !txn) return null

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(p)
  }

  const formatDate = (d: string) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">
              View Document: {txn.document_no || 'DRAFT'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <span className="text-sm text-gray-500">Loading document details...</span>
            </div>
          ) : (
            <>
              {/* Document Status banner */}
              <div className="flex justify-between items-center p-4 border border-blue-100 bg-blue-50/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <InvStatusBadge status={txn.status || 'DRAFT'} />
                  <span className="text-sm font-semibold text-gray-700">
                    Transaction Type: <span className="text-blue-700 font-bold">{txn.txn_type.replace('_', ' ')}</span>
                  </span>
                </div>
                {txn.posted_at && (
                  <span className="text-xs text-gray-500">
                    Posted on: {formatDate(txn.posted_at)}
                  </span>
                )}
              </div>

              {/* Grid 2 Column Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Document Information */}
                <div className="bg-gray-50/50 border border-gray-100 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-bold text-gray-800 border-b pb-1.5 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-blue-500" /> Document Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-gray-500 font-medium">Document Date</span>
                    <span className="text-gray-900 font-semibold">{formatDate(txn.txn_date)}</span>
                    
                    {txn.issued_to && (
                      <>
                        <span className="text-gray-500 font-medium">Issued To</span>
                        <span className="text-gray-900 font-semibold">{txn.issued_to}</span>
                      </>
                    )}

                    {txn.reference_no && (
                      <>
                        <span className="text-gray-500 font-medium">Reference {txn.reference_type ? `(${txn.reference_type})` : ''}</span>
                        <span className="text-gray-900 font-semibold">{txn.reference_no}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Store/Warehouse Details */}
                <div className="bg-gray-50/50 border border-gray-100 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-bold text-gray-800 border-b pb-1.5 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-blue-500" /> Store Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    {txn.src_warehouse_name && (
                      <>
                        <span className="text-gray-500 font-medium">Source Store</span>
                        <span className="text-gray-900 font-semibold">{txn.src_warehouse_name}</span>
                      </>
                    )}
                    {txn.dst_warehouse_name && (
                      <>
                        <span className="text-gray-500 font-medium">Destination Store</span>
                        <span className="text-gray-900 font-semibold">{txn.dst_warehouse_name}</span>
                      </>
                    )}
                    {txn.department_name && (
                      <>
                        <span className="text-gray-500 font-medium">Department</span>
                        <span className="text-gray-900 font-semibold">{txn.department_name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-gray-800">Line Items ({txn.lines.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 h-10">
                        <th className="px-4 text-center font-semibold text-gray-500 w-[60px]">S.No</th>
                        <th className="px-4 font-semibold text-gray-500">Item Code & Name</th>
                        <th className="px-4 font-semibold text-gray-500">UOM</th>
                        <th className="px-4 font-semibold text-gray-500">Batch / Lot</th>
                        <th className="px-4 text-right font-semibold text-gray-500">Quantity</th>
                        <th className="px-4 text-right font-semibold text-gray-500">Unit Price</th>
                        <th className="px-4 text-right font-semibold text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {txn.lines.map((l, idx) => (
                        <tr key={l.uid || idx} className="h-12 hover:bg-gray-50/30">
                          <td className="px-4 text-center text-gray-500 font-semibold">{idx + 1}</td>
                          <td className="px-4">
                            <div className="font-semibold text-gray-800">{l.item_code}</div>
                            <div className="text-xs text-gray-400 font-medium">{l.item_name}</div>
                          </td>
                          <td className="px-4 font-semibold text-gray-600">{l.uom}</td>
                          <td className="px-4 font-mono font-semibold text-xs text-gray-600">
                            {l.batch_no || '-'}
                            {l.expiry_date && <div className="text-[10px] text-gray-400">Exp: {formatDate(l.expiry_date)}</div>}
                          </td>
                          <td className="px-4 text-right font-bold text-gray-800">{l.quantity}</td>
                          <td className="px-4 text-right font-semibold text-gray-600">{formatPrice(l.unit_price)}</td>
                          <td className="px-4 text-right font-bold text-gray-900">{formatPrice(l.line_total ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary Totals */}
              <div className="flex justify-end">
                <div className="w-full max-w-[320px] bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2.5 text-sm">
                  <div className="flex justify-between font-medium text-gray-500">
                    <span>Subtotal</span>
                    <span>{formatPrice(txn.subtotal ?? 0)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-gray-500 border-b pb-2">
                    <span>Tax Total</span>
                    <span>{formatPrice(txn.tax_total ?? 0)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 text-base pt-1">
                    <span>Grand Total</span>
                    <span>{formatPrice(txn.grand_total ?? 0)}</span>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              {txn.remarks && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
                  <h4 className="font-bold text-gray-700 mb-1">Remarks</h4>
                  <p className="text-gray-600 font-medium">{txn.remarks}</p>
                </div>
              )}

              {/* Audit Details */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-gray-400">
                <div>
                  <div className="text-[10px] uppercase font-bold text-gray-400">Created By</div>
                  <div className="text-gray-600 mt-0.5">{txn.posted_by_name || 'System'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-gray-400">Created Date</div>
                  <div className="text-gray-600 mt-0.5">{formatDate(txn.created_at || '')}</div>
                </div>
                {txn.posted_at && (
                  <>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-400">Posted By</div>
                      <div className="text-gray-600 mt-0.5">{txn.posted_by_name}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-gray-400">Posted Date</div>
                      <div className="text-gray-600 mt-0.5">{formatDate(txn.posted_at)}</div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-100 text-gray-700 font-semibold rounded-md text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
export default InvTxnViewModal
