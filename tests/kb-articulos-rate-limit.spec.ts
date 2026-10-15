import "dotenv/config";
import {
  expect,
  test,
  type APIResponse,
  type BrowserContext,
} from "@playwright/test";
import { setSessionCookie } from "./helpers/auth";
import {
  KbTestFixture,
  readCsrfToken,
  uniqueToken,
  type KbTestMesa,
} from "./helpers/kb";

const REDIRECT = 302;
const LIMIT = 20;
const CREATE_PATH = "/base-conocimiento/create";
const LIST_PATH = "/base-conocimiento";
const THROTTLED_MESSAGE = "Demasiadas operaciones. Probá en unos minutos.";

let fixture: KbTestFixture;
let mesa: KbTestMesa;

test.beforeEach(async () => {
  fixture = new KbTestFixture();
  mesa = await fixture.createMesa();
});

test.afterEach(async () => {
  await fixture.cleanup();
});

const editPath = (articleId: number) => `/base-conocimiento/edit/${articleId}`;

const toResult = (response: APIResponse) => {
  const locationHeader = response.headers().location;
  return {
    status: response.status(),
    location: locationHeader
      ? new URL(
          locationHeader,
          test.info().project.use.baseURL ?? "http://localhost:4321",
        )
      : null,
  };
};

const postCreate = async (
  context: BrowserContext,
  csrfToken: string,
  helpdeskId: number,
) => {
  const response = await context.request.post(CREATE_PATH, {
    form: {
      title: `Rate ${uniqueToken()}`,
      category: "",
      content: `Contenido ${uniqueToken()}`,
      status: "draft",
      helpdeskId: String(helpdeskId),
      csrf_token: csrfToken,
    },
    maxRedirects: 0,
  });
  return toResult(response);
};

const postEdit = async (
  context: BrowserContext,
  articleId: number,
  csrfToken: string,
  fields: { title: string; content: string; category?: string; status?: string },
) => {
  const response = await context.request.post(editPath(articleId), {
    form: {
      title: fields.title,
      category: fields.category ?? "",
      content: fields.content,
      status: fields.status ?? "published",
      csrf_token: csrfToken,
    },
    maxRedirects: 0,
  });
  return toResult(response);
};

const isThrottled = (result: { location: URL | null }) =>
  result.location?.searchParams.get("toast_msg") === THROTTLED_MESSAGE;

test("el alta de artículos corta al usuario en el límite", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);
  const csrfToken = await readCsrfToken(page, CREATE_PATH);

  let indiceThrottle = -1;
  for (let i = 0; i < LIMIT + 1; i += 1) {
    const result = await postCreate(context, csrfToken, mesa.invgateId);
    if (isThrottled(result)) {
      indiceThrottle = i;
      break;
    }
    expect(result.status).toBe(REDIRECT);
  }

  expect(indiceThrottle).toBe(LIMIT);
});

test("la edición de artículos corta al usuario en el límite", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  const article = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo rate ${uniqueToken()}`,
  });
  await setSessionCookie(context, admin.signedSessionId);
  const csrfToken = await readCsrfToken(page, editPath(article.id));

  let indiceThrottle = -1;
  for (let i = 0; i < LIMIT + 1; i += 1) {
    const result = await postEdit(context, article.id, csrfToken, {
      title: article.title,
      content: article.content,
      category: article.category ?? "",
      status: article.status,
    });
    if (isThrottled(result)) {
      indiceThrottle = i;
      break;
    }
    expect(result.status).toBe(REDIRECT);
  }

  expect(indiceThrottle).toBe(LIMIT);
});

test("create y edit comparten un único presupuesto por usuario", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  const articuloA = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo A ${uniqueToken()}`,
  });
  const articuloB = await fixture.createArticle({
    mesa,
    authorUserId: admin.userId,
    title: `Artículo B ${uniqueToken()}`,
  });
  await setSessionCookie(context, admin.signedSessionId);

  const csrfCreate = await readCsrfToken(page, CREATE_PATH);
  const csrfEditA = await readCsrfToken(page, editPath(articuloA.id));
  const csrfEditB = await readCsrfToken(page, editPath(articuloB.id));

  const editA = {
    title: articuloA.title,
    content: articuloA.content,
    category: articuloA.category ?? "",
    status: articuloA.status,
  };
  const editB = {
    title: articuloB.title,
    content: articuloB.content,
    category: articuloB.category ?? "",
    status: articuloB.status,
  };

  for (let i = 0; i < 7; i += 1) {
    expect(
      isThrottled(await postCreate(context, csrfCreate, mesa.invgateId)),
    ).toBe(false);
  }
  for (let i = 0; i < 7; i += 1) {
    expect(
      isThrottled(await postEdit(context, articuloA.id, csrfEditA, editA)),
    ).toBe(false);
  }
  for (let i = 0; i < 6; i += 1) {
    expect(
      isThrottled(await postEdit(context, articuloB.id, csrfEditB, editB)),
    ).toBe(false);
  }

  const cortado = await postCreate(context, csrfCreate, mesa.invgateId);
  expect(cortado.status).toBe(REDIRECT);
  expect(isThrottled(cortado)).toBe(true);

  const cortadoEdit = await postEdit(
    context,
    articuloA.id,
    csrfEditA,
    editA,
  );
  expect(cortadoEdit.status).toBe(REDIRECT);
  expect(isThrottled(cortadoEdit)).toBe(true);
});

test("un segundo usuario no hereda el corte del primero", async ({
  context,
  page,
}) => {
  const primero = await fixture.createUser("admin", mesa);
  const segundo = await fixture.createUser("admin", mesa);

  await setSessionCookie(context, primero.signedSessionId);
  const csrfPrimero = await readCsrfToken(page, CREATE_PATH);
  for (let i = 0; i < LIMIT + 1; i += 1) {
    await postCreate(context, csrfPrimero, mesa.invgateId);
  }

  await setSessionCookie(context, segundo.signedSessionId);
  const csrfSegundo = await readCsrfToken(page, CREATE_PATH);
  const resultado = await postCreate(context, csrfSegundo, mesa.invgateId);
  expect(resultado.status).toBe(REDIRECT);
  expect(resultado.location?.pathname).toBe(LIST_PATH);
  expect(resultado.location?.searchParams.get("toast_msg")).toBe(
    "Artículo creado con éxito.",
  );
  expect(isThrottled(resultado)).toBe(false);
});

test("los GET al formulario no consumen el presupuesto de escritura", async ({
  context,
  page,
}) => {
  const admin = await fixture.createUser("admin", mesa);
  await setSessionCookie(context, admin.signedSessionId);

  for (let i = 0; i < LIMIT; i += 1) {
    const response = await context.request.get(CREATE_PATH);
    expect(response.status()).toBe(200);
  }

  const csrfToken = await readCsrfToken(page, CREATE_PATH);
  const resultado = await postCreate(context, csrfToken, mesa.invgateId);
  expect(resultado.status).toBe(REDIRECT);
  expect(isThrottled(resultado)).toBe(false);
});
