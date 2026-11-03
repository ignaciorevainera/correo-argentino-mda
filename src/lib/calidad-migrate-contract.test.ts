import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('migrate-quality-audits CLI & architecture contract', () => {
  const genericScript = path.resolve(process.cwd(), 'scripts/migrate-quality-audits.mts');
  const legacyScript = path.resolve(process.cwd(), 'scripts/migrate-september-quality-audits.mts');

  it('scripts/migrate-quality-audits.mts must exist', () => {
    assert.ok(existsSync(genericScript), 'Missing scripts/migrate-quality-audits.mts');
  });

  it('generic script supports dynamic target month and flags', () => {
    const content = readFileSync(genericScript, 'utf8');
    assert.ok(content.includes('--json') || content.includes('--file'), 'Must accept custom json file');
    assert.ok(content.includes('--month'), 'Must accept --month argument');
    assert.ok(content.includes('--year'), 'Must accept --year argument');
    assert.ok(content.includes('--apply'), 'Must support --apply flag');
    assert.ok(content.includes('wal-backup'), 'Must retain WAL-safe backup');
  });

  it('legacy script forwards or acts as September alias', () => {
    assert.ok(existsSync(legacyScript), 'Legacy script must exist for backward compatibility');
    const content = readFileSync(legacyScript, 'utf8');
    assert.ok(
      content.includes('migrate-quality-audits') || content.includes('09-2026'),
      'Legacy script must route to generic script or preserve 09-2026 default'
    );
  });
});
