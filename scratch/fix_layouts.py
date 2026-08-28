"""
Fix the outer layout wrapper in Rfq, Quotations, Orders, Grn, Approvals
- Remove the double box (outer container + inner rounded card)
- Standardize to the same pattern as Requisitions
"""

files_and_patterns = {
    'frontend/src/pages/procurement/Rfq.tsx': (
        '      <div className="flex-1 overflow-hidden p-6 bg-surface-2">\n        <div className="h-full bg-surface border border-border shadow-sm rounded-lg flex flex-col overflow-hidden">',
        '      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">\n        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">'
    ),
    'frontend/src/pages/procurement/Quotations.tsx': (
        '      <div className="flex-1 overflow-hidden p-6 bg-surface-2">\n        <div className="h-full bg-surface border border-border shadow-sm rounded-lg flex flex-col overflow-hidden">',
        '      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">\n        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">'
    ),
    'frontend/src/pages/procurement/Orders.tsx': (
        '      <div className="flex-1 overflow-hidden p-6 bg-surface-2">\n        <div className="h-full bg-surface border border-border shadow-sm rounded-lg flex flex-col overflow-hidden">',
        '      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">\n        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">'
    ),
    'frontend/src/pages/procurement/Grn.tsx': (
        '      <div className="flex-1 overflow-hidden p-6 bg-surface-2">\n        <div className="h-full bg-surface border border-border shadow-sm rounded-lg flex flex-col overflow-hidden">',
        '      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">\n        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">'
    ),
    'frontend/src/pages/procurement/Approvals.tsx': (
        '      <div className="flex-1 overflow-hidden p-6 bg-surface-2">\n        <div className="h-full bg-surface border border-border shadow-sm rounded-lg flex flex-col overflow-hidden">',
        '      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">\n        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">'
    ),
}

for filepath, (old, new) in files_and_patterns.items():
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if old in content:
        content = content.replace(old, new)
        print(f"Updated wrapper: {filepath}")
    else:
        print(f"[WARN] Pattern not found in: {filepath}")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# Also fix the top-level flex container in Rfq, Quotations, Orders, Grn, Approvals
# so they match Requisitions: flex h-full w-full flex-col flex-1
top_level_pattern = '<div className="flex h-full flex-col">'
top_level_replacement = '<div className="flex h-full w-full flex-col flex-1">'

for filepath in files_and_patterns.keys():
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if top_level_pattern in content:
        content = content.replace(top_level_pattern, top_level_replacement)
        print(f"Fixed top-level flex in: {filepath}")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("\nAll layout wrappers fixed!")
