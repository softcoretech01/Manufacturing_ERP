# Open Questions & Assumptions Register

**Stainless Steel Water Bottle Manufacturing ERP**
Live register — updated whenever a volume raises or resolves a question.
Last updated: 2026-07-29

Per [CLAUDE.md §9.3](../../CLAUDE.md), no business rule is invented. Where the SRS had to
proceed without an answer, the assumption made is recorded here alongside the question, so the
cost of a wrong assumption is visible before code is written.

**Status legend:** 🔴 Open — blocks build · 🟡 Open — assumption in force, build may proceed ·
🟢 Answered · ⚪ Withdrawn

---

## Volume 1 — Core Framework

| # | Question | Ch | Status | Assumption in force |
|---|---|---|---|---|
| Q1-01 | Is SSO (SAML/OIDC) required at go-live or deferred? | 1 | 🟡 | Deferred; local auth + MFA at release 1 |
| Q1-02 | Confirm legal entity / branch / plant / warehouse counts and GSTIN allocation | 2 | 🔴 | — blocks org-structure seeding |
| Q1-03 | Should approval limits be by amount only, or also by item category / cost centre? | 4 | 🟡 | Both supported; amount-band rules seeded |
| Q1-04 | Is WhatsApp Business API provisioned, and with which BSP? | 6 | 🟡 | Adapter built with a mock; channel off by default |
| Q1-05 | Existing master data sources and formats for migration | 7 | 🔴 | — blocks cutover planning |
| Q1-06 | Formal licence enforcement, or internal deployment? | 8 | 🟡 | Internal deployment; licence module deferred |

## Volume 3 — Procurement & Supplier Management

| # | Question | Ch | Status | Assumption in force |
|---|---|---|---|---|
| Q3-01 | Is a supplier portal in scope for release 1, or is e-mail-only RFQ acceptable at go-live? | 1, 3 | 🟡 | Portal specified and built; e-mail path is fully functional independently, so portal can slip to P8 without blocking (A3-04) |
| Q3-02 | Current approval limits (₹) per level for PR and PO, per procurement type | 8 | 🔴 | Seeded defaults in Ch 8 §8.3 are **placeholders**. They must be replaced before go-live — shipping someone else's limits is worse than shipping none |
| Q3-03 | Are imports in scope for release 1, and in which currencies / Incoterms? | 6 | 🟡 | Import PO type specified; sequenced last (P9). Landed-cost components modelled either way |
| Q3-04 | Is capital procurement handled here, or through a separate capex authorisation process? | 2, 6 | 🟡 | Handled here as `CAPITAL` procurement type with a capex-budget reference; a separate upstream sanction process can feed it |
| Q3-05 | Receipt tolerance percentages currently accepted for SS coil (weight) and components (count) | 7 | 🟡 | 2% over, 5% under, configurable at item/supplier/company (A3-05 adjacent). Wrong values cause daily friction at the gate |
| Q3-06 | Who owns the supplier rating decision — purchase, quality, or a joint committee? | 1 | 🟡 | Computed automatically; manual override needs `SUPPLIER.RATE` and a justification. Ownership affects who holds that permission only |
| Q3-07 | Is a weighbridge available at the gate, and with what protocol? | 7 | 🟡 | Adapter with a manual fallback that is reported (A3-01) |
| Q3-08 | Does Finance want invoice **booking** in procurement, or only matching, with booking in Vol 9? | 7 | 🟡 | Procurement verifies and matches; Vol 9 books and pays. Changing this moves the AP voucher boundary |
| Q3-09 | Are there existing rate contracts and open POs to migrate at cutover? | 6 | 🔴 | — blocks cutover design; open commitments cannot be recreated after the fact |
| Q3-10 | Confirm the MSME payment-term policy and whether it overrides negotiated terms | 1, 7 | 🟡 | Statutory 45-day cap applied unconditionally and not overridable per transaction (V3-SUP-BR-008) |
| Q3-11 | Is job work done on issued material (Sec 143) or sale-and-buy-back? | 6 | 🟡 | Issued material on challan (A3-07). Sale-and-buy-back would change the accounting entirely |
| Q3-12 | Is budget control advisory or blocking, and at which document? | 2, 6 | 🟡 | `WARN` at PR, `BLOCK` at PO, configurable (A3-06) |
| Q3-13 | Which price index (if any) governs SS coil rate contracts, and who publishes it? | 6 | 🟡 | Index-linked pricing modelled with a configurable source and manual-entry fallback |
| Q3-14 | Is incoming inspection required for all direct material, or skippable for named routine items? | 7 | 🟡 | Required by default; `SKIP_LOT`/`NONE` configurable per AVL entry (A3-02) |
| Q3-15 | Does the client require dual control (two openers) on sealed bids, or is single-user opening acceptable? | 3 | 🟡 | Dual control specified; relaxing it is a configuration change, not a code change |

## Volume 4 — Inventory & Warehouse Management

