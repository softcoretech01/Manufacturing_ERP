import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'link'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  secondary: 'bg-brand-50 text-brand-500 hover:bg-[#E0E9FF]',
  outline: 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
  success: 'bg-success text-white hover:brightness-110 active:brightness-95',
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
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-medium',
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

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  variant?: Variant
  size?: 'sm' | 'md'
}

/** A square button that renders a single Lucide icon (passed as a component). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, variant = 'ghost', size = 'md', className, ...props },
  ref,
) {
  return (
    <Button ref={ref} variant={variant} size={size === 'sm' ? 'icon-sm' : 'icon'} className={className} {...props}>
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </Button>
  )
})
