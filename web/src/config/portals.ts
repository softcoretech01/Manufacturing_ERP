import {
  Boxes,
  CalendarClock,
  ClipboardCheck,
  Coins,
  Database,
  Factory,
  HardHat,
  Package,
  Settings2,
  Ship,
  Sparkles,
  Truck,
  UserCog,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/**
 * A portal is the working context a user signs into. It is not a security
 * boundary — permissions are still resolved per user — but it decides which
 * part of the product the person is put in front of.
 *
 * A storekeeper who spends the day receiving goods should not have to walk past
 * finance and HR to reach the goods receipt screen, and a data-entry clerk
 * loading masters should not see the shop floor at all.
 */
export type PortalCode =
  | 'ADMIN'
  | 'MASTERS'
  | 'PROCUREMENT'
  | 'INVENTORY'
  | 'ENGINEERING'
  | 'PLANNING'
  | 'PRODUCTION'
  | 'QUALITY'
  | 'MAINTENANCE'
  | 'PACKING_DISPATCH'
  | 'SALES'
  | 'FINANCE'
  | 'HRMS'
  | 'BI'
  | 'SHOPFLOOR'

export interface Portal {
  code: PortalCode
  name: string
  tagline: string
  icon: LucideIcon
  /** Landing route when this portal is entered. */
  home: string
  /** Permission that gates the portal tile. Absent means everyone sees it. */
  permission?: string
  status: 'LIVE' | 'PLANNED'
  /** Soft tint classes (icon tile) reused by the header switcher and sidebar. */
  accent: string
  /** Vivid two-stop gradient (`from-* to-*`) for the sign-in portal tiles. */
  gradient: string
}

export const PORTALS: Portal[] = [
  {
    code: 'ADMIN',
    name: 'Administration',
    tagline: 'Users, roles, workflow, numbering, audit and platform services',
    icon: Settings2,
    home: '/',
    status: 'LIVE',
    accent: 'text-brand-500 bg-brand-500/10 ring-brand-500/25',
    gradient: 'from-brand-500 to-brand-700',
  },
  {
    code: 'MASTERS',
    name: 'Master Data',
    tagline: 'Customers, suppliers, items, machines, quality, HR and finance masters',
    icon: Database,
    home: '/masters',
    status: 'LIVE',
    accent: 'text-violet-600 bg-violet-500/10 ring-violet-500/25',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    code: 'PROCUREMENT',
    name: 'Procurement',
    tagline: 'Requisitions, MRP, RFQ, purchase orders, receipts and supplier performance',
    icon: Package,
    home: '/procurement',
    permission: 'PROCUREMENT.PO.VIEW',
    status: 'LIVE',
    accent: 'text-amber-600 bg-amber-500/10 ring-amber-500/25',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    code: 'INVENTORY',
    name: 'Inventory & Stores',
    tagline: 'Receipts, issues, transfers, cycle counts, valuation and traceability',
    icon: Warehouse,
    home: '/inventory',
    permission: 'INVENTORY.STOCK.VIEW',
    status: 'LIVE',
    accent: 'text-emerald-600 bg-emerald-500/10 ring-emerald-500/25',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    code: 'ENGINEERING',
    name: 'Product Engineering',
    tagline: 'Products, specifications, BOM, routing, tooling, costing and engineering changes',
    icon: Boxes,
    home: '/engineering',
    status: 'LIVE',
    accent: 'text-sky-600 bg-sky-500/10 ring-sky-500/25',
    gradient: 'from-sky-500 to-cyan-600',
  },
  {
    code: 'PLANNING',
    name: 'Production Planning',
    tagline: 'Forecast, demand, master schedule, MRP, capacity, production orders and scheduling',
    icon: CalendarClock,
    home: '/planning',
    status: 'LIVE',
    accent: 'text-lime-600 bg-lime-500/10 ring-lime-500/25',
    gradient: 'from-lime-500 to-green-600',
  },
  {
    code: 'PRODUCTION',
    name: 'Shop Floor Execution',
    tagline: 'Production orders, work orders, machine status, OEE, downtime, scrap, shifts and traceability',
    icon: Factory,
    home: '/production',
    status: 'LIVE',
    accent: 'text-rose-600 bg-rose-500/10 ring-rose-500/25',
    gradient: 'from-rose-500 to-pink-600',
  },
  {
    code: 'QUALITY',
    name: 'Quality',
    tagline: 'Inspection plans, incoming, in-process and final inspection, NCR, CAPA, calibration and supplier quality',
    icon: ClipboardCheck,
    home: '/quality',
    status: 'LIVE',
    accent: 'text-teal-600 bg-teal-500/10 ring-teal-500/25',
    gradient: 'from-teal-500 to-emerald-600',
  },
  {
    code: 'MAINTENANCE',
    name: 'Plant Maintenance & EAM',
    tagline: 'Assets, preventive plans, breakdowns, condition monitoring, spares, permits and shutdowns',
    icon: Wrench,
    home: '/maintenance',
    status: 'LIVE',
    accent: 'text-orange-600 bg-orange-500/10 ring-orange-500/25',
    gradient: 'from-orange-500 to-amber-600',
  },
  {
    code: 'PACKING_DISPATCH',
    name: 'Packing, Dispatch & Logistics',
    tagline: 'Packing orders, cartons, pallets, dispatch planning, loading, shipments, exports, POD and freight',
    icon: Truck,
    home: '/dispatch',
    status: 'LIVE',
    accent: 'text-fuchsia-600 bg-fuchsia-500/10 ring-fuchsia-500/25',
    gradient: 'from-fuchsia-500 to-purple-600',
  },
  {
    code: 'SALES',
    name: 'Sales & CRM',
    tagline: 'Leads, enquiries, quotations, sales orders and customer service',
    icon: Users,
    home: '/sales',
    status: 'PLANNED',
    accent: 'text-blue-600 bg-blue-500/10 ring-blue-500/25',
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    code: 'FINANCE',
    name: 'Finance & Accounts',
    tagline: 'Ledgers, payables, receivables, costing, GST and period close',
    icon: Coins,
    home: '/finance',
    status: 'LIVE',
    accent: 'text-green-600 bg-green-500/10 ring-green-500/25',
    gradient: 'from-green-500 to-emerald-600',
  },
  {
    code: 'HRMS',
    name: 'HR, Payroll & Workforce',
    tagline: 'Employees, recruitment, attendance, shifts, leave, payroll, incentives, skills and statutory returns',
    icon: UserCog,
    home: '/hrms',
    status: 'LIVE',
    accent: 'text-purple-600 bg-purple-500/10 ring-purple-500/25',
    gradient: 'from-purple-500 to-violet-600',
  },
  {
    code: 'BI',
    name: 'Analytics & Insights',
    tagline: 'Executive dashboards, KPIs, forecasts, AI insights, alerts and the data behind them',
    icon: Sparkles,
    home: '/bi',
    status: 'LIVE',
    accent: 'text-fuchsia-600 bg-fuchsia-500/10 ring-fuchsia-500/25',
    gradient: 'from-fuchsia-500 to-pink-600',
  },
  {
    code: 'SHOPFLOOR',
    name: 'Shop Floor Terminal',
    tagline: 'Scan-driven operator screens for line confirmation and material movement',
    icon: HardHat,
    home: '/shopfloor',
    status: 'PLANNED',
    accent: 'text-red-600 bg-red-500/10 ring-red-500/25',
    gradient: 'from-red-500 to-rose-600',
  },
]

/** Partner-facing portals sign in through the same screen but land elsewhere. */
export const EXTERNAL_PORTALS = [
  { code: 'SUPPLIER', name: 'Supplier Portal', tagline: 'RFQ response, PO acknowledgement, ASN and invoice status', icon: Ship },
  { code: 'CUSTOMER', name: 'Customer Portal', tagline: 'Order status, dispatch tracking, invoices and complaints', icon: Users },
]

export const PORTAL_BY_CODE = Object.fromEntries(PORTALS.map((p) => [p.code, p])) as Record<PortalCode, Portal>

export function portalOf(code: string | null | undefined): Portal {
  return (code && PORTAL_BY_CODE[code as PortalCode]) || PORTAL_BY_CODE.ADMIN
}
