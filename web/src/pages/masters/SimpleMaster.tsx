import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Database, Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { ConfirmDialog, Drawer, Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { MasterStatusBadge } from '@/components/masters/MasterShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/format'
import { newUid, useCollection } from '@/store/data'
import { SIMPLE_MASTER_BY_ROUTE } from '@/mock/masterRegistry'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MasterField, MasterStatus, SimpleMasterDef, SimpleMasterRow } from '@/types/masters'

/* ── Codes that use a live API instead of mock data ─────────── */
const API_BACKED_MASTERS = new Set(['BOTTLE_MODEL', 'BOTTLE_CAPACITY', 'BOTTLE_COLOUR', 'LID_TYPE', 'PACKAGING', 'STEEL_GRADE', 'STEEL_THICKNESS', 'SHIFT', 'HOLIDAY_CALENDAR', 'QUALITY_PARAM', 'DEFECT', 'HSN', 'TAX', 'PAYMENT_TERMS', 'UOM', 'REASON_CODE', 'COUNTRY', 'STATE', 'CITY'])

/* ── Map flat API row → SimpleMasterRow ─────────────────────── */
function apiRowToSimpleRow(r: any, def: SimpleMasterDef): SimpleMasterRow {
  const values: Record<string, string | number | boolean | null> = {}
  for (const f of def.fields) {
    values[f.key] = r[f.key] ?? null
  }
  return {
    uid: String(r.id),
    code: r.code,
    name: r.name,
    status: r.status ?? 'ACTIVE',
    effectiveFrom: r.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    effectiveTo: r.effectiveTo ?? null,
    revision: r.revision ?? 1,
    usageCount: r.usageCount ?? 0,
    modifiedBy: r.modifiedBy ?? r.createdBy ?? 'System',
    modifiedAt: r.modifiedDate ?? r.modifiedAt ?? new Date().toISOString(),
    values,
  }
}

/* ── Map SimpleMasterRow back to flat API payload ───────────── */
function simpleRowToApiPayload(form: FormState, def: SimpleMasterDef): any {
  const payload: any = {
    code: form.code,
    name: form.name,
    status: 'ACTIVE',
    effectiveFrom: form.effectiveFrom || null,
    effectiveTo: form.effectiveTo || null,
    revision: 1,
  }
  for (const f of def.fields) {
    const v = form.values[f.key]
    if (f.type === 'boolean') {
      payload[f.key] = !!v
    } else if (f.type === 'number') {
      payload[f.key] = v !== '' && v !== null && v !== undefined ? Number(v) : null
    } else {
      payload[f.key] = v !== '' ? v : null
    }
  }
  return payload
}

