# Saturday Shift Rotation Design Spec

**Date**: 2026-06-10
**Author**: Senior Fullstack Developer
**Status**: Approved

## 1. Goal Description

Implement a Saturday shift rotation feature for the help desk schedule (Cronograma) in the Correo Argentino MDA application. This logic applies strictly to Saturdays, which are always "Home Office" (HO) modality. The operational timeframe is 07:00 to 13:00, and operators can be assigned to modular sub-schedules (e.g. 07:00-10:00).

## 2. Requirements & Rules
- **View Switcher**: Add a "Grupos" button to the existing switcher near "Mensual/Diario".
- **Management Section**: A new view showing 4 preconfigured groups ("A", "B", "C", "D").
- **Rotation Configuration**: Option to define the rotation order (e.g., A > B > C > D) and starting point (start date and active group for that date).
- **Group Membership**: Add/remove operators (agents) inside each group.
- **Modular Sub-schedules**: Set a modular schedule (e.g., 07:00-10:00) per operator within the group. Must be validated to be within the 07:00-13:00 Saturday window.
- **Dynamic Rotation**: Dynamically compute future and past Saturdays based on the starting point and rotation order.
- **Schedule Population**: Saturdays populated automatically in the calendar with "HO" status and the specific modular sub-schedule.
- **Override Precedence**: If a manual override is saved in the database for a Saturday (represented by `isOverride: true` in the `schedules` table), it takes precedence over the dynamic rotation defaults.
- **Calendar Click Redirection**: Clicking on a Saturday cell assigned by the rotation format redirects/switches the user directly to the "Grupos" view.

## 3. Technical Design

### 3.1. Database Schema Changes (`src/db/schema.ts`)

- **Table `agents` additions**:
  - `saturdayGroup`: text (nullable) - stores `'A' | 'B' | 'C' | 'D'`
  - `saturdayHorario`: text (nullable) - stores modular sub-schedule, e.g., `'07:00 - 10:00'`

- **Table `schedules` additions**:
  - `isOverride`: integer/boolean (default `false`) - set to `true` when a manual edit is saved

- **New Table `saturday_rotation_config`**:
  - `id`: integer primary key (autoIncrement)
  - `rotationOrder`: text (not null, default `'A,B,C,D'`)
  - `startDate`: text (not null, default `'2026-06-06'`)
  - `startGroup`: text (not null, default `'A'`)

### 3.2. Saturday Active Group Calculation

Given:
- Config: `startDateStr` (e.g., `'2026-06-06'`), `startGroup` (e.g., `'A'`), `rotationOrder` (e.g., `'A,B,C,D'`)
- Date: `targetDateStr` (e.g., `'2026-06-13'`)

Calculation:
1. Parse dates using noon local time to avoid timezone offsets:
   ```typescript
   const start = new Date(startDateStr + "T12:00:00");
   const target = new Date(targetDateStr + "T12:00:00");
   ```
2. Find weeks difference:
   ```typescript
   const diffDays = Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
   const weeksDiff = Math.floor(diffDays / 7);
   ```
3. Resolve active group index:
   ```typescript
   const orderArray = rotationOrder.split(",");
   const startIndex = orderArray.indexOf(startGroup);
   const groupIndex = ((startIndex + weeksDiff) % orderArray.length + orderArray.length) % orderArray.length;
   const activeGroup = orderArray[groupIndex];
   ```

### 3.3. API Endpoints

- **`GET /api/cronograma`**:
  - Fetch rotation config (fallback to defaults if missing).
  - For each agent and each date retrieved (if it falls on a Saturday):
    - Identify if the agent's `saturdayGroup` is active on that Saturday.
    - If active and the schedule row has `isOverride = false` (or is the initialized "Franco" row with no comment/custom times):
      - Update `status` to `"Home Office"` and `horario` to agent's `saturdayHorario || '07:00 - 13:00'`.
      - Expose a custom attribute/metadata if helpful, or let the client recognize it.
- **`GET /api/cronograma/rotation-config`**:
  - Return the rotation config row and lists of agents grouped by A, B, C, D.
- **`POST /api/cronograma/rotation-config`**:
  - Validate and save global rotation variables (`rotationOrder`, `startDate`, `startGroup`).
- **`POST /api/cronograma/rotation-groups/members`**:
  - Save group assignments and Saturday sub-schedules for operators.
  - Expects array/payload of changes to apply to the `agents` table.

### 3.4. UI/UX Layout (`src/components/cronograma/CronogramaDashboard.astro`)

- **View Switcher**:
  Add `switch-to-groups-btn` next to Monthly and Daily buttons. Toggles the `#groups-view` element.
- **Groups View** (`#groups-view`):
  - **Rotation Config Form**: Simple input fields for `startDate` (Saturdays only), `startGroup`, and `rotationOrder`. Save button with loading feedback.
  - **4-Column Grid**: Each column represents a group (A, B, C, D).
    - Lists group members with name and sub-schedule.
    - Edit sub-schedule button (triggers a small inline modal/dialog to change time, validated to be within 07:00-13:00).
    - Remove button (removes group membership).
    - Add Operator selector: Dropdown listing operators currently not assigned to any group.
- **Calendar Click Integration**:
  - Saturday rotation cells will render with `data-saturday-rotation="true"`.
  - Click listener redirects user to the "Grupos" view immediately.

## 4. Verification Plan

### 4.1. Automated Tests
- Create tests in `tests/` verifying the Saturday calculation logic (including past, future, and leap year dates).
- Verify database migrations and updates.

### 4.2. Manual Verification
- Access the supervision calendar.
- Toggle between Monthly, Daily, and Groups views.
- Configure rotation order, start date, and starting group. Verify that calendar Saturdays automatically update.
- Edit an operator's Saturday sub-schedule. Verify that the correct time is displayed on Saturdays in the calendar.
- Click a Saturday rotation cell in the calendar. Verify that the view instantly shifts to the Groups tab.
- Override a Saturday cell manually (e.g. set to "Franco" or "Licencia"). Verify that the override is persisted and not overwritten by rotation.
