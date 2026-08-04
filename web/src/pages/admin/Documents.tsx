import { useMemo, useState } from 'react'
import { ChevronRight, FileText, FolderOpen, Lock, Plus, Search, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/format'
import { newUid, useCollection } from '@/store/data'
import {
  DOC_CATEGORY_LABEL, documentState, documentsUnder, folderTree, isoDate,
  nextRevision, uploadBlockers, type FolderNode,
} from '@/lib/platformFlow'
import { managedDocuments as seedDocuments } from '@/mock/platform'
import type { DocCategory, DocStatus, ManagedDocument } from '@/types/platform'

/**
 * Document management (Volume 15, Ch 10).
 *
 * The existing attachments screen lists files against records. This is the
 * other thing Volume 15 asks for: a controlled repository where a document has
 * revisions, one of which is current, a lock so two people cannot revise it at
 * once, and an expiry date that matters — an out-of-date factory licence is not
 * a filing problem, it is a stopped plant.
 */

const ME = 'V. Ramesh'

const STATUS_TONE: Record<DocStatus, 'draft' | 'pending' | 'success' | 'neutral' | 'danger' | 'warning'> = {
  DRAFT: 'draft', PENDING_APPROVAL: 'pending', APPROVED: 'success',
  SUPERSEDED: 'neutral', EXPIRED: 'danger', ARCHIVED: 'neutral', REJECTED: 'danger',
}

const BLANK = (folder: string): Partial<ManagedDocument> => ({
  docNo: '', title: '', category: 'SOP', folder: folder || 'General',
  description: '', owner: ME, department: '', currentRevision: '1',
  revisions: [], status: 'DRAFT', checkedOutBy: null, checkedOutAt: null,
  expiresOn: null, reviewLeadDays: 0, isConfidential: false,
  links: [], tags: [], downloadCount: 0, version: 1,
})

export function DocumentsPage() {
  const toast = useToast()
  const docs = useCollection<ManagedDocument>('plat:documents', useMemo(() => seedDocuments, []))
  const today = isoDate(new Date())

  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['Engineering', 'Quality', 'Compliance', 'Production', 'Maintenance', 'Procurement']))
  const [openUid, setOpenUid] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<ManagedDocument> | null>(null)
  const [uploading, setUploading] = useState<ManagedDocument | null>(null)
  const [upFile, setUpFile] = useState('')
  const [upNote, setUpNote] = useState('')

  const live = useMemo(() => docs.rows.filter((d) => !d.deletedAt), [docs.rows])
  const detail = live.find((d) => d.uid === openUid) ?? null
  const tree = useMemo(() => folderTree(live), [live])

  const states = useMemo(() => live.map((d) => documentState(d, today, ME)), [live, today])

  const filtered = useMemo(() => {
    let rows = folder ? documentsUnder(folder, live) : live
    if (tab === 'expiring') rows = rows.filter((d) => { const s = documentState(d, today); return s.isExpired || s.isDueForReview })
    if (tab === 'checkedout') rows = rows.filter((d) => d.checkedOutBy)
    if (tab === 'pending') rows = rows.filter((d) => d.status === 'PENDING_APPROVAL')
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((d) =>
        d.title.toLowerCase().includes(q) || d.docNo.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) || d.folder.toLowerCase().includes(q) ||
        d.links.some((l) => l.entityCode.toLowerCase().includes(q)),
      )
    }
    return rows
  }, [live, folder, tab, query, today])

  const k = useMemo(() => ({
    total: live.length,
    expired: states.filter((s) => s.isExpired).length,
    dueReview: states.filter((s) => s.isDueForReview).length,
    checkedOut: live.filter((d) => d.checkedOutBy).length,
    pending: live.filter((d) => d.status === 'PENDING_APPROVAL').length,
    confidential: live.filter((d) => d.isConfidential).length,
    revisions: live.reduce((s, d) => s + d.revisions.length, 0),
    bytes: live.reduce((s, d) => s + d.revisions.reduce((x, r) => x + r.sizeBytes, 0), 0),
  }), [live, states])

  /* ── actions ────────────────────────────────────────────────── */

  function checkOut(doc: ManagedDocument) {
    if (doc.checkedOutBy) { toast.error(`${doc.checkedOutBy} already has this checked out.`); return }
    docs.update(doc.uid, { checkedOutBy: ME, checkedOutAt: new Date().toISOString() })
    toast.success(`${doc.docNo} checked out`, 'Nobody else can upload a revision until you check it back in.')
  }

  function checkIn(doc: ManagedDocument) {
    if (doc.checkedOutBy !== ME) { toast.error(`This is checked out by ${doc.checkedOutBy}, not you.`); return }
    docs.update(doc.uid, { checkedOutBy: null, checkedOutAt: null })
    toast.success(`${doc.docNo} checked in`)
  }

  /**
   * A new revision supersedes the current one rather than replacing it. The
   * old file stays exactly as it was — which is the entire point of revision
   * control, and the thing an auditor will ask to see.
   */
  function uploadRevision() {
    if (!uploading) return
    const blockers = uploadBlockers(uploading, ME)
    if (blockers.length) { toast.error(blockers[0]); return }
    if (!upFile.trim()) { toast.error('Give the file a name.'); return }
    if (upNote.trim().length < 5) { toast.error('Say what changed. A revision with no reason cannot be reviewed.'); return }

    const rev = nextRevision(uploading)
    const now = new Date().toISOString()
    docs.update(uploading.uid, {
      currentRevision: rev,
      status: 'PENDING_APPROVAL',
      revisions: [
        ...uploading.revisions.map((r) => (r.revision === uploading.currentRevision ? { ...r, supersededAt: now } : r)),
        {
          uid: newUid('rev'), revision: rev, fileName: upFile.trim(),
          sizeBytes: 512_000, mimeType: 'application/octet-stream',
          uploadedBy: ME, uploadedAt: now, changeNote: upNote.trim(),
          approvedBy: null, approvedAt: null, supersededAt: null,
        },
      ],
      checkedOutBy: null, checkedOutAt: null,
    })
    toast.success(`Revision ${rev} uploaded`, `Revision ${uploading.currentRevision} is kept and marked superseded.`)
    setUploading(null); setUpFile(''); setUpNote('')
  }

  function approve(doc: ManagedDocument) {
    if (doc.status !== 'PENDING_APPROVAL') { toast.error('Only a document awaiting approval can be approved.'); return }
    const now = new Date().toISOString()
    docs.update(doc.uid, {
      status: 'APPROVED',
      revisions: doc.revisions.map((r) => (r.revision === doc.currentRevision ? { ...r, approvedBy: ME, approvedAt: now } : r)),
    })
    toast.success(`${doc.docNo} revision ${doc.currentRevision} approved`)
  }

  function save() {
    if (!editing) return
    const problems: string[] = []
    if (!editing.title?.trim()) problems.push('Give the document a title.')
    if (!editing.folder?.trim()) problems.push('Every document needs a folder.')
    if (editing.expiresOn && (editing.reviewLeadDays ?? 0) <= 0) problems.push('A document that expires needs a review lead time, or nobody is warned.')
    if (editing.expiresOn && editing.expiresOn < today && !editing.uid) problems.push('A new document cannot be given an expiry date in the past.')
    if (problems.length) { toast.error(problems[0]); return }

    if (editing.uid) { docs.update(editing.uid, editing as ManagedDocument); toast.success(`${editing.docNo} updated`) }
    else {
      const seq = live.length + 520
      docs.create({ ...(BLANK(folder ?? 'General') as ManagedDocument), ...(editing as ManagedDocument), uid: newUid('doc'), docNo: `DOC/GEN/${String(seq).padStart(4, '0')}` })
      toast.success('Document registered', 'Upload the first revision to make it usable.')
    }
    setEditing(null)
  }

  function removeDoc(doc: ManagedDocument) {
    if (doc.revisions.some((r) => r.approvedBy)) {
      toast.error('This document has approved revisions. Archive it instead — an approved document is a record.')
      return
    }
    docs.remove(doc.uid)
    if (openUid === doc.uid) setOpenUid(null)
    toast.success(`${doc.docNo} removed`)
  }

  /* ── folder tree ────────────────────────────────────────────── */

  function renderTree(nodes: FolderNode[]) {
    return nodes.map((n) => {
      const isOpen = expanded.has(n.path)
      const totalBeneath = documentsUnder(n.path, live).length
      return (
        <div key={n.path}>
          <div
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors hover:bg-surface-2',
              folder === n.path && 'bg-brand-500/10 text-brand-600',
            )}
            style={{ paddingLeft: `${n.depth * 0.85 + 0.4}rem` }}
            onClick={() => setFolder(folder === n.path ? null : n.path)}
          >
            {n.children.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded((prev) => { const next = new Set(prev); if (next.has(n.path)) next.delete(n.path); else next.add(n.path); return next })
                }}
                className="rounded p-0.5 text-fg-subtle hover:text-fg"
                aria-label={isOpen ? 'Collapse' : 'Expand'}
              >
                <ChevronRight className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-90')} />
              </button>
            ) : <span className="w-4" />}
            <FolderOpen className="h-3 w-3 shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1 truncate">{n.name}</span>
            <span className="shrink-0 text-2xs tabular text-fg-subtle">{totalBeneath}</span>
          </div>
          {isOpen && n.children.length > 0 && renderTree(n.children)}
        </div>
      )
    })
  }

  /* ── columns ────────────────────────────────────────────────── */

  const columns: Column<ManagedDocument>[] = [
    {
      key: 'doc', header: 'Document', width: '24rem',
      render: (d) => (
        <>
          <p className="truncate text-xs text-fg">
            {d.title}
            {d.isConfidential && <Lock className="ml-1.5 inline h-3 w-3 text-warning" />}
          </p>
          <p className="font-mono text-2xs text-fg-subtle">{d.docNo} · {d.folder}</p>
        </>
      ),
    },
    { key: 'category', header: 'Category', width: '13rem', render: (d) => <Badge tone="neutral" size="sm" dot={false}>{DOC_CATEGORY_LABEL[d.category]}</Badge> },
    { key: 'rev', header: 'Revision', width: '9rem', align: 'right', render: (d) => (<><p className="text-xs tabular text-fg">{d.currentRevision}</p><p className="text-3xs text-fg-subtle">{d.revisions.length} kept</p></>) },
    { key: 'owner', header: 'Owner', width: '12rem', render: (d) => (<><p className="text-2xs text-fg-muted">{d.owner}</p><p className="text-3xs text-fg-subtle">{d.department}</p></>) },
    {
      key: 'updated', header: 'Last revised', width: '11rem',
      render: (d) => {
        const cur = d.revisions.find((r) => r.revision === d.currentRevision)
        return <span className="text-2xs tabular text-fg-muted">{cur ? formatDate(cur.uploadedAt.slice(0, 10)) : '—'}</span>
      },
    },
    {
      key: 'expiry', header: 'Expiry', width: '13rem',
      render: (d) => {
        const s = documentState(d, today)
        if (s.daysToExpiry === null) return <span className="text-2xs text-fg-subtle">Does not expire</span>
        if (s.isExpired) return <Badge tone="danger" size="sm">Expired {Math.abs(s.daysToExpiry)}d ago</Badge>
        if (s.isDueForReview) return <Badge tone="warning" size="sm">{s.daysToExpiry}d left</Badge>
        return <span className="text-2xs tabular text-fg-muted">{formatDate(d.expiresOn as string)}</span>
      },
    },
    {
      key: 'lock', header: 'Lock', width: '11rem',
      render: (d) => (d.checkedOutBy ? <Badge tone="warning" size="sm">{d.checkedOutBy}</Badge> : <span className="text-2xs text-fg-subtle">—</span>),
    },
    { key: 'status', header: 'Status', width: '12rem', render: (d) => <Badge tone={STATUS_TONE[d.status]} size="sm">{d.status.replace(/_/g, ' ').toLowerCase()}</Badge> },
    { key: 'links', header: 'Linked to', width: '11rem', render: (d) => (d.links.length ? <span className="text-2xs text-fg-muted">{d.links.length} record{d.links.length === 1 ? '' : 's'}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
  ]

  return (
    <div>
      <PageHeader
        title="Document management"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Documents' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK(folder ?? 'General'))}>Register a document</Button>}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: live.length },
              { id: 'expiring', label: 'Expiring', count: k.expired + k.dueReview },
              { id: 'pending', label: 'Awaiting approval', count: k.pending },
              { id: 'checkedout', label: 'Checked out', count: k.checkedOut },
            ]}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Documents" value={k.total} sub={`${k.revisions} revisions kept · ${(k.bytes / 1024 / 1024).toFixed(0)} MB`} icon={<FileText />} tone="brand" />
        <StatTile label="Expired" value={k.expired} sub={k.expired ? 'These must not be used' : 'Nothing has lapsed'} tone={k.expired ? 'danger' : 'success'} />
        <StatTile label="Due for review" value={k.dueReview} sub="Inside the renewal lead time" tone={k.dueReview ? 'warning' : 'success'} />
        <StatTile label="Checked out" value={k.checkedOut} sub={`${k.pending} awaiting approval · ${k.confidential} confidential`} tone={k.checkedOut ? 'warning' : 'neutral'} />
      </div>

      {k.expired > 0 && (
        <Alert tone="danger" title={`${k.expired} document${k.expired === 1 ? ' has' : 's have'} expired`} className="mb-4">
          {states.filter((s) => s.isExpired).map((s) => `${s.document.title} (lapsed ${Math.abs(s.daysToExpiry as number)} days ago)`).join(' · ')}.
          A lapsed statutory document is not a filing problem — it is an operating one.
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit">
          <CardBody className="p-2">
            <div className="mb-2 flex items-center justify-between px-1.5">
              <p className="text-3xs uppercase tracking-wider text-fg-subtle">Folders</p>
              {folder && <Button variant="ghost" size="sm" onClick={() => setFolder(null)}>Clear</Button>}
            </div>
            <div
              className={cn('mb-1 cursor-pointer rounded px-1.5 py-1 text-xs transition-colors hover:bg-surface-2', !folder && 'bg-brand-500/10 text-brand-600')}
              onClick={() => setFolder(null)}
            >
              <span className="flex items-center gap-1.5"><FolderOpen className="h-3 w-3" /> All documents <span className="ml-auto text-2xs tabular text-fg-subtle">{live.length}</span></span>
            </div>
            {renderTree(tree)}
          </CardBody>
        </Card>

        <div>
          <Card className="mb-3">
            <CardBody className="flex flex-wrap items-center gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title, number, tag or linked record" leftIcon={<Search />} className="w-80" aria-label="Search documents" />
              {folder && <Badge tone="brand" size="sm" dot={false}>in {folder}</Badge>}
              <span className="ml-auto text-2xs text-fg-subtle">{filtered.length} of {live.length}</span>
            </CardBody>
          </Card>

          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(d) => d.uid}
            onRowClick={(d) => setOpenUid(d.uid)}
            rowClassName={(d) => { const s = documentState(d, today); return s.isExpired ? 'bg-danger/5' : s.isDueForReview ? 'bg-warning/5' : undefined }}
            onExport={(f: ExportFormat) => { const n = exportRows(f, 'documents', 'Document register', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
            rowActions={(d) => (
              <>
                <MenuItem label="Edit" onClick={() => setEditing({ ...d, links: d.links.map((l) => ({ ...l })), tags: [...d.tags] })} />
                {d.checkedOutBy === ME
                  ? <MenuItem label="Check in" onClick={() => checkIn(d)} />
                  : !d.checkedOutBy && <MenuItem label="Check out" onClick={() => checkOut(d)} />}
                <MenuItem label="Upload a revision" onClick={() => { setUploading(d); setUpFile(''); setUpNote('') }} />
                {d.status === 'PENDING_APPROVAL' && <MenuItem label="Approve" onClick={() => approve(d)} />}
                <MenuItem label="Delete" danger onClick={() => removeDoc(d)} />
              </>
            )}
            emptyTitle="No documents"
            emptyDescription={folder ? `Nothing in ${folder}.` : 'Register one to start the repository.'}
          />
        </div>
      </div>

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setOpenUid(null)} title={detail ? `${detail.docNo} · ${detail.title}` : ''} width="max-w-2xl">
        {detail && (() => {
          const s = documentState(detail, today, ME)
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[detail.status]} size="md">{detail.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                <Badge tone="neutral" size="sm" dot={false}>{DOC_CATEGORY_LABEL[detail.category]}</Badge>
                <Badge tone="brand" size="sm" dot={false}>revision {detail.currentRevision}</Badge>
                {detail.isConfidential && <Badge tone="warning" size="sm">Confidential</Badge>}
              </div>

              <Alert tone={s.isExpired ? 'danger' : s.isDueForReview ? 'warning' : s.isCheckedOut ? 'info' : 'tip'} title="Where it stands">
                {s.note}
              </Alert>

              {detail.description && <p className="text-xs leading-relaxed text-fg-muted">{detail.description}</p>}

              <DataGrid columns={3} items={[
                { label: 'Folder', value: detail.folder },
                { label: 'Owner', value: `${detail.owner} · ${detail.department}` },
                { label: 'Revisions kept', value: String(detail.revisions.length) },
                { label: 'Expires', value: detail.expiresOn ? formatDate(detail.expiresOn) : 'Never' },
                { label: 'Review lead', value: detail.reviewLeadDays ? `${detail.reviewLeadDays} days` : '—' },
                { label: 'Downloads', value: String(detail.downloadCount) },
              ]} />

              <div>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Revision history</p>
                <div className="space-y-1.5">
                  {detail.revisions.slice().reverse().map((r) => {
                    const isCurrent = r.revision === detail.currentRevision
                    return (
                      <div key={r.uid} className={cn('rounded border p-2.5', isCurrent ? 'border-brand-400/40 bg-brand-500/5' : 'border-border opacity-75')}>
                        <div className="flex items-baseline gap-2">
                          <Badge tone={isCurrent ? 'brand' : 'neutral'} size="sm" dot={false}>Rev {r.revision}</Badge>
                          <span className="font-mono text-2xs text-fg-muted">{r.fileName}</span>
                          <span className="ml-auto text-3xs text-fg-subtle">{(r.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-fg">{r.changeNote}</p>
                        <p className="mt-1 text-3xs text-fg-subtle">
                          {r.uploadedBy} on {formatDateTime(r.uploadedAt)}
                          {r.approvedBy ? ` · approved by ${r.approvedBy}` : ' · not yet approved'}
                          {r.supersededAt ? ` · superseded ${formatDate(r.supersededAt.slice(0, 10))}` : ''}
                        </p>
                      </div>
                    )
                  })}
                  {detail.revisions.length === 0 && <p className="text-2xs text-fg-subtle">No revision uploaded yet.</p>}
                </div>
              </div>

              {detail.links.length > 0 && (
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Linked records</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.links.map((l, i) => (
                      <Badge key={i} tone="neutral" size="sm" dot={false}>{l.entityType}: {l.entityCode} — {l.entityName}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {detail.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.map((t) => (<Badge key={t} tone="neutral" size="sm" dot={false}>#{t}</Badge>))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail, links: detail.links.map((l) => ({ ...l })), tags: [...detail.tags] }); setOpenUid(null) }}>Edit</Button>
                {detail.checkedOutBy === ME
                  ? <Button variant="outline" size="sm" onClick={() => checkIn(detail)}>Check in</Button>
                  : !detail.checkedOutBy && <Button variant="outline" size="sm" onClick={() => checkOut(detail)}>Check out</Button>}
                <Button variant="primary" size="sm" icon={<Upload />} onClick={() => { setUploading(detail); setUpFile(''); setUpNote('') }} disabled={!s.canUpload}>Upload a revision</Button>
                {detail.status === 'PENDING_APPROVAL' && <Button variant="primary" size="sm" onClick={() => approve(detail)}>Approve revision {detail.currentRevision}</Button>}
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── upload ───────────────────────────────────────────── */}
      <Modal
        open={!!uploading}
        onClose={() => setUploading(null)}
        title={uploading ? `New revision of ${uploading.docNo}` : ''}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setUploading(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={uploadRevision}>Upload</Button></>}
      >
        {uploading && (() => {
          const blockers = uploadBlockers(uploading, ME)
          return (
            <div className="space-y-3">
              <p className="text-xs text-fg-muted">
                This will become revision <strong className="text-fg">{nextRevision(uploading)}</strong>.
                Revision {uploading.currentRevision} is kept exactly as it is and marked superseded — nothing is overwritten.
              </p>
              <Input label="File name" required value={upFile} onChange={(e) => setUpFile(e.target.value)} placeholder="DD-750-GA-revD.dwg" autoFocus />
              <Textarea label="What changed" required rows={3} value={upNote} onChange={(e) => setUpNote(e.target.value)} hint="A revision with no reason cannot be reviewed by anybody later" />
              {blockers.length > 0
                ? <Alert tone="danger" title="Cannot upload"><ul className="list-disc space-y-0.5 pl-4">{blockers.map((b) => (<li key={b}>{b}</li>))}</ul></Alert>
                : <Alert tone="info" title="After upload">The document moves to awaiting approval. It is not the controlled copy until somebody approves it.</Alert>}
            </div>
          )
        })()}
      </Modal>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.docNo}` : 'Register a document'}
        width="max-w-lg"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <Input label="Title" required value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Category" value={editing.category ?? 'SOP'} onChange={(e) => setEditing({ ...editing, category: e.target.value as DocCategory })}>
                {(Object.keys(DOC_CATEGORY_LABEL) as DocCategory[]).map((c) => (<option key={c} value={c}>{DOC_CATEGORY_LABEL[c]}</option>))}
              </Select>
              <Input label="Folder" required value={editing.folder ?? ''} onChange={(e) => setEditing({ ...editing, folder: e.target.value })} hint="Slash separated, e.g. Quality/SOPs" />
            </div>
            <Textarea label="Description" rows={2} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Owner" value={editing.owner ?? ''} onChange={(e) => setEditing({ ...editing, owner: e.target.value })} />
              <Input label="Department" value={editing.department ?? ''} onChange={(e) => setEditing({ ...editing, department: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Expires on" type="date" value={editing.expiresOn ?? ''} onChange={(e) => setEditing({ ...editing, expiresOn: e.target.value || null })} hint="Leave blank if it never expires" />
              <Input label="Warn this early (days)" type="number" value={String(editing.reviewLeadDays ?? 0)} onChange={(e) => setEditing({ ...editing, reviewLeadDays: Number(e.target.value) })} disabled={!editing.expiresOn} />
            </div>
            <Input
              label="Tags" value={(editing.tags ?? []).join(', ')}
              onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
              hint="Comma separated"
            />
            <Switch label="Confidential — restricted to the owning department" checked={!!editing.isConfidential} onChange={(v) => setEditing({ ...editing, isConfidential: v })} />
          </div>
        )}
      </Drawer>
    </div>
  )
}
