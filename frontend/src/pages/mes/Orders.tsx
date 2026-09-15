import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Play, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { MesDetailBlock, MesStatusBadge, ProgressCell } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { productionApi } from '@/api/production'
import { shopFloorApi, type ProductionOrderRow, type ReadinessResult } from '@/api/shopfloor'

/**
 * Production orders — the release gate.
 *
 * Releasing is a server action: it writes one work order per routing operation
 * inside a single transaction, and either all of them exist afterwards or none
 * do. This screen does not pre-judge that decision, it only shows what can
 * honestly be checked first.
 *
 * Of the four checks a shop floor usually makes before releasing, only material
 * can be answered from data this system holds. Machine, tooling and manpower
 * readiness would need an availability calendar, a tooling register and a
 * roster, none of which exist — so they are shown as unanswered rather than
 * ticked green.
 */

const OPEN_STATES = ['PLANNED', 'FIRM_PLANNED', 'RELEASED', 'IN_PROGRESS']

export function ProductionOrdersPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<ProductionOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('open')
  const [detail, setDetail] = useState<ProductionOrderRow | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<ProductionOrderRow | null>(null)
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function message(err: unknown, fallback: string) {
    return err instanceof ProblemError ? err.problem.detail : fallback
  }

  async function load() {
    try {
      setOrders(await shopFloorApi.orders())
      setError(null)
    } catch (err) {
      setError(message(err, 'Could not reach the backend.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function openRelease(o: ProductionOrderRow) {
    setReleaseTarget(o)
    setReadiness(null)
    setReadinessError(null)
    try {
      setReadiness(await shopFloorApi.readiness(o.uid))
    } catch (err) {
      setReadinessError(message(err, 'Material coverage could not be checked.'))
    }
  }

  async function release() {
    if (!releaseTarget) return
    setBusy(true)
    try {
      const result = await productionApi.releaseOrder(releaseTarget.uid)
      toast.success(
        'Released to the floor',
        `${result.docNo} is ${result.status.toLowerCase()} with ${result.workOrders.length} work order${
          result.workOrders.length === 1 ? '' : 's'
        }. ${result.firstOperation ? `${result.firstOperation} is ready to start.` : ''}`,
      )
      setReleaseTarget(null)
      await load()
    } catch (err) {
      toast.error('Not released', message(err, 'The server refused to release this order.'))
    } finally {
      setBusy(false)
    }
  }

  async function complete(o: ProductionOrderRow) {
    try {
      const result = await productionApi.completeOrder(o.uid)
      toast.success(
        'Order closed',
        `${result.docNo} is ${result.status.toLowerCase()} — ${formatQty(result.producedQty)} made, ${formatQty(result.scrapQty)} scrapped across ${result.operations} operations.`,
      )
      await load()
    } catch (err) {
      toast.error('Not closed', message(err, 'The server refused to close this order.'))
    }
  }

  const shown = orders.filter((o) =>
    tab === 'open' ? OPEN_STATES.includes(o.status) : tab === 'closed' ? !OPEN_STATES.includes(o.status) : true,
  )

  const columns: Column<ProductionOrderRow>[] = [
    { key: 'docNo', header: 'Order', sortable: true, width: '11rem', render: (o) => <span className="font-mono text-xs font-medium text-brand-600">{o.docNo}</span> },
    { key: 'productCode', header: 'Product', sortable: true, render: (o) => (
      <div>
        <p className="font-mono text-2xs text-fg">{o.productCode}</p>
        <p className="truncate text-2xs text-fg-subtle" title={o.productName}>{o.productName}</p>
      </div>
    ) },
    { key: 'qty', header: 'Ordered', align: 'right', sortable: true, render: (o) => <span className="tabular">{formatQty(o.qty)}</span> },
    { key: 'progress', header: 'Made', width: '11rem', accessor: (o) => o.completedQty, render: (o) => (
      <ProgressCell done={o.completedQty} total={o.qty} tone={o.completedQty >= o.qty ? 'success' : 'brand'} />
    ) },
    { key: 'rejectedQty', header: 'Rejected', align: 'right', sortable: true, render: (o) => (
      o.rejectedQty ? <span className="tabular text-danger">{formatQty(o.rejectedQty)}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'operations', header: 'Operations', align: 'center', width: '7rem', render: (o) => (
      o.released ? <span className="tabular text-2xs">{o.operationsDone}/{o.operations}</span> : <span className="text-2xs text-fg-subtle">not released</span>
    ) },
    { key: 'plannedFinish', header: 'Due', sortable: true, width: '8.5rem', accessor: (o) => o.plannedFinish ?? '', render: (o) => (o.plannedFinish ? formatDate(o.plannedFinish) : '—') },
    { key: 'status', header: 'Status', width: '9rem', sortable: true, render: (o) => <MesStatusBadge status={o.status} size="sm" /> },
    { key: 'priority', header: 'Priority', width: '7rem', defaultHidden: true },
    { key: 'bomDocNo', header: 'Bill', defaultHidden: true, render: (o) => <span className="font-mono text-2xs">{o.bomDocNo} r{o.bomRevision}</span> },
    { key: 'routingDocNo', header: 'Routing', defaultHidden: true, render: (o) => <span className="font-mono text-2xs">{o.routingDocNo} r{o.routingRevision}</span> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'production-orders', 'Production orders', columnsFromTable(columns), shown)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Production orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Production orders' }]}
      />

      {error && (
        <Alert tone="danger" title="Production orders could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

      <Tabs
        tabs={[
          { id: 'open', label: `Open (${orders.filter((o) => OPEN_STATES.includes(o.status)).length})` },
          { id: 'closed', label: `Closed (${orders.filter((o) => !OPEN_STATES.includes(o.status)).length})` },
          { id: 'all', label: `All (${orders.length})` },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-3"
      />

      <DataTable
        rows={shown}
        columns={columns}
        rowKey={(o) => o.uid}
        loading={loading}
        searchPlaceholder="Search order, product or status…"
        onExport={doExport}
        onRowClick={(o) => setDetail(o)}
        emptyTitle="No production order"
        emptyDescription="Orders arrive here from planning. Convert a planned order or raise one to put work on the floor."
        rowActions={(o) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(o)} />
            {!o.released && <MenuItem label="Release to the floor" onClick={() => void openRelease(o)} />}
            {o.released && <MenuItem label="Traveller" onClick={() => navigate(`/production/traveller?order=${encodeURIComponent(o.docNo)}`)} />}
            {o.released && OPEN_STATES.includes(o.status) && (
              <MenuItem label="Close the order" onClick={() => void complete(o)} />
            )}
          </>
        )}
      />

      {/* Release ------------------------------------------------------------- */}
      <Modal
        open={!!releaseTarget}
        onClose={() => setReleaseTarget(null)}
        title={releaseTarget ? `Release ${releaseTarget.docNo}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setReleaseTarget(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} icon={<Play className="h-4 w-4" />} onClick={() => void release()}>
              Release
            </Button>
          </>
        }
      >
        {releaseTarget && (
          <div className="space-y-4">
            <p className="text-xs text-fg-muted">
              Releasing writes one work order per routing operation, in one transaction. The first operation becomes ready with
              the full order quantity; the rest wait for the one in front of them.
            </p>

            {readinessError && (
              <Alert tone="warning" title="Material could not be checked">
                {readinessError} You can still release; the server will refuse a material issue it cannot cover.
              </Alert>
            )}

            {readiness && (
              <>
                <div className={cn('rounded border p-3', readiness.material.ready ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5')}>
                  <p className="flex items-center gap-2 text-xs font-medium">
                    {readiness.material.ready ? (
                      <><CheckCircle2 className="h-4 w-4 text-success" /> Material is covered</>
                    ) : (
                      <><XCircle className="h-4 w-4 text-warning" /> Material is not covered</>
                    )}
                  </p>
                  {readiness.material.missingFromInventory.length > 0 && (
                    <p className="mt-1 text-2xs text-danger">
                      Not in the inventory master at all, so they cannot be issued:{' '}
                      {readiness.material.missingFromInventory.join(', ')}.
                    </p>
                  )}
                  {readiness.material.short.length > 0 && (
                    <p className="mt-1 text-2xs text-fg-muted">
                      Short: {readiness.material.short.map((s) => `${s.itemCode} by ${formatQty(s.shortQty)} ${s.uom}`).join('; ')}.
                    </p>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th className="w-24 text-right">Required</th>
                        <th className="w-24 text-right">Issued</th>
                        <th className="w-24 text-right">Free stock</th>
                        <th className="w-24 text-right">Short by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readiness.components.map((c) => (
                        <tr key={c.itemCode}>
                          <td>
                            <p className="font-mono text-2xs text-fg">{c.itemCode}</p>
                            {!c.inInventoryMaster && <p className="text-2xs text-danger">no inventory item</p>}
                          </td>
                          <td className="text-right tabular">{formatQty(c.requiredQty)}</td>
                          <td className="text-right tabular">{formatQty(c.issuedQty)}</td>
                          <td className="text-right tabular">{formatQty(c.freeQty)}</td>
                          <td className={cn('text-right tabular', c.shortQty > 0 && 'text-danger')}>
                            {c.shortQty > 0 ? formatQty(c.shortQty) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded border border-border bg-surface-2 px-3 py-2">
                  <p className="text-2xs font-medium text-fg">Not checked, and why</p>
                  <ul className="mt-1 space-y-1">
                    {readiness.unknown.map((u) => (
                      <li key={u.check} className="text-2xs leading-relaxed text-fg-muted">
                        <span className="font-medium text-fg">{u.check}</span> — {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {!readiness && !readinessError && <p className="text-xs text-fg-muted">Checking material coverage…</p>}
          </div>
        )}
      </Modal>

      {/* Detail -------------------------------------------------------------- */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.docNo ?? ''} width="lg">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <MesStatusBadge status={detail.status} />
              <Badge tone="neutral" size="sm" dot={false}>{detail.orderType}</Badge>
              {detail.priority && <Badge tone="neutral" size="sm" dot={false}>{detail.priority}</Badge>}
            </div>

            <MesDetailBlock title="What is being made">
              <DataGrid
                items={[
                  { label: 'Product', value: `${detail.productCode} — ${detail.productName}` },
                  { label: 'Ordered', value: `${formatQty(detail.qty)} ${detail.uom}` },
                  { label: 'Off the last operation', value: formatQty(detail.completedQty) },
                  { label: 'Rejected', value: formatQty(detail.rejectedQty) },
                  { label: 'Plant', value: detail.plant || '—' },
                  { label: 'Receiving warehouse', value: detail.warehouse || '—' },
                ]}
              />
            </MesDetailBlock>

            <MesDetailBlock title="Cut against">
              <DataGrid
                items={[
                  { label: 'Bill of material', value: `${detail.bomDocNo} revision ${detail.bomRevision}` },
                  { label: 'Routing', value: `${detail.routingDocNo} revision ${detail.routingRevision}` },
                  { label: 'Estimated unit cost', value: formatCurrency(detail.estimatedUnitCost) },
                  { label: 'Planned start', value: detail.plannedStart ? formatDate(detail.plannedStart) : '—' },
                  { label: 'Planned finish', value: detail.plannedFinish ? formatDate(detail.plannedFinish) : '—' },
                  { label: 'Operations complete', value: detail.released ? `${detail.operationsDone} of ${detail.operations}` : 'not released' },
                ]}
              />
            </MesDetailBlock>

            <div className="flex flex-wrap gap-2">
              {!detail.released && (
                <Button variant="primary" size="sm" onClick={() => { setDetail(null); void openRelease(detail) }}>
                  Release to the floor
                </Button>
              )}
              {detail.released && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/production/traveller?order=${encodeURIComponent(detail.docNo)}`)}>
                  Traveller
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate('/production/work-orders')}>Work orders</Button>
            </div>

            {detail.remarks && (
              <Card>
                <CardHeader title="Remarks" />
                <CardBody className="text-xs text-fg-muted">{detail.remarks}</CardBody>
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
