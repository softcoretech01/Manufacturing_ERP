import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleDot,
  Copy,
  GitBranch,
  Hourglass,
  Merge,
  Play,
  Plus,
  Save,
  Split,
  Square,
  Wrench,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataRow, EmptyState } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { workflowDefinitions } from '@/mock/data2'
import type { WorkflowDefinition, WorkflowNode } from '@/types'

/* ─────────────────────────── Node visual language ─────────────────────────── */

const NODE_STYLE: Record<
  WorkflowNode['type'],
  { w: number; h: number; cls: string; icon: typeof CircleDot; label: string }
> = {
  START: { w: 120, h: 40, cls: 'border-success bg-success/10 text-success', icon: CircleDot, label: 'Start' },
  APPROVAL: { w: 170, h: 56, cls: 'border-brand-500 bg-brand-500/10 text-brand-600', icon: CheckCircle2, label: 'Approval' },
  CONDITION: { w: 160, h: 52, cls: 'border-warning bg-warning/10 text-warning', icon: GitBranch, label: 'Condition' },
  PARALLEL_SPLIT: { w: 140, h: 44, cls: 'border-progress bg-progress/10 text-progress', icon: Split, label: 'Parallel split' },
  PARALLEL_JOIN: { w: 140, h: 44, cls: 'border-progress bg-progress/10 text-progress', icon: Merge, label: 'Parallel join' },
  ACTION: { w: 160, h: 48, cls: 'border-neutral bg-neutral/10 text-fg-muted', icon: Wrench, label: 'System action' },
  NOTIFICATION: { w: 160, h: 48, cls: 'border-pending bg-pending/10 text-pending', icon: Bell, label: 'Notification' },
  WAIT: { w: 150, h: 46, cls: 'border-warning bg-warning/10 text-warning', icon: Hourglass, label: 'Wait / timer' },
  END: { w: 120, h: 40, cls: 'border-danger bg-danger/10 text-danger', icon: Square, label: 'End' },
}

const PALETTE: WorkflowNode['type'][] = [
  'APPROVAL',
  'CONDITION',
  'PARALLEL_SPLIT',
  'PARALLEL_JOIN',
  'ACTION',
  'NOTIFICATION',
  'WAIT',
  'END',
]

/* ─────────────────────────── Validation ─────────────────────────── */

interface Issue {
  severity: 'ERROR' | 'WARNING'
  message: string
  nodeId?: string
}

/**
 * A workflow may not be activated with structural faults. These are the checks
 * the server re-runs on publish — the designer surfaces them early so a broken
 * definition is never saved as ACTIVE.
 */
function validate(def: WorkflowDefinition): Issue[] {
  const issues: Issue[] = []
  const starts = def.nodes.filter((n) => n.type === 'START')
  const ends = def.nodes.filter((n) => n.type === 'END')

  if (starts.length !== 1) issues.push({ severity: 'ERROR', message: `Expected exactly one START node, found ${starts.length}.` })
  if (ends.length === 0) issues.push({ severity: 'ERROR', message: 'No END node — instances would never terminate.' })

  const outgoing = new Map<string, number>()
  const incoming = new Map<string, number>()
  for (const e of def.edges) {
    outgoing.set(e.from, (outgoing.get(e.from) ?? 0) + 1)
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1)
  }

  for (const n of def.nodes) {
    if (n.type !== 'START' && !incoming.get(n.id)) {
      issues.push({ severity: 'ERROR', message: `"${n.label}" is unreachable — nothing routes into it.`, nodeId: n.id })
    }
    if (n.type !== 'END' && !outgoing.get(n.id)) {
      issues.push({ severity: 'ERROR', message: `"${n.label}" is a dead end — no outgoing path.`, nodeId: n.id })
    }
    if (n.type === 'CONDITION' && (outgoing.get(n.id) ?? 0) < 2) {
      issues.push({ severity: 'ERROR', message: `Condition "${n.label}" needs both a true and a false branch.`, nodeId: n.id })
    }
    if (n.type === 'APPROVAL' && !n.subtitle) {
      issues.push({ severity: 'WARNING', message: `Approval "${n.label}" has no approver resolution rule.`, nodeId: n.id })
    }
    if (n.type === 'WAIT' && !n.subtitle) {
      issues.push({ severity: 'WARNING', message: `Wait node "${n.label}" has no timeout — instances could stall indefinitely.`, nodeId: n.id })
    }
  }

  const splits = def.nodes.filter((n) => n.type === 'PARALLEL_SPLIT').length
  const joins = def.nodes.filter((n) => n.type === 'PARALLEL_JOIN').length
  if (splits !== joins) {
    issues.push({ severity: 'ERROR', message: `${splits} parallel split(s) but ${joins} join(s) — every split must converge.` })
  }

  return issues
}

