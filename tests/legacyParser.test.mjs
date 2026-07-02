import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonPayload } from "../src/lib/inventory/legacyParser.ts";

test("parseJsonPayload should include cubic terminals (BXXXXZACW)", () => {
  const validNisSet = new Set(["B1842"]);
  
  const payload = {
    data: [
      {
        hostname: "B1842ZACW01",
        mac: "00:11:22:33:44:55",
        IP: "10.0.0.1",
        nis: "B1842"
      },
      {
        hostname: "B1842ZACS02",
        mac: "00:11:22:33:44:56",
        IP: "10.0.0.2",
        nis: "B1842"
      }
    ]
  };

  const records = parseJsonPayload(payload, validNisSet);
  
  assert.equal(records.length, 2, "Both terminals should be included");
  assert.equal(records[0].hostname, "B1842ZACW01");
  assert.equal(records[1].hostname, "B1842ZACS02");
});
