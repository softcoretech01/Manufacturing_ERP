import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastTone = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

const ToastCtx = createContext<{
  push: (t: Omit<Toast, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}>({
  push: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
})

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const TONES: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-progress',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((s) => [...s, { ...t, id }])
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), t.tone === 'error' ? 7000 : 4500)
  }, [])

  const api = {
    push,
    success: (title: string, description?: string) => push({ tone: 'success', title, description }),
    error: (title: string, description?: string) => push({ tone: 'error', title, description }),
    warning: (title: string, description?: string) => push({ tone: 'warning', title, description }),
    info: (title: string, description?: string) => push({ tone: 'info', title, description }),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => {
            const Icon = ICONS[t.tone]
            return (
              <div
                key={t.id}
                className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-card border border-border bg-surface p-3 shadow-pop"
              >
                <Icon className={cn('mt-0.5 h-4.5 w-4.5 shrink-0', TONES[t.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>}
                  {t.action && (
                    <button
                      onClick={t.action.onClick}
                      className="mt-1.5 text-xs font-medium text-brand-600 hover:underline"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}
                  className="shrink-0 rounded p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-fg"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
