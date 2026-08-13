import glob, os, re

files = glob.glob(r'd:\Manuf ERP\11AugERP\Manufacturing_ERP\web\src\pages\engineering\*.tsx')

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    original = content
    
    # Simple regex to add maxLength to Input if it doesn't have it.
    # Note: this is a bit crude but works for standard <Input /> or <Textarea /> components.
    
    def replace_input(m):
        comp = m.group(1) # Input or Textarea
        attrs = m.group(2)
        if 'maxLength' in attrs or 'type="number"' in attrs:
            return m.group(0) # Do nothing
        
        # Decide limit based on common names
        limit = "255"
        if 'name="code"' in attrs or 'value={form.code}' in attrs or 'value={f.code}' in attrs:
            limit = "100"
        elif 'name="name"' in attrs or 'value={form.name}' in attrs:
            limit = "100"
        elif comp == 'Textarea':
            limit = "1000"
            
        return f"<{comp} maxLength={{{limit}}}{attrs}"

    content = re.sub(r'<(Input|Textarea)([^>]*?)', replace_input, content)

    if content != original:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Added maxLength to {os.path.basename(f)}")
