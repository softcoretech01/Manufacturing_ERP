import {
  Award,
  Banknote,
  Barcode,
  BarChart3,
  BookmarkCheck,
  BookOpen,
  Bell,
  CalendarCheck,
  Wallet,
  Boxes,
  Building2,
  Calculator,
  CalendarRange,
  CalendarClock,
  CalendarDays,
  Lock,
  Target,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Contact,
  Database,
  Droplets,
  FileClock,
  FileSignature,
  FileSpreadsheet,
  Files,
  Factory,
  Gauge,
  GaugeCircle,
  GitBranch,
  Globe2,
  Hash,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  ListTree,
  Mail,
  MapPin,
  MessageSquare,
  MessageSquareWarning,
  Network,
  Package,
  PackageCheck,
  PackagePlus,
  PaintBucket,
  Percent,
  Plug,
  Receipt,
  Repeat,
  RotateCcw,
  Ruler,
  Scale,
  ScrollText,
  Send,
  Search,
  Settings2,
  Shapes,
  Shield,
  ShieldCheck,
  Ship,
  ShoppingCart,
  SlidersHorizontal,
  Smartphone,
  Siren,
  Radar,
  Brain,
  TrendingDown,
  TrendingUp,
  Trash2,
  Truck,
  UserCog,
  Users,
  Warehouse,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { PortalCode } from './portals'

export interface NavItem {
  label: string
  to?: string
  icon?: LucideIcon
  permission?: string
  badge?: 'approvals'
  children?: NavItem[]
  comingSoon?: boolean
}

export interface NavGroup extends NavItem {
  portal: PortalCode
}

/* ═══════════════════════════ Administration ══════════════════════════════ */

const ADMIN_NAV: NavGroup[] = [
  { portal: 'ADMIN', label: 'Dashboard', to: '/', icon: LayoutDashboard },
  {
    portal: 'ADMIN',
    label: 'Organisation',
    icon: Building2,
    children: [
      { label: 'Structure explorer', to: '/admin/organisation', icon: Network },
      { label: 'Company', to: '/admin/company', icon: Building2, permission: 'SYSTEM.COMPANY.VIEW' },
      { label: 'Branches', to: '/admin/branches', icon: GitBranch, permission: 'SYSTEM.BRANCH.VIEW' },
      { label: 'Plants & lines', to: '/admin/plants', icon: Factory, permission: 'SYSTEM.PLANT.VIEW' },
      { label: 'Warehouses & bins', to: '/admin/warehouses', icon: Warehouse, permission: 'SYSTEM.WAREHOUSE.VIEW' },
      { label: 'Departments', to: '/admin/departments', icon: ListTree, permission: 'SYSTEM.DEPARTMENT.VIEW' },
      { label: 'Cost centres', to: '/admin/cost-centres', icon: Coins, permission: 'SYSTEM.COST_CENTRE.VIEW' },
      { label: 'Financial year & periods', to: '/admin/financial-year', icon: CalendarRange, permission: 'SYSTEM.FINANCIAL_YEAR.VIEW' },
      { label: 'Currency & rates', to: '/admin/currency', icon: Coins },
    ],
  },
  {
    portal: 'ADMIN',
    label: 'Access Control',
    icon: Shield,
    children: [
      { label: 'Users', to: '/admin/users', icon: Users, permission: 'SYSTEM.USER.VIEW' },
      { label: 'Roles', to: '/admin/roles', icon: ShieldCheck, permission: 'SYSTEM.ROLE.VIEW' },
      { label: 'Permission explorer', to: '/admin/permissions', icon: Search, permission: 'SYSTEM.PERMISSION.VIEW' },
      { label: 'Delegations', to: '/admin/delegations', icon: Users },
      { label: 'Sessions & devices', to: '/admin/sessions', icon: Smartphone, permission: 'SYSTEM.USER.VIEW' },
      { label: 'API keys', to: '/admin/api-keys', icon: KeyRound, permission: 'SYSTEM.INTEGRATION.VIEW' },
      { label: 'Segregation of duties', to: '/admin/sod', icon: Shield, permission: 'SYSTEM.ROLE.VIEW' },
      { label: 'Login activity', to: '/admin/login-activity', icon: FileClock, permission: 'SYSTEM.AUDIT.VIEW' },
    ],
  },
  {
    portal: 'ADMIN',
    label: 'Workflow',
    icon: Workflow,
    children: [
      { label: 'Approvals inbox', to: '/workflow/inbox', icon: ClipboardCheck, badge: 'approvals' },
      { label: 'Approval matrix', to: '/workflow/matrix', icon: SlidersHorizontal, permission: 'SYSTEM.APPROVAL_MATRIX.VIEW' },
      { label: 'Workflow designer', to: '/workflow/designer', icon: Network, permission: 'SYSTEM.WORKFLOW.VIEW' },
      { label: 'Workflow monitor', to: '/workflow/monitor', icon: GaugeCircle, permission: 'SYSTEM.WORKFLOW.VIEW' },
    ],
  },
  {
    portal: 'ADMIN',
    label: 'Platform Services',
    icon: Settings2,
    children: [
      { label: 'Document numbering', to: '/admin/numbering', icon: Hash, permission: 'SYSTEM.NUMBERING.VIEW' },
      { label: 'Notifications', to: '/admin/notifications', icon: Bell, permission: 'SYSTEM.NOTIFICATION.VIEW' },
      { label: 'Master data framework', to: '/admin/masters', icon: Database },
      { label: 'Attachments & DMS', to: '/admin/attachments', icon: Files },
      { label: 'Document repository', to: '/admin/documents', icon: FileSignature },
      { label: 'Import & export', to: '/admin/import', icon: FileSpreadsheet },
      { label: 'Collaboration', to: '/admin/collaboration', icon: MessageSquare },
      { label: 'Barcode & labels', to: '/admin/barcode', icon: Barcode },
      { label: 'Report engine', to: '/admin/reports', icon: FileSpreadsheet },
    ],
  },
  {
    portal: 'ADMIN',
    label: 'Compliance & Ops',
    icon: ScrollText,
    children: [
      { label: 'Audit trail', to: '/admin/audit', icon: ScrollText, permission: 'SYSTEM.AUDIT.VIEW' },
      { label: 'Security policy', to: '/admin/security', icon: Shield, permission: 'SYSTEM.PARAMETER.VIEW' },
      { label: 'Logging & monitoring', to: '/admin/monitoring', icon: GaugeCircle, permission: 'SYSTEM.JOB.VIEW' },
      { label: 'Administration reports', to: '/admin/admin-reports', icon: BarChart3, permission: 'SYSTEM.AUDIT.VIEW' },
      { label: 'System parameters', to: '/admin/parameters', icon: SlidersHorizontal, permission: 'SYSTEM.PARAMETER.VIEW' },
      { label: 'Integrations', to: '/admin/integrations', icon: Plug, permission: 'SYSTEM.INTEGRATION.VIEW' },
      { label: 'Background jobs', to: '/admin/jobs', icon: GaugeCircle, permission: 'SYSTEM.JOB.VIEW' },
      { label: 'Backup & restore', to: '/admin/backup', icon: Database, permission: 'SYSTEM.BACKUP.RUN' },
      { label: 'Licence', to: '/admin/license', icon: KeyRound, permission: 'SYSTEM.LICENSE.VIEW' },
    ],
  },
]

/* ═══════════════════════ Master Data Management ══════════════════════════ */

const MASTERS_NAV: NavGroup[] = [
  { portal: 'MASTERS', label: 'Dashboard', to: '/masters', icon: LayoutDashboard },
  {
    portal: 'MASTERS',
    label: 'Business Partners',
    icon: Contact,
    children: [
      { label: 'Customers', to: '/masters/customer', icon: Users },
      { label: 'Suppliers', to: '/masters/supplier', icon: Package },
      { label: 'Transporters', to: '/masters/transporter', icon: Truck },
      { label: 'Banks', to: '/masters/bank', icon: Landmark },
      { label: 'Contact persons', to: '/masters/contact', icon: Contact },
    ],
  },
  {
    portal: 'MASTERS',
    label: 'Product Engineering',
    icon: Shapes,
    children: [
      {
        label: 'Category',
        icon: ListTree,
        children: [
          { label: 'Item Category', to: '/masters/item-category', icon: Layers },
          { label: 'Product Category', to: '/masters/product-category', icon: Shapes },
        ],
      },
      { label: 'Product Items', to: '/masters/product-items', icon: Boxes },
      { label: 'Company Items', to: '/masters/company-items', icon: Building2 },
      { label: 'Products', to: '/masters/product', icon: Package },
      { label: 'Bottle models', to: '/masters/bottle-model', icon: Droplets },
      { label: 'Capacities', to: '/masters/bottle-capacity', icon: Ruler },
      { label: 'Colours & finishes', to: '/masters/bottle-colour', icon: PaintBucket },
      { label: 'Lid & cap types', to: '/masters/lid-type', icon: Shapes },
      { label: 'Packaging materials', to: '/masters/packaging', icon: Package },
    ],
  },
  {
    portal: 'MASTERS',
    label: 'Raw Material',
    icon: Boxes,
    children: [
      { label: 'Steel grades', to: '/masters/steel-grade', icon: Shapes },
      { label: 'Steel thickness', to: '/masters/steel-thickness', icon: Ruler },
    ],
  },
  {
    portal: 'MASTERS',
    label: 'Production',
    icon: Factory,
    children: [
      { label: 'Machines', to: '/masters/machine', icon: Wrench },
      { label: 'Production lines', to: '/admin/plants', icon: Factory },
      { label: 'Shifts', to: '/masters/shift', icon: CalendarRange },
      { label: 'Holiday calendar', to: '/masters/holiday-calendar', icon: CalendarRange },
    ],
  },
  {
    portal: 'MASTERS',
    label: 'Quality',
    icon: ClipboardCheck,
    children: [
      { label: 'Inspection parameters', to: '/masters/quality-parameter', icon: Gauge },
      { label: 'Defect types', to: '/masters/defect', icon: ClipboardCheck },
    ],
  },
  {
    portal: 'MASTERS',
    label: 'HR',
    icon: UserCog,
    children: [{ label: 'Employees', to: '/masters/employee', icon: Users }],
  },
  {
    portal: 'MASTERS',
    label: 'Finance & Tax',
    icon: Banknote,
    children: [
      { label: 'HSN / SAC codes', to: '/masters/hsn', icon: Hash },
      { label: 'Tax rates', to: '/masters/tax', icon: Percent },
      { label: 'Payment terms', to: '/masters/payment-terms', icon: Banknote },
      { label: 'Currency & rates', to: '/admin/currency', icon: Coins },
      { label: 'Cost centres', to: '/admin/cost-centres', icon: Coins },
    ],
  },
  {
    portal: 'MASTERS',
    label: 'Reference & Geography',
    icon: Globe2,
    children: [
      { label: 'Units of measure', to: '/masters/uom', icon: Ruler },
      { label: 'Reason codes', to: '/masters/reason-code', icon: ListTree },
      { label: 'Countries', to: '/masters/country', icon: Globe2 },
      { label: 'States', to: '/masters/state', icon: MapPin },
      { label: 'Cities', to: '/masters/city', icon: MapPin },
    ],
  },
  {
    portal: 'MASTERS',
    label: 'Governance',
    icon: Shield,
    children: [
      { label: 'Master framework', to: '/admin/masters', icon: Database },
      { label: 'Import & export', to: '/masters/import', icon: FileSpreadsheet },
      { label: 'Duplicate review', to: '/masters/duplicates', icon: Search },
      { label: 'Audit trail', to: '/admin/audit', icon: ScrollText, permission: 'SYSTEM.AUDIT.VIEW' },
      { label: 'Security policy', to: '/admin/security', icon: Shield, permission: 'SYSTEM.PARAMETER.VIEW' },
      { label: 'Logging & monitoring', to: '/admin/monitoring', icon: GaugeCircle, permission: 'SYSTEM.JOB.VIEW' },
      { label: 'Administration reports', to: '/admin/admin-reports', icon: BarChart3, permission: 'SYSTEM.AUDIT.VIEW' },
    ],
  },
]

/* ═════════════════ Procurement & Supplier Management ═════════════════════ */

/**
 * Ten menus, in the order the work happens:
 *
 *   PR → approve → RFQ → vendor quotations → comparison → PO → approve → GRN
 *
 * Nothing else belongs at this level. Screens that support the chain but are not
 * stages of it (MRP, contracts, imports, ASN, returns, evaluation) stay
 * reachable by URL and are opened from the screen that needs them.
 */
const PROCUREMENT_NAV: NavGroup[] = [
  { portal: 'PROCUREMENT', label: 'Dashboard', to: '/procurement', icon: LayoutDashboard },
  { portal: 'PROCUREMENT', label: 'Purchase Requisition', to: '/procurement/requisitions', icon: ClipboardList },
  { portal: 'PROCUREMENT', label: 'Request for Quotation', to: '/procurement/rfq', icon: Mail },
  { portal: 'PROCUREMENT', label: 'Vendor Quotations', to: '/procurement/quotations', icon: Receipt },
  { portal: 'PROCUREMENT', label: 'Quotation Comparison', to: '/procurement/comparison', icon: Scale },
  { portal: 'PROCUREMENT', label: 'Purchase Order', to: '/procurement/orders', icon: ShoppingCart },
  { portal: 'PROCUREMENT', label: 'Goods Receipt Note', to: '/procurement/grn', icon: PackageCheck },
  { portal: 'PROCUREMENT', label: 'Reports', to: '/procurement/analytics', icon: BarChart3 },
  { portal: 'PROCUREMENT', label: 'Settings', to: '/procurement/settings', icon: SlidersHorizontal },
]

/* ═════════════════ Inventory & Warehouse Management ══════════════════════ */

/**
 * One menu item, one screen, one route — nothing points at a tab of something
 * else, so exactly one item is ever highlighted. Deliberately not
 * permission-gated, the same as every other portal tree: the real controls are
 * server-side and inside each page.
 */
const INVENTORY_NAV: NavGroup[] = [
  { portal: 'INVENTORY', label: 'Dashboard', to: '/inventory', icon: LayoutDashboard },
  {
    portal: 'INVENTORY',
    label: 'Warehouse Setup',
    icon: Warehouse,
    children: [
      { label: 'Warehouses', to: '/inventory/warehouses', icon: Warehouse },
      { label: 'Zones, racks & bins', to: '/inventory/structure', icon: ListTree },
      { label: 'Bin map & occupancy', to: '/inventory/bin-map', icon: Network },
    ],
  },
  {
    portal: 'INVENTORY',
    label: 'Transactions',
    icon: Repeat,
    children: [
      { label: 'Goods receipt', to: '/inventory/receipts', icon: PackagePlus },
      { label: 'Put-away & QC hold', to: '/inventory/putaway', icon: PackageCheck },
      { label: 'Material requisitions', to: '/inventory/requisitions', icon: ClipboardList },
      { label: 'Goods issue', to: '/inventory/issues', icon: Send },
      { label: 'Material return', to: '/inventory/returns', icon: RotateCcw },
      { label: 'Stock transfer', to: '/inventory/transfers', icon: Truck },
      { label: 'Goods in transit', to: '/inventory/goods-in-transit', icon: Ship },
      { label: 'Job-work stock', to: '/inventory/job-work', icon: Factory },
      { label: 'Stock adjustment', to: '/inventory/adjustments', icon: SlidersHorizontal },
      { label: 'Scrap & write-off', to: '/inventory/scrap', icon: Trash2 },
    ],
  },
  {
    portal: 'INVENTORY',
    label: 'Stock Management',
    icon: Boxes,
    children: [
      { label: 'Stock enquiry', to: '/inventory/stock', icon: Search },
      { label: 'Stock ledger', to: '/inventory/ledger', icon: ScrollText },
      { label: 'Material reservation', to: '/inventory/reservations', icon: BookmarkCheck },
      { label: 'Batch & lot tracking', to: '/inventory/batches', icon: Layers },
      { label: 'Serial numbers', to: '/inventory/serials', icon: Hash },
      { label: 'Traceability', to: '/inventory/traceability', icon: GitBranch },
      { label: 'Barcode & labels', to: '/inventory/labels', icon: Barcode },
    ],
  },
  {
    portal: 'INVENTORY',
    label: 'Physical Inventory',
    icon: ClipboardCheck,
    children: [
      { label: 'Cycle count', to: '/inventory/counting', icon: ClipboardCheck },
      { label: 'Physical verification', to: '/inventory/verification', icon: Scale },
      { label: 'Variance approval', to: '/inventory/variance', icon: ShieldCheck },
    ],
  },
  {
    portal: 'INVENTORY',
    label: 'Analysis',
    icon: BarChart3,
    children: [
      { label: 'Inventory valuation', to: '/inventory/valuation', icon: Coins },
      { label: 'Stock ageing', to: '/inventory/ageing', icon: CalendarRange },
      { label: 'ABC / XYZ analysis', to: '/inventory/abc-xyz', icon: Gauge },
      { label: 'Fast, slow & dead stock', to: '/inventory/movement', icon: TrendingDown },
      { label: 'Reorder report', to: '/inventory/reorder', icon: Repeat },
    ],
  },
  {
    portal: 'INVENTORY',
    label: 'Reports & Setup',
    icon: FileSpreadsheet,
    children: [
      { label: 'All reports', to: '/inventory/reports', icon: FileSpreadsheet },
      { label: 'Barcode formats', to: '/admin/barcode', icon: Barcode },
      { label: 'Audit trail', to: '/admin/audit', icon: ScrollText },
    ],
  },
]

/* ═══════════════ Product Engineering — BOM & Routing (Vol 6) ═════════════ */

const ENGINEERING_NAV: NavGroup[] = [
  { portal: 'ENGINEERING', label: 'Dashboard', to: '/engineering', icon: LayoutDashboard },
  {
    portal: 'ENGINEERING',
    label: 'Products',
    icon: Shapes,
    children: [
      { label: 'Product master', to: '/engineering/products', icon: Boxes },
      { label: 'Engineering documents', to: '/engineering/documents', icon: Files },
    ],
  },
  {
    portal: 'ENGINEERING',
    label: 'Bill of Materials',
    icon: ListTree,
    children: [
      { label: 'BOM register', to: '/engineering/bom', icon: ListTree },
      { label: 'BOM explorer', to: '/engineering/bom-explorer', icon: Network },
    ],
  },
  {
    portal: 'ENGINEERING',
    label: 'Routing',
    icon: Workflow,
    children: [
      { label: 'Manufacturing routing', to: '/engineering/routing', icon: Workflow },
      { label: 'Operations', to: '/engineering/operations', icon: SlidersHorizontal },
      { label: 'Work centres', to: '/engineering/work-centres', icon: Factory },
      { label: 'Tools & dies', to: '/engineering/tools', icon: Wrench },
    ],
  },
  {
    portal: 'ENGINEERING',
    label: 'Cost & Change',
    icon: Coins,
    children: [
      { label: 'Cost roll-up', to: '/engineering/costing', icon: Coins },
      { label: 'Engineering changes', to: '/engineering/changes', icon: GitBranch },
    ],
  },
  {
    portal: 'ENGINEERING',
    label: 'Reports',
    icon: FileSpreadsheet,
    children: [
      { label: 'Engineering reports', to: '/engineering/reports', icon: FileSpreadsheet },
      { label: 'Audit trail', to: '/admin/audit', icon: ScrollText },
    ],
  },
]

/* ═════════════════ Shop Floor Execution — MES (Vol 8) ═══════════════════ */

const PRODUCTION_NAV: NavGroup[] = [
  { portal: 'PRODUCTION', label: 'Dashboard', to: '/production', icon: LayoutDashboard },
  {
    portal: 'PRODUCTION',
    label: 'Orders',
    icon: ClipboardList,
    children: [
      { label: 'Production orders', to: '/production/orders', icon: ClipboardList },
      { label: 'Work orders', to: '/production/work-orders', icon: Workflow },
      { label: 'Work centre queue', to: '/production/queue', icon: Layers },
    ],
  },
  {
    portal: 'PRODUCTION',
    label: 'Execution',
    icon: Gauge,
    children: [
      { label: 'Production entry', to: '/production/entry', icon: PackageCheck },
      { label: 'Work in progress', to: '/production/wip', icon: Boxes },
      { label: 'Work instructions', to: '/production/instructions', icon: Files },
    ],
  },
  {
    portal: 'PRODUCTION',
    label: 'Machines',
    icon: Factory,
    children: [
      { label: 'Machine status', to: '/production/machines', icon: Factory },
      { label: 'Downtime', to: '/production/downtime', icon: TrendingDown },
      { label: 'OEE', to: '/production/oee', icon: GaugeCircle },
    ],
  },
  {
    portal: 'PRODUCTION',
    label: 'Losses',
    icon: Trash2,
    children: [
      { label: 'Scrap', to: '/production/scrap', icon: Trash2 },
      { label: 'Rework', to: '/production/rework', icon: RotateCcw },
    ],
  },
  {
    portal: 'PRODUCTION',
    label: 'People',
    icon: Users,
    children: [
      { label: 'Shift management', to: '/production/shifts', icon: CalendarRange },
      { label: 'Labour tracking', to: '/production/labour', icon: Users },
    ],
  },
  {
    portal: 'PRODUCTION',
    label: 'Traceability',
    icon: Network,
    children: [
      { label: 'Traveller card', to: '/production/traveller', icon: FileClock },
      { label: 'Production genealogy', to: '/production/genealogy', icon: Network },
    ],
  },
  {
    portal: 'PRODUCTION',
    label: 'Reports',
    icon: FileSpreadsheet,
    children: [
      { label: 'Production reports', to: '/production/reports', icon: FileSpreadsheet },
      { label: 'Audit trail', to: '/admin/audit', icon: ScrollText },
    ],
  },
]

/* ═════════════════════ Production Planning & MRP ═════════════════════════ */

/**
 * Flat, in the order the plan is built:
 *
 *   forecast → demand → master schedule → MRP → capacity → orders → schedule
 *
 * Reservations, the calendar and reports sit after it, because that is when
 * someone goes looking for them.
 */
const PLANNING_NAV: NavGroup[] = [
  { portal: 'PLANNING', label: 'Dashboard', to: '/planning', icon: LayoutDashboard },
  { portal: 'PLANNING', label: 'Sales Forecast', to: '/planning/forecast', icon: TrendingDown },
  { portal: 'PLANNING', label: 'Demand', to: '/planning/demand', icon: Target },
  { portal: 'PLANNING', label: 'Master Schedule', to: '/planning/mps', icon: CalendarRange },
  { portal: 'PLANNING', label: 'MRP', to: '/planning/mrp', icon: Network },
  { portal: 'PLANNING', label: 'Capacity Planning', to: '/planning/capacity', icon: Gauge },
  { portal: 'PLANNING', label: 'Production Orders', to: '/planning/orders', icon: Factory },
  { portal: 'PLANNING', label: 'Schedule Board', to: '/planning/schedule', icon: CalendarClock },
  { portal: 'PLANNING', label: 'Material Reservation', to: '/planning/reservations', icon: Lock },
  { portal: 'PLANNING', label: 'Production Calendar', to: '/planning/calendar', icon: CalendarDays },
  { portal: 'PLANNING', label: 'Reports', to: '/planning/reports', icon: BarChart3 },
]

/* ═════════ Packing, Dispatch & Logistics Management (Vol 10) ═════════════ */

const DISPATCH_NAV: NavGroup[] = [
  { portal: 'PACKING_DISPATCH', label: 'Dashboard', to: '/dispatch', icon: LayoutDashboard },
  {
    portal: 'PACKING_DISPATCH',
    label: 'Packing',
    icon: PackagePlus,
    children: [
      { label: 'Packing orders', to: '/dispatch/packing-orders', icon: ClipboardList },
      { label: 'Packaging material', to: '/dispatch/packing-materials', icon: Package },
      { label: 'Cartons', to: '/dispatch/cartons', icon: PackageCheck },
      { label: 'Pallets', to: '/dispatch/pallets', icon: Layers },
      { label: 'Labels', to: '/dispatch/labels', icon: Barcode },
    ],
  },
  {
    portal: 'PACKING_DISPATCH',
    label: 'Dispatch',
    icon: Send,
    children: [
      { label: 'Dispatch planning', to: '/dispatch/planning', icon: CalendarRange },
      { label: 'Pick lists', to: '/dispatch/pick-lists', icon: ClipboardList },
      { label: 'Vehicle loading', to: '/dispatch/loading', icon: PackageCheck },
      { label: 'Vehicles', to: '/dispatch/vehicles', icon: Truck },
    ],
  },
  {
    portal: 'PACKING_DISPATCH',
    label: 'Logistics',
    icon: Ship,
    children: [
      { label: 'Shipments', to: '/dispatch/shipments', icon: Send },
      { label: 'Shipment tracking', to: '/dispatch/tracking', icon: MapPin },
      { label: 'Proof of delivery', to: '/dispatch/pod', icon: FileSignature },
      { label: 'Returns', to: '/dispatch/returns', icon: RotateCcw },
      { label: 'Freight & cost', to: '/dispatch/freight', icon: Coins },
      { label: 'Transporter performance', to: '/dispatch/transporters', icon: Gauge },
    ],
  },
  {
    portal: 'PACKING_DISPATCH',
    label: 'Export',
    icon: Globe2,
    children: [
      { label: 'Export shipments', to: '/dispatch/exports', icon: Ship },
      { label: 'Export documents', to: '/dispatch/export-documents', icon: Files },
    ],
  },
  {
    portal: 'PACKING_DISPATCH',
    label: 'Reports',
    icon: FileSpreadsheet,
    children: [
      { label: 'Dispatch reports', to: '/dispatch/reports', icon: FileSpreadsheet },
      { label: 'Audit trail', to: '/admin/audit', icon: ScrollText },
    ],
  },
]

/* ═══════════════════════ Quality Management ══════════════════════════════ */

const QUALITY_NAV: NavGroup[] = [
  { portal: 'QUALITY', label: 'Dashboard', to: '/quality', icon: LayoutDashboard },
  { portal: 'QUALITY', label: 'Inspection Plans', to: '/quality/plans', icon: ClipboardList },
  { portal: 'QUALITY', label: 'Inspections', to: '/quality/inspections', icon: ClipboardCheck },
  { portal: 'QUALITY', label: 'Defects & Pareto', to: '/quality/defects', icon: TrendingDown },
  { portal: 'QUALITY', label: 'Non-Conformance', to: '/quality/ncr', icon: FileSignature },
  { portal: 'QUALITY', label: 'CAPA', to: '/quality/capa', icon: ShieldCheck },
  { portal: 'QUALITY', label: 'Calibration', to: '/quality/calibration', icon: Ruler },
  { portal: 'QUALITY', label: 'Supplier Quality', to: '/quality/suppliers', icon: Award },
  { portal: 'QUALITY', label: 'Customer Complaints', to: '/quality/complaints', icon: MessageSquareWarning },
  { portal: 'QUALITY', label: 'Audits', to: '/quality/audits', icon: ClipboardCheck },
  { portal: 'QUALITY', label: 'Reports', to: '/quality/reports', icon: BarChart3 },
]

/* ═══════════════════════ Finance & Accounts ══════════════════════════════ */

const FINANCE_NAV: NavGroup[] = [
  { portal: 'FINANCE', label: 'Dashboard', to: '/finance', icon: LayoutDashboard },
  { portal: 'FINANCE', label: 'Chart of Accounts', to: '/finance/accounts', icon: BookOpen },
  { portal: 'FINANCE', label: 'Journals & Ledger', to: '/finance/journals', icon: Receipt },
  { portal: 'FINANCE', label: 'Statements', to: '/finance/statements', icon: Scale },
  { portal: 'FINANCE', label: 'Receivables', to: '/finance/receivables', icon: Banknote },
  { portal: 'FINANCE', label: 'Payables', to: '/finance/payables', icon: Landmark },
  { portal: 'FINANCE', label: 'Banking', to: '/finance/banking', icon: Wallet },
  { portal: 'FINANCE', label: 'Cost & Variance', to: '/finance/costing', icon: Calculator },
  { portal: 'FINANCE', label: 'GST & TDS', to: '/finance/tax', icon: Percent },
  { portal: 'FINANCE', label: 'Fixed Assets', to: '/finance/assets', icon: Building2 },
  { portal: 'FINANCE', label: 'Budgets', to: '/finance/budgets', icon: Target },
  { portal: 'FINANCE', label: 'Period Close', to: '/finance/close', icon: CalendarCheck },
]

/* ═══ HR, Payroll & Workforce Management (Vol 12) ═════════════════════════ */

const HRMS_NAV: NavGroup[] = [
  { portal: 'HRMS', label: 'Dashboard', to: '/hrms', icon: LayoutDashboard },
  {
    portal: 'HRMS',
    label: 'People',
    icon: Users,
    children: [
      { label: 'Employees', to: '/hrms/employees', icon: Contact },
      { label: 'Organisation structure', to: '/hrms/organisation', icon: Network },
    ],
  },
  {
    portal: 'HRMS',
    label: 'Recruitment',
    icon: UserCog,
    children: [
      { label: 'Manpower requisitions', to: '/hrms/requisitions', icon: ClipboardList },
      { label: 'Candidate pipeline', to: '/hrms/recruitment', icon: Users },
    ],
  },
  {
    portal: 'HRMS',
    label: 'Time & Attendance',
    icon: FileClock,
    children: [
      { label: 'Attendance', to: '/hrms/attendance', icon: FileClock },
      { label: 'Overtime', to: '/hrms/overtime', icon: Repeat },
      { label: 'Shifts & roster', to: '/hrms/shifts', icon: CalendarRange },
      { label: 'Leave', to: '/hrms/leave', icon: CalendarDays },
    ],
  },
  {
    portal: 'HRMS',
    label: 'Payroll',
    icon: Banknote,
    children: [
      { label: 'Payroll run', to: '/hrms/payroll', icon: Calculator },
      { label: 'Payslips', to: '/hrms/payslips', icon: Receipt },
      { label: 'Salary structures', to: '/hrms/salary-structures', icon: Coins },
      { label: 'Statutory compliance', to: '/hrms/statutory', icon: Landmark },
    ],
  },
  {
    portal: 'HRMS',
    label: 'Workforce',
    icon: Factory,
    children: [
      { label: 'Production incentives', to: '/hrms/incentives', icon: Award },
      { label: 'Labour cost', to: '/hrms/labour-cost', icon: Scale },
      { label: 'Skill matrix', to: '/hrms/skills', icon: GaugeCircle },
      { label: 'Contractor labour', to: '/hrms/contractors', icon: Truck },
    ],
  },
  {
    portal: 'HRMS',
    label: 'Growth',
    icon: TrendingUp,
    children: [
      { label: 'Performance', to: '/hrms/performance', icon: Target },
      { label: 'Training', to: '/hrms/training', icon: BookmarkCheck },
    ],
  },
  {
    portal: 'HRMS',
    label: 'Self Service',
    icon: Smartphone,
    children: [
      { label: 'My page', to: '/hrms/self-service', icon: Contact },
      { label: 'My team', to: '/hrms/team', icon: Users },
    ],
  },
  {
    portal: 'HRMS',
    label: 'Reports',
    icon: FileSpreadsheet,
    children: [
      { label: 'HR reports', to: '/hrms/reports', icon: FileSpreadsheet },
      { label: 'Audit trail', to: '/admin/audit', icon: ScrollText },
    ],
  },
]

/* ═══════════════════════ Plant Maintenance & EAM ═════════════════════════ */

const MAINTENANCE_NAV: NavGroup[] = [
  { portal: 'MAINTENANCE', label: 'Dashboard', to: '/maintenance', icon: LayoutDashboard },
  { portal: 'MAINTENANCE', label: 'Asset Register', to: '/maintenance/assets', icon: Factory },
  { portal: 'MAINTENANCE', label: 'Preventive Plans', to: '/maintenance/pm', icon: CalendarCheck },
  { portal: 'MAINTENANCE', label: 'Work Orders', to: '/maintenance/work-orders', icon: Wrench },
  { portal: 'MAINTENANCE', label: 'Breakdowns', to: '/maintenance/breakdowns', icon: Gauge },
  { portal: 'MAINTENANCE', label: 'Condition Monitoring', to: '/maintenance/condition', icon: GaugeCircle },
  { portal: 'MAINTENANCE', label: 'Spare Parts', to: '/maintenance/spares', icon: Package },
  { portal: 'MAINTENANCE', label: 'Technicians', to: '/maintenance/technicians', icon: Users },
  { portal: 'MAINTENANCE', label: 'Safety Permits', to: '/maintenance/permits', icon: Shield },
  { portal: 'MAINTENANCE', label: 'Utilities', to: '/maintenance/utilities', icon: Droplets },
  { portal: 'MAINTENANCE', label: 'Shutdowns', to: '/maintenance/shutdowns', icon: CalendarClock },
  { portal: 'MAINTENANCE', label: 'Reports', to: '/maintenance/reports', icon: BarChart3 },
]


/* ═══ Business Intelligence, Analytics & AI Insights (Vol 14) ═════════════ */

const BI_NAV: NavGroup[] = [
  { portal: 'BI', label: 'Executive Overview', to: '/bi', icon: LayoutDashboard },
  { portal: 'BI', label: 'Dashboards', to: '/bi/dashboards', icon: Gauge },
  { portal: 'BI', label: 'AI Insights', to: '/bi/insights', icon: Brain },
  {
    portal: 'BI',
    label: 'Analytics',
    icon: BarChart3,
    children: [
      { label: 'Production', to: '/bi/production', icon: Factory },
      { label: 'Quality', to: '/bi/quality', icon: ClipboardCheck },
      { label: 'Maintenance', to: '/bi/maintenance', icon: Wrench },
      { label: 'Procurement', to: '/bi/procurement', icon: ShoppingCart },
      { label: 'Inventory', to: '/bi/inventory', icon: Warehouse },
      { label: 'Sales & customers', to: '/bi/sales', icon: TrendingUp },
      { label: 'Finance', to: '/bi/finance', icon: Banknote, permission: 'BI.FINANCIAL.VIEW' },
      { label: 'Workforce', to: '/bi/workforce', icon: Users, permission: 'BI.PEOPLE.VIEW' },
    ],
  },
  { portal: 'BI', label: 'Forecasts', to: '/bi/forecasts', icon: Radar },
  {
    portal: 'BI',
    label: 'Measures',
    icon: Target,
    children: [
      { label: 'KPI library', to: '/bi/kpis', icon: Target },
      { label: 'Scorecards', to: '/bi/scorecards', icon: Award },
    ],
  },
  { portal: 'BI', label: 'Alerts & Exceptions', to: '/bi/alerts', icon: Siren },
  { portal: 'BI', label: 'Report Catalogue', to: '/bi/reports', icon: FileSpreadsheet },
  {
    portal: 'BI',
    label: 'Data & Governance',
    icon: Database,
    children: [
      { label: 'Data sources', to: '/bi/data-sources', icon: Database },
      { label: 'Access & audit', to: '/bi/governance', icon: ShieldCheck },
    ],
  },
]

/* ═══════════════════════ Portals not yet built ═══════════════════════════ */

const PLANNED_NAV: NavGroup[] = []

/* ═══════════════════════════ Public API ═════════════════════════════════ */

export const NAVIGATION: NavGroup[] = [
  ...ADMIN_NAV,
  ...MASTERS_NAV,
  ...PROCUREMENT_NAV,
  ...INVENTORY_NAV,
  ...ENGINEERING_NAV,
  ...PRODUCTION_NAV,
  ...PLANNING_NAV,
  ...DISPATCH_NAV,
  ...QUALITY_NAV,
  ...FINANCE_NAV,
  ...MAINTENANCE_NAV,
  ...HRMS_NAV,
  ...BI_NAV,
  ...PLANNED_NAV,
]

export function navigationFor(portal: PortalCode): NavGroup[] {
  const groups = NAVIGATION.filter((g) => g.portal === portal)
  // A portal with nothing built yet still gets the administration tree so the
  // user is never stranded on an empty sidebar.
  return groups.length ? groups : ADMIN_NAV
}
