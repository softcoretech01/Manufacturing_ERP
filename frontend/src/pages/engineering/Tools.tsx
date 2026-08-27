import { useEffect, useState } from 'react'
import { Plus, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { EngStatusBadge, ToolLifeBar } from '@/components/engineering/EngShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate } from '@/lib/format'
import { toolLifePct, toolNeedsAttention } from '@/lib/engFlow'
import { machines } from '@/mock/masters'
import type { Routing, Tool, ToolType } from '@/types/engineering'
import { engineeringApi as api } from '@/api/engineering'

const TOOL_TYPES: ToolType[] = ['DIE', 'PUNCH', 'MOULD', 'FIXTURE', 'JIG', 'WHEEL', 'GAUGE']
const TOOL_TYPE_LABEL: Record<ToolType, string> = {
  DIE: 'Die',
  PUNCH: 'Punch',
  MOULD: 'Mould',
  FIXTURE: 'Fixture',
  JIG: 'Jig',
  WHEEL: 'Wheel',
  GAUGE: 'Gauge',
}
const STATUSES: Tool['status'][] = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'CALIBRATION', 'RETIRED']

interface FormState {
  code: string
  name: string
  toolType: ToolType
  machineCode: string
  lifeStrokes: string
  usedStrokes: string
  replacementCost: string
  lastMaintenanceOn: string
  nextCalibrationOn: string
  location: string
  status: Tool['status']
}

const emptyForm: FormState = {
  code: '',
  name: '',
  toolType: 'DIE',
  machineCode: '',
  lifeStrokes: '',
  usedStrokes: '0',
  replacementCost: '',
  lastMaintenanceOn: '',
  nextCalibrationOn: '',
  location: 'Tool Room — Rack A',
  status: 'AVAILABLE',
}

