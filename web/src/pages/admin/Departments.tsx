import { useState } from 'react'
import { ChevronDown, ChevronRight, ListTree, Plus, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataRow } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { costCentres, departments, plants, users } from '@/mock/data'
import type { Department } from '@/types'

export function DepartmentsPage() {
  const toast = useToast()
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['dep-01']))
  const [sel, setSel] = useState('dep-07')
  const [open, setOpen] = useState(false)

  const dept = departments.find((d) => d.uid === sel)!
  const children = departments.filter((d) => d.parentUid === dept.uid)
  const members = users.filter((u) => u.department === dept.name)

  const roots = departments.filter((d) => !d.parentUid)

  const renderNode = (d: Department, depth: number) => {
    const kids = departments.filter((x) => x.parentUid === d.uid)
    const isOpen = expanded.has(d.uid)
    return (
      <div key={d.uid}>
        <div
          className={cn(
            'flex items-center gap-1 rounded px-1 py-1.5 transition-colors',
            sel === d.uid ? 'bg-brand-500/10' : 'hover:bg-surface-3',
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <button
            onClick={() =>
              setExpanded((s) => {
                const n = new Set(s)
                n.has(d.uid) ? n.delete(d.uid) : n.add(d.uid)
                return n
              })
            }
            className={cn('shrink-0 rounded p-0.5 text-fg-subtle', !kids.length && 'invisible')}
          >
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          <button onClick={() => setSel(d.uid)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className={cn('truncate text-xs', sel === d.uid ? 'font-medium text-brand-600' : 'text-fg')}>{d.name}</span>
            <span className="shrink-0 font-mono text-[9px] text-fg-subtle">{d.code}</span>
          </button>
          <span className="shrink-0 text-2xs text-fg-subtle tabular">
            {users.filter((u) => u.department === d.name).length}
          </span>
        </div>
        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Departments"
        description="The organisational hierarchy that drives approval routing, cost allocation and HR structure."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Departments' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New department</Button>}
      />

      <Alert tone="info" className="mb-4" title="Department heads are workflow approvers">
        Approval rules using the <span className="font-mono">DEPARTMENT_HEAD</span> approver type
        resolve to the head assigned here. A department with no head assigned causes the workflow to
        escalate rather than silently auto-approve.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Hierarchy" description={`${departments.length} departments`} />
          <div className="max-h-[62vh] overflow-y-auto p-2">{roots.map((d) => renderNode(d, 0))}</div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title={dept.name} description={dept.departmentType.replace(/_/g, ' ')}
              actions={<Button size="sm" variant="outline" onClick={() => toast.info('Edit department', `${dept.name} (${dept.code}) — edit the department master.`)}>Edit</Button>} />
            <CardBody className="grid gap-x-8 sm:grid-cols-2">
              <DataRow label="Code" value={dept.code} mono />
              <DataRow label="Type" value={dept.departmentType} />
              <DataRow label="Head" value={dept.head} />
              <DataRow label="Cost centre" value={dept.costCentre} mono />
              <DataRow label="Parent" value={departments.find((d) => d.uid === dept.parentUid)?.name ?? '— top level —'} />
              <DataRow label="Sub-departments" value={String(children.length)} />
              <DataRow label="Members" value={String(members.length)} />
              <DataRow label="Status" value={<Badge tone={dept.isActive ? 'success' : 'neutral'} size="sm">{dept.isActive ? 'Active' : 'Inactive'}</Badge>} />
            </CardBody>
          </Card>

          {children.length > 0 && (
            <Card>
              <CardHeader title="Sub-departments" />
              <table className="grid-table">
                <thead><tr><th className="w-24">Code</th><th>Department</th><th className="w-40">Head</th><th className="w-32">Cost centre</th></tr></thead>
                <tbody>
                  {children.map((c) => (
                    <tr key={c.uid} className="cursor-pointer" onClick={() => setSel(c.uid)}>
                      <td className="font-mono text-xs">{c.code}</td>
                      <td className="text-xs text-fg">{c.name}</td>
                      <td className="text-xs text-fg-muted">{c.head}</td>
                      <td className="font-mono text-[11px]">{c.costCentre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <Card>
            <CardHeader title="Members" description={`${members.length} users assigned to this department`} />
            {members.length === 0 ? (
              <CardBody><p className="text-center text-xs text-fg-subtle">No users assigned.</p></CardBody>
            ) : (
              <div className="divide-y divide-border">
                {members.map((u) => (
                  <div key={u.uid} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={u.fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{u.fullName}</p>
                      <p className="truncate text-2xs text-fg-subtle">{u.designation}</p>
                    </div>
                    {u.fullName === dept.head && <Badge tone="brand" size="sm">Head</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New department"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { toast.success('Department created'); setOpen(false) }}>Create</Button></>}>
        <div className="space-y-3.5">
          <Input label="Department code" required placeholder="TOOL" />
          <Input label="Department name" required placeholder="Tool Room" />
          <Select label="Type" required
            options={['PRODUCTION', 'QUALITY', 'STORES', 'PURCHASE', 'SALES', 'FINANCE', 'HR', 'MAINTENANCE', 'ENGINEERING', 'ADMIN', 'PPC', 'DISPATCH'].map((v) => ({ value: v, label: v }))} />
          <Select label="Parent department" options={[{ value: '', label: '— top level —' }, ...departments.map((d) => ({ value: d.uid, label: d.name }))]} />
          <Select label="Department head" options={[{ value: '', label: '— unassigned —' }, ...users.filter((u) => u.status === 'ACTIVE').map((u) => ({ value: u.uid, label: `${u.fullName} — ${u.designation}` }))]}
            hint="Used by approval rules with the DEPARTMENT_HEAD approver type." />
          <Select label="Default cost centre" options={costCentres.map((c) => ({ value: c.uid, label: `${c.code} — ${c.name}` }))} />
          <Select label="Plant" options={[{ value: '', label: '— not plant-specific —' }, ...plants.map((p) => ({ value: p.uid, label: p.name }))]} />
        </div>
      </Modal>
    </div>
  )
}
