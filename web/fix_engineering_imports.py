import os
import glob
import re

directory = r"d:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\engineering"
files = glob.glob(os.path.join(directory, "*.tsx"))

for file_path in files:
    filename = os.path.basename(file_path)
    if filename in ["Bom.tsx", "BomExplorer.tsx"]:
        continue
        
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    # If already fixed, skip
    if "engineeringApi as api" in content:
        continue
        
    # Find the last import line
    lines = content.split('\n')
    last_import_idx = 0
    for i, line in enumerate(lines):
        if line.startswith("import "):
            last_import_idx = i
            
    # Insert our imports right after the last import
    lines.insert(last_import_idx + 1, "import { engineeringApi as api } from '@/api/engineering'")
    
    # Check if we also need getItems
    if "getItems(" in content or "getItems" in content:
        lines.insert(last_import_idx + 2, "import { getItems } from '@/api/masters'")
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write('\n'.join(lines))
    print(f"Fixed {filename}")

