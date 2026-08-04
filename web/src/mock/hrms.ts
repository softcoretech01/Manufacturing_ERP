/**
 * HR, payroll and workforce demonstration data — the same Chennai bottle plant.
 *
 * The numbers tie together deliberately: a payslip's net pay is its gross less
 * its deductions, the payroll run's totals are the sum of its payslips, an
 * incentive is zero wherever a gate failed, and the labour cost lines add up to
 * the payroll they came from. Anything that did not reconcile would teach the
 * wrong thing about how the module is supposed to behave.
 */

import { daysAgo, daysAhead } from './data'
import type {
  Appraisal,
  AttendanceRecord,
  AttendanceTrendPoint,
  AttritionPoint,
  Candidate,
  Contractor,
  ContractorBill,
  ContractorLabourDay,
  EmployeeSkill,
  HeadcountPoint,
  HrEmployee,
  IncentiveEarning,
  IncentiveScheme,
  Kpi,
  LabourCostLine,
  LeaveBalance,
  LeavePolicy,
  LeaveRequest,
  ManpowerRequisition,
  OrgNode,
  OvertimeRecord,
  PayrollRun,
  PayrollTrendPoint,
  Payslip,
  ProductivityPoint,
  RosterEntry,
  SalaryComponent,
  SalaryStructure,
  Shift,
  SkillDefinition,
  StatutoryReturn,
  TrainingProgramme,
  TrainingRecord,
} from '@/types/hrms'

const d = (n: number) => daysAgo(n).slice(0, 10)
const fwd = (n: number) => daysAhead(n).slice(0, 10)
const at = (n: number, h: number) => daysAgo(n, h)

export const PERIOD = '2026-07'
export const PERIOD_LABEL = 'July 2026'

/* ═══════════════════════ Organisation structure ══════════════════════════ */

export const orgNodes: OrgNode[] = [
  { uid: 'org-01', code: 'SSB', name: 'SSB Industries Private Limited', level: 'COMPANY', parentCode: null, costCentre: 'CC-CORP', headEmployeeCode: null, headName: 'Managing Director', sanctionedHeadcount: 260, actualHeadcount: 238, isActive: true },
  { uid: 'org-02', code: 'MFG', name: 'Manufacturing Division', level: 'DIVISION', parentCode: 'SSB', costCentre: 'CC-MFG', headEmployeeCode: 'EMP-0001', headName: 'Meera Rajan', sanctionedHeadcount: 210, actualHeadcount: 194, isActive: true },
  { uid: 'org-03', code: 'PLANT-1', name: 'Chennai — Unit 1', level: 'PLANT', parentCode: 'MFG', costCentre: 'CC-PL1', headEmployeeCode: 'EMP-0001', headName: 'Meera Rajan', sanctionedHeadcount: 168, actualHeadcount: 156, isActive: true },
  { uid: 'org-04', code: 'PLANT-2', name: 'Chennai — Unit 2 (Coating)', level: 'PLANT', parentCode: 'MFG', costCentre: 'CC-PL2', headEmployeeCode: null, headName: 'Vacant', sanctionedHeadcount: 42, actualHeadcount: 38, isActive: true },
  { uid: 'org-05', code: 'DEPT-PRESS', name: 'Press Shop', level: 'DEPARTMENT', parentCode: 'PLANT-1', costCentre: 'CC-PROD', headEmployeeCode: 'EMP-0009', headName: 'Prakash Menon', sanctionedHeadcount: 48, actualHeadcount: 44, isActive: true },
  { uid: 'org-06', code: 'DEPT-WELD', name: 'Welding & Vacuum', level: 'DEPARTMENT', parentCode: 'PLANT-1', costCentre: 'CC-PROD', headEmployeeCode: 'EMP-0004', headName: 'Karthik Subramanian', sanctionedHeadcount: 36, actualHeadcount: 32, isActive: true },
  { uid: 'org-07', code: 'DEPT-FINISH', name: 'Polishing & Finishing', level: 'DEPARTMENT', parentCode: 'PLANT-1', costCentre: 'CC-PROD', headEmployeeCode: null, headName: 'Vacant', sanctionedHeadcount: 30, actualHeadcount: 26, isActive: true },
  { uid: 'org-08', code: 'DEPT-QC', name: 'Quality Control', level: 'DEPARTMENT', parentCode: 'PLANT-1', costCentre: 'CC-QC', headEmployeeCode: 'EMP-0005', headName: 'Lakshmi Narayanan', sanctionedHeadcount: 18, actualHeadcount: 17, isActive: true },
  { uid: 'org-09', code: 'DEPT-MAINT', name: 'Maintenance', level: 'DEPARTMENT', parentCode: 'PLANT-1', costCentre: 'CC-MAINT', headEmployeeCode: 'EMP-0006', headName: 'Suresh Babu', sanctionedHeadcount: 14, actualHeadcount: 12, isActive: true },
  { uid: 'org-10', code: 'DEPT-STORE', name: 'Stores & Dispatch', level: 'DEPARTMENT', parentCode: 'PLANT-1', costCentre: 'CC-STORE', headEmployeeCode: 'EMP-0007', headName: 'Divya Sundaram', sanctionedHeadcount: 22, actualHeadcount: 20, isActive: true },
  { uid: 'org-11', code: 'SEC-DRAW', name: 'Deep Drawing Section', level: 'SECTION', parentCode: 'DEPT-PRESS', costCentre: 'CC-PROD', headEmployeeCode: 'EMP-0009', headName: 'Prakash Menon', sanctionedHeadcount: 24, actualHeadcount: 22, isActive: true },
  { uid: 'org-12', code: 'LINE-1', name: 'Line 1 — 750 ml', level: 'LINE', parentCode: 'SEC-DRAW', costCentre: 'CC-PROD', headEmployeeCode: null, headName: 'Shift supervisor', sanctionedHeadcount: 12, actualHeadcount: 11, isActive: true },
  { uid: 'org-13', code: 'LINE-2', name: 'Line 2 — 500/1000 ml', level: 'LINE', parentCode: 'SEC-DRAW', costCentre: 'CC-PROD', headEmployeeCode: null, headName: 'Shift supervisor', sanctionedHeadcount: 12, actualHeadcount: 11, isActive: true },
  { uid: 'org-14', code: 'DEPT-HR', name: 'HR & Administration', level: 'DEPARTMENT', parentCode: 'SSB', costCentre: 'CC-ADMIN', headEmployeeCode: null, headName: 'Vacant', sanctionedHeadcount: 8, actualHeadcount: 7, isActive: true },
  { uid: 'org-15', code: 'DEPT-PROC', name: 'Procurement', level: 'DEPARTMENT', parentCode: 'SSB', costCentre: 'CC-ADMIN', headEmployeeCode: 'EMP-0002', headName: 'Anand Krishnan', sanctionedHeadcount: 6, actualHeadcount: 6, isActive: true },
]

/* ═════════════════════════ Employees ════════════════════════════════════ */

type EmpDef = [
  string, string, string, string, string, string, HrEmployee['employmentType'],
  number, boolean, string, number, HrEmployee['status'],
]

/** code, name, designation, department, grade, shift, type, joinedDaysAgo, shopFloor, workCentre, ctc, status */
const EMP_DEFS: EmpDef[] = [
  ['EMP-0001', 'Meera Rajan', 'Plant Head', 'Production', 'M4', 'SH-GEN', 'PERMANENT', 2_180, false, '', 210_000, 'ACTIVE'],
  ['EMP-0002', 'Anand Krishnan', 'Purchase Manager', 'Procurement', 'M3', 'SH-GEN', 'PERMANENT', 1_640, false, '', 132_000, 'ACTIVE'],
  ['EMP-0003', 'Rahul Iyer', 'Design Engineer', 'Engineering', 'E3', 'SH-GEN', 'PERMANENT', 980, false, '', 86_000, 'ACTIVE'],
  ['EMP-0004', 'Karthik Subramanian', 'Line Operator', 'Welding & Vacuum', 'W2', 'SH-A', 'PERMANENT', 1_320, true, 'Welding & Vacuum', 32_400, 'ACTIVE'],
  ['EMP-0005', 'Lakshmi Narayanan', 'Quality Inspector', 'Quality Control', 'S2', 'SH-A', 'PERMANENT', 860, true, 'Final Inspection', 38_600, 'ACTIVE'],
  ['EMP-0006', 'Suresh Babu', 'Maintenance Technician', 'Maintenance', 'S3', 'SH-GEN', 'PERMANENT', 1_460, true, 'Maintenance', 41_200, 'ACTIVE'],
  ['EMP-0007', 'Divya Sundaram', 'Store Keeper', 'Stores & Dispatch', 'S1', 'SH-GEN', 'PERMANENT', 720, false, '', 28_800, 'ACTIVE'],
  ['EMP-0008', 'Vignesh Kumar', 'Sales Executive', 'Sales', 'E2', 'SH-GEN', 'PERMANENT', 540, false, '', 52_000, 'ACTIVE'],
  ['EMP-0009', 'Prakash Menon', 'Press Operator', 'Press Shop', 'W3', 'SH-A', 'PERMANENT', 2_010, true, 'Press Shop', 36_800, 'ACTIVE'],
  ['EMP-0010', 'Sneha Patel', 'Trainee Engineer', 'Quality Control', 'T1', 'SH-GEN', 'TRAINEE', 96, false, '', 22_000, 'PROBATION'],
  ['EMP-0011', 'T. Ganesh', 'Press Operator', 'Press Shop', 'W2', 'SH-B', 'PERMANENT', 1_180, true, 'Press Shop', 31_600, 'ACTIVE'],
  ['EMP-0012', 'N. Selvam', 'Press Operator', 'Press Shop', 'W2', 'SH-B', 'PERMANENT', 640, true, 'Press Shop', 29_400, 'ACTIVE'],
  ['EMP-0013', 'J. Mohan', 'Welder', 'Welding & Vacuum', 'W3', 'SH-A', 'PERMANENT', 1_540, true, 'Welding & Vacuum', 34_200, 'ACTIVE'],
  ['EMP-0014', 'Anand P', 'Vacuum Operator', 'Welding & Vacuum', 'W2', 'SH-C', 'PERMANENT', 420, true, 'Welding & Vacuum', 28_600, 'ACTIVE'],
  ['EMP-0015', 'M. Priya', 'Packing Operator', 'Stores & Dispatch', 'W1', 'SH-A', 'PERMANENT', 380, true, 'Packing', 24_800, 'ACTIVE'],
  ['EMP-0016', 'V. Suresh', 'Packing Operator', 'Stores & Dispatch', 'W1', 'SH-B', 'CONTRACT', 210, true, 'Packing', 22_400, 'ACTIVE'],
  ['EMP-0017', 'S. Kumar', 'Coil Cutting Operator', 'Press Shop', 'W2', 'SH-A', 'PERMANENT', 890, true, 'Coil Cutting', 30_200, 'ACTIVE'],
  ['EMP-0018', 'R. Vasanth', 'Packing Supervisor', 'Stores & Dispatch', 'S2', 'SH-A', 'PERMANENT', 1_260, false, '', 44_600, 'ACTIVE'],
  ['EMP-0019', 'K. Latha', 'Packing Supervisor', 'Stores & Dispatch', 'S2', 'SH-B', 'PERMANENT', 760, false, '', 42_100, 'ACTIVE'],
  ['EMP-0020', 'P. Elango', 'Driver', 'Stores & Dispatch', 'W1', 'SH-GEN', 'CONTRACT', 140, false, '', 21_600, 'NOTICE'],
]

export const hrEmployees: HrEmployee[] = EMP_DEFS.map(
  ([code, name, designation, department, grade, shiftCode, employmentType, joinedAgo, isShopFloor, workCentre, ctc, status], i) => ({
    uid: `hre-${String(i + 1).padStart(2, '0')}`,
    employeeCode: code,
    fullName: name,
    designation,
    department,
    section: isShopFloor ? (workCentre || null) : null,
    grade,
    employmentType,
    reportsTo: i === 0 ? 'Managing Director' : department === 'Press Shop' ? 'Prakash Menon' : department === 'Welding & Vacuum' ? 'Karthik Subramanian' : 'Meera Rajan',
    dateOfJoining: d(joinedAgo),
    confirmationDueOn: employmentType === 'TRAINEE' || status === 'PROBATION' ? fwd(180 - joinedAgo) : null,
    contractEndOn: employmentType === 'CONTRACT' ? fwd(365 - joinedAgo) : null,
    dateOfBirth: d(joinedAgo + 8_400 + i * 120),
    gender: ['Meera Rajan', 'Lakshmi Narayanan', 'Divya Sundaram', 'Sneha Patel', 'M. Priya', 'K. Latha'].includes(name) ? 'F' : 'M',
    mobile: `+91 9${String(84000000 + i * 111_111).slice(0, 9)}`,
    email: `${name.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '')}@ssbindustries.co.in`,
    emergencyContact: `+91 9${String(76000000 + i * 121_212).slice(0, 9)}`,
    plant: department === 'Sales' || department === 'Procurement' ? 'Head Office' : 'Chennai — Unit 1',
    costCentre: isShopFloor ? 'CC-PROD' : department === 'Quality Control' ? 'CC-QC' : department === 'Maintenance' ? 'CC-MAINT' : 'CC-ADMIN',
    workCentre: workCentre || null,
    productionLine: isShopFloor ? (i % 2 === 0 ? 'Line 1' : 'Line 2') : null,
    shiftCode,
    isShopFloor,
    pfNumber: employmentType === 'CONSULTANT' ? null : `TN/MAS/${44_120 + i}`,
    esiNumber: ctc <= 21_000 ? `31-00-${102_400 + i}` : null,
    uanNumber: `1012${String(40_118_820 + i * 7)}`,
    panMasked: `${['ABCPK', 'BXTPR', 'CQRPM', 'DLMPS'][i % 4]}••••${String(1_200 + i).slice(-4)}${['K', 'L', 'M', 'N'][i % 4]}`,
    aadhaarMasked: `XXXX XXXX ${String(1_040 + i * 7).slice(-4)}`,
    bankAccountMasked: `••••••${String(4_400 + i * 13).slice(-4)}`,
    bankName: i % 3 === 0 ? 'State Bank of India' : i % 3 === 1 ? 'HDFC Bank' : 'Indian Bank',
    taxRegime: ctc > 60_000 ? 'OLD' : 'NEW',
    salaryStructureCode: isShopFloor ? 'SS-WORKMAN' : ctc >= 100_000 ? 'SS-MGMT' : employmentType === 'TRAINEE' ? 'SS-TRAINEE' : 'SS-STAFF',
    monthlyCtc: ctc,
    status,
    exitDate: status === 'NOTICE' ? fwd(24) : null,
    exitReason: status === 'NOTICE' ? 'Resigned — joining a logistics firm closer to home' : null,
  }),
)

