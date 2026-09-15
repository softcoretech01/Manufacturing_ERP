import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { api } from '@/api/client'
import { shopFloorApi, type OutputByResult } from '@/api/shopfloor'

/**
 * Shifts — the shift master, and what was actually booked on each one.
 *
 * Two honest halves. The master says which shifts exist and when they run. The
 * output is read from the production entries, every one of which carries the
 * shift code it was booked under.
 *
 * What this page cannot show is a shift log: who was on, what the handover
 * said, what went wrong. None of that is recorded anywhere, so it is named as
 * missing rather than filled in.
 */

interface ShiftRow {
  id: string
  code: string
  name: string
  startTime: string
  endTime: string
  breakMinutes: number
  netHours: number
  crossesMidnight: boolean
  nightAllowance: boolean
  effectiveFrom: string | null
  effectiveTo: string | null
  isActive: boolean
}

export function ShiftsPage() {
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [output, setOutput] = useState<OutputByResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<any>('/shifts').then((r) => (Array.isArray(r) ? r : r?.data ?? [])),
      shopFloorApi.outputBy('shift'),
    ])
      .then(([list, booked]) => {
        setShifts(list)
        setOutput(booked)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'),
      )
      .finally(() => setLoading(false))
  }, [])

  const active = shifts.filter((s) => s.isActive)
  const bookedFor = (code: string) => output?.rows.find((r) => r.key === code)
  /** Shift codes that appear on entries but not in the master. */
  const unknown = (output?.rows ?? []).filter(
    (r) => r.key !== '—' && !shifts.some((s) => s.code === r.key),
  )

  return (
    <div>
      <PageHeader
        title="Shifts"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Shifts' }]}
      />

      {error && (
        <Alert tone="danger" title="Shifts could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && <p className="mb-4 text-xs text-fg-muted">Loading…</p>}

      <Card className="mb-4">
        <CardHeader
          title="The shift master"
          description={`${active.length} active of ${shifts.length} defined`}
        />
        <CardBody className="p-0">
          {shifts.length ? (
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-24">Code</th>
                    <th>Name</th>
                    <th className="w-32">Runs</th>
                    <th className="w-24 text-right">Break</th>
                    <th className="w-24 text-right">Net hours</th>
                    <th className="w-28">Effective</th>
                    <th className="w-24">Status</th>
                    <th className="w-32 text-right">Booked on it</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s) => {
                    const b = bookedFor(s.code)
                    return (
                      <tr key={s.id} className={cn(!s.isActive && 'opacity-60')}>
                        <td className="font-mono text-2xs font-medium text-brand-600">{s.code}</td>
                        <td className="text-xs">{s.name}</td>
                        <td className="tabular text-2xs">
                          {s.startTime} → {s.endTime}
                          {s.crossesMidnight && <span className="ml-1 text-fg-subtle">(+1d)</span>}
                        </td>
                        <td className="text-right tabular text-2xs">{s.breakMinutes} min</td>
                        <td className="text-right tabular text-2xs">{s.netHours}</td>
                        <td className="text-2xs">{s.effectiveFrom ? formatDate(s.effectiveFrom) : '—'}</td>
                        <td>
                          <Badge tone={s.isActive ? 'success' : 'neutral'} size="sm">
                            {s.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="text-right tabular text-2xs">
                          {b ? <span className="text-success">{formatQty(b.goodQty)} good</span> : <span className="text-fg-subtle">nothing</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-xs text-fg-muted">No shift is defined in the master.</p>
          )}
        </CardBody>
      </Card>

      {output && output.rows.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Output by shift" description="Read from the production entries, which each name a shift" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-28">Shift</th>
                    <th className="w-24 text-right">Entries</th>
                    <th className="w-28 text-right">Good</th>
                    <th className="w-24 text-right">Scrap</th>
                    <th className="w-24 text-right">Yield</th>
                    <th className="w-28 text-right">Minutes run</th>
                    <th className="w-32">Booked between</th>
                  </tr>
                </thead>
                <tbody>
                  {output.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="font-mono text-2xs">{r.key}</td>
                      <td className="text-right tabular">{r.entries}</td>
                      <td className="text-right tabular text-success">{formatQty(r.goodQty)}</td>
                      <td className="text-right tabular text-danger">{formatQty(r.scrapQty)}</td>
                      <td className={cn('text-right tabular', (r.yieldPct ?? 100) < 95 && 'text-warning')}>
                        {r.yieldPct === null ? '—' : `${r.yieldPct}%`}
                      </td>
                      <td className="text-right tabular text-2xs">{r.runMinutes}</td>
                      <td className="text-2xs text-fg-muted">
                        {r.firstBooked ? formatDate(r.firstBooked) : '—'}
                        {r.lastBooked && r.lastBooked !== r.firstBooked ? ` → ${formatDate(r.lastBooked)}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {unknown.length > 0 && (
        <Alert tone="warning" title="Some entries carry a shift code the master does not define" className="mb-4">
          {unknown.map((r) => `"${r.key}" on ${r.entries} entr${r.entries === 1 ? 'y' : 'ies'}`).join(', ')}. A shift code is
          typed onto the entry rather than chosen from the master, so nothing stops a value that does not exist. The rows are
          shown as recorded.
        </Alert>
      )}

      {output && output.unavailable.length > 0 && (
        <Card>
          <CardHeader title="Not shown, and why" />
          <CardBody className="space-y-2">
            {output.unavailable.map((u) => (
              <div key={u.metric} className="rounded border border-border bg-surface-2 px-3 py-2">
                <p className="text-xs font-medium text-fg">{u.metric}</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-fg-muted">{u.reason}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
