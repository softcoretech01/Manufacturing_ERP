"""A tiny, safe boolean-expression evaluator for rule conditions (V1-WFL-FR-002).

Rule conditions like ``priority == 'URGENT' AND total_amount <= 200000`` must be
evaluated against a document's attributes without ever running arbitrary code.
This evaluates a whitelisted grammar over a flat ``dict`` of document fields:

    comparison := field (== | != | < | <= | > | >=) literal
    expr       := comparison ((AND | OR) comparison)*

Only field names present in ``attrs`` are readable; anything else raises. There
is no attribute access, no calls, no arithmetic — so it cannot be abused.
"""

from __future__ import annotations

import ast
import operator
from typing import Any

_CMP = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
}


class ExpressionError(ValueError):
    """The expression is malformed or references an unknown field/operation."""


def _py(expr: str) -> str:
    # Accept the SQL-ish AND/OR/NOT the UI shows and map to Python operators.
    out = []
    for tok in expr.split():
        u = tok.upper()
        out.append({"AND": "and", "OR": "or", "NOT": "not"}.get(u, tok))
    return " ".join(out)


def _eval(node: ast.AST, attrs: dict[str, Any]) -> Any:
    if isinstance(node, ast.Expression):
        return _eval(node.body, attrs)
    if isinstance(node, ast.BoolOp):
        vals = [_eval(v, attrs) for v in node.values]
        return all(vals) if isinstance(node.op, ast.And) else any(vals)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return not _eval(node.operand, attrs)
    if isinstance(node, ast.Compare):
        if len(node.ops) != 1:
            raise ExpressionError("Chained comparisons are not supported.")
        left = _eval(node.left, attrs)
        right = _eval(node.comparators[0], attrs)
        fn = _CMP.get(type(node.ops[0]))
        if fn is None:
            raise ExpressionError("Unsupported comparison operator.")
        try:
            return fn(left, right)
        except TypeError:
            return False
    if isinstance(node, ast.Name):
        if node.id in ("True", "False"):
            return node.id == "True"
        if node.id not in attrs:
            raise ExpressionError(f"Unknown field '{node.id}'.")
        return attrs[node.id]
    if isinstance(node, ast.Constant):
        return node.value
    raise ExpressionError("Expression uses an unsupported construct.")


def evaluate(expr: str, attrs: dict[str, Any]) -> bool:
    """Evaluate ``expr`` against ``attrs``; True/False. Raises ExpressionError on
    a malformed expression or an unknown field."""
    if not expr or not expr.strip():
        return True
    try:
        tree = ast.parse(_py(expr), mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Cannot parse expression: {exc.msg}") from exc
    return bool(_eval(tree, attrs))


def validate(expr: str, allowed_fields: set[str]) -> None:
    """Static check used at rule-save time: parses the expression and asserts every
    referenced name is in ``allowed_fields``. Raises ExpressionError otherwise."""
    if not expr or not expr.strip():
        return
    try:
        tree = ast.parse(_py(expr), mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Cannot parse expression: {exc.msg}") from exc
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Name)
            and node.id not in ("True", "False")
            and node.id not in allowed_fields
        ):
            raise ExpressionError(
                f"Field '{node.id}' is not allowed. Allowed: "
                f"{', '.join(sorted(allowed_fields))}"
            )
        if isinstance(node, (ast.Call, ast.Attribute, ast.Subscript)):
            raise ExpressionError("Calls, attribute and index access are not allowed.")
