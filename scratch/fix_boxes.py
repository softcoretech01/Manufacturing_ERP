import os
import re

files = [
    'frontend/src/pages/procurement/Requisitions.tsx',
    'frontend/src/pages/procurement/Rfq.tsx',
    'frontend/src/pages/procurement/Quotations.tsx',
    'frontend/src/pages/procurement/Orders.tsx',
    'frontend/src/pages/procurement/Grn.tsx',
    'frontend/src/pages/procurement/Approvals.tsx'
]

pattern = re.compile(
    r'<div className="flex-1 overflow-hidden p-4 bg-surface-2">\s*<div className="h-full bg-surface border border-border shadow-sm rounded-lg flex flex-col overflow-hidden">\s*(<DataTable[^>]*>)\s*</div>\s*</div>',
    re.MULTILINE
)

pattern2 = re.compile(
    r'<div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">\s*<div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">\s*(<DataTable[^>]*>)\s*</div>\s*</div>',
    re.MULTILINE
)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = pattern.sub(r'<div className="flex-1 flex flex-col min-h-0 pt-4 px-4 pb-4 w-full bg-surface-2">\n        \1\n      </div>', content)
    new_content = pattern2.sub(r'<div className="flex-1 flex flex-col min-h-0 pt-4 px-4 pb-4 w-full bg-surface-2">\n        \1\n      </div>', new_content)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {file}")
