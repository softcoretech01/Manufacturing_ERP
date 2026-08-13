import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Pencil, Scale, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { api } from '@/lib/api'
import type { EvalWeight, ProcParameter, ProcReasonCode } from '@/types/procurement'
import { cn } from '@/lib/utils'

const GROUP_LABEL: Record<string, string> = {
  GENERAL: 'General',
  TOLERANCE: 'Tolerances',
  APPROVAL: 'Approval & budget',
  STATUTORY: 'Statutory',
}

export function ProcurementSettingsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('parameters')

  return (
    <div>
      <PageHeader
        title="Procurement settings"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Settings' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'parameters', label: 'Parameters & tolerances' },
              { id: 'weights', label: 'Evaluation weights' },
              { id: 'reasons', label: 'Reason codes' },
              { id: 'related', label: 'Related configuration' },
            ]}
          />
        }
      />

      {tab === 'parameters' && <ParametersTab toast={toast} />}
      {tab === 'weights' && <WeightsTab toast={toast} />}
      {tab === 'reasons' && <ReasonsTab toast={toast} />}
      {tab === 'related' && <RelatedTab />}
    </div>
  )
}

type Toast = ReturnType<typeof useToast>

/* ═══════════════════════ Parameters ═══════════════════════ */

function ParametersTab({ toast }: { toast: Toast }) {
  const [rows, setRows] = useState<ProcParameter[]>([])
  const [editing, setEditing] = useState<ProcParameter | null>(null)
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchParams()
  }, [])

  const fetchParams = async () => {
    try {
      const data = await api.getProcParameters()
      setRows(data)
    } catch (err) {
      toast.error('Error', 'Failed to load parameters')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!editing) return
    if (!value.trim()) { toast.error('Value required', 'A parameter cannot be blank.'); return }
    try {
      await api.updateProcParameter(editing.uid, value.trim())
      toast.success('Parameter updated', `${editing.name} set to ${value.trim()}${editing.unit ? ` ${editing.unit}` : ''}.`)
      setEditing(null)
      fetchParams()
    } catch (err) {
      toast.error('Error', 'Failed to update parameter')
    }
  }

  const columns: Column<ProcParameter>[] = [
    { key: 'name', header: 'Parameter', sortable: true, render: (r) => (
      <div>
        <p className="text-xs font-medium text-fg">{r.name}</p>
        <p className="font-mono text-2xs text-fg-subtle">{r.code}</p>
      </div>
    ) },
    { key: 'description', header: 'What it controls', className: 'max-w-md', render: (r) => <span className="text-2xs text-fg-muted">{r.description}</span> },
    { key: 'group', header: 'Group', sortable: true, width: '10rem', render: (r) => (
      <Badge tone={r.group === 'STATUTORY' ? 'danger' : r.group === 'TOLERANCE' ? 'warning' : 'neutral'} size="sm" dot={false}>
        {GROUP_LABEL[r.group] || r.group}
      </Badge>
    ) },
    { key: 'value', header: 'Value', align: 'right', width: '10rem', render: (r) => (
      <span className="text-xs font-medium tabular text-fg">
        {r.value}{r.unit ? ` ${r.unit}` : ''}
      </span>
    ) },
    { key: 'scope', header: 'Scope', width: '16rem', render: (r) => <span className="text-2xs text-fg-subtle">{r.scope}</span> },
    { key: 'editable', header: '', align: 'center', width: '4rem', accessor: (r) => (r.editable ? '' : 'locked'), render: (r) => (
      r.editable ? null : <Lock className="mx-auto h-3.5 w-3.5 text-fg-subtle" aria-label="Statutory — not editable" />
    ) },
  ]

  if (loading) return <div>Loading...</div>

  return (
    <>
      <Alert tone="info" className="mb-4">
        Statutory values are shown but locked — they change by notification, not by opinion, and they are held in the
        statutory adapter rather than in procurement logic. Everything else is editable and every change is audited.
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search parameter, code, description…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'procurement-parameters', 'Procurement parameters', columnsFromTable(columns), rows)
          toast.success('Export ready', `${n} rows written.`)
        }}
        emptyTitle="No parameters"
        rowActions={(r) => (
          <MenuItem
            key="edit"
            label={r.editable ? 'Edit value' : 'Locked — statutory'}
            icon={<Pencil />}
            disabled={!r.editable}
            onClick={() => { setEditing(r); setValue(r.value) }}
          />
        )}
      />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.name}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleUpdate}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">{editing.description}</p>
            <Input label={`Value${editing.unit ? ` (${editing.unit})` : ''}`} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <p className="text-2xs text-fg-subtle">Scope: {editing.scope}</p>
          </div>
        )}
      </Modal>
    </>
  )
}

