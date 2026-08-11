"""RFC 9457 problem+json error model (V0-IR-010, V0-IR-011)."""

from __future__ import annotations

from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

PROBLEM_BASE = "https://erp.ssb.local/problems"


class AppError(Exception):
    """Base for every error the application raises deliberately."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    problem_type: str = "application-error"
    title: str = "Application error"

    def __init__(
        self,
        detail: str,
        *,
        errors: list[dict[str, Any]] | None = None,
        rule_code: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.errors = errors or []
        self.rule_code = rule_code
        self.extra = extra or {}

    def to_problem(self, instance: str, correlation_id: str) -> dict[str, Any]:
        body: dict[str, Any] = {
            "type": f"{PROBLEM_BASE}/{self.problem_type}",
            "title": self.title,
            "status": self.status_code,
            "detail": self.detail,
            "instance": instance,
            "correlation_id": correlation_id,
        }
        if self.errors:
            body["errors"] = self.errors
        if self.rule_code:
            body["rule_code"] = self.rule_code
        body.update(self.extra)
        return body


class MalformedRequestError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    problem_type = "malformed-request"
    title = "Malformed request"


class UnauthenticatedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    problem_type = "unauthenticated"
    title = "Authentication required"


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    problem_type = "forbidden"
    title = "Forbidden"


class NotFoundError(AppError):
    """Also returned when a record exists but is outside the caller's scope (V0-IR-011)."""

    status_code = status.HTTP_404_NOT_FOUND
    problem_type = "not-found"
    title = "Not found"


class ConcurrentModificationError(AppError):
    status_code = status.HTTP_409_CONFLICT
    problem_type = "concurrent-modification"
    title = "Record was modified by another user"


class InvalidStateTransitionError(AppError):
    status_code = status.HTTP_409_CONFLICT
    problem_type = "invalid-state-transition"
    title = "Invalid state transition"

    def __init__(
        self,
        detail: str,
        *,
        current_status: str | None = None,
        allowed: list[str] | None = None,
        **kw: Any,
    ) -> None:
        extra = kw.pop("extra", {}) or {}
        if current_status:
            extra["current_status"] = current_status
        if allowed:
            extra["allowed_transitions"] = allowed
        super().__init__(detail, extra=extra, **kw)


class BusinessRuleViolationError(AppError):
    """Every business rejection carries a rule_code traceable to the SRS (V0-BR-015)."""

    status_code = status.HTTP_409_CONFLICT
    problem_type = "business-rule-violation"
    title = "Business rule violation"


class DuplicateError(AppError):
    status_code = status.HTTP_409_CONFLICT
    problem_type = "duplicate-record"
    title = "Duplicate record"


class IdempotencyKeyReuseError(AppError):
    status_code = status.HTTP_409_CONFLICT
    problem_type = "idempotency-key-reuse"
    title = "Idempotency key reused with a different payload"


class ValidationFailedError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    problem_type = "validation-failed"
    title = "Validation failed"


class RecordLockedError(AppError):
    status_code = status.HTTP_423_LOCKED
    problem_type = "record-locked"
    title = "Record locked"


class PreconditionRequiredError(AppError):
    status_code = status.HTTP_428_PRECONDITION_REQUIRED
    problem_type = "precondition-required"
    title = "If-Match header required"


class RateLimitedError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    problem_type = "rate-limited"
    title = "Too many requests"


class DependencyUnavailableError(AppError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    problem_type = "dependency-unavailable"
    title = "External dependency unavailable"


class ConfigurationError(AppError):
    """Missing configuration that an administrator must fix (e.g. no numbering series)."""

    status_code = status.HTTP_409_CONFLICT
    problem_type = "configuration-missing"
    title = "Configuration missing"


# ─────────────────────────── Handlers ────────────────────────────────────────


def _correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", "-")


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_problem(str(request.url.path), _correlation_id(request)),
        media_type="application/problem+json",
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {
            "field": ".".join(str(p) for p in err["loc"][1:]) or str(err["loc"][0]),
            "code": err["type"],
            "message": err["msg"],
        }
        for err in exc.errors()
    ]
    problem = ValidationFailedError(f"{len(errors)} field(s) failed validation", errors=errors)
    return JSONResponse(
        status_code=problem.status_code,
        content=problem.to_problem(str(request.url.path), _correlation_id(request)),
        media_type="application/problem+json",
    )


async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    msg = str(exc.orig) if exc.orig else str(exc)
    if "Duplicate entry" in msg:
        problem: AppError = DuplicateError("A record with these unique values already exists")
    elif "foreign key constraint" in msg.lower():
        problem = BusinessRuleViolationError(
            "Referenced record does not exist or is still referenced elsewhere",
            rule_code="V0-DR-011",
        )
    else:
        problem = BusinessRuleViolationError("Database constraint violated")
    return JSONResponse(
        status_code=problem.status_code,
        content=problem.to_problem(str(request.url.path), _correlation_id(request)),
        media_type="application/problem+json",
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    from app.core.logging import get_logger

    get_logger(__name__).exception(
        "unhandled_exception", path=str(request.url.path), correlation_id=_correlation_id(request)
    )
    return JSONResponse(
        status_code=500,
        content={
            "type": f"{PROBLEM_BASE}/internal-error",
            "title": "Internal server error",
            "status": 500,
            "detail": "An unexpected error occurred. Quote the correlation id to support.",
            "instance": str(request.url.path),
            "correlation_id": _correlation_id(request),
        },
        media_type="application/problem+json",
    )
