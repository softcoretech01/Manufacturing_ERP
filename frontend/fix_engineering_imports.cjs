const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, 'src', 'pages', 'engineering');
const files = fs.readdirSync(directory).filter(f => f.endsWith('.tsx'));

for (const filename of files) {
  if (filename === 'Bom.tsx' || filename === 'BomExplorer.tsx') continue;
  
  const filePath = path.join(directory, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  if (content.includes('engineeringApi as api')) continue;
  
  const lines = content.split('\n');
  let lastImportIdx = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      lastImportIdx = i;
    }
  }
  
  if (lastImportIdx >= 0) {
    const isUsingGetItems = content.includes('getItems') || content.includes('getItems(');
    
    const imports = [
      `import { engineeringApi as api } from '@/api/engineering'`
    ];
    
    if (isUsingGetItems) {
      imports.push(`import { getItems } from '@/api/masters'`);
    }
    
    lines.splice(lastImportIdx + 1, 0, ...imports);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    console.log(`Fixed ${filename}`);
  }
}
