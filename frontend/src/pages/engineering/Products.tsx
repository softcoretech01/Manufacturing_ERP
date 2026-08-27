import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Calculator, Plus, Rocket, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DetailBlock, EngStatusBadge, LifecycleBadge, LifecycleRail } from '@/components/engineering/EngShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate } from '@/lib/format'
import {
  LIFECYCLE_FLOW,
  LIFECYCLE_LABEL,
  NO_SIMULATION,
  bomsForProduct,
  defaultBomFor,
  defaultRoutingFor,
  releaseBlockers,
  rollUpCost,
  routingTime,
  routingsForProduct,
} from '@/lib/engFlow'
import { newUid, useCollection } from '@/store/data'
import { useEngineeringCollection } from '@/store/engData'
import {
  boms as seedBoms,
  engDocuments as seedDocs,
  products as seedProducts,
  routings as seedRoutings,
  tools as seedTools,
  workCentres as seedWorkCentres,
} from '@/mock/engineering'
import { items as masterItems } from '@/mock/masters'
import { engineeringApi as api } from '@/api/engineering'
import type {
  Bom,
  EngDocument,
  EngProduct,
  EngWorkCentre,
  Lifecycle,
  ProductSpec,
  ProductType,
  Routing,
  Tool,
} from '@/types/engineering'

/**
 * Product master (Ch 4 and 5).
 *
 * The record everything else in engineering hangs off. What makes this screen
 * useful rather than another master list is that opening a product shows what
 * it is actually made of and what it actually costs — pulled live from its BOM
 * and routing — so the person deciding whether to release it can see whether it
 * is ready without opening four more screens.
 */

const PRODUCT_TYPES: ProductType[] = ['FINISHED', 'SEMI_FINISHED', 'RAW_MATERIAL', 'PACKING', 'CONSUMABLE', 'SPARE', 'TOOLING', 'ACCESSORY']
const TYPE_LABEL: Record<ProductType, string> = {
  FINISHED: 'Finished goods',
  SEMI_FINISHED: 'Semi-finished',
  RAW_MATERIAL: 'Raw material',
  PACKING: 'Packing material',
  CONSUMABLE: 'Consumable',
  SPARE: 'Spare part',
  TOOLING: 'Tooling',
  ACCESSORY: 'Accessory',
}
const FAMILIES = ['Vacuum Flask', 'Lids & Caps', 'Sports Bottle', 'Tumbler', 'Components', 'Packing']
const GRADES = ['SS 304', 'SS 316', 'SS 201', 'Copper clad']

interface FormState {
  code: string
  name: string
  productType: ProductType
  family: string
  capacityMl: string
  colour: string
  brand: string
  baseUom: string
  netWeightG: string
  remarks: string
  spec: ProductSpec
}

const emptySpec: ProductSpec = {
  materialGrade: 'SS 304',
  thicknessMm: null,
  diameterMm: null,
  heightMm: null,
  neckDiameterMm: null,
  baseDiameterMm: null,
  capacityMl: null,
  wallThicknessMm: null,
  vacuumType: 'Double wall, high vacuum',
  insulationType: 'Vacuum + copper getter',
  coatingType: 'Powder coating',
  paintSpec: '',
  surfaceFinish: 'Matte',
  logoSpec: '',
  printingMethod: 'Fibre laser marking',
  packagingStandard: '',
}

const emptyForm: FormState = {
  code: '',
  name: '',
  productType: 'FINISHED',
  family: FAMILIES[0],
  capacityMl: '',
  colour: '',
  brand: 'AquaSteel',
  baseUom: 'NOS',
  netWeightG: '',
  remarks: '',
  spec: { ...emptySpec },
}

