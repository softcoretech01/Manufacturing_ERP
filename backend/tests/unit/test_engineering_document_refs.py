"""Engineering documents must not lose the product they belong to.

Two of three live documents name a product the item master no longer has:
DOC-0002 -> ITM-0004 (soft-deleted by a data-quality pass) and
DOC-0004 -> ITM-0006 (only ever existed in the old item master). Both references
were valid when the documents were created.

The rule these tests pin down: editing an unrelated field must never change, blank
or default the product, and an invalid product must be refused rather than stored.
"""

from __future__ import annotations

import pytest

from app.services.engineering_document_service import (
    EngineeringDocumentService,
    UnknownDocumentTypeError,
    UnknownProductError,
)

TYPES = {"CAD_DRAWING", "MODEL_3D", "PDF_DRAWING", "IMAGE"}
PRODUCTS = {"FG-SS-750-BLK", "SF-BODY-750", "CON-GAS-ARG"}
ORPHAN = "ITM-0004"


class _StubTypeRepo:
    async def active_codes(self):
        return set(TYPES)


class _StubDocRepo:
    def __init__(self, stored=None):
        self.written: list[tuple[str, dict]] = []
        self._stored = stored or {
            "uid": "2", "code": "DOC-0002", "title": "sub",
            "docType": "MODEL_3D", "productCode": ORPHAN,
        }

    async def active_product_codes(self):
        return set(PRODUCTS)

    async def execute_sp(self, action, data, doc_id=None, user_id=None):
        self.written.append((action, dict(data)))
        return doc_id or 1

    async def get_document_by_id(self, doc_id):
        return dict(self._stored)


def _service(stored=None):
    repo = _StubDocRepo(stored)
    return EngineeringDocumentService(repo, _StubTypeRepo()), repo


VALID = {"docType": "CAD_DRAWING", "productCode": "FG-SS-750-BLK", "title": "Drawing"}


# ── 1-3: create validation ──────────────────────────────────────────────────

async def test_create_with_a_valid_product_succeeds():
    service, repo = _service()
    await service.create_document(dict(VALID), "tester")
    assert repo.written[0][0] == "INSERT"
    assert repo.written[0][1]["productCode"] == "FG-SS-750-BLK"


async def test_create_with_an_unknown_product_is_refused():
    service, repo = _service()
    with pytest.raises(UnknownProductError, match="NOPE"):
        await service.create_document({**VALID, "productCode": "NOPE"}, "t")
    assert repo.written == []


async def test_create_with_an_unknown_document_type_is_refused():
    service, repo = _service()
    with pytest.raises(UnknownDocumentTypeError):
        await service.create_document({**VALID, "docType": "BANANA"}, "t")
    assert repo.written == []


async def test_create_with_a_blank_product_is_refused():
    service, repo = _service()
    with pytest.raises(UnknownProductError):
        await service.create_document({**VALID, "productCode": "   "}, "t")
    assert repo.written == []


# ── 4-6: edit safety, the point of the exercise ─────────────────────────────

async def test_editing_a_title_keeps_the_product_on_a_valid_document():
    stored = {"uid": "1", "code": "DOC-0001", "docType": "CAD_DRAWING",
              "productCode": "FG-SS-750-BLK"}
    service, repo = _service(stored)
    await service.update_document(
        "1", {"docType": "CAD_DRAWING", "productCode": "FG-SS-750-BLK",
              "title": "Corrected title"}, "t")
    assert repo.written[0][1]["productCode"] == "FG-SS-750-BLK"


async def test_omitting_the_product_leaves_it_untouched():
    """The stored procedure COALESCEs a NULL product, so an omitted field is safe."""
    service, repo = _service()
    await service.update_document(
        "2", {"docType": "MODEL_3D", "title": "Corrected title"}, "t")
    action, sent = repo.written[0]
    assert "productCode" not in sent
    assert action == "UPDATE"


