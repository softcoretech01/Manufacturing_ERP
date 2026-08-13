import { Link } from 'react-router-dom'
import { Network, SlidersHorizontal, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'

/**
 * Workflow designer — deliberately NOT built yet.
 *
 * The SRS (V1-WFL §4.2 / FR-023…026) marks the whole visual designer priority
 * "S" (Should), and states the approval matrix already covers ~90% of cases
 * without it. The designer exists for genuinely branching processes (e.g.
 * supplier onboarding with parallel legal/compliance review) that live in
 * modules not yet built. Shipping a versioned drag-and-drop workflow canvas with
 * no consumer would be speculative scaffolding (CLAUDE.md §9.4), so this page is
 * an honest placeholder that points at the matrix — the tool that does the work
 * today — instead of a mock canvas that pretends to save.
 */
export function WorkflowDesignerPage() {
  return (
    <div>
      <PageHeader
        title="Workflow designer"
        description="Visual, node-based workflows for branching approval processes."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Workflow' }, { label: 'Designer' }]}
      />

      <Alert tone="info" className="mb-4" title="Not built yet — and that is deliberate">
        The approval <strong>matrix</strong> already covers roughly 90% of approval cases
        (document type + condition → ordered levels). The visual designer is for the remaining
        branching processes — parallel splits, sub-workflows, conditional routing — which belong
        to modules (Procurement onboarding, CRM) that are not implemented yet. Building it now,
        with nothing to run through it, would be premature.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Use the approval matrix" description="Available now — the same engine, configured without a canvas." />
          <CardBody className="space-y-3">
            <p className="text-sm text-fg-muted">
              Most approvals are a straight escalation by amount or condition. The matrix defines
              those declaratively: bands, levels, approver roles, SLA and escalation — with a live
              simulator and gap/overlap coverage checks.
            </p>
            <Link to="/workflow/matrix">
              <Button variant="primary" size="sm" icon={<SlidersHorizontal className="h-4 w-4" />}>Open approval matrix</Button>
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What the designer will add later" description="V1-WFL-FR-023…026 (priority S)" />
          <CardBody>
            <ul className="space-y-2 text-sm text-fg-muted">
              {[
                ['Nodes', 'Start, Approval, Condition, Parallel split/join, Action, Notification, Wait, Sub-workflow, End'],
                ['Versioning', 'Running instances continue on their version; new instances use the active one'],
                ['Validation', 'Detect unreachable nodes, unmatched split/join, cycles without exit, unresolvable approvers'],
                ['Test mode', 'Run a workflow against a sample document with simulated decisions'],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-2">
                  <Network className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                  <span><strong className="text-fg">{t}:</strong> {d}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
        <Workflow className="h-10 w-10 text-fg-subtle" />
        <p className="mt-3 text-sm font-medium text-fg">Designer canvas comes with the first branching workflow</p>
        <p className="mt-1 max-w-md text-xs text-fg-muted">
          It will be built alongside the module that needs it (Procurement supplier onboarding is the
          first candidate), so it can be tested against a real process rather than a mock one.
        </p>
      </div>
    </div>
  )
}
