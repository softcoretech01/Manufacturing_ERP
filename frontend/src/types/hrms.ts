/**
 * Human Resources, Payroll & Workforce Management — Volume 12.
 *
 * The employee master itself lives in Volume 2 (`types/masters.ts`); everything
 * here is the transaction and calculation layer on top of it. The chain that
 * matters in a factory runs: attendance → shift → overtime → payroll → labour
 * cost against a production order. Break any link and the cost per bottle stops
 * being a real number.
 */

/* ═══════════════════════ Organisation & workforce ════════════════════════ */

export interface OrgNode {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  level: 'COMPANY' | 'DIVISION' | 'PLANT' | 'DEPARTMENT' | 'SECTION' | 'LINE'
  parentCode: string | null
  costCentre: string
  headEmployeeCode: string | null
  headName: string | null
  sanctionedHeadcount: number
  actualHeadcount: number
  isActive: boolean
}

export type EmploymentType = 'PERMANENT' | 'PROBATION' | 'CONTRACT' | 'APPRENTICE' | 'TRAINEE' | 'CONSULTANT' | 'TEMPORARY'

/**
 * The HR view of a person — the master record plus the fields only HR and
 * payroll need. Statutory identifiers are held masked; the unmasked value is
 * never sent to the browser.
 */
export interface HrEmployee {
  uid: string
  deletedAt?: string | null
  employeeCode: string
  fullName: string
  designation: string
  department: string
  section: string | null
  grade: string
  employmentType: EmploymentType
  reportsTo: string
  dateOfJoining: string
  confirmationDueOn: string | null
  contractEndOn: string | null
  dateOfBirth: string
  gender: 'M' | 'F' | 'O'
  mobile: string
  email: string
  emergencyContact: string
  plant: string
  costCentre: string
  workCentre: string | null
  productionLine: string | null
  shiftCode: string
  isShopFloor: boolean
  /** Payroll identity — masked for display. */
  pfNumber: string | null
  esiNumber: string | null
  uanNumber: string | null
  panMasked: string
  aadhaarMasked: string
  bankAccountMasked: string
  bankName: string
  taxRegime: 'OLD' | 'NEW'
  salaryStructureCode: string
  monthlyCtc: number
  status: 'ACTIVE' | 'PROBATION' | 'NOTICE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED'
  exitDate: string | null
  exitReason: string | null
}

/* ══════════════════════════ Recruitment ══════════════════════════════════ */

export interface ManpowerRequisition {
  uid: string
  deletedAt?: string | null
  docNo: string
  raisedOn: string
  department: string
  designation: string
  grade: string
  employmentType: EmploymentType
  positions: number
  filledPositions: number
  /** Replacement for an exit, or a genuinely new post. */
  reason: 'REPLACEMENT' | 'EXPANSION' | 'NEW_LINE' | 'SEASONAL' | 'SKILL_GAP'
  replacingEmployeeCode: string | null
  justification: string
  requiredBy: string
  budgetedCtc: number
  raisedBy: string
  approvedBy: string | null
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'POSTED' | 'IN_PROGRESS' | 'CLOSED' | 'REJECTED'
}

export type CandidateStage =
  | 'APPLIED'
  | 'SCREENING'
  | 'INTERVIEW_1'
  | 'INTERVIEW_2'
  | 'PRACTICAL_TEST'
  | 'SELECTED'
  | 'OFFERED'
  | 'OFFER_ACCEPTED'
  | 'JOINED'
  | 'REJECTED'
  | 'DECLINED'

export interface Candidate {
  uid: string
  deletedAt?: string | null
  candidateNo: string
  fullName: string
  requisitionNo: string
  designation: string
  department: string
  source: 'REFERRAL' | 'JOB_PORTAL' | 'WALK_IN' | 'CAMPUS' | 'CONSULTANT' | 'INTERNAL'
  appliedOn: string
  experienceYears: number
  currentCtc: number | null
  expectedCtc: number | null
  offeredCtc: number | null
  mobile: string
  email: string
  stage: CandidateStage
  /** Practical test is what actually decides a shop-floor hire. */
  interviewScore: number | null
  practicalScore: number | null
  panelRemarks: string | null
  offerIssuedOn: string | null
  joiningDate: string | null
  rejectionReason: string | null
}

