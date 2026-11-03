import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('extract-calidad CLI contract', () => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/extract-calidad.ps1');

  it('scripts/extract-calidad.ps1 must exist', () => {
    assert.doesNotThrow(() => {
      execFileSync('powershell', ['-NoProfile', '-Command', `Test-Path "${scriptPath}"`], { encoding: 'utf8' });
    });
  });

  it('supports -Help or shows parameters Month, Year, ExcelPath, OutputPath', () => {
    const cmd = `(Get-Command "${scriptPath}").Parameters.Keys`;
    const res = execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
    const keys = res.split(/\r?\n/).map(s => s.trim().toLowerCase());
    assert.ok(keys.includes('month'), 'Missing -Month parameter');
    assert.ok(keys.includes('year'), 'Missing -Year parameter');
    assert.ok(keys.includes('excelpath'), 'Missing -ExcelPath parameter');
    assert.ok(keys.includes('outputpath'), 'Missing -OutputPath parameter');
  });

  it('scripts/extract-calidad-septiembre.ps1 forwards to extract-calidad.ps1 with September default', () => {
    const legacyPath = path.resolve(process.cwd(), 'scripts/extract-calidad-septiembre.ps1');
    const cmd = `(Get-Command "${legacyPath}").Parameters.Keys`;
    const res = execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
    const keys = res.split(/\r?\n/).map(s => s.trim().toLowerCase());
    assert.ok(keys.includes('excelpath'), 'Missing -ExcelPath parameter in legacy wrapper');
    assert.ok(keys.includes('outputpath'), 'Missing -OutputPath parameter in legacy wrapper');
  });
});
