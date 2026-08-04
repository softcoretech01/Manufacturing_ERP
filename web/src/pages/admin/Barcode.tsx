import { useState } from 'react'
import { Barcode, Printer, QrCode, ScanLine, Tag } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { cn } from '@/lib/cn'
import { labelTemplates } from '@/mock/data2'
import type { LabelTemplate } from '@/types'

/** Type prefixes carried by every payload so one scan box can route anywhere. */
const PAYLOAD_TYPES = [
  { prefix: 'RM', label: 'Raw material lot', routes: 'Stock enquiry, issue to production, quality inspection' },
  { prefix: 'SF', label: 'Semi-finished item', routes: 'WIP transfer, operation confirmation' },
  { prefix: 'FG', label: 'Finished goods', routes: 'Packing, dispatch, warranty lookup' },
  { prefix: 'LOC', label: 'Bin / rack location', routes: 'Put-away, picking, cycle count' },
  { prefix: 'PO', label: 'Production order', routes: 'Travel card, operation start/stop' },
  { prefix: 'IB', label: 'Inner box', routes: 'Carton packing, dispatch verification' },
  { prefix: 'CTN', label: 'Carton', routes: 'Palletisation, loading' },
  { prefix: 'PLT', label: 'Pallet', routes: 'Loading, gate pass' },
  { prefix: 'AST', label: 'Asset / machine', routes: 'Breakdown call, PM checklist, meter reading' },
  { prefix: 'EMP', label: 'Employee', routes: 'Attendance, operation logging' },
]

/** Purely decorative rendering — a real label uses a proper encoder. */
function FakeBarcode({ symbology, value }: { symbology: string; value: string }) {
  const seed = [...value].reduce((a, c) => a + c.charCodeAt(0), 0)
  if (symbology.includes('QR') || symbology.includes('DATAMATRIX')) {
    return (
      <div className="grid h-24 w-24 grid-cols-12 gap-px bg-transparent">
        {Array.from({ length: 144 }, (_, i) => (
          <span key={i} className={(i * seed + (i % 7) * 3) % 5 < 2 ? 'bg-fg' : 'bg-transparent'} />
        ))}
      </div>
    )
  }
  return (
    <div className="flex h-14 items-end gap-px">
      {Array.from({ length: 52 }, (_, i) => (
        <span
          key={i}
          className="bg-fg"
          style={{ width: ((seed + i * 13) % 3) + 1, height: '100%' }}
        />
      ))}
    </div>
  )
}