/* ══════════════════════════ Recruitment ═════════════════════════════════ */

export const requisitions: ManpowerRequisition[] = [
  { uid: 'mrq-01', docNo: 'MRQ/2627/0041', raisedOn: d(18), department: 'Polishing & Finishing', designation: 'Polishing Operator', grade: 'W2', employmentType: 'PERMANENT', positions: 4, filledPositions: 1, reason: 'EXPANSION', replacingEmployeeCode: null, justification: 'Second polishing line commissioned in June; the existing crew is running 14 hours a day to cover it.', requiredBy: fwd(20), budgetedCtc: 29_000, raisedBy: 'Meera Rajan', approvedBy: 'Managing Director', status: 'IN_PROGRESS' },
  { uid: 'mrq-02', docNo: 'MRQ/2627/0044', raisedOn: d(9), department: 'Stores & Dispatch', designation: 'Driver', grade: 'W1', employmentType: 'CONTRACT', positions: 1, filledPositions: 0, reason: 'REPLACEMENT', replacingEmployeeCode: 'EMP-0020', justification: 'P. Elango is on notice and leaves in three weeks. Own-fleet deliveries stop without a driver.', requiredBy: fwd(18), budgetedCtc: 22_000, raisedBy: 'Divya Sundaram', approvedBy: 'Meera Rajan', status: 'POSTED' },
  { uid: 'mrq-03', docNo: 'MRQ/2627/0046', raisedOn: d(4), department: 'Quality Control', designation: 'Quality Inspector', grade: 'S2', employmentType: 'PERMANENT', positions: 1, filledPositions: 0, reason: 'SKILL_GAP', replacingEmployeeCode: null, justification: 'No certified leak-test inspector on C shift; night output is held until morning for inspection.', requiredBy: fwd(30), budgetedCtc: 37_000, raisedBy: 'Lakshmi Narayanan', approvedBy: null, status: 'PENDING_APPROVAL' },
  { uid: 'mrq-04', docNo: 'MRQ/2627/0047', raisedOn: d(2), department: 'Maintenance', designation: 'Maintenance Technician', grade: 'S3', employmentType: 'PERMANENT', positions: 2, filledPositions: 0, reason: 'EXPANSION', replacingEmployeeCode: null, justification: 'Preventive maintenance compliance is 61% against a target of 95% — the crew cannot cover both plants.', requiredBy: fwd(45), budgetedCtc: 40_000, raisedBy: 'Suresh Babu', approvedBy: null, status: 'DRAFT' },
  { uid: 'mrq-05', docNo: 'MRQ/2627/0036', raisedOn: d(64), department: 'Press Shop', designation: 'Press Operator', grade: 'W2', employmentType: 'PERMANENT', positions: 2, filledPositions: 2, reason: 'REPLACEMENT', replacingEmployeeCode: null, justification: 'Two operators left in April.', requiredBy: d(20), budgetedCtc: 30_000, raisedBy: 'Prakash Menon', approvedBy: 'Meera Rajan', status: 'CLOSED' },
]

export const candidates: Candidate[] = [
  { uid: 'cnd-01', candidateNo: 'CND/2627/0188', fullName: 'R. Muthukumar', requisitionNo: 'MRQ/2627/0041', designation: 'Polishing Operator', department: 'Polishing & Finishing', source: 'REFERRAL', appliedOn: d(15), experienceYears: 4, currentCtc: 26_000, expectedCtc: 31_000, offeredCtc: 29_500, mobile: '+91 98404 11220', email: 'muthukumar.r@example.in', stage: 'JOINED', interviewScore: 78, practicalScore: 86, panelRemarks: 'Strong on buffing wheel setup. Referred by J. Mohan.', offerIssuedOn: d(9), joiningDate: d(2), rejectionReason: null },
  { uid: 'cnd-02', candidateNo: 'CND/2627/0192', fullName: 'S. Arivazhagan', requisitionNo: 'MRQ/2627/0041', designation: 'Polishing Operator', department: 'Polishing & Finishing', source: 'WALK_IN', appliedOn: d(12), experienceYears: 2, currentCtc: 21_000, expectedCtc: 28_000, offeredCtc: 27_000, mobile: '+91 90031 44218', email: 'arivazhagan.s@example.in', stage: 'OFFER_ACCEPTED', interviewScore: 71, practicalScore: 74, panelRemarks: 'Adequate. Will need two weeks alongside a trainer before running solo.', offerIssuedOn: d(3), joiningDate: fwd(6), rejectionReason: null },
  { uid: 'cnd-03', candidateNo: 'CND/2627/0195', fullName: 'K. Bhuvaneshwari', requisitionNo: 'MRQ/2627/0046', designation: 'Quality Inspector', department: 'Quality Control', source: 'JOB_PORTAL', appliedOn: d(6), experienceYears: 6, currentCtc: 34_000, expectedCtc: 42_000, offeredCtc: null, mobile: '+91 99401 20114', email: 'bhuvana.k@example.in', stage: 'INTERVIEW_2', interviewScore: 84, practicalScore: null, panelRemarks: 'Six years on vacuum flask leak testing. Second round with the Plant Head pending.', offerIssuedOn: null, joiningDate: null, rejectionReason: null },
  { uid: 'cnd-04', candidateNo: 'CND/2627/0196', fullName: 'A. Dinesh', requisitionNo: 'MRQ/2627/0044', designation: 'Driver', department: 'Stores & Dispatch', source: 'CONSULTANT', appliedOn: d(5), experienceYears: 8, currentCtc: 20_000, expectedCtc: 24_000, offeredCtc: null, mobile: '+91 94441 88206', email: 'dinesh.a@example.in', stage: 'SCREENING', interviewScore: null, practicalScore: null, panelRemarks: null, offerIssuedOn: null, joiningDate: null, rejectionReason: null },
  { uid: 'cnd-05', candidateNo: 'CND/2627/0190', fullName: 'M. Rajkumar', requisitionNo: 'MRQ/2627/0041', designation: 'Polishing Operator', department: 'Polishing & Finishing', source: 'WALK_IN', appliedOn: d(14), experienceYears: 1, currentCtc: 18_000, expectedCtc: 26_000, offeredCtc: null, mobile: '+91 89392 40118', email: 'rajkumar.m@example.in', stage: 'REJECTED', interviewScore: 52, practicalScore: 44, panelRemarks: 'Practical test below the pass mark — surface finish outside tolerance on all three samples.', offerIssuedOn: null, joiningDate: null, rejectionReason: 'Practical test score 44 against a pass mark of 60' },
  { uid: 'cnd-06', candidateNo: 'CND/2627/0186', fullName: 'P. Yogeshwari', requisitionNo: 'MRQ/2627/0046', designation: 'Quality Inspector', department: 'Quality Control', source: 'CAMPUS', appliedOn: d(20), experienceYears: 0, currentCtc: null, expectedCtc: 24_000, offeredCtc: 23_000, mobile: '+91 73580 11492', email: 'yogeshwari.p@example.in', stage: 'DECLINED', interviewScore: 76, practicalScore: 68, panelRemarks: 'Good fundamentals. Declined — accepted a Bengaluru offer.', offerIssuedOn: d(11), joiningDate: null, rejectionReason: 'Candidate declined the offer' },
]

/* ═════════════════════════ Shifts & roster ══════════════════════════════ */

export const shifts: Shift[] = [
  { uid: 'shf-01', code: 'SH-GEN', name: 'General', shiftType: 'GENERAL', startTime: '09:00', endTime: '17:30', breakMinutes: 45, graceMinutes: 15, halfDayMinutes: 240, fullDayMinutes: 465, nightAllowance: 0, shiftAllowance: 0, weeklyOffDays: ['Sunday'], isRotational: false, rotationCycleDays: 0, headcount: 42, isActive: true },
  { uid: 'shf-02', code: 'SH-A', name: 'A — Morning', shiftType: 'MORNING', startTime: '06:00', endTime: '14:00', breakMinutes: 30, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, nightAllowance: 0, shiftAllowance: 600, weeklyOffDays: ['Sunday'], isRotational: true, rotationCycleDays: 7, headcount: 68, isActive: true },
  { uid: 'shf-03', code: 'SH-B', name: 'B — Evening', shiftType: 'EVENING', startTime: '14:00', endTime: '22:00', breakMinutes: 30, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, nightAllowance: 0, shiftAllowance: 900, weeklyOffDays: ['Sunday'], isRotational: true, rotationCycleDays: 7, headcount: 61, isActive: true },
  { uid: 'shf-04', code: 'SH-C', name: 'C — Night', shiftType: 'NIGHT', startTime: '22:00', endTime: '06:00', breakMinutes: 30, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, nightAllowance: 250, shiftAllowance: 1_400, weeklyOffDays: ['Sunday'], isRotational: true, rotationCycleDays: 7, headcount: 44, isActive: true },
  { uid: 'shf-05', code: 'SH-SPLIT', name: 'Split — Stores', shiftType: 'SPLIT', startTime: '07:00', endTime: '19:00', breakMinutes: 180, graceMinutes: 15, halfDayMinutes: 240, fullDayMinutes: 480, nightAllowance: 0, shiftAllowance: 400, weeklyOffDays: ['Sunday'], isRotational: false, rotationCycleDays: 0, headcount: 8, isActive: true },
  { uid: 'shf-06', code: 'SH-OLD', name: 'B — Evening (old timing)', shiftType: 'EVENING', startTime: '15:00', endTime: '23:00', breakMinutes: 30, graceMinutes: 5, halfDayMinutes: 240, fullDayMinutes: 450, nightAllowance: 0, shiftAllowance: 750, weeklyOffDays: ['Sunday'], isRotational: false, rotationCycleDays: 0, headcount: 0, isActive: false },
]

const SHIFT_BY_CODE = Object.fromEntries(shifts.map((s) => [s.code, s]))

export const roster: RosterEntry[] = hrEmployees
  .filter((e) => e.status === 'ACTIVE' || e.status === 'PROBATION')
  .flatMap((e, ei) =>
    [0, 1, 2].map((offset) => ({
      uid: `ros-${ei}-${offset}`,
      rosterDate: fwd(offset),
      employeeCode: e.employeeCode,
      employeeName: e.fullName,
      department: e.department,
      // Rotational crews step forward one shift each week.
      shiftCode: e.isShopFloor && offset === 2 && e.shiftCode !== 'SH-GEN'
        ? e.shiftCode === 'SH-A' ? 'SH-B' : e.shiftCode === 'SH-B' ? 'SH-C' : 'SH-A'
        : e.shiftCode,
      workCentre: e.workCentre,
      swapWithEmployeeCode: ei === 3 && offset === 1 ? 'EMP-0013' : null,
      swapStatus: ei === 3 && offset === 1 ? ('REQUESTED' as const) : ('NONE' as const),
      isWeeklyOff: false,
      isHoliday: false,
      status: offset === 0 ? ('CONFIRMED' as const) : ei === 3 && offset === 1 ? ('CHANGED' as const) : ('PLANNED' as const),
    })),
  )

/* ══════════════════════════ Attendance ═════════════════════════════════ */

/** in/out offsets in minutes against the shift, plus a status override. */
type AttDef = [number, number | null, AttendanceRecord['status']]

const ATT_TODAY: Record<string, AttDef> = {
  'EMP-0001': [-12, 0, 'PRESENT'],
  'EMP-0002': [4, 0, 'PRESENT'],
  'EMP-0003': [38, 0, 'LATE'],
  'EMP-0004': [-8, 96, 'PRESENT'],
  'EMP-0005': [-4, 0, 'PRESENT'],
  'EMP-0006': [-15, 132, 'PRESENT'],
  'EMP-0007': [2, 0, 'PRESENT'],
  'EMP-0008': [0, 0, 'ON_LEAVE'],
  'EMP-0009': [-6, 108, 'PRESENT'],
  'EMP-0010': [26, 0, 'LATE'],
  'EMP-0011': [-3, 0, 'PRESENT'],
  'EMP-0012': [0, 0, 'ABSENT'],
  'EMP-0013': [-10, 84, 'PRESENT'],
  'EMP-0014': [-5, 0, 'PRESENT'],
  'EMP-0015': [-2, 60, 'PRESENT'],
  'EMP-0016': [1, null, 'MISSED_PUNCH'],
  'EMP-0017': [-7, 0, 'PRESENT'],
  'EMP-0018': [-20, 48, 'PRESENT'],
  'EMP-0019': [-9, 0, 'PRESENT'],
  'EMP-0020': [0, 0, 'ON_LEAVE'],
}

