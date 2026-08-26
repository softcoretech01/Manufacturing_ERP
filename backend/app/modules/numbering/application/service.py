"""The numbering engine (SRS V1-NUM §3.4).

Config CRUD + the allocator. Allocation takes a `SELECT … FOR UPDATE` row lock on
the series counter inside the request transaction, so concurrent allocations get
distinct consecutive numbers and a rollback (gapless series) removes the
allocation. The SRS also specs a Redis distributed lock — needed only for
multi-worker deployments; the DB row lock is correct for the current
single-process backend. Flagged here rather than silently omitted.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date
from typing import Any, ClassVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import AllocateOn, AllocationStatus, ResetFrequency
from app.core.errors import (
    ConcurrentModificationError,
    ConfigurationError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.outbox import emit_event
from app.core.time import utcnow
from app.modules.numbering.domain import render
from app.modules.numbering.infrastructure.models import (
    CoreNumberAllocation,
    CoreNumberSeries,
)

_GST_CHARSET = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/-")


class NumberingService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx

    # ─── reads ───────────────────────────────────────────────────────────────
    def _scoped(self):
        return select(CoreNumberSeries).where(
            CoreNumberSeries.company_id == self.ctx.company_id,
            CoreNumberSeries.deleted_at.is_(None),
        )

    async def list_series(
        self, *, document_type: str | None = None, active_only: bool = False
    ) -> list[CoreNumberSeries]:
        stmt = self._scoped()
        if document_type:
            stmt = stmt.where(CoreNumberSeries.document_type == document_type)
        if active_only:
            stmt = stmt.where(CoreNumberSeries.is_active.is_(True))
        stmt = stmt.order_by(CoreNumberSeries.document_type, CoreNumberSeries.sub_type)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_or_404(self, uid: str) -> CoreNumberSeries:
        row: CoreNumberSeries | None = (
            await self.session.execute(self._scoped().where(CoreNumberSeries.uid == uid))
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Number series '{uid}' not found")
        return row

    def next_number(self, s: CoreNumberSeries) -> str:
        """The number the next allocation would render (for the list/preview)."""
        return render.render(
            s.format_string, s.current_number + s.increment_by, self._render_ctx(s)
        )

    # ─── validation (V1-NUM-BR-008/009, FR-002) ──────────────────────────────
    def _render_ctx(self, s: CoreNumberSeries, on_date: date | None = None) -> render.RenderContext:
        return render.RenderContext(
            prefix=s.prefix or "",
            branch=s.branch_code or "",
            plant=s.plant_code or "",
            fy=s.fy_code or "",
            sub_type=s.sub_type or "",
            on_date=on_date,
            padding_width=s.padding_width,
        )

    def _validate(self, d: dict[str, Any]) -> None:
        errors: list[dict[str, str]] = []
        fmt = d.get("format_string", "")
        if not render.has_sequence(fmt):
            errors.append(
                {"field": "format_string", "code": "no_seq",
                 "message": "Format must contain {SEQ} or every document would get the "
                            "same number."}
            )
        statutory = d.get("is_statutory", False)
        ctx = render.RenderContext(
            prefix=d.get("prefix") or "XX",
            branch=d.get("branch_code") or "HO",
            plant=d.get("plant_code") or "P1",
            fy=d.get("fy_code") or render.fy_code(date.today()),
            sub_type=d.get("sub_type") or "STD",
            padding_width=d.get("padding_width", 5),
        )
        if statutory:
            if not d.get("is_gapless"):
                errors.append({"field": "is_gapless", "code": "required",
                               "message": "A statutory series must be gapless (V1-NUM-BR-008)."})
            if d.get("allocate_on") != AllocateOn.APPROVAL.value:
                errors.append({"field": "allocate_on", "code": "invalid",
                               "message": "A statutory series must allocate on approval "
                                          "(V1-NUM-BR-008)."})
            # Worst case within the padding (widening only kicks in if allow_widen).
            max_seq = 10 ** d.get("padding_width", 5) - 1
            sample = render.render(fmt, max_seq, ctx)
            if len(sample) > 16:
                errors.append({"field": "format_string", "code": "too_long",
                               "message": f"Statutory number would be {len(sample)} chars — "
                                          "GST rule 46 caps invoice numbers at 16."})
            if any(c not in _GST_CHARSET for c in sample):
                errors.append({"field": "format_string", "code": "charset",
                               "message": "Statutory numbers may contain only letters, digits, "
                                          "hyphen and slash."})
        if errors:
            raise ValidationFailedError(f"{len(errors)} field(s) failed validation", errors=errors)

    # ─── writes ──────────────────────────────────────────────────────────────
    def _stamp_new(self, e: Any) -> None:
        now = utcnow()
        e.company_id = self.ctx.company_id
        e.created_at = now
        e.updated_at = now
        e.created_by = self.ctx.user_id
        e.updated_by = self.ctx.user_id
        e.version = 1

    async def create(self, d: dict[str, Any]) -> CoreNumberSeries:
        self._validate(d)
        series = CoreNumberSeries(
            **{k: v for k, v in d.items() if hasattr(CoreNumberSeries, k)},
        )
        # current_number starts one increment below start so the first allocation yields start.
        series.current_number = d.get("start_number", 1) - d.get("increment_by", 1)
        self._stamp_new(series)
        self.session.add(series)
        await self.session.flush()
        self._emit(series, "created")
        return series

    # Fields that cannot change once the series has issued a number (V1-NUM-BR-007).
    _LOCKED_AFTER_ISSUE: ClassVar[set[str]] = {
        "format_string", "prefix", "sub_type", "document_type", "is_statutory"
    }

    async def update(
        self, uid: str, d: dict[str, Any], *, expected_version: int
    ) -> CoreNumberSeries:
        series = await self.get_or_404(uid)
        if series.version != expected_version:
            raise ConcurrentModificationError(
                "Series was modified by another user.",
                extra={"current_version": series.version, "your_version": expected_version},
            )
        if series.issued_count > 0:
            for f in self._LOCKED_AFTER_ISSUE:
                if f in d and d[f] != getattr(series, f):
                    if f == "padding_width" and d[f] > series.padding_width:
                        continue  # widening is allowed
                    raise ValidationFailedError(
                        f"'{f}' cannot change on a series that has issued numbers. "
                        "Create a new series with a new validity window (V1-NUM-BR-007).",
                        errors=[{"field": f, "code": "locked",
                                 "message": "Locked after first issue"}],
                    )
        merged = {
            "format_string": series.format_string,
            "is_statutory": series.is_statutory,
            "is_gapless": series.is_gapless,
            "allocate_on": series.allocate_on,
            "prefix": series.prefix,
            "padding_width": series.padding_width,
            "sub_type": series.sub_type,
            **d,
        }
        self._validate(merged)
        for k, v in d.items():
            if hasattr(series, k) and k not in ("id", "uid", "current_number", "issued_count"):
                setattr(series, k, v)
        series.version += 1
        series.updated_at = utcnow()
        series.updated_by = self.ctx.user_id
        await self.session.flush()
        self._emit(series, "updated")
        return series

    async def set_active(self, uid: str, active: bool) -> CoreNumberSeries:
        series = await self.get_or_404(uid)
        series.is_active = active
        series.version += 1
        series.updated_at = utcnow()
        series.updated_by = self.ctx.user_id
        await self.session.flush()
        self._emit(series, "deactivated" if not active else "updated")
        return series

    async def delete(self, uid: str) -> None:
        series = await self.get_or_404(uid)
        if series.issued_count > 0:
            raise ValidationFailedError(
                "A series that has issued numbers cannot be deleted, only deactivated "
                "(V1-NUM-BR-010).",
                errors=[{"field": "series", "code": "in_use", "message": "Has issued numbers"}],
            )
        series.deleted_at = utcnow()
        series.deleted_by = self.ctx.user_id
        series.version += 1
        await self.session.flush()

    # ─── preview + simulate (FR-002, FR-008) ─────────────────────────────────
    def _issues(self, d: dict[str, Any]) -> list[dict[str, str]]:
        try:
            self._validate(d)
            return []
        except ValidationFailedError as e:
            return [{"severity": "ERROR", "message": x["message"]} for x in e.errors]

    async def preview(self, d: dict[str, Any], count: int = 3) -> dict[str, Any]:
        ctx = render.RenderContext(
            prefix=d.get("prefix") or "",
            branch=d.get("branch_code") or "HO",
            plant=d.get("plant_code") or "P1",
            fy=d.get("fy_code") or render.fy_code(date.today()),
            sub_type=d.get("sub_type") or "",
            padding_width=d.get("padding_width", 5),
        )
        start = d.get("start_number", 1)
        fmt = d.get("format_string", "")
        numbers = [render.render(fmt, start + i, ctx) for i in range(count)]
        return {
            "numbers": numbers,
            "max_length": render.max_length(fmt, ctx),
            "issues": self._issues(d),
        }

    async def simulate(
        self, *, document_type: str, sub_type: str | None,
        branch_code: str | None, plant_code: str | None, on_date: date | None,
    ) -> dict[str, Any]:
        on_date = on_date or date.today()
        series = await self.resolve_series(
            document_type=document_type, sub_type=sub_type,
            branch_id=None, plant_id=None, on_date=on_date,
        )
        if series is None:
            return {"matched": False,
                    "reason": f"No numbering series defined for {document_type}. "
                              "Document creation would be blocked."}
        ctx = self._render_ctx(series, on_date)
        if branch_code:
            ctx.branch = branch_code
        if plant_code:
            ctx.plant = plant_code
        ctx.fy = render.fy_code(on_date)
        seq = series.current_number + series.increment_by
        nxt = [render.render(series.format_string, seq + i, ctx) for i in range(5)]
        # FY-roll preview (RenderContext is a slots dataclass — copy via replace)
        roll_ctx = replace(ctx, fy=render.fy_code(date(on_date.year + 1, 4, 1)))
        roll = render.render(series.format_string, series.start_number, roll_ctx)
        return {
            "matched": True,
            "series_uid": series.uid,
            "series_label": series.document_label,
            "format": series.format_string,
            "next_numbers": nxt,
            "on_fy_roll": roll,
            "length": len(nxt[0]),
        }

    # ─── resolution + allocation (§3.4) ──────────────────────────────────────
    async def resolve_series(
        self, *, document_type: str, sub_type: str | None,
        branch_id: int | None, plant_id: int | None, on_date: date,
    ) -> CoreNumberSeries | None:
        rows = await self.list_series(document_type=document_type, active_only=True)
        candidates = [
            s for s in rows
            if (s.sub_type == sub_type or s.sub_type is None)
            and (s.scope_branch_id in (None, branch_id))
            and (s.plant_id in (None, plant_id))
            and (s.valid_from is None or s.valid_from <= on_date)
            and (s.valid_to is None or s.valid_to >= on_date)
        ]
        if not candidates:
            return None

        def specificity(s: CoreNumberSeries) -> int:
            return sum(
                1 for x in (s.sub_type, s.scope_branch_id, s.plant_id) if x is not None
            )

        candidates.sort(key=lambda s: (-specificity(s), 0 if s.is_default else 1))
        return candidates[0]

    @staticmethod
    def _reset_key(freq: str, d: date) -> str:
        if freq == ResetFrequency.NEVER.value:
            return "never"
        if freq == ResetFrequency.YEARLY.value:
            return f"{d.year}"
        if freq == ResetFrequency.FINANCIAL_YEARLY.value:
            return render.fy_code(d)
        if freq == ResetFrequency.MONTHLY.value:
            return f"{d.year}{d.month:02d}"
        if freq == ResetFrequency.DAILY.value:
            return f"{d.year}{d.month:02d}{d.day:02d}"
        return "never"

    async def allocate(
        self, *, document_type: str, sub_type: str | None = None,
        branch_id: int | None = None, plant_id: int | None = None,
        branch_code: str | None = None, plant_code: str | None = None,
        entity_type: str | None = None, entity_id: int | None = None,
        entity_label: str | None = None, on_date: date | None = None,
    ) -> dict[str, Any]:
        """Issue the next number for a document. Fails closed if no series matches
        (V1-NUM-BR-001). Returns the formatted number + allocation uid."""
        on_date = on_date or date.today()
        series = await self.resolve_series(
            document_type=document_type, sub_type=sub_type,
            branch_id=branch_id, plant_id=plant_id, on_date=on_date,
        )
        if series is None:
            suffix = f"/{sub_type}" if sub_type else ""
            raise ConfigurationError(
                f"No numbering series defined for {document_type}{suffix}. "
                "Configure one before creating this document."
            )
        # Row lock on the counter — atomic increment + gapless-within-transaction.
        locked = (
            await self.session.execute(
                select(CoreNumberSeries)
                .where(CoreNumberSeries.id == series.id)
                .with_for_update()
            )
        ).scalar_one()

        # FY/month/day reset roll (V1-NUM-FR-005)
        key = self._reset_key(locked.reset_frequency, on_date)
        last_key = (
            self._reset_key(locked.reset_frequency, locked.last_reset_on)
            if locked.last_reset_on
            else None
        )
        if key != "never" and last_key is not None and key != last_key:
            locked.current_number = locked.start_number - locked.increment_by
        if locked.last_reset_on is None or (key != "never" and key != last_key):
            locked.last_reset_on = on_date

        nxt = locked.current_number + locked.increment_by
        ctx = self._render_ctx(locked, on_date)
        if branch_code:
            ctx.branch = branch_code
        if plant_code:
            ctx.plant = plant_code
        ctx.fy = render.fy_code(on_date)
        # Padding overflow guard (V1-NUM-FR-006)
        if len(str(nxt)) > locked.padding_width and not locked.allow_widen:
            raise ValidationFailedError(
                f"Series '{locked.document_label}' has exhausted its {locked.padding_width}-digit "
                "sequence. Widen the padding or reset the series.",
                errors=[{"field": "sequence", "code": "exhausted", "message": "Padding overflow"}],
            )
        formatted = render.render(locked.format_string, nxt, ctx)

        locked.current_number = nxt
        locked.issued_count += 1
        locked.last_issued_at = utcnow()
        locked.version += 1
        locked.updated_at = utcnow()
        locked.updated_by = self.ctx.user_id

        alloc = CoreNumberAllocation(
            company_id=self.ctx.company_id,
            series_id=locked.id,
            document_type=document_type,
            sequence=nxt,
            formatted_number=formatted,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            status=(
                AllocationStatus.ALLOCATED.value
                if locked.allocate_on == AllocateOn.DRAFT.value
                else AllocationStatus.CONSUMED.value
            ),
            allocated_at=utcnow(),
            allocated_by=self.ctx.user_id,
            allocated_by_name=self.ctx.user_name,
        )
        self.session.add(alloc)
        await self.session.flush()
        emit_event(
            self.session, self.ctx,
            aggregate_type="numbering.allocation", aggregate_uid=alloc.uid,
            event_type="numbering.number.allocated",
            payload={"series_uid": locked.uid, "number": formatted, "sequence": nxt},
        )
        return {"number": formatted, "allocation_uid": alloc.uid, "sequence": nxt}

    async def void(self, *, formatted_number: str, reason: str) -> None:
        row = (
            await self.session.execute(
                select(CoreNumberAllocation).where(
                    CoreNumberAllocation.company_id == self.ctx.company_id,
                    CoreNumberAllocation.formatted_number == formatted_number,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Allocation '{formatted_number}' not found")
        if not reason or not reason.strip():
            raise ValidationFailedError(
                "A reason is required to void a number.",
                errors=[{"field": "reason", "code": "required", "message": "Give a reason"}],
            )
        row.status = AllocationStatus.VOIDED.value
        row.reason = reason
        await self.session.flush()
        emit_event(
            self.session, self.ctx,
            aggregate_type="numbering.allocation", aggregate_uid=row.uid,
            event_type="numbering.number.voided",
            payload={"number": formatted_number, "reason": reason},
        )

    # ─── reports ─────────────────────────────────────────────────────────────
    async def allocations(self, series_uid: str) -> list[CoreNumberAllocation]:
        series = await self.get_or_404(series_uid)
        rows = await self.session.execute(
            select(CoreNumberAllocation)
            .where(CoreNumberAllocation.series_id == series.id)
            .order_by(CoreNumberAllocation.sequence.desc())
            .limit(500)
        )
        return list(rows.scalars().all())

    async def gap_analysis(self, series_uid: str) -> dict[str, Any]:
        series = await self.get_or_404(series_uid)
        rows = list(
            (
                await self.session.execute(
                    select(CoreNumberAllocation.sequence, CoreNumberAllocation.status)
                    .where(CoreNumberAllocation.series_id == series.id)
                    .order_by(CoreNumberAllocation.sequence)
                )
            ).all()
        )
        seqs = [r[0] for r in rows]
        voided = [r[0] for r in rows if r[1] == AllocationStatus.VOIDED.value]
        gaps: list[int] = []
        if seqs:
            present = set(seqs)
            for n in range(min(seqs), max(seqs) + 1):
                if n not in present:
                    gaps.append(n)
        return {
            "issued": len(seqs),
            "range_from": min(seqs) if seqs else None,
            "range_to": max(seqs) if seqs else None,
            "gaps": gaps,
            "voided": voided,
            "unbroken": len(gaps) == 0,
        }

    async def exhaustion_warnings(self) -> list[dict[str, Any]]:
        out = []
        for s in await self.list_series(active_only=True):
            capacity = 10**s.padding_width
            used_pct = (s.current_number / capacity) if capacity else 0
            if used_pct >= 0.9:
                out.append(
                    {"uid": s.uid, "label": s.document_label,
                     "current": s.current_number, "capacity": capacity,
                     "used_pct": round(used_pct * 100, 1)}
                )
        return out

    # ─── events ──────────────────────────────────────────────────────────────
    def _emit(self, s: CoreNumberSeries, verb: str) -> None:
        emit_event(
            self.session, self.ctx,
            aggregate_type="numbering.series", aggregate_uid=s.uid,
            event_type=f"numbering.series.{verb}",
            payload={"series_uid": s.uid, "document_type": s.document_type},
        )
