import { ShieldCheck, CheckCircle2, TrendingUp, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { PORTALS } from '@/config/portals'

const LIVE_PORTALS = PORTALS.filter((p) => p.status === 'LIVE').length

export interface Stat {
  value: string
  label: string
  sub?: string
}

export const STATS: Stat[] = [
  { value: '20', label: 'Modules', sub: 'functional' },
  { value: String(LIVE_PORTALS), label: 'Portals', sub: 'live today' },
  { value: '2', label: 'Plants', sub: 'Chennai · Hosur' },
  { value: '22,000', label: 'Bottles/Day', sub: 'rated capacity' },
  { value: '99.9%', label: 'Availability', sub: 'rolling 90d' },
]

const TRUST = [
  { icon: ShieldCheck, label: 'Secure' },
  { icon: CheckCircle2, label: 'Reliable' },
  { icon: TrendingUp, label: 'Scalable' },
  { icon: Zap, label: 'Always On' },
]

export function Statistics({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-[24px] border border-white/5 bg-[#0B1120] p-6', className)}
    >
      {/* Stat numbers */}
      <dl className="grid grid-cols-5 gap-2">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <dd className="tabular text-[20px] font-bold tracking-tight text-white leading-none">{s.value}</dd>
            <dt className="mt-1.5 text-[10px] font-bold text-white/90">{s.label}</dt>
            {s.sub && <p className="mt-0.5 text-[9px] font-semibold text-white/60 leading-tight">{s.sub}</p>}
          </div>
        ))}
      </dl>

      {/* Trust badges */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <ul className="flex items-center gap-4 text-[11px] font-semibold text-white/80">
          {TRUST.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="flex h-[16px] w-[16px] items-center justify-center rounded-full border border-white/20">
                <Icon className="h-[9px] w-[9px]" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
