import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useLiveCrud } from '@/components/crud/CrudKit'
import { labelApi } from '@/api/labelApi'
import { useEffect } from 'react'
import { DispatchStatusBadge } from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { LabelFormat, LabelKind } from '@/types/dispatch'

const KIND_LABEL: Record<LabelKind, string> = {
  PRODUCT: 'Product',
  CARTON: 'Carton',
  PALLET: 'Pallet',
  SHIPMENT: 'Shipment',
}

const TABS = [
  { id: 'ALL', label: 'All formats' },
  { id: 'PRODUCT', label: 'Product' },
  { id: 'CARTON', label: 'Carton' },
  { id: 'PALLET', label: 'Pallet' },
  { id: 'SHIPMENT', label: 'Shipment' },
]

/**
 * Label formats — four levels of label, three standards. A GS1 label is
 * machine-readable at any dock in the world; a customer format is whatever that
 * customer's system will accept, and getting it wrong means the consignment is
 * rejected at their gate rather than at ours.
 */
export function PackLabelsPage() {
  const toast = useToast()
  const [formats, setFormats] = useState<LabelFormat[]>([])

  const fetchLabels = async () => {
    try {
      const data = await labelApi.getAll()
      setFormats(data)
    } catch (err) {
      toast.error('Failed to load labels', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    fetchLabels()
  }, [])

  const crud = useLiveCrud<LabelFormat>({
    entity: 'Label format',
    titleOf: (l) => `${l.code} — ${l.name}`,
    fields: [
      { name: 'code', label: 'Format code', required: true, upper: true },
      { name: 'name', label: 'Format name', required: true },
      {
        name: 'kind',
        label: 'Label level',
        type: 'select',
        required: true,
        options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        name: 'standard',
        label: 'Standard',
        type: 'select',
        required: true,
        options: [
          { value: 'GS1', label: 'GS1 — global standard' },
          { value: 'CUSTOMER', label: 'Customer-specific' },
          { value: 'INTERNAL', label: 'Internal' },
        ],
      },
      { name: 'customer', label: 'Customer', hint: 'Required for a customer-specific format', showIf: (v) => v.standard === 'CUSTOMER' },
      { name: 'widthMm', label: 'Width (mm)', type: 'number', required: true },
      { name: 'heightMm', label: 'Height (mm)', type: 'number', required: true },
      { name: 'languages', label: 'Languages', hint: 'Comma separated — English, German, Tamil' },
      { name: 'fields', label: 'Fields printed, in order', type: 'textarea', span: 2, required: true, hint: 'Comma separated' },
      { name: 'hasBarcode', label: 'Prints a linear barcode', type: 'switch' },
      { name: 'hasQrCode', label: 'Prints a QR code', type: 'switch' },
      { name: 'hasCustomerLogo', label: 'Prints the customer logo (OEM)', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (l) => ({
      code: l.code,
      name: l.name,
      kind: l.kind,
      standard: l.standard,
      customer: l.customer ?? '',
      widthMm: String(l.widthMm),
      heightMm: String(l.heightMm),
      languages: l.languages.join(', '),
      fields: l.fields.join(', '),
      hasBarcode: String(l.hasBarcode),
      hasQrCode: String(l.hasQrCode),
      hasCustomerLogo: String(l.hasCustomerLogo),
      isActive: String(l.isActive),
    }),
    fromForm: (v, existing) => ({
      ...(existing ?? { printedCount: 0, lastPrintedOn: null }),
      code: v.code,
      name: v.name,
      kind: v.kind as LabelKind,
      standard: v.standard as LabelFormat['standard'],
      customer: v.standard === 'CUSTOMER' ? v.customer || null : null,
      widthMm: Number(v.widthMm) || 0,
      heightMm: Number(v.heightMm) || 0,
      languages: v.languages ? v.languages.split(',').map((s) => s.trim()).filter(Boolean) : ['English'],
      fields: v.fields ? v.fields.split(',').map((s) => s.trim()).filter(Boolean) : [],
      hasBarcode: v.hasBarcode === 'true',
      hasQrCode: v.hasQrCode === 'true',
      hasCustomerLogo: v.hasCustomerLogo === 'true',
      isActive: v.isActive !== 'false',
    }),
    blockDelete: (l) =>
      l.printedCount > 0 && l.isActive
        ? `${l.code} has printed ${formatQty(l.printedCount)} labels and is still active. Deactivate it first so nothing is printing from a format that is about to disappear.`
        : undefined,
  }, formats, labelApi, fetchLabels)

  const [tab, setTab] = useState('ALL')
  const [printing, setPrinting] = useState<LabelFormat | null>(null)
  const [copies, setCopies] = useState('1')

  const visible = formats.filter((l) => (tab === 'ALL' ? true : l.kind === tab))
  const active = formats.filter((l) => l.isActive)
  const gs1 = formats.filter((l) => l.standard === 'GS1' && l.isActive)
  const oem = formats.filter((l) => l.hasCustomerLogo && l.isActive)

  const columns: Column<LabelFormat>[] = [
    { key: 'code', header: 'Format', sortable: true, width: '13rem', render: (l) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{l.code}</p>
        <p className="truncate text-2xs text-fg-subtle">{l.name}</p>
      </div>
    ) },
    { key: 'kind', header: 'Level', sortable: true, width: '7.5rem', render: (l) => (
      <Badge tone="neutral" size="sm" dot={false}>{KIND_LABEL[l.kind]}</Badge>
    ) },
    { key: 'standard', header: 'Standard', sortable: true, width: '9rem', render: (l) => (
      <Badge tone={l.standard === 'GS1' ? 'success' : l.standard === 'CUSTOMER' ? 'brand' : 'neutral'} size="sm" dot={false}>
        {l.standard === 'GS1' ? 'GS1' : l.standard === 'CUSTOMER' ? 'customer' : 'internal'}
      </Badge>
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (l) => (
      l.customer ? <span className="text-xs">{l.customer}</span> : <span className="text-2xs text-fg-subtle">any</span>
    ) },
    { key: 'size', header: 'Size (mm)', width: '8rem', render: (l) => (
      <span className="font-mono text-2xs text-fg-muted">{l.widthMm} × {l.heightMm}</span>
    ) },
    { key: 'symbols', header: 'Symbols', width: '11rem', render: (l) => (
      <div className="flex gap-1">
        {l.hasBarcode && <Badge tone="progress" size="sm" dot={false}>barcode</Badge>}
        {l.hasQrCode && <Badge tone="brand" size="sm" dot={false}>QR</Badge>}
        {l.hasCustomerLogo && <Badge tone="warning" size="sm" dot={false}>logo</Badge>}
        {!l.hasBarcode && !l.hasQrCode && !l.hasCustomerLogo && <span className="text-2xs text-fg-subtle">text only</span>}
      </div>
    ) },
    { key: 'languages', header: 'Languages', width: '11rem', render: (l) => (
      <span className="text-2xs text-fg-muted">{l.languages.join(', ')}</span>
    ) },
    { key: 'fields', header: 'Fields', align: 'right', width: '6rem', sortable: true, accessor: (l) => l.fields.length, render: (l) => (
      <span className="tabular text-2xs text-fg-muted">{l.fields.length}</span>
    ) },
    { key: 'printedCount', header: 'Printed', align: 'right', sortable: true, width: '8rem', render: (l) => (
      <span className="tabular text-xs">{formatQty(l.printedCount)}</span>
    ) },
    { key: 'lastPrintedOn', header: 'Last printed', sortable: true, width: '11rem', accessor: (l) => l.lastPrintedOn ?? '', render: (l) => (
      l.lastPrintedOn ? <span className="text-2xs">{formatDateTime(l.lastPrintedOn)}</span> : <span className="text-2xs text-fg-subtle">never</span>
    ) },
    { key: 'isActive', header: 'Status', align: 'center', width: '8rem', sortable: true, accessor: (l) => (l.isActive ? 1 : 0), render: (l) => (
      <DispatchStatusBadge status={l.isActive ? 'APPROVED' : 'CLOSED'} size="sm" />
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'label-formats', 'Label formats', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Labels"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Labels' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => crud.openCreate({ kind: 'CARTON', standard: 'GS1', widthMm: '100', heightMm: '150', languages: 'English', hasBarcode: 'true', isActive: 'true', fields: 'Product name, SKU, Quantity' })}
          >
            New label format
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'ALL' ? formats.length : formats.filter((l) => l.kind === t.id).length }))} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{active.length}</span> active format
        {active.length === 1 ? '' : 's'} — <span className="font-medium text-success">{gs1.length}</span> GS1-compliant and{' '}
        <span className="font-medium text-warning">{oem.length}</span> carrying a customer logo. A deactivated format stops
        printing everywhere at once, which is the point of holding them here rather than on the label printer.
      </p>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(l) => String((l as any).id || l.uid)}
        searchPlaceholder="Search format, name, customer or field…"
        onExport={doExport}
        emptyTitle="No label formats"
        rowClassName={(l) => cn(!l.isActive && 'opacity-60')}
        rowActions={(l) => (
          <>
            <MenuItem label="Edit the format" onClick={() => crud.openEdit(l)} />
            <MenuItem label="Delete the format" danger onClick={() => crud.askDelete(l)} />
            <MenuItem
              separatorBefore
              label="Print a test label"
              disabled={!l.isActive}
              onClick={() => { setPrinting(l); setCopies('1') }}
            />
            <MenuItem
              label={l.isActive ? 'Deactivate the format' : 'Activate the format'}
              onClick={async () => {
                await labelApi.update((l as any).id, { ...l, isActive: !l.isActive })
                fetchLabels()
                toast.success(
                  l.isActive ? 'Format deactivated' : 'Format activated',
                  l.isActive
                    ? `${l.code} will no longer print. Anything already printed stays valid.`
                    : `${l.code} is available on the packing-bay printers again.`,
                )
              }}
            />
            <MenuItem
              label="Duplicate for another customer"
              onClick={async () => {
                await labelApi.create({
                  ...l,
                  code: `${l.code}-COPY`,
                  name: `${l.name} (copy)`,
                  printedCount: 0,
                  lastPrintedOn: null,
                  isActive: false,
                })
                fetchLabels()
                toast.success('Format duplicated', `${l.code}-COPY created as an inactive draft. Edit it, then activate it.`)
              }}
            />
          </>
        )}
      />

      <Modal
        open={!!printing}
        onClose={() => setPrinting(null)}
        title={printing ? `Print ${printing.code}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPrinting(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!printing) return
                const n = Number(copies)
                if (!n || n < 1) {
                  toast.error('Enter a number of copies', 'At least one.')
                  return
                }
                labelApi.update((printing as any).id, { ...printing, printedCount: printing.printedCount + n, lastPrintedOn: new Date().toISOString() }).then(fetchLabels)
                toast.success(
                  'Sent to the printer',
                  `${n} × ${printing.code} at ${printing.widthMm} × ${printing.heightMm} mm. The print count is recorded against the format so label stock consumption can be reconciled.`,
                )
                setPrinting(null)
              }}
            >
              Print
            </Button>
          </>
        }
      >
        {printing && (
          <div className="space-y-3.5">
            {/* A rough proportional preview of the label layout. */}
            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="mb-2 text-2xs uppercase tracking-wide text-fg-subtle">Layout preview</p>
              <div
                className="mx-auto flex flex-col justify-between gap-1 rounded border border-dashed border-border-strong bg-surface p-2.5"
                style={{ aspectRatio: `${printing.widthMm} / ${printing.heightMm}`, maxWidth: '15rem' }}
              >
                {printing.hasCustomerLogo && (
                  <div className="rounded bg-brand-500/10 px-1.5 py-0.5 text-center text-2xs font-medium text-brand-600">
                    {printing.customer ?? 'Customer'} logo
                  </div>
                )}
                <div className="flex-1 space-y-0.5 overflow-hidden">
                  {printing.fields.slice(0, 7).map((f) => (
                    <p key={f} className="truncate text-[9px] leading-tight text-fg-muted">
                      {f}: <span className="text-fg">—</span>
                    </p>
                  ))}
                  {printing.fields.length > 7 && (
                    <p className="text-[9px] text-fg-subtle">+{printing.fields.length - 7} more</p>
                  )}
                </div>
                {printing.hasBarcode && <div className="h-4 rounded bg-[repeating-linear-gradient(90deg,rgb(var(--fg))_0_1px,transparent_1px_3px)]" />}
                {printing.hasQrCode && (
                  <div className="mx-auto h-8 w-8 rounded bg-[repeating-conic-gradient(rgb(var(--fg))_0_25%,transparent_0_50%)] bg-[length:4px_4px]" />
                )}
              </div>
              <p className="mt-2 text-center text-2xs text-fg-subtle">
                {printing.widthMm} × {printing.heightMm} mm · {printing.languages.join(' / ')}
              </p>
            </div>
            <Input label="Copies" type="number" min={1} value={copies} onChange={(e) => setCopies(e.target.value)} />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Four levels of label, and why each exists" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Product</span> goes on the bottle or its sleeve — MRP, capacity, batch, manufacturing date and the statutory country of origin.</p>
          <p><span className="font-medium text-fg">Carton</span> is what the warehouse scans. GS1-128 with the item number and the count inside means one scan books in twelve bottles.</p>
          <p><span className="font-medium text-fg">Pallet</span> carries an SSCC — a serial shipping container code. One scan at the dock books in the whole unit load.</p>
          <p><span className="font-medium text-fg">Shipment</span> is the address label. It is the only one a human actually reads, so it is the one that gets the destination in large type.</p>
        </CardBody>
      </Card>
    </div>
  )
}
