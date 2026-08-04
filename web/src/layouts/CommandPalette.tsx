import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Barcode,
  Building2,
  CornerDownLeft,
  FileText,
  Hash,
  History,
  Package,
  Search,
  Settings,
  Users,
  Warehouse,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useUi } from '@/store/ui'
import { NAVIGATION } from '@/config/navigation'
import { branches, plants, roles, users, warehouses } from '@/mock/data'
import { approvalTasks, numberSeries } from '@/mock/data2'

interface Result {
  id: string
  group: string
  label: string
  sub?: string
  icon: React.ReactNode
  to: string
}

const RECENT_KEY = 'ssberp.recentSearches'

/**
 * Global search (Ch 16). Searches document numbers, parties, users, items,
 * batches and screens — and accepts a scanned barcode as input, routing it to
 * the right object (V0-BR-046, V0-BR-048).
 */
export function CommandPalette() {
  const open = useUi((s) => s.commandOpen)
  const setOpen = useUi((s) => s.setCommandOpen)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const index = useMemo<Result[]>(() => {
    const screens: Result[] = NAVIGATION.flatMap((g) =>
      g.children
        ? g.children.filter((c) => c.to).map((c) => ({
            id: `nav-${c.to}`,
            group: 'Screens',
            label: c.label,
            sub: g.label,
            icon: <Settings className="h-3.5 w-3.5" />,
            to: c.to!,
          }))
        : g.to
          ? [{ id: `nav-${g.to}`, group: 'Screens', label: g.label, icon: <Settings className="h-3.5 w-3.5" />, to: g.to }]
          : [],
    )

    return [
      ...approvalTasks.map((t) => ({
        id: `doc-${t.uid}`,
        group: 'Documents',
        label: t.documentNo,
        sub: `${t.documentLabel} · ${t.subject}`,
        icon: <FileText className="h-3.5 w-3.5" />,
        to: '/workflow/inbox',
      })),
      ...users.map((u) => ({
        id: `usr-${u.uid}`,
        group: 'People',
        label: u.fullName,
        sub: `${u.loginId} · ${u.designation}`,
        icon: <Users className="h-3.5 w-3.5" />,
        to: '/admin/users',
      })),
      ...roles.map((r) => ({
        id: `rol-${r.uid}`,
        group: 'Roles',
        label: r.name,
        sub: r.code,
        icon: <Users className="h-3.5 w-3.5" />,
        to: '/admin/roles',
      })),
      ...warehouses.map((w) => ({
        id: `wh-${w.uid}`,
        group: 'Warehouses',
        label: `${w.code} — ${w.name}`,
        sub: w.warehouseType.replace(/_/g, ' '),
        icon: <Warehouse className="h-3.5 w-3.5" />,
        to: '/admin/warehouses',
      })),
      ...plants.map((p) => ({
        id: `plt-${p.uid}`,
        group: 'Plants',
        label: p.name,
        sub: `${p.code} · ${p.city}`,
        icon: <Building2 className="h-3.5 w-3.5" />,
        to: '/admin/plants',
      })),
      ...branches.map((b) => ({
        id: `brn-${b.uid}`,
        group: 'Branches',
        label: b.name,
        sub: b.gstin ?? b.code,
        icon: <Building2 className="h-3.5 w-3.5" />,
        to: '/admin/branches',
      })),
      ...numberSeries.slice(0, 12).map((s) => ({
        id: `nsr-${s.uid}`,
        group: 'Numbering',
        label: s.nextNumber,
        sub: `${s.documentLabel} — next number`,
        icon: <Hash className="h-3.5 w-3.5" />,
        to: '/admin/numbering',
      })),
      ...screens,
    ]
  }, [])

  const scanned = q.startsWith('v1|')
  const results = useMemo(() => {
    if (!q.trim()) return []
    if (scanned) {
      const [, type, code] = q.split('|')
      const map: Record<string, { label: string; to: string }> = {
        RM: { label: 'Raw material lot', to: '/admin/barcode' },
        LOC: { label: 'Bin location', to: '/admin/warehouses' },
        PO: { label: 'Production order travel card', to: '/admin/barcode' },
        SF: { label: 'Semi-finished body', to: '/admin/barcode' },
        FG: { label: 'Finished bottle', to: '/admin/barcode' },
        IB: { label: 'Inner box', to: '/admin/barcode' },
        AST: { label: 'Asset', to: '/admin/barcode' },
      }
      const hit = map[type ?? '']
      return hit
        ? [{ id: 'scan', group: 'Scanned code', label: `${hit.label}: ${code ?? ''}`, sub: q, icon: <Barcode className="h-3.5 w-3.5" />, to: hit.to }]
        : []
    }
    const needle = q.toLowerCase()
    return index
      .filter((r) => r.label.toLowerCase().includes(needle) || r.sub?.toLowerCase().includes(needle))
      .slice(0, 24)
  }, [q, index, scanned])

  const grouped = useMemo(() => {
    const g: Record<string, Result[]> = {}
    for (const r of results) (g[r.group] ??= []).push(r)
    return g
  }, [results])

  const flat = Object.values(grouped).flat()

  const go = (r: Result) => {
    const next = [q, ...recent.filter((x) => x !== q)].filter(Boolean).slice(0, 6)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch { /* ignore */ }
    setOpen(false)
    navigate(r.to)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(c + 1, flat.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
      } else if (e.key === 'Enter' && flat[cursor]) {
        e.preventDefault()
        go(flat[cursor])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, flat, cursor]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  let idx = -1

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-2xl animate-slide-up overflow-hidden rounded-card border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          {scanned ? <Barcode className="h-4 w-4 shrink-0 text-brand-600" /> : <Search className="h-4 w-4 shrink-0 text-fg-subtle" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setCursor(0)
            }}
            placeholder="Search documents, people, warehouses, screens… or scan a barcode"
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <span className="kbd">Esc</span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {!q.trim() ? (
            <div className="px-2 py-3">
              {recent.length > 0 && (
                <>
                  <p className="mb-1.5 flex items-center gap-1.5 px-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                    <History className="h-3 w-3" /> Recent searches
                  </p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {recent.map((r) => (
                      <button
                        key={r}
                        onClick={() => setQ(r)}
                        className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-fg-muted hover:bg-surface-3 hover:text-fg"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Try</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {[
                  { q: 'PO/26-27/00042', hint: 'Document number' },
                  { q: 'Ravi', hint: 'Person' },
                  { q: 'RM-01', hint: 'Warehouse' },
                  { q: 'v1|LOC|RM-01|Rack Area A|A-01-1-1', hint: 'Scanned bin label' },
                ].map((s) => (
                  <button
                    key={s.q}
                    onClick={() => setQ(s.q)}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-3"
                  >
                    <Package className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate font-mono text-fg-muted">{s.q}</span>
                    <span className="shrink-0 text-[10px] text-fg-subtle">{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : flat.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm text-fg-muted">No results for “{q}”</p>
              <p className="mt-1 text-xs text-fg-subtle">
                Search is scoped to what your permissions allow you to see.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{group}</p>
                {items.map((r) => {
                  idx += 1
                  const active = idx === cursor
                  return (
                    <button
                      key={r.id}
                      onMouseEnter={() => setCursor(flat.indexOf(r))}
                      onClick={() => go(r)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left transition-colors',
                        active ? 'bg-brand-500/10' : 'hover:bg-surface-3',
                      )}
                    >
                      <span className="shrink-0 text-fg-subtle">{r.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm', active ? 'text-brand-600' : 'text-fg')}>
                          {r.label}
                        </span>
                        {r.sub && <span className="block truncate text-2xs text-fg-subtle">{r.sub}</span>}
                      </span>
                      {active ? (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle opacity-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-surface-2 px-3.5 py-2 text-[10px] text-fg-subtle">
          <span className="flex items-center gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="flex items-center gap-1"><span className="kbd">↵</span> open</span>
          <span className="flex items-center gap-1"><span className="kbd">Esc</span> close</span>
          <span className="ml-auto">Results are permission-scoped</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
