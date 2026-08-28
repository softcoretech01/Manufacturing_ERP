"""Read-only lookups that supply the Machine master's foreign keys.

The Machine form needs the real integer ids of MachineGroup / sys_plant /
ProductionLine / WorkCentre, plus a code and name to display. These shapes carry
exactly that and nothing else — they are dropdown sources, not editable masters.
"""

from typing import Optional

from pydantic import BaseModel


class MachineGroupLookup(BaseModel):
    id: int
    code: str
    name: str


class PlantLookup(BaseModel):
    id: int
    code: str
    name: str


class ProductionLineLookup(BaseModel):
    id: int
    code: str
    name: str
    plantId: int
    lineType: Optional[str] = None


class WorkCentreLookup(BaseModel):
    id: int
    code: str
    name: str
    plantId: int
    lineId: int
    type: Optional[str] = None
