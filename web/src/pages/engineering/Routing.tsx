import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, Plus, Send, Star, Trash2, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DetailBlock, EngStatusBadge } from '@/components/engineering/EngShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate } from '@/lib/format'
import { routingProblems, routingTime } from '@/lib/engFlow'
import type { EngProduct, EngWorkCentre, Operation, Routing, RoutingOperation, Tool } from '@/types/engineering'
import { engineeringApi as api } from '@/api/engineering'

/**
 * Routing (Ch 10 to 13, 15).
 *
 * The sequence of operations that turns components into the product, with the
 * machine, the tool, the manning and the time each one takes. Production
 * confirms against it, capacity planning loads work centres from it, and the
 * cost roll-up charges labour, machine and tooling from it — so the times here
 * are not documentation, they are the standard.
 */

interface OpEntry {
  seq: string
  operationCode: string
  workCentreCode: string
  machineCode: string
  setupMinutes: string
  cycleSeconds: string
  operators: string
  skill: string
  toolCode: string
  qcCheckpoint: boolean
  instructions: string
}

interface FormState {
  code: string
  productCode: string
  effectiveFrom: string
  costingLotSize: string
  isDefault: boolean
  changeReason: string
  ops: OpEntry[]
}

const emptyForm: FormState = {
  code: '',
  productCode: '',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  costingLotSize: '500',
  isDefault: true,
  changeReason: '',
  ops: [],
}

const isLive = (r: Routing) => r.status === 'ACTIVE' || r.status === 'APPROVED'

