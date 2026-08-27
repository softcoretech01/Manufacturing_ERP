import { useState } from 'react'
import { AtSign, Eye, EyeOff, MessageSquare, Reply, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { formatTimeAgo } from '@/lib/format'
import { comments } from '@/mock/data2'
import { users } from '@/mock/data'
import type { Comment } from '@/types'

function CommentThread({ comment, depth = 0 }: { comment: Comment; depth?: number }) {
  const [replying, setReplying] = useState(false)
  const toast = useToast()

  return (
    <div className={cn(depth > 0 && 'ml-7 border-l border-border pl-3')}>
      <div className="flex gap-2.5 py-2.5">
        <Avatar name={comment.author} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-fg">{comment.author}</span>
            <span className="text-2xs text-fg-subtle">{formatTimeAgo(comment.at)}</span>
            <Badge tone={comment.visibility === 'EXTERNAL' ? 'warning' : 'neutral'} size="sm" dot={false}>
              {comment.visibility === 'EXTERNAL' ? (
                <span className="flex items-center gap-1"><Eye className="h-2.5 w-2.5" /> visible to partner</span>
              ) : (
                <span className="flex items-center gap-1"><EyeOff className="h-2.5 w-2.5" /> internal</span>
              )}
            </Badge>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">
            {comment.body.split(/(@[\w.]+)/g).map((part, i) =>
              part.startsWith('@') ? (
                <span key={i} className="rounded bg-brand-500/10 px-1 font-medium text-brand-600">{part}</span>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="inline-flex items-center gap-1 text-2xs text-fg-subtle hover:text-fg"
            >
              <Reply className="h-3 w-3" /> Reply
            </button>
            <span className="font-mono text-2xs text-fg-subtle">{comment.entityType}</span>
          </div>

          {replying && (
            <div className="mt-2 space-y-2">
              <Textarea rows={2} placeholder="Write a reply… use @ to mention someone" autoFocus />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" icon={<Send className="h-3.5 w-3.5" />} onClick={() => { toast.success('Reply posted'); setReplying(false) }}>
                  Reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {comment.replies?.map((r) => (
        <CommentThread key={r.uid} comment={r} depth={depth + 1} />
      ))}
    </div>
  )
}

export function CollaborationPage() {
  const toast = useToast()
  const [tab, setTab] = useState('threads')
  const [visibility, setVisibility] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL')
  const [draft, setDraft] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [settings, setSettings] = useState({ notifyMentioned: true, notifyOwner: true, includeInPdf: true, allowOnCancelled: false })

  const external = comments.filter((c) => c.visibility === 'EXTERNAL')
  const mentions = comments.flatMap((c) => c.mentions)

  return (
    <div>
      <PageHeader
        title="Comments & collaboration"
        description="Discussion attached to the document it concerns, not scattered across email. Comments are part of the record and are exported with the document."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Platform services' }, { label: 'Collaboration' }]}
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'threads', label: 'Recent threads', count: comments.length },
              { id: 'mentions', label: 'My mentions', count: mentions.length },
              { id: 'settings', label: 'Settings' },
            ]}
          />
        }
      />

      {tab === 'threads' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader title="Recent activity" description="Across all documents you can see" />
            <CardBody className="divide-y divide-border p-0">
              {comments.map((c) => (
                <div key={c.uid} className="px-4">
                  <CommentThread comment={c} />
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="New comment" />
              <CardBody className="space-y-3">
                <Select
                  label="On document"
                  options={[
                    { value: 'PO/HO/2627/00184', label: 'PO/HO/2627/00184 — Jindal Stainless' },
                    { value: 'GRN/P1/2627/00317', label: 'GRN/P1/2627/00317' },
                    { value: 'SUP-00042', label: 'Supplier — Perfect Polymers' },
                  ]}
                />
                <div className="relative">
                  <Textarea
                    label="Comment"
                    rows={4}
                    value={draft}
                    placeholder="Type @ to mention a colleague…"
                    onChange={(e) => {
                      setDraft(e.target.value)
                      setMentionOpen(e.target.value.endsWith('@'))
                    }}
                  />
                  {mentionOpen && (
                    <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded border border-border bg-surface shadow-lg">
                      {users.filter((u) => u.status === 'ACTIVE').slice(0, 8).map((u) => (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() => {
                            setDraft((d) => d + u.loginId + ' ')
                            setMentionOpen(false)
                          }}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-2"
                        >
                          <Avatar name={u.fullName} size="xs" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs text-fg">{u.fullName}</span>
                            <span className="block truncate text-2xs text-fg-subtle">{u.designation}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2 rounded border border-border p-2.5">
                  <p className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Visibility</p>
                  <Switch
                    checked={visibility === 'EXTERNAL'}
                    onChange={(v) => setVisibility(v ? 'EXTERNAL' : 'INTERNAL')}
                    label="Visible to the supplier / customer on the portal"
                  />
                  {visibility === 'EXTERNAL' && (
                    <p className="text-2xs text-warning">
                      This comment will be readable by the trading partner. Do not include internal
                      margins, alternate quotes or negotiation positions.
                    </p>
                  )}
                </div>
                <Button variant="primary" size="sm" className="w-full" icon={<Send className="h-3.5 w-3.5" />} onClick={() => { toast.success('Comment posted', 'Mentioned users have been notified.'); setDraft('') }}>
                  Post comment
                </Button>
              </CardBody>
            </Card>

            
          </div>
        </div>
      )}

      {tab === 'mentions' && (
        <Card>
          <CardHeader title="Where you were mentioned" />
          <CardBody className="divide-y divide-border p-0">
            {comments.filter((c) => c.mentions.length > 0).map((c) => (
              <div key={c.uid} className="px-4">
                <CommentThread comment={c} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === 'settings' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Behaviour" />
            <CardBody className="space-y-3">
              <Switch checked={settings.notifyMentioned} onChange={(v) => setSettings((s) => ({ ...s, notifyMentioned: v }))} label="Notify mentioned users immediately" />
              <Switch checked={settings.notifyOwner} onChange={(v) => setSettings((s) => ({ ...s, notifyOwner: v }))} label="Notify the document owner on every comment" />
              <Switch checked={settings.includeInPdf} onChange={(v) => setSettings((s) => ({ ...s, includeInPdf: v }))} label="Include comment history in the document PDF" />
              <Switch checked={settings.allowOnCancelled} onChange={(v) => setSettings((s) => ({ ...s, allowOnCancelled: v }))} label="Allow comments on cancelled documents" />
              <Select
                label="Edit window"
                defaultValue="5"
                options={[
                  { value: '0', label: 'No editing — comments are immutable' },
                  { value: '5', label: '5 minutes' },
                  { value: '15', label: '15 minutes' },
                ]}
                hint="After the window closes a comment can only be retracted, and the retraction is visible."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Partner visibility" description="What suppliers and customers can see" />
            <CardBody className="space-y-3">
              <p className="text-xs text-fg-muted">
                Comments default to internal. A comment only reaches the portal when someone
                deliberately marks it external, and that choice is recorded on the audit trail
                against their name.
              </p>
              <ul className="space-y-2 text-xs text-fg-muted">
                {[
                  'Internal comments are never returned by the portal API, not merely hidden in the portal UI.',
                  'A partner reply always arrives as external and cannot be re-classified as internal.',
                  'Attachments follow the same rule and inherit their comment’s visibility.',
                ].map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
