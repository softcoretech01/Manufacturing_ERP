with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Pallets.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Update import
text = text.replace(
    "import { Field } from '@/components/ui/Input'",
    "import { Field, Input, Select } from '@/components/ui/Input'"
)

# Replace <input> with <Input>
text = text.replace('<input ', '<Input ')
text = text.replace('<input\n', '<Input\n')
text = text.replace('</input>', '</Input>')

# Replace <select> with <Select>
text = text.replace('<select\n', '<Select\n')
text = text.replace('</select>', '</Select>')

# Remove className='form-input' and className='form-select' since the custom components handle their own styling
text = text.replace('className="form-input"', '')
text = text.replace('className="form-input bg-surface-2 text-fg-muted"', 'disabled')
text = text.replace('className="form-select"', '')

with open(r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\dispatch\Pallets.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Replaced inputs with UI components')
