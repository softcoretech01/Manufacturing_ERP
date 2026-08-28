"""
Fix column definitions in all 6 procurement screens:
- Requisitions: PR number no-mono, proportional widths, action col-flex
- Rfq, Quotations, Orders, Grn, Approvals: same pattern
"""
import re

# ── Requisitions.tsx ──────────────────────────────────────────────────────────
with open('frontend/src/pages/procurement/Requisitions.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', render: (_, i) => i + 1, width: '60px' },
    { key: 'docNo', header: 'PR Number', render: (r) => (
      r.docNo && r.docNo !== 'null'
        ? <span className="font-mono text-xs font-semibold text-brand-700 whitespace-nowrap">{r.docNo}</span>
        : <span className="text-xs text-fg-muted italic whitespace-nowrap">Auto-generating\u2026</span>
    ) },
    { key: 'docDate', header: 'Request Date', width: '120px', render: (r) => <span className="whitespace-nowrap">{formatDate(r.docDate)}</span> },
    { key: 'requestedBy', header: 'Requested By' },
    { key: 'itemType', header: 'Item Type', width: '130px', render: (r) => <span className="whitespace-nowrap">{r.itemType || r.department || '-'}</span> },
    { key: 'requiredBy', header: 'Required Date', width: '120px', render: (r) => <span className="whitespace-nowrap">{r.requiredBy ? formatDate(r.requiredBy) : '-'}</span> },
    { key: 'items', header: 'Items', width: '70px', render: (r) => r.lines?.length || 0 },
    { key: 'status', header: 'Status', width: '140px', render: (r) => <div className="whitespace-nowrap"><ProcStatusBadge status={r.status} /></div> },'''

new_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'PR Number', width: '160px', render: (r) => (
      r.docNo && r.docNo !== 'null'
        ? <span className="text-xs font-semibold text-brand-700">{r.docNo}</span>
        : <span className="text-xs text-fg-muted italic">Auto-generating\u2026</span>
    ) },
    { key: 'docDate', header: 'Request Date', width: '130px', render: (r) => formatDate(r.docDate) },
    { key: 'requestedBy', header: 'Requested By' },
    { key: 'itemType', header: 'Item Type', width: '140px', render: (r) => r.itemType || r.department || '-' },
    { key: 'requiredBy', header: 'Required Date', width: '130px', render: (r) => r.requiredBy ? formatDate(r.requiredBy) : '-' },
    { key: 'items', header: 'Items', width: '72px', align: 'center' as const, render: (r) => r.lines?.length || 0 },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },'''

content = content.replace(old_cols, new_cols)

# fix the action column width
content = content.replace(
    "      width: '180px',\n      render: (r) => (\n        <div className=\"flex items-center gap-1\">",
    "      width: '164px',\n      className: 'col-flex',\n      render: (r) => (\n        <div className=\"flex items-center gap-2\">"
)

