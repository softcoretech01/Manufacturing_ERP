import { useMemo, useState } from 'react'
import { Check, Layers, Save, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { PlanStatusBadge } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { bucketIndex, planningItem } from '@/lib/planFlow'
import { newUid } from '@/store/data'
import { usePlanningData } from './usePlanningData'
import type { MpsLine } from '@/types/planning'

/**
 * Master production schedule (Ch 7).
 *
 * Demand is lumpy; a plant is not. The MPS is where the planner smooths one
 * into the other — and once a product has an approved MPS, MRP plans from the
 * schedule rather than the raw demand, because building to the peaks is how a
 * plant ends up with idle weeks and impossible ones.
 *
 * The grid is editable in place. The line under each product shows what the
 * demand actually was, so a plan that drifts away from it is visible.
 */

export function MpsPage() {
  const toast = useToast()
  const { mps, demand, products, ctx, starts } = usePlanningData()
  const { rows, create, update } = mps

  const [productCode, setProductCode] = useState(() => products.rows.find((p) => p.lifecycle === 'PRODUCTION')?.code ?? '')
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [levelOpen, setLevelOpen] = useState(false)
  const [levelTarget, setLevelTarget] = useState('')

  const product = products.rows.find((p) => p.code === productCode)
  const item = productCode ? planningItem(productCode, ctx) : null

  /** Demand landing in each bucket, from the demand register. */
  const demandByBucket = useMemo(() => {
    const arr = Array.from({ length: starts.length }, () => 0)
    for (const d of demand.rows) {
      if (d.productCode !== productCode || d.status !== 'OPEN') continue
      const b = bucketIndex(d.requiredOn, starts)
      if (b >= 0) arr[b] += Math.max(0, d.qty - d.qtyPlanned)
    }
    return arr
  }, [demand.rows, productCode, starts])

  const lines = useMemo(
    () => rows.filter((m) => m.productCode === productCode).sort((a, b) => a.bucket - b.bucket),
    [rows, productCode],
  )

  const lineFor = (bucket: number) => lines.find((l) => l.bucket === bucket)
  const plannedIn = (bucket: number) => {
    const key = String(bucket)
    if (draft[bucket] !== undefined) return Number(draft[bucket]) || 0
    return lineFor(bucket)?.plannedQty ?? 0
    void key
  }

  /** Running projected stock, so over- and under-planning is visible in the grid. */
  const projection = useMemo(() => {
    if (!item) return []
    let running = item.available
    return starts.map((_, b) => {
      running = running + plannedIn(b) - demandByBucket[b]
      return running
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, starts, demandByBucket, draft, lines])

  const totalDemand = demandByBucket.reduce((s, v) => s + v, 0)
  const totalPlanned = starts.reduce((s, _, b) => s + plannedIn(b), 0)
  const dirty = Object.keys(draft).length > 0

  function setBucket(bucket: number, value: string) {
    setDraft((d) => ({ ...d, [bucket]: value }))
  }

  function saveDraft() {
    if (!productCode || !product) return
    let created = 0
    let updated = 0
    for (const [bucketStr, value] of Object.entries(draft)) {
      const bucket = Number(bucketStr)
      const qty = Number(value) || 0
      const existing = lineFor(bucket)
      if (existing) {
        if (existing.plannedQty !== qty) {
          update(existing.uid, { plannedQty: qty, demandQty: demandByBucket[bucket], version: existing.version + 1 })
          updated++
        }
      } else if (qty > 0) {
        create({
          uid: newUid('mps'),
          docNo: 'MPS/26-27/0001',
          productCode,
          productName: product.name,
          uom: product.baseUom,
          bucket,
          bucketStart: starts[bucket],
          demandQty: demandByBucket[bucket],
          plannedQty: qty,
          isFirm: bucket <= 1,
          status: 'APPROVED',
          remarks: '',
          createdBy: 'A. Lakshmi',
          createdAt: new Date().toISOString(),
          version: 1,
        } as MpsLine)
        created++
      }
    }
    setDraft({})
    toast.success('Schedule saved', `${created} week${created === 1 ? '' : 's'} added, ${updated} changed. MRP re-plans from it immediately.`)
  }

  /** Spreads the horizon's total demand evenly across the weeks the planner picks. */
  function levelLoad() {
    const weeks = Number(levelTarget) || 0
    if (weeks <= 0 || weeks > starts.length) {
      toast.error('Choose a number of weeks', `Enter between 1 and ${starts.length}.`)
      return
    }
    const per = Math.ceil(totalDemand / weeks / 50) * 50
    const next: Record<number, string> = {}
    for (let b = 0; b < starts.length; b++) next[b] = b < weeks ? String(per) : '0'
    setDraft(next)
    setLevelOpen(false)
    toast.success('Levelled', `${per.toLocaleString('en-IN')} a week across ${weeks} weeks. Review, then save.`)
  }

  function doExport(format: ExportFormat) {
    interface Row { week: string; start: string; demand: number; planned: number; projected: number; firm: string }
    const data: Row[] = starts.map((s, b) => ({
      week: `W${b + 1}`,
      start: s,
      demand: demandByBucket[b],
      planned: plannedIn(b),
      projected: Math.round(projection[b] ?? 0),
      firm: lineFor(b)?.isFirm ? 'Firm' : '',
    }))
    const columns: ExportColumn<Row>[] = [
      { header: 'Week', value: (r) => r.week },
      { header: 'Starting', value: (r) => r.start },
      { header: 'Demand', value: (r) => r.demand },
      { header: 'Planned', value: (r) => r.planned },
      { header: 'Projected stock', value: (r) => r.projected },
      { header: 'Firm', value: (r) => r.firm },
    ]
    const n = exportRows(format, `mps-${productCode}`, `Master production schedule — ${productCode}`, columns, data)
    toast.success('Export ready', `${n} rows written.`)
  }

  const negativeWeeks = projection.filter((p) => p < 0).length

  return (
    <div>
      <PageHeader
        title="Master production schedule"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'MPS' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Wand2 className="h-3.5 w-3.5" />} disabled={!productCode || totalDemand === 0} onClick={() => { setLevelTarget('8'); setLevelOpen(true) }}>
              Level the load
            </Button>
            <Button variant="outline" size="sm" disabled={!productCode} onClick={() => doExport('xlsx')}>
              Export
            </Button>
            <Button variant="primary" size="sm" icon={<Save className="h-4 w-4" />} disabled={!dirty} onClick={saveDraft}>
              Save schedule
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3.5 sm:grid-cols-4">
          <Select
            label="Product"
            containerClassName="sm:col-span-2"
            value={productCode}
            onChange={(e) => {
              setProductCode(e.target.value)
              setDraft({})
            }}
            options={[{ value: '', label: 'Select a product…' }, ...products.rows.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <div className="flex flex-col justify-end pb-1">
            <p className="text-2xs text-fg-subtle">Free stock today</p>
            <p className="text-sm font-semibold tabular text-fg">{item ? item.available.toLocaleString('en-IN') : '—'}</p>
          </div>
          <div className="flex flex-col justify-end pb-1">
            <p className="text-2xs text-fg-subtle">Safety stock</p>
            <p className="text-sm font-semibold tabular text-fg">{item ? item.safetyStock.toLocaleString('en-IN') : '—'}</p>
          </div>
        </CardBody>
      </Card>

      {!productCode ? (
        <Card>
          <EmptyState title="Choose a product" description="The schedule is maintained per finished product across the twelve-week horizon." />
        </Card>
      ) : (
        <>
          {dirty && (
            <Alert tone="warning" className="mb-4">
              Unsaved changes. MRP is still planning from the saved schedule until you press Save.
            </Alert>
          )}
          {negativeWeeks > 0 && (
            <Alert tone="danger" className="mb-4">
              Projected stock goes negative in {negativeWeeks} week{negativeWeeks === 1 ? '' : 's'} — the plan does not
              cover the demand in front of it. Raise the planned quantities, or move the demand out.
            </Alert>
          )}

          <Card>
            <CardHeader
              title={`${product?.name ?? productCode}`}
              description={`Demand ${totalDemand.toLocaleString('en-IN')} · planned ${totalPlanned.toLocaleString('en-IN')} · ${totalPlanned >= totalDemand ? 'covered' : `${(totalDemand - totalPlanned).toLocaleString('en-IN')} short over the horizon`}`}
            />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '11rem' }}>Row</th>
                      {starts.map((s, b) => (
                        <th key={s} className="text-right" style={{ minWidth: '5.5rem' }}>
                          <span className="block">W{b + 1}</span>
                          <span className="block text-[9px] font-normal normal-case text-fg-subtle">{formatDate(s).slice(0, 6)}</span>
                        </th>
                      ))}
                      <th className="text-right" style={{ width: '7rem' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-xs font-medium text-fg-muted">Demand</td>
                      {demandByBucket.map((v, b) => (
                        <td key={b} className="text-right tabular text-xs">{v ? v.toLocaleString('en-IN') : <span className="text-fg-subtle">—</span>}</td>
                      ))}
                      <td className="text-right tabular text-xs font-medium">{totalDemand.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                      <td className="text-xs font-medium text-fg">Planned production</td>
                      {starts.map((_, b) => {
                        const l = lineFor(b)
                        return (
                          <td key={b}>
                            <input
                              type="number"
                              min={0}
                              step={50}
                              aria-label={`Planned quantity for week ${b + 1}`}
                              value={draft[b] !== undefined ? draft[b] : String(l?.plannedQty ?? '')}
                              onChange={(e) => setBucket(b, e.target.value)}
                              className={cn(
                                'h-7 w-full rounded border bg-surface px-1.5 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none',
                                draft[b] !== undefined ? 'border-warning' : 'border-border',
                                l?.isFirm && 'bg-brand-500/5',
                              )}
                            />
                          </td>
                        )
                      })}
                      <td className="text-right tabular text-xs font-semibold">{totalPlanned.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                      <td className="text-xs font-medium text-fg-muted">Projected stock</td>
                      {projection.map((v, b) => (
                        <td key={b} className={cn('text-right tabular text-xs', v < 0 ? 'font-medium text-danger' : v < (item?.safetyStock ?? 0) ? 'text-warning' : 'text-fg-muted')}>
                          {Math.round(v).toLocaleString('en-IN')}
                        </td>
                      ))}
                      <td />
                    </tr>
                    <tr>
                      <td className="text-xs font-medium text-fg-muted">Status</td>
                      {starts.map((_, b) => {
                        const l = lineFor(b)
                        return (
                          <td key={b} className="text-right">
                            {l ? (
                              l.isFirm ? <span className="text-2xs font-medium text-brand-600">Firm</span> : <span className="text-2xs text-fg-subtle">Planned</span>
                            ) : (
                              <span className="text-2xs text-fg-subtle">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <div className="mt-4 grid gap-2 text-xs text-fg-muted sm:grid-cols-3">
            <p className="card p-3">
              <Layers className="mb-1.5 h-4 w-4 text-fg-subtle" />
              <span className="font-medium text-fg">The schedule drives MRP, not the demand.</span> Once a product has an
              approved MPS, its demand lines stop feeding MRP directly — otherwise the requirement would be counted twice.
            </p>
            <p className="card p-3">
              <Check className="mb-1.5 h-4 w-4 text-fg-subtle" />
              <span className="font-medium text-fg">Firm weeks are protected.</span> The first two weeks are marked firm;
              inside that window a change is a decision, not an adjustment.
            </p>
            <p className="card p-3">
              <Wand2 className="mb-1.5 h-4 w-4 text-fg-subtle" />
              <span className="font-medium text-fg">Levelling is a starting point.</span> It spreads the horizon's demand
              evenly and rounds to fifties; the planner then shapes it around holidays and shutdowns.
            </p>
          </div>

          {lines.length > 0 && (
            <div className="mt-4 flex items-center gap-2 text-2xs text-fg-subtle">
              <PlanStatusBadge status={lines[0].status} size="sm" />
              <span>
                {lines[0].docNo} · {lines.length} scheduled week{lines.length === 1 ? '' : 's'} · last saved by {lines[0].createdBy}
              </span>
            </div>
          )}
        </>
      )}

      <Modal
        open={levelOpen}
        onClose={() => setLevelOpen(false)}
        title="Level the load"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLevelOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={levelLoad}>
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            Spread the horizon's {totalDemand.toLocaleString('en-IN')} units of demand evenly across the first few weeks,
            rounded up to the nearest fifty.
          </p>
          <Input label="Weeks to spread across" type="number" min={1} max={starts.length} value={levelTarget} onChange={(e) => setLevelTarget(e.target.value)} />
          {Number(levelTarget) > 0 && (
            <p className="text-xs text-fg-muted">
              That is{' '}
              <span className="font-semibold text-fg">
                {(Math.ceil(totalDemand / Number(levelTarget) / 50) * 50).toLocaleString('en-IN')}
              </span>{' '}
              a week. Nothing is saved until you press Save schedule.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
