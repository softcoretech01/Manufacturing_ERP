/**
 * Business Intelligence, Analytics & AI Insights — Volume 14.
 *
 * This module owns no transactions of its own. Everything it shows is derived
 * from the operational modules, which is the only honest way to build it: a BI
 * layer that keeps its own copy of the numbers eventually disagrees with the
 * system it reports on, and then nobody trusts either.
 *
 * Two ideas run through the types below. First, every metric names the module it
 * came from and the screen it drills through to, so a figure on a dashboard is
 * never a dead end. Second, every insight carries the window it was measured
 * over and the evidence behind it — an AI observation with no traceable basis is
 * a rumour with a chart.
 */

/** The operational modules BI reads from. */
export type SourceModule =
  | 'SALES'
  | 'PROCUREMENT'
  | 'INVENTORY'
  | 'PRODUCTION'
  | 'QUALITY'
  | 'MAINTENANCE'
  | 'DISPATCH'
  | 'FINANCE'
  | 'HRMS'
  | 'PLANNING'
  | 'ENGINEERING'

export type MetricFormat = 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DAYS' | 'HOURS' | 'RATIO' | 'PPM'

/** Higher is better for output; lower is better for scrap and cost. */
export type MetricDirection = 'HIGHER_BETTER' | 'LOWER_BETTER'

export type MetricStatus = 'ON_TARGET' | 'WATCH' | 'OFF_TARGET' | 'NO_DATA'

/**
 * A KPI definition — the contract for a number. The formula is stated in plain
 * words on purpose: a KPI whose calculation only exists in code is one nobody
 * can argue with, and an unarguable KPI is an unusable one.
 */
export interface KpiDefinition {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  module: SourceModule
  category: 'FINANCIAL' | 'OPERATIONAL' | 'QUALITY' | 'CUSTOMER' | 'PEOPLE' | 'SUPPLY_CHAIN'
  formula: string
  unit: string
  format: MetricFormat
  direction: MetricDirection
  target: number
  /** Inside this band of the target the KPI is amber rather than red. */
  watchBandPct: number
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
  ownerRole: string
  ownerName: string
  responsibleDepartment: string
  reviewCycle: string
  /** Where the number can be verified in the operational module. */
  drillTo: string | null
  /** Only visible with the money or the people permission. */
  sensitivity: 'OPEN' | 'FINANCIAL' | 'PEOPLE'
  isActive: boolean
}

/** A KPI definition with the period's actual attached. */
export interface KpiReading {
  code: string
  name: string
  module: SourceModule
  value: number
  previousValue: number | null
  target: number
  format: MetricFormat
  direction: MetricDirection
  unit: string
  status: MetricStatus
  /** Short series for the sparkline, oldest first. */
  spark: number[]
  drillTo: string | null
  sensitivity: 'OPEN' | 'FINANCIAL' | 'PEOPLE'
  /** Plain sentence naming where the figure came from. */
  source: string
}

/* ═══════════════════════════ Dashboards ═════════════════════════════════ */

export type DashboardRole =
  | 'CEO'
  | 'MANAGING_DIRECTOR'
  | 'CFO'
  | 'COO'
  | 'PLANT_HEAD'
  | 'PRODUCTION_MANAGER'
  | 'QUALITY_MANAGER'
  | 'PURCHASE_MANAGER'
  | 'WAREHOUSE_MANAGER'
  | 'SALES_MANAGER'
  | 'HR_MANAGER'
  | 'MAINTENANCE_MANAGER'
  | 'SUPERVISOR'
  | 'OPERATOR'

export interface DashboardDefinition {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  role: DashboardRole
  description: string
  /** KPI codes shown, in order. */
  kpiCodes: string[]
  refreshMinutes: number
  lastRefreshedAt: string
  /** Which modules feed it — used to show a data-freshness warning. */
  modules: SourceModule[]
  isDefault: boolean
  viewCount: number
  version: number
  updatedBy: string
  updatedOn: string
  isActive: boolean
}

/* ═════════════════════════ AI insight engine ════════════════════════════ */

