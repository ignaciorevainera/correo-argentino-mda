import fs from 'fs';

const tsContent = fs.readFileSync('src/data/mock_telegrafia.ts', 'utf8');
const tsCodes = [...tsContent.matchAll(/code:\s*["'](.*?)["']/g)].map(m => m[1]);

console.log('TS Offices:', tsCodes.length);
console.log('Codes (first 100):', tsCodes.slice(0, 100));
console.log('Contains I1007?', tsCodes.includes('I1007'));
