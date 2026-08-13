"""Multi-company tenant-isolation and RBAC tests (CLAUDE.md §8, §4.3, §5.4)."""

from __future__ import annotations

from httpx import AsyncClient

API = "/api/v1"


async def _branch(client: AsyncClient, headers, code: str) -> dict:
    r = await client.post(f"{API}/branches", json={"code": code, "name": code}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ─────────────────────────── Tenant isolation ───────────────────────────────
async def test_1_user_sees_only_own_company_branches(client, world, login) -> None:
    ha = await login(world.admin_a, world.password, world.company_a_uid)
    hb = await login(world.admin_b, world.password, world.company_b_uid)
    await _branch(client, ha, "A1")
    await _branch(client, hb, "B1")

    la = await client.get(f"{API}/branches", headers=ha)
    codes_a = {r["code"] for r in la.json()["data"]}
    assert codes_a == {"A1"}  # Test 4: only company A branches

    lb = await client.get(f"{API}/branches", headers=hb)
    codes_b = {r["code"] for r in lb.json()["data"]}
    assert codes_b == {"B1"}


async def test_2_cross_company_record_is_not_found(client, world, login) -> None:
    ha = await login(world.admin_a, world.password, world.company_a_uid)
    hb = await login(world.admin_b, world.password, world.company_b_uid)
    b_branch = await _branch(client, hb, "SECRET")

    # User A tries to read company B's branch → 404 (indistinguishable from absent)
    resp = await client.get(f"{API}/branches/{b_branch['uid']}", headers=ha)
    assert resp.status_code == 404


async def test_3_cannot_reference_other_company_via_login_company(client, world, login) -> None:
    # A user may only obtain a context for a company in their allow-list.
    resp = await client.post(
        f"{API}/auth/login",
        json={
            "login_id": world.admin_a,
            "password": world.password,
            "company_uid": world.company_b_uid,
        },
    )
    assert resp.status_code == 403  # A cannot sign into company B


async def test_5_context_scopes_reads_to_active_company(client, world, login) -> None:
    ha = await login(world.admin_a, world.password, world.company_a_uid)
    hb = await login(world.admin_b, world.password, world.company_b_uid)
    b_branch = await _branch(client, hb, "ONLYB")
    # Even a valid uid from company B cannot be updated from company A's context.
    resp = await client.patch(
        f"{API}/branches/{b_branch['uid']}", json={"version": 1, "name": "hijack"}, headers=ha
    )
    assert resp.status_code == 404


# ─────────────────────────── RBAC ───────────────────────────────────────────
async def test_viewer_can_read_but_not_write(client, world, login) -> None:
    hv = await login(world.viewer_a, world.password, world.company_a_uid)

    assert (await client.get(f"{API}/branches", headers=hv)).status_code == 200  # VIEW ok

    create = await client.post(f"{API}/branches", json={"code": "NO", "name": "no"}, headers=hv)
    assert create.status_code == 403  # CREATE denied
    assert create.json()["type"].endswith("/forbidden")


async def test_noperm_user_forbidden_on_view(client, world, login) -> None:
    hn = await login(world.noperm_a, world.password, world.company_a_uid)
    resp = await client.get(f"{API}/branches", headers=hn)
    assert resp.status_code == 403


async def test_admin_has_full_crud(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    b = await _branch(client, h, "FULL")
    uid = b["uid"]
    assert (
        await client.patch(f"{API}/branches/{uid}", json={"version": 1, "name": "x"}, headers=h)
    ).status_code == 200
    assert (
        await client.post(f"{API}/branches/{uid}/deactivate", json={"version": 2}, headers=h)
    ).status_code == 200
    assert (await client.post(f"{API}/branches/{uid}/restore", headers=h)).status_code == 200
