import { useMemo, useState } from 'react'
import { Check, Plus, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/format'
import { newUid } from '@/store/data'
import {
  DetailBlock, DueChip, PriorityBadge, WoStatusBadge, WoTypeBadge,
  duration, hours, inr, useMaintenanceData,
} from '@/components/maintenance/MaintShell'
import {
  WO_FLOW, WO_STATUS_LABEL, WO_TYPE_LABEL, daysBetween, eligibleTechnicians,
  issueBlockers, isoDate, maintenanceCost, woBlockers, woCost, woProgress,
} from '@/lib/maintFlow'
import type { MaintWorkOrder, WoLabour, WoPriority, WoSpare, WoStatus, WoType } from '@/types/maintenance'

/**
 * Maintenance work orders (Ch 10).
 *
 * The document everything else in the module ends up as. The rule the screen
 * exists to enforce sits at completion: every mandatory checklist line signed,
 * every reading actually recorded, and labour hours booked. A job that can be
 * closed with an unsigned safety check certifies work nobody did.
 */

const OPEN: WoStatus[] = ['DRAFT', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD']

const BLANK = (): Partial<MaintWorkOrder> => ({
  docNo: '', woType: 'CORRECTIVE', priority: 'MEDIUM',
  assetCode: '', assetName: '', sourceDocNo: '', title: '', description: '',
  raisedBy: 'You', raisedOn: isoDate(new Date()), supervisor: '',
  plannedStart: isoDate(new Date()), plannedFinish: isoDate(new Date(Date.now() + 86_400_000)),
  actualStart: null, actualFinish: null, status: 'DRAFT',
  labour: [], spares: [], externalCost: 0, externalVendor: '', checklist: [],
  permitNo: null, requiresPermit: false, downtimeMinutes: 0,
  verifiedBy: null, verifiedOn: null, closedOn: null,
  isRework: false, reworkOfDocNo: null, remarks: '', version: 1,
})

export function WorkOrdersPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const { rows, create, update, remove } = m.workOrders
  const today = isoDate(new Date())

  const [tab, setTab] = useState('open')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<MaintWorkOrder> | null>(null)
  const [advancing, setAdvancing] = useState<{ wo: MaintWorkOrder; to: WoStatus } | null>(null)
  const [assigning, setAssigning] = useState<MaintWorkOrder | null>(null)
  const [issuing, setIssuing] = useState<MaintWorkOrder | null>(null)
  const [issueItem, setIssueItem] = useState('')
  const [issueQty, setIssueQty] = useState('1')

  const live = useMemo(() => rows.filter((w) => !w.deletedAt), [rows])
  const detail = live.find((w) => w.uid === openUid) ?? null

  const filtered = useMemo(() => {
    if (tab === 'open') return live.filter((w) => OPEN.includes(w.status))
    if (tab === 'overdue') return live.filter((w) => OPEN.includes(w.status) && w.plannedFinish < today)
    if (tab === 'preventive') return live.filter((w) => w.woType === 'PREVENTIVE' || w.woType === 'PREDICTIVE')
    if (tab === 'closed') return live.filter((w) => ['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(w.status))
    return live
  }, [live, tab, today])

  const k = useMemo(() => {
    const open = live.filter((w) => OPEN.includes(w.status))
    const cost = maintenanceCost(live, isoDate(new Date(Date.now() - 89 * 86_400_000)), today)
    return {
      open: open.length,
      overdue: open.filter((w) => w.plannedFinish < today).length,
      inProgress: live.filter((w) => w.status === 'IN_PROGRESS').length,
      onHold: live.filter((w) => w.status === 'ON_HOLD').length,
      unassigned: open.filter((w) => !w.labour.length).length,
      cost,
      labourHours: live.reduce((s, w) => s + woCost(w).labourHours, 0),
    }
  }, [live, today])

  /* ── actions ────────────────────────────────────────────────── */

  function advance(wo: MaintWorkOrder, to: WoStatus) {
    const b = woBlockers(wo, to, m.permits.rows)
    if (b.length) { toast.error(b[0]); return }
    const now = new Date().toISOString()
    const patch: Partial<MaintWorkOrder> = { status: to }
    if (to === 'IN_PROGRESS' && !wo.actualStart) patch.actualStart = now
    if (to === 'COMPLETED') patch.actualFinish = now
    if (to === 'VERIFIED') { patch.verifiedBy = 'You'; patch.verifiedOn = today }
    if (to === 'CLOSED') patch.closedOn = today
    update(wo.uid, patch)

    // Closing a preventive job stamps the plan, which is what stops it being
    // reported as due for ever.
    if (to === 'CLOSED' && wo.woType === 'PREVENTIVE' && wo.sourceDocNo) {
      const plan = m.plans.rows.find((p) => !p.deletedAt && p.code === wo.sourceDocNo)
      const asset = m.assets.rows.find((a) => !a.deletedAt && a.code === wo.assetCode)
      if (plan) {
        const meter = plan.trigger === 'CYCLES' || plan.trigger === 'PRODUCTION_QTY' ? asset?.cycleCount ?? 0 : asset?.runningHours ?? 0
        m.plans.update(plan.uid, { lastDoneOn: today, lastDoneMeter: meter })
        toast.success(`${wo.docNo} closed`, `${plan.code} reset — next due from ${today}.`)
        setAdvancing(null)
        return
      }
    }
    toast.success(`${wo.docNo} → ${WO_STATUS_LABEL[to]}`)
    setAdvancing(null)
  }

  function toggleCheck(wo: MaintWorkOrder, lineUid: string) {
    if (['CLOSED', 'CANCELLED', 'VERIFIED'].includes(wo.status)) { toast.error('This job is closed. Reopen it before changing the checklist.'); return }
    update(wo.uid, {
      checklist: wo.checklist.map((c) => (c.uid === lineUid ? { ...c, done: !c.done } : c)),
    })
  }

  function setCheckValue(wo: MaintWorkOrder, lineUid: string, patch: Partial<MaintWorkOrder['checklist'][number]>) {
    update(wo.uid, { checklist: wo.checklist.map((c) => (c.uid === lineUid ? { ...c, ...patch } : c)) })
  }

  function assign(wo: MaintWorkOrder, techCode: string) {
    const tech = m.technicians.rows.find((t) => t.code === techCode)
    if (!tech) return
    if (wo.labour.some((l) => l.technicianCode === techCode)) { toast.error(`${tech.name} is already on this job.`); return }
    const line: WoLabour = { uid: newUid('lab'), technicianCode: tech.code, technicianName: tech.name, hours: 0, rate: tech.hourlyRate, isOvertime: false }
    update(wo.uid, { labour: [...wo.labour, line] })
    toast.success(`${tech.name} assigned to ${wo.docNo}`)
    setAssigning(null)
  }

  /**
   * Issuing a spare writes the transaction and moves the stock in one action.
   * Doing one without the other is how a store's book stock stops matching the
   * shelf.
   */
  function issueSpare() {
    if (!issuing) return
    const part = m.spares.rows.find((p) => !p.deletedAt && p.itemCode === issueItem)
    const qty = Number(issueQty)
    const b = issueBlockers(part, qty)
    if (b.length) { toast.error(b[0]); return }
    if (!part) return

    const line: WoSpare = { uid: newUid('wsp'), itemCode: part.itemCode, itemName: part.itemName, qtyIssued: qty, qtyReturned: 0, uom: part.uom, rate: part.rate }
    update(issuing.uid, { spares: [...issuing.spares, line] })
    m.spares.update(part.uid, { onHand: part.onHand - qty })
    m.spareTxns.create({
      uid: newUid('stx'), docNo: `SI/26-27/${String(m.spareTxns.rows.length + 320).padStart(4, '0')}`,
      txnType: 'ISSUE', itemCode: part.itemCode, itemName: part.itemName, qty, uom: part.uom,
      workOrderNo: issuing.docNo, assetCode: issuing.assetCode, txnAt: new Date().toISOString(),
      byWhom: 'You', remarks: '', version: 1,
    })
    toast.success(`${qty} ${part.uom} of ${part.itemName} issued`, `Stock now ${part.onHand - qty}.`)
    setIssuing(null); setIssueItem(''); setIssueQty('1')
  }

  function returnSpare(wo: MaintWorkOrder, spareUid: string) {
    const line = wo.spares.find((s) => s.uid === spareUid)
    if (!line) return
    const outstanding = line.qtyIssued - line.qtyReturned
    if (outstanding <= 0) { toast.error('Everything issued has already been returned.'); return }
    const part = m.spares.rows.find((p) => !p.deletedAt && p.itemCode === line.itemCode)
    update(wo.uid, { spares: wo.spares.map((s) => (s.uid === spareUid ? { ...s, qtyReturned: s.qtyReturned + 1 } : s)) })
    if (part) m.spares.update(part.uid, { onHand: part.onHand + 1 })
    m.spareTxns.create({
      uid: newUid('stx'), docNo: `SRT/26-27/${String(m.spareTxns.rows.length + 20).padStart(4, '0')}`,
      txnType: 'RETURN', itemCode: line.itemCode, itemName: line.itemName, qty: 1, uom: line.uom,
      workOrderNo: wo.docNo, assetCode: wo.assetCode, txnAt: new Date().toISOString(),
      byWhom: 'You', remarks: 'Returned unused.', version: 1,
    })
    toast.success(`1 ${line.uom} of ${line.itemName} returned to the store`)
  }

  function save() {
    if (!editing) return
    const problems: string[] = []
    if (!editing.title?.trim()) problems.push('Give the job a title.')
    if (!editing.assetCode) problems.push('Which asset is this for?')
    if (!editing.plannedStart || !editing.plannedFinish) problems.push('Set the planned dates.')
    if (editing.plannedFinish && editing.plannedStart && editing.plannedFinish < editing.plannedStart) {
      problems.push('The planned finish is before the planned start.')
    }
    if (editing.isRework && !editing.reworkOfDocNo) problems.push('A rework must name the job it repeats — otherwise first-time-fix cannot be measured.')
    if (problems.length) { toast.error(problems[0]); return }

    const asset = m.assets.rows.find((a) => a.code === editing.assetCode)
    const payload = { ...editing, assetName: asset?.name ?? editing.assetName ?? '' } as MaintWorkOrder
    if (editing.uid) { update(editing.uid, payload); toast.success(`${editing.docNo} updated`) }
    else {
      const seq = live.length + 120
      create({ ...(BLANK() as MaintWorkOrder), ...payload, uid: newUid('wo'), docNo: `WO/26-27/${String(seq).padStart(4, '0')}` })
      toast.success('Work order raised')
    }
    setEditing(null)
  }

  function removeWo(wo: MaintWorkOrder) {
    if (!['DRAFT', 'PLANNED', 'CANCELLED'].includes(wo.status)) {
      toast.error('Work has started on this job. Cancel it with a reason rather than deleting the record — a completed work order is evidence.')
      return
    }
    remove(wo.uid)
    if (openUid === wo.uid) setOpenUid(null)
    toast.success(`${wo.docNo} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<MaintWorkOrder>[] = [
    {
      key: 'doc', header: 'Work order', width: '16rem',
      render: (w) => (<><p className="truncate text-xs text-fg">{w.title}</p><p className="font-mono text-2xs text-fg-subtle">{w.docNo}{w.isRework ? ' · rework' : ''}</p></>),
    },
    { key: 'type', header: 'Type', width: '10rem', render: (w) => <WoTypeBadge woType={w.woType} /> },
    { key: 'asset', header: 'Asset', width: '16rem', render: (w) => (<><p className="truncate text-2xs text-fg-muted">{w.assetName}</p><p className="font-mono text-3xs text-fg-subtle">{w.assetCode}</p></>) },
    { key: 'priority', header: 'Priority', width: '8rem', render: (w) => <PriorityBadge priority={w.priority} /> },
    {
      key: 'tech', header: 'Assigned to', width: '13rem',
      render: (w) => w.labour.length
        ? (<><p className="truncate text-2xs text-fg-muted">{w.labour.map((l) => l.technicianName).join(', ')}</p><p className="text-3xs text-fg-subtle">{w.supervisor ? `sup. ${w.supervisor}` : 'no supervisor'}</p></>)
        : <Badge tone="warning" size="sm">Unassigned</Badge>,
    },
    {
      key: 'progress', header: 'Checklist', width: '12rem',
      render: (w) => {
        const p = woProgress(w)
        if (!p.total) return <span className="text-2xs text-fg-subtle">No checklist</span>
        return (
          <div className="flex items-center gap-2">
            <ProgressBar value={p.pct} tone={p.pct === 100 ? 'success' : p.mandatoryLeft ? 'warning' : 'brand'} className="w-12" />
            <span className="text-2xs tabular text-fg-muted">{p.done}/{p.total}</span>
          </div>
        )
      },
    },
    {
      key: 'due', header: 'Due', width: '9rem',
      render: (w) => OPEN.includes(w.status)
        ? <DueChip days={daysBetween(today, w.plannedFinish)} />
        : <span className="text-2xs tabular text-fg-subtle">{w.actualFinish ? formatDate(w.actualFinish.slice(0, 10)) : '—'}</span>,
    },
    { key: 'status', header: 'Status', width: '11rem', render: (w) => <WoStatusBadge status={w.status} /> },
    { key: 'cost', header: 'Cost', width: '11rem', align: 'right', render: (w) => { const c = woCost(w); return c.total > 0 ? <span className="text-xs tabular text-fg">{inr(c.total)}</span> : <span className="text-2xs text-fg-subtle">—</span> } },
  ]

  return (
    <div>
      <PageHeader
        title="Work orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Work orders' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>Raise a work order</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: k.open },
              { id: 'overdue', label: 'Overdue', count: k.overdue },
              { id: 'preventive', label: 'Planned work', count: live.filter((w) => w.woType === 'PREVENTIVE' || w.woType === 'PREDICTIVE').length },
              { id: 'closed', label: 'Finished', count: live.filter((w) => ['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(w.status)).length },
              { id: 'all', label: 'All', count: live.length },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open jobs" value={k.open} sub={`${k.inProgress} in progress · ${k.onHold} on hold`} icon={<Wrench />} tone={k.open ? 'brand' : 'success'} />
        <StatTile label="Overdue" value={k.overdue} sub="Past the planned finish date" tone={k.overdue ? 'danger' : 'success'} />
        <StatTile label="Unassigned" value={k.unassigned} sub="Open with nobody on them" tone={k.unassigned ? 'warning' : 'success'} />
        <StatTile label="Spend, 90 days" value={inr(k.cost.total)} sub={`${k.labourHours.toFixed(0)} labour hours booked`} tone="progress" />
      </div>

      {k.unassigned > 0 && (
        <Alert tone="warning" title={`${k.unassigned} open work order${k.unassigned === 1 ? ' has' : 's have'} nobody assigned`} className="mb-4">
          A job with no technician is a job that will not happen. Assign someone, or cancel it and say why.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(w) => w.uid}
        searchable
        searchPlaceholder="Search by number, title, asset or technician"
        onRowClick={(w) => setOpenUid(w.uid)}
        rowClassName={(w) => (OPEN.includes(w.status) && w.plannedFinish < today ? 'bg-danger/5' : w.status === 'ON_HOLD' ? 'bg-warning/5' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, `work-orders-${tab}`, 'Maintenance work orders', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(w) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...w, labour: w.labour.map((l) => ({ ...l })), spares: w.spares.map((s) => ({ ...s })), checklist: w.checklist.map((c) => ({ ...c })) })} />
            {WO_FLOW[w.status].map((to) => (<MenuItem key={to} label={WO_STATUS_LABEL[to]} onClick={() => setAdvancing({ wo: w, to })} />))}
            <MenuItem label="Delete" danger onClick={() => removeWo(w)} />
          </>
        )}
        emptyTitle={tab === 'overdue' ? 'Nothing overdue' : 'No work orders'}
        emptyDescription={tab === 'overdue' ? 'Every open job is inside its planned finish date.' : 'Raise one, or let a preventive plan generate it.'}
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.docNo} · ${detail.title}` : ''} width="max-w-3xl">
        {detail && (() => {
          const cost = woCost(detail)
          const progress = woProgress(detail)
          const permit = m.permits.rows.find((p) => !p.deletedAt && p.docNo === detail.permitNo)
          const editable = !['CLOSED', 'CANCELLED', 'VERIFIED'].includes(detail.status)

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <WoStatusBadge status={detail.status} size="md" />
                <WoTypeBadge woType={detail.woType} />
                <PriorityBadge priority={detail.priority} />
                {detail.isRework && <Badge tone="danger" size="sm" dot={false}>Rework of {detail.reworkOfDocNo}</Badge>}
                {OPEN.includes(detail.status) && <DueChip days={daysBetween(today, detail.plannedFinish)} />}
              </div>

              <p className="text-xs leading-relaxed text-fg-muted">{detail.description}</p>

              <DetailBlock title="Job">
                <DataGrid columns={3} items={[
                  { label: 'Asset', value: `${detail.assetCode} · ${detail.assetName}` },
                  { label: 'Raised by', value: `${detail.raisedBy} on ${formatDate(detail.raisedOn)}` },
                  { label: 'Supervisor', value: detail.supervisor || 'Not named' },
                  { label: 'Planned', value: `${formatDate(detail.plannedStart)} → ${formatDate(detail.plannedFinish)}` },
                  { label: 'Actual start', value: detail.actualStart ? formatDateTime(detail.actualStart) : 'Not started' },
                  { label: 'Actual finish', value: detail.actualFinish ? formatDateTime(detail.actualFinish) : 'Not finished' },
                  { label: 'Source', value: detail.sourceDocNo || '—', mono: !!detail.sourceDocNo },
                  { label: 'Downtime caused', value: detail.downtimeMinutes ? duration(detail.downtimeMinutes) : 'None' },
                  { label: 'Verified', value: detail.verifiedBy ? `${detail.verifiedBy} on ${formatDate(detail.verifiedOn as string)}` : 'Not verified' },
                ]} />
              </DetailBlock>

              {detail.requiresPermit && (
                <Alert tone={permit?.status === 'ACTIVE' ? 'tip' : 'danger'} title="Safety permit">
                  {!detail.permitNo
                    ? 'This job needs a permit and none is attached. Work cannot start until one is issued.'
                    : !permit
                      ? `Permit ${detail.permitNo} is referenced but does not exist.`
                      : permit.status === 'ACTIVE'
                        ? `${permit.docNo} is active until ${formatDate(permit.validUntil)}. It must be closed and the isolations returned before the job can be closed.`
                        : `${permit.docNo} is ${permit.status.toLowerCase().replace('_', ' ')}. Work may not start under it.`}
                </Alert>
              )}

              <DetailBlock
                title={`Checklist — ${progress.done} of ${progress.total} signed`}
                actions={progress.mandatoryLeft > 0 ? <Badge tone="warning" size="sm">{progress.mandatoryLeft} mandatory left</Badge> : progress.total > 0 ? <Badge tone="success" size="sm">All mandatory signed</Badge> : undefined}
              >
                {detail.checklist.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">No checklist. A job with nothing to tick cannot be evidenced.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.checklist.slice().sort((a, b) => a.seq - b.seq).map((c) => (
                      <div key={c.uid} className={cn('rounded border p-2', c.result === 'FAIL' ? 'border-danger/40 bg-danger/5' : c.done ? 'border-border bg-surface-2' : 'border-border')}>
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleCheck(detail, c.uid)}
                            disabled={!editable}
                            className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', c.done ? 'border-success bg-success text-white' : 'border-border-strong', !editable && 'cursor-not-allowed opacity-60')}
                            aria-label={c.done ? 'Unsign' : 'Sign'}
                          >
                            {c.done && <Check className="h-3 w-3" />}
                          </button>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-xs', c.done ? 'text-fg-muted' : 'text-fg')}>
                              {c.seq}. {c.description}
                              {c.mandatory && <span className="ml-1 text-danger">*</span>}
                            </span>
                            {c.done && (c.capture === 'READING' || c.capture === 'PASS_FAIL') && (
                              <span className="mt-1 flex items-center gap-2">
                                {c.capture === 'READING' && (
                                  <Input
                                    type="number" sizeVariant="sm" className="w-28"
                                    value={c.reading === null ? '' : String(c.reading)}
                                    onChange={(e) => setCheckValue(detail, c.uid, { reading: e.target.value === '' ? null : Number(e.target.value) })}
                                    placeholder={`value ${c.uom}`}
                                    disabled={!editable}
                                    aria-label={`Reading for ${c.description}`}
                                  />
                                )}
                                {c.capture === 'PASS_FAIL' && (
                                  <span className="flex gap-1">
                                    {(['PASS', 'FAIL'] as const).map((r) => (
                                      <button
                                        key={r} type="button" disabled={!editable}
                                        onClick={() => setCheckValue(detail, c.uid, { result: r })}
                                        className={cn('rounded border px-2 py-0.5 text-2xs transition-colors',
                                          c.result === r ? (r === 'PASS' ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger') : 'border-border text-fg-muted hover:border-border-strong')}
                                      >{r === 'PASS' ? 'Pass' : 'Fail'}</button>
                                    ))}
                                  </span>
                                )}
                                {c.capture === 'READING' && c.uom && <span className="text-3xs text-fg-subtle">{c.uom}</span>}
                              </span>
                            )}
                            {c.remarks && <span className="mt-0.5 block text-3xs text-fg-subtle">{c.remarks}</span>}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DetailBlock>

              <DetailBlock
                title={`Labour — ${cost.labourHours.toFixed(1)} hours, ${inr(cost.labour)}`}
                actions={editable ? <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setAssigning(detail)}>Assign</Button> : undefined}
              >
                {detail.labour.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">Nobody assigned.</p>
                ) : (
                  <table className="grid-table">
                    <thead><tr><th>Technician</th><th className="text-right" style={{ width: '9rem' }}>Hours</th><th className="text-right" style={{ width: '8rem' }}>Rate</th><th style={{ width: '7rem' }}>OT</th><th className="text-right" style={{ width: '10rem' }}>Cost</th><th style={{ width: '5rem' }} /></tr></thead>
                    <tbody>
                      {detail.labour.map((l) => (
                        <tr key={l.uid}>
                          <td className="text-xs text-fg">{l.technicianName}<span className="ml-1.5 font-mono text-3xs text-fg-subtle">{l.technicianCode}</span></td>
                          <td className="text-right">
                            <Input
                              type="number" sizeVariant="sm" className="w-20 text-right"
                              value={String(l.hours)} disabled={!editable}
                              onChange={(e) => update(detail.uid, { labour: detail.labour.map((x) => (x.uid === l.uid ? { ...x, hours: Number(e.target.value) } : x)) })}
                              aria-label={`Hours for ${l.technicianName}`}
                            />
                          </td>
                          <td className="text-right text-xs tabular text-fg-muted">{inr(l.rate)}</td>
                          <td>
                            <Switch
                              label="" checked={l.isOvertime} disabled={!editable}
                              onChange={(v) => update(detail.uid, { labour: detail.labour.map((x) => (x.uid === l.uid ? { ...x, isOvertime: v } : x)) })}
                            />
                          </td>
                          <td className="text-right text-xs tabular text-fg">{inr(l.hours * l.rate * (l.isOvertime ? 1.5 : 1))}</td>
                          <td className="text-right">
                            {editable && (
                              <button type="button" onClick={() => update(detail.uid, { labour: detail.labour.filter((x) => x.uid !== l.uid) })} className="rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger" aria-label="Remove">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="mt-1 text-3xs text-fg-subtle">Overtime is costed at 1.5×.</p>
              </DetailBlock>

              <DetailBlock
                title={`Spares — ${inr(cost.spares)}`}
                actions={editable ? <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => { setIssuing(detail); setIssueItem(''); setIssueQty('1') }}>Issue</Button> : undefined}
              >
                {detail.spares.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">No spares issued.</p>
                ) : (
                  <table className="grid-table">
                    <thead><tr><th>Part</th><th className="text-right" style={{ width: '8rem' }}>Issued</th><th className="text-right" style={{ width: '8rem' }}>Returned</th><th className="text-right" style={{ width: '9rem' }}>Rate</th><th className="text-right" style={{ width: '10rem' }}>Net cost</th><th style={{ width: '6rem' }} /></tr></thead>
                    <tbody>
                      {detail.spares.map((s) => (
                        <tr key={s.uid}>
                          <td><p className="text-xs text-fg">{s.itemName}</p><p className="font-mono text-3xs text-fg-subtle">{s.itemCode}</p></td>
                          <td className="text-right text-xs tabular text-fg">{s.qtyIssued} {s.uom}</td>
                          <td className="text-right text-xs tabular text-fg-muted">{s.qtyReturned || '—'}</td>
                          <td className="text-right text-xs tabular text-fg-muted">{inr(s.rate)}</td>
                          <td className="text-right text-xs tabular text-fg">{inr((s.qtyIssued - s.qtyReturned) * s.rate)}</td>
                          <td className="text-right">
                            {editable && s.qtyIssued > s.qtyReturned && (
                              <Button variant="ghost" size="sm" onClick={() => returnSpare(detail, s.uid)}>Return 1</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </DetailBlock>

              <DetailBlock title="Cost">
                <table className="w-full text-xs">
                  <tbody>
                    <tr><td className="py-1 text-fg-muted">Labour · {cost.labourHours.toFixed(1)} h</td><td className="py-1 text-right tabular text-fg">{inr(cost.labour)}</td></tr>
                    <tr><td className="py-1 text-fg-muted">Spares, net of returns</td><td className="py-1 text-right tabular text-fg">{inr(cost.spares)}</td></tr>
                    <tr><td className="py-1 text-fg-muted">External services{detail.externalVendor ? ` · ${detail.externalVendor}` : ''}</td><td className="py-1 text-right tabular text-fg">{inr(cost.external)}</td></tr>
                    <tr className="border-t border-border"><td className="py-1 font-medium text-fg">Total</td><td className="py-1 text-right font-semibold tabular text-fg">{inr(cost.total)}</td></tr>
                  </tbody>
                </table>
              </DetailBlock>

              {detail.remarks && <DetailBlock title="Notes"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>}

              {WO_FLOW[detail.status].length > 0 && (
                <DetailBlock title="Next step">
                  <div className="flex flex-wrap gap-2">
                    {WO_FLOW[detail.status].map((to) => {
                      const b = woBlockers(detail, to, m.permits.rows)
                      return (
                        <Button key={to} variant={to === 'CANCELLED' ? 'outline' : 'primary'} size="sm" onClick={() => setAdvancing({ wo: detail, to })} disabled={b.length > 0} title={b[0]}>
                          {WO_STATUS_LABEL[to]}
                        </Button>
                      )
                    })}
                  </div>
                  {(() => {
                    const all = WO_FLOW[detail.status].flatMap((to) => woBlockers(detail, to, m.permits.rows).map((x) => `${WO_STATUS_LABEL[to]}: ${x}`))
                    return all.length ? (
                      <Alert tone="info" title="Outstanding before the next step" className="mt-2">
                        <ul className="list-disc space-y-0.5 pl-4">{all.map((x) => (<li key={x}>{x}</li>))}</ul>
                      </Alert>
                    ) : null
                  })()}
                </DetailBlock>
              )}

              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail, labour: detail.labour.map((l) => ({ ...l })), spares: detail.spares.map((s) => ({ ...s })), checklist: detail.checklist.map((c) => ({ ...c })) }); setOpenUid(null) }}>Edit</Button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── assign ───────────────────────────────────────────── */}
      <Modal open={!!assigning} onClose={() => setAssigning(null)} title={assigning ? `Assign a technician to ${assigning.docNo}` : ''} size="lg">
        {assigning && (() => {
          const plan = m.plans.rows.find((p) => p.code === assigning.sourceDocNo)
          const skill = plan?.requiredSkill ?? ''
          const candidates = eligibleTechnicians(skill, m.technicians.rows, live)
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                {skill
                  ? <>The plan calls for the <strong className="text-fg">{skill.toLowerCase()}</strong> trade. Only technicians holding it are offered, least loaded first.</>
                  : 'Every available technician, least loaded first.'}
              </p>
              {candidates.length === 0 ? (
                <Alert tone="warning" title="Nobody available">No available technician holds the skill this job needs. Widen the skill on the plan, or make someone available.</Alert>
              ) : (
                <div className="space-y-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c.technician.uid} type="button" onClick={() => assign(assigning, c.technician.code)}
                      className="flex w-full items-center gap-3 rounded border border-border p-2.5 text-left transition-colors hover:border-brand-400 hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-fg">{c.technician.name}</span>
                        <span className="block text-2xs text-fg-subtle">
                          {c.technician.code} · {c.technician.trade.toLowerCase()} · shift {c.technician.shift} · {inr(c.technician.hourlyRate)}/h
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-2xs text-fg-muted">{c.openJobs} open · {c.assignedHours} h booked</span>
                        {c.isOverloaded
                          ? <Badge tone="danger" size="sm">Over {c.technician.shiftHours} h shift</Badge>
                          : <Badge tone="success" size="sm">{(c.technician.shiftHours - c.assignedHours).toFixed(1)} h free</Badge>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* ── issue a spare ────────────────────────────────────── */}
      <Modal
        open={!!issuing}
        onClose={() => setIssuing(null)}
        title={issuing ? `Issue a spare to ${issuing.docNo}` : ''}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setIssuing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={issueSpare} disabled={!issueItem}>Issue</Button></>}
      >
        {issuing && (() => {
          const compatible = m.spares.rows.filter((p) => !p.deletedAt && (p.compatibleAssets.length === 0 || p.compatibleAssets.includes(issuing.assetCode)))
          const others = m.spares.rows.filter((p) => !p.deletedAt && !compatible.includes(p))
          const part = m.spares.rows.find((p) => p.itemCode === issueItem)
          const b = part ? issueBlockers(part, Number(issueQty)) : []
          return (
            <div className="space-y-3">
              <Select label="Part" required value={issueItem} onChange={(e) => setIssueItem(e.target.value)} hint={`Parts listed as fitting ${issuing.assetCode} come first`}>
                <option value="">Choose a spare…</option>
                {compatible.length > 0 && (
                  <optgroup label={`Fits ${issuing.assetCode}`}>
                    {compatible.map((p) => (<option key={p.uid} value={p.itemCode}>{p.itemCode} · {p.itemName} — {p.onHand - p.reserved} available</option>))}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label="Other parts">
                    {others.map((p) => (<option key={p.uid} value={p.itemCode}>{p.itemCode} · {p.itemName} — {p.onHand - p.reserved} available</option>))}
                  </optgroup>
                )}
              </Select>
              <Input label="Quantity" type="number" value={issueQty} onChange={(e) => setIssueQty(e.target.value)} />
              {part && (
                <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                  <p className="flex justify-between py-0.5"><span className="text-fg-muted">On hand</span><span className="tabular text-fg">{part.onHand} {part.uom}</span></p>
                  <p className="flex justify-between py-0.5"><span className="text-fg-muted">Reserved for other jobs</span><span className="tabular text-fg">{part.reserved} {part.uom}</span></p>
                  <p className="flex justify-between border-t border-border py-0.5 pt-1"><span className="text-fg-muted">Available</span><span className="font-medium tabular text-fg">{part.onHand - part.reserved} {part.uom}</span></p>
                  <p className="flex justify-between py-0.5"><span className="text-fg-muted">Value of this issue</span><span className="tabular text-fg">{inr(Number(issueQty || 0) * part.rate)}</span></p>
                  {part.onHand - Number(issueQty || 0) < part.minStock && (
                    <p className="mt-1 text-3xs text-warning">This issue takes stock below the minimum of {part.minStock}. A reorder will be suggested.</p>
                  )}
                </div>
              )}
              {b.length > 0 && <Alert tone="danger" title="Cannot issue"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert>}
            </div>
          )
        })()}
      </Modal>

      {/* ── advance ──────────────────────────────────────────── */}
      <Modal
        open={!!advancing}
        onClose={() => setAdvancing(null)}
        title={advancing ? `${advancing.wo.docNo} → ${WO_STATUS_LABEL[advancing.to]}` : ''}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdvancing(null)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => advancing && advance(advancing.wo, advancing.to)} disabled={!!advancing && woBlockers(advancing.wo, advancing.to, m.permits.rows).length > 0}>Confirm</Button>
          </>
        }
      >
        {advancing && (() => {
          const b = woBlockers(advancing.wo, advancing.to, m.permits.rows)
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                {advancing.to === 'COMPLETED'
                  ? 'Completing records that the work described was actually done, as signed on the checklist.'
                  : advancing.to === 'CLOSED'
                    ? advancing.wo.woType === 'PREVENTIVE'
                      ? 'Closing resets the maintenance plan, so its next due date is measured from today.'
                      : 'Closing finalises the job and its cost. It cannot be edited afterwards.'
                    : advancing.to === 'IN_PROGRESS'
                      ? 'Starting the job stamps the actual start time and, where a permit is required, checks it is active.'
                      : `Moving ${advancing.wo.docNo} to ${WO_STATUS_LABEL[advancing.to].toLowerCase()}.`}
              </p>
              {b.length > 0
                ? <Alert tone="danger" title="Not yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert>
                : <Alert tone="tip" title="Ready">Everything this step requires is in place.</Alert>}
            </div>
          )
        })()}
      </Modal>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.docNo}` : 'Raise a work order'}
        width="max-w-2xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Type" value={editing.woType ?? 'CORRECTIVE'} onChange={(e) => setEditing({ ...editing, woType: e.target.value as WoType })}>
                {(Object.keys(WO_TYPE_LABEL) as WoType[]).map((t) => (<option key={t} value={t}>{WO_TYPE_LABEL[t]}</option>))}
              </Select>
              <Select label="Priority" value={editing.priority ?? 'MEDIUM'} onChange={(e) => setEditing({ ...editing, priority: e.target.value as WoPriority })}>
                <option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
              </Select>
            </div>
            <Input label="Title" required value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <Select
              label="Asset" required value={editing.assetCode ?? ''}
              onChange={(e) => {
                const a = m.assets.rows.find((x) => x.code === e.target.value)
                setEditing({ ...editing, assetCode: e.target.value, assetName: a?.name ?? '', priority: a?.criticality === 'A' ? 'HIGH' : editing.priority })
              }}
            >
              <option value="">Choose an asset…</option>
              {m.assets.rows.filter((a) => !a.deletedAt).sort((a, b) => a.code.localeCompare(b.code)).map((a) => (
                <option key={a.uid} value={a.code}>{a.code} · {a.name} (class {a.criticality})</option>
              ))}
            </Select>
            <Textarea label="Description" rows={3} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Planned start" type="date" value={editing.plannedStart ?? ''} onChange={(e) => setEditing({ ...editing, plannedStart: e.target.value })} />
              <Input label="Planned finish" type="date" value={editing.plannedFinish ?? ''} onChange={(e) => setEditing({ ...editing, plannedFinish: e.target.value })} />
              <Input label="Supervisor" value={editing.supervisor ?? ''} onChange={(e) => setEditing({ ...editing, supervisor: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="External cost" type="number" value={String(editing.externalCost ?? 0)} onChange={(e) => setEditing({ ...editing, externalCost: Number(e.target.value) })} />
              <Input label="External vendor" value={editing.externalVendor ?? ''} onChange={(e) => setEditing({ ...editing, externalVendor: e.target.value })} />
            </div>
            <Input label="Downtime caused (minutes)" type="number" value={String(editing.downtimeMinutes ?? 0)} onChange={(e) => setEditing({ ...editing, downtimeMinutes: Number(e.target.value) })} hint="Minutes the asset was unavailable because of this job" />
            <div className="space-y-2 rounded border border-border bg-surface-2 p-3">
              <Switch label="Needs a safety permit" checked={!!editing.requiresPermit} onChange={(v) => setEditing({ ...editing, requiresPermit: v })} />
              {editing.requiresPermit && (
                <Select label="Permit" value={editing.permitNo ?? ''} onChange={(e) => setEditing({ ...editing, permitNo: e.target.value || null })}>
                  <option value="">Not yet issued</option>
                  {m.permits.rows.filter((p) => !p.deletedAt).map((p) => (<option key={p.uid} value={p.docNo}>{p.docNo} · {p.permitType} ({p.status.toLowerCase()})</option>))}
                </Select>
              )}
              <Switch label="This is a rework of an earlier job" checked={!!editing.isRework} onChange={(v) => setEditing({ ...editing, isRework: v, reworkOfDocNo: v ? editing.reworkOfDocNo : null })} />
              {editing.isRework && (
                <Select label="Repeats" required value={editing.reworkOfDocNo ?? ''} onChange={(e) => setEditing({ ...editing, reworkOfDocNo: e.target.value || null })} hint="Linking it back is what makes first-time-fix measurable">
                  <option value="">Choose the earlier job…</option>
                  {live.filter((w) => w.uid !== editing.uid && ['COMPLETED', 'VERIFIED', 'CLOSED'].includes(w.status)).map((w) => (
                    <option key={w.uid} value={w.docNo}>{w.docNo} · {w.title}</option>
                  ))}
                </Select>
              )}
            </div>
            <Textarea label="Notes" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />
          </div>
        )}
      </Drawer>
    </div>
  )
}
