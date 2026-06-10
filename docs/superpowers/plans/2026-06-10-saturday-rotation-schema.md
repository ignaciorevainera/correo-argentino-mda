# Saturday Rotation Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the SQLite database schema in `src/db/schema.ts` to support Saturday rotations for agents and schedules, run migrations via drizzle-kit, and commit the changes.

**Architecture:** Add columns for Saturday rotation group and Saturday work shift to the `agents` table. Add a boolean override column to the `schedules` table. Add a new config table `saturdayRotationConfig` to keep track of rotation configuration parameters.

**Tech Stack:** Drizzle ORM, SQLite

---

### Task 1: Database Schema Modification

**Files:**
- Modify: `src/db/schema.ts` (Add `saturdayGroup` and `saturdayHorario` to `agents` table, add `isOverride` to `schedules` table, and append the `saturdayRotationConfig` table definition)

- [ ] **Step 1: Add saturday rotation group and horario columns to agents table**

Edit the `agents` table in `src/db/schema.ts` around line 221.
```typescript
  estadoExcepcionalAt: integer("estado_excepcional_at"),
  estadoExcepcionalMinutos: integer("estado_excepcional_minutos"),
  saturdayGroup: text("saturday_group"),
  saturdayHorario: text("saturday_horario"),
});
```

- [ ] **Step 2: Add isOverride column to schedules table**

Edit the `schedules` table in `src/db/schema.ts` around line 275.
```typescript
  entradaReal: text("entrada_real"),
  salidaReal: text("salida_real"),
  breakInicio: text("break_inicio"),
  breakFin: text("break_fin"),
  isOverride: integer("is_override", { mode: "boolean" }).default(false),
});
```

- [ ] **Step 3: Create and export the saturdayRotationConfig table**

Append the new table at the end of `src/db/schema.ts`.
```typescript
export const saturdayRotationConfig = sqliteTable("saturday_rotation_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rotationOrder: text("rotation_order").notNull().default("A,B,C,D"),
  startDate: text("start_date").notNull().default("2026-06-06"),
  startGroup: text("start_group").notNull().default("A"),
});
```

- [ ] **Step 4: Verify schema.ts compile/syntax is correct**

Run: `npx tsc --noEmit`
Expected: Compile succeeds with no typescript errors in the modified file.

---

### Task 2: Schema Migration & Commit

**Files:**
- Modify: `src/db/schema.ts`
- Run DB Migration: `npm run db:push`
- Git Commit: `git add src/db/schema.ts && git commit -m "db: add saturday rotation columns and config table"`

- [ ] **Step 1: Apply schema migration**

Run the migration command:
Run: `npm run db:push`
Expected: drizzle-kit pushes updates to the SQLite database successfully.

- [ ] **Step 2: Commit database modifications**

Run: `git add src/db/schema.ts && git commit -m "db: add saturday rotation columns and config table"`
Expected: File `src/db/schema.ts` is committed with message "db: add saturday rotation columns and config table".
