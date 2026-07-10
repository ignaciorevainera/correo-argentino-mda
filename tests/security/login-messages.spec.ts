import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { db } from '../../src/db/index';
import { users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

let testUserId: number;
const knownUsername = `test_loginmsg_${Date.now()}`;
const knownPassword = 'TestPass1234';

// Pre-computed bcrypt hash for test user
let hashedPassword: string;

test.beforeAll(async () => {
  hashedPassword = await bcrypt.hash(knownPassword, 4);

  const [newUser] = await db.insert(users).values({
    username: knownUsername,
    password: hashedPassword,
    role: 'agent',
  }).returning({ id: users.id });
  testUserId = newUser.id;
});

test.afterAll(async () => {
  await db.delete(users).where(eq(users.id, testUserId));
});

test.describe('S3.2 Login message enumeration', () => {
  test('wrong password returns generic message', async ({ request }) => {
    const response = await request.post('/login', {
      form: { username: knownUsername, password: 'WrongPassword!' },
      redirect: 'manual',
    });
    expect(response.status()).toBe(302);
    const location = response.headers()['location'] || '';
    expect(location).toContain('toast_msg=');
    expect(location).toContain(encodeURIComponent('Credenciales inválidas'));
    expect(location).not.toContain('Contraseña');
  });

  test('non-existent user returns same generic message', async ({ request }) => {
    const response = await request.post('/login', {
      form: { username: `nonexistent_${Date.now()}`, password: 'AnyPass123!' },
      redirect: 'manual',
    });
    expect(response.status()).toBe(302);
    const location = response.headers()['location'] || '';
    expect(location).toContain(encodeURIComponent('Credenciales inválidas'));
  });

  test('correct password returns success redirect', async ({ request }) => {
    const response = await request.post('/login', {
      form: { username: knownUsername, password: knownPassword },
      redirect: 'manual',
    });
    expect(response.status()).toBe(302);
    const location = response.headers()['location'] || '';
    // Successful login redirects to / (cleanBase) without toast_msg
    expect(location).not.toContain('toast_msg');
  });
});
