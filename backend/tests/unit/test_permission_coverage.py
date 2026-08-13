"""Every mutating/reading Organisation endpoint MUST declare a permission
(CLAUDE.md §5.4: an endpoint with no declared permission fails CI). This test is
that CI gate. It needs no database."""

from __future__ import annotations

from fastapi.routing import APIRoute

from app.main import app

# Endpoints that are intentionally not permission-gated (authentication itself,
# health). Everything else under /api/v1 must carry a `require(...)` dependency.
_EXEMPT_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/me",  # gated by authentication (get_context) rather than a permission
    "/health",
}


def _has_permission_dep(route: APIRoute) -> bool:
    """True if any dependency in the route's tree is the `require(...)` closure."""
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        call = getattr(dep, "call", None)
        if (
            call is not None
            and getattr(call, "__name__", "") == "_dep"
            and getattr(call, "__module__", "") == "app.core.deps"
        ):
            return True
        stack.extend(dep.dependencies)
    return False


def test_every_org_endpoint_declares_a_permission() -> None:
    offenders: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if not route.path.startswith("/api/v1"):
            continue
        if route.path in _EXEMPT_PATHS:
            continue
        if not _has_permission_dep(route):
            offenders.append(f"{sorted(route.methods)} {route.path}")
    assert not offenders, "Endpoints without a declared permission: " + "; ".join(offenders)
