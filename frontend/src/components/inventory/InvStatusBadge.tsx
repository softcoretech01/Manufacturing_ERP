import React from 'react'

interface InvStatusBadgeProps {
  status: 'DRAFT' | 'POSTED' | 'CANCELLED' | string
}

export const InvStatusBadge: React.FC<InvStatusBadgeProps> = ({ status }) => {
  const s = (status || '').toUpperCase()

  const config: Record<string, { bg: string; text: string }> = {
    DRAFT: { bg: 'bg-gray-100 border-gray-300', text: 'text-gray-700' },
    POSTED: { bg: 'bg-green-50 border-green-200', text: 'text-green-700' },
    CANCELLED: { bg: 'bg-red-50 border-red-200', text: 'text-red-700' }
  }

  const current = config[s] || { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${current.bg} ${current.text}`}>
      {s}
    </span>
  )
}
export default InvStatusBadge
