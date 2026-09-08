
from pydantic import BaseModel, ConfigDict, Field


class DocumentTypeBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    description: str | None = Field(None, max_length=500)
    retentionRule: str | None = Field(None, max_length=150)
    isVersioned: bool = False
    sortOrder: int = 0
    isActive: bool = True


class DocumentTypeWrite(DocumentTypeBase):
    """Create/update payload. `code` is immutable once documents reference it."""


class DocumentTypeSchema(DocumentTypeBase):
    model_config = ConfigDict(from_attributes=True)

    uid: str
    inUseCount: int = 0
