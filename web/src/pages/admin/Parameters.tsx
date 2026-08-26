import { useMemo, useState } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, SearchInput, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import type { Parameter } from '@/api/parameters'
import { useParameters, useUpdateParameters } from '@/hooks/useParameters'

/** Wired to the live backend `sys_parameter` store. Typed values, grouped by
 *  area; changes are validated server-side (number/boolean/option). */

export function ParametersPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useParameters()
  const update = useUpdateParameters()

  const params = data ?? []
  const [q, setQ] = useState('')
  // Pending edits keyed by param_key.
  const [edits, setEdits] = useState<Record<string, string>>({})

  const valueOf = (p: Parameter) => edits[p.param_key] ?? p.value
  const isDirty = (p: Parameter) => edits[p.param_key] !== undefined && edits[p.param_key] !== p.value
  const setVal = (p: Parameter, v: string) => setEdits((e) => ({ ...e, [p.param_key]: v }))

  const dirtyCount = params.filter(isDirty).length

  const filtered = params.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.param_key.toLowerCase().includes(q.toLowerCase()),
  )
  const grouped = useMemo(() => {
    const m = new Map<string, Parameter[]>()
    for (const p of filtered) {
      const list = m.get(p.param_group) ?? []
      list.push(p)
      m.set(p.param_group, list)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  function save() {
    const changes = params
      .filter(isDirty)
      .map((p) => ({ param_key: p.param_key, value: edits[p.param_key] }))
    if (!changes.length) return
    update.mutate(changes, {
      onSuccess: () => {
        toast.success('Parameters saved', `${changes.length} value${changes.length > 1 ? 's' : ''} updated.`)
        setEdits({})
      },
      onError: (e) =>
        toast.error('Save failed', e instanceof ProblemError ? e.problem.detail : 'Could not save parameters.'),
    })
  }

  return (
    <div>
      <PageHeader
        title="System parameters"
        description="Configurable behaviour without code changes. Typed values are validated server-side on save."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & Ops' }, { label: 'System parameters' }]}
        actions={
          <>
            {dirtyCount > 0 && <Button variant="outline" size="sm" onClick={() => setEdits({})}>Discard ({dirtyCount})</Button>}
            <Button variant="primary" size="sm" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={save} loading={update.isPending} disabled={dirtyCount === 0}>
              {dirtyCount > 0 ? `Save ${dirtyCount}` : 'Save'}
            </Button>
          </>
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load parameters">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <div className="mb-3 max-w-sm">
        <SearchInput sizeVariant="sm" placeholder="Search parameters…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">Loading parameters…</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([group, list]) => (
            <Card key={group}>
              <CardHeader title={group} description={`${list.length} parameter${list.length > 1 ? 's' : ''}`} />
              <div className="divide-y divide-border">
                {list.map((p) => (
                  <div key={p.param_key} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', isDirty(p) && 'bg-brand-500/[0.04]')}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-fg">{p.name}</span>
                        <span className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px] text-fg-subtle">{p.param_key}</span>
                        <Badge tone="neutral" size="sm" dot={false}>{p.scope === 'INSTALLATION' ? 'installation' : 'company'}</Badge>
                        {isDirty(p) && <Badge tone="warning" size="sm">unsaved</Badge>}
                      </div>
                      {p.description && <p className="mt-0.5 text-2xs text-fg-muted">{p.description}</p>}
                    </div>
                    <div className="flex w-56 shrink-0 items-center justify-end gap-2">
                      <ParamEditor param={p} value={valueOf(p)} onChange={(v) => setVal(p, v)} />
                      {valueOf(p) !== p.default_value && (
                        <Button size="xs" variant="ghost" title="Reset to default" onClick={() => setVal(p, p.default_value)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {grouped.length === 0 && (
            <Card className="p-8 text-center text-sm text-fg-subtle">No parameters match “{q}”.</Card>
          )}
        </div>
      )}
    </div>
  )
}

function ParamEditor({ param, value, onChange }: { param: Parameter; value: string; onChange: (v: string) => void }) {
  if (param.value_type === 'BOOLEAN') {
    return <Switch checked={value === 'true'} onChange={(v) => onChange(v ? 'true' : 'false')} label={value === 'true' ? 'On' : 'Off'} />
  }
  if (param.options && param.options.length > 0) {
    return (
      <Select sizeVariant="sm" value={value} onChange={(e) => onChange(e.target.value)}
        options={param.options.map((o) => ({ value: o, label: o.replace(/_/g, ' ') }))} />
    )
  }
  if (param.value_type === 'NUMBER') {
    return <Input sizeVariant="sm" type="number" value={value} onChange={(e) => onChange(e.target.value)} />
  }
  return <Input sizeVariant="sm" value={value} onChange={(e) => onChange(e.target.value)} />
}
