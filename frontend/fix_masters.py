import glob
import re
import os

files = glob.glob('src/pages/masters/*.tsx')

# 1. Add missing imports
for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "api." in content and "import * as api from" not in content:
        # insert it after the last import
        lines = content.split('\n')
        last_import_idx = 0
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import_idx = i
                
        lines.insert(last_import_idx + 1, "import * as api from '@/api/masters'")
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        print(f"Added import to {fpath}")

# 2. Generate api/masters.ts
apis = set()
for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        apis.update(re.findall(r'api\.([a-zA-Z0-9_]+)', f.read()))

# Build the TS file
out = ["import { api } from './client'"]
out.append("import type * as Masters from '@/types/masters'\n")

# To handle cases where the type doesn't exist explicitly in masters.ts,
# we use `any` fallback for typing if needed, but since it's just `api.get<any>`, it works.
def get_entity_name(method_name):
    for prefix in ['get', 'create', 'update', 'delete', 'getNext']:
        if method_name.startswith(prefix):
            rest = method_name[len(prefix):]
            if prefix == 'get' and not rest.startswith('Next'):
                # plural to singular
                if rest.endswith('ies'): return rest[:-3] + 'y'
                elif rest.endswith('ses'): return rest[:-2]
                elif rest.endswith('s'): return rest[:-1]
                return rest
            elif prefix == 'getNext':
                if rest.endswith('Code'): return rest[:-4]
            return rest
    return method_name

entities = set()
for m in apis:
    entities.add(get_entity_name(m))

for entity in sorted(entities):
    if not entity: continue
    
    # URL path logic: camelCase to kebab-case
    # e.g. BottleCapacity -> bottle-capacities
    # e.g. Country -> countries
    def to_kebab(s):
        s = re.sub('(.)([A-Z][a-z]+)', r'\1-\2', s)
        return re.sub('([a-z0-9])([A-Z])', r'\1-\2', s).lower()
        
    kebab = to_kebab(entity)
    if kebab.endswith('y'):
        path = kebab[:-1] + 'ies'
    elif kebab.endswith('s') or kebab.endswith('h') or kebab.endswith('x'):
        path = kebab + 'es'
    else:
        path = kebab + 's'
        
    # special cases
    if entity == 'QualityParameter': path = 'quality-parameters'
    
    out.append(f"// {entity}")
    if f"get{entity}s" in apis or f"get{entity[:-1]}ies" in apis or f"get{entity}es" in apis:
        plural = f"get{entity}s" if not entity.endswith('y') else f"get{entity[:-1]}ies"
        if entity.endswith('s') or entity.endswith('h') or entity.endswith('x'): plural = f"get{entity}es"
        out.append(f"export const {plural} = () => api.get<any[]>('/{path}').then(res => Array.isArray(res) ? res : res.data || [])")
        
    if f"create{entity}" in apis:
        out.append(f"export const create{entity} = (data: any) => api.post<any>('/{path}', data)")
        
    if f"update{entity}" in apis:
        out.append(f"export const update{entity} = (id: number | string, data: any) => api.put<any>(`/{path}/${{id}}`, data)")
        
    if f"delete{entity}" in apis:
        out.append(f"export const delete{entity} = (id: number | string) => api.delete(`/{path}/${{id}}`)")
        
    if f"getNext{entity}Code" in apis:
        out.append(f"export const getNext{entity}Code = () => api.get<{{code: string}}>(`/{path}/next-code`)")
        
    out.append("")

with open('src/api/masters.ts', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

print("Generated src/api/masters.ts with endpoints.")
