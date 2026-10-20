import { afterEach, describe, expect, it, vi } from "vitest";
import { getInternalOrigin } from "../../src/lib/internalOrigin";

describe("getInternalOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefiere INTERNAL_ORIGIN y quita el trailing slash", () => {
    vi.stubEnv("INTERNAL_ORIGIN", "http://127.0.0.1:4321/");
    expect(getInternalOrigin()).toBe("http://127.0.0.1:4321");
  });

  it("cae a loopback con el PORT del proceso", () => {
    vi.stubEnv("INTERNAL_ORIGIN", "");
    delete process.env.INTERNAL_ORIGIN;
    vi.stubEnv("PORT", "5555");
    expect(getInternalOrigin()).toBe("http://127.0.0.1:5555");
  });

  it("cae a puerto 4321 cuando PORT no esta definido", () => {
    vi.stubEnv("INTERNAL_ORIGIN", "");
    delete process.env.INTERNAL_ORIGIN;
    vi.stubEnv("PORT", "");
    delete process.env.PORT;
    expect(getInternalOrigin()).toBe("http://127.0.0.1:4321");
  });

  it("en dev usa el origin real del request cuando el puerto es custom", () => {
    vi.stubEnv("INTERNAL_ORIGIN", "");
    delete process.env.INTERNAL_ORIGIN;
    vi.stubEnv("PORT", "");
    delete process.env.PORT;

    const request = new Request(
      "http://localhost:4323/api/cronograma/export.png?month=2026-09",
    );
    expect(getInternalOrigin(request)).toBe("http://localhost:4323");
  });
});
