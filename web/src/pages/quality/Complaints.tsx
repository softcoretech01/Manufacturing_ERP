import { useMemo, useState, useEffect } from 'react'
import { MessageSquareWarning, Plus } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, DetailBlock, DueChip, QmsStatusBadge, SeverityBadge, useQualityData } from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { CAUSE_CATEGORIES, CAUSE_LABEL, overdueDays, ppm } from '@/lib/qmsFlow'
import { newUid } from '@/store/data'
import { complaintsApi } from '@/api/complaints'
import type { CauseCategory, Complaint, ComplaintResolution, ComplaintStatus, DefectSeverity } from '@/types/quality'

/**
 * Customer complaints (Ch 18).
 *
 * A complaint is the one defect the customer saw, which makes it the only
 * quality signal that arrives with a cost already attached. The screen enforces
 * the order the investigation has to run in: you cannot resolve a complaint
 * before a root cause is recorded, and a critical complaint cannot be closed
 * without a CAPA — otherwise "resolved" means the replacement was shipped and
 * nothing was learnt.
 */

/** The order an investigation moves through, and what each step may follow. */
const COMPLAINT_FLOW: Record<ComplaintStatus, ComplaintStatus[]> = {
  LOGGED: ['UNDER_INVESTIGATION', 'REJECTED'],
  UNDER_INVESTIGATION: ['ROOT_CAUSE_IDENTIFIED', 'REJECTED'],
  ROOT_CAUSE_IDENTIFIED: ['RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
  REJECTED: [],
}

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  LOGGED: 'Logged',
  UNDER_INVESTIGATION: 'Under investigation',
  ROOT_CAUSE_IDENTIFIED: 'Root cause identified',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
}

const RESOLUTION_LABEL: Record<ComplaintResolution, string> = {
  PENDING: 'Not yet decided',
  REPLACEMENT: 'Replacement despatched',
  CREDIT_NOTE: 'Credit note issued',
  REPAIR: 'Repaired and returned',
  NO_FAULT_FOUND: 'No fault found',
}

const OPEN_STATES: ComplaintStatus[] = ['LOGGED', 'UNDER_INVESTIGATION', 'ROOT_CAUSE_IDENTIFIED', 'RESOLVED']

/** What stops a complaint moving to the next state. */
function stepBlockers(c: Complaint, to: ComplaintStatus): string[] {
  const out: string[] = []
  if (to === 'UNDER_INVESTIGATION' && !(c.owner ?? '').trim()) out.push('Name the person who will investigate.')
  if (to === 'ROOT_CAUSE_IDENTIFIED') {
    if ((c.rootCause ?? '').trim().length < 10) out.push('Record the root cause — a sentence, not a word.')
    if (!c.causeCategory) out.push('Classify the cause so it can be counted in the Pareto.')
  }
  if (to === 'RESOLVED') {
    if (c.resolution === 'PENDING') out.push('Decide the resolution: replacement, credit note, repair, or no fault found.')
    if (c.resolution !== 'NO_FAULT_FOUND' && (c.resolutionValue ?? 0) <= 0) out.push('Enter what the resolution cost — a complaint with no cost never reaches the cost-of-poor-quality report.')
  }
  if (to === 'CLOSED') {
    if (c.severity === 'CRITICAL' && !c.capaDocNo) out.push('A critical complaint cannot be closed without a CAPA raised against it.')
    if (!c.ncrDocNo && c.resolution !== 'NO_FAULT_FOUND') out.push('Link the NCR raised for the returned material.')
  }
  if (to === 'REJECTED' && (c.remarks ?? '').trim().length < 10) out.push('Rejecting a complaint needs a written justification for the customer.')
  return out
}

const BLANK = (): Partial<Complaint> => ({
  docNo: '', customerName: '', complaintType: '', severity: 'MAJOR',
  itemCode: '', itemName: '', batchNo: '', productionOrderNo: '', invoiceNo: '',
  qtySupplied: 0, qtyComplained: 0, description: '',
  loggedOn: new Date().toISOString().slice(0, 10), loggedBy: 'You', owner: '',
  dueOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  status: 'LOGGED', resolution: 'PENDING', resolutionValue: 0,
  rootCause: '', causeCategory: null, ncrDocNo: null, capaDocNo: null,
  closedOn: null, remarks: '', version: 1,
})

