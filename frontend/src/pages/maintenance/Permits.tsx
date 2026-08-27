import { useMemo, useState } from 'react'
import { Check, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/format'
import { newUid } from '@/store/data'
import { DetailBlock, MaintStatusBadge, PermitTypeBadge, useMaintenanceData } from '@/components/maintenance/MaintShell'
import { PERMIT_LABEL, isPermitExpired, isoDate, permitBlockers } from '@/lib/maintFlow'
import type { MaintPermit, PermitStatus, PermitType } from '@/types/maintenance'

/**
 * Safety permits (Ch 17).
 *
 * The last thing between a technician and a live machine, so the checks here
 * are deliberately unforgiving: every isolation point locked, every PPE item
 * confirmed, a named issuer, and a validity window that has not passed. A
 * permit system that can be issued with a box unticked is a filing exercise.
 */

/** Default PPE by permit type — the list a person would otherwise forget. */
const DEFAULT_PPE: Record<PermitType, string[]> = {
  LOTO: ['Safety helmet', 'Safety footwear', 'Insulated gloves', 'Safety glasses'],
  ELECTRICAL: ['Arc-rated coverall', 'Insulated gloves class 0', 'Face shield', 'Safety footwear'],
  HOT_WORK: ['Welding helmet', 'Leather apron and gauntlets', 'Fire watch posted', 'Fire extinguisher at hand'],
  HEIGHT: ['Full body harness', 'Double lanyard', 'Safety helmet with chinstrap', 'Anchor point verified'],
  CONFINED_SPACE: ['Gas monitor', 'Harness and retrieval line', 'Standby person posted', 'Forced ventilation running'],
  GAS_TESTING: ['Calibrated gas detector', 'Escape set', 'Safety footwear'],
  CONTRACTOR: ['Site induction completed', 'Safety helmet', 'Safety footwear', 'High-visibility vest'],
}

const BLANK = (): Partial<MaintPermit> => ({
  docNo: '', permitType: 'LOTO', workOrderNo: '', assetCode: '', assetName: '',
  requestedBy: 'You', issuedBy: null, workers: [], contractor: '',
  riskAssessment: '', ppeChecklist: DEFAULT_PPE.LOTO.map((item) => ({ item, confirmed: false })),
  isolationPoints: [], validFrom: isoDate(new Date()), validUntil: isoDate(new Date()),
  status: 'DRAFT', closedBy: null, closedAt: null, remarks: '', version: 1,
})

const OPEN: PermitStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE']

export function PermitsPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const { rows, create, update, remove } = m.permits
  const today = isoDate(new Date())

  const [tab, setTab] = useState('open')
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<MaintPermit> | null>(null)
  const [issuing, setIssuing] = useState<MaintPermit | null>(null)
  const [closing, setClosing] = useState<MaintPermit | null>(null)
  const [closedBy, setClosedBy] = useState('')
  const [workerInput, setWorkerInput] = useState('')

  const live = useMemo(() => rows.filter((p) => !p.deletedAt), [rows])
  const detail = live.find((p) => p.uid === openUid) ?? null

  const filtered = useMemo(() => {
    if (tab === 'open') return live.filter((p) => OPEN.includes(p.status))
    if (tab === 'active') return live.filter((p) => p.status === 'ACTIVE')
    if (tab === 'expired') return live.filter((p) => isPermitExpired(p, today))
    if (tab === 'closed') return live.filter((p) => p.status === 'CLOSED' || p.status === 'CANCELLED' || p.status === 'EXPIRED')
    return live
  }, [live, tab, today])

  const k = useMemo(() => ({
    open: live.filter((p) => OPEN.includes(p.status)).length,
    active: live.filter((p) => p.status === 'ACTIVE').length,
    expired: live.filter((p) => isPermitExpired(p, today)).length,
    draft: live.filter((p) => p.status === 'DRAFT').length,
    unlockedPoints: live.filter((p) => p.status === 'ACTIVE').reduce((s, p) => s + p.isolationPoints.filter((x) => !x.locked).length, 0),
    workersOnSite: [...new Set(live.filter((p) => p.status === 'ACTIVE').flatMap((p) => p.workers))].length,
  }), [live, today])

  /* ── actions ────────────────────────────────────────────────── */

  function issue(p: MaintPermit, issuer: string) {
    const draft = { ...p, issuedBy: issuer }
    const b = permitBlockers(draft, 'ACTIVE')
    if (b.length) { toast.error(b[0]); return }
    update(p.uid, { status: 'ACTIVE', issuedBy: issuer })
    toast.success(`${p.docNo} issued`, `Valid to ${formatDate(p.validUntil)}. Work may start.`)
    setIssuing(null)
  }

  function close(p: MaintPermit) {
    if (!closedBy.trim()) { toast.error('Record who closed the permit and returned the isolations.'); return }
    update(p.uid, { status: 'CLOSED', closedBy: closedBy.trim(), closedAt: new Date().toISOString() })
    toast.success(`${p.docNo} closed`, 'Isolations returned. The work order may now be closed.')
    setClosing(null); setClosedBy('')
  }

  function toggleIsolation(p: MaintPermit, i: number) {
    if (p.status === 'CLOSED' || p.status === 'CANCELLED') { toast.error('This permit is closed.'); return }
    update(p.uid, { isolationPoints: p.isolationPoints.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)) })
  }

  function togglePpe(p: MaintPermit, i: number) {
    if (p.status === 'CLOSED' || p.status === 'CANCELLED') { toast.error('This permit is closed.'); return }
    update(p.uid, { ppeChecklist: p.ppeChecklist.map((x, j) => (j === i ? { ...x, confirmed: !x.confirmed } : x)) })
  }

  function save() {
    if (!editing) return
    const problems: string[] = []
    if (!editing.assetCode) problems.push('Which asset is being worked on?')
    if (!editing.validFrom || !editing.validUntil) problems.push('Set the validity window.')
    if (editing.validUntil && editing.validFrom && editing.validUntil < editing.validFrom) problems.push('The permit expires before it starts.')
    if (problems.length) { toast.error(problems[0]); return }

    const asset = m.assets.rows.find((a) => a.code === editing.assetCode)
    const payload = { ...editing, assetName: asset?.name ?? '' } as MaintPermit
    if (editing.uid) { update(editing.uid, payload); toast.success(`${editing.docNo} updated`) }
    else {
      const seq = live.length + 90
      create({ ...(BLANK() as MaintPermit), ...payload, uid: newUid('per'), docNo: `PTW/26-27/${String(seq).padStart(4, '0')}` })
      toast.success('Permit raised as a draft', 'It must be issued before work can start.')
    }
    setEditing(null)
  }

  function removePermit(p: MaintPermit) {
    if (p.status !== 'DRAFT') { toast.error('This permit has been issued. It is a safety record — cancel it rather than deleting it.'); return }
    remove(p.uid)
    if (openUid === p.uid) setOpenUid(null)
    toast.success(`${p.docNo} removed`)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<MaintPermit>[] = [
    { key: 'doc', header: 'Permit', width: '13rem', render: (p) => (<><p className="font-mono text-2xs text-fg">{p.docNo}</p><p className="text-3xs text-fg-subtle">{p.requestedBy}</p></>) },
    { key: 'type', header: 'Type', width: '13rem', render: (p) => <PermitTypeBadge permitType={p.permitType} /> },
    { key: 'asset', header: 'Asset', width: '17rem', render: (p) => (<><p className="truncate text-xs text-fg">{p.assetName}</p><p className="font-mono text-2xs text-fg-subtle">{p.assetCode}</p></>) },
    { key: 'wo', header: 'Work order', width: '12rem', render: (p) => (p.workOrderNo ? <span className="font-mono text-2xs text-fg-muted">{p.workOrderNo}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'workers', header: 'Covers', width: '11rem', render: (p) => <span className="text-2xs text-fg-muted">{p.workers.length ? `${p.workers.length} worker${p.workers.length === 1 ? '' : 's'}` : 'Nobody named'}</span> },
    {
      key: 'isolations', header: 'Isolations', width: '11rem',
      render: (p) => {
        if (!p.isolationPoints.length) return <span className="text-2xs text-fg-subtle">None</span>
        const locked = p.isolationPoints.filter((x) => x.locked).length
        return <span className={cn('text-2xs tabular', locked === p.isolationPoints.length ? 'text-success' : 'text-danger')}>{locked}/{p.isolationPoints.length} locked</span>
      },
    },
    {
      key: 'ppe', header: 'PPE', width: '9rem',
      render: (p) => {
        const done = p.ppeChecklist.filter((x) => x.confirmed).length
        return <span className={cn('text-2xs tabular', done === p.ppeChecklist.length ? 'text-success' : 'text-warning')}>{done}/{p.ppeChecklist.length}</span>
      },
    },
    { key: 'valid', header: 'Valid', width: '14rem', render: (p) => <span className={cn('text-2xs tabular', isPermitExpired(p, today) ? 'text-danger' : 'text-fg-muted')}>{formatDate(p.validFrom)} → {formatDate(p.validUntil)}</span> },
    {
      key: 'status', header: 'Status', width: '11rem',
      render: (p) => (isPermitExpired(p, today) ? <Badge tone="danger" size="sm">Expired, open</Badge> : <MaintStatusBadge status={p.status} />),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Safety permits"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Permits' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>Raise a permit</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: k.open },
              { id: 'active', label: 'Active', count: k.active },
              { id: 'expired', label: 'Expired', count: k.expired },
              { id: 'closed', label: 'Closed', count: live.filter((p) => ['CLOSED', 'CANCELLED', 'EXPIRED'].includes(p.status)).length },
              { id: 'all', label: 'All', count: live.length },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active permits" value={k.active} sub={`${k.workersOnSite} worker${k.workersOnSite === 1 ? '' : 's'} covered right now`} icon={<ShieldAlert />} tone={k.active ? 'warning' : 'success'} />
        <StatTile label="Expired but open" value={k.expired} sub={k.expired ? 'Isolations may still be in place' : 'Nothing has run past its window'} tone={k.expired ? 'danger' : 'success'} />
        <StatTile label="Awaiting issue" value={k.draft} sub="Drafts that cannot yet authorise work" tone={k.draft ? 'brand' : 'neutral'} />
        <StatTile label="Unlocked isolation points" value={k.unlockedPoints} sub={k.unlockedPoints ? 'On active permits — energy is not secured' : 'Every point on an active permit is locked'} tone={k.unlockedPoints ? 'danger' : 'success'} />
      </div>

      {k.expired > 0 && (
        <Alert tone="danger" title={`${k.expired} permit${k.expired === 1 ? ' has' : 's have'} expired without being closed`} className="mb-4">
          {live.filter((p) => isPermitExpired(p, today)).map((p) => `${p.docNo} on ${p.assetName} (expired ${formatDate(p.validUntil)})`).join(' · ')}.
          Either the work overran and the permit should have been extended, or it finished and nobody returned the isolations. Both need finding out today.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(p) => p.uid}
        searchable
        searchPlaceholder="Search by permit, asset, worker or contractor"
        onRowClick={(p) => setOpenUid(p.uid)}
        rowClassName={(p) => (isPermitExpired(p, today) ? 'bg-danger/5' : p.status === 'ACTIVE' ? 'bg-warning/5' : undefined)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, `permits-${tab}`, 'Safety permits', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        rowActions={(p) => (
          <>
            <MenuItem label="Edit" onClick={() => setEditing({ ...p, workers: [...p.workers], ppeChecklist: p.ppeChecklist.map((x) => ({ ...x })), isolationPoints: p.isolationPoints.map((x) => ({ ...x })) })} />
            {(p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL') && <MenuItem label="Issue" onClick={() => setIssuing(p)} />}
            {p.status === 'ACTIVE' && <MenuItem label="Close and return" onClick={() => { setClosing(p); setClosedBy('') }} />}
            <MenuItem label="Delete" danger onClick={() => removePermit(p)} />
          </>
        )}
        emptyTitle={tab === 'expired' ? 'Nothing has expired' : 'No permits'}
        emptyDescription={tab === 'expired' ? 'Every permit is inside its window or already closed.' : 'Raise one before any isolation work starts.'}
      />

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.docNo} · ${PERMIT_LABEL[detail.permitType]}` : ''} width="max-w-2xl">
        {detail && (() => {
          const expired = isPermitExpired(detail, today)
          const issueBlockers = permitBlockers(detail, 'ACTIVE')
          const editable = detail.status !== 'CLOSED' && detail.status !== 'CANCELLED'
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {expired ? <Badge tone="danger" size="md">Expired but open</Badge> : <MaintStatusBadge status={detail.status} size="md" />}
                <PermitTypeBadge permitType={detail.permitType} />
                {detail.contractor && <Badge tone="warning" size="sm" dot={false}>Contractor</Badge>}
              </div>

              {expired && (
                <Alert tone="danger" title="This permit has run past its validity">
                  It expired on {formatDate(detail.validUntil)} and nobody has closed it. If the work is finished, close it and confirm the isolations were returned.
                  If it is still running, that work is currently unauthorised.
                </Alert>
              )}

              <DetailBlock title="Work">
                <DataGrid columns={2} items={[
                  { label: 'Asset', value: `${detail.assetCode} · ${detail.assetName}` },
                  { label: 'Work order', value: detail.workOrderNo || 'Not linked', mono: !!detail.workOrderNo },
                  { label: 'Requested by', value: detail.requestedBy },
                  { label: 'Issued by', value: detail.issuedBy ?? 'Not issued' },
                  { label: 'Valid from', value: formatDate(detail.validFrom) },
                  { label: 'Valid until', value: formatDate(detail.validUntil) },
                  { label: 'Contractor', value: detail.contractor || 'In-house' },
                  { label: 'Closed', value: detail.closedAt ? `${detail.closedBy} · ${formatDateTime(detail.closedAt)}` : 'Open' },
                ]} />
              </DetailBlock>

              <DetailBlock title="Risk assessment">
                {detail.riskAssessment ? (
                  <p className="rounded border border-border bg-surface-2 p-2.5 text-xs leading-relaxed text-fg">{detail.riskAssessment}</p>
                ) : (
                  <Alert tone="danger" title="No risk assessment">A permit without one authorises work nobody has thought about.</Alert>
                )}
              </DetailBlock>

              <DetailBlock title={`Who is covered (${detail.workers.length})`}>
                {detail.workers.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">Nobody named. Only people listed here may work under this permit.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.workers.map((w) => (<Badge key={w} tone="brand" size="sm" dot={false}>{w}</Badge>))}
                  </div>
                )}
              </DetailBlock>

              <DetailBlock title={`Isolation points (${detail.isolationPoints.filter((x) => x.locked).length} of ${detail.isolationPoints.length} locked)`}>
                {detail.isolationPoints.length === 0 ? (
                  <p className="text-2xs text-fg-subtle">None recorded.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.isolationPoints.map((x, i) => (
                      <button
                        key={i} type="button" disabled={!editable}
                        onClick={() => toggleIsolation(detail, i)}
                        className={cn('flex w-full items-center gap-2 rounded border p-2 text-left transition-colors',
                          x.locked ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5',
                          !editable && 'cursor-not-allowed opacity-70')}
                      >
                        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', x.locked ? 'border-success bg-success text-white' : 'border-danger')}>
                          {x.locked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-fg">{x.point}</span>
                          {x.tagNo && <span className="block font-mono text-3xs text-fg-subtle">tag {x.tagNo}</span>}
                        </span>
                        <span className={cn('shrink-0 text-2xs', x.locked ? 'text-success' : 'text-danger')}>{x.locked ? 'Locked' : 'Not locked'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </DetailBlock>

              <DetailBlock title={`PPE (${detail.ppeChecklist.filter((x) => x.confirmed).length} of ${detail.ppeChecklist.length} confirmed)`}>
                <div className="space-y-1">
                  {detail.ppeChecklist.map((x, i) => (
                    <button
                      key={i} type="button" disabled={!editable}
                      onClick={() => togglePpe(detail, i)}
                      className={cn('flex w-full items-center gap-2 rounded border border-border p-1.5 text-left transition-colors hover:bg-surface-2', !editable && 'cursor-not-allowed opacity-70')}
                    >
                      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', x.confirmed ? 'border-success bg-success text-white' : 'border-border-strong')}>
                        {x.confirmed && <Check className="h-3 w-3" />}
                      </span>
                      <span className={cn('text-xs', x.confirmed ? 'text-fg-muted' : 'text-fg')}>{x.item}</span>
                    </button>
                  ))}
                </div>
              </DetailBlock>

              {detail.remarks && <DetailBlock title="Notes"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>}

              {(detail.status === 'DRAFT' || detail.status === 'PENDING_APPROVAL') && (
                issueBlockers.length > 0 ? (
                  <Alert tone="danger" title="Cannot be issued yet">
                    <ul className="list-disc space-y-0.5 pl-4">{issueBlockers.map((x) => (<li key={x}>{x}</li>))}</ul>
                  </Alert>
                ) : (
                  <Alert tone="tip" title="Ready to issue">Every isolation is locked, every PPE item is confirmed, and the risk assessment is recorded.</Alert>
                )
              )}

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail, workers: [...detail.workers], ppeChecklist: detail.ppeChecklist.map((x) => ({ ...x })), isolationPoints: detail.isolationPoints.map((x) => ({ ...x })) }); setOpenUid(null) }}>Edit</Button>
                {(detail.status === 'DRAFT' || detail.status === 'PENDING_APPROVAL') && (
                  <Button variant="primary" size="sm" onClick={() => setIssuing(detail)} disabled={issueBlockers.length > 0}>Issue</Button>
                )}
                {detail.status === 'ACTIVE' && (
                  <Button variant="primary" size="sm" onClick={() => { setClosing(detail); setClosedBy('') }}>Close and return isolations</Button>
                )}
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── issue ────────────────────────────────────────────── */}
      <Modal
        open={!!issuing}
        onClose={() => setIssuing(null)}
        title={issuing ? `Issue ${issuing.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIssuing(null)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => issuing && issue(issuing, workerInput.trim() || 'You')} disabled={!!issuing && permitBlockers({ ...issuing, issuedBy: workerInput.trim() || 'You' }, 'ACTIVE').length > 0}>
              Issue the permit
            </Button>
          </>
        }
      >
        {issuing && (() => {
          const b = permitBlockers({ ...issuing, issuedBy: workerInput.trim() || 'You' }, 'ACTIVE')
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                Issuing authorises {issuing.workers.length} named worker{issuing.workers.length === 1 ? '' : 's'} to work on {issuing.assetName} until {formatDate(issuing.validUntil)}.
                Nobody outside that list may work under it.
              </p>
              <Input label="Issued by" required value={workerInput} onChange={(e) => setWorkerInput(e.target.value)} placeholder="V. Ramesh (Maintenance Manager)" autoFocus />
              <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                <p className="flex justify-between py-0.5"><span className="text-fg-muted">Isolation points locked</span><span className={cn('tabular', issuing.isolationPoints.every((x) => x.locked) ? 'text-success' : 'text-danger')}>{issuing.isolationPoints.filter((x) => x.locked).length}/{issuing.isolationPoints.length}</span></p>
                <p className="flex justify-between py-0.5"><span className="text-fg-muted">PPE confirmed</span><span className={cn('tabular', issuing.ppeChecklist.every((x) => x.confirmed) ? 'text-success' : 'text-danger')}>{issuing.ppeChecklist.filter((x) => x.confirmed).length}/{issuing.ppeChecklist.length}</span></p>
                <p className="flex justify-between py-0.5"><span className="text-fg-muted">Workers named</span><span className="tabular text-fg">{issuing.workers.length}</span></p>
              </div>
              {b.length > 0
                ? <Alert tone="danger" title="Cannot be issued"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert>
                : <Alert tone="tip" title="Every condition is met">Work may start once this is issued.</Alert>}
            </div>
          )
        })()}
      </Modal>

      {/* ── close ────────────────────────────────────────────── */}
      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title={closing ? `Close ${closing.docNo}` : ''}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setClosing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={() => closing && close(closing)}>Close the permit</Button></>}
      >
        {closing && (
          <div className="space-y-3">
            <Alert tone="warning" title="Confirm before closing">
              Every person has left the work area, all tools are clear, guards are back, and every one of the {closing.isolationPoints.length} isolation point{closing.isolationPoints.length === 1 ? '' : 's'} has been unlocked and the lock removed.
              Closing a permit while somebody is still working under it is how people get hurt.
            </Alert>
            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="mb-1.5 text-3xs uppercase tracking-wider text-fg-subtle">Isolations to return</p>
              {closing.isolationPoints.length === 0 ? (
                <p className="text-2xs text-fg-subtle">None recorded.</p>
              ) : (
                <ul className="space-y-0.5">
                  {closing.isolationPoints.map((x, i) => (
                    <li key={i} className="text-2xs text-fg-muted">{x.point}{x.tagNo ? ` · tag ${x.tagNo}` : ''}</li>
                  ))}
                </ul>
              )}
            </div>
            <Input label="Closed by" required value={closedBy} onChange={(e) => setClosedBy(e.target.value)} placeholder="V. Ramesh (Maintenance Manager)" autoFocus />
          </div>
        )}
      </Modal>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.docNo}` : 'Raise a permit'}
        width="max-w-2xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save as draft</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Permit type" value={editing.permitType ?? 'LOTO'}
                onChange={(e) => {
                  const t = e.target.value as PermitType
                  setEditing({ ...editing, permitType: t, ppeChecklist: DEFAULT_PPE[t].map((item) => ({ item, confirmed: false })) })
                }}
                hint="Changing this resets the PPE list to the standard one for that permit"
              >
                {(Object.keys(PERMIT_LABEL) as PermitType[]).map((p) => (<option key={p} value={p}>{PERMIT_LABEL[p]}</option>))}
              </Select>
              <Select label="Work order" value={editing.workOrderNo ?? ''} onChange={(e) => setEditing({ ...editing, workOrderNo: e.target.value })}>
                <option value="">Not linked</option>
                {m.workOrders.rows.filter((w) => !w.deletedAt && !['CLOSED', 'CANCELLED'].includes(w.status)).map((w) => (
                  <option key={w.uid} value={w.docNo}>{w.docNo} · {w.title}</option>
                ))}
              </Select>
            </div>
            <Select
              label="Asset" required value={editing.assetCode ?? ''}
              onChange={(e) => { const a = m.assets.rows.find((x) => x.code === e.target.value); setEditing({ ...editing, assetCode: e.target.value, assetName: a?.name ?? '' }) }}
            >
              <option value="">Choose the asset…</option>
              {m.assets.rows.filter((a) => !a.deletedAt).sort((a, b) => a.code.localeCompare(b.code)).map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
            </Select>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Requested by" value={editing.requestedBy ?? ''} onChange={(e) => setEditing({ ...editing, requestedBy: e.target.value })} />
              <Input label="Valid from" type="date" value={editing.validFrom ?? ''} onChange={(e) => setEditing({ ...editing, validFrom: e.target.value })} />
              <Input label="Valid until" type="date" value={editing.validUntil ?? ''} onChange={(e) => setEditing({ ...editing, validUntil: e.target.value })} />
            </div>
            <Input label="Contractor" value={editing.contractor ?? ''} onChange={(e) => setEditing({ ...editing, contractor: e.target.value })} hint="Leave blank for in-house work" />
            <Textarea
              label="Risk assessment" rows={4} value={editing.riskAssessment ?? ''}
              onChange={(e) => setEditing({ ...editing, riskAssessment: e.target.value })}
              hint="What the hazards are and how each is controlled — the permit cannot be issued without it"
            />

            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="mb-2 text-3xs uppercase tracking-wider text-fg-subtle">Who may work under this permit</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(editing.workers ?? []).map((w) => (
                  <button
                    key={w} type="button"
                    onClick={() => setEditing({ ...editing, workers: (editing.workers ?? []).filter((x) => x !== w) })}
                    className="inline-flex items-center gap-1 rounded border border-brand-400 bg-brand-500/10 px-2 py-1 text-2xs text-brand-600"
                  >{w} <Trash2 className="h-2.5 w-2.5" /></button>
                ))}
                {(editing.workers ?? []).length === 0 && <span className="text-2xs text-fg-subtle">Nobody yet.</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.technicians.rows.filter((t) => !t.deletedAt && !(editing.workers ?? []).includes(t.name)).map((t) => (
                  <button
                    key={t.uid} type="button"
                    onClick={() => setEditing({ ...editing, workers: [...(editing.workers ?? []), t.name] })}
                    className="rounded border border-border px-2 py-1 text-2xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                  >+ {t.name}</button>
                ))}
              </div>
            </div>

            <div className="rounded border border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-3xs uppercase tracking-wider text-fg-subtle">Isolation points</p>
                <Button
                  variant="ghost" size="sm" icon={<Plus />}
                  onClick={() => setEditing({ ...editing, isolationPoints: [...(editing.isolationPoints ?? []), { point: '', locked: false, tagNo: '' }] })}
                >Add</Button>
              </div>
              {(editing.isolationPoints ?? []).length === 0 ? (
                <p className="text-2xs text-fg-subtle">None. A lockout permit with no isolation points isolates nothing and cannot be issued.</p>
              ) : (
                <div className="space-y-2">
                  {(editing.isolationPoints ?? []).map((x, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <Input
                        label="Point" sizeVariant="sm" className="flex-1" value={x.point}
                        onChange={(e) => setEditing({ ...editing, isolationPoints: (editing.isolationPoints ?? []).map((y, j) => (j === i ? { ...y, point: e.target.value } : y)) })}
                        placeholder="LT panel — feeder ACB-14"
                      />
                      <Input
                        label="Tag" sizeVariant="sm" className="w-28" value={x.tagNo}
                        onChange={(e) => setEditing({ ...editing, isolationPoints: (editing.isolationPoints ?? []).map((y, j) => (j === i ? { ...y, tagNo: e.target.value } : y)) })}
                      />
                      <button
                        type="button" aria-label="Remove"
                        onClick={() => setEditing({ ...editing, isolationPoints: (editing.isolationPoints ?? []).filter((_, j) => j !== i) })}
                        className="mb-1 rounded p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                      ><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-3xs text-fg-subtle">Locks are confirmed on the permit itself, not here — somebody has to physically fit them.</p>
            </div>

            <Textarea label="Notes" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />
          </div>
        )}
      </Drawer>
    </div>
  )
}
