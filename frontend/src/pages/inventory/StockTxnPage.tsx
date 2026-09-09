import { useMemo, useState } from 'react'
import { Eye, Pencil, MoreHorizontal, Trash2, Send, Ban } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { formatDate } from '@/lib/format'
import { InvTxnListPage } from '@/components/inventory/InvTxnListPage'
import { InvTxnFormModal } from '@/components/inventory/InvTxnFormModal'
import { InvTxnViewModal } from '@/components/inventory/InvTxnViewModal'
import { ConfirmDialog } from '@/components/inventory/ConfirmDialog'
import {
  useStockTxns,
  useStockTxnDetails,
  useCreateStockTxn,
  useUpdateStockTxn,
  useDeleteStockTxn,
  usePostStockTxn,
  useCancelStockTxn,
} from '@/hooks/useStockTxn'
import type { StockTxn } from '@/api/stockTxn'

type TxnType = 'STOCK_OUT' | 'STOCK_RETURN' | 'STOCK_TRANSFER' | 'ADJUSTMENT'

export interface StockTxnPageConfig {
  txnType: TxnType
  title: string
  description: string
  /** Heading for the counterparty column: department for an issue, source
   *  document for a return, destination store for a transfer. */
  partyHeader: string
  partyValue: (t: StockTxn) => string
  newLabel: string
}

function statusTone(status?: string) {
  if (status === 'POSTED') return 'success' as const
  if (status === 'CANCELLED') return 'danger' as const
  return 'warning' as const
}

/**
 * One list/new/view/edit/delete screen, shared by Stock Out, Stock Return and
 * Stock Transfer.
 *
 * The important part is how View and Edit get their data. They take the row's
 * `uid` and nothing else, then fetch the whole document — header and lines —
 * from `GET /inventory/stock-transactions/{uid}`. The list row is only ever a
 * pointer. The screens this replaces passed the list row itself into the modal,
 * so both actions rendered whatever the list happened to hold rather than the
 * record the user clicked.
 */
