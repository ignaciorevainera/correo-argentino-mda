import "dotenv/config";
import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { db } from "../src/db/index";
import { users, offices, sessions } from "../src/db/schema";
import { asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

let testUserId: number;
const username = `test_addr_${Date.now()}`;
const password = "TestPass1234";
let hashedPassword: string;
let createdOfficeCode: string | undefined;
let cachedSessionCookies: Awaited<
  ReturnType<BrowserContext["cookies"]>
> | null = null;

test.beforeAll(async () => {
  hashedPassword = await bcrypt.hash(password, 4);
  const [newUser] = await db
    .insert(users)
    .values({ username, password: hashedPassword, role: "admin" })
    .returning({ id: users.id });
  testUserId = newUser.id;
});

test.afterAll(async () => {
  if (createdOfficeCode) {
    await db
      .delete(offices)
      .where(eq(offices.code, createdOfficeCode))
      .catch(() => {});
  }
  if (!testUserId) return;
  await db.delete(sessions).where(eq(sessions.userId, testUserId));
  await db.delete(users).where(eq(users.id, testUserId));
});

async function loginAsAdmin(page: Page) {
  if (cachedSessionCookies && cachedSessionCookies.length > 0) {
    await page.context().addCookies(cachedSessionCookies);
    return;
  }
  const response = await page.request.post("/login", {
    form: { username, password },
  });
  expect(response.ok()).toBeTruthy();
  cachedSessionCookies = await page.context().cookies();
  expect(
    cachedSessionCookies.some((c) => c.name === "session_id"),
  ).toBeTruthy();
}

function deriveAddressQuery(address: string): string {
  const token = address.trim().split(/\s+/)[0];
  return token.length >= 3 ? token : address;
}

async function selectSharedAddressSuggestion(page: Page): Promise<number> {
  const officeRows = await db
    .select({ id: offices.id })
    .from(offices)
    .orderBy(asc(offices.id))
    .limit(1);
  test.skip(officeRows.length === 0, "No offices in current DB");
  const officeId = officeRows[0].id;

  const office = await db
    .select({ address: offices.address, provinceCode: offices.provinceCode })
    .from(offices)
    .where(eq(offices.id, officeId));
  const address = office[0]?.address;
  test.skip(!address, "First office has no address in current DB");

  const query = deriveAddressQuery(address!);
  const suggestionsResponse = await page.request.get(
    `/api/offices/search-address?q=${encodeURIComponent(query)}&provinceCode=${encodeURIComponent(office[0]?.provinceCode ?? "")}&excludeId=${officeId}`,
  );
  const suggestions = (await suggestionsResponse.json()) as {
    address: string;
    offices: unknown[];
  }[];
  const withOffices = suggestions.find((s) => s.offices.length > 0);
  test.skip(!withOffices, "No shared-address offices in current DB");

  await page.goto(`/oficinas/edit/${officeId}`);
  const input = page.locator("#input-address");
  await input.fill(query);
  const option = page
    .locator("#address-suggestions [role=option]", {
      hasText: withOffices!.address,
    })
    .first();
  await expect(option).toBeVisible();
  await option.click();

  return officeId;
}

test("address suggestions return unique canonical addresses", async ({
  page,
}) => {
  await loginAsAdmin(page);

  const officeRows = await db
    .select({ id: offices.id, address: offices.address })
    .from(offices)
    .orderBy(asc(offices.id))
    .limit(1);
  test.skip(officeRows.length === 0, "No offices in current DB");
  const officeId = officeRows[0].id;
  const officeAddress = officeRows[0].address;
  test.skip(!officeAddress, "No office with address in current DB");

  const trimmed = officeAddress!.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  const query = firstWord.length >= 3 ? firstWord : trimmed;
  test.skip(query.length < 3, "Address too short for query");

  const response = await page.request.get(
    `/api/offices/search-address?q=${encodeURIComponent(query)}&excludeId=${officeId}`,
  );
  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(Array.isArray(data)).toBeTruthy();
  expect(data.length).toBeGreaterThan(0);
  for (const suggestion of data) {
    expect(suggestion.address).toBe(suggestion.address.toUpperCase());
    expect(typeof suggestion.provinceCode).toBe("string");
    expect(typeof suggestion.provinceName).toBe("string");
    expect(typeof suggestion.regionName).toBe("string");
    expect(Array.isArray(suggestion.offices)).toBeTruthy();
    for (const office of suggestion.offices) {
      expect(typeof office.code).toBe("string");
      expect(typeof office.name).toBe("string");
      expect(office.provinceName).toBeUndefined();
    }
  }
});

test("rejects anonymous requests with 401", async ({ request }) => {
  const response = await request.get("/api/offices/search-address?q=santa");
  expect(response.status()).toBe(401);
});

test("returns empty array for query shorter than 3 chars", async ({ page }) => {
  await loginAsAdmin(page);
  const response = await page.request.get("/api/offices/search-address?q=ab");
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data).toEqual([]);
});