export type InsightKind = 'TREND' | 'ANOMALY' | 'THRESHOLD' | 'CORRELATION' | 'FORECAST' | 'RECOMMENDATION'
export type InsightSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'POSITIVE'

/**
 * A generated observation. It is only useful if a human can check it, so every
 * insight carries the window, the comparison and a link to the evidence, and can
 * be marked useful or not — which is what stops the engine drowning people in
 * noise over time.
 */
export interface Insight {
  uid: string
  deletedAt?: string | null
  code: string
  kind: InsightKind
  severity: InsightSeverity
  module: SourceModule
  title: string
  /** The observation, written as a sentence somebody would say out loud. */
  detail: string
  /** What was compared with what, and over how long. */
  basis: string
  metricCode: string | null
  currentValue: number | null
  comparisonValue: number | null
  changePct: number | null
  format: MetricFormat
  /** What to do about it, when there is something to do. */
  recommendation: string | null
  /** Estimated rupee impact if nothing changes. */
  estimatedImpact: number | null
  detectedOn: string
  /** Where to go and verify it. */
  evidenceLabel: string
  evidenceTo: string | null
  /** Rough model confidence, shown so a weak signal reads as weak. */
  confidencePct: number
  status: 'NEW' | 'ACKNOWLEDGED' | 'ACTIONED' | 'DISMISSED' | 'RESOLVED'
  feedback: 'NONE' | 'USEFUL' | 'NOT_USEFUL'
  assignedTo: string | null
  actionNote: string | null
}

/* ═══════════════════════ Predictive analytics ═══════════════════════════ */

export type ForecastSubject =
  | 'SALES_DEMAND'
  | 'MATERIAL_CONSUMPTION'
  | 'INVENTORY_LEVEL'
  | 'MACHINE_FAILURE'
  | 'LABOUR_REQUIREMENT'
  | 'CASH_FLOW'
  | 'REVENUE'
  | 'MAINTENANCE_DUE'

export interface ForecastPoint {
  period: string
  actual: number | null
  forecast: number | null
  lower: number | null
  upper: number | null
}

export interface ForecastModel {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  subject: ForecastSubject
  module: SourceModule
  /** Naming the method matters — a moving average and a regression fail differently. */
  method: 'MOVING_AVERAGE' | 'LINEAR_TREND' | 'SEASONAL' | 'WEIGHTED' | 'CROSTON'
  horizonPeriods: number
  historyPeriods: number
  format: MetricFormat
  unit: string
  /** Mean absolute percentage error over the backtest window. */
  accuracyPct: number
  lastRunOn: string
  nextRunOn: string
  series: ForecastPoint[]
  /** What the forecast implies, if anything. */
  headline: string
  drillTo: string | null
  isActive: boolean
}

/** A single machine's failure risk — the one forecast that is per-asset. */
export interface FailureRisk {
  uid: string
  deletedAt?: string | null
  machineCode: string
  machineName: string
  line: string
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  runHoursSinceService: number
  serviceIntervalHours: number
  breakdownsLast90Days: number
  mtbfHours: number
  /** Probability of an unplanned stop in the next 30 days. */
  failureProbabilityPct: number
  predictedFailureWindow: string
  estimatedDowntimeHours: number
  estimatedImpact: number
  recommendation: string
  pmDueOn: string
  status: 'MONITOR' | 'SCHEDULE_PM' | 'URGENT'
}

/* ═════════════════════ Alerts & exception management ════════════════════ */

export type AlertChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH'

export interface AlertRule {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  module: SourceModule
  metricCode: string
  /** Fires when the metric crosses this in the wrong direction. */
  operator: 'BELOW' | 'ABOVE' | 'CHANGES_BY'
  threshold: number
  format: MetricFormat
  /** Consecutive breaches before it fires — stops a single blip paging people. */
  consecutiveBreaches: number
  severity: InsightSeverity
  channels: AlertChannel[]
  recipients: string[]
  /** Minutes before the same alert may fire again. */
  cooldownMinutes: number
  frequency: 'REAL_TIME' | 'HOURLY' | 'DAILY' | 'WEEKLY'
  firedCount: number
  lastFiredAt: string | null
  isActive: boolean
}