export function ComplaintsPage() {
  const toast = useToast()
  const { ncrs, capas } = useQualityData()
  const [rows, setRows] = useState<Complaint[]>([])

  const fetchComplaints = async () => {
    try {
      const data = await complaintsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch complaints')
    }
  }

  useEffect(() => {
    fetchComplaints()
  }, [])

  const [tab, setTab] = useState('open')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<Complaint> | null>(null)
  const [advancing, setAdvancing] = useState<{ complaint: Complaint; to: ComplaintStatus } | null>(null)

  const live = useMemo(() => rows.filter((c) => !c.deletedAt), [rows])
  const detail = live.find((c) => c.uid === openUid) ?? null

  const filtered = useMemo(() => {
    if (tab === 'open') return live.filter((c) => OPEN_STATES.includes(c.status))
    if (tab === 'overdue') return live.filter((c) => OPEN_STATES.includes(c.status) && overdueDays(c.dueOn, c.closedOn) > 0)
    if (tab === 'closed') return live.filter((c) => c.status === 'CLOSED' || c.status === 'REJECTED')
    return live
  }, [live, tab])

  const k = useMemo(() => {
    const open = live.filter((c) => OPEN_STATES.includes(c.status))
    const closed = live.filter((c) => c.status === 'CLOSED')
    const overdue = open.filter((c) => overdueDays(c.dueOn, c.closedOn) > 0)
    const cost = live.reduce((s, c) => s + c.resolutionValue, 0)
    const supplied = live.reduce((s, c) => s + c.qtySupplied, 0)
    const complained = live.reduce((s, c) => s + c.qtyComplained, 0)

    // Days from logging to closing, over the ones that closed.
    const days = closed
      .filter((c) => c.closedOn)
      .map((c) => Math.max(0, (new Date(c.closedOn as string).getTime() - new Date(c.loggedOn).getTime()) / 86_400_000))
    const avgDays = days.length ? days.reduce((s, d) => s + d, 0) / days.length : null

    // Pareto by complaint type, weighted by the quantity complained about.
    const byType = new Map<string, { qty: number; count: number; cost: number }>()
    for (const c of live) {
      const e = byType.get(c.complaintType) ?? { qty: 0, count: 0, cost: 0 }
      e.qty += c.qtyComplained
      e.count += 1
      e.cost += c.resolutionValue
      byType.set(c.complaintType, e)
    }
    const pareto = [...byType.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.qty - a.qty)

    // Cause mix — only the complaints that got as far as a diagnosis.
    const diagnosed = live.filter((c) => c.causeCategory)
    const byCause = CAUSE_CATEGORIES.map((cause) => ({
      cause,
      label: CAUSE_LABEL[cause],
      count: diagnosed.filter((c) => c.causeCategory === cause).length,
    })).filter((r) => r.count > 0)

    return {
      total: live.length,
      open: open.length,
      overdue: overdue.length,
      critical: open.filter((c) => c.severity === 'CRITICAL').length,
      cost,
      ppm: ppm(complained, supplied),
      avgDays,
      pareto,
      byCause,
      diagnosed: diagnosed.length,
      // A complaint resolved without a CAPA is the failure mode this screen
      // exists to catch, so it is counted rather than left implicit.
      noCapa: live.filter((c) => (c.status === 'CLOSED' || c.status === 'RESOLVED') && !c.capaDocNo).length,
    }
  }, [live])

  /* ── actions ────────────────────────────────────────────────── */

  function advance(c: Complaint, to: ComplaintStatus) {
    const b = stepBlockers(c, to)
    if (b.length) { toast.error(b[0]); return }
    complaintsApi.update((c as any).id, {
      status: to,
      closedOn: to === 'CLOSED' || to === 'REJECTED' ? new Date().toISOString().slice(0, 10) : null,
    }).then(() => {
      fetchComplaints()
      toast.success(`${c.docNo} → ${STATUS_LABEL[to]}`)
      setAdvancing(null)
    }).catch((e: any) => toast.error('Error', e.message))
  }

  async function save() {
    if (!editing) return
    const problems: string[] = []
    if (!(editing.customerName ?? '').trim()) problems.push('Name the customer.')
    if (!(editing.itemCode ?? '').trim()) problems.push('Which item is being complained about?')
    if (!(editing.complaintType ?? '').trim()) problems.push('Give the complaint a type so it can be counted.')
    if ((editing.qtyComplained ?? 0) <= 0) problems.push('How many units are affected?')
    if ((editing.qtyComplained ?? 0) > (editing.qtySupplied ?? 0)) problems.push('More units complained about than were supplied — check the quantities.')
    if ((editing.description ?? '').trim().length < 10) problems.push('Describe what the customer reported.')
    if (problems.length) { toast.error(problems[0]); return }

    try {
      if (editing.docNo) {
        await complaintsApi.update((editing as any).id, editing as Complaint)
        toast.success(`${editing.docNo} updated`)
      } else {
        await complaintsApi.create({ ...(BLANK() as Complaint), ...(editing as Complaint) } as any)
        toast.success('Complaint logged')
      }
      fetchComplaints()
      setEditing(null)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save')
    }
  }

  function removeRow(c: Complaint) {
    if (c.status !== 'LOGGED') { toast.error('The investigation has already started. Reject it with a reason rather than deleting the record.'); return }
    complaintsApi.remove((c as any).id).then(() => {
      fetchComplaints()
      if (openUid === String((c as any).id ?? c.uid)) setOpenUid(null)
      toast.success(`${c.docNo} removed`)
    }).catch((e: any) => toast.error('Error', e.message))
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<Complaint>[] = [
    {
      key: 'doc', header: 'Complaint', width: '15rem',
      render: (c) => (<><p className="font-mono text-2xs text-fg">{c.docNo}</p><p className="truncate text-2xs text-fg-subtle">{formatDate(c.loggedOn)} · {c.loggedBy}</p></>),
    },
    { key: 'customer', header: 'Customer', width: '16rem', render: (c) => <p className="truncate text-xs text-fg">{c.customerName}</p> },
    {
      key: 'item', header: 'Item / batch', width: '16rem',
      render: (c) => (<><p className="truncate text-xs text-fg">{c.itemName}</p><p className="font-mono text-2xs text-fg-subtle">{c.batchNo}</p></>),
    },
    { key: 'type', header: 'Type', width: '9rem', render: (c) => <span className="text-2xs text-fg-muted">{c.complaintType}</span> },
    { key: 'severity', header: 'Severity', width: '7rem', render: (c) => <SeverityBadge severity={c.severity} /> },
    {
      key: 'qty', header: 'Affected', width: '9rem', align: 'right',
      render: (c) => (
        <>
          <p className="text-xs tabular text-fg">{c.qtyComplained}</p>
          <p className="text-3xs text-fg-subtle">of {c.qtySupplied} · {c.qtySupplied > 0 ? ((c.qtyComplained / c.qtySupplied) * 100).toFixed(1) : '0'}%</p>
        </>
      ),
    },
    { key: 'owner', header: 'Owner', width: '10rem', render: (c) => <span className="text-2xs text-fg-muted">{c.owner || '—'}</span> },
    {
      key: 'due', header: 'Due', width: '9rem',
      render: (c) => OPEN_STATES.includes(c.status)
        ? <DueChip days={overdueDays(c.dueOn, c.closedOn)} />
        : <span className="text-2xs text-fg-subtle">{c.closedOn ? formatDate(c.closedOn) : '—'}</span>,
    },
    { key: 'status', header: 'Status', width: '11rem', render: (c) => <QmsStatusBadge status={c.status} /> },
    {
      key: 'cost', header: 'Cost', width: '10rem', align: 'right',
      render: (c) => c.resolutionValue > 0
        ? <span className="text-xs tabular text-fg">₹{c.resolutionValue.toLocaleString('en-IN')}</span>
        : <span className="text-2xs text-fg-subtle">—</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Customer complaints"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'Complaints' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>Log a complaint</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: live.filter((c) => OPEN_STATES.includes(c.status)).length },
              { id: 'overdue', label: 'Overdue', count: k.overdue },
              { id: 'closed', label: 'Closed', count: live.filter((c) => c.status === 'CLOSED' || c.status === 'REJECTED').length },
              { id: 'all', label: 'All', count: live.length },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open complaints" value={k.open} sub={`${k.critical} critical · ${k.overdue} past due`} icon={<MessageSquareWarning />} tone={k.overdue ? 'danger' : k.open ? 'warning' : 'success'} />
        <StatTile label="Complaint PPM" value={Math.round(k.ppm).toLocaleString('en-IN')} sub="Units complained about per million supplied" tone={k.ppm > 5000 ? 'danger' : k.ppm > 1000 ? 'warning' : 'success'} />
        <StatTile label="Cost of complaints" value={`₹${k.cost.toLocaleString('en-IN')}`} sub="Replacements, credits and repairs" tone="warning" />
        <StatTile label="Average closure" value={k.avgDays === null ? '—' : `${k.avgDays.toFixed(0)} d`} sub={k.avgDays === null ? 'Nothing closed yet' : 'From logging to closing'} tone={k.avgDays !== null && k.avgDays > 21 ? 'warning' : 'success'} />
      </div>

      {k.noCapa > 0 && (
        <Alert tone="warning" title={`${k.noCapa} complaint${k.noCapa === 1 ? ' was' : 's were'} settled without a CAPA`} className="mb-4">
          The customer was made whole, but nothing was changed to stop it recurring. Raise a CAPA against each, or record why one is not warranted.
        </Alert>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="What customers complain about" description="Ordered by units affected — the few types worth fixing first" />
          <CardBody className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={k.pareto} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="type" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="qty" name="Units affected" maxBarSize={34} radius={[3, 3, 0, 0]}>
                  {k.pareto.map((_, i) => (<Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#94a3b8'} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Root causes" description={`${k.diagnosed} of ${k.total} diagnosed`} />
          <CardBody className="h-56">
            {k.byCause.length === 0 ? (
              <p className="grid h-full place-items-center text-2xs text-fg-subtle">No complaint has reached a root cause yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={k.byCause} dataKey="count" nameKey="label" innerRadius={38} outerRadius={64} paddingAngle={2}>
                    {k.byCause.map((_, i) => (<Cell key={i} fill={['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#64748b'][i % 6]} />))}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(c) => String((c as any).id ?? c.uid)}
        searchable
        searchPlaceholder="Search by customer, item, batch or complaint number"
        onRowClick={(c) => setOpenUid(String((c as any).id ?? c.uid))}
        rowClassName={(c) => (OPEN_STATES.includes(c.status) && overdueDays(c.dueOn, c.closedOn) > 0 ? 'bg-danger/5' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, `complaints-${tab}`, 'Customer complaints', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(c) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...c, customerName: c.customerName ?? '', complaintType: c.complaintType ?? '', itemCode: c.itemCode ?? '', itemName: c.itemName ?? '', batchNo: c.batchNo ?? '', productionOrderNo: c.productionOrderNo ?? '', invoiceNo: c.invoiceNo ?? '', description: c.description ?? '', owner: c.owner ?? '', rootCause: c.rootCause ?? '', remarks: c.remarks ?? '' })} />
            {COMPLAINT_FLOW[c.status].map((to) => (
              <MenuItem key={to} label={STATUS_LABEL[to]} onClick={() => setAdvancing({ complaint: c, to })} />
            ))}
            <MenuItem label="Delete" danger onClick={() => removeRow(c)} />
          </>
        )}
        emptyTitle={tab === 'overdue' ? 'Nothing overdue' : 'No complaints'}
        emptyDescription={tab === 'overdue' ? 'Every open complaint is inside its committed date.' : 'Log the first one to start the record.'}
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.docNo} · ${detail.customerName}` : ''} width="max-w-2xl">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <QmsStatusBadge status={detail.status} size="md" />
              <SeverityBadge severity={detail.severity} />
              <Badge tone="neutral" size="sm" dot={false}>{detail.complaintType}</Badge>
              {OPEN_STATES.includes(detail.status) && <DueChip days={overdueDays(detail.dueOn, detail.closedOn)} />}
            </div>

            <DetailBlock title="What the customer reported">
              <p className="text-xs leading-relaxed text-fg-muted">{detail.description}</p>
            </DetailBlock>

            <DetailBlock title="Traceability">
              <DataGrid columns={2} items={[
                { label: 'Item', value: `${detail.itemCode} · ${detail.itemName}` },
                { label: 'Batch', value: detail.batchNo || '—', mono: true },
                { label: 'Production order', value: detail.productionOrderNo || '—', mono: true },
                { label: 'Invoice', value: detail.invoiceNo || '—', mono: true },
                { label: 'Supplied', value: `${detail.qtySupplied} units` },
                { label: 'Complained about', value: `${detail.qtyComplained} units · ${detail.qtySupplied > 0 ? ((detail.qtyComplained / detail.qtySupplied) * 100).toFixed(1) : '0'}%` },
              ]} />
            </DetailBlock>

            <DetailBlock title="Investigation">
              <DataGrid columns={2} items={[
                { label: 'Owner', value: detail.owner || 'Not assigned' },
                { label: 'Committed date', value: formatDate(detail.dueOn) },
                { label: 'Cause category', value: detail.causeCategory ? CAUSE_LABEL[detail.causeCategory] : 'Not yet classified' },
                { label: 'Resolution', value: RESOLUTION_LABEL[detail.resolution] },
                { label: 'Cost of resolution', value: detail.resolutionValue > 0 ? `₹${detail.resolutionValue.toLocaleString('en-IN')}` : '—' },
                { label: 'Closed', value: detail.closedOn ? formatDate(detail.closedOn) : 'Open' },
              ]} />
              {detail.rootCause && (
                <div className="mt-2 rounded border border-border bg-surface-2 p-2.5">
                  <p className="text-3xs uppercase tracking-wider text-fg-subtle">Root cause</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg">{detail.rootCause}</p>
                </div>
              )}
            </DetailBlock>

            <DetailBlock title="Linked records">
              <div className="flex flex-wrap gap-2">
                {detail.ncrDocNo
                  ? <Badge tone="warning" size="sm" dot={false}>NCR {detail.ncrDocNo}</Badge>
                  : <Badge tone="neutral" size="sm" dot={false}>No NCR</Badge>}
                {detail.capaDocNo
                  ? <Badge tone="brand" size="sm" dot={false}>CAPA {detail.capaDocNo}</Badge>
                  : <Badge tone="neutral" size="sm" dot={false}>No CAPA</Badge>}
              </div>
              {!detail.capaDocNo && detail.severity === 'CRITICAL' && (
                <Alert tone="danger" title="A CAPA is required" className="mt-2">
                  This complaint is critical. It cannot be closed until a corrective and preventive action is raised against it.
                </Alert>
              )}
            </DetailBlock>

            {detail.remarks && (
              <DetailBlock title="Remarks"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>
            )}

            {COMPLAINT_FLOW[detail.status].length > 0 && (
              <DetailBlock title="Next step">
                <div className="flex flex-wrap gap-2">
                  {COMPLAINT_FLOW[detail.status].map((to) => {
                    const b = stepBlockers(detail, to)
                    return (
                      <Button
                        key={to}
                        variant={to === 'REJECTED' ? 'outline' : 'primary'}
                        size="sm"
                        onClick={() => setAdvancing({ complaint: detail, to })}
                        disabled={b.length > 0}
                        title={b[0]}
                      >
                        {STATUS_LABEL[to]}
                      </Button>
                    )
                  })}
                </div>
                {(() => {
                  const all = COMPLAINT_FLOW[detail.status].flatMap((to) => stepBlockers(detail, to).map((x) => `${STATUS_LABEL[to]}: ${x}`))
                  return all.length ? (
                    <Alert tone="info" title="Outstanding before the next step" className="mt-2">
                      <ul className="list-disc space-y-0.5 pl-4">{all.map((x) => (<li key={x}>{x}</li>))}</ul>
                    </Alert>
                  ) : null
                })()}
              </DetailBlock>
            )}

            <div className="flex gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail }); setOpenUid(null) }}>Edit</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.docNo}` : 'Log a customer complaint'}
        width="max-w-2xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <Input label="Customer" required value={editing.customerName ?? ''} onChange={(e) => setEditing({ ...editing, customerName: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Complaint type" required value={editing.complaintType ?? ''} onChange={(e) => setEditing({ ...editing, complaintType: e.target.value })} placeholder="Leakage" />
              <Select label="Severity" value={editing.severity ?? 'MAJOR'} onChange={(e) => setEditing({ ...editing, severity: e.target.value as DefectSeverity })} hint="Critical needs a CAPA to close">
                <option value="CRITICAL">Critical</option>
                <option value="MAJOR">Major</option>
                <option value="MINOR">Minor</option>
              </Select>
              <Input label="Logged on" type="date" value={editing.loggedOn ?? ''} onChange={(e) => setEditing({ ...editing, loggedOn: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Item code" required value={editing.itemCode ?? ''} onChange={(e) => setEditing({ ...editing, itemCode: e.target.value })} />
              <Input label="Item name" value={editing.itemName ?? ''} onChange={(e) => setEditing({ ...editing, itemName: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Batch" value={editing.batchNo ?? ''} onChange={(e) => setEditing({ ...editing, batchNo: e.target.value })} hint="Traces back to the order" />
              <Input label="Production order" value={editing.productionOrderNo ?? ''} onChange={(e) => setEditing({ ...editing, productionOrderNo: e.target.value })} />
              <Input label="Invoice" value={editing.invoiceNo ?? ''} onChange={(e) => setEditing({ ...editing, invoiceNo: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Quantity supplied" type="number" value={String(editing.qtySupplied ?? 0)} onChange={(e) => setEditing({ ...editing, qtySupplied: Number(e.target.value) })} />
              <Input label="Quantity complained about" type="number" required value={String(editing.qtyComplained ?? 0)} onChange={(e) => setEditing({ ...editing, qtyComplained: Number(e.target.value) })} />
            </div>
            <Textarea label="What the customer reported" required rows={3} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Owner" value={editing.owner ?? ''} onChange={(e) => setEditing({ ...editing, owner: e.target.value })} hint="Who will investigate" />
              <Input label="Committed date" type="date" value={editing.dueOn ?? ''} onChange={(e) => setEditing({ ...editing, dueOn: e.target.value })} />
            </div>

            <div className="space-y-3 rounded border border-border bg-surface-2 p-3">
              <p className="text-3xs uppercase tracking-wider text-fg-subtle">Investigation — filled in as it progresses</p>
              <Textarea label="Root cause" rows={2} value={editing.rootCause ?? ''} onChange={(e) => setEditing({ ...editing, rootCause: e.target.value })} />
              <div className="grid grid-cols-3 gap-3">
                <Select label="Cause category" value={editing.causeCategory ?? ''} onChange={(e) => setEditing({ ...editing, causeCategory: (e.target.value || null) as CauseCategory | null })}>
                  <option value="">Not classified</option>
                  {CAUSE_CATEGORIES.map((c) => (<option key={c} value={c}>{CAUSE_LABEL[c]}</option>))}
                </Select>
                <Select label="Resolution" value={editing.resolution ?? 'PENDING'} onChange={(e) => setEditing({ ...editing, resolution: e.target.value as ComplaintResolution })}>
                  {(Object.keys(RESOLUTION_LABEL) as ComplaintResolution[]).map((r) => (<option key={r} value={r}>{RESOLUTION_LABEL[r]}</option>))}
                </Select>
                <Input label="Cost of resolution" type="number" value={String(editing.resolutionValue ?? 0)} onChange={(e) => setEditing({ ...editing, resolutionValue: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Linked NCR" value={editing.ncrDocNo ?? ''} onChange={(e) => setEditing({ ...editing, ncrDocNo: e.target.value || null })}>
                  <option value="">None</option>
                  {ncrs.rows.filter((n) => !n.deletedAt).map((n) => (<option key={n.uid} value={n.docNo}>{n.docNo}</option>))}
                </Select>
                <Select label="Linked CAPA" value={editing.capaDocNo ?? ''} onChange={(e) => setEditing({ ...editing, capaDocNo: e.target.value || null })}>
                  <option value="">None</option>
                  {capas.rows.filter((c) => !c.deletedAt).map((c) => (<option key={c.uid} value={c.docNo}>{c.docNo}</option>))}
                </Select>
              </div>
            </div>

            <Textarea label="Remarks" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />
          </div>
        )}
      </Drawer>

      {/* ── advance ──────────────────────────────────────────── */}
      <Modal
        open={!!advancing}
        onClose={() => setAdvancing(null)}
        title={advancing ? `${advancing.complaint.docNo} → ${STATUS_LABEL[advancing.to]}` : ''}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdvancing(null)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => advancing && advance(advancing.complaint, advancing.to)}
              disabled={!!advancing && stepBlockers(advancing.complaint, advancing.to).length > 0}
            >
              Confirm
            </Button>
          </>
        }
      >
        {advancing && (() => {
          const b = stepBlockers(advancing.complaint, advancing.to)
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                {advancing.to === 'CLOSED'
                  ? 'Closing records that the customer is satisfied and the cause has been addressed. The cost stays in the cost-of-poor-quality report.'
                  : advancing.to === 'REJECTED'
                    ? 'Rejecting records that the complaint was investigated and no fault of ours was found. The justification below goes to the customer.'
                    : `Moving ${advancing.complaint.docNo} to ${STATUS_LABEL[advancing.to].toLowerCase()}.`}
              </p>
              {b.length > 0 ? (
                <Alert tone="danger" title="Not yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert>
              ) : (
                <Alert tone="tip" title="Ready">Everything this step requires is in place.</Alert>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
