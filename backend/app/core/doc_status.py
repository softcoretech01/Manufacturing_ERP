"""Workflow → source-document status callback registry (CLAUDE.md §3.3).

When a workflow instance reaches a terminal decision (approved / rejected /
returned), the document that was submitted must reflect that outcome — e.g. a
Purchase Requisition flips from ``PENDING_APPROVAL`` to ``APPROVED``.

The workflow module must not import procurement (or any other module) directly
— dependency direction forbids it. Instead each module registers a *status
writer* here at startup, keyed by ``entity_type``. The engine calls
:func:`apply_workflow_decision` inside the same transaction as the approval, so
the document status and the workflow state commit together.

This is the synchronous in-process bridge used while the transactional-outbox
dispatcher is not yet running (see ``app/core/outbox.py``). When the async
dispatcher lands, the same writers can be driven from event handlers instead.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext

# (session, ctx, entity_uid, decision, comments) -> None
# ``decision`` is the terminal workflow status: "APPROVED" | "REJECTED" | "RETURNED".
StatusWriter = Callable[
    [AsyncSession, TenantContext, str, str, str | None], Awaitable[None]
]

_WRITERS: dict[str, StatusWriter] = {}


def register_status_writer(entity_type: str, writer: StatusWriter) -> None:
    """Register the callback that syncs ``entity_type`` documents on decision."""
    _WRITERS[entity_type] = writer


async def apply_workflow_decision(
    session: AsyncSession,
    ctx: TenantContext,
    *,
    entity_type: str,
    entity_uid: str,
    decision: str,
    comments: str | None = None,
) -> None:
    """Notify the source module of a terminal workflow decision, if it registered.

    No-op when no writer is registered for ``entity_type`` — the workflow still
    completes; only the source-document mirror is skipped.
    """
    writer = _WRITERS.get(entity_type)
    if writer is None:
        return
    await writer(session, ctx, entity_uid, decision, comments)
