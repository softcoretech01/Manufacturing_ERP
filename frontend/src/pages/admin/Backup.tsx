import { useState } from 'react'
import { Database, DownloadCloud, HardDriveDownload, PlayCircle, ShieldCheck, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime, formatTimeAgo } from '@/lib/format'
import { backups } from '@/mock/data2'
import type { BackupRecord } from '@/types'

export function BackupPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'backup-restore', 'Backup & restore', columnsFromTable(columns), backups)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('history')
  const [runOpen, setRunOpen] = useState(false)
  const [restore, setRestore] = useState<BackupRecord | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [policy, setPolicy] = useState({ binlog: true, objectStore: true, encrypt: true, offsite: true })

  const lastSuccess = backups.find((b) => b.status === 'SUCCESS')
  const failedCount = backups.filter((b) => b.status === 'FAILED').length
  const untested = backups.filter((b) => b.status === 'SUCCESS' && !b.restoreTested)

  const columns: Column<BackupRecord>[] = [
    { key: 'startedAt', header: 'Taken', sortable: true, width: '170px', sticky: true, render: (b) => <span title={formatDateTime(b.startedAt)}>{formatDateTime(b.startedAt)}</span> },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      width: '130px',
      render: (b) => <Badge tone={b.type === 'FULL' ? 'brand' : b.type === 'MANUAL' ? 'warning' : 'neutral'} size="sm" dot={false}>{b.type.toLowerCase()}</Badge>,
    },
    {
      key: 'status',
      header: 'Result',
      sortable: true,
      width: '120px',
      render: (b) => <Badge tone={b.status === 'SUCCESS' ? 'success' : b.status === 'RUNNING' ? 'progress' : 'danger'} size="sm">{b.status.toLowerCase()}</Badge>,
    },
    { key: 'sizeMb', header: 'Size', align: 'right', sortable: true, width: '110px', render: (b) => <span className="tabular">{b.sizeMb >= 1024 ? `${(b.sizeMb / 1024).toFixed(1)} GB` : `${b.sizeMb} MB`}</span> },
    { key: 'durationSec', header: 'Duration', align: 'right', width: '110px', render: (b) => <span className="tabular">{Math.floor(b.durationSec / 60)}m {b.durationSec % 60}s</span> },
    { key: 'location', header: 'Location', render: (b) => <span className="truncate font-mono text-2xs text-fg-muted">{b.location}</span> },
    { key: 'retentionUntil', header: 'Retain until', sortable: true, width: '140px', render: (b) => formatDate(b.retentionUntil) },
    {
      key: 'restoreTested',
      header: 'Restore tested',
      width: '140px',
      align: 'center',
      accessor: (b) => (b.restoreTested ? 1 : 0),
      render: (b) =>
        b.status !== 'SUCCESS' ? (
          <span className="text-2xs text-fg-subtle">—</span>
        ) : b.restoreTested ? (
          <Badge tone="success" size="sm">Verified</Badge>
        ) : (
          <Badge tone="warning" size="sm">Untested</Badge>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Backup & restore"
        description="A backup that has never been restored is a hope, not a control. Restore rehearsals are tracked here alongside the backups themselves."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Compliance & ops' }, { label: 'Backup & restore' }]}
        actions={
          <Button variant="primary" size="sm" icon={<PlayCircle className="h-4 w-4" />} onClick={() => setRunOpen(true)}>
            Run backup now
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'history', label: 'Backup history', count: backups.length },
              { id: 'policy', label: 'Policy & retention' },
              { id: 'dr', label: 'Disaster recovery' },
            ]}
          />
        }
      />

      {failedCount > 0 && (
        <Alert tone="danger" className="mb-4" title={`${failedCount} backup(s) failed`}>
          A failed backup is treated as a P1 incident. Until it succeeds the recovery point
          objective is not being met, regardless of how healthy the application looks.
        </Alert>
      )}

      {untested.length > 2 && (
        <Alert tone="warning" className="mb-4" title="Restore rehearsal overdue">
          {untested.length} successful backups have never been restore-tested. Schedule a rehearsal
          into a scratch environment — the first time you find out a backup is unreadable should
          never be during an outage.
        </Alert>
      )}

      {tab === 'history' && (
        <DataTable
          rows={backups}
          columns={columns}
          rowKey={(b) => b.uid}
          searchPlaceholder="Location or type…"
          onExport={doExport}
          rowClassName={(b) => (b.status === 'FAILED' ? 'bg-danger/[0.03]' : undefined)}
          rowActions={(b) => (
            <>
              <MenuItem label="Download" icon={<DownloadCloud className="h-3.5 w-3.5" />} disabled={b.status !== 'SUCCESS'} onClick={() => toast.info('Download backup', `The ${b.type.toLowerCase()} backup taken ${formatDateTime(b.startedAt)} would download.`)} />
              <MenuItem label="Verify integrity" disabled={b.status !== 'SUCCESS'} onClick={() => toast.success('Checksum verified')} />
              <MenuItem label="Restore-test into scratch" disabled={b.status !== 'SUCCESS'} onClick={() => toast.success('Rehearsal queued')} />
              <MenuItem label="Restore" danger disabled={b.status !== 'SUCCESS'} icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => setRestore(b)} separatorBefore />
            </>
          )}
        />
      )}

      {tab === 'policy' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Schedule" />
            <CardBody className="space-y-3.5">
              <Select label="Full backup" defaultValue="DAILY" options={[{ value: 'DAILY', label: 'Daily at 01:00 IST' }, { value: 'WEEKLY', label: 'Weekly, Sunday 01:00' }]} />
              <Select label="Incremental backup" defaultValue="HOURLY" options={[{ value: 'HOURLY', label: 'Hourly' }, { value: 'SIX_HOURLY', label: 'Every 6 hours' }, { value: 'OFF', label: 'Off' }]} />
              <Switch checked={policy.binlog} onChange={(v) => setPolicy((p) => ({ ...p, binlog: v }))} label="Binary log shipping for point-in-time recovery" />
              <Switch checked={policy.objectStore} onChange={(v) => setPolicy((p) => ({ ...p, objectStore: v }))} label="Back up the object store alongside the database" />
              <Alert tone="info" title="Files and rows must match">
                Restoring a database to a point where a document row exists but its attachment does
                not leaves a broken record. The object store is snapshotted in the same window as
                the database for exactly that reason.
              </Alert>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Retention" />
            <CardBody className="space-y-3.5">
              <Input label="Daily backups kept (days)" type="number" defaultValue={30} />
              <Input label="Weekly backups kept (weeks)" type="number" defaultValue={12} />
              <Input label="Monthly backups kept (months)" type="number" defaultValue={24} />
              <Input label="Year-end backups kept (years)" type="number" defaultValue={8} hint="Matches the statutory record-retention obligation for GST and Companies Act records." />
              <Switch checked={policy.encrypt} onChange={(v) => setPolicy((p) => ({ ...p, encrypt: v }))} label="Encrypt backups at rest (AES-256)" />
              <Switch checked={policy.offsite} onChange={(v) => setPolicy((p) => ({ ...p, offsite: v }))} label="Replicate to off-site location" />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'dr' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Objectives" />
            <CardBody className="space-y-3">
              {[
                ['Recovery Point Objective (RPO)', '1 hour', 'Maximum acceptable data loss. Met by hourly incrementals plus binary log shipping.'],
                ['Recovery Time Objective (RTO)', '4 hours', 'Maximum acceptable downtime, measured from declaration to users being back on the system.'],
                ['Last rehearsal', '14-Jun-2026', 'Full restore into the DR environment, verified against a checksum of the source.'],
                ['Rehearsal frequency', 'Quarterly', 'A rehearsal that has not happened this quarter counts as a failed control.'],
              ].map(([l, v, d]) => (
                <div key={l} className="rounded border border-border p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-fg">{l}</span>
                    <span className="shrink-0 text-sm font-semibold text-brand-600 tabular">{v}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted">{d}</p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Restore runbook" description="The order matters" />
            <CardBody>
              <ol className="space-y-2.5 text-xs text-fg-muted">
                {[
                  'Declare the incident and put the application into maintenance mode so nothing new is written.',
                  'Identify the target recovery point — the last good full backup plus the binary logs up to the chosen instant.',
                  'Restore the database into a fresh instance. Never restore over a live database; if the assumption about corruption is wrong you have destroyed the only good copy.',
                  'Restore the object store snapshot from the same window.',
                  'Run the integrity checks: row counts per table, document number continuity per statutory series, orphaned attachment scan.',
                  'Replay the outbox for events that were emitted but not delivered during the gap.',
                  'Re-point the application, take it out of maintenance mode, and tell users the exact window of data that may need re-entering.',
                  'Write the post-incident review, including what the RPO actually turned out to be as opposed to the target.',
                ].map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-2xs font-semibold text-fg">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run backup now"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRunOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={<HardDriveDownload className="h-4 w-4" />} onClick={() => { toast.success('Backup started', 'You will be notified when it completes.'); setRunOpen(false) }}>
              Start backup
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select label="Type" defaultValue="FULL" options={[{ value: 'FULL', label: 'Full — database and object store' }, { value: 'DB_ONLY', label: 'Database only' }]} />
          <Textarea label="Reason" rows={2} required placeholder="Pre-upgrade snapshot, pre-migration, ad-hoc audit request…" />
          <Alert tone="info">
            A manual backup runs against a read replica and does not lock the primary. Users will
            not notice it.
          </Alert>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!restore}
        onClose={() => { setRestore(null); setConfirmText('') }}
        onConfirm={() => {
          if (confirmText !== 'RESTORE') return
          toast.success('Restore requested', 'A second administrator must approve before it executes.')
          setRestore(null)
          setConfirmText('')
        }}
        title="Restore from backup"
        confirmLabel="Request restore"
        message={
          restore
            ? `You are about to restore the system to its state at ${formatDateTime(restore.startedAt)}. Everything entered after that moment will be lost.`
            : ''
        }
      >
        <div className="mt-3 space-y-3">
          <Alert tone="danger" title="This is irreversible">
            A restore replaces live data. It requires a second administrator's approval and is
            executed into a fresh instance first, never over the running database.
          </Alert>
          <Input
            label="Type RESTORE to confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESTORE"
            className="font-mono"
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
