const fs = require('fs');

const schemasPath = 'd:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/backend/app/schemas/quality_plans.py';
let schemaContent = fs.readFileSync(schemasPath, 'utf-8');

schemaContent = schemaContent.replace(/([A-Z][a-zA-Z0-9_]*):/g, (match, name) => {
    if (name === 'Config') return match;
    return name[0].toLowerCase() + name.substring(1) + ':';
});
schemaContent = schemaContent.replace('class config:', 'class Config:');
fs.writeFileSync(schemasPath, schemaContent, 'utf-8');

const routerPath = 'd:/Manuf ERP/1408ERP-QL/Manufacturing_ERP/backend/app/routers/quality_plans.py';
let routerContent = fs.readFileSync(routerPath, 'utf-8');

const replacement = `    def to_camel(d):
        return {k[0].lower() + k[1:]: v for k, v in d.items()}

    response = []
    for plan in plans:
        plan_dict = to_camel(dict(plan))
        plan_chars = chars_by_plan.get(plan["Id"], [])
        plan_dict["characteristics"] = [to_camel(dict(c)) for c in plan_chars]
        response.append(plan_dict)`;

routerContent = routerContent.replace(`    response = []
    for plan in plans:
        plan_dict = dict(plan)
        plan_dict["Characteristics"] = chars_by_plan.get(plan["Id"], [])
        response.append(plan_dict)`, replacement);

routerContent = routerContent.replace(/plan\.([A-Z][a-zA-Z0-9_]*)/g, (match, name) => {
    return 'plan.' + name[0].toLowerCase() + name.substring(1);
});

routerContent = routerContent.replace('chars_json = json.dumps([c.model_dump() for c in plan.characteristics])', 'chars_json = json.dumps([{"Seq": c.seq, "Name": c.name, "Type": c.type, "Uom": c.uom, "Target": c.target, "LowerLimit": c.lowerLimit, "UpperLimit": c.upperLimit, "InstrumentCode": c.instrumentCode, "Severity": c.severity, "IsMandatory": c.isMandatory, "RequiresPhoto": c.requiresPhoto, "Method": c.method} for c in plan.characteristics])');

// Fix Id -> id in response payload
routerContent = routerContent.replace(/"Id": row\[0\], "PlanCode": row\[1\]/g, '"id": row[0], "planCode": row[1]');
routerContent = routerContent.replace(/"Id": plan_id/g, '"id": plan_id');

fs.writeFileSync(routerPath, routerContent, 'utf-8');
console.log('Fixed backend case');
