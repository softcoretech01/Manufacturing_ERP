"""Organisation API integration tests against real MySQL."""

from __future__ import annotations

from httpx import AsyncClient

API = "/api/v1"


async def _mk_branch(client: AsyncClient, headers, *, code: str, **extra) -> dict:
    body = {"code": code, "name": f"Branch {code}", "branch_type": "FACTORY", **extra}
    resp = await client.post(f"{API}/branches", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─────────────────────────── CRUD happy path ────────────────────────────────
async def test_branch_create_list_get_update(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)

    created = await _mk_branch(client, h, code="CHN")
    assert created["uid"] and created["version"] == 1
    assert "id" not in created and "company_id" not in created  # internal ids never exposed

    lst = await client.get(f"{API}/branches", headers=h)
    assert lst.status_code == 200
    body = lst.json()
    assert body["meta"]["total"] == 1
    assert body["data"][0]["code"] == "CHN"

    uid = created["uid"]
    got = await client.get(f"{API}/branches/{uid}", headers=h)
    assert got.status_code == 200 and got.json()["code"] == "CHN"

    upd = await client.patch(
        f"{API}/branches/{uid}", json={"version": 1, "name": "Chennai HO"}, headers=h
    )
    assert upd.status_code == 200
    assert upd.json()["name"] == "Chennai HO" and upd.json()["version"] == 2


async def test_duplicate_branch_code_rejected(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    await _mk_branch(client, h, code="DUP")
    resp = await client.post(f"{API}/branches", json={"code": "DUP", "name": "again"}, headers=h)
    assert resp.status_code == 409
    assert resp.json()["type"].endswith("/duplicate-record")


async def test_get_unknown_uid_is_404(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    resp = await client.get(f"{API}/branches/01JZZZZZZZZZZZZZZZZZZZZZZZ", headers=h)
    assert resp.status_code == 404


# ─────────────────────────── GSTIN validation ───────────────────────────────
async def test_gstin_valid(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    b = await _mk_branch(
        client,
        h,
        code="GST1",
        gstin="33AABCS1429B1ZP",
        gst_state_code="33",
        has_separate_gstin=True,
    )
    assert b["gstin"] == "33AABCS1429B1ZP"


async def test_gstin_state_mismatch_rejected(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    resp = await client.post(
        f"{API}/branches",
        json={"code": "GST2", "name": "x", "gstin": "29AABCS1429B1ZP", "gst_state_code": "33"},
        headers=h,
    )
    assert resp.status_code == 422
    assert resp.json().get("rule_code") == "V1-ORG-BR-009"


async def test_gstin_pan_mismatch_rejected(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    resp = await client.post(
        f"{API}/branches",
        json={"code": "GST3", "name": "x", "gstin": "33ZZZZZ9999Z1ZP", "gst_state_code": "33"},
        headers=h,
    )
    assert resp.status_code == 422
    assert resp.json().get("rule_code") == "V1-ORG-BR-005"


async def test_duplicate_gstin_across_branches_rejected(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    await _mk_branch(client, h, code="GA", gstin="33AABCS1429B1ZP", gst_state_code="33")
    resp = await client.post(
        f"{API}/branches",
        json={"code": "GB", "name": "y", "gstin": "33AABCS1429B1ZP", "gst_state_code": "33"},
        headers=h,
    )
    assert resp.status_code == 409 and resp.json().get("rule_code") == "V1-ORG-BR-008"


# ─────────────────────────── Optimistic locking ─────────────────────────────
async def test_optimistic_lock_conflict(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    b = await _mk_branch(client, h, code="LOCK")
    uid = b["uid"]
    ok = await client.patch(f"{API}/branches/{uid}", json={"version": 1, "name": "v2"}, headers=h)
    assert ok.status_code == 200 and ok.json()["version"] == 2

    stale = await client.patch(
        f"{API}/branches/{uid}", json={"version": 1, "name": "v3"}, headers=h
    )
    assert stale.status_code == 409
    assert stale.json()["type"].endswith("/concurrent-modification")


# ─────────────────────────── Deactivate + restore ───────────────────────────
async def test_deactivate_and_restore(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    b = await _mk_branch(client, h, code="SD")
    uid = b["uid"]

    de = await client.post(f"{API}/branches/{uid}/deactivate", json={"version": 1}, headers=h)
    assert de.status_code == 200 and de.json()["is_active"] is False

    # Deactivation flips is_active but keeps the row visible (it is NOT deleted),
    # so it can be seen and restored from the list.
    lst = await client.get(f"{API}/branches", headers=h)
    assert any(row["uid"] == uid for row in lst.json()["data"])
    got = await client.get(f"{API}/branches/{uid}", headers=h)
    assert got.status_code == 200 and got.json()["is_active"] is False

    re = await client.post(f"{API}/branches/{uid}/restore", headers=h)
    assert re.status_code == 200 and re.json()["is_active"] is True
    assert (await client.get(f"{API}/branches/{uid}", headers=h)).json()["is_active"] is True


# ─────────────────────────── Dependency guards ──────────────────────────────
async def test_company_deactivate_blocked_by_active_branch(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    await _mk_branch(client, h, code="HOLD")
    resp = await client.post(
        f"{API}/companies/{world.company_a_uid}/deactivate", json={"version": 1}, headers=h
    )
    assert resp.status_code == 409 and resp.json().get("rule_code") == "V1-ORG-BR-006"


async def test_branch_deactivate_blocked_by_active_plant(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    b = await _mk_branch(client, h, code="WP")
    plant = await client.post(
        f"{API}/plants", json={"branch_uid": b["uid"], "code": "P1", "name": "Plant 1"}, headers=h
    )
    assert plant.status_code == 201, plant.text
    resp = await client.post(
        f"{API}/branches/{b['uid']}/deactivate", json={"version": 1}, headers=h
    )
    assert resp.status_code == 409 and resp.json().get("rule_code") == "V1-ORG-BR-012"


# ─────────────────────────── Pagination + whitelist ─────────────────────────
async def test_pagination_and_sort_whitelist(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    for i in range(3):
        await _mk_branch(client, h, code=f"PG{i}")
    page = await client.get(f"{API}/branches?page=1&page_size=2&sort=-code", headers=h)
    assert page.status_code == 200
    meta = page.json()["meta"]
    assert meta["total"] == 3 and meta["page_size"] == 2 and meta["total_pages"] == 2

    bad = await client.get(f"{API}/branches?sort=drop_table", headers=h)
    assert bad.status_code == 400
    assert bad.json()["type"].endswith("/malformed-request")


# ─────────────────────────── Financial year ─────────────────────────────────
async def test_financial_year_periods_and_overlap(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    fy = await client.post(
        f"{API}/financial-years",
        json={
            "code": "FY25-26",
            "start_date": "2025-04-01",
            "end_date": "2026-03-31",
            "is_current": True,
        },
        headers=h,
    )
    assert fy.status_code == 201 and fy.json()["status"] == "OPEN"
    uid = fy.json()["uid"]

    periods = await client.get(f"{API}/financial-years/{uid}/periods", headers=h)
    assert periods.status_code == 200 and len(periods.json()) == 12

    overlap = await client.post(
        f"{API}/financial-years",
        json={"code": "FY25B", "start_date": "2025-06-01", "end_date": "2026-05-31"},
        headers=h,
    )
    assert overlap.status_code == 409 and overlap.json().get("rule_code") == "V1-ORG-BR-024"

    contiguous = await client.post(
        f"{API}/financial-years",
        json={"code": "FY26-27", "start_date": "2026-04-01", "end_date": "2027-03-31"},
        headers=h,
    )
    assert contiguous.status_code == 201


async def test_exchange_rate_missing_is_blocked_not_defaulted(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    resp = await client.get(
        f"{API}/exchange-rates/resolve?from_currency=USD&to_currency=INR&rate_type=AVERAGE&as_of=2026-01-01",
        headers=h,
    )
    assert resp.status_code == 409 and resp.json().get("rule_code") == "V1-ORG-FR-034"

    await client.post(
        f"{API}/exchange-rates",
        json={
            "from_currency_code": "USD",
            "to_currency_code": "INR",
            "rate": 84.5,
            "effective_date": "2025-12-01",
        },
        headers=h,
    )
    ok = await client.get(
        f"{API}/exchange-rates/resolve?from_currency=USD&to_currency=INR&rate_type=AVERAGE&as_of=2026-01-01",
        headers=h,
    )
    assert ok.status_code == 200 and float(ok.json()["rate"]) == 84.5


# ─────────────────────────── Currencies seeded ──────────────────────────────
async def test_currencies_seeded(client, world, login) -> None:
    h = await login(world.admin_a, world.password, world.company_a_uid)
    resp = await client.get(f"{API}/currencies", headers=h)
    assert resp.status_code == 200
    codes = {c["code"] for c in resp.json()}
    assert {"INR", "USD", "EUR"} <= codes


# ─────────────────────────── Unauthenticated ────────────────────────────────
async def test_unauthenticated_is_401(client, world) -> None:
    resp = await client.get(f"{API}/branches")
    assert resp.status_code == 401
    assert resp.json()["type"].endswith("/unauthenticated")
