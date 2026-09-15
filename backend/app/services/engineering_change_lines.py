"""What an engineering change does to a bill of material, as arithmetic.

Kept pure and separate from the database so the rules can be read and tested on
their own: given the lines of the live revision and the change's instructions,
produce the lines of the next revision plus anything the planner should know.

An instruction that cannot be carried out is a warning, not a failure. A change
that names a component the bill no longer carries has already been overtaken by
another change, and the rest of its instructions still have to land.
"""

from __future__ import annotations

from typing import Any, Dict, List, Sequence, Tuple

ADD = "ADD"
REMOVE = "REMOVE"
REPLACE = "REPLACE"
QTY_CHANGE = "QTY_CHANGE"


def _find(lines: List[Dict[str, Any]], item_code: str) -> Dict[str, Any] | None:
    return next((line for line in lines if line.get("itemCode") == item_code), None)


def apply_change_lines(
    base_lines: Sequence[Dict[str, Any]],
    instructions: Sequence[Dict[str, Any]],
    doc_no: str,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Apply every instruction in order and re-sequence the result.

    Returns the new line list and the warnings raised along the way. Sequence
    numbers are rebuilt from 1 so a printed bill has no gaps after a removal.
    """
    lines: List[Dict[str, Any]] = [dict(line) for line in base_lines]
    warnings: List[str] = []

    for change in instructions:
        action = (change.get("action") or "").upper()
        item_code = change.get("itemCode")
        target = _find(lines, item_code)

        if action == REMOVE:
            if target is None:
                warnings.append(f"{item_code} is not on {doc_no}; nothing to remove.")
                continue
            lines = [line for line in lines if line.get("itemCode") != item_code]

        elif action == REPLACE:
            if target is None:
                warnings.append(f"{item_code} is not on {doc_no}; nothing to replace.")
                continue
            new_qty = change.get("newQtyPer") or 0
            new_scrap = change.get("newScrapPct")
            target["itemCode"] = change.get("newItemCode") or target["itemCode"]
            target["itemName"] = change.get("newItemName") or target.get("itemName")
            if new_qty > 0:
                target["qtyPer"] = new_qty
            if new_scrap is not None and new_scrap >= 0:
                target["scrapPct"] = new_scrap
            target["notes"] = change.get("note") or target.get("notes")

        elif action == QTY_CHANGE:
            if target is None:
                warnings.append(f"{item_code} is not on {doc_no}; its quantity cannot be changed.")
                continue
            target["qtyPer"] = change.get("newQtyPer") or 0
            target["scrapPct"] = change.get("newScrapPct") or 0
            target["notes"] = change.get("note") or target.get("notes")

        elif action == ADD:
            if target is not None:
                # Adding what is already there is a quantity change in disguise.
                # Saying so is better than silently doubling the component.
                warnings.append(
                    f"{item_code} is already on {doc_no}; its quantity was updated instead."
                )
                target["qtyPer"] = change.get("newQtyPer") or 0
                continue
            lines.append(
                {
                    "seq": len(lines) + 1,
                    "itemCode": item_code,
                    "itemName": change.get("itemName"),
                    "uom": change.get("uom") or "NOS",
                    "qtyPer": change.get("newQtyPer") or 0,
                    "scrapPct": change.get("newScrapPct") or 0,
                    "isPhantom": False,
                    "operationSeq": None,
                    "notes": change.get("note"),
                }
            )

        else:
            warnings.append(f"{action or 'An instruction'} is not an action this system can apply.")

    for index, line in enumerate(lines, start=1):
        line["seq"] = index
    return lines, warnings
