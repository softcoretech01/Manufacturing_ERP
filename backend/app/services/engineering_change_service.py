from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.errors import BusinessRuleViolationError, InvalidStateTransitionError, NotFoundError
from app.repositories.engineering_change_apply_repository import EngineeringChangeApplyRepository
from app.repositories.engineering_change_repository import EngineeringChangeRepository
from app.services.engineering_change_lines import apply_change_lines

#: A change is applied once, and only after it has been approved.
APPLICABLE = frozenset({"APPROVED"})
RULE = "V5-ECN-BR"


class EngineeringChangeService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repository = EngineeringChangeRepository(session)
        self.apply_repository = EngineeringChangeApplyRepository(session)

    async def get_next_code(self, type_prefix: str) -> str:
        if type_prefix not in ["ECR", "ECN"]:
            type_prefix = "ECR"
        return await self.repository.get_next_code(type_prefix)

    async def _reload(self, uid: Optional[str]) -> Optional[Dict[str, Any]]:
        """Return the stored row.

        The INSERT/UPDATE branches of SpManageEngineeringChange return only the
        uid and document number, which does not satisfy the endpoint's response
        model — the write succeeded but the request came back as a 500. Reading
        the row back also means the caller sees server-applied defaults.
        """
        if not uid:
            return None
        rows = await self.repository.get_all_changes()
        return next((r for r in rows if str(r.get("uid")) == str(uid)), None)

    async def create_change(self, data: dict, user: str) -> Optional[dict]:
        if not data.get("docNo"):
            data["docNo"] = await self.get_next_code(data.get("changeType", "ECR"))
        created = await self.repository.create_change(data, user)
        uid = created.get("uid") if isinstance(created, dict) else created
        return await self._reload(uid) or created

    async def update_change(self, uid: str, data: dict, user: str) -> Optional[Dict[str, Any]]:
        await self.repository.update_change(uid, data, user)
        return await self._reload(uid)

    async def delete_change(self, uid: str, user: str) -> Optional[str]:
        return await self.repository.delete_change(uid, user)

    async def apply_change(self, uid: str, user: str) -> Dict[str, Any]:
        """Execute an approved change against the bills it names, in one transaction.

        For every bill the change touches: its live revision is superseded and the
        next revision of the *same* document number takes its place, carrying the
        product's default flag. The change is then closed as implemented.

        Either all of that happens or none of it does. A half-applied change is
        the worst outcome available — a bill superseded with no successor is a
        product that cannot be made.
        """
        change = await self.apply_repository.get_change(uid, lock=True)
        if change is None:
            raise NotFoundError("Engineering change not found.")
        if change["status"] not in APPLICABLE:
            raise InvalidStateTransitionError(
                f"{change['docNo']} is {change['status']}. Only an approved change can be applied.",
                current_status=change["status"],
                allowed=sorted(APPLICABLE),
            )

        instructions = await self.apply_repository.get_change_lines(change["uid"])
        if not instructions:
            raise BusinessRuleViolationError(
                f"{change['docNo']} carries no instructions, so there is nothing to apply.",
                rule_code=f"{RULE}-001",
            )

        by_document: Dict[str, List[Dict[str, Any]]] = {}
        for line in instructions:
            by_document.setdefault(line["bomDocNo"], []).append(line)

        produced: List[str] = []
        warnings: List[str] = []
        try:
            for doc_no, lines in by_document.items():
                base = await self.apply_repository.get_live_revision(doc_no, lock=True)
                if base is None:
                    warnings.append(f"{doc_no} has no live revision, so it was left alone.")
                    continue

                base_lines = await self.apply_repository.get_lines(base["id"])
                new_lines, line_warnings = apply_change_lines(base_lines, lines, doc_no)
                warnings.extend(line_warnings)

                revision = await self.apply_repository.next_revision_for(doc_no)
                # The previous revision steps down before the new one claims the
                # document number's place as the product's default.
                await self.apply_repository.supersede(
                    base["id"], effective_to=change["effectiveFrom"]
                )
                warnings.extend(
                    f"{other} was the product's default and is no longer."
                    for other in await self.apply_repository.clear_default_for_product(
                        base["productCode"], exclude_id=base["id"]
                    )
                )
                new_id = await self.apply_repository.insert_revision(
                    base=base,
                    revision=revision,
                    effective_from=change["effectiveFrom"],
                    source_ecn=change["docNo"],
                    change_reason=change["title"],
                    user=user,
                )
                await self.apply_repository.insert_lines(new_id, new_lines)
                produced.append(f"{doc_no} R{revision}")

            if not produced:
                raise BusinessRuleViolationError(
                    f"{change['docNo']} names no bill with a live revision, so nothing was applied.",
                    rule_code=f"{RULE}-002",
                )

            await self.apply_repository.mark_implemented(
                change["uid"], resulting=", ".join(produced), user=user
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

        return {
            "uid": change["uid"],
            "docNo": change["docNo"],
            "status": "IMPLEMENTED",
            "appliedBy": user,
            "resultingBom": produced,
            "warnings": warnings,
        }

    async def get_all_changes(self) -> List[Dict[str, Any]]:
        return await self.repository.get_all_changes()
