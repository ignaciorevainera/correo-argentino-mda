# CopyButton Feedback-Only Variant + Office Badge Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `feedbackOnly` prop to CopyButton that hides the clipboard icon and shows a checkmark filling the badge on copy success; fix row toggle propagation so clicking the office badge doesn't expand the detail row.

**Architecture:** Two independent changes: (1) CopyButton gets a new rendering branch for `feedbackOnly` that omits the default icon and positions the success icon as an absolute overlay over the entire button; (2) the row click handler in DirectorioContent.astro skips toggling when the event target is inside a `[data-copy-control]` element.

**Tech Stack:** Astro (SSR), Tailwind v4, DaisyUI v5, Playwright (tests)

---

### Task 1: Add `feedbackOnly` prop to CopyButton

**Files:**
- Modify: `src/components/ui/CopyButton.astro:4-34` (Props + defaults)
- Modify: `src/components/ui/CopyButton.astro:188-227` (value variant rendering)
- Modify: `src/components/ui/CopyButton.astro:282-370` (JS handler)

- [ ] **Step 1: Add `feedbackOnly` to the Props interface and extract it**

In `src/components/ui/CopyButton.astro`, add to the Props interface:

```typescript
interface Props {
  value: string;
  variant?: "value" | "link" | "icon";
  feedbackOnly?: boolean;
  // ... rest unchanged
}
```

Then add to the destructuring (after `highlightable`):

```typescript
const {
  // ...
  highlightable = false,
  feedbackOnly = false,
  tooltipText,
  // ...
} = Astro.props;
```

- [ ] **Step 2: Implement `feedbackOnly` rendering branch in the value variant**

Replace the value variant `<button>` block (lines 188-227) with this version that conditionally renders different icon markup:

```astro
  {
    feedbackOnly ? (
      <button
        type="button"
        class:list={["btn", valueButtonClasses, "relative"]}
        data-copy-control
        data-copy-value={value}
        data-copy-label-default={buttonLabel}
        data-copy-label-success={copiedLabel}
        data-copy-replace-label="false"
        aria-label={ariaLabel}
        data-feedback-only
      >
        <span
          class:list={[
            "min-w-0 flex-1 truncate text-sm text-base-content transition-all duration-200",
            monospace && "font-mono",
          ]}
          data-copy-label
          data-highlight-target={highlightable ? "" : undefined}
        >
          {buttonLabel}
        </span>

        <span class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <Icon
            name="boxicons:check-filled"
            size={20}
            class="hidden scale-75 opacity-0 text-success transition-all duration-200"
            data-copy-icon-success
            aria-hidden="true"
          />
        </span>
      </button>
    ) : (
      <button
        type="button"
        class:list={["btn", valueButtonClasses]}
        data-copy-control
        data-copy-value={value}
        data-copy-label-default={buttonLabel}
        data-copy-label-success={copiedLabel}
        data-copy-replace-label="false"
        aria-label={ariaLabel}
      >
        <span
          class:list={[
            "min-w-0 flex-1 truncate text-sm text-base-content transition-colors group-hover:text-accent group-focus-visible:text-accent",
            monospace && "font-mono",
          ]}
          data-copy-label
          data-highlight-target={highlightable ? "" : undefined}
        >
          {buttonLabel}
        </span>

        <span class="relative inline-flex size-4 shrink-0 items-center justify-center">
          <Icon
            name="boxicons:clipboard-filled"
            size={16}
            class="absolute inset-0 m-auto text-base-content/55 transition-all duration-200 group-hover:text-accent group-focus-visible:text-accent"
            data-copy-icon-default
            aria-hidden="true"
          />
          <Icon
            name="boxicons:check-filled"
            size={16}
            class="absolute inset-0 m-auto hidden scale-75 text-success opacity-0 transition-all duration-200"
            data-copy-icon-success
            aria-hidden="true"
          />
        </span>
      </button>
    )
  }
```

- [ ] **Step 3: Update the JS to hide the label text on success when `feedbackOnly` is active**

In the document-level click handler (line ~311), after `const shouldReplaceLabel = ...`, add:

```typescript
const isFeedbackOnly = control.hasAttribute("data-feedback-only");
```

Then after `successIcons.forEach(...)` (after line 335), add:

```typescript
if (isFeedbackOnly && label) {
  label.classList.add("invisible");
}
```

In the timeout callback, after the icon reset block (after line 364), add:

```typescript
if (isFeedbackOnly && label) {
  label.classList.remove("invisible");
}
```

