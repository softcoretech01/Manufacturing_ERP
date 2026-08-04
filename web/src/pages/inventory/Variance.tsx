import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { InvStatusBadge, ItemCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { useCurrentUser } from '@/store/auth'
import { counts as seedCounts } from '@/mock/inventory'
import type { CountDoc, CountLine, RootCause } from '@/types/inventory'

const ROOT_CAUSES: { value: RootCause; label: string }[] = [
  { value: 'RECEIPT_ERROR', label: 'Receipt error' },
  { value: 'ISSUE_ERROR', label: 'Issue error' },
  { value: 'PUT_AWAY_ERROR', label: 'Put-away error' },
  { value: 'WEIGHMENT', label: 'Weighment difference' },
  { value: 'UOM_CONVERSION', label: 'UOM conversion' },
  { value: 'PILFERAGE', label: 'Pilferage' },
  { value: 'DAMAGE_UNREPORTED', label: 'Unreported damage' },
  { value: 'SYSTEM_TIMING', label: 'System timing' },
  { value: 'UNKNOWN', label: 'Unknown' },
]

interface VarianceRow extends CountLine {
  countUid: string
  countNo: string
  warehouse: string
  counter: string
  countStatus: CountDoc['status']
}

/**
 * Variance approval — every counted difference, its root cause and its sign-off.
 * The counter can never approve their own variance.
 */
export function VarianceApprovalPage() {
  const toast = useToast()
  const user = useCurrentUser()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedCounts, [])
  const { rows: counts, update } = useCollection<CountDoc>('inv:count', seed)

  const [causes, setCauses] = useState<Record<string, RootCause>>({})
  const [selected, setSelected] = useState<string[]>([])

  const rows: VarianceRow[] = counts.flatMap((c) =>
    c.lines
      .filter((l) => (l.varianceQty ?? 0) !== 0)
      .map((l) => ({ ...l, countUid: c.uid, countNo: c.docNo, warehouse: c.warehouse, counter: c.counter, countStatus: c.status })),
  )

  const openRows = rows.filter((r) => r.countStatus !== 'POSTED')
  const missingCause = openRows.filter((r) => !(causes[r.uid] ?? r.rootCause))
  const netValue = openRows.reduce((s, r) => s + r.valueImpact, 0)

  const columns: Column<VarianceRow>[] = [
    { key: 'countNo', header: 'Count', sortable: true, width: '11rem', render: (r) => (
      <div>
        <p className="font-mono text-2xs font-medium text-brand-600">{r.countNo}</p>
        <p className="text-2xs text-fg-subtle">{r.warehouse}</p>
      </div>
    ) },
    { key: 'bin', header: 'Bin', width: '8rem', render: (r) => <span className="font-mono text-2xs">{r.bin ?? '—'}</span> },
    { key: 'itemCode', header: 'Item', sortable: true, render: (r) => <ItemCell code={r.itemCode} name={r.itemName} sub={r.batchNo ?? undefined} /> },
    { key: 'systemQty', header: 'System', align: 'right', sortable: true, render: (r) => <span className="tabular text-fg-muted">{r.systemQty === null ? 'hidden' : formatQty(r.systemQty)}</span> },
    { key: 'countedQty', header: 'Counted', align: 'right', sortable: true, render: (r) => <span className="tabular">{r.countedQty === null ? '—' : formatQty(r.countedQty)}</span> },
    { key: 'varianceQty', header: 'Variance', align: 'right', sortable: true, render: (r) => (
      <span className={cn('font-medium tabular', (r.varianceQty ?? 0) < 0 ? 'text-danger' : 'text-success')}>
        {(r.varianceQty ?? 0) > 0 ? '+' : ''}{formatQty(r.varianceQty ?? 0)} {r.uom}
      </span>
    ) },
    { key: 'variancePct', header: '%', align: 'right', width: '6rem', render: (r) => <span className="tabular text-2xs">{r.variancePct === null ? '—' : `${r.variancePct.toFixed(2)}%`}</span> },
    { key: 'tolerance', header: 'Tolerance', align: 'right', width: '7rem', accessor: (r) => r.tolerancePct, render: (r) => (
      <span className={cn('tabular text-2xs', r.withinTolerance ? 'text-success' : 'text-danger')}>
        {r.tolerancePct}% {r.withinTolerance ? '✓' : '✕'}
      </span>
    ) },
    ...(canSeeValue ? [{ key: 'valueImpact', header: 'Value', align: 'right' as const, sortable: true, render: (r: VarianceRow) => <span className={cn(r.valueImpact < 0 ? 'text-danger' : 'text-success')}>{formatCurrency(r.valueImpact)}</span> }] : []),
    { key: 'rootCause', header: 'Root cause', width: '11rem', render: (r) => (
      r.countStatus === 'POSTED'
        ? <span className="text-2xs text-fg-muted">{ROOT_CAUSES.find((c) => c.value === r.rootCause)?.label ?? '—'}</span>
        : (
          <Select
            sizeVariant="sm"
            value={causes[r.uid] ?? r.rootCause ?? ''}
            onChange={(e) => setCauses({ ...causes, [r.uid]: e.target.value as RootCause })}
            options={[{ value: '', label: 'Choose…' }, ...ROOT_CAUSES]}
          />
        )
    ) },
    { key: 'state', header: 'State', width: '9rem', accessor: (r) => (r.recountRequired ? 'Recount' : r.isFoundStock ? 'Found' : 'Ready'), render: (r) => (
      r.recountRequired ? <Badge tone="warning" size="sm">Recount first</Badge>
        : r.isFoundStock ? <Badge tone="progress" size="sm">Found stock</Badge>
          : <InvStatusBadge status={r.countStatus} size="sm" />
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'count-variance', 'Count variance & approval', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Approving posts the whole count, so the check is per count document. */
  function approveCount(countUid: string) {
    const c = counts.find((x) => x.uid === countUid)
    if (!c) return
    if (c.counter === (user?.fullName ?? '')) {
      toast.error('Segregation of duties', `You counted ${c.docNo}. The person who counts can never approve the variance they produced.`)
      return
    }
    const lines = c.lines.filter((l) => (l.varianceQty ?? 0) !== 0)
    const stillMissing = lines.filter((l) => !(causes[l.uid] ?? l.rootCause))
    if (stillMissing.length) {
      toast.error('Root cause required', `${stillMissing.length} variance line(s) on ${c.docNo} have no root cause. "It just happened" is not a category.`)
      return
    }
    if (lines.some((l) => l.recountRequired)) {
      toast.error('Recount outstanding', `${c.docNo} has a variance beyond tolerance that still needs a second count by a different person.`)
      return
    }
    update(c.uid, {
      status: 'POSTED',
      isFrozen: false,
      postedOn: new Date().toISOString().slice(0, 10),
      lines: c.lines.map((l) => ({ ...l, rootCause: causes[l.uid] ?? l.rootCause })),
      approvals: c.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: 'APPROVED' as const, actedAt: new Date().toISOString(), approver: user?.fullName ?? a.approver } : a)),
    })
    toast.success('Variance posted', `${c.docNo} — differences written to the ledger as movements 403/404 and the freeze lifted.`)
    setSelected([])
  }

  const pendingCounts = [...new Set(openRows.map((r) => r.countUid))]

  return (
    <div>
      <PageHeader
        title="Variance approval"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Variance approval' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            disabled={pendingCounts.length === 0}
            onClick={() => pendingCounts.forEach(approveCount)}
          >
            Approve all ready counts
          </Button>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        Every counted difference, its cause and its sign-off. A variance cannot post until it has a root cause, any recount is
        complete, and someone other than the counter approves it.{' '}
        <span className={cn('font-medium', openRows.length ? 'text-warning' : 'text-success')}>{openRows.length}</span> open
        variance line{openRows.length === 1 ? '' : 's'} across {pendingCounts.length} count(s) ·{' '}
        <span className={cn('font-medium', missingCause.length ? 'text-danger' : 'text-success')}>{missingCause.length}</span>{' '}
        still missing a cause
        {canSeeValue && <> · net effect <span className={cn('font-medium tabular', netValue < 0 ? 'text-danger' : 'text-success')}>{formatCurrency(netValue)}</span></>}.
      </p>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search count, bin, item or batch…"
        onExport={doExport}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const countUids = [...new Set(rows.filter((r) => selected.includes(r.uid)).map((r) => r.countUid))]
              countUids.forEach(approveCount)
            }}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Approve the counts behind these lines
          </Button>
        }
        emptyTitle="No variances"
        emptyDescription="Every counted bin matched the system. That is the target."
        rowClassName={(r) => cn(r.recountRequired && 'bg-warning/[0.05]', r.isFoundStock && 'bg-progress/[0.05]', r.countStatus === 'POSTED' && 'opacity-60')}
      />

      <Card className="mt-4">
        <CardHeader title="Counts awaiting a decision" description="Approve a count and every variance on it posts together" />
        <CardBody className="space-y-2.5">
          {pendingCounts.length === 0 ? (
            <p className="text-xs text-fg-subtle">Nothing waiting — all counted variances have been posted.</p>
          ) : (
            pendingCounts.map((uid) => {
              const c = counts.find((x) => x.uid === uid)!
              const lines = openRows.filter((r) => r.countUid === uid)
              const mine = c.counter === (user?.fullName ?? '')
              return (
                <div key={uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3">
                  <div className="min-w-0">
                    <p className="font-mono text-2xs font-medium text-brand-600">{c.docNo}</p>
                    <p className="text-xs text-fg">{c.warehouse} · {c.scope}</p>
                    <p className="text-2xs text-fg-muted">
                      counted by {c.counter} · {lines.length} variance line(s)
                      {canSeeValue && <> · {formatCurrency(lines.reduce((s, l) => s + l.valueImpact, 0))}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {mine && <span className="text-2xs text-warning">You counted this</span>}
                    <Button variant="success" size="sm" disabled={mine} onClick={() => approveCount(uid)}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Approve & post
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        update(uid, { status: 'RECOUNT_REQUIRED', lines: c.lines.map((l) => ((l.varianceQty ?? 0) !== 0 ? { ...l, recountRequired: true } : l)) })
                        toast.success('Sent for recount', `${c.docNo} goes back for a second count — by a different person.`)
                      }}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Recount
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Root causes, not absorption" description="The share of 'unknown' is itself a management metric" />
        <CardBody className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ROOT_CAUSES.slice(0, 5).map((c) => {
            const n = rows.filter((r) => (causes[r.uid] ?? r.rootCause) === c.value).length
            return (
              <div key={c.value} className="rounded border border-border p-3">
                <p className="text-xs font-medium text-fg">{c.label}</p>
                <p className="mt-1 text-lg font-semibold tabular text-fg">{n}</p>
              </div>
            )
          })}
        </CardBody>
      </Card>
    </div>
  )
}
