import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Copy, GitMerge, Search, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Radio, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import { getDuplicateCandidates } from '@/api/masters'
import type { DuplicateCandidate } from '@/types/masters'

/** Match-field configuration per master — the framework's duplicate detection. */
const MATCH_RULES = [
  { master: 'Supplier', fields: ['GSTIN (exact)', 'PAN (exact)', 'Legal name (fuzzy ≥ 85%)'], action: 'BLOCK on GSTIN, WARN on name' },
  { master: 'Customer', fields: ['GSTIN (exact)', 'PAN (exact)', 'Name + billing pincode (fuzzy)'], action: 'BLOCK on GSTIN, WARN on name' },
  { master: 'Item', fields: ['Code (exact)', 'Specification + HSN (fuzzy ≥ 80%)', 'Grade + thickness + capacity'], action: 'BLOCK on code, WARN on specification' },
  { master: 'Employee', fields: ['Employee code (exact)', 'PAN (exact)', 'Aadhaar (exact)'], action: 'BLOCK on all' },
  { master: 'Transporter', fields: ['Transporter ID (exact)', 'Name + city (fuzzy ≥ 75%)'], action: 'BLOCK on ID, WARN on name' },
  { master: 'Machine', fields: ['Asset code (exact)', 'Serial number (exact)'], action: 'BLOCK on all' },
]

function scoreTone(score: number) {
  if (score >= 90) return 'danger' as const
  if (score >= 75) return 'warning' as const
  return 'neutral' as const
}

