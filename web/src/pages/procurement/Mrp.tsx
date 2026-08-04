import { useMemo, useState } from 'react'
import { AlertTriangle, Boxes, CheckCircle2, Play, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Switch } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { useCollection } from '@/store/data'
import { mrpRuns, mrpSuggestions as seedSuggestions } from '@/mock/procurement'
import type { MrpSuggestion } from '@/types/procurement'
import { cn } from '@/lib/cn'

const ACTION_LABEL: Record<string, { label: string; tone: 'brand' | 'warning' | 'danger' | 'progress' }> = {
  NEW_PO: { label: 'New order', tone: 'brand' },
  RESCHEDULE_IN: { label: 'Pull in', tone: 'warning' },
  RESCHEDULE_OUT: { label: 'Push out', tone: 'progress' },
  CANCEL: { label: 'Cancel', tone: 'danger' },
  INCREASE_QTY: { label: 'Increase qty', tone: 'warning' },
}

export function MrpPage() {
  const toast = useToast()
  const seed = useMemo(() => seedSuggestions, [])
  const { rows, update } = useCollection<MrpSuggestion>('proc:mrp', seed)
  const rowEdit = useRowEdit<MrpSuggestion>({
    key: 'proc:mrp',
    seed: seed,
    entity: 'Mrp suggestion',
    titleOf: (r) => r.itemCode,
  })

  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [runOpen, setRunOpen] = useState(false)
  const [horizon, setHorizon] = useState('90')
  const [includeSafety, setIncludeSafety] = useState(true)
  const [firmHorizon, setFirmHorizon] = useState('14')
  const [running, setRunning] = useState(false)

  const counts = {
    all: rows.length,
    accepted: rows.filter((r) => r.accepted).length,
    exceptions: rows.filter((r) => r.exceptional).length,
    newPo: rows.filter((r) => r.action === 'NEW_PO').length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'accepted') return r.accepted
    if (tab === 'exceptions') return r.exceptional
    if (tab === 'newPo') return r.action === 'NEW_PO'
    return true
  })

  const columns: Column<MrpSuggestion>[] = [
    {
      key: 'itemCode',
      header: 'Item',
      sortable: true,
      render: (r) => (
        <div>
          <p className="text-xs font-medium text-fg">{r.itemName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{r.itemCode}</p>
        </div>
      ),
    },
    { key: 'onHand', header: 'On hand', align: 'right', sortable: true, render: (r) => r.onHand.toLocaleString('en-IN') },
    { key: 'onOrder', header: 'On order', align: 'right', sortable: true, render: (r) => r.onOrder.toLocaleString('en-IN') },
    { key: 'reserved', header: 'Reserved', align: 'right', defaultHidden: true, render: (r) => r.reserved.toLocaleString('en-IN') },
    { key: 'safetyStock', header: 'Safety', align: 'right', defaultHidden: true, render: (r) => r.safetyStock.toLocaleString('en-IN') },
    { key: 'grossRequirement', header: 'Gross req.', align: 'right', sortable: true, render: (r) => r.grossRequirement.toLocaleString('en-IN') },
    { key: 'netRequirement', header: 'Net req.', align: 'right', sortable: true, render: (r) => <span className={cn(r.netRequirement > 0 && 'font-medium text-danger')}>{r.netRequirement.toLocaleString('en-IN')}</span> },
    { key: 'suggestedQty', header: 'Suggested', align: 'right', sortable: true, render: (r) => <span className="font-medium text-fg">{r.suggestedQty.toLocaleString('en-IN')} {r.uom}</span> },
    { key: 'suggestBy', header: 'Order by', sortable: true, width: '7rem', accessor: (r) => r.suggestBy, render: (r) => formatDate(r.suggestBy) },
    { key: 'leadTimeDays', header: 'LT', align: 'right', width: '4rem', render: (r) => `${r.leadTimeDays}d` },
    { key: 'preferredSupplier', header: 'Supplier', sortable: true },
    { key: 'lastRate', header: 'Last rate', align: 'right', accessor: (r) => r.lastRate, render: (r) => formatCurrency(r.lastRate) },
    {
      key: 'action',
      header: 'Suggestion',
      width: '7rem',
      render: (r) => {
        const a = ACTION_LABEL[r.action]
        return (
          <Badge tone={a.tone} size="sm" dot={false}>
            {a.label}
          </Badge>
        )
      },
    },
    {
      key: 'accepted',
      header: 'Accepted',
      align: 'center',
      width: '5.5rem',
      accessor: (r) => (r.accepted ? 'Yes' : 'No'),
      render: (r) => (r.accepted ? <CheckCircle2 className="mx-auto h-4 w-4 text-success" /> : <span className="text-2xs text-fg-subtle">—</span>),
    },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'mrp-suggestions', 'MRP suggestions', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function runMrp() {
    setRunning(true)
    setTimeout(() => {
      setRunning(false)
      setRunOpen(false)
      toast.success('MRP run queued', `Horizon ${horizon} days · firm window ${firmHorizon} days. Suggestions refresh when the job completes.`)
    }, 900)
  }

  function acceptSelected() {
    selected.forEach((uid) => update(uid, { accepted: true }))
    toast.success(`${selected.length} accepted`, 'Accepted suggestions are grouped by supplier into requisitions.')
    setSelected([])
  }

  function convert() {
    const accepted = rows.filter((r) => r.accepted && r.suggestedQty > 0)
    if (!accepted.length) {
      toast.warning('Nothing to convert', 'Accept at least one suggestion with a positive quantity first.')
      return
    }
    const bySupplier = new Set(accepted.map((r) => r.preferredSupplier))
    toast.success(
      `${bySupplier.size} requisitions created`,
      `${accepted.length} accepted lines grouped by preferred supplier and required-by date.`,
    )
  }

  const lastRun = mrpRuns[0]

  return (
    <div>
      <PageHeader
        title="Material requirements planning"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'MRP' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Repeat className="h-4 w-4" />} onClick={convert}>
              Convert accepted to requisitions
            </Button>
            <Button variant="primary" size="sm" icon={<Play className="h-4 w-4" />} onClick={() => setRunOpen(true)}>
              Run MRP
            </Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All suggestions', count: counts.all },
              { id: 'newPo', label: 'New orders', count: counts.newPo },
              { id: 'exceptions', label: 'Exceptions', count: counts.exceptions },
              { id: 'accepted', label: 'Accepted', count: counts.accepted },
            ]}
          />
        }
      />

      {counts.exceptions > 0 && (
        <Alert tone="warning" className="mb-4" title={`${counts.exceptions} exception messages`}>
          MRP cannot resolve these by itself — a shortage that no lead time can cover, an open order that arrives too
          late, or coverage that already exceeds the requirement. Each needs a planner decision before conversion.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        searchPlaceholder="Search item, supplier…"
        onExport={doExport}
        bulkActions={
          <>
            <Button variant="success" size="xs" onClick={acceptSelected}>
              Accept
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                selected.forEach((uid) => update(uid, { accepted: false }))
                toast.info(`${selected.length} rejected`, 'They will reappear on the next run unless the demand changes.')
                setSelected([])
              }}
            >
              Reject
            </Button>
          </>
        }
        rowClassName={(r) => (r.exceptional ? 'bg-warning/5' : undefined)}
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label={r.accepted ? 'Un-accept' : 'Accept suggestion'} onClick={() => update(r.uid, { accepted: !r.accepted })} />
            <MenuItem
              label="Create requisition now"
              disabled={r.suggestedQty <= 0}
              onClick={() => toast.success('Requisition drafted', `${r.suggestedQty.toLocaleString('en-IN')} ${r.uom} of ${r.itemCode} for ${r.preferredSupplier}.`)}
            />
            <MenuItem label="View pegging" separatorBefore onClick={() => toast.info('Pegging', 'Demand traceback opens in the planning module.')} />
          </>
        )}
      />

      {/* Exception detail ---------------------------------------------------- */}
      {rows.some((r) => r.exceptional) && (
        <Card className="mt-4">
          <CardHeader title="Exception messages" description="Why MRP could not resolve these on its own" />
          <CardBody className="space-y-3">
            {rows
              .filter((r) => r.exceptional)
              .map((r) => (
                <div key={r.uid} className="flex items-start gap-2.5 border-b border-border pb-3 last:border-0 last:pb-0">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-fg">
                      {r.itemName} <span className="font-mono text-2xs font-normal text-fg-subtle">{r.itemCode}</span>
                    </p>
                    <p className="mt-0.5 text-2xs leading-relaxed text-fg-muted">{r.exceptionNote}</p>
                  </div>
                  <Badge tone={ACTION_LABEL[r.action].tone} size="sm" dot={false}>
                    {ACTION_LABEL[r.action].label}
                  </Badge>
                </div>
              ))}
          </CardBody>
        </Card>
      )}

      {/* Run history --------------------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader title="Run history" />
        <CardBody className="p-0">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>When</th>
                <th>By</th>
                <th className="text-right">Horizon</th>
                <th className="text-right">Items</th>
                <th className="text-right">Suggestions</th>
                <th className="text-right">Exceptions</th>
                <th className="text-right">Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mrpRuns.map((r) => (
                <tr key={r.uid}>
                  <td className="font-mono text-2xs">{r.runNo}</td>
                  <td className="text-xs">{formatDateTime(r.runAt)}</td>
                  <td className="text-xs text-fg-muted">{r.runBy}</td>
                  <td className="text-right tabular">{r.horizonDays}d</td>
                  <td className="text-right tabular">{r.itemsPlanned}</td>
                  <td className="text-right tabular">{r.suggestions}</td>
                  <td className="text-right tabular">{r.exceptions}</td>
                  <td className="text-right tabular">{r.durationSec}s</td>
                  <td>
                    <ProcStatusBadge status={r.status} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Modal
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run MRP"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRunOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={running} onClick={runMrp}>
              Run now
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select
            label="Planning horizon"
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            options={[
              { value: '30', label: '30 days' },
              { value: '45', label: '45 days' },
              { value: '90', label: '90 days' },
              { value: '180', label: '180 days' },
            ]}
          />
          <Input
            label="Firm window (days)"
            type="number"
            value={firmHorizon}
            onChange={(e) => setFirmHorizon(e.target.value)}
            hint="Inside this window MRP will not suggest changes to existing orders."
          />
          <Switch checked={includeSafety} onChange={setIncludeSafety} label="Include safety stock in net requirement" />
          <Alert tone="info">
            The run is queued as a background job. Suggestions are replaced wholesale, so any that you have accepted
            but not yet converted are recalculated.
          </Alert>
        </div>
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