/* ══════════════════════════ Attendance & shift ═══════════════════════════ */

export type PunchSource = 'FINGERPRINT' | 'FACE' | 'RFID' | 'MOBILE_GPS' | 'QR' | 'MANUAL'

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'WEEKLY_OFF'
  | 'HOLIDAY'
  | 'ON_LEAVE'
  | 'HALF_DAY'
  | 'LATE'
  | 'EARLY_EXIT'
  | 'MISSED_PUNCH'

export interface AttendanceRecord {
  uid: string
  deletedAt?: string | null
  attendanceDate: string
  employeeCode: string
  employeeName: string
  department: string
  shiftCode: string
  shiftName: string
  /** Scheduled shift window, for measuring late and early against. */
  shiftStart: string
  shiftEnd: string
  inTime: string | null
  outTime: string | null
  inSource: PunchSource | null
  outSource: PunchSource | null
  breakMinutes: number
  workedMinutes: number
  lateMinutes: number
  earlyExitMinutes: number
  overtimeMinutes: number
  status: AttendanceStatus
  /** A missed punch has to be regularised by a manager before payroll. */
  regularised: boolean
  regularisedBy: string | null
  regularisationReason: string | null
  isShopFloor: boolean
  workCentre: string | null
}

export interface Shift {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  shiftType: 'GENERAL' | 'MORNING' | 'EVENING' | 'NIGHT' | 'ROTATIONAL' | 'SPLIT'
  startTime: string
  endTime: string
  breakMinutes: number
  /** Minutes of grace before a late mark bites. */
  graceMinutes: number
  /** Worked minutes below this is a half day. */
  halfDayMinutes: number
  fullDayMinutes: number
  nightAllowance: number
  shiftAllowance: number
  weeklyOffDays: string[]
  isRotational: boolean
  rotationCycleDays: number
  headcount: number
  isActive: boolean
}

export interface RosterEntry {
  uid: string
  deletedAt?: string | null
  rosterDate: string
  employeeCode: string
  employeeName: string
  department: string
  shiftCode: string
  workCentre: string | null
  /** A swap needs both people to agree and a supervisor to approve. */
  swapWithEmployeeCode: string | null
  swapStatus: 'NONE' | 'REQUESTED' | 'APPROVED' | 'REJECTED'
  isWeeklyOff: boolean
  isHoliday: boolean
  status: 'PLANNED' | 'CONFIRMED' | 'CHANGED'
}

export interface OvertimeRecord {
  uid: string
  deletedAt?: string | null
  docNo: string
  otDate: string
  employeeCode: string
  employeeName: string
  department: string
  shiftCode: string
  /** Minutes claimed against minutes the attendance system actually saw. */
  claimedMinutes: number
  systemMinutes: number
  approvedMinutes: number
  reason: string
  productionOrderNo: string | null
  workCentre: string | null
  /** Statutory overtime in India is paid at twice the ordinary rate. */
  rateMultiplier: number
  hourlyRate: number
  amount: number
  requestedBy: string
  approvedBy: string | null
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PAID'
}

/* ══════════════════════════════ Leave ════════════════════════════════════ */

export type LeaveType = 'CASUAL' | 'SICK' | 'EARNED' | 'MATERNITY' | 'PATERNITY' | 'COMP_OFF' | 'LOSS_OF_PAY'

export interface LeavePolicy {
  uid: string
  deletedAt?: string | null
  leaveType: LeaveType
  name: string
  annualEntitlement: number
  /** How the balance builds up through the year. */
  accrual: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ON_EVENT'
  carryForwardAllowed: boolean
  maxCarryForward: number
  encashmentAllowed: boolean
  maxEncashment: number
  minNoticeDays: number
  maxConsecutiveDays: number
  requiresDocument: boolean
  documentAfterDays: number
  isPaid: boolean
  appliesTo: EmploymentType[]
  isActive: boolean
}

export interface LeaveBalance {
  employeeCode: string
  leaveType: LeaveType
  opening: number
  accrued: number
  availed: number
  encashed: number
  lapsed: number
  closing: number
}

