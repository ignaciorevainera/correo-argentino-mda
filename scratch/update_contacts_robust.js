import fs from 'fs';

function parseCSV(csv) {
  const lines = [];
  let currentLine = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ';' && !insideQuotes) {
      currentLine.push(currentCell);
      currentCell = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentLine.push(currentCell);
      lines.push(currentLine);
      currentLine = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  if (currentCell || currentLine.length > 0) {
    currentLine.push(currentCell);
    lines.push(currentLine);
  }
  return lines;
}

// Reading as utf8 because we detected c3 b3 for 'ó'
const csvData = fs.readFileSync('src/data/Oficinas Telegraficas (STS) (Servidores Dedicados y Operativos-Clientes-Impresoras)(Contactos).csv', 'utf8');
const parsed = parseCSV(csvData);
const rows = parsed.slice(1);

const contactMap = {};
rows.forEach(row => {
  if (row.length < 12) return;
  const nis = row[0].trim().replace(/"/g, '');
  if (!nis || nis === 'Total') return;
  
  const nombresStr = row[7] || '';
  const telefonosStr = row[8] || '';
  const horariosStr = row[9] || '';
  const email = row[10] || '';
  const observaciones = row[11] || '';

  const names = nombresStr.split('\n').map(s => s.trim()).filter(s => s);
  const phones = telefonosStr.split('\n').map(s => s.trim()).filter(s => s);
  const horarios = horariosStr.split('\n').map(s => s.trim()).filter(s => s);
  
  const contacts = [];
  const maxLines = Math.max(names.length, phones.length, horarios.length);
  
  if (maxLines > 0) {
    for (let i = 0; i < Math.max(1, names.length); i++) {
        contacts.push({
            name: names[i] || (i === 0 ? 'Contacto General' : ''),
            phone: phones[i] || (i === 0 ? phones.join(' / ') : ''),
            timeSlot: horarios[i] || (i === 0 ? horarios.join(' / ') : '')
        });
    }
  }

  contactMap[nis] = {
    email: email.trim(),
    notes: observaciones.trim(),
    contacts: contacts.filter(c => c.name || c.phone || c.timeSlot)
  };
});

const tsPath = 'src/data/mock_telegrafia.ts';
const tsContent = fs.readFileSync(tsPath, 'utf8');

const separator = /(\s*\{\s*\n\s*id:\s*["']teleg-)/;
const parts = tsContent.split(separator);

let result = parts[0];
let updateCount = 0;

for (let i = 1; i < parts.length; i += 2) {
  let objectContent = parts[i] + (parts[i+1] || '');
  
  const codeMatch = objectContent.match(/code:\s*["'](.*?)["']/);
  if (codeMatch) {
    const code = codeMatch[1];
    if (contactMap[code]) {
      updateCount++;
      const data = contactMap[code];
      
      // Replace email
      objectContent = objectContent.replace(/(email:\s*)(["'].*?["'])/, (m, p1) => `${p1}${JSON.stringify(data.email)}`);
      // Replace notes
      objectContent = objectContent.replace(/(notes:\s*)(["'].*?["'])/, (m, p1) => `${p1}${JSON.stringify(data.notes)}`);
      
      // Replace contacts
      let contactsStr = 'contacts: [';
      if (data.contacts.length > 0) {
          contactsStr += data.contacts.map(c => `\n      {\n        name: ${JSON.stringify(c.name)},\n        phone: ${JSON.stringify(c.phone)},\n        timeSlot: ${JSON.stringify(c.timeSlot)},\n      }`).join(',') + '\n    ]';
      } else {
          contactsStr += ']';
      }
      
      objectContent = objectContent.replace(/contacts:\s*\[[\s\S]*?\]/, contactsStr);
    }
  }
  result += objectContent;
}

fs.writeFileSync(tsPath, result, 'utf8');
console.log('Update complete. Total updated:', updateCount);
