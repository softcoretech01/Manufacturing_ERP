import { Check, CircleDot, Circle, X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Where a demand has got to in the make-to-order chain.
 *
 *   Demand → MPS → MRP → Buy / Make → Capacity → Production
 *
 * A planner's first question on any planning screen is "how far has this order
 * got, and what is holding it up". Before this the answer was spread across six
 * screens and a status badge that only described the demand row itself, so the
 * chain had to be reconstructed by hand every time.
 *
 * Status is never carried by colour alone (WCAG 2.1 AA, CLAUDE.md §7): each step
 * pairs its colour with a distinct glyph — a tick for done, a filled dot for the
 * step in progress, a hollow ring for what has not started, a cross for
 * cancelled — and every step is labelled in words.
 */

export type WorkflowStepState = 'done' | 'current' | 'todo' | 'blocked' | 'cancelled'

export interface WorkflowStep {
  key: string
  label: string
  /** One short line of detail — a count, a quantity, a document number. */
  detail?: string
  state: WorkflowStepState
  /** Makes the step clickable — used to jump to the screen that owns it. */
  onClick?: () => void
}

const GLYPH: Record<WorkflowStepState, typeof Check> = {
  done: Check,
  current: CircleDot,
  todo: Circle,
  blocked: CircleDot,
  cancelled: X,
}

const RING: Record<WorkflowStepState, string> = {
  done: 'border-success bg-success text-white',
  current: 'border-brand-600 bg-brand-600 text-white',
  todo: 'border-border bg-surface text-fg-subtle',
  blocked: 'border-warning bg-warning text-white',
  cancelled: 'border-danger bg-danger text-white',
}

const LABEL: Record<WorkflowStepState, string> = {
  done: 'text-fg',
  current: 'text-brand-700 font-semibold',
  todo: 'text-fg-subtle',
  blocked: 'text-warning font-semibold',
  cancelled: 'text-danger font-semibold',
}

/** Plain-English state, for screen readers and the step tooltip. */
const SPOKEN: Record<WorkflowStepState, string> = {
  done: 'completed',
  current: 'in progress',
  todo: 'not started',
  blocked: 'needs attention',
  cancelled: 'cancelled',
}

export function WorkflowTracker({
  steps,
  className,
}: {
  steps: WorkflowStep[]
  className?: string
}) {
  return (
    <ol
      className={cn(
        'flex flex-wrap items-start gap-y-3 rounded-lg border border-border bg-surface px-4 py-3',
        className,
      )}
      aria-label="Planning progress"
    >
      {steps.map((step, i) => {
        const Glyph = GLYPH[step.state]
        const last = i === steps.length - 1
        const title = `${step.label} — ${SPOKEN[step.state]}${step.detail ? `. ${step.detail}` : ''}`
        const Inner = (
          <>
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                RING[step.state],
              )}
              aria-hidden
            >
              <Glyph className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <span className="min-w-0">
              <span className={cn('block whitespace-nowrap text-[13px]', LABEL[step.state])}>
                {step.label}
              </span>
              {step.detail && (
                <span className="block whitespace-nowrap text-[11px] text-fg-subtle">
                  {step.detail}
                </span>
              )}
            </span>
          </>
        )

        return (
          <li key={step.key} className="flex items-center gap-2">
            {step.onClick ? (
              <button
                type="button"
                onClick={step.onClick}
                title={title}
                className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                {Inner}
              </button>
            ) : (
              <span className="flex items-center gap-2 px-1 py-0.5" title={title}>
                {Inner}
              </span>
            )}
            {/* The connector is decoration; it carries no state of its own. */}
            {!last && (
              <span
                className={cn(
                  'mx-1 hidden h-px w-8 shrink-0 sm:block',
                  step.state === 'done' ? 'bg-success/40' : 'bg-border',
                )}
                aria-hidden
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default WorkflowTracker
