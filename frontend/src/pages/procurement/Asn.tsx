import { useMemo, useState } from 'react'
import { PackageCheck, Truck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { DelayChip, DetailBlock, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { useCollection } from '@/store/data'
import { asns as seedAsns } from '@/mock/procurement'
import type { Asn } from '@/types/procurement'

export function AsnPage() {
  const toast = useToast()
  const seed = useMemo(() => seedAsns, [])
  const { rows, update } = useCollection<Asn>('proc:asn', seed)
  const rowEdit = useRowEdit<Asn>({
    key: 'proc:asn',
    seed: seed,
    entity: 'Asn',
    titleOf: (r) => r.docNo,
  })

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<Asn | null>(null)

  const counts = {
    all: rows.length,
    transit: rows.filter((r) => r.status === 'NOTIFIED' || r.status === 'IN_TRANSIT').length,
    arrived: rows.filter((r) => r.status === 'ARRIVED').length,
    received: rows.filter((r) => r.status === 'RECEIVED').length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'transit') return r.status === 'NOTIFIED' || r.status === 'IN_TRANSIT'
    if (tab === 'arrived') return r.status === 'ARRIVED'
    if (tab === 'received') return r.status === 'RECEIVED'
    return true
  })

  const columns: Column<Asn>[] = [
    { key: 'docNo', header: 'ASN', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'poNo', header: 'Against PO', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-2xs">{r.poNo}</span> },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'dispatchedAt', header: 'Dispatched', sortable: true, width: '7rem', accessor: (r) => r.dispatchedAt, render: (r) => formatDate(r.dispatchedAt) },
    {
      key: 'expectedAt',
      header: 'Expected',
      sortable: true,
      width: '9rem',
      accessor: (r) => r.expectedAt,
      render: (r) => (
        <div>
          <span className="text-xs">{formatDate(r.expectedAt)}</span>
          {(r.status === 'IN_TRANSIT' || r.status === 'NOTIFIED') && new Date(r.expectedAt).getTime() < Date.now() && (
            <span className="ml-1.5">
              <DelayChip days={Math.ceil((Date.now() - new Date(r.expectedAt).getTime()) / 86_400_000)} />
            </span>
          )}
        </div>
      ),
    },
    { key: 'invoiceNo', header: 'Invoice', sortable: true, render: (r) => <span className="font-mono text-2xs">{r.invoiceNo}</span> },
    { key: 'invoiceValue', header: 'Value', align: 'right', sortable: true, accessor: (r) => r.invoiceValue, render: (r) => formatCurrency(r.invoiceValue) },
    { key: 'vehicleNo', header: 'Vehicle', width: '8rem', render: (r) => <span className="font-mono text-2xs">{r.vehicleNo}</span> },
    { key: 'ewayBillNo', header: 'E-way bill', defaultHidden: true, render: (r) => <span className="font-mono text-2xs">{r.ewayBillNo ?? '—'}</span> },
    { key: 'packages', header: 'Pkgs', align: 'right', width: '4.5rem' },
    { key: 'grossWeightKg', header: 'Weight', align: 'right', defaultHidden: true, render: (r) => `${r.grossWeightKg.toLocaleString('en-IN')} kg` },
    { key: 'grnNo', header: 'GRN', width: '11rem', render: (r) => (r.grnNo ? <span className="font-mono text-2xs text-success">{r.grnNo}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'advance-shipment-notices', 'Advance shipment notices', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Advance shipment notices"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'ASN' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'transit', label: 'In transit', count: counts.transit },
              { id: 'arrived', label: 'At gate', count: counts.arrived },
              { id: 'received', label: 'Received', count: counts.received },
            ]}
          />
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search ASN, PO, invoice, vehicle…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No shipment notices"
        emptyDescription="Suppliers raise these on the portal when they dispatch against an order."
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem
              label="Record gate entry"
              disabled={r.status !== 'IN_TRANSIT' && r.status !== 'NOTIFIED'}
              onClick={() => {
                update(r.uid, { status: 'ARRIVED', gateEntryNo: `GE/26-27/${Math.floor(1190 + Math.random() * 9)}` })
                toast.success('Gate entry recorded', `${r.docNo} marked arrived. Stores can now raise the GRN.`)
              }}
            />
            <MenuItem
              label="Create GRN"
              disabled={r.status !== 'ARRIVED'}
              onClick={() => toast.success('GRN drafted', `Receipt pre-filled from ${r.docNo} — challan quantities carried across.`)}
            />
            <MenuItem
              label="Cancel notice"
              danger
              separatorBefore
              disabled={r.status === 'RECEIVED' || r.status === 'CANCELLED'}
              onClick={() => {
                update(r.uid, { status: 'CANCELLED' })
                toast.success('Cancelled', `${r.docNo} cancelled; the supplier is notified on the portal.`)
              }}
            />
          </>
        )}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.supplierName} · against ${detail.poNo}` : undefined}
        width="max-w-2xl"
        footer={
          <div className="flex w-full justify-end">
            <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
          </div>
        }
      >
        {detail && (
          <div className="space-y-5">
            <ProcStatusBadge status={detail.status} />

            <DataGrid
              columns={2}
              items={[
                { label: 'Dispatched', value: formatDateTime(detail.dispatchedAt) },
                { label: 'Expected', value: formatDate(detail.expectedAt) },
                { label: 'Transporter', value: detail.transporter },
                { label: 'LR number', value: detail.lrNo, mono: true },
                { label: 'Vehicle', value: detail.vehicleNo, mono: true },
                { label: 'E-way bill', value: detail.ewayBillNo ?? '—', mono: true },
                { label: 'Invoice', value: detail.invoiceNo, mono: true },
                { label: 'Invoice value', value: formatCurrency(detail.invoiceValue) },
                { label: 'Packages', value: detail.packages },
                { label: 'Gross weight', value: `${detail.grossWeightKg.toLocaleString('en-IN')} kg` },
                { label: 'Gate entry', value: detail.gateEntryNo ?? 'Not yet at gate', mono: true },
                { label: 'GRN', value: detail.grnNo ?? 'Not yet received', mono: true },
              ]}
            />

            <DetailBlock title={`Shipped lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">PO qty</th>
                      <th className="text-right">Shipped</th>
                      <th>Batch</th>
                      <th>Heat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular">{l.poQty.toLocaleString('en-IN')}</td>
                        <td className="text-right tabular font-medium">{l.shippedQty.toLocaleString('en-IN')} {l.uom}</td>
                        <td className="font-mono text-2xs">{l.batchNo ?? '—'}</td>
                        <td className="font-mono text-2xs">{l.heatNo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <p className="text-2xs leading-relaxed text-fg-subtle">
              Batch and heat numbers declared here carry through to the goods receipt, so traceability from a finished
              bottle back to the steel heat survives without re-keying.
            </p>
          </div>
        )}
      </Drawer>

      {rowEdit.dialogs}
    </div>
  )
}
