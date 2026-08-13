import { useMemo, useState } from 'react'
import { ArrowRight, Check, Play, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatCompact, formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useRoles } from '@/hooks/useIam'
import {
  useCoverage,
  useCreateRule,
  useRuleDocumentTypes,
  useRules,
  useSimulate,
  useUpdateRule,
} from '@/hooks/useWorkflow'
import type { Rule } from '@/api/workflow'

/**
 * Approval matrix (SRS V1-WFL §4.3). Wired to the real engine: rules, amount-band
 * coverage and the simulator all come from the backend. The engine fails closed —
 * a document that matches no rule cannot be submitted (V1-WFL-BR-001).
 */

export function ApprovalMatrixPage() {
  const [docType, setDocType] = useState('PURCHASE_ORDER')
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const [simOpen, setSimOpen] = useState(false)
  const [activeOnly, setActiveOnly] = useState(true)

  const docTypesQ = useRuleDocumentTypes()
  const rulesQ = useRules(docType, activeOnly)
  const coverageQ = useCoverage(docType)
  const rules = rulesQ.data ?? []
  const coverage = coverageQ.data

  const docLabel = (c: string) => docTypesQ.data?.find((d) => d.code === c)?.label ?? c

  return (
    <div>
      <PageHeader
        title="Approval matrix"
        description="Covers roughly 90% of approval cases without a designer. Document type + condition → ordered approval levels, each with an approver, mode and SLA."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Workflow' }, { label: 'Approval matrix' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Play className="h-4 w-4" />} onClick={() => setSimOpen(true)}>Simulate</Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>New rule</Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Document type"
            containerClassName="w-72"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            options={(docTypesQ.data ?? []).map((t) => ({ value: t.code, label: t.label }))}
          />
          <div className="pb-1">
            <Switch checked={activeOnly} onChange={setActiveOnly} label="Active rules only" />
          </div>
        </CardBody>
      </Card>

      {rulesQ.error && (
        <Alert tone="danger" title="Could not load rules">
          {rulesQ.error instanceof ProblemError ? rulesQ.error.problem.detail : 'Is the backend running?'}
        </Alert>
      )}

      {/* ── Coverage bar (V1-WFL-FR-007) ─────────────────────────────────── */}
      {coverage && coverage.bands.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Amount coverage" description="Gaps and overlaps are validated at save time — a document that matches no rule cannot be submitted." />
          <CardBody>
            <div className="flex overflow-hidden rounded border border-border">
              {coverage.bands.map((b, i) => (
                <div key={i} className="flex-1 border-r border-border bg-brand-500/10 px-2 py-2.5 text-center last:border-r-0" style={{ minWidth: 0 }}>
                  <p className="truncate text-2xs font-medium text-brand-600">{b.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-fg-muted tabular">
                    {formatCompact(b.from)} – {b.to === null ? '∞' : formatCompact(b.to)}
                  </p>
                </div>
              ))}
            </div>
            {coverage.full_coverage ? (
              <p className="mt-2 flex items-center gap-1.5 text-2xs text-success">
                <Check className="h-3 w-3" /> Full coverage — no gaps, no overlaps
              </p>
            ) : (
              <Alert tone="warning" className="mt-2" title="Coverage is not complete">
                {coverage.gaps.length > 0 && (
                  <span>No rule matches: {coverage.gaps.map((g) => `${formatCurrency(g.from)} – ${formatCurrency(g.to)}`).join(', ')}. </span>
                )}
                {coverage.overlaps.length > 0 && <span>Overlapping bands: {coverage.overlaps.join(', ')}. </span>}
                A document in an uncovered band cannot be submitted.
              </Alert>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── Rules ────────────────────────────────────────────────────────── */}
      {rulesQ.isLoading ? (
        <div className="py-12 text-center text-sm text-fg-muted">Loading rules…</div>
      ) : rules.length === 0 ? (
        <Card><CardBody className="py-10 text-center text-sm text-fg-muted">
          No approval rules for {docLabel(docType)} yet. A document of this type cannot be submitted until a rule exists.
        </CardBody></Card>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <RuleCard key={r.uid} rule={r} onEdit={() => setEditing(r)} />
          ))}
        </div>
      )}

      {editing && <RuleEditor target={editing} docType={docType} onClose={() => setEditing(null)} />}
      <SimulatorModal open={simOpen} docType={docType} docTypes={docTypesQ.data ?? []} onClose={() => setSimOpen(false)} />
    </div>
  )
}

