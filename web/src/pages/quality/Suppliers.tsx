import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ChartTip, DetailBlock, GradeBadge, useQualityData } from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatAmount } from '@/lib/format'
import { scoreSupplier, type SupplierScore } from '@/lib/qmsFlow'
import type { SupplierQualityRecord } from '@/types/quality'

/**
 * Supplier quality (Ch 17).
 *
 * The grade is computed from what happened, never typed. Weighting puts most of
 * it on acceptance and PPM, and a supplier above 5,000 PPM is capped at
 * conditional however good the paperwork — a grade that can be earned back with
 * documentation while the material keeps failing is worse than no grade at all.
 */

export function SupplierQualityPage() {
  const toast = useToast()
  const { supplierQuality, ncrs, inspections } = useQualityData()
  const { rows, update } = supplierQuality

  const [detail, setDetail] = useState<SupplierScore | null>(null)
  const [editing, setEditing] = useState<SupplierQualityRecord | null>(null)
  const [form, setForm] = useState({ lotsReceived: '', lotsAccepted: '', qtyReceived: '', qtyRejected: '', lotsWithValidDocs: '', ncrsRaised: '', ncrsClosedOnTime: '', capaResponseDays: '' })

  const scored = useMemo(() => rows.map(scoreSupplier).sort((a, b) => b.score - a.score), [rows])
  const blocked = scored.filter((s) => s.grade === 'BLOCKED' || s.grade === 'CONDITIONAL')
  const chart = scored.map((s) => ({ name: s.supplierCode, PPM: Math.round(s.ppm), score: s.score }))

  const ncrsFor = (code: string) => ncrs.rows.filter((n) => n.supplierCode === code)
  const inspectionsFor = (code: string) => inspections.rows.filter((i) => i.supplierCode === code)

  const columns: Column<SupplierScore>[] = [
    { key: 'supplierCode', header: 'Supplier', sortable: true, width: '10rem', render: (s) => <span className="font-mono text-xs font-medium text-brand-600">{s.supplierCode}</span> },
    { key: 'supplierName', header: 'Name', sortable: true },
    { key: 'lotAcceptancePct', header: 'Lots accepted', align: 'right', sortable: true, width: '9rem', accessor: (s) => s.lotAcceptancePct, render: (s) => <span className={cn('tabular', s.lotAcceptancePct < 80 ? 'text-danger' : s.lotAcceptancePct < 95 ? 'text-warning' : 'text-fg')}>{s.lotAcceptancePct.toFixed(1)}%</span> },
    { key: 'ppm', header: 'PPM', align: 'right', sortable: true, width: '8rem', accessor: (s) => s.ppm, render: (s) => <span className={cn('tabular', s.ppm > 5000 ? 'font-medium text-danger' : s.ppm > 2000 ? 'text-warning' : 'text-fg-muted')}>{Math.round(s.ppm).toLocaleString('en-IN')}</span> },
    { key: 'documentCompliancePct', header: 'Documents', align: 'right', sortable: true, width: '8.5rem', accessor: (s) => s.documentCompliancePct, render: (s) => `${s.documentCompliancePct.toFixed(0)}%` },
    { key: 'ncrClosurePct', header: 'NCRs closed', align: 'right', width: '9rem', accessor: (s) => s.ncrClosurePct, render: (s) => `${s.ncrClosurePct.toFixed(0)}%` },
    { key: 'capaResponseDays', header: 'CAPA response', align: 'right', width: '9.5rem', accessor: (s) => s.capaResponseDays, render: (s) => <span className={cn('tabular', s.capaResponseDays > 7 ? 'text-warning' : 'text-fg-muted')}>{s.capaResponseDays}d</span> },
    { key: 'score', header: 'Score', align: 'right', sortable: true, width: '10rem', accessor: (s) => s.score, render: (s) => (<div className="flex items-center justify-end gap-2"><ProgressBar value={s.score} tone={s.score >= 90 ? 'success' : s.score >= 75 ? 'brand' : s.score >= 60 ? 'warning' : 'danger'} className="w-14" /><span className="w-9 text-right tabular text-xs">{s.score.toFixed(0)}</span></div>) },
    { key: 'grade', header: 'Grade', sortable: true, width: '8rem', render: (s) => <GradeBadge grade={s.grade} /> },
  ]

  function openEdit(code: string) {
    const r = rows.find((x) => x.supplierCode === code)
    if (!r) return
    setEditing(r)
    setForm({ lotsReceived: String(r.lotsReceived), lotsAccepted: String(r.lotsAccepted), qtyReceived: String(r.qtyReceived), qtyRejected: String(r.qtyRejected), lotsWithValidDocs: String(r.lotsWithValidDocs), ncrsRaised: String(r.ncrsRaised), ncrsClosedOnTime: String(r.ncrsClosedOnTime), capaResponseDays: String(r.capaResponseDays) })
  }

  function save() {
    if (!editing) return
    const lotsReceived = Number(form.lotsReceived) || 0
    const lotsAccepted = Math.min(lotsReceived, Number(form.lotsAccepted) || 0)
    const patch = {
      lotsReceived, lotsAccepted, lotsRejected: lotsReceived - lotsAccepted,
      qtyReceived: Number(form.qtyReceived) || 0, qtyRejected: Number(form.qtyRejected) || 0,
      lotsWithValidDocs: Math.min(lotsReceived, Number(form.lotsWithValidDocs) || 0),
      ncrsRaised: Number(form.ncrsRaised) || 0,
      ncrsClosedOnTime: Math.min(Number(form.ncrsRaised) || 0, Number(form.ncrsClosedOnTime) || 0),
      capaResponseDays: Number(form.capaResponseDays) || 0,
      version: editing.version + 1,
    }
    update(editing.uid, patch)
    const next = scoreSupplier({ ...editing, ...patch })
    toast.success('Scorecard updated', `${editing.supplierName} now scores ${next.score.toFixed(0)} and grades ${next.grade.toLowerCase()}.`)
    setEditing(null)
  }

  return (
    <div>
      <PageHeader title="Supplier quality" breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'Suppliers' }]} />

      {blocked.length > 0 && (
        <Alert tone="warning" className="mb-4">
          {blocked.length} supplier{blocked.length === 1 ? '' : 's'} {blocked.length === 1 ? 'is' : 'are'} below the approved
          threshold — {blocked.map((s) => `${s.supplierName} (${s.grade.toLowerCase()}, ${Math.round(s.ppm).toLocaleString('en-IN')} PPM)`).join(', ')}.
          A conditional grade means new orders need quality sign-off.
        </Alert>
      )}

      <Card className="mb-4">
        <CardHeader title="Rejected parts per million" description="Red beyond the 5,000 PPM ceiling, above which the grade is capped at conditional" />
        <CardBody className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
              <Bar dataKey="PPM" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {chart.map((c) => (<Cell key={c.name} fill={c.PPM > 5000 ? '#ef4444' : c.PPM > 2000 ? '#f59e0b' : '#10b981'} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <DataTable
        rows={scored}
        columns={columns}
        rowKey={(s) => s.supplierCode}
        searchPlaceholder="Search supplier…"
        onExport={(f: ExportFormat) => {
          const cols: ExportColumn<SupplierScore>[] = [
            { header: 'Supplier', value: (s) => s.supplierCode }, { header: 'Name', value: (s) => s.supplierName },
            { header: 'Lots accepted %', value: (s) => s.lotAcceptancePct.toFixed(1) }, { header: 'PPM', value: (s) => Math.round(s.ppm) },
            { header: 'Document compliance %', value: (s) => s.documentCompliancePct.toFixed(1) },
            { header: 'NCR closure %', value: (s) => s.ncrClosurePct.toFixed(0) }, { header: 'CAPA response days', value: (s) => s.capaResponseDays },
            { header: 'Score', value: (s) => s.score.toFixed(1) }, { header: 'Grade', value: (s) => s.grade },
          ]
          const n = exportRows(f, 'supplier-quality', 'Supplier quality scorecard', cols, scored)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        rowClassName={(s) => (s.grade === 'BLOCKED' ? 'bg-danger/5' : s.grade === 'CONDITIONAL' ? 'bg-warning/5' : undefined)}
        emptyTitle="No supplier data"
        emptyDescription="Scorecards are built from incoming inspection results."
        rowActions={(s) => (
          <>
            <MenuItem label="Edit the period's figures" onClick={() => openEdit(s.supplierCode)} />
            <MenuItem label="Open the scorecard" separatorBefore onClick={() => setDetail(s)} />
          </>
        )}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.supplierName} description={detail ? `${detail.supplierCode} · score ${detail.score.toFixed(1)} of 100` : ''} width="max-w-3xl">
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><GradeBadge grade={detail.grade} /><span className="text-2xs text-fg-muted">Score {detail.score.toFixed(1)}</span></div>

            <DetailBlock title="How the score is built">
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead><tr><th>Component</th><th className="text-right" style={{ width: '8rem' }}>Value</th><th className="text-right" style={{ width: '7rem' }}>Weight</th><th className="text-right" style={{ width: '8rem' }}>Contribution</th></tr></thead>
                  <tbody>
                    {[
                      ['Lots accepted', `${detail.lotAcceptancePct.toFixed(1)}%`, 35, detail.lotAcceptancePct * 0.35],
                      ['PPM against a 5,000 ceiling', Math.round(detail.ppm).toLocaleString('en-IN'), 30, Math.max(0, 100 - (detail.ppm / 5000) * 100) * 0.3],
                      ['Document compliance', `${detail.documentCompliancePct.toFixed(0)}%`, 15, detail.documentCompliancePct * 0.15],
                      ['NCRs closed on time', `${detail.ncrClosurePct.toFixed(0)}%`, 10, detail.ncrClosurePct * 0.1],
                      ['CAPA response against 7 days', `${detail.capaResponseDays}d`, 10, Math.max(0, 100 - Math.max(0, detail.capaResponseDays - 7) * 10) * 0.1],
                    ].map(([label, value, weight, contrib]) => (
                      <tr key={String(label)}>
                        <td className="text-xs text-fg">{label}</td>
                        <td className="text-right tabular text-xs">{value}</td>
                        <td className="text-right tabular text-2xs text-fg-muted">{weight}%</td>
                        <td className="text-right tabular text-xs font-medium">{(contrib as number).toFixed(1)}</td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2"><td colSpan={3} className="text-right text-xs font-semibold text-fg">Total</td><td className="text-right text-sm font-semibold tabular text-fg">{detail.score.toFixed(1)}</td></tr>
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title="Why this grade">
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-fg-muted">{detail.reasons.map((r) => (<li key={r}>{r}</li>))}</ul>
            </DetailBlock>

            <DetailBlock title={`Non-conformances raised (${ncrsFor(detail.supplierCode).length})`}>
              {!ncrsFor(detail.supplierCode).length ? (<p className="text-xs text-fg-subtle">None raised against this supplier.</p>) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead><tr><th style={{ width: '11rem' }}>NCR</th><th>Issue</th><th className="text-right" style={{ width: '8rem' }}>Affected</th><th style={{ width: '10rem' }}>Status</th></tr></thead>
                    <tbody>{ncrsFor(detail.supplierCode).map((n) => (<tr key={n.uid}><td className="font-mono text-2xs text-brand-600">{n.docNo}</td><td className="text-xs">{n.title}</td><td className="text-right tabular text-xs">{n.quantityAffected.toLocaleString('en-IN')} {n.uom}</td><td className="text-2xs text-fg-muted">{n.status.replace(/_/g, ' ').toLowerCase()}</td></tr>))}</tbody>
                  </table>
                </div>
              )}
            </DetailBlock>

            <DetailBlock title={`Incoming inspections (${inspectionsFor(detail.supplierCode).length})`}>
              {!inspectionsFor(detail.supplierCode).length ? (<p className="text-xs text-fg-subtle">No inspections recorded against this supplier.</p>) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead><tr><th style={{ width: '13rem' }}>Inspection</th><th>Item</th><th className="text-right" style={{ width: '7rem' }}>Lot</th><th style={{ width: '11rem' }}>Disposition</th></tr></thead>
                    <tbody>{inspectionsFor(detail.supplierCode).map((i) => (<tr key={i.uid}><td className="font-mono text-2xs text-brand-600">{i.docNo}</td><td className="text-xs">{i.itemCode}</td><td className="text-right tabular text-xs">{i.lotSize.toLocaleString('en-IN')}</td><td className="text-2xs text-fg-muted">{i.disposition.replace(/_/g, ' ').toLowerCase()}</td></tr>))}</tbody>
                  </table>
                </div>
              )}
            </DetailBlock>
          </div>
        )}
      </Drawer>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.supplierName} — ${editing.period}` : ''} size="lg"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save and rescore</Button></>}
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Lots received" type="number" value={form.lotsReceived} onChange={(e) => setForm({ ...form, lotsReceived: e.target.value })} />
          <Input label="Lots accepted" type="number" value={form.lotsAccepted} onChange={(e) => setForm({ ...form, lotsAccepted: e.target.value })} />
          <Input label="Quantity received" type="number" value={form.qtyReceived} onChange={(e) => setForm({ ...form, qtyReceived: e.target.value })} />
          <Input label="Quantity rejected" type="number" value={form.qtyRejected} hint="Drives PPM." onChange={(e) => setForm({ ...form, qtyRejected: e.target.value })} />
          <Input label="Lots with a valid certificate" type="number" value={form.lotsWithValidDocs} onChange={(e) => setForm({ ...form, lotsWithValidDocs: e.target.value })} />
          <Input label="CAPA response (days)" type="number" value={form.capaResponseDays} hint="Target is 7 days." onChange={(e) => setForm({ ...form, capaResponseDays: e.target.value })} />
          <Input label="NCRs raised" type="number" value={form.ncrsRaised} onChange={(e) => setForm({ ...form, ncrsRaised: e.target.value })} />
          <Input label="NCRs closed on time" type="number" value={form.ncrsClosedOnTime} onChange={(e) => setForm({ ...form, ncrsClosedOnTime: e.target.value })} />
        </div>
        <Alert tone="info" className="mt-4">
          The grade is recomputed from these figures — it cannot be set directly. Rejected lots and PPM are derived, not
          entered, so the two cannot disagree.
        </Alert>
      </Modal>

      <p className="mt-4 text-2xs text-fg-subtle">
        Total across all suppliers: {rows.reduce((s, r) => s + r.lotsReceived, 0)} lots received,{' '}
        {rows.reduce((s, r) => s + r.lotsRejected, 0)} rejected, ₹{formatAmount(0)} — value at risk is reported on the COPQ
        figures rather than here.
      </p>
    </div>
  )
}
