import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { DueCell, EmployeeCell, HrStatusBadge, SKILL_LEVEL_LABEL, SkillLevelMeter } from '@/components/hrms/HrmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { employeeSkills as seedSkills, hrEmployees as seedEmployees, skillDefinitions as seedDefs } from '@/mock/hrms'
import type { EmployeeSkill, HrEmployee, SkillDefinition, SkillLevel } from '@/types/hrms'

const LEVELS: SkillLevel[] = ['BEGINNER', 'INTERMEDIATE', 'SKILLED', 'EXPERT', 'TRAINER']

const TABS = [
  { id: 'MATRIX', label: 'Skill matrix' },
  { id: 'PEOPLE', label: 'By person' },
  { id: 'SKILLS', label: 'Skill definitions' },
]

/**
 * Skill matrix — who can run what, at what level, and whether the certification
 * is still current. This is what makes operator assignment safe: a skill marked
 * critical with a minimum level to operate means the roster can refuse to put an
 * uncertified person on that machine alone.
 */
export function SkillsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const skillSeed = useMemo(() => seedSkills, [])
  const defSeed = useMemo(() => seedDefs, [])
  const empSeed = useMemo(() => seedEmployees, [])

  const defCrud = useCrud<SkillDefinition>({
    key: 'hrms:skill-definition',
    seed: defSeed,
    entity: 'Skill',
    titleOf: (s) => `${s.name} (${s.code})`,
    fields: [
      { name: 'code', label: 'Skill code', required: true, upper: true },
      { name: 'name', label: 'Skill name', required: true },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: [
          { value: 'MACHINE', label: 'Machine' },
          { value: 'PROCESS', label: 'Process' },
          { value: 'QUALITY', label: 'Quality' },
          { value: 'HANDLING', label: 'Handling' },
          { value: 'SAFETY', label: 'Safety' },
        ],
      },
      { name: 'workCentre', label: 'Work centre' },
      {
        name: 'minLevelToOperate',
        label: 'Minimum level to operate alone',
        type: 'select',
        required: true,
        options: LEVELS.map((l) => ({ value: l, label: SKILL_LEVEL_LABEL[l] })),
      },
      {
        name: 'criticality',
        label: 'Criticality',
        type: 'select',
        required: true,
        options: [
          { value: 'LOW', label: 'Low' },
          { value: 'MEDIUM', label: 'Medium' },
          { value: 'HIGH', label: 'High' },
          { value: 'CRITICAL', label: 'Critical' },
        ],
      },
      { name: 'requiredHeadcount', label: 'Certified people needed', type: 'number', required: true },
      { name: 'certificationValidMonths', label: 'Certification valid (months)', type: 'number', showIf: (v) => v.requiresCertification === 'true' },
      { name: 'requiresCertification', label: 'Needs certification', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (s) => ({
      code: s.code,
      name: s.name,
      category: s.category,
      workCentre: s.workCentre ?? '',
      minLevelToOperate: s.minLevelToOperate,
      criticality: s.criticality,
      requiredHeadcount: String(s.requiredHeadcount),
      certificationValidMonths: s.certificationValidMonths === null ? '' : String(s.certificationValidMonths),
      requiresCertification: String(s.requiresCertification),
      isActive: String(s.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? {}),
      code: v.code,
      name: v.name,
      category: v.category as SkillDefinition['category'],
      workCentre: v.workCentre || null,
      minLevelToOperate: v.minLevelToOperate as SkillLevel,
      criticality: v.criticality as SkillDefinition['criticality'],
      requiredHeadcount: Number(v.requiredHeadcount) || 0,
      certificationValidMonths: v.certificationValidMonths ? Number(v.certificationValidMonths) : null,
      requiresCertification: v.requiresCertification === 'true',
      isActive: v.isActive !== 'false',
    }),
    blockDelete: (s) => {
      const held = skillSeed.filter((x) => x.skillCode === s.code)
      return held.length
        ? `${s.name} is held by ${held.length} employee${held.length === 1 ? '' : 's'}. Deleting it would erase their certification history.`
        : undefined
    },
  })

  const definitions = defCrud.rows
  const { rows: skills, update: updateSkill } = useCollection<EmployeeSkill>('hrms:employee-skill', skillSeed)
  const { rows: employees } = useCollection<HrEmployee>('hrms:employee', empSeed)

  const [tab, setTab] = useState('MATRIX')
  const [assessing, setAssessing] = useState<EmployeeSkill | null>(null)
  const [newLevel, setNewLevel] = useState<SkillLevel>('SKILLED')

  const levelIndex = (l: SkillLevel) => LEVELS.indexOf(l)
  const canOperateAlone = (s: EmployeeSkill) => {
    const def = definitions.find((d) => d.code === s.skillCode)
    if (!def) return false
    return (
      levelIndex(s.level) >= levelIndex(def.minLevelToOperate) &&
      (!def.requiresCertification || s.status === 'CERTIFIED' || s.status === 'EXPIRING')
    )
  }

  const expiring = skills.filter((s) => s.status === 'EXPIRING')
  const expired = skills.filter((s) => s.status === 'EXPIRED')

  /** Where the plant is short of certified people against the requirement. */
  const gaps = definitions
    .filter((d) => d.isActive)
    .map((d) => {
      const certified = skills.filter((s) => s.skillCode === d.code && canOperateAlone(s))
      return { def: d, certified: certified.length, gap: d.requiredHeadcount - certified.length }
    })
    .filter((g) => g.gap > 0)
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
      return order[a.def.criticality] - order[b.def.criticality] || b.gap - a.gap
    })

  const shopFloor = employees.filter((e) => e.isShopFloor && e.status !== 'EXITED')

  const skillColumns: Column<EmployeeSkill>[] = [
    { key: 'employeeCode', header: 'Employee', sortable: true, width: '14rem', render: (s) => (
      <EmployeeCell name={s.employeeName} code={s.employeeCode} sub={s.department} />
    ) },
    { key: 'skillName', header: 'Skill', sortable: true, render: (s) => {
      const def = definitions.find((d) => d.code === s.skillCode)
      return (
        <div className="min-w-0">
          <p className="truncate text-xs text-fg">{s.skillName}</p>
          <p className="truncate text-2xs text-fg-subtle">
            {def?.workCentre ?? 'no work centre'}
            {def?.criticality === 'CRITICAL' ? ' · critical' : ''}
          </p>
        </div>
      )
    } },
    { key: 'level', header: 'Level', sortable: true, width: '12rem', accessor: (s) => levelIndex(s.level), render: (s) => <SkillLevelMeter level={s.level} /> },
    { key: 'canOperate', header: 'Can run it alone', width: '12rem', accessor: (s) => (canOperateAlone(s) ? 1 : 0), render: (s) => {
      const def = definitions.find((d) => d.code === s.skillCode)
      return canOperateAlone(s) ? (
        <Badge tone="success" size="sm" dot={false}>yes</Badge>
      ) : (
        <span className="text-2xs text-danger">
          needs {SKILL_LEVEL_LABEL[def?.minLevelToOperate ?? 'SKILLED'].toLowerCase()}
          {def?.requiresCertification && s.status !== 'CERTIFIED' ? ' & valid certificate' : ''}
        </span>
      )
    } },
    { key: 'certifiedOn', header: 'Certified', sortable: true, width: '10rem', accessor: (s) => s.certifiedOn ?? '', render: (s) => (
      s.certifiedOn ? (
        <div className="min-w-0">
          <p className="text-xs text-fg">{formatDate(s.certifiedOn)}</p>
          <p className="truncate text-2xs text-fg-subtle">by {s.assessedBy}</p>
        </div>
      ) : (
        <span className="text-2xs text-warning">not certified</span>
      )
    ) },
    { key: 'certificationExpiresOn', header: 'Expires', sortable: true, width: '10rem', accessor: (s) => s.certificationExpiresOn ?? '', render: (s) => (
      s.certificationExpiresOn ? <DueCell date={s.certificationExpiresOn} /> : <span className="text-2xs text-fg-subtle">no expiry</span>
    ) },
    { key: 'unitsPerHour', header: 'Output/hour', align: 'right', width: '10rem', sortable: true, render: (s) => (
      s.unitsPerHour ? <span className="tabular text-xs">{s.unitsPerHour}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'defectRatePct', header: 'Defect rate', align: 'right', width: '9.5rem', sortable: true, render: (s) => (
      s.defectRatePct === null
        ? <span className="text-2xs text-fg-subtle">—</span>
        : <span className={cn('tabular text-xs', s.defectRatePct <= 1.5 ? 'text-success' : 'text-warning')}>{s.defectRatePct}%</span>
    ) },
    { key: 'lastOperatedOn', header: 'Last operated', sortable: true, width: '10rem', defaultHidden: true, accessor: (s) => s.lastOperatedOn ?? '', render: (s) => (
      s.lastOperatedOn ? <span className="text-2xs">{formatDate(s.lastOperatedOn)}</span> : <span className="text-2xs text-fg-subtle">never</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '9.5rem', render: (s) => <HrStatusBadge status={s.status} size="sm" /> },
  ]

  const defColumns: Column<SkillDefinition>[] = [
    { key: 'code', header: 'Skill', sortable: true, width: '15rem', render: (d) => (
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-fg">{d.name}</p>
        <p className="font-mono text-2xs text-fg-subtle">{d.code}</p>
      </div>
    ) },
    { key: 'category', header: 'Category', sortable: true, width: '9rem', render: (d) => (
      <Badge tone="neutral" size="sm" dot={false}>{d.category.toLowerCase()}</Badge>
    ) },
    { key: 'workCentre', header: 'Work centre', sortable: true, render: (d) => (
      d.workCentre ? <span className="text-xs">{d.workCentre}</span> : <span className="text-2xs text-fg-subtle">any</span>
    ) },
    { key: 'criticality', header: 'Criticality', sortable: true, width: '9.5rem', render: (d) => (
      <Badge
        tone={d.criticality === 'CRITICAL' ? 'danger' : d.criticality === 'HIGH' ? 'warning' : 'neutral'}
        size="sm"
        dot={d.criticality === 'CRITICAL'}
      >
        {d.criticality.toLowerCase()}
      </Badge>
    ) },
    { key: 'minLevelToOperate', header: 'Minimum to run alone', width: '13rem', render: (d) => (
      <SkillLevelMeter level={d.minLevelToOperate} />
    ) },
    { key: 'requiresCertification', header: 'Certification', width: '12rem', accessor: (d) => (d.requiresCertification ? 1 : 0), render: (d) => (
      d.requiresCertification
        ? <span className="text-2xs text-fg-muted">valid {d.certificationValidMonths} months</span>
        : <span className="text-2xs text-fg-subtle">not required</span>
    ) },
    { key: 'coverage', header: 'Certified vs needed', width: '13rem', accessor: (d) => skills.filter((s) => s.skillCode === d.code && canOperateAlone(s)).length, render: (d) => {
      const have = skills.filter((s) => s.skillCode === d.code && canOperateAlone(s)).length
      const gap = d.requiredHeadcount - have
      return (
        <span className={cn('tabular text-xs', gap > 0 ? 'font-medium text-danger' : 'text-success')}>
          {have} of {d.requiredHeadcount}
          {gap > 0 ? ` — short ${gap}` : ''}
        </span>
      )
    } },
    { key: 'isActive', header: 'Status', align: 'center', width: '7.5rem', sortable: true, accessor: (d) => (d.isActive ? 1 : 0), render: (d) => (
      <HrStatusBadge status={d.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'SKILLS'
          ? exportRows(format, 'skill-definitions', 'Skill definitions', columnsFromTable(defColumns), definitions)
          : exportRows(format, 'skill-matrix', 'Skill matrix', columnsFromTable(skillColumns), skills)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Skill matrix"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'HR & payroll', to: '/hrms' }, { label: 'Skills' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hrms/training')}>Training</Button>
            {tab === 'SKILLS' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => defCrud.openCreate({ category: 'MACHINE', minLevelToOperate: 'SKILLED', criticality: 'MEDIUM', requiredHeadcount: '4', requiresCertification: 'true', certificationValidMonths: '24', isActive: 'true' })}
              >
                Add a skill
              </Button>
            )}
          </>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg tabular">{skills.filter(canOperateAlone).length}</span> of {skills.length} skill
        records allow the person to run the operation alone
        {expiring.length > 0 && <> · <span className="font-medium text-warning">{expiring.length}</span> certification{expiring.length === 1 ? '' : 's'} expiring inside 60 days</>}
        {expired.length > 0 && <> · <span className="font-medium text-danger">{expired.length}</span> already expired</>}
        {gaps.length > 0 && <> · <span className="font-medium text-danger">{gaps.length}</span> skill{gaps.length === 1 ? '' : 's'} short of the required crew</>}
      </p>

      {(gaps.length > 0 || expired.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Coverage risks" description="Critical skills first — these are the ones that stop a line" />
          <CardBody className="space-y-2">
            {gaps.map((g) => (
              <div
                key={g.def.code}
                className={cn('rounded border p-2.5', g.def.criticality === 'CRITICAL' ? 'border-danger/30 bg-danger/5' : 'border-warning/30 bg-warning/5')}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">
                      {g.def.name} — short {g.gap} certified {g.gap === 1 ? 'person' : 'people'}
                    </p>
                    <p className="text-2xs text-fg-muted">
                      {g.certified} certified against a requirement of {g.def.requiredHeadcount} ·{' '}
                      {g.def.criticality.toLowerCase()} criticality · needs {SKILL_LEVEL_LABEL[g.def.minLevelToOperate].toLowerCase()} to run alone
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate('/hrms/training')}>
                    Plan training
                  </Button>
                </div>
              </div>
            ))}
            {expired.map((s) => (
              <div key={s.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {s.employeeName}'s {s.skillName} certification has expired
                  </p>
                  <p className="text-2xs text-fg-muted">
                    Expired {s.certificationExpiresOn ? formatDate(s.certificationExpiresOn) : ''} — they cannot be rostered onto
                    this operation alone until it is renewed.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setAssessing(s); setNewLevel(s.level) }}>
                  Re-assess
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === 'MATRIX' ? (
        <Card>
          <CardHeader
            title="Who can run what"
            description="A filled meter means certified and current at that level; an empty cell means no record at all"
          />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 bg-surface px-2 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                      Operator
                    </th>
                    {definitions.filter((d) => d.isActive).map((d) => (
                      <th key={d.code} className="px-2 py-2 text-left text-2xs font-medium text-fg-muted" title={d.name}>
                        <span className="block max-w-[5.5rem] truncate">{d.name}</span>
                        {d.criticality === 'CRITICAL' && <span className="text-danger">critical</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shopFloor.map((e) => (
                    <tr key={e.uid} className="border-b border-border/70 hover:bg-surface-2">
                      <td className="sticky left-0 bg-surface px-2 py-1.5">
                        <p className="truncate text-xs font-medium text-fg">{e.fullName}</p>
                        <p className="truncate font-mono text-2xs text-fg-subtle">{e.employeeCode}</p>
                      </td>
                      {definitions.filter((d) => d.isActive).map((d) => {
                        const s = skills.find((x) => x.employeeCode === e.employeeCode && x.skillCode === d.code)
                        if (!s) return <td key={d.code} className="px-2 py-1.5 text-center text-2xs text-fg-subtle">—</td>
                        return (
                          <td key={d.code} className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => { setAssessing(s); setNewLevel(s.level) }}
                              title={`${SKILL_LEVEL_LABEL[s.level]} · ${s.status.toLowerCase()}`}
                              className="flex flex-col gap-0.5"
                            >
                              <SkillLevelMeter level={s.level} compact />
                              {(s.status === 'EXPIRED' || s.status === 'EXPIRING') && (
                                <span className={cn('text-[9px]', s.status === 'EXPIRED' ? 'text-danger' : 'text-warning')}>
                                  {s.status.toLowerCase()}
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-2xs leading-relaxed text-fg-muted">
              Click any cell to re-assess. The roster reads this matrix directly — an operator below the minimum level for a skill
              cannot be placed on that work centre alone, which is checked on the{' '}
              <button type="button" onClick={() => navigate('/hrms/shifts')} className="font-medium text-brand-600 hover:underline">
                roster screen
              </button>.
            </p>
          </CardBody>
        </Card>
      ) : tab === 'PEOPLE' ? (
        <DataTable
          rows={skills}
          columns={skillColumns}
          rowKey={(s) => s.uid}
          searchPlaceholder="Search employee, skill or department…"
          onExport={doExport}
          emptyTitle="No skill records"
          rowClassName={(s) => cn(
            s.status === 'EXPIRED' && 'bg-danger/[0.04]',
            s.status === 'EXPIRING' && 'bg-warning/[0.04]',
            !canOperateAlone(s) && 'bg-warning/[0.02]',
          )}
          rowActions={(s) => (
            <>
              <MenuItem label="Edit — re-assess the level" onClick={() => { setAssessing(s); setNewLevel(s.level) }} />
              <MenuItem
                label="Delete the skill record"
                danger
                onClick={() => {
                  updateSkill(s.uid, { level: 'BEGINNER', certifiedOn: null, certificationExpiresOn: null, status: 'NOT_CERTIFIED', assessedBy: null })
                  toast.success(
                    'Certification removed',
                    `${s.employeeName} is no longer certified for ${s.skillName} and cannot be rostered onto it alone.`,
                  )
                }}
              />
              <MenuItem
                separatorBefore
                label="Renew the certification"
                disabled={s.status === 'CERTIFIED'}
                onClick={() => {
                  const def = definitions.find((d) => d.code === s.skillCode)
                  const months = def?.certificationValidMonths ?? 24
                  const expires = new Date(Date.now() + months * 30 * 86_400_000).toISOString().slice(0, 10)
                  updateSkill(s.uid, {
                    certifiedOn: new Date().toISOString().slice(0, 10),
                    certificationExpiresOn: expires,
                    status: 'CERTIFIED',
                    assessedBy: 'Prakash Menon',
                  })
                  toast.success('Certification renewed', `${s.employeeName} is certified for ${s.skillName} until ${formatDate(expires)}.`)
                }}
              />
              <MenuItem label="Plan training" onClick={() => navigate('/hrms/training')} />
              <MenuItem label="Open the employee" onClick={() => navigate('/hrms/employees')} />
            </>
          )}
        />
      ) : (
        <DataTable
          rows={definitions}
          columns={defColumns}
          rowKey={(d) => d.uid}
          searchPlaceholder="Search skill, code, category or work centre…"
          onExport={doExport}
          emptyTitle="No skills defined"
          rowClassName={(d) => cn(
            !d.isActive && 'opacity-60',
            d.criticality === 'CRITICAL' && skills.filter((s) => s.skillCode === d.code && canOperateAlone(s)).length < d.requiredHeadcount && 'bg-danger/[0.04]',
          )}
          rowActions={(d) => (
            <>
              <MenuItem label="Edit the skill" onClick={() => defCrud.openEdit(d)} />
              <MenuItem label="Delete the skill" danger onClick={() => defCrud.askDelete(d)} />
              <MenuItem
                separatorBefore
                label={d.isActive ? 'Deactivate' : 'Activate'}
                onClick={() => {
                  defCrud.update(d.uid, { isActive: !d.isActive })
                  toast.success(d.isActive ? 'Skill deactivated' : 'Skill activated', `${d.name} updated.`)
                }}
              />
              <MenuItem label="See who holds it" onClick={() => setTab('PEOPLE')} />
            </>
          )}
        />
      )}

      {/* Re-assess --------------------------------------------------------- */}
      <Modal
        open={!!assessing}
        onClose={() => setAssessing(null)}
        title={assessing ? `Assess ${assessing.employeeName} — ${assessing.skillName}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssessing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!assessing) return
                const def = definitions.find((d) => d.code === assessing.skillCode)
                const months = def?.certificationValidMonths ?? null
                const expires = months ? new Date(Date.now() + months * 30 * 86_400_000).toISOString().slice(0, 10) : null
                updateSkill(assessing.uid, {
                  level: newLevel,
                  certifiedOn: new Date().toISOString().slice(0, 10),
                  certificationExpiresOn: expires,
                  status: 'CERTIFIED',
                  assessedBy: 'Prakash Menon',
                })
                const nowCan = levelIndex(newLevel) >= levelIndex(def?.minLevelToOperate ?? 'SKILLED')
                toast.success(
                  'Assessment recorded',
                  nowCan
                    ? `${assessing.employeeName} is assessed at ${SKILL_LEVEL_LABEL[newLevel].toLowerCase()} and can now run ${assessing.skillName.toLowerCase()} alone${expires ? `, valid to ${formatDate(expires)}` : ''}.`
                    : `${assessing.employeeName} is assessed at ${SKILL_LEVEL_LABEL[newLevel].toLowerCase()}, which is below the ${SKILL_LEVEL_LABEL[def?.minLevelToOperate ?? 'SKILLED'].toLowerCase()} needed to run this alone. They can still work it alongside a trainer.`,
                )
                setAssessing(null)
              }}
            >
              Record assessment
            </Button>
          </>
        }
      >
        {assessing && (() => {
          const def = definitions.find((d) => d.code === assessing.skillCode)
          return (
            <div className="space-y-3.5">
              <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                <p className="font-medium text-fg">{assessing.skillName}</p>
                <p className="mt-1 text-fg-muted">
                  {def?.criticality.toLowerCase()} criticality · needs{' '}
                  {SKILL_LEVEL_LABEL[def?.minLevelToOperate ?? 'SKILLED'].toLowerCase()} to run alone
                  {def?.requiresCertification ? ` · certification valid ${def.certificationValidMonths} months` : ' · no certification needed'}
                </p>
                {assessing.unitsPerHour && (
                  <p className="mt-1 text-2xs text-fg-muted">
                    Observed: {assessing.unitsPerHour} units an hour at a {assessing.defectRatePct}% defect rate.
                  </p>
                )}
              </div>
              <Select
                label="Assessed level"
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value as SkillLevel)}
                options={LEVELS.map((l) => ({ value: l, label: SKILL_LEVEL_LABEL[l] }))}
                hint="Trainer means they can certify others on this skill"
              />
            </div>
          )
        })()}
      </Modal>

      {defCrud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Five levels, and what each one permits" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3 lg:grid-cols-5">
          <p><span className="font-medium text-fg">Beginner</span> — under supervision only. Counted for training, not for cover.</p>
          <p><span className="font-medium text-fg">Intermediate</span> — can run the operation with somebody nearby. Enough for low-criticality work.</p>
          <p><span className="font-medium text-fg">Skilled</span> — runs it alone. This is the level most critical machines require.</p>
          <p><span className="font-medium text-fg">Expert</span> — runs it alone, sets it up and troubleshoots. The person a shift calls when it goes wrong.</p>
          <p><span className="font-medium text-fg">Trainer</span> — can certify others. Losing the only trainer for a critical skill is a bigger risk than losing an operator.</p>
        </CardBody>
      </Card>
    </div>
  )
}
