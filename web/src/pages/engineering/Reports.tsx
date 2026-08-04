import { useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate } from '@/lib/format'
import {
  CHANGE_CATEGORY_LABEL,
  LIFECYCLE_LABEL,
  NO_SIMULATION,
  defaultBomFor,
  defaultRoutingFor,
  isLiveBom,
  rollUpCost,
  routingTime,
  toolLifePct,
  whereUsed,
} from '@/lib/engFlow'
import { useCollection } from '@/store/data'
import {
  boms as seedBoms,
  engChanges as seedChanges,
  engDocuments as seedDocs,
  operations as seedOperations,
  products as seedProducts,
  routings as seedRoutings,
  tools as seedTools,
  workCentres as seedWorkCentres,
} from '@/mock/engineering'
import { items as masterItems } from '@/mock/masters'
import type { Bom, EngChange, EngDocument, EngProduct, EngWorkCentre, Operation, Routing, Tool } from '@/types/engineering'

/**
 * Engineering reports (Ch 20).
 *
 * Every report is computed from the live records at the moment it is opened, not
 * from a stored snapshot — so a BOM approved a minute ago is already in the
 * register, and the cost report reflects the rate that was changed this morning.
 * All of them export to Excel, CSV or PDF with the columns as shown.
 */

type Row = Record<string, string | number>

interface ReportDef {
  id: string
  name: string
  description: string
  columns: { key: string; header: string; align?: 'right'; width?: string; mono?: boolean }[]
  build: () => Row[]
}

