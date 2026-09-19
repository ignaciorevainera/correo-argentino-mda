import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildQueryString,
  updateBrowserUrl,
  updateCsvExportHref,
} from "./clientUrlSync";

describe("buildQueryString", () => {
  it("builds query string omitting null, undefined, empty, and 'all' values", () => {
    const result = buildQueryString({
      search: "test",
      role: "all",
      status: "",
      department: null,
      page: undefined,
      limit: "10",
    });
    expect(result).toBe("search=test&limit=10");
  });

  it("returns empty string when all values are omitted", () => {
    const result = buildQueryString({
      role: "all",
      status: "",
      department: null,
      page: undefined,
    });
    expect(result).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(buildQueryString({})).toBe("");
  });

  it("properly encodes query parameters", () => {
    const result = buildQueryString({
      search: "john doe",
      filter: "a&b",
    });
    expect(result).toBe("search=john+doe&filter=a%26b");
  });
});

describe("updateBrowserUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not throw when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(() => updateBrowserUrl("search=test")).not.toThrow();
  });

  it("updates window.history.replaceState safely with queryString", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { pathname: "/admin/users" },
      history: { replaceState },
    });

    updateBrowserUrl("search=test&limit=10");

    expect(replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/admin/users?search=test&limit=10"
    );
  });

  it("updates window.history.replaceState safely when queryString has leading question mark", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { pathname: "/admin/users" },
      history: { replaceState },
    });

    updateBrowserUrl("?search=test");

    expect(replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/admin/users?search=test"
    );
  });

  it("updates window.history.replaceState with only pathname when queryString is empty", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { pathname: "/admin/users" },
      history: { replaceState },
    });

    updateBrowserUrl("");

    expect(replaceState).toHaveBeenCalledWith({}, "", "/admin/users");
  });
});

describe("updateCsvExportHref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not throw when document is undefined", () => {
    vi.stubGlobal("document", undefined);
    expect(() =>
      updateCsvExportHref("export-btn", "/api/export", "search=test")
    ).not.toThrow();
  });

  it("updates an anchor element href with base endpoint and queryString", () => {
    const setAttribute = vi.fn();
    const mockElement = { setAttribute };
    vi.stubGlobal("document", {
      getElementById: vi.fn((id: string) =>
        id === "export-btn" ? mockElement : null
      ),
    });

    updateCsvExportHref("export-btn", "/api/export/users", "search=test");

    expect(setAttribute).toHaveBeenCalledWith(
      "href",
      "/api/export/users?search=test"
    );
  });

  it("updates anchor href without query string when queryString is empty", () => {
    const setAttribute = vi.fn();
    const mockElement = { setAttribute };
    vi.stubGlobal("document", {
      getElementById: vi.fn((id: string) =>
        id === "export-btn" ? mockElement : null
      ),
    });

    updateCsvExportHref("export-btn", "/api/export/users", "");

    expect(setAttribute).toHaveBeenCalledWith("href", "/api/export/users");
  });

  it("handles base endpoint that already contains query parameters", () => {
    const setAttribute = vi.fn();
    const mockElement = { setAttribute };
    vi.stubGlobal("document", {
      getElementById: vi.fn((id: string) =>
        id === "export-btn" ? mockElement : null
      ),
    });

    updateCsvExportHref(
      "export-btn",
      "/api/export/users?type=active",
      "search=test"
    );

    expect(setAttribute).toHaveBeenCalledWith(
      "href",
      "/api/export/users?type=active&search=test"
    );
  });

  it("handles queryString with leading question mark correctly", () => {
    const setAttribute = vi.fn();
    const mockElement = { setAttribute };
    vi.stubGlobal("document", {
      getElementById: vi.fn((id: string) =>
        id === "export-btn" ? mockElement : null
      ),
    });

    updateCsvExportHref("export-btn", "/api/export/users", "?search=test");

    expect(setAttribute).toHaveBeenCalledWith(
      "href",
      "/api/export/users?search=test"
    );
  });

  it("does not throw or fail when element is not found", () => {
    vi.stubGlobal("document", {
      getElementById: vi.fn(() => null),
    });

    expect(() =>
      updateCsvExportHref("missing-btn", "/api/export/users", "search=test")
    ).not.toThrow();
  });
});
