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
import { newUid, useCollection, useDataStore } from '@/store/data'
import { SIMPLE_MASTER_BY_ROUTE, SIMPLE_MASTER_BY_CODE } from '@/mock/masterRegistry'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MasterField, MasterStatus, SimpleMasterDef, SimpleMasterRow } from '@/types/masters'
import * as api from '@/api/masters'

/* ── Codes that use a live API instead of mock data ─────────── */
const API_BACKED_MASTERS = new Set(['BOTTLE_MODEL', 'BOTTLE_CAPACITY', 'BOTTLE_COLOUR', 'LID_TYPE', 'PACKAGING', 'STEEL_GRADE', 'STEEL_THICKNESS', 'SHIFT', 'HOLIDAY_CALENDAR', 'QUALITY_PARAM', 'DEFECT', 'HSN', 'TAX', 'PAYMENT_TERMS', 'UOM', 'REASON_CODE', 'COUNTRY', 'STATE', 'CITY'])

/* ── Shared column widths: every one of these masters stores `Code` as
      VARCHAR(50) and `Name` as VARCHAR(150). ──────────────────── */
const CODE_MAX_LENGTH = 50
const NAME_MAX_LENGTH = 150
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const MINUTES_PER_DAY = 24 * 60
const DAYS_IN_YEAR = 366

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * Rules that involve more than one field, mirroring the server's own checks.
 * Skipped for any field that already has a single-field error.
 */
function crossFieldErrors(
  code: string,
  f: FormState,
  existing: Record<string, string>,
): Record<string, string> {
  const e: Record<string, string> = {}
  const v = f.values

  if (code === 'SHIFT') {
    const start = String(v.startTime ?? '')
    const end = String(v.endTime ?? '')
    if (!HHMM.test(start) || !HHMM.test(end)) return e

    const s = minutesOf(start)
    const t = minutesOf(end)
    if (s === t) {
      e.endTime = 'Start and end cannot be the same time.'
      return e
    }
    const wraps = t < s
    if (v.crossesMidnight !== undefined && v.crossesMidnight !== null && !!v.crossesMidnight !== wraps) {
      e.crossesMidnight = wraps
        ? 'This shift ends the next day — tick "crosses midnight".'
        : 'This shift ends the same day — untick "crosses midnight".'
    }
    const span = wraps ? MINUTES_PER_DAY - s + t : t - s
    const brk = v.breakMinutes === '' || v.breakMinutes === null || v.breakMinutes === undefined
      ? null
      : Number(v.breakMinutes)
    if (brk !== null && !existing.breakMinutes && brk >= span) {
      e.breakMinutes = `Breaks must be shorter than the ${(span / 60).toFixed(2)}h shift.`
    }
    const worked = (span - (brk ?? 0)) / 60
    const net = v.netHours === '' || v.netHours === null || v.netHours === undefined
      ? null
      : Number(v.netHours)
    if (net !== null && !existing.netHours && Math.abs(net - worked) > 0.02) {
      e.netHours = `Net hours should be ${worked.toFixed(2)} (shift span less breaks).`
    }
  }

  if (code === 'HOLIDAY_CALENDAR') {
    const num = (x: unknown) => (x === '' || x === null || x === undefined ? 0 : Number(x))
    const holidays = num(v.holidayCount)
    const national = num(v.nationalCount)
    const working = num(v.workingDays)
    if (!existing.nationalCount && national > holidays) {
      e.nationalCount = 'National holidays cannot exceed total holidays.'
    }
    if (!existing.workingDays && holidays + working > DAYS_IN_YEAR) {
      e.workingDays = `Holidays plus working days cannot exceed ${DAYS_IN_YEAR}.`
    }
  }

  return e
}

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
  // The generated clients resolve to the parsed body (undefined on 204), not void.
  delete: (id: any) => Promise<unknown>
  getNextCode?: () => Promise<{ nextCode?: string; code?: string }>
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

/**
 * Enum-style codes (RAW_MATERIAL) are prettified to "raw material"; option
 * values that are already human phrases (e.g. "Production Item Category") are
 * shown as-is so their intended capitalisation is preserved.
 */
