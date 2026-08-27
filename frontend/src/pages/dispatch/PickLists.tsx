import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useLiveCrud } from '@/components/crud/CrudKit'
import { pickListApi } from '@/api/pickListApi'
import { useEffect } from 'react'
import { CountBar, DispatchStatusBadge, ItemCell, PICK_METHOD_LABEL } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { PickList, PickMethod } from '@/types/dispatch'

const PICKERS = ['D. Anand', 'R. Sekar', 'M. Jaya', 'T. Prakash']

const TABS = [
  { id: 'ALL', label: 'All pick lists' },
  { id: 'OPEN', label: 'To pick' },
  { id: 'SHORT', label: 'Short picks' },
  { id: 'DONE', label: 'Picked' },
]

/**
 * Pick lists — telling the warehouse exactly which bin and which batch to take
 * stock from. The picking method is not a preference: FEFO on a batch-controlled
 * bottle stops the oldest stock ageing out in a corner, and picking the wrong
 * batch breaks the traceability chain the traveller card built.
 */
export function PickListsPage() {
  const toast = useToast()
  const [picks, setPicks] = useState<PickList[]>([])

  const fetchPicks = async () => {
    try {
      const data = await pickListApi.getAll()
      setPicks(data)
    } catch (err) {
      toast.error('Failed to load pick lists', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchPicks()
  }, [])

  const crud = useLiveCrud<PickList>({
    entity: 'Pick list',
    titleOf: (p) => p.docNo,
    fields: [
      { name: 'docNo', label: 'Pick list number', required: true, readOnly: true },
      { name: 'dispatchPlanNo', label: 'Dispatch plan', required: true },
      {
        name: 'method',
        label: 'Picking method',
        type: 'select',
        required: true,
        options: Object.entries(PICK_METHOD_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'customer', label: 'Customer', required: true },
      { name: 'itemName', label: 'Product', required: true, span: 2 },
      { name: 'batchNo', label: 'Batch' },
      { name: 'warehouse', label: 'Warehouse', required: true },
      { name: 'zone', label: 'Zone', required: true },
      { name: 'bin', label: 'Bin', required: true, hint: 'Where the picker actually walks to' },
      { name: 'requiredQty', label: 'Quantity to pick', type: 'number', required: true },
      { name: 'pickedQty', label: 'Quantity picked', type: 'number' },
      { name: 'uom', label: 'Unit', required: true },
      { name: 'picker', label: 'Picker', type: 'select', options: PICKERS.map((p) => ({ value: p, label: p })) },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        docNo: v.docNo,
        createdOn: new Date().toISOString(),
        itemCode: 'FG-NEW',
        status: 'OPEN' as const,
        shortReason: null,
      }),
      dispatchPlanNo: v.dispatchPlanNo,
      method: v.method as PickMethod,
      customer: v.customer,
      itemName: v.itemName,
      batchNo: v.batchNo || null,
      warehouse: v.warehouse,
      zone: v.zone,
      bin: v.bin,
      requiredQty: Number(v.requiredQty) || 0,
      pickedQty: Number(v.pickedQty) || 0,
      uom: v.uom,
      picker: v.picker || null,
    }),
    blockDelete: (p) =>
      p.pickedQty > 0
        ? `${p.docNo} already has ${formatQty(p.pickedQty)} ${p.uom} picked. Reverse the pick first — the stock has physically moved out of the bin.`
        : undefined,
  }, picks, pickListApi, fetchPicks)
  const [tab, setTab] = useState('ALL')
  const [assigning, setAssigning] = useState<PickList | null>(null)
  const [picker, setPicker] = useState('')
  const [confirming, setConfirming] = useState<PickList | null>(null)
  const [pickedQty, setPickedQty] = useState('')
  const [shortReason, setShortReason] = useState('')

  const visible = picks.filter((p) => {
    if (tab === 'OPEN') return p.status === 'OPEN' || p.status === 'ASSIGNED' || p.status === 'PICKING'
    if (tab === 'SHORT') return p.status === 'SHORT'
    if (tab === 'DONE') return p.status === 'PICKED'
    return true
  })

  const unassigned = picks.filter((p) => !p.picker && p.status === 'OPEN')
  const short = picks.filter((p) => p.status === 'SHORT')
  const toPick = picks.filter((p) => p.status !== 'PICKED' && p.status !== 'CANCELLED')
  const outstanding = toPick.reduce((s, p) => s + (p.requiredQty - p.pickedQty), 0)

  const columns: Column<PickList>[] = [
    { key: 'docNo', header: 'Pick list', sortable: true, width: '11.5rem', render: (p) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{p.docNo}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{p.dispatchPlanNo}</p>
      </div>
    ) },
    { key: 'method', header: 'Method', sortable: true, width: '8rem', render: (p) => (
      <Badge tone={p.method === 'FEFO' ? 'success' : p.method === 'FIFO' ? 'brand' : 'neutral'} size="sm" dot={false}>
        {p.method}
      </Badge>
    ) },
    { key: 'customer', header: 'Customer', sortable: true, width: '12rem' },
    { key: 'itemName', header: 'Product', sortable: true, render: (p) => (
      <ItemCell name={p.itemName} code={p.itemCode} batch={p.batchNo} />
    ) },
    { key: 'bin', header: 'Where to go', sortable: true, width: '11rem', render: (p) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-fg">{p.bin}</p>
        <p className="truncate text-2xs text-fg-subtle">{p.zone} · {p.warehouse}</p>
      </div>
    ) },
    { key: 'requiredQty', header: 'Required', align: 'right', sortable: true, width: '7.5rem', render: (p) => (
      <span className="tabular text-xs text-fg-muted">{formatQty(p.requiredQty)}</span>
    ) },
    { key: 'pickedQty', header: 'Picked', width: '11rem', sortable: true, accessor: (p) => p.pickedQty, render: (p) => (
      <CountBar done={p.pickedQty} total={p.requiredQty} />
    ) },
    { key: 'gap', header: 'Gap', align: 'right', sortable: true, width: '7rem', accessor: (p) => p.requiredQty - p.pickedQty, render: (p) => {
      const gap = p.requiredQty - p.pickedQty
      return gap > 0 ? (
        <span className={cn('tabular text-xs', p.status === 'SHORT' ? 'font-medium text-danger' : 'text-warning')}>{formatQty(gap)}</span>
      ) : (
        <span className="text-2xs text-success">complete</span>
      )
    } },
    { key: 'picker', header: 'Picker', sortable: true, width: '9rem', render: (p) => (
      p.picker ? <span className="text-xs">{p.picker}</span> : <span className="text-2xs text-warning">unassigned</span>
    ) },
    { key: 'createdOn', header: 'Released', sortable: true, width: '10rem', accessor: (p) => p.createdOn, render: (p) => (
      <span className="text-2xs">{formatDateTime(p.createdOn)}</span>
    ) },
    { key: 'shortReason', header: 'Why short', render: (p) => (
      p.shortReason ? <span className="text-2xs text-danger">{p.shortReason}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (p) => <DispatchStatusBadge status={p.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'pick-lists', 'Pick list register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Pick lists"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Pick lists' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => crud.openCreate({
              docNo: `PCK/2607/${String(425 + picks.length).padStart(4, '0')}`,
              method: 'FEFO',
              warehouse: 'FG Store — Chennai',
              uom: 'NOS',
            })}
          >
            New pick list
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', unassigned.length ? 'text-warning' : 'text-success')}>{unassigned.length}</span> pick
        list{unassigned.length === 1 ? '' : 's'} not yet assigned to a picker ·{' '}
        <span className="font-medium text-fg tabular">{formatQty(outstanding)}</span> bottles still to pick
        {short.length > 0 && (
          <>
            {' '}· <span className="font-medium text-danger">{short.length}</span> short pick
            {short.length === 1 ? '' : 's'} needing a decision
          </>
        )}
        .
      </p>

      {short.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Short picks"
            description="The bin did not hold what the plan promised — someone has to decide before the vehicle leaves"
          />
          <CardBody className="space-y-2">
            {short.map((p) => (
              <div key={(p as any).id || p.uid} className="rounded border border-danger/30 bg-danger/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">
                      {p.docNo} — {p.itemName}
                    </p>
                    <p className="mt-0.5 text-2xs text-fg-muted">
                      {formatQty(p.pickedQty)} of {formatQty(p.requiredQty)} picked from {p.bin} · short{' '}
                      <span className="font-medium text-danger">{formatQty(p.requiredQty - p.pickedQty)}</span>
                    </p>
                    {p.shortReason && <p className="mt-1 text-2xs text-fg-muted">{p.shortReason}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        pickListApi.update((p as any).id, { ...p, requiredQty: p.pickedQty, status: 'PICKED', shortReason: `${p.shortReason ?? ''} Short-closed — the consignment ships with ${formatQty(p.pickedQty)}.`.trim() })
                          .then(() => fetchPicks())
                        toast.success(
                          'Short-closed',
                          `${p.docNo} closed at ${formatQty(p.pickedQty)}. The dispatch plan and the invoice both drop to the picked quantity, so the customer is not billed for what did not go.`,
                        )
                      }}
                    >
                      Ship what was picked
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        pickListApi.update((p as any).id, { ...p, status: 'PICKING', shortReason: `${p.shortReason ?? ''} Re-issued to the picker to search other bins.`.trim() })
                          .then(() => fetchPicks())
                        toast.success('Sent back to the floor', `${p.docNo} re-opened. The picker will check the other bins holding this item before we accept the shortfall.`)
                      }}
                    >
                      Search other bins
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(p) => String((p as any).id || p.uid)}
        searchPlaceholder="Search pick list, plan, product, bin or picker…"
        onExport={doExport}
        emptyTitle="No pick lists"
        emptyDescription="Pick lists are created when a dispatch plan is released to the warehouse."
        rowClassName={(p) => cn(
          p.status === 'SHORT' && 'bg-danger/[0.04]',
          !p.picker && p.status === 'OPEN' && 'bg-warning/[0.04]',
        )}
        rowActions={(p) => (
          <>
            <MenuItem label="Edit the pick list" onClick={() => crud.openEdit(p)} />
            <MenuItem label="Delete the pick list" danger onClick={() => crud.askDelete(p)} />
            <MenuItem
              separatorBefore
              label={p.picker ? 'Reassign the picker' : 'Assign a picker'}
              disabled={p.status === 'PICKED' || p.status === 'CANCELLED'}
              onClick={() => { setAssigning(p); setPicker(p.picker ?? PICKERS[0]) }}
            />
            <MenuItem
              label="Confirm the pick"
              disabled={p.status === 'PICKED' || p.status === 'CANCELLED'}
              onClick={() => { setConfirming(p); setPickedQty(String(p.requiredQty)); setShortReason('') }}
            />
            <MenuItem label="Print the pick list" onClick={() => doExport('pdf')} />
            <MenuItem
              separatorBefore
              label="Cancel the pick list"
              danger
              disabled={p.status === 'PICKED' || p.status === 'CANCELLED'}
              onClick={() => {
                pickListApi.update((p as any).id, { ...p, status: 'CANCELLED' })
                  .then(() => fetchPicks())
                toast.success('Pick list cancelled', `${p.docNo} cancelled. Any stock already picked goes back to ${p.bin}.`)
              }}
            />
          </>
        )}
      />

      {/* Assign a picker ---------------------------------------------------- */}
      <Modal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        title={assigning ? `Picker for ${assigning.docNo}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssigning(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!assigning) return
                pickListApi.update((assigning as any).id, { ...assigning, picker, status: assigning.status === 'OPEN' ? 'ASSIGNED' : assigning.status })
                  .then(() => fetchPicks())
                toast.success('Picker assigned', `${picker} has ${assigning.docNo} — ${formatQty(assigning.requiredQty)} ${assigning.uom} from ${assigning.bin}.`)
                setAssigning(null)
              }}
            >
              Assign
            </Button>
          </>
        }
      >
        {assigning && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {formatQty(assigning.requiredQty)} {assigning.uom} of {assigning.itemName} from{' '}
              <span className="font-mono text-fg">{assigning.bin}</span>, {PICK_METHOD_LABEL[assigning.method].toLowerCase()}.
            </p>
            <Select label="Picker" value={picker} onChange={(e) => setPicker(e.target.value)} options={PICKERS.map((p) => ({ value: p, label: p }))} />
          </div>
        )}
      </Modal>

      {/* Confirm the pick --------------------------------------------------- */}
      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming ? `Confirm ${confirming.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!confirming) return
                const qty = Number(pickedQty)
                if (Number.isNaN(qty) || qty < 0) {
                  toast.error('Enter a quantity', 'How many were actually taken off the bin?')
                  return
                }
                if (qty > confirming.requiredQty) {
                  toast.error(
                    'More than required',
                    `The list asks for ${formatQty(confirming.requiredQty)}. Picking ${formatQty(qty)} would over-ship the customer — correct the quantity or amend the dispatch plan first.`,
                  )
                  return
                }
                const isShort = qty < confirming.requiredQty
                if (isShort && !shortReason.trim()) {
                  toast.error('Short pick needs a reason', 'A shortfall with no reason becomes an unexplained stock difference at month end.')
                  return
                }
                pickListApi.update((confirming as any).id, {
                  ...confirming,
                  pickedQty: qty,
                  status: isShort ? 'SHORT' : 'PICKED',
                  shortReason: isShort ? shortReason.trim() : null,
                }).then(() => fetchPicks())
                toast.success(
                  isShort ? 'Short pick recorded' : 'Pick confirmed',
                  isShort
                    ? `${formatQty(qty)} of ${formatQty(confirming.requiredQty)} picked. The shortfall is flagged for a decision before the vehicle leaves.`
                    : `${formatQty(qty)} ${confirming.uom} picked from ${confirming.bin} and moved to the staging area.`,
                )
                setConfirming(null)
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        {confirming && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{confirming.itemName}</p>
              <p className="mt-1 text-fg-muted">
                <span className="font-mono">{confirming.bin}</span> · batch{' '}
                <span className="font-mono">{confirming.batchNo ?? 'not batch-controlled'}</span> ·{' '}
                {PICK_METHOD_LABEL[confirming.method]}
              </p>
            </div>
            <Input
              label={`Quantity picked (asked for ${formatQty(confirming.requiredQty)})`}
              type="number"
              value={pickedQty}
              onChange={(e) => setPickedQty(e.target.value)}
            />
            {Number(pickedQty) < confirming.requiredQty && (
              <Textarea
                label="Why short (required)"
                rows={3}
                value={shortReason}
                onChange={(e) => setShortReason(e.target.value)}
                placeholder="Bin held only 5,640 of this batch; the balance is still in quarantine awaiting the leak-test certificate…"
              />
            )}
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Five picking methods, and when each is right" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-medium text-fg">FIFO</span> — oldest received stock first. The default where nothing expires.</p>
          <p><span className="font-medium text-fg">FEFO</span> — earliest expiry first. For anything dated, this is the only safe rule; FIFO can still leave a short-dated batch behind.</p>
          <p><span className="font-medium text-fg">Batch-wise</span> — the customer asked for a specific batch, usually because their own traceability requires it.</p>
          <p><span className="font-medium text-fg">Zone-wise</span> — one picker stays in one zone. Less walking, but the order arrives at staging in pieces.</p>
          <p><span className="font-medium text-fg">Wave picking</span> — many orders picked together, sorted afterwards. Best for e-commerce, where there are hundreds of single-unit orders.</p>
        </CardBody>
      </Card>
    </div>
  )
}
