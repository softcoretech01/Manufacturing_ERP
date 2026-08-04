import { useState } from 'react'
import { CheckCircle2, Lock, ShieldAlert, XCircle } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { Alert, Avatar, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime } from '@/lib/format'
import { loginActivity } from '@/mock/data'
import type { LoginActivity } from '@/types'

export function LoginActivityPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'login-activity', 'Login activity', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [result, setResult] = useState('')
  const [channel, setChannel] = useState('')

  const rows = loginActivity.filter(
    (a) => (!result || a.result === result) && (!channel || a.channel === channel),
  )

  const columns: Column<LoginActivity>[] = [
    { key: 'at', header: 'Time', sortable: true, width: '150px', render: (a) => formatDateTime(a.at) },
    {
      key: 'loginId',
      header: 'Login ID',
      sortable: true,
      width: '160px',
      render: (a) => (
        <span className="flex items-center gap-2">
          <Avatar name={a.userName === '—' ? '? ?' : a.userName} size="sm" />
          <span className="font-mono text-xs text-fg">{a.loginId}</span>
        </span>
      ),
    },
    { key: 'userName', header: 'User', sortable: true },
    {
      key: 'result',
      header: 'Result',
      sortable: true,
      width: '120px',
      render: (a) => (
        <Badge tone={a.result === 'SUCCESS' ? 'success' : a.result === 'LOCKED_OUT' ? 'danger' : 'warning'} size="sm">
          {a.result === 'LOCKED_OUT' ? 'Locked out' : a.result === 'SUCCESS' ? 'Success' : 'Failed'}
        </Badge>
      ),
    },
    { key: 'reason', header: 'Reason', render: (a) => <span className="text-xs text-fg-muted">{a.reason ?? '—'}</span> },
    { key: 'ipAddress', header: 'IP address', width: '130px', render: (a) => <span className="font-mono text-[11px]">{a.ipAddress}</span> },
    { key: 'channel', header: 'Channel', width: '90px', render: (a) => <Badge tone="neutral" size="sm" dot={false}>{a.channel}</Badge> },
    { key: 'userAgent', header: 'Client', defaultHidden: true },
  ]

  const trend = Array.from({ length: 14 }, (_, i) => ({
    d: `${i + 15} Jul`,
    success: 96 + Math.round(Math.sin(i / 2) * 24) + (i % 7 === 0 ? -60 : 0),
    failed: 2 + (i % 5),
  }))

  const suspicious = loginActivity.filter((a) => a.result !== 'SUCCESS' && !a.ipAddress.startsWith('10.'))

  return (
    <div>
      <PageHeader
        title="Login activity"
        description="Every authentication attempt, successful or not. Failures never reveal whether an account exists."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Access Control' }, { label: 'Login activity' }]}
        actions={<Button variant="outline" size="sm" onClick={() => toast.success('Export queued')}>Export</Button>}
      />

      {suspicious.length > 0 && (
        <Alert tone="danger" className="mb-4" title="Suspicious authentication activity detected">
          {suspicious.length} failed attempts from external addresses, including a lockout on{' '}
          <span className="font-mono">sysadmin</span> from{' '}
          <span className="font-mono">203.0.113.77</span> with a scripted client. Consider blocking the
          source range at the edge.
        </Alert>
      )}

      <Card className="mb-4">
        <CardHeader title="Authentication trend" description="Successes and failures, last 14 days" />
        <CardBody className="h-52 pl-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ok" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{
                  background: 'rgb(var(--surface))',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 6,
                  fontSize: 11,
                }}
              />
              <Area type="monotone" dataKey="success" name="Successful" stroke="#10b981" strokeWidth={2} fill="url(#ok)" />
              <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" strokeWidth={1.5} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.uid}
        searchPlaceholder="Login id, user or IP…"
        onExport={doExport}
        filterChips={[
          ...(result ? [{ key: 'r', label: 'Result', value: result, onRemove: () => setResult('') }] : []),
          ...(channel ? [{ key: 'c', label: 'Channel', value: channel, onRemove: () => setChannel('') }] : []),
        ]}
        onClearFilters={() => { setResult(''); setChannel('') }}
        filterPanel={
          <>
            <Select sizeVariant="sm" containerClassName="w-36" value={result} onChange={(e) => setResult(e.target.value)}
              options={[{ value: '', label: 'All results' }, { value: 'SUCCESS', label: 'Success' }, { value: 'FAILED', label: 'Failed' }, { value: 'LOCKED_OUT', label: 'Locked out' }]} />
            <Select sizeVariant="sm" containerClassName="w-32" value={channel} onChange={(e) => setChannel(e.target.value)}
              options={[{ value: '', label: 'All channels' }, { value: 'WEB', label: 'Web' }, { value: 'MOBILE', label: 'Mobile' }, { value: 'KIOSK', label: 'Kiosk' }, { value: 'PORTAL', label: 'Portal' }, { value: 'API', label: 'API' }]} />
          </>
        }
      />
    </div>
  )
}
