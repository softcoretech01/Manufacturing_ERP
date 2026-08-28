import { useEffect, useMemo, useState } from 'react'
import { Download, Layers, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { EngStatusBadge, LevelIndent } from '@/components/engineering/EngShell'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatAmount, formatQty } from '@/lib/format'
import { defaultBomFor, explodeBom, netRequirements, whereUsed, type ExplodedLine, type WhereUsedRow } from '@/lib/engFlow'
import type { Bom, EngProduct } from '@/types/engineering'
import type { Item } from '@/types/inventory'
import { engineeringApi as api } from '@/api/engineering'
import { getItems } from '@/api/masters'

/**
 * BOM explosion and where-used (Ch 7 and Ch 20).
 *
 * Two questions asked constantly and answered nowhere else: what does it take to
 * build N of these, and what breaks if I change this component. Both walk the
 * same structure, in opposite directions.
 *
 * The explosion compounds scrap at every level, which is why the coil
 * requirement for a bottle is not simply "quantity times weight" — a 1.5% loss
 * on the shell and a 4.5% loss on the blank both land on the coil.
 */

export function BomExplorerPage() {
  const toast = useToast()
  
  const [boms, setBoms] = useState<Bom[]>([])
  const [products, setProducts] = useState<EngProduct[]>([])
  const [masterItems, setMasterItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const explodable = useMemo(() => products.filter((p) => defaultBomFor(p.code, boms)), [products, boms])
  const [productCode, setProductCode] = useState('')
  const [qtyText, setQtyText] = useState('1000')

  useEffect(() => {
    async function load() {
      try {
        const [bomData, productData, itemData] = await Promise.all([
          api.getBoms(),
          api.getEngProducts(),
          getItems()
        ])
        setBoms(bomData)
        setProducts(productData)
        setMasterItems(itemData)
        
        // Initialize selections if empty
        const explodableProducts = productData.filter((p: EngProduct) => defaultBomFor(p.code, bomData))
        if (explodableProducts.length > 0) {
          setProductCode(explodableProducts[0].code)
        }
      } catch (err) {
        console.error('Failed to load data:', err)
        toast.error('Failed to load', 'Could not load data from the server.')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const [tab, setTab] = useState('explode')

  /* ── Explosion ─────────────────────────────────────────────────────── */

  const qty = Math.max(0, Number(qtyText) || 0)

  const exploded = useMemo(
    () => (productCode && qty > 0 ? explodeBom(productCode, qty, boms) : []),
    [productCode, qty, boms],
  )
  const requirements = useMemo(() => netRequirements(exploded), [exploded])

  const rateOf = (code: string) => {
    const item = masterItems.find((i) => i.code === code)
    return item ? item.standardCost || item.lastPurchaseRate : 0
  }

  const requirementValue = requirements.reduce((s, r) => s + r.qty * rateOf(r.itemCode), 0)
  const maxLevel = exploded.reduce((m, l) => Math.max(m, l.level), 0)
  const selectedProduct = products.find((p) => p.code === productCode)
  const rootBom = productCode ? defaultBomFor(productCode, boms) : undefined

  function exportExplosion(format: ExportFormat) {
    const columns: ExportColumn<ExplodedLine>[] = [
      { header: 'Level', value: (l) => l.level },
      { header: 'Parent', value: (l) => l.parentCode },
      { header: 'Component', value: (l) => l.itemCode },
      { header: 'Description', value: (l) => l.itemName },
      { header: 'Qty per parent', value: (l) => l.qtyPer },
      { header: 'Scrap %', value: (l) => l.scrapPct },
      { header: 'UoM', value: (l) => l.uom },
      { header: `Required for ${qty}`, value: (l) => l.extendedQty.toFixed(4) },
      { header: 'Made in house', value: (l) => (l.hasBom ? 'Yes' : 'No') },
    ]
    const n = exportRows(format, `bom-explosion-${productCode}`, `BOM explosion — ${productCode} × ${qty}`, columns, exploded)
    toast.success('Export ready', `${n} rows written.`)
  }

  function exportRequirements(format: ExportFormat) {
    const columns: ExportColumn<(typeof requirements)[number]>[] = [
      { header: 'Item', value: (r) => r.itemCode },
      { header: 'Description', value: (r) => r.itemName },
      { header: 'UoM', value: (r) => r.uom },
      { header: 'Net requirement', value: (r) => r.qty.toFixed(4) },
      { header: 'Rate', value: (r) => rateOf(r.itemCode).toFixed(2) },
      { header: 'Value', value: (r) => (r.qty * rateOf(r.itemCode)).toFixed(2) },
    ]
    const n = exportRows(format, `net-requirements-${productCode}`, `Net requirements — ${productCode} × ${qty}`, columns, requirements)
    toast.success('Export ready', `${n} rows written.`)
  }

  /* ── Where used ────────────────────────────────────────────────────── */

  const usableItems = useMemo(() => {
    const codes = new Set(boms.flatMap((b) => b.lines.map((l) => l.itemCode)))
    return masterItems.filter((i) => codes.has(i.code))
  }, [boms])

  const [itemCode, setItemCode] = useState(() => usableItems[0]?.code ?? '')
  const [includeSuperseded, setIncludeSuperseded] = useState(false)
  const usage = useMemo(
    () => (itemCode ? whereUsed(itemCode, boms, { liveOnly: !includeSuperseded }) : []),
    [itemCode, boms, includeSuperseded],
  )
  const selectedItem = masterItems.find((i) => i.code === itemCode)
  const topLevelUsers = [...new Set(usage.map((u) => u.parentCode))]

  function exportUsage(format: ExportFormat) {
    const columns: ExportColumn<WhereUsedRow>[] = [
      { header: 'Level', value: (u) => u.level },
      { header: 'BOM', value: (u) => u.bomDocNo },
      { header: 'Revision', value: (u) => u.bomRevision },
      { header: 'Used on', value: (u) => u.parentCode },
      { header: 'Description', value: (u) => u.parentName },
      { header: 'Qty per', value: (u) => u.qtyPer },
      { header: 'UoM', value: (u) => u.uom },
      { header: 'BOM status', value: (u) => u.bomStatus },
    ]
    const n = exportRows(format, `where-used-${itemCode}`, `Where used — ${itemCode}`, columns, usage)
    toast.success('Export ready', `${n} rows written.`)
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="BOM explorer"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'BOM explorer' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'explode', label: 'Explosion', icon: <Layers className="h-3.5 w-3.5" /> },
              { id: 'whereUsed', label: 'Where used', icon: <Search className="h-3.5 w-3.5" /> },
            ]}
          />
        }
      />

      {/* ── Explosion ───────────────────────────────────────────────────── */}
      {tab === 'explode' && (
        <>
          <Card className="mb-4">
            <CardBody className="grid gap-3.5 sm:grid-cols-4">
              <Select
                label="Product"
                containerClassName="sm:col-span-2"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                options={[
                  { value: '', label: 'Select a product…' },
                  ...explodable.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` })),
                ]}
              />
              <Input maxLength={255} label="Order quantity" type="number" min={0} value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
              <div className="flex items-end pb-1">
                <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />} disabled={!exploded.length} onClick={() => exportExplosion('xlsx')}>
                  Export explosion
                </Button>
              </div>
            </CardBody>
          </Card>

          {!productCode ? (
            <Card>
              <EmptyState title="Choose a product" description="Only products with a live bill of material can be exploded." />
            </Card>
          ) : !rootBom ? (
            <Alert tone="warning">{productCode} has no live bill of material, so there is nothing to explode.</Alert>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded border border-border bg-surface-2 px-4 py-3 text-xs">
                <span className="text-fg-muted">
                  Structure <span className="font-mono text-fg">{rootBom.docNo} R{rootBom.revision}</span>
                </span>
                <span className="text-fg-muted">
                  Levels <span className="font-semibold text-fg tabular">{maxLevel}</span>
                </span>
                <span className="text-fg-muted">
                  Structure rows <span className="font-semibold text-fg tabular">{exploded.length}</span>
                </span>
                <span className="text-fg-muted">
                  Distinct items to procure or make{' '}
                  <span className="font-semibold text-fg tabular">{requirements.length}</span>
                </span>
                <span className="ml-auto text-fg-muted">
                  Material value for {qty.toLocaleString('en-IN')} {selectedProduct?.baseUom.toLowerCase() ?? 'units'}{' '}
                  <span className="font-semibold text-fg tabular">₹{formatAmount(requirementValue)}</span>
                </span>
              </div>

              <Card className="mb-4">
                <CardHeader
                  title="Indented structure"
                  description="Scrap compounds down the tree — the extended quantity already carries the loss at every level above it"
                />
                <CardBody className="p-0">
                  <div className="overflow-x-auto">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th style={{ width: '4rem' }}>Level</th>
                          <th style={{ minWidth: '20rem' }}>Component</th>
                          <th className="text-right" style={{ width: '7rem' }}>Qty per</th>
                          <th style={{ width: '4rem' }}>UoM</th>
                          <th className="text-right" style={{ width: '5.5rem' }}>Scrap</th>
                          <th className="text-right" style={{ width: '9rem' }}>Required</th>
                          <th className="text-right" style={{ width: '9rem' }}>Value</th>
                          <th style={{ width: '7rem' }}>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exploded.map((l) => (
                          <tr key={l.key} className={l.hasBom ? 'bg-surface-2/50' : undefined}>
                            <td className="text-2xs text-fg-subtle tabular">L{l.level}</td>
                            <td>
                              <LevelIndent level={l.level}>
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium text-fg">
                                    {l.itemName}
                                    {l.isPhantom && <span className="ml-1.5 text-2xs font-normal text-fg-subtle">(phantom)</span>}
                                  </span>
                                  <span className="block font-mono text-2xs text-fg-subtle">{l.itemCode}</span>
                                </span>
                              </LevelIndent>
                            </td>
                            <td className="text-right tabular text-xs">{l.qtyPer}</td>
                            <td className="text-2xs">{l.uom}</td>
                            <td className="text-right tabular text-2xs text-fg-muted">{l.scrapPct}%</td>
                            <td className="text-right tabular text-xs font-medium text-fg">{formatQty(l.extendedQty, 4)}</td>
                            <td className="text-right tabular text-xs text-fg-muted">
                              {l.hasBom ? '—' : `₹${formatAmount(l.extendedQty * rateOf(l.itemCode))}`}
                            </td>
                            <td>
                              {l.hasBom ? (
                                <Badge tone="progress" size="sm" dot={false}>Made</Badge>
                              ) : (
                                <Badge tone="neutral" size="sm" dot={false}>Bought</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Net requirements"
                  description="Bought-out items only — sub-assemblies are excluded because their own components are already listed"
                  actions={
                    <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportRequirements('xlsx')}>
                      Export
                    </Button>
                  }
                />
                <CardBody className="p-0">
                  <div className="overflow-x-auto">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th style={{ width: '4rem' }}>UoM</th>
                          <th className="text-right" style={{ width: '7rem' }}>Levels</th>
                          <th className="text-right" style={{ width: '10rem' }}>Requirement</th>
                          <th className="text-right" style={{ width: '9rem' }}>Rate</th>
                          <th className="text-right" style={{ width: '10rem' }}>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requirements.map((r) => (
                          <tr key={r.itemCode}>
                            <td>
                              <p className="text-xs font-medium text-fg">{r.itemName}</p>
                              <p className="font-mono text-2xs text-fg-subtle">{r.itemCode}</p>
                            </td>
                            <td className="text-2xs">{r.uom}</td>
                            <td className="text-right text-2xs text-fg-muted">{r.levels.map((l) => `L${l}`).join(', ')}</td>
                            <td className="text-right tabular text-xs font-medium text-fg">{formatQty(r.qty, 3)}</td>
                            <td className="text-right tabular text-2xs text-fg-muted">
                              {rateOf(r.itemCode) ? formatAmount(rateOf(r.itemCode)) : <span className="text-danger">no rate</span>}
                            </td>
                            <td className="text-right tabular text-xs">₹{formatAmount(r.qty * rateOf(r.itemCode))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-2">
                          <td colSpan={5} className="text-right text-xs font-semibold text-fg">Total material value</td>
                          <td className="text-right text-sm font-semibold tabular text-fg">₹{formatAmount(requirementValue)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}

      {/* ── Where used ──────────────────────────────────────────────────── */}
      {tab === 'whereUsed' && (
        <>
          <Card className="mb-4">
            <CardBody className="grid gap-3.5 sm:grid-cols-4">
              <Select
                label="Component"
                containerClassName="sm:col-span-2"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                options={[
                  { value: '', label: 'Select a component…' },
                  ...usableItems.map((i) => ({ value: i.code, label: `${i.code} — ${i.name}` })),
                ]}
              />
              <Select
                label="Include"
                value={includeSuperseded ? 'all' : 'live'}
                onChange={(e) => setIncludeSuperseded(e.target.value === 'all')}
                options={[
                  { value: 'live', label: 'Live BOMs only' },
                  { value: 'all', label: 'Live and superseded' },
                ]}
              />
              <div className="flex items-end pb-1">
                <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />} disabled={!usage.length} onClick={() => exportUsage('xlsx')}>
                  Export
                </Button>
              </div>
            </CardBody>
          </Card>

          {!itemCode ? (
            <Card>
              <EmptyState title="Choose a component" description="The list is every item that appears on at least one bill of material." />
            </Card>
          ) : !usage.length ? (
            <Alert tone="info">
              {itemCode} does not appear on any {includeSuperseded ? '' : 'live '}bill of material. It can be deactivated
              without affecting production.
            </Alert>
          ) : (
            <>
              <Alert tone={topLevelUsers.length > 3 ? 'warning' : 'info'} className="mb-4">
                <span className="font-medium text-fg">{selectedItem?.name ?? itemCode}</span> is used on{' '}
                {usage.filter((u) => u.level === 1).length} bill{usage.filter((u) => u.level === 1).length === 1 ? '' : 's'} of
                material directly, and reaches {topLevelUsers.length} product{topLevelUsers.length === 1 ? '' : 's'} in
                total. Any change to it affects all of them.
              </Alert>

              <Card>
                <CardHeader title="Used on" description="Level 1 is a direct parent; higher levels are reached through it" />
                <CardBody className="p-0">
                  <div className="overflow-x-auto">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th style={{ width: '4rem' }}>Level</th>
                          <th>Used on</th>
                          <th style={{ width: '11rem' }}>BOM</th>
                          <th className="text-right" style={{ width: '7rem' }}>Qty per</th>
                          <th style={{ width: '4rem' }}>UoM</th>
                          <th style={{ width: '7rem' }}>Role</th>
                          <th style={{ width: '9rem' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.map((u) => (
                          <tr key={u.key}>
                            <td className="text-2xs text-fg-subtle tabular">L{u.level}</td>
                            <td>
                              <LevelIndent level={u.level}>
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium text-fg">{u.parentName}</span>
                                  <span className="block font-mono text-2xs text-fg-subtle">{u.parentCode}</span>
                                </span>
                              </LevelIndent>
                            </td>
                            <td className="font-mono text-2xs text-fg-muted">
                              {u.bomDocNo} R{u.bomRevision}
                            </td>
                            <td className="text-right tabular text-xs">{u.level === 1 ? u.qtyPer : '—'}</td>
                            <td className="text-2xs">{u.level === 1 ? u.uom : ''}</td>
                            <td>
                              {u.isDefault ? (
                                <Badge tone="brand" size="sm" dot={false}>Default</Badge>
                              ) : (
                                <Badge tone="neutral" size="sm" dot={false}>Alternate</Badge>
                              )}
                            </td>
                            <td><EngStatusBadge status={u.bomStatus} size="sm" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
