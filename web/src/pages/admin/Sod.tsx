import { useState } from 'react'
import { AlertTriangle, Plus, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { roles, sodRules, users } from '@/mock/data'
import { PERMISSIONS } from '@/mock/permissions'
import type { SodRule } from '@/types'

export function SodPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'segregation-of-duties', 'Segregation of duties', columnsFromTable(ruleColumns), sodRules)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('violations')
  const [open, setOpen] = useState(false)

  // Evaluate live violations against the mock role assignments.
  const violations = sodRules.flatMap((rule) => {
    const offenders = users.filter((u) => {
      const held = roles.filter((r) => u.roles.includes(r.code))
      const perms = new Set(held.flatMap((r) => r.permissions))
      const denied = new Set(held.flatMap((r) => r.deniedPermissions))
      return (
        perms.has(rule.permissionA) && perms.has(rule.permissionB) &&
        !denied.has(rule.permissionA) && !denied.has(rule.permissionB)
      )
    })
    return offenders.map((u) => ({ rule, user: u }))
  })

  const ruleColumns: Column<SodRule>[] = [
    { key: 'name', header: 'Rule', sortable: true, render: (r) => <span className="font-medium text-fg">{r.name}</span> },
    { key: 'permissionA', header: 'Permission A', render: (r) => <span className="font-mono text-[11px]">{r.permissionA}</span> },
    { key: 'permissionB', header: 'Permission B', render: (r) => <span className="font-mono text-[11px]">{r.permissionB}</span> },
    {
      key: 'severity',
      header: 'Severity',
      width: '100px',
      render: (r) => <Badge tone={r.severity === 'BLOCK' ? 'danger' : 'warning'} size="sm">{r.severity}</Badge>,
    },
    {
      key: 'violations',
      header: 'Violations',
      align: 'right',
      width: '90px',
      accessor: (r) => violations.filter((v) => v.rule.uid === r.uid).length,
      render: (r) => {
        const n = violations.filter((v) => v.rule.uid === r.uid).length
        return <span className={n ? 'font-medium text-danger tabular' : 'text-fg-subtle tabular'}>{n}</span>
      },
    },
    { key: 'isActive', header: 'Status', width: '90px', accessor: (r) => (r.isActive ? 1 : 0), render: (r) => <Badge tone={r.isActive ? 'success' : 'neutral'} size="sm">{r.isActive ? 'Active' : 'Inactive'}</Badge> },
  ]

  return (
    <div>
      <PageHeader
        title="Segregation of duties"
        description="Conflicting permission pairs that no single user should hold. BLOCK rules refuse the assignment; WARN rules allow it with a recorded justification."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Segregation of duties' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New rule</Button>}
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'violations', label: 'Current violations', count: violations.length },
            { id: 'rules', label: 'Rules', count: sodRules.length },
            { id: 'matrix', label: 'Conflict matrix' },
          ]} />
        }
      />

      {tab === 'violations' && (
        <Card>
          <CardHeader
            title="Users in violation"
            description="Evaluated live against current role assignments."
          />
          {violations.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No violations" description="No user currently holds a conflicting permission pair." />
          ) : (
            <div className="divide-y divide-border">
              {violations.map((v, i) => (
                <div key={i} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <Avatar name={v.user.fullName} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{v.user.fullName}</span>
                      <span className="text-xs text-fg-subtle">{v.user.designation}</span>
                      <Badge tone={v.rule.severity === 'BLOCK' ? 'danger' : 'warning'} size="sm">{v.rule.severity}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">{v.rule.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] text-danger">{v.rule.permissionA}</span>
                      <span className="text-2xs text-fg-subtle">+</span>
                      <span className="rounded bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] text-danger">{v.rule.permissionB}</span>
                    </div>
                    {v.rule.severity === 'WARN' && (
                      <p className="mt-1.5 text-2xs text-fg-subtle">
                        Mitigated by the workflow engine — self-approval is blocked, so the user cannot
                        approve a document they created.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="xs" variant="outline" onClick={() => toast.info('Adjust roles', `Open ${v.user.fullName}'s role assignment to remove one side of the conflicting pair.`)}>Adjust roles</Button>
                    <Button size="xs" variant="ghost" onClick={() => toast.info('Override requires a recorded justification and an approver.')}>
                      Record override
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'rules' && (
        <DataTable
          rows={sodRules}
          columns={ruleColumns}
          rowKey={(r) => r.uid}
          searchPlaceholder="Rule name or permission…"
          onExport={doExport}
          rowActions={(r) => (
            <>
              <MenuItem label="Edit rule" onClick={() => toast.info('Edit rule', `${r.name} — conflicting pair ${r.permissionA} + ${r.permissionB}.`)} />
              <MenuItem label="View violations" onClick={() => setTab('violations')} />
              <MenuItem label="Deactivate" danger onClick={() => toast.success('Rule deactivated', `${r.name} no longer blocks assignments.`)} />
            </>
          )}
        />
      )}

      {tab === 'matrix' && (
        <Card>
          <CardHeader title="Conflict matrix" description="Standard segregation-of-duties pairs for a manufacturing ERP." />
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="min-w-[220px]">Conflicting duty</th>
                  <th className="min-w-[220px]">Must not be combined with</th>
                  <th className="w-28">Severity</th>
                  <th>Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { a: 'Create purchase order', b: 'Approve purchase order', s: 'WARN', why: 'A buyer who can self-approve can commit company funds unchecked. Mitigated by the self-approval block.' },
                  { a: 'Create supplier', b: 'Approve supplier', s: 'BLOCK', why: 'Enables a fictitious-vendor fraud: create a supplier, approve it, raise a PO, pay it.' },
                  { a: 'GRN entry', b: 'QC approval', s: 'BLOCK', why: 'The person receiving goods must not also certify their quality.' },
                  { a: 'Payment voucher entry', b: 'Payment release', s: 'BLOCK', why: 'Classic maker–checker separation on outbound cash.' },
                  { a: 'Stock adjustment entry', b: 'Adjustment approval', s: 'BLOCK', why: 'Allows stock shrinkage to be written off without independent review.' },
                  { a: 'Employee master edit', b: 'Payroll approval', s: 'WARN', why: 'Enables a ghost-employee payroll fraud.' },
                  { a: 'Numbering series override', b: 'Invoice creation', s: 'BLOCK', why: 'Manual invoice numbering plus invoice creation defeats gapless statutory series.' },
                  { a: 'Period reopen', b: 'Journal voucher posting', s: 'BLOCK', why: 'Allows a closed period to be reopened and quietly restated.' },
                ].map((r, i) => (
                  <tr key={i}>
                    <td className="text-xs text-fg">{r.a}</td>
                    <td className="text-xs text-fg">{r.b}</td>
                    <td><Badge tone={r.s === 'BLOCK' ? 'danger' : 'warning'} size="sm">{r.s}</Badge></td>
                    <td className="text-xs text-fg-muted">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New segregation-of-duties rule"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Rule created', 'Existing assignments are re-evaluated now.'); setOpen(false) }}>Create rule</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input label="Rule name" required placeholder="Create PO vs approve PO" />
          <Select label="Permission A" required options={PERMISSIONS.slice(0, 120).map((p) => ({ value: p.code, label: p.code }))} />
          <Select label="Permission B" required options={PERMISSIONS.slice(0, 120).map((p) => ({ value: p.code, label: p.code }))} />
          <Select label="Severity" required defaultValue="BLOCK"
            options={[{ value: 'BLOCK', label: 'BLOCK — refuse the role assignment' }, { value: 'WARN', label: 'WARN — allow with a recorded justification' }]} />
          <Textarea label="Rationale" placeholder="Why these duties must be separated…" />
          <Alert tone="info">Creating a rule immediately re-evaluates every existing user assignment.</Alert>
        </div>
      </Modal>
    </div>
  )
}