export function ToolsPage() {
  const toast = useToast()
  
  const [rows, setRows] = useState<Tool[]>([])
  const [routings, setRoutings] = useState<Routing[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [tab, setTab] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Tool | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Tool | null>(null)

  async function loadData() {
    try {
      const [tls, rts] = await Promise.all([
        api.getEngTools(),
        api.getRoutings().catch(() => [])
      ])
      setRows(tls)
      setRoutings(rts)
    } catch (err) {
      toast.error('Error', 'Failed to load tools')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const usageOf = (code: string) => routings.reduce((n, r) => n + r.operations.filter((o) => o.toolCode === code).length, 0)

  const perPiece = (t: Tool) => (t.lifeStrokes > 0 ? t.replacementCost / t.lifeStrokes : 0)

  const counts = {
    all: rows.length,
    attention: rows.filter(toolNeedsAttention).length,
    inUse: rows.filter((t) => t.status === 'IN_USE').length,
    retired: rows.filter((t) => t.status === 'RETIRED').length,
  }

  const filtered = rows.filter((t) => {
    if (tab === 'attention') return toolNeedsAttention(t)
    if (tab === 'inUse') return t.status === 'IN_USE'
    if (tab === 'retired') return t.status === 'RETIRED'
    return true
  })

  const columns: Column<Tool>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '7rem', render: (t) => <span className="font-mono text-xs font-medium text-brand-600">{t.code}</span> },
    { key: 'name', header: 'Tool', sortable: true },
    { key: 'toolType', header: 'Type', sortable: true, width: '6.5rem', accessor: (t) => TOOL_TYPE_LABEL[t.toolType], render: (t) => <span className="text-xs text-fg-muted">{TOOL_TYPE_LABEL[t.toolType]}</span> },
    { key: 'machineCode', header: 'Machine', width: '7rem', render: (t) => <span className="font-mono text-2xs text-fg-muted">{t.machineCode || '—'}</span> },
    { key: 'life', header: 'Life used', width: '9rem', accessor: (t) => toolLifePct(t), render: (t) => <ToolLifeBar tool={t} /> },
    { key: 'remaining', header: 'Remaining', align: 'right', sortable: true, width: '8rem', accessor: (t) => Math.max(0, t.lifeStrokes - t.usedStrokes), render: (t) => (t.lifeStrokes > 0 ? `${Math.max(0, t.lifeStrokes - t.usedStrokes).toLocaleString('en-IN')} pcs` : '—') },
    { key: 'perPiece', header: '₹ / piece', align: 'right', sortable: true, width: '7rem', accessor: (t) => perPiece(t), render: (t) => (t.lifeStrokes > 0 ? `₹${formatAmount(perPiece(t), 3)}` : '—') },
    { key: 'nextCalibrationOn', header: 'Calibration due', sortable: true, width: '8.5rem', accessor: (t) => t.nextCalibrationOn ?? '', render: (t) => formatDate(t.nextCalibrationOn) },
    { key: 'usage', header: 'Used by', align: 'right', width: '6rem', accessor: (t) => usageOf(t.code), render: (t) => <span className="text-xs text-fg-muted tabular">{usageOf(t.code)} ops</span> },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (t) => <EngStatusBadge status={t.status} size="sm" /> },
  ]

  async function openCreate() {
    setEditing(null)
    setErrors({})
    try {
      const res = await api.getEngToolsNextCode()
      setForm({ ...emptyForm, code: res.nextCode })
      setFormOpen(true)
    } catch (err) {
      toast.error('Error', 'Failed to generate code')
    }
  }

  function openEdit(t: Tool) {
    setEditing(t)
    setForm({
      code: t.code,
      name: t.name,
      toolType: t.toolType,
      machineCode: t.machineCode,
      lifeStrokes: String(t.lifeStrokes),
      usedStrokes: String(t.usedStrokes),
      replacementCost: String(t.replacementCost),
      lastMaintenanceOn: t.lastMaintenanceOn ?? '',
      nextCalibrationOn: t.nextCalibrationOn ?? '',
      location: t.location,
      status: t.status,
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'A name is required.'
    if (Number(form.lifeStrokes) < 0) e.lifeStrokes = 'Rated life cannot be negative.'
    if (Number(form.usedStrokes) < 0) e.usedStrokes = 'Strokes used cannot be negative.'
    if (Number(form.usedStrokes) > Number(form.lifeStrokes) && Number(form.lifeStrokes) > 0)
      e.usedStrokes = 'Strokes used exceed the rated life — retire the tool or revise its rating.'
    if (!(Number(form.replacementCost) >= 0)) e.replacementCost = 'Enter a replacement cost.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    const patch = {
      code: form.code,
      name: form.name.trim(),
      toolType: form.toolType,
      machineCode: form.machineCode,
      lifeStrokes: Number(form.lifeStrokes) || 0,
      usedStrokes: Number(form.usedStrokes) || 0,
      replacementCost: Number(form.replacementCost) || 0,
      lastMaintenanceOn: form.lastMaintenanceOn || null,
      nextCalibrationOn: form.nextCalibrationOn || null,
      location: form.location,
      status: form.status,
    }
    
    try {
      if (editing) {
        await api.updateEngTool(editing.uid, patch)
        toast.success('Tool updated', `${patch.code} saved. Routings that call for it re-cost immediately.`)
      } else {
        await api.createEngTool(patch)
        toast.success('Tool registered', `${patch.code} is available to routing operations.`)
      }
      setFormOpen(false)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to save tool')
    }
  }

  async function recordMaintenance(t: Tool) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      await api.updateEngTool(t.uid, { ...t, lastMaintenanceOn: today, status: 'AVAILABLE' })
      toast.success('Maintenance recorded', `${t.code} is back in the available pool.`)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to update tool')
    }
  }

  async function retireTool(t: Tool) {
    try {
      await api.updateEngTool(t.uid, { ...t, status: 'RETIRED' })
      toast.success('Retired', `${t.code} will not be offered on new routings.`)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to retire tool')
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    try {
      await api.deleteEngTool(confirmDelete.uid)
      toast.success('Deleted', `${confirmDelete.code} was soft-deleted.`)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to delete tool')
    } finally {
      setConfirmDelete(null)
    }
  }

  const draftPerPiece = Number(form.lifeStrokes) > 0 ? Number(form.replacementCost) / Number(form.lifeStrokes) : 0
  const attention = rows.filter(toolNeedsAttention)

  return (
    <div>
      <PageHeader
        title="Tools"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Tools' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Register tool
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'attention', label: 'Needs attention', count: counts.attention },
              { id: 'inUse', label: 'In use', count: counts.inUse },
              { id: 'retired', label: 'Retired', count: counts.retired },
            ]}
          />
        }
      />

      {attention.length > 0 && tab === 'all' && (
        <Alert tone="warning" className="mb-4">
          {attention.length} {attention.length === 1 ? 'tool is' : 'tools are'} past 85% of rated life or due for
          calibration within 30 days: {attention.map((t) => t.code).join(', ')}.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(t) => t.uid}
        isLoading={isLoading}
        searchPlaceholder="Search code, name, machine or location…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'tools', 'Tool register', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={openEdit}
        emptyTitle="No tools"
        emptyDescription="Register a tool to amortise it across the pieces it produces."
        rowClassName={(t) => (toolNeedsAttention(t) ? 'bg-warning/5' : undefined)}
        rowActions={(t) => (
          <>
            <MenuItem label="Edit" onClick={() => openEdit(t)} />
            <MenuItem
              label="Record maintenance"
              icon={<Wrench />}
              onClick={() => recordMaintenance(t)}
            />
            <MenuItem
              label="Retire"
              disabled={t.status === 'RETIRED'}
              onClick={() => retireTool(t)}
            />
            <MenuItem
              label={usageOf(t.code) ? `Delete — blocked (${usageOf(t.code)} operations)` : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={usageOf(t.code) > 0}
              onClick={() => setConfirmDelete(t)}
            />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Register a tool'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Register tool'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input maxLength={255} label="Code" required disabled value={form.code} hint="Auto-generated" onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input maxLength={255} label="Name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Type" value={form.toolType} onChange={(e) => setForm({ ...form, toolType: e.target.value as ToolType })} options={TOOL_TYPES.map((t) => ({ value: t, label: TOOL_TYPE_LABEL[t] }))} />
          <Select
            label="Machine"
            value={form.machineCode}
            onChange={(e) => setForm({ ...form, machineCode: e.target.value })}
            options={[{ value: '', label: 'Not machine-specific' }, ...machines.map((m) => ({ value: m.code, label: `${m.code} — ${m.name}` }))]}
          />
          <Input maxLength={255} label="Rated life (pieces)" type="number" value={form.lifeStrokes} error={errors.lifeStrokes} hint="Zero means the tool is not life-tracked and is not amortised." onChange={(e) => setForm({ ...form, lifeStrokes: e.target.value })} />
          <Input maxLength={255} label="Pieces produced so far" type="number" value={form.usedStrokes} error={errors.usedStrokes} onChange={(e) => setForm({ ...form, usedStrokes: e.target.value })} />
          <Input maxLength={255} label="Replacement cost (₹)" type="number" required value={form.replacementCost} error={errors.replacementCost} onChange={(e) => setForm({ ...form, replacementCost: e.target.value })} />
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Tool['status'] })} options={STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ') }))} />
          <Input maxLength={255} label="Last maintenance" type="date" value={form.lastMaintenanceOn} onChange={(e) => setForm({ ...form, lastMaintenanceOn: e.target.value })} />
          <Input maxLength={255} label="Calibration due" type="date" value={form.nextCalibrationOn} onChange={(e) => setForm({ ...form, nextCalibrationOn: e.target.value })} />
          <Input maxLength={255} label="Location" containerClassName="sm:col-span-2" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </div>

        {draftPerPiece > 0 && (
          <Alert tone="info" className="mt-4">
            Every piece made with this tool carries{' '}
            <span className="font-semibold text-fg">₹{formatAmount(draftPerPiece, 3)}</span> of tooling cost —
            ₹{formatAmount(Number(form.replacementCost), 0)} spread over {Number(form.lifeStrokes).toLocaleString('en-IN')}{' '}
            pieces. That is what the roll-up charges on any operation calling for it.
          </Alert>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete tool"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.code} will be marked deleted, not physically removed. No routing calls for it.
        </p>
      </Modal>
    </div>
  )
}
