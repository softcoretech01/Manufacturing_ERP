import {
  Barcode,
  Layers,
  CalendarDays,
  Package,
  ShieldCheck,
  Wrench,
  CheckSquare,
  User,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

export interface Feature {
  label: string
  icon: LucideIcon
  detail: string
}

/**
 * Exactly 8 capability cards as specified.
 * Glassmorphism tile: rgba(255,255,255,0.08) bg, 1px rgba(255,255,255,0.15) border, blur 15px, rounded 16px.
 */
export const FEATURES: Feature[] = [
  { label: 'Barcode Traceability', icon: Barcode, detail: 'Every movement scanned, coil to carton' },
  { label: 'Batch Tracking', icon: Layers, detail: 'Forward and backward genealogy on any batch' },
  { label: 'Production Planning', icon: CalendarDays, detail: 'MRP, capacity and finite scheduling' },
  { label: 'Inventory Control', icon: Package, detail: 'Bin-level stock, valuation and cycle counting' },
  { label: 'Quality Control', icon: ShieldCheck, detail: 'Incoming, in-process, final, NCR and CAPA' },
  { label: 'Machine Maintenance', icon: Wrench, detail: 'Preventive plans, breakdowns and spares' },
  { label: 'Approval Workflow', icon: CheckSquare, detail: 'Configurable matrix on every document' },
  { label: 'Role Based Access', icon: User, detail: 'Granular permissions based on job role' },
]

export function FeatureIcons({ className }: { className?: string }) {
  return (
    <ul className={cn('grid grid-cols-4 gap-2', className)}>
      {FEATURES.map((f) => (
        <li
          key={f.label}
          title={f.detail}
          className="group flex flex-col justify-center items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 py-3 text-center cursor-default transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10 hover:border-white/20"
        >
          <span className="flex h-6 w-6 items-center justify-center text-blue-300 group-hover:text-blue-400 transition-colors duration-200">
            <f.icon className="h-[18px] w-[18px]" strokeWidth={2.0} />
          </span>
          <span className="text-[9.5px] font-semibold leading-[1.25] text-white group-hover:text-white transition-colors duration-200">
            {f.label}
          </span>
        </li>
      ))}
    </ul>
  )
}