const addMinutes = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h * 60 + m + mins + 1_440) % 1_440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const attendance: AttendanceRecord[] = hrEmployees.map((e, i) => {
  const shift = SHIFT_BY_CODE[e.shiftCode] ?? SHIFT_BY_CODE['SH-GEN']
  const [inOffset, outOffset, status] = ATT_TODAY[e.employeeCode] ?? [0, 0, 'PRESENT']
  const present = status !== 'ABSENT' && status !== 'ON_LEAVE'
  const late = Math.max(0, inOffset - shift.graceMinutes)
  const ot = outOffset && outOffset > 0 ? outOffset : 0
  const worked = present ? shift.fullDayMinutes - Math.max(0, late) + ot : 0

  return {
    uid: `att-${String(i + 1).padStart(3, '0')}`,
    attendanceDate: d(0),
    employeeCode: e.employeeCode,
    employeeName: e.fullName,
    department: e.department,
    shiftCode: e.shiftCode,
    shiftName: shift.name,
    shiftStart: shift.startTime,
    shiftEnd: shift.endTime,
    inTime: present ? addMinutes(shift.startTime, inOffset) : null,
    outTime: present && outOffset !== null ? addMinutes(shift.endTime, outOffset) : null,
    inSource: present ? (e.isShopFloor ? 'FINGERPRINT' : i % 4 === 0 ? 'FACE' : 'RFID') : null,
    outSource: present && outOffset !== null ? (e.isShopFloor ? 'FINGERPRINT' : 'RFID') : null,
    breakMinutes: present ? shift.breakMinutes : 0,
    workedMinutes: worked,
    lateMinutes: late,
    earlyExitMinutes: 0,
    overtimeMinutes: ot,
    status,
    regularised: false,
    regularisedBy: null,
    regularisationReason: null,
    isShopFloor: e.isShopFloor,
    workCentre: e.workCentre,
  }
})

export const attendanceTrend: AttendanceTrendPoint[] = [
  { day: 'Mon', present: 224, absent: 8, onLeave: 6, overtimeHours: 62 },
  { day: 'Tue', present: 228, absent: 5, onLeave: 5, overtimeHours: 74 },
  { day: 'Wed', present: 219, absent: 12, onLeave: 7, overtimeHours: 88 },
  { day: 'Thu', present: 231, absent: 4, onLeave: 3, overtimeHours: 56 },
  { day: 'Fri', present: 226, absent: 7, onLeave: 5, overtimeHours: 71 },
  { day: 'Sat', present: 198, absent: 14, onLeave: 26, overtimeHours: 104 },
  { day: 'Today', present: 216, absent: 11, onLeave: 11, overtimeHours: 48 },
]

/* ═══════════════════════════ Overtime ══════════════════════════════════ */

export const overtime: OvertimeRecord[] = [
  { uid: 'ot-01', docNo: 'OT/2607/0412', otDate: d(0), employeeCode: 'EMP-0004', employeeName: 'Karthik Subramanian', department: 'Welding & Vacuum', shiftCode: 'SH-A', claimedMinutes: 120, systemMinutes: 96, approvedMinutes: 0, reason: 'Bottom welding backlog on PRD/2607/0121 after the POL-02 breakdown', productionOrderNo: 'PRD/2607/0121', workCentre: 'Welding & Vacuum', rateMultiplier: 2, hourlyRate: 156, amount: 0, requestedBy: 'Karthik Subramanian', approvedBy: null, status: 'REQUESTED' },
  { uid: 'ot-02', docNo: 'OT/2607/0413', otDate: d(0), employeeCode: 'EMP-0009', employeeName: 'Prakash Menon', department: 'Press Shop', shiftCode: 'SH-A', claimedMinutes: 108, systemMinutes: 108, approvedMinutes: 108, reason: 'Deep drawing shortfall against the daily plan', productionOrderNo: 'PRD/2607/0121', workCentre: 'Press Shop', rateMultiplier: 2, hourlyRate: 177, amount: 637, requestedBy: 'Prakash Menon', approvedBy: 'Meera Rajan', status: 'APPROVED' },
  { uid: 'ot-03', docNo: 'OT/2607/0409', otDate: d(1), employeeCode: 'EMP-0013', employeeName: 'J. Mohan', department: 'Welding & Vacuum', shiftCode: 'SH-A', claimedMinutes: 90, systemMinutes: 84, approvedMinutes: 84, reason: 'Weld jig changeover ran past the shift', productionOrderNo: 'PRD/2607/0121', workCentre: 'Welding & Vacuum', rateMultiplier: 2, hourlyRate: 165, amount: 462, requestedBy: 'J. Mohan', approvedBy: 'Karthik Subramanian', status: 'APPROVED' },
  { uid: 'ot-04', docNo: 'OT/2607/0398', otDate: d(4), employeeCode: 'EMP-0006', employeeName: 'Suresh Babu', department: 'Maintenance', shiftCode: 'SH-GEN', claimedMinutes: 180, systemMinutes: 176, approvedMinutes: 176, reason: 'POL-02 spindle bearing replacement — plant was down', productionOrderNo: null, workCentre: 'Maintenance', rateMultiplier: 2, hourlyRate: 198, amount: 1_162, requestedBy: 'Suresh Babu', approvedBy: 'Meera Rajan', status: 'PAID' },
  { uid: 'ot-05', docNo: 'OT/2607/0404', otDate: d(2), employeeCode: 'EMP-0015', employeeName: 'M. Priya', department: 'Stores & Dispatch', shiftCode: 'SH-A', claimedMinutes: 240, systemMinutes: 60, approvedMinutes: 0, reason: 'Carton packing for the Reliance dispatch', productionOrderNo: null, workCentre: 'Packing', rateMultiplier: 2, hourlyRate: 119, amount: 0, requestedBy: 'M. Priya', approvedBy: null, status: 'REJECTED' },
  { uid: 'ot-06', docNo: 'OT/2607/0401', otDate: d(3), employeeCode: 'EMP-0011', employeeName: 'T. Ganesh', department: 'Press Shop', shiftCode: 'SH-B', claimedMinutes: 120, systemMinutes: 120, approvedMinutes: 120, reason: 'Covered an absent operator on B shift', productionOrderNo: 'PRD/2607/0119', workCentre: 'Press Shop', rateMultiplier: 2, hourlyRate: 152, amount: 608, requestedBy: 'T. Ganesh', approvedBy: 'Prakash Menon', status: 'PAID' },
]

/* ════════════════════════════ Leave ═══════════════════════════════════ */

export const leavePolicies: LeavePolicy[] = [
  { uid: 'lp-01', leaveType: 'CASUAL', name: 'Casual leave', annualEntitlement: 12, accrual: 'MONTHLY', carryForwardAllowed: false, maxCarryForward: 0, encashmentAllowed: false, maxEncashment: 0, minNoticeDays: 1, maxConsecutiveDays: 3, requiresDocument: false, documentAfterDays: 0, isPaid: true, appliesTo: ['PERMANENT', 'PROBATION', 'CONTRACT'], isActive: true },
  { uid: 'lp-02', leaveType: 'SICK', name: 'Sick leave', annualEntitlement: 12, accrual: 'MONTHLY', carryForwardAllowed: true, maxCarryForward: 12, encashmentAllowed: false, maxEncashment: 0, minNoticeDays: 0, maxConsecutiveDays: 7, requiresDocument: true, documentAfterDays: 3, isPaid: true, appliesTo: ['PERMANENT', 'PROBATION', 'CONTRACT', 'TRAINEE'], isActive: true },
  { uid: 'lp-03', leaveType: 'EARNED', name: 'Earned leave', annualEntitlement: 18, accrual: 'MONTHLY', carryForwardAllowed: true, maxCarryForward: 45, encashmentAllowed: true, maxEncashment: 15, minNoticeDays: 7, maxConsecutiveDays: 15, requiresDocument: false, documentAfterDays: 0, isPaid: true, appliesTo: ['PERMANENT'], isActive: true },
  { uid: 'lp-04', leaveType: 'MATERNITY', name: 'Maternity leave', annualEntitlement: 182, accrual: 'ON_EVENT', carryForwardAllowed: false, maxCarryForward: 0, encashmentAllowed: false, maxEncashment: 0, minNoticeDays: 30, maxConsecutiveDays: 182, requiresDocument: true, documentAfterDays: 0, isPaid: true, appliesTo: ['PERMANENT', 'PROBATION', 'CONTRACT'], isActive: true },
  { uid: 'lp-05', leaveType: 'PATERNITY', name: 'Paternity leave', annualEntitlement: 5, accrual: 'ON_EVENT', carryForwardAllowed: false, maxCarryForward: 0, encashmentAllowed: false, maxEncashment: 0, minNoticeDays: 7, maxConsecutiveDays: 5, requiresDocument: true, documentAfterDays: 0, isPaid: true, appliesTo: ['PERMANENT'], isActive: true },
  { uid: 'lp-06', leaveType: 'COMP_OFF', name: 'Compensatory off', annualEntitlement: 0, accrual: 'ON_EVENT', carryForwardAllowed: false, maxCarryForward: 0, encashmentAllowed: false, maxEncashment: 0, minNoticeDays: 1, maxConsecutiveDays: 2, requiresDocument: false, documentAfterDays: 0, isPaid: true, appliesTo: ['PERMANENT', 'CONTRACT'], isActive: true },
  { uid: 'lp-07', leaveType: 'LOSS_OF_PAY', name: 'Loss of pay', annualEntitlement: 0, accrual: 'ON_EVENT', carryForwardAllowed: false, maxCarryForward: 0, encashmentAllowed: false, maxEncashment: 0, minNoticeDays: 1, maxConsecutiveDays: 30, requiresDocument: false, documentAfterDays: 0, isPaid: false, appliesTo: ['PERMANENT', 'PROBATION', 'CONTRACT', 'TRAINEE', 'APPRENTICE', 'TEMPORARY'], isActive: true },
]

const LEAVE_TYPES_FOR_BALANCE: LeavePolicy['leaveType'][] = ['CASUAL', 'SICK', 'EARNED', 'COMP_OFF']

export const leaveBalances: LeaveBalance[] = hrEmployees
  .filter((e) => e.status !== 'EXITED')
  .flatMap((e, ei) =>
    LEAVE_TYPES_FOR_BALANCE.map((t) => {
      const policy = leavePolicies.find((p) => p.leaveType === t)!
      const accrued = t === 'COMP_OFF' ? (ei % 4 === 0 ? 2 : 0) : Math.round((policy.annualEntitlement / 12) * 4 * 10) / 10
      const opening = t === 'EARNED' ? 6 + (ei % 5) : t === 'SICK' ? (ei % 3) : 0
      const availed = t === 'CASUAL' ? Math.min(accrued, ei % 4) : t === 'SICK' ? (ei % 2) : t === 'EARNED' ? (ei % 3) : 0
      return {
        employeeCode: e.employeeCode,
        leaveType: t,
        opening,
        accrued,
        availed,
        encashed: 0,
        lapsed: 0,
        closing: Math.round((opening + accrued - availed) * 10) / 10,
      }
    }),
  )

