import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { Amount, inr, useFinanceData } from '@/components/finance/FinShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { computeTds, documentSign, gstReturn, money, splitGst } from '@/lib/finFlow'
import { HOME_STATE } from '@/mock/finance'
import type { PartyDocument, TaxRate, TdsSection } from '@/types/finance'

/**
 * GST and withholding tax (Ch 18).
 *
 * The return is computed from the invoices, never keyed. Set-off runs head by
 * head — integrated credit may cover the others, but central credit can never
 * pay a state liability, and a screen that nets them into one figure will get
 * a filing rejected.
 */

export function TaxPage() {
  const toast = useToast()
  const { documents, taxRates, tdsSections, periods } = useFinanceData()

  const availablePeriods = useMemo(
    () => [...new Set(documents.rows.map((d) => d.date.slice(0, 7)))].sort().reverse(),
    [documents.rows],
  )
  const [period, setPeriod] = useState(() => availablePeriods[0] ?? new Date().toISOString().slice(0, 7))
  const [tab, setTab] = useState('return')
  const [tdsProbe, setTdsProbe] = useState({ section: '194J', amount: '240000', cumulative: '0' })

  const ret = useMemo(() => gstReturn(documents.rows, period), [documents.rows, period])
  const inPeriod = documents.rows.filter((d) => d.date.slice(0, 7) === period && d.status !== 'CANCELLED')
  const outward = inPeriod.filter((d) => d.partyType === 'CUSTOMER')
  const inward = inPeriod.filter((d) => d.partyType === 'SUPPLIER')

  /** GSTR-1 style: outward supplies grouped by rate and place of supply. */
  const hsnSummary = useMemo(() => {
    const map = new Map<string, { hsn: string; description: string; ratePct: number; taxableValue: number; cgst: number; sgst: number; igst: number; count: number }>()
    for (const d of outward) {
      const sign = documentSign(d)
      for (const h of d.hsnSummary) {
        const key = `${h.hsn}|${h.ratePct}`
        const e = map.get(key) ?? { hsn: h.hsn, description: h.description, ratePct: h.ratePct, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, count: 0 }
        const share = d.taxableValue > 0 ? h.taxableValue / d.taxableValue : 1
        e.taxableValue = money(e.taxableValue + sign * h.taxableValue)
        e.cgst = money(e.cgst + sign * d.cgst * share)
        e.sgst = money(e.sgst + sign * d.sgst * share)
        e.igst = money(e.igst + sign * d.igst * share)
        e.count++
        map.set(key, e)
      }
    }
    return [...map.values()].sort((a, b) => b.taxableValue - a.taxableValue)
  }, [outward])

  const registerColumns = (isOutward: boolean): Column<PartyDocument>[] => [
    { key: 'docNo', header: isOutward ? 'Invoice' : 'Bill', sortable: true, width: '12rem', render: (d) => <span className="font-mono text-xs font-medium text-brand-600">{d.docNo}</span> },
    { key: 'date', header: 'Date', sortable: true, width: '8rem', accessor: (d) => d.date, render: (d) => formatDate(d.date) },
    { key: 'partyName', header: isOutward ? 'Customer' : 'Supplier', sortable: true, render: (d) => (<><p className="text-xs text-fg">{d.partyName}</p><p className="font-mono text-2xs text-fg-subtle">{d.partyCode} · state {d.partyStateCode}</p></>) },
    { key: 'hsn', header: 'HSN', width: '8rem', accessor: (d) => d.hsnSummary[0]?.hsn ?? '', render: (d) => <span className="font-mono text-2xs text-fg-muted">{d.hsnSummary[0]?.hsn ?? '—'}</span> },
    { key: 'supply', header: 'Supply', width: '8rem', accessor: (d) => (d.igst > 0 ? 'Inter-state' : d.partyStateCode === '99' ? 'Export' : 'Intra-state'), render: (d) => <Badge tone={d.igst > 0 ? 'progress' : d.partyStateCode === '99' ? 'brand' : 'neutral'} size="sm" dot={false}>{d.partyStateCode === '99' ? 'Export' : d.igst > 0 ? 'Inter-state' : 'Intra-state'}</Badge> },
    { key: 'taxableValue', header: 'Taxable', align: 'right', sortable: true, width: '11rem', accessor: (d) => d.taxableValue, render: (d) => inr(d.taxableValue) },
    { key: 'cgst', header: 'CGST', align: 'right', width: '9rem', accessor: (d) => d.cgst, render: (d) => inr(d.cgst, { blankZero: true }) },
    { key: 'sgst', header: 'SGST', align: 'right', width: '9rem', accessor: (d) => d.sgst, render: (d) => inr(d.sgst, { blankZero: true }) },
    { key: 'igst', header: 'IGST', align: 'right', width: '9rem', accessor: (d) => d.igst, render: (d) => inr(d.igst, { blankZero: true }) },
    { key: 'grandTotal', header: 'Total', align: 'right', sortable: true, width: '11rem', accessor: (d) => d.grandTotal, render: (d) => <span className="text-xs font-medium tabular">{inr(d.grandTotal)}</span> },
    ...(isOutward ? [] : [{ key: 'rcm', header: 'Charge', width: '9rem', accessor: (d: PartyDocument) => (d.isReverseCharge ? 'Reverse' : 'Forward'), render: (d: PartyDocument) => (d.isReverseCharge ? <Badge tone="warning" size="sm">Reverse charge</Badge> : <span className="text-2xs text-fg-subtle">Forward</span>) } as Column<PartyDocument>]),
  ]

  const probe = useMemo(
    () => computeTds(tdsProbe.section, Number(tdsProbe.amount) || 0, Number(tdsProbe.cumulative) || 0, tdsSections.rows),
    [tdsProbe, tdsSections.rows],
  )

  const withheld = documents.rows.filter((d) => d.tdsAmount > 0)
  const periodStatus = periods.rows.find((p) => p.period === period)?.status

  return (
    <div>
      <PageHeader
        title="GST & taxation"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Tax' }]}
        actions={
          <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => {
            const cols: ExportColumn<PartyDocument>[] = [
              { header: 'Document', value: (d) => d.docNo }, { header: 'Date', value: (d) => d.date },
              { header: 'Party', value: (d) => d.partyName }, { header: 'GSTIN state', value: (d) => d.partyStateCode },
              { header: 'HSN', value: (d) => d.hsnSummary[0]?.hsn ?? '' }, { header: 'Rate', value: (d) => d.hsnSummary[0]?.ratePct ?? 0 },
              { header: 'Taxable', value: (d) => d.taxableValue.toFixed(2) }, { header: 'CGST', value: (d) => d.cgst.toFixed(2) },
              { header: 'SGST', value: (d) => d.sgst.toFixed(2) }, { header: 'IGST', value: (d) => d.igst.toFixed(2) },
              { header: 'Total', value: (d) => d.grandTotal.toFixed(2) }, { header: 'Reverse charge', value: (d) => (d.isReverseCharge ? 'Yes' : '') },
            ]
            const n = exportRows('xlsx', `gst-${period}`, `GST register ${period}`, cols, inPeriod)
            toast.success('Export ready', `${n} rows written.`)
          }}>Export register</Button>
        }
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'return', label: 'GSTR-3B summary' },
          { id: 'gstr1', label: 'GSTR-1 by HSN', count: hsnSummary.length },
          { id: 'outward', label: 'Sales register', count: outward.length },
          { id: 'inward', label: 'Purchase register', count: inward.length },
          { id: 'tds', label: 'TDS', count: withheld.length },
        ]} />}
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <Select label="Return period" containerClassName="w-48" value={period} onChange={(e) => setPeriod(e.target.value)} options={availablePeriods.map((p) => ({ value: p, label: p }))} />
          <div><p className="text-2xs uppercase tracking-wide text-fg-muted">Output tax</p><p className="text-lg font-semibold tabular text-fg">{inr(ret.outward.cgst + ret.outward.sgst + ret.outward.igst)}</p></div>
          <div><p className="text-2xs uppercase tracking-wide text-fg-muted">Input credit</p><p className="text-lg font-semibold tabular text-fg">{inr(ret.inward.cgst + ret.inward.sgst + ret.inward.igst)}</p></div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-fg-muted">Payable in cash</p>
            <p className={cn('text-lg font-semibold tabular', ret.netPayable > 0 ? 'text-danger' : 'text-success')}>{inr(ret.netPayable)}</p>
          </div>
          <div><p className="text-2xs uppercase tracking-wide text-fg-muted">Credit carried forward</p><p className="text-lg font-semibold tabular text-fg">{inr(ret.creditCarriedForward)}</p></div>
          {periodStatus && <div className="ml-auto"><Badge tone={periodStatus === 'CLOSED' ? 'neutral' : periodStatus === 'SOFT_CLOSED' ? 'warning' : 'success'} size="sm">Period {periodStatus.replace('_', ' ').toLowerCase()}</Badge></div>}
        </CardBody>
      </Card>

      {tab === 'return' && (
        <>
          <Card className="mb-4">
            <CardHeader title={`GSTR-3B summary for ${period}`} description="Set off head by head — central credit cannot pay a state liability" />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Head</th>
                      <th className="text-right" style={{ width: '13rem' }}>Output tax</th>
                      <th className="text-right" style={{ width: '13rem' }}>Input credit</th>
                      <th className="text-right" style={{ width: '13rem' }}>Net</th>
                      <th style={{ width: '13rem' }}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Central GST', ret.outward.cgst, ret.inward.cgst, ret.netCgst],
                      ['State GST', ret.outward.sgst, ret.inward.sgst, ret.netSgst],
                      ['Integrated GST', ret.outward.igst, ret.inward.igst, ret.netIgst],
                      ['Cess', ret.outward.cess, ret.inward.cess, ret.netCess],
                    ] as [string, number, number, number][]).map(([label, out, inp, net]) => (
                      <tr key={label}>
                        <td className="text-xs font-medium text-fg">{label}</td>
                        <td className="text-right text-xs tabular">{inr(out, { blankZero: true })}</td>
                        <td className="text-right text-xs tabular">{inr(inp, { blankZero: true })}</td>
                        <td className="text-right"><Amount value={net} className="text-xs font-medium" blankZero /></td>
                        <td className="text-2xs">
                          {Math.abs(net) < 0.005 ? <span className="text-fg-subtle">Nil</span>
                            : net > 0 ? <span className="text-danger">Payable in cash</span>
                            : <span className="text-success">Credit carried forward</span>}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2">
                      <td className="text-sm font-semibold text-fg">Total</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">{inr(ret.outward.cgst + ret.outward.sgst + ret.outward.igst + ret.outward.cess)}</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">{inr(ret.inward.cgst + ret.inward.sgst + ret.inward.igst + ret.inward.cess)}</td>
                      <td className="text-right text-sm font-semibold tabular text-fg">{inr(ret.netPayable - ret.creditCarriedForward)}</td>
                      <td className="text-2xs text-fg-muted">{inr(ret.netPayable)} in cash, {inr(ret.creditCarriedForward)} carried</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {ret.reverseCharge.count > 0 && (
            <Alert tone="warning" className="mb-4">
              {ret.reverseCharge.count} inward suppl{ret.reverseCharge.count === 1 ? 'y is' : 'ies are'} under reverse
              charge, on {inr(ret.reverseCharge.taxableValue)} of value. The tax is payable in cash by us and claimable as
              credit in the same period — the supplier does not bill it, so it never sits in the payable.
            </Alert>
          )}

          <Card>
            <CardHeader title="How the split works" description="Place of supply decides the heads; the rate never changes" />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th>Example on 1,00,000 at 18%</th><th className="text-right" style={{ width: '11rem' }}>CGST</th><th className="text-right" style={{ width: '11rem' }}>SGST</th><th className="text-right" style={{ width: '11rem' }}>IGST</th><th className="text-right" style={{ width: '11rem' }}>Total tax</th></tr></thead>
                  <tbody>
                    {[
                      [`Within our state (${HOME_STATE})`, splitGst(100_000, 18, HOME_STATE, HOME_STATE)],
                      ['To another state', splitGst(100_000, 18, HOME_STATE, '06')],
                      ['Export under LUT', splitGst(100_000, 0, HOME_STATE, '99')],
                    ].map(([label, s]) => {
                      const split = s as ReturnType<typeof splitGst>
                      return (
                        <tr key={label as string}>
                          <td className="text-xs text-fg">{label as string}</td>
                          <td className="text-right text-xs tabular">{inr(split.cgst, { blankZero: true })}</td>
                          <td className="text-right text-xs tabular">{inr(split.sgst, { blankZero: true })}</td>
                          <td className="text-right text-xs tabular">{inr(split.igst, { blankZero: true })}</td>
                          <td className="text-right text-xs font-medium tabular">{inr(split.total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {tab === 'gstr1' && (
        <Card>
          <CardHeader title={`Outward supplies by HSN — ${period}`} description="Credit notes netted against the rate they were raised at" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead><tr><th style={{ width: '9rem' }}>HSN</th><th>Description</th><th className="text-right" style={{ width: '6rem' }}>Rate</th><th className="text-right" style={{ width: '6rem' }}>Docs</th><th className="text-right" style={{ width: '12rem' }}>Taxable</th><th className="text-right" style={{ width: '10rem' }}>CGST</th><th className="text-right" style={{ width: '10rem' }}>SGST</th><th className="text-right" style={{ width: '10rem' }}>IGST</th></tr></thead>
                <tbody>
                  {hsnSummary.map((h) => (
                    <tr key={`${h.hsn}-${h.ratePct}`}>
                      <td className="font-mono text-2xs text-brand-600">{h.hsn}</td>
                      <td className="text-xs text-fg">{h.description}</td>
                      <td className="text-right text-xs tabular">{h.ratePct}%</td>
                      <td className="text-right text-xs tabular text-fg-muted">{h.count}</td>
                      <td className="text-right text-xs tabular">{inr(h.taxableValue)}</td>
                      <td className="text-right text-xs tabular">{inr(h.cgst, { blankZero: true })}</td>
                      <td className="text-right text-xs tabular">{inr(h.sgst, { blankZero: true })}</td>
                      <td className="text-right text-xs tabular">{inr(h.igst, { blankZero: true })}</td>
                    </tr>
                  ))}
                  {!hsnSummary.length && <tr><td colSpan={8} className="py-6 text-center text-2xs text-fg-subtle">No outward supplies in this period.</td></tr>}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-2">
                    <td colSpan={4} className="text-right text-xs font-semibold text-fg">Totals</td>
                    <td className="text-right text-sm font-semibold tabular text-fg">{inr(ret.outward.taxableValue)}</td>
                    <td className="text-right text-xs font-semibold tabular text-fg">{inr(ret.outward.cgst, { blankZero: true })}</td>
                    <td className="text-right text-xs font-semibold tabular text-fg">{inr(ret.outward.sgst, { blankZero: true })}</td>
                    <td className="text-right text-xs font-semibold tabular text-fg">{inr(ret.outward.igst, { blankZero: true })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'outward' && <DataTable rows={outward} columns={registerColumns(true)} rowKey={(d) => d.uid} searchPlaceholder="Search invoice or customer…" emptyTitle="No sales in this period" />}
      {tab === 'inward' && <DataTable rows={inward} columns={registerColumns(false)} rowKey={(d) => d.uid} searchPlaceholder="Search bill or supplier…" emptyTitle="No purchases in this period" />}

      {tab === 'tds' && (
        <>
          <Card className="mb-4">
            <CardHeader title="Deduction calculator" description="Deduction is on the whole cumulative amount once the threshold is crossed, not just on the excess" />
            <CardBody>
              <div className="grid gap-3.5 sm:grid-cols-4">
                <Select label="Section" value={tdsProbe.section} onChange={(e) => setTdsProbe({ ...tdsProbe, section: e.target.value })} options={tdsSections.rows.map((s) => ({ value: s.section, label: `${s.section} — ${s.description}` }))} />
                <Input label="Invoice amount" type="number" value={tdsProbe.amount} onChange={(e) => setTdsProbe({ ...tdsProbe, amount: e.target.value })} />
                <Input label="Already paid this year" type="number" value={tdsProbe.cumulative} onChange={(e) => setTdsProbe({ ...tdsProbe, cumulative: e.target.value })} />
                <div className="flex flex-col justify-end pb-1">
                  <p className="text-2xs uppercase tracking-wide text-fg-muted">To deduct</p>
                  <p className={cn('text-lg font-semibold tabular', probe && probe.tdsAmount > 0 ? 'text-danger' : 'text-fg')}>{probe ? inr(probe.tdsAmount) : '—'}</p>
                </div>
              </div>
              {probe && (
                <Alert tone={probe.thresholdCrossed ? 'warning' : 'info'} className="mt-3.5">
                  {probe.note} Base {inr(probe.taxableBase)} at {probe.ratePct}%.
                </Alert>
              )}
            </CardBody>
          </Card>

          <Card className="mb-4">
            <CardHeader title="Sections" />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '8rem' }}>Section</th><th>Description</th><th className="text-right" style={{ width: '8rem' }}>Rate</th><th className="text-right" style={{ width: '12rem' }}>Annual threshold</th></tr></thead>
                  <tbody>
                    {tdsSections.rows.map((s: TdsSection) => (
                      <tr key={s.uid}>
                        <td className="font-mono text-xs font-medium text-brand-600">{s.section}</td>
                        <td className="text-xs text-fg">{s.description}</td>
                        <td className="text-right text-xs tabular">{s.ratePct}%</td>
                        <td className="text-right text-xs tabular">{inr(s.thresholdAmount, { decimals: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`Deducted on ${withheld.length} document${withheld.length === 1 ? '' : 's'}`} />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '12rem' }}>Document</th><th>Party</th><th style={{ width: '8rem' }}>Date</th><th className="text-right" style={{ width: '11rem' }}>Taxable</th><th className="text-right" style={{ width: '10rem' }}>TDS</th><th className="text-right" style={{ width: '11rem' }}>Net payable</th></tr></thead>
                  <tbody>
                    {withheld.map((d) => (
                      <tr key={d.uid}>
                        <td className="font-mono text-2xs text-brand-600">{d.docNo}</td>
                        <td className="text-xs text-fg">{d.partyName}</td>
                        <td className="text-2xs text-fg-muted">{formatDate(d.date)}</td>
                        <td className="text-right text-xs tabular">{inr(d.taxableValue)}</td>
                        <td className="text-right text-xs tabular text-danger">{inr(d.tdsAmount)}</td>
                        <td className="text-right text-xs tabular">{inr(d.grandTotal - d.tdsAmount)}</td>
                      </tr>
                    ))}
                    {!withheld.length && <tr><td colSpan={6} className="py-6 text-center text-2xs text-fg-subtle">Nothing withheld.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {tab === 'return' && (
        <p className="mt-3 text-2xs text-fg-subtle">
          {taxRates.rows.length} rates configured against HSN codes. Everything on this screen is computed from the
          invoices, so a corrected invoice corrects the return.
        </p>
      )}
    </div>
  )
}
