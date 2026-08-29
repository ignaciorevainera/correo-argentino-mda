import { describe, it, expect, beforeEach, vi } from "vitest";

const selectMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@db/index", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: selectMock,
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: updateMock,
      })),
    })),
  },
}));

vi.mock("@db/schema", () => ({
  supportGuides: { id: "id", invgate_id: "invgate_id" },
  mesas: { invgateId: "invgate_id", active: "active" },
}));

vi.mock("@lib/auditLogger", () => ({
  logAdminAction: vi.fn(),
  logAdminActionStructured: vi.fn(),
}));

vi.mock("@lib/csrf", () => ({
  validateRequestCsrf: vi.fn(async () => true),
}));

vi.mock("@lib/rateLimit", () => ({
  checkSlidingRateLimit: vi.fn(() => true),
}));

import { POST } from "../../../src/pages/api/support-guides/assign";
import { logAdminActionStructured } from "@lib/auditLogger";

const user = {
  id: 1,
  username: "supervisor1",
  role: "supervisor",
  helpdeskId: null,
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/support-guides/assign", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const locals = { user } as unknown as App.Locals;

describe("POST /api/support-guides/assign (audit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("calls logAdminActionStructured with entityType, entityId and before/after", async () => {
    selectMock
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([{ legacyName: "Guia X", invgate_id: 3 }]);
    updateMock.mockResolvedValue({ changes: 1 });

    const response = await POST({
      request: makeRequest({ recordId: 10, invgate_id: 99 }),
      locals,
    } as any);
    expect(response.status).toBe(200);

    expect(logAdminActionStructured).toHaveBeenCalledWith(
      "supervisor1",
      expect.stringContaining("Asigno la mesa"),
      "support_guide",
      10,
      { invgate_id: 3 },
      { invgate_id: 99 },
    );
  });
});
