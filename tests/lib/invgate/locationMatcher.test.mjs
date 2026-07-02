import assert from "node:assert/strict";
import { parseInvgateLocationName, matchLocations } from "../../../src/lib/invgate/locationMatcher.js";

// Test parseInvgateLocationName
{
  const input = "SUC. SANTA ROSA (L6300) (L6309AAD) CC_71011101";
  const parsed = parseInvgateLocationName(input);
  assert.equal(parsed.displayName, "SUC. SANTA ROSA");
  assert.equal(parsed.nis, "L6300");
  assert.equal(parsed.cp, "L6309AAD");
  assert.equal(parsed.cc, "71011101");
  assert.equal(parsed.address, null);
}

{
  const input = "ALMACEN DE SUSTRATOS (L0002 ) (L1234ABC)";
  const parsed = parseInvgateLocationName(input);
  assert.equal(parsed.displayName, "ALMACEN DE SUSTRATOS");
  assert.equal(parsed.nis, "L0002");
  assert.equal(parsed.cp, "L1234ABC");
  assert.equal(parsed.cc, null);
  assert.equal(parsed.address, null);
}

{
  const input = "AL COMPRAR (X1111) CC_8888";
  const parsed = parseInvgateLocationName(input);
  assert.equal(parsed.displayName, "AL COMPRAR");
  assert.equal(parsed.nis, "X1111");
  assert.equal(parsed.cp, null);
  assert.equal(parsed.cc, "8888");
  assert.equal(parsed.address, null);
}

{
  const input = "SALA DE CONTROL";
  const parsed = parseInvgateLocationName(input);
  assert.equal(parsed.displayName, "SALA DE CONTROL");
  assert.equal(parsed.nis, null);
  assert.equal(parsed.cp, null);
  assert.equal(parsed.cc, null);
  assert.equal(parsed.address, null);
}

{
  const input = "SUC. SANTA ROSA (NO_NIS) CC_71011101";
  const parsed = parseInvgateLocationName(input);
  assert.equal(parsed.displayName, "SUC. SANTA ROSA");
  assert.equal(parsed.nis, null);
  assert.equal(parsed.cp, null);
  assert.equal(parsed.cc, "71011101");
  assert.equal(parsed.address, null);
}

{
  const input = "ALPACHIRI - SUC POR FAX (L0002 ) 25 De Mayo 200 (L6309AAD) CC_71011101";
  const parsed = parseInvgateLocationName(input);
  assert.equal(parsed.displayName, "ALPACHIRI - SUC POR FAX");
  assert.equal(parsed.nis, "L0002");
  assert.equal(parsed.cp, "L6309AAD");
  assert.equal(parsed.cc, "71011101");
  assert.equal(parsed.address, "25 De Mayo 200");
}

// Test matchLocations
{
  const invgateLocations = [
    { id: 1, name: "SUC. SANTA ROSA (L6300) (L6309AAD) CC_71011101", parent_id: null, total: 1 },
    { id: 2, name: "ALMACEN (L0002)", parent_id: 4, total: 2 },
    { id: 3, name: "SALA DE CONTROL", parent_id: 4, total: 0 },
    { id: 4, name: "Centro NEA", parent_id: null, total: 0 }
  ];

  const allOfficeCodes = new Map([
    ["L6300", { name: "Santa Rosa", address: "Av San Martin 123" }],
    ["L9999", { name: "Other Office", address: "Calle Falsa 123" }]
  ]);

  const result = matchLocations(invgateLocations, allOfficeCodes);

  // Total stats checking
  assert.equal(result.stats.totalInvgate, 3);
  assert.equal(result.stats.totalMda, 2);
  assert.equal(result.stats.matched, 1);
  assert.equal(result.stats.unmatchedInvgate, 2);

  // Results list checking
  assert.equal(result.results.length, 3);

  // First item: matched
  assert.equal(result.results[0].invgateLocation.id, 1);
  assert.equal(result.results[0].invgateLocation.nis, "L6300");
  assert.equal(result.results[0].matched, true);
  assert.equal(result.results[0].officeCode, "L6300");
  assert.equal(result.results[0].mdaOffice.name, "Santa Rosa");

  // Second item: NIS present but unmatched
  assert.equal(result.results[1].invgateLocation.id, 2);
  assert.equal(result.results[1].invgateLocation.nis, "L0002");
  assert.equal(result.results[1].matched, false);
  assert.equal(result.results[1].officeCode, null);
  assert.equal(result.results[1].mdaOffice, null);

  // Third item: no NIS, unmatched
  assert.equal(result.results[2].invgateLocation.id, 3);
  assert.equal(result.results[2].invgateLocation.nis, null);
  assert.equal(result.results[2].matched, false);
  assert.equal(result.results[2].officeCode, null);
  assert.equal(result.results[2].mdaOffice, null);
}

console.log("All locationMatcher tests passed!");
