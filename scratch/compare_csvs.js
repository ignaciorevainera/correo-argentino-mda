import fs from 'fs';

function getCodes(path, filter) {
  const content = fs.readFileSync(path, 'latin1');
  return content.split('\n')
    .filter(l => l.includes(filter))
    .map(l => l.split(';')[0].replace(/"/g, '').trim());
}

const definitivoCodes = getCodes('src/data/Oficinas Telegraficas (STS) (Servidores Dedicados y Operativos-Clientes-Impresoras)(Definitivo).csv', ';"Server";');
const contactoCodes = getCodes('src/data/Oficinas Telegraficas (STS) (Servidores Dedicados y Operativos-Clientes-Impresoras)(Contactos).csv', ';"Server";');

console.log('Definitivo servers:', definitivoCodes.length);
console.log('Contactos servers:', contactoCodes.length);

const missingInContactos = definitivoCodes.filter(c => !contactoCodes.includes(c));
console.log('Missing in Contactos CSV:', missingInContactos);
