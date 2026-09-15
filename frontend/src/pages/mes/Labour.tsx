import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { api, ProblemError } from '@/api/client'
import { shopFloorApi, type OutputByResult } from '@/api/shopfloor'

/**
 * Labour — what each operator actually booked.
 *
 * This is an output report, not a labour report, and the difference matters.
 * Every production entry names the operator who posted it, so output per
 * operator is a measurement. Hours present, utilisation and labour cost are
 * not: there is no attendance model and no operator rate, so booked minutes
 * say how long a job took, not how long anyone was at work.
 *
 * Nothing here is estimated from output. An operator who booked 1,000 pieces in
 * 55 minutes is shown exactly that way, with no inferred shift length behind
 * it.
 */

interface EmployeeRow {
  id: number
  code: string
  name: string
  designation?: string | null
  department?: string | null
  shiftCode?: string | null
  isShopFloor?: boolean | null
  status?: string | null
}

export function LabourPage() {
  const [output, setOutput] = useState<OutputByResult | null>(null)
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      shopFloorApi.outputBy('operator'),
      api.get<any>('/employees').then((r) => (Array.isArray(r) ? r : r?.data ?? [])).catch(() => []),
    ])
      .then(([booked, staff]) => {
        setOutput(booked)
        setEmployees(staff)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'),
      )
      .finally(() => setLoading(false))
  }, [])

  const shopFloor = employees.filter((e) => e.isShopFloor)
  const employeeFor = (code: string) => employees.find((e) => e.code === code)
  /** Operators who booked work but are not in the employee master. */
  const unknown = (output?.rows ?? []).filter((r) => r.key !== '—' && !employeeFor(r.key))

  return (
    <div>
      <PageHeader
        title="Labour"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Labour' }]}
      />

      {error && (
        <Alert tone="danger" title="Labour output could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && <p className="mb-4 text-xs text-fg-muted">Loading…</p>}

      <p className="mb-4 text-xs text-fg-muted">
        <span className="font-medium text-fg">{shopFloor.length}</span> shop-floor employee
        {shopFloor.length === 1 ? '' : 's'} of <span className="font-medium text-fg">{employees.length}</span> in the master ·{' '}
        <span className="font-medium text-fg">{output?.rows.length ?? 0}</span> operator
        {(output?.rows.length ?? 0) === 1 ? ' has' : 's have'} booked production. This is output per operator, not hours worked.
      </p>

      <Card className="mb-4">
        <CardHeader title="Output by operator" description="Read from the production entries, which each name who posted them" />
        <CardBody className="p-0">
          {output?.rows.length ? (
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-28">Code</th>
                    <th>Operator</th>
                    <th className="w-32">Role</th>
                    <th className="w-20 text-right">Entries</th>
                    <th className="w-28 text-right">Good</th>
                    <th className="w-24 text-right">Scrap</th>
                    <th className="w-24 text-right">Yield</th>
                    <th className="w-28 text-right">Minutes booked</th>
                    <th className="w-32">Between</th>
                  </tr>
                </thead>
                <tbody>
                  {output.rows.map((r) => {
                    const e = employeeFor(r.key)
                    return (
                      <tr key={r.key}>
                        <td className="font-mono text-2xs font-medium text-brand-600">{r.key}</td>
                        <td className="text-xs">{r.operatorName || e?.name || '—'}</td>
                        <td className="text-2xs text-fg-muted">
                          {e ? (e.designation ?? e.department ?? '—') : <span className="text-danger">not in the master</span>}
                        </td>
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-xs text-fg-muted">
              No production has been booked, so no operator has any output to show.
            </p>
          )}
        </CardBody>
      </Card>

      {unknown.length > 0 && (
        <Alert tone="warning" title="Some entries name an operator the master does not hold" className="mb-4">
          {unknown.map((r) => `"${r.key}"`).join(', ')}. The operator on an entry is taken from whoever was signed in, so this
          means a user account exists without a matching employee record. The rows are shown as recorded.
        </Alert>
      )}

      {employees.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Shop-floor employees" description="From the employee master" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-28">Code</th>
                    <th>Name</th>
                    <th className="w-36">Designation</th>
                    <th className="w-32">Department</th>
                    <th className="w-24">Shift</th>
                    <th className="w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.code}>
                      <td className="font-mono text-2xs">{e.code}</td>
                      <td className="text-xs">{e.name}</td>
                      <td className="text-2xs text-fg-muted">{e.designation ?? '—'}</td>
                      <td className="text-2xs text-fg-muted">{e.department ?? '—'}</td>
                      <td className="font-mono text-2xs">{e.shiftCode ?? '—'}</td>
                      <td>
                        <Badge tone={e.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">{e.status ?? '—'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {output && output.unavailable.length > 0 && (
        <Card>
          <CardHeader title="Not shown, and why" description="A labour screen normally carries these. They would have to be invented here." />
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
