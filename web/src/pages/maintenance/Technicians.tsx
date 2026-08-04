import { useMemo, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, StatTile } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { newUid } from '@/store/data'
import { DetailBlock, WoStatusBadge, hours, inr, useMaintenanceData } from '@/components/maintenance/MaintShell'
import { daysBetween, isoDate, technicianLoad, woCost, type TechnicianLoad } from '@/lib/maintFlow'
import type { Technician } from '@/types/maintenance'

/**
 * Technicians (Ch 13).
 *
 * First-time-fix is the measure that matters and the one most easily faked. It
 * counts a job as failed when a later work order was linked back to it as
 * rework — which is why the work order carries `reworkOfDocNo` and why the
 * screen shows the linked pairs rather than a bare percentage.
 */

const BLANK = (): Partial<Technician> => ({
  code: '', name: '', trade: 'MECHANICAL', skills: ['MECHANICAL'], certifications: [],
  shift: 'GENERAL', hourlyRate: 300, shiftHours: 8, isAvailable: true, phone: '', version: 1,
})

const TRADES = ['MECHANICAL', 'ELECTRICAL', 'ELECTRONIC', 'HYDRAULIC', 'PNEUMATIC', 'UTILITY', 'HVAC', 'WELDING', 'INSTRUMENTATION']

