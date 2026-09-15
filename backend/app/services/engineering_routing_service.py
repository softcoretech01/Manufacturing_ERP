"""Routing rules: revisions, status transitions, approval.

Three rules live here and nowhere else.

**A revision keeps the document number.** `create_routing` mints a number for a
genuinely new document; `create_revision` reuses the source document's number and
takes the next revision from the database. The client never chooses either.

**Status is the server's.** A client may move a routing between its own draft
states; ACTIVE and SUPERSEDED are reached only by `approve`, so no request can
publish a routing by putting `status: "ACTIVE"` in a payload.

**Approval is one transaction.** Superseding the previous revision, moving the
default flag and activating the new revision either all happen or none do.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    BusinessRuleViolationError,
    InvalidStateTransitionError,
    NotFoundError,
    ValidationFailedError,
)
from app.repositories.engineering_routing_repository import (
    LIVE_STATUSES,
    EngineeringRoutingRepository,
)
from app.schemas.engineering_routing import EngRoutingSchema

DRAFT = "DRAFT"
PENDING_APPROVAL = "PENDING_APPROVAL"
REJECTED = "REJECTED"
ACTIVE = "ACTIVE"
SUPERSEDED = "SUPERSEDED"

#: A client may save a routing in one of these. Anything else is the server's.
CLIENT_STATUSES = frozenset({DRAFT, PENDING_APPROVAL, REJECTED})

#: Where a routing may go next when a client saves it. A live or superseded
#: routing is not edited in place at all — it is revised.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    DRAFT: frozenset({DRAFT, PENDING_APPROVAL}),
    PENDING_APPROVAL: frozenset({PENDING_APPROVAL, DRAFT, REJECTED}),
    REJECTED: frozenset({REJECTED, DRAFT}),
}

#: Approval takes it from here.
APPROVABLE = frozenset({DRAFT, PENDING_APPROVAL})

RULE = "V5-RTG-BR"


class EngineeringRoutingService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repository = EngineeringRoutingRepository(session)

    # ── Reads ───────────────────────────────────────────────────────────────

    async def get_all_routings(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_routings()

    async def get_next_code(self) -> str:
        return await self.repository.get_next_code()

    # ── Creation ────────────────────────────────────────────────────────────

    async def create_routing(self, data: EngRoutingSchema, user: str) -> str:
        """A genuinely new routing document: new number, revision 1."""
        status = self._client_status(data.status)
        code = await self.repository.get_next_code()
        try:
            routing_id = await self.repository.insert_routing(
                route_code=code,
                revision=1,
                data=data,
                status=status,
                is_default=bool(data.isDefault),
                user=user,
            )
            await self.repository.replace_operations(routing_id, data.operations)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return str(routing_id)

    async def create_revision(self, uid: str, data: EngRoutingSchema, user: str) -> Dict[str, Any]:
        """The next revision of an existing document, under the same number.

        The revision number comes from the database, not the payload: the client
        cannot ask for R9 of a document on R3, and two people revising at once
        collide on `uk_engrouting_code_revision` rather than silently overwriting.
        """
        source = await self.repository.get_routing(uid)
        if source is None:
            raise NotFoundError("Routing not found.")
        if source["status"] not in LIVE_STATUSES:
            raise BusinessRuleViolationError(
                f"{source['docNo']} R{source['revision']} is {source['status']}, so there is "
                "nothing to revise. Revisions are taken from the live routing.",
                rule_code=f"{RULE}-001",
            )
        if not (data.changeReason or "").strip():
            raise ValidationFailedError(
                "A revision needs a reason.",
                errors=[{
                    "field": "changeReason",
                    "code": "required",
                    "message": "Say what changed and why.",
                }],
            )

        status = self._client_status(data.status)
        # The product belongs to the document, not to the payload.
        data.productCode = source["productCode"]
        data.productName = source["productName"]
        try:
            revision = await self.repository.next_revision_for(source["docNo"])
            routing_id = await self.repository.insert_routing(
                route_code=source["docNo"],
                revision=revision,
                data=data,
                status=status,
                # A draft revision never carries the default flag: the live
                # revision keeps it until this one is approved.
                is_default=False,
                user=user,
            )
            await self.repository.replace_operations(routing_id, data.operations)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return {"uid": str(routing_id), "docNo": source["docNo"], "revision": revision}

    # ── Editing ─────────────────────────────────────────────────────────────

    async def update_routing(self, uid: str, data: EngRoutingSchema, user: str) -> str:
        current = await self.repository.get_routing(uid)
        if current is None:
            raise NotFoundError("Routing not found.")

        if current["status"] in LIVE_STATUSES or current["status"] == SUPERSEDED:
            raise BusinessRuleViolationError(
                f"{current['docNo']} R{current['revision']} is {current['status']} and is not "
                "edited in place. Create the next revision instead.",
                rule_code=f"{RULE}-002",
            )

        target = self._client_status(data.status or current["status"])
        allowed = ALLOWED_TRANSITIONS.get(current["status"], frozenset())
        if target not in allowed:
            raise InvalidStateTransitionError(
                f"A {current['status']} routing cannot become {target}.",
                current_status=current["status"],
                allowed=sorted(allowed),
            )

        try:
            await self.repository.update_header(uid, data=data, status=target, user=user)
            await self.repository.replace_operations(int(uid), data.operations)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return uid

    async def delete_routing(self, uid: str, user: str) -> str:
        current = await self.repository.get_routing(uid)
        if current is None:
            raise NotFoundError("Routing not found.")
        try:
            await self.repository.soft_delete(uid, user)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return uid

    # ── Approval ────────────────────────────────────────────────────────────

    async def approve_routing(self, uid: str, approver: str) -> Dict[str, Any]:
        """Publish a revision, in one transaction.

        Supersede the document's live revision, take the default flag off the
        product's other live routings, then activate this one. The order matters:
        `uk_engrouting_default_per_product` permits exactly one live default per
        product at any instant, so the flag is cleared before it is set.
        """
        routing = await self.repository.get_routing(uid, lock=True)
        if routing is None:
            raise NotFoundError("Routing not found.")
        if routing["status"] not in APPROVABLE:
            raise InvalidStateTransitionError(
                f"{routing['docNo']} R{routing['revision']} is {routing['status']} and cannot be approved.",
                current_status=routing["status"],
                allowed=sorted(APPROVABLE),
            )

        try:
            superseded: List[str] = []
            for previous in await self.repository.live_revisions_of(
                routing["docNo"], exclude_id=int(uid)
            ):
                await self.repository.supersede(
                    int(previous["uid"]),
                    effective_to=routing["effectiveFrom"],
                    user=approver,
                )
                superseded.append(f"R{previous['revision']}")

            demoted = await self.repository.clear_default_for_product(
                routing["productCode"], exclude_id=int(uid), user=approver
            )
            await self.repository.activate(int(uid), approver=approver)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

        return {
            "uid": uid,
            "docNo": routing["docNo"],
            "revision": routing["revision"],
            "status": ACTIVE,
            "approvedBy": approver,
            "superseded": superseded,
            "defaultTakenFrom": demoted,
        }

    async def set_default_routing(self, uid: str, user: str) -> Dict[str, Any]:
        """Make a live routing the one the product is made to.

        The same transaction that clears the product's other live defaults sets
        this one, in that order — two live defaults would breach
        `uk_engrouting_default_per_product`, and a moment with none would leave
        costing without a routing.
        """
        routing = await self.repository.get_routing(uid, lock=True)
        if routing is None:
            raise NotFoundError("Routing not found.")
        if routing["status"] not in LIVE_STATUSES:
            raise BusinessRuleViolationError(
                f"{routing['docNo']} R{routing['revision']} is {routing['status']}. Only a live "
                "routing can be the default one.",
                rule_code=f"{RULE}-004",
            )

        try:
            demoted = await self.repository.clear_default_for_product(
                routing["productCode"], exclude_id=int(uid), user=user
            )
            await self.repository.set_default(int(uid), user=user)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return {"uid": uid, "docNo": routing["docNo"], "revision": routing["revision"], "defaultTakenFrom": demoted}

    # ── Helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _client_status(status: Optional[str]) -> str:
        """Reject any status only approval may set."""
        value = (status or DRAFT).upper()
        if value not in CLIENT_STATUSES:
            raise BusinessRuleViolationError(
                f"A routing cannot be saved as {value}. Approving it is what makes it "
                f"{ACTIVE}, and approving its successor is what makes it {SUPERSEDED}.",
                rule_code=f"{RULE}-003",
            )
        return value
