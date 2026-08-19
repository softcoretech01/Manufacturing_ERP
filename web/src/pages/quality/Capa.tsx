import { useState, useEffect } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DetailBlock, DueChip, QmsStatusBadge, useQualityData } from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { CAPA_FLOW, CAUSE_CATEGORIES, CAUSE_LABEL, capaClosureDays, capaStepBlockers, overdueDays } from '@/lib/qmsFlow'
import { newUid } from '@/store/data'
import { capasApi } from '@/api/capas'
import type { Capa, CauseCategory } from '@/types/quality'

/**
 * Corrective and preventive action (Ch 14).
 *
 * The distinction the screen enforces: a corrective action fixes what happened,
 * a preventive action stops it happening again. Both are required before work
 * starts, because a CAPA with only a corrective action is a repair order.
 * Closure needs a verification result and a recurrence check — otherwise
 * "closed" means "we stopped looking".
 */

const OPEN: Capa['status'][] = ['DRAFT', 'OPEN', 'IN_PROGRESS', 'VERIFICATION']
const STATUS_LABEL: Record<Capa['status'], string> = {
  DRAFT: 'Draft', OPEN: 'Open', IN_PROGRESS: 'In progress', VERIFICATION: 'Verification', CLOSED: 'Closed', CANCELLED: 'Cancelled',
}