export const leaveRequests: LeaveRequest[] = [
  { uid: 'lv-01', docNo: 'LV/2627/0412', employeeCode: 'EMP-0008', employeeName: 'Vignesh Kumar', department: 'Sales', leaveType: 'CASUAL', fromDate: d(0), toDate: d(0), days: 1, isHalfDay: false, reason: 'Personal work at the sub-registrar office', appliedOn: d(3), contactDuringLeave: '+91 98410 55118', handoverTo: 'Anand Krishnan', documentAttached: false, managerApprovedBy: 'Meera Rajan', managerApprovedOn: d(2), hrApprovedBy: 'HR Desk', hrApprovedOn: d(2), rejectionReason: null, balanceAtApply: 4, status: 'APPROVED' },
  { uid: 'lv-02', docNo: 'LV/2627/0418', employeeCode: 'EMP-0012', employeeName: 'N. Selvam', department: 'Press Shop', leaveType: 'SICK', fromDate: d(0), toDate: fwd(2), days: 3, isHalfDay: false, reason: 'Viral fever — doctor has advised three days rest', appliedOn: d(0), contactDuringLeave: '+91 90032 11440', handoverTo: null, documentAttached: false, managerApprovedBy: null, managerApprovedOn: null, hrApprovedBy: null, hrApprovedOn: null, rejectionReason: null, balanceAtApply: 2, status: 'PENDING_MANAGER' },
  { uid: 'lv-03', docNo: 'LV/2627/0415', employeeCode: 'EMP-0005', employeeName: 'Lakshmi Narayanan', department: 'Quality Control', leaveType: 'EARNED', fromDate: fwd(12), toDate: fwd(18), days: 7, isHalfDay: false, reason: 'Family function out of station', appliedOn: d(1), contactDuringLeave: '+91 99402 44118', handoverTo: 'Sneha Patel', documentAttached: false, managerApprovedBy: 'Meera Rajan', managerApprovedOn: d(0), hrApprovedBy: null, hrApprovedOn: null, rejectionReason: null, balanceAtApply: 11, status: 'PENDING_HR' },
  { uid: 'lv-04', docNo: 'LV/2627/0404', employeeCode: 'EMP-0015', employeeName: 'M. Priya', department: 'Stores & Dispatch', leaveType: 'CASUAL', fromDate: d(6), toDate: d(6), days: 1, isHalfDay: true, reason: 'School parents meeting — half day', appliedOn: d(8), contactDuringLeave: '+91 89391 22014', handoverTo: 'V. Suresh', documentAttached: false, managerApprovedBy: 'R. Vasanth', managerApprovedOn: d(7), hrApprovedBy: 'HR Desk', hrApprovedOn: d(7), rejectionReason: null, balanceAtApply: 3, status: 'APPROVED' },
  { uid: 'lv-05', docNo: 'LV/2627/0419', employeeCode: 'EMP-0011', employeeName: 'T. Ganesh', department: 'Press Shop', leaveType: 'EARNED', fromDate: fwd(1), toDate: fwd(9), days: 9, isHalfDay: false, reason: 'Home town visit', appliedOn: d(0), contactDuringLeave: '+91 90034 88120', handoverTo: null, documentAttached: false, managerApprovedBy: null, managerApprovedOn: null, hrApprovedBy: null, hrApprovedOn: null, rejectionReason: null, balanceAtApply: 7, status: 'PENDING_MANAGER' },
  { uid: 'lv-06', docNo: 'LV/2627/0396', employeeCode: 'EMP-0017', employeeName: 'S. Kumar', department: 'Press Shop', leaveType: 'SICK', fromDate: d(14), toDate: d(10), days: 5, isHalfDay: false, reason: 'Hospitalised — dengue', appliedOn: d(14), contactDuringLeave: '+91 94442 11086', handoverTo: null, documentAttached: true, managerApprovedBy: 'Prakash Menon', managerApprovedOn: d(13), hrApprovedBy: 'HR Desk', hrApprovedOn: d(13), rejectionReason: null, balanceAtApply: 8, status: 'APPROVED' },
  { uid: 'lv-07', docNo: 'LV/2627/0410', employeeCode: 'EMP-0014', employeeName: 'Anand P', department: 'Welding & Vacuum', leaveType: 'CASUAL', fromDate: d(2), toDate: d(2), days: 1, isHalfDay: false, reason: 'Personal', appliedOn: d(2), contactDuringLeave: '+91 73581 44120', handoverTo: null, documentAttached: false, managerApprovedBy: null, managerApprovedOn: null, hrApprovedBy: null, hrApprovedOn: null, rejectionReason: 'Applied on the same day with no notice, and C shift had no cover.', balanceAtApply: 1, status: 'REJECTED' },
]

/* ══════════════════════════ Payroll setup ══════════════════════════════ */

export const salaryComponents: SalaryComponent[] = [
  { uid: 'sc-01', code: 'BASIC', name: 'Basic', kind: 'EARNING', basis: 'FIXED', percentValue: null, formula: null, isTaxable: true, partOfPfWages: true, partOfEsiWages: true, prorateOnAttendance: true, showOnPayslip: true, sequence: 1, isActive: true },
  { uid: 'sc-02', code: 'HRA', name: 'House rent allowance', kind: 'EARNING', basis: 'PERCENT_OF_BASIC', percentValue: 40, formula: 'BASIC × 40%', isTaxable: true, partOfPfWages: false, partOfEsiWages: true, prorateOnAttendance: true, showOnPayslip: true, sequence: 2, isActive: true },
  { uid: 'sc-03', code: 'CONV', name: 'Conveyance', kind: 'EARNING', basis: 'FIXED', percentValue: null, formula: null, isTaxable: false, partOfPfWages: false, partOfEsiWages: true, prorateOnAttendance: true, showOnPayslip: true, sequence: 3, isActive: true },
  { uid: 'sc-04', code: 'SPL', name: 'Special allowance', kind: 'EARNING', basis: 'FIXED', percentValue: null, formula: null, isTaxable: true, partOfPfWages: false, partOfEsiWages: true, prorateOnAttendance: true, showOnPayslip: true, sequence: 4, isActive: true },
  { uid: 'sc-05', code: 'SHIFT', name: 'Shift allowance', kind: 'EARNING', basis: 'ATTENDANCE_BASED', percentValue: null, formula: 'Shift rate × shifts worked', isTaxable: true, partOfPfWages: false, partOfEsiWages: true, prorateOnAttendance: true, showOnPayslip: true, sequence: 5, isActive: true },
  { uid: 'sc-06', code: 'ATTBON', name: 'Attendance allowance', kind: 'EARNING', basis: 'ATTENDANCE_BASED', percentValue: null, formula: 'Paid in full only at 100% attendance', isTaxable: true, partOfPfWages: false, partOfEsiWages: true, prorateOnAttendance: false, showOnPayslip: true, sequence: 6, isActive: true },
  { uid: 'sc-07', code: 'OT', name: 'Overtime', kind: 'EARNING', basis: 'FORMULA', percentValue: null, formula: 'Approved OT hours × hourly rate × 2', isTaxable: true, partOfPfWages: false, partOfEsiWages: true, prorateOnAttendance: false, showOnPayslip: true, sequence: 7, isActive: true },
  { uid: 'sc-08', code: 'INCV', name: 'Production incentive', kind: 'EARNING', basis: 'FORMULA', percentValue: null, formula: 'From the approved incentive run', isTaxable: true, partOfPfWages: false, partOfEsiWages: true, prorateOnAttendance: false, showOnPayslip: true, sequence: 8, isActive: true },
  { uid: 'sc-09', code: 'PF', name: 'Provident fund (employee)', kind: 'DEDUCTION', basis: 'STATUTORY', percentValue: 12, formula: 'PF wages × 12%, capped at ₹15,000 wages', isTaxable: false, partOfPfWages: false, partOfEsiWages: false, prorateOnAttendance: false, showOnPayslip: true, sequence: 20, isActive: true },
  { uid: 'sc-10', code: 'ESI', name: 'ESI (employee)', kind: 'DEDUCTION', basis: 'STATUTORY', percentValue: 0.75, formula: 'ESI wages × 0.75%, only up to ₹21,000 gross', isTaxable: false, partOfPfWages: false, partOfEsiWages: false, prorateOnAttendance: false, showOnPayslip: true, sequence: 21, isActive: true },
  { uid: 'sc-11', code: 'PT', name: 'Professional tax', kind: 'DEDUCTION', basis: 'STATUTORY', percentValue: null, formula: 'Tamil Nadu slab — ₹208 per month above ₹12,500', isTaxable: false, partOfPfWages: false, partOfEsiWages: false, prorateOnAttendance: false, showOnPayslip: true, sequence: 22, isActive: true },
  { uid: 'sc-12', code: 'TDS', name: 'Income tax (TDS)', kind: 'DEDUCTION', basis: 'FORMULA', percentValue: null, formula: 'Projected annual tax ÷ remaining months', isTaxable: false, partOfPfWages: false, partOfEsiWages: false, prorateOnAttendance: false, showOnPayslip: true, sequence: 23, isActive: true },
  { uid: 'sc-13', code: 'ADV', name: 'Salary advance recovery', kind: 'DEDUCTION', basis: 'FIXED', percentValue: null, formula: null, isTaxable: false, partOfPfWages: false, partOfEsiWages: false, prorateOnAttendance: false, showOnPayslip: true, sequence: 24, isActive: true },
  { uid: 'sc-14', code: 'CANT', name: 'Canteen recovery', kind: 'DEDUCTION', basis: 'ATTENDANCE_BASED', percentValue: null, formula: '₹22 per day present', isTaxable: false, partOfPfWages: false, partOfEsiWages: false, prorateOnAttendance: false, showOnPayslip: true, sequence: 25, isActive: true },
  { uid: 'sc-15', code: 'EPF_ER', name: 'Provident fund (employer)', kind: 'EMPLOYER_CONTRIBUTION', basis: 'STATUTORY', percentValue: 12, formula: 'PF wages × 12%', isTaxable: false, partOfPfWages: false, partOfEsiWages: false, prorateOnAttendance: false, showOnPayslip: false, sequence: 30, isActive: true },
  { uid: 'sc-16', code: 'ESI_ER', name: 'ESI (employer)', kind: 'EMPLOYER_CONTRIBUTION', basis: 'STATUTORY', percentValue: 3.25, formula: 'ESI wages × 3.25%', isTaxable: false, partOfPfWages: false, partOfEsiWages: false, prorateOnAttendance: false, showOnPayslip: false, sequence: 31, isActive: true },
]

/** Split a monthly CTC into the standard component set. */
function structureLines(ctc: number) {
  const basic = Math.round(ctc * 0.5)
  const hra = Math.round(basic * 0.4)
  const conv = 1_600
  const spl = Math.max(0, ctc - basic - hra - conv)
  return [
    { componentCode: 'BASIC', componentName: 'Basic', kind: 'EARNING' as const, amount: basic },
    { componentCode: 'HRA', componentName: 'House rent allowance', kind: 'EARNING' as const, amount: hra },
    { componentCode: 'CONV', componentName: 'Conveyance', kind: 'EARNING' as const, amount: conv },
    { componentCode: 'SPL', componentName: 'Special allowance', kind: 'EARNING' as const, amount: spl },
  ]
}

export const salaryStructures: SalaryStructure[] = [
  { uid: 'ss-01', code: 'SS-WORKMAN', name: 'Workman — shop floor', grade: 'W1–W3', appliesTo: ['PERMANENT', 'CONTRACT', 'TEMPORARY'], monthlyCtc: 30_000, lines: structureLines(30_000), effectiveFrom: d(120), employeeCount: hrEmployees.filter((e) => e.salaryStructureCode === 'SS-WORKMAN').length, isActive: true },
  { uid: 'ss-02', code: 'SS-STAFF', name: 'Staff — supervisory & technical', grade: 'S1–S3 / E2–E3', appliesTo: ['PERMANENT', 'PROBATION', 'CONTRACT'], monthlyCtc: 45_000, lines: structureLines(45_000), effectiveFrom: d(120), employeeCount: hrEmployees.filter((e) => e.salaryStructureCode === 'SS-STAFF').length, isActive: true },
  { uid: 'ss-03', code: 'SS-MGMT', name: 'Management', grade: 'M3–M4', appliesTo: ['PERMANENT'], monthlyCtc: 150_000, lines: structureLines(150_000), effectiveFrom: d(120), employeeCount: hrEmployees.filter((e) => e.salaryStructureCode === 'SS-MGMT').length, isActive: true },
  { uid: 'ss-04', code: 'SS-TRAINEE', name: 'Trainee stipend', grade: 'T1', appliesTo: ['TRAINEE', 'APPRENTICE'], monthlyCtc: 22_000, lines: structureLines(22_000), effectiveFrom: d(120), employeeCount: hrEmployees.filter((e) => e.salaryStructureCode === 'SS-TRAINEE').length, isActive: true },
]

/* ═════════════════════════ Payroll & payslips ══════════════════════════ */

const DAYS_IN_MONTH = 31