/* ═══════════════════════ Evaluation weights ═══════════════════════ */

function WeightsTab({ toast }: { toast: Toast }) {
  const [rows, setRows] = useState<EvalWeight[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWeights()
  }, [])

  const fetchWeights = async () => {
    try {
      const data = await api.getProcWeights()
      setRows(data)
    } catch (err) {
      toast.error('Error', 'Failed to load weights')
    } finally {
      setLoading(false)
    }
  }

  const updateWeight = (uid: string, pct: number) => {
    setRows(rows.map(w => w.uid === uid ? { ...w, weightPct: pct } : w))
  }

  const saveSet = async (setCode: string) => {
    const set = rows.filter(w => w.setCode === setCode)
    try {
      // API expects all weights for the set to be passed
      // We will create new UIDs for the new version backend handles it?
      // Actually backend expects new Uids to be generated or we pass it
      const newVersion = set.map(w => ({ ...w, uid: `w-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}` }))
      await api.saveProcWeights(newVersion)
      toast.success('Weight set saved', 'Saved as a new version.')
      fetchWeights()
    } catch (err) {
      toast.error('Error', 'Failed to save weights')
    }
  }

  const sets = [...new Set(rows.map((w) => w.setCode))]

  if (loading) return <div>Loading...</div>

  return (
    <>
      <Alert tone="info" className="mb-4">
        These weights decide which quotation the comparison engine recommends. The right answer for stainless coil is
        not the right answer for cartons, so each category carries its own set. A set must total exactly 100%.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {sets.map((code) => {
          const set = rows.filter((w) => w.setCode === code)
          const total = set.reduce((a, w) => a + w.weightPct, 0)
          const ok = Math.abs(total - 100) < 0.001
          return (
            <Card key={code}>
              <CardHeader
                title={set[0]?.setName ?? code}
                description={`Applied to ${set[0]?.category ?? '—'}`}
                actions={
                  <Badge tone={ok ? 'success' : 'danger'} size="sm">
                    {total.toFixed(0)}%
                  </Badge>
                }
              />
              <div className="space-y-3 p-4">
                {set.map((w) => (
                  <div key={w.uid}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-xs text-fg">
                        {w.criterion}
                        <span className="ml-1.5 text-2xs text-fg-subtle">{w.direction === 'LOWER' ? 'lower is better' : 'higher is better'}</span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={w.weightPct}
                        aria-label={`${w.criterion} weight`}
                        onChange={(e) => updateWeight(w.uid, Number(e.target.value) || 0)}
                        className="h-7 w-16 rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <ProgressBar value={w.weightPct} tone={ok ? 'brand' : 'danger'} />
                  </div>
                ))}
                {!ok && (
                  <p className="text-2xs text-danger">
                    Weights total {total.toFixed(0)}%. The set cannot be saved until it totals exactly 100%.
                  </p>
                )}
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ok}
                    onClick={() => saveSet(code)}
                  >
                    Save version
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

/* ═══════════════════════ Reason codes ═══════════════════════ */

function ReasonsTab({ toast }: { toast: Toast }) {
  const [rows, setRows] = useState<ProcReasonCode[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ code: '', label: '', documentType: 'Purchase return', requiresComment: 'yes' })

  useEffect(() => {
    fetchReasons()
  }, [])

  const fetchReasons = async () => {
    try {
      const data = await api.getProcReasons()
      setRows(data)
    } catch (err) {
      toast.error('Error', 'Failed to load reason codes')
    } finally {
      setLoading(false)
    }
  }

  const toggleStatus = async (r: ProcReasonCode) => {
    try {
      await api.updateProcReasonStatus(r.uid, !r.active)
      toast.success(r.active ? 'Retired' : 'Reactivated', `${r.code} status updated.`)
      fetchReasons()
    } catch (err) {
      toast.error('Error', 'Failed to update status')
    }
  }

  const handleCreate = async () => {
    if (!form.code.trim() || !form.label.trim()) { toast.error('Incomplete', 'A code and its meaning are both required.'); return }
    if (rows.some((r) => r.code.toUpperCase() === form.code.trim().toUpperCase())) { toast.error('Duplicate', 'That code already exists.'); return }
    
    try {
      await api.createProcReason({
        uid: `prc-${Date.now().toString(36)}`,
        code: form.code.trim().toUpperCase(),
        label: form.label.trim(),
        documentType: form.documentType,
        requiresComment: form.requiresComment === 'yes',
        active: true,
      })
      toast.success('Created', `${form.code.trim().toUpperCase()} created.`)
      setFormOpen(false)
      fetchReasons()
    } catch (err) {
      toast.error('Error', 'Failed to create reason code')
    }
  }

  const columns: Column<ProcReasonCode>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '12rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.code}</span> },
    { key: 'label', header: 'Meaning', sortable: true },
    { key: 'documentType', header: 'Used on', sortable: true, width: '14rem', render: (r) => <span className="text-2xs text-fg-muted">{r.documentType}</span> },
    { key: 'requiresComment', header: 'Comment', align: 'center', width: '8rem', accessor: (r) => (r.requiresComment ? 'Required' : 'Optional'), render: (r) => (
      r.requiresComment ? <Badge tone="warning" size="sm" dot={false}>required</Badge> : <span className="text-2xs text-fg-subtle">optional</span>
    ) },
    { key: 'active', header: 'Status', align: 'center', width: '7rem', accessor: (r) => (r.active ? 'Active' : 'Retired'), render: (r) => (
      <Badge tone={r.active ? 'success' : 'neutral'} size="sm">{r.active ? 'Active' : 'Retired'}</Badge>
    ) },
  ]

  if (loading) return <div>Loading...</div>

  return (
    <>
      <Alert tone="info" className="mb-4">
        Cancellations, rejections, returns and overrides all demand a reason from a configured list rather than free
        text. That is what makes a rejection analysis or an override register possible a year later.
      </Alert>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search code, meaning, document…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'procurement-reason-codes', 'Procurement reason codes', columnsFromTable(columns), rows)
          toast.success('Export ready', `${n} rows written.`)
        }}
        toolbar={
          <Button variant="primary" size="sm" onClick={() => { setForm({ code: '', label: '', documentType: 'Purchase return', requiresComment: 'yes' }); setFormOpen(true) }}>
            New reason code
          </Button>
        }
        emptyTitle="No reason codes"
        rowActions={(r) => (
          <MenuItem
            key="toggle"
            label={r.active ? 'Retire' : 'Reactivate'}
            danger={r.active}
            onClick={() => toggleStatus(r)}
          />
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New reason code"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Create</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input label="Code" required placeholder="QC-WELD-FAIL" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input label="Meaning" required placeholder="Weld seam failed leak test" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Select label="Used on" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} options={[
            'Requisition (emergency)', 'RFQ (short vendor)', 'Comparison (deviation)', 'PO cancellation',
            'PO short-close', 'Purchase return', 'Invoice exception', 'Supplier hold', 'Supplier rejection',
          ].map((v) => ({ value: v, label: v }))} />
          <Select label="Free-text comment" value={form.requiresComment} onChange={(e) => setForm({ ...form, requiresComment: e.target.value })} options={[
            { value: 'yes', label: 'Required alongside the code' },
            { value: 'no', label: 'Optional' },
          ]} />
        </div>
      </Modal>
    </>
  )
}