export function TechniciansPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const { rows, create, update, remove } = m.technicians
  const today = isoDate(new Date())

  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<Technician> | null>(null)

  const live = useMemo(() => rows.filter((t) => !t.deletedAt), [rows])
  const workOrders = useMemo(() => m.workOrders.rows.filter((w) => !w.deletedAt), [m.workOrders.rows])
  const loads = useMemo(() => live.map((t) => technicianLoad(t, workOrders)), [live, workOrders])
  const detail = loads.find((l) => l.technician.uid === openUid) ?? null

  const k = useMemo(() => {
    const available = loads.filter((l) => l.technician.isAvailable)
    const ftf = loads.filter((l) => l.firstTimeFixPct !== null).map((l) => l.firstTimeFixPct as number)
    const expiring = live.flatMap((t) => t.certifications.filter((c) => daysBetween(today, c.validUntil) <= 90 && daysBetween(today, c.validUntil) >= 0).map((c) => ({ tech: t, cert: c })))
    const lapsed = live.flatMap((t) => t.certifications.filter((c) => c.validUntil < today).map((c) => ({ tech: t, cert: c })))
    return {
      total: live.length,
      available: available.length,
      overloaded: loads.filter((l) => l.isOverloaded).length,
      openJobs: loads.reduce((s, l) => s + l.openJobs, 0),
      bookedHours: loads.reduce((s, l) => s + l.assignedHours, 0),
      capacityHours: available.reduce((s, l) => s + l.technician.shiftHours, 0),
      avgFtf: ftf.length ? ftf.reduce((s, v) => s + v, 0) / ftf.length : null,
      expiring, lapsed,
      // Trades held by only one available person — a single point of failure.
      soleTrades: TRADES.filter((tr) => {
        const holders = available.filter((l) => l.technician.skills.includes(tr) || l.technician.trade === tr)
        return holders.length === 1
      }),
      uncoveredTrades: TRADES.filter((tr) =>
        m.plans.rows.some((p) => !p.deletedAt && p.isActive && p.requiredSkill === tr) &&
        !available.some((l) => l.technician.skills.includes(tr) || l.technician.trade === tr),
      ),
    }
  }, [live, loads, today, m.plans.rows])

  function blockers(draft: Partial<Technician>, uid?: string): string[] {
    const out: string[] = []
    if (!draft.code?.trim()) out.push('A code is required.')
    if (!draft.name?.trim()) out.push('Give the technician a name.')
    if (draft.code && live.some((t) => t.code === draft.code && t.uid !== uid)) out.push('That code is already in use.')
    if ((draft.hourlyRate ?? 0) <= 0) out.push('An hourly rate of nil makes every job look free.')
    if ((draft.shiftHours ?? 0) <= 0) out.push('Shift hours must be greater than nil, or load cannot be planned.')
    if (!draft.skills?.length) out.push('A technician with no skills cannot be matched to any job.')
    return out
  }

  function save() {
    if (!editing) return
    const b = blockers(editing, editing.uid)
    if (b.length) { toast.error(b[0]); return }
    if (editing.uid) { update(editing.uid, editing as Technician); toast.success(`${editing.code} updated`) }
    else { create({ ...(BLANK() as Technician), ...(editing as Technician), uid: newUid('tec') }); toast.success(`${editing.name} added`) }
    setEditing(null)
  }

  function removeTech(t: Technician) {
    const jobs = workOrders.filter((w) => w.labour.some((l) => l.technicianCode === t.code))
    if (jobs.length) { toast.error(`${jobs.length} work order(s) carry this technician's hours. Mark them unavailable instead — deleting would break the cost history.`); return }
    remove(t.uid)
    if (openUid === t.uid) setOpenUid(null)
    toast.success(`${t.code} removed`)
  }

  const columns: Column<TechnicianLoad>[] = [
    { key: 'tech', header: 'Technician', width: '18rem', render: (l) => (<><p className="truncate text-xs text-fg">{l.technician.name}</p><p className="font-mono text-2xs text-fg-subtle">{l.technician.code} · shift {l.technician.shift}</p></>) },
    { key: 'trade', header: 'Trade', width: '11rem', render: (l) => <Badge tone="brand" size="sm" dot={false}>{l.technician.trade.toLowerCase()}</Badge> },
    {
      key: 'skills', header: 'Skills', width: '16rem',
      render: (l) => (
        <div className="flex flex-wrap gap-1">
          {l.technician.skills.slice(0, 3).map((s) => (<Badge key={s} tone="neutral" size="sm" dot={false}>{s.toLowerCase()}</Badge>))}
          {l.technician.skills.length > 3 && <span className="text-3xs text-fg-subtle">+{l.technician.skills.length - 3}</span>}
        </div>
      ),
    },
    { key: 'open', header: 'Open jobs', width: '9rem', align: 'right', render: (l) => <span className="text-xs tabular text-fg">{l.openJobs || '—'}</span> },
    {
      key: 'load', header: 'Load against shift', width: '14rem',
      render: (l) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={Math.min(100, l.utilisationPct)} tone={l.isOverloaded ? 'danger' : l.utilisationPct >= 80 ? 'warning' : 'success'} className="w-14" />
          <span className={cn('text-2xs tabular', l.isOverloaded ? 'text-danger' : 'text-fg-muted')}>{l.assignedHours}/{l.technician.shiftHours} h</span>
        </div>
      ),
    },
    { key: 'done', header: 'Jobs done', width: '9rem', align: 'right', render: (l) => <span className="text-xs tabular text-fg-muted">{l.jobsCompleted || '—'}</span> },
    { key: 'avg', header: 'Avg repair', width: '10rem', align: 'right', render: (l) => (l.avgRepairHours === null ? <span className="text-2xs text-fg-subtle">—</span> : <span className="text-xs tabular text-fg-muted">{l.avgRepairHours} h</span>) },
    {
      key: 'ftf', header: 'First-time fix', width: '12rem',
      render: (l) => l.firstTimeFixPct === null
        ? <span className="text-2xs text-fg-subtle">No closed jobs</span>
        : (
          <div className="flex items-center gap-2">
            <ProgressBar value={l.firstTimeFixPct} tone={l.firstTimeFixPct >= 90 ? 'success' : l.firstTimeFixPct >= 75 ? 'warning' : 'danger'} className="w-12" />
            <span className={cn('text-2xs tabular', l.firstTimeFixPct >= 90 ? 'text-success' : l.firstTimeFixPct >= 75 ? 'text-warning' : 'text-danger')}>{l.firstTimeFixPct}%</span>
          </div>
        ),
    },
    { key: 'rate', header: 'Rate', width: '9rem', align: 'right', render: (l) => <span className="text-xs tabular text-fg-muted">{inr(l.technician.hourlyRate)}/h</span> },
    { key: 'available', header: 'Available', width: '9rem', render: (l) => (l.technician.isAvailable ? <Badge tone="success" size="sm">Available</Badge> : <Badge tone="neutral" size="sm">Off</Badge>) },
  ]

  return (
    <div>
      <PageHeader
        title="Technicians"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Technicians' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>New technician</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Available" value={`${k.available} of ${k.total}`} sub={`${k.capacityHours} hours of shift capacity`} icon={<Users />} tone={k.available ? 'brand' : 'danger'} />
        <StatTile label="Booked" value={`${k.bookedHours.toFixed(1)} h`} sub={`${k.openJobs} open jobs · ${k.capacityHours > 0 ? ((k.bookedHours / k.capacityHours) * 100).toFixed(0) : 0}% of capacity`} tone={k.bookedHours > k.capacityHours ? 'danger' : 'success'} />
        <StatTile label="Overloaded" value={k.overloaded} sub={k.overloaded ? 'Booked beyond their shift' : 'Nobody is over their shift'} tone={k.overloaded ? 'danger' : 'success'} />
        <StatTile label="First-time fix" value={k.avgFtf === null ? '—' : `${k.avgFtf.toFixed(0)}%`} sub="Jobs closed without a repeat visit" tone={k.avgFtf !== null && k.avgFtf >= 90 ? 'success' : 'warning'} />
      </div>

      {k.uncoveredTrades.length > 0 && (
        <Alert tone="danger" title="A trade with active plans has nobody available" className="mb-4">
          {k.uncoveredTrades.join(', ').toLowerCase()} — maintenance plans call for this trade but no available technician holds it. Those plans cannot be assigned.
        </Alert>
      )}
      {k.soleTrades.length > 0 && (
        <Alert tone="warning" title="Single points of failure" className="mb-4">
          Only one available technician holds {k.soleTrades.join(', ').toLowerCase()}. If that person is off, work needing that trade stops. Worth cross-training.
        </Alert>
      )}
      {k.lapsed.length > 0 && (
        <Alert tone="danger" title={`${k.lapsed.length} certification${k.lapsed.length === 1 ? ' has' : 's have'} lapsed`} className="mb-4">
          {k.lapsed.map((x) => `${x.tech.name} — ${x.cert.name} (expired ${formatDate(x.cert.validUntil)})`).join(' · ')}.
          Work requiring these authorisations should not be assigned until they are renewed.
        </Alert>
      )}

      <DataTable
        rows={loads}
        columns={columns}
        rowKey={(l) => l.technician.uid}
        searchable
        searchPlaceholder="Search by name, code, trade or skill"
        onRowClick={(l) => setOpenUid(l.technician.uid)}
        rowClassName={(l) => (l.isOverloaded ? 'bg-danger/5' : !l.technician.isAvailable ? 'opacity-60' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'technicians', 'Technician productivity', columnsFromTable(columns), loads); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(l) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...l.technician, skills: [...l.technician.skills], certifications: l.technician.certifications.map((c) => ({ ...c })) })} />
            <MenuItem label={l.technician.isAvailable ? 'Mark unavailable' : 'Mark available'} onClick={() => { update(l.technician.uid, { isAvailable: !l.technician.isAvailable }); toast.success(`${l.technician.name} is now ${l.technician.isAvailable ? 'unavailable' : 'available'}`) }} />
            <MenuItem label="Delete" danger onClick={() => removeTech(l.technician)} />
          </>
        )}
        emptyTitle="No technicians"
        emptyDescription="Add the people who actually do the work."
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.technician.code} · ${detail.technician.name}` : ''} width="max-w-2xl">
        {detail && (() => {
          const mine = workOrders.filter((w) => w.labour.some((l) => l.technicianCode === detail.technician.code))
          const open = mine.filter((w) => ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(w.status))
          const reworkTargets = new Set(workOrders.filter((w) => w.isRework && w.reworkOfDocNo).map((w) => w.reworkOfDocNo as string))
          const failed = mine.filter((w) => ['COMPLETED', 'VERIFIED', 'CLOSED'].includes(w.status) && reworkTargets.has(w.docNo))
          const earned = mine.reduce((s, w) => s + w.labour.filter((l) => l.technicianCode === detail.technician.code).reduce((x, l) => x + l.hours * l.rate * (l.isOvertime ? 1.5 : 1), 0), 0)

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={detail.technician.isAvailable ? 'success' : 'neutral'} size="md">{detail.technician.isAvailable ? 'Available' : 'Unavailable'}</Badge>
                <Badge tone="brand" size="sm" dot={false}>{detail.technician.trade.toLowerCase()}</Badge>
                <Badge tone="neutral" size="sm" dot={false}>shift {detail.technician.shift}</Badge>
                {detail.isOverloaded && <Badge tone="danger" size="sm">Overloaded</Badge>}
              </div>

              <DetailBlock title="Details">
                <DataGrid columns={3} items={[
                  { label: 'Phone', value: detail.technician.phone || '—' },
                  { label: 'Hourly rate', value: `${inr(detail.technician.hourlyRate)}/h` },
                  { label: 'Shift hours', value: `${detail.technician.shiftHours} h` },
                ]} />
              </DetailBlock>

              <DetailBlock title="Skills">
                <div className="flex flex-wrap gap-1.5">
                  {detail.technician.skills.map((s) => (<Badge key={s} tone="brand" size="sm" dot={false}>{s.toLowerCase()}</Badge>))}
                </div>
              </DetailBlock>

              <DetailBlock title="Certifications">
                {detail.technician.certifications.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">None recorded.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.technician.certifications.map((c, i) => {
                      const days = daysBetween(today, c.validUntil)
                      return (
                        <p key={i} className="flex items-baseline gap-2 text-2xs">
                          <span className="text-fg">{c.name}</span>
                          <span className="ml-auto text-fg-subtle">{formatDate(c.validUntil)}</span>
                          {days < 0 ? <Badge tone="danger" size="sm">Lapsed</Badge> : days <= 90 ? <Badge tone="warning" size="sm">{days}d</Badge> : <Badge tone="success" size="sm">Valid</Badge>}
                        </p>
                      )
                    })}
                  </div>
                )}
              </DetailBlock>

              <DetailBlock title="Productivity">
                <DataGrid columns={3} items={[
                  { label: 'Jobs completed', value: String(detail.jobsCompleted) },
                  { label: 'Hours booked on them', value: hours(detail.completedHours) },
                  { label: 'Average per job', value: detail.avgRepairHours === null ? '—' : hours(detail.avgRepairHours) },
                  { label: 'Open jobs', value: String(detail.openJobs) },
                  { label: 'Hours assigned', value: `${detail.assignedHours} of ${detail.technician.shiftHours}` },
                  { label: 'Labour cost booked', value: inr(earned) },
                ]} />
                {detail.firstTimeFixPct !== null && (
                  <div className="mt-3">
                    <p className="mb-1 flex justify-between text-2xs"><span className="text-fg-muted">First-time fix</span><span className={cn('font-medium tabular', detail.firstTimeFixPct >= 90 ? 'text-success' : 'text-warning')}>{detail.firstTimeFixPct}%</span></p>
                    <ProgressBar value={detail.firstTimeFixPct} tone={detail.firstTimeFixPct >= 90 ? 'success' : detail.firstTimeFixPct >= 75 ? 'warning' : 'danger'} />
                    <p className="mt-1 text-3xs text-fg-subtle">
                      {detail.jobsCompleted - failed.length} of {detail.jobsCompleted} closed jobs had no repeat visit.
                      {failed.length > 0 && ` ${failed.length} came back: ${failed.map((w) => w.docNo).join(', ')}.`}
                    </p>
                  </div>
                )}
              </DetailBlock>

              {open.length > 0 && (
                <DetailBlock title={`Open jobs (${open.length})`}>
                  <div className="space-y-1">
                    {open.map((w) => (
                      <p key={w.uid} className="flex items-baseline gap-2 text-2xs">
                        <span className="font-mono text-fg">{w.docNo}</span>
                        <span className="truncate text-fg-muted">{w.title}</span>
                        <span className="ml-auto shrink-0"><WoStatusBadge status={w.status} /></span>
                      </p>
                    ))}
                  </div>
                </DetailBlock>
              )}

              {failed.length > 0 && (
                <Alert tone="warning" title="Jobs that came back">
                  {failed.map((w) => `${w.docNo} — ${w.title}`).join(' · ')}. A repeat visit usually means the first one treated a symptom; worth reading the second job's notes.
                </Alert>
              )}

              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail.technician, skills: [...detail.technician.skills], certifications: detail.technician.certifications.map((c) => ({ ...c })) }); setOpenUid(null) }}>Edit</Button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.code}` : 'New technician'}
        width="max-w-lg"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Code" required value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="TEC-07" />
              <Input label="Phone" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <Input label="Name" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <div className="grid grid-cols-4 gap-3">
              <Select label="Primary trade" value={editing.trade ?? 'MECHANICAL'} onChange={(e) => setEditing({ ...editing, trade: e.target.value })}>
                {TRADES.map((t) => (<option key={t} value={t}>{t.toLowerCase()}</option>))}
              </Select>
              <Select label="Shift" value={editing.shift ?? 'GENERAL'} onChange={(e) => setEditing({ ...editing, shift: e.target.value as Technician['shift'] })}>
                <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="GENERAL">General</option>
              </Select>
              <Input label="Rate (₹/h)" type="number" value={String(editing.hourlyRate ?? 0)} onChange={(e) => setEditing({ ...editing, hourlyRate: Number(e.target.value) })} />
              <Input label="Shift hours" type="number" value={String(editing.shiftHours ?? 8)} onChange={(e) => setEditing({ ...editing, shiftHours: Number(e.target.value) })} />
            </div>

            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="mb-2 text-3xs uppercase tracking-wider text-fg-subtle">Skills — what jobs this person can be matched to</p>
              <div className="flex flex-wrap gap-1.5">
                {TRADES.map((t) => {
                  const on = (editing.skills ?? []).includes(t)
                  return (
                    <button
                      key={t} type="button"
                      onClick={() => setEditing({ ...editing, skills: on ? (editing.skills ?? []).filter((x) => x !== t) : [...(editing.skills ?? []), t] })}
                      className={cn('rounded border px-2 py-1 text-2xs transition-colors', on ? 'border-brand-400 bg-brand-500/10 text-brand-600' : 'border-border text-fg-muted hover:border-border-strong')}
                    >{t.toLowerCase()}</button>
                  )
                })}
              </div>
            </div>

            <div className="rounded border border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-3xs uppercase tracking-wider text-fg-subtle">Certifications</p>
                <Button
                  variant="ghost" size="sm" icon={<Plus />}
                  onClick={() => setEditing({ ...editing, certifications: [...(editing.certifications ?? []), { name: '', validUntil: isoDate(new Date(Date.now() + 365 * 86_400_000)) }] })}
                >Add</Button>
              </div>
              {(editing.certifications ?? []).length === 0 ? (
                <p className="text-2xs text-fg-subtle">None. Some permits require a named authorisation.</p>
              ) : (
                <div className="space-y-2">
                  {(editing.certifications ?? []).map((c, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <Input
                        label="Certification" sizeVariant="sm" className="flex-1" value={c.name}
                        onChange={(e) => setEditing({ ...editing, certifications: (editing.certifications ?? []).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                      />
                      <Input
                        label="Valid until" type="date" sizeVariant="sm" className="w-40" value={c.validUntil}
                        onChange={(e) => setEditing({ ...editing, certifications: (editing.certifications ?? []).map((x, j) => (j === i ? { ...x, validUntil: e.target.value } : x)) })}
                      />
                      <button
                        type="button" aria-label="Remove"
                        onClick={() => setEditing({ ...editing, certifications: (editing.certifications ?? []).filter((_, j) => j !== i) })}
                        className="mb-1 rounded p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                      ><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Switch label="Available for assignment" checked={editing.isAvailable !== false} onChange={(v) => setEditing({ ...editing, isAvailable: v })} />

            {(() => {
              const b = blockers(editing, editing.uid)
              return b.length ? <Alert tone="danger" title="Cannot save yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert> : null
            })()}
          </div>
        )}
      </Drawer>
    </div>
  )
}
