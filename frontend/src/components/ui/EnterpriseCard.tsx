import { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EnterpriseCardProps {
  children: ReactNode
  className?: string
}

export function EnterpriseCard({ children, className }: EnterpriseCardProps) {
  return (
    <div className={cn("bg-white border border-border rounded-md shadow-sm", className)}>
      {children}
    </div>
  )
}
