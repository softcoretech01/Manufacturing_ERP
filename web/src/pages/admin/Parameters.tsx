import { useMemo, useState } from 'react'
import { Eye, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, SearchInput, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { systemParameters } from '@/mock/data2'
import type { SystemParameter } from '@/types'

function ParameterControl({ p, onChange }: { p: SystemParameter; onChange: () => void }) {
  const [reveal, setReveal] = useState(false)

  if (p.valueType === 'BOOLEAN') {
    return <Switch checked={p.value === 'true'} onChange={onChange} />
  }
  if (p.valueType === 'ENUM') {
    return (
      <Select
        sizeVariant="sm"
        defaultValue={p.value}
        onChange={onChange}
        options={(p.options ?? []).map((o) => ({ value: o, label: o.replace(/_/g, ' ').toLowerCase() }))}
        className="w-56"
      />
    )
  }
  if (p.isSensitive) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          sizeVariant="sm"
          type={reveal ? 'text' : 'password'}
          defaultValue={p.value}
          onChange={onChange}
          className="w-56 font-mono"
        />
        <Button variant="ghost" size="icon-sm" onClick={() => setReveal((v) => !v)} aria-label={reveal ? 'Hide' : 'Reveal'}>
          {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      </div>
    )
  }
  return (
    <Input
      sizeVariant="sm"
      type={p.valueType === 'NUMBER' ? 'number' : 'text'}
      defaultValue={p.value}
      onChange={onChange}
      className={cn('w-56', p.valueType === 'JSON' && 'font-mono')}
    />
  )
}

export function ParametersPage() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [scope, setScope] = useState('')
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [resetOpen, setResetOpen] = useState(false)

  const filtered = systemParameters.filter((p) => {
    if (scope && p.scope !== scope) return false
    if (!q) return true
    const s = q.toLowerCase()
    return p.name.toLowerCase().includes(s) || p.key.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)
  })

  const grouped = useMemo(() => {
    const map = new Map<string, SystemParameter[]>()
    for (const p of filtered) {
      const list = map.get(p.group) ?? []
      list.push(p)
      map.set(p.group, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const overridden = systemParameters.filter((p) => p.value !== p.defaultValue)

  return (
    <div>
      <PageHeader
        title="System parameters"
        description="Behaviour that differs between installations lives here, not in code. Changing a parameter is an audited event with the old and new value recorded."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & ops' }, { label: 'System parameters' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setResetOpen(true)}>
              Reset to defaults
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={dirty.size === 0}
              onClick={() => { toast.success(`${dirty.size} parameter(s) saved`, 'Changes take effect on the next request; cached values are invalidated immediately.'); setDirty(new Set()) }}
            >
              Save {dirty.size > 0 && `(${dirty.size})`}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          placeholder="Parameter name, key or description…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-sm"
          sizeVariant="sm"
        />
        <Select
          sizeVariant="sm"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={[
            { value: '', label: 'All scopes' },
            { value: 'INSTALLATION', label: 'Installation-wide' },
            { value: 'COMPANY', label: 'Per company' },
          ]}
        />
      </div>

      {dirty.size > 0 && (
        <Alert tone="warning" className="mb-4" title={`${dirty.size} unsaved change(s)`}>
          Parameter changes affect every user immediately once saved. Some — approval thresholds,
          self-approval, period locks — change what people are allowed to do, so they are recorded
          on the audit trail with your name against them.
        </Alert>
      )}

      <div className="space-y-4">
        {grouped.map(([group, params]) => (
          <Card key={group}>
            <CardHeader title={group} description={`${params.length} parameter${params.length > 1 ? 's' : ''}`} />
            <CardBody className="divide-y divide-border p-0">
              {params.map((p) => (
                <div key={p.uid} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{p.name}</span>
                      <Badge tone={p.scope === 'COMPANY' ? 'progress' : 'neutral'} size="sm" dot={false}>
                        {p.scope === 'COMPANY' ? 'per company' : 'installation'}
                      </Badge>
                      {p.value !== p.defaultValue && <Badge tone="warning" size="sm" dot={false}>changed</Badge>}
                      {p.isSensitive && <Badge tone="danger" size="sm" dot={false}>sensitive</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-2xs text-fg-subtle">{p.key}</p>
                    <p className="mt-1 max-w-2xl text-xs text-fg-muted">{p.description}</p>
                    {p.value !== p.defaultValue && (
                      <p className="mt-1 text-2xs text-fg-subtle">
                        Default: <span className="font-mono">{p.defaultValue}</span>
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <ParameterControl p={p} onChange={() => setDirty((d) => new Set([...d, p.uid]))} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        ))}
        {grouped.length === 0 && (
          <Card>
            <CardBody>
              <p className="py-8 text-center text-sm text-fg-muted">No parameters match "{q}".</p>
            </CardBody>
          </Card>
        )}
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset parameters to defaults"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { toast.success('Parameters reset'); setResetOpen(false) }}>
              Reset {overridden.length} parameter(s)
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            {overridden.length} parameter{overridden.length === 1 ? '' : 's'} currently differ from
            the shipped default and would be reverted.
          </p>
          <div className="max-h-52 overflow-auto rounded border border-border">
            <table className="grid-table">
              <tbody>
                {overridden.map((p) => (
                  <tr key={p.uid}>
                    <td className="font-mono text-2xs">{p.key}</td>
                    <td className="text-2xs text-danger">{p.isSensitive ? '••••' : p.value}</td>
                    <td className="text-2xs text-success">{p.isSensitive ? '••••' : p.defaultValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Alert tone="danger" title="This changes what users can do">
            Resetting re-enables shipped defaults such as blocking self-approval and locking closed
            periods. Confirm with the process owners before doing this on a live system.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