export function ProductsPage() {
  const toast = useToast()
  const [rows, setRows] = useState<EngProduct[]>([])

  useEffect(() => {
    api.getEngProducts().then(setRows).catch(console.error)
  }, [])

  const create = async (data: EngProduct) => {
    try {
      const res = await api.createEngProduct(data)
      setRows(prev => [res, ...prev])
      toast.success('Product created', `${res.code} starts at concept. Build its BOM and routing next.`)
    } catch (e) {
      console.error(e)
      toast.error('Error', 'Failed to create product.')
    }
  }

  const update = async (uid: string, data: Partial<EngProduct>) => {
    try {
      const res = await api.updateEngProduct(uid, data)
      setRows(prev => prev.map(p => p.uid === uid ? res : p))
    } catch (e) {
      console.error(e)
      toast.error('Error', 'Failed to update product.')
    }
  }

  const remove = async (uid: string) => {
    try {
      await api.deleteEngProduct(uid)
      setRows(prev => prev.filter(p => p.uid !== uid))
    } catch (e) {
      console.error(e)
      toast.error('Error', 'Failed to delete product.')
    }
  }
  const { rows: boms } = useEngineeringCollection<Bom>('eng:boms', useMemo(() => seedBoms, []))
  const { rows: routings } = useEngineeringCollection<Routing>('eng:routings', useMemo(() => seedRoutings, []))
  const { rows: workCentres } = useEngineeringCollection<EngWorkCentre>('eng:workcentres', useMemo(() => seedWorkCentres, []))
  const { rows: tools } = useEngineeringCollection<Tool>('eng:tools', useMemo(() => seedTools, []))
  const { rows: documents } = useEngineeringCollection<EngDocument>('eng:documents', useMemo(() => seedDocs, []))

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<EngProduct | null>(null)
  const [detailTab, setDetailTab] = useState('general')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EngProduct | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<EngProduct | null>(null)
  const [moving, setMoving] = useState<{ product: EngProduct; to: Lifecycle } | null>(null)

  const ctx = { boms, routings, workCentres, tools, items: masterItems, products: rows }

  const counts = {
    all: rows.length,
    development: rows.filter((p) => ['CONCEPT', 'DESIGN', 'PROTOTYPE', 'TESTING'].includes(p.lifecycle)).length,
    production: rows.filter((p) => p.lifecycle === 'PRODUCTION').length,
    approved: rows.filter((p) => p.lifecycle === 'APPROVED').length,
    retired: rows.filter((p) => ['OBSOLETE', 'ARCHIVED'].includes(p.lifecycle)).length,
  }

  const filtered = rows.filter((p) => {
    if (tab === 'development') return ['CONCEPT', 'DESIGN', 'PROTOTYPE', 'TESTING'].includes(p.lifecycle)
    if (tab === 'production') return p.lifecycle === 'PRODUCTION'
    if (tab === 'approved') return p.lifecycle === 'APPROVED'
    if (tab === 'retired') return ['OBSOLETE', 'ARCHIVED'].includes(p.lifecycle)
    return true
  })

  const columns: Column<EngProduct>[] = [
    { key: 'sno', header: 'S.no', width: '60px', render: (_, i) => <span className="text-2xs text-fg-subtle">{i + 1}</span> },
    { key: 'code', header: 'Product', sortable: true, width: '11rem', render: (p) => <span className="font-mono text-xs font-medium text-brand-600">{p.code}</span> },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'family', header: 'Category', sortable: true, width: '9rem', render: (p) => <span className="text-xs text-fg-muted">{p.family}</span> },
    { key: 'lifecycle', header: 'Lifecycle', sortable: true, width: '8rem', render: (p) => <LifecycleBadge state={p.lifecycle} size="sm" /> },
  ]

  /* ── Form ──────────────────────────────────────────────────────────── */

  async function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, spec: { ...emptySpec }, code: 'Loading...' })
    setErrors({})
    setFormOpen(true)
    try {
      const { nextCode } = await api.getEngProductNextCode()
      setForm(f => ({ ...f, code: nextCode }))
    } catch (e) {
      setForm(f => ({ ...f, code: 'Error loading code' }))
    }
  }

  function openEdit(p: EngProduct) {
    setEditing(p)
    setForm({
      code: p.code,
      name: p.name,
      productType: p.productType,
      family: p.family,
      capacityMl: p.capacityMl === null ? '' : String(p.capacityMl),
      colour: p.colour,
      brand: p.brand,
      baseUom: p.baseUom,
      netWeightG: p.netWeightG === null ? '' : String(p.netWeightG),
      remarks: p.remarks,
      spec: { ...p.spec },
    })
    setErrors({})
    setFormOpen(true)
  }

  function setSpec(patch: Partial<ProductSpec>) {
    setForm((f) => ({ ...f, spec: { ...f.spec, ...patch } }))
  }

  function num(v: string): number | null {
    if (!v.trim()) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  function validate() {
    const e: Record<string, string> = {}
    if (editing) {
      const code = form.code.trim().toUpperCase()
      if (!code) e.code = 'Required.'
      else if (rows.some((p) => p.code === code && p.uid !== editing?.uid)) e.code = `${code} already exists.`
    }
    if (!form.name.trim()) e.name = 'Required.'
    if (!form.productType) e.productType = 'Required.'
    if (!form.family) e.family = 'Required.'

    setErrors(e)
    if (Object.keys(e).length > 0) toast.error('Validation Error', 'Please fill in all the required fields.')
    return Object.keys(e).length === 0
  }

  function save() {
    if (!validate()) return
    const patch = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      productType: form.productType,
      family: form.family,
      capacityMl: num(form.capacityMl),
      colour: form.colour.trim() || '—',
      brand: form.brand.trim(),
      baseUom: form.baseUom,
      netWeightG: num(form.netWeightG),
      remarks: form.remarks.trim(),
      spec: { ...form.spec, capacityMl: num(form.capacityMl) },
      modifiedAt: new Date().toISOString(),
    }
    if (editing) {
      update(editing.uid, { ...editing, ...patch, revision: editing.revision + 1, version: editing.version + 1 })
      toast.success('Product updated', `Changes saved as revision ${editing.revision + 1}.`)
      if (detail?.uid === editing.uid) setDetail({ ...editing, ...patch, revision: editing.revision + 1 } as EngProduct)
    } else {
      create({
        ...patch,
        uid: newUid('epr'),
        lifecycle: 'CONCEPT',
        revision: 1,
        effectiveFrom: new Date().toISOString().slice(0, 10),
        standardCost: 0,
        costRolledAt: null,
        createdBy: 'Rahul Iyer',
        createdAt: new Date().toISOString(),
        version: 1,
      } as EngProduct)
    }
    setFormOpen(false)
  }

  /* ── Lifecycle ─────────────────────────────────────────────────────── */

  function moveLifecycle(p: EngProduct, to: Lifecycle) {
    if (to === 'PRODUCTION') {
      const blockers = releaseBlockers({ ...p, lifecycle: 'APPROVED' }, { boms, routings })
      if (blockers.length) {
        toast.warning('Release warnings (bypassed for testing)', blockers[0])
      }
    }
    update(p.uid, { ...p, lifecycle: to, modifiedAt: new Date().toISOString() })
    toast.success(`Moved to ${LIFECYCLE_LABEL[to].toLowerCase()}`, `${p.code} is now at ${LIFECYCLE_LABEL[to].toLowerCase()}.`)
    if (detail?.uid === p.uid) setDetail({ ...p, lifecycle: to })
    setMoving(null)
  }

  function publishCost(p: EngProduct) {
    const roll = rollUpCost(p.code, ctx, NO_SIMULATION)
    if (roll.total <= 0) {
      toast.error('Nothing to publish', 'The roll-up came back at zero — check the BOM and routing first.')
      return
    }
    update(p.uid, { ...p, standardCost: roll.total, costRolledAt: new Date().toISOString() })
    toast.success('Standard cost published', `${p.code} is now ₹${formatAmount(roll.total)} per ${p.baseUom.toLowerCase()}.`)
    if (detail?.uid === p.uid) setDetail({ ...p, standardCost: roll.total, costRolledAt: new Date().toISOString() })
  }

  /* ── Detail data ───────────────────────────────────────────────────── */

  const detailBom = detail ? defaultBomFor(detail.code, boms) : undefined
  const detailRouting = detail ? defaultRoutingFor(detail.code, routings) : undefined
  const detailRoll = detail ? rollUpCost(detail.code, ctx, NO_SIMULATION) : null
  const detailBlockers = detail ? releaseBlockers(detail, { boms, routings }) : []
  const detailDocs = detail ? documents.filter((d) => d.productCode === detail.code) : []

  return (
    <div>
      <PageHeader
        title="Products"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Products' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New product
          </Button>
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(p) => p.uid}
        searchPlaceholder="Search code, name, family or grade…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'products', 'Product register', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={(p) => {
          setDetail(p)
          setDetailTab('general')
        }}
        emptyTitle="No products"
        emptyDescription="Create a product, then give it a bill of material and a routing."
        rowActions={(p) => (
          <>
            <MenuItem label="View" onClick={() => { setDetail(p); setDetailTab('general') }} />
            <MenuItem label="Edit" onClick={() => openEdit(p)} />
            <MenuItem label="Roll up and publish cost" icon={<Calculator />} separatorBefore onClick={() => publishCost(p)} />
            {LIFECYCLE_FLOW[p.lifecycle].map((to) => (
              <MenuItem key={to} label={`Move to ${LIFECYCLE_LABEL[to].toLowerCase()}`} onClick={() => setMoving({ product: p, to })} />
            ))}
            <MenuItem
              label={defaultBomFor(p.code, boms) ? 'Delete — blocked (has a BOM)' : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={!!defaultBomFor(p.code, boms)}
              onClick={() => setConfirmDelete(p)}
            />
          </>
        )}
      />

      {/* Detail ------------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.code}
        description={detail?.name}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                Revision {detail.revision} · created by {detail.createdBy} · modified {formatDate(detail.modifiedAt)}
              </span>
              <div className="flex gap-2">
                {detail.lifecycle === 'APPROVED' && (
                  <Button variant="success" size="sm" icon={<Rocket className="h-3.5 w-3.5" />} disabled={detailBlockers.length > 0} onClick={() => moveLifecycle(detail, 'PRODUCTION')}>
                    Release to production
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
                  Back
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDetail(null); openEdit(detail); }}>
                  Edit
                </Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <LifecycleBadge state={detail.lifecycle} />
              <span className="text-2xs text-fg-muted">{TYPE_LABEL[detail.productType]} · {detail.family}</span>
            </div>

            <LifecycleRail state={detail.lifecycle} />

            {detailBlockers.length > 0 && detail.lifecycle !== 'PRODUCTION' && (
              <Alert tone="warning" title="Not ready for production">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {detailBlockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <Tabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'general', label: 'General' },
                { id: 'spec', label: 'Specification' },
                { id: 'bom', label: 'BOM', count: detailBom?.lines.length ?? 0 },
                { id: 'routing', label: 'Routing', count: detailRouting?.operations.length ?? 0 },
                { id: 'cost', label: 'Costing' },
                { id: 'docs', label: 'Documents', count: detailDocs.length },
              ]}
            />

            {detailTab === 'general' && (
              <DataGrid
                columns={2}
                items={[
                  { label: 'Code', value: detail.code, mono: true },
                  { label: 'Type', value: TYPE_LABEL[detail.productType] },
                  { label: 'Family', value: detail.family },
                  { label: 'Brand', value: detail.brand },
                  { label: 'Capacity', value: detail.capacityMl ? `${detail.capacityMl} ml` : '—' },
                  { label: 'Colour', value: detail.colour },
                  { label: 'Net weight', value: detail.netWeightG ? `${detail.netWeightG} g` : '—' },
                  { label: 'Base unit', value: detail.baseUom },
                  { label: 'Revision', value: `R${detail.revision}` },
                  { label: 'Effective from', value: formatDate(detail.effectiveFrom) },
                  { label: 'Standard cost', value: detail.standardCost > 0 ? `₹${formatAmount(detail.standardCost)}` : 'Not rolled' },
                  { label: 'Cost rolled', value: detail.costRolledAt ? formatDate(detail.costRolledAt) : '—' },
                ]}
              />
            )}

            {detailTab === 'general' && detail.remarks && (
              <DetailBlock title="Remarks">
                <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.remarks}</p>
              </DetailBlock>
            )}

            {detailTab === 'spec' && (
              <DataGrid
                columns={2}
                items={[
                  { label: 'Material grade', value: detail.spec.materialGrade },
                  { label: 'Steel thickness', value: detail.spec.thicknessMm ? `${detail.spec.thicknessMm} mm` : '—' },
                  { label: 'Wall thickness', value: detail.spec.wallThicknessMm ? `${detail.spec.wallThicknessMm} mm` : '—' },
                  { label: 'Bottle diameter', value: detail.spec.diameterMm ? `${detail.spec.diameterMm} mm` : '—' },
                  { label: 'Bottle height', value: detail.spec.heightMm ? `${detail.spec.heightMm} mm` : '—' },
                  { label: 'Neck diameter', value: detail.spec.neckDiameterMm ? `${detail.spec.neckDiameterMm} mm` : '—' },
                  { label: 'Base diameter', value: detail.spec.baseDiameterMm ? `${detail.spec.baseDiameterMm} mm` : '—' },
                  { label: 'Capacity', value: detail.spec.capacityMl ? `${detail.spec.capacityMl} ml` : '—' },
                  { label: 'Vacuum type', value: detail.spec.vacuumType },
                  { label: 'Insulation', value: detail.spec.insulationType },
                  { label: 'Coating', value: detail.spec.coatingType },
                  { label: 'Paint specification', value: detail.spec.paintSpec || '—' },
                  { label: 'Surface finish', value: detail.spec.surfaceFinish },
                  { label: 'Logo specification', value: detail.spec.logoSpec || '—' },
                  { label: 'Printing method', value: detail.spec.printingMethod },
                  { label: 'Packaging standard', value: detail.spec.packagingStandard || '—' },
                ]}
              />
            )}

            {detailTab === 'bom' && (
              <DetailBlock
                title={detailBom ? `${detailBom.docNo} revision ${detailBom.revision}` : 'Bill of material'}
                actions={
                  <Link to="/engineering/bom" className="inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">
                    Open BOM screen <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                {!detailBom ? (
                  <Alert tone="warning">This product has no live bill of material, so it cannot be planned or costed.</Alert>
                ) : (
                  <div className="overflow-x-auto rounded border border-border">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th style={{ width: '3rem' }}>#</th>
                          <th>Component</th>
                          <th className="text-right">Qty per</th>
                          <th>UoM</th>
                          <th className="text-right">Scrap</th>
                          <th className="text-right">Op</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailBom.lines.map((l) => (
                          <tr key={l.uid}>
                            <td className="text-2xs text-fg-subtle">{l.seq}</td>
                            <td>
                              <p className="text-xs font-medium text-fg">{l.itemName}</p>
                              <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                            </td>
                            <td className="text-right tabular">{l.qtyPer}</td>
                            <td className="text-2xs">{l.uom}</td>
                            <td className="text-right tabular text-2xs text-fg-muted">{l.scrapPct}%</td>
                            <td className="text-right text-2xs text-fg-muted">{l.operationSeq ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {bomsForProduct(detail.code, boms).length > 1 && (
                  <p className="mt-2 text-2xs text-fg-subtle">
                    {bomsForProduct(detail.code, boms).length} BOM records exist for this product, including alternates and
                    superseded revisions.
                  </p>
                )}
              </DetailBlock>
            )}

            {detailTab === 'routing' && (
              <DetailBlock
                title={detailRouting ? `${detailRouting.docNo} revision ${detailRouting.revision}` : 'Routing'}
                actions={
                  <Link to="/engineering/routing" className="inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">
                    Open routing screen <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                {!detailRouting ? (
                  <Alert tone="warning">This product has no live routing, so the shop floor has nothing to confirm against.</Alert>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded border border-border">
                      <table className="grid-table">
                        <thead>
                          <tr>
                            <th style={{ width: '3.5rem' }}>Seq</th>
                            <th>Operation</th>
                            <th>Work centre</th>
                            <th className="text-right">Setup</th>
                            <th className="text-right">Cycle</th>
                            <th className="text-right">Ops</th>
                            <th>Tool</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...detailRouting.operations].sort((a, b) => a.seq - b.seq).map((o) => (
                            <tr key={o.uid}>
                              <td className="text-2xs text-fg-subtle tabular">{o.seq}</td>
                              <td>
                                <p className="text-xs font-medium text-fg">{o.operationName}</p>
                                <p className="font-mono text-2xs text-fg-subtle">{o.operationCode}</p>
                              </td>
                              <td className="font-mono text-2xs">{o.workCentreCode}</td>
                              <td className="text-right tabular text-2xs">{o.setupMinutes} min</td>
                              <td className="text-right tabular text-2xs">{o.cycleSeconds} s</td>
                              <td className="text-right tabular text-2xs">{o.operators}</td>
                              <td className="font-mono text-2xs text-fg-muted">{o.toolCode ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-2xs text-fg-subtle">
                      {routingTime(detailRouting).minutesPerUnit.toFixed(2)} minutes per piece at a costing lot of{' '}
                      {detailRouting.costingLotSize.toLocaleString('en-IN')} · {routingTime(detailRouting).qcCheckpoints} QC
                      checkpoints.
                    </p>
                  </>
                )}
                {routingsForProduct(detail.code, routings).length > 1 && (
                  <p className="mt-1 text-2xs text-fg-subtle">
                    {routingsForProduct(detail.code, routings).length} routing revisions exist for this product.
                  </p>
                )}
              </DetailBlock>
            )}

            {detailTab === 'cost' && detailRoll && (
              <DetailBlock
                title="Cost roll-up"
                actions={
                  <Button size="xs" variant="outline" icon={<Calculator className="h-3 w-3" />} onClick={() => publishCost(detail)}>
                    Publish as standard cost
                  </Button>
                }
              >
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <tbody>
                      {(
                        [
                          ['Raw material & components', detailRoll.buckets.rawMaterial],
                          ['Packing', detailRoll.buckets.packing],
                          ['Consumables', detailRoll.buckets.consumables],
                          ['Labour', detailRoll.buckets.labour],
                          ['Machine', detailRoll.buckets.machine],
                          ['Tooling', detailRoll.buckets.tooling],
                          ['Overhead', detailRoll.buckets.overhead],
                        ] as [string, number][]
                      ).map(([label, value]) => (
                        <tr key={label}>
                          <td className="text-xs text-fg-muted">{label}</td>
                          <td className="text-right tabular text-xs">₹{formatAmount(value)}</td>
                          <td className="w-20 text-right text-2xs text-fg-subtle tabular">
                            {detailRoll.total > 0 ? `${((value / detailRoll.total) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-surface-2">
                        <td className="text-xs font-semibold text-fg">Total manufacturing cost</td>
                        <td className="text-right text-sm font-semibold tabular text-fg">₹{formatAmount(detailRoll.total)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                {detail.standardCost > 0 && Math.abs(detail.standardCost - detailRoll.total) > 0.01 && (
                  <Alert tone="warning" className="mt-2">
                    The published standard cost is ₹{formatAmount(detail.standardCost)}, but rolling up today gives ₹
                    {formatAmount(detailRoll.total)} — a difference of ₹{formatAmount(detailRoll.total - detail.standardCost)}.
                  </Alert>
                )}
                {detailRoll.warnings.length > 0 && (
                  <Alert tone="danger" className="mt-2" title="The roll-up is incomplete">
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {detailRoll.warnings.slice(0, 5).map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </Alert>
                )}
              </DetailBlock>
            )}

            {detailTab === 'docs' && (
              <DetailBlock
                title="Drawings & documents"
                actions={
                  <Link to="/engineering/documents" className="inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">
                    Document register <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                {!detailDocs.length ? (
                  <p className="text-xs text-fg-subtle">No documents are linked to this product.</p>
                ) : (
                  <div className="overflow-x-auto rounded border border-border">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Type</th>
                          <th className="text-right">Rev</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailDocs.map((doc) => (
                          <tr key={doc.uid}>
                            <td>
                              <p className="text-xs font-medium text-fg">{doc.title}</p>
                              <p className="font-mono text-2xs text-fg-subtle">{doc.code}</p>
                            </td>
                            <td className="text-2xs text-fg-muted">{doc.docType.replace(/_/g, ' ').toLowerCase()}</td>
                            <td className="text-right text-2xs tabular">R{doc.revision}</td>
                            <td><EngStatusBadge status={doc.status} size="sm" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DetailBlock>
            )}
          </div>
        )}
      </Drawer>

      {/* Create / edit ------------------------------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'New product'}
        size="lg"
        description="Create a new product in the system. The Product Code is generated automatically."
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Create product'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Product Code" value={form.code ?? ''} disabled />
          <Input label="Product Name" required value={form.name ?? ''} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          
          <Select label="Category" value={form.family ?? ''} error={errors.family} onChange={(e) => setForm({ ...form, family: e.target.value })} options={FAMILIES.map((f) => ({ value: f, label: f }))} />
          <Input label="Selling Price" type="number" disabled placeholder="Managed in pricing" hint="Products use standard price lists." />
          
          <div className="md:col-span-2">
            <Textarea label="Description" rows={3} value={form.remarks ?? ''} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Optional detailed description..." />
          </div>
        </div>

        {!editing && (
          <Alert tone="info" className="mt-4">
            A new product starts at concept. It cannot be released to production until it has an approved BOM, an approved
            routing and a published standard cost.
          </Alert>
        )}
      </Modal>

      {/* Lifecycle confirmation --------------------------------------------- */}
      <Modal
        open={!!moving}
        onClose={() => setMoving(null)}
        title="Move lifecycle state"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => moving && moveLifecycle(moving.product, moving.to)}>
              Move to {moving ? LIFECYCLE_LABEL[moving.to].toLowerCase() : ''}
            </Button>
          </>
        }
      >
        {moving && (
          <div className="space-y-2 text-sm text-fg-muted">
            <p>
              <span className="font-medium text-fg">{moving.product.code}</span> moves from{' '}
              {LIFECYCLE_LABEL[moving.product.lifecycle].toLowerCase()} to {LIFECYCLE_LABEL[moving.to].toLowerCase()}.
            </p>
            {moving.to === 'PRODUCTION' && (
              <p className="text-xs">
                Planning will start treating this product as manufacturable, and production orders can be raised against
                its routing.
              </p>
            )}
            {moving.to === 'OBSOLETE' && (
              <p className="text-xs">
                No new production orders will be allowed. Existing stock and open orders are unaffected.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete product"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  setConfirmDelete(null)
                  if (detail?.uid === confirmDelete.uid) setDetail(null)
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.code} will be marked deleted, not physically removed. It has no live bill of material.
        </p>
      </Modal>
    </div>
  )
}
