"""Format-token rendering for document numbers (SRS V0 §11.1, V1-NUM).

The format string is data. Tokens are substituted from a document's context at
allocation time. Kept pure so the editor preview, the simulator and the real
allocator can never disagree (the acceptance criteria depend on this).

Supported tokens: {PREFIX} {BRANCH} {PLANT} {FY} {YYYY} {YY} {MM} {DD} {SUBTYPE}
{SEP} and the sequence — {SEQ} (padded to the series' padding_width) or {SEQ:n}
(padded to n inline).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

_SEQ_RE = re.compile(r"\{SEQ(?::(\d+))?\}")


@dataclass(slots=True)
class RenderContext:
    prefix: str = ""
    branch: str = ""
    plant: str = ""
    fy: str = ""
    sub_type: str = ""
    on_date: date | None = None
    separator: str = ""
    padding_width: int = 5


def fy_code(d: date, *, start_month: int = 4) -> str:
    """Indian financial-year short code for a date, e.g. 2026-05 → '26-27'."""
    y = d.year
    start = y if d.month >= start_month else y - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


def render(format_string: str, seq: int, ctx: RenderContext) -> str:
    d = ctx.on_date or date.today()
    out = format_string
    out = out.replace("{PREFIX}", ctx.prefix or "")
    out = out.replace("{BRANCH}", ctx.branch or "")
    out = out.replace("{PLANT}", ctx.plant or "")
    out = out.replace("{FY}", ctx.fy or fy_code(d))
    out = out.replace("{YYYY}", f"{d.year:04d}")
    out = out.replace("{YY}", f"{d.year % 100:02d}")
    out = out.replace("{MM}", f"{d.month:02d}")
    out = out.replace("{DD}", f"{d.day:02d}")
    out = out.replace("{SUBTYPE}", ctx.sub_type or "")
    out = out.replace("{SEP}", ctx.separator or "")

    def _seq(m: re.Match[str]) -> str:
        width = int(m.group(1)) if m.group(1) else ctx.padding_width
        return str(seq).zfill(width)

    return _SEQ_RE.sub(_seq, out)


def max_length(format_string: str, ctx: RenderContext, *, max_seq: int = 999_999) -> int:
    """Longest number this format could ever render — used to validate the GST
    16-char cap at save time (V1-NUM-BR-009), not at allocation time."""
    return len(render(format_string, max_seq, ctx))


def has_sequence(format_string: str) -> bool:
    return bool(_SEQ_RE.search(format_string))