/** One payslip per active employee, computed from the same rules the UI states. */
function buildPayslip(e: HrEmployee, i: number): Payslip {
  const daysAbsent = e.employeeCode === 'EMP-0012' ? 3 : i % 7 === 0 ? 1 : 0
  const leaveDays = i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0
  const daysPaid = DAYS_IN_MONTH - daysAbsent
  const otHours = Math.round(((overtime.filter((o) => o.employeeCode === e.employeeCode && (o.status === 'APPROVED' || o.status === 'PAID')).reduce((s, o) => s + o.approvedMinutes, 0)) / 60) * 10) / 10

  const lines = structureLines(e.monthlyCtc)
  const factor = daysPaid / DAYS_IN_MONTH
  const basic = Math.round(lines[0].amount * factor)
  const hra = Math.round(lines[1].amount * factor)
  const conv = Math.round(lines[2].amount * factor)
  const spl = Math.round(lines[3].amount * factor)

  const shift = SHIFT_BY_CODE[e.shiftCode] ?? SHIFT_BY_CODE['SH-GEN']
  const shiftAllowance = e.isShopFloor ? Math.round((shift.shiftAllowance / DAYS_IN_MONTH) * daysPaid) : 0
  const attendanceAllowance = daysAbsent === 0 && e.isShopFloor ? 1_000 : 0
  const hourlyRate = Math.round((e.monthlyCtc / (DAYS_IN_MONTH - 4) / 8) * 100) / 100
  const otAmount = Math.round(otHours * hourlyRate * 2)
  const incentive = incentiveFor(e.employeeCode)

  const earnings = [
    { code: 'BASIC', name: 'Basic', amount: basic },
    { code: 'HRA', name: 'House rent allowance', amount: hra },
    { code: 'CONV', name: 'Conveyance', amount: conv },
    { code: 'SPL', name: 'Special allowance', amount: spl },
    ...(shiftAllowance ? [{ code: 'SHIFT', name: 'Shift allowance', amount: shiftAllowance }] : []),
    ...(attendanceAllowance ? [{ code: 'ATTBON', name: 'Attendance allowance', amount: attendanceAllowance }] : []),
    ...(otAmount ? [{ code: 'OT', name: 'Overtime', amount: otAmount }] : []),
    ...(incentive ? [{ code: 'INCV', name: 'Production incentive', amount: incentive }] : []),
  ]
  const gross = earnings.reduce((s, x) => s + x.amount, 0)

  // PF is on basic capped at ₹15,000 of wages; ESI only applies below ₹21,000 gross.
  const pfWages = Math.min(basic, 15_000)
  const pf = Math.round(pfWages * 0.12)
  const esiApplies = gross <= 21_000
  const esi = esiApplies ? Math.round(gross * 0.0075) : 0
  const pt = gross > 12_500 ? 208 : 0
  const tds = e.monthlyCtc > 60_000 ? Math.round((e.monthlyCtc * 12 - 1_200_000) * 0.1 / 12 / 100) * 100 : 0
  const advance = e.employeeCode === 'EMP-0016' ? 2_000 : 0
  const canteen = e.isShopFloor ? (DAYS_IN_MONTH - daysAbsent - leaveDays) * 22 : 0

  const deductions = [
    { code: 'PF', name: 'Provident fund', amount: pf },
    ...(esi ? [{ code: 'ESI', name: 'ESI', amount: esi }] : []),
    ...(pt ? [{ code: 'PT', name: 'Professional tax', amount: pt }] : []),
    ...(tds ? [{ code: 'TDS', name: 'Income tax (TDS)', amount: tds }] : []),
    ...(advance ? [{ code: 'ADV', name: 'Salary advance recovery', amount: advance }] : []),
    ...(canteen ? [{ code: 'CANT', name: 'Canteen recovery', amount: canteen }] : []),
  ]
  const totalDeductions = deductions.reduce((s, x) => s + x.amount, 0)

  return {
    uid: `pay-${e.employeeCode}`,
    payrollRunNo: 'PR/2607/07',
    period: PERIOD,
    employeeCode: e.employeeCode,
    employeeName: e.fullName,
    designation: e.designation,
    department: e.department,
    grade: e.grade,
    daysInMonth: DAYS_IN_MONTH,
    daysPaid,
    daysAbsent,
    leaveDays,
    overtimeHours: otHours,
    earnings,
    deductions,
    grossEarnings: gross,
    totalDeductions,
    netPay: gross - totalDeductions,
    employerPf: Math.round(pfWages * 0.12),
    employerEsi: esiApplies ? Math.round(gross * 0.0325) : 0,
    incentiveAmount: incentive,
    bankAccountMasked: e.bankAccountMasked,
    // One payslip is deliberately held, to show the exception path.
    status: e.employeeCode === 'EMP-0020' ? 'HELD' : 'DRAFT',
    holdReason: e.employeeCode === 'EMP-0020' ? 'On notice — full and final settlement pending, so the monthly payslip is held.' : null,
  }
}

/* Incentive earnings are computed first, because payslips consume them. */

export const incentiveSchemes: IncentiveScheme[] = [
  { uid: 'inc-01', code: 'INC-PRESS', name: 'Press shop — per unit', model: 'PER_UNIT', appliesTo: 'Press Shop', qualifyingOutputPct: 90, minAttendancePct: 90, maxRejectionPct: 2, maxReworkPct: 3, minOeePct: 0, ratePerUnit: 0.35, teamBonus: 0, monthlyCap: 4_500, effectiveFrom: d(180), participantCount: 5, isActive: true },
  { uid: 'inc-02', code: 'INC-WELD', name: 'Welding & vacuum — per unit with OEE gate', model: 'PER_UNIT', appliesTo: 'Welding & Vacuum', qualifyingOutputPct: 90, minAttendancePct: 92, maxRejectionPct: 1.5, maxReworkPct: 2, minOeePct: 70, ratePerUnit: 0.45, teamBonus: 0, monthlyCap: 5_500, effectiveFrom: d(180), participantCount: 3, isActive: true },
  { uid: 'inc-03', code: 'INC-PACK', name: 'Packing — team based', model: 'TEAM', appliesTo: 'Stores & Dispatch', qualifyingOutputPct: 95, minAttendancePct: 90, maxRejectionPct: 0.5, maxReworkPct: 1, minOeePct: 0, ratePerUnit: 0, teamBonus: 2_800, monthlyCap: 2_800, effectiveFrom: d(180), participantCount: 3, isActive: true },
  { uid: 'inc-04', code: 'INC-PROD-BON', name: 'Plant productivity bonus', model: 'PRODUCTIVITY_BONUS', appliesTo: 'All shop floor', qualifyingOutputPct: 100, minAttendancePct: 95, maxRejectionPct: 1.5, maxReworkPct: 2, minOeePct: 75, ratePerUnit: 0, teamBonus: 1_500, monthlyCap: 1_500, effectiveFrom: d(90), participantCount: 11, isActive: true },
]

type IncDef = [string, string, number, number, number, number, number, number]
/** code, scheme, units, target, rejected, rework, attendancePct, oeePct */
const INC_DEFS: IncDef[] = [
  ['EMP-0009', 'INC-PRESS', 12_400, 12_000, 168, 220, 100, 0],
  ['EMP-0011', 'INC-PRESS', 11_200, 12_000, 142, 190, 96.8, 0],
  ['EMP-0012', 'INC-PRESS', 9_400, 12_000, 210, 260, 90.3, 0],
  ['EMP-0017', 'INC-PRESS', 11_900, 12_000, 118, 140, 100, 0],
  ['EMP-0004', 'INC-WELD', 8_600, 8_400, 96, 128, 100, 74.2],
  ['EMP-0013', 'INC-WELD', 8_200, 8_400, 184, 210, 96.8, 68.4],
  ['EMP-0014', 'INC-WELD', 7_900, 8_400, 88, 104, 93.5, 76.1],
  ['EMP-0015', 'INC-PACK', 6_240, 6_000, 12, 18, 96.8, 0],
  ['EMP-0016', 'INC-PACK', 5_880, 6_000, 8, 14, 93.5, 0],
]

export const incentiveEarnings: IncentiveEarning[] = INC_DEFS.map(
  ([code, schemeCode, units, target, rejected, rework, attendancePct, oeePct], i) => {
    const emp = hrEmployees.find((e) => e.employeeCode === code)!
    const scheme = incentiveSchemes.find((s) => s.code === schemeCode)!
    const good = units - rejected - rework
    const rejectionPct = Math.round((rejected / units) * 1000) / 10
    const reworkPct = Math.round((rework / units) * 1000) / 10
    const outputPct = (units / target) * 100

    const outputGateMet = outputPct >= scheme.qualifyingOutputPct
    const attendanceGateMet = attendancePct >= scheme.minAttendancePct
    const qualityGateMet = rejectionPct <= scheme.maxRejectionPct && reworkPct <= scheme.maxReworkPct
    const oeeGateMet = scheme.minOeePct === 0 || oeePct >= scheme.minOeePct
    const allMet = outputGateMet && attendanceGateMet && qualityGateMet && oeeGateMet

    const gross = scheme.model === 'TEAM' ? scheme.teamBonus : Math.round(good * scheme.ratePerUnit)
    const earned = allMet ? Math.min(gross, scheme.monthlyCap) : 0

    const failed = [
      !outputGateMet && `output ${outputPct.toFixed(1)}% against a qualifying ${scheme.qualifyingOutputPct}%`,
      !attendanceGateMet && `attendance ${attendancePct}% against a minimum ${scheme.minAttendancePct}%`,
      !qualityGateMet && `rejection ${rejectionPct}% / rework ${reworkPct}% against limits of ${scheme.maxRejectionPct}% / ${scheme.maxReworkPct}%`,
      !oeeGateMet && `OEE ${oeePct}% against a minimum ${scheme.minOeePct}%`,
    ].filter(Boolean)

    return {
      uid: `ie-${String(i + 1).padStart(2, '0')}`,
      period: PERIOD,
      employeeCode: code,
      employeeName: emp.fullName,
      department: emp.department,
      workCentre: emp.workCentre,
      schemeCode,
      schemeName: scheme.name,
      model: scheme.model,
      unitsProduced: units,
      targetUnits: target,
      goodUnits: good,
      rejectedUnits: rejected,
      reworkUnits: rework,
      attendancePct,
      oeePct,
      outputGateMet,
      attendanceGateMet,
      qualityGateMet,
      oeeGateMet,
      grossIncentive: gross,
      earnedIncentive: earned,
      disqualifiedReason: allMet ? null : `Missed: ${failed.join('; ')}.`,
      status: allMet ? 'APPROVED' : 'DISQUALIFIED',
    }
  },
)

function incentiveFor(employeeCode: string) {
  return incentiveEarnings
    .filter((x) => x.employeeCode === employeeCode && x.status !== 'DISQUALIFIED')
    .reduce((s, x) => s + x.earnedIncentive, 0)
}

export const payslips: Payslip[] = hrEmployees
  .filter((e) => e.status !== 'EXITED')
  .map((e, i) => buildPayslip(e, i))

export const payrollRuns: PayrollRun[] = [
  {
    uid: 'pr-01',
    docNo: 'PR/2607/07',
    period: PERIOD,
    periodStart: `${PERIOD}-01`,
    periodEnd: `${PERIOD}-31`,
    plant: 'Chennai — Unit 1',
    status: 'CALCULATED',
    employeeCount: payslips.length,
    attendanceLocked: true,
    leaveLocked: true,
    overtimeApproved: false,
    incentiveApproved: true,
    grossEarnings: payslips.reduce((s, p) => s + p.grossEarnings, 0),
    totalDeductions: payslips.reduce((s, p) => s + p.totalDeductions, 0),
    netPayable: payslips.reduce((s, p) => s + p.netPay, 0),
    employerPf: payslips.reduce((s, p) => s + p.employerPf, 0),
    employerEsi: payslips.reduce((s, p) => s + p.employerEsi, 0),
    totalCtc: payslips.reduce((s, p) => s + p.grossEarnings + p.employerPf + p.employerEsi, 0),
    calculatedOn: at(0, 8),
    approvedBy: null,
    approvedOn: null,
    paidOn: null,
    bankAdviceNo: null,
    journalNo: null,
    remarks: 'Two overtime claims are still unapproved — the run cannot be sent for approval until they are cleared.',
  },
  {
    uid: 'pr-02',
    docNo: 'PR/2606/06',
    period: '2026-06',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    plant: 'Chennai — Unit 1',
    status: 'PAID',
    employeeCount: 19,
    attendanceLocked: true,
    leaveLocked: true,
    overtimeApproved: true,
    incentiveApproved: true,
    grossEarnings: 1_486_200,
    totalDeductions: 172_840,
    netPayable: 1_313_360,
    employerPf: 68_400,
    employerEsi: 4_120,
    totalCtc: 1_558_720,
    calculatedOn: d(32),
    approvedBy: 'Meera Rajan',
    approvedOn: d(31),
    paidOn: d(30),
    bankAdviceNo: 'BA/2606/0006',
    journalNo: 'JV/2627/00412',
  },
  {
    uid: 'pr-03',
    docNo: 'PR/2605/05',
    period: '2026-05',
    periodStart: '2026-05-01',
    periodEnd: '2026-05-31',
    plant: 'Chennai — Unit 1',
    status: 'CLOSED',
    employeeCount: 18,
    attendanceLocked: true,
    leaveLocked: true,
    overtimeApproved: true,
    incentiveApproved: true,
    grossEarnings: 1_412_800,
    totalDeductions: 164_200,
    netPayable: 1_248_600,
    employerPf: 65_800,
    employerEsi: 3_940,
    totalCtc: 1_482_540,
    calculatedOn: d(63),
    approvedBy: 'Meera Rajan',
    approvedOn: d(62),
    paidOn: d(61),
    bankAdviceNo: 'BA/2605/0005',
    journalNo: 'JV/2627/00366',
  },
]

/* ═══════════════════════ Labour cost allocation ═══════════════════════ */

export const labourCostLines: LabourCostLine[] = payslips
  .filter((p) => hrEmployees.find((e) => e.employeeCode === p.employeeCode)?.isShopFloor)
  .map((p, i) => {
    const e = hrEmployees.find((x) => x.employeeCode === p.employeeCode)!
    const inc = incentiveEarnings.find((x) => x.employeeCode === p.employeeCode)
    const regularHours = (p.daysPaid - p.leaveDays) * 8
    const otHours = p.overtimeHours
    const idleHours = i % 4 === 0 ? 6 : i % 3 === 0 ? 3 : 0
    const hourlyRate = Math.round((p.grossEarnings / Math.max(1, regularHours)) * 100) / 100
    const regularCost = Math.round(regularHours * hourlyRate)
    const overtimeCost = Math.round(otHours * hourlyRate * 2)
    const incentiveCost = p.incentiveAmount
    const units = inc?.goodUnits ?? 0
    const total = regularCost + overtimeCost + incentiveCost

    return {
      uid: `lc-${String(i + 1).padStart(2, '0')}`,
      period: PERIOD,
      employeeCode: p.employeeCode,
      employeeName: p.employeeName,
      department: p.department,
      costCentre: e.costCentre,
      productionOrderNo: e.workCentre === 'Packing' ? null : 'PRD/2607/0121',
      workOrderNo: e.workCentre === 'Press Shop' ? 'WO/2607/0121-02' : e.workCentre === 'Welding & Vacuum' ? 'WO/2607/0121-07' : null,
      batchNo: e.workCentre === 'Packing' ? null : 'B2607-FG-0121',
      itemCode: e.workCentre === 'Packing' ? null : 'FG-SS-750-BLK',
      itemName: e.workCentre === 'Packing' ? null : 'Insulated Bottle 750 ml — Matte Black',
      machine: e.workCentre === 'Press Shop' ? 'PRESS-02' : e.workCentre === 'Welding & Vacuum' ? 'WELD-02' : null,
      regularHours,
      overtimeHours: otHours,
      idleHours,
      hourlyRate,
      overtimeRate: Math.round(hourlyRate * 2 * 100) / 100,
      regularCost,
      overtimeCost,
      incentiveCost,
      totalCost: total,
      unitsProduced: units,
      costPerUnit: units ? Math.round((total / units) * 100) / 100 : 0,
      allocation: e.workCentre === 'Packing' ? 'COST_CENTRE' : e.workCentre === 'Maintenance' ? 'INDIRECT' : 'PRODUCTION_ORDER',
      postedToFinance: i % 3 !== 0,
      journalNo: i % 3 !== 0 ? `JV/2627/0${450 + i}` : null,
    }
  })