export function CapaPage() {
  const toast = useToast()
  const { ncrs } = useQualityData()
  const [rows, setRows] = useState<Capa[]>([])

  const fetchCapas = async () => {
    try {
      const data = await capasApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch CAPAs')
    }
  }

  useEffect(() => {
    fetchCapas()
  }, [])

  const [tab, setTab] = useState('open')
  const [detail, setDetail] = useState<Capa | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Capa | null>(null)
  const [form, setForm] = useState({ title: '', ncrDocNo: '', itemCode: '', rootCause: '', causeCategory: 'METHOD' as CauseCategory, owner: '', dueOn: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Capa | null>(null)
  const [moving, setMoving] = useState<{ capa: Capa; to: Capa['status'] } | null>(null)

  const live = detail ? rows.find((r) => (r as any).id === (detail as any).id) ?? detail : null
  const stats = capaClosureDays(rows)

  const counts = {
    open: rows.filter((c) => OPEN.includes(c.status)).length,
    overdue: rows.filter((c) => OPEN.includes(c.status) && overdueDays(c.dueOn, c.closedOn) > 0).length,
    verification: rows.filter((c) => c.status === 'VERIFICATION').length,
    closed: rows.filter((c) => c.status === 'CLOSED').length,
    all: rows.length,
  }

  const filtered = rows.filter((c) => {
    if (tab === 'open') return OPEN.includes(c.status)
    if (tab === 'overdue') return OPEN.includes(c.status) && overdueDays(c.dueOn, c.closedOn) > 0
    if (tab === 'verification') return c.status === 'VERIFICATION'
    if (tab === 'closed') return c.status === 'CLOSED'
    return true
  })

  const columns: Column<Capa>[] = [
    { key: 'docNo', header: 'CAPA', sortable: true, width: '12rem', render: (c) => <span className="font-mono text-xs font-medium text-brand-600">{c.docNo}</span> },
    { key: 'title', header: 'Action', sortable: true, render: (c) => (<><p className="text-xs font-medium text-fg">{c.title}</p><p className="font-mono text-2xs text-fg-subtle">{c.itemCode}{c.ncrDocNo && ` · from ${c.ncrDocNo}`}</p></>) },
    { key: 'causeCategory', header: 'Cause', sortable: true, width: '8rem', accessor: (c) => CAUSE_LABEL[c.causeCategory], render: (c) => <span className="text-xs text-fg-muted">{CAUSE_LABEL[c.causeCategory]}</span> },
    { key: 'owner', header: 'Owner', sortable: true, width: '9rem' },
    { key: 'raisedOn', header: 'Raised', sortable: true, width: '8rem', accessor: (c) => c.raisedOn, render: (c) => formatDate(c.raisedOn) },
    { key: 'dueOn', header: 'Due', sortable: true, width: '8rem', accessor: (c) => c.dueOn, render: (c) => <span className={overdueDays(c.dueOn, c.closedOn) > 0 ? 'text-danger' : ''}>{formatDate(c.dueOn)}</span> },
    { key: 'timing', header: 'Timing', width: '8rem', accessor: (c) => overdueDays(c.dueOn, c.closedOn), render: (c) => <DueChip days={overdueDays(c.dueOn, c.closedOn)} /> },
    { key: 'effectivenessPct', header: 'Effective', align: 'right', width: '7.5rem', accessor: (c) => c.effectivenessPct ?? -1, render: (c) => (c.effectivenessPct === null ? <span className="text-2xs text-fg-subtle">—</span> : `${c.effectivenessPct}%`) },
    { key: 'status', header: 'Status', sortable: true, width: '10rem', accessor: (c) => STATUS_LABEL[c.status], render: (c) => <QmsStatusBadge status={c.status} /> },
  ]

  function openCreate() {
    setEditing(null)
    setForm({ title: '', ncrDocNo: '', itemCode: '', rootCause: '', causeCategory: 'METHOD', owner: '', dueOn: '' })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(c: Capa) {
    setEditing(c)
    setForm({ title: c.title ?? '', ncrDocNo: c.ncrDocNo ?? '', itemCode: c.itemCode ?? '', rootCause: c.rootCause ?? '', causeCategory: c.causeCategory ?? 'METHOD', owner: c.owner ?? '', dueOn: c.dueOn ?? '' })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'A title is required.'
    if (form.rootCause.trim().length < 20) e.rootCause = 'A CAPA starts from a root cause — describe it in at least 20 characters.'
    if (!form.owner.trim()) e.owner = 'An owner is required.'
    if (!form.dueOn) e.dueOn = 'A due date is required.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    const patch = { title: form.title.trim(), ncrDocNo: form.ncrDocNo.trim(), itemCode: form.itemCode.trim(), rootCause: form.rootCause.trim(), causeCategory: form.causeCategory, owner: form.owner.trim(), dueOn: form.dueOn }
    try {
      if (editing) {
        await capasApi.update((editing as any).id, { ...patch, version: editing.version + 1 })
        toast.success('CAPA updated', `${editing.docNo} saved.`)
      } else {
        const nextCode = await capasApi.getNextCode()
        await capasApi.create({ ...patch, docNo: nextCode.code, correctiveAction: '', preventiveAction: '', raisedOn: new Date().toISOString().slice(0, 10), status: 'DRAFT', verificationMethod: '', verificationResult: '', verifiedBy: null, verifiedOn: null, closedOn: null, recurrenceChecked: false, effectivenessPct: null, version: 1 } as any)
        toast.success('CAPA raised', `${nextCode.code} created. Both a corrective and a preventive action are needed before work starts.`)
      }
      fetchCapas()
      setFormOpen(false)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save CAPA')
    }
  }

  function moveStatus(c: Capa, to: Capa['status']) {
    const blockers = capaStepBlockers(c, to)
    if (blockers.length) {
      toast.error('Cannot move to this step', blockers[0])
      setMoving(null)
      return
    }
    const patch: Partial<Capa> = { status: to, version: c.version + 1 }
    if (to === 'CLOSED') {
      patch.closedOn = new Date().toISOString().slice(0, 10)
      patch.verifiedBy = 'S. Meena'
      patch.verifiedOn = new Date().toISOString().slice(0, 10)
      patch.effectivenessPct = 100
      // Closing the CAPA closes the NCR it came from — that is what an NCR waits for.
      // Backend SP auto-closes linked NCR
      const parent = ncrs.rows.find((n) => n.docNo === c.ncrDocNo && n.status !== 'CLOSED')
      if (parent) {
        capasApi.update((c as any).id, { ...patch, ncrDocNo: c.ncrDocNo }).then(() => {
          fetchCapas()
          toast.success('CAPA and NCR closed', `${c.docNo} closed, and ${parent.docNo} with it.`)
        }).catch((e: any) => toast.error('Error', e.message))
        setMoving(null)
        setDetail(null)
        return
      }
    }
    capasApi.update((c as any).id, patch).then(() => {
      fetchCapas()
      toast.success(STATUS_LABEL[to], `${c.docNo} moved to ${STATUS_LABEL[to].toLowerCase()}.`)
    }).catch((e: any) => toast.error('Error', e.message))
    setMoving(null)
    setDetail(null)
  }

  const nextSteps = live ? CAPA_FLOW[live.status].filter((s) => s !== 'CANCELLED') : []

  return (
    <div>
      <PageHeader
        title="Corrective & preventive action"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'CAPA' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Raise CAPA</Button>}
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'open', label: 'Open', count: counts.open },
            { id: 'overdue', label: 'Overdue', count: counts.overdue },
            { id: 'verification', label: 'In verification', count: counts.verification },
            { id: 'closed', label: 'Closed', count: counts.closed },
            { id: 'all', label: 'All', count: counts.all },
          ]} />
        }
      />

      <Alert tone={stats.overdue > 0 ? 'warning' : 'info'} className="mb-4">
        {stats.open} open, {stats.overdue} overdue, {stats.closed} closed.
        {stats.avgDays !== null && <> Average time from raising to closure is <span className="font-semibold text-fg">{stats.avgDays.toFixed(0)} days</span>.</>}
      </Alert>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(c) => String((c as any).id ?? c.uid)}
        searchPlaceholder="Search CAPA, title, owner or NCR…"
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'capa-register', 'CAPA register', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        onRowClick={setDetail}
        rowClassName={(c) => (OPEN.includes(c.status) && overdueDays(c.dueOn, c.closedOn) > 0 ? 'bg-danger/5' : undefined)}
        emptyTitle="No CAPAs"
        emptyDescription="Raise one from a non-conformance once its root cause is known."
        rowActions={(c) => (
          <>
            <MenuItem label="Edit" disabled={c.status === 'CLOSED'} onClick={() => openEdit(c)} />
            {CAPA_FLOW[c.status].filter((s) => s !== 'CANCELLED').map((to) => (
              <MenuItem key={to} label={`Move to ${STATUS_LABEL[to].toLowerCase()}`} separatorBefore={to === CAPA_FLOW[c.status][0]} onClick={() => setMoving({ capa: c, to })} />
            ))}
            <MenuItem label={c.status === 'CLOSED' ? 'Delete — blocked (closed)' : 'Delete'} icon={<Trash2 />} danger separatorBefore disabled={c.status === 'CLOSED'} onClick={() => setConfirmDelete(c)} />
          </>
        )}
      />

      <Drawer
        open={!!live}
        onClose={() => setDetail(null)}
        title={live?.docNo}
        description={live?.title}
        width="max-w-3xl"
        footer={live && (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-2xs text-fg-subtle">Owner {live.owner} · due {formatDate(live.dueOn)}{live.closedOn && ` · closed ${formatDate(live.closedOn)}`}</span>
            <div className="flex gap-2">
              {nextSteps.slice(0, 1).map((to) => (
                <Button key={to} variant={to === 'CLOSED' ? 'success' : 'primary'} size="sm" onClick={() => setMoving({ capa: live, to })}>
                  {STATUS_LABEL[to]}
                </Button>
              ))}
            </div>
          </div>
        )}
      >
        {live && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <QmsStatusBadge status={live.status} size="md" />
              <span className="text-2xs text-fg-muted">{CAUSE_LABEL[live.causeCategory]}</span>
              <DueChip days={overdueDays(live.dueOn, live.closedOn)} />
            </div>

            <ol className="flex flex-wrap items-center gap-1">
              {(['DRAFT', 'OPEN', 'IN_PROGRESS', 'VERIFICATION', 'CLOSED'] as Capa['status'][]).map((s, i, arr) => {
                const order = arr.indexOf(live.status)
                return (
                  <li key={s} className="flex items-center gap-1">
                    <span className={cn('rounded px-2 py-0.5 text-2xs font-medium', i < order && 'bg-success/10 text-success', i === order && 'bg-brand-600 text-white', i > order && 'bg-surface-3 text-fg-subtle')}>{STATUS_LABEL[s]}</span>
                    {i < arr.length - 1 && <span className="text-2xs text-fg-subtle">›</span>}
                  </li>
                )
              })}
            </ol>

            <DataGrid columns={2} items={[
              { label: 'From NCR', value: live.ncrDocNo || '—', mono: !!live.ncrDocNo },
              { label: 'Item', value: live.itemCode || '—', mono: true },
              { label: 'Raised', value: formatDate(live.raisedOn) },
              { label: 'Due', value: formatDate(live.dueOn) },
              { label: 'Verified by', value: live.verifiedBy ? `${live.verifiedBy} · ${formatDate(live.verifiedOn)}` : 'Not verified' },
              { label: 'Effectiveness', value: live.effectivenessPct === null ? '—' : `${live.effectivenessPct}%` },
            ]} />

            <DetailBlock title="Root cause">
              <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{live.rootCause}</p>
            </DetailBlock>

            <DetailBlock title="Corrective action — fixes what happened">
              <Textarea rows={3} value={live.correctiveAction} disabled={live.status === 'CLOSED'} placeholder="What is being done about the material, the batch or the customer already affected." onChange={(e) => capasApi.update((live as any).id, { correctiveAction: e.target.value }).then(() => fetchCapas())} />
            </DetailBlock>

            <DetailBlock title="Preventive action — stops it happening again">
              <Textarea rows={3} value={live.preventiveAction} disabled={live.status === 'CLOSED'} placeholder="What changes in the process, the control or the system so this cause cannot produce the same failure." onChange={(e) => capasApi.update((live as any).id, { preventiveAction: e.target.value }).then(() => fetchCapas())} />
            </DetailBlock>

            <DetailBlock title="Verification">
              <div className="space-y-2.5">
                <Textarea rows={2} value={live.verificationMethod} disabled={live.status === 'CLOSED'} placeholder="How the fix will be proved to work — what will be measured, over how many lots." onChange={(e) => capasApi.update((live as any).id, { verificationMethod: e.target.value }).then(() => fetchCapas())} />
                <Textarea rows={2} value={live.verificationResult} disabled={live.status === 'CLOSED'} placeholder="What the verification actually found." onChange={(e) => capasApi.update((live as any).id, { verificationResult: e.target.value }).then(() => fetchCapas())} />
                <Switch checked={live.recurrenceChecked} disabled={live.status === 'CLOSED'} onChange={(v) => capasApi.update((live as any).id, { recurrenceChecked: v }).then(() => fetchCapas())} label="The defect has not recurred since the action was taken" />
              </div>
            </DetailBlock>

            {nextSteps.length > 0 && capaStepBlockers(live, nextSteps[0]).length > 0 && (
              <Alert tone="warning" title={`Before moving to ${STATUS_LABEL[nextSteps[0]].toLowerCase()}`}>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {capaStepBlockers(live, nextSteps[0]).map((b) => (<li key={b}>{b}</li>))}
                </ul>
              </Alert>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'Raise a CAPA'}
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>{editing ? 'Save changes' : 'Raise CAPA'}</Button></>}
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Title" required containerClassName="sm:col-span-2" value={form.title} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select label="From NCR" value={form.ncrDocNo} onChange={(e) => { const n = ncrs.rows.find((x) => x.docNo === e.target.value); setForm({ ...form, ncrDocNo: e.target.value, itemCode: n?.itemCode ?? form.itemCode, rootCause: n?.rootCause || form.rootCause, causeCategory: n?.causeCategory ?? form.causeCategory }) }} options={[{ value: '', label: 'Not linked to an NCR' }, ...ncrs.rows.map((n) => ({ value: n.docNo, label: `${n.docNo} — ${n.title}` }))]} />
          <Input label="Item code" value={form.itemCode} onChange={(e) => setForm({ ...form, itemCode: e.target.value })} />
          <Textarea label="Root cause" required containerClassName="sm:col-span-2" rows={3} value={form.rootCause} error={errors.rootCause} onChange={(e) => setForm({ ...form, rootCause: e.target.value })} />
          <Select label="Cause category" value={form.causeCategory} onChange={(e) => setForm({ ...form, causeCategory: e.target.value as CauseCategory })} options={CAUSE_CATEGORIES.map((c) => ({ value: c, label: CAUSE_LABEL[c] }))} />
          <Input label="Owner" required value={form.owner} error={errors.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          <Input label="Due by" type="date" required value={form.dueOn} error={errors.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
        </div>
        <Alert tone="info" className="mt-4">
          Picking an NCR carries its root cause and cause category across, so the CAPA starts from the investigation
          rather than repeating it.
        </Alert>
      </Modal>

      <Modal
        open={!!moving}
        onClose={() => setMoving(null)}
        title={moving ? `Move to ${STATUS_LABEL[moving.to].toLowerCase()}?` : ''}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setMoving(null)}>Cancel</Button><Button variant={moving?.to === 'CLOSED' ? 'success' : 'primary'} onClick={() => moving && moveStatus(moving.capa, moving.to)}>Move</Button></>}
      >
        {moving && (
          <div className="space-y-2 text-sm text-fg-muted">
            <p><span className="font-medium text-fg">{moving.capa.docNo}</span> — {moving.capa.title}</p>
            {capaStepBlockers(moving.capa, moving.to).length > 0 ? (
              <Alert tone="danger" title="This step is blocked">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{capaStepBlockers(moving.capa, moving.to).map((b) => (<li key={b}>{b}</li>))}</ul>
              </Alert>
            ) : moving.to === 'CLOSED' ? (
              <p className="inline-flex items-start gap-1.5 text-xs"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />Closing this also closes {moving.capa.ncrDocNo || 'the linked NCR, if any'} — an NCR waits on its CAPA.</p>
            ) : (
              <p className="text-xs">Nothing blocks this step.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete CAPA"
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (confirmDelete) { capasApi.remove((confirmDelete as any).id).then(() => { fetchCapas(); toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted.`) }).catch((e: any) => toast.error('Error', e.message)) } setConfirmDelete(null) }}>Delete</Button></>}
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.docNo} will be marked deleted, not physically removed.</p>
      </Modal>
    </div>
  )
}
