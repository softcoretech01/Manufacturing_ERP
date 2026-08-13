"""Workflow & approval engine (SRS V1-WFL).

One configurable approval engine used by every document in every module: an
approval matrix (document type + condition → ordered approval levels), the
runtime instance/task/history, and the inbox + monitor read models.

Scope of this slice: the **matrix** (Level-1 config, ~90% of cases) and the
execution engine (submit → assign → approve/reject/return/reassign/recall). The
**visual workflow designer** (V1-WFL-FR-023…026, priority S) is deferred — it
routes branching processes that live in modules not yet built.
"""