/* ═══════════════════════ Related configuration ═══════════════════════ */

function RelatedTab() {
  const items = [
    { to: '/workflow/matrix', title: 'Approval matrix', body: 'Who approves a requisition, a comparison, an order or an invoice, at which value band, with what SLA. Procurement supplies the configuration; the engine is shared.' },
    { to: '/admin/numbering', title: 'Document numbering', body: 'Series for PR, RFQ, quotation, PO, GRN, return and debit note. Receipts and statutory documents are gapless and numbered at approval, not at draft.' },
    { to: '/workflow/designer', title: 'Workflow designer', body: 'For genuinely branching processes — supplier onboarding runs purchase, quality, finance and compliance in parallel.' },
    { to: '/admin/notifications', title: 'Notification rules', body: 'RFQ invitations and reminders, delivery-due alerts, document-expiry warnings, MSME payment alerts and exception escalations.' },
    { to: '/masters/supplier', title: 'Supplier master', body: 'The record itself — addresses, contacts, banking, tax registration. Qualification and the approved vendor list live in this module.' },
    { to: '/admin/audit', title: 'Audit trail', body: 'Every override, tolerance change, price justification and approval decision, retained for eight years.' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="card p-4 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-sm font-medium text-fg">{i.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{i.body}</p>
        </Link>
      ))}
    </div>
  )
}
