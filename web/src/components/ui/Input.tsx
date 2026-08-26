import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlertCircle, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

const BASE =
  'w-full rounded-[12px] border border-border-strong bg-surface px-3 text-[15px] text-fg placeholder:text-fg-subtle ' +
  'transition-all duration-200 hover:border-brand-300 focus:border-brand-500 focus:outline-none ' +
  'focus:ring-[3px] focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-fg-subtle'

/* ─────────────────────────── Field wrapper ─────────────────────────── */

export interface FieldProps {
  label?: string
  required?: boolean
  hint?: string
  error?: string
  className?: string
  htmlFor?: string
  children: ReactNode
  /** Field-level security: renders a lock affordance instead of the control */
  readOnlyReason?: string
}

export function Field({
  label,
  required,
  hint,
  error,
  className,
  htmlFor,
  children,
  readOnlyReason,
}: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={htmlFor} className={cn('field-label', required && 'required')}>
          {label}
          {readOnlyReason && (
            <span title={readOnlyReason} className="ml-1 text-fg-subtle">
              🔒
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-2xs text-danger">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-2xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

/* ─────────────────────────── Input ─────────────────────────── */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  sizeVariant?: 'sm' | 'md'
  /** Field-level security: renders a lock affordance next to the label. */
  readOnlyReason?: string
}

/** Types whose value is picked from a browser overlay rather than typed. */
const PICKER_TYPES = new Set(['date', 'datetime-local', 'month', 'week', 'time'])

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, containerClassName, leftIcon, rightIcon, required, sizeVariant = 'md', readOnlyReason, id, ...props },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId

  /**
   * A native date input only opens its calendar when the small indicator glyph
   * is hit — clicking the dd/mm/yyyy text just moves between segments, which
   * reads as "the calendar is broken". Opening the picker from anywhere in the
   * field is what people expect, so do that, and keep typing working as well.
   */
  const isPicker = PICKER_TYPES.has(props.type ?? '')
  const openPicker = (el: HTMLInputElement | null) => {
    if (!el || el.disabled || el.readOnly) return
    try {
      el.showPicker()
    } catch {
      /* Unsupported browser, or not a user gesture — the field is still typable. */
    }
  }

  const control = (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        className={cn(
          BASE,
          sizeVariant === 'sm' ? 'h-8' : 'h-[44px]',
          leftIcon && 'pl-9',
          rightIcon && 'pr-9',
          isPicker && 'picker-field',
          error && 'border-danger focus:border-danger focus:ring-danger',
          className,
        )}
        required={required}
        {...props}
        onClick={(e) => {
          if (isPicker) openPicker(e.currentTarget)
          props.onClick?.(e)
        }}
        onKeyDown={(e) => {
          // Enter or Space on a picker field opens the overlay too, so the
          // field is operable without a mouse.
          if (isPicker && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            openPicker(e.currentTarget)
          }
          props.onKeyDown?.(e)
        }}
      />
      {rightIcon && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">{rightIcon}</span>
      )}
    </div>
  )
  if (!label && !hint && !error) return <div className={containerClassName}>{control}</div>
  return (
    <Field
      label={label}
      required={required}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={containerClassName}
      readOnlyReason={readOnlyReason}
    >
      {control}
    </Field>
  )
})

/* ─────────────────────────── Search input ─────────────────────────── */

export function SearchInput({ className, ...props }: InputProps) {
  return (
    <Input
      leftIcon={<Search className="h-3.5 w-3.5" />}
      placeholder="Search…"
      className={className}
      autoComplete="off"
      name={`search-${Math.random().toString(36).substring(2, 7)}`}
      {...props}
    />
  )
}

/* ─────────────────────────── Select ─────────────────────────── */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
  options?: { value: string; label: string; disabled?: boolean }[]
  sizeVariant?: 'sm' | 'md'
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, containerClassName, options, children, required, sizeVariant = 'md', id, ...props },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId
  const control = (
    <div className="relative">
      <select
        ref={ref}
        id={selectId}
        className={cn(
          BASE,
          'appearance-none pr-9',
          sizeVariant === 'sm' ? 'h-8' : 'h-[44px]',
          error && 'border-danger focus:border-danger focus:ring-danger',
          className,
        )}
        required={required}
        {...props}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
    </div>
  )
  if (!label && !hint && !error) return <div className={containerClassName}>{control}</div>
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={selectId} className={containerClassName}>
      {control}
    </Field>
  )
})

/* ─────────────────────────── Textarea ─────────────────────────── */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  containerClassName?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, containerClassName, required, id, ...props },
  ref,
) {
  const autoId = useId()
  const taId = id ?? autoId
  const control = (
    <textarea
      ref={ref}
      id={taId}
      rows={3}
      className={cn(BASE, 'py-2 leading-relaxed', error && 'border-danger', className)}
      required={required}
      {...props}
    />
  )
  if (!label && !hint && !error) return <div className={containerClassName}>{control}</div>
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={taId} className={containerClassName}>
      {control}
    </Field>
  )
})

/* ─────────────────────────── Checkbox / Radio / Switch ─────────────────────────── */

export function Checkbox({
  label,
  className,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; description?: string }) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong accent-brand-600"
        {...props}
      />
      {label && (
        <label htmlFor={props.id ?? id} className="cursor-pointer select-none text-sm leading-tight">
          <span className="text-fg">{label}</span>
          {description && <span className="mt-0.5 block text-2xs text-fg-subtle">{description}</span>}
        </label>
      )}
    </div>
  )
}

export function Radio({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  const id = useId()
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        id={props.id ?? id}
        type="radio"
        className="h-4 w-4 shrink-0 cursor-pointer border-border-strong accent-brand-600"
        {...props}
      />
      {label && (
        <label htmlFor={props.id ?? id} className="cursor-pointer select-none text-sm text-fg">
          {label}
        </label>
      )}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2.5',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
          checked ? 'border-brand-600 bg-brand-600' : 'border-border-strong bg-surface-3',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-150 ease-out',
            checked ? 'translate-x-[15px]' : 'translate-x-0.5',
          )}
        />
      </button>
      {label && <span className="select-none text-sm text-fg">{label}</span>}
    </label>
  )
}
