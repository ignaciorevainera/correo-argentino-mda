import Database from 'better-sqlite3';

const db = new Database('./database/mda.db');

const regionColors = [
  { id: 'CABA', color: '#3b82f6' },
  { id: 'SUR', color: '#06b6d4' },
  { id: 'PBA-LP', color: '#f59e0b' },
  { id: 'NEA', color: '#10b981' },
  { id: 'NOA', color: '#8b5cf6' },
];

const updateStmt = db.prepare('UPDATE regions SET color = ? WHERE id = ?');

db.transaction(() => {
  for (const r of regionColors) {
    updateStmt.run(r.color, r.id);
  }
})();

console.log('Successfully updated region colors in the database.');
const updatedRegions = db.prepare('SELECT * FROM regions').all();
console.log('Updated regions:', updatedRegions);
