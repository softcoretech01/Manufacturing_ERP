import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'link'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-[0_4px_12px_rgba(47,91,255,0.24)]',
  secondary: 'bg-brand-50 text-brand-500 hover:bg-[#E0E9FF]',
  outline: 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95 shadow-sm',
  success: 'bg-success text-white hover:brightness-110 active:brightness-95 shadow-sm',
  link: 'text-brand-500 hover:underline underline-offset-4 p-0 h-auto',
}

const SIZES: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1',
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-[44px] px-5 text-[15px] gap-2',
  lg: 'h-[52px] px-6 text-[15px] gap-2',
  icon: 'h-[44px] w-[44px] p-0',
  'icon-sm': 'h-8 w-8 p-0',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, icon, iconRight, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-xl font-medium',
        'transition-all duration-200 ease-in-out',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  )
})
