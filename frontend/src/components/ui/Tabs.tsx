import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: ReactNode
  count?: number
  icon?: ReactNode
  disabled?: boolean
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
  variant = 'underline',
}: {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  className?: string
  variant?: 'underline' | 'pill'
}) {
  if (variant === 'pill') {
    return (
      <div className={cn('inline-flex items-center gap-1 rounded-lg bg-surface-3 p-1', className)}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40',
              active === t.id
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-surface-3 px-1.5 text-2xs tabular">{t.count}</span>
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto border-b border-border', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={t.disabled}
          onClick={() => onChange(t.id)}
          className={cn(
            'relative inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40',
            active === t.id
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg',
          )}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-2xs tabular',
                active === t.id ? 'bg-brand-500/15 text-brand-600' : 'bg-surface-3 text-fg-muted',
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