test("selecting existing address shows same-building preview below input", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await selectSharedAddressSuggestion(page);

  await expect(page.locator("#address-building-preview")).toBeVisible();
  await expect(page.locator("#address-building-confirmed")).toBeVisible();
  await expect(
    page.locator("#address-building-preview [data-sibling-office]").first(),
  ).toBeVisible();
});

test("blocks save until shared-site confirmation is checked", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const officeId = await selectSharedAddressSuggestion(page);

  await expect(page.locator("#address-building-preview")).toBeVisible();
  await page.locator("#office-form button[type=submit]").first().click();

  await expect(page.locator("#address-building-confirmed")).not.toBeChecked();
  await expect(page).toHaveURL(new RegExp(`/oficinas/edit/${officeId}$`));
  await expect(page.locator("#global-toast-container")).toContainText(
    "Confirmá si las oficinas comparten sitio.",
  );
});

test("changing to unmatched address hides shared-site preview", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await selectSharedAddressSuggestion(page);

  await expect(page.locator("#address-building-preview")).toBeVisible();

  const input = page.locator("#input-address");
  await input.fill("DOMICILIO INEXISTENTE 999999");
  await expect(page.locator("#address-building-preview")).toBeHidden();
});

test("confirmed same-building save proceeds on create", async ({ page }) => {
  await loginAsAdmin(page);

  const officeRows = await db
    .select({ id: offices.id, provinceCode: offices.provinceCode })
    .from(offices)
    .orderBy(asc(offices.id))
    .limit(1);
  test.skip(officeRows.length === 0, "No offices in current DB");
  const officeId = officeRows[0].id;
  const province = officeRows[0].provinceCode;

  const office = await db
    .select({ address: offices.address })
    .from(offices)
    .where(eq(offices.id, officeId));
  const address = office[0]?.address;
  test.skip(!address, "First office has no address in current DB");

  const query = deriveAddressQuery(address!);
  const suggestionsResponse = await page.request.get(
    `/api/offices/search-address?q=${encodeURIComponent(query)}&provinceCode=${encodeURIComponent(province)}`,
  );
  const suggestions = (await suggestionsResponse.json()) as {
    address: string;
    offices: unknown[];
  }[];
  const withOffices = suggestions.find((s) => s.offices.length > 0);
  test.skip(!withOffices, "No shared-address offices in current DB");

  const code = `TEST${Date.now()}`;
  createdOfficeCode = code;

  await page.goto("/oficinas/create");
  await page.locator("#input-code").fill(code);
  await page.locator("#input-name").fill("TEST OFICINA");
  await page.locator("#select-provinceCode").selectOption({ value: province });

  const input = page.locator("#input-address");
  await input.fill(query);
  const option = page
    .locator("#address-suggestions [role=option]", {
      hasText: withOffices!.address,
    })
    .first();
  await expect(option).toBeVisible();
  await option.click();

  await expect(page.locator("#address-building-confirmed")).toBeVisible();
  await page.locator("#address-building-confirmed").check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#office-form button[type=submit]").first().click();

  await expect(page).toHaveURL(/\/oficinas$/);
  await expect(page.locator("#global-toast-container")).toContainText(
    "Oficina creada con éxito.",
  );
});

test("API failure shows non-blocking message and keeps manual entry", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.route("**/api/offices/search-address*", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await page.goto("/oficinas/create");
  await page.locator("#input-address").fill("SANTA");
  await expect(page.locator("#address-autocomplete-error")).toBeVisible();
  const input = page.locator("#input-address");
  await expect(input).toBeEnabled();
});

