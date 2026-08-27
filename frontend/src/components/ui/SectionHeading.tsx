import { cn } from '@/lib/cn'
import { ReactNode } from 'react'

interface SectionHeadingProps {
  title: string
  icon?: ReactNode
  className?: string
}

export function SectionHeading({ title, icon, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex items-center gap-2 mb-4 pb-2 border-b border-border/60", className)}>
      {icon && <span className="text-fg-subtle">{icon}</span>}
      <h3 className="text-xs font-semibold text-fg tracking-wide uppercase">{title}</h3>
    </div>
  )
}
