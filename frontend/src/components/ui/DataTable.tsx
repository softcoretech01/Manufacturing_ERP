import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Eye,
  MoreVertical,
  Pencil,
  RotateCw,
  Trash2,
  X,
  MoreHorizontal
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { SearchInput } from './Input'
import { EmptyState, Skeleton } from './Card'
import { Menu } from './Menu'

/* ─────────────────────── Row action promotion ─────────────────────── */

interface ActionProps {
  label?: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  icon?: ReactNode
}

/**
 * Flattens whatever `rowActions` returned into a flat list of menu entries,
 * seeing through fragments and dropping the `false` left behind by a
 * conditionally rendered item.
 */
function flattenActions(node: ReactNode): ReactElement<ActionProps>[] {
  const out: ReactElement<ActionProps>[] = []
  const walk = (n: ReactNode) => {
    Children.forEach(n, (child) => {
      if (!isValidElement(child)) return
      if (child.type === Fragment) {
        walk((child.props as { children?: ReactNode }).children)
        return
      }
      out.push(child as ReactElement<ActionProps>)
    })
  }
  walk(node)
  return out
}

const labelOf = (el: ReactElement<ActionProps>) => (typeof el.props.label === 'string' ? el.props.label : '')

/**
 * Edit and the destructive action are what people reach for on a row, so they
 * get their own buttons in the Action column instead of hiding one click deep
 * in a menu.
 *
 * They are promoted out of the menu the screen already declares rather than
 * being wired separately, so the handler, the disabled rule and the wording of
 * a blocked delete stay defined in exactly one place — the screen. Anything
 * else the screen offers stays in the overflow menu next to them.
 *
 * A master is deleted; a posted document is cancelled, rejected or revoked.
 * Both are the destructive thing you can do to the row, so both take the
 * destructive slot — a trash can for a real delete, a "not allowed" mark for
 * the rest, with the button's tooltip naming the actual action.
 */
function splitActions(node: ReactNode) {
  const all = flattenActions(node)
  const view = all.find((el) => /^view\b|^open\b/i.test(labelOf(el)))
  const edit = all.find((el) => /^edit\b/i.test(labelOf(el)))
  const remove = all.find((el) => /^delete\b/i.test(labelOf(el)))
  // Failing an explicit delete, the screen's own `danger` flag says which
  // action is the destructive one.
  const destructive = remove ?? all.find((el) => el.props.danger && el !== edit && el !== view)
  const rest = all.filter((el) => el !== view && el !== edit && el !== destructive)
  return { view, edit, destructive, isDelete: !!remove, rest }
}

function RowActionButton({
  action,
  icon,
  danger,
}: {
  action: ReactElement<ActionProps>
  icon: ReactNode
  danger?: boolean
}) {
  const { onClick, disabled } = action.props
  const label = labelOf(action)
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
        'disabled:cursor-not-allowed disabled:text-fg-subtle disabled:opacity-40',
        // Coloured at rest, not only on hover: red always means destructive and
        // blue always means edit, so the row can be read without hovering it.
        danger
          ? 'text-danger hover:bg-danger/10'
          : 'text-brand-600 hover:bg-brand-500/10',
      )}
    >
      {icon}
    </button>
  )
}

export interface Column<T> {
  key: string
  header: ReactNode
  /** Cell renderer. Falls back to `row[key]`. */
  render?: (row: T, index: number) => ReactNode
  /** Value used for sorting and search when no custom accessor is given. */
  accessor?: (row: T) => string | number | null | undefined
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  width?: string
  className?: string
  /** Hidden by default in the column chooser. */
  defaultHidden?: boolean
  sticky?: boolean
}

export interface FilterChip {
  key: string
  label: string
  value: string
  onRemove: () => void
}

export interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean

  /** Search */
  searchable?: boolean
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (v: string) => void

  /** Selection + bulk actions (V0-UIR-004) */
  selectable?: boolean
  selected?: string[]
  onSelectedChange?: (ids: string[]) => void
  bulkActions?: ReactNode

  /** Applied filter chips — always visible so nothing is silently filtered (V0-UIR-005) */
  filterChips?: FilterChip[]
  onClearFilters?: () => void
  filterPanel?: ReactNode

  /** Toolbar */
  toolbar?: ReactNode
  onRefresh?: () => void
  onExport?: (format: 'xlsx' | 'csv' | 'pdf') => void

  /** Rows */
  onRowClick?: (row: T) => void
  rowActions?: (row: T) => ReactNode
  rowClassName?: (row: T) => string | undefined

  /** Pagination */
  pageSize?: number
  page?: number
  onPageChange?: (p: number) => void
  totalOverride?: number

  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  className?: string
  dense?: boolean
  /**
   * Row rhythm. `compact` (default) keeps the dense 46px grid every
   * existing screen is built around; `comfortable` is the 68px enterprise
   * reading grid used by the inventory registers, where a row carries an
   * item, a code, a warehouse, a batch and several figures at once.
   */
  density?: 'compact' | 'comfortable'
  maxHeight?: string
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  searchable = true,
  searchPlaceholder = 'Search…',
  searchValue,
  onSearchChange,
  selectable,
  selected = [],
  onSelectedChange,
  bulkActions,
  filterChips = [],
  onClearFilters,
  filterPanel,
  toolbar,
  onRefresh,
  onExport,
  onRowClick,
  rowActions,
  rowClassName,
  // 15 rows per page: a screenful on a laptop without the grid needing its own
  // scrollbar. Screens that genuinely want more (audit trails, reports) still
  // pass their own pageSize.
  pageSize = 15,
  page: controlledPage,
  onPageChange,
  totalOverride,
  emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your search or filters.',
  emptyAction,
  className,
  dense,
  density = 'compact',
  maxHeight,
}: DataTableProps<T>) {
  const [innerSearch, setInnerSearch] = useState('')
  const [innerPage, setInnerPage] = useState(1)
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  )
  const [focusIdx, setFocusIdx] = useState(-1)
  const tableRef = useRef<HTMLDivElement>(null)

  const search = searchValue ?? innerSearch
  const setSearch = onSearchChange ?? setInnerSearch
  const page = controlledPage ?? innerPage
  const setPage = onPageChange ?? setInnerPage

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden])

  const valueOf = (row: T, col: Column<T>) => {
    if (col.accessor) return col.accessor(row)
    return (row as Record<string, unknown>)[col.key] as string | number | null | undefined
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((row) =>
      columns.some((col) => {
        const v = valueOf(row, col)
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q)
      }),
    )
  }, [rows, search, columns])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    return [...filtered].sort((a, b) => {
      const av = valueOf(a, col)
      const bv = valueOf(b, col)
      if (av === bv) return 0
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'en', { numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort, columns])

  const total = totalOverride ?? sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageRows = totalOverride ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [totalPages]) // eslint-disable-line react-hooks/exhaustive-deps

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.includes(rowKey(r)))

  const toggleAll = () => {
    if (!onSelectedChange) return
    const ids = pageRows.map(rowKey)
    onSelectedChange(allOnPageSelected ? selected.filter((s) => !ids.includes(s)) : [...new Set([...selected, ...ids])])
  }

  const toggleOne = (id: string) => {
    if (!onSelectedChange) return
    onSelectedChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }

  const toggleSort = (key: string) => {
    setSort((s) =>
      s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null,
    )
  }

  // Keyboard navigation (V0-UIR-004): arrows move, Enter opens, Space selects.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!pageRows.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx((i) => Math.min(i + 1, pageRows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && focusIdx >= 0) {
      e.preventDefault()
      onRowClick?.(pageRows[focusIdx])
    } else if (e.key === ' ' && focusIdx >= 0 && selectable) {
      e.preventDefault()
      toggleOne(rowKey(pageRows[focusIdx]))
    }
  }

  return (
    // Deliberately not the `.card` utility: that carries 24px of padding, which
    // inset the grid from its own card — the header band stopped short of the
    // edges and 48px of width was lost, which was enough to push a grid that
    // otherwise fits into a horizontal scrollbar. The table brings its own
    // gutters, so the card here is border + radius + surface only.
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card',
        className,
      )}
    >
      {/* Toolbar ------------------------------------------------------------ */}
      {(searchable || toolbar || onRefresh || onExport || filterPanel) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          {searchable && (
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder={searchPlaceholder}
              sizeVariant="sm"
              containerClassName="w-56"
            />
          )}
          {filterPanel}
          <div className="ml-auto flex items-center gap-1.5">
            {toolbar}
            <Menu
              trigger={
                <Button variant="ghost" size="icon-sm" title="Choose columns">
                  <Columns3 className="h-4 w-4" />
                </Button>
              }
              align="right"
            >
              <div className="min-w-[200px] px-1 py-1">
                <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Columns
                </p>
                {columns.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-3"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-brand-600"
                      checked={!hidden.has(c.key)}
                      onChange={() =>
                        setHidden((h) => {
                          const n = new Set(h)
                          n.has(c.key) ? n.delete(c.key) : n.add(c.key)
                          return n
                        })
                      }
                    />
                    <span className="truncate">{typeof c.header === 'string' ? c.header : c.key}</span>
                  </label>
                ))}
              </div>
            </Menu>
            {onExport && (
              <Menu
                trigger={
                  <Button variant="ghost" size="icon-sm" title="Export">
                    <Download className="h-4 w-4" />
                  </Button>
                }
                align="right"
                items={[
                  { label: 'Export to Excel (.xlsx)', onClick: () => onExport('xlsx') },
                  { label: 'Export to CSV', onClick: () => onExport('csv') },
                  { label: 'Export to PDF', onClick: () => onExport('pdf') },
                ]}
              />
            )}
            {onRefresh && (
              <Button variant="ghost" size="icon-sm" onClick={onRefresh} title="Refresh">
                <RotateCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Applied filter chips ----------------------------------------------- */}
      {filterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-2 px-3 py-1.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Applied</span>
          {filterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-2xs text-fg"
            >
              <span className="text-fg-muted">{chip.label}:</span> {chip.value}
              <button
                onClick={chip.onRemove}
                className="rounded-full p-0.5 hover:bg-surface-3"
                aria-label={`Remove ${chip.label} filter`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {onClearFilters && (
            <button onClick={onClearFilters} className="ml-1 text-2xs text-brand-600 hover:underline">
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Table -------------------------------------------------------------- */}
      <div
        ref={tableRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        // Scrolls on both axes, always.
        //
        // Vertically: without it, a grid given a bounded height (a page that
        // fills the viewport) let its rows spill straight out of the scroll box
        // and paint over the pagination footer.
        //
        // Horizontally: `xl:overflow-x-visible` meant that on a desktop a table
        // wider than its card was not scrolled but simply clipped by the card's
        // own `overflow-hidden` — the last columns were cut off mid-word with no
        // way to reach them. A scrollbar on a wide grid beats unreachable data.
        className="min-h-0 flex-1 overflow-auto focus:outline-none"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table
          className={cn(
            'grid-table w-full xl:table-fixed',
            density === 'comfortable' && 'grid-table--comfortable',
          )}
        >
          <thead>
            <tr>
              {selectable && (
                <th className="w-9 px-3">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all rows on this page"
                  />
                </th>
              )}
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.sticky && 'sticky left-0 z-20 bg-surface-2',
                    c.sortable && 'cursor-pointer select-none hover:text-fg',
                  )}
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                >
                  <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                    {c.header}
                    {c.sortable &&
                      (sort?.key === c.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="h-3 w-3 text-brand-600" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-brand-600" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      ))}
                  </span>
                </th>
              ))}
              {rowActions && <th className="col-sticky-right" style={{ width: '148px', textAlign: 'right' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {selectable && <td><Skeleton className="h-3.5 w-3.5" /></td>}
                  {visibleColumns.map((c) => (
                    <td key={c.key}><Skeleton className="h-3.5" /></td>
                  ))}
                  {rowActions && <td />}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}>
                  <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const id = rowKey(row)
                const isSelected = selected.includes(id)
                return (
                  <tr
                    key={id}
                    data-selected={isSelected}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      onRowClick && 'cursor-pointer',
                      dense && '[&>td]:py-1',
                      focusIdx === i && 'ring-1 ring-inset ring-brand-500',
                      rowClassName?.(row),
                    )}
                  >
                    {selectable && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                          checked={isSelected}
                          onChange={() => toggleOne(id)}
                          aria-label="Select row"
                        />
                      </td>
                    )}
                    {visibleColumns.map((c) => (
                      <td
                        key={c.key}
                        title={c.className?.includes('col-flex') ? undefined : (c.render ? undefined : String(valueOf(row, c) ?? ''))}
                        className={cn(
                          c.align === 'right' && 'text-right tabular',
                          c.align === 'center' && 'text-center',
                          c.sticky && 'sticky left-0 z-10 bg-surface',
                          c.className,
                        )}
                        style={c.className?.includes('col-flex') ? { overflow: 'visible', whiteSpace: 'normal' } : undefined}
                      >
                        {c.render ? c.render(row, i) : (valueOf(row, c) ?? '—')}
                      </td>
                    ))}
                    {rowActions && (
                      <td onClick={(e) => e.stopPropagation()} className="col-sticky-right col-flex" style={{ textAlign: 'right' }}>
                        <RowActionCell actions={rowActions(row)} />
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar ---------------------------------------------------- */}
      {selectable && selected.length > 0 && (
        <div className="flex items-center gap-3 border-t border-border bg-brand-500/5 px-3 py-2">
          <span className="text-xs font-medium text-fg">
            {selected.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-1.5">{bulkActions}</div>
          <button
            onClick={() => onSelectedChange?.([])}
            className="ml-auto inline-flex items-center gap-1 text-2xs text-fg-muted hover:text-fg"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}

      {/* Pagination --------------------------------------------------------- */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
          <p className="text-2xs text-fg-muted">
            Showing{' '}
            <span className="font-medium text-fg tabular">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
            </span>{' '}
            of <span className="font-medium text-fg tabular">{total.toLocaleString('en-IN')}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageNumbers(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`e${i}`} className="px-1 text-2xs text-fg-subtle">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={cn(
                    'h-9 min-w-[2.25rem] rounded-lg px-2 text-xs tabular transition-colors',
                    p === page ? 'bg-brand-600 font-medium text-white' : 'text-fg-muted hover:bg-surface-3',
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RowActionCell({ actions }: { actions: ReactNode }) {
  const all = flattenActions(actions)

  if (all.length <= 3) {
    return (
      <div className="flex items-center justify-end gap-0.5">
        {all.map((action, i) => {
          const isView = /^view\b|^open\b/i.test(labelOf(action))
          const isEdit = /^edit\b/i.test(labelOf(action))
          const isDelete = /^delete\b/i.test(labelOf(action))
          const isDanger = action.props.danger
          let icon = action.props.icon
          if (icon) {
            icon = cloneElement(icon as any, { className: 'h-3.5 w-3.5' })
          } else {
            icon = isView ? <Eye className="h-3.5 w-3.5" /> : (isEdit ? <Pencil className="h-3.5 w-3.5" /> : (isDelete ? <Trash2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />))
          }
          return <RowActionButton key={i} action={action} icon={icon} danger={isDanger} />
        })}
      </div>
    )
  }

  const { view, edit, destructive, isDelete, rest } = splitActions(actions)
  return (
    <div className="flex items-center justify-end gap-0.5">
      {view && (
        <RowActionButton
          action={view}
          icon={view.props.icon ? cloneElement(view.props.icon as any, { className: 'h-3.5 w-3.5' }) : <Eye className="h-3.5 w-3.5" />}
        />
      )}
      {edit && (
        <RowActionButton
          action={edit}
          icon={edit.props.icon ? cloneElement(edit.props.icon as any, { className: 'h-3.5 w-3.5' }) : <Pencil className="h-3.5 w-3.5" />}
        />
      )}
      {destructive && (
        <RowActionButton
          action={destructive}
          icon={destructive.props.icon ? cloneElement(destructive.props.icon as any, { className: 'h-3.5 w-3.5' }) : (isDelete ? <Trash2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />)}
          danger
        />
      )}

    </div>
  )
}

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}
