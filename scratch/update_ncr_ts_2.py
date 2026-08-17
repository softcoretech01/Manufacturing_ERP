import re
file_path = r'd:\Manuf ERP\1408ERP-QL\Manufacturing_ERP\web\src\pages\quality\Ncr.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add wrapper functions
wrapper_funcs = """
  const updateWrapper = async (id: number | undefined, patch: any) => {
    if (!id) return;
    try {
      await ncrsApi.update(id, patch);
      fetchNcrs();
    } catch (e: any) {
      toast.error('Error', e.message || 'Update failed');
    }
  }
"""
content = content.replace("const fetchNcrs = async () => {", wrapper_funcs + "\n  const fetchNcrs = async () => {")

# Replace all the specific update calls
content = content.replace("update(editing.uid, {", "updateWrapper((editing as any)?.id, {")
content = content.replace("update(n.uid, {", "updateWrapper((n as any)?.id, {")
content = content.replace("update(n.uid, patch)", "updateWrapper((n as any)?.id, patch)")
content = content.replace("update(live.uid, {", "updateWrapper((live as any)?.id, {")

# Fix line 202 'create' error, probably from a duplicate I missed.
content = content.replace("create({ ...editing", "ncrsApi.create({ ...editing")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