| # | Question | Ch | Status | Assumption in force |
|---|---|---|---|---|
| Q4-01 | Confirm the valuation method per item class — weighted average everywhere, or FIFO for steel? | 9 | 🟡 | Weighted average default, standard cost for FG (A4-02). FIFO layers are modelled either way, so a switch is configuration, not redesign |
| Q4-02 | Is standard costing used for FG, and who owns the standard-cost revision cycle? | 9 | 🟡 | Standard cost for FG/SF with a controlled revision document; owner assumed to be Costing |
| Q4-03 | Which warehouses are genuinely bin-managed today, and what is the existing bin naming convention? | 1 | 🔴 | — blocks bin generation and label printing at cutover |
| Q4-04 | Is WIP tracked at operation level in a WIP store, or held as a plant-level pool? | 2, 4 | 🟡 | WIP store with batch identity; a plant-level pool would remove bin addressing for WIP only |
| Q4-05 | Acceptable count-variance tolerances by item class before approval is required | 8 | 🟡 | A 0.5%, B 1%, C 2%, with an absolute value floor. Wrong values make every count an approval event |
| Q4-06 | Are shop-floor scanners available, and is there a device standard? | 14 | 🔴 | — the mobile-first store design assumes them (A4-09); without them, issue and count throughput assumptions fail |
| Q4-07 | Should backflush be automatic at operation confirmation, or an explicit issue every job? | 4 | 🟡 | Explicit issue for batch-traced and high-value material; backflush only for configured low-value consumables |
| Q4-08 | Confirm the shelf-life items and their near-expiry alert lead times | 7 | 🟡 | Coating powder, inks, adhesives, silicone; alerts at 30 and 7 days |
| Q4-09 | Is the Coimbatore depot the same GSTIN or a distinct person for GST? | 5 | 🔴 | — decides whether depot transfers are challans or tax invoices; affects statutory numbering and tax posting |
| Q4-10 | Who approves a write-off, and at what value does it escalate to the Director? | 6, 11 | 🟡 | Materials Manager → Finance → Factory Head, Director above ₹5 L. Seeded values are **placeholders** |
| Q4-11 | Opening-stock migration approach for batches, serials and values | 12 | 🔴 | — blocks cutover; opening batches and serials cannot be reconstructed after go-live |
| Q4-12 | Does Finance want a provision policy by ageing bucket, and at what percentages? | 9 | 🟡 | 180–365 days 25%, > 365 days 50%, obsolete 100%, proposed not auto-posted |
| Q4-13 | Is negative stock currently tolerated in any store, and would the business accept a hard block? | 2 | 🟡 | Hard block everywhere (A4-03); the per-warehouse exception exists but is off. Reversing this weakens valuation |
| Q4-14 | Is real-time GL posting per movement acceptable to Finance, or is a periodic batch preferred? | 9, 13 | 🟡 | Real-time per movement (A4-10); a batch extract would change the Vol 9 event contract |

---

## Assumptions register (inventory)

Restated from [Volume 4 README §7](volume-04-inventory/README.md#7-assumptions).

| # | Assumption | If wrong |
|---|---|---|
| A4-01 | RM, WIP, FG and packing stores are bin-managed; quarantine, reject, scrap and transit are not | Bin mandatory-ness flips per warehouse — configuration, no structural change |
| A4-02 | Weighted average default, standard cost for FG | Valuation default changes; FIFO layer table already exists |
| A4-03 | Negative stock is never permitted in a production warehouse | The exception becomes routine and deficit costing needs a rule — valuation quality degrades |
| A4-04 | Incoming material is quarantined by default and released by QC | Default receipt status flips to `AVAILABLE`; no structural change |
| A4-05 | Finished bottles are serial-tracked per piece from FG receipt | Serial handling drops to carton level; warranty lookup and recall precision both degrade |
| A4-06 | Cycle counting replaces the annual stocktake for A and B items | Count planning collapses to a single annual event; accuracy KPI becomes a yearly snapshot |
| A4-07 | Job work is on issued material under Sec 143 | Subcontractor stock stops being company stock — Ch 5 and the valuation model change entirely (same blast radius as A3-07) |
| A4-08 | A weighbridge reading is capturable, manually if not integrated | Coil receipt and residual return lose their cross-check; adjustment volume rises |
| A4-09 | Android scanners running the mobile app, working offline | The mobile-first store design collapses to desktop entry; issue and count cycle times will not be met |
| A4-10 | Inventory GL posting is real-time per movement | The Vol 9 event contract becomes a periodic extract |

---

## Assumptions register (procurement)

Restated from [Volume 3 README §7](volume-03-procurement/README.md#7-assumptions) for
convenience. Each is a decision made in the absence of an answer, with its blast radius.

| # | Assumption | If wrong |
|---|---|---|
| A3-01 | A security gate records inward vehicles; gate entry is a real control | Gate entry becomes optional configuration — no data-model change |
| A3-02 | Incoming inspection is required for all direct material and consumables | Default inspection requirement flips; no structural change |
| A3-03 | Supplier invoices normally arrive after the GRN | Match sequencing changes; the `GRN_MISSING` exception path becomes the norm rather than the exception |
| A3-04 | A supplier portal will be used for at least RFQ response and PO acknowledgement | Portal chapters move to phase 2; e-mail path already covers the flow |
| A3-05 | Rate contracts exist for SS coil and major components; spot buying is the exception | Contract-first sourcing logic becomes advisory rather than the default |
| A3-06 | Budget control is advisory at PR and blocking at PO | Gate position moves; both behaviours are already configurable |
| A3-07 | Job work is done on issued material (Sec 143), not sale-and-buy-back | Subcontract accounting, GST treatment and reconciliation change entirely — this is the highest-cost assumption in the volume |

---

## How to close a question

1. Record the answer in this table with the date and who gave it.
2. Update the affected requirement(s) in the volume, keeping the requirement ID.
3. Where the answer contradicts an assumption, add a change entry to that volume's revision
   history naming the requirement IDs touched.
4. Move the row's status to 🟢 and strike the assumption.