test("single-office suggestion shows NIS, name and province in label", async ({
  page,
}) => {
  await loginAsAdmin(page);

  const officeRows = await db
    .select({ id: offices.id, provinceCode: offices.provinceCode })
    .from(offices)
    .orderBy(asc(offices.id))
    .limit(1);
  test.skip(officeRows.length === 0, "No offices in current DB");
  const officeId = officeRows[0].id;
  const province = officeRows[0].provinceCode;

  let target:
    | {
        address: string;
        provinceName: string;
        offices: { code: string; name: string }[];
      }
    | undefined;
  for (const token of [
    "1 DE MAYO",
    "SANTA",
    "GENERAL",
    "RIVADAVIA",
    "BELGRANO",
    "AV SANTA",
  ]) {
    const params = new URLSearchParams({
      q: token,
      excludeId: String(officeId),
    });
    if (province) params.set("provinceCode", province);
    const res = await page.request.get(`/api/offices/search-address?${params}`);
    const data = (await res.json()) as {
      address: string;
      provinceName: string;
      offices: { code: string; name: string }[];
    }[];
    const found = (data || []).find((s) => s.offices.length === 1);
    if (found) {
      target = found;
      break;
    }
  }
  test.skip(!target, "No single-office suggestion in current DB");

  await page.goto(`/oficinas/edit/${officeId}`);
  const input = page.locator("#input-address");
  await input.fill(target!.address);
  const option = page
    .locator("#address-suggestions [role=option]", {
      hasText: target!.offices[0].code,
    })
    .first();
  await expect(option).toBeVisible();
  await expect(option).toContainText(target!.offices[0].name);
  await expect(option).toContainText(target!.provinceName);
});

test("selecting a suggestion without province auto-fills the province select", async ({
  page,
}) => {
  await loginAsAdmin(page);

  const res = await page.request.get(
    "/api/offices/search-address?q=1%20DE%20MAYO",
  );
  const suggestions = (await res.json()) as {
    address: string;
    provinceCode: string;
    provinceName: string;
    offices: unknown[];
  }[];
  const target = (suggestions || []).find((s) => s.offices.length > 0);
  test.skip(!target, "No address suggestions in current DB");

  await page.goto("/oficinas/create");
  const input = page.locator("#input-address");
  await input.fill(target!.address);
  const option = page
    .locator("#address-suggestions [role=option]", {
      hasText: `${target!.address} · ${target!.provinceName}`,
    })
    .first();
  await expect(option).toBeVisible();
  await option.click();

  await expect(page.locator("#select-provinceCode")).toHaveValue(
    target!.provinceCode,
  );
});

test("shows no-results feedback when province is selected", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const officeRows = await db
    .select({ provinceCode: offices.provinceCode })
    .from(offices)
    .orderBy(asc(offices.id))
    .limit(1);
  test.skip(officeRows.length === 0, "No offices in current DB");
  const province = officeRows[0].provinceCode;

  await page.goto("/oficinas/create");
  await page.locator("#select-provinceCode").selectOption({ value: province });
  await page.locator("#input-address").fill("ZZZZ INEXISTENTE 9999");

  const noResults = page.locator("#address-no-results");
  await expect(noResults).toBeVisible();
  await expect(noResults).toContainText("región/provincia seleccionada");
});

test("shows no-results feedback without province using shorter message", async ({
  page,
}) => {
  await loginAsAdmin(page);

  await page.goto("/oficinas/create");
  await page.locator("#input-address").fill("ZZZZ INEXISTENTE 9999");

  const noResults = page.locator("#address-no-results");
  await expect(noResults).toBeVisible();
  await expect(noResults).toContainText(
    "No se encontraron oficinas con esta dirección.",
  );
  await expect(noResults).not.toContainText("cambiá región/provincia");
});

test("does not show no-results feedback when suggestions exist", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const officeRows = await db
    .select({ address: offices.address, provinceCode: offices.provinceCode })
    .from(offices)
    .orderBy(asc(offices.id))
    .limit(1);
  const address = officeRows[0]?.address;
  test.skip(!address, "First office has no address in current DB");

  const query = deriveAddressQuery(address!);

  await page.goto("/oficinas/create");
  await page.locator("#input-address").fill(query);

  await expect(page.locator("#address-no-results")).toBeHidden();
  await expect(
    page.locator("#address-suggestions [role=option]").first(),
  ).toBeVisible();
});
