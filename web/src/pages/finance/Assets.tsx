import { useMemo, useState } from 'react'
import { Building2, Plus, TrendingDown } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader, Section, StatTile } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { newUid } from '@/store/data'
import { formatDate } from '@/lib/format'
import { Amount, ChartTip, DetailBlock, FinStatusBadge, inr, inrCompact, useFinanceData } from '@/components/finance/FinShell'
import { depreciateForPeriod, money } from '@/lib/finFlow'
import type { FixedAsset, Journal, JournalLine } from '@/types/finance'

/**
 * Fixed assets and depreciation (Ch 14).
 *
 * The register is the asset side of the balance sheet, so it has to agree with
 * it: cost less accumulated depreciation is what the ledger says the assets are
 * worth. Running depreciation posts the charge rather than merely displaying
 * it, because a register that drifts from the ledger is worse than none.
 */

type Tab = 'register' | 'depreciation'

const BLANK = (): Partial<FixedAsset> => ({
  code: '', name: '', category: 'Plant & Machinery', accountCode: '1500', costCentre: '', plant: 'PLANT-01',
  machineCode: null, capitalisedOn: new Date().toISOString().slice(0, 10), cost: 0, salvageValue: 0,
  usefulLifeYears: 10, method: 'SLM', wdvRatePct: 15, accumulatedDepreciation: 0, depreciatedUpto: null,
  status: 'ACTIVE', disposedOn: null, disposalValue: 0, insurancePolicyNo: '', warrantyUntil: null,
  amcVendor: '', remarks: '', version: 1,
})

