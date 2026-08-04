import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, Play, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatCompact, formatCurrency } from '@/lib/format'
import { roles } from '@/mock/data'
import { approvalRules } from '@/mock/data2'
import type { ApprovalRule } from '@/types'

const DOC_TYPES = [...new Set(approvalRules.map((r) => r.documentType))]

export function ApprovalMatrixPage() {
  const toast = useToast()
  const [docType, setDocType] = useState('PURCHASE_ORDER')
  const [editing, setEditing] = useState<ApprovalRule | 'new' | null>(null)
  const [simOpen, setSimOpen] = useState(false)
  const [activeOnly, setActiveOnly] = useState(true)

  const rules = useMemo(
    () =>
      approvalRules
        .filter((r) => r.documentType === docType && (!activeOnly || r.isActive))
        .sort((a, b) => a.priority - b.priority),
    [docType, activeOnly],
  )

  // Amount-band coverage analysis (V1-WFL-FR-007)
  const bands = rules
    .filter((r) => r.conditionType === 'AMOUNT_BAND')
    .map((r) => ({ from: r.minAmount ?? 0, to: r.maxAmount, name: r.name }))
    .sort((a, b) => a.from - b.from)

  const gaps: string[] = []
  let cursor = 0
  for (const b of bands) {
    if (b.from > cursor + 1) gaps.push(`${formatCurrency(cursor)} – ${formatCurrency(b.from - 1)}`)
    cursor = b.to ?? Infinity
  }
  const fullCoverage = gaps.length === 0 && bands.some((b) => b.to === null)

  return (
    <div>
      <PageHeader
        title="Approval matrix"
        description="Covers roughly 90% of approval cases without a designer. Document type + condition → ordered approval levels, each with an approver, quorum and SLA."
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
          <Select label="Document type" containerClassName="w-64" value={docType} onChange={(e) => setDocType(e.target.value)}
            options={DOC_TYPES.map((t) => ({ value: t, label: approvalRules.find((r) => r.documentType === t)!.documentLabel }))} />
          <div className="pb-1">
            <Switch checked={activeOnly} onChange={setActiveOnly} label="Active rules only" />
          </div>
        </CardBody>
      </Card>

      {/* ── Coverage bar ─────────────────────────────────────────────────── */}
      {bands.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Amount coverage" description="Gaps and overlaps are validated at save time — a document that matches no rule cannot be submitted." />
          <CardBody>
            <div className="flex overflow-hidden rounded border border-border">
              {bands.map((b, i) => (
                <div
                  key={i}
                  className="flex-1 border-r border-border bg-brand-500/10 px-2 py-2.5 text-center last:border-r-0"
                  style={{ minWidth: 0 }}
                >
                  <p className="truncate text-2xs font-medium text-brand-600">{b.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-fg-muted tabular">
                    {formatCompact(b.from)} – {b.to === null ? '∞' : formatCompact(b.to)}
                  </p>
                </div>
              ))}
            </div>
            {fullCoverage ? (
              <p className="mt-2 flex items-center gap-1.5 text-2xs text-success">
                <Check className="h-3 w-3" /> Full coverage — no gaps, no overlaps
              </p>
            ) : (
              <Alert tone="danger" className="mt-2" title="Coverage gap detected">
                No rule matches: {gaps.join(', ')}. A document in this band cannot be submitted.
              </Alert>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── Rules ────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {rules.map((r) => (
          <Card key={r.uid}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">P{r.priority}</span>
                  <h3 className="text-sm font-semibold text-fg">{r.name}</h3>
                  {r.subType && <Badge tone="neutral" size="sm" dot={false}>{r.subType}</Badge>}
                  {!r.isActive && <Badge tone="neutral" size="sm">Inactive</Badge>}
                </div>
                <p className="mt-1 font-mono text-2xs text-fg-muted">
                  {r.conditionType === 'AMOUNT_BAND'
                    ? `${formatCurrency(r.minAmount ?? 0)} – ${r.maxAmount === null ? '∞' : formatCurrency(r.maxAmount)}`
                    : r.conditionType === 'EXPRESSION'
                      ? r.conditionExpr
                      : 'Always applies'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.autoApproveBelow && (
                  <Badge tone="warning" size="sm">Auto-approve below {formatCurrency(r.autoApproveBelow)}</Badge>
                )}
                <Button size="xs" variant="outline" onClick={() => setEditing(r)}>Edit</Button>
              </div>
            </div>

            <CardBody>
              <div className="flex flex-wrap items-stretch gap-2">
                {r.levels.map((l, i) => (
                  <div key={l.levelNo} className="flex items-stretch gap-2">
                    {i > 0 && (
                      <div className="flex items-center">
                        {l.isParallelWithPrevious ? (
                          <span className="rotate-90 text-2xs text-fg-subtle">∥</span>
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5 text-fg-subtle" />
                        )}
                      </div>
                    )}
                    <div className="min-w-[180px] rounded border border-border bg-surface-2 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-2xs font-semibold text-fg-subtle">L{l.levelNo}</span>
                        <span className="text-2xs text-fg-subtle">{l.slaHours} h SLA</span>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-fg">{l.levelName}</p>
                      <p className="mt-0.5 truncate text-2xs text-fg-muted">
                        {l.approverType === 'ROLE' ? `Role: ${l.approverValue}` : l.approverType.replace(/_/g, ' ').toLowerCase()}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="rounded bg-surface-3 px-1 py-0.5 text-[9px] text-fg-muted">
                          {l.approvalMode === 'ANY_ONE' ? 'any one' : l.approvalMode === 'ALL' ? 'all' : `quorum ${l.quorumCount}`}
                        </span>
                        <span
                          className={cn(
                            'rounded px-1 py-0.5 text-[9px]',
                            l.escalationAction === 'AUTO_APPROVE' ? 'bg-danger/10 text-danger' : 'bg-surface-3 text-fg-muted',
                          )}
                        >
                          {l.escalationAction.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-2.5 text-2xs text-fg-subtle">
                <span>
                  On change after submission:{' '}
                  <strong className="text-fg-muted">{r.restartOnChange ? 'restart from level 1' : 'continue from current level'}</strong>
                </span>
                {r.materialChangeFields.length > 0 && (
                  <span>Material fields: <span className="font-mono">{r.materialChangeFields.join(', ')}</span></span>
                )}
                <span>Total SLA: <strong className="text-fg-muted">{r.levels.reduce((s, l) => s + l.slaHours, 0)} h</strong></span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <RuleEditor target={editing} onClose={() => setEditing(null)} />
      <SimulatorModal open={simOpen} onClose={() => setSimOpen(false)} />
    </div>
  )
}

/* ─────────────────────────── Rule editor ─────────────────────────── */

function RuleEditor({ target, onClose }: { target: ApprovalRule | 'new' | null; onClose: () => void }) {
  const toast = useToast()
  const isNew = target === 'new'
  const rule = isNew || !target ? null : target
  const [levels, setLevels] = useState(rule?.levels ?? [])
  const [escalation, setEscalation] = useState<Record<number, string>>({})

  if (!target) return null

  const autoApproveBlocked = rule?.documentType === 'PURCHASE_ORDER' && (rule?.minAmount ?? 0) > 1000000

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isNew ? 'New approval rule' : `Edit rule — ${rule?.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { toast.success('Rule saved', 'New submissions use it immediately; in-flight instances keep their original rule.'); onClose() }}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Applies to" />
            <CardBody className="space-y-3">
              <Select label="Document type" required defaultValue={rule?.documentType} options={DOC_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))} />
              <Input label="Rule name" required defaultValue={rule?.name} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Branch" defaultValue="*" options={[{ value: '*', label: 'All branches' }, { value: 'CHN', label: 'Chennai' }, { value: 'HSR', label: 'Hosur' }]} />
                <Select label="Plant" defaultValue="*" options={[{ value: '*', label: 'All plants' }, { value: 'P1', label: 'Plant 1' }, { value: 'P2', label: 'Plant 2' }]} />
              </div>
              <Input label="Priority" type="number" defaultValue={rule?.priority ?? 100} hint="Lower is evaluated first. Ties break on specificity: plant → branch → company." />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Condition" />
            <CardBody className="space-y-3">
              <Select label="Condition type" defaultValue={rule?.conditionType}
                options={[{ value: 'AMOUNT_BAND', label: 'Amount band' }, { value: 'EXPRESSION', label: 'Expression' }, { value: 'ALWAYS', label: 'Always applies' }]} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="From amount" type="number" defaultValue={rule?.minAmount ?? undefined} />
                <Input label="To amount" type="number" defaultValue={rule?.maxAmount ?? undefined} hint="Blank = ∞" />
              </div>
              <Textarea label="Expression (optional)" defaultValue={rule?.conditionExpr ?? ''} placeholder="priority == 'URGENT' AND total_amount <= 200000"
                hint="Whitelisted fields and operators only." />
              <Input label="Auto-approve below" type="number" defaultValue={rule?.autoApproveBelow ?? undefined}
                hint="Every auto-approval is logged with the rule that caused it." />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Approval levels"
            description="Levels run in sequence unless marked parallel."
            actions={<Button size="xs" variant="outline" icon={<Plus className="h-3 w-3" />}
              onClick={() => setLevels((l) => [...l, { levelNo: l.length + 1, levelName: '', approverType: 'ROLE', approverValue: '', approvalMode: 'ANY_ONE', isParallelWithPrevious: false, slaHours: 24, escalationAction: 'NOTIFY_ONLY', escalationTarget: '' }])}>
              Add level
            </Button>}
          />
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="w-12">L</th><th className="w-36">Name</th><th className="w-44">Approver</th>
                  <th className="w-28">Mode</th><th className="w-24">SLA (h)</th><th className="w-48">On breach</th>
                  <th className="w-20">Parallel</th><th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {levels.map((l, i) => (
                  <tr key={i}>
                    <td className="text-xs font-medium tabular">{l.levelNo}</td>
                    <td><Input sizeVariant="sm" defaultValue={l.levelName} /></td>
                    <td>
                      <Select sizeVariant="sm" defaultValue={l.approverType === 'ROLE' ? l.approverValue : l.approverType}
                        options={[
                          ...roles.map((r) => ({ value: r.code, label: `Role: ${r.code}` })),
                          { value: 'DEPARTMENT_HEAD', label: 'Department head' },
                          { value: 'REPORTING_MANAGER', label: 'Reporting manager' },
                          { value: 'COST_CENTRE_OWNER', label: 'Cost centre owner' },
                          { value: 'PLANT_HEAD', label: 'Plant head' },
                        ]} />
                    </td>
                    <td>
                      <Select sizeVariant="sm" defaultValue={l.approvalMode}
                        options={[{ value: 'ANY_ONE', label: 'Any one' }, { value: 'ALL', label: 'All' }, { value: 'QUORUM_N', label: 'Quorum' }]} />
                    </td>
                    <td><Input sizeVariant="sm" type="number" defaultValue={l.slaHours} /></td>
                    <td>
                      <Select
                        sizeVariant="sm"
                        defaultValue={l.escalationAction}
                        onChange={(e) => setEscalation((s) => ({ ...s, [i]: e.target.value }))}
                        options={[
                          { value: 'NOTIFY_ONLY', label: 'Notify only' },
                          { value: 'NOTIFY_MANAGER', label: 'Notify manager' },
                          { value: 'REASSIGN_TO_ESCALATION_TARGET', label: 'Reassign to escalation target' },
                          { value: 'AUTO_APPROVE', label: 'Auto-approve', disabled: autoApproveBlocked },
                          { value: 'AUTO_REJECT', label: 'Auto-reject' },
                        ]}
                      />
                    </td>
                    <td className="text-center">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" defaultChecked={l.isParallelWithPrevious} disabled={i === 0} />
                    </td>
                    <td>
                      <Button size="xs" variant="ghost" onClick={() => setLevels((ls) => ls.filter((_, x) => x !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(autoApproveBlocked || Object.values(escalation).includes('AUTO_APPROVE')) && (
            <div className="border-t border-border p-3">
              <Alert tone="danger" title="Auto-approve is not permitted here">
                Auto-approval on SLA breach cannot be configured for purchase orders above the company
                threshold, payment vouchers, journal vouchers, credit notes, stock adjustments, or any
                statutory document.
              </Alert>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="On document change after submission" />
          <CardBody className="space-y-3">
            <Select defaultValue={rule?.restartOnChange ? 'restart' : 'continue'}
              options={[{ value: 'restart', label: 'Restart workflow from level 1' }, { value: 'continue', label: 'Continue from the current level' }]} />
            <div>
              <p className="field-label">Material fields — changing any of these triggers the rule above</p>
              <div className="flex flex-wrap gap-2">
                {['total_amount', 'supplier', 'customer', 'items', 'quantity', 'delivery_date', 'remarks'].map((f) => (
                  <label key={f} className="flex cursor-pointer items-center gap-1.5 rounded border border-border bg-surface-2 px-2 py-1 text-xs">
                    <input type="checkbox" className="h-3 w-3 accent-brand-600" defaultChecked={rule?.materialChangeFields.includes(f)} />
                    <span className="font-mono text-[10px]">{f}</span>
                  </label>
                ))}
              </div>
            </div>
            <Alert tone="info">
              Silent approval of a changed document is a control failure. The default — restart from
              level 1 — should be changed only with a clear reason.
            </Alert>
          </CardBody>
        </Card>
      </div>
    </Modal>
  )
}

/* ─────────────────────────── Simulator ─────────────────────────── */

function SimulatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState(1562292)
  const [docType, setDocType] = useState('PURCHASE_ORDER')
  const [urgent, setUrgent] = useState(false)
  const [capital, setCapital] = useState(false)

  const matched = useMemo(() => {
    const candidates = approvalRules
      .filter((r) => r.documentType === docType && r.isActive)
      .sort((a, b) => a.priority - b.priority)
    return candidates.find((r) => {
      if (r.conditionType === 'ALWAYS') return true
      if (r.conditionType === 'EXPRESSION') {
        if (r.conditionExpr?.includes('URGENT')) return urgent && amount <= 200000
        if (r.conditionExpr?.includes('CAPITAL')) return capital
        if (r.conditionExpr?.includes('SUBCONTRACT')) return false
        return false
      }
      return amount >= (r.minAmount ?? 0) && (r.maxAmount === null || amount <= r.maxAmount)
    })
  }, [amount, docType, urgent, capital])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Rule simulator"
      description="Enter sample attributes and see exactly which rule matches and who would be assigned — without creating a document."
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader title="Sample document" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)}
              options={DOC_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))} />
            <Input label="Total amount (₹)" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
            <div className="sm:col-span-2 flex flex-wrap gap-5">
              <Switch checked={urgent} onChange={setUrgent} label="Priority = URGENT" />
              <Switch checked={capital} onChange={setCapital} label="Item category = CAPITAL" />
            </div>
          </CardBody>
        </Card>

        {matched ? (
          <Card>
            <CardHeader
              title={`Matched: ${matched.name}`}
              description={`Priority ${matched.priority} · ${matched.levels.length} approval levels · total SLA ${matched.levels.reduce((s, l) => s + l.slaHours, 0)} h`}
            />
            <CardBody>
              {matched.autoApproveBelow && amount < matched.autoApproveBelow && (
                <Alert tone="warning" className="mb-3" title="Auto-approved">
                  {formatCurrency(amount)} is below the auto-approval threshold of{' '}
                  {formatCurrency(matched.autoApproveBelow)}. The document would be approved
                  immediately, logged with the rule that caused it.
                </Alert>
              )}
              <ol className="space-y-2">
                {matched.levels.map((l) => (
                  <li key={l.levelNo} className="flex items-center gap-3 rounded border border-border bg-surface-2 p-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-2xs font-semibold text-brand-600">
                      {l.levelNo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-fg">{l.levelName}</p>
                      <p className="text-2xs text-fg-muted">
                        {l.approverType === 'ROLE' ? `Role: ${l.approverValue}` : l.approverType.replace(/_/g, ' ').toLowerCase()}
                        {' · '}{l.approvalMode === 'ANY_ONE' ? 'any one approver' : 'all approvers'}
                      </p>
                    </div>
                    <span className="shrink-0 text-2xs text-fg-subtle">{l.slaHours} h</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        ) : (
          <Alert tone="danger" title="No rule matches — the document could not be submitted">
            The engine fails closed. It will never auto-approve because configuration is missing. Add
            a rule covering {formatCurrency(amount)} for {docType.replace(/_/g, ' ')}.
          </Alert>
        )}
      </div>
    </Modal>
  )
}