export function StockTxnPage({ config }: { config: StockTxnPageConfig }) {
  const toast = useToast()

  const [filters, setFilters] = useState({ date_from: '', date_to: '', warehouse: '', search: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [viewUid, setViewUid] = useState<string | null>(null)
  const [editUid, setEditUid] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<
    { kind: 'delete' | 'cancel'; txn: StockTxn } | null
  >(null)

  const listQ = useStockTxns({ txn_type: config.txnType, ...filters })
  const rows = listQ.data ?? []

  // View and Edit each fetch the record by id. `enabled` is driven by the uid,
  // so nothing is requested until a row is actually chosen.
  const viewQ = useStockTxnDetails(viewUid ?? undefined)
  const editQ = useStockTxnDetails(editUid ?? undefined)

  const create = useCreateStockTxn()
  const update = useUpdateStockTxn()
  const remove = useDeleteStockTxn()
  const post = usePostStockTxn()
  const cancel = useCancelStockTxn()

  function reportError(fallback: string, e: unknown) {
    if (e instanceof ProblemError) {
      toast.error(e.problem.title || fallback, e.problem.detail)
    } else {
      toast.error(fallback, e instanceof Error ? e.message : 'Unexpected error.')
    }
  }

  /** Save the document, then post it. A failed post leaves the draft intact so
   *  the user can correct it rather than losing everything they typed. */
  async function handleSave(data: StockTxn) {
    try {
      const saved = editUid
        ? await update.mutateAsync({ uid: editUid, body: data })
        : await create.mutateAsync(data)

      const uid = saved.uid as string
      if (data.status === 'DRAFT') {
        toast.success('Saved', `${saved.document_no ?? 'Draft'} saved.`)
      } else {
        const posted = await post.mutateAsync(uid)
        toast.success('Posted', `${posted.document_no} posted to stock.`)
      }
      setFormOpen(false)
      setEditUid(null)
      listQ.refetch()
    } catch (e) {
      reportError('Could not save this transaction', e)
      throw e
    }
  }

  async function runConfirm() {
    if (!confirm) return
    const { kind, txn } = confirm
    try {
      if (kind === 'delete') {
        await remove.mutateAsync(txn.uid as string)
        toast.success('Deleted', `Draft ${txn.document_no ?? ''} removed.`)
      } else {
        await cancel.mutateAsync(txn.uid as string)
        toast.success('Cancelled', `${txn.document_no} cancelled and reversed.`)
      }
      setConfirm(null)
      listQ.refetch()
    } catch (e) {
      reportError(kind === 'delete' ? 'Could not delete' : 'Could not cancel', e)
      setConfirm(null)
    }
  }

  const columns = useMemo(
    () => [
      {
        accessor: 'sno',
        header: 'S.No',
        width: '70px',
        align: 'center' as const,
        render: (_r: StockTxn, i: number) => <span className="tabular-nums text-fg-subtle">{i + 1}</span>,
      },
      {
        accessor: 'document_no',
        header: 'Document No',
        width: '190px',
        render: (r: StockTxn) => (
          <span className="font-mono text-[13px] font-semibold text-brand-600">
            {r.document_no ?? '—'}
          </span>
        ),
      },
      {
        accessor: 'txn_date',
        header: 'Date',
        width: '130px',
        render: (r: StockTxn) => formatDate(r.txn_date),
      },
      {
        accessor: 'warehouse',
        header: 'Store',
        width: '200px',
        render: (r: StockTxn) => r.src_warehouse_name ?? r.src_warehouse_code ?? '—',
      },
      {
        accessor: 'party',
        header: config.partyHeader,
        width: '200px',
        render: (r: StockTxn) => config.partyValue(r) || '—',
      },
      {
        accessor: 'items',
        header: 'Items',
        width: '90px',
        align: 'right' as const,
        render: (r: StockTxn) => <span className="tabular-nums">{r.lines?.length ?? 0}</span>,
      },
      {
        accessor: 'qty',
        header: 'Total Qty',
        width: '120px',
        align: 'right' as const,
        render: (r: StockTxn) => (
          <span className="tabular-nums">
            {(r.lines ?? []).reduce((s, l) => s + Number(l.quantity || 0), 0).toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        accessor: 'grand_total',
        header: 'Total Value',
        width: '140px',
        align: 'right' as const,
        render: (r: StockTxn) => (
          <span className="tabular-nums font-medium">
            {new Intl.NumberFormat('en-IN', {
              style: 'currency',
              currency: 'INR',
              maximumFractionDigits: 2,
            }).format(Number(r.grand_total || 0))}
          </span>
        ),
      },
      {
        accessor: 'status',
        header: 'Status',
        width: '120px',
        align: 'center' as const,
        render: (r: StockTxn) => (
          <Badge tone={statusTone(r.status)} size="sm">
            {r.status ?? 'DRAFT'}
          </Badge>
        ),
      },
      {
        accessor: 'actions',
        header: 'Actions',
        width: '120px',
        align: 'center' as const,
        render: (r: StockTxn) => {
          const isDraft = (r.status ?? 'DRAFT') === 'DRAFT'
          const isPosted = r.status === 'POSTED'
          return (
            <div className="flex items-center justify-center gap-0.5">
              <IconButton
                icon={Eye}
                variant="ghost"
                size="sm"
                title="View"
                aria-label={`View ${r.document_no ?? 'transaction'}`}
                onClick={() => setViewUid(r.uid as string)}
              />
              <IconButton
                icon={Pencil}
                variant="ghost"
                size="sm"
                title={isDraft ? 'Edit' : 'Posted transactions cannot be edited'}
                aria-label={`Edit ${r.document_no ?? 'transaction'}`}
                disabled={!isDraft}
                onClick={() => {
                  setEditUid(r.uid as string)
                  setFormOpen(true)
                }}
              />
              <Menu
                trigger={
                  <IconButton
                    icon={MoreHorizontal}
                    variant="ghost"
                    size="sm"
                    title="More actions"
                    aria-label="More actions"
                  />
                }
              >
                {isDraft && (
                  <MenuItem
                    label="Post to stock"
                    icon={<Send />}
                    onClick={async () => {
                      try {
                        const p = await post.mutateAsync(r.uid as string)
                        toast.success('Posted', `${p.document_no} posted to stock.`)
                        listQ.refetch()
                      } catch (e) {
                        reportError('Could not post', e)
                      }
                    }}
                  />
                )}
                {isDraft && (
                  <MenuItem
                    label="Delete draft"
                    icon={<Trash2 />}
                    danger
                    onClick={() => setConfirm({ kind: 'delete', txn: r })}
                  />
                )}
                {isPosted && (
                  <MenuItem
                    label="Cancel & reverse"
                    icon={<Ban />}
                    danger
                    onClick={() => setConfirm({ kind: 'cancel', txn: r })}
                  />
                )}
                {!isDraft && !isPosted && (
                  <MenuItem label="No actions available" disabled onClick={() => {}} />
                )}
              </Menu>
            </div>
          )
        },
      },
    ],
    [config, listQ, post, toast],
  )

  return (
    <>
      <InvTxnListPage
        title={config.title}
        description={config.description}
        rows={rows}
        columns={columns}
        loading={listQ.isLoading}
        onSearch={setFilters}
        onNew={() => {
          setEditUid(null)
          setFormOpen(true)
        }}
        actionLabel={config.newLabel}
      />

      {/* New, or Edit once the record has arrived — never a half-populated form. */}
      {formOpen && (!editUid || editQ.data) && (
        <InvTxnFormModal
          isOpen
          txnType={config.txnType}
          initialData={editUid ? editQ.data : null}
          loading={create.isPending || update.isPending || post.isPending}
          onPost={handleSave}
          onClose={() => {
            setFormOpen(false)
            setEditUid(null)
          }}
        />
      )}

      {viewUid && (
        <InvTxnViewModal
          isOpen
          txn={viewQ.data ?? null}
          loading={viewQ.isLoading}
          onClose={() => setViewUid(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        tone="danger"
        title={confirm?.kind === 'delete' ? 'Delete this draft?' : 'Cancel this transaction?'}
        message={
          confirm?.kind === 'delete'
            ? `Draft ${confirm?.txn.document_no ?? ''} will be permanently removed. It has not affected stock.`
            : `${confirm?.txn.document_no ?? ''} has already affected stock. Cancelling posts a reversing movement; the original document and its ledger entries are kept for audit.`
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Cancel transaction'}
        busy={remove.isPending || cancel.isPending}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}