export function RoutingPage() {
  const toast = useToast()
  
  const [rows, setRows] = useState<Routing[]>([])
  const [products, setProducts] = useState<EngProduct[]>([])
  const [workCentres, setWorkCentres] = useState<EngWorkCentre[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [machines, setMachines] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  async function loadData() {
    try {
      const [rtgData, prodData, wcData, opData, toolData, machData] = await Promise.all([
        api.getRoutings(),
        api.getEngProducts(),
        api.getWorkCentres(),
        api.getOperations(),
        api.getTools(),
        api.getMachines()
      ])
      setRows(rtgData)
      setProducts(prodData)
      setWorkCentres(wcData)
      setOperations(opData)
      setTools(toolData)
      setMachines(machData)
    } catch (err) {
      toast.error('Failed to load', 'Could not load data from the server.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const [tab, setTab] = useState('live')
  const [detail, setDetail] = useState<Routing | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Routing | null>(null)
  const [revisingFrom, setRevisingFrom] = useState<Routing | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Routing | null>(null)

  const counts = {
    live: rows.filter(isLive).length,
    draft: rows.filter((r) => r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL').length,
    superseded: rows.filter((r) => r.status === 'SUPERSEDED').length,
    all: rows.length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'live') return isLive(r)
    if (tab === 'draft') return r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL'
    if (tab === 'superseded') return r.status === 'SUPERSEDED'
    return true
  })

  /* ── Cost of one operation, from its work centre's rates ───────────── */

  function opCost(o: { workCentreCode: string; setupMinutes: number; cycleSeconds: number; operators: number; toolCode: string | null }, lot: number) {
    const wc = workCentres.find((w) => w.code === o.workCentreCode)
    if (!wc) return null
    const setupHours = o.setupMinutes / 60
    const runHours = o.cycleSeconds / 3600
    const labour = (setupHours * wc.labourRatePerHour * o.operators) / lot + runHours * wc.labourRatePerHour * o.operators
    const machine = (setupHours * wc.machineRatePerHour) / lot + runHours * wc.machineRatePerHour
    const tool = o.toolCode ? tools.find((t) => t.code === o.toolCode) : undefined
    const tooling = tool && tool.lifeStrokes > 0 ? tool.replacementCost / tool.lifeStrokes : 0
    const overhead = (labour + machine) * (wc.overheadPct / 100)
    return { labour, machine, tooling, overhead, total: labour + machine + tooling + overhead }
  }

  /* ── Form grid ─────────────────────────────────────────────────────── */

  const lot = Math.max(1, Number(form.costingLotSize) || 1)
  const costedOps = form.ops.map((o) => {
    const cost = opCost(
      {
        workCentreCode: o.workCentreCode,
        setupMinutes: Number(o.setupMinutes) || 0,
        cycleSeconds: Number(o.cycleSeconds) || 0,
        operators: Number(o.operators) || 1,
        toolCode: o.toolCode || null,
      },
      lot,
    )
    return { entry: o, cost }
  })
  const formTotalCost = costedOps.reduce((s, o) => s + (o.cost?.total ?? 0), 0)
  const formTotalMinutes = form.ops.reduce(
    (s, o) => s + (Number(o.setupMinutes) || 0) / lot + (Number(o.cycleSeconds) || 0) / 60,
    0,
  )

  function addOp() {
    const nextSeq = form.ops.length ? Math.max(...form.ops.map((o) => Number(o.seq) || 0)) + 10 : 10
    setForm((f) => ({
      ...f,
      ops: [
        ...f.ops,
        {
          seq: String(nextSeq),
          operationCode: '',
          workCentreCode: '',
          machineCode: '',
          setupMinutes: '0',
          cycleSeconds: '',
          operators: '1',
          skill: 'Machine Operator',
          toolCode: '',
          qcCheckpoint: false,
          instructions: '',
        },
      ],
    }))
  }

  /** Choosing a standard operation pre-fills every field it already knows. */
  function pickOperation(i: number, code: string) {
    const std = operations.find((o) => o.code === code)
    setForm((f) => ({
      ...f,
      ops: f.ops.map((o, idx) =>
        idx !== i
          ? o
          : {
              ...o,
              operationCode: code,
              workCentreCode: std?.defaultWorkCentre ?? o.workCentreCode,
              setupMinutes: std ? String(std.setupMinutes) : o.setupMinutes,
              cycleSeconds: std ? String(std.cycleSeconds) : o.cycleSeconds,
              operators: std ? String(std.operators) : o.operators,
              skill: std?.skill ?? o.skill,
              qcCheckpoint: std?.qcCheckpoint ?? o.qcCheckpoint,
              instructions: std?.instructions ?? o.instructions,
            },
      ),
    }))
  }

  function setOp(i: number, patch: Partial<OpEntry>) {
    setForm((f) => ({ ...f, ops: f.ops.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) }))
  }
  function removeOp(i: number) {
    setForm((f) => ({ ...f, ops: f.ops.filter((_, idx) => idx !== i) }))
  }
  function moveOp(i: number, delta: number) {
    setForm((f) => {
      const next = [...f.ops]
      const target = i + delta
      if (target < 0 || target >= next.length) return f
      ;[next[i], next[target]] = [next[target], next[i]]
      // Sequences are renumbered so the order on screen is the order on the floor.
      return { ...f, ops: next.map((o, idx) => ({ ...o, seq: String((idx + 1) * 10) })) }
    })
  }

  /* ── Columns ───────────────────────────────────────────────────────── */

  const columns: Column<Routing>[] = [
    { key: 'docNo', header: 'Routing', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'revision', header: 'Rev', align: 'right', width: '4.5rem', accessor: (r) => r.revision, render: (r) => <span className="font-mono text-2xs">R{r.revision}</span> },
    {
      key: 'productCode',
      header: 'Product',
      sortable: true,
      render: (r) => (
        <>
          <p className="text-xs font-medium text-fg">{r.productName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{r.productCode}</p>
        </>
      ),
    },
    { key: 'opCount', header: 'Operations', align: 'right', width: '6.5rem', accessor: (r) => r.operations.length },
    { key: 'qc', header: 'QC points', align: 'right', width: '6.5rem', accessor: (r) => r.operations.filter((o) => o.qcCheckpoint).length },
    { key: 'lot', header: 'Costing lot', align: 'right', sortable: true, width: '7rem', accessor: (r) => r.costingLotSize, render: (r) => r.costingLotSize.toLocaleString('en-IN') },
    { key: 'minutes', header: 'Min / piece', align: 'right', sortable: true, width: '7.5rem', accessor: (r) => routingTime(r).minutesPerUnit, render: (r) => routingTime(r).minutesPerUnit.toFixed(2) },
    {
      key: 'cost',
      header: 'Conversion ₹',
      align: 'right',
      sortable: true,
      width: '8rem',
      accessor: (r) => r.operations.reduce((s, o) => s + (opCost(o, r.costingLotSize)?.total ?? 0), 0),
      render: (r) => `₹${formatAmount(r.operations.reduce((s, o) => s + (opCost(o, r.costingLotSize)?.total ?? 0), 0))}`,
    },
    { key: 'isDefault', header: 'Default', width: '6rem', accessor: (r) => (r.isDefault ? 'Yes' : 'No'), render: (r) => (r.isDefault ? <Badge tone="brand" size="sm">Default</Badge> : <span className="text-2xs text-fg-subtle">alternate</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (r) => <EngStatusBadge status={r.status} size="sm" /> },
  ]

  /* ── Open helpers ──────────────────────────────────────────────────── */

  function toEntries(r: Routing): OpEntry[] {
    return [...r.operations]
      .sort((a, b) => a.seq - b.seq)
      .map((o) => ({
        seq: String(o.seq),
        operationCode: o.operationCode,
        workCentreCode: o.workCentreCode,
        machineCode: o.machineCode,
        setupMinutes: String(o.setupMinutes),
        cycleSeconds: String(o.cycleSeconds),
        operators: String(o.operators),
        skill: o.skill,
        toolCode: o.toolCode ?? '',
        qcCheckpoint: o.qcCheckpoint,
        instructions: o.instructions,
      }))
  }

  async function openCreate() {
    setEditing(null)
    setRevisingFrom(null)
    try {
      const { nextCode } = await api.getRoutingsNextCode()
      setForm({ ...emptyForm, code: nextCode, productCode: products[0]?.code ?? '', ops: [] })
      setErrors({})
      setFormOpen(true)
    } catch (err) {
      toast.error('Failed to get code', 'Could not generate next route code.')
    }
  }

  function openEdit(r: Routing) {
    if (isLive(r)) {
      toast.error('This routing is live', 'Live routings are not edited in place. Use "Create next revision" instead.')
      return
    }
    setEditing(r)
    setRevisingFrom(null)
    setForm({
      code: r.docNo,
      productCode: r.productCode,
      effectiveFrom: r.effectiveFrom,
      costingLotSize: String(r.costingLotSize),
      isDefault: r.isDefault,
      changeReason: r.changeReason,
      ops: toEntries(r),
    })
    setErrors({})
    setFormOpen(true)
  }

  function openRevision(r: Routing) {
    setEditing(null)
    setRevisingFrom(r)
    setForm({
      code: r.docNo,
      productCode: r.productCode,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      costingLotSize: String(r.costingLotSize),
      isDefault: r.isDefault,
      changeReason: '',
      ops: toEntries(r),
    })
    setErrors({})
    setFormOpen(true)
    setDetail(null)
  }

  /* ── Validation & save ─────────────────────────────────────────────── */

  function validate() {
    const e: Record<string, string> = {}
    if (!form.productCode) e.productCode = 'Choose the product this routing makes.'
    if (!(Number(form.costingLotSize) > 0)) e.costingLotSize = 'The costing lot size must be greater than zero.'
    if (!form.effectiveFrom) e.effectiveFrom = 'An effective date is required.'
    if (revisingFrom && !form.changeReason.trim()) e.changeReason = 'A revision needs a reason.'

    if (!form.ops.length) e.ops = 'Add at least one operation.'
    else if (form.ops.some((o) => !o.operationCode)) e.ops = 'Every step needs an operation.'
    else if (form.ops.some((o) => !o.workCentreCode)) e.ops = 'Every step needs a work centre.'
    else if (form.ops.some((o) => !(Number(o.cycleSeconds) > 0))) e.ops = 'Every step needs a cycle time greater than zero.'
    else if (form.ops.some((o) => !(Number(o.operators) > 0))) e.ops = 'Every step needs at least one operator.'
    else if (new Set(form.ops.map((o) => o.seq)).size !== form.ops.length) e.ops = 'Two steps share the same sequence number.'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  function buildOps(): RoutingOperation[] {
    return form.ops.map((o, i) => {
      const std = operations.find((s) => s.code === o.operationCode)
      return {
        uid: `rop-${Date.now().toString(36)}-${i}`,
        seq: Number(o.seq) || (i + 1) * 10,
        operationCode: o.operationCode,
        operationName: std?.name ?? o.operationCode,
        workCentreCode: o.workCentreCode,
        machineCode: o.machineCode,
        setupMinutes: Number(o.setupMinutes) || 0,
        cycleSeconds: Number(o.cycleSeconds),
        operators: Number(o.operators),
        skill: o.skill,
        toolCode: o.toolCode || null,
        qcCheckpoint: o.qcCheckpoint,
        instructions: o.instructions.trim(),
      }
    })
  }

  async function save(submit: boolean) {
    if (!validate()) return
    const product = products.find((p) => p.code === form.productCode)
    const common = {
      productCode: form.productCode,
      productName: product?.name ?? form.productCode,
      effectiveFrom: form.effectiveFrom,
      costingLotSize: Number(form.costingLotSize),
      isDefault: form.isDefault,
      changeReason: form.changeReason.trim(),
      operations: buildOps(),
      status: (submit ? 'PENDING_APPROVAL' : 'DRAFT') as Routing['status'],
    }

    try {
      if (editing) {
        await api.updateRouting(editing.uid, { ...editing, ...common, version: editing.version + 1 })
        toast.success('Routing saved', `${editing.docNo} updated${submit ? ' and sent for approval' : ''}.`)
      } else if (revisingFrom) {
        await api.createRouting({
          ...common,
          uid: revisingFrom.docNo,
          revision: revisingFrom.revision + 1,
          sourceEcn: null,
        })
        toast.success(`Revision ${revisingFrom.revision + 1} created`, `Approving it supersedes R${revisingFrom.revision}.`)
      } else {
        await api.createRouting({
          ...common,
          revision: 1,
          sourceEcn: null,
        })
        toast.success('Routing created', `Saved as ${submit ? 'pending approval' : 'a draft'}.`)
      }
      await loadData()
      setFormOpen(false)
    } catch (err) {
      toast.error('Save failed', 'Could not save routing to server.')
    }
  }

  async function approve(r: Routing) {
    const problems = routingProblems(r, workCentres)
    if (problems.length) {
      toast.error('Cannot approve', problems[0])
      return
    }
    const previous = rows.find((x) => x.docNo === r.docNo && x.uid !== r.uid && isLive(x))
    try {
      if (previous) {
        await api.updateRouting(previous.uid, { ...previous, status: 'SUPERSEDED', effectiveTo: r.effectiveFrom })
      }
      if (r.isDefault) {
        const others = rows.filter((x) => x.productCode === r.productCode && x.uid !== r.uid && x.isDefault && isLive(x))
        for (const o of others) {
          await api.updateRouting(o.uid, { ...o, isDefault: false })
        }
      }
      await api.updateRouting(r.uid, { ...r, status: 'ACTIVE', approvedBy: 'Meera Rajan', approvedAt: new Date().toISOString() })
      toast.success(
        'Routing approved',
        previous ? `${r.docNo} R${r.revision} is live; R${previous.revision} is superseded.` : `${r.docNo} R${r.revision} is live.`,
      )
      await loadData()
      setDetail(null)
    } catch (err) {
      toast.error('Approve failed', 'Could not approve routing to server.')
    }
  }

  const detailTime = detail ? routingTime(detail) : null
  const detailProblems = detail ? routingProblems(detail, workCentres) : []
  const detailCost = detail
    ? detail.operations.reduce(
        (acc, o) => {
          const c = opCost(o, detail.costingLotSize)
          return c
            ? {
                labour: acc.labour + c.labour,
                machine: acc.machine + c.machine,
                tooling: acc.tooling + c.tooling,
                overhead: acc.overhead + c.overhead,
              }
            : acc
        },
        { labour: 0, machine: 0, tooling: 0, overhead: 0 },
      )
    : null

  return (
    <div>
      <PageHeader
        title="Routings"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Routing' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New routing
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'live', label: 'Live', count: counts.live },
              { id: 'draft', label: 'Draft & pending', count: counts.draft },
              { id: 'superseded', label: 'Superseded', count: counts.superseded },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search routing number or product…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'routings', 'Routings', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        emptyTitle="No routings"
        emptyDescription="Without a routing there is nothing for the shop floor to confirm against."
        rowActions={(r) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem label="Edit" disabled={isLive(r)} onClick={() => openEdit(r)} />
            <MenuItem label="Create next revision" icon={<Copy />} disabled={!isLive(r)} onClick={() => openRevision(r)} />
            <MenuItem
              label="Submit for approval"
              icon={<Send />}
              separatorBefore
              disabled={r.status !== 'DRAFT'}
              onClick={async () => {
                try {
                  await api.updateRouting(r.uid, { ...r, status: 'PENDING_APPROVAL' })
                  await loadData()
                  toast.success('Submitted', `${r.docNo} R${r.revision} is waiting for approval.`)
                } catch (err) {
                  toast.error('Failed', 'Could not update status.')
                }
              }}
            />
            <MenuItem label="Approve" icon={<Check />} disabled={r.status !== 'PENDING_APPROVAL' && r.status !== 'DRAFT'} onClick={() => approve(r)} />
            <MenuItem
              label="Reject"
              icon={<X />}
              danger
              disabled={r.status !== 'PENDING_APPROVAL'}
              onClick={async () => {
                try {
                  await api.updateRouting(r.uid, { ...r, status: 'REJECTED' })
                  await loadData()
                  toast.success('Rejected', `${r.docNo} R${r.revision} sent back.`)
                } catch (err) {
                  toast.error('Failed', 'Could not update status.')
                }
              }}
            />
            <MenuItem
              label="Set as default"
              icon={<Star />}
              separatorBefore
              disabled={r.isDefault || !isLive(r)}
              onClick={async () => {
                try {
                  const others = rows.filter((x) => x.productCode === r.productCode && x.uid !== r.uid && x.isDefault)
                  for (const x of others) {
                    await api.updateRouting(x.uid, { ...x, isDefault: false })
                  }
                  await api.updateRouting(r.uid, { ...r, isDefault: true })
                  await loadData()
                  toast.success('Set as default', `${r.docNo} is now the routing used for ${r.productCode}.`)
                } catch (err) {
                  toast.error('Failed', 'Could not update default status.')
                }
              }}
            />
            <MenuItem label={isLive(r) ? 'Delete — blocked (live)' : 'Delete'} icon={<Trash2 />} danger separatorBefore disabled={isLive(r)} onClick={() => setConfirmDelete(r)} />
          </>
        )}
      />

      {/* Detail ------------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.docNo} · revision ${detail.revision}` : ''}
        description={detail?.productName}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                {detail.operations.length} operations · {detailTime?.minutesPerUnit.toFixed(2)} min per piece
              </span>
              <div className="flex gap-2">
                {(detail.status === 'PENDING_APPROVAL' || detail.status === 'DRAFT') && (
                  <Button variant="success" size="sm" onClick={() => approve(detail)}>
                    Approve
                  </Button>
                )}
                {isLive(detail) && (
                  <Button variant="outline" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => openRevision(detail)}>
                    Create next revision
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        {detail && detailTime && detailCost && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <EngStatusBadge status={detail.status} />
              {detail.isDefault ? <Badge tone="brand" size="sm">Default</Badge> : <Badge tone="neutral" size="sm">Alternate</Badge>}
            </div>

            {detailProblems.length > 0 && (
              <Alert tone="danger" title="This routing cannot be approved yet">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {detailProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <DataGrid
              columns={2}
              items={[
                { label: 'Product', value: `${detail.productCode} — ${detail.productName}` },
                { label: 'Costing lot size', value: detail.costingLotSize.toLocaleString('en-IN') },
                { label: 'Effective from', value: formatDate(detail.effectiveFrom) },
                { label: 'Effective to', value: detail.effectiveTo ? formatDate(detail.effectiveTo) : 'Open' },
                { label: 'Setup per lot', value: `${detailTime.setupMinutes.toFixed(0)} min` },
                { label: 'Run per lot', value: `${detailTime.runMinutes.toFixed(0)} min` },
                { label: 'Time per piece', value: `${detailTime.minutesPerUnit.toFixed(2)} min` },
                { label: 'QC checkpoints', value: String(detailTime.qcCheckpoints) },
              ]}
            />

            {detail.changeReason && (
              <DetailBlock title="Reason for this revision">
                <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.changeReason}</p>
              </DetailBlock>
            )}

            <DetailBlock title={`Operations (${detail.operations.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '3.5rem' }}>Seq</th>
                      <th>Operation</th>
                      <th style={{ width: '6rem' }}>Centre</th>
                      <th style={{ width: '6.5rem' }}>Machine</th>
                      <th className="text-right" style={{ width: '5.5rem' }}>Setup</th>
                      <th className="text-right" style={{ width: '5rem' }}>Cycle</th>
                      <th className="text-right" style={{ width: '4rem' }}>Ops</th>
                      <th style={{ width: '6rem' }}>Tool</th>
                      <th className="text-right" style={{ width: '7rem' }}>₹ / piece</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...detail.operations].sort((a, b) => a.seq - b.seq).map((o) => {
                      const c = opCost(o, detail.costingLotSize)
                      return (
                        <tr key={o.uid}>
                          <td className="text-2xs tabular text-fg-subtle">{o.seq}</td>
                          <td>
                            <p className="text-xs font-medium text-fg">
                              {o.operationName}
                              {o.qcCheckpoint && <Badge tone="progress" size="sm" className="ml-1.5" dot={false}>QC</Badge>}
                            </p>
                            <p className="font-mono text-2xs text-fg-subtle">{o.operationCode} · {o.skill}</p>
                            {o.instructions && <p className="mt-0.5 text-2xs text-fg-muted">{o.instructions}</p>}
                          </td>
                          <td className="font-mono text-2xs">{o.workCentreCode}</td>
                          <td className="font-mono text-2xs text-fg-muted">{o.machineCode || '—'}</td>
                          <td className="text-right tabular text-2xs">{o.setupMinutes} min</td>
                          <td className="text-right tabular text-2xs">{o.cycleSeconds} s</td>
                          <td className="text-right tabular text-2xs">{o.operators}</td>
                          <td className="font-mono text-2xs text-fg-muted">{o.toolCode ?? '—'}</td>
                          <td className="text-right tabular text-xs font-medium">
                            {c ? `₹${formatAmount(c.total)}` : <span className="text-2xs text-danger">no centre</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={8} className="text-right text-xs font-semibold text-fg">Conversion cost per piece</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">
                        ₹{formatAmount(detailCost.labour + detailCost.machine + detailCost.tooling + detailCost.overhead)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-1.5 text-2xs text-fg-subtle">
                Labour ₹{formatAmount(detailCost.labour)} · machine ₹{formatAmount(detailCost.machine)} · tooling ₹
                {formatAmount(detailCost.tooling)} · overhead ₹{formatAmount(detailCost.overhead)}. Setup is spread over
                the costing lot of {detail.costingLotSize.toLocaleString('en-IN')}.
              </p>
            </DetailBlock>
          </div>
        )}
      </Drawer>

      {/* Create / edit / revise --------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          revisingFrom
            ? `${revisingFrom.docNo} — new revision ${revisingFrom.revision + 1}`
            : editing
              ? `Edit ${editing.docNo} R${editing.revision}`
              : 'New routing'
        }
        size="full"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => save(false)}>
              Save draft
            </Button>
            <Button variant="primary" onClick={() => save(true)}>
              Save and submit
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-4">
          <Input maxLength={255} label="Routing Code" disabled value={form.code} hint="Auto-generated" />
          <Select
            label="Product"
            required
            containerClassName="sm:col-span-2"
            value={form.productCode}
            error={errors.productCode}
            disabled={!!revisingFrom}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
            options={[{ value: '', label: 'Select a product…' }, ...products.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <Input maxLength={255} label="Effective from" type="date" required value={form.effectiveFrom} error={errors.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          <Input maxLength={255}
            label="Costing lot size"
            type="number"
            required
            value={form.costingLotSize}
            error={errors.costingLotSize}
            hint="Setup is spread over this many pieces."
            onChange={(e) => setForm({ ...form, costingLotSize: e.target.value })}
          />
          {(revisingFrom || editing) && (
            <Textarea
              label="Reason for this revision"
              required={!!revisingFrom}
              containerClassName="sm:col-span-4"
              rows={2}
              value={form.changeReason}
              maxLength={1000}
              error={errors.changeReason}
              onChange={(e) => setForm({ ...form, changeReason: e.target.value })}
            />
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Operations ({form.ops.length})</p>
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addOp}>
              Add operation
            </Button>
          </div>

          {errors.ops && <Alert tone="danger" className="mb-2">{errors.ops}</Alert>}

          <div className="overflow-x-auto rounded border border-border">
            <table className="grid-table">
              <thead>
                <tr>
                  <th style={{ width: '4.5rem' }}>Seq</th>
                  <th style={{ minWidth: '13rem' }}>Operation *</th>
                  <th style={{ minWidth: '10rem' }}>Work centre *</th>
                  <th style={{ minWidth: '9rem' }}>Machine</th>
                  <th className="text-right" style={{ width: '6rem' }}>Setup min</th>
                  <th className="text-right" style={{ width: '6rem' }}>Cycle s *</th>
                  <th className="text-right" style={{ width: '5rem' }}>Ops</th>
                  <th style={{ minWidth: '8rem' }}>Tool</th>
                  <th className="text-center" style={{ width: '4rem' }}>QC</th>
                  <th className="text-right" style={{ width: '7rem' }}>₹ / piece</th>
                  <th style={{ width: '5rem' }} />
                </tr>
              </thead>
              <tbody>
                {costedOps.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        value={row.entry.seq}
                        aria-label={`Sequence on step ${i + 1}`}
                        onChange={(e) => setOp(i, { seq: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td>
                      <select
                        value={row.entry.operationCode}
                        aria-label={`Operation on step ${i + 1}`}
                        onChange={(e) => pickOperation(i, e.target.value)}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">Select…</option>
                        {operations.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.code} — {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.entry.workCentreCode}
                        aria-label={`Work centre on step ${i + 1}`}
                        onChange={(e) => setOp(i, { workCentreCode: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">Select…</option>
                        {workCentres.map((w) => (
                          <option key={w.code} value={w.code}>
                            {w.code} — {w.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.entry.machineCode}
                        aria-label={`Machine on step ${i + 1}`}
                        onChange={(e) => setOp(i, { machineCode: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">Any / manual</option>
                        {machines.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={row.entry.setupMinutes}
                        aria-label={`Setup minutes on step ${i + 1}`}
                        onChange={(e) => setOp(i, { setupMinutes: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={row.entry.cycleSeconds}
                        aria-label={`Cycle seconds on step ${i + 1}`}
                        onChange={(e) => setOp(i, { cycleSeconds: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={row.entry.operators}
                        aria-label={`Operators on step ${i + 1}`}
                        onChange={(e) => setOp(i, { operators: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td>
                      <select
                        value={row.entry.toolCode}
                        aria-label={`Tool on step ${i + 1}`}
                        onChange={(e) => setOp(i, { toolCode: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">None</option>
                        {tools.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={row.entry.qcCheckpoint}
                        aria-label={`QC checkpoint on step ${i + 1}`}
                        onChange={(e) => setOp(i, { qcCheckpoint: e.target.checked })}
                        className="h-3.5 w-3.5 accent-brand-600"
                      />
                    </td>
                    <td className="text-right tabular text-xs font-medium text-fg">
                      {row.cost ? `₹${formatAmount(row.cost.total)}` : <span className="text-2xs text-danger">—</span>}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button type="button" onClick={() => moveOp(i, -1)} aria-label={`Move step ${i + 1} up`} disabled={i === 0} className="text-fg-subtle hover:text-fg disabled:opacity-30">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => moveOp(i, 1)} aria-label={`Move step ${i + 1} down`} disabled={i === form.ops.length - 1} className="text-fg-subtle hover:text-fg disabled:opacity-30">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => removeOp(i)} aria-label={`Remove step ${i + 1}`} className="ml-1 text-fg-subtle hover:text-danger">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!form.ops.length && (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-2xs text-fg-subtle">
                      No operations yet. Use <span className="font-medium text-fg-muted">Add operation</span> — picking a
                      standard operation fills in its work centre, times, manning and instruction.
                    </td>
                  </tr>
                )}
              </tbody>
              {form.ops.length > 0 && (
                <tfoot>
                  <tr className="bg-surface-2">
                    <td colSpan={9} className="text-right text-xs font-semibold text-fg">
                      Conversion cost per piece at a lot of {lot.toLocaleString('en-IN')} · {formTotalMinutes.toFixed(2)} min
                    </td>
                    <td className="text-right text-sm font-semibold tabular text-fg">₹{formatAmount(formTotalCost)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-1.5 text-2xs text-fg-subtle">
            The order of the rows is the order on the shop floor. Sequence numbers are renumbered in tens when steps are
            moved, so a step can be inserted later without renumbering everything.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete routing"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${confirmDelete.docNo} R${confirmDelete.revision} was soft-deleted.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.docNo} R{confirmDelete?.revision} will be marked deleted, not physically removed.
        </p>
      </Modal>
    </div>
  )
}