function MergeModal({ d, onClose }: { d: DuplicateCandidate; onClose: () => void }) {
  const toast = useToast()
  const [keep, setKeep] = useState<'A' | 'B'>(d.recordA.usageCount >= d.recordB.usageCount ? 'A' : 'B')
  const [reassign, setReassign] = useState(true)
  const [copyAttachments, setCopyAttachments] = useState(true)
  const [keepAlias, setKeepAlias] = useState(true)

  const survivor = keep === 'A' ? d.recordA : d.recordB
  const merged = keep === 'A' ? d.recordB : d.recordA

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Merge duplicate records"
      description={`${d.masterName} · ${d.matchScore}% match on ${d.matchedOn.join(', ')}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<GitMerge className="h-4 w-4" />}
            onClick={() => {
              toast.success('Merge requested', 'A merge requires a second approval before it executes.')
              onClose()
            }}
          >
            Request merge
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {([['A', d.recordA], ['B', d.recordB]] as const).map(([key, rec]) => (
            <button
              key={key}
              type="button"
              onClick={() => setKeep(key)}
              className={cn(
                'rounded-card border p-3 text-left transition-colors',
                keep === key ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:bg-surface-2',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Radio checked={keep === key} onChange={() => setKeep(key)} label={keep === key ? 'Keep this record' : 'Merge this away'} />
              </div>
              <p className="mt-2 font-mono text-2xs text-fg-subtle">{rec.code}</p>
              <p className="text-sm font-medium text-fg">{rec.name}</p>
              <p className="mt-0.5 text-2xs text-fg-muted">{rec.detail}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-fg-subtle">
                <span>Created {formatDate(rec.createdAt)}</span>
                <span>·</span>
                <span className={rec.usageCount > 0 ? 'text-warning' : ''}>{rec.usageCount} references</span>
              </div>
            </button>
          ))}
        </div>

        <Alert tone="warning" title="What a merge actually does">
          Every reference to <span className="font-mono">{merged.code}</span> is repointed at{' '}
          <span className="font-mono">{survivor.code}</span>, and{' '}
          <span className="font-mono">{merged.code}</span> is archived — not deleted. Historical
          documents keep their audit trail and can still be traced back to the record they were
          originally raised against.
        </Alert>

        {merged.usageCount > 0 && (
          <Alert tone="danger" title={`${merged.usageCount} transaction references the record being merged away`}>
            Those references will be rewritten to point at the survivor. That is usually what you
            want, but it changes documents that have already been approved — which is why a merge
            needs a second approval and is written to the audit trail as a single, reversible
            operation.
          </Alert>
        )}

        <div className="space-y-2.5 rounded border border-border p-3">
          <Switch checked={reassign} onChange={setReassign} label="Repoint existing transaction references to the surviving record" />
          <Switch checked={copyAttachments} onChange={setCopyAttachments} label="Copy attachments and comments onto the survivor" />
          <Switch checked={keepAlias} onChange={setKeepAlias} label="Keep the merged code as a searchable alias" />
        </div>

        <Textarea label="Justification" rows={3} required placeholder="Why these are the same entity. Read by the approver and retained on the audit trail." />
      </div>
    </Modal>
  )
}

export function DuplicatesPage() {
  const toast = useToast()
  const [tab, setTab] = useState('queue')
  const [masterFilter, setMasterFilter] = useState('')
  const [merge, setMerge] = useState<DuplicateCandidate | null>(null)

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['masters', 'duplicate-candidates'],
    queryFn: getDuplicateCandidates,
  })

  const open = candidates.filter((d) => d.status === 'OPEN')
  const rows = useMemo(
    () => (masterFilter ? open.filter((d) => d.masterCode === masterFilter) : open),
    [masterFilter, open],
  )

  const masters = [...new Set(candidates.map((d) => d.masterCode))]
  const highConfidence = open.filter((d) => d.matchScore >= 90)

  return (
    <div>
      <PageHeader
        title="Duplicate review"
        description="Duplicate masters are the most expensive data-quality problem in an ERP — split spend, wrong stock, two ledgers for one supplier. Detection is automatic; merging is a human decision."
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }, { label: 'Duplicate review' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'queue', label: 'Review queue', count: open.length },
              { id: 'rules', label: 'Match rules', count: MATCH_RULES.length },
            ]}
          />
        }
      />

      {highConfidence.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${highConfidence.length} near-certain duplicate`}>
          These share an exact GSTIN, PAN or asset code. A shared statutory identifier is not a
          coincidence — two records for the same legal entity split the spend analysis and produce
          two ledgers where there should be one.
        </Alert>
      )}

      {tab === 'queue' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              sizeVariant="sm"
              value={masterFilter}
              onChange={(e) => setMasterFilter(e.target.value)}
              options={[{ value: '', label: 'All masters' }, ...masters.map((m) => ({ value: m, label: m }))]}
            />
            <span className="text-2xs text-fg-subtle">
              {rows.length} candidate{rows.length === 1 ? '' : 's'} shown
            </span>
          </div>

          {isLoading && (
            <Card>
              <CardBody>
                <div className="flex flex-col items-center py-10 text-center text-fg-muted">
                  <p className="text-sm">Scanning masters for duplicates…</p>
                </div>
              </CardBody>
            </Card>
          )}

          {!isLoading && rows.length === 0 && (
            <Card>
              <CardBody>
                <div className="flex flex-col items-center py-10 text-center">
                  <ShieldCheck className="mb-2 h-6 w-6 text-success" />
                  <p className="text-sm font-medium text-fg">No open duplicate candidates</p>
                  <p className="mt-1 max-w-md text-xs text-fg-muted">
                    Detection runs on every create and on a nightly sweep across existing records,
                    so this queue refills itself when something slips through.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {rows.map((d) => (
            <Card key={d.uid}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Badge tone="neutral" size="sm" dot={false}>{d.masterName}</Badge>
                    <span className="text-sm">{d.matchScore}% match</span>
                  </span>
                }
                description={`Matched on ${d.matchedOn.join(', ')}`}
                actions={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X className="h-3.5 w-3.5" />}
                      onClick={() => toast.success('Dismissed', 'These will not be flagged against each other again.')}
                    >
                      Not a duplicate
                    </Button>
                    <Button variant="primary" size="sm" icon={<GitMerge className="h-3.5 w-3.5" />} onClick={() => setMerge(d)}>
                      Merge
                    </Button>
                  </div>
                }
              />
              <CardBody>
                <div className="mb-3">
                  <ProgressBar value={d.matchScore} showLabel tone={scoreTone(d.matchScore) === 'danger' ? 'danger' : scoreTone(d.matchScore) === 'warning' ? 'warning' : 'success'} />
                </div>
                <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
                  {[d.recordA, d.recordB].map((rec, idx) => (
                    <div key={rec.uid} className="contents">
                      <div className="rounded border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-2xs text-fg-subtle">{rec.code}</span>
                          <Badge tone={rec.usageCount > 0 ? 'progress' : 'neutral'} size="sm" dot={false}>
                            {rec.usageCount} refs
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-medium text-fg">{rec.name}</p>
                        <p className="mt-0.5 text-2xs text-fg-muted">{rec.detail}</p>
                        <p className="mt-1.5 text-2xs text-fg-subtle">Created {formatDate(rec.createdAt)}</p>
                        {idx === 0 && rec.usageCount > d.recordB.usageCount && (
                          <p className="mt-1.5 text-2xs text-success">Suggested survivor — more references</p>
                        )}
                        {idx === 1 && rec.usageCount > d.recordA.usageCount && (
                          <p className="mt-1.5 text-2xs text-success">Suggested survivor — more references</p>
                        )}
                      </div>
                      {idx === 0 && (
                        <div className="flex items-center justify-center">
                          <ArrowRight className="h-4 w-4 text-fg-subtle" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'rules' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Match rules"
              description="Configured per master. Exact matches on a statutory identifier block the save; fuzzy matches warn and queue for review."
            />
            <CardBody className="p-0">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="w-44">Master</th>
                    <th>Match fields</th>
                    <th className="w-72">Behaviour</th>
                  </tr>
                </thead>
                <tbody>
                  {MATCH_RULES.map((r) => (
                    <tr key={r.master}>
                      <td className="font-medium text-fg">{r.master}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {r.fields.map((f) => (
                            <Badge key={f} tone="neutral" size="sm" dot={false}>{f}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="text-2xs text-fg-muted">{r.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="When detection runs" />
            <CardBody>
              <ul className="space-y-2 text-xs text-fg-muted">
                {[
                  'On save — before the record is written, so an exact statutory match never gets created in the first place.',
                  'On import — every row is checked against existing records and against the other rows in the same file.',
                  'Nightly sweep — fuzzy matching across all existing records, which catches pairs that were created before a rule was tightened.',
                  'On demand — a data steward can re-run detection for one master after changing its match fields.',
                ].map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Why merging needs approval" icon={<Search className="h-4 w-4" />} />
            <CardBody>
              <p className="text-xs leading-relaxed text-fg-muted">
                A merge rewrites references on documents that are already approved and, in some
                cases, already filed with the tax authority. That is a legitimate thing to do — two
                supplier records for one GSTIN produce two ledgers and a wrong GSTR-2B
                reconciliation — but it is not a routine edit.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                So the framework treats it as a controlled operation: a second approver, a mandatory
                justification, a single audit entry describing the whole merge, and the merged code
                retained as a searchable alias so anyone holding a printed document can still find
                the record it refers to.
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {merge && <MergeModal d={merge} onClose={() => setMerge(null)} />}
    </div>
  )
}
