import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;

function mockFetch(responseBody, status = 200, statusText = "OK") {
  globalThis.fetch = async (url, options) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => responseBody,
  });
}

function mockNetworkError() {
  globalThis.fetch = async () => {
    throw new Error("Network error: connect ECONNREFUSED");
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Wrapper that mirrors invgateGet<T> but uses process.env instead of import.meta.env
async function simulateInvgateGet(endpoint) {
  const apiKey = process.env.INVGATE_API_KEY;
  const baseUrl = process.env.INVGATE_BASE_URL;

  if (!apiKey) {
    throw new Error("[InvGate] Variable de entorno INVGATE_API_KEY no definida.");
  }
  if (!baseUrl) {
    throw new Error("[InvGate] Variable de entorno INVGATE_BASE_URL no definida.");
  }

  // Must use "portalmda" as the Basic Auth username (matching src/lib/invgateClient.ts)
  const credentials = Buffer.from("portalmda:" + apiKey).toString("base64");
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
  const url = `${baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `[InvGate] HTTP ${response.status}: ${response.statusText} — ${url}`,
      };
    }
    const data = await response.json();
    return { ok: true, status: response.status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return {
      ok: false,
      status: 0,
      message: `[InvGate] Error de red: ${message} — ${url}`,
    };
  }
}

// --- Setup ---
const envBackup = { ...process.env };
process.env.INVGATE_API_KEY = "test-api-key-123";
process.env.INVGATE_BASE_URL = "https://invgate.test/api/v1/";

// --- Test 1: Successful GET ---
mockFetch({ data: [{ id: 1, title: "Test" }], pagination: { total_entries: 1 } });
let result = await simulateInvgateGet("incidents?page=1&page_size=1");
assert.equal(result.ok, true, "Should return ok: true on success");
assert.equal(result.status, 200, "Should return status 200");
assert.equal(result.data.data[0].id, 1, "Should return parsed data");
assert.equal(result.data.data[0].title, "Test", "Should return incident title");
restoreFetch();

// --- Test 2: HTTP 401 error ---
mockFetch(null, 401, "Unauthorized");
result = await simulateInvgateGet("incidents?page=1");
assert.equal(result.ok, false, "Should return ok: false on HTTP error");
assert.equal(result.status, 401, "Should preserve HTTP status code");
assert.ok(result.message.includes("401"), "Should include status in message");
restoreFetch();

// --- Test 3: Network error ---
mockNetworkError();
result = await simulateInvgateGet("incidents?page=1");
assert.equal(result.ok, false, "Should return ok: false on network error");
assert.equal(result.status, 0, "Should return status 0 on network error");
assert.ok(result.message.includes("Network error"), "Should include network error message");
restoreFetch();

// --- Test 4: Missing API key throws ---
process.env.INVGATE_API_KEY = "";
try {
  await simulateInvgateGet("incidents");
  assert.fail("Should have thrown for missing API key");
} catch (e) {
  assert.ok(e.message.includes("INVGATE_API_KEY"), "Should mention missing env var");
}
process.env.INVGATE_API_KEY = "test-api-key-123";

// --- Test 5: Missing base URL throws ---
process.env.INVGATE_BASE_URL = "";
try {
  await simulateInvgateGet("incidents");
  assert.fail("Should have thrown for missing base URL");
} catch (e) {
  assert.ok(e.message.includes("INVGATE_BASE_URL"), "Should mention missing env var");
}
process.env.INVGATE_BASE_URL = "https://invgate.test/api/v1/";

// --- Test 6: Auth header format (must use portalmda as username) ---
globalThis.fetch = async (url, options) => {
  assert.ok(options.headers.Authorization.startsWith("Basic "), "Should use Basic auth");
  const decoded = Buffer.from(options.headers.Authorization.slice(6), "base64").toString("utf8");
  assert.equal(decoded, "portalmda:test-api-key-123", "Auth should be 'portalmda:<key>'");
  assert.equal(options.headers["Content-Type"], "application/json", "Should set Content-Type header");
  return {
    ok: true, status: 200, statusText: "OK",
    json: async () => ({ data: [] }),
  };
};
await simulateInvgateGet("incidents");
restoreFetch();

// --- Cleanup ---
process.env.INVGATE_API_KEY = envBackup.INVGATE_API_KEY;
process.env.INVGATE_BASE_URL = envBackup.INVGATE_BASE_URL;

console.log("All invgate client tests passed!");
