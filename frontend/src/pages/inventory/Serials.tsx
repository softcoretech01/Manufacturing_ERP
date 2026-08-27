import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { SearchInput } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { InvStatusBadge, ItemCell } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { serials as seedSerials } from '@/mock/inventory'
import type { SerialUnit } from '@/types/inventory'

const STATE_HELP: Record<SerialUnit['status'], string> = {
  IN_STOCK: 'Made and put away, not promised to anyone yet.',
  ALLOCATED: 'Reserved against a specific order — cannot be picked for anything else.',
  DISPATCHED: 'Left the plant on an invoice; warranty has started.',
  SOLD: 'Invoiced and settled.',
  RETURNED: 'Come back from a customer; sitting in quarantine for inspection.',
  SCRAPPED: 'Destroyed or written off — no longer stock.',
  IN_SERVICE: 'With a customer, under warranty or in a service claim.',
}

/** Serial numbers — one row per finished bottle, used for warranty and recall. */
export function SerialsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const seed = useMemo(() => seedSerials, [])
  const { rows: serials } = useCollection<SerialUnit>('inv:serial', seed)
  const rowEdit = useRowEdit<SerialUnit>({
    key: 'inv:serial',
    seed: seed,
    entity: 'Serial',
    titleOf: (r) => r.serialNo,
  })

  const [scan, setScan] = useState('')
  const [detail, setDetail] = useState<SerialUnit | null>(null)

  const counts = serials.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {})

  const columns: Column<SerialUnit>[] = [
    { key: 'serialNo', header: 'Serial', sortable: true, width: '14rem', render: (s) => <span className="font-mono text-xs font-medium text-brand-600">{s.serialNo}</span> },
    { key: 'itemCode', header: 'Item', sortable: true, render: (s) => <ItemCell code={s.itemCode} name={s.itemName} /> },
    { key: 'batchNo', header: 'Batch', width: '9rem', render: (s) => <span className="font-mono text-2xs">{s.batchNo}</span> },
    { key: 'productionOrderNo', header: 'Made on', width: '11rem', render: (s) => (
      <div>
        <p className="font-mono text-2xs">{s.productionOrderNo}</p>
        <p className="text-2xs text-fg-subtle">{formatDate(s.manufacturedOn)}</p>
      </div>
    ) },
    { key: 'location', header: 'Where it is', accessor: (s) => s.warehouseCode ?? s.customer ?? '', render: (s) => (
      s.warehouseCode
        ? <span className="font-mono text-2xs">{s.warehouseCode}{s.bin ? ` · ${s.bin}` : ''}</span>
        : <span className="text-2xs text-fg-muted">{s.customer ?? 'Out of stock'}</span>
    ) },
    { key: 'cartonNo', header: 'Carton', width: '11rem', defaultHidden: true, render: (s) => <span className="font-mono text-2xs">{s.cartonNo ?? '—'}</span> },
    { key: 'customer', header: 'Customer', sortable: true, render: (s) => s.customer ?? '—' },
    { key: 'dispatchedOn', header: 'Dispatched', width: '8rem', sortable: true, accessor: (s) => s.dispatchedOn ?? '', render: (s) => (s.dispatchedOn ? formatDate(s.dispatchedOn) : '—') },
    { key: 'warrantyTo', header: 'Warranty to', width: '9rem', accessor: (s) => s.warrantyTo ?? '', render: (s) => {
      if (!s.warrantyTo) return <span className="text-2xs text-fg-subtle">not started</span>
      const live = new Date(s.warrantyTo).getTime() > Date.now()
      return <span className={cn('text-2xs', live ? 'text-success' : 'text-fg-muted')}>{formatDate(s.warrantyTo)}{live ? ' · live' : ' · expired'}</span>
    } },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (s) => <InvStatusBadge status={s.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'serial-register', 'Serial register & warranty', columnsFromTable(columns), serials)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function lookup() {
    const key = scan.trim().toLowerCase()
    if (!key) return
    const hit = serials.find((s) => s.serialNo.toLowerCase() === key || s.cartonNo?.toLowerCase() === key)
    if (!hit) {
      toast.error('Not found', `No unit matches “${scan}”. Try a full serial number or a carton number.`)
      return
    }
    setDetail(hit)
  }

  return (
    <div>
      <PageHeader
        title="Serial numbers"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Serials' }]}
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3 py-3">
          <SearchInput
            containerClassName="w-full sm:w-80"
            placeholder="Scan or type a serial / carton number…"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
          />
          <Button variant="primary" size="sm" icon={<ScanLine className="h-4 w-4" />} onClick={lookup}>
            Warranty lookup
          </Button>
          <p className="text-2xs text-fg-muted">
            One scan tells you what it is, which batch and heat it came from, who bought it and whether it is still under warranty.
          </p>
        </CardBody>
      </Card>

      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {(Object.keys(STATE_HELP) as SerialUnit['status'][]).map((s) => (
          <div key={s} className="card p-2.5">
            <InvStatusBadge status={s} size="sm" />
            <p className="mt-1.5 text-lg font-semibold tabular text-fg">{counts[s] ?? 0}</p>
          </div>
        ))}
      </div>

      <DataTable
        rows={serials}
        columns={columns}
        rowKey={(s) => s.uid}
        searchPlaceholder="Search serial, item, batch, carton or customer…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No serial-tracked units"
        rowActions={(s) => (
          <>
            {rowEdit.actions(s)}
            <MenuItem label="Open unit history" onClick={() => setDetail(s)} />
            <MenuItem label="Trace back to the steel heat" onClick={() => navigate('/inventory/traceability')} />
            <MenuItem
              label="Warranty status"
              onClick={() =>
                toast.success(
                  'Warranty',
                  s.warrantyTo
                    ? `${s.serialNo} is covered until ${formatDate(s.warrantyTo)}${new Date(s.warrantyTo).getTime() > Date.now() ? ' — still live.' : ' — expired.'}`
                    : 'Warranty starts on dispatch; this unit has not been dispatched.',
                )
              }
            />
          </>
        )}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.serialNo}
        description={detail?.itemName}
        width="max-w-2xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/inventory/traceability')}>Full trace</Button>
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InvStatusBadge status={detail.status} />
              {detail.warrantyTo && new Date(detail.warrantyTo).getTime() > Date.now() && <Badge tone="success" size="sm">Under warranty</Badge>}
            </div>

            <p className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">{STATE_HELP[detail.status]}</p>

            <DataGrid
              columns={2}
              items={[
                { label: 'Item', value: `${detail.itemCode} — ${detail.itemName}` },
                { label: 'Batch', value: detail.batchNo, mono: true },
                { label: 'Production order', value: detail.productionOrderNo, mono: true },
                { label: 'Manufactured', value: formatDate(detail.manufacturedOn) },
                { label: 'Warehouse · bin', value: detail.warehouseCode ? `${detail.warehouseCode}${detail.bin ? ` · ${detail.bin}` : ''}` : 'Not in stock' },
                { label: 'Carton', value: detail.cartonNo ?? '—', mono: true },
                { label: 'Sales document', value: detail.salesDocNo ?? '—', mono: true },
                { label: 'Customer', value: detail.customer ?? '—' },
                { label: 'Dispatched', value: detail.dispatchedOn ? formatDate(detail.dispatchedOn) : 'Not dispatched' },
                { label: 'Warranty to', value: detail.warrantyTo ? formatDate(detail.warrantyTo) : 'Starts at dispatch' },
              ]}
            />

            <p className="text-2xs leading-relaxed text-fg-subtle">
              A serial exists in exactly one place and one state at a time. That is what makes a warranty claim answerable and a
              recall precise instead of plant-wide.
            </p>
          </div>
        )}
      </Drawer>

      {rowEdit.dialogs}
    </div>
  )
}
