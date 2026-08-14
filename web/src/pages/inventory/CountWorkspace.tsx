import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Plus, Check, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatQty, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useWarehouses } from '@/hooks/useOrganisation'
import {
  useCounts, useCountDetail, useCreateCount, useRecordCounts, useSubmitCount, useApproveCount, useCancelCount,
} from '@/hooks/useCount'
import type { Count } from '@/api/count'

const STATUS_TONE: Record<string, 'pending' | 'progress' | 'success' | 'neutral'> = {
  COUNTING: 'pending', COUNTED: 'progress', POSTED: 'success', CANCELLED: 'neutral',
}

export interface CountConfig {
  title: string
  description: string
  crumb: string
  countType?: 'CYCLE' | 'FULL' // fixed type for create; undefined = variance (all, read/approve)
  mode: 'count' | 'variance'
}

export function CountWorkspace({ config }: { config: CountConfig }) {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const listParams = config.mode === 'variance' ? { status: 'COUNTED' } : { count_type: config.countType }
  const listQ = useCounts(listParams)
  const counts = listQ.data ?? []
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (!selectedUid && counts.length) setSelectedUid(counts[0].uid)
  }, [selectedUid, counts])

  return (
    <div>
      <PageHeader title={config.title} description={config.description}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: config.crumb }]}
        actions={config.mode === 'count' ? (
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>New count</Button>
        ) : undefined}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardHeader title={config.mode === 'variance' ? 'Awaiting approval' : 'Counts'} description={`${counts.length} shown`} />
          <div className="max-h-[70vh] overflow-y-auto p-1.5">
            {listQ.isLoading && <p className="px-2 py-4 text-center text-xs text-fg-subtle">Loading…</p>}
            {!listQ.isLoading && counts.length === 0 && <p className="px-2 py-6 text-center text-xs text-fg-subtle">{config.mode === 'variance' ? 'No counts awaiting approval.' : 'No counts yet.'}</p>}
            {counts.map((c) => (
              <button key={c.uid} onClick={() => setSelectedUid(c.uid)}
                className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                  c.uid === selectedUid ? 'bg-brand-500/10' : 'hover:bg-surface-3')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-brand-600">{c.document_no}</span>
                  <span className="block truncate text-2xs text-fg-subtle">{c.warehouse_code} · {formatDate(c.count_date)} · {c.counted_by_name}</span>
                </span>
                <Badge tone={STATUS_TONE[c.status] ?? 'neutral'} size="sm">{c.status.toLowerCase()}</Badge>
              </button>
            ))}
          </div>
        </Card>

        <div className="min-w-0">
          {selectedUid ? <CountDetail uid={selectedUid} mode={config.mode} onGone={() => setSelectedUid(null)} /> : (
            <Card className="p-8 text-center text-sm text-fg-subtle">Select a count to open it.</Card>
          )}
        </div>
      </div>

      {createOpen && <CreateCountModal countType={config.countType ?? 'CYCLE'} onClose={() => setCreateOpen(false)} onCreated={(uid) => { setSelectedUid(uid); setCreateOpen(false) }} />}
    </div>
  )
}