/* ═══════════════════════ Performance & learning ═══════════════════════ */

export const kpis: Kpi[] = [
  { uid: 'kpi-01', code: 'KPI-OUT', name: 'Output achievement', appliesToRole: 'Production Operator', category: 'OUTPUT', unit: '%', target: 100, weightPct: 30, direction: 'HIGHER_BETTER', dataSource: 'Shop floor — production entries', isActive: true },
  { uid: 'kpi-02', code: 'KPI-ATT', name: 'Attendance', appliesToRole: 'Production Operator', category: 'ATTENDANCE', unit: '%', target: 95, weightPct: 15, direction: 'HIGHER_BETTER', dataSource: 'HR — attendance', isActive: true },
  { uid: 'kpi-03', code: 'KPI-SCRAP', name: 'Scrap rate', appliesToRole: 'Production Operator', category: 'QUALITY', unit: '%', target: 1.5, weightPct: 20, direction: 'LOWER_BETTER', dataSource: 'Shop floor — scrap register', isActive: true },
  { uid: 'kpi-04', code: 'KPI-REWORK', name: 'Rework rate', appliesToRole: 'Production Operator', category: 'QUALITY', unit: '%', target: 2, weightPct: 10, direction: 'LOWER_BETTER', dataSource: 'Shop floor — rework orders', isActive: true },
  { uid: 'kpi-05', code: 'KPI-MU', name: 'Machine utilisation', appliesToRole: 'Production Operator', category: 'OUTPUT', unit: '%', target: 85, weightPct: 15, direction: 'HIGHER_BETTER', dataSource: 'Shop floor — machine run minutes', isActive: true },
  { uid: 'kpi-06', code: 'KPI-SAFE', name: 'Safety compliance', appliesToRole: 'Production Operator', category: 'SAFETY', unit: 'incidents', target: 0, weightPct: 10, direction: 'LOWER_BETTER', dataSource: 'HR — safety observations', isActive: true },
  { uid: 'kpi-07', code: 'KPI-SHIFT-EFF', name: 'Shift efficiency', appliesToRole: 'Shift Supervisor', category: 'OUTPUT', unit: '%', target: 95, weightPct: 25, direction: 'HIGHER_BETTER', dataSource: 'Shop floor — shift logs', isActive: true },
  { uid: 'kpi-08', code: 'KPI-OEE', name: 'OEE achievement', appliesToRole: 'Shift Supervisor', category: 'OUTPUT', unit: '%', target: 85, weightPct: 25, direction: 'HIGHER_BETTER', dataSource: 'Shop floor — OEE', isActive: true },
  { uid: 'kpi-09', code: 'KPI-TEAM', name: 'Team productivity', appliesToRole: 'Shift Supervisor', category: 'PEOPLE', unit: 'units/operator', target: 1_100, weightPct: 20, direction: 'HIGHER_BETTER', dataSource: 'Shop floor + HR', isActive: true },
  { uid: 'kpi-10', code: 'KPI-OTIF', name: 'Delivery performance', appliesToRole: 'Shift Supervisor', category: 'DELIVERY', unit: '%', target: 95, weightPct: 15, direction: 'HIGHER_BETTER', dataSource: 'Dispatch — on-time delivery', isActive: true },
  { uid: 'kpi-11', code: 'KPI-LABCOST', name: 'Labour cost per bottle', appliesToRole: 'Plant Head', category: 'COST', unit: '₹', target: 3.2, weightPct: 20, direction: 'LOWER_BETTER', dataSource: 'HR — labour cost allocation', isActive: true },
]

export const appraisals: Appraisal[] = [
  {
    uid: 'ap-01', docNo: 'APR/2627/0088', cycle: 'FY 2026-27', employeeCode: 'EMP-0009', employeeName: 'Prakash Menon',
    designation: 'Press Operator', department: 'Press Shop', reviewer: 'Meera Rajan', stage: 'MANAGER_REVIEW',
    goals: [
      { kpiCode: 'KPI-OUT', kpiName: 'Output achievement', target: 100, actual: 103.3, weightPct: 30, score: 4.5 },
      { kpiCode: 'KPI-ATT', kpiName: 'Attendance', target: 95, actual: 100, weightPct: 15, score: 5 },
      { kpiCode: 'KPI-SCRAP', kpiName: 'Scrap rate', target: 1.5, actual: 1.4, weightPct: 20, score: 4 },
      { kpiCode: 'KPI-REWORK', kpiName: 'Rework rate', target: 2, actual: 1.8, weightPct: 10, score: 4 },
      { kpiCode: 'KPI-MU', kpiName: 'Machine utilisation', target: 85, actual: 88.2, weightPct: 15, score: 4 },
      { kpiCode: 'KPI-SAFE', kpiName: 'Safety compliance', target: 0, actual: 0, weightPct: 10, score: 5 },
    ],
    selfRating: 4.5, managerRating: 4.3, hrRating: null, finalRating: null, ratingBand: null,
    incrementPct: null, promotionRecommended: true, recommendedDesignation: 'Senior Press Operator',
    managerRemarks: 'Best output in the press shop and a clean safety record. Ready for a senior grade.',
    employeeRemarks: 'Would like formal training on the new 400-tonne press.', finalisedOn: null,
  },
  {
    uid: 'ap-02', docNo: 'APR/2627/0091', cycle: 'FY 2026-27', employeeCode: 'EMP-0012', employeeName: 'N. Selvam',
    designation: 'Press Operator', department: 'Press Shop', reviewer: 'Prakash Menon', stage: 'SELF_APPRAISAL',
    goals: [
      { kpiCode: 'KPI-OUT', kpiName: 'Output achievement', target: 100, actual: 78.3, weightPct: 30, score: null },
      { kpiCode: 'KPI-ATT', kpiName: 'Attendance', target: 95, actual: 90.3, weightPct: 15, score: null },
      { kpiCode: 'KPI-SCRAP', kpiName: 'Scrap rate', target: 1.5, actual: 2.2, weightPct: 20, score: null },
      { kpiCode: 'KPI-REWORK', kpiName: 'Rework rate', target: 2, actual: 2.8, weightPct: 10, score: null },
      { kpiCode: 'KPI-MU', kpiName: 'Machine utilisation', target: 85, actual: 74.1, weightPct: 15, score: null },
      { kpiCode: 'KPI-SAFE', kpiName: 'Safety compliance', target: 0, actual: 1, weightPct: 10, score: null },
    ],
    selfRating: null, managerRating: null, hrRating: null, finalRating: null, ratingBand: null,
    incrementPct: null, promotionRecommended: false, recommendedDesignation: null,
    managerRemarks: null, employeeRemarks: null, finalisedOn: null,
  },
  {
    uid: 'ap-03', docNo: 'APR/2627/0074', cycle: 'FY 2025-26', employeeCode: 'EMP-0004', employeeName: 'Karthik Subramanian',
    designation: 'Line Operator', department: 'Welding & Vacuum', reviewer: 'Meera Rajan', stage: 'FINALISED',
    goals: [
      { kpiCode: 'KPI-OUT', kpiName: 'Output achievement', target: 100, actual: 102.4, weightPct: 30, score: 4.5 },
      { kpiCode: 'KPI-ATT', kpiName: 'Attendance', target: 95, actual: 98.6, weightPct: 15, score: 4.5 },
      { kpiCode: 'KPI-SCRAP', kpiName: 'Scrap rate', target: 1.5, actual: 1.1, weightPct: 20, score: 5 },
      { kpiCode: 'KPI-MU', kpiName: 'Machine utilisation', target: 85, actual: 86.4, weightPct: 15, score: 4 },
      { kpiCode: 'KPI-SAFE', kpiName: 'Safety compliance', target: 0, actual: 0, weightPct: 10, score: 5 },
    ],
    selfRating: 4.6, managerRating: 4.6, hrRating: 4.5, finalRating: 4.5, ratingBand: 'EXCEEDS',
    incrementPct: 9.5, promotionRecommended: true, recommendedDesignation: 'Welding Section In-charge',
    managerRemarks: 'Took over the welding section informally when the in-charge left. Should be made formal.',
    employeeRemarks: 'Happy with the section responsibility.', finalisedOn: d(94),
  },
  {
    uid: 'ap-04', docNo: 'APR/2627/0093', cycle: 'FY 2026-27', employeeCode: 'EMP-0005', employeeName: 'Lakshmi Narayanan',
    designation: 'Quality Inspector', department: 'Quality Control', reviewer: 'Meera Rajan', stage: 'GOAL_SETTING',
    goals: [
      { kpiCode: 'KPI-SCRAP', kpiName: 'Scrap rate', target: 1.5, actual: null, weightPct: 40, score: null },
      { kpiCode: 'KPI-ATT', kpiName: 'Attendance', target: 95, actual: null, weightPct: 20, score: null },
      { kpiCode: 'KPI-SAFE', kpiName: 'Safety compliance', target: 0, actual: null, weightPct: 40, score: null },
    ],
    selfRating: null, managerRating: null, hrRating: null, finalRating: null, ratingBand: null,
    incrementPct: null, promotionRecommended: false, recommendedDesignation: null,
    managerRemarks: null, employeeRemarks: null, finalisedOn: null,
  },
]

export const trainingProgrammes: TrainingProgramme[] = [
  { uid: 'tp-01', code: 'TRN-SAFE-01', title: 'Machine guarding & lockout-tagout', category: 'SAFETY', mode: 'INTERNAL', trainer: 'Suresh Babu', durationHours: 4, scheduledOn: d(12), venue: 'Training room — Unit 1', targetDepartment: 'Press Shop', seats: 24, enrolled: 22, attended: 20, certificationValidMonths: 12, passMarkPct: 70, costPerHead: 0, status: 'COMPLETED' },
  { uid: 'tp-02', code: 'TRN-WELD-02', title: 'TIG welding — bottom seam technique', category: 'MACHINE', mode: 'ON_THE_JOB', trainer: 'J. Mohan', durationHours: 16, scheduledOn: d(6), venue: 'Welding bay', targetDepartment: 'Welding & Vacuum', seats: 6, enrolled: 5, attended: 5, certificationValidMonths: 24, passMarkPct: 75, costPerHead: 0, status: 'COMPLETED' },
  { uid: 'tp-03', code: 'TRN-QC-01', title: 'Vacuum leak testing & instrument handling', category: 'QUALITY', mode: 'EXTERNAL', trainer: 'Bureau Veritas', durationHours: 8, scheduledOn: fwd(9), venue: 'Chennai — BV training centre', targetDepartment: 'Quality Control', seats: 8, enrolled: 6, attended: 0, certificationValidMonths: 24, passMarkPct: 80, costPerHead: 4_500, status: 'OPEN' },
  { uid: 'tp-04', code: 'TRN-FIRE-01', title: 'Fire fighting & evacuation drill', category: 'STATUTORY', mode: 'EXTERNAL', trainer: 'TN Fire & Rescue', durationHours: 3, scheduledOn: fwd(21), venue: 'Plant yard', targetDepartment: 'All departments', seats: 60, enrolled: 41, attended: 0, certificationValidMonths: 12, passMarkPct: 0, costPerHead: 350, status: 'OPEN' },
  { uid: 'tp-05', code: 'TRN-COAT-01', title: 'Powder coating — gun setup & film thickness', category: 'MACHINE', mode: 'INTERNAL', trainer: 'External consultant', durationHours: 12, scheduledOn: fwd(34), venue: 'Unit 2 — coating booth', targetDepartment: 'Polishing & Finishing', seats: 10, enrolled: 3, attended: 0, certificationValidMonths: 24, passMarkPct: 75, costPerHead: 1_800, status: 'PLANNED' },
  { uid: 'tp-06', code: 'TRN-IND-01', title: 'New joiner induction', category: 'INDUCTION', mode: 'INTERNAL', trainer: 'HR Desk', durationHours: 6, scheduledOn: d(2), venue: 'Training room — Unit 1', targetDepartment: 'All departments', seats: 12, enrolled: 2, attended: 2, certificationValidMonths: null, passMarkPct: 0, costPerHead: 0, status: 'COMPLETED' },
]