export interface LeaveRequest {
  uid: string
  deletedAt?: string | null
  docNo: string
  employeeCode: string
  employeeName: string
  department: string
  leaveType: LeaveType
  fromDate: string
  toDate: string
  days: number
  isHalfDay: boolean
  reason: string
  appliedOn: string
  contactDuringLeave: string
  handoverTo: string | null
  documentAttached: boolean
  managerApprovedBy: string | null
  managerApprovedOn: string | null
  hrApprovedBy: string | null
  hrApprovedOn: string | null
  rejectionReason: string | null
  /** Balance at the moment of applying — what the approver actually judged. */
  balanceAtApply: number
  status: 'DRAFT' | 'PENDING_MANAGER' | 'PENDING_HR' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN'
}

/* ══════════════════════════════ Payroll ═════════════════════════════════ */

export type ComponentKind = 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION'

export interface SalaryComponent {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  kind: ComponentKind
  /** Fixed amount, a percentage of another component, or computed by a rule. */
  basis: 'FIXED' | 'PERCENT_OF_BASIC' | 'PERCENT_OF_GROSS' | 'FORMULA' | 'ATTENDANCE_BASED' | 'STATUTORY'
  percentValue: number | null
  formula: string | null
  isTaxable: boolean
  partOfPfWages: boolean
  partOfEsiWages: boolean
  prorateOnAttendance: boolean
  showOnPayslip: boolean
  sequence: number
  isActive: boolean
}

export interface SalaryStructure {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  grade: string
  appliesTo: EmploymentType[]
  monthlyCtc: number
  lines: { componentCode: string; componentName: string; kind: ComponentKind; amount: number }[]
  effectiveFrom: string
  employeeCount: number
  isActive: boolean
}

export type PayrollStatus = 'DRAFT' | 'ATTENDANCE_LOCKED' | 'CALCULATED' | 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'CLOSED'

export interface PayrollRun {
  uid: string
  deletedAt?: string | null
  docNo: string
  period: string
  periodStart: string
  periodEnd: string
  plant: string
  status: PayrollStatus
  employeeCount: number
  /** The gates in order — payroll cannot be calculated over open attendance. */
  attendanceLocked: boolean
  leaveLocked: boolean
  overtimeApproved: boolean
  incentiveApproved: boolean
  grossEarnings: number
  totalDeductions: number
  netPayable: number
  employerPf: number
  employerEsi: number
  totalCtc: number
  calculatedOn: string | null
  approvedBy: string | null
  approvedOn: string | null
  paidOn: string | null
  bankAdviceNo: string | null
  journalNo: string | null
  remarks?: string
}

export interface Payslip {
  uid: string
  deletedAt?: string | null
  payrollRunNo: string
  period: string
  employeeCode: string
  employeeName: string
  designation: string
  department: string
  grade: string
  daysInMonth: number
  daysPaid: number
  daysAbsent: number
  leaveDays: number
  overtimeHours: number
  earnings: { code: string; name: string; amount: number }[]
  deductions: { code: string; name: string; amount: number }[]
  grossEarnings: number
  totalDeductions: number
  netPay: number
  employerPf: number
  employerEsi: number
  incentiveAmount: number
  bankAccountMasked: string
  status: 'DRAFT' | 'RELEASED' | 'PAID' | 'HELD'
  holdReason: string | null
}

/* ═══════════════════════ Production incentives ══════════════════════════ */

export type IncentiveModel = 'PER_UNIT' | 'PER_BATCH' | 'TEAM' | 'DEPARTMENT' | 'MONTHLY_BONUS' | 'PRODUCTIVITY_BONUS'

export interface IncentiveScheme {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  model: IncentiveModel
  appliesTo: string
  /** Nothing is earned below the qualifying threshold. */
  qualifyingOutputPct: number
  minAttendancePct: number
  maxRejectionPct: number
  maxReworkPct: number
  minOeePct: number
  ratePerUnit: number
  teamBonus: number
  monthlyCap: number
  effectiveFrom: string
  participantCount: number
  isActive: boolean
}

export interface IncentiveEarning {
  uid: string
  deletedAt?: string | null
  period: string
  employeeCode: string
  employeeName: string
  department: string
  workCentre: string | null
  schemeCode: string
  schemeName: string
  model: IncentiveModel
  unitsProduced: number
  targetUnits: number
  goodUnits: number
  rejectedUnits: number
  reworkUnits: number
  attendancePct: number
  oeePct: number
  /** Each gate, and whether this person cleared it. */
  outputGateMet: boolean
  attendanceGateMet: boolean
  qualityGateMet: boolean
  oeeGateMet: boolean
  grossIncentive: number
  earnedIncentive: number
  disqualifiedReason: string | null
  status: 'CALCULATED' | 'APPROVED' | 'PAID' | 'DISQUALIFIED'
}

