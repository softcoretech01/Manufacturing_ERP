import { useMemo, useState } from 'react'
import { Anchor, FileWarning, Globe2, Ship } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { DetailBlock, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { useCollection } from '@/store/data'
import { importShipments as seedShipments } from '@/mock/procurement'
import type { ImportShipment } from '@/types/procurement'
import { cn } from '@/lib/cn'

const STAGES: ImportShipment['status'][] = ['PO_PLACED', 'SHIPPED', 'IN_TRANSIT', 'PORT_ARRIVED', 'CUSTOMS', 'CLEARED', 'RECEIVED']

export function ImportsPage() {
  const toast = useToast()
  const seed = useMemo(() => seedShipments, [])
  const { rows, update } = useCollection<ImportShipment>('proc:imp', seed)
  const rowEdit = useRowEdit<ImportShipment>({
    key: 'proc:imp',
    seed: seed,
    entity: 'Import shipment',
    titleOf: (r) => r.docNo,
  })

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<ImportShipment | null>(null)

  const counts = {
    all: rows.length,
    transit: rows.filter((r) => ['SHIPPED', 'IN_TRANSIT'].includes(r.status)).length,
    customs: rows.filter((r) => ['PORT_ARRIVED', 'CUSTOMS'].includes(r.status)).length,
    received: rows.filter((r) => r.status === 'RECEIVED').length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'transit') return ['SHIPPED', 'IN_TRANSIT'].includes(r.status)
    if (tab === 'customs') return ['PORT_ARRIVED', 'CUSTOMS'].includes(r.status)
    if (tab === 'received') return r.status === 'RECEIVED'
    return true
  })

  const columns: Column<ImportShipment>[] = [
    { key: 'docNo', header: 'Shipment', sortable: true, width: '10rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'poNo', header: 'PO', width: '11rem', render: (r) => <span className="font-mono text-2xs">{r.poNo}</span> },
    { key: 'supplierName', header: 'Supplier', sortable: true, render: (r) => (
      <div>
        <p className="text-xs font-medium text-fg">{r.supplierName}</p>
        <p className="text-2xs text-fg-subtle">{r.country} · {r.incoterm}</p>
      </div>
    ) },
    { key: 'fobValue', header: 'FOB', align: 'right', sortable: true, accessor: (r) => r.fobValue, render: (r) => `${r.currency} ${r.fobValue.toLocaleString('en-IN')}` },
    { key: 'landedValue', header: 'Landed', align: 'right', sortable: true, accessor: (r) => r.landedValue, render: (r) => formatCurrency(r.landedValue) },
    {
      key: 'uplift',
      header: 'Uplift',
      align: 'right',
      width: '6rem',
      accessor: (r) => ((r.landedValue - r.assessableValue) / r.assessableValue) * 100,
      render: (r) => <span className="text-warning tabular">+{(((r.landedValue - r.assessableValue) / r.assessableValue) * 100).toFixed(1)}%</span>,
    },
    { key: 'vesselOrFlight', header: 'Vessel / flight', defaultHidden: true },
    { key: 'portOfDischarge', header: 'Discharge', width: '10rem', defaultHidden: true },
    { key: 'eta', header: 'ETA', sortable: true, width: '7rem', accessor: (r) => r.eta, render: (r) => formatDate(r.eta) },
    { key: 'beNo', header: 'Bill of entry', width: '9rem', render: (r) => (r.beNo ? <span className="font-mono text-2xs">{r.beNo}</span> : <span className="text-2xs text-fg-subtle">Not filed</span>) },
    {
      key: 'documents',
      header: 'Docs',
      width: '6rem',
      accessor: (r) => `${r.documents.filter((d) => d.received).length}/${r.documents.length}`,
      render: (r) => {
        const got = r.documents.filter((d) => d.received).length
        return (
          <span className={cn('text-2xs tabular', got === r.documents.length ? 'text-success' : 'text-warning')}>
            {got}/{r.documents.length}
          </span>
        )
      },
    },
    { key: 'demurrageCost', header: 'Demurrage', align: 'right', accessor: (r) => r.demurrageCost, render: (r) => (r.demurrageCost ? <span className="text-danger">{formatCurrency(r.demurrageCost)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'import-shipments', 'Import shipments', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const missingDocs = rows.filter((r) => r.status !== 'RECEIVED' && r.documents.some((d) => !d.received))

  return (
    <div>
      <PageHeader
        title="Import procurement"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Imports' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'transit', label: 'In transit', count: counts.transit },
              { id: 'customs', label: 'At port / customs', count: counts.customs },
              { id: 'received', label: 'Received', count: counts.received },
            ]}
          />
        }
      />

      {missingDocs.length > 0 && (
        <Card className="mb-4 border-warning/40">
          <CardHeader
            title={`${missingDocs.length} shipments with incomplete documentation`}
            description="A missing certificate of origin or insurance certificate stalls clearance and starts the demurrage clock"
            icon={<FileWarning className="h-4 w-4 text-warning" />}
          />
          <CardBody className="space-y-2">
            {missingDocs.map((s) => (
              <div key={s.uid} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-fg">
                    {s.docNo} · {s.supplierName}
                  </p>
                  <p className="truncate text-2xs text-fg-muted">
                    Missing: {s.documents.filter((d) => !d.received).map((d) => d.name).join(', ')}
                  </p>
                </div>
                <Badge tone="warning" size="sm">
                  ETA {formatDate(s.eta)}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search shipment, PO, supplier, BL…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No import shipments"
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem
              label="Advance stage"
              disabled={r.status === 'RECEIVED'}
              onClick={() => {
                const next = STAGES[Math.min(STAGES.indexOf(r.status) + 1, STAGES.length - 1)]
                update(r.uid, { status: next })
                toast.success('Stage updated', `${r.docNo} moved to ${next.replace('_', ' ').toLowerCase()}.`)
              }}
            />
            <MenuItem
              label="File bill of entry"
              separatorBefore
              disabled={!!r.beNo || r.status === 'RECEIVED'}
              onClick={() => {
                update(r.uid, { beNo: `BE/261${Math.floor(1000 + Math.random() * 8999)}`, beDate: new Date().toISOString().slice(0, 10), status: 'CUSTOMS' })
                toast.success('Bill of entry filed', 'Duty assessment and IGST are computed from the assessable value.')
              }}
            />
            <MenuItem label="Create GRN on clearance" disabled={r.status !== 'CLEARED'} onClick={() => toast.success('GRN drafted', `Receipt pre-filled from ${r.docNo} at landed cost.`)} />
          </>
        )}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.supplierName} · ${detail.country}` : undefined}
        width="max-w-3xl"
        footer={
          <div className="flex w-full justify-end">
            <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
          </div>
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={detail.status} />
              <Badge tone="neutral" size="sm" dot={false}>{detail.incoterm}</Badge>
              <span className="text-2xs text-fg-muted">{detail.currency} @ {detail.exchangeRate}</span>
            </div>

            {/* Stage tracker */}
            <div className="flex items-center gap-1 overflow-x-auto rounded border border-border p-3">
              {STAGES.map((s, i) => {
                const idx = STAGES.indexOf(detail.status)
                const done = i <= idx
                return (
                  <div key={s} className="flex min-w-0 flex-1 items-center gap-1">
                    <div className="min-w-0 flex-1 text-center">
                      <div className={cn('mx-auto h-2 w-2 rounded-full', done ? 'bg-success' : 'bg-border-strong')} />
                      <p className={cn('mt-1 truncate text-[9px]', done ? 'font-medium text-fg' : 'text-fg-subtle')}>
                        {s.replace('_', ' ').toLowerCase()}
                      </p>
                    </div>
                    {i < STAGES.length - 1 && <div className={cn('h-px flex-1', i < idx ? 'bg-success' : 'bg-border')} />}
                  </div>
                )
              })}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Against PO', value: detail.poNo, mono: true },
                { label: 'Incoterm', value: detail.incoterm },
                { label: 'BL / AWB', value: detail.blNo, mono: true },
                { label: 'BL date', value: formatDate(detail.blDate) },
                { label: 'Vessel / flight', value: detail.vesselOrFlight },
                { label: 'Containers', value: detail.containers },
                { label: 'Port of loading', value: detail.portOfLoading },
                { label: 'Port of discharge', value: detail.portOfDischarge },
                { label: 'ETD', value: formatDate(detail.etd) },
                { label: 'ETA', value: formatDate(detail.eta) },
                { label: 'CHA', value: detail.chaAgent },
                { label: 'Bill of entry', value: detail.beNo ? `${detail.beNo} · ${formatDate(detail.beDate!)}` : 'Not filed' },
              ]}
            />

            <DetailBlock title="Landed cost build-up">
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">% of FOB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: `FOB value (${detail.currency} ${detail.fobValue.toLocaleString('en-IN')})`, v: detail.fobValue * detail.exchangeRate },
                      { label: 'Freight', v: detail.freightCharges },
                      { label: 'Insurance', v: detail.insuranceCharges },
                      { label: 'Assessable value', v: detail.assessableValue, strong: true },
                      { label: 'Basic customs duty', v: detail.bcdAmount },
                      { label: 'Social welfare surcharge', v: detail.socialWelfareSurcharge },
                      { label: 'IGST (creditable)', v: detail.igstAmount },
                      { label: 'Clearing & handling', v: detail.clearingCharges },
                      { label: 'Demurrage', v: detail.demurrageCost },
                    ].map((r) => (
                      <tr key={r.label}>
                        <td className={cn('text-xs', r.strong ? 'font-semibold text-fg' : 'text-fg-muted')}>{r.label}</td>
                        <td className={cn('text-right tabular', r.strong && 'font-semibold')}>{formatCurrency(r.v)}</td>
                        <td className="text-right tabular text-2xs text-fg-subtle">
                          {((r.v / (detail.fobValue * detail.exchangeRate)) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className="text-xs font-semibold text-fg">Landed value</td>
                      <td className="text-right tabular font-semibold text-fg">{formatCurrency(detail.landedValue)}</td>
                      <td className="text-right tabular text-2xs text-warning">
                        +{(((detail.landedValue - detail.fobValue * detail.exchangeRate) / (detail.fobValue * detail.exchangeRate)) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-fg-subtle">
                IGST is creditable and therefore excluded from the inventory valuation. Basic customs duty, surcharge,
                freight, insurance and clearing are all capitalised into the item cost.
              </p>
            </DetailBlock>

            <DetailBlock title="Documents">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {detail.documents.map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5">
                    <span className="truncate text-xs text-fg">{d.name}</span>
                    <Badge tone={d.received ? 'success' : 'warning'} size="sm">
                      {d.received ? 'Received' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            </DetailBlock>

            {detail.demurrageDays > 0 && (
              <p className="rounded border border-danger/30 bg-danger/5 p-2.5 text-xs text-danger">
                {detail.demurrageDays} chargeable days at the port cost {formatCurrency(detail.demurrageCost)}. Root
                cause is recorded against the CHA and the document that was late.
              </p>
            )}
          </div>
        )}
      </Drawer>

      {rowEdit.dialogs}
    </div>
  )
}
