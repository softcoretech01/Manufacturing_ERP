import glob, os

files = glob.glob(r'd:\Manuf ERP\11AugERP\Manufacturing_ERP\web\src\pages\engineering\*.tsx') + [r'd:\Manuf ERP\11AugERP\Manufacturing_ERP\web\src\pages\planning\usePlanningData.ts']

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace \'eng: with 'eng:
    if r"\'eng:" in content:
        content = content.replace(r"\'eng:", "'eng:")
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Fixed {f}")
    
    # Also replace \1 if it appeared (Ascii 1)
    if chr(1) + "'eng:" in content:
        # If the backreference \1 resolved to \x01
        content = content.replace(chr(1) + "'eng:", "'eng:")
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Fixed ASCII 1 in {f}")