The modified sections should look like:

```
// lines ~311-335
const shouldReplaceLabel = control.dataset.copyReplaceLabel === "true";
const isFeedbackOnly = control.hasAttribute("data-feedback-only");

if (shouldReplaceLabel) {
  label?.replaceChildren(control.dataset.copyLabelSuccess ?? "Copiado");
}

// success classes and icons...
// ...

if (isFeedbackOnly && label) {
  label.classList.add("invisible");
}

// lines ~357-365 (in the timeout)
successIcons.forEach((icon) => {
  icon.classList.add("hidden", "opacity-0", "scale-75");
  icon.classList.remove("scale-100", "opacity-100");
});

if (isFeedbackOnly && label) {
  label.classList.remove("invisible");
}
```

- [ ] **Step 4: Commit the CopyButton changes**

```
git add src/components/ui/CopyButton.astro
git commit -m "feat(copy-button): add feedbackOnly prop for iconless badge feedback"
```

---

### Task 2: Use `feedbackOnly` in OfficeRow badge

**Files:**
- Modify: `src/components/offices/OfficeRow.astro:104-113`

- [ ] **Step 1: Add `feedbackOnly={true}` to the CopyButton usage**

Replace the current CopyButton in OfficeRow with:

```astro
      <CopyButton
        value={office.code}
        variant="value"
        feedbackOnly={true}
        size="xs"
        appearance="ghost"
        monospace={true}
        highlightable={true}
        class={`font-semibold ${officeTypeChipClassByType[normalizedType] || "office-type-chip bg-base-300 text-base-content"}`}
      />
```

The only change is adding `feedbackOnly={true}`.

- [ ] **Step 2: Commit**

```
git add src/components/offices/OfficeRow.astro
git commit -m "feat(offices): use feedbackOnly CopyButton for office code badge"
```

---

### Task 3: Fix row toggle click propagation

**Files:**
- Modify: `src/components/offices/DirectorioContent.astro:586`

- [ ] **Step 1: Add guard in `bindRowEvents` against `[data-copy-control]` clicks**

Change line 586 from:

```typescript
      row.addEventListener("click", toggleRow);
```

To:

```typescript
      row.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-copy-control]")) return;
        toggleRow();
      });
```

- [ ] **Step 2: Commit**

```
git add src/components/offices/DirectorioContent.astro
git commit -m "fix(offices): prevent row toggle when clicking copy controls"
```

---

### Task 4: Write Playwright test for badge copy behavior

**Files:**
- Create: `tests/office-badge-copy.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Office badge copy behavior", () => {
  test("clicking the office code badge copies text and does not expand row", async ({ page }) => {
    await page.goto("/oficinas");
    await page.waitForSelector("[data-master-detail-sort-item]");

    // Find the first CopyButton inside an office master row
    const badge = page.locator("[data-office-master-row] [data-copy-control]").first();
    await expect(badge).toBeVisible();

    // Get the parent row for verifying toggle state
    const row = page.locator("[data-office-master-row]").first();
    const rowAriaExpandedBefore = await row.getAttribute("aria-expanded");

    // Click the badge to trigger copy
    await badge.click();

    // Wait for the success feedback (ring-success class appears on the button)
    await expect(badge).toHaveClass(/ring-success/);

    // Verify row was NOT toggled (aria-expanded unchanged)
    const rowAriaExpandedAfter = await row.getAttribute("aria-expanded");
    expect(rowAriaExpandedAfter).toBe(rowAriaExpandedBefore);

    // Verify the checkmark icon is visible after click
    const checkIcon = badge.locator("[data-copy-icon-success]");
    await expect(checkIcon).toBeVisible();

    // Wait for the feedback timeout (1800ms + buffer)
    await page.waitForTimeout(2200);

    // Verify the checkmark icon is hidden again after reset
    await expect(checkIcon).toBeHidden();

    // Verify the label text is visible again (not invisible)
    const label = badge.locator("[data-copy-label]");
    await expect(label).not.toHaveClass(/invisible/);
  });
});
```

- [ ] **Step 2: Verify the test runs**

Run: `npx playwright test tests/office-badge-copy.spec.ts --project=chromium --headed`

Expected: Test passes. The badge click copies the office code, shows checkmark feedback overlay, does NOT toggle the detail row, and resets after 1800ms.

- [ ] **Step 3: Commit**

```
git add tests/office-badge-copy.spec.ts
git commit -m "test: add Playwright test for office badge copy behavior"
```

---
