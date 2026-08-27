import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRightLeft,
  CheckCircle2,
  Download,
  Eye,
  Pencil,
  Plus,
  Printer,
  Trash2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

export interface MenuItemDef {
  label: ReactNode
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  shortcut?: string
}

export function Menu({
  trigger,
  items,
  children,
  align = 'left',
  className,
}: {
  trigger: ReactElement
  items?: MenuItemDef[]
  children?: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const anchorRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const width = menuRef.current?.offsetWidth ?? 200
    let left = align === 'right' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    let top = r.bottom + 4
    const height = menuRef.current?.offsetHeight ?? 200
    if (top + height > window.innerHeight - 8) top = Math.max(8, r.top - height - 4)
    setPos({ top, left })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const anchor = cloneElement(trigger, {
    ref: (el: HTMLElement) => (anchorRef.current = el),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      setOpen((o) => !o)
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
  } as never)

  return (
    <>
      {anchor}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, left: pos.left }}
            className={cn(
              'fixed z-[60] min-w-[180px] animate-slide-up rounded-card border border-border bg-surface py-1 shadow-pop',
              className,
            )}
            onClick={() => setOpen(false)}
          >
            {items
              ? items.map((it, i) => (
                  <div key={i}>
                    {it.separatorBefore && <div className="my-1 h-px bg-border" />}
                    <MenuItem {...it} />
                  </div>
                ))
              : children}
          </div>,
          document.body,
        )}
    </>
  )
}

/**
 * Common actions get a consistent icon and colour without every screen having
 * to remember to pass one: edit is blue, anything destructive is red, anything
 * that completes work is green. An action the eye can classify before reading
 * it is an action people get right under time pressure.
 */
const ACTION_LOOK: { match: RegExp; Icon: LucideIcon; tone: 'brand' | 'danger' | 'success' | 'warning' | 'muted' }[] = [
  { match: /^(edit|change|modify|update|amend|configure)\b/i, Icon: Pencil, tone: 'brand' },
  { match: /^(delete|remove|clear from)\b/i, Icon: Trash2, tone: 'danger' },
  { match: /^(cancel|reject|block|scrap|discard|void)\b/i, Icon: XCircle, tone: 'danger' },
  { match: /^(approve|accept|post|confirm|release|sign off|complete|close|finish|mark)\b/i, Icon: CheckCircle2, tone: 'success' },
  { match: /^(receive|dispatch|issue|transfer|move|start|resume|pause|hold|decide)\b/i, Icon: ArrowRightLeft, tone: 'warning' },
  { match: /^(print|label)\b/i, Icon: Printer, tone: 'muted' },
  { match: /^(export|download)\b/i, Icon: Download, tone: 'muted' },
  { match: /^(open|view|see|trace|go to)\b/i, Icon: Eye, tone: 'muted' },
  { match: /^(add|new|create|raise|propose|assign)\b/i, Icon: Plus, tone: 'brand' },
]

const TONE_CLASS = {
  brand: 'text-brand-600',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
  muted: 'text-fg-subtle',
}

export function MenuItem({ label, icon, onClick, danger, disabled, shortcut }: MenuItemDef) {
  const look = typeof label === 'string' ? ACTION_LOOK.find((a) => a.match.test(label.trim())) : undefined
  const tone = danger ? 'danger' : (look?.tone ?? 'muted')
  const Fallback = look?.Icon

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface-3',
      )}
    >
      <span className={cn('shrink-0 [&>svg]:h-4 [&>svg]:w-4', TONE_CLASS[tone])}>
        {icon ?? (Fallback ? <Fallback /> : <span className="block h-4 w-4" />)}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && <span className="kbd">{shortcut}</span>}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
      {children}
    </p>
  )
}
