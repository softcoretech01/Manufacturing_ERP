import { useMemo, useState } from 'react'
import { Plus, Power, RotateCcw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, EmptyState } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { SodRule } from '@/api/iam'
import { usePermissions, useSodRules, useCreateSodRule, useDeactivateSodRule, useRestoreSodRule } from '@/hooks/useIam'

/** Wired to the backend. Rules are stored in sys_sod_rule; violations are computed
 * live server-side from the real access matrix (who effectively holds both
 * permissions of a rule, via any role). */

export function SodPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useSodRules()
  const rules = useMemo(() => data ?? [], [data])
  const deactivate = useDeactivateSodRule()
  const restore = useRestoreSodRule()
  const [tab, setTab] = useState('violations')
  const [open, setOpen] = useState(false)

  const violations = useMemo(
    () => rules.filter((r) => r.is_active).flatMap((r) => r.violators.map((name) => ({ rule: r, name }))),
    [rules],
  )

  function toggle(r: SodRule) {
    const onError = (e: unknown) => toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.')
    if (r.is_active) {
      deactivate.mutate({ uid: r.uid, version: r.version }, { onSuccess: () => toast.success('Rule deactivated', `${r.name} no longer flags assignments.`), onError })
    } else {
      restore.mutate(r.uid, { onSuccess: () => toast.success('Rule restored', `${r.name} is active again.`), onError })
    }
  }

  const ruleColumns: Column<SodRule>[] = [
    { key: 'name', header: 'Rule', sortable: true, render: (r) => <span className="font-medium text-fg">{r.name}</span> },
    { key: 'permission_a', header: 'Permission A', render: (r) => <span className="font-mono text-[11px]">{r.permission_a}</span> },
    { key: 'permission_b', header: 'Permission B', render: (r) => <span className="font-mono text-[11px]">{r.permission_b}</span> },
    { key: 'severity', header: 'Severity', width: '100px', render: (r) => <Badge tone={r.severity === 'BLOCK' ? 'danger' : 'warning'} size="sm">{r.severity}</Badge> },
    { key: 'violation_count', header: 'Violations', align: 'right', width: '90px', accessor: (r) => r.violation_count, render: (r) => <span className={r.violation_count ? 'font-medium text-danger tabular' : 'text-fg-subtle tabular'}>{r.violation_count}</span> },
    { key: 'is_active', header: 'Status', width: '90px', accessor: (r) => (r.is_active ? 1 : 0), render: (r) => <Badge tone={r.is_active ? 'success' : 'neutral'} size="sm">{r.is_active ? 'Active' : 'Inactive'}</Badge> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'segregation-of-duties', 'Segregation of duties', columnsFromTable(ruleColumns), rules)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Segregation of duties"
        description="Conflicting permission pairs no single user should hold. Violations are evaluated live from current role assignments."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Segregation of duties' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New rule</Button>}
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'violations', label: 'Current violations', count: violations.length },
            { id: 'rules', label: 'Rules', count: rules.length },
          ]} />
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load SoD rules">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      {tab === 'violations' && (
        <Card>
          <CardHeader title="Users in violation" description="Evaluated live against current role assignments." />
          {isLoading ? (
            <p className="px-4 py-8 text-center text-xs text-fg-subtle">Loading…</p>
          ) : violations.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No violations" description="No user currently holds a conflicting permission pair, or no rules are defined." />
          ) : (
            <div className="divide-y divide-border">
              {violations.map((v, i) => (
                <div key={i} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <Avatar name={v.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{v.name}</span>
                      <Badge tone={v.rule.severity === 'BLOCK' ? 'danger' : 'warning'} size="sm">{v.rule.severity}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">{v.rule.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] text-danger">{v.rule.permission_a}</span>
                      <span className="text-2xs text-fg-subtle">+</span>
                      <span className="rounded bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] text-danger">{v.rule.permission_b}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'rules' && (
        <DataTable
          rows={rules}
          columns={ruleColumns}
          rowKey={(r) => r.uid}
          loading={isLoading}
          searchPlaceholder="Rule name or permission…"
          onExport={doExport}
          emptyTitle="No SoD rules yet"
          emptyDescription="Define a conflicting permission pair to flag users who hold both."
          emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New rule</Button>}
          rowActions={(r) => (
            <MenuItem label={r.is_active ? 'Deactivate' : 'Restore'} icon={r.is_active ? <Power /> : <RotateCcw />} danger={r.is_active} onClick={() => toggle(r)} />
          )}
        />
      )}

      <CreateRuleModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/* ─────────────────────────── Create rule modal ─────────────────────────── */
function CreateRuleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const createRule = useCreateSodRule()
  const permsQ = usePermissions()
  const perms = permsQ.data ?? []
  const [name, setName] = useState('')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [severity, setSeverity] = useState('BLOCK')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const opts = perms.map((p) => ({ value: p.code, label: p.code }))

  function submit() {
    setErrors({})
    createRule.mutate(
      { name: name.trim(), permission_a: a, permission_b: b, severity, description: description.trim() || null },
      {
        onSuccess: () => { toast.success('Rule created', 'Existing assignments are re-evaluated now.'); setName(''); setA(''); setB(''); setDescription(''); onClose() },
        onError: (e) => {
          if (e instanceof ProblemError) {
            const fe: Record<string, string> = {}
            for (const x of e.problem.errors ?? []) fe[x.field] = x.message
            setErrors(fe)
            toast.error(e.problem.title || 'Create failed', e.problem.detail)
          } else toast.error('Create failed', 'Unknown error.')
        },
      },
    )
  }

  if (!open) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="New segregation-of-duties rule"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={createRule.isPending} disabled={!name.trim() || !a || !b}>Create rule</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Input label="Rule name" required value={name} error={errors.name} maxLength={150} placeholder="Create PO vs approve PO" onChange={(e) => setName(e.target.value)} />
        <Select label="Permission A" required value={a} error={errors.permission_a} onChange={(e) => setA(e.target.value)} options={[{ value: '', label: 'Select a permission…' }, ...opts]} />
        <Select label="Permission B" required value={b} error={errors.permission_b} onChange={(e) => setB(e.target.value)} options={[{ value: '', label: 'Select a permission…' }, ...opts]} />
        <Select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}
          options={[{ value: 'BLOCK', label: 'BLOCK — the pair must never be combined' }, { value: 'WARN', label: 'WARN — allowed but flagged for review' }]} />
        <Textarea label="Rationale" value={description} maxLength={500} placeholder="Why these duties must be separated…" onChange={(e) => setDescription(e.target.value)} />
        <Alert tone="info">Creating a rule immediately re-evaluates every user's effective permissions.</Alert>
      </div>
    </Modal>
  )
}
