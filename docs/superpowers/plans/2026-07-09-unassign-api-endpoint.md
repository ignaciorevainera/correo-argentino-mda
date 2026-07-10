# Create Unassign Support Guides API Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new API endpoint at `src/pages/api/support-guides/unassign.ts` to unassign a support guide from InvGate (setting its `invgate_id` to `null`) and log the administrative action.

**Architecture:** A standard Astro API POST route that performs validation, checks permissions, executes a Drizzle update query, logs the action via `logAdminAction`, and returns a JSON response.

**Tech Stack:** Astro SSR, Drizzle ORM, TypeScript.

---

### Task 1: Create Endpoint File

**Files:**
- Create: `src/pages/api/support-guides/unassign.ts`

- [ ] **Step 1: Write the endpoint file with the requested code**

Create the file `src/pages/api/support-guides/unassign.ts` with the following content:

```typescript
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
import { logAdminAction } from "@lib/auditLogger";
import { jsonResponse } from "@lib/apiResponse";
import { ROLE_HIERARCHY } from "@lib/rbac";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || ROLE_HIERARCHY[user.role as keyof typeof ROLE_HIERARCHY] < ROLE_HIERARCHY.supervisor) {
    return jsonResponse({ error: "Acceso denegado" }, 403);
  }

  try {
    const body = await request.json();
    const recordId = Number(body.recordId);

    if (!recordId || isNaN(recordId)) {
      return jsonResponse({ error: "recordId es requerido y debe ser un numero" }, 400);
    }

    const [record] = await db
      .select({ helpDeskName: supportGuides.helpDeskName })
      .from(supportGuides)
      .where(eq(supportGuides.id, recordId));

    if (!record) {
      return jsonResponse({ error: "Registro no encontrado" }, 404);
    }

    await db
      .update(supportGuides)
      .set({ invgate_id: null })
      .where(eq(supportGuides.id, recordId));

    await logAdminAction(
      user.username || "sistema",
      `Desvinculo la mesa de ayuda "${record.helpDeskName}".`,
    );

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[unassign] Error:", err);
    return jsonResponse({ error: "Error interno al desvincular helpdesk" }, 500);
  }
};
```

---

### Task 2: Verify Compilation

- [ ] **Step 1: Run the build command**

Run: `npm run build`
Expected: Compilation completes successfully without TypeScript or build errors.
