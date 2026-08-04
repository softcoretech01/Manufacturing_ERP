import { DomainAnalytics } from '@/components/bi/DomainAnalytics'
import { attendanceTrend, attritionTrend, headcountByDepartment, productivityTrend } from '@/mock/bi'

/**
 * Workforce analytics — attendance, productivity, attrition and the sanctioned
 * versus actual headcount by department.
 *
 * Everything here is gated on BI.PEOPLE.VIEW rather than the financial flag,
 * because these figures resolve to named individuals one drill-down away. A
 * department attrition rate is a statistic; the four people behind it are not.
 */
export function BiWorkforcePage() {
  const staffing = headcountByDepartment.map((d) => {
    const actual = d.permanent + d.contract + d.trainee
    return {
      department: d.department.length > 18 ? `${d.department.slice(0, 16)}…` : d.department,
      full: d.department,
      actual,
      sanctioned: d.sanctioned,
      gap: d.sanctioned - actual,
      contractSharePct: actual ? (d.contract / actual) * 100 : 0,
    }
  })

  return (
    <DomainAnalytics
      title="Workforce analytics"
      breadcrumbLabel="Workforce"
      kpiCodes={['HR-ATT', 'HR-ATTR', 'HR-LCB', 'HR-PROD']}
      filters={['period', 'plant', 'shift']}
      modules={['HRMS', 'PRODUCTION']}
      sourceNote="Attendance is from the swipe records that payroll uses, so these figures and the payslips agree by construction. Individual records need HRMS access, not BI access."
      charts={[
        {
          title: 'Attendance and overtime',
          description: 'People present, absent and on leave, with overtime hours on the right axis',
          data: attendanceTrend as unknown as Record<string, string | number>[],
          xKey: 'day',
          bars: [
            { key: 'present', name: 'Present', colour: '#10b981' },
            { key: 'absent', name: 'Absent', colour: '#ef4444' },
            { key: 'onLeave', name: 'On leave', colour: '#f59e0b' },
          ],
          lines: [{ key: 'overtimeHours', name: 'Overtime (h)', colour: '#7c3aed', yAxis: 'right' }],
          drillTo: '/hrms/attendance',
          drillLabel: 'Attendance',
          peopleOnly: true,
          reading:
            'Overtime climbing on the same days absence climbs is the plant covering gaps with the people already there. It holds output up and pushes labour cost per bottle up with it.',
        },
        {
          title: 'Productivity and labour cost',
          description: 'Units per operator against the labour cost carried by each bottle',
          data: productivityTrend as unknown as Record<string, string | number>[],
          xKey: 'period',
          bars: [{ key: 'unitsPerOperator', name: 'Units per operator', colour: '#0ea5e9' }],
          lines: [
            { key: 'labourCostPerBottle', name: 'Labour ₹/bottle', colour: '#ef4444', yAxis: 'right' },
            { key: 'operatorEfficiencyPct', name: 'Efficiency %', colour: '#10b981', yAxis: 'right' },
          ],
          rightAxisDomain: [0, 100],
          drillTo: '/hrms/labour-cost',
          drillLabel: 'Labour cost',
          peopleOnly: true,
          reading:
            'The two should move opposite each other. When units per operator rises and cost per bottle rises with it, the extra output was bought with overtime rather than won with efficiency.',
        },
        {
          title: 'Joiners against leavers',
          description: 'Monthly movement with the attrition rate on the right axis',
          data: attritionTrend as unknown as Record<string, string | number>[],
          xKey: 'month',
          bars: [
            { key: 'joined', name: 'Joined', colour: '#10b981' },
            { key: 'exited', name: 'Exited', colour: '#ef4444' },
          ],
          lines: [{ key: 'attritionPct', name: 'Attrition %', colour: '#7c3aed', yAxis: 'right' }],
          rightAxisDomain: [0, 5],
          drillTo: '/hrms',
          drillLabel: 'Employees',
          peopleOnly: true,
          reading:
            'Exits ahead of joiners for three months running is a staffing gap forming, and on a skilled operation it shows up in yield before it shows up in output.',
        },
        {
          title: 'Sanctioned against actual headcount',
          description: 'Where the plant is running short of the approved strength',
          data: staffing as unknown as Record<string, string | number>[],
          xKey: 'department',
          bars: [
            { key: 'actual', name: 'On roll', colour: '#0ea5e9' },
            { key: 'sanctioned', name: 'Sanctioned', colour: '#94a3b8' },
          ],
          drillTo: '/hrms/organisation',
          drillLabel: 'Organisation',
          peopleOnly: true,
          reading:
            'A department running below sanctioned strength for a whole quarter is either over-sanctioned or quietly absorbing the shortfall in overtime. Both are worth deciding deliberately.',
        },
      ]}
      ranked={[
        {
          title: 'Staffing gap by department',
          description: 'Shortfall against sanctioned strength, with the contract share behind it',
          rows: staffing
            .slice()
            .sort((a, b) => b.gap - a.gap)
            .map((s) => ({
              label: s.full,
              sub: `${s.actual} on roll against ${s.sanctioned} sanctioned · ${s.contractSharePct.toFixed(0)}% on contract`,
              value: Math.max(s.gap, 0),
              status: s.gap >= 6 ? ('bad' as const) : s.gap > 0 ? ('watch' as const) : ('good' as const),
            })),
          format: (n) => (n === 0 ? 'Full strength' : `${n} short`),
          drillTo: '/hrms/requisitions',
          drillLabel: 'Manpower requisitions',
          peopleOnly: true,
        },
      ]}
    />
  )
}