async def test_editing_an_orphan_document_preserves_its_product():
    """A title fix must go through, still pointing at the orphan.

    Refusing here would mean the typo cannot be corrected until someone makes a
    business decision about the product, and the likely response to that is
    picking a replacement at random -- the silent change of ownership this is
    meant to prevent. It must never be written as null, nor as the first
    dropdown entry.
    """
    service, repo = _service()
    await service.update_document(
        "2", {"docType": "MODEL_3D", "productCode": ORPHAN,
              "title": "Corrected title"}, "t")

    sent = repo.written[0][1]
    assert sent["productCode"] == ORPHAN
    assert sent["title"] == "Corrected title"


async def test_moving_an_orphan_document_to_another_invalid_product_is_refused():
    service, repo = _service()
    with pytest.raises(UnknownProductError) as err:
        await service.update_document(
            "2", {"docType": "MODEL_3D", "productCode": "ITM-9999"}, "t")
    assert err.value.existing is False
    assert repo.written == []


async def test_an_orphan_document_can_still_be_edited_without_touching_the_product():
    """Fixing a typo must not require resolving the orphan first."""
    service, repo = _service()
    await service.update_document("2", {"docType": "MODEL_3D", "title": "sub v2"}, "t")
    assert "productCode" not in repo.written[0][1]


async def test_explicitly_changing_the_product_works():
    service, repo = _service()
    await service.update_document(
        "2", {"docType": "MODEL_3D", "productCode": "SF-BODY-750"}, "t")
    assert repo.written[0][1]["productCode"] == "SF-BODY-750"


async def test_a_new_document_cannot_be_created_against_an_orphan_code():
    """Grandfathering applies to what is already stored, never to a new document."""
    service, repo = _service()
    with pytest.raises(UnknownProductError) as err:
        await service.create_document({**VALID, "productCode": ORPHAN}, "t")
    assert err.value.existing is False
    assert repo.written == []


# ── 7-8: what is stored is the key, never the label ─────────────────────────

async def test_the_stored_value_is_the_master_key_not_a_display_label():
    service, repo = _service()
    await service.create_document(
        {**VALID, "productCode": "FG-SS-750-BLK", "docType": "CAD_DRAWING"}, "t")
    sent = repo.written[0][1]
    assert sent["productCode"] == "FG-SS-750-BLK"
    assert sent["docType"] == "CAD_DRAWING"
    # the human-readable forms must never reach the write
    assert "Vacuum Flask" not in str(sent)
    assert "CAD drawing" not in str(sent)


async def test_a_display_label_submitted_as_a_code_is_refused():
    """If the UI ever sent the label instead of the key, the write must fail."""
    service, repo = _service()
    with pytest.raises(UnknownDocumentTypeError):
        await service.create_document({**VALID, "docType": "CAD drawing"}, "t")
    with pytest.raises(UnknownProductError):
        await service.create_document(
            {**VALID, "productCode": "Vacuum Flask 750 ml"}, "t")
    assert repo.written == []


async def test_surrounding_whitespace_is_trimmed_not_rejected():
    service, repo = _service()
    await service.create_document(
        {**VALID, "productCode": "  FG-SS-750-BLK  ", "docType": " CAD_DRAWING "}, "t")
    assert repo.written[0][1]["productCode"] == "FG-SS-750-BLK"
    assert repo.written[0][1]["docType"] == "CAD_DRAWING"


# ── 10: the valid document is unaffected ────────────────────────────────────

async def test_the_one_valid_document_still_saves():
    stored = {"uid": "1", "code": "DOC-0001", "docType": "CAD_DRAWING",
              "productCode": "FG-SS-750-BLK"}
    service, repo = _service(stored)
    await service.update_document(
        "1", {"docType": "CAD_DRAWING", "productCode": "FG-SS-750-BLK",
              "title": "Kumar", "status": "ACTIVE"}, "t")
    assert repo.written and repo.written[0][0] == "UPDATE"