// Enum constants (ON_HOLD) read better prettified; identifiers pulled from another
// master (a plant code such as PL0001) must keep their exact casing.
const prettyOption = (o: string) => (/^[A-Z0-9_]+$/.test(o) ? o.replace(/_/g, ' ').toLowerCase() : o)
const optionLabel = (o: string, isLiveSource: boolean) => (isLiveSource ? o : prettyOption(o))

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
      return <span className="text-xs">{optionLabel(String(value), !!field.optionsFrom)}</span>
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
  dynamicOptions = {},
}: {
  def: SimpleMasterDef
  form: FormState
  setForm: (f: FormState) => void
  isEdit: boolean
  errors: Record<string, string>
  dynamicOptions?: Record<string, string[]>
}) {
  const setVal = (key: string, v: string | number | boolean | null) => {
    const values = { ...form.values, [key]: v }
    // A shift crosses midnight exactly when it ends before it starts — it is
    // derived, not a judgement call, so keep the toggle in step with the times.
    if (def.code === 'SHIFT' && (key === 'startTime' || key === 'endTime')) {
      const start = String(values.startTime ?? '')
      const end = String(values.endTime ?? '')
      if (HHMM.test(start) && HHMM.test(end)) {
        values.crossesMidnight = minutesOf(end) < minutesOf(start)
      }
    }
    setForm({ ...form, values })
  }

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
          // Switch has no error slot of its own, so render one beneath it —
          // otherwise a failing toggle blocks save with nothing on screen.
          return (
            <div key={f.key}>
              <Switch checked={!!v} onChange={(b) => setVal(f.key, b)} label={f.label} />
              {errors[f.key] ? (
                <p className="mt-1 text-2xs text-danger">{errors[f.key]}</p>
              ) : f.hint ? (
                <p className="mt-1 text-2xs text-fg-subtle">{f.hint}</p>
              ) : null}
            </div>
          )
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
                ...(f.optionsFrom ? (dynamicOptions[f.optionsFrom] ?? f.options ?? []) : (f.options ?? [])).map((o) => ({ value: o, label: optionLabel(o, !!f.optionsFrom) })),
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
            // The browser stops most bad input at the keyboard; validate() is
            // still the gate, and the API is the authority.
            maxLength={f.type === 'number' ? undefined : f.maxLength}
            min={f.type === 'number' ? f.min : undefined}
            max={f.type === 'number' ? f.max : undefined}
            step={f.type === 'number' ? (f.step ?? (f.integer ? 1 : undefined)) : undefined}
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
  // Product Engineering masters are reference/dropdown data: delete is never
  // usage-blocked, and the detail view opens only from the View icon.
  const isProductEng = !!def && (def.category === 'Product Engineering' || def.category === 'Product')
  const queryClient = useQueryClient()

  // ── Mock path (all masters except API-backed ones) ───────────
  type Row = SimpleMasterRow & { deletedAt?: string | null }
  const seed = useMemo(() => (def?.rows ?? []) as Row[], [def])
  const { rows: mockRows, deletedCount, create: mockCreate, update: mockUpdate, remove: mockRemove, resetToSeed } = useCollection<Row>(
    `master:${def?.code ?? 'none'}${def?.seedVersion ? `:v${def.seedVersion}` : ''}`,
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

  // ── Live dropdown options sourced from other masters (field.optionsFrom) ────
  const optionSourceCodes = useMemo(
    () => (def ? [...new Set(def.fields.filter((f) => f.optionsFrom).map((f) => f.optionsFrom as string))] : []),
    [def],
  )
  const { data: dynamicOptions = {} } = useQuery({
    queryKey: ['master-options', optionSourceCodes],
    enabled: optionSourceCodes.length > 0,
    queryFn: async () => {
      const map: Record<string, string[]> = {}
      for (const code of optionSourceCodes) {
        // Not a master in the registry — the live plant list, plus the ALL sentinel
        // meaning "every plant". Stored as the plant code, so that is what we offer.
        if (code === 'PLANT_CODES') {
          const plants = await api.getProductionPlants()
          map[code] = ['ALL', ...plants.map((p: any) => p.code).filter(Boolean)]
          continue
        }
        const methods = API_METHODS[code]
        if (methods) {
          const rows = await methods.getAll()
          map[code] = rows.map((r: any) => r.name ?? r.Name).filter(Boolean)
        } else {
          const mdef = SIMPLE_MASTER_BY_CODE[code]
          const key = `master:${code}${mdef?.seedVersion ? `:v${mdef.seedVersion}` : ''}`
          const stored = useDataStore.getState().collections[key] as any[] | undefined
          const rows = (stored && stored.length ? stored : (mdef?.rows ?? [])) as any[]
          map[code] = rows.filter((r) => !r.deletedAt).map((r) => r.name).filter(Boolean)
        }
      }
      return map
    },
  })

  /**
   * Surface what the server actually objected to. Rules the client cannot check
   * (uniqueness, one-calendar-per-plant-per-year) are only known server-side, so
   * a bare "Failed to create" leaves the user with no way forward. Field errors
   * are pinned to their inputs and the form is reopened.
   */
  const reportApiError = (err: any, fallback: string) => {
    const problem = err?.problem
    const list = problem?.errors
    if (Array.isArray(list) && list.length) {
      const mapped: Record<string, string> = {}
      for (const item of list) {
        const field = String(item.field ?? '').split('.').pop() ?? ''
        if (field) mapped[field] = item.message ?? 'Invalid value.'
      }
      if (Object.keys(mapped).length) {
        setErrors(mapped)
        setFormOpen(true)
        toast.error(fallback, list[0]?.message ?? problem?.detail)
        return
      }
    }
    toast.error(fallback, problem?.detail ?? err?.message)
  }

  const apiCreateMutation = useMutation({
    mutationFn: (data: any) => apiMethods!.create(data),
    onSuccess: () => { queryClient?.invalidateQueries({ queryKey: ['simple-master', def?.code] }); toast.success('Created') },
    onError: (err) => reportApiError(err, 'Failed to create'),
  })
  const apiUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: any; data: any }) => apiMethods!.update(id, data),
    onSuccess: () => { queryClient?.invalidateQueries({ queryKey: ['simple-master', def?.code] }); toast.success('Updated') },
    onError: (err) => reportApiError(err, 'Failed to update'),
  })
  const apiDeleteMutation = useMutation({
    mutationFn: (id: any) => apiMethods!.delete(id),
    onSuccess: () => { queryClient?.invalidateQueries({ queryKey: ['simple-master', def?.code] }); toast.success('Deleted') },
    onError: (err) => reportApiError(err, 'Failed to delete'),
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
    // Product Engineering masters are pure reference/dropdown data — no status or usage columns.
    const isProductEng = def.category === 'Product Engineering' || def.category === 'Product'
    const hideStatus = isProductEng
    const hideUsage = def.hideUsage || isProductEng
    return [
      { key: 'sno', header: 'S.no', width: '60px', render: (_, i) => <span className="text-2xs text-fg-subtle">{i + 1}</span> },
      { key: 'code', header: 'Code', sortable: true, sticky: true, width: '150px', accessor: (r) => r.code, render: (r) => <span className="font-mono text-2xs font-medium text-fg whitespace-nowrap">{r.code}</span> },
      { key: 'name', header: def.nameHeader ?? def.singular, sortable: true, width: '230px', accessor: (r) => r.name, render: (r) => <span className="text-xs font-medium text-fg">{r.name}</span> },
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
      ...(hideUsage
        ? []
        : [{ key: 'usageCount', header: 'Used by', align: 'right' as const, sortable: true, width: '100px', accessor: (r: SimpleMasterRow) => r.usageCount, render: (r: SimpleMasterRow) => <span className={r.usageCount ? 'tabular' : 'text-fg-subtle tabular'}>{r.usageCount}</span> }]),
      ...(hideStatus
        ? []
        : [{ key: 'status', header: 'Status', sortable: true as const, width: '130px', accessor: (r: SimpleMasterRow) => r.status, render: (r: SimpleMasterRow) => <MasterStatusBadge status={r.status} size="sm" /> }]),
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
    const code = f.code.trim()

    /* ── Code and name: widths match the `Code`/`Name` columns these masters share. */
    if (!isEdit && !def!.autoCode && !code) e.code = 'Code is required.'
    if (code.length > CODE_MAX_LENGTH) e.code = `Code cannot exceed ${CODE_MAX_LENGTH} characters.`
    else if (code && !CODE_PATTERN.test(code)) {
      e.code = 'Code may use letters, digits, hyphen, underscore and slash only.'
    }
    if (!isEdit && code && liveRows.some((r) => r.code.toLowerCase() === code.toLowerCase())) {
      e.code = 'This code already exists.'
    }

    const name = f.name.trim()
    if (!name) e.name = 'Name is required.'
    else if (name.length < 2) e.name = 'Name must be at least 2 characters.'
    else if (name.length > NAME_MAX_LENGTH) e.name = `Name cannot exceed ${NAME_MAX_LENGTH} characters.`

    /* ── Effective dating. */
    if (f.effectiveFrom && f.effectiveTo && f.effectiveTo < f.effectiveFrom) {
      e.effectiveTo = 'Effective-to cannot be before effective-from.'
    }

    /* ── Per-field rules declared on the registry entry. */
    for (const fd of def!.fields) {
      const raw = f.values[fd.key]
      const isBlank = raw === '' || raw === null || raw === undefined

      if (fd.required && isBlank) {
        e[fd.key] = `${fd.label} is required.`
        continue
      }
      if (isBlank) continue

      if (fd.type === 'number') {
        const n = Number(raw)
        if (Number.isNaN(n)) {
          e[fd.key] = `${fd.label} must be a number.`
        } else if (fd.integer && !Number.isInteger(n)) {
          e[fd.key] = `${fd.label} must be a whole number.`
        } else if (fd.min !== undefined && n < fd.min) {
          e[fd.key] = `${fd.label} cannot be below ${fd.min}.`
        } else if (fd.max !== undefined && n > fd.max) {
          e[fd.key] = `${fd.label} cannot exceed ${fd.max}.`
        }
        continue
      }

      if (fd.type === 'select' && fd.options?.length && !fd.optionsFrom) {
        if (!fd.options.includes(String(raw))) e[fd.key] = `Choose a valid ${fd.label.toLowerCase()}.`
        continue
      }

      if (fd.type === 'text' || fd.type === 'textarea') {
        const s = String(raw).trim()
        if (fd.minLength !== undefined && s.length < fd.minLength) {
          e[fd.key] = `${fd.label} must be at least ${fd.minLength} characters.`
        } else if (fd.maxLength !== undefined && s.length > fd.maxLength) {
          e[fd.key] = `${fd.label} cannot exceed ${fd.maxLength} characters.`
        } else if (fd.pattern && !new RegExp(fd.pattern).test(s)) {
          e[fd.key] = fd.patternHint ?? `${fd.label} is not in the expected format.`
        }
      }
    }

    /* ── Rules spanning more than one field. */
    Object.assign(e, crossFieldErrors(def!.code, f, e))
    return e
  }

  async function openNew() {
    setEditing(null)
    const newF = emptyForm(def!)
    if (def!.autoCode && isApiBacked && apiMethods?.getNextCode) {
      try {
        const res = await apiMethods.getNextCode()
        newF.code = res?.nextCode ?? res?.code ?? ''
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

    const nextStatus: MasterStatus = 'ACTIVE'

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
        status: 'ACTIVE',
      } as Partial<SimpleMasterRow>)
      toast.success('Saved', `${form.code} updated to revision ${editing.revision + 1}.`)
    } else {
      if (isApiBacked) {
        apiCreateMutation.mutate(simpleRowToApiPayload(form, def!))
        setFormOpen(false)
        return
      }
      const code = form.code.trim() || `${def!.codePrefix}-${String(liveRows.length + 1).padStart(4, '0')}`
      mockCreate({
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
        'Created',
        `${code} — ${form.name}`,
      )
    }
    setFormOpen(false)
  }

  function doDelete(row: SimpleMasterRow) {
    if (!isProductEng && row.usageCount > 0) {
      toast.error('Cannot delete', `${row.usageCount} transactions reference this record. Deactivate it instead.`)
      return
    }
    if (isApiBacked) {
      apiDeleteMutation.mutate(row.uid)
    } else {
      mockRemove(row.uid)
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
        onRowClick={isProductEng ? undefined : setDetail}
        onExport={doExport}
        filterChips={statusFilter ? [{ key: 's', label: 'Status', value: statusFilter, onRemove: () => setStatusFilter('') }] : []}
        onClearFilters={() => setStatusFilter('')}
        toolbar={
          <div className="flex items-center gap-2">
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
            <MenuItem label="View" onClick={() => setDetail(r)} />
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
              label={!isProductEng && r.usageCount > 0 ? `Delete — blocked (${r.usageCount} refs)` : 'Delete'}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              danger
              separatorBefore
              disabled={!isProductEng && r.usageCount > 0}
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
                  disabled={!isProductEng && detail.usageCount > 0}
                  onClick={() => setConfirmDelete(detail)}
                >
                  Delete
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Back</Button>
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
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        <RecordForm def={def} form={form} setForm={setForm} isEdit={!!editing} errors={errors} dynamicOptions={dynamicOptions} />
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
