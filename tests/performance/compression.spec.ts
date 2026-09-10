import { test, expect } from "@playwright/test";

test("login page HTML is gzip-compressed", async ({ request }) => {
  const res = await request.get("/login", {
    headers: { "accept-encoding": "gzip" },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-encoding"]).toContain("gzip");
});

test("global CSS asset is gzip-compressed", async ({ request }) => {
  const html = await (await request.get("/login")).text();
  const match = html.match(/href="([^"]+\.css)"/);
  expect(match).not.toBeNull();
  const cssUrl = match![1];
  const res = await request.get(cssUrl, {
    headers: { "accept-encoding": "gzip" },
  });
  expect(res.headers()["content-encoding"]).toContain("gzip");
});
