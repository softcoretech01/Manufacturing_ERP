"""What an engineering change does to a bill's lines.

These are the arithmetic of a change: four actions, applied in order, against the
live revision's lines. An instruction that cannot be carried out warns rather
than fails, because the remaining instructions still have to land.
"""

from __future__ import annotations

from app.services.engineering_change_lines import apply_change_lines

DOC = "BOM/26-27/0005"


def _base():
    return [
        {"seq": 1, "itemCode": "RM-SS304", "itemName": "SS304 coil", "uom": "KG", "qtyPer": 0.38, "scrapPct": 3, "isPhantom": False, "operationSeq": None, "notes": None},
        {"seq": 2, "itemCode": "SF-LID-ASSY-SS", "itemName": "Lid assembly", "uom": "NOS", "qtyPer": 1, "scrapPct": 0, "isPhantom": False, "operationSeq": None, "notes": None},
        {"seq": 3, "itemCode": "PKG-CARTON", "itemName": "Carton", "uom": "NOS", "qtyPer": 1, "scrapPct": 1, "isPhantom": False, "operationSeq": None, "notes": None},
    ]


def _instruction(action, item, **kw):
    return {
        "action": action,
        "itemCode": item,
        "itemName": kw.get("itemName"),
        "newItemCode": kw.get("newItemCode"),
        "newItemName": kw.get("newItemName"),
        "newQtyPer": kw.get("newQtyPer", 0),
        "newScrapPct": kw.get("newScrapPct", 0),
        "note": kw.get("note"),
    }


def test_add_appends_a_component():
    lines, warnings = apply_change_lines(
        _base(), [_instruction("ADD", "CON-GAS-ARG", itemName="Argon", newQtyPer=0.02, newScrapPct=1)], DOC
    )
    assert [l["itemCode"] for l in lines][-1] == "CON-GAS-ARG"
    assert lines[-1]["qtyPer"] == 0.02
    assert warnings == []


def test_add_of_an_existing_component_updates_it_and_says_so():
    lines, warnings = apply_change_lines(
        _base(), [_instruction("ADD", "PKG-CARTON", newQtyPer=2)], DOC
    )
    assert len(lines) == 3, "no duplicate line"
    assert next(l for l in lines if l["itemCode"] == "PKG-CARTON")["qtyPer"] == 2
    assert "already on" in warnings[0]


def test_remove_drops_the_component_and_closes_the_gap():
    lines, warnings = apply_change_lines(_base(), [_instruction("REMOVE", "SF-LID-ASSY-SS")], DOC)
    assert [l["itemCode"] for l in lines] == ["RM-SS304", "PKG-CARTON"]
    assert [l["seq"] for l in lines] == [1, 2], "sequences are rebuilt, no holes"
    assert warnings == []


def test_replace_swaps_the_component_and_carries_the_quantity_over():
    """Quantity and scrap read a zero differently, as the original rule does.

    A quantity of zero means the change did not state one, so the existing
    quantity survives. A scrap of zero is a real instruction: no scrap.
    """
    lines, _ = apply_change_lines(
        _base(),
        [_instruction("REPLACE", "RM-SS304", newItemCode="RM-SS316", newItemName="SS316 coil")],
        DOC,
    )
    line = lines[0]
    assert line["itemCode"] == "RM-SS316"
    assert line["qtyPer"] == 0.38
    assert line["scrapPct"] == 0


def test_replace_takes_the_quantity_when_one_is_given():
    lines, _ = apply_change_lines(
        _base(),
        [_instruction("REPLACE", "RM-SS304", newItemCode="RM-SS316", newQtyPer=0.42, newScrapPct=5)],
        DOC,
    )
    assert lines[0]["qtyPer"] == 0.42
    assert lines[0]["scrapPct"] == 5


def test_qty_change_sets_quantity_and_scrap():
    lines, _ = apply_change_lines(
        _base(), [_instruction("QTY_CHANGE", "RM-SS304", newQtyPer=0.41, newScrapPct=4)], DOC
    )
    assert lines[0]["qtyPer"] == 0.41
    assert lines[0]["scrapPct"] == 4


def test_an_instruction_for_a_component_that_is_gone_warns_and_carries_on():
    """An earlier change already removed it. The rest of the change still applies."""
    lines, warnings = apply_change_lines(
        _base(),
        [
            _instruction("REMOVE", "NOT-THERE"),
            _instruction("QTY_CHANGE", "PKG-CARTON", newQtyPer=3),
        ],
        DOC,
    )
    assert len(warnings) == 1 and "nothing to remove" in warnings[0]
    assert next(l for l in lines if l["itemCode"] == "PKG-CARTON")["qtyPer"] == 3


def test_instructions_apply_in_order():
    lines, _ = apply_change_lines(
        _base(),
        [
            _instruction("REPLACE", "RM-SS304", newItemCode="RM-SS316", newItemName="SS316"),
            _instruction("QTY_CHANGE", "RM-SS316", newQtyPer=0.5),
        ],
        DOC,
    )
    assert lines[0]["itemCode"] == "RM-SS316"
    assert lines[0]["qtyPer"] == 0.5, "the second instruction sees the first one's result"


def test_an_unknown_action_is_refused_by_warning_not_by_guesswork():
    lines, warnings = apply_change_lines(_base(), [_instruction("SPLIT", "RM-SS304")], DOC)
    assert [l["itemCode"] for l in lines] == [l["itemCode"] for l in _base()]
    assert "not an action" in warnings[0]


def test_the_base_lines_are_never_mutated():
    base = _base()
    apply_change_lines(base, [_instruction("REMOVE", "PKG-CARTON")], DOC)
    assert len(base) == 3, "the live revision must survive the arithmetic untouched"