export function EngReportsPage() {
  const toast = useToast()
  const { rows: products } = useCollection<EngProduct>('eng:products', useMemo(() => seedProducts, []))
  const { rows: boms } = useCollection<Bom>('eng:boms', useMemo(() => seedBoms, []))
  const { rows: routings } = useCollection<Routing>('eng:routings', useMemo(() => seedRoutings, []))
  const { rows: workCentres } = useCollection<EngWorkCentre>('eng:workcentres', useMemo(() => seedWorkCentres, []))
  const { rows: operations } = useCollection<Operation>('eng:operations', useMemo(() => seedOperations, []))
  const { rows: tools } = useCollection<Tool>('eng:tools', useMemo(() => seedTools, []))
  const { rows: changes } = useCollection<EngChange>('eng:changes', useMemo(() => seedChanges, []))
  const { rows: documents } = useCollection<EngDocument>('eng:documents', useMemo(() => seedDocs, []))

  const ctx = { boms, routings, workCentres, tools, items: masterItems, products }

  const reports: ReportDef[] = useMemo(
    () => [
      {
        id: 'products',
        name: 'Product master register',
        description: 'Every product with its structure, routing, lifecycle state and published cost',
        columns: [
          { key: 'code', header: 'Product', mono: true, width: '11rem' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type', width: '9rem' },
          { key: 'capacity', header: 'Capacity', align: 'right', width: '6.5rem' },
          { key: 'grade', header: 'Grade', width: '6rem' },
          { key: 'bom', header: 'BOM', mono: true, width: '9rem' },
          { key: 'routing', header: 'Routing', mono: true, width: '9rem' },
          { key: 'standardCost', header: 'Standard cost', align: 'right', width: '9rem' },
          { key: 'lifecycle', header: 'Lifecycle', width: '8rem' },
        ],
        build: () =>
          products.map((p) => {
            const b = defaultBomFor(p.code, boms)
            const r = defaultRoutingFor(p.code, routings)
            return {
              _key: p.uid,
              code: p.code,
              name: p.name,
              type: p.productType.replace('_', ' ').toLowerCase(),
              capacity: p.capacityMl ? `${p.capacityMl} ml` : '—',
              grade: p.spec.materialGrade,
              bom: b ? `${b.docNo} R${b.revision}` : '—',
              routing: r ? `${r.docNo} R${r.revision}` : '—',
              standardCost: p.standardCost > 0 ? formatAmount(p.standardCost) : '—',
              lifecycle: LIFECYCLE_LABEL[p.lifecycle],
            }
          }),
      },
      {
        id: 'bomRegister',
        name: 'BOM register',
        description: 'Every bill of material, every revision, with its effective window',
        columns: [
          { key: 'docNo', header: 'BOM', mono: true, width: '11rem' },
          { key: 'revision', header: 'Rev', align: 'right', width: '4.5rem' },
          { key: 'product', header: 'Product', mono: true, width: '11rem' },
          { key: 'type', header: 'Type', width: '8rem' },
          { key: 'lines', header: 'Lines', align: 'right', width: '5rem' },
          { key: 'material', header: 'Direct material', align: 'right', width: '10rem' },
          { key: 'from', header: 'From', width: '8rem' },
          { key: 'to', header: 'To', width: '8rem' },
          { key: 'role', header: 'Role', width: '7rem' },
          { key: 'status', header: 'Status', width: '8rem' },
        ],
        build: () =>
          boms.map((b) => ({
            _key: b.uid,
            docNo: b.docNo,
            revision: `R${b.revision}`,
            product: b.productCode,
            type: b.bomType.toLowerCase(),
            lines: b.lines.length,
            material: formatAmount(
              b.lines.reduce((s, l) => {
                const item = masterItems.find((i) => i.code === l.itemCode)
                const rate = item ? item.standardCost || item.lastPurchaseRate : 0
                return s + l.qtyPer * (1 + l.scrapPct / 100) * rate
              }, 0) / Math.max(1, b.baseQty),
            ),
            from: formatDate(b.effectiveFrom),
            to: b.effectiveTo ? formatDate(b.effectiveTo) : 'open',
            role: b.isDefault ? 'default' : 'alternate',
            status: b.status.replace('_', ' ').toLowerCase(),
          })),
      },
      {
        id: 'whereUsed',
        name: 'Component where-used summary',
        description: 'Every component, how many structures consume it and which products it reaches',
        columns: [
          { key: 'code', header: 'Component', mono: true, width: '12rem' },
          { key: 'name', header: 'Description' },
          { key: 'uom', header: 'UoM', width: '4rem' },
          { key: 'rate', header: 'Rate', align: 'right', width: '8rem' },
          { key: 'boms', header: 'On BOMs', align: 'right', width: '7rem' },
          { key: 'products', header: 'Products reached', align: 'right', width: '9rem' },
          { key: 'reachedList', header: 'Reaches', mono: true },
        ],
        build: () => {
          const codes = [...new Set(boms.filter(isLiveBom).flatMap((b) => b.lines.map((l) => l.itemCode)))].sort()
          return codes.map((code) => {
            const item = masterItems.find((i) => i.code === code)
            const usage = whereUsed(code, boms)
            const reached = [...new Set(usage.map((u) => u.parentCode))]
            return {
              _key: code,
              code,
              name: item?.name ?? '(not in the item master)',
              uom: item?.baseUom ?? '—',
              rate: item ? formatAmount(item.standardCost || item.lastPurchaseRate) : '—',
              boms: usage.filter((u) => u.level === 1).length,
              products: reached.length,
              reachedList: reached.join(', '),
            }
          })
        },
      },
      {
        id: 'routingRegister',
        name: 'Routing register',
        description: 'Every routing with its operation count, time per piece and QC checkpoints',
        columns: [
          { key: 'docNo', header: 'Routing', mono: true, width: '11rem' },
          { key: 'revision', header: 'Rev', align: 'right', width: '4.5rem' },
          { key: 'product', header: 'Product', mono: true, width: '11rem' },
          { key: 'ops', header: 'Operations', align: 'right', width: '7rem' },
          { key: 'qc', header: 'QC points', align: 'right', width: '7rem' },
          { key: 'lot', header: 'Costing lot', align: 'right', width: '7.5rem' },
          { key: 'setup', header: 'Setup min/lot', align: 'right', width: '8rem' },
          { key: 'perUnit', header: 'Min/piece', align: 'right', width: '7rem' },
          { key: 'status', header: 'Status', width: '8rem' },
        ],
        build: () =>
          routings.map((r) => {
            const t = routingTime(r)
            return {
              _key: r.uid,
              docNo: r.docNo,
              revision: `R${r.revision}`,
              product: r.productCode,
              ops: r.operations.length,
              qc: t.qcCheckpoints,
              lot: r.costingLotSize,
              setup: t.setupMinutes.toFixed(0),
              perUnit: t.minutesPerUnit.toFixed(2),
              status: r.status.replace('_', ' ').toLowerCase(),
            }
          }),
      },
      {
        id: 'routingCost',
        name: 'Routing cost analysis',
        description: 'Conversion cost per operation, split into labour, machine, tooling and overhead',
        columns: [
          { key: 'routing', header: 'Routing', mono: true, width: '11rem' },
          { key: 'product', header: 'Product', mono: true, width: '11rem' },
          { key: 'seq', header: 'Seq', align: 'right', width: '4rem' },
          { key: 'operation', header: 'Operation' },
          { key: 'centre', header: 'Centre', mono: true, width: '5.5rem' },
          { key: 'labour', header: 'Labour', align: 'right', width: '7rem' },
          { key: 'machine', header: 'Machine', align: 'right', width: '7rem' },
          { key: 'tooling', header: 'Tooling', align: 'right', width: '7rem' },
          { key: 'overhead', header: 'Overhead', align: 'right', width: '7rem' },
          { key: 'total', header: 'Total', align: 'right', width: '7.5rem' },
        ],
        build: () =>
          routings
            .filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED')
            .flatMap((r) => {
              const roll = rollUpCost(r.productCode, ctx, NO_SIMULATION)
              return roll.operationLines.map((o) => ({
                _key: `${r.uid}-${o.seq}`,
                routing: r.docNo,
                product: r.productCode,
                seq: o.seq,
                operation: o.operationName,
                centre: o.workCentreCode,
                labour: formatAmount(o.labour, 3),
                machine: formatAmount(o.machine, 3),
                tooling: formatAmount(o.tooling, 3),
                overhead: formatAmount(o.overhead, 3),
                total: formatAmount(o.total),
              }))
            }),
      },
      {
        id: 'costRollup',
        name: 'Cost roll-up',
        description: 'Every product rolled up today, against the standard cost currently published',
        columns: [
          { key: 'code', header: 'Product', mono: true, width: '11rem' },
          { key: 'material', header: 'Material', align: 'right', width: '8rem' },
          { key: 'labour', header: 'Labour', align: 'right', width: '7rem' },
          { key: 'machine', header: 'Machine', align: 'right', width: '7rem' },
          { key: 'tooling', header: 'Tooling', align: 'right', width: '7rem' },
          { key: 'overhead', header: 'Overhead', align: 'right', width: '7rem' },
          { key: 'rolled', header: 'Rolled today', align: 'right', width: '9rem' },
          { key: 'published', header: 'Published', align: 'right', width: '9rem' },
          { key: 'variance', header: 'Variance', align: 'right', width: '9rem' },
          { key: 'warnings', header: 'Issues', align: 'right', width: '5.5rem' },
        ],
        build: () =>
          products.map((p) => {
            const roll = rollUpCost(p.code, ctx, NO_SIMULATION)
            const variance = p.standardCost > 0 ? roll.total - p.standardCost : 0
            return {
              _key: p.uid,
              code: p.code,
              material: formatAmount(roll.materialTotal),
              labour: formatAmount(roll.buckets.labour),
              machine: formatAmount(roll.buckets.machine),
              tooling: formatAmount(roll.buckets.tooling),
              overhead: formatAmount(roll.buckets.overhead),
              rolled: formatAmount(roll.total),
              published: p.standardCost > 0 ? formatAmount(p.standardCost) : '—',
              variance: p.standardCost > 0 ? `${variance > 0 ? '+' : ''}${formatAmount(variance)}` : '—',
              warnings: roll.warnings.length || '—',
            }
          }),
      },
      {
        id: 'changeLog',
        name: 'Engineering change log',
        description: 'Every request and notice, its category, its outcome and what it produced',
        columns: [
          { key: 'docNo', header: 'Change', mono: true, width: '11rem' },
          { key: 'type', header: 'Type', width: '5rem' },
          { key: 'title', header: 'Title' },
          { key: 'product', header: 'Product', mono: true, width: '11rem' },
          { key: 'category', header: 'Category', width: '10rem' },
          { key: 'priority', header: 'Priority', width: '6rem' },
          { key: 'raisedBy', header: 'Raised by', width: '9rem' },
          { key: 'raisedOn', header: 'Raised', width: '8rem' },
          { key: 'effective', header: 'Effective', width: '8rem' },
          { key: 'produced', header: 'Produced', mono: true, width: '11rem' },
          { key: 'status', header: 'Status', width: '9rem' },
        ],
        build: () =>
          changes.map((c) => ({
            _key: c.uid,
            docNo: c.docNo,
            type: c.changeType,
            title: c.title,
            product: c.productCode,
            category: CHANGE_CATEGORY_LABEL[c.category],
            priority: c.priority.toLowerCase(),
            raisedBy: c.requestedBy,
            raisedOn: formatDate(c.requestedOn),
            effective: formatDate(c.effectiveFrom),
            produced: c.resultingBom ?? '—',
            status: c.status.replace('_', ' ').toLowerCase(),
          })),
      },
      {
        id: 'revisionHistory',
        name: 'Product revision history',
        description: 'Structure and routing revisions in force for each product, and when the cost was last rolled',
        columns: [
          { key: 'code', header: 'Product', mono: true, width: '11rem' },
          { key: 'name', header: 'Name' },
          { key: 'productRev', header: 'Product rev', align: 'right', width: '8rem' },
          { key: 'bomRev', header: 'BOM rev', mono: true, width: '9rem' },
          { key: 'bomRevisions', header: 'BOM revisions', align: 'right', width: '9rem' },
          { key: 'routingRev', header: 'Routing rev', mono: true, width: '9rem' },
          { key: 'costRolled', header: 'Cost rolled', width: '9rem' },
          { key: 'lifecycle', header: 'Lifecycle', width: '8rem' },
        ],
        build: () =>
          products.map((p) => {
            const b = defaultBomFor(p.code, boms)
            const r = defaultRoutingFor(p.code, routings)
            return {
              _key: p.uid,
              code: p.code,
              name: p.name,
              productRev: `R${p.revision}`,
              bomRev: b ? `${b.docNo} R${b.revision}` : '—',
              bomRevisions: boms.filter((x) => x.productCode === p.code).length,
              routingRev: r ? `${r.docNo} R${r.revision}` : '—',
              costRolled: p.costRolledAt ? formatDate(p.costRolledAt) : 'never',
              lifecycle: LIFECYCLE_LABEL[p.lifecycle],
            }
          }),
      },
      {
        id: 'toolUsage',
        name: 'Tool usage & life',
        description: 'Life consumed, pieces remaining, per-piece amortisation and which operations call for the tool',
        columns: [
          { key: 'code', header: 'Tool', mono: true, width: '8rem' },
          { key: 'name', header: 'Tool' },
          { key: 'type', header: 'Type', width: '6.5rem' },
          { key: 'machine', header: 'Machine', mono: true, width: '7rem' },
          { key: 'life', header: 'Rated life', align: 'right', width: '8rem' },
          { key: 'used', header: 'Used', align: 'right', width: '8rem' },
          { key: 'pct', header: '% consumed', align: 'right', width: '8rem' },
          { key: 'remaining', header: 'Remaining', align: 'right', width: '8rem' },
          { key: 'perPiece', header: '₹ / piece', align: 'right', width: '7.5rem' },
          { key: 'ops', header: 'Operations', align: 'right', width: '7rem' },
          { key: 'calibration', header: 'Calibration due', width: '9rem' },
          { key: 'status', header: 'Status', width: '8rem' },
        ],
        build: () =>
          tools.map((t) => ({
            _key: t.uid,
            code: t.code,
            name: t.name,
            type: t.toolType.toLowerCase(),
            machine: t.machineCode || '—',
            life: t.lifeStrokes ? t.lifeStrokes.toLocaleString('en-IN') : '—',
            used: t.usedStrokes.toLocaleString('en-IN'),
            pct: t.lifeStrokes ? `${toolLifePct(t).toFixed(1)}%` : '—',
            remaining: t.lifeStrokes ? Math.max(0, t.lifeStrokes - t.usedStrokes).toLocaleString('en-IN') : '—',
            perPiece: t.lifeStrokes ? formatAmount(t.replacementCost / t.lifeStrokes, 3) : '—',
            ops: routings.reduce((n, r) => n + r.operations.filter((o) => o.toolCode === t.code).length, 0),
            calibration: t.nextCalibrationOn ? formatDate(t.nextCalibrationOn) : '—',
            status: t.status.replace('_', ' ').toLowerCase(),
          })),
      },
      {
        id: 'machineLoad',
        name: 'Work centre requirement',
        description: 'Minutes each work centre needs per 1,000 finished pieces, and the daily capacity available',
        columns: [
          { key: 'code', header: 'Centre', mono: true, width: '6.5rem' },
          { key: 'name', header: 'Work centre' },
          { key: 'ops', header: 'Operations', align: 'right', width: '7.5rem' },
          { key: 'minutes', header: 'Min / 1,000 pcs', align: 'right', width: '10rem' },
          { key: 'hours', header: 'Hours / 1,000 pcs', align: 'right', width: '10rem' },
          { key: 'capacity', header: 'Capacity h/day', align: 'right', width: '9rem' },
          { key: 'days', header: 'Days for 1,000', align: 'right', width: '9rem' },
          { key: 'rate', header: 'Loaded ₹/h', align: 'right', width: '8rem' },
        ],
        build: () =>
          workCentres.map((w) => {
            const ops = routings
              .filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED')
              .flatMap((r) => r.operations.filter((o) => o.workCentreCode === w.code).map((o) => ({ o, r })))
            // Setup once per costing lot, run time for every one of the 1,000 pieces.
            const minutes = ops.reduce(
              (s, { o, r }) => s + (o.setupMinutes / Math.max(1, r.costingLotSize)) * 1000 + (o.cycleSeconds / 60) * 1000,
              0,
            )
            const hours = minutes / 60
            return {
              _key: w.uid,
              code: w.code,
              name: w.name,
              ops: ops.length,
              minutes: minutes.toFixed(0),
              hours: hours.toFixed(1),
              capacity: w.hoursPerDay,
              days: w.hoursPerDay > 0 ? (hours / w.hoursPerDay).toFixed(2) : '—',
              rate: formatAmount((w.machineRatePerHour + w.labourRatePerHour) * (1 + w.overheadPct / 100), 0),
            }
          }),
      },
      {
        id: 'specification',
        name: 'Product specification',
        description: 'The engineering specification block for every product, as it would be sent to a customer',
        columns: [
          { key: 'code', header: 'Product', mono: true, width: '11rem' },
          { key: 'grade', header: 'Grade', width: '6rem' },
          { key: 'thickness', header: 'Thickness', align: 'right', width: '7rem' },
          { key: 'capacity', header: 'Capacity', align: 'right', width: '7rem' },
          { key: 'diameter', header: 'Diameter', align: 'right', width: '7rem' },
          { key: 'height', header: 'Height', align: 'right', width: '7rem' },
          { key: 'neck', header: 'Neck', align: 'right', width: '6rem' },
          { key: 'weight', header: 'Net weight', align: 'right', width: '8rem' },
          { key: 'coating', header: 'Coating', width: '12rem' },
          { key: 'finish', header: 'Finish', width: '8rem' },
          { key: 'packaging', header: 'Packaging standard' },
        ],
        build: () =>
          products.map((p) => ({
            _key: p.uid,
            code: p.code,
            grade: p.spec.materialGrade,
            thickness: p.spec.thicknessMm ? `${p.spec.thicknessMm} mm` : '—',
            capacity: p.spec.capacityMl ? `${p.spec.capacityMl} ml` : '—',
            diameter: p.spec.diameterMm ? `${p.spec.diameterMm} mm` : '—',
            height: p.spec.heightMm ? `${p.spec.heightMm} mm` : '—',
            neck: p.spec.neckDiameterMm ? `${p.spec.neckDiameterMm} mm` : '—',
            weight: p.netWeightG ? `${p.netWeightG} g` : '—',
            coating: p.spec.coatingType,
            finish: p.spec.surfaceFinish,
            packaging: p.spec.packagingStandard || '—',
          })),
      },
      {
        id: 'documents',
        name: 'Document register',
        description: 'Drawings, models, procedures and certificates with their current revision and approval',
        columns: [
          { key: 'code', header: 'Document', mono: true, width: '12rem' },
          { key: 'title', header: 'Title' },
          { key: 'type', header: 'Type', width: '12rem' },
          { key: 'product', header: 'Product', mono: true, width: '11rem' },
          { key: 'revision', header: 'Rev', align: 'right', width: '4.5rem' },
          { key: 'uploaded', header: 'Uploaded', width: '8rem' },
          { key: 'approvedBy', header: 'Approved by', width: '10rem' },
          { key: 'status', header: 'Status', width: '9rem' },
        ],
        build: () =>
          documents.map((d) => ({
            _key: d.uid,
            code: d.code,
            title: d.title,
            type: d.docType.replace(/_/g, ' ').toLowerCase(),
            product: d.productCode,
            revision: `R${d.revision}`,
            uploaded: formatDate(d.uploadedOn),
            approvedBy: d.approvedBy ?? '—',
            status: d.status.replace('_', ' ').toLowerCase(),
          })),
      },
      {
        id: 'operationLibrary',
        name: 'Standard operation library',
        description: 'The operation master with its standard times and where each one is used',
        columns: [
          { key: 'code', header: 'Code', mono: true, width: '6.5rem' },
          { key: 'name', header: 'Operation' },
          { key: 'centre', header: 'Centre', mono: true, width: '5.5rem' },
          { key: 'setup', header: 'Setup min', align: 'right', width: '7rem' },
          { key: 'cycle', header: 'Cycle s', align: 'right', width: '6.5rem' },
          { key: 'operators', header: 'Operators', align: 'right', width: '7rem' },
          { key: 'skill', header: 'Skill', width: '10rem' },
          { key: 'qc', header: 'QC point', width: '6.5rem' },
          { key: 'used', header: 'Used on routings', align: 'right', width: '10rem' },
        ],
        build: () =>
          operations.map((o) => ({
            _key: o.uid,
            code: o.code,
            name: o.name,
            centre: o.defaultWorkCentre,
            setup: o.setupMinutes,
            cycle: o.cycleSeconds,
            operators: o.operators,
            skill: o.skill,
            qc: o.qcCheckpoint ? 'yes' : 'no',
            used: routings.filter((r) => r.operations.some((x) => x.operationCode === o.code)).length,
          })),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, boms, routings, workCentres, operations, tools, changes, documents],
  )

  const [activeId, setActiveId] = useState(reports[0].id)
  const active = reports.find((r) => r.id === activeId) ?? reports[0]
  const rows = useMemo(() => active.build(), [active])

  const tableColumns: Column<Row>[] = active.columns.map((c) => ({
    key: c.key,
    header: c.header,
    sortable: true,
    align: c.align,
    width: c.width,
    accessor: (r) => r[c.key],
    render: c.mono ? (r) => <span className="font-mono text-2xs">{r[c.key]}</span> : undefined,
  }))

  function doExport(format: ExportFormat) {
    const columns: ExportColumn<Row>[] = active.columns.map((c) => ({ header: c.header, value: (r) => r[c.key] }))
    const n = exportRows(format, active.id, active.name, columns, rows)
    toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
  }

  return (
    <div>
      <PageHeader
        title="Engineering reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Reports' }]}
      />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardBody className="space-y-0.5 p-2">
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveId(r.id)}
                className={cn(
                  'w-full rounded px-2.5 py-2 text-left transition-colors',
                  r.id === activeId ? 'bg-brand-500/10 text-brand-600' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                <span className="flex items-center gap-2 text-xs font-medium">
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                  {r.name}
                </span>
              </button>
            ))}
          </CardBody>
        </Card>

        <div className="min-w-0">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-fg">{active.name}</h2>
            <p className="mt-0.5 text-xs text-fg-muted">{active.description}</p>
          </div>
          <DataTable
            rows={rows}
            columns={tableColumns}
            rowKey={(r) => String(r._key)}
            searchPlaceholder="Search this report…"
            onExport={doExport}
            pageSize={50}
            emptyTitle="Nothing to report"
            emptyDescription="There are no records that match this report yet."
          />
        </div>
      </div>
    </div>
  )
}