/* ── API method map per master code ─────────────────────────── */
const API_METHODS: Record<string, {
  getAll: () => Promise<any[]>
  create: (data: any) => Promise<any>
  update: (id: any, data: any) => Promise<any>
  delete: (id: any) => Promise<void>
  getNextCode?: () => Promise<{nextCode: string}>
}> = {
  BOTTLE_MODEL: {
    getAll: api.getBottleModels,
    create: api.createBottleModel,
    update: api.updateBottleModel,
    delete: api.deleteBottleModel,
    getNextCode: api.getNextBottleModelCode,
  },
  BOTTLE_CAPACITY: {
    getAll: api.getBottleCapacities,
    create: api.createBottleCapacity,
    update: api.updateBottleCapacity,
    delete: api.deleteBottleCapacity,
    getNextCode: api.getNextBottleCapacityCode,
  },
  BOTTLE_COLOUR: {
    getAll: api.getBottleColours,
    create: api.createBottleColour,
    update: api.updateBottleColour,
    delete: api.deleteBottleColour,
    getNextCode: api.getNextBottleColourCode,
  },
  LID_TYPE: {
    getAll: api.getLidTypes,
    create: api.createLidType,
    update: api.updateLidType,
    delete: api.deleteLidType,
    getNextCode: api.getNextLidTypeCode,
  },
  PACKAGING: {
    getAll: api.getPackagings,
    create: api.createPackaging,
    update: api.updatePackaging,
    delete: api.deletePackaging,
    getNextCode: api.getNextPackagingCode,
  },
  STEEL_GRADE: {
    getAll: api.getSteelGrades,
    create: api.createSteelGrade,
    update: api.updateSteelGrade,
    delete: api.deleteSteelGrade,
    getNextCode: api.getNextSteelGradeCode,
  },
  STEEL_THICKNESS: {
    getAll: api.getSteelThicknesses,
    create: api.createSteelThickness,
    update: api.updateSteelThickness,
    delete: api.deleteSteelThickness,
    getNextCode: api.getNextSteelThicknessCode,
  },
  SHIFT: {
    getAll: api.getShifts,
    create: api.createShift,
    update: api.updateShift,
    delete: api.deleteShift,
    getNextCode: api.getNextShiftCode,
  },
  HOLIDAY_CALENDAR: {
    getAll: api.getHolidayCalendars,
    create: api.createHolidayCalendar,
    update: api.updateHolidayCalendar,
    delete: api.deleteHolidayCalendar,
    getNextCode: api.getNextHolidayCalendarCode,
  },
  QUALITY_PARAM: {
    getAll: api.getQualityParameters,
    create: api.createQualityParameter,
    update: api.updateQualityParameter,
    delete: api.deleteQualityParameter,
    getNextCode: api.getNextQualityParameterCode,
  },
  DEFECT: {
    getAll: api.getDefects,
    create: api.createDefect,
    update: api.updateDefect,
    delete: api.deleteDefect,
    getNextCode: api.getNextDefectCode,
  },
  HSN: {
    getAll: api.getHsns,
    create: api.createHsn,
    update: api.updateHsn,
    delete: api.deleteHsn,
    getNextCode: api.getNextHsnCode,
  },
  TAX: {
    getAll: api.getTaxes,
    create: api.createTax,
    update: api.updateTax,
    delete: api.deleteTax,
    getNextCode: api.getNextTaxCode,
  },
  PAYMENT_TERMS: {
    getAll: api.getPaymentTerms,
    create: api.createPaymentTerm,
    update: api.updatePaymentTerm,
    delete: api.deletePaymentTerm,
    getNextCode: api.getNextPaymentTermCode,
  },
  UOM: {
    getAll: api.getUOMs,
    create: api.createUOM,
    update: api.updateUOM,
    delete: api.deleteUOM,
    getNextCode: api.getNextUOMCode,
  },
  REASON_CODE: {
    getAll: api.getReasonCodes,
    create: api.createReasonCode,
    update: api.updateReasonCode,
    delete: api.deleteReasonCode,
    getNextCode: api.getNextReasonCodeCode,
  },
  COUNTRY: {
    getAll: api.getCountries,
    create: api.createCountry,
    update: api.updateCountry,
    delete: api.deleteCountry,
    getNextCode: api.getNextCountryCode,
  },
  STATE: {
    getAll: api.getStates,
    create: api.createState,
    update: api.updateState,
    delete: api.deleteState,
    getNextCode: api.getNextStateCode,
  },
  CITY: {
    getAll: api.getCities,
    create: api.createCity,
    update: api.updateCity,
    delete: api.deleteCity,
    getNextCode: api.getNextCityCode,
  },
}

/* ─────────────────────────── Cell rendering ─────────────────────────── */

function renderValue(field: MasterField, value: string | number | boolean | null) {
  if (value === null || value === '' || value === undefined) {
    return <span className="text-2xs text-fg-subtle">—</span>
  }
  switch (field.type) {
    case 'boolean':
      return value ? <Badge tone="success" size="sm">Yes</Badge> : <span className="text-2xs text-fg-subtle">No</span>
    case 'colour':
      return (
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 shrink-0 rounded border border-border-strong" style={{ background: String(value) }} />
          <span className="font-mono text-2xs text-fg-muted">{String(value)}</span>
        </span>
      )
    case 'number':
      return (
        <span className="tabular">
          {value}
          {field.suffix && <span className="ml-0.5 text-fg-subtle">{field.suffix}</span>}
        </span>
      )
    case 'select':
      return <span className="text-xs">{String(value).replace(/_/g, ' ').toLowerCase()}</span>
    default:
      return (
        <span className="text-xs">
          {String(value)}
          {field.suffix && <span className="ml-0.5 text-fg-subtle">{field.suffix}</span>}
        </span>
      )
  }
}

/* ─────────────────────────── Record form ─────────────────────────── */

