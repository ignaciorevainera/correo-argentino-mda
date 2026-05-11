const fs = require('fs');
const path = require('path');

const csvContactosPath = path.join(__dirname, '../src/data/Oficinas Telegraficas (STS) (Servidores Dedicados y Operativos-Clientes-Impresoras)(Contactos).csv');
const tsPath = path.join(__dirname, '../src/data/mock_telegrafia.ts');

function fixAccents(str) {
    if (!str) return '';
    return str
        .replace(/Telegraf\uFFFDa/g, 'Telegrafía')
        .replace(/Supervis\uFFFDn/g, 'Supervisión')
        .replace(/Direcci\uFFFDn/g, 'Dirección')
        .replace(/Mart\uFFFDn/g, 'Martín')
        .replace(/\uFFFDngel/g, 'Ángel')
        .replace(/Dar\uFFFDo/g, 'Darío')
        .replace(/Nu\uFFFDez/g, 'Nuñez')
        .replace(/Paran\uFFFDa/g, 'Paraná')
        .replace(/env\uFFFDa/g, 'envía')
        .replace(/m\uFFFDvil/g, 'móvil')
        .replace(/est\uFFFDa/g, 'está')
        .replace(/dia\uFFFDn/g, 'dián')
        .replace(/Guzm\uFFFDn/g, 'Guzmán')
        .replace(/Belgr\uFFFDn/g, 'Belgrán')
        .replace(/S\uFFFDenz/g, 'Sáenz')
        .replace(/Pe\uFFFDa/g, 'Peña')
        .replace(/Hern\uFFFDndez/g, 'Hernández')
        .replace(/Garc\uFFFDa/g, 'García')
        .replace(/Rodr\uFFFDguez/g, 'Rodríguez')
        .replace(/Joaqu\uFFFDn/g, 'Joaquín')
        .replace(/Le\uFFFDn/g, 'León')
        .replace(/Nicol\uFFFDs/g, 'Nicolás')
        .replace(/Adri\uFFFDn/g, 'Adrián')
        .replace(/Rub\uFFFDn/g, 'Rubén')
        .replace(/Sebasti\uFFFDn/g, 'Sebastián')
        .replace(/Far\uFFFDas/g, 'Farías')
        .replace(/D\uFFFDaz/g, 'Díaz')
        .replace(/Mar\uFFFDa/g, 'María')
        .replace(/Ram\uFFFDn/g, 'Ramón')
        .replace(/Iv\uFFFDn/g, 'Iván')
        .replace(/Andr\uFFFDs/g, 'Andrés')
        .replace(/Tom\uFFFDs/g, 'Tomás')
        .replace(/Juli\uFFFDn/g, 'Julián')
        .replace(/Germ\uFFFDn/g, 'Germán')
        .replace(/Bel\uFFFDn/g, 'Belén')
        .replace(/In\uFFFDs/g, 'Inés')
        .replace(/Luc\uFFFDa/g, 'Lucía')
        .replace(/Cristi\uFFFDn/g, 'Cristián')
        .replace(/Esteb\uFFFDn/g, 'Estebán')
        .replace(/Mat\uFFFDas/g, 'Matías')
        .replace(/Agust\uFFFDn/g, 'Agustín')
        .replace(/\uFFFD/g, ' '); 
}

function parseCSV(content) {
    const rows = [];
    let currentField = '';
    let currentLine = [];
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i+1];
        if (char === '"' && inQuotes && nextChar === '"') {
            currentField += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ';' && !inQuotes) {
            currentLine.push(currentField.trim());
            currentField = '';
        } else if (char === '\n' && !inQuotes) {
            currentLine.push(currentField.trim());
            rows.push(currentLine);
            currentLine = [];
            currentField = '';
        } else if (char === '\r' && !inQuotes) {
        } else {
            currentField += char;
        }
    }
    if (currentField || currentLine.length > 0) {
        currentLine.push(currentField.trim());
        rows.push(currentLine);
    }
    return rows;
}

const csvRaw = fs.readFileSync(csvContactosPath, 'utf8');
const rowsContactos = parseCSV(csvRaw);

const contactosMap = new Map();
rowsContactos.slice(1).forEach(row => {
    if (row.length < 1) return;
    const nis = row[0];
    const nombreStr = row[7] || '';
    const telefonoStr = row[8] || '';
    const horarioStr = row[9] || '';
    const email = row[10] || '';
    const notes = row[11] || '';

    const names = nombreStr.split('\n').map(s => s.trim()).filter(s => s);
    const phones = telefonoStr.split('\n').map(s => s.trim()).filter(s => s);
    const times = horarioStr.split('\n').map(s => s.trim()).filter(s => s);

    const maxLen = Math.max(names.length, phones.length, times.length);
    const contacts = [];
    
    for (let i = 0; i < maxLen; i++) {
        contacts.push({
            name: names[i] || '',
            phone: phones[i] || '',
            timeSlot: times[i] || ''
        });
    }
    contactosMap.set(nis, { email, notes, contacts });
});

let tsContent = fs.readFileSync(tsPath, 'utf8');

// Regex to find and replace email, notes, contacts
const blockRegex = /(code:\s*"(I\d{4}|CORR\d{1})",[\s\S]*?lng:\s*-?\d+(?:\.\d+)?,\s*\n\s*)email:\s*".*?",\s*\n\s*notes:\s*".*?",\s*\n\s*contacts:\s*\[[\s\S]*?\],(?=\s*\n\s*assets:)/g;

let matchCount = 0;
tsContent = tsContent.replace(blockRegex, (match, beforeBlock, code) => {
    matchCount++;
    if (!contactosMap.has(code)) {
        // Leave empty if not in CSV (e.g. CORR1)
        return `${beforeBlock}email: "",\n    notes: "",\n    contacts: [],`;
    }

    const cData = contactosMap.get(code);
    
    let emailStr = fixAccents(cData.email).replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
    let notesStr = fixAccents(cData.notes).replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
    
    let replacement = `${beforeBlock}email: "${emailStr}",\n    notes: "${notesStr}",\n    contacts: [\n`;
    
    cData.contacts.forEach(c => {
        let cName = fixAccents(c.name).replace(/"/g, '\\"').replace(/\n/g, ' ');
        let cPhone = fixAccents(c.phone).replace(/"/g, '\\"').replace(/\n/g, ' ');
        let cTimeSlot = fixAccents(c.timeSlot).replace(/"/g, '\\"').replace(/\n/g, ' ');
        
        replacement += `      {\n        name: "${cName}",\n        phone: "${cPhone}",\n        timeSlot: "${cTimeSlot}",\n      },\n`;
    });
    
    replacement += `    ],`;
    
    return replacement;
});

fs.writeFileSync(tsPath, tsContent, 'utf8');
console.log(`Successfully updated ${matchCount} offices.`);