export const trainingRecords: TrainingRecord[] = [
  { uid: 'tr-01', programmeCode: 'TRN-SAFE-01', programmeTitle: 'Machine guarding & lockout-tagout', employeeCode: 'EMP-0009', employeeName: 'Prakash Menon', department: 'Press Shop', attendedOn: d(12), hoursAttended: 4, assessmentScore: 88, passed: true, certificateNo: 'CERT/SAFE/0412', certificationExpiresOn: fwd(353), effectivenessReviewedOn: d(2), effectivenessRating: 'IMPROVED', status: 'PASSED' },
  { uid: 'tr-02', programmeCode: 'TRN-SAFE-01', programmeTitle: 'Machine guarding & lockout-tagout', employeeCode: 'EMP-0011', employeeName: 'T. Ganesh', department: 'Press Shop', attendedOn: d(12), hoursAttended: 4, assessmentScore: 74, passed: true, certificateNo: 'CERT/SAFE/0413', certificationExpiresOn: fwd(353), effectivenessReviewedOn: null, effectivenessRating: 'NOT_REVIEWED', status: 'PASSED' },
  { uid: 'tr-03', programmeCode: 'TRN-SAFE-01', programmeTitle: 'Machine guarding & lockout-tagout', employeeCode: 'EMP-0012', employeeName: 'N. Selvam', department: 'Press Shop', attendedOn: d(12), hoursAttended: 4, assessmentScore: 58, passed: false, certificateNo: null, certificationExpiresOn: null, effectivenessReviewedOn: null, effectivenessRating: null, status: 'FAILED' },
  { uid: 'tr-04', programmeCode: 'TRN-SAFE-01', programmeTitle: 'Machine guarding & lockout-tagout', employeeCode: 'EMP-0017', employeeName: 'S. Kumar', department: 'Press Shop', attendedOn: null, hoursAttended: 0, assessmentScore: null, passed: null, certificateNo: null, certificationExpiresOn: null, effectivenessReviewedOn: null, effectivenessRating: null, status: 'ABSENT' },
  { uid: 'tr-05', programmeCode: 'TRN-WELD-02', programmeTitle: 'TIG welding — bottom seam technique', employeeCode: 'EMP-0004', employeeName: 'Karthik Subramanian', department: 'Welding & Vacuum', attendedOn: d(6), hoursAttended: 16, assessmentScore: 92, passed: true, certificateNo: 'CERT/WELD/0188', certificationExpiresOn: fwd(724), effectivenessReviewedOn: d(1), effectivenessRating: 'SIGNIFICANT', status: 'PASSED' },
  { uid: 'tr-06', programmeCode: 'TRN-WELD-02', programmeTitle: 'TIG welding — bottom seam technique', employeeCode: 'EMP-0014', employeeName: 'Anand P', department: 'Welding & Vacuum', attendedOn: d(6), hoursAttended: 14, assessmentScore: 79, passed: true, certificateNo: 'CERT/WELD/0189', certificationExpiresOn: fwd(724), effectivenessReviewedOn: null, effectivenessRating: 'NOT_REVIEWED', status: 'PASSED' },
  { uid: 'tr-07', programmeCode: 'TRN-QC-01', programmeTitle: 'Vacuum leak testing & instrument handling', employeeCode: 'EMP-0005', employeeName: 'Lakshmi Narayanan', department: 'Quality Control', attendedOn: null, hoursAttended: 0, assessmentScore: null, passed: null, certificateNo: null, certificationExpiresOn: null, effectivenessReviewedOn: null, effectivenessRating: null, status: 'ENROLLED' },
  { uid: 'tr-08', programmeCode: 'TRN-QC-01', programmeTitle: 'Vacuum leak testing & instrument handling', employeeCode: 'EMP-0010', employeeName: 'Sneha Patel', department: 'Quality Control', attendedOn: null, hoursAttended: 0, assessmentScore: null, passed: null, certificateNo: null, certificationExpiresOn: null, effectivenessReviewedOn: null, effectivenessRating: null, status: 'ENROLLED' },
  { uid: 'tr-09', programmeCode: 'TRN-IND-01', programmeTitle: 'New joiner induction', employeeCode: 'EMP-0010', employeeName: 'Sneha Patel', department: 'Quality Control', attendedOn: d(2), hoursAttended: 6, assessmentScore: null, passed: true, certificateNo: null, certificationExpiresOn: null, effectivenessReviewedOn: null, effectivenessRating: 'NOT_REVIEWED', status: 'ATTENDED' },
  { uid: 'tr-10', programmeCode: 'TRN-SAFE-01', programmeTitle: 'Machine guarding & lockout-tagout', employeeCode: 'EMP-0013', employeeName: 'J. Mohan', department: 'Welding & Vacuum', attendedOn: d(390), hoursAttended: 4, assessmentScore: 82, passed: true, certificateNo: 'CERT/SAFE/0301', certificationExpiresOn: d(25), effectivenessReviewedOn: d(320), effectivenessRating: 'IMPROVED', status: 'EXPIRED' },
]

/* ═══════════════════════════ Skill matrix ═════════════════════════════ */

export const skillDefinitions: SkillDefinition[] = [
  { uid: 'sk-01', code: 'SKL-CUT', name: 'Coil cutting', category: 'MACHINE', workCentre: 'Coil Cutting', minLevelToOperate: 'INTERMEDIATE', requiresCertification: true, certificationValidMonths: 24, criticality: 'HIGH', requiredHeadcount: 4, isActive: true },
  { uid: 'sk-02', code: 'SKL-DRAW', name: 'Deep drawing', category: 'MACHINE', workCentre: 'Press Shop', minLevelToOperate: 'SKILLED', requiresCertification: true, certificationValidMonths: 24, criticality: 'CRITICAL', requiredHeadcount: 6, isActive: true },
  { uid: 'sk-03', code: 'SKL-WELD', name: 'Welding', category: 'MACHINE', workCentre: 'Welding & Vacuum', minLevelToOperate: 'SKILLED', requiresCertification: true, certificationValidMonths: 24, criticality: 'CRITICAL', requiredHeadcount: 5, isActive: true },
  { uid: 'sk-04', code: 'SKL-VAC', name: 'Vacuum sealing', category: 'MACHINE', workCentre: 'Welding & Vacuum', minLevelToOperate: 'SKILLED', requiresCertification: true, certificationValidMonths: 24, criticality: 'CRITICAL', requiredHeadcount: 4, isActive: true },
  { uid: 'sk-05', code: 'SKL-POL', name: 'Polishing', category: 'MACHINE', workCentre: 'Polishing', minLevelToOperate: 'INTERMEDIATE', requiresCertification: false, certificationValidMonths: null, criticality: 'MEDIUM', requiredHeadcount: 6, isActive: true },
  { uid: 'sk-06', code: 'SKL-COAT', name: 'Powder coating', category: 'MACHINE', workCentre: 'Coating', minLevelToOperate: 'SKILLED', requiresCertification: true, certificationValidMonths: 24, criticality: 'HIGH', requiredHeadcount: 4, isActive: true },
  { uid: 'sk-07', code: 'SKL-PRINT', name: 'Laser marking & printing', category: 'MACHINE', workCentre: 'Marking', minLevelToOperate: 'INTERMEDIATE', requiresCertification: true, certificationValidMonths: 24, criticality: 'MEDIUM', requiredHeadcount: 3, isActive: true },
  { uid: 'sk-08', code: 'SKL-ASSY', name: 'Assembly', category: 'PROCESS', workCentre: 'Assembly', minLevelToOperate: 'BEGINNER', requiresCertification: false, certificationValidMonths: null, criticality: 'LOW', requiredHeadcount: 8, isActive: true },
  { uid: 'sk-09', code: 'SKL-QC', name: 'Quality inspection', category: 'QUALITY', workCentre: 'Final Inspection', minLevelToOperate: 'SKILLED', requiresCertification: true, certificationValidMonths: 24, criticality: 'CRITICAL', requiredHeadcount: 5, isActive: true },
  { uid: 'sk-10', code: 'SKL-FORK', name: 'Forklift operation', category: 'HANDLING', workCentre: null, minLevelToOperate: 'SKILLED', requiresCertification: true, certificationValidMonths: 12, criticality: 'HIGH', requiredHeadcount: 3, isActive: true },
]

type SkillDef = [string, string, EmployeeSkill['level'], number | null, number | null, number | null]
/** employee, skill, level, certifiedDaysAgo, unitsPerHour, defectRatePct */
const SKILL_DEFS: SkillDef[] = [
  ['EMP-0009', 'SKL-DRAW', 'EXPERT', 620, 148, 1.4],
  ['EMP-0009', 'SKL-CUT', 'SKILLED', 400, 132, 1.1],
  ['EMP-0011', 'SKL-DRAW', 'SKILLED', 340, 134, 1.3],
  ['EMP-0012', 'SKL-DRAW', 'INTERMEDIATE', 180, 112, 2.2],
  ['EMP-0017', 'SKL-CUT', 'EXPERT', 500, 156, 1.0],
  ['EMP-0017', 'SKL-DRAW', 'INTERMEDIATE', 120, 108, 1.8],
  ['EMP-0004', 'SKL-WELD', 'TRAINER', 700, 138, 1.1],
  ['EMP-0004', 'SKL-VAC', 'EXPERT', 540, 126, 0.9],
  ['EMP-0013', 'SKL-WELD', 'EXPERT', 480, 130, 2.2],
  ['EMP-0014', 'SKL-VAC', 'SKILLED', 260, 118, 1.1],
  ['EMP-0014', 'SKL-WELD', 'BEGINNER', null, null, null],
  ['EMP-0005', 'SKL-QC', 'EXPERT', 600, null, null],
  ['EMP-0010', 'SKL-QC', 'BEGINNER', null, null, null],
  ['EMP-0015', 'SKL-ASSY', 'SKILLED', 220, 96, 0.4],
  ['EMP-0016', 'SKL-ASSY', 'INTERMEDIATE', 140, 88, 0.6],
  ['EMP-0006', 'SKL-FORK', 'SKILLED', 400, null, null],
  ['EMP-0007', 'SKL-FORK', 'INTERMEDIATE', 355, null, null],
]

export const employeeSkills: EmployeeSkill[] = SKILL_DEFS.map(
  ([code, skillCode, level, certAgo, uph, defect], i) => {
    const emp = hrEmployees.find((e) => e.employeeCode === code)!
    const skill = skillDefinitions.find((s) => s.code === skillCode)!
    const certifiedOn = certAgo === null ? null : d(certAgo)
    const expires =
      certifiedOn && skill.certificationValidMonths
        ? d(certAgo! - skill.certificationValidMonths * 30)
        : null
    const daysToExpiry = expires ? Math.round((new Date(expires).getTime() - Date.now()) / 86_400_000) : null
    const status: EmployeeSkill['status'] =
      !certifiedOn ? (level === 'BEGINNER' ? 'IN_TRAINING' : 'NOT_CERTIFIED')
      : daysToExpiry === null ? 'CERTIFIED'
      : daysToExpiry < 0 ? 'EXPIRED'
      : daysToExpiry < 60 ? 'EXPIRING'
      : 'CERTIFIED'

    return {
      uid: `es-${String(i + 1).padStart(2, '0')}`,
      employeeCode: code,
      employeeName: emp.fullName,
      department: emp.department,
      skillCode,
      skillName: skill.name,
      level,
      certifiedOn,
      certificationExpiresOn: expires,
      assessedBy: certifiedOn ? (skillCode === 'SKL-WELD' || skillCode === 'SKL-VAC' ? 'Karthik Subramanian' : 'Prakash Menon') : null,
      unitsPerHour: uph,
      defectRatePct: defect,
      lastOperatedOn: uph ? d(i % 5) : null,
      status,
    }
  },
)

/* ═══════════════════════ Contractor labour ═══════════════════════════ */

export const contractors: Contractor[] = [
  { uid: 'con-01', code: 'CON-001', name: 'Sri Balaji Manpower Services', contactPerson: 'B. Ravichandran', mobile: '+91 98400 21148', gstin: '33AABCS1429L1ZQ', licenceNo: 'CLRA/TN/2024/0881', licenceExpiresOn: fwd(184), pfRegistrationNo: 'TN/MAS/0044821', esiRegistrationNo: '51-00-102244', workScope: 'Packing hall, loading and material movement', rateBasis: 'DAILY_WAGE', agreedRate: 620, pfCompliant: true, esiCompliant: true, wagesCompliant: true, lastComplianceCheckOn: d(12), headcountDeployed: 28, isActive: true },
  { uid: 'con-02', code: 'CON-002', name: 'Kavin Industrial Contractors', contactPerson: 'S. Kavinkumar', mobile: '+91 99620 41108', gstin: '33AAECK8812P1ZR', licenceNo: 'CLRA/TN/2023/0644', licenceExpiresOn: d(18), pfRegistrationNo: 'TN/MAS/0041104', esiRegistrationNo: '51-00-100812', workScope: 'Polishing and buffing on piece rate', rateBasis: 'PIECE_RATE', agreedRate: 1.8, pfCompliant: true, esiCompliant: false, wagesCompliant: true, lastComplianceCheckOn: d(40), headcountDeployed: 16, isActive: true },
  { uid: 'con-03', code: 'CON-003', name: 'Annai Housekeeping', contactPerson: 'M. Selvi', mobile: '+91 90923 11480', gstin: '33AAFPA2201H1ZK', licenceNo: 'CLRA/TN/2025/0912', licenceExpiresOn: fwd(310), pfRegistrationNo: 'TN/MAS/0046612', esiRegistrationNo: '51-00-104408', workScope: 'Housekeeping and canteen', rateBasis: 'MONTHLY', agreedRate: 18_400, pfCompliant: true, esiCompliant: true, wagesCompliant: true, lastComplianceCheckOn: d(6), headcountDeployed: 9, isActive: true },
]