type FormState = {
  code: string
  name: string
  effectiveFrom: string
  effectiveTo: string
  values: Record<string, string | number | boolean | null>
}

function emptyForm(def: SimpleMasterDef): FormState {
  const values: FormState['values'] = {}
  for (const f of def.fields) values[f.key] = f.type === 'boolean' ? false : ''
  return { code: '', name: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '', values }
}

function formFromRow(row: SimpleMasterRow): FormState {
  return {
    code: row.code,
    name: row.name,
    effectiveFrom: row.effectiveFrom.slice(0, 10),
    effectiveTo: row.effectiveTo?.slice(0, 10) ?? '',
    values: { ...row.values },
  }
}

function RecordForm({
  def,
  form,
  setForm,
  isEdit,
  errors,
}: {
  def: SimpleMasterDef
  form: FormState
  setForm: (f: FormState) => void
  isEdit: boolean
  errors: Record<string, string>
}) {
  const setVal = (key: string, v: string | number | boolean | null) =>
    setForm({ ...form, values: { ...form.values, [key]: v } })

  const is3Col = def.code === 'BOTTLE_MODEL'
  const is2ColGrid = def.code === 'BOTTLE_CAPACITY' || def.code === 'LID_TYPE' || def.code === 'STEEL_GRADE' || def.code === 'COUNTRY' || def.code === 'STATE' || def.code === 'CITY'
  const containerClass = is3Col ? "grid grid-cols-3 gap-4" : is2ColGrid ? "grid grid-cols-2 gap-4" : "space-y-3.5"
  const rowClass = (is3Col || is2ColGrid) ? "contents" : "grid grid-cols-2 gap-3"

  return (
    <div className={containerClass}>
      <div className={rowClass}>
        <Input
          label="Code"
          required={!def.autoCode}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          disabled={def.autoCode}
          readOnly={isEdit && !def.autoCode}
          error={errors.code}
          className="font-mono"
          hint={isEdit ? 'Immutable once transactions reference it.' : def.autoCode ? `Auto-generated as ${def.codePrefix}-nnnn.` : undefined}
        />
        <Input
          label="Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
        />
      </div>

      {def.fields.map((f) => {
        const v = form.values[f.key]
        if (f.type === 'boolean') {
          return <Switch key={f.key} checked={!!v} onChange={(b) => setVal(f.key, b)} label={f.label} />
        }
        if (f.type === 'select') {
          return (
            <Select
              key={f.key}
              label={f.label}
              required={f.required}
              value={v == null ? '' : String(v)}
              onChange={(e) => setVal(f.key, e.target.value)}
              error={errors[f.key]}
              hint={f.hint}
              options={[
                { value: '', label: '— select —' },
                ...(f.options ?? []).map((o) => ({ value: o, label: o.replace(/_/g, ' ').toLowerCase() })),
              ]}
            />
          )
        }
        if (f.type === 'textarea') {
          return (
            <Textarea
              key={f.key}
              label={f.label}
              rows={3}
              value={v == null ? '' : String(v)}
              onChange={(e) => setVal(f.key, e.target.value)}
              hint={f.hint}
            />
          )
        }
        if (f.type === 'colour') {
          return (
            <div key={f.key}>
              <p className="field-label">{f.label}</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={v ? String(v) : '#888888'}
                  onChange={(e) => setVal(f.key, e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border border-border bg-surface p-1"
                />
                <Input
                  value={v == null ? '' : String(v)}
                  onChange={(e) => setVal(f.key, e.target.value)}
                  className="font-mono"
                  containerClassName="flex-1"
                />
              </div>
            </div>
          )
        }
        return (
          <Input
            key={f.key}
            label={f.label}
            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            required={f.required}
            value={v == null ? '' : String(v)}
            onChange={(e) => setVal(f.key, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
            error={errors[f.key]}
            hint={f.hint}
          />
        )
      })}

      <div className={rowClass}>
        <Input
          label="Effective from"
          type="date"
          required
          value={form.effectiveFrom}
          onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
        />
        <Input
          label="Effective to"
          type="date"
          value={form.effectiveTo}
          onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
          hint="Blank = open ended"
        />
      </div>
    </div>
  )
}

/* ─────────────────────────── Page ─────────────────────────── */

export function SimpleMasterPage() {
  const { pathname } = useLocation()
  const toast = useToast()
  const def = SIMPLE_MASTER_BY_ROUTE[pathname] as SimpleMasterDef | undefined
  const isApiBacked = !!(def && API_BACKED_MASTERS.has(def.code))
  const queryClient = useQueryClient()

  // ── Mock path (all masters except API-backed ones) ───────────
  type Row = SimpleMasterRow & { deletedAt?: string | null }
  const seed = useMemo(() => (def?.rows ?? []) as Row[], [def])
  const { rows: mockRows, deletedCount, create: mockCreate, update: mockUpdate, remove: mockRemove, resetToSeed } = useCollection<Row>(
    `master:${def?.code ?? 'none'}`,
    seed,
  )

  // ── API path (BOTTLE_MODEL etc.) ─────────────────────────────
  const apiMethods = def ? API_METHODS[def.code] : undefined
  const { data: apiRawRows = [] } = useQuery({
    queryKey: ['simple-master', def?.code],
    queryFn: () => apiMethods!.getAll(),
    enabled: isApiBacked && !!apiMethods,
  })
  const apiRows: SimpleMasterRow[] = useMemo(
    () => (isApiBacked && def ? apiRawRows.map((r: any) => apiRowToSimpleRow(r, def)) : []),
    [apiRawRows, isApiBacked, def],
  )

  const apiCreateMutation = useMutation({
    mutationFn: (data: any) => apiMethods!.create(data),
    onSuccess: () => { queryClient?.invalidateQueries({ queryKey: ['simple-master', def?.code] }); toast.success('Created') },
    onError: () => toast.error('Failed to create'),
  })
  const apiUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: any; data: any }) => apiMethods!.update(id, data),
    onSuccess: () => { queryClient?.invalidateQueries({ queryKey: ['simple-master', def?.code] }); toast.success('Updated') },
    onError: () => toast.error('Failed to update'),
  })
  const apiDeleteMutation = useMutation({
    mutationFn: (id: any) => apiMethods!.delete(id),
    onSuccess: () => { queryClient?.invalidateQueries({ queryKey: ['simple-master', def?.code] }); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  // ── Unified rows ─────────────────────────────────────────────
  const liveRows = isApiBacked ? apiRows : mockRows

  const [detail, setDetail] = useState<SimpleMasterRow | null>(null)
  const [editing, setEditing] = useState<SimpleMasterRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => (def ? emptyForm(def) : { code: '', name: '', effectiveFrom: '', effectiveTo: '', values: {} }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [statusFilter, setStatusFilter] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<SimpleMasterRow | null>(null)

  useEffect(() => {
    if (def) setForm(emptyForm(def))
    setStatusFilter('')
    setDetail(null)
  }, [def])

  const rows = useMemo(
    () => liveRows.filter((r) => !statusFilter || r.status === statusFilter),
    [liveRows, statusFilter],
  )

  const columns: Column<SimpleMasterRow>[] = useMemo(() => {
    if (!def) return []
    const listFields = def.fields.filter((f) => f.inList)
    return [
      { key: 'code', header: 'Code', sortable: true, sticky: true, width: '150px', accessor: (r) => r.code, render: (r) => <span className="font-mono text-2xs font-medium text-fg whitespace-nowrap">{r.code}</span> },
      { key: 'name', header: def.singular, sortable: true, width: '230px', accessor: (r) => r.name, render: (r) => <span className="text-xs font-medium text-fg">{r.name}</span> },
      ...listFields.map<Column<SimpleMasterRow>>((f) => ({
        key: f.key,
        header: f.label,
        width: f.width,
        align: f.align,
        sortable: true,
        accessor: (r) => {
          const v = r.values[f.key]
          return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : (v as string | number | null)
        },
        render: (r) => renderValue(f, r.values[f.key] ?? null),
      })),
      { key: 'usageCount', header: 'Used by', align: 'right', sortable: true, width: '100px', accessor: (r) => r.usageCount, render: (r) => <span className={r.usageCount ? 'tabular' : 'text-fg-subtle tabular'}>{r.usageCount}</span> },
      { key: 'status', header: 'Status', sortable: true, width: '130px', accessor: (r) => r.status, render: (r) => <MasterStatusBadge status={r.status} size="sm" /> },
      { key: 'modifiedAt', header: 'Modified', sortable: true, width: '160px', defaultHidden: true, accessor: (r) => formatDate(r.modifiedAt), render: (r) => <span className="text-2xs text-fg-muted">{formatDate(r.modifiedAt)} · {r.modifiedBy}</span> },
    ]
  }, [def])

  if (!def) {
    return (
      <div>
        <PageHeader title="Master not found" breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }]} />
        <Alert tone="warning" title="No master is registered at this route" />
      </div>
    )
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */

  function validate(f: FormState, isEdit: boolean): Record<string, string> {
    const e: Record<string, string> = {}
    if (!isEdit && !def!.autoCode && !f.code.trim()) e.code = 'Code is required.'
    if (!isEdit && f.code.trim() && liveRows.some((r) => r.code.toLowerCase() === f.code.trim().toLowerCase())) {
      e.code = 'This code already exists.'
    }
    if (!f.name.trim()) e.name = 'Name is required.'
    for (const fd of def!.fields) {
      if (fd.required) {
        const v = f.values[fd.key]
        if (v === '' || v === null || v === undefined) e[fd.key] = `${fd.label} is required.`
      }
    }
    return e
  }

  async function openNew() {
    setEditing(null)
    const newF = emptyForm(def!)
    if (def!.autoCode && isApiBacked && apiMethods?.getNextCode) {
      try {
        const { nextCode } = await apiMethods.getNextCode()
        newF.code = nextCode
      } catch (err) {
        toast.error('Failed to get next code')
      }
    }
    setForm(newF)
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(row: SimpleMasterRow) {
    setEditing(row)
    setForm(formFromRow(row))
    setErrors({})
    setFormOpen(true)
    setDetail(null)
  }

  function save() {
    const e = validate(form, !!editing)
    setErrors(e)
    if (Object.keys(e).length) {
      toast.error('Cannot save', `${Object.keys(e).length} field needs attention.`)
      return
    }

    const nextStatus: MasterStatus = def!.requiresApproval ? 'PENDING_APPROVAL' : 'ACTIVE'

    if (editing) {
      if (isApiBacked) {
        apiUpdateMutation.mutate({ id: editing.uid, data: simpleRowToApiPayload(form, def!) })
        setFormOpen(false)
        return
      }
      mockUpdate(editing.uid, {
        code: form.code,
        name: form.name,
        effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null,
        values: { ...form.values },
        revision: editing.revision + 1,
        modifiedBy: 'You',
        status: editing.status === 'ACTIVE' && def!.requiresApproval ? 'PENDING_APPROVAL' : editing.status,
      } as Partial<SimpleMasterRow>)
      toast.success('Saved', `${form.code} updated to revision ${editing.revision + 1}.`)
    } else {
      if (isApiBacked) {
        apiCreateMutation.mutate(simpleRowToApiPayload(form, def!))
        setFormOpen(false)
        return
      }
      const code = form.code.trim() || `${def!.codePrefix}-${String(liveRows.length + 1).padStart(4, '0')}`
      create({
        uid: newUid('smr'),
        code,
        name: form.name.trim(),
        status: nextStatus,
        effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null,
        revision: 1,
        usageCount: 0,
        modifiedBy: 'You',
        modifiedAt: new Date().toISOString(),
        values: form.values,
      } as Row)
      toast.success(
        def!.requiresApproval ? 'Submitted for approval' : 'Created',
        `${code} — ${form.name}`,
      )
    }
    setFormOpen(false)
  }

  function doDelete(row: SimpleMasterRow) {
    if (row.usageCount > 0) {
      toast.error('Cannot delete', `${row.usageCount} transactions reference this record. Deactivate it instead.`)
      return
    }
    if (isApiBacked) {
      apiDeleteMutation.mutate(row.uid)
    } else {
      remove(row.uid)
      toast.success('Deleted', `${row.code} removed. Soft delete — the row is retained with a deletion stamp.`)
    }
    setConfirmDelete(null)
    setDetail(null)
  }

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, def!.code.toLowerCase(), def!.title, columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : 'Unknown error.')
    }
  }

  const active = liveRows.filter((r) => r.status === 'ACTIVE').length
  const pending = liveRows.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'SUBMITTED' || r.status === 'DRAFT').length

  return (
    <div>
      <PageHeader
        title={def.title}
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: def.category }, { label: def.title }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => toast.info('Import', 'Use Masters → Import & export.')}>
              Import
            </Button>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => doExport('xlsx')}>
              Export
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
              New
            </Button>
          </>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder={`Code, ${def.singular.toLowerCase()} or attribute…`}
        pageSize={20}
        onRowClick={setDetail}
        onExport={doExport}
        filterChips={statusFilter ? [{ key: 's', label: 'Status', value: statusFilter, onRemove: () => setStatusFilter('') }] : []}
        onClearFilters={() => setStatusFilter('')}
        toolbar={
          <div className="flex items-center gap-2">
            <Select
              sizeVariant="sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'DRAFT', label: 'Draft' },
                { value: 'PENDING_APPROVAL', label: 'Pending approval' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
            />
            {deletedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => { resetToSeed(); toast.success('Restored', 'This master has been reset to its original data.') }}
              >
                Restore deleted ({deletedCount})
              </Button>
            )}
          </div>
        }
        rowActions={(r) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem label="Edit" onClick={() => openEdit(r)} />
            <MenuItem
              label="Duplicate"
              onClick={() => {
                setEditing(null)
                setForm({ ...formFromRow(r), code: '', name: `${r.name} (copy)` })
                setErrors({})
                setFormOpen(true)
              }}
            />
            <MenuItem
              label={r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              onClick={() => {
                const nextStatus = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                if (isApiBacked) {
                  apiUpdateMutation.mutate({ id: r.uid, data: { status: nextStatus } })
                } else {
                  mockUpdate(r.uid, { status: nextStatus } as Partial<SimpleMasterRow>)
                  toast.success(r.status === 'ACTIVE' ? 'Deactivated' : 'Activated', r.code)
                }
              }}
            />
            <MenuItem
              label={r.usageCount > 0 ? `Delete — blocked (${r.usageCount} refs)` : 'Delete'}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              danger
              separatorBefore
              disabled={r.usageCount > 0}
              onClick={() => setConfirmDelete(r)}
            />
          </>
        )}
        emptyTitle={`No ${def.title.toLowerCase()} yet`}
        emptyDescription={`Create the first ${def.singular.toLowerCase()}.`}
        emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openNew}>New {def.singular.toLowerCase()}</Button>}
      />

      {/* Detail */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.code} — ${detail.name}` : undefined}
        width="max-w-xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <MasterStatusBadge status={detail.status} />
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  disabled={detail.usageCount > 0}
                  onClick={() => setConfirmDelete(detail)}
                >
                  Delete
                </Button>
                <Button variant="primary" size="sm" onClick={() => openEdit(detail)}>Edit</Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Details" />
              <CardBody>
                <DataGrid
                  columns={2}
                  items={[
                    { label: 'Code', value: detail.code, mono: true },
                    { label: def.singular, value: detail.name },
                    ...def.fields.map((f) => ({ label: f.label, value: renderValue(f, detail.values[f.key] ?? null) })),
                    { label: 'Effective from', value: formatDate(detail.effectiveFrom) },
                    { label: 'Effective to', value: detail.effectiveTo ? formatDate(detail.effectiveTo) : 'Open ended' },
                    { label: 'Revision', value: `Rev ${detail.revision}` },
                    { label: 'Used by', value: `${detail.usageCount} transactions` },
                    { label: 'Last modified', value: `${detail.modifiedBy} · ${formatDateTime(detail.modifiedAt)}` },
                  ]}
                />
              </CardBody>
            </Card>

            {detail.usageCount > 0 && (
              <Alert tone="warning" title="Referenced by transactions">
                {detail.usageCount} documents point at this record, so it cannot be deleted. Deactivate
                it instead — existing documents keep working, and it stops appearing in new ones.
              </Alert>
            )}
          </div>
        )}
      </Drawer>

      {/* Create / edit */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="md"
        title={editing ? `Edit ${def.singular.toLowerCase()}` : `New ${def.singular.toLowerCase()}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : def.requiresApproval ? 'Submit for approval' : 'Create'}
            </Button>
          </>
        }
      >
        <RecordForm def={def} form={form} setForm={setForm} isEdit={!!editing} errors={errors} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && doDelete(confirmDelete)}
        title={`Delete ${confirmDelete?.code ?? ''}`}
        confirmLabel="Delete"
        message="Are you sure you want to delete this record?"
      />
    </div>
  )
}
