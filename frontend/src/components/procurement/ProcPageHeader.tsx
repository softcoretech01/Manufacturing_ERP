/**
 * ProcPageHeader — breadcrumb trail + title + subtitle + right action slot.
 *
 * Mirrors the inventory module's header treatment so a buyer moving between
 * Inventory and Procurement sees one product, not two. The right slot is where
 * a screen puts its primary action and its date filter:
 *
 *   Procurement / Purchase Requisitions        [DateFilter] [Export] [+ New PR]
 *   Purchase Requisitions
 *   Manage and track all purchase requests
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ProcCrumb {
  label: string
  to?: string
}

export function ProcPageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
  className,
}: {
  title: string
  subtitle?: ReactNode
  breadcrumbs?: ProcCrumb[]
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 pb-4', className)}>
      <div className="min-w-0">
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
              {breadcrumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-fg-subtle" aria-hidden />}
                  {c.to ? (
                    <Link to={c.to} className="rounded transition-colors hover:text-brand-600 hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    // The current page is the last crumb and is not a link.
                    <span aria-current="page" className="text-fg">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="truncate text-xl font-bold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>

      {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </div>
  )
}