export interface AlertEvent {
  uid: string
  deletedAt?: string | null
  ruleCode: string
  ruleName: string
  module: SourceModule
  severity: InsightSeverity
  firedAt: string
  metricValue: number
  threshold: number
  format: MetricFormat
  message: string
  channelsSent: AlertChannel[]
  drillTo: string | null
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  resolvedAt: string | null
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED'
}

/* ═══════════════════════ Reporting & data layer ═════════════════════════ */

export interface BiReport {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  category: 'OPERATIONAL' | 'MANAGEMENT' | 'EXECUTIVE' | 'STATUTORY' | 'CUSTOMER' | 'SUPPLIER'
  module: SourceModule
  reportType: 'INTERACTIVE' | 'PIVOT' | 'DRILL_DOWN' | 'SNAPSHOT'
  description: string
  columns: string
  filters: string
  sensitivity: 'OPEN' | 'FINANCIAL' | 'PEOPLE'
  /** Null when it is run on demand rather than scheduled. */
  schedule: string | null
  recipients: string[]
  formats: ('PDF' | 'EXCEL' | 'CSV')[]
  lastRunAt: string | null
  runCount: number
  drillTo: string | null
  isActive: boolean
}

/**
 * A feed from an operational module into the analytics layer. Freshness is the
 * whole point: a dashboard built on a feed that failed four hours ago is worse
 * than no dashboard, because it looks fine.
 */
export interface DataSource {
  uid: string
  deletedAt?: string | null
  code: string
  module: SourceModule
  name: string
  entity: string
  rowCount: number
  refreshMode: 'REAL_TIME' | 'EVERY_15_MIN' | 'HOURLY' | 'NIGHTLY'
  lastRefreshedAt: string
  lastRefreshDurationSeconds: number
  nextRefreshAt: string
  /** Rows rejected by the load — a rising number means an upstream change. */
  rejectedRows: number
  /** Percentage of expected fields populated. */
  completenessPct: number
  status: 'HEALTHY' | 'STALE' | 'DEGRADED' | 'FAILED'
  lastError: string | null
}

/* ═══════════════════════ Security & governance ══════════════════════════ */

export interface DashboardAccess {
  uid: string
  deletedAt?: string | null
  role: string
  dashboardCode: string
  dashboardName: string
  /** Which slice of rows the role may see. */
  rowScope: 'ALL' | 'OWN_PLANT' | 'OWN_DEPARTMENT' | 'OWN_TEAM' | 'SELF'
  /** Fields blanked for this role even inside its row scope. */
  maskedFields: string[]
  canDrillToTransaction: boolean
  canExport: boolean
  canSchedule: boolean
  grantedBy: string
  grantedOn: string
}

export interface AccessLogEntry {
  uid: string
  deletedAt?: string | null
  at: string
  user: string
  role: string
  action: 'VIEWED' | 'EXPORTED' | 'DRILLED' | 'SCHEDULED' | 'CHANGED' | 'SHARED'
  objectType: 'DASHBOARD' | 'REPORT' | 'KPI' | 'INSIGHT'
  objectName: string
  /** Exports of sensitive data are the ones an auditor actually reads. */
  sensitivity: 'OPEN' | 'FINANCIAL' | 'PEOPLE'
  rowsTouched: number | null
  ipAddress: string
  note: string | null
}

/* ═══════════════════════════ Chart series ═══════════════════════════════ */

export interface TrendPoint {
  period: string
  [series: string]: string | number
}

export interface ParetoPoint {
  label: string
  value: number
  cumulativePct: number
}

export interface HeatCell {
  row: string
  column: string
  value: number
  status: MetricStatus
}

export interface RegionSales {
  region: string
  revenue: number
  orders: number
  customers: number
  growthPct: number
  onTimePct: number
}

export interface FunnelStage {
  stage: string
  count: number
  value: number
}