/* ═══════════════════════ Labour cost allocation ═════════════════════════ */

export interface LabourCostLine {
  uid: string
  deletedAt?: string | null
  period: string
  employeeCode: string
  employeeName: string
  department: string
  costCentre: string
  /** What the hours were booked against. */
  productionOrderNo: string | null
  workOrderNo: string | null
  batchNo: string | null
  itemCode: string | null
  itemName: string | null
  machine: string | null
  regularHours: number
  overtimeHours: number
  idleHours: number
  hourlyRate: number
  overtimeRate: number
  regularCost: number
  overtimeCost: number
  incentiveCost: number
  totalCost: number
  unitsProduced: number
  costPerUnit: number
  allocation: 'PRODUCTION_ORDER' | 'WORK_ORDER' | 'COST_CENTRE' | 'INDIRECT'
  postedToFinance: boolean
  journalNo: string | null
}

/* ═════════════════════════ Performance & learning ═══════════════════════ */

export interface Kpi {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  appliesToRole: string
  category: 'OUTPUT' | 'QUALITY' | 'ATTENDANCE' | 'SAFETY' | 'COST' | 'DELIVERY' | 'PEOPLE'
  unit: string
  target: number
  weightPct: number
  /** Higher is better for output; lower is better for scrap. */
  direction: 'HIGHER_BETTER' | 'LOWER_BETTER'
  dataSource: string
  isActive: boolean
}

export type AppraisalStage = 'GOAL_SETTING' | 'MID_YEAR' | 'SELF_APPRAISAL' | 'MANAGER_REVIEW' | 'HR_REVIEW' | 'FINALISED'

export interface Appraisal {
  uid: string
  deletedAt?: string | null
  docNo: string
  cycle: string
  employeeCode: string
  employeeName: string
  designation: string
  department: string
  reviewer: string
  stage: AppraisalStage
  goals: { kpiCode: string; kpiName: string; target: number; actual: number | null; weightPct: number; score: number | null }[]
  selfRating: number | null
  managerRating: number | null
  hrRating: number | null
  finalRating: number | null
  ratingBand: 'OUTSTANDING' | 'EXCEEDS' | 'MEETS' | 'PARTIALLY_MEETS' | 'BELOW' | null
  incrementPct: number | null
  promotionRecommended: boolean
  recommendedDesignation: string | null
  managerRemarks: string | null
  employeeRemarks: string | null
  finalisedOn: string | null
}

export interface TrainingProgramme {
  uid: string
  deletedAt?: string | null
  code: string
  title: string
  category: 'MACHINE' | 'SAFETY' | 'QUALITY' | 'PROCESS' | 'STATUTORY' | 'BEHAVIOURAL' | 'INDUCTION'
  mode: 'INTERNAL' | 'EXTERNAL' | 'ON_THE_JOB' | 'ONLINE'
  trainer: string
  durationHours: number
  scheduledOn: string
  venue: string
  targetDepartment: string
  seats: number
  enrolled: number
  attended: number
  /** Safety and statutory training expires and has to be redone. */
  certificationValidMonths: number | null
  passMarkPct: number
  costPerHead: number
  status: 'PLANNED' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
}

export interface TrainingRecord {
  uid: string
  deletedAt?: string | null
  programmeCode: string
  programmeTitle: string
  employeeCode: string
  employeeName: string
  department: string
  attendedOn: string | null
  hoursAttended: number
  assessmentScore: number | null
  passed: boolean | null
  certificateNo: string | null
  certificationExpiresOn: string | null
  /** Did the training actually change the number it was meant to change? */
  effectivenessReviewedOn: string | null
  effectivenessRating: 'NOT_REVIEWED' | 'NO_CHANGE' | 'IMPROVED' | 'SIGNIFICANT' | null
  status: 'ENROLLED' | 'ATTENDED' | 'PASSED' | 'FAILED' | 'ABSENT' | 'EXPIRED'
}

/* ═══════════════════════════ Skill matrix ═══════════════════════════════ */

