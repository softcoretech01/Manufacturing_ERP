"""Document type is master data, and the write path must enforce it -- CLAUDE.md section 5.1.

Before this, `docType` was a bare VARCHAR with no validation anywhere: the React
page's hardcoded dropdown was the only thing keeping the column clean, so anything
posting to the API directly could write any string at all.
"""

from __future__ import annotations

import pytest

from app.services.engineering_document_service import (
    EngineeringDocumentService,
    UnknownDocumentTypeError,
)

SEEDED = {
    "CAD_DRAWING", "MODEL_3D", "PDF_DRAWING", "SOP", "WORK_INSTRUCTION",
    "CUSTOMER_SPEC", "CERTIFICATE", "DATASHEET", "IMAGE",
}


class _StubTypeRepo:
    def __init__(self, codes):
        self._codes = set(codes)
        self.calls = 0

    async def active_codes(self):
        self.calls += 1
        return self._codes


class _StubDocRepo:
    def __init__(self):
        self.written: list[tuple[str, dict]] = []

    async def execute_sp(self, action, data, doc_id=None, user_id=None):
        self.written.append((action, dict(data)))
        return 1

    async def get_document_by_id(self, doc_id):
        return {"uid": str(doc_id), "docType": "CAD_DRAWING"}


def _service(codes=SEEDED):
    docs, types = _StubDocRepo(), _StubTypeRepo(codes)
    return EngineeringDocumentService(docs, types), docs, types


# ── the rule ────────────────────────────────────────────────────────────────

async def test_a_seeded_type_is_accepted():
    service, docs, _ = _service()
    await service.create_document({"docType": "CAD_DRAWING", "title": "x"}, "tester")
    assert docs.written and docs.written[0][0] == "INSERT"


async def test_an_unknown_type_is_rejected_before_anything_is_written():
    service, docs, _ = _service()
    with pytest.raises(UnknownDocumentTypeError) as err:
        await service.create_document({"docType": "banana", "title": "x"}, "tester")

    assert "banana" in str(err.value)
    assert docs.written == []          # nothing reached the database


async def test_the_error_names_the_allowed_types():
    """A 422 that lists the valid codes is actionable; a bare 'invalid' is not."""
    service, _, _ = _service({"CAD_DRAWING", "SOP"})
    with pytest.raises(UnknownDocumentTypeError) as err:
        await service.create_document({"docType": "XX"}, "t")
    assert err.value.allowed == ["CAD_DRAWING", "SOP"]
    assert "CAD_DRAWING, SOP" in str(err.value)


async def test_update_is_validated_too():
    service, docs, _ = _service()
    with pytest.raises(UnknownDocumentTypeError):
        await service.update_document("1", {"docType": "banana"}, "t")
    assert docs.written == []


async def test_a_retired_type_can_no_longer_be_used():
    """Retiring a type in the master closes it for new documents."""
    service, _, _ = _service(SEEDED - {"IMAGE"})
    with pytest.raises(UnknownDocumentTypeError):
        await service.create_document({"docType": "IMAGE"}, "t")


async def test_a_newly_added_type_needs_no_code_change():
    """The point of the master: configuration, not a deploy."""
    service, docs, _ = _service(SEEDED | {"RISK_ASSESSMENT"})
    await service.create_document({"docType": "RISK_ASSESSMENT"}, "t")
    assert docs.written[0][1]["docType"] == "RISK_ASSESSMENT"


async def test_surrounding_whitespace_is_trimmed_not_rejected():
    service, docs, _ = _service()
    await service.create_document({"docType": "  SOP  "}, "t")
    assert docs.written[0][1]["docType"] == "SOP"


async def test_a_missing_type_is_rejected_rather_than_defaulted():
    """Silently defaulting would mislabel the document."""
    service, docs, _ = _service()
    with pytest.raises(UnknownDocumentTypeError):
        await service.create_document({"title": "no type"}, "t")
    assert docs.written == []


async def test_validation_is_skipped_when_no_type_repository_is_wired():
    """Keeps the service constructible in contexts that do not need the master."""
    from app.services.engineering_document_service import EngineeringDocumentService as S

    docs = _StubDocRepo()
    service = S(docs)
    await service.create_document({"docType": "anything"}, "t")
    assert docs.written[0][1]["docType"] == "anything"