/* ─────────────────────────── Canvas ─────────────────────────── */

function Canvas({
  def,
  selected,
  onSelect,
  problemNodes,
}: {
  def: WorkflowDefinition
  selected: string | null
  onSelect: (id: string | null) => void
  problemNodes: Set<string>
}) {
  const nodeById = useMemo(() => new Map(def.nodes.map((n) => [n.id, n])), [def])

  const width = Math.max(900, ...def.nodes.map((n) => n.x + 240))
  const height = Math.max(460, ...def.nodes.map((n) => n.y + 140))

  function anchors(from: WorkflowNode, to: WorkflowNode) {
    const fs = NODE_STYLE[from.type]
    const ts = NODE_STYLE[to.type]
    const fromCx = from.x + fs.w / 2
    const toCx = to.x + ts.w / 2
    // Route out of the bottom when descending, out of the side when level.
    if (to.y > from.y + 10) {
      return { x1: fromCx, y1: from.y + fs.h, x2: toCx, y2: to.y, vertical: true }
    }
    if (to.y < from.y - 10) {
      return { x1: fromCx, y1: from.y, x2: toCx, y2: to.y + ts.h, vertical: true }
    }
    const leftToRight = to.x > from.x
    return {
      x1: leftToRight ? from.x + fs.w : from.x,
      y1: from.y + fs.h / 2,
      x2: leftToRight ? to.x : to.x + ts.w,
      y2: to.y + ts.h / 2,
      vertical: false,
    }
  }

  return (
    <div
      className="relative overflow-auto rounded border border-border bg-surface-2"
      style={{ maxHeight: '68vh' }}
      onClick={() => onSelect(null)}
    >
      <svg width={width} height={height} className="block">
        <defs>
          <pattern id="wf-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgb(var(--border))" />
          </pattern>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--border-strong))" />
          </marker>
        </defs>
        <rect width={width} height={height} fill="url(#wf-grid)" />

        {def.edges.map((e, i) => {
          const from = nodeById.get(e.from)
          const to = nodeById.get(e.to)
          if (!from || !to) return null
          const a = anchors(from, to)
          const midX = (a.x1 + a.x2) / 2
          const midY = (a.y1 + a.y2) / 2
          const d = a.vertical
            ? `M ${a.x1} ${a.y1} C ${a.x1} ${midY}, ${a.x2} ${midY}, ${a.x2} ${a.y2}`
            : `M ${a.x1} ${a.y1} C ${midX} ${a.y1}, ${midX} ${a.y2}, ${a.x2} ${a.y2}`
          const highlighted = selected === e.from || selected === e.to
          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={highlighted ? 'rgb(var(--brand-500))' : 'rgb(var(--border-strong))'}
                strokeWidth={highlighted ? 2 : 1.5}
                markerEnd="url(#wf-arrow)"
              />
              {e.label && (
                <g>
                  <rect x={midX - e.label.length * 3.1 - 5} y={midY - 8} width={e.label.length * 6.2 + 10} height={16} rx={3} fill="rgb(var(--surface))" stroke="rgb(var(--border))" />
                  <text x={midX} y={midY + 3.5} textAnchor="middle" fontSize="9" fill="rgb(var(--fg-muted))">
                    {e.label}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {def.nodes.map((n) => {
        const s = NODE_STYLE[n.type]
        const Icon = s.icon
        const isSelected = selected === n.id
        return (
          <button
            key={n.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(n.id)
            }}
            className={cn(
              'absolute flex flex-col justify-center rounded border-2 px-2.5 text-left shadow-sm transition-shadow',
              s.cls,
              isSelected && 'ring-2 ring-brand-500 ring-offset-1 ring-offset-surface-2',
              problemNodes.has(n.id) && 'border-danger',
            )}
            style={{ left: n.x, top: n.y, width: s.w, height: s.h }}
          >
            <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide opacity-70">
              <Icon className="h-3 w-3 shrink-0" />
              {s.label}
              {problemNodes.has(n.id) && <AlertTriangle className="h-3 w-3 text-danger" />}
            </span>
            <span className="truncate text-xs font-medium text-fg">{n.label}</span>
            {n.subtitle && <span className="truncate text-2xs text-fg-subtle">{n.subtitle}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ─────────────────────────── Page ─────────────────────────── */

export function WorkflowDesignerPage() {
  const toast = useToast()
  const [activeUid, setActiveUid] = useState(workflowDefinitions[0].uid)
  const [selected, setSelected] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  const def = workflowDefinitions.find((d) => d.uid === activeUid) ?? workflowDefinitions[0]
  const issues = useMemo(() => validate(def), [def])
  const errors = issues.filter((i) => i.severity === 'ERROR')
  const problemNodes = new Set(issues.filter((i) => i.nodeId).map((i) => i.nodeId!))
  const node = def.nodes.find((n) => n.id === selected) ?? null

  return (
    <div>
      <PageHeader
        title="Workflow designer"
        description="For the ~10% of approvals the matrix cannot express — conditional branching, parallel departments, system actions and timers."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Workflow' }, { label: 'Designer' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => toast.success('Version 3 created as draft')}>
              New version
            </Button>
            <Button variant="outline" size="sm" icon={<Play className="h-4 w-4" />} onClick={() => setTestOpen(true)}>
              Test run
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Save className="h-4 w-4" />}
              disabled={errors.length > 0}
              onClick={() => toast.success('Workflow published', `${def.code} v${def.version} is now ACTIVE for new documents.`)}
            >
              Publish
            </Button>
          </>
        }
      />

      <Alert tone="info" className="mb-4" title="Versioning is immutable">
        In-flight instances continue on the version they started with. Publishing creates a new
        active version for documents raised from that moment — it never re-routes work already in
        someone's queue.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_280px]">
        {/* Definitions + palette */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Definitions"
              actions={
                <Button variant="ghost" size="icon-sm" onClick={() => setNewOpen(true)} aria-label="New workflow">
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
            <CardBody className="space-y-1.5 p-2">
              {workflowDefinitions.map((d) => (
                <button
                  key={d.uid}
                  type="button"
                  onClick={() => {
                    setActiveUid(d.uid)
                    setSelected(null)
                  }}
                  className={cn(
                    'w-full rounded px-2.5 py-2 text-left transition-colors',
                    d.uid === activeUid ? 'bg-brand-500/10 ring-1 ring-brand-500/30' : 'hover:bg-surface-2',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-fg">{d.name}</span>
                    <Badge tone={d.status === 'ACTIVE' ? 'success' : d.status === 'DRAFT' ? 'draft' : 'neutral'} size="sm">
                      v{d.version}
                    </Badge>
                  </div>
                  <p className="mt-0.5 font-mono text-2xs text-fg-subtle">{d.code}</p>
                  {d.runningInstances > 0 && (
                    <p className="mt-0.5 text-2xs text-progress">{d.runningInstances} running</p>
                  )}
                </button>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Palette" description="Node types — canvas is read-only in this prototype" />
            <CardBody className="grid grid-cols-1 gap-1.5 p-2">
              {PALETTE.map((t) => {
                const s = NODE_STYLE[t]
                const Icon = s.icon
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toast.info(`${s.label} node`, 'The canvas is read-only in this prototype — the palette illustrates the available node types.')}
                    className={cn(
                      'flex items-center gap-2 rounded border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-2',
                      'border-border',
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', s.cls.split(' ').find((c) => c.startsWith('text-')))} />
                    <span className="text-fg">{s.label}</span>
                  </button>
                )
              })}
            </CardBody>
          </Card>
        </div>

        {/* Canvas */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">
                {def.name} <span className="font-normal text-fg-muted">v{def.version}</span>
              </p>
              <p className="truncate text-2xs text-fg-subtle">{def.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={def.status === 'ACTIVE' ? 'success' : def.status === 'DRAFT' ? 'draft' : 'neutral'} size="sm">
                {def.status.toLowerCase()}
              </Badge>
              <span className="text-2xs text-fg-subtle">
                {def.nodes.length} nodes · {def.edges.length} transitions
              </span>
            </div>
          </div>

          <Canvas def={def} selected={selected} onSelect={setSelected} problemNodes={problemNodes} />
        </div>

        {/* Inspector + validation */}
        <div className="space-y-4">
          <Card>
            <CardHeader title={node ? 'Node properties' : 'Inspector'} />
            <CardBody>
              {!node && (
                <EmptyState
                  icon={<Zap className="h-5 w-5" />}
                  title="Nothing selected"
                  description="Click a node on the canvas to edit its properties."
                  className="py-8"
                />
              )}
              {node && (
                <div className="space-y-3">
                  <DataRow label="Node id" value={node.id} mono />
                  <Input label="Label" defaultValue={node.label} sizeVariant="sm" />
                  {node.type === 'APPROVAL' && (
                    <>
                      <Select
                        label="Approver resolution"
                        sizeVariant="sm"
                        defaultValue="ROLE"
                        options={[
                          { value: 'ROLE', label: 'Role in the document branch' },
                          { value: 'USER', label: 'Named user' },
                          { value: 'MANAGER', label: 'Requester’s reporting manager' },
                          { value: 'DEPT_HEAD', label: 'Department head' },
                          { value: 'COST_CENTRE_OWNER', label: 'Cost centre owner' },
                          { value: 'DYNAMIC', label: 'Expression' },
                        ]}
                      />
                      <Input label="Resolution value" defaultValue={node.subtitle ?? ''} sizeVariant="sm" />
                      <Select
                        label="Approval mode"
                        sizeVariant="sm"
                        options={[
                          { value: 'ANY_ONE', label: 'Any one approver' },
                          { value: 'ALL', label: 'All approvers' },
                          { value: 'QUORUM_N', label: 'Quorum of N' },
                        ]}
                      />
                      <Input label="SLA (hours)" type="number" defaultValue={24} sizeVariant="sm" hint="Breach triggers the escalation path." />
                    </>
                  )}
                  {node.type === 'CONDITION' && (
                    <Textarea
                      label="Expression"
                      rows={3}
                      defaultValue={node.subtitle ?? 'document.amount > 500000'}
                      hint="Whitelisted fields only; evaluated server-side against the document snapshot."
                    />
                  )}
                  {node.type === 'WAIT' && (
                    <Input label="Timeout" defaultValue={node.subtitle ?? '48h'} sizeVariant="sm" hint="On expiry the instance follows the timeout edge." />
                  )}
                  {node.type === 'NOTIFICATION' && (
                    <Select
                      label="Template"
                      sizeVariant="sm"
                      options={[
                        { value: 'TPL_APPROVAL_REQ', label: 'TPL_APPROVAL_REQ' },
                        { value: 'TPL_DOC_APPROVED', label: 'TPL_DOC_APPROVED' },
                        { value: 'TPL_ESCALATION', label: 'TPL_ESCALATION' },
                      ]}
                    />
                  )}
                  {node.type === 'ACTION' && (
                    <Select
                      label="System action"
                      sizeVariant="sm"
                      options={[
                        { value: 'SET_STATUS', label: 'Set document status' },
                        { value: 'EMIT_EVENT', label: 'Emit domain event' },
                        { value: 'CALL_WEBHOOK', label: 'Call configured webhook' },
                        { value: 'CREATE_TASK', label: 'Create follow-up task' },
                      ]}
                    />
                  )}
                  <Textarea label="Notes" rows={2} placeholder="Why this step exists — read by auditors." />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Validation"
              description={errors.length ? `${errors.length} blocking issue(s)` : 'Ready to publish'}
            />
            <CardBody className="space-y-2">
              {issues.length === 0 && (
                <p className="flex items-center gap-2 text-xs text-success">
                  <CheckCircle2 className="h-4 w-4" /> No structural problems found.
                </p>
              )}
              {issues.map((i, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => i.nodeId && setSelected(i.nodeId)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded border px-2.5 py-2 text-left text-2xs',
                    i.severity === 'ERROR' ? 'border-danger/30 bg-danger/5 text-danger' : 'border-warning/30 bg-warning/5 text-warning',
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="text-fg-muted">{i.message}</span>
                </button>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Test run"
        description="Simulates the definition against a sample document without creating a real instance."
        footer={
          <>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Close</Button>
            <Button variant="primary" onClick={() => toast.success('Simulation complete', 'Path resolved through 4 nodes in 2 approval levels.')}>
              Run simulation
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input label="Document amount (₹)" type="number" defaultValue={750000} />
          <Select label="Branch" options={[{ value: 'HO', label: 'HO — Head Office' }, { value: 'CHN', label: 'CHN — Chennai' }]} />
          <Select label="Requester role" options={[{ value: 'BUYER', label: 'Buyer' }, { value: 'STORE_KEEPER', label: 'Store keeper' }]} />
          <Alert tone="info">
            Simulation resolves approvers against live role membership and delegations, so an empty
            approver pool shows up here rather than at runtime.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New workflow definition"
        footer={
          <>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Draft created'); setNewOpen(false) }}>Create draft</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input label="Code" required placeholder="PO_AMENDMENT" hint="Uppercase, underscore separated. Immutable after creation." />
          <Input label="Name" required placeholder="Purchase order amendment approval" />
          <Select
            label="Document type"
            required
            options={[
              { value: 'PO', label: 'Purchase order' },
              { value: 'GRN', label: 'Goods receipt note' },
              { value: 'ECN', label: 'Engineering change note' },
              { value: 'CAPA', label: 'CAPA' },
              { value: 'SUPPLIER', label: 'Supplier onboarding' },
            ]}
          />
          <Textarea label="Description" rows={2} placeholder="What this workflow governs and why the matrix cannot express it." />
        </div>
      </Modal>
    </div>
  )
}