export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'SKILLED' | 'EXPERT' | 'TRAINER'

export interface SkillDefinition {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  category: 'MACHINE' | 'PROCESS' | 'QUALITY' | 'HANDLING' | 'SAFETY'
  workCentre: string | null
  /** Below this level a person may not be rostered onto the operation alone. */
  minLevelToOperate: SkillLevel
  requiresCertification: boolean
  certificationValidMonths: number | null
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  requiredHeadcount: number
  isActive: boolean
}

export interface EmployeeSkill {
  uid: string
  deletedAt?: string | null
  employeeCode: string
  employeeName: string
  department: string
  skillCode: string
  skillName: string
  level: SkillLevel
  certifiedOn: string | null
  certificationExpiresOn: string | null
  assessedBy: string | null
  /** Productivity actually observed on this operation. */
  unitsPerHour: number | null
  defectRatePct: number | null
  lastOperatedOn: string | null
  status: 'CERTIFIED' | 'EXPIRING' | 'EXPIRED' | 'IN_TRAINING' | 'NOT_CERTIFIED'
}

/* ════════════════════════ Contractor labour ═════════════════════════════ */

export interface Contractor {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  contactPerson: string
  mobile: string
  gstin: string
  licenceNo: string
  licenceExpiresOn: string
  pfRegistrationNo: string
  esiRegistrationNo: string
  workScope: string
  rateBasis: 'DAILY_WAGE' | 'PIECE_RATE' | 'MONTHLY' | 'HOURLY'
  agreedRate: number
  /** Compliance the principal employer is liable for if the contractor lapses. */
  pfCompliant: boolean
  esiCompliant: boolean
  wagesCompliant: boolean
  lastComplianceCheckOn: string | null
  headcountDeployed: number
  isActive: boolean
}

export interface ContractorLabourDay {
  uid: string
  deletedAt?: string | null
  attendanceDate: string
  contractorCode: string
  contractorName: string
  labourName: string
  labourId: string
  department: string
  workCentre: string | null
  shiftCode: string
  hoursWorked: number
  unitsProduced: number
  rateBasis: 'DAILY_WAGE' | 'PIECE_RATE' | 'HOURLY'
  rate: number
  amount: number
  certifiedBy: string | null
  status: 'RECORDED' | 'CERTIFIED' | 'BILLED' | 'DISPUTED'
}

export interface ContractorBill {
  uid: string
  deletedAt?: string | null
  docNo: string
  contractorCode: string
  contractorName: string
  period: string
  labourDays: number
  totalHours: number
  unitsProduced: number
  grossAmount: number
  pfDeduction: number
  esiDeduction: number
  otherDeduction: number
  netPayable: number
  submittedOn: string
  certifiedBy: string | null
  approvedBy: string | null
  /** A bill cannot be passed while the contractor's compliance is open. */
  complianceVerified: boolean
  status: 'SUBMITTED' | 'CERTIFIED' | 'APPROVED' | 'PAID' | 'ON_HOLD' | 'REJECTED'
  holdReason: string | null
}

/* ══════════════════════ Statutory compliance ════════════════════════════ */

export interface StatutoryReturn {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  act: string
  authority: string
  period: string
  frequency: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL'
  dueOn: string
  employeeCount: number
  amountPayable: number
  challanNo: string | null
  paidOn: string | null
  filedOn: string | null
  acknowledgementNo: string | null
  preparedBy: string | null
  status: 'NOT_DUE' | 'PENDING' | 'PREPARED' | 'PAID' | 'FILED' | 'OVERDUE'
  remarks?: string
}

/* ══════════════════════════ Chart series ════════════════════════════════ */

export interface HeadcountPoint {
  department: string
  permanent: number
  contract: number
  trainee: number
  sanctioned: number
}

export interface AttendanceTrendPoint {
  day: string
  present: number
  absent: number
  onLeave: number
  overtimeHours: number
}

export interface PayrollTrendPoint {
  period: string
  gross: number
  overtime: number
  incentive: number
  headcount: number
}

export interface AttritionPoint {
  month: string
  joined: number
  exited: number
  attritionPct: number
}

export interface ProductivityPoint {
  period: string
  unitsPerOperator: number
  unitsPerLabourHour: number
  labourCostPerBottle: number
  operatorEfficiencyPct: number
}
