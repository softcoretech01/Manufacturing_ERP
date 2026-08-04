import { useMemo, useState } from 'react'
import { Banknote, Download, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { Amount, BucketCell, DetailBlock, FinStatusBadge, ReconcileBadge, inr, useFinanceData } from '@/components/finance/FinShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { AGEING_BUCKETS, ageing, money, outstandingOf, reconcileSubledger, type AgeingRow } from '@/lib/finFlow'
import { newUid } from '@/store/data'
import type { Allocation, PartyDocument, PartyPayment, PaymentMode } from '@/types/finance'

/**
 * Receivables and payables (Ch 7 and 8).
 *
 * One screen for both, because the two are mirror images and keeping them apart
 * means two sets of ageing rules that eventually disagree. What differs is the
 * direction of the money and which control account it reconciles to — and the
 * reconciliation is shown at the top rather than left to a month-end surprise.
 */

const MODES: PaymentMode[] = ['NEFT', 'RTGS', 'CHEQUE', 'UPI', 'CASH', 'CARD', 'ADJUSTMENT']

export function ReceivablesPage({ side = 'CUSTOMER' }: { side?: 'CUSTOMER' | 'SUPPLIER' }) {
  const toast = useToast()
  const { documents, payments, accounts, journals, bankAccounts } = useFinanceData()

  const isAr = side === 'CUSTOMER'
  const controlCode = isAr ? '1200' : '2100'
  const label = isAr ? 'Receivables' : 'Payables'

  const [tab, setTab] = useState('ageing')
  const [detail, setDetail] = useState<AgeingRow | null>(null)
  const [settling, setSettling] = useState<PartyDocument | null>(null)
  const [form, setForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), mode: 'NEFT' as PaymentMode, instrumentNo: '', bankAccountCode: 'BANK-HDFC', tds: '0', narration: '' })
  const [confirmDelete, setConfirmDelete] = useState<PartyDocument | null>(null)

  const myDocs = documents.rows.filter((d) => d.partyType === side)
  const myPayments = payments.rows.filter((p) => p.partyType === side)
  const rows = useMemo(() => ageing(documents.rows, side), [documents.rows, side])
  const check = useMemo(() => reconcileSubledger(controlCode, side, accounts.rows, journals.rows, documents.rows), [controlCode, side, accounts.rows, journals.rows, documents.rows])

  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const b of AGEING_BUCKETS) t[b] = money(rows.reduce((s, r) => s + r.buckets[b], 0))
    return t
  }, [rows])
  const grandTotal = money(rows.reduce((s, r) => s + r.total, 0))
  const overdue = money(grandTotal - totals['Not due'])

  const ageingColumns: Column<AgeingRow>[] = [
    { key: 'partyName', header: isAr ? 'Customer' : 'Supplier', sortable: true, render: (r) => (<><p className="text-xs font-medium text-fg">{r.partyName}</p><p className="font-mono text-2xs text-fg-subtle">{r.partyCode} · {r.documents.length} documents</p></>) },
    ...AGEING_BUCKETS.map((b) => ({
      key: b, header: b, align: 'right' as const, width: '9.5rem',
      accessor: (r: AgeingRow) => r.buckets[b],
      render: (r: AgeingRow) => <BucketCell value={r.buckets[b]} overdue={b !== 'Not due'} />,
    })),
    { key: 'total', header: 'Total', align: 'right', sortable: true, width: '11rem', accessor: (r) => r.total, render: (r) => <Amount value={r.total} className="text-xs font-medium" /> },
    { key: 'oldestDays', header: 'Oldest', align: 'right', sortable: true, width: '7rem', accessor: (r) => r.oldestDays, render: (r) => (r.oldestDays > 0 ? <span className={cn('text-xs tabular', r.oldestDays > 60 ? 'text-danger' : 'text-warning')}>{r.oldestDays}d</span> : <span className="text-2xs text-success">Current</span>) },
  ]

  const docColumns: Column<PartyDocument>[] = [
    { key: 'docNo', header: 'Document', sortable: true, width: '12rem', render: (d) => <span className="font-mono text-xs font-medium text-brand-600">{d.docNo}</span> },
    { key: 'docType', header: 'Type', width: '8rem', accessor: (d) => d.docType, render: (d) => <Badge tone={d.docType === 'CREDIT_NOTE' || d.docType === 'DEBIT_NOTE' ? 'neutral' : 'brand'} size="sm" dot={false}>{d.docType.replace('_', ' ').toLowerCase()}</Badge> },
    { key: 'partyName', header: isAr ? 'Customer' : 'Supplier', sortable: true, render: (d) => (<><p className="text-xs text-fg">{d.partyName}</p><p className="font-mono text-2xs text-fg-subtle">{d.partyCode}{d.sourceDocNo && ` · ${d.sourceDocNo}`}</p></>) },
    { key: 'date', header: 'Date', sortable: true, width: '8rem', accessor: (d) => d.date, render: (d) => formatDate(d.date) },
    { key: 'dueDate', header: 'Due', sortable: true, width: '8rem', accessor: (d) => d.dueDate, render: (d) => <span className={d.dueDate < new Date().toISOString().slice(0, 10) && d.status !== 'PAID' ? 'text-danger' : ''}>{formatDate(d.dueDate)}</span> },
    { key: 'taxableValue', header: 'Taxable', align: 'right', sortable: true, width: '11rem', accessor: (d) => d.taxableValue, render: (d) => inr(d.taxableValue) },
    { key: 'tax', header: 'Tax', align: 'right', width: '10rem', accessor: (d) => d.cgst + d.sgst + d.igst, render: (d) => (d.cgst + d.sgst + d.igst ? inr(d.cgst + d.sgst + d.igst) : <span className="text-2xs text-fg-subtle">nil</span>) },
    { key: 'grandTotal', header: 'Total', align: 'right', sortable: true, width: '11rem', accessor: (d) => d.grandTotal, render: (d) => <span className="text-xs font-medium tabular">{inr(d.grandTotal)}</span> },
    { key: 'outstanding', header: 'Outstanding', align: 'right', sortable: true, width: '11rem', accessor: (d) => outstandingOf(d), render: (d) => <Amount value={outstandingOf(d)} className="text-xs" blankZero /> },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (d) => <FinStatusBadge status={d.status} /> },
  ]

  const payColumns: Column<PartyPayment>[] = [
    { key: 'docNo', header: isAr ? 'Receipt' : 'Payment', sortable: true, width: '12rem', render: (p) => <span className="font-mono text-xs font-medium text-brand-600">{p.docNo}</span> },
    { key: 'partyName', header: 'Party', sortable: true },
    { key: 'date', header: 'Date', sortable: true, width: '8rem', accessor: (p) => p.date, render: (p) => formatDate(p.date) },
    { key: 'mode', header: 'Mode', width: '7rem', render: (p) => <span className="text-xs text-fg-muted">{p.mode}</span> },
    { key: 'instrumentNo', header: 'Reference', width: '11rem', render: (p) => <span className="font-mono text-2xs text-fg-muted">{p.instrumentNo}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true, width: '11rem', accessor: (p) => p.amount, render: (p) => inr(p.amount) },
    { key: 'tdsDeducted', header: 'TDS', align: 'right', width: '9rem', accessor: (p) => p.tdsDeducted, render: (p) => (p.tdsDeducted ? inr(p.tdsDeducted) : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'allocations', header: 'Applied to', width: '14rem', render: (p) => <span className="text-2xs text-fg-muted">{p.allocations.map((a) => a.docNo).join(', ') || 'On account'}</span> },
    { key: 'journalVoucherNo', header: 'Voucher', width: '11rem', render: (p) => <span className="font-mono text-2xs text-fg-muted">{p.journalVoucherNo ?? '—'}</span> },
    { key: 'status', header: 'Status', width: '8rem', render: (p) => <FinStatusBadge status={p.status} /> },
  ]

  /* ── Settling a document ───────────────────────────────────────────── */

  function openSettle(d: PartyDocument) {
    setForm({ amount: String(Math.abs(outstandingOf(d))), date: new Date().toISOString().slice(0, 10), mode: 'NEFT', instrumentNo: '', bankAccountCode: 'BANK-HDFC', tds: '0', narration: '' })
    setSettling(d)
  }

  function settle(d: PartyDocument) {
    const applied = Number(form.amount) || 0
    const tds = Number(form.tds) || 0
    const outstanding = Math.abs(outstandingOf(d))
    if (applied <= 0) { toast.error('Nothing to apply', 'Enter an amount greater than zero.'); return }
    if (applied > outstanding + 0.005) { toast.error('More than is owed', `Only ${inr(outstanding)} is outstanding on ${d.docNo}.`); return }

    const bank = bankAccounts.rows.find((b) => b.code === form.bankAccountCode)
    const seq = payments.rows.length + 1
    const docNo = `${isAr ? 'RCT' : 'PMT'}/26-27/${String(600 + seq).padStart(5, '0')}`
    const allocation: Allocation = { uid: newUid('alloc'), docNo: d.docNo, docDate: d.date, outstandingBefore: outstanding, allocated: money(applied) }

    payments.create({
      uid: newUid('fpay'), docNo, direction: isAr ? 'RECEIPT' : 'PAYMENT', partyType: side,
      partyCode: d.partyCode, partyName: d.partyName, date: form.date, mode: form.mode,
      instrumentNo: form.instrumentNo.trim() || '—', instrumentDate: form.date, bankAccountCode: form.bankAccountCode,
      amount: money(applied - tds), allocatedAmount: money(applied), allocations: [allocation], tdsDeducted: money(tds),
      status: 'POSTED', journalVoucherNo: null, narration: form.narration.trim(),
      createdAt: new Date().toISOString(), version: 1,
    } as PartyPayment)

    // The document is settled and a balanced journal is posted, both at once —
    // the subledger and the control account must never move apart.
    documents.update(d.uid, {
      settledAmount: money(d.settledAmount + applied),
      status: money(d.settledAmount + applied) >= d.grandTotal - 0.005 ? 'PAID' : 'PART_PAID',
      version: d.version + 1,
    })

    const bankCode = bank?.accountCode ?? '1110'
    const vSeq = journals.rows.length + 1
    const voucherNo = `${isAr ? 'RV' : 'BP'}/26-27/${String(vSeq).padStart(5, '0')}`
    const lines = isAr
      ? [
          { uid: newUid('l'), accountCode: bankCode, accountName: bank?.bankName ?? 'Bank', debit: money(applied - tds), credit: 0, costCentre: '', profitCentre: '', partyType: null, partyCode: '', narration: `${form.mode} ${form.instrumentNo}` },
          ...(tds ? [{ uid: newUid('l'), accountCode: '2230', accountName: 'TDS payable', debit: money(tds), credit: 0, costCentre: '', profitCentre: '', partyType: null, partyCode: '', narration: 'TDS deducted by the customer' }] : []),
          { uid: newUid('l'), accountCode: controlCode, accountName: 'Trade receivables', debit: 0, credit: money(applied), costCentre: '', profitCentre: '', partyType: side, partyCode: d.partyCode, narration: d.partyName },
        ]
      : [
          { uid: newUid('l'), accountCode: controlCode, accountName: 'Trade payables', debit: money(applied), credit: 0, costCentre: '', profitCentre: '', partyType: side, partyCode: d.partyCode, narration: d.partyName },
          { uid: newUid('l'), accountCode: bankCode, accountName: bank?.bankName ?? 'Bank', debit: 0, credit: money(applied - tds), costCentre: '', profitCentre: '', partyType: null, partyCode: '', narration: `${form.mode} ${form.instrumentNo}` },
          ...(tds ? [{ uid: newUid('l'), accountCode: '2230', accountName: 'TDS payable', debit: 0, credit: money(tds), costCentre: '', profitCentre: '', partyType: null, partyCode: '', narration: 'TDS withheld' }] : []),
        ]

    journals.create({
      uid: newUid('fj'), voucherNo, voucherType: isAr ? 'RECEIPT' : 'PAYMENT', date: form.date, period: form.date.slice(0, 7),
      narration: `${docNo} — ${d.partyName}`, currency: 'INR', exchangeRate: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: lines as any,
      status: 'POSTED', sourceType: isAr ? 'RECEIPT' : 'PAYMENT', sourceDocNo: docNo, isAuto: true,
      reversalOf: null, reversedBy: null, createdBy: 'K. Raman', createdAt: new Date().toISOString(),
      approvedBy: 'K. Raman', postedAt: new Date().toISOString(), version: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    toast.success(
      isAr ? 'Receipt posted' : 'Payment posted',
      `${docNo} applied ${inr(applied)} to ${d.docNo}${tds ? ` net of ${inr(tds)} TDS` : ''}. Voucher ${voucherNo} is in the ledger.`,
    )
    setSettling(null)
  }

  const openDocs = myDocs.filter((d) => Math.abs(outstandingOf(d)) > 0.005)

  return (
    <div>
      <PageHeader
        title={isAr ? 'Accounts receivable' : 'Accounts payable'}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label }]}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'ageing', label: 'Ageing', count: rows.length },
          { id: 'documents', label: 'Documents', count: myDocs.length },
          { id: 'payments', label: isAr ? 'Receipts' : 'Payments', count: myPayments.length },
        ]} />}
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div><p className="text-2xs uppercase tracking-wide text-fg-muted">Total outstanding</p><p className="text-lg font-semibold tabular text-fg">{inr(grandTotal)}</p></div>
          <div><p className="text-2xs uppercase tracking-wide text-fg-muted">Overdue</p><p className={cn('text-lg font-semibold tabular', overdue > 0 ? 'text-danger' : 'text-success')}>{inr(overdue)}</p></div>
          <div><p className="text-2xs uppercase tracking-wide text-fg-muted">{isAr ? 'Customers' : 'Suppliers'}</p><p className="text-lg font-semibold tabular text-fg">{rows.length}</p></div>
          <div className="ml-auto text-right">
            <p className="text-2xs uppercase tracking-wide text-fg-muted">Control account {controlCode}</p>
            <div className="mt-1 flex items-center justify-end gap-2">
              <span className="text-xs tabular text-fg-muted">{inr(check.subledgerTotal)}</span>
              <ReconcileBadge ok={check.reconciles} />
            </div>
          </div>
        </CardBody>
      </Card>

      {!check.reconciles && (
        <Alert tone="danger" className="mb-4" title="The subledger does not agree with the control account">
          Control account {controlCode} shows {inr(Math.abs(check.controlBalance))} against a subledger of {inr(check.subledgerTotal)},
          a gap of {inr(Math.abs(check.difference))}. Something posted to the control account without naming a party, or a
          document was changed without its journal.
        </Alert>
      )}

      {tab === 'ageing' && (
        <>
          <DataTable
            rows={rows}
            columns={ageingColumns}
            rowKey={(r) => r.partyCode}
            searchPlaceholder={`Search ${isAr ? 'customer' : 'supplier'}…`}
            onExport={(f: ExportFormat) => {
              const cols: ExportColumn<AgeingRow>[] = [
                { header: 'Code', value: (r) => r.partyCode }, { header: 'Name', value: (r) => r.partyName },
                ...AGEING_BUCKETS.map((b) => ({ header: b, value: (r: AgeingRow) => r.buckets[b].toFixed(2) })),
                { header: 'Total', value: (r) => r.total.toFixed(2) }, { header: 'Oldest days', value: (r) => r.oldestDays },
              ]
              const n = exportRows(f, isAr ? 'ar-ageing' : 'ap-ageing', `${label} ageing`, cols, rows)
              toast.success('Export ready', `${n} rows written.`)
            }}
            onRowClick={setDetail}
            emptyTitle="Nothing outstanding"
            emptyDescription={isAr ? 'Every invoice has been collected.' : 'Every bill has been paid.'}
          />
          <Card className="mt-3">
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <tbody>
                    <tr className="bg-surface-2">
                      <td className="text-xs font-semibold text-fg">All {isAr ? 'customers' : 'suppliers'}</td>
                      {AGEING_BUCKETS.map((b) => (
                        <td key={b} className="text-right" style={{ width: '9.5rem' }}>
                          <span className="block text-2xs text-fg-subtle">{b}</span>
                          <span className={cn('text-xs font-semibold tabular', b !== 'Not due' && totals[b] > 0 ? 'text-danger' : 'text-fg')}>{inr(totals[b], { blankZero: true })}</span>
                        </td>
                      ))}
                      <td className="text-right" style={{ width: '11rem' }}>
                        <span className="block text-2xs text-fg-subtle">Total</span>
                        <span className="text-sm font-semibold tabular text-fg">{inr(grandTotal)}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {tab === 'documents' && (
        <DataTable
          rows={myDocs}
          columns={docColumns}
          rowKey={(d) => d.uid}
          searchPlaceholder="Search document, party or source…"
          onExport={(f) => {
            const cols: ExportColumn<PartyDocument>[] = [
              { header: 'Document', value: (d) => d.docNo }, { header: 'Type', value: (d) => d.docType },
              { header: 'Party', value: (d) => d.partyName }, { header: 'Date', value: (d) => d.date },
              { header: 'Due', value: (d) => d.dueDate }, { header: 'Taxable', value: (d) => d.taxableValue.toFixed(2) },
              { header: 'CGST', value: (d) => d.cgst.toFixed(2) }, { header: 'SGST', value: (d) => d.sgst.toFixed(2) },
              { header: 'IGST', value: (d) => d.igst.toFixed(2) }, { header: 'Total', value: (d) => d.grandTotal.toFixed(2) },
              { header: 'Outstanding', value: (d) => outstandingOf(d).toFixed(2) }, { header: 'Status', value: (d) => d.status },
            ]
            const n = exportRows(f, isAr ? 'ar-documents' : 'ap-documents', `${label} documents`, cols, myDocs)
            toast.success('Export ready', `${n} rows written.`)
          }}
          rowClassName={(d) => (d.dueDate < new Date().toISOString().slice(0, 10) && d.status !== 'PAID' ? 'bg-danger/5' : undefined)}
          emptyTitle="No documents"
          rowActions={(d) => (
            <>
              <MenuItem label={isAr ? 'Record a receipt' : 'Record a payment'} icon={<Banknote />} disabled={Math.abs(outstandingOf(d)) < 0.005} onClick={() => openSettle(d)} />
              <MenuItem label="Open the journal" separatorBefore disabled={!d.journalVoucherNo} onClick={() => toast.success('Posted as', `${d.docNo} posted voucher ${d.journalVoucherNo}. Open it from the journals screen.`)} />
              <MenuItem label={d.settledAmount > 0 ? 'Delete — blocked (part settled)' : 'Delete'} icon={<Plus className="rotate-45" />} danger separatorBefore disabled={d.settledAmount > 0} onClick={() => setConfirmDelete(d)} />
            </>
          )}
        />
      )}

      {tab === 'payments' && (
        <DataTable
          rows={myPayments}
          columns={payColumns}
          rowKey={(p) => p.uid}
          searchPlaceholder="Search reference, party or document…"
          onExport={(f) => {
            const cols: ExportColumn<PartyPayment>[] = [
              { header: 'Document', value: (p) => p.docNo }, { header: 'Party', value: (p) => p.partyName },
              { header: 'Date', value: (p) => p.date }, { header: 'Mode', value: (p) => p.mode },
              { header: 'Reference', value: (p) => p.instrumentNo }, { header: 'Amount', value: (p) => p.amount.toFixed(2) },
              { header: 'TDS', value: (p) => p.tdsDeducted.toFixed(2) }, { header: 'Applied to', value: (p) => p.allocations.map((a) => a.docNo).join('; ') },
            ]
            const n = exportRows(f, isAr ? 'receipts' : 'payments', isAr ? 'Receipts' : 'Payments', cols, myPayments)
            toast.success('Export ready', `${n} rows written.`)
          }}
          emptyTitle={isAr ? 'No receipts' : 'No payments'}
        />
      )}

      {/* Party detail ------------------------------------------------------- */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.partyName} description={detail ? `${detail.partyCode} · ${inr(detail.total)} outstanding` : ''} width="max-w-4xl">
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
              {AGEING_BUCKETS.map((b) => (
                <span key={b} className="text-fg-muted">{b} <span className={cn('font-semibold tabular', b !== 'Not due' && detail.buckets[b] > 0 ? 'text-danger' : 'text-fg')}>{inr(detail.buckets[b], { blankZero: true })}</span></span>
              ))}
            </div>
            <DetailBlock title={`Open documents (${detail.documents.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '12rem' }}>Document</th><th style={{ width: '8rem' }}>Date</th><th style={{ width: '8rem' }}>Due</th><th className="text-right" style={{ width: '11rem' }}>Outstanding</th><th className="text-right" style={{ width: '7rem' }}>Age</th><th style={{ width: '8rem' }}>Bucket</th><th className="text-right" style={{ width: '9rem' }} /></tr></thead>
                  <tbody>
                    {detail.documents.sort((a, b) => b.daysOverdue - a.daysOverdue).map((doc) => {
                      const full = myDocs.find((x) => x.docNo === doc.docNo)
                      return (
                        <tr key={doc.docNo}>
                          <td className="font-mono text-2xs text-brand-600">{doc.docNo}</td>
                          <td className="text-2xs text-fg-muted">{formatDate(doc.date)}</td>
                          <td className={cn('text-2xs', doc.daysOverdue > 0 ? 'text-danger' : 'text-fg-muted')}>{formatDate(doc.dueDate)}</td>
                          <td className="text-right"><Amount value={doc.outstanding} className="text-xs" /></td>
                          <td className="text-right text-xs tabular">{doc.daysOverdue > 0 ? `${doc.daysOverdue}d` : '—'}</td>
                          <td className="text-2xs text-fg-muted">{doc.bucket}</td>
                          <td className="text-right">
                            {full && <Button size="xs" variant="outline" onClick={() => { setDetail(null); openSettle(full) }}>{isAr ? 'Receive' : 'Pay'}</Button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </DetailBlock>
          </div>
        )}
      </Drawer>

      {/* Settle ------------------------------------------------------------- */}
      <Modal
        open={!!settling}
        onClose={() => setSettling(null)}
        title={isAr ? 'Record a receipt' : 'Record a payment'}
        size="md"
        footer={<><Button variant="ghost" onClick={() => setSettling(null)}>Cancel</Button><Button variant="primary" onClick={() => settling && settle(settling)}>Post</Button></>}
      >
        {settling && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted">
              <span className="font-mono font-medium text-fg">{settling.docNo}</span> — {settling.partyName}.{' '}
              {inr(Math.abs(outstandingOf(settling)))} outstanding of {inr(settling.grandTotal)}.
            </p>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Input label="Amount to apply" type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Select label="Mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as PaymentMode })} options={MODES.map((m) => ({ value: m, label: m }))} />
              <Input label="Reference" value={form.instrumentNo} placeholder="UTR or cheque number" onChange={(e) => setForm({ ...form, instrumentNo: e.target.value })} />
              <Select label="Bank account" value={form.bankAccountCode} onChange={(e) => setForm({ ...form, bankAccountCode: e.target.value })} options={bankAccounts.rows.map((b) => ({ value: b.code, label: `${b.bankName} ${b.accountNumber !== '—' ? b.accountNumber.slice(-4) : ''}` }))} />
              <Input label={isAr ? 'TDS deducted by the customer' : 'TDS withheld'} type="number" step="0.01" value={form.tds} onChange={(e) => setForm({ ...form, tds: e.target.value })} />
              <Textarea label="Narration" containerClassName="sm:col-span-2" rows={2} value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} />
            </div>
            <Alert tone="info">
              The document is settled and a balanced voucher is posted in the same action —{' '}
              {isAr
                ? `debit bank ${inr((Number(form.amount) || 0) - (Number(form.tds) || 0))}${Number(form.tds) ? `, debit TDS ${inr(Number(form.tds))}` : ''}, credit receivables ${inr(Number(form.amount) || 0)}.`
                : `debit payables ${inr(Number(form.amount) || 0)}, credit bank ${inr((Number(form.amount) || 0) - (Number(form.tds) || 0))}${Number(form.tds) ? `, credit TDS ${inr(Number(form.tds))}` : ''}.`}
              {' '}The subledger and the control account cannot move apart.
            </Alert>
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete document"
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (confirmDelete) { documents.remove(confirmDelete.uid); toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted. Reverse its voucher separately.`) } setConfirmDelete(null) }}>Delete</Button></>}
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.docNo} will be marked deleted. Its journal stays posted — reverse that separately so the ledger keeps its trail.</p>
      </Modal>

      {tab === 'ageing' && openDocs.length > 0 && (
        <p className="mt-3 text-2xs text-fg-subtle">
          Buckets are measured from the due date, not the document date. A credit note on a customer and a debit note on
          a supplier both reduce the balance, so they net rather than appearing as separate positives.
        </p>
      )}
    </div>
  )
}

export function PayablesPage() {
  return <ReceivablesPage side="SUPPLIER" />
}
