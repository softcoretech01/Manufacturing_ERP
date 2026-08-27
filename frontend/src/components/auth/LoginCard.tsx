import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * LoginCard — slim white wrapper used only when the login panel is
 * standalone (small screens). On desktop the Login.tsx renders the
 * white card directly with its own full layout.
 */
export function LoginCard({
  children,
  wide,
  className,
}: {
  children: ReactNode
  wide?: boolean
  className?: string
}) {
  return (
    <div className={cn('w-full', wide ? 'max-w-5xl' : 'max-w-md', className)}>
      <div className="relative overflow-hidden rounded-3xl bg-white shadow-[0_32px_80px_rgba(0,0,0,0.20)] p-8">
        {children}
      </div>
    </div>
  )
}

/** Mobile-only brand lock-up shown above the card. */
export function CardBrand() {
  return (
    <div className="mb-6 flex items-center gap-3 lg:hidden">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg">
        SSB
      </div>
      <div>
        <p className="text-base font-semibold leading-tight text-gray-900">SSB Industries</p>
        <p className="mt-0.5 text-xs text-gray-500">Manufacturing ERP</p>
      </div>
    </div>
  )
}

/** Theme toggle — kept for any components still importing it. */
export function ThemeToggle({ className }: { className?: string }) {
  return null
}
