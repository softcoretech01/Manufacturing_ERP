import re

path = r"d:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\types\quality.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# InspectionReading
content = content.replace("  uid: string\n  characteristicUid: string\n", "  id: number\n  uid?: string\n  characteristicId: number\n")

# DefectEntry
content = content.replace("export interface DefectEntry {\n  uid: string\n", "export interface DefectEntry {\n  id: number\n  uid?: string\n")

# Inspection
content = content.replace("export interface Inspection {\n  uid: string\n  docNo: string\n", "export interface Inspection {\n  id: number\n  uid?: string\n  docNo: string\n")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated types in quality.ts")
