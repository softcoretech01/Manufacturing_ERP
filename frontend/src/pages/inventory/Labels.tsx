import { useMemo, useState } from 'react'
import { Printer, QrCode } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { batches, binSlots, labelTemplates as seedTemplates, serials, stockPositions } from '@/mock/inventory'
import type { LabelObject, LabelTemplate } from '@/types/inventory'

/**
 * Barcode and label printing (Vol 5 Ch 14). Every label carries a versioned,
 * pipe-delimited payload so a scanner can tell what it just read without
 * guessing — `v1|LOC|RM-01|Rack Area A|A-01-1-1` is a bin, `v1|FG|…` a bottle.
 */
function buildPayload(pattern: string, values: Record<string, string>) {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`)
}

/** A deterministic barcode-looking bar pattern so the preview reads as a label. */
function bars(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100_000
  return Array.from({ length: 44 }, (_, i) => {
    h = (h * 1103515245 + 12345) % 2147483648
    return ((h >> (i % 7)) & 3) + 1
  })
}

export function LabelsPage() {
  const toast = useToast()
  const seed = useMemo(() => seedTemplates, [])
  const { rows: templates, update } = useCollection<LabelTemplate>('inv:label', seed)
  const rowEdit = useRowEdit<LabelTemplate>({
    key: 'inv:label',
    seed,
    entity: 'Label template',
    titleOf: (t) => t.name,
    blockDelete: (t) =>
      t.printedCount > 0 && t.isActive
        ? `${t.name} has printed ${t.printedCount.toLocaleString('en-IN')} labels and is still active. Deactivate it first so nothing is printing from a format that is about to disappear.`
        : undefined,
  })

  const [tab, setTab] = useState<'print' | 'templates'>('print')
  const [templateUid, setTemplateUid] = useState(seed[0]?.uid ?? '')
  const [recordKey, setRecordKey] = useState('')
  const [copies, setCopies] = useState('1')

  const template = templates.find((t) => t.uid === templateUid) ?? templates[0]

  /** The records you can print this template against, by object type. */
  const records: { value: string; label: string; values: Record<string, string> }[] = useMemo(() => {
    if (!template) return []
    switch (template.objectType) {
      case 'BATCH':
        return batches.map((b) => ({
          value: b.batchNo,
          label: `${b.batchNo} — ${b.itemName}`,
          values: { ITEM: b.itemCode, BATCH: b.batchNo, HEAT: b.supplierBatchNo ?? '—', QTY: formatQty(b.quantityRemaining) },
        }))
      case 'BIN':
        return binSlots.map((b) => ({
          value: b.code,
          label: `${b.warehouseCode} · ${b.code} — ${b.zone}`,
          values: { WH: b.warehouseCode, ZONE: b.zone, BIN: b.code, SEQ: String(b.pickSequence) },
        }))
      case 'SERIAL':
        return serials.map((s) => ({
          value: s.serialNo,
          label: `${s.serialNo} — ${s.itemName}`,
          values: { SKU: s.itemCode, SERIAL: s.serialNo, BATCH: s.batchNo },
        }))
      case 'ITEM':
        return stockPositions.map((p) => ({
          value: p.itemCode,
          label: `${p.itemCode} — ${p.itemName}`,
          values: { ITEM: p.itemCode, UOM: p.uom },
        }))
      case 'CARTON':
        return serials
          .filter((s) => s.cartonNo)
          .map((s) => ({ value: s.cartonNo!, label: `${s.cartonNo} — ${s.itemName}`, values: { SKU: s.itemCode, CARTON: s.cartonNo!, QTY: '24' } }))
      case 'PALLET':
        return [{ value: 'PLT26000114', label: 'PLT26000114 — 48 cartons, Coimbatore depot', values: { PALLET: 'PLT26000114', CARTONS: '48' } }]
      default:
        return []
    }
  }, [template])

  const record = records.find((r) => r.value === recordKey) ?? records[0]
  const payload = template && record ? buildPayload(template.pattern, record.values) : ''
  const copyCount = Math.max(1, Number(copies || 1))

  const columns: Column<LabelTemplate>[] = [
    { key: 'code', header: 'Template', sortable: true, width: '11rem', render: (t) => (
      <div>
        <p className="font-mono text-xs font-medium text-brand-600">{t.code}</p>
        <p className="truncate text-2xs text-fg-subtle">{t.sizeMm} mm</p>
      </div>
    ) },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'objectType', header: 'Prints for', sortable: true, width: '8rem', render: (t) => <Badge tone="neutral" size="sm" dot={false}>{t.objectType.toLowerCase()}</Badge> },
    { key: 'symbology', header: 'Symbology', sortable: true, width: '9rem', render: (t) => <span className="font-mono text-2xs">{t.symbology}</span> },
    { key: 'pattern', header: 'Payload pattern', render: (t) => <span className="font-mono text-2xs text-fg-muted">{t.pattern}</span> },
    { key: 'fields', header: 'Printed fields', defaultHidden: true, accessor: (t) => t.fields.join(', '), render: (t) => <span className="text-2xs text-fg-muted">{t.fields.join(' · ')}</span> },
    { key: 'printer', header: 'Printer', sortable: true },
    { key: 'printedCount', header: 'Printed', align: 'right', sortable: true, render: (t) => t.printedCount.toLocaleString('en-IN') },
    { key: 'isActive', header: 'Status', width: '7rem', accessor: (t) => (t.isActive ? 'Active' : 'Inactive'), render: (t) => (
      <Badge tone={t.isActive ? 'success' : 'neutral'} size="sm">{t.isActive ? 'Active' : 'Inactive'}</Badge>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'label-templates', 'Label templates', columnsFromTable(columns), templates)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function print() {
    if (!template || !record) return
    update(template.uid, { printedCount: template.printedCount + copyCount })
    toast.success(
      `${copyCount} label${copyCount === 1 ? '' : 's'} sent to ${template.printer}`,
      `${template.name} · payload ${payload}. Reprints are counted — a duplicate label in circulation is a traceability hazard.`,
    )
  }

  const OBJECT_HINT: Record<LabelObject, string> = {
    ITEM: 'Shelf-edge label for an item — no batch, no quantity.',
    BATCH: 'The label that travels with the material. Scanning it identifies item, batch and heat.',
    BIN: 'Fixed to the rack. Scanning it tells the app where the operator is standing.',
    CARTON: 'Goes on the packed carton and carries the SKU, quantity and batch.',
    PALLET: 'Aggregates cartons for dispatch — one scan instead of forty.',
    SERIAL: 'One per finished bottle, used for warranty lookup and recall.',
  }

  return (
    <div>
      <PageHeader
        title="Barcode, QR & label printing"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Labels' }]}
        tabs={
          <Tabs
            variant="pill"
            active={tab}
            onChange={(v) => setTab(v as typeof tab)}
            tabs={[
              { id: 'print', label: 'Print a label' },
              { id: 'templates', label: 'Templates', count: templates.length },
            ]}
          />
        }
      />

      {tab === 'print' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="What are you printing?" description="Pick the template, then the record it belongs to" />
            <CardBody className="space-y-3.5">
              <Select
                label="Label template"
                value={template?.uid ?? ''}
                onChange={(e) => {
                  setTemplateUid(e.target.value)
                  setRecordKey('')
                }}
                options={templates.filter((t) => t.isActive).map((t) => ({ value: t.uid, label: `${t.code} — ${t.name}` }))}
              />
              {template && <p className="-mt-1 text-2xs text-fg-muted">{OBJECT_HINT[template.objectType]}</p>}

              <Select
                label={template ? `${template.objectType.charAt(0)}${template.objectType.slice(1).toLowerCase()} to print` : 'Record'}
                value={record?.value ?? ''}
                onChange={(e) => setRecordKey(e.target.value)}
                options={records.map((r) => ({ value: r.value, label: r.label }))}
              />

              <Input label="Copies" type="number" value={copies} onChange={(e) => setCopies(e.target.value)} hint="Every reprint is counted against the template" />

              <div className="rounded border border-border bg-surface-2 p-3">
                <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Scanner payload</p>
                <p className="mt-1 break-all font-mono text-xs text-fg">{payload || '—'}</p>
                <p className="mt-1.5 text-2xs text-fg-muted">
                  The leading <span className="font-mono">v1</span> is the format version and the second segment is the object
                  type, so a scanner knows what it read before it looks anything up.
                </p>
              </div>

              <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={print} disabled={!template || !record}>
                Print {copyCount} label{copyCount === 1 ? '' : 's'} on {template?.printer}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Preview" description={template ? `${template.name} · ${template.symbology} · ${template.sizeMm} mm` : undefined} />
            <CardBody>
              {!template || !record ? (
                <p className="text-xs text-fg-subtle">Choose a template and a record to see the label.</p>
              ) : (
                <div className="mx-auto max-w-sm rounded border-2 border-dashed border-border bg-surface p-4">
                  <div className="rounded border border-border-strong bg-white p-3 text-black">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">SSB Industries Pvt Ltd</p>
                    <p className="mt-0.5 text-sm font-bold leading-tight">{record.label.split(' — ')[1] ?? record.label}</p>

                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                      {template.fields.slice(0, 6).map((f) => (
                        <p key={f} className="truncate">
                          <span className="text-neutral-500">{f}: </span>
                          <span className="font-medium">{Object.values(record.values)[template.fields.indexOf(f)] ?? '—'}</span>
                        </p>
                      ))}
                    </div>

                    {template.symbology === 'QR' || template.symbology === 'DATAMATRIX' ? (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="grid h-20 w-20 shrink-0 grid-cols-8 gap-px bg-white">
                          {bars(payload).concat(bars(payload.split('').reverse().join(''))).slice(0, 64).map((v, i) => (
                            <span key={i} className={cn('block', v % 2 === 0 ? 'bg-black' : 'bg-white')} />
                          ))}
                        </div>
                        <p className="break-all font-mono text-[8px] leading-tight">{payload}</p>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="flex h-12 items-end gap-px">
                          {bars(payload).map((w, i) => (
                            <span key={i} className={cn('block h-full bg-black', w === 1 ? 'w-px' : w === 2 ? 'w-0.5' : w === 3 ? 'w-1' : 'w-1.5')} />
                          ))}
                        </div>
                        <p className="mt-1 break-all text-center font-mono text-[8px]">{payload}</p>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-center text-2xs text-fg-subtle">
                    {copyCount} × {template.sizeMm} mm on {template.printer}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      ) : (
        <DataTable
          density="comfortable"
          rows={templates}
          columns={columns}
          rowKey={(t) => t.uid}
          searchPlaceholder="Search template, object type or printer…"
          onExport={doExport}
          onRowClick={(t) => {
            setTemplateUid(t.uid)
            setRecordKey('')
            setTab('print')
          }}
          emptyTitle="No label templates"
          rowActions={(t) => rowEdit.actions(t)}
        />
      )}

      <Card className="mt-4">
        <CardHeader title="Where labels are scanned" description="The same code is read at every step — that is what makes traceability possible" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: 'Put-away', d: 'Scan the batch label, scan the bin label, confirm. No typing.' },
            { t: 'Picking & issue', d: 'Scan the bin, scan the batch — the system checks it is the batch FEFO expects.' },
            { t: 'Counting', d: 'Scan the bin, then each item. The counter never sees the expected quantity.' },
            { t: 'Packing', d: 'Bottle serials are scanned into a carton, cartons onto a pallet.' },
            { t: 'Dispatch', d: 'One pallet scan confirms every carton and serial inside it.' },
            { t: 'Warranty & recall', d: 'A returned bottle\'s serial gives the heat number and the customer in one query.' },
          ].map((x) => (
            <div key={x.t} className="rounded border border-border p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                <QrCode className="h-3.5 w-3.5 text-fg-subtle" /> {x.t}
              </p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{x.d}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