export function BarcodePage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'barcode-labels', 'Barcode & labels', columnsFromTable(columns), labelTemplates)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('templates')
  const [preview, setPreview] = useState<LabelTemplate | null>(null)
  const [scan, setScan] = useState('')
  const [printOpen, setPrintOpen] = useState(false)

  const resolved = (() => {
    const v = scan.trim()
    if (!v) return null
    if (v.startsWith('(00)')) return { type: 'GS1', label: 'GS1-128 logistics label', detail: 'SSCC pallet / carton — routed to dispatch' }
    const parts = v.split('|')
    if (parts[0] !== 'v1' || parts.length < 3) return { type: null, label: 'Unrecognised payload', detail: 'Not a system-generated code. Scans that do not match a known format are rejected rather than guessed at.' }
    const t = PAYLOAD_TYPES.find((p) => p.prefix === parts[1])
    if (!t) return { type: null, label: `Unknown type prefix "${parts[1]}"`, detail: 'Payload version is valid but the type is not registered.' }
    return { type: t.prefix, label: t.label, detail: t.routes, fields: parts.slice(2) }
  })()

  const columns: Column<LabelTemplate>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '170px', render: (t) => <span className="font-mono text-2xs font-medium">{t.code}</span> },
    { key: 'name', header: 'Label', sortable: true, width: '210px' },
    { key: 'objectType', header: 'Applies to', width: '160px', render: (t) => <span className="text-xs text-fg-muted">{t.objectType}</span> },
    {
      key: 'symbology',
      header: 'Symbology',
      width: '150px',
      sortable: true,
      render: (t) => (
        <span className="inline-flex items-center gap-1.5">
          {t.symbology.includes('QR') || t.symbology.includes('DATAMATRIX') ? <QrCode className="h-3.5 w-3.5 text-fg-subtle" /> : <Barcode className="h-3.5 w-3.5 text-fg-subtle" />}
          <span className="font-mono text-2xs">{t.symbology}</span>
        </span>
      ),
    },
    { key: 'size', header: 'Size', width: '130px', accessor: (t) => t.widthMm * t.heightMm, render: (t) => <span className="text-2xs text-fg-muted tabular">{t.widthMm} × {t.heightMm} mm @ {t.dpi} dpi</span> },
    { key: 'payloadFormat', header: 'Payload format', render: (t) => <span className="truncate font-mono text-2xs text-fg-muted">{t.payloadFormat}</span> },
    {
      key: 'isDefault',
      header: '',
      width: '90px',
      accessor: (t) => (t.isDefault ? 1 : 0),
      render: (t) => (t.isDefault ? <Badge tone="brand" size="sm">Default</Badge> : null),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Barcode & labels"
        description="Every physical thing in the plant carries a code, and every code carries a type prefix so a single scan box knows where to send it."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Platform services' }, { label: 'Barcode & labels' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => setPrintOpen(true)}>
            Print labels
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'templates', label: 'Label templates', count: labelTemplates.length },
              { id: 'payloads', label: 'Payload types', count: PAYLOAD_TYPES.length },
              { id: 'scanner', label: 'Scan resolver' },
            ]}
          />
        }
      />

      {tab === 'templates' && (
        <DataTable
          rows={labelTemplates}
          columns={columns}
          rowKey={(t) => t.uid}
          searchPlaceholder="Label code, name or object type…"
          onRowClick={setPreview}
          onExport={doExport}
          rowActions={(t) => (
            <>
              <MenuItem label="Preview" onClick={() => setPreview(t)} />
              <MenuItem label="Edit layout" onClick={() => setPreview(t)} />
              <MenuItem label="Print test label" onClick={() => toast.success('Sent to printer', 'One test label queued on the default label printer.')} />
              <MenuItem label="Duplicate" onClick={() => toast.info('Duplicate label', `Create an editable copy of ${t.code}.`)} />
              <MenuItem label="Set as default" disabled={t.isDefault} onClick={() => toast.success('Default label set', `${t.name} is now the default label for ${t.objectType}.`)} />
            </>
          )}
        />
      )}

      {tab === 'payloads' && (
        <div className="space-y-4">
          
          <Card>
            <CardHeader title="Registered type prefixes" />
            <CardBody className="p-0">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-24">Prefix</th>
                    <th className="w-56">Object</th>
                    <th>Screens that accept it</th>
                  </tr>
                </thead>
                <tbody>
                  {PAYLOAD_TYPES.map((p) => (
                    <tr key={p.prefix}>
                      <td><span className="font-mono text-2xs font-semibold text-brand-600">v1|{p.prefix}|…</span></td>
                      <td className="font-medium text-fg">{p.label}</td>
                      <td className="text-fg-muted">{p.routes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'scanner' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Scan resolver" description="Paste or scan a payload to see how the system would route it" />
            <CardBody className="space-y-3.5">
              <Textarea
                label="Scanned payload"
                rows={3}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder="v1|RM|RM-SS304-05|LOT260728004|H4471|SS304|0.5|400|2240|P1/GRN/26-27/00317"
                className="font-mono text-xs"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5">
                {labelTemplates.slice(0, 5).map((t) => (
                  <button
                    key={t.uid}
                    type="button"
                    onClick={() => setScan(t.sample)}
                    className="rounded border border-border px-2 py-1 text-2xs text-fg-muted hover:bg-surface-2"
                  >
                    {t.code}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Resolution" />
            <CardBody>
              {!resolved && <p className="text-xs text-fg-muted">Scan or paste a payload to see the result.</p>}
              {resolved && (
                <div className="space-y-3">
                  <div className={cn('rounded border p-3', resolved.type ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5')}>
                    <p className={cn('text-sm font-medium', resolved.type ? 'text-success' : 'text-danger')}>{resolved.label}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">{resolved.detail}</p>
                  </div>
                  {resolved.fields && (
                    <div>
                      <p className="field-label">Decoded fields</p>
                      <table className="grid-table">
                        <tbody>
                          {resolved.fields.map((f, i) => (
                            <tr key={i}>
                              <td className="w-16 text-2xs text-fg-subtle">#{i + 1}</td>
                              <td className="font-mono text-2xs">{f}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name}
        description={preview ? `${preview.code} · ${preview.widthMm} × ${preview.heightMm} mm at ${preview.dpi} dpi` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
            <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => { toast.success('Test label printed'); setPreview(null) }}>
              Print test
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div
                className="flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border-strong bg-white p-4 text-black"
                style={{ width: Math.min(360, preview.widthMm * 3), minHeight: Math.min(300, preview.heightMm * 2.2) }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide">SSB Industries Pvt Ltd</p>
                <p className="text-[9px]">{preview.objectType}</p>
                <FakeBarcode symbology={preview.symbology} value={preview.sample} />
                <p className="break-all text-center font-mono text-[7px] leading-tight">{preview.sample}</p>
              </div>
            </div>
            <div>
              <p className="field-label">Payload format</p>
              <p className="break-all rounded border border-border bg-surface-2 p-2.5 font-mono text-2xs text-fg-muted">{preview.payloadFormat}</p>
            </div>
            {preview.code === 'LBL_INVOICE_QR' && (
              <Alert tone="warning" title="Statutory format — not editable">
                The invoice QR encodes the signed IRN payload returned by the Invoice Registration
                Portal. Its content and size are fixed by the e-invoicing schema; only its position
                on the print template can be changed.
              </Alert>
            )}
            {preview.symbology === 'GS1_128' && (
              <Alert tone="info" title="GS1 application identifiers">
                Logistics labels use registered GS1 AIs — (00) SSCC, (01) GTIN, (10) batch,
                (11) production date, (37) count. Customers with GS1-compliant receiving scan these
                directly; a proprietary format would be rejected at their dock.
              </Alert>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Print labels"
        footer={
          <>
            <Button variant="outline" onClick={() => setPrintOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => { toast.success('Print job queued', '24 labels sent to ZEBRA-P1-01.'); setPrintOpen(false) }}>
              Print
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select label="Label template" required options={labelTemplates.map((t) => ({ value: t.uid, label: `${t.code} — ${t.name}` }))} />
          <Select label="Printer" required options={[{ value: 'Z1', label: 'ZEBRA-P1-01 — Plant 1 stores' }, { value: 'Z2', label: 'ZEBRA-P1-02 — Packing hall' }, { value: 'Z3', label: 'ZEBRA-P2-01 — Plant 2 stores' }]} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Copies per item" type="number" defaultValue={1} min={1} />
            <Input label="Start position" type="number" defaultValue={1} min={1} hint="For part-used sheets." />
          </div>
          <Alert tone="info">
            Reprints are logged. A label reprinted for the same lot carries a REPRINT marker so a
            duplicate on the floor is visible rather than silently ambiguous.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
