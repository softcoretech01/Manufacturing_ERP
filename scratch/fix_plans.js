const fs = require('fs');
const filePath = 'd:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/web/src/pages/quality/Plans.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Fix planPlanCode -> planDocNo
content = content.replace(/planPlanCode/g, 'planDocNo');

// Fix newId -> newUid
content = content.replace(/newId/g, 'newUid');

// Fix `id: string` errors (rowKey={p => p.id} expects string if table expects string, wait, table rowKey can be anything). Wait, DataTable might expect string.
content = content.replace(/rowKey=\{\(p\) => p\.id\}/g, "rowKey={(p) => String(p.id)}");

// Fix instrument id -> instrument uid
content = content.replace(/x\.id === c\.instrumentCode/g, "x.code === c.instrumentCode");
content = content.replace(/key=\{x\.id\}/g, "key={x.uid}");

// Fix fetchPlans scope issues. The issue is fetchPlans is inside the component but save is outside?
// Wait, `save` is inside `PlansPage` component. 
// "Cannot find name 'fetchPlans'" - wait, I put fetchPlans inside `PlansPage` right?
// Let's check where `save` is. `save` is inside `PlansPage`. 
// Wait, I used a regex to replace `save` body, maybe I broke syntax or it got moved outside?
// I will just redefine `fetchPlans` and make sure it's accessible.
// Actually, `update` expects `string`, but I passed `editing.id` which is a `number`.
content = content.replace(/await plansApi\.update\(editing\.id/g, 'await plansApi.update(editing.id as number');
content = content.replace(/await plansApi\.update\(revisingFrom\.id/g, 'await plansApi.update(revisingFrom.id as number');
content = content.replace(/plansApi\.update\(p\.id/g, 'plansApi.update(p.id as number');
content = content.replace(/plansApi\.remove\(confirmDelete\.id\)/g, 'plansApi.remove(confirmDelete.id as number)');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Fixed Plans.tsx');