export function FixedAssetsPage() {
  const toast = useToast()
  const fin = useFinanceData()
  const { assets, journals, accounts, costCentres, periods } = fin

  const [tab, setTab] = useState<Tab>('register')
  const [detail, setDetail] = useState<FixedAsset | null>(null)
  const [editing, setEditing] = useState<Partial<FixedAsset> | null>(null)
  const [disposing, setDisposing] = useState<FixedAsset | null>(null)
  const [disposalValue, setDisposalValue] = useState('0')
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10))
  const [runPeriod, setRunPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [confirmRun, setConfirmRun] = useState(false)

  const live = useMemo(() => assets.rows.filter((a) => !a.deletedAt), [assets.rows])

  /** Depreciation for the chosen period, asset by asset. Nothing posted yet. */
  const runs = useMemo(
    () => live.map((a) => ({ asset: a, run: depreciateForPeriod(a, runPeriod) })),
    [live, runPeriod],
  )
  const alreadyRun = live.filter((a) => a.depreciatedUpto && a.depreciatedUpto >= runPeriod)
  const chargeable = runs.filter((r) => r.run.charge > 0 && !(r.asset.depreciatedUpto && r.asset.depreciatedUpto >= runPeriod))
  const totalCharge = money(chargeable.reduce((s, r) => s + r.run.charge, 0))
  const periodLocked = periods.rows.some((p) => p.period === runPeriod && p.status !== 'OPEN')

  const k = useMemo(() => {
    const active = live.filter((a) => a.status === 'ACTIVE')
    const cost = money(live.reduce((s, a) => s + a.cost, 0))
    const acc = money(live.reduce((s, a) => s + a.accumulatedDepreciation, 0))
    const byCategory = new Map<string, { cost: number; nbv: number }>()
    for (const a of live) {
      const e = byCategory.get(a.category) ?? { cost: 0, nbv: 0 }
      e.cost = money(e.cost + a.cost)
      e.nbv = money(e.nbv + a.cost - a.accumulatedDepreciation)
      byCategory.set(a.category, e)
    }
    return {
      count: live.length,
      active: active.length,
      cost,
      acc,
      nbv: money(cost - acc),
      fullyDepreciated: live.filter((a) => a.cost - a.accumulatedDepreciation <= a.salvageValue + 0.005).length,
      chart: [...byCategory.entries()].map(([category, v]) => ({ category, cost: v.cost, nbv: v.nbv })).sort((a, b) => b.cost - a.cost),
    }
  }, [live])

  /* ── actions ────────────────────────────────────────────────── */

  function blockers(draft: Partial<FixedAsset>, uid?: string): string[] {
    const out: string[] = []
    if (!draft.code?.trim()) out.push('A code is required.')
    if (!draft.name?.trim()) out.push('A name is required.')
    if (assets.rows.some((a) => a.code === draft.code && a.uid !== uid && !a.deletedAt)) out.push('That code is already in use.')
    if ((draft.cost ?? 0) <= 0) out.push('Capitalised cost must be greater than nil.')
    if ((draft.salvageValue ?? 0) < 0) out.push('Salvage value cannot be negative.')
    if ((draft.salvageValue ?? 0) >= (draft.cost ?? 0)) out.push('Salvage value must be below cost, or there is nothing to depreciate.')
    if (draft.method === 'SLM' && (draft.usefulLifeYears ?? 0) <= 0) out.push('Straight line needs a useful life in years.')
    if (draft.method === 'WDV' && (draft.wdvRatePct ?? 0) <= 0) out.push('Written-down value needs a rate.')
    if ((draft.accumulatedDepreciation ?? 0) > (draft.cost ?? 0) - (draft.salvageValue ?? 0) + 0.005) {
      out.push('Accumulated depreciation cannot exceed cost less salvage value.')
    }
    if (!accounts.rows.some((a) => a.code === draft.accountCode && !a.isGroup)) out.push('Link the asset to a posting account in the chart.')
    return out
  }

  function save() {
    if (!editing) return
    const b = blockers(editing, editing.uid)
    if (b.length) { toast.error(b[0]); return }
    if (editing.uid) { assets.update(editing.uid, editing as FixedAsset); toast.success(`${editing.code} updated`) }
    else { assets.create({ ...(BLANK() as FixedAsset), ...(editing as FixedAsset), uid: newUid('fa') }); toast.success(`${editing.code} capitalised`) }
    setEditing(null)
  }

  function remove(a: FixedAsset) {
    if (a.accumulatedDepreciation > 0.005) { toast.error('Depreciation has been charged on this asset. Dispose of it instead — deleting would leave the ledger holding a charge for an asset that no longer exists.'); return }
    assets.remove(a.uid)
    toast.success(`${a.code} removed`)
  }

  /**
   * Posts the period's charge and stamps each asset so it cannot be run twice.
   * Debit depreciation expense, credit accumulated depreciation — the asset's
   * own cost account is never touched.
   */
  function postDepreciation() {
    if (!chargeable.length) { toast.error('Nothing to charge for this period.'); return }
    if (periodLocked) { toast.error(`${runPeriod} is closed. Reopen it before posting.`); return }

    const expense = accounts.rows.find((a) => a.code === '5600') ?? accounts.rows.find((a) => a.name.toLowerCase().includes('depreciation') && a.accountType === 'EXPENSE')
    const accum = accounts.rows.find((a) => a.code === '1590') ?? accounts.rows.find((a) => a.name.toLowerCase().includes('accumulated'))
    if (!expense || !accum) { toast.error('The depreciation expense or accumulated depreciation account is missing from the chart.'); return }

    const lines: JournalLine[] = []
    for (const r of chargeable) {
      lines.push({
        uid: newUid('jl'), accountCode: expense.code, accountName: expense.name,
        debit: r.run.charge, credit: 0, costCentre: r.asset.costCentre, profitCentre: '',
        partyType: null, partyCode: '', narration: `${r.asset.code} ${r.asset.name}`,
      })
    }
    lines.push({
      uid: newUid('jl'), accountCode: accum.code, accountName: accum.name,
      debit: 0, credit: totalCharge, costCentre: '', profitCentre: '',
      partyType: null, partyCode: '', narration: `Depreciation for ${runPeriod}`,
    })

    const journal: Journal = {
      uid: newUid('jv'),
      voucherNo: `DEP-${runPeriod.replace('-', '')}`,
      voucherType: 'DEPRECIATION',
      date: `${runPeriod}-28`,
      period: runPeriod,
      narration: `Depreciation for ${runPeriod} on ${chargeable.length} assets`,
      currency: 'INR', exchangeRate: 1,
      lines,
      status: 'POSTED',
      sourceType: 'DEPRECIATION_RUN', sourceDocNo: runPeriod, isAuto: true,
      reversalOf: null, reversedBy: null,
      createdBy: 'You', createdAt: new Date().toISOString(),
      approvedBy: 'You', postedAt: new Date().toISOString(), version: 1,
    }

    journals.create(journal)
    for (const r of chargeable) {
      assets.update(r.asset.uid, { accumulatedDepreciation: r.run.accumulatedAfter, depreciatedUpto: runPeriod })
    }
    toast.success(`${inr(totalCharge)} charged across ${chargeable.length} assets — voucher ${journal.voucherNo}`)
    setConfirmRun(false)
  }

  /**
   * Disposal: the asset leaves at its written-down value, and the difference
   * between what it fetched and that value is the profit or loss on sale.
   */
  function dispose() {
    if (!disposing) return
    const proceeds = Number(disposalValue)
    if (!Number.isFinite(proceeds) || proceeds < 0) { toast.error('Enter the disposal proceeds.'); return }
    const wdv = money(disposing.cost - disposing.accumulatedDepreciation)
    const gain = money(proceeds - wdv)
    assets.update(disposing.uid, { status: 'DISPOSED', disposedOn: disposalDate, disposalValue: proceeds })
    toast.success(
      Math.abs(gain) < 0.005
        ? `${disposing.code} disposed at its written-down value.`
        : `${disposing.code} disposed — ${gain > 0 ? 'profit' : 'loss'} on sale ${inr(Math.abs(gain))} against a written-down value of ${inr(wdv)}.`,
    )
    setDisposing(null)
  }

  /* ── columns ────────────────────────────────────────────────── */

  const registerColumns: Column<FixedAsset>[] = [
    { key: 'asset', header: 'Asset', width: '20rem', render: (a) => (<><p className="truncate text-xs text-fg">{a.name}</p><p className="font-mono text-2xs text-fg-subtle">{a.code}{a.machineCode ? ` · ${a.machineCode}` : ''}</p></>) },
    { key: 'category', header: 'Category', width: '12rem', render: (a) => <span className="text-2xs text-fg-muted">{a.category}</span> },
    { key: 'cc', header: 'Cost centre', width: '10rem', render: (a) => <span className="font-mono text-2xs text-fg-muted">{a.costCentre || '—'}</span> },
    { key: 'capitalised', header: 'Capitalised', width: '8rem', render: (a) => <span className="text-2xs tabular text-fg-muted">{formatDate(a.capitalisedOn)}</span> },
    { key: 'cost', header: 'Cost', width: '11rem', align: 'right', render: (a) => <Amount value={a.cost} className="text-xs" /> },
    { key: 'acc', header: 'Depreciation', width: '11rem', align: 'right', render: (a) => <Amount value={a.accumulatedDepreciation} className="text-xs text-fg-muted" blankZero /> },
    {
      key: 'nbv', header: 'Written-down value', width: '13rem', align: 'right',
      render: (a) => {
        const nbv = money(a.cost - a.accumulatedDepreciation)
        const pct = a.cost > 0 ? (nbv / a.cost) * 100 : 0
        return (<><Amount value={nbv} className="block text-xs font-medium" /><span className="text-3xs text-fg-subtle">{pct.toFixed(0)}% of cost</span></>)
      },
    },
    {
      key: 'method', header: 'Method', width: '9rem',
      render: (a) => (<><Badge tone="neutral" size="sm" dot={false}>{a.method}</Badge><p className="mt-0.5 text-3xs text-fg-subtle">{a.method === 'SLM' ? `${a.usefulLifeYears} yr` : `${a.wdvRatePct}%`}</p></>),
    },
    { key: 'status', header: 'Status', width: '8rem', render: (a) => <FinStatusBadge status={a.status} /> },
  ]

  const runColumns: Column<(typeof runs)[number]>[] = [
    { key: 'asset', header: 'Asset', width: '20rem', render: (r) => (<><p className="truncate text-xs text-fg">{r.asset.name}</p><p className="font-mono text-2xs text-fg-subtle">{r.asset.code}</p></>) },
    { key: 'method', header: 'Method', width: '8rem', render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.run.method}</Badge> },
    { key: 'opening', header: 'Opening WDV', width: '12rem', align: 'right', render: (r) => <Amount value={r.run.openingWdv} className="text-xs" /> },
    {
      key: 'charge', header: 'Charge', width: '11rem', align: 'right',
      render: (r) => r.run.charge > 0 ? <Amount value={r.run.charge} className="text-xs font-medium" /> : <span className="text-2xs text-fg-subtle">—</span>,
    },
    { key: 'closing', header: 'Closing WDV', width: '12rem', align: 'right', render: (r) => <Amount value={r.run.closingWdv} className="text-xs" /> },
    {
      key: 'note', header: 'Basis', width: '22rem',
      render: (r) => (
        <p className="text-2xs text-fg-muted">
          {r.asset.depreciatedUpto && r.asset.depreciatedUpto >= runPeriod
            ? <span className="text-success">Already charged for {runPeriod}.</span>
            : r.run.note}
        </p>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Fixed assets"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Finance', to: '/finance' }, { label: 'Fixed assets' }]}
        actions={
          tab === 'register'
            ? <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing(BLANK())}>Capitalise an asset</Button>
            : <Button variant="primary" size="sm" icon={<TrendingDown />} onClick={() => setConfirmRun(true)} disabled={!chargeable.length || periodLocked}>Post depreciation</Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'register', label: 'Register', count: live.length },
              { id: 'depreciation', label: 'Depreciation', count: chargeable.length },
            ]}
          />
        }
      />

      {tab === 'register' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Gross block" value={`₹${inrCompact(k.cost)}`} sub={`${k.count} assets · ${k.active} in use`} icon={<Building2 />} tone="brand" />
            <StatTile label="Accumulated depreciation" value={`₹${inrCompact(k.acc)}`} sub={`${k.cost > 0 ? ((k.acc / k.cost) * 100).toFixed(0) : 0}% of cost written off`} icon={<TrendingDown />} tone="warning" />
            <StatTile label="Net block" value={`₹${inrCompact(k.nbv)}`} sub="What the balance sheet carries" tone="success" />
            <StatTile label="Fully depreciated" value={k.fullyDepreciated} sub="Still in use, carried at salvage value" tone={k.fullyDepreciated ? 'warning' : 'neutral'} />
          </div>

          {k.chart.length > 0 && (
            <Card className="mb-4">
              <CardHeader title="Gross block against net block" description="By category — the gap is what has been written off" />
              <CardBody className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={k.chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="category" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => inrCompact(v as number)} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={54} />
                    <Tooltip content={<ChartTip prefix="₹" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Bar dataKey="cost" name="Cost" fill="#cbd5e1" maxBarSize={34} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="nbv" name="Written-down value" fill="#3b82f6" maxBarSize={34} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}

          <DataTable
            rows={live}
            columns={registerColumns}
            rowKey={(a) => a.uid}
            searchable
            searchPlaceholder="Search by code, name or category"
            onRowClick={(a) => setDetail(a)}
            rowClassName={(a) => (a.status === 'DISPOSED' ? 'opacity-60' : undefined)}
            rowActions={(a) => (
              <>
                <MenuItem label="Edit" onClick={() => setEditing({ ...a })} />
                {a.status === 'ACTIVE' && (
                  <MenuItem
                    label="Dispose"
                    onClick={() => { setDisposing(a); setDisposalValue(String(money(a.cost - a.accumulatedDepreciation))); setDisposalDate(new Date().toISOString().slice(0, 10)) }}
                  />
                )}
                <MenuItem label="Delete" danger onClick={() => remove(a)} />
              </>
            )}
            emptyTitle="No assets"
            emptyDescription="Capitalise the first one to start the register."
          />
        </>
      )}

      {tab === 'depreciation' && (
        <>
          <Card className="mb-3">
            <CardBody className="flex flex-wrap items-end gap-3">
              <Input label="Period" type="month" value={runPeriod} onChange={(e) => setRunPeriod(e.target.value)} className="w-44" />
              <div className="text-xs">
                <p className="text-fg-muted">{chargeable.length} asset{chargeable.length === 1 ? '' : 's'} to charge</p>
                <p className="mt-0.5 text-lg font-semibold tabular text-fg">{inr(totalCharge)}</p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {alreadyRun.length > 0 && <Badge tone="success" size="sm">{alreadyRun.length} already charged</Badge>}
                {periodLocked && <Badge tone="danger" size="sm">Period closed</Badge>}
                <Button variant="primary" size="sm" onClick={() => setConfirmRun(true)} disabled={!chargeable.length || periodLocked}>Post depreciation</Button>
              </div>
            </CardBody>
          </Card>

          <Alert tone="info" title="What posting will do" className="mb-3">
            Debit depreciation expense {inr(totalCharge)} against each asset's cost centre, credit accumulated depreciation with the same total, and stamp every asset as charged through {runPeriod} so it cannot be run twice.
            The asset's own cost account is never touched — gross block stays as it was.
          </Alert>

          <DataTable
            rows={runs}
            columns={runColumns}
            rowKey={(r) => r.asset.uid}
            rowClassName={(r) => (r.run.charge > 0 && !(r.asset.depreciatedUpto && r.asset.depreciatedUpto >= runPeriod) ? undefined : 'opacity-60')}
            emptyTitle="No assets"
            emptyDescription="Capitalise an asset first."
          />
        </>
      )}

      {/* ── detail ───────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.code} · ${detail.name}` : ''} width="max-w-2xl">
        {detail && (() => {
          const nbv = money(detail.cost - detail.accumulatedDepreciation)
          const next = depreciateForPeriod(detail, runPeriod)
          const yearsHeld = (Date.now() - new Date(detail.capitalisedOn).getTime()) / (365.25 * 86_400_000)
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <FinStatusBadge status={detail.status} />
                <Badge tone="neutral" size="sm" dot={false}>{detail.category}</Badge>
                <Badge tone="brand" size="sm" dot={false}>{detail.method === 'SLM' ? `Straight line · ${detail.usefulLifeYears} yr` : `WDV · ${detail.wdvRatePct}%`}</Badge>
              </div>

              <DetailBlock title="Value">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Cost" value={inr(detail.cost)} />
                  <Field label="Depreciation to date" value={inr(detail.accumulatedDepreciation)} />
                  <Field label="Written-down value" value={inr(nbv)} />
                  <Field label="Salvage value" value={inr(detail.salvageValue)} />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-surface-3">
                  <div className="h-full bg-brand-500" style={{ width: `${detail.cost > 0 ? Math.min(100, (nbv / detail.cost) * 100) : 0}%` }} />
                </div>
                <p className="mt-1 text-3xs text-fg-subtle">{detail.cost > 0 ? ((nbv / detail.cost) * 100).toFixed(1) : '0'}% of cost remains to be written off</p>
              </DetailBlock>

              <DetailBlock title="Where it sits">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Plant" value={detail.plant || '—'} />
                  <Field label="Cost centre" value={detail.costCentre || '—'} />
                  <Field label="Ledger account" value={detail.accountCode} />
                  <Field label="Machine" value={detail.machineCode ?? '—'} />
                  <Field label="Capitalised" value={formatDate(detail.capitalisedOn)} />
                  <Field label="Held for" value={`${yearsHeld.toFixed(1)} years`} />
                </div>
              </DetailBlock>

              <DetailBlock title="Cover">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Insurance policy" value={detail.insurancePolicyNo || '—'} />
                  <Field label="Warranty until" value={detail.warrantyUntil ? formatDate(detail.warrantyUntil) : '—'} />
                  <Field label="AMC vendor" value={detail.amcVendor || '—'} />
                </div>
              </DetailBlock>

              <DetailBlock title={`Charge for ${runPeriod}`}>
                <div className="rounded border border-border bg-surface-2 p-3">
                  <p className="text-lg font-semibold tabular text-fg">{inr(next.charge)}</p>
                  <p className="mt-1 text-2xs text-fg-muted">{next.note}</p>
                  <p className="mt-1 text-2xs text-fg-muted">
                    {inr(next.openingWdv)} opening → {inr(next.closingWdv)} closing
                    {detail.depreciatedUpto ? ` · charged through ${detail.depreciatedUpto}` : ' · never charged'}
                  </p>
                </div>
              </DetailBlock>

              {detail.status === 'DISPOSED' && (
                <Alert tone={detail.disposalValue >= nbv ? 'tip' : 'warning'} title="Disposed">
                  Sold on {detail.disposedOn ? formatDate(detail.disposedOn) : '—'} for {inr(detail.disposalValue)} against a written-down value of {inr(nbv)} —
                  a {detail.disposalValue >= nbv ? 'profit' : 'loss'} on sale of {inr(Math.abs(money(detail.disposalValue - nbv)))}.
                </Alert>
              )}

              {detail.remarks && <DetailBlock title="Notes"><p className="text-xs leading-relaxed text-fg-muted">{detail.remarks}</p></DetailBlock>}

              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...detail }); setDetail(null) }}>Edit</Button>
                {detail.status === 'ACTIVE' && (
                  <Button variant="outline" size="sm" onClick={() => { setDisposing(detail); setDisposalValue(String(nbv)); setDetail(null) }}>Dispose</Button>
                )}
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* ── form ─────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.uid ? `Edit ${editing.code}` : 'Capitalise an asset'}
        width="max-w-2xl"
        footer={<><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={save}>Save</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Code" required value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="FA-0013" />
              <Input label="Category" value={editing.category ?? ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            </div>
            <Input label="Name" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Capitalised on" type="date" value={editing.capitalisedOn ?? ''} onChange={(e) => setEditing({ ...editing, capitalisedOn: e.target.value })} />
              <Input label="Cost" type="number" required value={String(editing.cost ?? 0)} onChange={(e) => setEditing({ ...editing, cost: Number(e.target.value) })} />
              <Input label="Salvage value" type="number" value={String(editing.salvageValue ?? 0)} onChange={(e) => setEditing({ ...editing, salvageValue: Number(e.target.value) })} hint="Residual at end of life" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Select label="Method" value={editing.method ?? 'SLM'} onChange={(e) => setEditing({ ...editing, method: e.target.value as FixedAsset['method'] })}>
                <option value="SLM">Straight line</option>
                <option value="WDV">Written-down value</option>
              </Select>
              <Input label="Useful life (years)" type="number" value={String(editing.usefulLifeYears ?? 0)} onChange={(e) => setEditing({ ...editing, usefulLifeYears: Number(e.target.value) })} disabled={editing.method === 'WDV'} />
              <Input label="WDV rate %" type="number" value={String(editing.wdvRatePct ?? 0)} onChange={(e) => setEditing({ ...editing, wdvRatePct: Number(e.target.value) })} disabled={editing.method === 'SLM'} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Select label="Ledger account" value={editing.accountCode ?? ''} onChange={(e) => setEditing({ ...editing, accountCode: e.target.value })}>
                {accounts.rows.filter((a) => !a.isGroup && !a.deletedAt && a.accountType === 'ASSET').map((a) => (<option key={a.uid} value={a.code}>{a.code} · {a.name}</option>))}
              </Select>
              <Select label="Cost centre" value={editing.costCentre ?? ''} onChange={(e) => setEditing({ ...editing, costCentre: e.target.value })}>
                <option value="">None</option>
                {costCentres.rows.filter((c) => !c.deletedAt).map((c) => (<option key={c.uid} value={c.code}>{c.code} · {c.name}</option>))}
              </Select>
              <Input label="Plant" value={editing.plant ?? ''} onChange={(e) => setEditing({ ...editing, plant: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Machine code" value={editing.machineCode ?? ''} onChange={(e) => setEditing({ ...editing, machineCode: e.target.value || null })} hint="Links to maintenance and machine-hour costing" />
              <Input label="Depreciation to date" type="number" value={String(editing.accumulatedDepreciation ?? 0)} onChange={(e) => setEditing({ ...editing, accumulatedDepreciation: Number(e.target.value) })} hint="Opening figure when migrating an existing asset" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Insurance policy" value={editing.insurancePolicyNo ?? ''} onChange={(e) => setEditing({ ...editing, insurancePolicyNo: e.target.value })} />
              <Input label="Warranty until" type="date" value={editing.warrantyUntil ?? ''} onChange={(e) => setEditing({ ...editing, warrantyUntil: e.target.value || null })} />
              <Input label="AMC vendor" value={editing.amcVendor ?? ''} onChange={(e) => setEditing({ ...editing, amcVendor: e.target.value })} />
            </div>
            <Textarea label="Notes" rows={2} value={editing.remarks ?? ''} onChange={(e) => setEditing({ ...editing, remarks: e.target.value })} />

            {(() => {
              const b = blockers(editing, editing.uid)
              return b.length ? <Alert tone="danger" title="Cannot save yet"><ul className="list-disc space-y-0.5 pl-4">{b.map((x) => (<li key={x}>{x}</li>))}</ul></Alert> : null
            })()}

            {editing.cost && editing.cost > 0 ? (
              <Alert tone="tip" title="First full month's charge">
                {editing.method === 'SLM'
                  ? `${inr(money(((editing.cost - (editing.salvageValue ?? 0)) / Math.max(1, editing.usefulLifeYears ?? 1)) / 12))} a month, until the salvage value of ${inr(editing.salvageValue ?? 0)} is reached.`
                  : `${inr(money(((editing.cost - (editing.accumulatedDepreciation ?? 0)) * (editing.wdvRatePct ?? 0)) / 100 / 12))} in the first month, falling every month as the written-down value drops.`}
              </Alert>
            ) : null}
          </div>
        )}
      </Drawer>

      {/* ── dispose ──────────────────────────────────────────── */}
      <Modal
        open={!!disposing}
        onClose={() => setDisposing(null)}
        title={disposing ? `Dispose of ${disposing.code}` : ''}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setDisposing(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={dispose}>Dispose</Button></>}
      >
        {disposing && (() => {
          const wdv = money(disposing.cost - disposing.accumulatedDepreciation)
          const gain = money(Number(disposalValue || 0) - wdv)
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Disposal date" type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
                <Input label="Proceeds" type="number" value={disposalValue} onChange={(e) => setDisposalValue(e.target.value)} />
              </div>
              <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                <p className="flex justify-between"><span className="text-fg-muted">Cost</span><span className="tabular text-fg">{inr(disposing.cost)}</span></p>
                <p className="flex justify-between"><span className="text-fg-muted">Less: depreciation to date</span><span className="tabular text-fg">{inr(disposing.accumulatedDepreciation)}</span></p>
                <p className="mt-1 flex justify-between border-t border-border pt-1"><span className="text-fg-muted">Written-down value</span><span className="font-medium tabular text-fg">{inr(wdv)}</span></p>
                <p className="flex justify-between"><span className="text-fg-muted">Proceeds</span><span className="tabular text-fg">{inr(Number(disposalValue || 0))}</span></p>
                <p className="mt-1 flex justify-between border-t border-border pt-1">
                  <span className="text-fg-muted">{gain >= 0 ? 'Profit on sale' : 'Loss on sale'}</span>
                  <span className={cn('font-semibold tabular', gain >= 0 ? 'text-success' : 'text-danger')}>{inr(Math.abs(gain))}</span>
                </p>
              </div>
              <Alert tone="info" title="What this records">
                The asset leaves the register at {inr(wdv)}. The {gain >= 0 ? 'profit' : 'loss'} of {inr(Math.abs(gain))} is the difference between the proceeds and that value, and belongs in the P&L for the month of disposal.
              </Alert>
            </div>
          )
        })()}
      </Modal>

      {/* ── confirm depreciation run ─────────────────────────── */}
      <Modal
        open={confirmRun}
        onClose={() => setConfirmRun(false)}
        title={`Post depreciation for ${runPeriod}`}
        size="md"
        footer={<><Button variant="ghost" size="sm" onClick={() => setConfirmRun(false)}>Cancel</Button><Button variant="primary" size="sm" onClick={postDepreciation}>Post {inr(totalCharge)}</Button></>}
      >
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            {chargeable.length} asset{chargeable.length === 1 ? '' : 's'} will be charged a total of <strong className="text-fg">{inr(totalCharge)}</strong>.
            {alreadyRun.length > 0 && ` ${alreadyRun.length} asset(s) already charged through ${runPeriod} are skipped.`}
          </p>
          <div className="rounded border border-border bg-surface-2 p-3">
            <p className="mb-1.5 text-3xs uppercase tracking-wider text-fg-subtle">The voucher</p>
            <table className="w-full text-xs">
              <tbody>
                <tr><td className="py-0.5 text-fg">5600 Depreciation</td><td className="py-0.5 text-right tabular text-fg">{inr(totalCharge)}</td><td /></tr>
                <tr><td className="py-0.5 pl-4 text-fg-muted">1590 Accumulated depreciation</td><td /><td className="py-0.5 text-right tabular text-fg">{inr(totalCharge)}</td></tr>
              </tbody>
            </table>
          </div>
          <Section title="Assets in this run">
            <div className="max-h-52 overflow-y-auto rounded border border-border">
              <table className="grid-table">
                <tbody>
                  {chargeable.map((r) => (
                    <tr key={r.asset.uid}>
                      <td><p className="text-xs text-fg">{r.asset.name}</p><p className="font-mono text-3xs text-fg-subtle">{r.asset.code}</p></td>
                      <td className="text-right" style={{ width: '10rem' }}><Amount value={r.run.charge} className="text-xs" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </Modal>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xs uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="mt-0.5 text-xs tabular text-fg">{value}</p>
    </div>
  )
}
