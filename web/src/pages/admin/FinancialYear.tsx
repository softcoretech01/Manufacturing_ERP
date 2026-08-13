import { useEffect, useState } from 'react'
import { CalendarRange, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { FinancialYear } from '@/api/organisation'
import {
  useFinancialYears,
  useFinancialYearPeriods,
  useCreateFinancialYear,
  useSetCurrentFinancialYear,
} from '@/hooks/useOrganisation'

interface Period {
  uid: string
  period_no: number
  name: string
  start_date: string
  end_date: string
}

const statusTone = (s: string): 'success' | 'neutral' | 'warning' =>
  s === 'OPEN' ? 'success' : s === 'CLOSED' ? 'neutral' : 'warning'

export function FinancialYearPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useFinancialYears()
  const setCurrent = useSetCurrentFinancialYear()

  const years = data ?? []
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    if (!selectedUid && years.length) setSelectedUid(years.find((y) => y.is_current)?.uid ?? years[0].uid)
  }, [selectedUid, years])

  const periodsQ = useFinancialYearPeriods(selectedUid ?? undefined)
  const periods = (periodsQ.data as Period[] | undefined) ?? []

  function makeCurrent(y: FinancialYear) {
    setCurrent.mutate(y.uid, {
      onSuccess: () => toast.success('Current year set', `${y.code} is now the current financial year.`),
      onError: (e) => toast.error('Failed', e instanceof ProblemError ? e.problem.detail : 'Could not set current.'),
    })
  }

  return (
    <div>
      <PageHeader
        title="Financial year & periods"
        description="Financial years and their monthly accounting periods. Years must not overlap; each generates 12 periods automatically."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Financial year' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>New financial year</Button>}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load financial years">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* ── Years ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader title="Financial years" description={`${years.length} total`} />
          {isLoading ? (
            <p className="px-4 py-8 text-center text-xs text-fg-subtle">Loading…</p>
          ) : years.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-fg-subtle">No financial years yet — create one.</p>
          ) : (
            <table className="grid-table">
              <thead>
                <tr><th className="w-28">Code</th><th className="w-28">Start</th><th className="w-28">End</th><th className="w-24">Status</th><th className="w-24">Current</th><th /></tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr
                    key={y.uid}
                    className={cn('cursor-pointer', y.uid === selectedUid && 'bg-brand-500/5')}
                    onClick={() => setSelectedUid(y.uid)}
                  >
                    <td className="font-mono text-xs font-medium">{y.code}</td>
                    <td className="text-xs">{formatDate(y.start_date)}</td>
                    <td className="text-xs">{formatDate(y.end_date)}</td>
                    <td><Badge tone={statusTone(y.status)} size="sm">{y.status.toLowerCase()}</Badge></td>
                    <td>{y.is_current && <Badge tone="brand" size="sm">Current</Badge>}</td>
                    <td className="text-right">
                      {!y.is_current && (
                        <Button size="xs" variant="outline" loading={setCurrent.isPending}
                          onClick={(e) => { e.stopPropagation(); makeCurrent(y) }}>
                          Set current
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="border-t border-border p-3">
            <Alert tone="info">
              Multiple years can be open at once (Indian practice closes audit months after year-end).
              Per-module period closing lives in the Finance module.
            </Alert>
          </div>
        </Card>

        {/* ── Periods of the selected year ─────────────────────────────── */}
        <Card>
          <CardHeader
            title="Accounting periods"
            description={selectedUid ? years.find((y) => y.uid === selectedUid)?.code : 'Select a year'}
          />
          {periodsQ.isLoading ? (
            <p className="px-4 py-8 text-center text-xs text-fg-subtle">Loading periods…</p>
          ) : periods.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-fg-subtle">
              <CalendarRange className="mx-auto mb-2 h-5 w-5 opacity-40" />
              No periods to show.
            </div>
          ) : (
            <table className="grid-table">
              <thead>
                <tr><th className="w-16">#</th><th>Period</th><th className="w-32">Start</th><th className="w-32">End</th></tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.uid}>
                    <td className="tabular text-xs text-fg-subtle">{p.period_no}</td>
                    <td className="text-xs font-medium text-fg">{p.name}</td>
                    <td className="text-xs">{formatDate(p.start_date)}</td>
                    <td className="text-xs">{formatDate(p.end_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <NewFinancialYearModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={(uid) => setSelectedUid(uid)} />
    </div>
  )
}

/* ─────────────────────────── New FY modal ─────────────────────────── */
function NewFinancialYearModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (uid: string) => void }) {
  const toast = useToast()
  const createFy = useCreateFinancialYear()
  const [form, setForm] = useState({ code: '', start_date: '', end_date: '', is_current: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  useEffect(() => {
    if (open) {
      setForm({ code: '', start_date: '', end_date: '', is_current: false })
      setErrors({})
    }
  }, [open])

  function submit() {
    setErrors({})
    // Immediate feedback: the server also enforces this (validate_fy_dates).
    if (form.start_date && form.end_date && form.end_date <= form.start_date) {
      setErrors({ end_date: 'End date must be after the start date.' })
      return
    }
    createFy.mutate(
      { code: form.code.trim(), start_date: form.start_date, end_date: form.end_date, is_current: form.is_current },
      {
        onSuccess: (fy) => {
          toast.success('Financial year created', `${fy.code} — 12 monthly periods generated.`)
          onCreated(fy.uid)
          onClose()
        },
        onError: (e) => {
          if (e instanceof ProblemError) {
            const fe: Record<string, string> = {}
            for (const x of e.problem.errors ?? []) fe[x.field] = x.message
            setErrors(fe)
            toast.error(e.problem.title || 'Create failed', e.problem.detail)
          } else {
            toast.error('Create failed', 'Unknown error.')
          }
        },
      },
    )
  }

  const valid = form.code.trim() && form.start_date && form.end_date

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New financial year"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={createFy.isPending} disabled={!valid}>Create</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Input label="Code" required value={form.code} error={errors.code} maxLength={20}
          placeholder="FY27-28" onChange={(e) => set({ code: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start date" type="date" required value={form.start_date} error={errors.start_date}
            onChange={(e) => set({ start_date: e.target.value })} />
          <Input label="End date" type="date" required value={form.end_date} error={errors.end_date}
            onChange={(e) => set({ end_date: e.target.value })} />
        </div>
        <Switch checked={form.is_current} onChange={(v) => set({ is_current: v })} label="Make this the current financial year" />
        <Alert tone="info">
          Years must not overlap an existing one. Monthly accounting periods are generated automatically on
          the server from the date range.
        </Alert>
        {form.is_current && (
          <p className="flex items-center gap-1.5 text-2xs text-fg-muted">
            <Check className="h-3 w-3 text-success" /> Any other current year will be switched off.
          </p>
        )}
      </div>
    </Modal>
  )
}
