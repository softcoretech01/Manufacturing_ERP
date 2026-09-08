import React from 'react'
import { AlertCircle, AlertTriangle, Info, ShieldAlert } from 'lucide-react'

interface InvAlertBannerProps {
  type: 'CAUTION' | 'WARNING' | 'ERROR' | 'BLOCKING'
  message: string
}

export const InvAlertBanner: React.FC<InvAlertBannerProps> = ({ type, message }) => {
  if (!message) return null

  const config = {
    CAUTION: {
      bg: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      icon: <Info className="h-5 w-5 text-yellow-600 shrink-0" />,
      label: 'Caution'
    },
    WARNING: {
      bg: 'bg-orange-50 border-orange-200 text-orange-800',
      icon: <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />,
      label: 'Warning'
    },
    ERROR: {
      bg: 'bg-red-50 border-red-200 text-red-800',
      icon: <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />,
      label: 'Error'
    },
    BLOCKING: {
      bg: 'bg-red-100 border-red-300 text-red-900 font-medium',
      icon: <ShieldAlert className="h-5 w-5 text-red-700 shrink-0" />,
      label: 'Blocking Error'
    }
  }

  const current = config[type] || config.ERROR

  return (
    <div className={`flex items-start gap-3 p-4 border rounded-lg ${current.bg} mb-4`}>
      {current.icon}
      <div>
        <span className="font-semibold mr-1">{current.label}:</span>
        <span>{message}</span>
      </div>
    </div>
  )
}
export default InvAlertBanner
