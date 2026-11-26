import "dotenv/config";
import { expect, test } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAppsDir } from "../src/lib/storage";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
  type TestUser,
} from "./helpers/auth";

const FILE_SIZE = 64 * 1024 * 1024;

let user: TestUser;
let filename: string;
let filePath: string;
let sha256: string;

test.beforeAll(async () => {
  user = await createTestUserAndSession("agent");
  filename = `e2e-download-${randomUUID()}.bin`;
  fs.mkdirSync(getAppsDir(), { recursive: true });
  filePath = path.join(getAppsDir(), filename);
  const hash = createHash("sha256");
  const fd = fs.openSync(filePath, "w");
  for (let written = 0; written < FILE_SIZE; written += 1024 * 1024) {
    const chunk = randomBytes(1024 * 1024);
    hash.update(chunk);
    fs.writeSync(fd, chunk);
  }
  fs.closeSync(fd);
  sha256 = hash.digest("hex");
});

test.afterAll(async () => {
  fs.rmSync(filePath, { force: true });
  await cleanupTestUser(user.userId, user.sessionId);
});

test("descarga completa e íntegra de un archivo grande", async ({
  context,
}) => {
  await setSessionCookie(context, user.signedSessionId);
  const baseURL = test.info().project.use.baseURL!;
  const response = await context.request.get(
    `${baseURL}/api/download/${filename}`,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain(filename);
  const body = await response.body();
  expect(body.byteLength).toBe(FILE_SIZE);
  expect(createHash("sha256").update(body).digest("hex")).toBe(sha256);
});

test("sin sesión no se puede descargar", async ({ playwright }) => {
  const baseURL = test.info().project.use.baseURL!;
  const anon = await playwright.request.newContext({ baseURL });
  const response = await anon.get(`/api/download/${filename}`, {
    maxRedirects: 0,
  });
  expect(response.status()).not.toBe(200);
  await anon.dispose();
});