function conditionText(r: Rule): string {
  if (r.condition_type === 'AMOUNT_BAND')
    return `${formatCurrency(r.min_amount ?? 0)} – ${r.max_amount === null ? '∞' : formatCurrency(r.max_amount)}`
  if (r.condition_type === 'EXPRESSION') return r.condition_expr ?? '—'
  return 'Always applies'
}

function RuleCard({ rule: r, onEdit }: { rule: Rule; onEdit: () => void }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">P{r.priority}</span>
            <h3 className="text-sm font-semibold text-fg">{r.name}</h3>
            {r.sub_type && <Badge tone="neutral" size="sm" dot={false}>{r.sub_type}</Badge>}
            {!r.is_active && <Badge tone="neutral" size="sm">Inactive</Badge>}
          </div>
          <p className="mt-1 font-mono text-2xs text-fg-muted">{conditionText(r)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {r.auto_approve_below != null && (
            <Badge tone="warning" size="sm">Auto-approve below {formatCurrency(r.auto_approve_below)}</Badge>
          )}
          <Button size="xs" variant="outline" onClick={onEdit}>Edit</Button>
        </div>
      </div>
      <CardBody>
        <div className="flex flex-wrap items-stretch gap-2">
          {r.levels.map((l, i) => (
            <div key={l.level_no} className="flex items-stretch gap-2">
              {i > 0 && (
                <div className="flex items-center">
                  {l.is_parallel_with_previous ? (
                    <span className="rotate-90 text-2xs text-fg-subtle">∥</span>
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 text-fg-subtle" />
                  )}
                </div>
              )}
              <div className="min-w-[180px] rounded border border-border bg-surface-2 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs font-semibold text-fg-subtle">L{l.level_no}</span>
                  <span className="text-2xs text-fg-subtle">{l.sla_hours ?? '—'} h SLA</span>
                </div>
                <p className="mt-0.5 text-xs font-medium text-fg">{l.level_name}</p>
                <p className="mt-0.5 truncate text-2xs text-fg-muted">
                  {l.approver_type === 'ROLE' ? `Role: ${l.approver_role_code ?? '—'}` : l.approver_type.replace(/_/g, ' ').toLowerCase()}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="rounded bg-surface-3 px-1 py-0.5 text-[9px] text-fg-muted">
                    {l.approval_mode === 'ANY_ONE' ? 'any one' : l.approval_mode === 'ALL' ? 'all' : `quorum ${l.quorum_count ?? ''}`}
                  </span>
                  <span className={cn('rounded px-1 py-0.5 text-[9px]', l.escalation_action === 'AUTO_APPROVE' ? 'bg-danger/10 text-danger' : 'bg-surface-3 text-fg-muted')}>
                    {l.escalation_action.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-2.5 text-2xs text-fg-subtle">
          <span>On change after submission: <strong className="text-fg-muted">{r.restart_on_change ? 'restart from level 1' : 'continue from current level'}</strong></span>
          <span>Total SLA: <strong className="text-fg-muted">{r.levels.reduce((s, l) => s + (l.sla_hours ?? 0), 0)} h</strong></span>
        </div>
      </CardBody>
    </Card>
  )
}

/* ─────────────────────────── Rule editor ─────────────────────────── */
interface LevelDraft {
  level_no: number
  level_name: string
  approver_role_uid: string
  approval_mode: string
  sla_hours: number
  escalation_action: string
  is_parallel_with_previous: boolean
}

function RuleEditor({ target, docType, onClose }: { target: Rule | 'new'; docType: string; onClose: () => void }) {
  const toast = useToast()
  const isNew = target === 'new'
  const rule = isNew ? null : target
  const rolesQ = useRoles()
  const roles = rolesQ.data ?? []
  const create = useCreateRule()
  const update = useUpdateRule()
  const docTypesQ = useRuleDocumentTypes()

  const [name, setName] = useState(rule?.name ?? '')
  const [priority, setPriority] = useState(rule?.priority ?? 100)
  const [conditionType, setConditionType] = useState(rule?.condition_type ?? 'AMOUNT_BAND')
  const [minAmount, setMinAmount] = useState<string>(rule?.min_amount != null ? String(rule.min_amount) : '')
  const [maxAmount, setMaxAmount] = useState<string>(rule?.max_amount != null ? String(rule.max_amount) : '')
  const [expr, setExpr] = useState(rule?.condition_expr ?? '')
  const [autoBelow, setAutoBelow] = useState<string>(rule?.auto_approve_below != null ? String(rule.auto_approve_below) : '')
  const [restart, setRestart] = useState(rule?.restart_on_change ?? true)
  const [levels, setLevels] = useState<LevelDraft[]>(
    (rule?.levels ?? []).map((l) => ({
      level_no: l.level_no,
      level_name: l.level_name ?? '',
      approver_role_uid: l.approver_role_uid ?? '',
      approval_mode: l.approval_mode,
      sla_hours: l.sla_hours ?? 24,
      escalation_action: l.escalation_action,
      is_parallel_with_previous: l.is_parallel_with_previous,
    })),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const dt = rule?.document_type ?? docType
  const autoApproveBlocked = ['PAYMENT_VOUCHER', 'JOURNAL_VOUCHER', 'STOCK_ADJUSTMENT'].includes(dt)

  function addLevel() {
    setLevels((ls) => [
      ...ls,
      { level_no: ls.length + 1, level_name: '', approver_role_uid: roles[0]?.uid ?? '', approval_mode: 'ANY_ONE', sla_hours: 24, escalation_action: 'NOTIFY_ONLY', is_parallel_with_previous: false },
    ])
  }
  function setLevel(i: number, patch: Partial<LevelDraft>) {
    setLevels((ls) => ls.map((l, x) => (x === i ? { ...l, ...patch } : l)))
  }

  function save() {
    setErrors({})
    const body: Record<string, unknown> = {
      document_type: dt,
      name: name.trim(),
      condition_type: conditionType,
      min_amount: conditionType === 'AMOUNT_BAND' && minAmount !== '' ? Number(minAmount) : null,
      max_amount: conditionType === 'AMOUNT_BAND' && maxAmount !== '' ? Number(maxAmount) : null,
      condition_expr: conditionType === 'EXPRESSION' ? expr.trim() : null,
      priority: Number(priority),
      auto_approve_below: autoBelow !== '' ? Number(autoBelow) : null,
      restart_on_change: restart,
      levels: levels.map((l, i) => ({
        level_no: i + 1,
        level_name: l.level_name || null,
        approver_type: 'ROLE',
        approver_role_uid: l.approver_role_uid || null,
        approval_mode: l.approval_mode,
        sla_hours: l.sla_hours,
        escalation_action: l.escalation_action,
        is_parallel_with_previous: l.is_parallel_with_previous,
      })),
    }
    const onError = (e: unknown) => {
      if (e instanceof ProblemError) {
        const fe: Record<string, string> = {}
        for (const x of e.problem.errors ?? []) fe[x.field] = x.message
        setErrors(fe)
        toast.error(e.problem.title || 'Save failed', e.problem.detail)
      } else toast.error('Save failed', 'Unknown error.')
    }
    if (isNew) {
      create.mutate(body, { onSuccess: () => { toast.success('Rule created', 'New submissions use it immediately.'); onClose() }, onError })
    } else {
      update.mutate({ uid: rule!.uid, body: { ...body, version: rule!.version } }, {
        onSuccess: () => { toast.success('Rule saved', 'In-flight instances keep their original rule.'); onClose() },
        onError,
      })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isNew ? 'New approval rule' : `Edit rule — ${rule?.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!name.trim() || levels.length === 0}>Save rule</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Applies to" />
            <CardBody className="space-y-3">
              <Select label="Document type" value={dt} disabled options={(docTypesQ.data ?? []).map((t) => ({ value: t.code, label: t.label }))} />
              <Input label="Rule name" required value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
              <Input label="Priority" type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} hint="Lower is evaluated first. Ties break on specificity: plant → branch → company." />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Condition" />
            <CardBody className="space-y-3">
              <Select label="Condition type" value={conditionType} onChange={(e) => setConditionType(e.target.value)}
                options={[{ value: 'AMOUNT_BAND', label: 'Amount band' }, { value: 'EXPRESSION', label: 'Expression' }, { value: 'ALWAYS', label: 'Always applies' }]} />
              {conditionType === 'AMOUNT_BAND' && (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="From amount" type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
                  <Input label="To amount" type="number" value={maxAmount} error={errors.max_amount} onChange={(e) => setMaxAmount(e.target.value)} hint="Blank = ∞" />
                </div>
              )}
              {conditionType === 'EXPRESSION' && (
                <Textarea label="Expression" value={expr} error={errors.condition_expr} onChange={(e) => setExpr(e.target.value)}
                  placeholder="priority == 'URGENT' AND total_amount <= 200000" hint="Whitelisted fields and operators only." />
              )}
              <Input label="Auto-approve below" type="number" value={autoBelow} onChange={(e) => setAutoBelow(e.target.value)}
                hint="Every auto-approval is logged with the rule that caused it." />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Approval levels"
            description="Levels run in sequence unless marked parallel."
            actions={<Button size="xs" variant="outline" icon={<Plus className="h-3 w-3" />} onClick={addLevel}>Add level</Button>}
          />
          {errors.levels && <div className="px-4 pt-2"><Alert tone="danger">{errors.levels}</Alert></div>}
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="w-12">L</th><th className="w-36">Name</th><th className="w-48">Approver role</th>
                  <th className="w-28">Mode</th><th className="w-24">SLA (h)</th><th className="w-48">On breach</th>
                  <th className="w-20">Parallel</th><th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {levels.map((l, i) => (
                  <tr key={i}>
                    <td className="text-xs font-medium tabular">{i + 1}</td>
                    <td><Input sizeVariant="sm" value={l.level_name} onChange={(e) => setLevel(i, { level_name: e.target.value })} /></td>
                    <td>
                      <Select sizeVariant="sm" value={l.approver_role_uid} onChange={(e) => setLevel(i, { approver_role_uid: e.target.value })}
                        options={[{ value: '', label: 'Select role…' }, ...roles.map((r) => ({ value: r.uid, label: r.code }))]} />
                    </td>
                    <td>
                      <Select sizeVariant="sm" value={l.approval_mode} onChange={(e) => setLevel(i, { approval_mode: e.target.value })}
                        options={[{ value: 'ANY_ONE', label: 'Any one' }, { value: 'ALL', label: 'All' }, { value: 'QUORUM_N', label: 'Quorum' }]} />
                    </td>
                    <td><Input sizeVariant="sm" type="number" value={l.sla_hours} onChange={(e) => setLevel(i, { sla_hours: Number(e.target.value) })} /></td>
                    <td>
                      <Select sizeVariant="sm" value={l.escalation_action} onChange={(e) => setLevel(i, { escalation_action: e.target.value })}
                        options={[
                          { value: 'NOTIFY_ONLY', label: 'Notify only' },
                          { value: 'NOTIFY_MANAGER', label: 'Notify manager' },
                          { value: 'REASSIGN_TO_ESCALATION_TARGET', label: 'Reassign to escalation target' },
                          { value: 'AUTO_APPROVE', label: 'Auto-approve', disabled: autoApproveBlocked },
                          { value: 'AUTO_REJECT', label: 'Auto-reject' },
                        ]} />
                    </td>
                    <td className="text-center">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" checked={l.is_parallel_with_previous} disabled={i === 0}
                        onChange={(e) => setLevel(i, { is_parallel_with_previous: e.target.checked })} />
                    </td>
                    <td><Button size="xs" variant="ghost" onClick={() => setLevels((ls) => ls.filter((_, x) => x !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {autoApproveBlocked && (
            <div className="border-t border-border p-3">
              <Alert tone="danger" title="Auto-approve is not permitted here">
                Auto-approval on SLA breach cannot be configured for payment vouchers, journal vouchers, stock adjustments, or any statutory document (V1-WFL-BR-010).
              </Alert>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="On document change after submission" />
          <CardBody className="space-y-3">
            <Select value={restart ? 'restart' : 'continue'} onChange={(e) => setRestart(e.target.value === 'restart')}
              options={[{ value: 'restart', label: 'Restart workflow from level 1' }, { value: 'continue', label: 'Continue from the current level' }]} />
            <Alert tone="info">Silent approval of a changed document is a control failure. The default — restart from level 1 — should be changed only with a clear reason.</Alert>
          </CardBody>
        </Card>
      </div>
    </Modal>
  )
}

/* ─────────────────────────── Simulator ─────────────────────────── */
function SimulatorModal({ open, docType, docTypes, onClose }: { open: boolean; docType: string; docTypes: { code: string; label: string }[]; onClose: () => void }) {
  const simulate = useSimulate()
  const [dt, setDt] = useState(docType)
  const [amount, setAmount] = useState(1562292)
  const [urgent, setUrgent] = useState(false)
  const [capital, setCapital] = useState(false)
  const result = simulate.data

  function run() {
    simulate.mutate({ document_type: dt, amount, urgent, item_category: capital ? 'CAPITAL' : undefined })
  }

  if (!open) return null
  return (
    <Modal open onClose={onClose} size="lg" title="Rule simulator"
      description="Enter sample attributes and see exactly which rule matches and who would be assigned — without creating a document."
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="primary" onClick={run} loading={simulate.isPending}>Run simulation</Button></>}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader title="Sample document" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Select label="Document type" value={dt} onChange={(e) => setDt(e.target.value)} options={docTypes.map((t) => ({ value: t.code, label: t.label }))} />
            <Input label="Total amount (₹)" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
            <div className="sm:col-span-2 flex flex-wrap gap-5">
              <Switch checked={urgent} onChange={setUrgent} label="Priority = URGENT" />
              <Switch checked={capital} onChange={setCapital} label="Item category = CAPITAL" />
            </div>
          </CardBody>
        </Card>

        {result && (result.matched ? (
          <Card>
            <CardHeader title={`Matched: ${result.rule_name}`} description={`Priority ${result.priority} · ${result.levels?.length} approval levels`} />
            <CardBody>
              {result.auto_approved && (
                <Alert tone="warning" className="mb-3" title="Auto-approved">
                  {formatCurrency(amount)} is below the auto-approval threshold of {formatCurrency(result.auto_approve_below ?? 0)}. The document would be approved immediately, logged with the rule that caused it.
                </Alert>
              )}
              <ol className="space-y-2">
                {(result.levels ?? []).map((l) => (
                  <li key={l.level_no} className="flex items-center gap-3 rounded border border-border bg-surface-2 p-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-2xs font-semibold text-brand-600">{l.level_no}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-fg">{l.level_name}</p>
                      <p className="text-2xs text-fg-muted">
                        {l.approver_label} · {l.approval_mode === 'ANY_ONE' ? 'any one approver' : l.approval_mode.toLowerCase()}
                        {l.unresolved_reason ? <span className="text-danger"> · unresolved: {l.unresolved_reason}</span> : <span className="text-success"> · {l.resolved_user_count} approver(s)</span>}
                      </p>
                    </div>
                    <span className="shrink-0 text-2xs text-fg-subtle">{l.sla_hours ?? '—'} h</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        ) : (
          <Alert tone="danger" title="No rule matches — the document could not be submitted">
            {result.reason} The engine fails closed and never auto-approves because configuration is missing.
          </Alert>
        ))}
      </div>
    </Modal>
  )
}