export const contractorLabour: ContractorLabourDay[] = [
  { uid: 'cl-01', attendanceDate: d(0), contractorCode: 'CON-001', contractorName: 'Sri Balaji Manpower Services', labourName: 'A. Murugan', labourId: 'CL-0114', department: 'Stores & Dispatch', workCentre: 'Packing', shiftCode: 'SH-A', hoursWorked: 8, unitsProduced: 0, rateBasis: 'DAILY_WAGE', rate: 620, amount: 620, certifiedBy: 'R. Vasanth', status: 'CERTIFIED' },
  { uid: 'cl-02', attendanceDate: d(0), contractorCode: 'CON-001', contractorName: 'Sri Balaji Manpower Services', labourName: 'K. Sathish', labourId: 'CL-0118', department: 'Stores & Dispatch', workCentre: 'Packing', shiftCode: 'SH-A', hoursWorked: 10, unitsProduced: 0, rateBasis: 'DAILY_WAGE', rate: 620, amount: 775, certifiedBy: 'R. Vasanth', status: 'CERTIFIED' },
  { uid: 'cl-03', attendanceDate: d(0), contractorCode: 'CON-002', contractorName: 'Kavin Industrial Contractors', labourName: 'P. Manikandan', labourId: 'CL-0206', department: 'Polishing & Finishing', workCentre: 'Polishing', shiftCode: 'SH-A', hoursWorked: 8, unitsProduced: 412, rateBasis: 'PIECE_RATE', rate: 1.8, amount: 742, certifiedBy: null, status: 'RECORDED' },
  { uid: 'cl-04', attendanceDate: d(0), contractorCode: 'CON-002', contractorName: 'Kavin Industrial Contractors', labourName: 'R. Dhanasekar', labourId: 'CL-0211', department: 'Polishing & Finishing', workCentre: 'Polishing', shiftCode: 'SH-B', hoursWorked: 8, unitsProduced: 388, rateBasis: 'PIECE_RATE', rate: 1.8, amount: 698, certifiedBy: null, status: 'RECORDED' },
  { uid: 'cl-05', attendanceDate: d(1), contractorCode: 'CON-001', contractorName: 'Sri Balaji Manpower Services', labourName: 'A. Murugan', labourId: 'CL-0114', department: 'Stores & Dispatch', workCentre: 'Packing', shiftCode: 'SH-A', hoursWorked: 8, unitsProduced: 0, rateBasis: 'DAILY_WAGE', rate: 620, amount: 620, certifiedBy: 'R. Vasanth', status: 'BILLED' },
  { uid: 'cl-06', attendanceDate: d(1), contractorCode: 'CON-002', contractorName: 'Kavin Industrial Contractors', labourName: 'P. Manikandan', labourId: 'CL-0206', department: 'Polishing & Finishing', workCentre: 'Polishing', shiftCode: 'SH-A', hoursWorked: 8, unitsProduced: 366, rateBasis: 'PIECE_RATE', rate: 1.8, amount: 659, certifiedBy: 'Meera Rajan', status: 'DISPUTED' },
]

export const contractorBills: ContractorBill[] = [
  { uid: 'cb-01', docNo: 'CB/2607/0088', contractorCode: 'CON-001', contractorName: 'Sri Balaji Manpower Services', period: PERIOD, labourDays: 728, totalHours: 5_968, unitsProduced: 0, grossAmount: 451_360, pfDeduction: 0, esiDeduction: 0, otherDeduction: 4_200, netPayable: 447_160, submittedOn: d(3), certifiedBy: 'R. Vasanth', approvedBy: null, complianceVerified: true, status: 'CERTIFIED', holdReason: null },
  { uid: 'cb-02', docNo: 'CB/2607/0089', contractorCode: 'CON-002', contractorName: 'Kavin Industrial Contractors', period: PERIOD, labourDays: 416, totalHours: 3_328, unitsProduced: 168_400, grossAmount: 303_120, pfDeduction: 0, esiDeduction: 9_852, otherDeduction: 0, netPayable: 293_268, submittedOn: d(2), certifiedBy: null, approvedBy: null, complianceVerified: false, status: 'ON_HOLD', holdReason: 'ESI compliance not evidenced for June, and the CLRA licence expired 18 days ago. As principal employer we carry the liability.' },
  { uid: 'cb-03', docNo: 'CB/2606/0081', contractorCode: 'CON-001', contractorName: 'Sri Balaji Manpower Services', period: '2026-06', labourDays: 702, totalHours: 5_744, unitsProduced: 0, grossAmount: 435_240, pfDeduction: 0, esiDeduction: 0, otherDeduction: 2_800, netPayable: 432_440, submittedOn: d(33), certifiedBy: 'R. Vasanth', approvedBy: 'Meera Rajan', complianceVerified: true, status: 'PAID', holdReason: null },
  { uid: 'cb-04', docNo: 'CB/2606/0082', contractorCode: 'CON-003', contractorName: 'Annai Housekeeping', period: '2026-06', labourDays: 234, totalHours: 1_872, unitsProduced: 0, grossAmount: 165_600, pfDeduction: 0, esiDeduction: 5_382, otherDeduction: 0, netPayable: 160_218, submittedOn: d(31), certifiedBy: 'HR Desk', approvedBy: 'Meera Rajan', complianceVerified: true, status: 'PAID', holdReason: null },
]

/* ════════════════════════ Statutory returns ═════════════════════════ */

const totalPf = payslips.reduce((s, p) => s + (p.deductions.find((x) => x.code === 'PF')?.amount ?? 0) + p.employerPf, 0)
const totalEsi = payslips.reduce((s, p) => s + (p.deductions.find((x) => x.code === 'ESI')?.amount ?? 0) + p.employerEsi, 0)
const totalPt = payslips.reduce((s, p) => s + (p.deductions.find((x) => x.code === 'PT')?.amount ?? 0), 0)
const totalTds = payslips.reduce((s, p) => s + (p.deductions.find((x) => x.code === 'TDS')?.amount ?? 0), 0)

export const statutoryReturns: StatutoryReturn[] = [
  { uid: 'st-01', code: 'ECR', name: 'PF electronic challan-cum-return', act: 'EPF & MP Act, 1952', authority: 'EPFO', period: PERIOD, frequency: 'MONTHLY', dueOn: fwd(15), employeeCount: payslips.filter((p) => p.deductions.some((x) => x.code === 'PF')).length, amountPayable: totalPf, challanNo: null, paidOn: null, filedOn: null, acknowledgementNo: null, preparedBy: null, status: 'PENDING' },
  { uid: 'st-02', code: 'ESI-RET', name: 'ESI monthly contribution', act: "Employees' State Insurance Act, 1948", authority: 'ESIC', period: PERIOD, frequency: 'MONTHLY', dueOn: fwd(15), employeeCount: payslips.filter((p) => p.deductions.some((x) => x.code === 'ESI')).length, amountPayable: totalEsi, challanNo: null, paidOn: null, filedOn: null, acknowledgementNo: null, preparedBy: null, status: 'PENDING' },
  { uid: 'st-03', code: 'PT-TN', name: 'Professional tax — Greater Chennai Corporation', act: 'TN Town Panchayats etc. (Taxation) Act', authority: 'GCC', period: '2026-Q2', frequency: 'HALF_YEARLY', dueOn: fwd(45), employeeCount: payslips.filter((p) => p.deductions.some((x) => x.code === 'PT')).length, amountPayable: totalPt * 6, challanNo: null, paidOn: null, filedOn: null, acknowledgementNo: null, preparedBy: null, status: 'NOT_DUE' },
  { uid: 'st-04', code: '24Q', name: 'TDS return — salaries (Form 24Q)', act: 'Income Tax Act, 1961', authority: 'Income Tax Department', period: '2026-Q1', frequency: 'QUARTERLY', dueOn: d(3), employeeCount: payslips.filter((p) => p.deductions.some((x) => x.code === 'TDS')).length, amountPayable: totalTds * 3, challanNo: 'ITNS281/0044182', paidOn: d(9), filedOn: null, acknowledgementNo: null, preparedBy: 'Accounts', status: 'OVERDUE', remarks: 'Challan paid on time but the quarterly return has not been filed. Late filing attracts ₹200 per day under section 234E.' },
  { uid: 'st-05', code: 'LWF-TN', name: 'Labour welfare fund', act: 'TN Labour Welfare Fund Act, 1972', authority: 'TN LWF Board', period: '2026', frequency: 'ANNUAL', dueOn: fwd(160), employeeCount: payslips.length, amountPayable: payslips.length * 20, challanNo: null, paidOn: null, filedOn: null, acknowledgementNo: null, preparedBy: null, status: 'NOT_DUE' },
  { uid: 'st-06', code: 'ECR-JUN', name: 'PF electronic challan-cum-return', act: 'EPF & MP Act, 1952', authority: 'EPFO', period: '2026-06', frequency: 'MONTHLY', dueOn: d(15), employeeCount: 19, amountPayable: 136_800, challanNo: 'ECR/2606/0044118', paidOn: d(18), filedOn: d(18), acknowledgementNo: 'ACK/EPFO/8841204', preparedBy: 'Accounts', status: 'FILED' },
  { uid: 'st-07', code: 'ESI-JUN', name: 'ESI monthly contribution', act: "Employees' State Insurance Act, 1948", authority: 'ESIC', period: '2026-06', frequency: 'MONTHLY', dueOn: d(15), employeeCount: 4, amountPayable: 8_240, challanNo: 'ESIC/2606/0011482', paidOn: d(17), filedOn: d(17), acknowledgementNo: 'ACK/ESIC/2204118', preparedBy: 'Accounts', status: 'FILED' },
  { uid: 'st-08', code: 'FORM-D', name: 'Annual return — Factories Act', act: 'Factories Act, 1948', authority: 'TN Directorate of Industrial Safety', period: '2025', frequency: 'ANNUAL', dueOn: d(210), employeeCount: 232, amountPayable: 0, challanNo: null, paidOn: null, filedOn: d(214), acknowledgementNo: 'DISH/TN/2025/44821', preparedBy: 'HR Desk', status: 'FILED' },
]

/* ═══════════════════════════ Chart series ══════════════════════════════ */

export const headcountByDepartment: HeadcountPoint[] = [
  { department: 'Press Shop', permanent: 38, contract: 6, trainee: 0, sanctioned: 48 },
  { department: 'Welding & Vacuum', permanent: 28, contract: 4, trainee: 0, sanctioned: 36 },
  { department: 'Polishing', permanent: 10, contract: 16, trainee: 0, sanctioned: 30 },
  { department: 'Quality Control', permanent: 14, contract: 1, trainee: 2, sanctioned: 18 },
  { department: 'Stores & Dispatch', permanent: 12, contract: 8, trainee: 0, sanctioned: 22 },
  { department: 'Maintenance', permanent: 11, contract: 1, trainee: 0, sanctioned: 14 },
  { department: 'Administration', permanent: 13, contract: 0, trainee: 1, sanctioned: 14 },
]

export const payrollTrend: PayrollTrendPoint[] = [
  { period: 'Feb', gross: 1_326_400, overtime: 42_800, incentive: 28_400, headcount: 17 },
  { period: 'Mar', gross: 1_362_800, overtime: 51_200, incentive: 31_600, headcount: 17 },
  { period: 'Apr', gross: 1_388_200, overtime: 68_400, incentive: 26_800, headcount: 18 },
  { period: 'May', gross: 1_412_800, overtime: 74_600, incentive: 33_200, headcount: 18 },
  { period: 'Jun', gross: 1_486_200, overtime: 88_200, incentive: 36_400, headcount: 19 },
  { period: 'Jul', gross: payslips.reduce((s, p) => s + p.grossEarnings, 0), overtime: payslips.reduce((s, p) => s + (p.earnings.find((x) => x.code === 'OT')?.amount ?? 0), 0), incentive: payslips.reduce((s, p) => s + p.incentiveAmount, 0), headcount: payslips.length },
]

export const attritionTrend: AttritionPoint[] = [
  { month: 'Feb', joined: 2, exited: 1, attritionPct: 0.6 },
  { month: 'Mar', joined: 1, exited: 3, attritionPct: 1.8 },
  { month: 'Apr', joined: 4, exited: 2, attritionPct: 1.2 },
  { month: 'May', joined: 2, exited: 4, attritionPct: 2.4 },
  { month: 'Jun', joined: 3, exited: 2, attritionPct: 1.2 },
  { month: 'Jul', joined: 1, exited: 1, attritionPct: 0.6 },
]

export const productivityTrend: ProductivityPoint[] = [
  { period: 'Feb', unitsPerOperator: 1_042, unitsPerLabourHour: 5.8, labourCostPerBottle: 3.62, operatorEfficiencyPct: 88.4 },
  { period: 'Mar', unitsPerOperator: 1_088, unitsPerLabourHour: 6.1, labourCostPerBottle: 3.48, operatorEfficiencyPct: 90.2 },
  { period: 'Apr', unitsPerOperator: 1_064, unitsPerLabourHour: 5.9, labourCostPerBottle: 3.56, operatorEfficiencyPct: 89.1 },
  { period: 'May', unitsPerOperator: 1_126, unitsPerLabourHour: 6.4, labourCostPerBottle: 3.34, operatorEfficiencyPct: 92.6 },
  { period: 'Jun', unitsPerOperator: 1_148, unitsPerLabourHour: 6.5, labourCostPerBottle: 3.28, operatorEfficiencyPct: 93.4 },
  { period: 'Jul', unitsPerOperator: 1_096, unitsPerLabourHour: 6.2, labourCostPerBottle: 3.41, operatorEfficiencyPct: 90.8 },
]