/* ─────────────────────────── Detail ─────────────────────────── */
function CountDetail({ uid, mode, onGone }: { uid: string; mode: 'count' | 'variance'; onGone: () => void }) {
  const toast = useToast()
  const { data, isLoading } = useCountDetail(uid)
  const record = useRecordCounts()
  const submit = useSubmitCount()
  const approve = useApproveCount()
  const cancel = useCancelCount()
  const [entered, setEntered] = useState<Record<string, string>>({})

  useEffect(() => { setEntered({}) }, [uid])

  if (isLoading || !data) return <Card className="p-8 text-center text-sm text-fg-subtle">Loading…</Card>
  const { count, blind, lines } = data
  const isCounting = count.status === 'COUNTING'
  const isCounted = count.status === 'COUNTED'

  function saveCounts(then?: 'submit') {
    const entries = lines.map((l) => ({ line_uid: l.uid, counted_qty: entered[l.uid] !== undefined ? Number(entered[l.uid]) : l.counted_qty }))
      .filter((e) => e.counted_qty !== null && e.counted_qty !== undefined)
    record.mutate({ uid, entries }, {
      onSuccess: () => {
        if (then === 'submit') {
          submit.mutate(uid, {
            onSuccess: () => toast.success('Count submitted', 'Variances are now visible for approval.'),
            onError: (e) => toast.error('Submit failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
          })
        } else toast.success('Saved', 'Counts recorded.')
      },
      onError: (e) => toast.error('Save failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
    })
  }

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><span className="font-mono">{count.document_no}</span>
          <Badge tone={STATUS_TONE[count.status] ?? 'neutral'} size="sm">{count.status.toLowerCase()}</Badge>
          {blind ? <span className="flex items-center gap-1 text-2xs text-fg-subtle"><EyeOff className="h-3 w-3" /> blind</span> : <span className="flex items-center gap-1 text-2xs text-fg-subtle"><Eye className="h-3 w-3" /> revealed</span>}
        </span>}
        description={`${count.warehouse_code} · ${count.count_type.toLowerCase()} count · counter ${count.counted_by_name} · ${count.line_count} lines`}
        actions={
          <div className="flex gap-2">
            {isCounting && <>
              <Button size="sm" variant="outline" onClick={() => saveCounts()} loading={record.isPending && !submit.isPending}>Save</Button>
              <Button size="sm" variant="primary" onClick={() => saveCounts('submit')} loading={submit.isPending}>Submit count</Button>
            </>}
            {isCounted && mode === 'variance' && (
              <Button size="sm" variant="primary" icon={<Check className="h-4 w-4" />} loading={approve.isPending}
                onClick={() => approve.mutate(uid, {
                  onSuccess: (r) => toast.success('Approved & posted', `${r.movements_posted} reconciling movement(s), net value ${r.net_value.toLocaleString('en-IN')}.`),
                  onError: (e) => toast.error('Approve failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
                })}>Approve & post</Button>
            )}
            {(isCounting || isCounted) && (
              <Button size="sm" variant="ghost" onClick={() => cancel.mutate(uid, { onSuccess: () => { toast.success('Cancelled'); onGone() } })}>Cancel</Button>
            )}
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="min-w-[220px]">Item</th>
              <th className="w-24">Batch</th>
              <th className="w-20 text-center">UOM</th>
              {!blind && <th className="w-28 text-right">System</th>}
              <th className="w-28 text-right">Counted</th>
              {!blind && <th className="w-28 text-right">Variance</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const val = entered[l.uid] !== undefined ? entered[l.uid] : (l.counted_qty != null ? String(l.counted_qty) : '')
              return (
                <tr key={l.uid}>
                  <td><div className="min-w-0"><p className="truncate text-xs text-fg">{l.item_name}</p><p className="truncate font-mono text-2xs text-fg-subtle">{l.item_code}</p></div></td>
                  <td className="text-2xs text-fg-muted">{l.batch_no || '—'}</td>
                  <td className="text-center text-2xs text-fg-muted">{l.uom}</td>
                  {!blind && <td className="text-right tabular text-xs">{l.system_qty != null ? formatQty(l.system_qty) : '—'}</td>}
                  <td className="text-right">
                    {isCounting ? (
                      <Input sizeVariant="sm" type="number" value={val} className="text-right"
                        onChange={(e) => setEntered((s) => ({ ...s, [l.uid]: e.target.value }))} />
                    ) : (
                      <span className="tabular text-xs">{l.counted_qty != null ? formatQty(l.counted_qty) : '—'}</span>
                    )}
                  </td>
                  {!blind && <td className="text-right tabular text-xs">
                    {l.variance == null ? '—' : <span className={l.variance === 0 ? 'text-fg-subtle' : l.variance > 0 ? 'text-success' : 'text-danger'}>{l.variance > 0 ? '+' : ''}{formatQty(l.variance)}</span>}
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {blind && <div className="border-t border-border p-3"><Alert tone="info" title="Blind count">System quantities are hidden until you submit — a sheet that shows the expected figure is not a count (V4-CNT-BR-002).</Alert></div>}
      {isCounted && mode === 'count' && <div className="border-t border-border p-3"><Alert tone="info">Submitted. A different user approves the variance on the Variance approval screen (segregation of duties).</Alert></div>}
    </Card>
  )
}

/* ─────────────────────────── Create ─────────────────────────── */
function CreateCountModal({ countType, onClose, onCreated }: { countType: 'CYCLE' | 'FULL'; onClose: () => void; onCreated: (uid: string) => void }) {
  const toast = useToast()
  const warehouses = useWarehouses().data?.data ?? []
  const create = useCreateCount()
  const [warehouseUid, setWarehouseUid] = useState('')
  const [remarks, setRemarks] = useState('')

  return (
    <Modal open onClose={onClose} size="sm" title={`New ${countType === 'FULL' ? 'physical verification' : 'cycle count'}`}
      description="Snapshots the current system quantity into blind count lines."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={create.isPending} disabled={!warehouseUid}
          onClick={() => create.mutate({ warehouse_uid: warehouseUid, count_type: countType, remarks: remarks.trim() || null }, {
            onSuccess: (d) => { toast.success('Count created', `${d.count.document_no} · ${d.lines.length} lines to count`); onCreated(d.count.uid) },
            onError: (e) => toast.error('Create failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
          })}>Create count</Button></>}>
      <div className="space-y-3.5">
        <Select label="Warehouse" required value={warehouseUid} onChange={(e) => setWarehouseUid(e.target.value)}
          options={[{ value: '', label: 'Select a warehouse…' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
        <Input label="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        <Alert tone="info">Every location with stock in this warehouse becomes a blind count line.</Alert>
      </div>
    </Modal>
  )
}
