import { useMemo, useState, useEffect } from 'react'
import { defectsApi } from '@/api/defects'
import { inspectionsApi } from '@/api/inspections'
import { api } from '@/api/client'
import { Plus, Trash2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, SeverityBadge, useQualityData } from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatAmount } from '@/lib/format'
import { CAUSE_CATEGORIES, CAUSE_LABEL, paretoOf, type ParetoRow } from '@/lib/qmsFlow'
import { newUid } from '@/store/data'
import type { CauseCategory, DefectSeverity, DefectType } from '@/types/quality'

/**
 * Defect catalogue and Pareto (Ch 12 and 15).
 *
 * The catalogue carries the scrap and rework cost per unit, which is what turns
 * a defect count into a cost of poor quality figure. The Pareto is computed from
 * the defects actually recorded on inspections, with the cumulative line that
 * separates the few causes carrying most of the loss from the long tail.
 */

export function DefectsPage() {
  const toast = useToast()
  const [inspectionsRows, setInspectionsRows] = useState<any[]>([])
  const [rows, setRows] = useState<DefectType[]>([])
  const [severities, setSeverities] = useState<{value: string, label: string}[]>([])
  const [causes, setCauses] = useState<{value: string, label: string}[]>([])

  const fetchLookups = async () => {
    try {
      const [sevData, causeData] = await Promise.all([
        api.get<any[]>('/quality/lookups/severities'),
        api.get<any[]>('/quality/lookups/causes')
      ])
      setSeverities(sevData.map(d => ({ value: d.name, label: d.name.charAt(0) + d.name.slice(1).toLowerCase() })))
      setCauses(causeData.map(d => ({ value: d.name, label: d.name })))
    } catch (e) {
      console.error('Failed to fetch lookups')
    }
  }

  const fetchDefects = async () => {
    try {
      const data = await defectsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch defects')
    }
  }

  const fetchInspections = async () => {
    try {
      const data = await inspectionsApi.getAll()
      setInspectionsRows(data || [])
    } catch (e) {
      console.error('Failed to fetch inspections')
    }
  }

  useEffect(() => {
    fetchDefects()
    fetchLookups()
    fetchInspections()
  }, [])

  const [tab, setTab] = useState('pareto')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DefectType | null>(null)
  const [form, setForm] = useState({ code: '', name: '', severity: 'MAJOR' as DefectSeverity, category: '', defaultCause: 'MACHINE' as CauseCategory, scrapCostPerUnit: '0', reworkCostPerUnit: '0', isActive: true })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<DefectType | null>(null)

  const pareto = useMemo(() => paretoOf(inspectionsRows), [inspectionsRows])
  const usageOf = (code: string) => inspectionsRows.reduce((n, i) => n + (i.defects || []).filter((d: any) => d.defectCode === code).length, 0)

  /** Cost carried by each defect, from its own rates times what was found. */
  const costed = useMemo(
    () =>
      pareto.map((p) => {
        const t = rows.find((d) => d.code === p.code)
        return { ...p, cost: t ? p.qty * Math.max(t.scrapCostPerUnit, t.reworkCostPerUnit) : 0 }
      }),
    [pareto, rows],
  )
  const totalCost = costed.reduce((s, p) => s + p.cost, 0)

  const chart = pareto.slice(0, 10).map((p) => ({ name: p.code, Quantity: p.qty, Cumulative: Number(p.cumulativePct.toFixed(1)) }))

  const catalogueColumns: Column<DefectType>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '7rem', render: (d) => <span className="font-mono text-xs font-medium text-brand-600">{d.code}</span> },
    { key: 'name', header: 'Defect', sortable: true },
    { key: 'severity', header: 'Severity', sortable: true, width: '6.5rem', render: (d) => <SeverityBadge severity={d.severity} /> },
    { key: 'category', header: 'Category', sortable: true, width: '11rem' },
    { key: 'defaultCause', header: 'Usual cause', sortable: true, width: '9rem', accessor: (d) => causes.find(c => c.value === d.defaultCause)?.label || CAUSE_LABEL[d.defaultCause] || d.defaultCause, render: (d) => <span className="text-xs text-fg-muted">{causes.find(c => c.value === d.defaultCause)?.label || CAUSE_LABEL[d.defaultCause] || d.defaultCause}</span> },
    { key: 'scrapCostPerUnit', header: 'Scrap ₹/unit', align: 'right', sortable: true, width: '9rem', accessor: (d) => d.scrapCostPerUnit, render: (d) => (d.scrapCostPerUnit ? formatAmount(d.scrapCostPerUnit) : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'reworkCostPerUnit', header: 'Rework ₹/unit', align: 'right', sortable: true, width: '9.5rem', accessor: (d) => d.reworkCostPerUnit, render: (d) => (d.reworkCostPerUnit ? formatAmount(d.reworkCostPerUnit) : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'usage', header: 'Found', align: 'right', width: '6rem', accessor: (d) => usageOf(d.code), render: (d) => <span className="text-xs tabular text-fg-muted">{usageOf(d.code)}</span> },
    { key: 'isActive', header: 'Status', width: '6.5rem', accessor: (d) => (d.isActive ? 'Active' : 'Inactive'), render: (d) => <span className={cn('text-2xs', d.isActive ? 'text-success' : 'text-fg-subtle')}>{d.isActive ? 'Active' : 'Inactive'}</span> },
  ]

  const paretoColumns: Column<(typeof costed)[number]>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '7rem', render: (p) => <span className="font-mono text-xs font-medium text-brand-600">{p.code}</span> },
    { key: 'name', header: 'Defect', sortable: true },
    { key: 'severity', header: 'Severity', width: '6.5rem', render: (p) => <SeverityBadge severity={p.severity} /> },
    { key: 'qty', header: 'Found', align: 'right', sortable: true, width: '6.5rem', accessor: (p) => p.qty },
    { key: 'pct', header: 'Share', align: 'right', width: '6.5rem', accessor: (p) => p.pct, render: (p) => `${p.pct.toFixed(1)}%` },
    { key: 'cumulativePct', header: 'Cumulative', align: 'right', width: '8rem', accessor: (p) => p.cumulativePct, render: (p) => <span className={cn('tabular', p.isVital ? 'font-medium text-fg' : 'text-fg-muted')}>{p.cumulativePct.toFixed(1)}%</span> },
    { key: 'cost', header: 'Cost', align: 'right', sortable: true, width: '9rem', accessor: (p) => p.cost, render: (p) => (p.cost ? `₹${formatAmount(p.cost)}` : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'isVital', header: 'Band', width: '8rem', accessor: (p) => (p.isVital ? 'Vital few' : 'Useful many'), render: (p) => <span className={cn('text-2xs', p.isVital ? 'font-medium text-danger' : 'text-fg-subtle')}>{p.isVital ? 'Vital few' : 'Useful many'}</span> },
  ]

  function openCreate() {
    setEditing(null)
    setForm({ code: 'Loading...', name: '', severity: 'MAJOR', category: '', defaultCause: 'MACHINE', scrapCostPerUnit: '0', reworkCostPerUnit: '0', isActive: true })
    setErrors({}); setFormOpen(true)
    defectsApi.getNextCode().then((res) => {
      setForm(prev => ({ ...prev, code: res.code }))
    }).catch(() => {
      setForm(prev => ({ ...prev, code: 'Auto-generated' }))
    })
  }
  function openEdit(d: DefectType) {
    setEditing(d)
    setForm({ code: d.code, name: d.name, severity: d.severity, category: d.category, defaultCause: d.defaultCause, scrapCostPerUnit: String(d.scrapCostPerUnit), reworkCostPerUnit: String(d.reworkCostPerUnit), isActive: d.isActive })
    setErrors({}); setFormOpen(true)
  }

  async function save() {
    const e: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()
    if (editing && !code) e.code = 'A code is required.'
    else if (editing && rows.some((d) => d.code === code && d.id !== editing?.id)) e.code = `${code} is already in the catalogue.`
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!form.category.trim()) e.category = 'A category groups the defect on the Pareto.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch: any = { name: form.name.trim(), severity: form.severity, category: form.category.trim(), defaultCause: form.defaultCause, scrapCostPerUnit: Number(form.scrapCostPerUnit) || 0, reworkCostPerUnit: Number(form.reworkCostPerUnit) || 0, isActive: form.isActive }
    if (editing) patch.code = code
    try {
      if (editing) { 
        await defectsApi.update(editing.id as number, patch); 
        toast.success('Defect updated', `${code} saved.`) 
      } else { 
        await defectsApi.create(patch); 
        toast.success('Defect added', `${code} can now be recorded on an inspection.`) 
      }
      await fetchDefects();
      setFormOpen(false)
    } catch (err) {
      toast.error('Error', 'Failed to save defect');
    }
  }

  const vitalFew = costed.filter((p) => p.isVital)

  return (
    <div>
      <PageHeader
        title="Defects"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'Defects' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Add defect type</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[{ id: 'pareto', label: 'Pareto', count: pareto.length }, { id: 'catalogue', label: 'Catalogue', count: rows.length }]} />}
      />

      {tab === 'pareto' && (
        <>
          {vitalFew.length > 0 && (
            <Alert tone="info" className="mb-4">
              {vitalFew.length} of {pareto.length} defect types account for the first 80% of everything found —{' '}
              {vitalFew.map((p) => p.name).join(', ')}. They carry ₹{formatAmount(vitalFew.reduce((s, p) => s + p.cost, 0))} of the
              ₹{formatAmount(totalCost)} total. Work on those and the tail follows.
            </Alert>
          )}

          <Card className="mb-4">
            <CardHeader title="Pareto of defects found" description="Count by defect type with the cumulative share; the line crosses 80% at the end of the vital few" />
            <CardBody className="h-64">
              {!chart.length ? (
                <p className="text-xs text-fg-subtle">No defects have been recorded on any inspection yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="l" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                    <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    <ReferenceLine yAxisId="r" y={80} stroke="#ef4444" strokeDasharray="4 3" label={{ value: '80%', fontSize: 10, fill: '#ef4444', position: 'right' }} />
                    <Bar yAxisId="l" dataKey="Quantity" radius={[3, 3, 0, 0]} maxBarSize={34}>
                      {chart.map((c, i) => (<Cell key={c.name} fill={pareto[i]?.isVital ? '#ef4444' : '#94a3b8'} />))}
                    </Bar>
                    <Line yAxisId="r" type="monotone" dataKey="Cumulative" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>

          <DataTable
            rows={costed}
            columns={paretoColumns}
            rowKey={(p) => p.code}
            searchPlaceholder="Search defect…"
            rowClassName={(p) => (p.isVital ? 'bg-danger/5' : undefined)}
            onExport={(f: ExportFormat) => {
              const cols: ExportColumn<ParetoRow & { cost: number }>[] = [
                { header: 'Code', value: (p) => p.code }, { header: 'Defect', value: (p) => p.name },
                { header: 'Severity', value: (p) => p.severity }, { header: 'Found', value: (p) => p.qty },
                { header: 'Share %', value: (p) => p.pct.toFixed(1) }, { header: 'Cumulative %', value: (p) => p.cumulativePct.toFixed(1) },
                { header: 'Cost', value: (p) => p.cost.toFixed(2) }, { header: 'Band', value: (p) => (p.isVital ? 'Vital few' : 'Useful many') },
              ]
              const n = exportRows(f, 'pareto', 'Defect Pareto', cols, costed)
              toast.success('Export ready', `${n} rows written.`)
            }}
            emptyTitle="No defects recorded"
            emptyDescription="Defects counted on inspections appear here, ranked."
          />
        </>
      )}

      {tab === 'catalogue' && (
        <DataTable
          rows={rows}
          columns={catalogueColumns}
          rowKey={(d) => d.id as number}
          searchPlaceholder="Search code, defect or category…"
          onExport={(f: ExportFormat) => { const n = exportRows(f, 'defect-catalogue', 'Defect catalogue', columnsFromTable(catalogueColumns), rows); toast.success('Export ready', `${n} rows written.`) }}
          onRowClick={openEdit}
          emptyTitle="No defect types"
          emptyDescription="The catalogue is what an inspector picks from when recording a defect."
          rowActions={(d) => (
            <>
              <MenuItem label="Edit" onClick={() => openEdit(d)} />
              <MenuItem label={d.isActive ? 'Deactivate' : 'Activate'} onClick={() => { defectsApi.update(d.id as number, { isActive: !d.isActive }).then(() => { fetchDefects(); toast.success(d.isActive ? 'Deactivated' : 'Activated', `${d.code} is now ${d.isActive ? 'hidden from' : 'available on'} the inspection screen.`) }) }} />
              <MenuItem label={usageOf(d.code) ? `Delete — blocked (found ${usageOf(d.code)} times)` : 'Delete'} icon={<Trash2 />} danger separatorBefore disabled={usageOf(d.code) > 0} onClick={() => setConfirmDelete(d)} />
            </>
          )}
        />
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.code}` : 'Add a defect type'} size="lg"
        footer={<><Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>{editing ? 'Save changes' : 'Add defect'}</Button></>}
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Code" disabled value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input label="Name" required maxLength={150} value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Severity" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as DefectSeverity })} options={severities.length ? severities : (['CRITICAL', 'MAJOR', 'MINOR'] as const).map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} hint="A critical defect rejects the lot regardless of the accept number." />
          <Input label="Category" required maxLength={100} value={form.category} error={errors.category} placeholder="Cosmetic, Function, Welding…" onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Select label="Usual cause" value={form.defaultCause} onChange={(e) => setForm({ ...form, defaultCause: e.target.value as CauseCategory })} options={causes.length ? causes : CAUSE_CATEGORIES.map((c) => ({ value: c, label: CAUSE_LABEL[c] }))} />
          <div className="flex items-end pb-1"><Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" /></div>
          <Input label="Scrap cost per unit (₹)" type="number" value={form.scrapCostPerUnit} hint="What is lost when this defect scraps the piece." onChange={(e) => setForm({ ...form, scrapCostPerUnit: e.target.value })} />
          <Input label="Rework cost per unit (₹)" type="number" value={form.reworkCostPerUnit} hint="What it costs to put right." onChange={(e) => setForm({ ...form, reworkCostPerUnit: e.target.value })} />
        </div>
        <Alert tone="info" className="mt-4">These two rates are what turn a defect count into a cost of poor quality figure on the dashboard and the COPQ report.</Alert>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete defect type" size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (confirmDelete) { defectsApi.remove(confirmDelete.id).then(() => { fetchDefects(); toast.success('Deleted', `${confirmDelete.code} was soft-deleted.`) }).catch(e => toast.error('Error', e.message)) } setConfirmDelete(null) }}>Delete</Button></>}
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.code} will be marked deleted, not physically removed. It has never been recorded on an inspection.</p>
      </Modal>
    </div>
  )
}