with open('frontend/src/pages/procurement/Requisitions.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Requisitions.tsx")

# ── Rfq.tsx ───────────────────────────────────────────────────────────────────
with open('frontend/src/pages/procurement/Rfq.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', render: (_, i) => i + 1, width: '60px' },
    { key: 'docNo', header: 'RFQ Number', width: '150px' },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '120px' },
    { key: 'title', header: 'Title', width: '200px' },
    { key: 'quoteDueBy', header: 'Quote Due By', render: (r) => r.quoteDueBy ? formatDate(r.quoteDueBy) : '-', width: '120px' },
    { key: 'suppliers', header: 'Suppliers', render: (r) => r.suppliers?.length || 0, width: '90px' },
    { key: 'items', header: 'Items', render: (r) => r.lines?.length || 0, width: '80px' },
    { key: 'status', header: 'Status', render: (r) => <ProcStatusBadge status={r.status} />, width: '140px' },
    {
      key: 'actions',
      width: '120px',
      render: (r) => (
        <div className="flex items-center gap-1">'''

new_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'RFQ Number', width: '160px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'title', header: 'Title' },
    { key: 'quoteDueBy', header: 'Quote Due By', render: (r) => r.quoteDueBy ? formatDate(r.quoteDueBy) : '-', width: '130px' },
    { key: 'suppliers', header: 'Suppliers', align: 'center' as const, render: (r) => r.suppliers?.length || 0, width: '80px' },
    { key: 'items', header: 'Items', align: 'center' as const, render: (r) => r.lines?.length || 0, width: '72px' },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions',
      width: '120px',
      className: 'col-flex',
      render: (r) => (
        <div className="flex items-center gap-2">'''

content = content.replace(old_cols, new_cols)

with open('frontend/src/pages/procurement/Rfq.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Rfq.tsx")

# ── Quotations.tsx ────────────────────────────────────────────────────────────
with open('frontend/src/pages/procurement/Quotations.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', render: (_, i) => i + 1, width: '60px' },
    { key: 'docNo', header: 'Quote No', width: '130px' },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '100px' },
    { key: 'rfqNo', header: 'RFQ Ref', width: '130px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = suppliers.find(s => (s.uid || s.id) === r.supplierUid)
      return sup ? sup.name : r.supplierUid
    }, width: '180px' },
    { key: 'validTill', header: 'Valid Till', render: (r) => r.validTill ? formatDate(r.validTill) : '-', width: '100px' },
    { key: 'items', header: 'Items', render: (r) => r.lines?.length || 0, width: '80px' },
    { key: 'landedValue', header: 'Total Value', render: (r) => formatCurrency(r.landedValue), width: '120px' },
    { key: 'status', header: 'Status', render: (r) => <ProcStatusBadge status={r.status} />, width: '140px' },
    {
      key: 'actions',
      width: '120px',
      render: (r) => (
        <div className="flex items-center gap-1">'''

new_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'Quote No', width: '140px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'rfqNo', header: 'RFQ Ref', width: '130px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = suppliers.find(s => (s.uid || s.id) === r.supplierUid)
      return sup ? sup.name : r.supplierUid
    } },
    { key: 'validTill', header: 'Valid Till', render: (r) => r.validTill ? formatDate(r.validTill) : '-', width: '130px' },
    { key: 'items', header: 'Items', align: 'center' as const, render: (r) => r.lines?.length || 0, width: '72px' },
    { key: 'landedValue', header: 'Total Value', align: 'right' as const, render: (r) => formatCurrency(r.landedValue), width: '120px' },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions',
      width: '120px',
      className: 'col-flex',
      render: (r) => (
        <div className="flex items-center gap-2">'''

content = content.replace(old_cols, new_cols)

with open('frontend/src/pages/procurement/Quotations.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Quotations.tsx")

# ── Orders.tsx ────────────────────────────────────────────────────────────────
with open('frontend/src/pages/procurement/Orders.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', render: (_, i) => i + 1, width: '60px' },
    { key: 'docNo', header: 'PO No', width: '130px' },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '100px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = masters.suppliers.find(s => (s.uid || s.id) === r.supplierUid)
      return sup ? sup.name : r.supplierUid
    }, width: '180px' },
    { key: 'promisedDate', header: 'Delivery Due', render: (r) => r.promisedDate ? formatDate(r.promisedDate) : '-', width: '110px' },
    { key: 'items', header: 'Items', render: (r) => r.lines?.length || 0, width: '80px' },
    { key: 'totalValue', header: 'Total Value', render: (r) => formatCurrency(r.totalValue), width: '120px' },
    { key: 'status', header: 'Status', render: (r) => <ProcStatusBadge status={r.status} />, width: '140px' },
    {
      key: 'actions',
      width: '120px',
      render: (r) => (
        <div className="flex items-center gap-1">'''

new_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'PO No', width: '150px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = masters.suppliers.find(s => (s.uid || s.id) === r.supplierUid)
      return sup ? sup.name : r.supplierUid
    } },
    { key: 'promisedDate', header: 'Delivery Due', render: (r) => r.promisedDate ? formatDate(r.promisedDate) : '-', width: '130px' },
    { key: 'items', header: 'Items', align: 'center' as const, render: (r) => r.lines?.length || 0, width: '72px' },
    { key: 'totalValue', header: 'Total Value', align: 'right' as const, render: (r) => formatCurrency(r.totalValue), width: '120px' },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions',
      width: '120px',
      className: 'col-flex',
      render: (r) => (
        <div className="flex items-center gap-2">'''

content = content.replace(old_cols, new_cols)

with open('frontend/src/pages/procurement/Orders.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Orders.tsx")

# ── Grn.tsx ───────────────────────────────────────────────────────────────────
with open('frontend/src/pages/procurement/Grn.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', render: (_, i) => i + 1, width: '60px' },
    { key: 'docNo', header: 'GRN No', width: '130px' },
    { key: 'docDate', header: 'GRN Date', render: (r) => formatDate(r.docDate), width: '100px' },
    { key: 'poNo', header: 'PO Ref', width: '130px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = masters.suppliers.find(s => (s.uid || s.id) === r.supplierUid)
      return sup ? sup.name : r.supplierUid
    }, width: '180px' },
    { key: 'challanNo', header: 'Challan No', width: '110px' },
    { key: 'items', header: 'Items', render: (r) => r.lines?.length || 0, width: '80px' },
    { key: 'status', header: 'Status', render: (r) => <ProcStatusBadge status={r.status} />, width: '140px' },
    {
      key: 'actions',
      width: '120px',
      render: (r) => (
        <div className="flex items-center gap-1">'''

new_cols = '''  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'GRN No', width: '150px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'GRN Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'poNo', header: 'PO Ref', width: '140px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = masters.suppliers.find(s => (s.uid || s.id) === r.supplierUid)
      return sup ? sup.name : r.supplierUid
    } },
    { key: 'challanNo', header: 'Challan No', width: '120px' },
    { key: 'items', header: 'Items', align: 'center' as const, render: (r) => r.lines?.length || 0, width: '72px' },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions',
      width: '120px',
      className: 'col-flex',
      render: (r) => (
        <div className="flex items-center gap-2">'''

content = content.replace(old_cols, new_cols)

with open('frontend/src/pages/procurement/Grn.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Grn.tsx")

# ── Approvals.tsx ─────────────────────────────────────────────────────────────
with open('frontend/src/pages/procurement/Approvals.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "      width: '200px',\n      render: (r) => (",
    "      width: '200px',\n      className: 'col-flex',\n      render: (r) => ("
)
content = content.replace(
    '<div className="flex items-center gap-2">\n          <Button variant="ghost" size="icon" onClick={() => { setSelectedTask(r); setViewOpen(true); }} title="View">',
    '<div className="flex items-center gap-2">\n          <Button variant="ghost" size="icon" onClick={() => { setSelectedTask(r); setViewOpen(true); }} title="View">'
)

with open('frontend/src/pages/procurement/Approvals.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Approvals.tsx")

print("\nAll procurement screens updated!")
